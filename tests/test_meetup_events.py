import importlib.util
import json
import os
import pathlib
import re
import sys
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
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
CANCELLED_ICAL = ICAL.replace('STATUS:CONFIRMED', 'STATUS:CANCELLED')
SCHEDULED_UTC_ICAL = ICAL.replace('TZID:America/Bogota\r\n', '').replace(
    'STATUS:CONFIRMED\r\n',
    'DTSTART:20990101T230000Z\r\nDTEND:20990102T010000Z\r\nSTATUS:CONFIRMED\r\n')
CANCELLED_UTC_ICAL = SCHEDULED_UTC_ICAL.replace('STATUS:CONFIRMED', 'STATUS:CANCELLED')
EVENT_CANCELLED = 'https://schema.org/EventCancelled'
EVENT_MOVED_ONLINE = 'https://schema.org/EventMovedOnline'
EVENT_POSTPONED = 'https://schema.org/EventPostponed'
EVENT_DATES = {
    'past': ('2000-01-01T18:00:00-05:00', '2000-01-01T20:00:00-05:00'),
    'future': (PAGE['startDate'], PAGE['endDate']),
}


class FakeTable:
    def __init__(self, existing=None):
        self.existing = {item['id']: dict(item) for item in (existing or [])}
        self.puts = []
        self.updates = []
        self.transactions = []
        self.gets = []
        self.before_update = None
        self.name = 'catalog-test'
        self.meta = SimpleNamespace(client=SimpleNamespace(transact_write_items=self.transact_write_items))

    def scan(self, **_kwargs):
        return {'Items': [dict(item) for item in self.existing.values()]}

    def get_item(self, **kwargs):
        self.gets.append(kwargs)
        item = self.existing.get(kwargs['Key']['id'])
        if item is None:
            return {}
        if 'ProjectionExpression' in kwargs:
            fields = kwargs['ExpressionAttributeNames'].values()
            item = {field: item[field] for field in fields if field in item}
        return {'Item': dict(item)}

    def transact_write_items(self, *, TransactItems):
        """Model the resource client's DynamoDB document-form parameter hook."""
        self.transactions.append(TransactItems)
        for action in TransactItems:
            kind, operation = next(iter(action.items()))
            self.assert_document_form(operation)
            if kind == 'Put':
                item = self.existing.get(operation['Item']['id'])
                if operation['ConditionExpression'] == 'attribute_not_exists(#id)':
                    if item is not None:
                        raise self.conditional_failure()
                elif not self.condition_holds({
                    'ConditionExpression': operation['ConditionExpression'],
                    'ExpressionAttributeNames': operation['ExpressionAttributeNames'],
                    'ExpressionAttributeValues': operation.get('ExpressionAttributeValues', {}),
                }, item):
                    raise self.conditional_failure()
            elif kind in ('Update', 'Delete'):
                item = self.existing.get(operation['Key']['id'])
                if not self.condition_holds({
                    'ConditionExpression': operation['ConditionExpression'],
                    'ExpressionAttributeNames': operation['ExpressionAttributeNames'],
                    'ExpressionAttributeValues': operation.get('ExpressionAttributeValues', {}),
                }, item):
                    raise self.conditional_failure()
            else:
                raise AssertionError(f'unknown transaction operation {kind}')
        for action in TransactItems:
            kind, operation = next(iter(action.items()))
            if kind == 'Put':
                item = dict(operation['Item'])
                if item.get('recordType') == 'event':
                    self.puts.append(item)
                self.existing[item['id']] = item
            elif kind == 'Update':
                self.update_item(
                    Key=operation['Key'],
                    UpdateExpression=operation['UpdateExpression'],
                    ConditionExpression=operation['ConditionExpression'],
                    ExpressionAttributeNames=operation['ExpressionAttributeNames'],
                    ExpressionAttributeValues=operation['ExpressionAttributeValues'],
                )
            else:
                self.existing.pop(operation['Key']['id'], None)

    @staticmethod
    def assert_document_form(operation):
        """The boto3 resource client accepts Python values before its serializer."""
        attribute_value_types = {'S', 'N', 'BOOL', 'NULL', 'M', 'L', 'B', 'SS', 'NS', 'BS'}

        def assert_value(value, location):
            if isinstance(value, dict):
                if len(value) == 1 and next(iter(value)) in attribute_value_types:
                    raise AssertionError(f'{location} was pre-serialized instead of document-form: {value!r}')
                for field, nested in value.items():
                    assert_value(nested, f'{location}.{field}')
            elif isinstance(value, list):
                for index, nested in enumerate(value):
                    assert_value(nested, f'{location}[{index}]')

        for field in ('Item', 'Key', 'ExpressionAttributeValues'):
            if field in operation:
                assert_value(operation[field], field)

    def update_item(self, **kwargs):
        self.updates.append(kwargs)
        item = self.existing.get(kwargs['Key']['id'])
        if self.before_update is not None:
            before_update = self.before_update
            self.before_update = None
            before_update(item, kwargs)
        if not self.condition_holds(kwargs, item):
            raise self.conditional_failure()

        item = self.existing[kwargs['Key']['id']]
        values = kwargs['ExpressionAttributeValues']
        expression = kwargs['UpdateExpression']
        set_expression = expression.split(' REMOVE ', 1)[0].removeprefix('SET ')
        for alias, parameter in re.findall(r'(#\w+)\s*=\s*(:\w+)', set_expression):
            field = kwargs['ExpressionAttributeNames'][alias]
            item[field] = values[parameter]
        if ' REMOVE ' in expression:
            for alias in expression.split(' REMOVE ', 1)[1].split(', '):
                item.pop(kwargs['ExpressionAttributeNames'][alias], None)

    @staticmethod
    def conditional_failure():
        error = RuntimeError('conditional write did not match')
        error.response = {'Error': {'Code': 'ConditionalCheckFailedException'}}
        return error

    @staticmethod
    def condition_holds(kwargs, item):
        """Model the sync's equality guards, not the DynamoDB expression language."""
        expression = kwargs.get('ConditionExpression', '')
        if not expression:
            return True
        names = kwargs.get('ExpressionAttributeNames', {})
        values = kwargs.get('ExpressionAttributeValues', {})
        if item is None:
            return False

        for alias in re.findall(r'attribute_exists\((#\w+)\)', expression):
            if names.get(alias) not in item:
                return False

        handled_aliases = set()
        for alias, parameter in re.findall(
                r'attribute_not_exists\((#\w+)\)\s+OR\s+\1\s*=\s*(:\w+)', expression):
            field = names[alias]
            if field in item and item[field] != values[parameter]:
                return False
            handled_aliases.add(alias)

        for alias, parameter in re.findall(r'(#\w+)\s*=\s*(:\w+)', expression):
            if alias in handled_aliases:
                continue
            field = names.get(alias)
            if field is not None and item.get(field) != values[parameter]:
                return False
        return True


