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

# These are the fields owned by the Meetup synchronizer.  Keeping the list
# explicit makes the read projection and the equality check follow the same
# contract while leaving unrelated editor fields untouched.
SYNC_OWNED_FIELDS = (
    'recordType', 'title', 'description', 'startsAt', 'endsAt', 'timeZone',
    'organizer', 'mode', 'registrationUrl', 'country', 'communityId',
    'published', 'sourceGroupId', 'sourceModifiedAt', 'autoSync', 'place',
    'city', 'venueCountry',
)
OPTIONAL_SYNC_FIELDS = ('place', 'city', 'venueCountry')
PUBLISHABLE_EVENT_STATUSES = frozenset((
    'https://schema.org/EventScheduled',
    'https://schema.org/EventRescheduled',
))
NONPUBLISHABLE_EVENT_STATUSES = frozenset((
    'https://schema.org/EventCancelled',
    'https://schema.org/EventMovedOnline',
    'https://schema.org/EventPostponed',
))


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
    while lines and lines[-1] == '':
        lines.pop()
    if not lines or lines[0] != 'BEGIN:VCALENDAR' or lines[-1] != 'END:VCALENDAR':
        raise ValueError(f'Invalid iCalendar feed for {group["id"]}')
    events = []
    components = []
    calendar_seen = False
    current = None
    for line in lines:
        if line.startswith('BEGIN:'):
            component = line[len('BEGIN:'):]
            if not components:
                if line != 'BEGIN:VCALENDAR' or calendar_seen:
                    raise ValueError(f'Invalid iCalendar feed for {group["id"]}')
                calendar_seen = True
            elif component == 'VCALENDAR':
                raise ValueError(f'Invalid iCalendar feed for {group["id"]}')
            elif component == 'VEVENT':
                if components != ['VCALENDAR']:
                    raise ValueError(f'Invalid iCalendar feed for {group["id"]}')
                current = {}
            components.append(component)
        elif line.startswith('END:'):
            component = line[len('END:'):]
            if not components or components[-1] != component:
                raise ValueError(f'Invalid iCalendar feed for {group["id"]}')
            if component == 'VCALENDAR' and (components != ['VCALENDAR'] or current is not None):
                raise ValueError(f'Invalid iCalendar feed for {group["id"]}')
            if component == 'VEVENT':
                if components != ['VCALENDAR', 'VEVENT'] or current is None:
                    raise ValueError(f'Invalid iCalendar feed for {group["id"]}')
                uid = current.get('UID', '')
                match = re.fullmatch(r'event_(\d+)@meetup\.com', uid)
                url = current.get('URL', '')
                parsed = urlparse(url)
                expected_slug = urlparse(group['url']).path.strip('/')
                if not match or parsed.scheme != 'https' or parsed.hostname != MEETUP_HOST \
                        or not re.fullmatch(rf'/{re.escape(expected_slug)}/events/{match.group(1)}/?', parsed.path, re.I):
                    raise ValueError(f'Invalid Meetup event in feed of {group["id"]}')
                modified = current.get('LAST-MODIFIED') or sha256(
                    json.dumps(current, sort_keys=True).encode('utf-8')).hexdigest()
                event = {'id': match.group(1), 'url': url, 'modified': modified}
                if current.get('STATUS') == 'CANCELLED':
                    event['cancelled'] = True
                events.append(event)
                current = None
            components.pop()
        elif current is not None and ':' in line:
            key, value = line.split(':', 1)
            current[key.split(';', 1)[0]] = value
    if components or not calendar_seen:
        raise ValueError(f'Invalid iCalendar feed for {group["id"]}')
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


def venue_country_code(value, event_id):
    if value is None:
        return None
    if isinstance(value, str):
        candidates = [value]
        has_value = bool(value.strip())
    elif isinstance(value, dict):
        candidates = [value.get('identifier'), value.get('name')]
        has_candidate_value = any(candidate is not None and not (
            isinstance(candidate, str) and not candidate.strip()
        ) for candidate in candidates)
        country_type = value.get('@type')
        has_unknown_metadata = bool(set(value) - {'@type', 'identifier', 'name'})
        has_non_country_type = country_type not in (None, 'Country')
        has_value = has_candidate_value or has_unknown_metadata or has_non_country_type
    else:
        raise ValueError(f'Invalid address country for event {event_id}')

    for candidate in candidates:
        if isinstance(candidate, str):
            code = candidate.strip()
            if re.fullmatch(r'[A-Za-z]{2}', code, re.ASCII):
                return code.upper()
    if not has_value:
        return None
    raise ValueError(f'Invalid address country for event {event_id}')


