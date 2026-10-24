import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const directoryAttributes = [
  'id', 'title', 'url', 'description', 'category', 'order', 'featured', 'kind', 'format', 'topics',
  'addedAt', 'country', 'level', 'sourceId', 'communityId', 'eventId', 'recordType', 'startsAt', 'endsAt',
  'timeZone', 'organizer', 'mode', 'place', 'city', 'venueCountry', 'registrationUrl', 'directoryControl', 'hidden', 'approvalRevoked', 'published',
];
const meetupEventAttributes = [
  'id', 'recordType', 'title', 'description', 'startsAt', 'endsAt', 'timeZone', 'url', 'country', 'kind',
  'published', 'sourceGroupId', 'sourceModifiedAt', 'autoSync', 'organizer', 'mode', 'registrationUrl',
  'communityId', 'place', 'city', 'venueCountry', 'approvalRevoked', 'version',
];

async function scanAttributes(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const blocks = [...source.matchAll(
    /dynamodb:Attributes:\r?\n((?:[ \t]+- [A-Za-z][A-Za-z0-9]*\r?\n)+)[ \t]+StringEquals:\r?\n[ \t]+dynamodb:Select:[ \t]+SPECIFIC_ATTRIBUTES/gu,
  )];
  assert.ok(blocks.length >= 1, `${path} has explicitly projected DynamoDB scan allowlists`);
  assert.match(source, /Action:(?:[ \t]+dynamodb:Scan|[ \t]*\r?\n[ \t]+- dynamodb:Scan)\r?\n/u);
  assert.doesNotMatch(source, /dynamodb:\*/u);
  return blocks.map((block) => block[1].match(/[A-Za-z][A-Za-z0-9]*/gu));
}

test('catalog and publication scan allowlists expose only the public fields, including venueCountry', async () => {
  for (const path of ['../infra/catalog.yaml', '../infra/publication.yaml']) {
    const allowlists = await scanAttributes(path);
    const attributes = allowlists.find((set) => set.includes('registrationUrl'));
    assert.ok(attributes, `${path} includes the catalog projection`);
    assert.deepEqual([...attributes].sort(), [...directoryAttributes].sort(), path);
    assert.ok(attributes.includes('city'), `${path} keeps the community city field`);
    assert.ok(attributes.includes('venueCountry'), `${path} includes the physical venue country`);
    const profileAttributes = allowlists.find((set) => set.includes('recordType') && set.includes('profileId'));
    assert.ok(profileAttributes, `${path} includes the creator-state projection`);
    assert.deepEqual(profileAttributes.sort(), [
      'displayName', 'hidden', 'id', 'name', 'pk', 'profileId', 'published', 'recordType', 'resourceId', 'selected',
      'selectedForDirectory', 'series', 'sk', 'slug',
    ]);
  }
});

test('Meetup event scan allowlist includes venueCountry without widening its projected fields', async () => {
  const [attributes] = await scanAttributes('../infra/meetup-events.yaml');
  assert.deepEqual([...attributes].sort(), [...meetupEventAttributes].sort());
  assert.ok(attributes.includes('city'));
  assert.ok(attributes.includes('venueCountry'));
});
