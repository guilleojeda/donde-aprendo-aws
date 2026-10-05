import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LEARNING_PATHS, resolveLearningPaths, articlePathNavigation, learningPathHref } from '../src/lib/learning-paths.mjs';
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
  assert.equal(searchIndex(index, 'serverless', 'path')[0].url, '/recorridos/serverless/');
});

test('each learning path has a stable dedicated detail URL', () => {
  for (const path of LEARNING_PATHS) {
    assert.equal(learningPathHref(path.id), `/recorridos/${path.id}/`);
  }
});

test('thematic paths end with their matching collection and route-selector links', () => {
  const collections = Object.fromEntries(LEARNING_PATHS.map((path) => [path.id, path.relatedCollection]));
  assert.deepEqual(collections, {
    'primeros-pasos': { href: '/aprender/', label: 'Explora todos los recursos para aprender AWS' },
    serverless: { href: '/aprender/serverless/', label: 'Explora más recursos de serverless' },
    seguridad: { href: '/aprender/seguridad/', label: 'Explora más recursos de seguridad en AWS' },
    'ia-generativa': { href: '/aprender/ia-generativa/', label: 'Explora más recursos de IA generativa en AWS' },
  });
  const detailTemplate = readFileSync(new URL('../src/pages/recorridos/[slug].astro', import.meta.url), 'utf8');
  assert.match(detailTemplate, /href=\{path\.relatedCollection\.href\}[\s\S]*href="\/recorridos\/">Elige otra ruta/);
});

test('article continuation follows the next available published step', () => {
  const complete = resolveLearningPaths(LEARNING_PATHS, uniqueResources, uniquePosts);
  const current = 'aws-fundamentos-guia-de-inicio-rapido';
  const [navigation] = articlePathNavigation(complete, current);
  assert.equal(navigation.href, '/recorridos/primeros-pasos/');
  assert.equal(navigation.nextStep.href, '/aprender/#resource-catalog-08facfe178c25c04cfb53fb1e179894a');

  const withdrawn = resolveLearningPaths(LEARNING_PATHS, [], uniquePosts);
  assert.equal(articlePathNavigation(withdrawn, current)[0].nextStep.href,
    '/blog/aprender-aws-gratis-recursos-y-comunidad/');
});

test('final articles have a return link without a fabricated next step', () => {
  const paths = resolveLearningPaths(LEARNING_PATHS, uniqueResources, uniquePosts);
  const [navigation] = articlePathNavigation(paths, 'aprender-aws-gratis-recursos-y-comunidad');
  assert.equal(navigation.href, '/recorridos/primeros-pasos/');
  assert.equal(navigation.nextStep, null);
  assert.deepEqual(articlePathNavigation(paths, 'article-outside-the-paths'), []);
});

test('an article can offer continuation in each path it belongs to', () => {
  const paths = resolveLearningPaths(LEARNING_PATHS, uniqueResources, uniquePosts);
  const first = paths[0];
  const navigation = articlePathNavigation([...paths, { ...first, id: 'another-path', title: 'Another path' }],
    'aws-fundamentos-guia-de-inicio-rapido');
  assert.deepEqual(navigation.map((entry) => entry.href),
    ['/recorridos/primeros-pasos/', '/recorridos/another-path/']);
});
