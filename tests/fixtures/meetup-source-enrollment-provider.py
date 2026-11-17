"""Small isolated DynamoDB provider for the cross-runtime Meetup acceptance test."""
import copy
import importlib.util
import json
import pathlib
import sys
from urllib.parse import urlparse


ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / 'scripts' / 'import-meetup-events.py'
spec = importlib.util.spec_from_file_location('meetup_events_enrollment_acceptance', MODULE_PATH)
meetup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(meetup)

TARGET_GROUP_URL = 'https://www.meetup.com/aws-girls-argentina/'
SIBLING_GROUP_URL = (
    'https://www.meetup.com/aws-sbg-at-metropolitan-technological-univ-macul-campus/'
)
TARGET_FEED_URL = f'{TARGET_GROUP_URL}events/ical/'
SIBLING_FEED_URL = f'{SIBLING_GROUP_URL}events/ical/'
TARGET_PROTECTED_EVENT_URL = f'{TARGET_GROUP_URL}events/316882965/'
TARGET_NEW_EVENT_URL = f'{TARGET_GROUP_URL}events/316882966/'
SIBLING_NEW_EVENT_URL = f'{SIBLING_GROUP_URL}events/382663761/'

FEED_EVENTS = {
    TARGET_FEED_URL: (
        ('316882965', TARGET_PROTECTED_EVENT_URL),
        ('316882966', TARGET_NEW_EVENT_URL),
    ),
    SIBLING_FEED_URL: (('382663761', SIBLING_NEW_EVENT_URL),),
}

EVENT_PAGES = {
    TARGET_NEW_EVENT_URL: {
        '@type': 'Event', 'name': 'Encuentro nuevo de AWS Girls',
        'url': TARGET_NEW_EVENT_URL, 'description': 'Nuevo encuentro de prueba.',
        'startDate': '2099-01-01T19:00:00-03:00', 'endDate': '2099-01-01T21:00:00-03:00',
        'eventStatus': 'https://schema.org/EventScheduled',
        'eventAttendanceMode': 'https://schema.org/OnlineEventAttendanceMode',
    },
    SIBLING_NEW_EVENT_URL: {
        '@type': 'Event', 'name': 'Encuentro nuevo del grupo vecino',
        'url': SIBLING_NEW_EVENT_URL, 'description': 'Nuevo encuentro de grupo vecino.',
        'startDate': '2099-02-01T19:00:00-03:00', 'endDate': '2099-02-01T21:00:00-03:00',
        'eventStatus': 'https://schema.org/EventScheduled',
        'eventAttendanceMode': 'https://schema.org/OnlineEventAttendanceMode',
    },
}


def projected(item, params):
    names = params.get('ExpressionAttributeNames', {})
    fields = [names.get(token.strip(), token.strip())
              for token in params['ProjectionExpression'].split(',')]
    return {field: copy.deepcopy(item[field]) for field in fields if field in item}


class ConditionalFailure(RuntimeError):
    def __init__(self):
        super().__init__('conditional transaction failed')
        self.response = {'Error': {'Code': 'TransactionCanceledException'},
                         'CancellationReasons': [{'Code': 'ConditionalCheckFailed'}]}


class IsolatedDynamoProvider:
    """Model the DocumentClient resource boundary used by the production sync."""

    def __init__(self, rows):
        self.rows = {row['id']: copy.deepcopy(row) for row in rows}
        self.name = 'catalog-test'
        self.scans = []
        self.gets = []
        self.transactions = []
        self.meta = type('Meta', (), {})()
        self.meta.client = type('Client', (), {'transact_write_items': self.transact_write_items})()

    def scan(self, **params):
        self.scans.append(copy.deepcopy(params))
        return {'Items': [projected(item, params) for item in self.rows.values()]}

    def get_item(self, **params):
        self.gets.append(copy.deepcopy(params))
        item = self.rows.get(params['Key']['id'])
        return {} if item is None else {'Item': projected(item, params)}

    def transact_write_items(self, *, TransactItems):
        actions = copy.deepcopy(TransactItems)
        self.transactions.append(actions)
        if any(set(action) != {'Put'} for action in actions):
            raise AssertionError('this scenario expects the production sync to create new events only')
        for action in actions:
            operation = action['Put']
            item_id = operation['Item']['id']
            expression = operation.get('ConditionExpression', '')
            if 'attribute_not_exists' in expression and item_id in self.rows:
                raise ConditionalFailure()
        for action in actions:
            item = copy.deepcopy(action['Put']['Item'])
            self.rows[item['id']] = item


def feed_text(url):
    entries = FEED_EVENTS[url]
    time_zone = 'America/Argentina/Cordoba' if url == TARGET_FEED_URL else 'America/Santiago'
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', f'TZID:{time_zone}']
    for event_id, event_url in entries:
        lines.extend([
            'BEGIN:VEVENT', f'UID:event_{event_id}@meetup.com',
            f'URL;VALUE=URI:{event_url}', 'LAST-MODIFIED:20990101T000000Z',
            'STATUS:CONFIRMED', 'END:VEVENT',
        ])
    lines.append('END:VCALENDAR')
    return '\r\n'.join(lines) + '\r\n'


def main():
    payload = json.load(sys.stdin)
    table = IsolatedDynamoProvider(payload['rows'])
    if payload.get('observeInventory'):
        inventory = meetup.read_source_inventory(table)
        print(json.dumps({
            'groups': sorted(group['id'] for group in inventory.groups),
            'unresolvedIds': sorted(inventory.unresolved_ids),
            'withholdRetractions': inventory.withhold_retractions,
            'failures': inventory.failures,
        }))
        return
    requests = []

    def fixture_get_text(url, budget=None):
        requests.append(url)
        if url in FEED_EVENTS:
            return feed_text(url)
        page = EVENT_PAGES.get(url)
        if page is not None:
            return '<script type="application/ld+json">' + json.dumps(page) + '</script>'
        parsed = urlparse(url)
        raise AssertionError(f'unexpected exterior request: {parsed.scheme}://{parsed.netloc}{parsed.path}')

    original_get_text = meetup.get_text
    meetup.get_text = fixture_get_text
    try:
        result = meetup.synchronize(table=table)
    finally:
        meetup.get_text = original_get_text

    source_scans = [params for params in table.scans
                    if 'kind' in params.get('ExpressionAttributeNames', {}).values()]
    event_scans = [params for params in table.scans
                   if {'recordType', 'version', 'approvalRevoked'}
                   <= set(params.get('ExpressionAttributeNames', {}).values())]
    print(json.dumps({
        'result': result,
        'requests': sorted(requests),
        'feedRequests': sorted(url for url in requests if url.endswith('/events/ical/')),
        'pageRequests': sorted(url for url in requests if not url.endswith('/events/ical/')),
        'sourceScans': source_scans,
        'eventScans': event_scans,
        'transactions': table.transactions,
        'events': sorted((copy.deepcopy(item) for item in table.rows.values()
                          if item.get('recordType') == 'event'), key=lambda item: item['id']),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
