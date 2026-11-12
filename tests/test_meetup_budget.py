"""Entry, SDK and mutation admission consume the same Lambda time budget."""
import copy
import os
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import test_meetup_coordination as fixtures
import test_meetup_events as support
from test_meetup_http import Clock, load_importer


class TimedTable(support.FakeTable):
    def __init__(self, records):
        super().__init__(records)
        self.scans, self.commits = [], []
        self.after_scan = self.after_get = self.after_commit = None

    def scan(self, **kwargs):
        self.scans.append(kwargs)
        result = super().scan(**kwargs)
        if self.after_scan:
            self.after_scan(len(self.scans))
        return result

    def get_item(self, **kwargs):
        result = super().get_item(**kwargs)
        if self.after_get:
            self.after_get(len(self.gets))
        return result

    def update_item(self, **kwargs):
        result = super().update_item(**kwargs)
        self.commits.append(kwargs['Key']['id'])
        if self.after_commit:
            self.after_commit(len(self.commits))
        return result


class MeetupBudgetTests(unittest.TestCase):
    def setUp(self):
        self.group = fixtures.make_group(321)
        self.clock = Clock()

    def table(self, *ids):
        return TimedTable([fixtures.community_row(self.group)] + [
            fixtures.mapped_prior(self.group, event_id) for event_id in ids])

    def run_handler(self, table, *ids, remaining=180_000, after_identity=None,
                    before_invoke=None, moved=False):
        invocations, creations = [], []
        sdk = support.fake_boto3(table, invocations, before_invoke=before_invoke)
        base_client, base_resource = sdk.client, sdk.resource

        def client(service, **kwargs):
            creations.append((service, kwargs))
            if service == 'sts' and after_identity:
                def identity():
                    after_identity()
                    return {'Account': support.meetup.ACCOUNT_ID}
                return SimpleNamespace(get_caller_identity=identity)
            return base_client(service, **kwargs)

        def resource(service, **kwargs):
            creations.append((service, kwargs))
            return base_resource(service, **kwargs)

        sdk.client, sdk.resource = client, resource

        def provider(url, **_kwargs):
            if url.endswith('/events/ical/'):
                calendar = fixtures.calendar_for(self.group, *ids)
                if moved:
                    calendar = calendar.replace('/events/456/', '/events/456/?updated=1')
                return calendar
            event_id = url.split('/events/')[1].split('/')[0]
            page = fixtures.event_page(self.group, event_id, 'Fresh source ' + event_id)
            page['url'] = url
            return fixtures.json_ld_response(page)

        with patch('time.monotonic', self.clock):
            subject = load_importer()
            with patch.dict(sys.modules, support.fake_aws_modules(sdk)), \
                    patch.dict(os.environ, {'CATALOG_TABLE': 'test-table', 'PUBLICATION_FUNCTION': 'test-publisher'}), \
                    patch.object(subject, 'get_text', side_effect=provider):
                result, error = None, None
                try:
                    context = SimpleNamespace(get_remaining_time_in_millis=lambda: remaining)
                    result = subject.lambda_handler({}, context)
                except Exception as observed:
                    error = observed
        return result, error, invocations, creations

    def assert_stopped_without_effects(self, table, before, outcome):
        _result, error, invocations, _creations = outcome
        self.assertIsNotNone(error, 'Exhausted work must report failure')
        self.assertEqual(table.existing, before)
        self.assertEqual(table.commits, [])
        self.assertEqual(invocations, [])

    def test_expired_entry_budget_does_not_start_aws_or_catalog_work(self):
        table = self.table('456')
        before = copy.deepcopy(table.existing)
        outcome = self.run_handler(table, '456', remaining=0)
        self.assert_stopped_without_effects(table, before, outcome)
        self.assertEqual(outcome[3], [])
        self.assertEqual(table.scans, [])

    def test_account_lookup_time_is_not_removed_from_the_invocation_budget(self):
        table = self.table('456')
        before = copy.deepcopy(table.existing)
        outcome = self.run_handler(table, '456', after_identity=lambda: self.clock.set(145.0))
        self.assert_stopped_without_effects(table, before, outcome)
        self.assertEqual(table.scans, [])

    def test_inventory_scan_time_cannot_start_a_fresh_budget_for_event_reads(self):
        table = self.table('456')
        before = copy.deepcopy(table.existing)
        table.after_scan = lambda _count: self.clock.set(145.0)
        outcome = self.run_handler(table, '456')
        self.assert_stopped_without_effects(table, before, outcome)
        self.assertEqual(len(table.scans), 1)

    def test_all_aws_transports_receive_explicit_bounded_timeouts_and_attempts(self):
        table = self.table('456')
        result, error, invocations, creations = self.run_handler(table, '456')
        self.assertIsNone(error)
        self.assertEqual(result['changed'], 1)
        self.assertEqual(len(invocations), 1)
        self.assertTrue({'sts', 'dynamodb', 'lambda'}.issubset({kind for kind, _kwargs in creations}))
        for kind, kwargs in creations:
            with self.subTest(transport=kind):
                config = kwargs.get('config')
                self.assertIsNotNone(config, 'Default SDK retry/socket waits are unbounded by this phase')
                bounds = []
                for field in ('connect_timeout', 'read_timeout'):
                    timeout = getattr(config, field, float('inf'))
                    self.assertGreater(timeout, 0)
                    self.assertLessEqual(timeout, 5)
                    bounds.append(timeout)
                self.assertLessEqual(sum(bounds), 5)
                self.assertEqual((getattr(config, 'retries', None) or {}).get('total_max_attempts'), 1)

    def test_deadline_after_a_commit_prevents_another_write_and_notifies_known_changes_once(self):
        table = self.table('456', '457')
        before = copy.deepcopy(table.existing)
        table.after_commit = lambda _count: self.clock.set(145.0)
        _result, error, invocations, _creations = self.run_handler(table, '456', '457')
        self.assertIsNotNone(error, 'Unfinished mutations must not be reported as a complete run')
        self.assertEqual(len(table.commits), 1)
        changed_id = table.commits[0]
        self.assertIn(changed_id, ('meetup-event-456', 'meetup-event-457'))
        self.assertEqual(table.existing[changed_id]['version'], 5)
        self.assertEqual(table.existing[changed_id]['title'], 'Fresh source ' + changed_id.removeprefix('meetup-event-'))
        expected = copy.deepcopy(before)
        expected[changed_id] = table.existing[changed_id]
        self.assertEqual(table.existing, expected)
        self.assertEqual(len(invocations), 1)

    def test_exhaustion_before_cas_refresh_never_replays_the_stale_write(self):
        table = self.table('456')
        expected = copy.deepcopy(table.existing)
        expected['meetup-event-456'].update(version=5, editorNote='Independent edit')

        def competing_write(item, _request):
            item.update(version=5, editorNote='Independent edit')
            self.clock.set(145.0)

        table.before_update = competing_write
        outcome = self.run_handler(table, '456')
        self.assert_stopped_without_effects(table, expected, outcome)
        self.assertEqual(table.gets, [], 'A conflict must not admit a new SDK read after work cutoff')

    def test_later_storage_failure_still_notifies_an_earlier_known_commit(self):
        table = self.table('456', '457')
        before = copy.deepcopy(table.existing)

        def unavailable(_item, _request):
            raise RuntimeError('storage unavailable after known progress')

        table.after_commit = lambda _count: setattr(table, 'before_update', unavailable)
        _result, error, invocations, _creations = self.run_handler(table, '456', '457')
        self.assertIsInstance(error, RuntimeError)
        self.assertIn('storage unavailable', str(error))
        self.assertEqual(len(table.commits), 1)
        changed_id = table.commits[0]
        expected = copy.deepcopy(before)
        expected[changed_id] = table.existing[changed_id]
        self.assertEqual(table.existing, expected)
        self.assertEqual(table.existing[changed_id]['version'], 5)
        self.assertEqual(len(invocations), 1, 'Earlier committed progress must reach publication')

    def test_publication_failure_keeps_the_commit_and_is_not_retried_or_reported_as_success(self):
        table = self.table('456')
        attempted_states = []

        def unavailable(source):
            attempted_states.append(copy.deepcopy(source.existing))
            raise RuntimeError('publication unavailable')

        _result, error, invocations, _creations = self.run_handler(
            table, '456', before_invoke=unavailable)
        self.assertIsInstance(error, RuntimeError)
        self.assertIn('publication unavailable', str(error))
        self.assertEqual(table.commits, ['meetup-event-456'])
        self.assertEqual(table.existing['meetup-event-456']['version'], 5)
        self.assertEqual(table.existing['meetup-event-456']['title'], 'Fresh source 456')
        self.assertEqual(attempted_states, [table.existing])
        self.assertEqual(invocations, [], 'The SDK did not confirm this notification')

    def test_reservation_member_validation_cannot_make_unbudgeted_followup_reads(self):
        table = self.table('456')
        prior = table.existing['meetup-event-456']
        reservation = support.meetup.current_url_reservation(prior['registrationUrl'], prior['id'])
        table.existing[reservation['id']] = reservation
        before = copy.deepcopy(table.existing)
        table.after_get = lambda _count: self.clock.set(145.0)
        outcome = self.run_handler(table, '456', moved=True)
        self.assert_stopped_without_effects(table, before, outcome)
        self.assertEqual(len(table.gets), 1)


if __name__ == '__main__':
    unittest.main()
