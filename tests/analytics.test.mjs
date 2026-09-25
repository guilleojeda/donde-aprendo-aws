import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync('public/assets/analytics.js', 'utf8');

test('preview hosts do not initialize or load Google Analytics', () => {
  const appended = [];
  const window = { location: { hostname: 'main.d33kh9d3cyassq.amplifyapp.com' } };
  const document = { head: { appendChild: (tag) => appended.push(tag) }, createElement: () => ({}) };

  runInNewContext(script, { window, document, Date });
  assert.equal(window.dataLayer, undefined);
  assert.deepEqual(appended, []);
});

test('production domain loads and configures the existing GA4 property once', () => {
  const appended = [];
  const window = { location: { hostname: 'dondeaprendoaws.com' } };
  const document = { head: { appendChild: (tag) => appended.push(tag) }, createElement: () => ({}) };
  const context = { window, document, Date };

  runInNewContext(script, context);
  runInNewContext(script, context);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-3NXS6QFKHZ');
  assert.equal(appended[0].async, true);
  assert.equal(window.dataLayer.length, 2);
  assert.deepEqual(Array.from(window.dataLayer[1]), ['config', 'G-3NXS6QFKHZ']);
});
