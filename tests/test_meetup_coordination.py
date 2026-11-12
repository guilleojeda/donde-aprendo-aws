"""Acceptance tests for bounded Meetup request coordination and truthful stop."""

import copy
import importlib.util
import json
import pathlib
import queue
import re
import sys
import threading
import time
import unittest
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

import test_meetup_events as support


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'import-meetup-events.py'


def make_group(number):
    slug = f'aws-{number}'
    return {
        'id': str(number),
        'url': f'https://www.meetup.com/{slug}/',
        'name': f'AWS Group {number}',
        'country': 'CO',
        'timeZone': 'America/Bogota',
    }


def community_row(group, published=True):
    return {
        'id': f'meetup-{group["id"]}', 'title': group['name'], 'url': group['url'],
        'country': group['country'], 'kind': 'community', 'published': published,
    }


def calendar_for(group, *event_ids, cancelled=()):
    parts = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'TZID:America/Bogota']
    for event_id in event_ids:
        event_url = f'{group["url"].rstrip("/")}/events/{event_id}/'
        parts.extend((
            'BEGIN:VEVENT', f'UID:event_{event_id}@meetup.com', f'SUMMARY:Meetup {event_id}',
            f'URL;VALUE=URI:{event_url}', 'LAST-MODIFIED:20990101T000000Z',
            'STATUS:CANCELLED' if str(event_id) in {str(value) for value in cancelled}
            else 'STATUS:CONFIRMED', 'END:VEVENT',
        ))
    parts.append('END:VCALENDAR')
    return '\r\n'.join(parts) + '\r\n'


def event_page(group, event_id, title=None):
    return {
        '@type': 'Event',
        'name': title or f'Meetup {event_id}',
        'url': f'{group["url"].rstrip("/")}/events/{event_id}/',
        'description': 'A real parsed coordination fixture.',
        'startDate': '2099-01-01T18:00:00-05:00',
        'endDate': '2099-01-01T20:00:00-05:00',
        'eventStatus': 'https://schema.org/EventScheduled',
        'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
        'location': {'@type': 'Place', 'name': 'Bogotá',
                     'address': {'addressLocality': 'Bogotá'}},
    }


def mapped_prior(group, event_id, title='Old source title'):
    importer = support.meetup
    entry = importer.parse_feed(calendar_for(group, event_id), group)[0]
    record = importer.map_event(group, entry, event_page(group, event_id, title))
    record['title'] = title
    record['version'] = 4
    return record


def json_ld_response(page):
    return '<script type="application/ld+json">' + json.dumps(page) + '</script>'


class RecordingTable(support.FakeTable):
    """Expose state only after an existing production writer commits it."""

    def __init__(self, existing=None):
        super().__init__(existing)
        self.commits = queue.Queue()
        self.after_update = None
        self.notification_event = None
        self.post_notification_commits = []
        self.writer_thread_ids = []

    def update_item(self, **kwargs):
        result = super().update_item(**kwargs)
        state = copy.deepcopy(self.existing[kwargs['Key']['id']])
        self.writer_thread_ids.append(threading.get_ident())
        self.commits.put(state)
        if self.notification_event is not None and self.notification_event.is_set():
            self.post_notification_commits.append(state)
        if self.after_update is not None:
            self.after_update(state)
        return result

    def transact_write_items(self, *, TransactItems):
        result = super().transact_write_items(TransactItems=TransactItems)
        state = copy.deepcopy(self.existing)
        self.writer_thread_ids.append(threading.get_ident())
        self.commits.put(state)
        if self.notification_event is not None and self.notification_event.is_set():
            self.post_notification_commits.append(state)
        return result


class MutableClock:
    def __init__(self):
        self.value = 0.0
        self.lock = threading.Lock()

    def monotonic(self):
        with self.lock:
            return self.value

    def advance(self, seconds):
        with self.lock:
            self.value += seconds


def load_fresh_importer(name):
    spec = importlib.util.spec_from_file_location(name, MODULE_PATH)
    importer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(importer)
    return importer