def map_event(group, entry, page):
    event_status = page.get('eventStatus')
    if not isinstance(event_status, str):
        raise ValueError(f'Missing or invalid event status: {entry["id"]}')
    if event_status in NONPUBLISHABLE_EVENT_STATUSES:
        return None
    if event_status not in PUBLISHABLE_EVENT_STATUSES:
        raise ValueError(f'Unknown event status: {entry["id"]}')
    name = page.get('name')
    title = re.sub(r'^[\s\ufeff]+|[\s\ufeff]+$', '', name) if isinstance(name, str) else ''
    if not title:
        raise ValueError(f'Missing or invalid event title: {entry["id"]}')
    start = datetime.fromisoformat(page['startDate'])
    end = datetime.fromisoformat(page['endDate'])
    if start.tzinfo is None or end.tzinfo is None or end <= start:
        raise ValueError(f'Invalid event dates: {entry["id"]}')
    attendance = page.get('eventAttendanceMode', '')
    mode = {
        'https://schema.org/OnlineEventAttendanceMode': 'online',
        'https://schema.org/OfflineEventAttendanceMode': 'in-person',
        'https://schema.org/MixedEventAttendanceMode': 'hybrid',
    }.get(attendance)
    if mode is None:
        raise ValueError(f'Unknown event mode: {entry["id"]}')
    place = ''
    city = ''
    venue_country = None
    if mode != 'online':
        location = page.get('location') or {}
        if isinstance(location, list):
            location = next((item for item in location if item.get('@type') == 'Place'), {})
        address = location.get('address') or {}
        if not isinstance(address, dict):
            address = {}
        venue_country = venue_country_code(address.get('addressCountry'), entry['id'])
        place = ', '.join(dict.fromkeys(part.strip() for part in [
            location.get('name') or '', address.get('streetAddress') or '',
        ] if isinstance(part, str) and part.strip()))
        locality = address.get('addressLocality')
        city = locality.strip() if isinstance(locality, str) else ''
        if (len(city) > 100 or re.search(r'[\x00-\x1f\x7f]', city)
                or city.casefold() in {'tbd', 'to be determined', 'por definir', 'online', 'en línea'}):
            city = ''
    record = {
        'recordType': 'event',
        'id': f'meetup-event-{entry["id"]}',
        'title': title,
        'description': clean_description(page.get('description')),
        'startsAt': start.isoformat(timespec='seconds'),
        'endsAt': end.isoformat(timespec='seconds'),
        'timeZone': group['timeZone'],
        'organizer': group['name'],
        'mode': mode,
        'registrationUrl': entry['url'],
        'country': group['country'],
        'communityId': f'meetup-{group["id"]}',
        'published': True,
        'sourceGroupId': f'meetup-{group["id"]}',
        'sourceModifiedAt': entry['modified'],
        'autoSync': True,
    }
    if mode != 'online':
        record['place'] = place or 'Consulta el lugar en Meetup'
        if city:
            record['city'] = city
        if venue_country:
            record['venueCountry'] = venue_country
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
            if (item.get('id', '').startswith('meetup-') and item.get('kind') == 'community'
                    and item.get('published') is True and item.get('country') not in {'BR', 'JM'}):
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
    if any(not event.get('cancelled') for event in events) and not match:
        raise ValueError(f'Missing timezone in feed of {group["id"]}')
    group['timeZone'] = match.group(1) if match else None
    if group['timeZone']:
        ZoneInfo(group['timeZone'])
    return events


def fetch_event_page(entry):
    return parse_event_page(get_text(entry['url']), entry['url'])


