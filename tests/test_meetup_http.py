"""Real urllib/HTTPResponse behavior against local HTTP sockets.

Only the external HTTPS connection is redirected to a local HTTP server. This
does not establish TLS interoperability; the opener, redirects, response reads
and importer decisions remain real, without calling Meetup.
"""
import http.client
import io
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import os
import sys
from pathlib import Path
from threading import Event, Lock, Thread
import unittest
from unittest.mock import Mock, patch

import test_meetup_events as support


IMPORTER = Path(__file__).resolve().parents[1] / 'scripts/import-meetup-events.py'


class Clock:
    def __init__(self):
        self.value = 0.0
        self.lock = Lock()

    def __call__(self):
        with self.lock:
            return self.value

    def set(self, value):
        with self.lock:
            self.value = value


def load_importer():
    spec = importlib.util.spec_from_file_location('meetup_http_subject', IMPORTER)
    subject = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(subject)
    return subject


def send(request, body, status=200, location=None, content_length=None):
    request.send_response(status)
    length = len(body) if content_length is None else content_length
    request.send_header('Content-Length', str(length))
    if location:
        request.send_header('Location', location)
    request.end_headers()
    try:
        request.wfile.write(body)
        request.wfile.flush()
    except (BrokenPipeError, ConnectionResetError):
        pass  # Closing an expired/oversized response is an expected client effect.


class LocalMeetup:
    def __init__(self, route):
        self.connections = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                route(self)

            def log_message(self, *_args):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.daemon_threads = False  # server_close joins every fixture request.
        self.thread = Thread(target=lambda: self.server.serve_forever(poll_interval=0.01))

    def __enter__(self):
        self.thread.start()

        provider = self

        class LocalHTTPSConnection(http.client.HTTPConnection):
            def __init__(self, host, port=None, *, timeout=None, **_kwargs):
                provider.connections.append({'host': host, 'timeout': timeout})
                super().__init__('127.0.0.1', provider.server.server_port, timeout=timeout)

        self.patch = patch('http.client.HTTPSConnection', new=LocalHTTPSConnection)
        self.proxy_patch = patch.dict(os.environ, {'NO_PROXY': '*', 'no_proxy': '*'})
        self.proxy_patch.start()
        self.patch.start()
        return self

    def __exit__(self, *_args):
        self.patch.stop()
        self.proxy_patch.stop()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(3)
        if self.thread.is_alive():
            raise AssertionError('Local HTTP server did not terminate')


def start_fetch(subject, path):
    done, box = Event(), {}

    def fetch():
        try:
            box['value'] = subject.get_text('https://www.meetup.com/' + path)
        except Exception as error:
            box['error'] = error
        finally:
            done.set()

    runner = Thread(target=fetch)
    runner.start()
    return runner, done, box


