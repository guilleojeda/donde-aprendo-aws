"""Acceptance for generic catalog community IDs in the Meetup importer."""
import copy
import re
import unicodedata
import unittest
from unittest.mock import patch

import test_meetup_events as fixtures

meetup = fixtures.meetup


def event_entry(event_id='456'):
    url = f'https://www.meetup.com/aws-bogota/events/{event_id}/'
    return {'id': event_id, 'url': url, 'modified': '20990101T000000Z'}


def event_page(entry, status='https://schema.org/EventScheduled'):
    return dict(fixtures.PAGE, url=entry['url'], eventStatus=status)


class MeetupCatalogIdentityTests(unittest.TestCase):
    def assert_accepted(self, operation, context):
        try:
            return operation()
        except (TypeError, ValueError) as error:
            self.fail(f'{context} was rejected: {error}')

    def synchronize(self, table, groups, entries_by_group, pages_by_event):
        def feed(group):
            return entries_by_group[group['id']]

        def page(entry):
            return pages_by_event[entry['id']]

        with patch.object(meetup, 'timezone_from_feed', side_effect=feed), \
                patch.object(meetup, 'fetch_event_page', side_effect=page):
            return meetup.synchronize(table=table, groups=[dict(group) for group in groups])

    @staticmethod
    def group(group_id):
        return dict(fixtures.GROUP, id=group_id)

    def test_generic_community_keys_map_write_and_retract_exactly(self):
        cases = (
            ('colon', 'aws:bogota'),
            ('long-ascii', 'a' * 130),
            ('unicode', 'AWS Bogotá ☁️'),
            # The generated `meetup-` key is exactly 256 UTF-8 bytes.
            ('maximum-utf8', 'é' * 124 + 'x'),
            # JavaScript String.trim() preserves NEL U+0085; Python str.strip() does not.
            ('javascript-trim-boundary', 'aws\u0085'),
        )

        for label, group_suffix in cases:
            with self.subTest(identity=label):
                group = self.group(group_suffix)
                community_id = f'meetup-{group_suffix}'
                entry = event_entry()
                page = event_page(entry)

                self.assert_accepted(lambda: meetup.validate_meetup_group(group),
                                     f'{label} Meetup group key')
                record = self.assert_accepted(lambda: meetup.map_event(group, entry, page),
                                              f'{label} mapped event')
                self.assert_accepted(lambda: meetup.validate_meetup_event_record(record),
                                     f'{label} mapped event record')
                self.assertEqual(record['communityId'], community_id)
                self.assertEqual(record['sourceGroupId'], community_id)
                byte_length = len(community_id.encode('utf-8'))
                self.assertLessEqual(byte_length, 256)
                if label == 'maximum-utf8':
                    self.assertEqual(byte_length, 256)
                self.assertLessEqual(len(record['id']), 128)
                self.assertRegex(record['id'], r'^meetup-event-[A-Za-z0-9_-]+$')

                table = fixtures.FakeTable()
                created = self.synchronize(table, [group], {group_suffix: [entry]},
                                           {entry['id']: page})
                self.assertEqual((created['changed'], created['failures']), (1, []))
                stored = table.existing['meetup-event-456']
                self.assertEqual(stored['communityId'], community_id)
                self.assertEqual(stored['sourceGroupId'], community_id)
                self.assertEqual(table.puts[0]['sourceGroupId'], community_id)

                cancelled = event_page(entry, fixtures.EVENT_CANCELLED)
                retracted = self.synchronize(table, [group], {group_suffix: [entry]},
                                             {entry['id']: cancelled})
                self.assertEqual((retracted['changed'], retracted['failures']), (1, []))
                stored = table.existing['meetup-event-456']
                self.assertFalse(stored['published'])
                self.assertEqual(stored['communityId'], community_id)
                self.assertEqual(stored['sourceGroupId'], community_id)

                guard = table.updates[-1]
                owner_alias = next(alias for alias, field in guard['ExpressionAttributeNames'].items()
                                   if field == 'sourceGroupId')
                owner_parameters = [parameter for parameter, value in
                                    guard['ExpressionAttributeValues'].items()
                                    if value == community_id]
                self.assertTrue(any(re.search(
                    rf'{re.escape(owner_alias)}\s*=\s*{re.escape(parameter)}(?:\s|$)',
                    guard['ConditionExpression']) for parameter in owner_parameters))

    def test_normalization_equivalent_accent_ids_remain_distinct_retraction_owners(self):
        composed = 'Bogotá'
        decomposed = 'Bogota\u0301'
        self.assertNotEqual(composed, decomposed)
        self.assertEqual(unicodedata.normalize('NFC', composed),
                         unicodedata.normalize('NFC', decomposed))

        groups = [self.group(composed), self.group(decomposed)]
        entries = [event_entry('456'), event_entry('789')]
        feeds = {composed: [entries[0]], decomposed: [entries[1]]}
        pages = {entry['id']: event_page(entry) for entry in entries}
        table = fixtures.FakeTable()

        created = self.synchronize(table, groups, feeds, pages)
        self.assertEqual((created['changed'], created['failures']), (2, []))
        self.assertEqual(table.existing['meetup-event-456']['communityId'], f'meetup-{composed}')
        self.assertEqual(table.existing['meetup-event-789']['communityId'], f'meetup-{decomposed}')
        self.assertNotEqual(table.existing['meetup-event-456']['communityId'],
                            table.existing['meetup-event-789']['communityId'])

        pages[entries[0]['id']] = event_page(entries[0], fixtures.EVENT_CANCELLED)
        cancelled = self.synchronize(table, groups, feeds, pages)
        self.assertEqual((cancelled['changed'], cancelled['failures']), (1, []))
        self.assertFalse(table.existing['meetup-event-456']['published'])
        self.assertTrue(table.existing['meetup-event-789']['published'])

    def test_generic_ids_do_not_change_meetup_source_enrollment(self):
        ordinary = {
            'id': 'aws:bogota', 'title': 'AWS Bogotá', 'url': fixtures.GROUP['url'],
            'country': 'CO', 'kind': 'community', 'published': True,
        }
        meetup_source = dict(ordinary, id='meetup-123')
        wrong_kind = dict(meetup_source, id='meetup-not-a-community', kind='content')

        groups = meetup.load_groups_from_dynamodb(fixtures.FakeTable([ordinary, meetup_source, wrong_kind]))
        self.assertEqual([group['id'] for group in groups], ['123'])
        self.assertEqual(groups[0]['url'], fixtures.GROUP['url'])

    def test_invalid_community_keys_and_references_are_rejected(self):
        invalid_group_ids = (None, 12, 'a' * 250, 'aws ', 'aws\ufeff')
        for invalid in invalid_group_ids:
            with self.subTest(group_id=invalid):
                with self.assertRaises(ValueError):
                    meetup.validate_meetup_group(self.group(invalid))

        group = self.group('123')
        valid_entry = event_entry()
        valid = meetup.map_event(group, valid_entry, event_page(valid_entry))
        invalid_references = (
            '', None, 12, 'meetup-aws ', 'meetup-aws\ufeff', f'meetup-{"é" * 125}',
        )
        for field in ('communityId', 'sourceGroupId'):
            for invalid in invalid_references:
                with self.subTest(field=field, reference=invalid):
                    malformed = dict(valid, **{field: invalid})
                    with self.assertRaises(ValueError):
                        meetup.validate_meetup_event_record(malformed)
                    table = fixtures.FakeTable()
                    with self.assertRaises(ValueError):
                        meetup.create_source_event_with_url_reservation(table, malformed)
                    self.assertEqual(table.gets, [])
                    self.assertEqual(table.transactions, [])

        too_long = self.group('a' * 250)
        with self.assertRaises(ValueError):
            meetup.map_event(too_long, valid_entry, event_page(valid_entry))

    def test_cancellation_retraction_cannot_change_owner_after_its_read(self):
        group_suffix = '123'
        group = self.group(group_suffix)
        entry = event_entry()
        table = fixtures.FakeTable()
        created = self.synchronize(table, [group], {group_suffix: [entry]},
                                   {entry['id']: event_page(entry)})
        self.assertEqual(created['changed'], 1)

        foreign_owner = 'meetup-999'
        table.before_update = lambda item, _call: item.update(sourceGroupId=foreign_owner)
        cancelled = self.synchronize(table, [group], {group_suffix: [entry]},
                                     {entry['id']: event_page(entry, fixtures.EVENT_CANCELLED)})
        current = table.existing['meetup-event-456']
        self.assertEqual((cancelled['changed'], cancelled['failures']), (0, []))
        self.assertTrue(current['published'])
        self.assertEqual(current['sourceGroupId'], foreign_owner)

    def test_cancellation_preserves_manual_auto_sync_disabled_draft_and_foreign_events(self):
        group_suffix = '123'
        group = self.group(group_suffix)
        entry = event_entry()
        controls = (
            ('manual', 'remove-source'),
            ('auto-sync-disabled', 'disable-sync'),
            ('draft', 'hide'),
            ('foreign-owner', 'change-owner'),
        )

        for label, change in controls:
            with self.subTest(source_state=label):
                table = fixtures.FakeTable()
                self.synchronize(table, [group], {group_suffix: [entry]},
                                 {entry['id']: event_page(entry)})
                event = table.existing['meetup-event-456']
                if change == 'remove-source':
                    event.pop('sourceGroupId')
                    event['autoSync'] = False
                elif change == 'disable-sync':
                    event['autoSync'] = False
                elif change == 'hide':
                    event['published'] = False
                else:
                    event['sourceGroupId'] = 'meetup-999'
                before = copy.deepcopy(event)

                cancelled = self.synchronize(
                    table, [group], {group_suffix: [entry]},
                    {entry['id']: event_page(entry, fixtures.EVENT_CANCELLED)},
                )
                self.assertEqual((cancelled['changed'], cancelled['failures']), (0, []))
                self.assertEqual(table.existing['meetup-event-456'], before)
                self.assertEqual(table.updates, [])


if __name__ == '__main__':
    unittest.main()
