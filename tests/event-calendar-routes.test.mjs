import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { GET, getStaticPaths } from '../src/pages/eventos/[id].ics.ts';

const records = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8'));
const cohost = records.find(({ id }) => id === 'fixture-event-colombia');
// A co-host's download must keep its own facts, even when the UI groups it.
cohost.endsAt = '2099-01-01T21:00:00-05:00';
cohost.submittedEmail = 'private-calendar@example.test';
records.find(({ id }) => id === 'fixture-event').submittedEmail = 'private-calendar@example.test';
records.push({ ...records.find(({ id }) => id === 'fixture-past-argentina'), id: 'hidden-calendar-event', published: false });
const directory = mkdtempSync(join(tmpdir(), 'event-calendar-routes-'));
const fixture = join(directory, 'catalog.json');
writeFileSync(fixture, JSON.stringify(records));
const prior = { fixture: process.env.CATALOG_FIXTURE, table: process.env.CATALOG_TABLE };
process.env.CATALOG_FIXTURE = fixture;
delete process.env.CATALOG_TABLE;
after(() => {
  for (const [key, value] of [['CATALOG_FIXTURE', prior.fixture], ['CATALOG_TABLE', prior.table]]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});
const paths = await getStaticPaths();
const expectedEvents = records.filter((record) => record.recordType === 'event' && record.published === true);
const utc = (value) => new Date(value).toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');

test('calendar routes exist for every public ID, including ended events and co-host aliases', () => {
  assert.deepEqual(paths.map(({ params }) => params.id).sort(), expectedEvents.map(({ id }) => id).sort());
  assert.equal(new Set(paths.map(({ params }) => params.id)).size, paths.length);
  assert.ok(!paths.some(({ params }) => params.id === 'hidden-calendar-event'));
});

test('an unpublished event never gets a public calendar route', () => {
  assert.ok(!paths.some(({ params }) => params.id === 'hidden-calendar-event'));
});

for (const id of ['fixture-event', 'fixture-online-event', 'fixture-past-argentina', 'fixture-past-costa-rica', 'fixture-event-colombia', 'fixture-past-unrecorded']) {
  test(`calendar download keeps the own ID, dates and URL of ${id}`, async () => {
    const path = paths.find(({ params }) => params.id === id);
    assert.ok(path, `Missing public calendar route for ${id}`);
    const original = expectedEvents.find((event) => event.id === id);
    const response = await GET({ props: path.props });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/calendar; charset=utf-8');
    assert.equal(response.headers.get('content-disposition'), `attachment; filename="${id}.ics"`);
    const text = (await response.text()).replace(/\r\n /gu, '');
    assert.ok(text.includes(`UID:${id}@dondeaprendoaws.com\r\n`));
    assert.ok(text.includes(`DTSTART:${utc(original.startsAt)}\r\n`));
    assert.ok(text.includes(`DTEND:${utc(original.endsAt)}\r\n`));
    assert.ok(text.includes(`URL:${original.registrationUrl}\r\n`));
    assert.doesNotMatch(text, /private-calendar@example\.test|submittedEmail|sourceModifiedAt/u);
  });
}
