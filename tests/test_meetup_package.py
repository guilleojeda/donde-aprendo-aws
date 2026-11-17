"""Meetup release archive behavior across source-checkout metadata changes."""

import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch
from zipfile import ZIP_STORED, ZipFile

import test_meetup_events as meetup_support


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_SCRIPT = ROOT / 'scripts' / 'package-meetup-events.py'
HANDLER_SOURCE = ROOT / 'scripts' / 'import-meetup-events.py'


class MeetupPackageTests(unittest.TestCase):
    def test_identical_source_bytes_produce_identical_zip_across_timestamp_and_mode_changes(self):
        with tempfile.TemporaryDirectory(prefix='meetup-package-repro-') as directory:
            root = Path(directory)
            package_dir = root / 'scripts'
            package_dir.mkdir()
            script_copy = package_dir / PACKAGE_SCRIPT.name
            source_copy = package_dir / HANDLER_SOURCE.name
            shutil.copyfile(PACKAGE_SCRIPT, script_copy)
            shutil.copyfile(HANDLER_SOURCE, source_copy)
            source_bytes = source_copy.read_bytes()
            source_hash = hashlib.sha256(source_bytes).hexdigest()
            first_archive = root / 'first.zip'
            second_archive = root / 'second.zip'

            def build_archive(target):
                subprocess.run(
                    [sys.executable, str(script_copy), str(target)],
                    cwd=root,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                with ZipFile(target) as archive:
                    self.assertEqual(archive.namelist(), ['index.py'])
                    self.assertEqual(archive.read('index.py'), source_bytes)
                    entry = archive.getinfo('index.py')
                    self.assertEqual(entry.date_time, (1980, 1, 1, 0, 0, 0))
                    self.assertEqual(entry.create_system, 3)
                    self.assertEqual(entry.external_attr, 0o100644 << 16)
                    self.assertEqual(entry.internal_attr, 0)
                    self.assertEqual(entry.compress_type, ZIP_STORED)

            build_archive(first_archive)
            os.chmod(source_copy, 0o700)
            os.utime(source_copy, (1_700_000_002, 1_700_000_002))
            self.assertEqual(hashlib.sha256(source_copy.read_bytes()).hexdigest(), source_hash)
            build_archive(second_archive)

            self.assertEqual(
                second_archive.read_bytes(),
                first_archive.read_bytes(),
                'ZIP output must not inherit the source checkout mtime or permissions',
            )

    def test_extracted_meetup_handler_updates_the_catalog_and_notifies_publication(self):
        with tempfile.TemporaryDirectory(prefix='meetup-packaged-handler-') as directory:
            root = Path(directory)
            archive_path = root / 'meetup-events.zip'
            extracted = root / 'extracted'
            declaration_result = subprocess.run(
                ['node', 'tests/fixtures/lambda-template-handler.mjs', 'meetup-events', 'MeetupEventsFunction'],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            declaration = json.loads(declaration_result.stdout)
            self.assertEqual(declaration['runtime'], 'python3.13')
            subprocess.run(
                [sys.executable, str(PACKAGE_SCRIPT), str(archive_path)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            with ZipFile(archive_path) as archive:
                self.assertEqual(archive.namelist(), [f"{declaration['module']}.py"])
                archive.extractall(extracted)

            handler_path = extracted / f"{declaration['module']}.py"
            spec = importlib.util.spec_from_file_location('extracted_meetup_lambda', handler_path)
            self.assertIsNotNone(spec)
            self.assertIsNotNone(spec.loader)
            handler = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(handler)

            community = {
                'id': 'meetup-123',
                'title': meetup_support.GROUP['name'],
                'url': 'https://catalog.example.invalid/edited-group',
                'meetupSourceUrl': meetup_support.GROUP['url'],
                'country': meetup_support.GROUP['country'],
                'kind': 'community',
                'published': True,
            }
            table = ProjectionAwareTable([community])
            requested_urls = []
            publication_calls = []

            def client(service, **_kwargs):
                if service == 'sts':
                    return SimpleNamespace(get_caller_identity=lambda: {'Account': handler.ACCOUNT_ID})
                if service == 'lambda':
                    def invoke(**kwargs):
                        publication_calls.append(kwargs)
                        return {'StatusCode': 202, 'ResponseMetadata': {'HTTPStatusCode': 202}}
                    return SimpleNamespace(invoke=invoke)
                raise AssertionError(f'Unexpected AWS client: {service}')

            fake_boto3 = SimpleNamespace(
                client=client,
                resource=lambda service, **_kwargs: (
                    SimpleNamespace(Table=lambda name: table)
                    if service == 'dynamodb' else (_ for _ in ()).throw(AssertionError(service))
                ),
            )

            def provider(url, **_kwargs):
                requested_urls.append(url)
                if url == 'https://www.meetup.com/aws-bogota/events/ical/':
                    return meetup_support.ICAL
                if url == meetup_support.EVENT_URL:
                    return '<script type="application/ld+json">' + json.dumps(meetup_support.PAGE) + '</script>'
                raise AssertionError(f'Unexpected provider URL: {url}')

            scheduled_event = {
                'source': 'aws.events',
                'detail-type': 'Scheduled Event',
                'resources': [handler.SCHEDULE_RULE_ARN],
            }
            context = meetup_support.lambda_context()
            output = io.StringIO()
            sdk_modules = meetup_support.fake_aws_modules(fake_boto3)
            with patch.dict(sys.modules, sdk_modules), \
                    patch.dict(os.environ, {
                        'CATALOG_TABLE': 'archive-meetup-catalog',
                        'PUBLICATION_FUNCTION': 'archive-publication-handler',
                    }), \
                    patch.object(handler, 'get_text', side_effect=provider), \
                    redirect_stdout(output):
                result = getattr(handler, declaration['exportName'])(scheduled_event, context)

            event = table.existing['meetup-event-456']
            self.assertEqual(result['changed'], 1)
            self.assertEqual(result['failures'], [])
            self.assertTrue(event['published'])
            self.assertEqual(event['title'], meetup_support.PAGE['name'])
            self.assertEqual(event['communityId'], 'meetup-123')
            self.assertEqual(event['sourceGroupId'], 'meetup-123')
            self.assertEqual(event['version'], 1)
            self.assertEqual(requested_urls, [
                'https://www.meetup.com/aws-bogota/events/ical/',
                meetup_support.EVENT_URL,
            ])
            self.assertTrue(any(
                'meetupSourceUrl' in request.get('ExpressionAttributeNames', {}).values()
                and request.get('Select') == 'SPECIFIC_ATTRIBUTES'
                for request in table.scan_requests
            ))
            self.assertEqual(len(publication_calls), 1)
            self.assertEqual(publication_calls[0]['FunctionName'], 'archive-publication-handler')
            self.assertEqual(publication_calls[0]['InvocationType'], 'Event')


class ProjectionAwareTable(meetup_support.FakeTable):
    """Retain the source fields requested by the packaged Lambda scan contract."""

    def __init__(self, existing=None):
        super().__init__(existing)
        self.scan_requests = []

    def scan(self, **kwargs):
        self.scan_requests.append(kwargs)
        result = super().scan(**kwargs)
        projection = kwargs.get('ProjectionExpression')
        if projection:
            names = kwargs.get('ExpressionAttributeNames', {})
            fields = [names.get(token.strip(), token.strip()) for token in projection.split(',')]
            result['Items'] = [
                {field: item[field] for field in fields if field in item}
                for item in result['Items']
            ]
        return result


if __name__ == '__main__':
    unittest.main()
