import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { siteOutputRoot } from '../../scripts/lib/site-output.mjs';

const read = (relativePath) => readFileSync(join(siteOutputRoot, relativePath), 'utf8');
const articleBody = (slug) => read(`blog/${slug}/index.html`)
  .match(/<article class="blog-article__body">([\s\S]*?)<\/article>/u)?.[1] ?? '';
const text = (html) => html.replace(/<[^>]*>/gu, '').replace(/&(?:amp|quot|apos|lt|gt|nbsp);/gu, (entity) => ({
  '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ',
}[entity] ?? entity));
const hrefForAnchorText = (html, label) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)]
  .find(([, , contents]) => text(contents).trim() === label)?.[1];

test('the built article search uses visible headings and excludes fenced HTML headings', () => {
  const codeArticle = articleBody('10-laboratorios-practicos-de-aws-para-principiantes');
  const rawHeadingArticle = articleBody('estrategias-de-recuperacion-de-desastres-en-aws');
  const index = JSON.parse(read('search-index.json'));
  const codeEntry = index.find(({ url }) => url === '/blog/10-laboratorios-practicos-de-aws-para-principiantes/');
  const rawHeadingEntry = index.find(({ url }) => url === '/blog/estrategias-de-recuperacion-de-desastres-en-aws/');
  assert.ok(codeArticle && rawHeadingArticle && codeEntry && rawHeadingEntry, 'built article pages and search entries exist');
  assert.match(codeArticle, /<pre\b[\s\S]*<code\b[\s\S]*Hola desde AWS[\s\S]*<\/code>[\s\S]*<\/pre>/u,
    'the fenced HTML example remains visible in its code block');
  assert.doesNotMatch(codeArticle, /<h1\b[^>]*>\s*Hola desde AWS\s*<\/h1>/u,
    'the fenced HTML example is not an article heading in rendered HTML');
  assert.doesNotMatch(codeEntry.search ?? '', /Hola desde AWS/u,
    'the downloadable index does not search a heading phrase that only exists in fenced code');
  assert.match(rawHeadingArticle, /<h2\b[^>]*>Alta disponibilidad y recuperación ante desastres cubren fallas distintas<\/h2>/u,
    'a supported raw HTML heading is visible in the rendered article');
  assert.match(rawHeadingEntry.search ?? '', /Alta disponibilidad y recuperación ante desastres cubren fallas distintas/u,
    'the downloadable index retains the visible raw HTML heading');
});

test('the built article country links retain canonical destinations whose public routes and targets exist', () => {
  const communityArticle = articleBody('amazon-cloudfront-comprendiendo-el-cdn-de-aws');
  const eventArticle = articleBody('amazon-redshift-el-poder-del-data-warehousing-en-aws');
  const communityHref = '/comunidades/panama/#resource-meetup-22667715';
  const eventHref = 'https://dondeaprendoaws.com/eventos/panama/#event-meetup-event-316732293';

  const communityRoute = 'comunidades/panama/index.html';
  const eventRoute = 'eventos/panama/index.html';
  const communityRouteHtml = existsSync(join(siteOutputRoot, communityRoute)) ? read(communityRoute) : '';
  const eventRouteHtml = existsSync(join(siteOutputRoot, eventRoute)) ? read(eventRoute) : '';
  if (communityRouteHtml.includes('id="resource-meetup-22667715"')) {
    assert.equal(hrefForAnchorText(communityArticle, 'comunidad en Panamá'), communityHref,
      'an eligible community keeps its exact authored country destination');
  } else if (!communityRouteHtml) {
    const globalRoute = read('comunidades/index.html');
    const fragment = globalRoute.includes('id="resource-meetup-22667715"') ? '#resource-meetup-22667715' : '';
    assert.equal(hrefForAnchorText(communityArticle, 'comunidad en Panamá'), `/comunidades/${fragment}`,
      'a withdrawn community country falls back to the global directory with a still-valid target');
  }
  if (eventRouteHtml.includes('id="event-meetup-event-316732293"')) {
    assert.equal(hrefForAnchorText(eventArticle, 'Agenda de Panamá'), eventHref,
      'an eligible event country keeps its exact authored country destination');
  } else if (!eventRouteHtml) {
    const globalRoute = read('eventos/index.html');
    const fragment = globalRoute.includes('id="event-meetup-event-316732293"') ? '#event-meetup-event-316732293' : '';
    assert.equal(hrefForAnchorText(eventArticle, 'Agenda de Panamá'), `/eventos/${fragment}`,
      'a withdrawn event country falls back to the global agenda with a still-valid target');
  }
});