def run_in_thread(call):
    outcome = queue.Queue()

    def execute():
        try:
            outcome.put((call(), None))
        except BaseException as error:
            outcome.put((None, error))

    thread = threading.Thread(target=execute, daemon=True)
    thread.start()
    return thread, outcome


class MeetupCoordinationTests(unittest.TestCase):
    def assert_commit_before_release(self, table, gate_started, release, thread, outcome, expected_id):
        commit = None
        released_when_observed = None
        try:
            self.assertTrue(gate_started.wait(4), 'controlled unrelated request did not start')
            try:
                commit = table.commits.get(timeout=4)
            except queue.Empty:
                pass
            released_when_observed = release.is_set()
        finally:
            release.set()
            thread.join(timeout=4)
        self.assertFalse(thread.is_alive(), 'synchronization did not drain after release')
        result, error = outcome.get(timeout=1)
        self.assertIsNone(error)
        self.assertGreaterEqual(result['changed'], 1)
        self.assertEqual(result['failures'], [])
        self.assertIsNotNone(commit, 'healthy write did not commit before the unrelated request was released')
        self.assertEqual(commit['id'], expected_id)
        self.assertEqual(commit['title'], 'Fresh source title')
        self.assertFalse(released_when_observed, 'healthy write was observed only after releasing the gate')
        self.assertEqual(set(table.writer_thread_ids), {thread.ident},
                         'read worker performed a write outside the synchronization coordinator')

    def test_healthy_update_commits_while_unrelated_feed_is_gated(self):
        healthy = make_group(101)
        slow = make_group(202)
        prior = mapped_prior(healthy, '456')
        table = RecordingTable([community_row(healthy), community_row(slow), prior])
        gate_started = threading.Event()
        release = threading.Event()

        def get_text(url):
            if url.endswith('/events/ical/'):
                if '/aws-202/' in url:
                    gate_started.set()
                    if not release.wait(5):
                        raise TimeoutError('test did not release slow feed')
                    return calendar_for(slow, '999')
                return calendar_for(healthy, '456')
            if '/events/456/' in url:
                return json_ld_response(event_page(healthy, '456', 'Fresh source title'))
            return json_ld_response(event_page(slow, '999'))

        with patch.object(support.meetup, 'get_text', side_effect=get_text):
            thread, outcome = run_in_thread(lambda: support.meetup.synchronize(table=table))
            self.assert_commit_before_release(
                table, gate_started, release, thread, outcome, 'meetup-event-456')

    def test_healthy_update_commits_while_unrelated_event_page_is_gated(self):
        healthy = make_group(103)
        slow = make_group(204)
        prior = mapped_prior(healthy, '456')
        table = RecordingTable([community_row(healthy), community_row(slow), prior])
        gate_started = threading.Event()
        release = threading.Event()

        def get_text(url):
            if url.endswith('/events/ical/'):
                return calendar_for(healthy, '456') if '/aws-103/' in url else calendar_for(slow, '999')
            if '/events/999/' in url:
                gate_started.set()
                if not release.wait(5):
                    raise TimeoutError('test did not release slow event page')
                return json_ld_response(event_page(slow, '999'))
            return json_ld_response(event_page(healthy, '456', 'Fresh source title'))

        with patch.object(support.meetup, 'get_text', side_effect=get_text):
            thread, outcome = run_in_thread(lambda: support.meetup.synchronize(table=table))
            self.assert_commit_before_release(
                table, gate_started, release, thread, outcome, 'meetup-event-456')

    def test_owned_cancellation_commits_before_sibling_page_failure_and_foreign_cancel_cannot_revoke_owner(self):
        owner = make_group(333)
        canceller = make_group(222)
        sibling = make_group(444)
        owned_cancel = mapped_prior(canceller, '456', 'Cancelled by owner')
        existing_owner = mapped_prior(owner, '789', 'Owner event')
        failed_sibling = mapped_prior(canceller, '888', 'Sibling event')
        healthy_sibling = mapped_prior(canceller, '777', 'Previous page title')
        unseen_same_source = mapped_prior(canceller, '555', 'Unseen source event')
        ended_history = mapped_prior(sibling, '889', 'Ended history')
        ended_history['startsAt'] = '2000-01-01T18:00:00-05:00'
        ended_history['endsAt'] = '2000-01-01T20:00:00-05:00'
        table = RecordingTable([
            community_row(owner), community_row(canceller), community_row(sibling),
            owned_cancel, existing_owner, failed_sibling, healthy_sibling, unseen_same_source,
            ended_history,
        ])
        page_started = threading.Event()
        release = threading.Event()

        def get_text(url):
            if url.endswith('/events/ical/'):
                if '/aws-333/' in url:
                    return calendar_for(owner, '789')
                if '/aws-222/' in url:
                    return calendar_for(canceller, '456', '789', '777', '888',
                                       cancelled=('456', '789'))
                return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nTZID:America/Bogota\r\nEND:VCALENDAR\r\n'
            if '/events/888/' in url:
                page_started.set()
                if not release.wait(30):
                    raise TimeoutError('test did not release failing page')
                raise RuntimeError('sibling event page failed')
            if '/events/789/' in url:
                return json_ld_response(event_page(owner, '789', 'Owner event'))
            if '/events/777/' in url:
                return json_ld_response(event_page(canceller, '777', 'Fresh source title'))
            raise AssertionError(f'unexpected page URL {url}')

        with patch.object(support.meetup, 'get_text', side_effect=get_text):
            thread, outcome = run_in_thread(lambda: support.meetup.synchronize(table=table))
            early_commits = {}
            try:
                self.assertTrue(page_started.wait(4), 'controlled failing page did not start')
                deadline = time.monotonic() + 4
                while not {'meetup-event-456', 'meetup-event-777'} <= early_commits.keys():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        break
                    try:
                        state = table.commits.get(timeout=remaining)
                    except queue.Empty:
                        break
                    if isinstance(state, dict) and 'id' in state:
                        early_commits[state['id']] = state
            finally:
                release.set()
                thread.join(timeout=4)

        self.assertFalse(thread.is_alive(), 'synchronization did not drain after release')
        result, error = outcome.get(timeout=1)
        self.assertIsNone(error)
        self.assertEqual(len(result['failures']), 1)
        self.assertEqual(table.existing['meetup-event-456']['published'], False)
        self.assertEqual(table.existing['meetup-event-456']['version'], 5)
        self.assertEqual(table.existing['meetup-event-789']['published'], True)
        self.assertEqual(table.existing['meetup-event-789']['version'], 4)
        self.assertEqual(table.existing['meetup-event-888']['published'], True)
        self.assertEqual(table.existing['meetup-event-777']['title'], 'Fresh source title')
        self.assertEqual(table.existing['meetup-event-777']['version'], 5)
        self.assertEqual(table.existing['meetup-event-555'], unseen_same_source)
        self.assertEqual(table.existing['meetup-event-889'], ended_history)
        self.assertEqual(set(table.writer_thread_ids), {thread.ident},
                         'read worker performed a write outside the synchronization coordinator')
        self.assertIn('meetup-event-456', early_commits,
                      'valid owned cancellation waited for a sibling page failure')
        self.assertIn('meetup-event-777', early_commits,
                      'healthy sibling event update waited for a failed page')
        self.assertNotIn('meetup-event-789', early_commits,
                         'a foreign cancellation changed an existing event owner row')
        self.assertFalse(early_commits['meetup-event-456']['published'])

    def test_page_admission_is_fair_across_ready_sources_and_never_exceeds_eight_requests(self):
        busy = make_group(401)
        peer = make_group(402)
        busy_event_ids = tuple(str(7000 + index) for index in range(20))
        table = RecordingTable([community_row(busy), community_row(peer)])
        release_busy_pages = {event_id: threading.Event() for event_id in busy_event_ids}
        eight_busy_pages_started = threading.Event()
        peer_feed_returned = threading.Event()
        peer_page_started = threading.Event()
        state_lock = threading.Lock()
        active = 0
        peak = 0
        started_busy_pages = []
        busy_starts_when_peer_page_began = None

        def get_text(url):
            nonlocal active, peak, busy_starts_when_peer_page_began
            with state_lock:
                active += 1
                peak = max(peak, active)
                busy_page = '/aws-401/events/' in url and not url.endswith('/events/ical/')
                if busy_page:
                    event_match = re.search(r'/events/(\d+)/', url)
                    started_busy_pages.append(event_match.group(1))
                    if len(started_busy_pages) >= 8:
                        eight_busy_pages_started.set()
                if '/aws-402/events/' in url and not url.endswith('/events/ical/'):
                    busy_starts_when_peer_page_began = len(started_busy_pages)
                    peer_page_started.set()
            try:
                if url.endswith('/events/ical/'):
                    if '/aws-401/' in url:
                        return calendar_for(busy, *busy_event_ids)
                    peer_feed_returned.set()
                    return calendar_for(peer, '7999')
                if busy_page:
                    event_id = re.search(r'/events/(\d+)/', url).group(1)
                    if not release_busy_pages[event_id].wait(30):
                        raise TimeoutError(f'test did not release busy-source page {event_id}')
                    return json_ld_response(event_page(busy, event_id))
                event_match = re.search(r'/events/(\d+)/', url)
                event_id = event_match.group(1)
                return json_ld_response(event_page(peer, event_id))
            finally:
                with state_lock:
                    active -= 1

        with patch.object(support.meetup, 'get_text', side_effect=get_text):
            thread, outcome = run_in_thread(lambda: support.meetup.synchronize(table=table))
            peer_started_before_releasing_remaining = False
            observed_initial_pages = []
            try:
                self.assertTrue(eight_busy_pages_started.wait(4), 'eight busy-source pages did not fill requests')
                self.assertTrue(peer_feed_returned.wait(4), 'peer feed did not finish while its page work waited')
                with state_lock:
                    observed_initial_pages = list(started_busy_pages[:8])
                for event_id in observed_initial_pages[:2]:
                    release_busy_pages[event_id].set()
                peer_started_before_releasing_remaining = peer_page_started.wait(2)
            finally:
                for gate in release_busy_pages.values():
                    gate.set()
                thread.join(timeout=8)

        self.assertFalse(thread.is_alive(), 'synchronization did not drain after page release')
        result, error = outcome.get(timeout=1)
        self.assertIsNone(error)
        self.assertEqual(result['changed'], 21)
        self.assertEqual(result['failures'], [])
        self.assertLessEqual(peak, 8, 'more than eight read requests were active at once')
        self.assertEqual(set(table.writer_thread_ids), {thread.ident},
                         'read worker performed a write outside the synchronization coordinator')
        self.assertEqual(len(observed_initial_pages), 8)
        self.assertTrue(peer_started_before_releasing_remaining,
                        'ready peer page waited behind all admitted busy-source pages')
        self.assertIsNotNone(busy_starts_when_peer_page_began)
        self.assertLessEqual(busy_starts_when_peer_page_began, 9,
                             'round-robin admitted more than one busy-source page before the ready peer')

    def test_only_eight_network_requests_are_admitted_while_first_batch_is_held(self):
        groups = [make_group(number) for number in range(800, 812)]
        table = RecordingTable([community_row(group) for group in groups])
        release = threading.Event()
        eight_started = threading.Event()
        ninth_started = threading.Event()
        state_lock = threading.Lock()
        active = 0
        peak = 0
        starts = 0

        def get_text(_url):
            nonlocal active, peak, starts
            with state_lock:
                active += 1
                starts += 1
                peak = max(peak, active)
                if starts == 8:
                    eight_started.set()
                if starts == 9:
                    ninth_started.set()
            try:
                if not release.wait(30):
                    raise TimeoutError('test did not release the first request batch')
                return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nTZID:America/Bogota\r\nEND:VCALENDAR\r\n'
            finally:
                with state_lock:
                    active -= 1

        with patch.object(support.meetup, 'get_text', side_effect=get_text):
            thread, outcome = run_in_thread(lambda: support.meetup.synchronize(table=table))
            try:
                self.assertTrue(eight_started.wait(4), 'eight concurrent source requests did not start')
                no_ninth_before_release = not ninth_started.wait(0.25)
                with state_lock:
                    active_at_limit = active
                    peak_before_release = peak
                    starts_before_release = starts
            finally:
                release.set()
                thread.join(timeout=8)

        self.assertFalse(thread.is_alive(), 'synchronization did not finish all released requests')
        result, error = outcome.get(timeout=1)
        self.assertIsNone(error)
        self.assertEqual((result['groups'], result['feedsRead'], result['changed'], result['failures']),
                         (12, 12, 0, []))
        self.assertTrue(no_ninth_before_release, 'a ninth read request was admitted while eight were held')
        self.assertEqual((active_at_limit, peak_before_release, starts_before_release), (8, 8, 8))
        self.assertEqual(peak, 8)
        self.assertEqual(starts, 12)

    def test_first_completed_valid_duplicate_observation_owns_new_event(self):
        first = make_group(121)
        later = make_group(232)
        table = RecordingTable([community_row(first), community_row(later)])
        first_page_started = threading.Event()
        release_first_page = threading.Event()

        def get_text(url):
            if url.endswith('/events/ical/'):
                return calendar_for(first if '/aws-121/' in url else later, '999')
            if '/aws-121/events/999/' in url:
                first_page_started.set()
                if not release_first_page.wait(5):
                    raise TimeoutError('test did not release first source page')
                return json_ld_response(event_page(first, '999', 'Earlier source, later completion'))
            return json_ld_response(event_page(later, '999', 'First valid completion'))

        with patch.object(support.meetup, 'get_text', side_effect=get_text):
            thread, outcome = run_in_thread(lambda: support.meetup.synchronize(table=table))
            early_commit = None
            try:
                self.assertTrue(first_page_started.wait(4), 'controlled first-source page did not start')
                try:
                    early_commit = table.commits.get(timeout=4)
                except queue.Empty:
                    pass
            finally:
                release_first_page.set()
                thread.join(timeout=4)

        self.assertFalse(thread.is_alive(), 'synchronization did not drain after release')
        result, error = outcome.get(timeout=1)
        self.assertIsNone(error)
        self.assertEqual(result['changed'], 1)
        self.assertEqual(result['failures'], [])
        self.assertEqual(len(table.puts), 1)
        self.assertEqual(table.existing['meetup-event-999']['sourceGroupId'], 'meetup-232')
        self.assertEqual(table.existing['meetup-event-999']['title'], 'First valid completion')
        self.assertEqual(set(table.writer_thread_ids), {thread.ident},
                         'read worker performed a write outside the synchronization coordinator')
        self.assertIsNotNone(early_commit, 'first completed page did not claim the new event before release')
        self.assertEqual(early_commit['meetup-event-999']['sourceGroupId'], 'meetup-232')
        self.assertEqual(early_commit['meetup-event-999']['title'], 'First valid completion')

    def test_global_seen_id_protects_existing_owner_row_from_source_removal(self):
        current_owner = make_group(241)
        reporting_source = make_group(242)
        prior = mapped_prior(current_owner, '456', 'Original owner title')
        table = RecordingTable([community_row(reporting_source), prior])

        def get_text(url):
            if url.endswith('/events/ical/'):
                return calendar_for(reporting_source, '456')
            return json_ld_response(event_page(reporting_source, '456', 'Reporting source title'))

        before = copy.deepcopy(table.existing)
        with patch.object(support.meetup, 'get_text', side_effect=get_text):
            result = support.meetup.synchronize(table=table)

        self.assertEqual(result['changed'], 0)
        self.assertEqual(result['failures'], [])
        self.assertEqual(table.existing, before)
        self.assertEqual(table.updates, [])

    def test_deadline_notifies_known_change_before_draining_and_keeps_late_sources_unobserved(self):
        healthy = make_group(301)
        held_feed_group = make_group(302)
        wake_group = make_group(303)
        failed_group = make_group(304)
        bulk_groups = [make_group(number) for number in range(500, 512)]
        groups = [healthy, held_feed_group, wake_group, failed_group, *bulk_groups]
        prior_rows = [
            mapped_prior(healthy, '456'),
            mapped_prior(held_feed_group, '999'),
            mapped_prior(failed_group, '888'),
            *(mapped_prior(group, str(6000 + index)) for index, group in enumerate(bulk_groups)),
        ]
        table = RecordingTable([*(community_row(group) for group in groups), *prior_rows])
        clock = MutableClock()
        healthy_page_started = threading.Event()
        healthy_release = threading.Event()
        held_feed_started = threading.Event()
        held_feed_release = threading.Event()
        wake_feed_started = threading.Event()
        wake_feed_release = threading.Event()
        bulk_feed_started = threading.Event()
        bulk_feed_release = threading.Event()
        late_page_called = threading.Event()
        healthy_committed = threading.Event()
        notified = threading.Event()
        notification_states = []
        held_at_notification = []
        started_feed_groups = []
        started_lock = threading.Lock()

        def get_text(url):
            group = next((item for item in groups if f'/{item["url"].split("/")[3]}/' in url), None)
            if group is None:
                raise AssertionError(f'unrecognized controlled Meetup URL: {url}')
            if url.endswith('/events/ical/'):
                with started_lock:
                    started_feed_groups.append(group['id'])
                if group is healthy:
                    return calendar_for(healthy, '456')
                if group is held_feed_group:
                    held_feed_started.set()
                    if not held_feed_release.wait(30):
                        raise TimeoutError('test did not release held source feed')
                    return calendar_for(held_feed_group, '999')
                if group is wake_group:
                    wake_feed_started.set()
                    if not wake_feed_release.wait(30):
                        raise TimeoutError('test did not release wake feed')
                    return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nTZID:America/Bogota\r\nEND:VCALENDAR\r\n'
                if group is failed_group:
                    raise RuntimeError('controlled sibling feed failure')
                bulk_feed_started.set()
                if not bulk_feed_release.wait(30):
                    raise TimeoutError('test did not release bulk feeds')
                if group is bulk_groups[0]:
                    return calendar_for(group, '6000')
                return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nTZID:America/Bogota\r\nEND:VCALENDAR\r\n'
            if group is healthy:
                healthy_page_started.set()
                if not healthy_release.wait(30):
                    raise TimeoutError('test did not release healthy page')
                return json_ld_response(event_page(healthy, '456', 'Fresh source title'))
            if group is held_feed_group:
                late_page_called.set()
                return json_ld_response(event_page(held_feed_group, '999', 'Arrived after stop'))
            if group is bulk_groups[0]:
                late_page_called.set()
                return json_ld_response(event_page(group, '6000', 'Arrived after stop'))
            raise AssertionError(f'unexpected event page request: {url}')

        def after_healthy_write(record):
            if record['id'] == 'meetup-event-456':
                clock.advance(145)
                healthy_committed.set()

        table.after_update = after_healthy_write
        table.notification_event = notified
        invocations = []
        boto3 = support.fake_boto3(
            table, invocations,
            before_invoke=lambda source: (
                notification_states.append(copy.deepcopy(source.existing)),
                held_at_notification.append((not held_feed_release.is_set(),
                                             not bulk_feed_release.is_set())),
                notified.set(),
            ),
        )
        before = copy.deepcopy(table.existing)
        importer_name = f'meetup_events_deadline_{id(self)}'
        early_notification = False
        setup_events_started = False
        setup_observation = (False, False, False, False)
        healthy_commit_before_release = False
        output = StringIO()

        with patch('time.monotonic', clock.monotonic):
            importer = load_fresh_importer(importer_name)
            with patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                    patch.dict(support.os.environ, {
                        'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                    }), \
                    patch.object(importer, 'get_text', side_effect=get_text), \
                    redirect_stdout(output):
                thread, outcome = run_in_thread(
                    lambda: importer.lambda_handler({}, support.lambda_context()))
                try:
                    healthy_page_ready = healthy_page_started.wait(4)
                    held_feed_ready = held_feed_started.wait(4)
                    wake_feed_ready = wake_feed_started.wait(4)
                    bulk_feed_ready = bulk_feed_started.wait(4)
                    setup_observation = (healthy_page_ready, held_feed_ready,
                                         wake_feed_ready, bulk_feed_ready)
                    setup_events_started = (healthy_page_ready and held_feed_ready
                                            and wake_feed_ready and bulk_feed_ready)
                    if setup_events_started:
                        healthy_release.set()
                        healthy_commit_before_release = healthy_committed.wait(4)
                        # A real task completion wakes the coordinator after the controlled clock jump.
                        wake_feed_release.set()
                        early_notification = notified.wait(4)
                finally:
                    healthy_release.set()
                    wake_feed_release.set()
                    held_feed_release.set()
                    bulk_feed_release.set()
                    thread.join(timeout=8)

        self.assertFalse(thread.is_alive(), 'handler did not drain released request workers')
        _result, error = outcome.get(timeout=1)
        self.assertIsNotNone(error, 'deadline or source failure was incorrectly reported as complete success')
        self.assertTrue(setup_events_started,
                        'coordinator did not stage healthy/page and gated source reads before deadline: '
                        f'healthyPage={setup_observation[0]}, heldFeed={setup_observation[1]}, '
                        f'wakeFeed={setup_observation[2]}, bulkFeed={setup_observation[3]}')
        self.assertTrue(healthy_commit_before_release,
                        'healthy writer did not commit while the gated requests were still held')
        self.assertTrue(early_notification, 'handler did not notify known changes before held-request drainage')
        report = json.loads(output.getvalue().splitlines()[-1])
        failures = report['failures']
        self.assertEqual(report['changed'], 1)
        self.assertTrue(any('controlled sibling feed failure' in failure for failure in failures))
        unfinished_ids = ('302', *[group['id'] for group in bulk_groups])
        self.assertTrue(any(any(group_id in failure for group_id in unfinished_ids) for failure in failures),
                        'result did not identify unfinished or unstarted source work')
        self.assertEqual(len(invocations), 1)
        self.assertEqual(invocations[0], {
            'FunctionName': 'fake-publication', 'InvocationType': 'Event', 'Payload': b'{}',
        })
        expected_notification_state = copy.deepcopy(before)
        expected_notification_state['meetup-event-456']['title'] = 'Fresh source title'
        expected_notification_state['meetup-event-456']['version'] += 1
        self.assertEqual(notification_states, [expected_notification_state])
        self.assertEqual(held_at_notification, [(True, True)])
        self.assertFalse(table.post_notification_commits, 'a writer committed after the notification boundary')
        self.assertEqual(set(table.writer_thread_ids), {thread.ident},
                         'read worker performed a write outside the synchronization coordinator')
        self.assertEqual(table.existing['meetup-event-456'], expected_notification_state['meetup-event-456'])
        self.assertEqual(table.existing['meetup-event-999'], before['meetup-event-999'])
        self.assertEqual(table.existing['meetup-event-888'], before['meetup-event-888'])
        self.assertFalse(late_page_called.is_set(), 'a late feed response admitted page work after stop')
        for index, group in enumerate(bulk_groups):
            event_id = f'meetup-event-{6000 + index}'
            self.assertEqual(table.existing[event_id], before[event_id])
        with started_lock:
            self.assertLess(len(set(started_feed_groups)), len(groups),
                            'all source feeds completed admission before controlled stop')


if __name__ == '__main__':
    unittest.main()
