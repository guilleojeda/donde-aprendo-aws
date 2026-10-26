import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fingerprintPublicCatalog } from '../src/lib/publication.mjs';

const directory = mkdtempSync(join(tmpdir(), 'catalog-publication-'));
const fixturePath = join(directory, 'catalog.json');
const eventEndsAt = '2026-10-26T12:01:00Z';
const fixture = [
  {
    id: 'public-resource', title: 'Recurso público', url: 'https://example.test/resource',
    description: 'Descripción pública', category: 'Artículo', order: 1, featured: false,
    kind: 'content', format: 'Artículo', topics: ['Fundamentos'], published: true,
    submitterName: 'Persona privada', submitterEmail: 'private@example.test', editorNote: 'Dato privado',
  },
  {
    recordType: 'event', id: 'public-event', title: 'Evento público', description: 'Sesión abierta',
    startsAt: '2026-10-26T11:00:00Z', endsAt: eventEndsAt, timeZone: 'UTC', organizer: 'Comunidad',
    mode: 'in-person', registrationUrl: 'https://example.test/event', place: 'Córdoba', country: 'AR',
    venueCountry: 'AR', city: 'Córdoba', published: true,
  },
  {
    id: 'private-draft', title: 'Borrador', url: 'https://example.test/private', description: 'No público',
    category: 'Artículo', order: 2, featured: false, kind: 'content', format: 'Artículo', topics: [],
    published: false, submitterEmail: 'draft@example.test',
  },
];
writeFileSync(fixturePath, JSON.stringify(fixture));
const priorEnvironment = Object.fromEntries(['CATALOG_FIXTURE', 'CATALOG_TABLE', 'CREATOR_PROFILES_TABLE']
  .map((name) => [name, process.env[name]]));
process.env.CATALOG_FIXTURE = fixturePath;
delete process.env.CATALOG_TABLE;
delete process.env.CREATOR_PROFILES_TABLE;

const NativeDate = globalThis.Date;
let currentTime = NativeDate.parse('2026-10-26T12:00:00Z');
class ControlledDate extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [currentTime]));
  }

  static now() {
    return currentTime;
  }
}
globalThis.Date = ControlledDate;

const { GET } = await import('../src/pages/catalog-publication.json.ts');
const { loadSiteCatalog, loadSiteCatalogSnapshot } = await import('../src/lib/site-catalog.mjs');
const snapshot = await loadSiteCatalogSnapshot();

after(() => {
  globalThis.Date = NativeDate;
  for (const [name, value] of Object.entries(priorEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});

test('static route hashes the one public catalog snapshot using its pre-render reference time', async () => {
  assert.ok(snapshot.capturedAt instanceof NativeDate);
  assert.equal(snapshot.capturedAt.toISOString(), '2026-10-26T12:00:00.000Z');
  assert.strictEqual(await loadSiteCatalog(), snapshot.records);

  // The event expires after the shared read but before the manifest route renders.
  currentTime = NativeDate.parse(eventEndsAt) + 1000;
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  const manifest = await response.json();
  assert.deepEqual(Object.keys(manifest).sort(), ['hash', 'version']);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.hash, fingerprintPublicCatalog(snapshot.records, snapshot.capturedAt));
  assert.notEqual(manifest.hash, fingerprintPublicCatalog(snapshot.records, currentTime));
  assert.doesNotMatch(JSON.stringify(manifest), /private|submitter|editorNote|public-resource|public-event/u);
});
