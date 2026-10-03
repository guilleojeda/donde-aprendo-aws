import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNTRY_LABELS } from '../src/lib/resource-discovery.mjs';
import {
  COMMUNITY_COUNTRY_SLUGS,
  communityCountryPages,
  communityCountryPath,
} from '../src/lib/community-country-pages.mjs';

test('every supported country has one explicit, readable, stable community slug', () => {
  assert.deepEqual(Object.keys(COMMUNITY_COUNTRY_SLUGS).sort(), Object.keys(COUNTRY_LABELS).sort());
  assert.equal(new Set(Object.values(COMMUNITY_COUNTRY_SLUGS)).size, Object.keys(COMMUNITY_COUNTRY_SLUGS).length);
  assert.equal(communityCountryPath('CR'), '/comunidades/costa-rica/');
  assert.equal(communityCountryPath('DO'), '/comunidades/republica-dominicana/');
  assert.equal(communityCountryPath('PR'), '/comunidades/puerto-rico/');
  assert.equal(communityCountryPath('NI'), '/comunidades/nicaragua/');
  assert.equal(communityCountryPath('ZZ'), undefined);
});

test('country navigation includes only known-country communities and their counts', () => {
  const resources = [
    { id: 'peru-one', kind: 'community', country: 'PE' },
    { id: 'peru-two', kind: 'community', country: 'PE' },
    { id: 'student-nicaragua', kind: 'community', country: 'NI', format: 'Student Builder Group' },
    { id: 'no-country', kind: 'community' },
    { id: 'content-peru', kind: 'content', country: 'PE' },
    { id: 'unsupported-country', kind: 'community', country: 'ZZ' },
  ];
  assert.deepEqual(communityCountryPages(resources), [
    { country: 'NI', label: 'Nicaragua', slug: 'nicaragua', path: '/comunidades/nicaragua/', count: 1 },
    { country: 'PE', label: 'Perú', slug: 'peru', path: '/comunidades/peru/', count: 2 },
  ]);
});
