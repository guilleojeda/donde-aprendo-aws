import assert from 'node:assert/strict';
import test from 'node:test';

let eventLocationApi;
const eventLocationModuleUrl = new URL('../src/lib/event-location.mjs', import.meta.url).href;
try {
  eventLocationApi = await import(eventLocationModuleUrl);
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== eventLocationModuleUrl) throw error;
  // Report the planned helper API as an assertion failure inside each focused test.
}

function effectiveEventLocation(...args) {
  assert.ok(eventLocationApi, 'src/lib/event-location.mjs must export the event location helper');
  assert.equal(typeof eventLocationApi.effectiveEventLocation, 'function',
    'event-location.mjs must export effectiveEventLocation(event, communityById)');
  return eventLocationApi.effectiveEventLocation(...args);
}

test('event location prefers explicit venue country and only borrows a compatible community city', () => {
  const communityById = new Map([
    ['community-ar', { country: 'AR', city: 'Córdoba' }],
    ['community-co', { country: 'CO', city: 'Bogotá' }],
  ]);

  assert.deepEqual(effectiveEventLocation({
    mode: 'in-person', venueCountry: 'CO', country: 'AR', city: 'Medellín', communityId: 'community-ar',
  }, communityById), { country: 'CO', city: 'Medellín' },
  'an explicit physical country wins and an explicit event city is retained');

  assert.deepEqual(effectiveEventLocation({
    mode: 'in-person', venueCountry: 'CO', country: 'AR', communityId: 'community-co',
  }, communityById), { country: 'CO', city: 'Bogotá' },
  'a community city compatible with the explicit venue country remains usable');

  assert.deepEqual(effectiveEventLocation({
    mode: 'in-person', venueCountry: 'CO', country: 'AR', communityId: 'community-ar',
  }, communityById), { country: 'CO', city: '' },
  'a venue in another country cannot borrow the organizer community city');

  assert.deepEqual(effectiveEventLocation({
    mode: 'in-person', communityId: 'community-co',
  }, communityById), { country: 'CO', city: 'Bogotá' },
  'the community supplies missing country and city');

  assert.deepEqual(effectiveEventLocation({
    mode: 'in-person', country: 'AR', communityId: 'community-co',
  }, communityById), { country: 'AR', city: '' },
  'a community city is not used when its country conflicts with the effective country');
});

test('online events have no physical location even when venue fields are present', () => {
  assert.deepEqual(effectiveEventLocation({
    mode: 'online', venueCountry: 'US', country: 'AR', city: 'Córdoba', communityId: 'community-ar',
  }, new Map([['community-ar', { country: 'AR', city: 'Córdoba' }]])),
  { country: '', city: '' });
});

test('venue country accepts a two-letter country outside the organizer country enum', () => {
  assert.deepEqual(effectiveEventLocation({
    mode: 'in-person', venueCountry: 'US', country: 'AR', city: 'Boston',
  }), { country: 'US', city: 'Boston' });

  assert.deepEqual(effectiveEventLocation({ mode: 'in-person' }), { country: '', city: '' },
    'the default community context leaves unknown location fields empty');
});

test('effective location does not mutate frozen event or community facts', () => {
  const event = Object.freeze({
    mode: 'in-person', country: 'AR', venueCountry: 'CO', communityId: 'community-ar',
  });
  const community = Object.freeze({ country: 'AR', city: 'Córdoba' });
  const communityById = new Map([['community-ar', community]]);

  assert.deepEqual(effectiveEventLocation(event, communityById), { country: 'CO', city: '' });
  assert.deepEqual(event, {
    mode: 'in-person', country: 'AR', venueCountry: 'CO', communityId: 'community-ar',
  }, 'effective venue country does not overwrite the organizer country');
  assert.deepEqual(community, { country: 'AR', city: 'Córdoba' },
    'resolving a foreign venue does not rewrite the community location');
});
