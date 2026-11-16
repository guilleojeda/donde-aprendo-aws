import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalCreatorPath,
  canonicalCreatorSeriesPath,
  isPublicCreator,
  isPublicCreatorSeries,
  safeCreatorSocialUrl,
  visibleCreatorSeriesChapterCount,
} from '../src/lib/creator-public.mjs';

test('creator and Series public visibility share the same visible chapter rule', () => {
  const published = { published: true, hidden: false };
  const hidden = { published: true, hidden: true };
  const draft = { published: false, hidden: false };
  const chapters = [{ hidden: true }, { hidden: false }];

  assert.equal(isPublicCreator(published), true);
  assert.equal(isPublicCreator(hidden), false);
  assert.equal(isPublicCreator(draft), false);
  assert.equal(visibleCreatorSeriesChapterCount(chapters), 1,
    'owner counts remain useful even when the profile is private');
  assert.equal(isPublicCreatorSeries(published, visibleCreatorSeriesChapterCount(chapters)), true);
  assert.equal(isPublicCreatorSeries(hidden, visibleCreatorSeriesChapterCount(chapters)), false);
  assert.equal(isPublicCreatorSeries(published, visibleCreatorSeriesChapterCount([{ hidden: true }])), false);
});

test('canonical creator and Series paths encode their exact slug segments once', () => {
  assert.equal(canonicalCreatorPath('ada-cloud'), '/c/ada-cloud/');
  assert.equal(canonicalCreatorPath('ada-cloud', '/series/intro/'), '/c/ada-cloud/series/intro/');
  assert.equal(canonicalCreatorSeriesPath('ada/cloud', 'serie inicial'), '/c/ada%2Fcloud/series/serie%20inicial/');
});

test('social links share the HTTP(S), no-credentials rule while preserving link href formatting', () => {
  assert.equal(safeCreatorSocialUrl('https://example.test/newsletter'), 'https://example.test/newsletter');
  assert.equal(safeCreatorSocialUrl('http://example.test'), 'http://example.test/');
  assert.equal(safeCreatorSocialUrl('javascript:alert(1)'), undefined);
  assert.equal(safeCreatorSocialUrl('https://user:secret@example.test'), undefined);
  assert.equal(safeCreatorSocialUrl('https://example.test/path '), undefined);
});
