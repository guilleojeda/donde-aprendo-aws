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
GIRLS_GROUP = {'id': '36431225', 'url': 'https://www.meetup.com/aws-girls-argentina/',
               'name': 'AWS Girls Argentina', 'country': 'AR',
               'timeZone': 'America/Argentina/Cordoba'}
GIRLS_EVENT_URL = 'https://www.meetup.com/aws-girls-argentina/events/316882965/'
GIRLS_ICAL = f'''BEGIN:VCALENDAR\r
VERSION:2.0\r
TZID:America/Argentina/Cordoba\r
BEGIN:VEVENT\r
UID:event_316882965@meetup.com\r
SUMMARY:Guardrails\r
URL;VALUE=URI:{GIRLS_EVENT_URL}\r
LAST-MODIFIED:20990101T000000Z\r
STATUS:CONFIRMED\r
END:VEVENT\r
END:VCALENDAR\r
'''
GIRLS_PAGE = {
    '@type': 'Event', 'name': 'Guardrails: blinda tu agente con Strands',
    'url': GIRLS_EVENT_URL, 'description': 'Una sesión práctica de AWS.',
    'startDate': '2099-01-01T19:00:00-03:00', 'endDate': '2099-01-01T21:00:00-03:00',
    'eventStatus': 'https://schema.org/EventScheduled',
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'location': {'@type': 'Place', 'name': 'Córdoba',
                 'address': {'streetAddress': 'Av. Siempre Viva 123', 'addressLocality': 'Córdoba'}},
}


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
            if ' REMOVE ' in kwargs['UpdateExpression']:
                for alias in kwargs['UpdateExpression'].split(' REMOVE ', 1)[1].split(', '):
                    item.pop(kwargs['ExpressionAttributeNames'][alias], None)


