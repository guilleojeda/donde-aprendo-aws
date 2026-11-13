#!/usr/bin/env python3
"""Import current public Meetup events from the reviewed community groups.

The group iCalendar feed is the supported source of upcoming event IDs. The
public event page supplies structured Event data for time zone offsets, mode,
and venue. Existing DynamoDB IDs are preserved by conditional writes.
"""

import argparse
from collections import deque
from collections.abc import Mapping
from hashlib import sha256
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone
from decimal import Decimal
from html import unescape
from html.parser import HTMLParser
import json
import math
import re
import os
from time import monotonic
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

ACCOUNT_ID = '719535286359'
TABLE_NAME = 'donde-aprendo-aws-catalog'
MEETUP_HOST = 'www.meetup.com'
MAX_CATALOG_RESOURCE_ID_BYTES = 256
EVENT_RESOURCE_ID = re.compile(r'^[A-Za-z0-9_-]{1,128}$')
# Public IDs follow JavaScript String.trim(): BOM is an edge separator, NEL is not.
PUBLIC_ID_EDGE_WHITESPACE = (
    '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680'
    '\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a'
    '\u2028\u2029\u202f\u205f\u3000\ufeff'
)

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
MAX_HTTP_REQUEST_SECONDS = 20
MAX_HTTP_BODY_BYTES = 2_000_000
HTTP_READ_CHUNK_BYTES = 64 * 1024
SDK_CALL_SECONDS = 5
LAMBDA_DRAIN_SECONDS = 20
NOTIFICATION_SECONDS = 5
FINAL_MARGIN_SECONDS = 10


class BudgetExhausted(RuntimeError):
    """The invocation cannot safely admit more work before its reserved tail."""


class RequestTimedOut(RuntimeError):
    """One bounded Meetup request expired while invocation work may continue."""


class InvocationBudget:
    def __init__(self, remaining_milliseconds):
        if (isinstance(remaining_milliseconds, bool)
                or not isinstance(remaining_milliseconds, (int, float))
                or not math.isfinite(remaining_milliseconds)
                or remaining_milliseconds <= 0):
            raise RuntimeError('Meetup Lambda context has no usable remaining-time budget')
        started = monotonic()
        self.deadline = started + remaining_milliseconds / 1000
        self.work_deadline = self.deadline - (
            SDK_CALL_SECONDS + LAMBDA_DRAIN_SECONDS + NOTIFICATION_SECONDS + FINAL_MARGIN_SECONDS)

    def check_sdk_call(self, operation):
        if monotonic() + SDK_CALL_SECONDS > self.work_deadline:
            raise BudgetExhausted(f'Meetup invocation budget exhausted before {operation}')

    def check_work(self, operation):
        if monotonic() >= self.work_deadline:
            raise BudgetExhausted(f'Meetup invocation budget exhausted before {operation}')

    def request_deadline(self):
        self.check_work('another Meetup request')
        return min(monotonic() + MAX_HTTP_REQUEST_SECONDS, self.work_deadline)

    def check_notification(self):
        if monotonic() + NOTIFICATION_SECONDS + LAMBDA_DRAIN_SECONDS > self.deadline:
            raise BudgetExhausted('Meetup invocation budget exhausted before publication notification')

    def wait_seconds(self):
        return max(0.0, self.work_deadline - monotonic())


def aws_config():
    from botocore.config import Config

    return Config(connect_timeout=2, read_timeout=3,
                  retries={'total_max_attempts': 1})


def check_sdk_budget(budget, operation):
    if budget is not None:
        budget.check_sdk_call(operation)


def validate_catalog_resource_id(value):
    if not isinstance(value, str) or not value or len(value.encode('utf-8')) > MAX_CATALOG_RESOURCE_ID_BYTES:
        raise ValueError(f'Catalog resource ID must be at most {MAX_CATALOG_RESOURCE_ID_BYTES} UTF-8 bytes')
    return value


def validate_public_catalog_resource_id(value, field='Catalog resource ID'):
    validate_catalog_resource_id(value)
    if '\x00' in value or '\r' in value:
        raise ValueError(f'{field} must not contain NUL or carriage return')
    if value[0] in PUBLIC_ID_EDGE_WHITESPACE or value[-1] in PUBLIC_ID_EDGE_WHITESPACE:
        raise ValueError(f'{field} must not have leading or trailing whitespace')
    return value


def validate_event_resource_id(value, field='Meetup event resource ID'):
    if not isinstance(value, str) or not EVENT_RESOURCE_ID.fullmatch(value):
        raise ValueError(f'{field} must use 1 to 128 ASCII letters, digits, underscores, or hyphens')
    return value


def meetup_event_resource_id(event_id):
    if not isinstance(event_id, str) or not event_id:
        raise ValueError('Meetup event ID is invalid')
    return validate_event_resource_id(validate_catalog_resource_id(f'meetup-event-{event_id}'))


def meetup_community_resource_id(group_id):
    if not isinstance(group_id, str):
        raise ValueError('Invalid Meetup community ID')
    return validate_public_catalog_resource_id(f'meetup-{group_id}', 'Meetup community ID')


def validate_meetup_event_record(record):
    validate_event_resource_id(validate_catalog_resource_id(record.get('id')))
    for field in ('communityId', 'sourceGroupId'):
        if field in record:
            validate_public_catalog_resource_id(record[field], field)
    return record