class FrozenDateTime(datetime):
    frozen = datetime(2030, 1, 1, 20, 0, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz=None):
        return cls.frozen if tz is None else cls.frozen.astimezone(tz)


def existing_event(published=True, starts_at='2000-01-01T18:00:00-05:00',
                   ends_at='2000-01-01T20:00:00-05:00', auto_sync=True):
    record = meetup.map_event(GROUP, meetup.parse_feed(ICAL, GROUP)[0], PAGE)
    record['startsAt'] = starts_at
    record['endsAt'] = ends_at
    record['published'] = published
    record['autoSync'] = auto_sync
    return record


def fake_boto3(table, invocations):
    def client(service, **_kwargs):
        if service == 'sts':
            return SimpleNamespace(get_caller_identity=lambda: {'Account': meetup.ACCOUNT_ID})
        if service == 'lambda':
            return SimpleNamespace(invoke=lambda **kwargs: invocations.append(kwargs))
        raise AssertionError(f'unexpected AWS client: {service}')

    return SimpleNamespace(
        client=client,
        resource=lambda _service, **_kwargs: SimpleNamespace(Table=lambda _name: table),
    )


class MeetupEventsTests(unittest.TestCase):
    def assert_source_update_guards(self, call):
        expression = call['ConditionExpression']
        names = call['ExpressionAttributeNames']
        values = call['ExpressionAttributeValues']

        owner_alias = next(alias for alias, field in names.items() if field == 'sourceGroupId')
        owner_placeholders = [parameter for parameter, value in values.items() if value == 'meetup-123']
        self.assertTrue(any(re.search(rf'{re.escape(owner_alias)}\s*=\s*{re.escape(parameter)}', expression)
                            for parameter in owner_placeholders))

        sync_alias = next(alias for alias, field in names.items() if field == 'autoSync')
        sync_placeholders = [parameter for parameter, value in values.items() if value is True]
        self.assertTrue(any(re.search(rf'{re.escape(sync_alias)}\s*=\s*{re.escape(parameter)}', expression)
                            for parameter in sync_placeholders))
        self.assertRegex(expression, rf'attribute_not_exists\({re.escape(sync_alias)}\)')

    def test_resource_version_normalizes_boto3_decimals_and_rejects_invalid_numbers(self):
        self.assertEqual(meetup.resource_version({'id': 'legacy', 'version': Decimal('0')}), 0)
        self.assertEqual(meetup.resource_version({'id': 'legacy', 'version': Decimal('2.000')}), 2)
        for invalid in (
            Decimal('1.5'), Decimal('NaN'), Decimal('Infinity'), Decimal('-Infinity'),
            Decimal('-1'), Decimal('9007199254740992'), True, 1.5, '2',
        ):
            with self.subTest(version=invalid):
                with self.assertRaisesRegex(ValueError, 'Invalid catalog version'):
                    meetup.resource_version({'id': 'legacy', 'version': invalid})

    def test_existing_boto3_decimal_version_is_readable_and_normalized_for_cas(self):
        prior = existing_event(published=True)
        prior['version'] = Decimal('0')
        table = FakeTable([prior])
        loaded = meetup.load_existing_events(table)
        self.assertEqual(meetup.resource_version(loaded['meetup-event-456']), 0)

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
        self.assertNotIn('venueCountry', record)
        self.assertEqual(record['communityId'], 'meetup-123')
        self.assertTrue(record['published'])
        self.assertTrue(record['autoSync'])
        html = '<script type="application/ld+json">' + json.dumps(PAGE) + '</script>'
        self.assertEqual(meetup.parse_event_page(html, EVENT_URL)['name'], 'AWS en acción')

    def test_map_event_rejects_missing_empty_or_nonstring_title_and_trims_valid_title(self):
        entry = meetup.parse_feed(ICAL, GROUP)[0]
        invalid_names = ('missing', '', '   ', None, 42, [], '\ufeff', ' \ufeff \t', '\t\ufeff\ufeff ')
        for name in invalid_names:
            with self.subTest(name=name):
                page = dict(PAGE)
                if name == 'missing':
                    page.pop('name')
                else:
                    page['name'] = name
                with self.assertRaisesRegex(ValueError, 'event title'):
                    meetup.map_event(GROUP, entry, page)

        valid_names = (
            ('  Encuentro AWS  \n', 'Encuentro AWS'),
            ('\ufeff \tEncuentro AWS \ufeff\n', 'Encuentro AWS'),
        )
        for name, expected in valid_names:
            with self.subTest(valid_name=name):
                titled = meetup.map_event(GROUP, entry, dict(PAGE, name=name))
                self.assertEqual(titled['title'], expected)

    def test_nonpublishable_event_status_does_not_require_a_title(self):
        entry = meetup.parse_feed(ICAL, GROUP)[0]
        for status in (EVENT_CANCELLED, EVENT_MOVED_ONLINE, EVENT_POSTPONED):
            with self.subTest(status=status):
                page = dict(PAGE, eventStatus=status)
                page.pop('name')
                self.assertIsNone(meetup.map_event(GROUP, entry, page))

    def test_empty_calendar_is_a_valid_feed(self):
        empty_feed = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'
        self.assertEqual(meetup.parse_feed(empty_feed, GROUP), [])

    def test_feed_parser_rejects_incomplete_or_misnested_calendar_components(self):
        event_block = ICAL[ICAL.index('BEGIN:VEVENT\r\n'):
                           ICAL.index('END:VEVENT\r\n') + len('END:VEVENT\r\n')]
        malformed_feeds = {
            'missing event end': ICAL.replace('END:VEVENT\r\n', ''),
            'missing calendar end': ICAL.replace('END:VCALENDAR\r\n', ''),
            'event outside calendar': 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n' + event_block,
            'calendar ends inside event': ICAL.replace('END:VEVENT\r\nEND:VCALENDAR', 'END:VCALENDAR'),
            'nested event': ICAL.replace('BEGIN:VEVENT\r\n', 'BEGIN:VEVENT\r\nBEGIN:VEVENT\r\n'),
        }
        for description, feed in malformed_feeds.items():
            with self.subTest(description=description):
                with self.assertRaisesRegex(ValueError, 'Invalid iCalendar feed'):
                    meetup.parse_feed(feed, GROUP)

    def test_structured_address_country_maps_to_venue_country_without_changing_organizer_country(self):
        cases = (
            (' us ', 'US'),
            ({'@type': 'Country', 'identifier': 'ca', 'name': 'Canada'}, 'CA'),
            ({'@type': 'Country', 'name': ' gb '}, 'GB'),
        )
        entry = meetup.parse_feed(ICAL, GROUP)[0]
        for address_country, expected in cases:
            with self.subTest(address_country=address_country):
                address = dict(PAGE['location']['address'], addressCountry=address_country)
                page = dict(PAGE, location=dict(PAGE['location'], address=address))
                record = meetup.map_event(GROUP, entry, page)
                self.assertEqual(record['venueCountry'], expected)
                self.assertEqual(record['country'], 'CO')

    def test_missing_null_or_empty_address_country_omits_venue_country_and_unreadable_values_fail(self):
        entry = meetup.parse_feed(ICAL, GROUP)[0]
        base_address = dict(PAGE['location']['address'])
        for address_country in ('missing', None, '', '   '):
            with self.subTest(address_country=address_country):
                address = dict(base_address)
                if address_country != 'missing':
                    address['addressCountry'] = address_country
                page = dict(PAGE, location=dict(PAGE['location'], address=address))
                record = meetup.map_event(GROUP, entry, page)
                self.assertEqual(record['country'], 'CO')
                self.assertNotIn('venueCountry', record)

        invalid_values = ('United States', {'@type': 'Country', 'name': 'United States'},
                          {'@type': 'Country', 'identifier': 'USA'}, 840)
        for address_country in invalid_values:
            with self.subTest(invalid_address_country=address_country):
                address = dict(base_address, addressCountry=address_country)
                page = dict(PAGE, location=dict(PAGE['location'], address=address))
                with self.assertRaises(ValueError):
                    meetup.map_event(GROUP, entry, page)

    def test_unreadable_present_address_country_preserves_the_previous_event(self):
        prior = existing_event(published=True, starts_at=PAGE['startDate'], ends_at=PAGE['endDate'])
        prior['venueCountry'] = 'US'
        table = FakeTable([prior])
        address = dict(PAGE['location']['address'], addressCountry='United States')
        invalid_page = dict(PAGE, location=dict(PAGE['location'], address=address))
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
                patch.object(meetup, 'fetch_event_page', return_value=invalid_page):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])

        preserved = table.existing['meetup-event-456']
        self.assertEqual(result['changed'], 0)
        self.assertEqual(len(result['failures']), 1)
        self.assertEqual((preserved['country'], preserved['venueCountry'], preserved['published']),
                         ('CO', 'US', True))
        self.assertEqual(table.updates, [])

    def test_venue_country_is_sync_owned_and_removed_when_an_event_becomes_online(self):
        self.assertIn('venueCountry', meetup.SYNC_OWNED_FIELDS)
        self.assertIn('venueCountry', meetup.OPTIONAL_SYNC_FIELDS)
        entry = meetup.parse_feed(ICAL, GROUP)[0]
        address_us = dict(PAGE['location']['address'], addressCountry='US')
        page_us = dict(PAGE, location=dict(PAGE['location'], address=address_us))
        prior = meetup.map_event(GROUP, entry, page_us)
        prior['editorNote'] = 'keep private editor data'
        table = FakeTable([prior])

        address_ca = dict(PAGE['location']['address'], addressCountry='ca')
        page_ca = dict(PAGE, location=dict(PAGE['location'], address=address_ca))
        with patch.object(meetup, 'timezone_from_feed', return_value=[entry]), \
                patch.object(meetup, 'fetch_event_page', return_value=page_ca):
            changed_country = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(changed_country['changed'], 1)
        self.assertEqual(table.existing['meetup-event-456']['venueCountry'], 'CA')
        self.assertEqual(table.existing['meetup-event-456']['sourceModifiedAt'], entry['modified'])

        with patch.object(meetup, 'timezone_from_feed', return_value=[entry]), \
                patch.object(meetup, 'fetch_event_page', return_value=page_ca):
            repeated_country = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(repeated_country['changed'], 0)
        self.assertEqual(len(table.updates), 1)

        online_page = dict(PAGE, eventAttendanceMode='https://schema.org/OnlineEventAttendanceMode', location={})
        with patch.object(meetup, 'timezone_from_feed', return_value=[entry]), \
                patch.object(meetup, 'fetch_event_page', return_value=online_page):
            changed_mode = meetup.synchronize(table=table, groups=[dict(GROUP)])
        refreshed = table.existing['meetup-event-456']
        self.assertEqual(changed_mode['changed'], 1)
        self.assertEqual(refreshed['mode'], 'online')
        self.assertNotIn('venueCountry', refreshed)
        self.assertNotIn('city', refreshed)
        self.assertNotIn('place', refreshed)
        self.assertEqual(refreshed['country'], 'CO')
        self.assertEqual(refreshed['sourceModifiedAt'], entry['modified'])
        self.assertEqual(refreshed['editorNote'], 'keep private editor data')

        with patch.object(meetup, 'timezone_from_feed', return_value=[entry]), \
                patch.object(meetup, 'fetch_event_page', return_value=online_page):
            repeated_mode = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(repeated_mode['changed'], 0)
        self.assertEqual(len(table.updates), 2)

    def test_successful_feed_adds_and_then_retracts_event(self):
        table = FakeTable()
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
             patch.object(meetup, 'fetch_event_page', return_value=PAGE):
            first = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(first['changed'], 1)
        self.assertEqual(len(table.puts), 1)
        event = table.existing['meetup-event-456']
        reservation_id = f'__url#{meetup.current_url_hash(EVENT_URL)}'
        self.assertEqual(event['version'], 1)
        self.assertEqual(table.existing[reservation_id], {
            'id': reservation_id, 'recordType': 'urlReservation', 'url': EVENT_URL,
            'status': 'reserved', 'resourceId': 'meetup-event-456', 'version': 1,
        })
        self.assertEqual(len(table.transactions), 1)
        with patch.object(meetup, 'timezone_from_feed', return_value=[]):
            second = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(second['changed'], 1)
        self.assertFalse(table.existing['meetup-event-456']['published'])
        self.assertEqual(table.existing['meetup-event-456']['version'], 2)
        self.assertIn(reservation_id, table.existing)

    def test_registration_url_change_moves_the_reservation_with_the_event_atomically(self):
        prior = existing_event(published=True, starts_at=PAGE['startDate'], ends_at=PAGE['endDate'])
        prior['version'] = 1
        old_url = prior['registrationUrl']
        old_reservation = meetup.current_url_reservation(old_url, prior['id'])
        table = FakeTable([prior, old_reservation])
        new_url = old_url + '?ref=updated'
        entry = {'id': '456', 'url': new_url, 'modified': '20990102T000000Z'}
        page = dict(PAGE, url=new_url, name='Encuentro actualizado')
        with patch.object(meetup, 'timezone_from_feed', return_value=[entry]), \
                patch.object(meetup, 'fetch_event_page', return_value=page):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])

        new_reservation_id = f'__url#{meetup.current_url_hash(new_url)}'
        self.assertEqual(result['changed'], 1)
        self.assertNotIn(old_reservation['id'], table.existing)
        self.assertEqual(table.existing[new_reservation_id]['resourceId'], prior['id'])
        self.assertEqual(table.existing[prior['id']]['registrationUrl'], new_url)
        self.assertEqual(table.existing[prior['id']]['version'], 2)
        self.assertEqual(len(table.transactions), 1)

    def test_new_event_with_a_reserved_url_is_reported_and_not_inserted(self):
        reservation = meetup.current_url_reservation(EVENT_URL, 'another-resource')
        table = FakeTable([{'id': 'another-resource', 'url': EVENT_URL}, reservation])
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
                patch.object(meetup, 'fetch_event_page', return_value=PAGE):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])

        self.assertEqual(result['changed'], 0)
        self.assertEqual(result['conflicts'], [{'id': 'meetup-event-456', 'url': EVENT_URL, 'status': 'duplicate'}])
        self.assertNotIn('meetup-event-456', table.existing)

    def test_reservation_validation_reads_only_referenced_url_fields(self):
        resource = {'id': 'meetup-event-existing', 'recordType': 'event', 'registrationUrl': EVENT_URL,
                    'submitterEmail': 'private@example.invalid'}
        reservation = meetup.current_url_reservation(EVENT_URL, resource['id'])
        table = FakeTable([resource, reservation])

        self.assertEqual(meetup.read_reservation(table, EVENT_URL), reservation)
        self.assertEqual([list(call['ExpressionAttributeNames'].values()) for call in table.gets], [
            ['id', 'recordType', 'url', 'status', 'version', 'resourceId', 'resourceIds'],
            ['id', 'recordType', 'url', 'registrationUrl'],
        ])
        self.assertTrue(all(call['ConsistentRead'] for call in table.gets))
        self.assertFalse(any('submitterEmail' in call['ExpressionAttributeNames'].values() for call in table.gets))

    def test_reservation_to_missing_event_is_an_inconsistent_catalog_error(self):
        table = FakeTable([meetup.current_url_reservation(EVENT_URL, 'missing-resource')])
        with self.assertRaisesRegex(RuntimeError, 'missing or inconsistent resource'):
            meetup.read_reservation(table, EVENT_URL)

    def test_ended_events_missing_from_healthy_feed_keep_both_publication_values_without_hourly_writes(self):
        published = existing_event(published=True)
        hidden = existing_event(published=False)
        hidden['id'] = 'meetup-event-789'
        table = FakeTable([published, hidden])
        with patch.object(meetup, 'timezone_from_feed', return_value=[]):
            first = meetup.synchronize(table=table, groups=[dict(GROUP)])
            second = meetup.synchronize(table=table, groups=[dict(GROUP)])

        actual = (first['changed'], second['changed'],
                  table.existing['meetup-event-456']['published'],
                  table.existing['meetup-event-789']['published'], table.updates)
        self.assertEqual(actual, (0, 0, True, False, []))

    def test_present_past_scheduled_and_rescheduled_events_refresh_without_writing_publication(self):
        statuses = ('https://schema.org/EventScheduled', 'https://schema.org/EventRescheduled')
        for status in statuses:
            for was_published in (True, False):
                with self.subTest(status=status, was_published=was_published):
                    prior = existing_event(published=was_published)
                    prior['venueCountry'] = 'CA'
                    table = FakeTable([prior])
                    changed_page = dict(
                        PAGE,
                        name=f'Actualizado {status.rsplit("/", 1)[-1]}',
                        startDate='2001-02-03T18:00:00-05:00',
                        endDate='2001-02-03T20:00:00-05:00',
                        eventStatus=status,
                    )
                    changed_page['location'] = dict(
                        PAGE['location'],
                        address=dict(PAGE['location']['address'], addressCountry='US'),
                    )
                    with patch.object(meetup, 'timezone_from_feed',
                                      return_value=meetup.parse_feed(ICAL, GROUP)), \
                            patch.object(meetup, 'fetch_event_page', return_value=changed_page):
                        result = meetup.synchronize(table=table, groups=[dict(GROUP)])

                    refreshed = table.existing['meetup-event-456']
                    update = table.updates[0] if table.updates else None
                    written_fields = [] if update is None else [
                        update['ExpressionAttributeNames'][alias]
                        for alias, _parameter in re.findall(
                            r'(#\w+)\s*=\s*(:\w+)', update['UpdateExpression'].split(' REMOVE ', 1)[0])
                    ]
                    actual = (result['changed'], refreshed['title'], refreshed['startsAt'],
                              refreshed['endsAt'], refreshed.get('venueCountry'),
                              refreshed['published'], len(table.updates),
                              'published' in written_fields)
                    expected = (1, changed_page['name'], changed_page['startDate'],
                                changed_page['endDate'], 'US', was_published, 1, False)
                    self.assertEqual(actual, expected)
                    if update is not None and 'title' in update['ExpressionAttributeNames'].values():
                        self.assert_source_update_guards(update)

                    # A second identical sync must not rewrite a hidden row just
                    # because the mapped source record defaults to published=True.
                    with patch.object(meetup, 'timezone_from_feed',
                                      return_value=meetup.parse_feed(ICAL, GROUP)), \
                            patch.object(meetup, 'fetch_event_page', return_value=changed_page):
                        repeated = meetup.synchronize(table=table, groups=[dict(GROUP)])
                    actual_repeat = (repeated['changed'], len(table.updates),
                                     table.existing['meetup-event-456']['published'],
                                     table.existing['meetup-event-456']['title'])
                    expected_repeat = (0, 1, was_published, changed_page['name'])
                    self.assertEqual(actual_repeat, expected_repeat)

    def test_past_refresh_does_not_overwrite_a_concurrent_publication_change(self):
        prior = existing_event(published=True)
        table = FakeTable([prior])
        table.before_update = lambda item, _call: item.update(published=False)
        changed_page = dict(PAGE, name='Detalle actualizado',
                            startDate='2001-02-03T18:00:00-05:00',
                            endDate='2001-02-03T20:00:00-05:00')
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
                patch.object(meetup, 'fetch_event_page', return_value=changed_page):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])

        update = table.updates[0] if table.updates else None
        written_fields = [] if update is None else [
            update['ExpressionAttributeNames'][alias]
            for alias, _parameter in re.findall(
                r'(#\w+)\s*=\s*(:\w+)', update['UpdateExpression'].split(' REMOVE ', 1)[0])
        ]
        actual = (result['changed'], table.existing['meetup-event-456']['title'],
                  table.existing['meetup-event-456']['published'], 'published' in written_fields)
        self.assertEqual(actual, (1, 'Detalle actualizado', False, False))

    def test_past_event_rescheduled_to_future_uses_the_normal_published_path(self):
        prior = existing_event(published=False)
        table = FakeTable([prior])
        rescheduled = dict(PAGE,
                           startDate='2099-02-03T18:00:00-05:00',
                           endDate='2099-02-03T20:00:00-05:00',
                           eventStatus='https://schema.org/EventRescheduled')
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
                patch.object(meetup, 'fetch_event_page', return_value=rescheduled):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])

        self.assertEqual(result['changed'], 1)
        self.assertTrue(table.existing['meetup-event-456']['published'])
        self.assertEqual(table.existing['meetup-event-456']['startsAt'], rescheduled['startDate'])
        self.assertEqual(table.existing['meetup-event-456']['endsAt'], rescheduled['endDate'])

    def test_event_is_preserved_before_at_and_after_its_end(self):
        exact_start = '2030-01-01T19:00:00+00:00'
        exact_end = '2030-01-01T20:00:00+00:00'
        exact_page = dict(PAGE, startDate=exact_start, endDate=exact_end)
        checkpoints = (
            datetime(2030, 1, 1, 19, 59, 59, tzinfo=timezone.utc),
            datetime(2030, 1, 1, 20, 0, 0, tzinfo=timezone.utc),
            datetime(2030, 1, 1, 20, 0, 1, tzinfo=timezone.utc),
        )
        for remains_in_feed in (True, False):
            table = FakeTable([existing_event(starts_at=exact_start, ends_at=exact_end)])
            with patch.object(meetup, 'datetime', FrozenDateTime), \
                    patch.object(meetup, 'fetch_event_page', return_value=exact_page):
                for checkpoint in checkpoints:
                    entries = meetup.parse_feed(ICAL, GROUP) if remains_in_feed or checkpoint < checkpoints[1] else []
                    with self.subTest(now=checkpoint.isoformat(), remains_in_feed=remains_in_feed), \
                            patch.object(FrozenDateTime, 'frozen', checkpoint), \
                            patch.object(meetup, 'timezone_from_feed', return_value=entries):
                        result = meetup.synchronize(table=table, groups=[dict(GROUP)])
                        actual = (result['changed'], table.existing['meetup-event-456']['published'],
                                  table.existing['meetup-event-456']['endsAt'], table.updates)
                        self.assertEqual(actual, (0, True, exact_end, []))

    def test_past_event_without_prior_row_is_not_imported(self):
        table = FakeTable()
        past_page = dict(PAGE, startDate='2000-01-01T18:00:00-05:00', endDate='2000-01-01T20:00:00-05:00')
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
                patch.object(meetup, 'fetch_event_page', return_value=past_page):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])

        self.assertEqual(result['changed'], 0)
        self.assertEqual(table.puts, [])
        self.assertNotIn('meetup-event-456', table.existing)

    def test_explicit_cancelled_feed_entry_retracts_an_existing_past_event(self):
        prior = existing_event(published=True)
        table = FakeTable([prior])
        cancelled_entries = meetup.parse_feed(CANCELLED_ICAL, GROUP)
        with patch.object(meetup, 'timezone_from_feed', return_value=cancelled_entries), \
             patch.object(meetup, 'fetch_event_page', side_effect=RuntimeError('page unavailable')):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])

        self.assertEqual(result['changed'], 1)
        self.assertEqual(result['failures'], [])
        self.assertFalse(table.existing['meetup-event-456']['published'])

    def test_cancelled_utc_feed_without_timezone_retracts_past_and_future_events(self):
        for age, (start, end) in EVENT_DATES.items():
            with self.subTest(age=age):
                prior = existing_event(published=True, starts_at=start, ends_at=end)
                table = FakeTable([prior])
                group = dict(GROUP)
                with patch.object(meetup, 'get_text', return_value=CANCELLED_UTC_ICAL) as get_text, \
                        patch.object(meetup, 'fetch_event_page') as fetch_event_page:
                    result = meetup.synchronize(table=table, groups=[group])

                self.assertEqual(result['feedsRead'], 1)
                self.assertEqual(result['changed'], 1)
                self.assertEqual(result['failures'], [])
                self.assertFalse(table.existing['meetup-event-456']['published'])
                self.assertEqual(table.updates[0]['Key']['id'], 'meetup-event-456')
                self.assertIsNone(group['timeZone'])
                get_text.assert_called_once_with(meetup.group_feed_url(group))
                fetch_event_page.assert_not_called()

    def test_scheduled_utc_feed_without_timezone_still_preserves_published_event(self):
        prior = existing_event(published=True, starts_at=PAGE['startDate'], ends_at=PAGE['endDate'])
        table = FakeTable([prior])
        group = dict(GROUP)
        with patch.object(meetup, 'get_text', return_value=SCHEDULED_UTC_ICAL) as get_text, \
                patch.object(meetup, 'fetch_event_page') as fetch_event_page:
            result = meetup.synchronize(table=table, groups=[group])

        self.assertEqual(result['feedsRead'], 0)
        self.assertEqual(result['changed'], 0)
        self.assertEqual(len(result['failures']), 1)
        self.assertIn('Missing timezone in feed of 123', result['failures'][0])
        self.assertTrue(table.existing['meetup-event-456']['published'])
        self.assertEqual(table.updates, [])
        self.assertEqual(group['timeZone'], GROUP['timeZone'])
        get_text.assert_called_once_with(meetup.group_feed_url(group))
        fetch_event_page.assert_not_called()

    def test_explicit_cancelled_feed_entry_without_prior_row_does_not_insert(self):
        table = FakeTable()
        cancelled_entries = meetup.parse_feed(CANCELLED_ICAL, GROUP)
        with patch.object(meetup, 'timezone_from_feed', return_value=cancelled_entries), \
                patch.object(meetup, 'fetch_event_page', return_value=PAGE):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])

        self.assertEqual(result['changed'], 0)
        self.assertEqual(result['failures'], [])
        self.assertEqual(table.puts, [])
        self.assertNotIn('meetup-event-456', table.existing)

    def test_other_nonpublishable_page_status_remains_excluded(self):
        statuses = (EVENT_MOVED_ONLINE, EVENT_POSTPONED)
        for age, (start, end) in EVENT_DATES.items():
            for status in statuses:
                with self.subTest(age=age, status=status):
                    table = FakeTable([existing_event(starts_at=start, ends_at=end)])
                    page = dict(PAGE, startDate=start, endDate=end, eventStatus=status)
                    with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
                            patch.object(meetup, 'fetch_event_page', return_value=page):
                        result = meetup.synchronize(table=table, groups=[dict(GROUP)])

                    self.assertEqual(result['changed'], 1)
                    self.assertFalse(table.existing['meetup-event-456']['published'])

    def test_incomplete_or_unknown_event_status_preserves_published_past_and_future_rows(self):
        invalid_statuses = (
            ('missing', 'missing'),
            ('null', None),
            ('unknown', 'https://schema.org/EventUnknown'),
            ('malformed', ['https://schema.org/EventScheduled']),
        )
        for age, (start, end) in EVENT_DATES.items():
            for status_name, status in invalid_statuses:
                with self.subTest(age=age, status=status_name):
                    prior = existing_event(published=True, starts_at=start, ends_at=end)
                    table = FakeTable([prior])
                    page = dict(PAGE, startDate=start, endDate=end)
                    if status_name == 'missing':
                        page.pop('eventStatus')
                    else:
                        page['eventStatus'] = status

                    with patch.object(meetup, 'timezone_from_feed',
                                      return_value=meetup.parse_feed(ICAL, GROUP)), \
                            patch.object(meetup, 'fetch_event_page', return_value=page):
                        result = meetup.synchronize(table=table, groups=[dict(GROUP)])

                    preserved = table.existing['meetup-event-456']
                    self.assertEqual(result['changed'], 0)
                    self.assertEqual(len(result['failures']), 1)
                    self.assertIn('event status', result['failures'][0].lower())
                    self.assertTrue(preserved['published'])
                    self.assertEqual(table.updates, [])
                    self.assertEqual(table.puts, [])

    def test_invalid_event_status_protects_its_group_while_a_healthy_group_syncs(self):
        current = existing_event(published=True, starts_at='2099-01-01T18:00:00-05:00',
                                 ends_at='2099-01-01T20:00:00-05:00')
        sibling = existing_event(published=True, starts_at='2099-01-02T18:00:00-05:00',
                                 ends_at='2099-01-02T20:00:00-05:00')
        sibling['id'] = 'meetup-event-789'
        table = FakeTable([current, sibling])
        healthy_group = {
            'id': '999', 'url': 'https://www.meetup.com/aws-test/', 'name': 'AWS Test',
            'country': 'CO', 'timeZone': 'America/Bogota',
        }
        current_entry = meetup.parse_feed(ICAL, GROUP)[0]
        healthy_entry = dict(current_entry, id='999',
                             url='https://www.meetup.com/aws-test/events/999/')

        def feed(group):
            return [current_entry] if group['id'] == '123' else [healthy_entry]

        def page(entry):
            result = dict(PAGE, url=entry['url'])
            if entry['id'] == '456':
                result.pop('eventStatus')
            return result

        with patch.object(meetup, 'timezone_from_feed', side_effect=feed), \
                patch.object(meetup, 'fetch_event_page', side_effect=page):
            result = meetup.synchronize(table=table, groups=[dict(GROUP), healthy_group])

        self.assertEqual(result['changed'], 1)
        self.assertEqual(len(result['failures']), 1)
        self.assertIn('Event 456 in group 123', result['failures'][0])
        self.assertTrue(table.existing['meetup-event-456']['published'])
        self.assertTrue(table.existing['meetup-event-789']['published'])
        self.assertIn('meetup-event-999', table.existing)

    def test_invalid_title_preserves_prior_past_or_future_record_while_healthy_group_syncs(self):
        healthy_group = {
            'id': '999', 'url': 'https://www.meetup.com/aws-test/', 'name': 'AWS Test',
            'country': 'CO', 'timeZone': 'America/Bogota',
        }
        current_entry = meetup.parse_feed(ICAL, GROUP)[0]
        healthy_entry = dict(current_entry, id='999',
                             url='https://www.meetup.com/aws-test/events/999/')
        invalid_names = ('   ', '\ufeff', ' \ufeff \t')

        for age, (start, end) in EVENT_DATES.items():
            for was_published in (True, False):
                for invalid_name in invalid_names:
                    with self.subTest(age=age, published=was_published, name=invalid_name):
                        prior = existing_event(published=was_published, starts_at=start, ends_at=end)
                        prior['editorNote'] = 'keep this private field'
                        table = FakeTable([prior])

                        def feed(group):
                            return [current_entry] if group['id'] == '123' else [healthy_entry]

                        def page(entry):
                            if entry['id'] == '456':
                                return dict(PAGE, name=invalid_name, startDate=start, endDate=end)
                            return dict(PAGE, url=entry['url'])

                        with patch.object(meetup, 'timezone_from_feed', side_effect=feed), \
                                patch.object(meetup, 'fetch_event_page', side_effect=page):
                            result = meetup.synchronize(table=table, groups=[dict(GROUP), healthy_group])

                        self.assertEqual(result['changed'], 1)
                        self.assertEqual(len(result['failures']), 1)
                        self.assertIn('event title', result['failures'][0].lower())
                        self.assertEqual(table.existing['meetup-event-456'], prior)
                        self.assertIn('meetup-event-999', table.existing)
                        self.assertEqual(len(table.puts), 1)
                        self.assertEqual(table.updates, [])

    def test_absence_retraction_does_not_clobber_a_concurrent_reschedule_of_ends_at(self):
        prior_end = '2099-01-01T20:00:00-05:00'
        concurrent_end = '2099-01-02T20:00:00-05:00'
        prior = existing_event(published=True, starts_at='2099-01-01T18:00:00-05:00', ends_at=prior_end)
        table = FakeTable([prior])
        table.before_update = lambda item, _call: item.update(endsAt=concurrent_end)
        with patch.object(meetup, 'timezone_from_feed', return_value=[]):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])

        guarded = False
        if table.updates:
            condition = table.updates[0]['ConditionExpression']
            names = table.updates[0]['ExpressionAttributeNames']
            values = table.updates[0]['ExpressionAttributeValues']
            end_alias = next((alias for alias, field in names.items() if field == 'endsAt'), None)
            prior_end_parameters = [parameter for parameter, value in values.items() if value == prior_end]
            if end_alias is not None:
                guarded = any(re.search(rf'{re.escape(end_alias)}\s*=\s*{re.escape(parameter)}', condition)
                              for parameter in prior_end_parameters)
        actual = (result['changed'], result['failures'], len(table.updates),
                  table.existing['meetup-event-456']['published'],
                  table.existing['meetup-event-456']['endsAt'], guarded)
        self.assertEqual(actual, (0, [], 1, True, concurrent_end, True))

    def test_concurrent_owner_or_auto_sync_change_skips_source_update(self):
        changes = (
            ('sourceGroupId', 'meetup-999'),
            ('autoSync', False),
        )
        for field, value in changes:
            with self.subTest(field=field, value=value):
                prior = existing_event(published=True, starts_at='2099-01-01T18:00:00-05:00',
                                       ends_at='2099-01-01T20:00:00-05:00')
                prior['venueCountry'] = 'US'
                table = FakeTable([prior])
                table.before_update = lambda item, _call, changed_field=field, changed_value=value: \
                    item.update({changed_field: changed_value})
                changed_page = dict(
                    PAGE,
                    location=dict(PAGE['location'],
                                  address=dict(PAGE['location']['address'], addressCountry='CA')),
                )
                with patch.object(meetup, 'timezone_from_feed',
                                  return_value=meetup.parse_feed(ICAL, GROUP)), \
                        patch.object(meetup, 'fetch_event_page', return_value=changed_page):
                    result = meetup.synchronize(table=table, groups=[dict(GROUP)])

                self.assertEqual(result['changed'], 0)
                self.assertEqual(result['skipped'], 1)
                self.assertEqual(result['failures'], [])
                self.assertEqual(table.existing['meetup-event-456'][field], value)
                self.assertEqual(table.existing['meetup-event-456']['title'], prior['title'])
                self.assertEqual(table.existing['meetup-event-456']['venueCountry'], 'US')

    def test_unrelated_source_update_failure_is_not_treated_as_condition_conflict(self):
        prior = existing_event(published=True, starts_at='2099-01-01T18:00:00-05:00',
                               ends_at='2099-01-01T20:00:00-05:00')
        table = FakeTable([prior])

        def fail_update(_item, _call):
            raise RuntimeError('database unavailable')

        table.before_update = fail_update
        changed_page = dict(PAGE, name='Nueva versión fuente')
        with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
                patch.object(meetup, 'fetch_event_page', return_value=changed_page):
            with self.assertRaisesRegex(RuntimeError, 'database unavailable'):
                meetup.synchronize(table=table, groups=[dict(GROUP)])

    def test_removed_approved_group_retracts_its_past_and_future_events(self):
        past = existing_event(published=True)
        future = existing_event(published=True, starts_at='2099-01-02T18:00:00-05:00',
                                ends_at='2099-01-02T20:00:00-05:00')
        future['id'] = 'meetup-event-789'
        table = FakeTable([past, future])
        replacement_group = {
            'id': '999', 'url': 'https://www.meetup.com/aws-test/', 'name': 'AWS Test',
            'country': 'CO', 'timeZone': 'America/Bogota',
        }
        with patch.object(meetup, 'timezone_from_feed', return_value=[]):
            result = meetup.synchronize(table=table, groups=[replacement_group])

        self.assertEqual(result['changed'], 2)
        self.assertFalse(table.existing['meetup-event-456']['published'])
        self.assertFalse(table.existing['meetup-event-789']['published'])

    def test_noop_historical_sync_does_not_invoke_publication(self):
        community = {
            'id': 'meetup-123', 'title': GROUP['name'], 'url': GROUP['url'],
            'country': 'CO', 'kind': 'community', 'published': True,
        }
        table = FakeTable([community, existing_event(published=True)])
        invocations = []
        boto3 = fake_boto3(table, invocations)
        with patch.dict(sys.modules, {'boto3': boto3}), \
                patch.dict(os.environ, {'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication'}), \
                patch.object(meetup, 'timezone_from_feed', return_value=[]):
            first = meetup.lambda_handler({}, None)
            second = meetup.lambda_handler({}, None)

        actual = (first['changed'], second['changed'], table.updates, invocations,
                  table.existing['meetup-event-456']['published'])
        self.assertEqual(actual, (0, 0, [], [], True))

    def test_partial_success_invokes_publication_then_propagates_source_failure(self):
        communities = [
            {
                'id': 'meetup-123', 'title': GROUP['name'], 'url': GROUP['url'],
                'country': 'CO', 'kind': 'community', 'published': True,
            },
            {
                'id': 'meetup-999', 'title': 'AWS Test', 'url': 'https://www.meetup.com/aws-test/',
                'country': 'CO', 'kind': 'community', 'published': True,
            },
        ]
        table = FakeTable(communities)
        invocations = []
        boto3 = fake_boto3(table, invocations)

        def feed(group):
            if group['id'] == '123':
                # timezone_from_feed sets this from the feed's TZID header.
                group['timeZone'] = GROUP['timeZone']
                return meetup.parse_feed(ICAL, GROUP)
            raise RuntimeError('Meetup feed unavailable')

        with patch.dict(sys.modules, {'boto3': boto3}), \
                patch.dict(os.environ, {'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication'}), \
                patch.object(meetup, 'timezone_from_feed', side_effect=feed), \
                patch.object(meetup, 'fetch_event_page', return_value=PAGE):
            with self.assertRaisesRegex(RuntimeError, '1 Meetup sources failed'):
                meetup.lambda_handler({}, None)

        self.assertIn('meetup-event-456', table.existing)
        self.assertEqual(table.existing['meetup-event-456']['timeZone'], GROUP['timeZone'])
        self.assertEqual(len(invocations), 1)
        self.assertEqual(invocations[0]['FunctionName'], 'fake-publication')
        self.assertEqual(invocations[0]['InvocationType'], 'Event')

    def test_failed_feed_preserves_published_event(self):
        for age, (start, end) in EVENT_DATES.items():
            with self.subTest(age=age):
                table = FakeTable([existing_event(starts_at=start, ends_at=end)])
                with patch.object(meetup, 'timezone_from_feed', side_effect=RuntimeError('Meetup unavailable')):
                    result = meetup.synchronize(table=table, groups=[dict(GROUP)])
                self.assertEqual(result['changed'], 0)
                self.assertEqual(len(result['failures']), 1)
                self.assertTrue(table.existing['meetup-event-456']['published'])

    def test_malformed_feed_preserves_past_and_future_events_while_healthy_group_syncs(self):
        past = existing_event(published=True)
        future = existing_event(published=True, starts_at='2099-01-02T18:00:00-05:00',
                                ends_at='2099-01-02T20:00:00-05:00')
        future['id'] = 'meetup-event-789'
        table = FakeTable([past, future])
        healthy_group = {
            'id': '999', 'url': 'https://www.meetup.com/aws-test/', 'name': 'AWS Test',
            'country': 'CO', 'timeZone': 'America/Bogota',
        }
        broken_feed = ICAL.replace('END:VEVENT\r\n', '')
        healthy_url = 'https://www.meetup.com/aws-test/events/999/'
        healthy_feed = ICAL.replace(EVENT_URL, healthy_url).replace('456', '999')

        def feed(group):
            source = broken_feed if group['id'] == '123' else healthy_feed
            return meetup.parse_feed(source, group)

        with patch.object(meetup, 'timezone_from_feed', side_effect=feed), \
                patch.object(meetup, 'fetch_event_page', side_effect=lambda entry: dict(PAGE, url=entry['url'])):
            result = meetup.synchronize(table=table, groups=[dict(GROUP), healthy_group])

        self.assertEqual(result['changed'], 1)
        self.assertEqual(len(result['failures']), 1)
        self.assertIn('Feed 123:', result['failures'][0])
        self.assertTrue(table.existing['meetup-event-456']['published'])
        self.assertTrue(table.existing['meetup-event-789']['published'])
        self.assertIn('meetup-event-999', table.existing)

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
        with patch.object(meetup, 'timezone_from_feed', return_value=[]):
            absent = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(absent['changed'], 0)
        self.assertFalse(table.existing['meetup-event-456']['published'])
        self.assertEqual(table.updates, [])
        past_hidden = existing_event(published=False, auto_sync=False)
        past_hidden['id'] = 'meetup-event-789'
        table.existing[past_hidden['id']] = past_hidden
        with patch.object(meetup, 'timezone_from_feed', return_value=[]):
            absent_past = meetup.synchronize(table=table, groups=[dict(GROUP)])
        self.assertEqual(absent_past['changed'], 0)
        self.assertFalse(table.existing['meetup-event-789']['published'])
        self.assertFalse(table.existing['meetup-event-789']['autoSync'])
        self.assertEqual(table.updates, [])

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
        for age, (start, end) in EVENT_DATES.items():
            with self.subTest(age=age):
                table = FakeTable([existing_event(starts_at=start, ends_at=end)])
                cancelled = dict(PAGE, startDate=start, endDate=end, eventStatus=EVENT_CANCELLED)
                with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
                        patch.object(meetup, 'fetch_event_page', return_value=cancelled):
                    result = meetup.synchronize(table=table, groups=[dict(GROUP)])
                self.assertEqual(result['changed'], 1)
                self.assertFalse(table.existing['meetup-event-456']['published'])

    def test_failed_detail_fetch_preserves_existing_event(self):
        for age, (start, end) in EVENT_DATES.items():
            with self.subTest(age=age):
                table = FakeTable([existing_event(starts_at=start, ends_at=end)])
                with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
                        patch.object(meetup, 'fetch_event_page', side_effect=RuntimeError('Meetup page unavailable')):
                    result = meetup.synchronize(table=table, groups=[dict(GROUP)])
                self.assertEqual(result['changed'], 0)
                self.assertEqual(len(result['failures']), 1)
                self.assertTrue(table.existing['meetup-event-456']['published'])

    def test_existing_event_gets_community_and_verified_city_then_removes_stale_city(self):
        for age, (start, end) in EVENT_DATES.items():
            with self.subTest(age=age):
                prior = existing_event(starts_at=start, ends_at=end)
                prior.pop('communityId')
                prior.pop('city')
                prior['place'] = 'Sede anterior'
                prior['editorNote'] = 'keep this private field'
                page = dict(PAGE, startDate=start, endDate=end)
                table = FakeTable([prior])
                with patch.object(meetup, 'timezone_from_feed', return_value=meetup.parse_feed(ICAL, GROUP)), \
                        patch.object(meetup, 'fetch_event_page', return_value=page):
                    result = meetup.synchronize(table=table, groups=[dict(GROUP)])
                self.assertEqual(result['changed'], 1)
                refreshed = table.existing['meetup-event-456']
                self.assertEqual((refreshed.get('city'), refreshed.get('communityId'), refreshed.get('place'),
                                  refreshed['published'], refreshed['editorNote']),
                                 ('Bogotá', 'meetup-123', 'Auditorio, Calle 1', True, 'keep this private field'))

                changed = dict(page, eventAttendanceMode='https://schema.org/OnlineEventAttendanceMode', location={})
                entry = dict(meetup.parse_feed(ICAL, GROUP)[0], modified='20990102T000000Z')
                with patch.object(meetup, 'timezone_from_feed', return_value=[entry]), \
                        patch.object(meetup, 'fetch_event_page', return_value=changed):
                    result = meetup.synchronize(table=table, groups=[dict(GROUP)])
                refreshed = table.existing['meetup-event-456']
                self.assertEqual((result['changed'], 'city' in refreshed, 'place' in refreshed,
                                  refreshed['published'], refreshed['editorNote']),
                                 (1, False, False, True, 'keep this private field'))

    def test_online_event_ignores_unreadable_physical_address_country(self):
        entry = meetup.parse_feed(ICAL, GROUP)[0]
        physical_location = {
            '@type': 'Place',
            'name': 'Ignored venue',
            'address': {
                'streetAddress': 'Ignored address',
                'addressLocality': 'Ignored city',
                'addressCountry': 'United States',
            },
        }
        online_page = dict(
            PAGE,
            eventAttendanceMode='https://schema.org/OnlineEventAttendanceMode',
            location=physical_location,
        )

        record = meetup.map_event(GROUP, entry, online_page)

        self.assertEqual(record['mode'], 'online')
        self.assertEqual(record['country'], GROUP['country'])
        for field in ('place', 'city', 'venueCountry'):
            self.assertNotIn(field, record)

    def test_unsupported_address_country_objects_fail_and_preserve_existing_event(self):
        entry = meetup.parse_feed(ICAL, GROUP)[0]
        unsupported_values = (
            {'@type': 'Country', '@id': 'https://example.test/countries/US'},
            {'alternateName': 'United States'},
        )
        for address_country in unsupported_values:
            with self.subTest(address_country=address_country):
                address = dict(PAGE['location']['address'], addressCountry=address_country)
                page = dict(PAGE, location=dict(PAGE['location'], address=address))
                with self.assertRaises(ValueError):
                    meetup.map_event(GROUP, entry, page)

        prior = existing_event(published=True, starts_at=PAGE['startDate'], ends_at=PAGE['endDate'])
        prior['venueCountry'] = 'US'
        table = FakeTable([prior])
        invalid_address = dict(PAGE['location']['address'], addressCountry=unsupported_values[0])
        invalid_page = dict(PAGE, location=dict(PAGE['location'], address=invalid_address))
        with patch.object(meetup, 'timezone_from_feed', return_value=[entry]), \
                patch.object(meetup, 'fetch_event_page', return_value=invalid_page):
            result = meetup.synchronize(table=table, groups=[dict(GROUP)])

        preserved = table.existing['meetup-event-456']
        self.assertEqual(result['changed'], 0)
        self.assertEqual(len(result['failures']), 1)
        self.assertEqual((preserved['country'], preserved['venueCountry'], preserved['published']),
                         ('CO', 'US', True))
        self.assertEqual(table.updates, [])


if __name__ == '__main__':
    unittest.main()
