import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rules = JSON.parse(await readFile(new URL('../config/amplify-custom-rules.json', import.meta.url), 'utf8'));

const matchingRule = (source, status) => rules.find((rule) => rule.source === source && rule.status === status);

test('Amplify retains canonical hostname redirects before static route rewrites', () => {
  const www = matchingRule('https://www.dondeaprendoaws.com', '301');
  const defaultHost = matchingRule('https://main.d33kh9d3cyassq.amplifyapp.com', '301');
  assert.deepEqual(www, {
    source: 'https://www.dondeaprendoaws.com',
    target: 'https://dondeaprendoaws.com',
    status: '301',
  });
  assert.deepEqual(defaultHost, {
    source: 'https://main.d33kh9d3cyassq.amplifyapp.com',
    target: 'https://dondeaprendoaws.com',
    status: '301',
  });
  assert.ok(rules.indexOf(www) < rules.findIndex(({ status }) => status === '200'));
  assert.ok(rules.indexOf(defaultHost) < rules.findIndex(({ status }) => status === '200'));
});

test('all prerendered route families normalize canonical slashes and rewrite to index files', () => {
  const routes = [
    { family: 'blog', parameter: 'slug' },
    { family: 'aprender', parameter: 'collection' },
    { family: 'creadores', parameter: 'collection' },
    { family: 'comunidades', parameter: 'country' },
    { family: 'eventos', parameter: 'country' },
    { family: 'recorridos', parameter: 'slug' },
  ];

  for (const { family, parameter } of routes) {
    assert.deepEqual(matchingRule(`/${family}`, '301')?.target, `/${family}/`);
    assert.deepEqual(matchingRule(`/${family}/<${parameter}>`, '301')?.target, `/${family}/<${parameter}>/`);
    assert.deepEqual(matchingRule(`/${family}/`, '200')?.target, `/${family}/index.html`);
    assert.deepEqual(matchingRule(`/${family}/<${parameter}>/`, '200')?.target, `/${family}/<${parameter}>/index.html`);
  }

  assert.deepEqual(matchingRule('/buscar', '301')?.target, '/buscar/');
  assert.deepEqual(matchingRule('/buscar/', '200')?.target, '/buscar/index.html');
  assert.deepEqual(matchingRule('/', '200')?.target, '/index.html');
});

test('custom rules contain no catchall 404 rewrite or article-specific route', () => {
  assert.ok(!rules.some(({ source, status }) => source === '/<*>' || status === '404-200'));
  assert.ok(!rules.some(({ source }) => /^\/blog\/[^<>/]+\/?$/u.test(source)));
  assert.ok(rules.every(({ target }) => !target.includes('?')), 'Redirect targets leave query parameters available to Amplify forwarding.');
});
