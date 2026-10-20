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

test('prerendered route families keep index rewrites ordered and leave event routing native', () => {
  const routes = [
    { family: 'blog', parameter: 'slug', nativeDetailRouting: false },
    { family: 'aprender', parameter: 'collection', nativeDetailRouting: false },
    { family: 'creadores', parameter: 'collection', nativeDetailRouting: false },
    { family: 'comunidades', parameter: 'country', nativeDetailRouting: false },
    { family: 'eventos', parameter: 'country', nativeDetailRouting: true },
    { family: 'recorridos', parameter: 'slug', nativeDetailRouting: false },
  ];

  for (const { family, parameter, nativeDetailRouting } of routes) {
    const indexRedirect = matchingRule(`/${family}`, '301');
    const indexRewrite = matchingRule(`/${family}/`, '200');
    const detailRedirect = matchingRule(`/${family}/<${parameter}>`, '301');
    const detailRewrite = matchingRule(`/${family}/<${parameter}>/`, '200');
    assert.deepEqual(indexRedirect?.target, `/${family}/`);
    assert.deepEqual(indexRewrite?.target, `/${family}/index.html`);
    assert.deepEqual(detailRewrite?.target, `/${family}/<${parameter}>/index.html`);
    if (nativeDetailRouting) {
      assert.equal(detailRedirect, undefined,
        'event detail no-slash requests must reach Astro native routing so .ics files are not treated as directories');
    } else {
      assert.deepEqual(detailRedirect?.target, `/${family}/<${parameter}>/`);
      assert.ok(rules.indexOf(indexRewrite) < rules.indexOf(detailRedirect),
        `${family} index rewrite must win before an empty parameter can redirect it`);
    }
  }

  assert.deepEqual(matchingRule('/buscar', '301')?.target, '/buscar/');
  assert.deepEqual(matchingRule('/buscar/', '200')?.target, '/buscar/index.html');
  assert.deepEqual(matchingRule('/', '200')?.target, '/index.html');

  assert.equal(matchingRule('/eventos/<event>.ics', '200'), undefined,
    'Amplify does not support a named placeholder with a filename suffix; native routing must receive .ics requests');
  assert.equal(matchingRule('/eventos/<country>', '301'), undefined,
    'event detail no-slash normalization must remain native so extension-bearing paths are not redirected to a slash');
});

test('custom rules contain no catchall 404 rewrite or article-specific route', () => {
  assert.ok(!rules.some(({ source, status }) => source === '/<*>' || status === '404-200'));
  assert.ok(!rules.some(({ source }) => /^\/blog\/[^<>/]+\/?$/u.test(source)));
  assert.ok(rules.every(({ target }) => !target.includes('?')), 'Redirect targets leave query parameters available to Amplify forwarding.');
});
