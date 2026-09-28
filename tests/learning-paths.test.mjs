import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEARNING_PATHS, resolveLearningPaths } from '../src/lib/learning-paths.mjs';
import { buildSearchIndex, searchIndex } from '../src/lib/unified-search.mjs';

const posts = LEARNING_PATHS.flatMap((path) => path.steps)
  .filter((step) => step.type === 'blog')
  .map((step) => ({ id: step.id, data: { title: `Blog ${step.id}`, description: 'Guía AWS', publishedAt: '2024-01-01' }, body: '' }));
const uniquePosts = [...new Map(posts.map((post) => [post.id, post])).values()];
const resources = LEARNING_PATHS.flatMap((path) => path.steps)
  .filter((step) => step.type === 'resource')
  .map((step) => ({ id: step.id, kind: 'content', title: `Recurso ${step.id}`, format: 'Video' }));
const uniqueResources = [...new Map(resources.map((resource) => [resource.id, resource])).values()];

test('every editorial path resolves blog articles and published content cards', () => {
  const resolved = resolveLearningPaths(LEARNING_PATHS, uniqueResources, uniquePosts);
  assert.equal(resolved.length, 4);
  for (const path of resolved) {
    assert.equal(path.steps.length, LEARNING_PATHS.find((original) => original.id === path.id).steps.length);
    assert.ok(path.steps.some((step) => step.type === 'blog'));
    assert.ok(path.steps.some((step) => step.type === 'resource'));
    assert.ok(path.steps.every((step) => step.href.startsWith('/blog/') || step.href.startsWith('/aprender/#resource-')));
  }
});

test('withdrawn catalog entries disappear without breaking a path or the build', () => {
  const paths = resolveLearningPaths(LEARNING_PATHS, [], uniquePosts);
  assert.ok(paths.every((path) => path.steps.length >= 2));
  assert.ok(paths.every((path) => path.steps.every((step) => step.type === 'blog')));
  assert.throws(() => resolveLearningPaths(LEARNING_PATHS, uniqueResources, []), /Missing blog article/);
});

test('learning paths appear as searchable internal destinations', () => {
  const index = buildSearchIndex(uniquePosts, [], LEARNING_PATHS);
  assert.equal(index.filter((entry) => entry.type === 'path').length, 4);
  assert.equal(searchIndex(index, 'serverless', 'path')[0].url, '/recorridos/#serverless');
});
