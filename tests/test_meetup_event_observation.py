"""The Meetup detail response supplies only one unambiguous event observation."""

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


def script(value):
    return '<script type="application/ld+json">' + json.dumps(value) + '</script>'


class MeetupEventObservationTests(unittest.TestCase):
    def test_only_verified_event_details_authorize_retraction(self):
        community = {
            'id': 'meetup-123', 'title': support.GROUP['name'],
            'meetupSourceUrl': support.GROUP['url'], 'country': 'CO',
            'kind': 'community', 'published': True,
        }
        starts_at, ends_at = support.EVENT_DATES['future']
        listed = support.existing_event(starts_at=starts_at, ends_at=ends_at)
        unlisted = dict(listed, id='meetup-event-457',
                        registrationUrl=support.EVENT_URL.replace('/456/', '/457/'))
        cancelled = dict(support.PAGE, eventStatus=support.EVENT_CANCELLED)
        different_origin = dict(cancelled, url=support.EVENT_URL.replace('meetup.com', 'meetup.com:444'))
        userinfo_url = dict(cancelled, url=support.EVENT_URL.replace('www.', 'name@www.'))
        path_parameters = dict(cancelled, url=support.EVENT_URL + ';alternate-record')
        conflicting_status = script(support.PAGE).replace(
            '"eventStatus": ', f'"eventStatus": "{support.EVENT_CANCELLED}", "eventStatus": ')
        other_event = dict(cancelled, url=unlisted['registrationUrl'])
        cases = (
            ('one exact cancellation', script(cancelled), True),
            ('duplicate equivalent blocks', script(cancelled) + script(cancelled), True),
            ('different port', script(different_origin), False),
            ('userinfo', script(userinfo_url), False),
            ('different path parameters', script(path_parameters), False),
            ('conflicting objects', script(cancelled) + script(support.PAGE), False),
            ('conflicting event in a node array', script(cancelled) + script([support.PAGE]), False),
            ('conflicting event in graph', script(cancelled) + script({'@graph': [support.PAGE]}), False),
            ('conflicting expanded event type', script(cancelled) + script({
                '@graph': [dict(support.PAGE, **{'@type': ['https://schema.org/Event']})],
            }), False),
            ('equivalent graph serialization', script(cancelled) + script({
                '@graph': [dict(cancelled, **{'@type': ['Event', 'Thing']})],
            }), True),

            ('reverse conflicting objects', script(support.PAGE) + script(cancelled), False),
            ('conflicting direct keys', conflicting_status, False),
            ('other event before matching event', script(other_event) + script(cancelled), False),
        )
        for label, page, valid in cases:
            with self.subTest(case=label):
                table = support.FakeTable([community, listed, unlisted])
                before = copy.deepcopy(table.existing)
                invocations = []
                boto3 = support.fake_boto3(table, invocations)
                output = StringIO()
                replies = {
                    support.GROUP['url'] + 'events/ical/': support.ICAL,
                    support.EVENT_URL: page,
                }
                with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                        patch.dict(os.environ, {
                            'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                        }), \
                        patch.object(meetup, 'get_text', side_effect=lambda url, **_: replies[url]) as fetch, \
                        redirect_stdout(output):
                    if valid:
                        result = meetup.lambda_handler({}, support.lambda_context())
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                            meetup.lambda_handler({}, support.lambda_context())

                self.assertEqual([call.args[0] for call in fetch.call_args_list], list(replies))
                if valid:
                    self.assertEqual((result['changed'], result['failures']), (2, []))
                    self.assertFalse(table.existing[listed['id']]['published'])
                    self.assertFalse(table.existing[unlisted['id']]['published'])
                    self.assertEqual(len(invocations), 1)
                else:
                    result = json.loads(output.getvalue())
                    self.assertEqual(result['changed'], 0)
                    self.assertTrue(result['failures'])
                    self.assertEqual(table.existing, before)
                    self.assertEqual(table.updates, [])
                    self.assertEqual(invocations, [])

    def test_unrelated_json_ld_can_coexist_with_the_event(self):
        page = script({'@type': 'BreadcrumbList', 'itemListElement': []}) + script([]) + script(support.PAGE)
        self.assertEqual(meetup.parse_event_page(page, support.EVENT_URL), support.PAGE)

    def test_malformed_stored_decision_flags_withhold_absence_but_allow_owned_cancellation(self):
        source = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'meetupSourceUrl': support.GROUP['url'],
            'country': 'CO', 'kind': 'community', 'published': True,
        }
        starts_at, ends_at = support.EVENT_DATES['future']
        listed = support.existing_event(starts_at=starts_at, ends_at=ends_at)
        absent = dict(listed, id='meetup-event-457',
                      registrationUrl=support.EVENT_URL.replace('/456/', '/457/'))
        unclassified = dict(listed, id='meetup-event-458',
                            registrationUrl=support.EVENT_URL.replace('/456/', '/458/'))
        for changes in ({'autoSync': 'false'}, {'published': 'true'},
                        {'approvalRevoked': 'false'}):
            with self.subTest(changes=changes):
                suspect = dict(unclassified, **changes)
                table = support.FakeTable([source, listed, absent, suspect])
                invocations = []
                boto3 = support.fake_boto3(table, invocations)
                output = StringIO()
                with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                        patch.dict(os.environ, {
                            'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                        }), \
                        patch.object(meetup, 'get_text', return_value=support.CANCELLED_ICAL) as provider, \
                        redirect_stdout(output):
                    with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                        meetup.lambda_handler({}, support.lambda_context())

                result = json.loads(output.getvalue())
                self.assertEqual(result['changed'], 1)
                self.assertFalse(result['metrics']['sharedScanComplete'])
                self.assertTrue(any(suspect['id'] in text for text in result['failures']))
                self.assertFalse(table.existing[listed['id']]['published'])
                self.assertEqual(table.existing[absent['id']], absent)
                self.assertEqual(table.existing[suspect['id']], suspect)
                self.assertEqual([update['Key']['id'] for update in table.updates], [listed['id']])
                self.assertEqual(len(invocations), 1)
                self.assertEqual(provider.call_count, 1)
