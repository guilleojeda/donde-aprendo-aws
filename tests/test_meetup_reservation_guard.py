import copy
import re
import unittest

import test_meetup_events as support


class GuardedReservationTable(support.FakeTable):
    @staticmethod
    def condition_holds(request, item):
        # The existing fake handles equality and the legacy-version OR guard.
        # Also enforce standalone absence conditions on the transaction image.
        if not support.FakeTable.condition_holds(request, item):
            return False
        expression = request.get('ConditionExpression', '')
        aliases = request.get('ExpressionAttributeNames', {})
        return all(aliases[alias] not in item for alias in re.findall(
            r'attribute_not_exists\((#\w+)\)(?!\s+OR\b)', expression))


class MeetupReservationGuardTests(unittest.TestCase):
    def test_url_move_cannot_remove_a_reservation_that_changed_after_its_read(self):
        for collision, mutation in (
            (False, {'recordType': 'unrelated'}),
            (False, {'resourceIds': ['legacy-other', 'legacy-third']}),
            (True, {'resourceId': 'legacy-other'}),
        ):
            with self.subTest(collision=collision, mutation=mutation):
                prior, record = support.MeetupUpdateTransportTests.records(moved=True)
                old = support.MeetupUpdateTransportTests.reservation(prior['registrationUrl'], prior['id'])
                rows = [prior, old]
                if collision:
                    old.pop('resourceId')
                    old.update(status='collision', resourceIds=[prior['id'], 'legacy-other'])
                    rows.append({'id': 'legacy-other', 'url': prior['registrationUrl']})
                table = GuardedReservationTable(rows)
                expected = copy.deepcopy(table.existing)
                expected[old['id']].update(mutation)

                def intervene(items, _actions):
                    items[old['id']].update(mutation)

                table.before_transact = intervene
                failure = None
                try:
                    support.meetup.update_source_event(table, record, prior)
                except RuntimeError as error:
                    failure = error

                self.assertEqual(table.existing, expected,
                                 'conditional failure preserves every row, including the displaced observation')
                self.assertIsNotNone(failure, 'the freshly observed malformed reservation is reported')
                self.assertRegex(str(failure), r'(?i)reservation')
                self.assertEqual(len(table.transactions), 1, 'only the initially valid observation entered a write')
