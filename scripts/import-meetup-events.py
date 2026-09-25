#!/usr/bin/env python3
"""Import current public Meetup events from the reviewed community groups.

The group iCalendar feed is the supported source of upcoming event IDs. The
public event page supplies structured Event data for time zone offsets, mode,
and venue. Existing DynamoDB IDs are preserved by conditional writes.
"""

import argparse
from hashlib import sha256
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import as_completed
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
import json
import re
import os
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ACCOUNT_ID = '719535286359'
TABLE_NAME = 'donde-aprendo-aws-catalog'
MEETUP_HOST = 'www.meetup.com'


class JsonLdScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.buffer = ''
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('type') == 'application/ld+json':
            self.active = True
            self.buffer = ''

    def handle_data(self, data):
        if self.active:
            self.buffer += data

    def handle_endtag(self, tag):
        if tag == 'script' and self.active:
            self.scripts.append(self.buffer)
            self.active = False


def get_text(url):
    request = Request(url, headers={'User-Agent': 'DondeAprendoAWS/1.0 (+https://dondeaprendoaws.com/)'})
    with urlopen(request, timeout=20) as response:
        final_url = urlparse(response.url)
        if final_url.scheme != 'https' or final_url.hostname != MEETUP_HOST:
            raise ValueError(f'Meetup request redirected to another host: {url}')
        contents = response.read(2_000_001)
        if len(contents) > 2_000_000:
            raise ValueError(f'Meetup response too large: {url}')
        return contents.decode('utf-8')


def group_feed_url(group):
    url = urlparse(group['url'])
    if url.scheme != 'https' or url.hostname != MEETUP_HOST or not re.fullmatch(r'/[A-Za-z0-9_-]+/?', url.path):
        raise ValueError(f'Unsafe Meetup group URL: {group["id"]}')
    return f'https://{MEETUP_HOST}{url.path.rstrip("/")}/events/ical/'


def unfold_ical(text):
    lines = []
    for line in text.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        if line.startswith((' ', '\t')) and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    return lines


def parse_feed(text, group):
    lines = unfold_ical(text)
    if not lines or lines[0] != 'BEGIN:VCALENDAR' or 'END:VCALENDAR' not in lines:
        raise ValueError(f'Invalid iCalendar feed for {group["id"]}')
    events = []
    current = None
    for line in lines:
        if line == 'BEGIN:VEVENT':
            current = {}
        elif line == 'END:VEVENT' and current is not None:
            uid = current.get('UID', '')
            match = re.fullmatch(r'event_(\d+)@meetup\.com', uid)
            url = current.get('URL', '')
            parsed = urlparse(url)
            expected_slug = urlparse(group['url']).path.strip('/')
            if not match or parsed.scheme != 'https' or parsed.hostname != MEETUP_HOST \
                    or not re.fullmatch(rf'/{re.escape(expected_slug)}/events/{match.group(1)}/?', parsed.path, re.I):
                raise ValueError(f'Invalid Meetup event in feed of {group["id"]}')
            if current.get('STATUS') != 'CANCELLED':
                modified = current.get('LAST-MODIFIED') or sha256(
                    json.dumps(current, sort_keys=True).encode('utf-8')).hexdigest()
                events.append({'id': match.group(1), 'url': url, 'modified': modified})
            current = None
        elif current is not None and ':' in line:
            key, value = line.split(':', 1)
            current[key.split(';', 1)[0]] = value
    return events


def parse_event_page(text, expected_url):
    parser = JsonLdScripts()
    parser.feed(text)
    for script in parser.scripts:
        try:
            data = json.loads(script)
        except json.JSONDecodeError:
            continue
        if data.get('@type') == 'Event':
            actual = urlparse(data.get('url', ''))
            expected = urlparse(expected_url)
            if (actual.scheme, actual.hostname, actual.path.rstrip('/')) != \
                    (expected.scheme, expected.hostname, expected.path.rstrip('/')):
                raise ValueError(f'Event page URL mismatch: {expected_url}')
            return data
    raise ValueError(f'No structured Event found: {expected_url}')


def clean_description(value):
    text = re.sub(r'<[^>]*>', ' ', value or '')
    text = re.sub(r'\[([^]]+)\]\([^)]+\)', r'\1', text)
    text = re.sub(r'[*_#`]+', '', unescape(text))
    text = ' '.join(text.split())
    if not text:
        return 'Encuentro de la comunidad AWS. Consulta los detalles e inscripción en Meetup.'
    return text[:240].rstrip()


