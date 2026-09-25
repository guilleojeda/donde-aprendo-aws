import importlib.util
import json
import pathlib
import unittest
from unittest.mock import patch

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'import-meetup-events.py'
spec = importlib.util.spec_from_file_location('meetup_events', MODULE_PATH)
meetup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(meetup)

GROUP = {'id': '123', 'url': 'https://www.meetup.com/aws-bogota/', 'name': 'AWS Bogotá',
         'country': 'CO', 'timeZone': 'America/Bogota'}
EVENT_URL = 'https://www.meetup.com/aws-bogota/events/456/'
ICAL = f'''BEGIN:VCALENDAR\r
VERSION:2.0\r
TZID:America/Bogota\r
BEGIN:VEVENT\r
UID:event_456@meetup.com\r
SUMMARY:AWS en acci\r
 ón\r
URL;VALUE=URI:{EVENT_URL}\r
LAST-MODIFIED:20990101T000000Z\r
STATUS:CONFIRMED\r
END:VEVENT\r
END:VCALENDAR\r
'''
PAGE = {'@type': 'Event', 'name': 'AWS en acción', 'url': EVENT_URL,
        'description': 'Una sesión sobre AWS y la comunidad.',
        'startDate': '2099-01-01T18:00:00-05:00', 'endDate': '2099-01-01T20:00:00-05:00',
        'eventStatus': 'https://schema.org/EventScheduled',
        'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
        'location': {'@type': 'Place', 'name': 'Auditorio',
                     'address': {'streetAddress': 'Calle 1', 'addressLocality': 'Bogotá'}}}


class FakeTable:
    def __init__(self, existing=None):
        self.existing = {item['id']: dict(item) for item in (existing or [])}
        self.puts = []
        self.updates = []

    def scan(self, **_kwargs):
        return {'Items': list(self.existing.values())}

    def put_item(self, **kwargs):
        item = kwargs['Item']
        self.puts.append(item)
        self.existing[item['id']] = dict(item)

    def update_item(self, **kwargs):
        self.updates.append(kwargs)
        item = self.existing[kwargs['Key']['id']]
        values = kwargs['ExpressionAttributeValues']
        if ':false' in values:
            item['published'] = False
        else:
            for alias, field in kwargs['ExpressionAttributeNames'].items():
                if alias.startswith('#f'):
                    item[field] = values[':v' + alias[2:]]


class MeetupEventsTests(unittest.TestCase):
    def test_feed_and_structured_event_map_public_fields(self):
        entries = meetup.parse_feed(ICAL, GROUP)
        self.assertEqual(entries, [{'id': '456', 'url': EVENT_URL, 'modified': '20990101T000000Z'}])
        record = meetup.map_event(GROUP, entries[0], PAGE)
        self.assertEqual(record['id'], 'meetup-event-456')
        self.assertEqual(record['country'], 'CO')
        self.assertEqual(record['mode'], 'in-person')
        self.assertEqual(record['place'], 'Auditorio, Calle 1')
        self.assertTrue(record['published'])
        self.assertTrue(record['autoSync'])
        html = '<script type="application/ld+json">' + json.dumps(PAGE) + '</script>'
        self.assertEqual(meetup.parse_event_page(html, EVENT_URL)['name'], 'AWS en acción')

    def test_successful_feed_adds_and_then_retracts_event(self):
        table = FakeTable()
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
             patch.object(meetup, 'fetch_event_page', return_value=PAGE):
            first = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(first['changed'], 1)
        self.assertEqual(len(table.puts), 1)
        with patch.object(meetup, 'timezone_from_feed', return_value=[]):
            second = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(second['changed'], 1)
        self.assertFalse(table.existing['meetup-event-456']['published'])

    def test_failed_feed_preserves_published_event(self):
        prior = meetup.map_event(GROUP, meetup.parse_feed(ICAL, GROUP)[0], PAGE)
        table = FakeTable([prior])
        with patch.object(meetup, 'timezone_from_feed', side_effect=RuntimeError('Meetup unavailable')):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(result['changed'], 0)
        self.assertEqual(len(result['failures']), 1)
        self.assertTrue(table.existing['meetup-event-456']['published'])

    def test_unchanged_event_skips_detail_fetch_and_editor_suppression_survives(self):
        prior = meetup.map_event(GROUP, meetup.parse_feed(ICAL, GROUP)[0], PAGE)
        table = FakeTable([prior])
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
             patch.object(meetup, 'fetch_event_page', side_effect=AssertionError('unneeded fetch')):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(result['changed'], 0)
        table.existing['meetup-event-456']['autoSync'] = False
        table.existing['meetup-event-456']['published'] = False
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
             patch.object(meetup, 'fetch_event_page', side_effect=AssertionError('editor suppressed')):
            suppressed = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(suppressed['changed'], 0)
        self.assertFalse(table.existing['meetup-event-456']['published'])


if __name__ == '__main__':
    unittest.main()