def validate_catalog_url(value):
    if not isinstance(value, str) or not value or value.strip() != value \
            or re.search(r'[\x00-\x1f\x7f]', value):
        raise ValueError('Invalid catalog URL')
    parsed = urlparse(value)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Unsafe catalog URL')
    try:
        _ = parsed.port
    except ValueError as error:
        raise ValueError('Invalid catalog URL port') from error
    return value


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


class MeetupRedirectHandler(HTTPRedirectHandler):
    def __init__(self, request_deadline):
        super().__init__()
        self.request_deadline = request_deadline

    def redirect_request(self, request, response, code, message, headers, new_url):
        try:
            # urllib's default handler drains the unused redirect response before following it.
            response.close()
            remaining = self.request_deadline - monotonic()
            if remaining <= 0:
                raise RequestTimedOut('Meetup request budget exhausted before redirect continuation')
            request.timeout = min(getattr(request, 'timeout', MAX_HTTP_REQUEST_SECONDS), remaining)
            return super().redirect_request(request, response, code, message, headers, new_url)
        except BaseException:
            response.close()
            raise


def set_response_read_timeout(response, timeout):
    """Tighten urllib's socket timeout as the total request budget shrinks."""
    response.fp.raw._sock.settimeout(timeout)


def get_text(url, budget=None):
    request_deadline = monotonic() + MAX_HTTP_REQUEST_SECONDS
    if budget is not None:
        request_deadline = min(request_deadline, budget.request_deadline())
    timeout = request_deadline - monotonic()
    if timeout <= 0:
        raise RequestTimedOut(f'Meetup request budget exhausted before {url}')
    request = Request(url, headers={'User-Agent': 'DondeAprendoAWS/1.0 (+https://dondeaprendoaws.com/)'})
    opener = build_opener(MeetupRedirectHandler(request_deadline))
    with opener.open(request, timeout=timeout) as response:
        final_url = urlparse(response.url)
        if final_url.scheme != 'https' or final_url.hostname != MEETUP_HOST:
            raise ValueError(f'Meetup request redirected to another host: {url}')
        contents = bytearray()
        while True:
            remaining_time = request_deadline - monotonic()
            if remaining_time <= 0:
                raise RequestTimedOut(f'Meetup request budget exhausted while reading {url}')
            if response.isclosed():
                break
            remaining_bytes = MAX_HTTP_BODY_BYTES + 1 - len(contents)
            set_response_read_timeout(response, remaining_time)
            chunk = response.read1(min(HTTP_READ_CHUNK_BYTES, remaining_bytes))
            if chunk:
                contents.extend(chunk)
                if len(contents) > MAX_HTTP_BODY_BYTES:
                    raise ValueError(f'Meetup response too large: {url}')
            if monotonic() >= request_deadline:
                raise RequestTimedOut(f'Meetup request budget exhausted while reading {url}')
            if not chunk:
                break
        return bytes(contents).decode('utf-8')


def group_feed_url(group):
    validate_catalog_url(group.get('url'))
    url = urlparse(group['url'])
    if url.scheme != 'https' or url.hostname != MEETUP_HOST or not re.fullmatch(r'/[A-Za-z0-9_-]+/?', url.path):
        raise ValueError(f'Unsafe Meetup group URL: {group["id"]}')
    return f'https://{MEETUP_HOST}{url.path.rstrip("/")}/events/ical/'


def validate_meetup_group(group):
    if not isinstance(group, Mapping):
        raise ValueError('Invalid Meetup group record')
    group_id = group.get('id')
    meetup_community_resource_id(group_id)
    if not isinstance(group.get('name'), str):
        raise ValueError(f'Invalid Meetup community name: {group_id}')
    if not isinstance(group.get('country'), str):
        raise ValueError(f'Invalid Meetup community country: {group_id}')
    group_feed_url(group)
    return group


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
                validate_catalog_url(url)
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
    validate_catalog_url(entry.get('url'))
    event_status = page.get('eventStatus')
    if not isinstance(event_status, str):
        raise ValueError(f'Missing or invalid event status: {entry["id"]}')
    if event_status in NONPUBLISHABLE_EVENT_STATUSES:
        return None
    if event_status not in PUBLISHABLE_EVENT_STATUSES:
        raise ValueError(f'Unknown event status: {entry["id"]}')
    resource_id = meetup_event_resource_id(entry.get('id'))
    community_id = meetup_community_resource_id(group.get('id'))
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
        'id': resource_id,
        'title': title,
        'description': clean_description(page.get('description')),
        'startsAt': start.isoformat(timespec='seconds'),
        'endsAt': end.isoformat(timespec='seconds'),
        'timeZone': group['timeZone'],
        'organizer': group['name'],
        'mode': mode,
        'registrationUrl': entry['url'],
        'country': group['country'],
        'communityId': community_id,
        'published': True,
        'sourceGroupId': community_id,
        'sourceModifiedAt': entry['modified'],
        'autoSync': True,
    }
    if mode != 'online':
        record['place'] = place or 'Consulta el lugar en Meetup'
        if city:
            record['city'] = city
        if venue_country:
            record['venueCountry'] = venue_country
    return validate_meetup_event_record(record)


def load_groups_from_file(path):
    with open(path, encoding='utf-8') as file:
        directory = json.load(file)
    return [{'id': item['id'], 'url': item['url'], 'name': item['name'], 'country': item['country'],
             'timeZone': None} for item in directory['groups']]