def map_event(group, entry, page):
    if page.get('eventStatus') not in ('https://schema.org/EventScheduled',
                                       'https://schema.org/EventRescheduled'):
        return None
    start = datetime.fromisoformat(page['startDate'])
    end = datetime.fromisoformat(page['endDate'])
    if start.tzinfo is None or end.tzinfo is None or end <= start:
        raise ValueError(f'Invalid event dates: {entry["id"]}')
    if end <= datetime.now(timezone.utc):
        return None
    attendance = page.get('eventAttendanceMode', '')
    mode = {
        'https://schema.org/OnlineEventAttendanceMode': 'online',
        'https://schema.org/OfflineEventAttendanceMode': 'in-person',
        'https://schema.org/MixedEventAttendanceMode': 'hybrid',
    }.get(attendance)
    if mode is None:
        raise ValueError(f'Unknown event mode: {entry["id"]}')
    location = page.get('location') or {}
    if isinstance(location, list):
        location = next((item for item in location if item.get('@type') == 'Place'), {})
    address = location.get('address') or {}
    place = ', '.join(dict.fromkeys(part.strip() for part in [
        location.get('name') or '', address.get('streetAddress') or '',
    ] if isinstance(part, str) and part.strip()))
    record = {
        'recordType': 'event',
        'id': f'meetup-event-{entry["id"]}',
        'title': page['name'].strip(),
        'description': clean_description(page.get('description')),
        'startsAt': start.isoformat(timespec='seconds'),
        'endsAt': end.isoformat(timespec='seconds'),
        'timeZone': group['timeZone'],
        'organizer': group['name'],
        'mode': mode,
        'registrationUrl': entry['url'],
        'country': group['country'],
        'published': True,
        'sourceGroupId': f'meetup-{group["id"]}',
        'sourceModifiedAt': entry['modified'],
        'autoSync': True,
    }
    if mode != 'online':
        record['place'] = place or 'Consulta el lugar en Meetup'
    return record


def load_groups_from_file(path):
    with open(path, encoding='utf-8') as file:
        directory = json.load(file)
    return [{'id': item['id'], 'url': item['url'], 'name': item['name'], 'country': item['country'],
             'timeZone': None} for item in directory['groups']]


def load_groups_from_dynamodb(table):
    groups = []
    params = {'ProjectionExpression': '#id,#title,#url,#country,#kind,published',
              'Select': 'SPECIFIC_ATTRIBUTES',
              'ExpressionAttributeNames': {'#id': 'id', '#title': 'title', '#url': 'url',
                                           '#country': 'country', '#kind': 'kind'}}
    while True:
        page = table.scan(**params)
        for item in page['Items']:
            if item.get('id', '').startswith('meetup-') and item.get('kind') == 'community' and item.get('published') is True:
                groups.append({'id': item['id'][7:], 'url': item['url'], 'name': item['title'],
                               'country': item['country'], 'timeZone': None})
        if 'LastEvaluatedKey' not in page:
            break
        params['ExclusiveStartKey'] = page['LastEvaluatedKey']
    return groups


def timezone_from_feed(group):
    text = get_text(group_feed_url(group))
    events = parse_feed(text, group)
    match = re.search(r'^TZID:([^\r\n]+)', text, re.M)
    if events and not match:
        raise ValueError(f'Missing timezone in feed of {group["id"]}')
    group['timeZone'] = match.group(1) if match else None
    if group['timeZone']:
        ZoneInfo(group['timeZone'])
    return events


def fetch_event_page(entry):
    return parse_event_page(get_text(entry['url']), entry['url'])


def load_existing_events(table):
    events = {}
    params = {
        'ProjectionExpression': '#id,#sourceGroupId,#sourceModifiedAt,#published,#autoSync,#country,#organizer',
        'Select': 'SPECIFIC_ATTRIBUTES',
        'ExpressionAttributeNames': {
            '#id': 'id', '#sourceGroupId': 'sourceGroupId', '#sourceModifiedAt': 'sourceModifiedAt',
            '#published': 'published', '#autoSync': 'autoSync', '#country': 'country', '#organizer': 'organizer',
        },
    }
    while True:
        page = table.scan(**params)
        for item in page['Items']:
            if item.get('id', '').startswith('meetup-event-'):
                events[item['id']] = item
        if 'LastEvaluatedKey' not in page:
            break
        params['ExclusiveStartKey'] = page['LastEvaluatedKey']
    return events


def update_source_event(table, record, existing):
    if existing is None:
        try:
            table.put_item(Item=record, ConditionExpression='attribute_not_exists(#id)',
                           ExpressionAttributeNames={'#id': 'id'})
            return True
        except Exception as error:
            if getattr(error, 'response', {}).get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
                return False
            raise
    if existing.get('autoSync') is False:
        return False
    fields = [(key, value) for key, value in record.items() if key != 'id']
    names = {'#id': 'id', '#owner': 'sourceGroupId', '#sync': 'autoSync'}
    values = {':owner': record['sourceGroupId'], ':enabled': True}
    changes = []
    for index, (key, value) in enumerate(fields):
        alias = f'#f{index}'
        parameter = f':v{index}'
        names[alias] = key
        values[parameter] = value
        changes.append(f'{alias} = {parameter}')
    try:
        table.update_item(Key={'id': record['id']}, UpdateExpression='SET ' + ', '.join(changes),
                          ConditionExpression='attribute_exists(#id) AND #owner = :owner '
                                              'AND (attribute_not_exists(#sync) OR #sync = :enabled)',
                          ExpressionAttributeNames=names, ExpressionAttributeValues=values)
        return True
    except Exception as error:
        if getattr(error, 'response', {}).get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            return False
        raise


