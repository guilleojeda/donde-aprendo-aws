"""Real urllib/HTTPResponse behavior against local HTTP sockets.

Only the external HTTPS connection is redirected to a local HTTP server. This
does not establish TLS interoperability; the opener, redirects, response reads
and importer decisions remain real, without calling Meetup.
"""
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import os
from pathlib import Path
from threading import Event, Lock, Thread
import unittest
from unittest.mock import patch


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


def send(request, body, status=200, location=None):
    request.send_response(status)
    request.send_header('Content-Length', str(len(body)))
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

    def test_redirect_to_another_host_cannot_return_content(self):
        def route(request):
            if request.path == '/redirect':
                send(request, b'unused', 302, 'https://elsewhere.invalid/final')
            else:
                send(request, b'Not an accepted Meetup response')

        with LocalMeetup(route):
            with self.assertRaises(ValueError):
                load_importer().get_text('https://www.meetup.com/redirect')

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