def scan_items(table, params, budget=None):
    """Yield validated DynamoDB Scan items across every page."""
    while True:
        check_sdk_budget(budget, 'catalog scan page')
        page = table.scan(**params)
        if not isinstance(page, Mapping):
            raise ValueError('Invalid DynamoDB Scan response')
        items = page.get('Items')
        if not isinstance(items, list) or any(not isinstance(item, Mapping) for item in items):
            raise ValueError('Invalid DynamoDB Scan Items')
        yield from items

        if 'LastEvaluatedKey' not in page:
            return
        cursor = page['LastEvaluatedKey']
        if not isinstance(cursor, Mapping):
            raise ValueError('Invalid DynamoDB Scan LastEvaluatedKey')
        if not cursor:
            return
        params['ExclusiveStartKey'] = cursor


def load_groups_from_dynamodb(table, budget=None):
    groups = []
    params = {'ProjectionExpression': '#id,#title,#url,#country,#kind,published',
              'Select': 'SPECIFIC_ATTRIBUTES',
              'ConsistentRead': True,
              'ExpressionAttributeNames': {'#id': 'id', '#title': 'title', '#url': 'url',
                                           '#country': 'country', '#kind': 'kind'}}
    for item in scan_items(table, params, budget):
        if not (item.get('id', '').startswith('meetup-') and item.get('kind') == 'community'):
            continue
        if item.get('country') in {'BR', 'JM'}:
            continue
        if 'published' in item and not isinstance(item['published'], bool):
            raise ValueError(f"Invalid published flag for Meetup community {item['id']}")
        if item.get('published') is True:
            group = {'id': item['id'][7:], 'url': item['url'], 'name': item['title'],
                     'country': item['country'], 'timeZone': None}
            validate_meetup_group(group)
            groups.append(group)
    return groups


def timezone_from_feed(group, budget=None):
    feed_url = group_feed_url(group)
    text = get_text(feed_url) if budget is None else get_text(feed_url, budget=budget)
    events = parse_feed(text, group)
    match = re.search(r'^TZID:([^\r\n]+)', text, re.M)
    if any(not event.get('cancelled') for event in events) and not match:
        raise ValueError(f'Missing timezone in feed of {group["id"]}')
    group['timeZone'] = match.group(1) if match else None
    if group['timeZone']:
        ZoneInfo(group['timeZone'])
    return events


def fetch_event_page(entry, budget=None):
    text = get_text(entry['url']) if budget is None else get_text(entry['url'], budget=budget)
    return parse_event_page(text, entry['url'])


def read_feed_observation(group, budget=None):
    worker_group = dict(group)
    events = timezone_from_feed(worker_group) if budget is None else timezone_from_feed(worker_group, budget)
    return events, worker_group.get('timeZone')


def read_event_observation(entry, budget=None):
    return fetch_event_page(entry) if budget is None else fetch_event_page(entry, budget)


class SourceProgress:
    def __init__(self, group):
        self.group = group
        self.feed_started = False
        self.feed_done = False
        self.failed = False
        self.events = deque()
        self.pages_in_flight = 0
        self.seen_ids = set()

    @property
    def complete(self):
        return self.feed_done and not self.failed and not self.events and self.pages_in_flight == 0


def load_existing_events(table, budget=None):
    events = {}
    projection_fields = ('id', 'version', 'approvalRevoked') + SYNC_OWNED_FIELDS
    params = {
        'ProjectionExpression': ','.join(f'#{field}' for field in projection_fields),
        'Select': 'SPECIFIC_ATTRIBUTES',
        'ExpressionAttributeNames': {f'#{field}': field for field in projection_fields},
    }
    for item in scan_items(table, params, budget):
        if item.get('id', '').startswith('meetup-event-'):
            validate_meetup_event_record(item)
            resource_version(item)
            if 'approvalRevoked' in item and not isinstance(item['approvalRevoked'], bool):
                raise ValueError(f'Invalid approvalRevoked flag for {item["id"]}')
            events[item['id']] = item
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
    preserve_published = preserve_published or existing.get('approvalRevoked') is True
    fields = (field for field in SYNC_OWNED_FIELDS
              if not (preserve_published and field == 'published'))
    return all(existing.get(field) == record.get(field) for field in fields)


def current_url_hash(url):
    if not isinstance(url, str):
        raise ValueError('Current catalog URL must be a string')
    return sha256(url.encode('utf-8')).hexdigest()


def current_url_reservation(url, resource_id):
    validate_catalog_resource_id(resource_id)
    return {'id': f'__url#{current_url_hash(url)}', 'recordType': 'urlReservation',
            'url': url, 'status': 'reserved', 'resourceId': resource_id, 'version': 1}


def resource_version(item):
    version = item.get('version', 0)
    if isinstance(version, bool):
        raise ValueError(f'Invalid catalog version for {item.get("id", "unknown resource")}')
    if isinstance(version, int):
        normalized = version
    elif isinstance(version, Decimal) and version.is_finite() and version == version.to_integral_value():
        normalized = int(version)
    else:
        raise ValueError(f'Invalid catalog version for {item.get("id", "unknown resource")}')
    if normalized < 0 or normalized > 9007199254740991:
        raise ValueError(f'Invalid catalog version for {item.get("id", "unknown resource")}')
    return normalized


def version_condition_expression(version):
    if version == 0:
        return '(attribute_not_exists(#version) OR #version = :version)'
    return '#version = :version'


def is_conditional_write_conflict(error):
    code = getattr(error, 'response', {}).get('Error', {}).get('Code')
    if code in ('ConditionalCheckFailedException', 'TransactionConflictException'):
        return True
    if code == 'TransactionCanceledException':
        reasons = getattr(error, 'response', {}).get('CancellationReasons', [])
        return not reasons or any(reason.get('Code') in ('ConditionalCheckFailed', 'TransactionConflict')
                                  for reason in reasons)
    return False