class MeetupEventsTests(unittest.TestCase):
    def test_live_sync_skips_brazil_and_english_language_group(self):
        groups = [
            {'id': 'meetup-1', 'title': 'Brasil', 'url': 'https://www.meetup.com/brasil/',
             'country': 'BR', 'kind': 'community', 'published': True},
            {'id': 'meetup-2', 'title': 'Jamaica', 'url': 'https://www.meetup.com/jamaica/',
             'country': 'JM', 'kind': 'community', 'published': True},
            {'id': 'meetup-3', 'title': 'Bogotá', 'url': GROUP['url'],
             'country': 'CO', 'kind': 'community', 'published': True},
        ]
        self.assertEqual([group['id'] for group in meetup.load_groups_from_dynamodb(FakeTable(groups))], ['3'])

    def test_feed_and_structured_event_map_public_fields(self):
        entries = meetup.parse_feed(ICAL, GROUP)
        self.assertEqual(entries, [{'id': '456', 'url': EVENT_URL, 'modified': '20990101T000000Z'}])
        record = meetup.map_event(GROUP, entries[0], PAGE)
        self.assertEqual(record['id'], 'meetup-event-456')
        self.assertEqual(record['country'], 'CO')
        self.assertEqual(record['mode'], 'in-person')
        self.assertEqual(record['place'], 'Auditorio, Calle 1')
        self.assertEqual(record['city'], 'Bogotá')
        self.assertEqual(record['communityId'], 'meetup-123')
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

    def test_unchanged_event_refreshes_detail_but_skips_write_and_editor_suppression_survives(self):
        prior = meetup.map_event(GROUP, meetup.parse_feed(ICAL, GROUP)[0], PAGE)
        table = FakeTable([prior])
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
             patch.object(meetup, 'fetch_event_page', return_value=PAGE) as fetch:
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(result['changed'], 0)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(table.puts, [])
        self.assertEqual(table.updates, [])
        table.existing['meetup-event-456']['autoSync'] = False
        table.existing['meetup-event-456']['published'] = False
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
             patch.object(meetup, 'fetch_event_page', side_effect=AssertionError('editor suppressed')) as fetch:
            suppressed = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(suppressed['changed'], 0)
        fetch.assert_not_called()
        self.assertFalse(table.existing['meetup-event-456']['published'])

    def test_same_feed_modified_at_refreshes_changed_time_and_venue(self):
        prior = meetup.map_event(GROUP, meetup.parse_feed(ICAL, GROUP)[0], PAGE)
        prior['editorNote'] = 'keep this private field'
        changed_page = dict(PAGE,
                            startDate='2099-01-01T19:00:00-05:00',
                            endDate='2099-01-01T21:00:00-05:00',
                            location={'@type': 'Place', 'name': 'Nueva sede',
                                      'address': {'streetAddress': 'Calle 2',
                                                  'addressLocality': 'Medellín'}})
        table = FakeTable([prior])
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
             patch.object(meetup, 'fetch_event_page', return_value=changed_page):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(result['changed'], 1)
        refreshed = table.existing['meetup-event-456']
        self.assertEqual(refreshed['startsAt'], '2099-01-01T19:00:00-05:00')
        self.assertEqual(refreshed['endsAt'], '2099-01-01T21:00:00-05:00')
        self.assertEqual(refreshed['place'], 'Nueva sede, Calle 2')
        self.assertEqual(refreshed['city'], 'Medellín')
        self.assertEqual(refreshed['editorNote'], 'keep this private field')

    def test_argentina_girls_event_imports_with_country_community_and_city(self):
        table = FakeTable()
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(GIRLS_ICAL, GIRLS_GROUP)), \
             patch.object(meetup, 'fetch_event_page', return_value=GIRLS_PAGE):
            result = meetup.synchronize(table=table, groups=[dict(GIRLS_GROUP)])
        self.assertEqual(result['changed'], 1)
        imported = table.existing['meetup-event-316882965']
        self.assertEqual(imported['country'], 'AR')
        self.assertEqual(imported['communityId'], 'meetup-36431225')
        self.assertEqual(imported['city'], 'Córdoba')

    def test_existing_argentina_girls_event_refreshes_stale_dates_with_same_feed_modified_at(self):
        prior = meetup.map_event(GIRLS_GROUP, meetup.parse_feed(GIRLS_ICAL, GIRLS_GROUP)[0], GIRLS_PAGE)
        prior['startsAt'] = '2000-01-01T19:00:00-03:00'
        prior['endsAt'] = '2000-01-01T21:00:00-03:00'
        table = FakeTable([prior])
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(GIRLS_ICAL, GIRLS_GROUP)), \
             patch.object(meetup, 'fetch_event_page', return_value=GIRLS_PAGE):
            first = meetup.synchronize(table=table, groups=[dict(GIRLS_GROUP)])
        self.assertEqual(first['changed'], 1)
        refreshed = table.existing['meetup-event-316882965']
        self.assertEqual(refreshed['startsAt'], GIRLS_PAGE['startDate'])
        self.assertEqual(refreshed['endsAt'], GIRLS_PAGE['endDate'])
        self.assertEqual(refreshed['country'], 'AR')
        self.assertEqual(refreshed['communityId'], 'meetup-36431225')

        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(GIRLS_ICAL, GIRLS_GROUP)), \
             patch.object(meetup, 'fetch_event_page', return_value=GIRLS_PAGE):
            second = meetup.synchronize(table=table, groups=[dict(GIRLS_GROUP)])
        self.assertEqual(second['changed'], 0)
        self.assertEqual(len(table.updates), 1)

    def test_cancelled_event_page_retracts_existing_event(self):
        prior = meetup.map_event(GROUP, meetup.parse_feed(ICAL, GROUP)[0], PAGE)
        cancelled = dict(PAGE, eventStatus='https://schema.org/EventCancelled')
        table = FakeTable([prior])
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
             patch.object(meetup, 'fetch_event_page', return_value=cancelled):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(result['changed'], 1)
        self.assertFalse(table.existing['meetup-event-456']['published'])

    def test_failed_detail_fetch_preserves_existing_event(self):
        prior = meetup.map_event(GROUP, meetup.parse_feed(ICAL, GROUP)[0], PAGE)
        table = FakeTable([prior])
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
             patch.object(meetup, 'fetch_event_page', side_effect=RuntimeError('Meetup page unavailable')):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(result['changed'], 0)
        self.assertEqual(len(result['failures']), 1)
        self.assertTrue(table.existing['meetup-event-456']['published'])

    def test_existing_event_gets_community_and_verified_city_then_removes_stale_city(self):
        prior = meetup.map_event(GROUP, meetup.parse_feed(ICAL, GROUP)[0], PAGE)
        prior.pop('communityId')
        prior.pop('city')
        table = FakeTable([prior])
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
             patch.object(meetup, 'fetch_event_page', return_value=PAGE):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(result['changed'], 1)
        self.assertEqual(table.existing['meetup-event-456']['city'], 'Bogotá')
        self.assertEqual(table.existing['meetup-event-456']['communityId'], 'meetup-123')

        changed = dict(PAGE,
                       eventAttendanceMode='https://schema.org/OnlineEventAttendanceMode',
                       location={})
        entry = dict(meetup.parse_feed(ICAL, GROUP)[0], modified='20990102T000000Z')
        with patch.object(meetup, 'timezone_from_feed', return_value=[entry]), \
             patch.object(meetup, 'fetch_event_page', return_value=changed):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(result['changed'], 1)
        self.assertNotIn('city', table.existing['meetup-event-456'])
        self.assertNotIn('place', table.existing['meetup-event-456'])


if __name__ == '__main__':
    unittest.main()
