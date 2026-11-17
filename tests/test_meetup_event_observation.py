"""The Meetup detail response supplies only one unambiguous event observation."""

import copy
import json
import os
import sys
import unittest
from contextlib import redirect_stdout
from decimal import Decimal
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
            ('empty userinfo', script(dict(cancelled, url=support.EVENT_URL.replace('www.', '@www.'))), False),
            ('different path parameters', script(path_parameters), False),
            ('conflicting objects', script(cancelled) + script(support.PAGE), False),
            ('conflicting event in a node array', script(cancelled) + script([support.PAGE]), False),
            ('conflicting event in graph', script(cancelled) + script({'@graph': [support.PAGE]}), False),
            ('truncated peer Event node',
             script(cancelled) + script(support.PAGE).replace('}</script>', '</script>'), False),
            ('truncated peer Event graph',
             script(cancelled) + script({'@graph': [support.PAGE]}).replace('}</script>', '</script>'), False),
            ('declared Event block without closing tag',
             script(cancelled) + script(support.PAGE).removesuffix('</script>'), False),
            ('non-finite value in declared data',
             script(cancelled) + script({'@type': 'Thing', 'amount': float('nan')}), False),
            ('alternate content type case and charset', script(cancelled) + script(support.PAGE).replace(
                'application/ld+json', 'Application/LD+JSON; charset=UTF-8'), False),
            ('conflicting included event', script(cancelled) + script({'@included': [support.PAGE]}), False),
            ('conflicting expanded event type', script(cancelled) + script({
                '@graph': [dict(support.PAGE, **{'@type': ['https://schema.org/Event']})],
            }), False),
            ('invalid Event type array', script(dict(cancelled, **{'@type': ['Event', 7]})), False),
            ('invalid Event type object', script(dict(cancelled, **{'@type': ['Event', {}]})), False),
            ('nested Event type array', script(dict(cancelled, **{'@type': ['Event', ['Thing']]})), False),
            ('blank Event type', script(dict(cancelled, **{'@type': ['Event', ' ']})), False),
            ('invalid graph node', script(cancelled) + script({'@graph': [False]}), False),
            ('invalid included node', script(cancelled) + script({'@included': 7}), False),
            ('invalid Event @id', script(dict(cancelled, **{'@id': {}})), False),
            ('Event URL contradicts its explicit identity', script(dict(cancelled, **{
                '@id': support.EVENT_URL.replace('/456/', '/457/'),
            })), False),
            ('matching Event identity with a fragment', script(dict(cancelled, **{
                '@id': support.EVENT_URL + '#event', '@context': 'https://schema.org',
            })), True),
            ('relative fragment identifies the same Event', script(dict(cancelled, **{
                '@id': '#event', '@context': {'@vocab': 'https://schema.org/'},
            })), True),
            ('invalid context declaration', script(dict(cancelled, **{'@context': 42})), False),
            ('context changing what Event means', script(dict(cancelled, **{
                '@context': {'Event': 'https://schema.org/Organization'},
            })), False),
            ('ancestor context changing what eventStatus means', script({
                '@context': {'eventStatus': 'https://schema.org/description'}, '@graph': [cancelled],
            }), False),
            ('expanded status contradicts the literal event status', script(dict(cancelled, **{
                '@context': 'https://schema.org',
                '@id': support.EVENT_URL + '#event',
                'https://schema.org/eventStatus': support.PAGE['eventStatus'],
            })), False),
            ('prefixed URL contradicts the literal event URL', script(dict(cancelled, **{
                '@context': {'schema': 'https://schema.org/'},
                'schema:url': support.EVENT_URL.replace('/456/', '/457/'),
            })), False),
            ('nested event facts are outside the admitted shape', script(dict(cancelled, **{
                '@context': 'https://schema.org',
                '@id': '#event',
                '@nest': {'eventStatus': support.PAGE['eventStatus']},
            })), False),
            ('same-id fragment declares a conflicting status',
             script(dict(cancelled, **{'@id': '#event'})) + script({
                 '@id': '#event', 'eventStatus': support.PAGE['eventStatus'],
             }), False),
            ('conflicting Event in structured page mainEntity',
             script(cancelled) + script({'@type': 'WebPage', 'mainEntity': support.PAGE}), False),
            ('same Event identity declares a different URL without a type',
             script({'@context': 'https://schema.org', '@graph': [
                 dict(cancelled, **{'@id': '#event'}), {
                     '@id': support.EVENT_URL + '#event',
                     'url': support.EVENT_URL.replace('/456/', '/457/'),
                 },
             ]}), False),
            ('matching partial duplicate Event identity and facts',
             script({'@context': 'https://schema.org', '@graph': [
                 dict(cancelled, **{'@id': '#event'}), {
                     '@id': support.EVENT_URL + '#event', 'url': support.EVENT_URL,
                     'eventStatus': support.EVENT_CANCELLED,
                 },
             ]}), True),
            ('relative fragment conflicts before the typed Event',
             script({'@id': './#event', 'url': unlisted['registrationUrl']})
             + script(dict(cancelled, **{'@id': '#event'})), False),
            ('alternate URL in a fragment cannot bypass the direct fact check',
             script(dict(cancelled, **{'@id': '#event'})) + script({
                 '@id': '#event', 'https://schema.org/url': unlisted['registrationUrl'],
             }), False),
            ('prefix-only context does not establish the vocabulary of bare Event',
             script(dict(cancelled, **{'@context': {'schema': 'https://schema.org/'}})), False),
            ('expanded Event type does not establish the vocabulary of bare facts',
             script(dict(cancelled, **{'@type': 'https://schema.org/Event',
                                       '@context': {'schema': 'https://schema.org/'}})), False),
            ('known Event vocabulary is inherited through a prefix declaration',
             script({'@context': {'@vocab': 'https://schema.org/'}, '@graph': [
                 dict(cancelled, **{'@type': 'schema:Event', '@context': {'schema': 'https://schema.org/'}}),
             ]}), True),
            ('typed and untyped status fragments inside structured graph',
             script({'@graph': [dict(cancelled, **{'@id': '#event'}), {
                 '@id': '#event', 'https://schema.org/eventStatus': support.PAGE['eventStatus'],
             }]}), False),
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

    def test_repeated_source_observations_require_the_same_typed_flags(self):
        source = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'meetupSourceUrl': support.GROUP['url'],
            'country': 'CO', 'kind': 'community', 'published': True, 'approvalRevoked': False,
        }
        starts_at, ends_at = support.EVENT_DATES['future']
        prior = support.existing_event(starts_at=starts_at, ends_at=ends_at)
        for replacement in ({}, {'published': Decimal('1')}, {'approvalRevoked': Decimal('0')}):
            with self.subTest(replacement=replacement):
                table = support.FakeTable([source, prior])
                table.scan_responses = [
                    {'Items': [source], 'LastEvaluatedKey': {'id': source['id']}},
                    {'Items': [dict(source, **replacement)]},
                ]
                invocations = []
                boto3 = support.fake_boto3(table, invocations)
                output = StringIO()
                with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                        patch.dict(os.environ, {
                            'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                        }), \
                        patch.object(meetup, 'get_text', return_value=support.EMPTY_ICAL) as provider, \
                        redirect_stdout(output):
                    if replacement:
                        with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                            meetup.lambda_handler({}, support.lambda_context())
                    else:
                        result = meetup.lambda_handler({}, support.lambda_context())

                if replacement:
                    result = json.loads(output.getvalue())
                    self.assertEqual(result['changed'], 0)
                    self.assertFalse(result['metrics']['sharedScanComplete'])
                    self.assertTrue(any(source['id'] in text for text in result['failures']))
                    self.assertEqual(table.existing[prior['id']], prior)
                    self.assertEqual(table.updates, [])
                    self.assertEqual(invocations, [])
                    provider.assert_not_called()
                else:
                    self.assertEqual((result['changed'], result['failures']), (1, []))
                    self.assertFalse(table.existing[prior['id']]['published'])
                    self.assertEqual(len(invocations), 1)
                    self.assertEqual(provider.call_count, 1)

    def test_every_catalog_scan_requires_a_real_cursor_before_it_can_prove_absence(self):
        source = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'meetupSourceUrl': support.GROUP['url'],
            'country': 'CO', 'kind': 'community', 'published': True,
        }
        starts_at, ends_at = support.EVENT_DATES['future']
        listed = support.existing_event(starts_at=starts_at, ends_at=ends_at)
        absent = dict(listed, id='meetup-event-457',
                      registrationUrl=support.EVENT_URL.replace('/456/', '/457/'))
        for scan in ('sources', 'events'):
            with self.subTest(scan=scan):
                table = support.FakeTable([source, listed, absent])
                source_rows, event_rows = [source], copy.deepcopy([listed, absent])
                bad_cursor = {'wrong-key': 'value'}
                table.scan_responses = [
                    {'Items': source_rows, 'LastEvaluatedKey': bad_cursor},
                    {'Items': event_rows},
                ] if scan == 'sources' else [
                    {'Items': source_rows},
                    {'Items': event_rows, 'LastEvaluatedKey': bad_cursor},
                    {'Items': []},
                ]
                invocations = []
                boto3 = support.fake_boto3(table, invocations)
                output = StringIO()
                with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                        patch.dict(os.environ, {
                            'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                        }), \
                        patch.object(table, 'scan', wraps=table.scan) as scan_call, \
                        patch.object(meetup, 'get_text', return_value=support.CANCELLED_ICAL), \
                        redirect_stdout(output):
                    with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                        meetup.lambda_handler({}, support.lambda_context())

                result = json.loads(output.getvalue())
                self.assertFalse(result['metrics']['sharedScanComplete'])
                self.assertTrue(any('LastEvaluatedKey' in text for text in result['failures']))
                self.assertEqual(result['changed'], 1)
                self.assertFalse(table.existing[listed['id']]['published'])
                self.assertEqual(table.existing[absent['id']], absent)
                self.assertEqual(len(invocations), 1)
                self.assertTrue(all('ExclusiveStartKey' not in call.kwargs for call in scan_call.call_args_list))
