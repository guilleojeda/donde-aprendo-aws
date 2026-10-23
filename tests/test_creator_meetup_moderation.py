"""Phase-two acceptance through the existing synchronizer's public entry point.

approvalRevoked is the internal editorial override proposed for the new admin
operation. It is distinct from an upstream cancellation, which may reappear.
The reused FakeTable substitutes DynamoDB conditional writes, not moderation.
"""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

fixture_spec = importlib.util.spec_from_file_location(
    'creator_meetup_fixtures', Path(__file__).with_name('test_meetup_events.py'))
fixtures = importlib.util.module_from_spec(fixture_spec)
fixture_spec.loader.exec_module(fixtures)
meetup = fixtures.meetup


class CreatorMeetupModerationTests(unittest.TestCase):
    def synchronize(self, table, page=None):
        with patch.object(meetup, 'timezone_from_feed',
                          return_value=meetup.parse_feed(fixtures.ICAL, fixtures.GROUP)), \
                patch.object(meetup, 'fetch_event_page', return_value=page or fixtures.PAGE):
            return meetup.synchronize(table=table, groups=[dict(fixtures.GROUP)])

    def test_upstream_refresh_cannot_reverse_explicit_editorial_revocation(self):
        prior = fixtures.existing_event(
            published=False, starts_at='2099-01-01T18:00:00-05:00',
            ends_at='2099-01-01T20:00:00-05:00')
        prior['approvalRevoked'] = True
        table = fixtures.FakeTable([prior])
        result = self.synchronize(table, dict(fixtures.PAGE, name='Nuevo título desde Meetup'))
        self.assertEqual(result['failures'], [])
        self.assertFalse(table.existing[prior['id']]['published'])
        self.assertTrue(table.existing[prior['id']]['approvalRevoked'])

    def test_concurrent_admin_revocation_wins_over_a_stale_sync_read(self):
        prior = fixtures.existing_event(
            published=True, starts_at='2099-01-01T18:00:00-05:00',
            ends_at='2099-01-01T20:00:00-05:00')
        table = fixtures.FakeTable([prior])
        table.before_update = lambda item, _call: item.update(
            {'published': False, 'approvalRevoked': True})
        result = self.synchronize(table, dict(fixtures.PAGE, name='Cambio concurrente'))
        self.assertEqual(result['failures'], [])
        self.assertFalse(table.existing[prior['id']]['published'])
        self.assertTrue(table.existing[prior['id']]['approvalRevoked'])

    def test_creator_controlled_event_keeps_creator_edits_and_editorial_state(self):
        prior = fixtures.existing_event(
            published=False, starts_at='2099-01-01T18:00:00-05:00',
            ends_at='2099-01-01T20:00:00-05:00', auto_sync=False)
        prior.update(editorProfileId='creator-a', directoryControl='creator', title='Título del creador')
        table = fixtures.FakeTable([prior])
        self.synchronize(table, dict(fixtures.PAGE, name='Título externo'))
        self.assertEqual(table.existing[prior['id']]['title'], 'Título del creador')
        self.assertEqual(table.existing[prior['id']]['editorProfileId'], 'creator-a')
        self.assertFalse(table.existing[prior['id']]['published'])


if __name__ == '__main__':
    unittest.main()
