import unittest
from unittest.mock import patch

import test_meetup_events as support

meetup = support.meetup


class MeetupObservationBoundaries(unittest.TestCase):
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