def read_current_event(table, resource_id, budget=None):
    fields = tuple(dict.fromkeys(('id', 'version', 'approvalRevoked') + SYNC_OWNED_FIELDS))
    return read_projected_item(table, resource_id, fields, budget)


def read_reservation(table, url, budget=None):
    reservation_id = f'__url#{current_url_hash(url)}'
    item = read_projected_item(
        table, reservation_id,
        ('id', 'recordType', 'url', 'status', 'version', 'resourceId', 'resourceIds'),
        budget,
    )
    if item is not None:
        if (item.get('recordType') != 'urlReservation' or item.get('url') != url
                or item.get('id') != reservation_id or item.get('version') != 1):
            raise RuntimeError(f'Inconsistent catalog URL reservation for {url}')
        if item.get('status') == 'reserved':
            if not isinstance(item.get('resourceId'), str) or not item['resourceId']:
                raise RuntimeError(f'Malformed catalog URL reservation for {url}')
            resource_ids = [item['resourceId']]
        elif item.get('status') == 'collision':
            resource_ids = item.get('resourceIds')
            if (not isinstance(resource_ids, list) or len(resource_ids) < 2
                    or any(not isinstance(resource_id, str) or not resource_id for resource_id in resource_ids)
                    or len(set(resource_ids)) != len(resource_ids)):
                raise RuntimeError(f'Malformed catalog URL collision for {url}')
        else:
            raise RuntimeError(f'Malformed catalog URL reservation for {url}')
        try:
            for resource_id in resource_ids:
                validate_catalog_resource_id(resource_id)
        except ValueError as error:
            raise RuntimeError(f'Malformed catalog URL reservation for {url}') from error
        for resource_id in resource_ids:
            resource = read_projected_item(
                table, resource_id, ('id', 'recordType', 'url', 'registrationUrl'), budget)
            if resource is None:
                raise RuntimeError(f'Catalog URL reservation for {url} points to a missing or inconsistent resource')
            current_url = resource.get('registrationUrl') if resource.get('recordType') == 'event' else resource.get('url')
            if current_url != url:
                raise RuntimeError(f'Catalog URL reservation for {url} points to a missing or inconsistent resource')
    return item


def read_projected_item(table, item_id, fields, budget=None):
    names = {f'#field{index}': field for index, field in enumerate(fields)}
    expression = ','.join(names)
    check_sdk_budget(budget, f'catalog item read {item_id}')
    return table.get_item(
        Key={'id': item_id},
        ConsistentRead=True,
        ProjectionExpression=expression,
        ExpressionAttributeNames=names,
    ).get('Item')


def transact_catalog(table, operations, budget=None):
    """Send document-form values through the DynamoDB resource's client handlers."""
    client = table.meta.client
    request = []
    for operation in operations:
        kind = operation['kind']
        if kind == 'put':
            put = {'TableName': table.name, 'Item': operation['item'],
                   'ConditionExpression': operation['condition'],
                   'ExpressionAttributeNames': operation['names']}
            if operation.get('values'):
                put['ExpressionAttributeValues'] = operation['values']
            request.append({'Put': put})
        elif kind == 'update':
            update = {'TableName': table.name, 'Key': operation['key'],
                      'UpdateExpression': operation['update'], 'ConditionExpression': operation['condition'],
                      'ExpressionAttributeNames': operation['names'],
                      'ExpressionAttributeValues': operation['values']}
            request.append({'Update': update})
        elif kind == 'delete':
            delete = {'TableName': table.name, 'Key': operation['key'],
                      'ConditionExpression': operation['condition'],
                      'ExpressionAttributeNames': operation['names'],
                      'ExpressionAttributeValues': operation['values']}
            request.append({'Delete': delete})
        else:
            raise ValueError(f'Unknown catalog transaction operation: {kind}')
    check_sdk_budget(budget, 'catalog transaction')
    return client.transact_write_items(TransactItems=request)


def update_expression(record, existing, preserve_published):
    fields = [(key, record[key]) for key in SYNC_OWNED_FIELDS
              if key in record and not (preserve_published and key == 'published')]
    names = {'#id': 'id', '#owner': 'sourceGroupId', '#sync': 'autoSync',
             '#version': 'version', '#revoked': 'approvalRevoked'}
    version = resource_version(existing)
    values = {':owner': record['sourceGroupId'], ':enabled': True,
              ':version': version, ':nextVersion': version + 1, ':revoked': False}
    changes = []
    for index, (key, value) in enumerate(fields):
        alias = f'#f{index}'
        parameter = f':v{index}'
        names[alias] = key
        values[parameter] = value
        changes.append(f'{alias} = {parameter}')
    changes.append('#version = :nextVersion')
    expression = 'SET ' + ', '.join(changes)
    removed = []
    for field in OPTIONAL_SYNC_FIELDS:
        if field in existing and field not in record:
            alias = f'#old{field[0].upper()}{field[1:]}'
            names[alias] = field
            removed.append(alias)
    if removed:
        expression += ' REMOVE ' + ', '.join(removed)
    condition = ('attribute_exists(#id) AND #owner = :owner '
                 'AND (attribute_not_exists(#sync) OR #sync = :enabled) '
                 f'AND {version_condition_expression(version)} '
                 'AND (attribute_not_exists(#revoked) OR #revoked = :revoked)')
    return expression, condition, names, values


