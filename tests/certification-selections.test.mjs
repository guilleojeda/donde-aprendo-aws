import assert from 'node:assert/strict';
import test from 'node:test';

// Proposed public content resolver for the approved Git/catalog boundary.
// No product stub is added during planning. A missing module is an expected
// initial failure, distinct from a malformed assertion or a skipped case.
const resolveSelections = async (selections, resources = [], posts = []) => {
  const { resolveCertificationSelections } = await import('../src/lib/certifications.mjs');
  return resolveCertificationSelections(selections, resources, posts);
};
const selection = {
  type: 'resource', id: 'reviewed-course', examCode: 'CLF-C02',
  purpose: 'Repasar conceptos de nube.', scope: 'Repaso parcial; no cubre todo el examen.',
  reviewedAt: '2026-10-21', reviewedUrl: 'https://example.com/course',
};
const resource = {
  id: 'reviewed-course', kind: 'content', format: 'Curso',
  title: 'Título del catálogo publicado', description: 'Descripción publicada.',
  url: 'https://example.com/course',
};
const blogSelection = {
  type: 'blog', id: 'study-guide', examCode: 'CLF-C02',
  purpose: 'Ordenar el estudio.', scope: 'Guía del sitio para profundizar.', reviewedAt: '2026-10-22',
};
const post = { id: 'study-guide', data: { title: 'Título editorial del artículo' }, body: '' };

test('selected resources use their published title and actual destination while preserving review context', async () => {
  const [resolved] = await resolveSelections([selection], [resource]);
  assert.equal(resolved.title, resource.title);
  assert.equal(resolved.href, resource.url);
  for (const key of ['purpose', 'scope', 'examCode', 'reviewedAt']) assert.equal(resolved[key], selection[key]);

  const [updated] = await resolveSelections([selection], [{ ...resource, title: 'Título actualizado por el editor' }]);
  assert.equal(updated.title, 'Título actualizado por el editor', 'Git must not own a second resource title.');
  const ordered = await resolveSelections([blogSelection, selection], [resource], [post]);
  assert.deepEqual(ordered.map(({ id }) => id), [blogSelection.id, selection.id], 'Explicit editorial order is preserved.');
});

test('withdrawal removes the selected resource and its review context without breaking other selections', async () => {
  const resolved = await resolveSelections([selection, blogSelection], [], [post]);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].href, '/blog/study-guide/');
  assert.ok(!JSON.stringify(resolved).includes(selection.reviewedUrl));
  assert.ok(!JSON.stringify(resolved).includes(selection.scope));
});

test('a changed destination cannot inherit the review of the old URL', async () => {
  const changed = { ...resource, url: 'https://example.com/a-different-course' };
  assert.deepEqual(await resolveSelections([selection], [changed]), []);
  const [reviewedAgain] = await resolveSelections([
    { ...selection, reviewedUrl: changed.url, reviewedAt: '2026-10-22' },
  ], [changed]);
  assert.equal(reviewedAgain.href, changed.url);
  assert.equal(reviewedAgain.reviewedAt, '2026-10-22');
});

test('an unrelated catalog match is not automatically added to an explicit selection', async () => {
  const unrelated = { ...resource, id: 'unselected-course', title: 'Curso completo CLF-C02' };
  const resolved = await resolveSelections([selection], [unrelated, resource]);
  assert.deepEqual(resolved.map(({ id }) => id), [selection.id]);
  assert.deepEqual(await resolveSelections([], [resource, unrelated]), []);
});

test('a record repurposed as a creator or community no longer resolves as study material', async () => {
  assert.deepEqual(await resolveSelections([selection], [{ ...resource, kind: 'source' }]), []);
  assert.deepEqual(await resolveSelections([selection], [{ ...resource, kind: 'community' }]), []);
});

test('blog titles and internal destinations come from the article owner', async () => {
  const [resolved] = await resolveSelections([blogSelection], [], [post]);
  assert.equal(resolved.title, post.data.title);
  assert.equal(resolved.href, '/blog/study-guide/');
  assert.equal(resolved.scope, blogSelection.scope);
});

test('a missing Git article is a configuration error rather than a legitimate catalog withdrawal', async () => {
  const { resolveCertificationSelections } = await import('../src/lib/certifications.mjs');
  await assert.rejects(async () => resolveCertificationSelections([blogSelection], [], []),
    /missing.*(?:blog|article)|(?:blog|article).*missing/iu);
});

test('invalid local selection references fail explicitly instead of fabricating a target', async () => {
  const { resolveCertificationSelections } = await import('../src/lib/certifications.mjs');
  for (const invalid of [{ ...selection, type: 'unknown' }, { ...selection, id: '' }]) {
    await assert.rejects(async () => resolveCertificationSelections([invalid], [resource], []), /invalid|unknown|required/iu);
  }
});
