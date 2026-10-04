import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventHref, resourceHref } from '../src/lib/catalog-routes.mjs';
import { parseDirectorySearch, resetDirectorySearchForReveal, serializeDirectorySearch } from '../src/lib/directory-url.mjs';

const allowed = {
  format: new Set(['Video', 'Artículo']),
  topic: new Set(['Seguridad']),
  country: new Set(['AR', 'CO']),
  level: new Set(['inicial']),
};

test('section links preserve stable card anchors', () => {
  assert.equal(resourceHref({ id: 'one', kind: 'content' }), '/aprender/#resource-one');
  assert.equal(resourceHref({ id: 'two', kind: 'source' }), '/creadores/#resource-two');
  assert.equal(resourceHref({ id: 'three', kind: 'community' }), '/comunidades/#resource-three');
  assert.equal(resourceHref({ id: 'peru', kind: 'community', country: 'PE' }), '/comunidades/peru/#resource-peru');
  assert.equal(eventHref({ id: 'event-one' }), '/eventos/#event-event-one');
  const countryPages = [{ country: 'PE' }, { country: 'CO' }];
  const event = { id: 'cohost', country: 'PE' };
  assert.equal(eventHref(event, countryPages), '/eventos/peru/#event-cohost');
  assert.equal(eventHref({ ...event, country: 'MX' }, countryPages), '/eventos/#event-cohost',
    'A known event country without a generated community page keeps a valid global target.');
  assert.equal(eventHref({ id: 'from-community', communityId: 'community-pe' }, countryPages, [
    { id: 'community-pe', kind: 'community', country: 'PE' },
  ]), '/eventos/peru/#event-from-community', 'A linked published organizer supplies its country when the event omits it.');
  assert.equal(eventHref({ id: 'event-only', country: 'MX' }, countryPages, [
    { id: 'event-only-community', kind: 'community', country: 'MX' },
  ]), '/eventos/#event-event-only', 'An event-only country does not create a national route.');
  assert.throws(() => resourceHref({ id: 'bad', kind: 'unknown' }), /Unknown resource kind/);
});

test('directory filters round-trip through shareable URLs without losing unrelated parameters', () => {
  const original = '?utm_source=community&q=Cómo%20usar%20IAM&format=Video&topic=Seguridad&country=AR&level=inicial&sort=recent';
  const parsed = parseDirectorySearch(original, allowed);
  assert.deepEqual(parsed, {
    query: 'Cómo usar IAM', format: 'Video', topic: 'Seguridad', country: 'AR', level: 'inicial',
    sort: 'recent', sortExplicit: true, defaultSort: 'recommended',
  });
  const saved = serializeDirectorySearch(original, parsed);
  assert.equal(new URLSearchParams(saved).get('utm_source'), 'community');
  assert.deepEqual(parseDirectorySearch(`?${saved}`, allowed), parsed);
});

test('unsupported URL facets are ignored instead of hiding valid results', () => {
  assert.deepEqual(parseDirectorySearch('?format=Libro&country=BR&sort=unknown', allowed), {
    query: '', format: '', topic: '', country: '', level: '', sort: 'recommended',
    sortExplicit: false, defaultSort: 'recommended',
  });
});

test('default sort favors recommendations while explicit directory order survives URL changes', () => {
  const recommended = parseDirectorySearch('', allowed);
  assert.equal(recommended.sort, 'recommended');
  assert.equal(recommended.sortExplicit, false);
  assert.equal(serializeDirectorySearch('', recommended), '');

  const directory = parseDirectorySearch('?sort=directory&format=Video', allowed);
  assert.equal(directory.sort, 'directory');
  assert.equal(directory.sortExplicit, true);
  directory.query = 'Lambda';
  const saved = serializeDirectorySearch('?utm_source=test&sort=directory&format=Video', directory);
  assert.equal(new URLSearchParams(saved).get('sort'), 'directory');
  assert.equal(new URLSearchParams(saved).get('format'), 'Video');
  assert.equal(new URLSearchParams(saved).get('q'), 'Lambda');
  assert.equal(new URLSearchParams(saved).get('utm_source'), 'test');
});

test('certification purpose is an optional default sort, and explicit sort modes remain shareable', () => {
  const implicitPurpose = parseDirectorySearch('', allowed, 'purpose');
  assert.equal(implicitPurpose.sort, 'purpose');
  assert.equal(implicitPurpose.sortExplicit, false);
  assert.equal(serializeDirectorySearch('', implicitPurpose), '');

  const explicitPurpose = parseDirectorySearch('?sort=purpose', allowed, 'purpose');
  assert.equal(explicitPurpose.sort, 'purpose');
  assert.equal(explicitPurpose.sortExplicit, true);
  assert.equal(serializeDirectorySearch('', explicitPurpose), 'sort=purpose');

  const invalidPurpose = parseDirectorySearch('?sort=purpose', allowed, 'recommended');
  assert.equal(invalidPurpose.sort, 'recommended');
  assert.equal(invalidPurpose.sortExplicit, false);
});

test('hash reveal clears filters and query while keeping the selected sort', () => {
  const filtered = parseDirectorySearch('?q=IAM&format=Video&topic=Seguridad&country=AR&level=inicial&sort=directory', allowed);
  const revealed = resetDirectorySearchForReveal(filtered, allowed);
  assert.deepEqual(revealed, {
    query: '', format: '', topic: '', country: '', level: '',
    sort: 'directory', sortExplicit: true, defaultSort: 'recommended',
  });
  assert.equal(serializeDirectorySearch('?utm_source=guide', revealed), 'utm_source=guide&sort=directory');
});