def update_event_and_url_reservation(table, record, existing, preserve_published, budget=None):
    validate_meetup_event_record(record)
    old_url = existing.get('registrationUrl')
    new_url = record['registrationUrl']
    if not isinstance(old_url, str) or not isinstance(new_url, str):
        raise RuntimeError(f'Meetup event {record["id"]} has an invalid current URL')
    old_reservation = read_reservation(table, old_url, budget)
    if old_reservation is None:
        raise RuntimeError(f'Missing catalog URL reservation for Meetup event {record["id"]}')
    operations = []
    new_reservation = read_reservation(table, new_url, budget)
    if new_reservation is None:
        operations.append({'kind': 'put', 'item': current_url_reservation(new_url, record['id']),
                           'condition': 'attribute_not_exists(#id)', 'names': {'#id': 'id'}})
    elif new_reservation.get('status') == 'reserved' and new_reservation.get('resourceId') == record['id']:
        raise RuntimeError(f'New URL reservation already points to a Meetup event at its old URL: {record["id"]}')
    elif new_reservation.get('status') == 'collision':
        return 'collision'
    else:
        return 'duplicate'

    if old_reservation['id'] == f'__url#{current_url_hash(new_url)}':
        raise RuntimeError(f'Meetup event URL hash collision for {record["id"]}')
    old_status = old_reservation.get('status')
    if old_status == 'reserved':
        if old_reservation.get('resourceId') != record['id']:
            raise RuntimeError(f'Meetup event does not own its current URL reservation: {record["id"]}')
        operations.append({
            'kind': 'delete',
            'key': {'id': old_reservation['id']},
            'condition': '#url = :url AND #status = :status AND #resourceId = :resourceId AND #version = :version',
            'names': {'#url': 'url', '#status': 'status', '#resourceId': 'resourceId', '#version': 'version'},
            'values': {':url': old_url, ':status': 'reserved', ':resourceId': record['id'], ':version': 1},
        })
    elif old_status == 'collision':
        members = old_reservation.get('resourceIds')
        if not isinstance(members, list) or record['id'] not in members:
            raise RuntimeError(f'Meetup event is absent from its current URL collision: {record["id"]}')
        remaining = sorted(set(members) - {record['id']})
        if not remaining:
            operations.append({'kind': 'delete', 'key': {'id': old_reservation['id']},
                               'condition': '#url = :url AND #status = :status AND #version = :version AND #resourceIds = :resourceIds',
                               'names': {'#url': 'url', '#status': 'status', '#version': 'version', '#resourceIds': 'resourceIds'},
                               'values': {':url': old_url, ':status': 'collision', ':version': 1, ':resourceIds': members}})
        else:
            updated_old = ({'id': old_reservation['id'], 'recordType': 'urlReservation', 'url': old_url,
                            'status': 'reserved', 'resourceId': remaining[0], 'version': 1}
                           if len(remaining) == 1 else
                           {'id': old_reservation['id'], 'recordType': 'urlReservation', 'url': old_url,
                            'status': 'collision', 'resourceIds': remaining, 'version': 1})
            operations.append({'kind': 'put', 'item': updated_old,
                               'condition': '#url = :url AND #status = :status AND #version = :version AND #resourceIds = :resourceIds',
                               'names': {'#url': 'url', '#status': 'status', '#version': 'version', '#resourceIds': 'resourceIds'},
                               'values': {':url': old_url, ':status': 'collision', ':version': 1, ':resourceIds': members}})
    else:
        raise RuntimeError(f'Malformed catalog URL reservation for Meetup event {record["id"]}')

    expression, condition, names, values = update_expression(record, existing, preserve_published)
    operations.append({'kind': 'update', 'key': {'id': record['id']}, 'update': expression,
                       'condition': condition, 'names': names, 'values': values})
    try:
        transact_catalog(table, operations, budget)
        return True
    except Exception as error:
        if is_conditional_write_conflict(error):
            return None
        raise


def update_source_event(table, record, existing, preserve_published=False, budget=None):
    validate_meetup_event_record(record)
    if existing is None:
        return create_source_event_with_url_reservation(table, record, budget)
    current = existing
    for attempt in range(2):
        if current is None or current.get('autoSync') is False:
            return False
        revoked = current.get('approvalRevoked', False)
        if not isinstance(revoked, bool):
            raise ValueError(f'Invalid approvalRevoked flag for {record["id"]}')
        if revoked:
            return False
        if current.get('sourceGroupId') != record['sourceGroupId']:
            return False
        preserve_now = preserve_published or event_has_ended(record)
        if sync_fields_equal(record, current, preserve_now):
            return False
        old_url = current.get('registrationUrl')
        new_url = record['registrationUrl']
        if old_url != new_url:
            changed = update_event_and_url_reservation(table, record, current, preserve_now, budget)
            if changed is True or changed is False or isinstance(changed, str):
                return changed
            if attempt == 1:
                return False
            current = read_current_event(table, record['id'], budget)
            continue

        expression, condition, names, values = update_expression(record, current, preserve_now)
        check_sdk_budget(budget, f'update Meetup event {record["id"]}')
        try:
            table.update_item(Key={'id': record['id']}, UpdateExpression=expression,
                              ConditionExpression=condition,
                              ExpressionAttributeNames=names, ExpressionAttributeValues=values)
            return True
        except Exception as error:
            if not is_conditional_write_conflict(error):
                raise
            if attempt == 1:
                return False
            current = read_current_event(table, record['id'], budget)
    return False