def load_existing_events(table):
    events = {}
    projection_fields = ('id',) + SYNC_OWNED_FIELDS
    params = {
        'ProjectionExpression': ','.join(f'#{field}' for field in projection_fields),
        'Select': 'SPECIFIC_ATTRIBUTES',
        'ExpressionAttributeNames': {f'#{field}': field for field in projection_fields},
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


def event_has_ended(record):
    """Return whether the record's end is at or before the current UTC time."""
    value = record.get('endsAt')
    if not isinstance(value, str):
        return False
    try:
        end = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return end <= datetime.now(timezone.utc)
    except (TypeError, ValueError):
        return False


def sync_fields_equal(record, existing, preserve_published=False):
    """Return whether the mapped public/source fields already match."""
    fields = (field for field in SYNC_OWNED_FIELDS
              if not (preserve_published and field == 'published'))
    return all(existing.get(field) == record.get(field) for field in fields)


def update_source_event(table, record, existing, preserve_published=False):
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
    fields = [(key, record[key]) for key in SYNC_OWNED_FIELDS
              if key in record and not (preserve_published and key == 'published')]
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
        expression = 'SET ' + ', '.join(changes)
        removed = []
        for field in OPTIONAL_SYNC_FIELDS:
            if field in existing and field not in record:
                alias = f'#old{field[0].upper()}{field[1:]}'
                names[alias] = field
                removed.append(alias)
        if removed:
            expression += ' REMOVE ' + ', '.join(removed)
        table.update_item(Key={'id': record['id']}, UpdateExpression=expression,
                          ConditionExpression='attribute_exists(#id) AND #owner = :owner '
                                              'AND (attribute_not_exists(#sync) OR #sync = :enabled)',
                          ExpressionAttributeNames=names, ExpressionAttributeValues=values)
        return True
    except Exception as error:
        if getattr(error, 'response', {}).get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            return False
        raise


def unpublish_source_event(table, existing, check_ends_at=False):
    if not existing.get('sourceGroupId') or existing.get('autoSync') is False or existing.get('published') is not True:
        return False
    names = {'#published': 'published', '#sync': 'autoSync', '#owner': 'sourceGroupId'}
    values = {':false': False, ':true': True, ':owner': existing['sourceGroupId']}
    condition = '#published = :true AND #sync = :true AND #owner = :owner'
    if check_ends_at:
        names['#ends'] = 'endsAt'
        if 'endsAt' in existing:
            values[':ends'] = existing['endsAt']
            condition += ' AND #ends = :ends'
        else:
            condition += ' AND attribute_not_exists(#ends)'
    try:
        table.update_item(Key={'id': existing['id']},
                          UpdateExpression='SET #published = :false',
                          ConditionExpression=condition,
                          ExpressionAttributeNames=names,
                          ExpressionAttributeValues=values)
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
    upcoming_event_ids = set()
    cancelled = []
    for group, entries in sorted(feeds.values(), key=lambda item: item[0]['id']):
        for entry in entries:
            record_id = f'meetup-event-{entry["id"]}'
            if record_id in seen:
                continue
            seen.add(record_id)
            prior = existing.get(record_id)
            if entry.get('cancelled'):
                if prior is not None:
                    cancelled.append(prior)
                continue
            upcoming_event_ids.add(record_id)
            if prior and prior.get('autoSync') is False:
                continue
            pending.append((group, entry, prior))

    records = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(fetch_event_page, entry): (group, entry, prior)
                   for group, entry, prior in pending}
        for future in as_completed(futures):
            group, entry, prior = futures[future]
            try:
                record = map_event(group, entry, future.result())
                if record is not None:
                    preserve_published = event_has_ended(record) and prior is not None
                    if prior is None:
                        if not event_has_ended(record):
                            records.append((record, prior, False))
                    elif not sync_fields_equal(record, prior, preserve_published):
                        records.append((record, prior, preserve_published))
                elif prior is not None:
                    cancelled.append(prior)
            except Exception as error:
                failures.append(f'Event {entry["id"]} in group {group["id"]}: {error}')
                failed_group_ids.add(group['id'])

    changed = 0
    skipped = 0
    if not dry_run and table is not None:
        for record, prior, preserve_published in records:
            if update_source_event(table, record, prior, preserve_published):
                changed += 1
            else:
                skipped += 1
        for prior in cancelled:
            if unpublish_source_event(table, prior):
                changed += 1
        for prior in existing.values():
            source = prior.get('sourceGroupId', '')
            group_id = source.removeprefix('meetup-')
            source_removed = source not in active_group_ids
            source_absent = group_id in feeds and group_id not in failed_group_ids
            if prior['id'] not in seen and source_removed:
                if unpublish_source_event(table, prior):
                    changed += 1
            elif prior['id'] not in seen and source_absent and not event_has_ended(prior):
                if unpublish_source_event(table, prior, check_ends_at=True):
                    changed += 1
    return {'groups': len(groups), 'feedsRead': len(feeds), 'upcomingEvents': len(upcoming_event_ids),
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
