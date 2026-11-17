import copy
import json
import os
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

import test_meetup_events as support

meetup = support.meetup


class MeetupObservationBoundaries(unittest.TestCase):
    def test_observed_end_rejects_offsets_python_would_normalize(self):
        for value in (
                '2099-01-01T20:00:00+00:60',
                '2099-01-01T20:00:00+00:99',
                '2099-01-01T20:00:00-00:60',
        ):
            with self.subTest(value=value):
                self.assertIsNone(meetup.parse_observed_end(value))
                self.assertEqual(meetup.observed_end_state({'endsAt': value}), 'invalid')

        self.assertIsNotNone(meetup.parse_observed_end('2099-01-01T20:00:00+23:59'))
        self.assertEqual(
            meetup.observed_end_state({'endsAt': '2099-01-01T20:00:00+00:00'}),
            'future',
        )

    def test_lambda_retains_malformed_stored_end_but_retracts_valid_absent_event(self):
        community = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'url': support.GROUP['url'],
            'meetupSourceUrl': support.GROUP['url'], 'country': 'CO', 'kind': 'community',
            'published': True,
        }
        malformed = support.existing_event(
            starts_at='2099-01-01T18:00:00+00:00',
            ends_at='2099-01-01T20:00:00+00:60',
        )
        malformed['version'] = 4
        valid = support.existing_event(
            starts_at='2099-01-02T18:00:00+00:00',
            ends_at='2099-01-02T20:00:00+00:00',
        )
        valid['id'] = 'meetup-event-789'
        valid['version'] = 6
        table = support.FakeTable([community, malformed, valid])
        before_malformed = copy.deepcopy(table.existing[malformed['id']])
        invocations = []
        boto3 = support.fake_boto3(table, invocations)
        output = StringIO()

        with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                patch.dict(os.environ, {
                    'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                }), \
                patch.object(meetup, 'get_text', return_value=support.EMPTY_ICAL), \
                redirect_stdout(output):
            with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                meetup.lambda_handler({}, support.lambda_context())

        result = json.loads(output.getvalue())
        self.assertEqual(result['changed'], 1)
        self.assertEqual(len(result['failures']), 1)
        self.assertIn('endsAt', result['failures'][0])
        self.assertEqual(table.existing[malformed['id']], before_malformed)
        self.assertFalse(table.existing[valid['id']]['published'])
        self.assertEqual(table.existing[valid['id']]['version'], valid['version'] + 1)
        self.assertEqual(len(table.updates), 1)
        self.assertEqual(len(invocations), 1)

    def test_cancellation_only_feed_does_not_resolve_invalid_timezone_in_lambda(self):
        community = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'url': support.GROUP['url'],
            'meetupSourceUrl': support.GROUP['url'], 'country': 'CO', 'kind': 'community',
            'published': True,
        }
        invalid_zone_cancel = support.CANCELLED_ICAL.replace(
            'TZID:America/Bogota', 'TZID:Not/Iana/Zone')
        prior = support.existing_event(published=True)
        table = support.FakeTable([community, prior])
        invocations = []
        boto3 = support.fake_boto3(table, invocations)

        with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                patch.dict(os.environ, {
                    'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                }), \
                patch.object(meetup, 'get_text', return_value=invalid_zone_cancel):
            result = meetup.lambda_handler({}, support.lambda_context())

        self.assertEqual((result['changed'], result['failures']), (1, []))
        self.assertFalse(table.existing[prior['id']]['published'])
        self.assertEqual(table.existing[prior['id']]['version'], prior.get('version', 0) + 1)
        self.assertEqual(len(invocations), 1)

    def test_non_event_record_type_is_shared_invalid_while_healthy_source_continues(self):
        malformed_source = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'url': support.GROUP['url'],
            'meetupSourceUrl': support.GROUP['url'], 'country': 'CO', 'kind': 'community',
            'recordType': 'resource', 'published': True,
        }
        healthy_group = {
            'id': 'meetup-999', 'title': 'AWS Test', 'url': 'https://www.meetup.com/aws-test/',
            'meetupSourceUrl': 'https://www.meetup.com/aws-test/', 'country': 'CO',
            'kind': 'community', 'published': True,
        }
        owner_event = support.existing_event(
            starts_at='2099-01-01T18:00:00+00:00',
            ends_at='2099-01-01T20:00:00+00:00',
        )
        healthy_url = 'https://www.meetup.com/aws-test/events/789/'
        healthy_feed = support.ICAL.replace('aws-bogota', 'aws-test').replace('456', '789')
        healthy_page = dict(support.PAGE, url=healthy_url, name='Healthy source event')
        table = support.FakeTable([malformed_source, healthy_group, owner_event])
        invocations = []
        boto3 = support.fake_boto3(table, invocations)

        def provider(url, **_kwargs):
            if url.endswith('/events/ical/'):
                self.assertEqual(url, 'https://www.meetup.com/aws-test/events/ical/')
                return healthy_feed
            self.assertEqual(url, healthy_url)
            return '<script type="application/ld+json">' + json.dumps(healthy_page) + '</script>'

        with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                patch.dict(os.environ, {
                    'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                }), \
                patch.object(meetup, 'get_text', side_effect=provider):
            with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                meetup.lambda_handler({}, support.lambda_context())

        self.assertTrue(table.existing[owner_event['id']]['published'])
        self.assertIn('meetup-event-789', table.existing)
        self.assertEqual(table.existing['meetup-event-789']['title'], 'Healthy source event')
        self.assertEqual(len(invocations), 1)

    def test_private_source_locator_rejects_path_params_and_empty_query_fragment(self):
        for suffix in ('/;path', '?', '#'):
            with self.subTest(suffix=suffix):
                with self.assertRaisesRegex(ValueError, 'Unsafe Meetup group URL'):
                    meetup.group_feed_url({**support.GROUP, 'url': support.GROUP['url'] + suffix})

    def test_noncanonical_persisted_locator_preserves_owner_without_opening_feed(self):
        prior = support.existing_event(
            starts_at='2099-01-01T18:00:00-05:00', ends_at='2099-01-01T20:00:00-05:00')
        for locator in (
                support.GROUP['url'].rstrip('/'),
                support.GROUP['url'].replace('meetup.com', 'meetup.com:443'),
                support.GROUP['url'].rstrip('/') + ';',
        ):
            with self.subTest(locator=locator):
                row = {
                    'id': 'meetup-123', 'title': support.GROUP['name'],
                    'url': support.GROUP['url'], 'meetupSourceUrl': locator,
                    'country': 'CO', 'kind': 'community', 'published': True,
                }
                table = support.FakeTable([row, prior])
                with patch.object(meetup, 'get_text') as transport:
                    result = meetup.synchronize(table=table)
                self.assertEqual(result['changed'], 0)
                self.assertIn('meetupSourceUrl is not canonical', result['failures'][0])
                self.assertEqual(table.existing[prior['id']], prior)
                self.assertEqual(table.updates, [])
                transport.assert_not_called()

    def test_only_direct_event_properties_can_supply_a_cancellation(self):
        feed = support.ICAL.replace(
            'END:VEVENT',
            'DESCRIPTION;ALTREP="https://example.invalid/text;a":Example\r\n'
            'BEGIN:VALARM\r\n'
            'ACTION:DISPLAY\r\n'
            'TRIGGER:-PT15M\r\n'
            'DESCRIPTION:Reminder\r\n'
            'BEGIN:X-EXTENSION\r\n'
            'STATUS:CANCELLED\r\n'
            'END:X-EXTENSION\r\n'
            'END:VALARM\r\n'
            'END:VEVENT',
        )
        with patch.object(meetup, 'get_text', return_value=feed) as transport:
            observed = meetup.timezone_from_feed(dict(support.GROUP))
        self.assertEqual([event['id'] for event in observed], ['456'])
        self.assertFalse(observed[0].get('cancelled', False))
        self.assertEqual(transport.call_count, 1)

    def test_ambiguous_or_unreadable_feed_cannot_supply_absence(self):
        first = support.ICAL.index('BEGIN:VEVENT')
        last = support.ICAL.index('END:VEVENT') + len('END:VEVENT')
        conflicting = support.ICAL[first:last].replace('CONFIRMED', 'CANCELLED')
        cases = {
            'concatenated calendars': support.EMPTY_ICAL + support.ICAL,
            'conflicting identity': support.ICAL.replace('END:VCALENDAR', conflicting + '\r\nEND:VCALENDAR'),
            'unreadable status': support.ICAL.replace('STATUS:CONFIRMED', 'STATUS:UNKNOWN'),
        }
        for label, feed in cases.items():
            with self.subTest(label=label):
                prior = support.existing_event(
                    starts_at='2099-01-01T18:00:00-05:00', ends_at='2099-01-01T20:00:00-05:00')
                table = support.FakeTable([prior])
                with patch.object(meetup, 'get_text', return_value=feed):
                    result = meetup.synchronize(table=table, groups=[dict(support.GROUP)])
                self.assertEqual(result['changed'], 0)
                self.assertEqual(len(result['failures']), 1)
                self.assertEqual(table.existing[prior['id']], prior)
                self.assertEqual(table.updates, [])

    def test_untyped_event_namespace_and_unknown_kind_cannot_prove_removal(self):
        malformed_rows = (
            {'id': 'meetup-123', 'recordType': 'event'},
            {'id': 'meetup-123', 'kind': 'communty', 'published': True},
            {'id': 'meetup-event-not-typed'},
        )
        for row in malformed_rows:
            with self.subTest(row=row):
                prior = support.existing_event()
                table = support.FakeTable([row, prior])
                with patch.object(meetup, 'get_text') as transport:
                    if row['id'].startswith('meetup-event-'):
                        with self.assertRaisesRegex(ValueError, 'Invalid typed Meetup event'):
                            meetup.synchronize(table=table)
                    else:
                        result = meetup.synchronize(table=table)
                        self.assertEqual(result['changed'], 0)
                        self.assertTrue(result['failures'])
                self.assertEqual(table.existing[prior['id']], prior)
                self.assertEqual(table.updates, [])
                transport.assert_not_called()