def create_source_event_with_url_reservation(table, record, budget=None):
    validate_meetup_event_record(record)
    reservation = current_url_reservation(record['registrationUrl'], record['id'])
    existing_reservation = read_reservation(table, record['registrationUrl'], budget)
    if existing_reservation is not None:
        if existing_reservation.get('status') == 'collision':
            return 'collision'
        if existing_reservation.get('status') == 'reserved' and existing_reservation.get('resourceId') != record['id']:
            return 'duplicate'
        raise RuntimeError(f'URL reservation already points to missing Meetup event {record["id"]}')
    item = dict(record, version=1)
    operations = [
        {'kind': 'put', 'item': item, 'condition': 'attribute_not_exists(#id)', 'names': {'#id': 'id'}},
        {'kind': 'put', 'item': reservation, 'condition': 'attribute_not_exists(#id)', 'names': {'#id': 'id'}},
    ]
    try:
        transact_catalog(table, operations, budget)
        return True
    except Exception as error:
        if not is_conditional_write_conflict(error):
            raise
        current_resource = read_current_event(table, record['id'], budget)
        if current_resource is not None:
            return False
        current_reservation = read_reservation(table, record['registrationUrl'], budget)
        if current_reservation is not None:
            return 'collision' if current_reservation.get('status') == 'collision' else 'duplicate'
        return False


def unpublish_source_event(table, existing, check_ends_at=False, budget=None):
    validate_catalog_resource_id(existing.get('id'))
    if existing.get('sourceGroupId'):
        validate_public_catalog_resource_id(existing['sourceGroupId'], 'sourceGroupId')
    if not existing.get('sourceGroupId') or existing.get('autoSync') is False or existing.get('published') is not True:
        return False
    revoked = existing.get('approvalRevoked', False)
    if not isinstance(revoked, bool):
        raise ValueError(f'Invalid approvalRevoked flag for {existing["id"]}')
    version = resource_version(existing)
    names = {'#published': 'published', '#sync': 'autoSync', '#owner': 'sourceGroupId',
             '#version': 'version', '#revoked': 'approvalRevoked'}
    values = {':false': False, ':true': True, ':owner': existing['sourceGroupId'],
              ':version': version, ':nextVersion': version + 1, ':revoked': revoked}
    condition = ('#published = :true AND #sync = :true AND #owner = :owner '
                 f'AND {version_condition_expression(version)} '
                 'AND (attribute_not_exists(#revoked) OR #revoked = :revoked)')
    if check_ends_at:
        names['#ends'] = 'endsAt'
        if 'endsAt' in existing:
            values[':ends'] = existing['endsAt']
            condition += ' AND #ends = :ends'
        else:
            condition += ' AND attribute_not_exists(#ends)'
    try:
        check_sdk_budget(budget, f'unpublish Meetup event {existing["id"]}')
        table.update_item(Key={'id': existing['id']},
                          UpdateExpression='SET #published = :false, #version = :nextVersion',
                          ConditionExpression=condition,
                          ExpressionAttributeNames=names,
                          ExpressionAttributeValues=values)
        return True
    except Exception as error:
        if is_conditional_write_conflict(error):
            return False
        raise


