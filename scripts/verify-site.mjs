import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const production = process.env.PUBLIC_PRODUCTION === 'true';
const dist = resolve('dist');
const routes = JSON.parse(readFileSync('tests/fixtures/blog-routes.json', 'utf8'));
const pagePaths = ['index.html', 'blog/index.html', ...routes.map(({ slug }) => `blog/${slug}/index.html`)];
const read = (path) => readFileSync(resolve(dist, path), 'utf8');

const sitemap = read('sitemap.xml');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedLocations = [
  'https://dondeaprendoaws.com/',
  'https://dondeaprendoaws.com/blog/',
  ...routes.map(({ slug }) => `https://dondeaprendoaws.com/blog/${slug}/`),
].sort();
assert.deepEqual([...locations].sort(), expectedLocations);
assert.equal(new Set(locations).size, 198, 'Sitemap URLs must be unique.');

const robots = read('robots.txt');
assert.equal(robots, 'User-agent: *\nAllow: /\nSitemap: https://dondeaprendoaws.com/sitemap.xml\n');

assert.ok(existsSync(resolve(dist, 'assets/analytics.js')), 'Analytics module must be deployed.');
for (const path of pagePaths) {
  const html = read(path);
  const analyticsTags = [...html.matchAll(/<script\b[^>]*\bsrc="\/assets\/analytics\.js"[^>]*>/g)];
  assert.equal(analyticsTags.length, production ? 1 : 0, `Analytics tag count: ${path}`);
  assert.equal(html.includes('<meta name="robots" content="noindex, nofollow"'), !production, `Indexing mode: ${path}`);
}

const notFound = read('404.html');
assert.match(notFound, /<meta name="robots" content="noindex, nofollow"/);
console.log(`Verified ${production ? 'production' : 'preview'} indexing, Analytics tags, and 198 sitemap URLs.`);
