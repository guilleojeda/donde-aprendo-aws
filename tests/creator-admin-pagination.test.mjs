import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADMIN_RESOURCE_PAGE_SIZE,
  adminResourcePageHref,
  selectAdminResources,
} from '../src/lib/creator-admin-pagination.mjs';

const resources = Array.from({ length: 120 }, (_, index) => {
  const id = `resource-${String(index).padStart(4, '0')}`;
  const approval = index % 4 === 0 ? 'pending' : index % 4 === 1 ? 'approved' : index % 4 === 2 ? 'revoked' : 'approved';
  return {
    id,
    title: index === 119 ? 'Taller de Kubernetes' : `Recurso ${index}`,
    url: index === 117 ? 'https://example.com/?campaign=aws-unique-117' : `https://example.com/${index}`,
    directoryApproval: approval,
    published: approval === 'approved',
    hidden: index % 10 === 0,
  };
});

test('admin resources default to pending and render only one 25-record page', () => {
  assert.equal(ADMIN_RESOURCE_PAGE_SIZE, 25);
  const first = selectAdminResources(resources, new URLSearchParams());
  assert.equal(first.state, 'pending');
  assert.equal(first.resources.length, 25);
  assert.equal(first.totalResources, 120);
  assert.equal(first.totalFiltered, 30);
  assert.equal(first.pageCount, 2);
  assert.equal(first.firstVisible, 1);
  assert.equal(first.lastVisible, 25);
  assert.ok(first.resources.every((resource) => resource.directoryApproval === 'pending'));

  const second = selectAdminResources(resources, new URLSearchParams('state=pending&page=2'));
  assert.equal(second.resources.length, 5);
  assert.equal(second.page, 2);
  assert.equal(second.firstVisible, 26);
  assert.equal(second.lastVisible, 30);
});

test('admin search matches exact IDs, titles, and URLs and keeps approved resources accessible', () => {
  const byId = selectAdminResources(resources, new URLSearchParams('q=resource-0119&state=all'));
  assert.deepEqual(byId.resources.map(({ id }) => id), ['resource-0119']);
  assert.equal(byId.query, 'resource-0119');

  const byTitle = selectAdminResources(resources, new URLSearchParams('q=kubernetes&state=all'));
  assert.deepEqual(byTitle.resources.map(({ id }) => id), ['resource-0119']);

  const byUrl = selectAdminResources(resources, new URLSearchParams('q=aws-unique-117&state=approved'));
  assert.deepEqual(byUrl.resources.map(({ id }) => id), ['resource-0117']);
  assert.equal(byUrl.stateCounts.approved, 1);

  const approved = selectAdminResources(resources, new URLSearchParams('state=approved&page=2'));
  assert.equal(approved.totalFiltered, 60);
  assert.equal(approved.resources.length, 25);
});

test('admin pagination clamps invalid pages and keeps search and state in navigation links', () => {
  const page = selectAdminResources(resources, new URLSearchParams('q=resource&state=approved&page=999'));
  assert.equal(page.page, page.pageCount);
  assert.equal(page.resources.length, 10);
  assert.equal(page.state, 'approved');

  const href = adminResourcePageHref({ query: 'AWS + curso', state: 'approved', page: 2 });
  const parsed = new URL(href, 'https://example.test');
  assert.equal(parsed.pathname, '/cuenta/administracion/');
  assert.equal(parsed.searchParams.get('q'), 'AWS + curso');
  assert.equal(parsed.searchParams.get('state'), 'approved');
  assert.equal(parsed.searchParams.get('page'), '2');
  assert.equal(parsed.hash, '#admin-resources');
});