def synchronize(table=None, groups=None, dry_run=False, budget=None, before_drain=None):
    """Coordinate read-only source requests and apply their results on this thread."""
    if groups is None:
        groups = load_groups_from_dynamodb(table) if budget is None else load_groups_from_dynamodb(table, budget)
    else:
        if not isinstance(groups, list):
            raise ValueError('Meetup groups must be a list of group records')
        for group in groups:
            try:
                validate_meetup_group(group)
            except ValueError as error:
                group_id = group.get('id', 'unknown') if isinstance(group, Mapping) else 'unknown'
                return {'groups': len(groups), 'feedsRead': 0, 'upcomingEvents': 0,
                        'changed': 0, 'skipped': 0, 'failures': [f'Feed {group_id}: {error}'],
                        'dryRun': dry_run}

    existing = {}
    if table is not None:
        existing = load_existing_events(table) if budget is None else load_existing_events(table, budget)

    sources = [SourceProgress(group) for group in groups]
    active_group_ids = {f'meetup-{group["id"]}' for group in groups}
    source_by_id = {state.group['id']: state for state in sources}
    failures = []
    conflicts = []
    globally_seen = set()
    upcoming_event_ids = set()
    feeds_read = 0
    changed = 0
    skipped = 0
    stop_for_budget = False
    primary_error = None
    notification_error = None
    feed_cursor = 0
    page_cursor = 0
    last_admitted = 'page'
    future_work = {}
    executor = ThreadPoolExecutor(max_workers=8)

    def ready_feed():
        if not sources:
            return None
        for offset in range(len(sources)):
            index = (feed_cursor + offset) % len(sources)
            if not sources[index].feed_started:
                return index, sources[index]
        return None

    def ready_page():
        if not sources:
            return None
        for offset in range(len(sources)):
            index = (page_cursor + offset) % len(sources)
            if sources[index].events:
                return index, sources[index]
        return None

    def next_work():
        feed = ready_feed()
        page = ready_page()
        if feed is not None and page is not None:
            return ('page', page) if last_admitted == 'feed' else ('feed', feed)
        if page is not None:
            return 'page', page
        if feed is not None:
            return 'feed', feed
        return None

    def run_read(read):
        try:
            return read(), monotonic(), None
        except Exception as error:
            return None, monotonic(), error

    def schedule_one():
        nonlocal feed_cursor, page_cursor, last_admitted
        work = next_work()
        if work is None:
            return False
        kind, (index, state) = work
        if budget is not None:
            budget.check_work('another Meetup source request')
        if kind == 'feed':
            state.feed_started = True
            feed_cursor = (index + 1) % len(sources)
            if budget is None:
                future = executor.submit(run_read, lambda: read_feed_observation(state.group))
            else:
                future = executor.submit(run_read, lambda: read_feed_observation(state.group, budget))
            future_work[future] = ('feed', state, None)
        else:
            entry = state.events.popleft()
            state.pages_in_flight += 1
            page_cursor = (index + 1) % len(sources)
            if budget is None:
                future = executor.submit(run_read, lambda: read_event_observation(entry))
            else:
                future = executor.submit(run_read, lambda: read_event_observation(entry, budget))
            future_work[future] = ('page', state, entry)
        last_admitted = kind
        return True

    def apply_unpublish(prior, check_ends_at=False):
        nonlocal changed
        if dry_run or table is None:
            return False
        if budget is None:
            outcome = unpublish_source_event(table, prior, check_ends_at)
        else:
            outcome = unpublish_source_event(table, prior, check_ends_at, budget)
        if outcome:
            changed += 1
            current = existing.get(prior['id'])
            if current is not None:
                current['published'] = False
                current['version'] = resource_version(current) + 1
        return outcome

    def apply_page(state, entry, page):
        nonlocal changed, skipped, primary_error, stop_for_budget
        group = state.group
        try:
            record = map_event(group, entry, page)
        except Exception as error:
            state.failed = True
            failures.append(f'Event {entry["id"]} in group {group["id"]}: {error}')
            return

        record_id = meetup_event_resource_id(entry['id'])
        prior = existing.get(record_id)
        if record is None:
            if (prior is not None and prior.get('sourceGroupId') == f'meetup-{group["id"]}'):
                try:
                    apply_unpublish(prior)
                except BudgetExhausted:
                    stop_for_budget = True
                except Exception as error:
                    primary_error = error
                    state.failed = True
                    failures.append(f'Event {entry["id"]} in group {group["id"]}: {error}')
            return

        if prior is None and event_has_ended(record):
            return
        if prior is not None:
            preserve_published = event_has_ended(record)
            if sync_fields_equal(record, prior, preserve_published):
                return
        else:
            preserve_published = False

        if dry_run or table is None:
            return
        try:
            if budget is None:
                outcome = update_source_event(table, record, prior, preserve_published)
            else:
                outcome = update_source_event(table, record, prior, preserve_published, budget)
        except BudgetExhausted:
            stop_for_budget = True
            return
        except Exception as error:
            primary_error = error
            state.failed = True
            failures.append(f'Event {entry["id"]} in group {group["id"]}: {error}')
            return
        if outcome is True:
            changed += 1
            if prior is None:
                existing[record_id] = dict(record, version=1)
        else:
            skipped += 1
            if outcome in ('duplicate', 'collision'):
                conflicts.append({'id': record['id'], 'url': record['registrationUrl'], 'status': outcome})

    def process_feed(state, observation):
        nonlocal feeds_read, stop_for_budget
        entries, time_zone = observation
        state.feed_done = True
        state.group['timeZone'] = time_zone
        feeds_read += 1
        for entry in entries:
            try:
                record_id = meetup_event_resource_id(entry.get('id'))
            except ValueError as error:
                state.failed = True
                failures.append(f'Event {entry.get("id", "unknown")} in group {state.group["id"]}: {error}')
                continue
            if record_id in state.seen_ids:
                continue
            state.seen_ids.add(record_id)
            globally_seen.add(record_id)
            prior = existing.get(record_id)
            source_id = f'meetup-{state.group["id"]}'
            if entry.get('cancelled'):
                if prior is not None and prior.get('sourceGroupId') == source_id:
                    try:
                        apply_unpublish(prior)
                    except BudgetExhausted:
                        stop_for_budget = True
                        return
                continue
            upcoming_event_ids.add(record_id)
            if prior is not None and prior.get('autoSync') is False:
                continue
            state.events.append(entry)

    def process_completed(future):
        nonlocal stop_for_budget, primary_error
        kind, state, entry = future_work.pop(future)
        observation, _completed_at, error = future.result()
        if kind == 'page':
            state.pages_in_flight -= 1
        if error is not None:
            if isinstance(error, BudgetExhausted):
                stop_for_budget = True
                return
            state.failed = True
            label = f'Feed {state.group["id"]}' if kind == 'feed' else \
                f'Event {entry["id"]} in group {state.group["id"]}'
            failures.append(f'{label}: {error}')
            if kind == 'feed':
                state.feed_done = True
            return
        try:
            if kind == 'feed':
                process_feed(state, observation)
            else:
                apply_page(state, entry, observation)
        except BudgetExhausted:
            stop_for_budget = True
        except Exception as error:
            primary_error = error
            state.failed = True
            label = f'Feed {state.group["id"]}' if kind == 'feed' else \
                f'Event {entry["id"]} in group {state.group["id"]}'
            failures.append(f'{label}: {error}')

    def add_incomplete_failures():
        if stop_for_budget:
            failures.append('Meetup invocation reached its work cutoff; incomplete observations were retained')
        elif primary_error is not None:
            failures.append('Meetup synchronization stopped after an unexpected storage failure')
        for state in sources:
            if not state.feed_started:
                failures.append(f'Feed {state.group["id"]}: not started before synchronization stopped')
            elif not state.feed_done:
                failures.append(f'Feed {state.group["id"]}: request unfinished when synchronization stopped')
            for entry in state.events:
                failures.append(f'Event {entry["id"]} in group {state.group["id"]}: page not started before stop')
        for kind, state, entry in future_work.values():
            if kind == 'page':
                failures.append(f'Event {entry["id"]} in group {state.group["id"]}: request unfinished at stop')
            elif not state.feed_done:
                failures.append(f'Feed {state.group["id"]}: request unfinished at stop')

    try:
        while True:
            if budget is not None and not stop_for_budget and monotonic() >= budget.work_deadline:
                stop_for_budget = True

            if stop_for_budget or primary_error is not None:
                break

            completed = [future for future in future_work if future.done()]
            if completed:
                completed.sort(key=lambda future: (future.result()[1], id(future)))
                for future in completed:
                    if stop_for_budget or primary_error is not None:
                        break
                    if budget is not None and monotonic() >= budget.work_deadline:
                        stop_for_budget = True
                        break
                    process_completed(future)
                continue

            while len(future_work) < 8:
                if budget is not None and monotonic() >= budget.work_deadline:
                    stop_for_budget = True
                    break
                try:
                    scheduled = schedule_one()
                except BudgetExhausted:
                    stop_for_budget = True
                    break
                if not scheduled:
                    break

            if stop_for_budget or primary_error is not None:
                break
            if not future_work:
                break

            timeout = None if budget is None else budget.wait_seconds()
            completed, _pending = wait(future_work, timeout=timeout, return_when=FIRST_COMPLETED)
            if not completed and budget is not None:
                stop_for_budget = True

        if stop_for_budget or primary_error is not None:
            add_incomplete_failures()
        elif not dry_run and table is not None:
            for prior in list(existing.values()):
                if prior['id'] in globally_seen:
                    continue
                source = prior.get('sourceGroupId', '')
                source_removed = source not in active_group_ids
                group_id = source.removeprefix('meetup-')
                source_state = source_by_id.get(group_id)
                source_absent = source_state is not None and source_state.complete
                if not source_removed and not source_absent:
                    continue
                if not source_removed and event_has_ended(prior):
                    continue
                try:
                    if budget is not None:
                        budget.check_work('Meetup source-removal pass')
                    apply_unpublish(prior, check_ends_at=not source_removed)
                except BudgetExhausted:
                    stop_for_budget = True
                    failures.append('Meetup source-removal pass stopped before completion')
                    add_incomplete_failures()
                    break
                except Exception as error:
                    primary_error = error
                    failures.append(f'Event {prior["id"]}: source-removal write failed: {error}')
                    add_incomplete_failures()
                    break

        for future in future_work:
            future.cancel()

        if before_drain is not None and changed:
            try:
                before_drain()
            except Exception as error:
                notification_error = error
        executor.shutdown(wait=True, cancel_futures=True)
    except BaseException:
        for future in future_work:
            future.cancel()
        if before_drain is not None and changed and notification_error is None:
            try:
                before_drain()
            except Exception as error:
                notification_error = error
        executor.shutdown(wait=True, cancel_futures=True)
        raise

    if primary_error is not None:
        if notification_error is not None:
            raise RuntimeError(
                f'{primary_error}; publication notification failed: {notification_error}') from primary_error
        raise primary_error
    if notification_error is not None:
        raise notification_error

    result = {'groups': len(groups), 'feedsRead': feeds_read, 'upcomingEvents': len(upcoming_event_ids),
              'changed': changed, 'skipped': skipped, 'failures': failures, 'dryRun': dry_run}
    if conflicts:
        result['conflicts'] = conflicts
    return result