def unpublish_source_event(table, existing):
    if not existing.get('sourceGroupId') or existing.get('autoSync') is False or existing.get('published') is not True:
        return False
    try:
        table.update_item(Key={'id': existing['id']},
                          UpdateExpression='SET #published = :false',
                          ConditionExpression='#published = :true AND #sync = :true AND #owner = :owner',
                          ExpressionAttributeNames={'#published': 'published', '#sync': 'autoSync',
                                                    '#owner': 'sourceGroupId'},
                          ExpressionAttributeValues={':false': False, ':true': True,
                                                     ':owner': existing['sourceGroupId']})
        return True
    except Exception as error:
        if getattr(error, 'response', {}).get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            return False
        raise


def synchronize(table=None, groups=None, dry_run=False):
    """Sync public events. A failed feed never retracts that group's prior events."""
    if groups is None:
        groups = load_groups_from_dynamodb(table)
    if not groups:
        raise RuntimeError('No approved Meetup communities found')
    existing = load_existing_events(table) if table is not None else {}
    active_group_ids = {f'meetup-{group["id"]}' for group in groups}
    feeds = {}
    failures = []
    failed_group_ids = set()
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(timezone_from_feed, group): group for group in groups}
        for future in as_completed(futures):
            group = futures[future]
            try:
                feeds[group['id']] = (group, future.result())
            except Exception as error:
                failures.append(f'Feed {group["id"]}: {error}')
                failed_group_ids.add(group['id'])

    pending = []
    seen = set()
    for group, entries in sorted(feeds.values(), key=lambda item: item[0]['id']):
        for entry in entries:
            record_id = f'meetup-event-{entry["id"]}'
            if record_id in seen:
                continue
            seen.add(record_id)
            prior = existing.get(record_id)
            if prior and prior.get('autoSync') is False:
                continue
            if (prior and prior.get('published') is True and prior.get('sourceModifiedAt') == entry['modified']
                    and prior.get('country') == group['country'] and prior.get('organizer') == group['name']):
                continue
            pending.append((group, entry, prior))

    records = []
    cancelled = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(fetch_event_page, entry): (group, entry, prior)
                   for group, entry, prior in pending}
        for future in as_completed(futures):
            group, entry, prior = futures[future]
            try:
                record = map_event(group, entry, future.result())
                if record is not None:
                    records.append((record, prior))
                elif prior is not None:
                    cancelled.append(prior)
            except Exception as error:
                failures.append(f'Event {entry["id"]} in group {group["id"]}: {error}')
                failed_group_ids.add(group['id'])

    changed = 0
    skipped = 0
    if not dry_run and table is not None:
        for record, prior in records:
            if update_source_event(table, record, prior):
                changed += 1
            else:
                skipped += 1
        for prior in cancelled:
            if unpublish_source_event(table, prior):
                changed += 1
        for prior in existing.values():
            source = prior.get('sourceGroupId', '')
            group_id = source.removeprefix('meetup-')
            if prior['id'] not in seen and (source not in active_group_ids or
                                            group_id in feeds and group_id not in failed_group_ids):
                if unpublish_source_event(table, prior):
                    changed += 1
    return {'groups': len(groups), 'feedsRead': len(feeds), 'upcomingEvents': len(seen),
            'changed': changed, 'skipped': skipped, 'failures': failures, 'dryRun': dry_run}


def lambda_handler(_event, _context):
    import boto3
    if boto3.client('sts').get_caller_identity()['Account'] != ACCOUNT_ID:
        raise RuntimeError('Wrong AWS account for Meetup synchronization')
    table = boto3.resource('dynamodb', region_name='us-east-1').Table(os.environ['CATALOG_TABLE'])
    result = synchronize(table=table)
    if result['changed']:
        boto3.client('lambda', region_name='us-east-1').invoke(
            FunctionName=os.environ['PUBLICATION_FUNCTION'], InvocationType='Event', Payload=b'{}')
    print(json.dumps(result))
    if result['failures']:
        raise RuntimeError(f'{len(result["failures"])} Meetup sources failed; successful sources were synchronized')
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--source-file', default='data/meetup-communities.json')
    parser.add_argument('--table', default=TABLE_NAME)
    args = parser.parse_args()

    table = None
    if args.dry_run:
        groups = load_groups_from_file(args.source_file)
    else:
        import boto3
        identity = boto3.client('sts').get_caller_identity()
        if identity['Account'] != ACCOUNT_ID:
            raise RuntimeError(f'Wrong AWS account: {identity["Account"]}')
        table = boto3.resource('dynamodb', region_name='us-east-1').Table(args.table)
        groups = load_groups_from_dynamodb(table)
    if not groups:
        raise RuntimeError('No approved Meetup communities found')
    result = synchronize(table=table, groups=groups, dry_run=args.dry_run)
    print(json.dumps(result))
    if result['failures']:
        raise RuntimeError(f'{len(result["failures"])} Meetup sources failed')


if __name__ == '__main__':
    main()
