import assert from 'node:assert/strict';
import test from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { loadCatalog } from '../src/lib/catalog.mjs';
import { startHostingReleaseDynamo } from './fixtures/hosting-release-dynamodb.mjs';

test('the release build fixture composes the real SDK, projected table reader and public catalog', async (t) => {
  const resource = {
    id: 'release-fixture-resource', title: 'Release fixture resource', url: 'https://example.test/aws',
    description: 'A selected public resource.', category: 'Artículo', kind: 'content',
    format: 'Artículo', topics: ['Seguridad'], order: 1, featured: false,
  };
  const runtimeEnvironment = { CATALOG_TABLE: 'release-fixture-catalog', CREATOR_PROFILES_TABLE: 'release-fixture-profiles' };
  const fixture = await startHostingReleaseDynamo({ runtimeEnvironment, catalog: {
    items: [{ ...resource, published: true, directoryControl: 'creator', privateNotes: 'not-public' }],
    creators: [{
      id: 'release-fixture-creator', schemaVersion: 2, version: 1,
      displayName: 'Release Fixture', slug: 'release-fixture', published: true, hidden: false,
      placements: { selected: { resourceId: resource.id, selectedForDirectory: true } },
      order: { featured: [], ordinary: ['selected'] }, series: {}, privateOwner: 'not-public',
    }],
  } });
  t.after(() => fixture.close());
  const rawClient = new DynamoDBClient({ endpoint: fixture.endpoint, region: 'us-east-1',
    credentials: { accessKeyId: 'fixture-invalid', secretAccessKey: 'fixture-invalid' } });
  t.after(() => rawClient.destroy());
  const client = DynamoDBDocumentClient.from(rawClient);
  const catalog = await loadCatalog({ fixturePath: '', tableName: runtimeEnvironment.CATALOG_TABLE,
    creatorTableName: runtimeEnvironment.CREATOR_PROFILES_TABLE, docClient: client });
  assert.deepEqual(catalog, [resource], 'Physical creator aggregates and selected resources survive the real projection boundary.');
  fixture.assertBuildReads();
  assert.ok(fixture.scans.every(({ fields }) => !fields.some((name) => ['privateOwner', 'privateNotes'].includes(name))),
    'The real scans do not ask for fixture-private fields.');
});
