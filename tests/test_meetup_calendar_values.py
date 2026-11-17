"""Focused iCalendar VALUE-parameter admission controls."""

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


class MeetupCalendarValueTests(unittest.TestCase):
    def test_consumed_properties_reject_declared_value_types_they_cannot_use(self):
        cases = (
            ('VERSION', support.ICAL.replace('VERSION:2.0', 'VERSION;VALUE=INTEGER:2.0')),
            ('TZID', support.ICAL.replace('TZID:America/Bogota', 'TZID;VALUE=DATE-TIME:America/Bogota')),
            ('UID', support.ICAL.replace('UID:event_456@meetup.com',
                                          'UID;VALUE=URI:event_456@meetup.com')),
            ('URL', support.ICAL.replace('URL;VALUE=URI:', 'URL;VALUE=TEXT:')),
            ('STATUS', support.ICAL.replace('STATUS:CONFIRMED', 'STATUS;VALUE=DATE:CONFIRMED')),
            ('LAST-MODIFIED', support.ICAL.replace('LAST-MODIFIED:20990101T000000Z',
                                                   'LAST-MODIFIED;VALUE=DATE:20990101T000000Z')),
        )
        for name, feed in cases:
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, 'Invalid iCalendar feed'):
                    meetup.parse_feed(feed, support.GROUP)

    def test_duplicate_value_declarations_are_rejected(self):
        cases = (
            support.ICAL.replace('STATUS:CONFIRMED', 'STATUS;VALUE=TEXT;VALUE=DATE:CONFIRMED'),
            support.ICAL.replace('VERSION:2.0', 'VERSION;VALUE=TEXT;VALUE=TEXT:2.0'),
        )
        for feed in cases:
            with self.subTest(feed=feed):
                with self.assertRaisesRegex(ValueError, 'Invalid iCalendar feed'):
                    meetup.parse_feed(feed, support.GROUP)

    def test_case_insensitive_valid_types_and_quoted_extension_parameters_are_preserved(self):
        feed = support.ICAL
        feed = feed.replace('VERSION:2.0', 'version;value=text:2.0')
        feed = feed.replace('TZID:America/Bogota', 'tzid;value=text:America/Bogota')
        feed = feed.replace('UID:event_456@meetup.com', 'uid;value=text:event_456@meetup.com')
        feed = feed.replace(
            'URL;VALUE=URI:',
            'url;x-label="https://example.invalid/a:b;c,d";value=uri:',
        )
        feed = feed.replace('LAST-MODIFIED:20990101T000000Z',
                            'last-modified;value=date-time:20990101T000000Z')
        feed = feed.replace('STATUS:CONFIRMED', 'status;value=text:CONFIRMED')
        feed = feed.replace('END:VCALENDAR', 'X-UNRECOGNIZED;VALUE=INTEGER:123\r\nEND:VCALENDAR')

        self.assertEqual(meetup.parse_feed(feed, support.GROUP)[0]['id'], '456')

    def test_valid_typed_feed_persists_event_and_notifies_once(self):
        community = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'url': support.GROUP['url'],
            'meetupSourceUrl': support.GROUP['url'], 'country': 'CO', 'kind': 'community',
            'published': True,
        }
        table = support.FakeTable([community])
        invocations = []
        boto3 = support.fake_boto3(table, invocations)
        html = '<script type="application/ld+json">' + json.dumps(support.PAGE) + '</script>'
        output = StringIO()

        def provider(url, **_kwargs):
            return support.ICAL if url.endswith('/events/ical/') else html

        with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                patch.dict(os.environ, {
                    'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                }), \
                patch.object(meetup, 'get_text', side_effect=provider), \
                redirect_stdout(output):
            result = meetup.lambda_handler({}, support.lambda_context())

        self.assertEqual((result['changed'], result['failures']), (1, []))
        self.assertIn('meetup-event-456', table.existing)
        self.assertEqual(len(invocations), 1)

    def test_invalid_typed_status_preserves_rows_and_skips_notification(self):
        community = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'url': support.GROUP['url'],
            'meetupSourceUrl': support.GROUP['url'], 'country': 'CO', 'kind': 'community',
            'published': True,
        }
        table = support.FakeTable([community])
        before = dict(table.existing)
        invocations = []
        boto3 = support.fake_boto3(table, invocations)
        malformed = support.ICAL.replace('STATUS:CONFIRMED', 'STATUS;VALUE=DATE:CONFIRMED')
        output = StringIO()

        with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                patch.dict(os.environ, {
                    'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                }), \
                patch.object(meetup, 'get_text', return_value=malformed), \
                redirect_stdout(output):
            with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                meetup.lambda_handler({}, support.lambda_context())

        result = json.loads(output.getvalue())
        self.assertEqual(result['changed'], 0)
        self.assertTrue(result['failures'])
        self.assertEqual(table.existing, before)
        self.assertEqual(table.updates, [])
        self.assertEqual(invocations, [])

    def test_incompatible_cancellation_and_empty_feed_types_retain_published_future_event(self):
        community = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'url': support.GROUP['url'],
            'meetupSourceUrl': support.GROUP['url'], 'country': 'CO', 'kind': 'community',
            'published': True,
        }
        cases = (
            ('STATUS cancellation', support.CANCELLED_ICAL.replace(
                'STATUS:CANCELLED', 'STATUS;VALUE=DATE:CANCELLED')),
            ('VERSION empty feed', support.EMPTY_ICAL.replace(
                'VERSION:2.0', 'VERSION;VALUE=INTEGER:2.0')),
            ('STATUS whitespace', support.CANCELLED_ICAL.replace(
                'STATUS:CANCELLED', 'STATUS: CANCELLED')),
            ('STATUS outside VEVENT', support.EMPTY_ICAL.replace(
                'END:VCALENDAR', 'STATUS:CANCELLED\r\nEND:VCALENDAR')),
            ('VERSION inside VEVENT', support.CANCELLED_ICAL.replace(
                'BEGIN:VEVENT', 'BEGIN:VEVENT\r\nVERSION:2.0')),
            ('TZID inside VEVENT', support.CANCELLED_ICAL.replace(
                'BEGIN:VEVENT', 'BEGIN:VEVENT\r\nTZID:America/Bogota')),
            ('duplicate TZID in one VTIMEZONE', support.CANCELLED_ICAL.replace(
                'TZID:America/Bogota',
                'BEGIN:VTIMEZONE\r\nTZID:America/Bogota\r\nTZID:UTC\r\nEND:VTIMEZONE')),
            ('invalid TZID in second VTIMEZONE', support.CANCELLED_ICAL.replace(
                'TZID:America/Bogota',
                'BEGIN:VTIMEZONE\r\nTZID:America/Bogota\r\nEND:VTIMEZONE\r\n'
                'BEGIN:VTIMEZONE\r\nTZID;VALUE=DATE:20990101\r\nEND:VTIMEZONE')),
            ('explicit empty LAST-MODIFIED', support.CANCELLED_ICAL.replace(
                'LAST-MODIFIED:20990101T000000Z', 'LAST-MODIFIED:')),
        )
        for label, malformed in cases:
            with self.subTest(label=label):
                prior = support.existing_event(
                    published=True,
                    starts_at='2099-01-01T18:00:00-05:00',
                    ends_at='2099-01-01T20:00:00-05:00',
                )
                table = support.FakeTable([community, prior])
                before = copy.deepcopy(table.existing)
                invocations = []
                boto3 = support.fake_boto3(table, invocations)
                output = StringIO()

                with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                        patch.dict(os.environ, {
                            'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                        }), \
                        patch.object(meetup, 'get_text', return_value=malformed), \
                        redirect_stdout(output):
                    with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                        meetup.lambda_handler({}, support.lambda_context())

                result = json.loads(output.getvalue())
                self.assertEqual(result['changed'], 0)
                self.assertTrue(result['failures'])
                self.assertEqual(table.existing, before)
                self.assertTrue(table.existing[prior['id']]['published'])
                self.assertEqual(table.updates, [])
                self.assertEqual(invocations, [])


    def test_valid_separate_timezone_components_and_extension_properties_remain_readable(self):
        feed = support.ICAL.replace(
            'TZID:America/Bogota',
            'BEGIN:VTIMEZONE\r\nTZID:America/Bogota\r\nEND:VTIMEZONE\r\n'
            'BEGIN:VTIMEZONE\r\nTZID:UTC\r\nEND:VTIMEZONE\r\n'
            'URL:https://www.meetup.com/aws-bogota/\r\n'
            'BEGIN:VTODO\r\nSTATUS:COMPLETED\r\nEND:VTODO',
        )
        entries, zone = meetup.parse_calendar(feed, support.GROUP)
        self.assertEqual([entry['id'] for entry in entries], ['456'])
        self.assertEqual(zone, 'America/Bogota')

    def test_modified_timestamp_requires_a_real_utc_datetime_when_present(self):
        original = 'LAST-MODIFIED:20990101T000000Z'
        for raw in ('', '20990231T000000Z', '20990101T246000Z',
                    '20990101T000000', '20990101T000000+0000', '209911T000000Z',
                    '20990101T130060Z'):
            for declared_type in ('', ';VALUE=DATE-TIME'):
                with self.subTest(value=raw, declared_type=declared_type):
                    feed = support.ICAL.replace(original, f'LAST-MODIFIED{declared_type}:{raw}')
                    with self.assertRaisesRegex(ValueError, 'Invalid iCalendar feed'):
                        meetup.parse_feed(feed, support.GROUP)

    def test_valid_leap_second_keeps_the_original_source_marker(self):
        feed = support.ICAL.replace('20990101T000000Z', '20161231T235960Z')
        self.assertEqual(meetup.parse_feed(feed, support.GROUP)[0]['modified'], '20161231T235960Z')

    def test_omitted_modified_timestamp_still_uses_the_content_fingerprint(self):
        feed = support.ICAL.replace('LAST-MODIFIED:20990101T000000Z\r\n', '')
        original = meetup.parse_feed(feed, support.GROUP)[0]['modified']
        self.assertRegex(original, r'^[a-f0-9]{64}$')
        self.assertNotEqual(
            original, meetup.parse_feed(feed.replace('AWS en acci', 'Nueva descripci'),
                                        support.GROUP)[0]['modified'])

    def test_invalid_modified_timestamp_cannot_cancel_or_authorize_absence(self):
        community = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'url': support.GROUP['url'],
            'meetupSourceUrl': support.GROUP['url'], 'country': 'CO', 'kind': 'community',
            'published': True,
        }
        matching = support.existing_event(
            published=True, starts_at='2099-01-01T18:00:00-05:00',
            ends_at='2099-01-01T20:00:00-05:00')
        absent = dict(matching, id='meetup-event-457',
                      registrationUrl=support.EVENT_URL.replace('/456/', '/457/'))
        html = '<script type="application/ld+json">' + json.dumps(support.PAGE) + '</script>'

        for valid_feed in (support.ICAL, support.CANCELLED_ICAL):
            for malformed in (False, True):
                cancelled = 'STATUS:CANCELLED' in valid_feed
                with self.subTest(cancelled=cancelled, malformed=malformed):
                    table = support.FakeTable([community, matching, absent])
                    before = copy.deepcopy(table.existing)
                    invocations = []
                    boto3 = support.fake_boto3(table, invocations)
                    feed = valid_feed.replace(
                        'LAST-MODIFIED:20990101T000000Z',
                        'LAST-MODIFIED;VALUE=DATE-TIME:20990231T000000Z',
                    ) if malformed else valid_feed
                    calls = []

                    def provider(url, **_kwargs):
                        calls.append(url)
                        return feed if url.endswith('/events/ical/') else html

                    output = StringIO()
                    with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                            patch.dict(os.environ, {
                                'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                            }), \
                            patch.object(meetup, 'get_text', side_effect=provider), \
                            redirect_stdout(output):
                        if malformed:
                            with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                                meetup.lambda_handler({}, support.lambda_context())
                        else:
                            result = meetup.lambda_handler({}, support.lambda_context())

                    if malformed:
                        result = json.loads(output.getvalue())
                        self.assertEqual(result['changed'], 0)
                        self.assertTrue(result['failures'])
                        self.assertEqual(table.existing, before)
                        self.assertEqual(table.updates, [])
                        self.assertEqual(invocations, [])
                        self.assertEqual(len(calls), 1)
                    else:
                        self.assertEqual(result['failures'], [])
                        self.assertFalse(table.existing[absent['id']]['published'])
                        self.assertEqual(table.existing[matching['id']]['published'], not cancelled)
                        self.assertEqual(len(invocations), 1)


if __name__ == '__main__':
    unittest.main()