class MeetupHttpTests(unittest.TestCase):
    def finish(self, runner):
        runner.join(5)
        self.assertFalse(runner.is_alive(), 'HTTP caller must finish after fixture release')

    def test_exact_byte_limit_remains_accepted(self):
        body = b'x' * 2_000_000
        with LocalMeetup(lambda request: send(request, body)) as server:
            self.assertEqual(load_importer().get_text('https://www.meetup.com/body'), body.decode())
            self.assertGreater(server.connections[0]['timeout'], 0)
            self.assertLessEqual(server.connections[0]['timeout'], 20)

    def test_oversized_body_remains_rejected(self):
        with LocalMeetup(lambda request: send(request, b'x' * 2_000_001)):
            with self.assertRaises(ValueError):
                load_importer().get_text('https://www.meetup.com/body')

    def test_ordinary_same_host_redirect_retains_final_text(self):
        def route(request):
            if request.path == '/redirect':
                send(request, b'unused', 302, 'https://www.meetup.com/final')
            else:
                send(request, 'Encuentro AWS'.encode())

        with LocalMeetup(route):
            self.assertEqual(load_importer().get_text('https://www.meetup.com/redirect'), 'Encuentro AWS')

    def test_only_same_group_redirect_can_supply_a_valid_empty_feed(self):
        path = '/aws-bogota/events/ical/'
        group = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'url': support.GROUP['url'],
            'meetupSourceUrl': support.GROUP['url'], 'country': 'CO', 'kind': 'community',
            'published': True,
        }
        event = support.existing_event(
            starts_at='2099-01-01T18:00:00-05:00', ends_at='2099-01-01T20:00:00-05:00')
        for redirect in (path + '?type=calendar', '/another-group/events/ical/?type=calendar'):
            with self.subTest(redirect=redirect):
                requests = []
                invocations = []
                table = support.FakeTable([group, event])
                boto3 = support.fake_boto3(table, invocations)

                def route(request):
                    requests.append(request.path)
                    if request.path == path:
                        send(request, b'', 302, redirect)
                    else:
                        send(request, support.EMPTY_ICAL.encode())

                with LocalMeetup(route), patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                        patch.dict(os.environ, {
                            'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                        }):
                    if redirect.startswith(path):
                        result = support.meetup.lambda_handler({}, support.lambda_context())
                        self.assertEqual((result['changed'], result['failures']), (1, []))
                        self.assertEqual(requests, [path, redirect])
                        self.assertFalse(table.existing[event['id']]['published'])
                        self.assertEqual(len(invocations), 1)
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                            support.meetup.lambda_handler({}, support.lambda_context())
                        self.assertEqual(requests, [path])
                        self.assertEqual(table.existing[event['id']], event)
                        self.assertEqual(invocations, [])



    def test_partial_http_transport_cannot_prove_an_empty_calendar(self):
        path = '/aws-bogota/events/ical/'
        source = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'meetupSourceUrl': support.GROUP['url'],
            'country': 'CO', 'kind': 'community', 'published': True,
        }
        start, end = support.EVENT_DATES['future']
        event = support.existing_event(starts_at=start, ends_at=end)
        body = support.EMPTY_ICAL.encode()
        for status_code, declared_length, complete in (
                (200, len(body), True), (200, len(body) + 200, False), (206, len(body), False),
                (200, 'invalid', False)):
            with self.subTest(status=status_code, length=declared_length):
                requests, invocations = [], []
                table = support.FakeTable([source, event])
                boto3 = support.fake_boto3(table, invocations)

                def route(request):
                    requests.append(request.path)
                    send(request, body, status=status_code, content_length=declared_length)

                with LocalMeetup(route), patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                        patch.dict(os.environ, {
                            'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                        }):
                    if complete:
                        result = support.meetup.lambda_handler({}, support.lambda_context())
                        self.assertEqual((result['changed'], result['failures']), (1, []))
                        self.assertFalse(table.existing[event['id']]['published'])
                        self.assertEqual(len(invocations), 1)
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                            support.meetup.lambda_handler({}, support.lambda_context())
                        self.assertEqual(table.existing[event['id']], event)
                        self.assertEqual(table.updates, [])
                        self.assertEqual(invocations, [])
                self.assertEqual(requests, [path])

    def test_chunked_transport_requires_the_final_chunk(self):
        body = support.EMPTY_ICAL.encode()
        for complete in (True, False):
            with self.subTest(complete=complete):
                def route(request):
                    request.send_response(200)
                    request.send_header('Transfer-Encoding', 'chunked')
                    request.end_headers()
                    request.wfile.write(f'{len(body):x}\r\n'.encode() + body + b'\r\n')
                    if complete:
                        request.wfile.write(b'0\r\n\r\n')

                with LocalMeetup(route):
                    url = support.GROUP['url'] + 'events/ical/'
                    if complete:
                        self.assertEqual(support.meetup.get_text(url), support.EMPTY_ICAL)
                    else:
                        with self.assertRaises(http.client.IncompleteRead):
                            support.meetup.get_text(url)

    def test_malformed_chunked_calendar_preserves_future_rows(self):
        source = {
            'id': 'meetup-123', 'title': support.GROUP['name'], 'meetupSourceUrl': support.GROUP['url'],
            'country': 'CO', 'kind': 'community', 'published': True,
        }
        start, end = support.EVENT_DATES['future']
        event = support.existing_event(starts_at=start, ends_at=end)
        body = support.EMPTY_ICAL.encode()
        for after_chunk, final, complete in (
                (b'\r\n', b'0\r\n\r\n', True),
                (b'\r\n', b'0\r\nServer-Timing: app;dur=1\r\n\r\n', True),
                (b'\r\n', b'0\r\n', False),
                (b'\r\n', b'0\r\nServer-Timing: app;dur=1\r\n', False),
                (b'\r\n', b'0\r\nContent-Length: 1\r\n\r\n', False),
                (b'**', b'0\r\n\r\n', False)):
            with self.subTest(delimiter=after_chunk, final=final):
                table = support.FakeTable([source, event])
                invocations = []
                boto3 = support.fake_boto3(table, invocations)

                def route(request):
                    request.send_response(200)
                    request.send_header('Transfer-Encoding', 'chunked')
                    request.end_headers()
                    first, rest = body[:8], body[8:]
                    request.wfile.write(f'{len(first):x};tag="calendar"\r\n'.encode() + first + b'\r\n')
                    request.wfile.write(f'{len(rest):x}\r\n'.encode() + rest + after_chunk + final)

                with LocalMeetup(route), patch.dict(sys.modules, support.fake_aws_modules(boto3)), \
                        patch.dict(os.environ, {
                            'CATALOG_TABLE': 'fake-table', 'PUBLICATION_FUNCTION': 'fake-publication',
                        }):
                    if complete:
                        result = support.meetup.lambda_handler({}, support.lambda_context())
                        self.assertEqual((result['changed'], result['failures']), (1, []))
                        self.assertFalse(table.existing[event['id']]['published'])
                        self.assertEqual(len(invocations), 1)
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'Meetup sources failed'):
                            support.meetup.lambda_handler({}, support.lambda_context())
                        self.assertEqual(table.existing[event['id']], event)
                        self.assertEqual(table.updates, [])
                        self.assertEqual(invocations, [])

    def test_only_same_event_redirect_can_supply_structured_detail(self):
        path = '/aws-bogota/events/456/'
        response_text = 'verified event body'
        for redirect, allowed in ((path + '?source=calendar', True),
                                  ('/aws-bogota/events/457/', False),
                                  (path + ';alternate-record', False)):
            with self.subTest(redirect=redirect):
                requests = []

                def route(request):
                    requests.append(request.path)
                    if request.path == path:
                        send(request, b'', 302, redirect)
                    else:
                        send(request, response_text.encode())

                with LocalMeetup(route):
                    subject = load_importer()
                    if allowed:
                        self.assertEqual(subject.get_text(support.EVENT_URL), response_text)
                        self.assertEqual(requests, [path, redirect])
                    else:
                        with self.assertRaises(ValueError):
                            subject.get_text(support.EVENT_URL)
                        self.assertEqual(requests, [path])

    def test_event_authority_rejects_present_empty_userinfo_before_open(self):
        subject = load_importer()
        with patch.object(subject, 'build_opener') as build_opener:
            with self.assertRaises(ValueError):
                subject.get_text(support.EVENT_URL.replace('www.', '@www.'))
        build_opener.assert_not_called()

    def test_initial_disallowed_url_is_rejected_before_transport_open(self):
        subject = load_importer()
        opener = Mock()

        with patch.object(subject, 'build_opener', return_value=opener):
            error = None
            try:
                subject.get_text('https://events.example.invalid/feed')
            except Exception as caught:
                error = caught

        opener.open.assert_not_called()
        self.assertIsInstance(error, ValueError)

    def test_disallowed_redirect_is_rejected_before_transport_admission(self):
        subject = load_importer()
        request = subject.Request('https://www.meetup.com/redirect')
        handler = subject.MeetupRedirectHandler(subject.monotonic() + 20)
        targets = (
            'https://events.example.invalid/final',
            'http://www.meetup.com/final',
            'https://www.meetup.com.attacker.invalid/final',
        )

        for target in targets:
            with self.subTest(target=target):
                response = Mock()
                with patch.object(subject.HTTPRedirectHandler, 'redirect_request') as admit_redirect:
                    with self.assertRaises(ValueError):
                        handler.redirect_request(request, response, 302, 'Found', {}, target)

                admit_redirect.assert_not_called()
                response.close.assert_called()

    def test_standard_redirect_loop_protection_still_stops_requests(self):
        def route(request):
            send(request, b'unused', 302, 'https://www.meetup.com/loop')

        with LocalMeetup(route) as server:
            error = None
            try:
                load_importer().get_text('https://www.meetup.com/loop')
            except Exception as observed:
                error = observed
            self.assertIsNotNone(error)
            self.assertGreater(len(server.connections), 1)
            self.assertLessEqual(len(server.connections), 12)
            if hasattr(error, 'close'):
                error.close()

    def test_redirect_can_finish_before_an_unused_redirect_body_is_released(self):
        headers, release, final = Event(), Event(), Event()

        def route(request):
            if request.path == '/redirect':
                request.send_response(302)
                request.send_header('Location', 'https://www.meetup.com/final')
                request.send_header('Content-Length', '8')
                request.end_headers()
                request.wfile.flush()
                headers.set()
                if release.wait(5):
                    try:
                        request.wfile.write(b'unneeded')
                    except (BrokenPipeError, ConnectionResetError):
                        pass
            else:
                final.set()
                send(request, b'Final response')

        with LocalMeetup(route):
            runner, done, box = start_fetch(load_importer(), 'redirect')
            try:
                self.assertTrue(headers.wait(2), 'Fixture must expose redirect headers')
                self.assertTrue(final.wait(2), 'Unused redirect body must not hold up the next request')
                self.assertTrue(done.wait(2), 'Final response must complete before redirect-body release')
                self.assertEqual(box, {'value': 'Final response'})
            finally:
                release.set()
                self.finish(runner)

    def test_response_deadline_stops_before_the_remaining_body_is_released(self):
        clock, headers, first, rest = Clock(), Event(), Event(), Event()

        def route(request):
            request.send_response(200)
            request.send_header('Content-Length', '8')
            request.end_headers()
            request.wfile.flush()
            headers.set()
            if first.wait(5):
                try:
                    request.wfile.write(b'x')
                    request.wfile.flush()
                    if rest.wait(5):
                        request.wfile.write(b'y' * 7)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        with patch('time.monotonic', clock), LocalMeetup(route):
            # Patch before import so either supported time import sees the clock.
            runner, done, box = start_fetch(load_importer(), 'body')
            try:
                self.assertTrue(headers.wait(2))
                clock.set(21.0)  # The retained request allowance is 20 seconds.
                first.set()
                self.assertTrue(done.wait(2), 'Whole-body reads must not hide elapsed request time')
                self.assertIn('error', box)
                self.assertNotIn('value', box)
            finally:
                first.set()
                rest.set()
                self.finish(runner)

    def test_each_body_read_timeout_shrinks_to_the_remaining_request_budget(self):
        clock, headers, first, rest = Clock(), Event(), Event(), Event()

        def route(request):
            request.send_response(200)
            request.send_header('Content-Length', '8')
            request.end_headers()
            request.wfile.flush()
            headers.set()
            if first.wait(30):
                try:
                    request.wfile.write(b'x')
                    request.wfile.flush()
                    if rest.wait(30):
                        request.wfile.write(b'y' * 7)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        with patch('time.monotonic', clock), LocalMeetup(route):
            runner, done, box = start_fetch(load_importer(), 'body')
            try:
                self.assertTrue(headers.wait(2))
                clock.set(18.0)
                first.set()
                expired_before_release = done.wait(3)
            finally:
                first.set()
                rest.set()
                self.finish(runner)
        self.assertTrue(expired_before_release,
                        'A later read retained the original 20-second socket timeout')
        self.assertIn('error', box)
        self.assertNotIn('value', box)

    def test_deadline_is_checked_after_a_terminal_eof_read(self):
        clock = Clock()

        class ClockAtEOF(io.BytesIO):
            def read1(self, size=-1):
                chunk = super().read1(size)
                if not chunk:
                    clock.set(21.0)
                return chunk

        class Socket:
            def __init__(self, stream):
                self.stream = stream

            def makefile(self, _mode):
                return self.stream

        # Use the real HTTPResponse parser and read1 path, with a close-delimited
        # body whose final EOF advances the controlled clock past 20 seconds.
        response = http.client.HTTPResponse(Socket(ClockAtEOF(
            b'HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nX')))
        response.begin()
        response.url = 'https://www.meetup.com/body'

        class Opener:
            def open(self, _request, timeout):
                self.timeout = timeout
                return response

        opener = Opener()
        with patch('time.monotonic', clock):
            subject = load_importer()
            with patch.object(subject, 'build_opener', return_value=opener), \
                    patch.object(subject, 'set_response_read_timeout'):
                with self.assertRaises(subject.RequestTimedOut):
                    subject.get_text('https://www.meetup.com/body')
        self.assertEqual(clock(), 21.0)

    def test_redirect_continuation_timeout_uses_the_remaining_request_time(self):
        clock = Clock()

        def route(request):
            if request.path == '/redirect':
                clock.set(18.0)
                send(request, b'unused', 302, 'https://www.meetup.com/final')
            else:
                send(request, b'Final response')

        with patch('time.monotonic', clock), LocalMeetup(route) as server:
            self.assertEqual(load_importer().get_text('https://www.meetup.com/redirect'), 'Final response')
            self.assertEqual(len(server.connections), 2)
            self.assertGreater(server.connections[1]['timeout'], 0)
            self.assertLessEqual(server.connections[1]['timeout'], 2.0)

    def test_expired_redirect_continuation_makes_no_next_request(self):
        clock, final = Clock(), Event()

        def route(request):
            if request.path == '/redirect':
                clock.set(21.0)
                send(request, b'unused', 302, 'https://www.meetup.com/final')
            else:
                final.set()
                send(request, b'Must not be requested')

        with patch('time.monotonic', clock), LocalMeetup(route):
            error = None
            try:
                load_importer().get_text('https://www.meetup.com/redirect')
            except Exception as observed:
                error = observed
            self.assertIsNotNone(error, 'Expired redirect must report failure')
            self.assertFalse(final.is_set(), 'Expired continuation must not perform another request')


if __name__ == '__main__':
    unittest.main()
