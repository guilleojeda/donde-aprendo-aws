import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventHref, resourceHref } from '../src/lib/catalog-routes.mjs';
import { parseDirectorySearch, serializeDirectorySearch } from '../src/lib/directory-url.mjs';

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
  assert.equal(eventHref({ id: 'event-one' }), '/eventos/#event-event-one');
  assert.throws(() => resourceHref({ id: 'bad', kind: 'unknown' }), /Unknown resource kind/);
});

test('directory filters round-trip through shareable URLs without losing unrelated parameters', () => {
  const original = '?utm_source=community&q=Cómo%20usar%20IAM&format=Video&topic=Seguridad&country=AR&level=inicial&sort=recent';
  const parsed = parseDirectorySearch(original, allowed);
  assert.deepEqual(parsed, {
    query: 'Cómo usar IAM', format: 'Video', topic: 'Seguridad', country: 'AR', level: 'inicial', sort: 'recent',
  });
  const saved = serializeDirectorySearch(original, parsed);
  assert.equal(new URLSearchParams(saved).get('utm_source'), 'community');
  assert.deepEqual(parseDirectorySearch(`?${saved}`, allowed), parsed);
});

test('unsupported URL facets are ignored instead of hiding valid results', () => {
  assert.deepEqual(parseDirectorySearch('?format=Libro&country=BR&sort=unknown', allowed), {
    query: '', format: '', topic: '', country: '', level: '', sort: 'directory',
  });
});