def lambda_handler(_event, context):
    try:
        remaining_milliseconds = context.get_remaining_time_in_millis()
    except (AttributeError, TypeError) as error:
        raise RuntimeError('Meetup Lambda context has no usable remaining-time budget') from error
    budget = InvocationBudget(remaining_milliseconds)
    import boto3
    config = aws_config()
    sts = boto3.client('sts', config=config)
    check_sdk_budget(budget, 'AWS account identity lookup')
    if sts.get_caller_identity()['Account'] != ACCOUNT_ID:
        raise RuntimeError('Wrong AWS account for Meetup synchronization')
    table = boto3.resource('dynamodb', region_name='us-east-1', config=config).Table(
        os.environ['CATALOG_TABLE'])

    def notify_publication():
        publisher = boto3.client('lambda', region_name='us-east-1', config=config)
        budget.check_notification()
        publisher.invoke(
            FunctionName=os.environ['PUBLICATION_FUNCTION'], InvocationType='Event', Payload=b'{}')

    result = synchronize(table=table, budget=budget, before_drain=notify_publication)
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
        if not groups:
            raise RuntimeError('No approved Meetup communities found')
    else:
        import boto3
        config = aws_config()
        identity = boto3.client('sts', config=config).get_caller_identity()
        if identity['Account'] != ACCOUNT_ID:
            raise RuntimeError(f'Wrong AWS account: {identity["Account"]}')
        table = boto3.resource('dynamodb', region_name='us-east-1', config=config).Table(args.table)
        groups = None
    result = synchronize(table=table, groups=groups, dry_run=args.dry_run)
    print(json.dumps(result))
    if result['failures']:
        raise RuntimeError(f'{len(result["failures"])} Meetup sources failed')


if __name__ == '__main__':
    main()
