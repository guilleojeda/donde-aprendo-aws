import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test as browserTest, expect } from '../fixtures/creator-browser-test.mjs';
import { startCreatorBrowserApp } from '../fixtures/creator-browser-app.mjs';

function appWithCatalog(catalog, options = {}) {
  return async ({}, use) => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'public-catalog-identities-'));
    let app;
    try {
      const catalogFixture = path.join(temporaryDirectory, 'catalog.json');
      // Keep the raw rows intact so the production catalog projection owns validation and publication.
      await writeFile(catalogFixture, `${JSON.stringify(catalog, null, 2)}\n`);
      app = await startCreatorBrowserApp({ catalogFixture, ...options });
      await use(app);
    } finally {
      try {
        await app?.close();
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    }
  };
}

function resource({ id, title, kind = 'content', order = 1, ...extra }) {
  const format = kind === 'community' ? 'User Group' : kind === 'source' ? 'Blog' : 'Artículo';
  const category = kind === 'community' ? 'Comunidad' : kind === 'source' ? 'Blog' : 'Otros';
  return {
    id,
    title,
    url: `https://resources.example.invalid/${encodeURIComponent(id)}`,
    description: `Descripción pública de ${title}.`,
    category,
    order,
    featured: false,
    kind,
    format,
    topics: ['Comunidad'],
    published: true,
    submitterEmail: 'private-contact-secret@example.invalid',
    submitterName: 'private-account-secret',
    ...extra,
  };
}

function event({ id, title, order = 1, ...extra }) {
  return {
    recordType: 'event',
    id,
    title,
    description: `Descripción pública de ${title}.`,
    startsAt: `2099-05-${String(order).padStart(2, '0')}T18:00:00-03:00`,
    endsAt: `2099-05-${String(order).padStart(2, '0')}T20:00:00-03:00`,
    timeZone: 'America/Argentina/Buenos_Aires',
    organizer: 'Organizador alternativo',
    mode: 'in-person',
    place: 'Auditorio principal',
    registrationUrl: `https://events.example.invalid/${encodeURIComponent(id)}`,
    published: true,
    submitterEmail: 'private-contact-secret@example.invalid',
    submitterName: 'private-account-secret',
    ...extra,
  };
}

function reportDetails(href) {
  const parsed = new URL(href);
  return {
    protocol: parsed.protocol,
    recipient: parsed.pathname,
    subject: parsed.searchParams.get('subject'),
    body: parsed.searchParams.get('body'),
  };
}

function assertSafeReportEnvelope(details) {
  assert.equal(details.protocol, 'mailto:');
  assert.equal(details.recipient, 'contact@dondeaprendoaws.com');
  assert.equal(details.subject, 'Reporte de enlace');
}

function resourceFragment(id) {
  return `#resource-${encodeURIComponent(id).replaceAll('%3A', ':')}`;
}

function identityBoundaryCatalog() {
  const id = `${'R'.repeat(127)}😀`;
  const title = `${'T'.repeat(239)}😀`;
  return {
    id,
    title,
    catalog: [
      resource({ id, title, order: 3 }),
      resource({ id: 'ordinary-report-control', title: 'Recurso ordinario visible', order: 2 }),
      resource({ id: 'event-community', title: 'Comunidad organizadora', kind: 'community', order: 1, country: 'AR', city: 'Córdoba' }),
      event({
        id: 'event_unicode_boundary',
        title,
        order: 4,
        country: 'AR',
        communityId: 'event-community',
      }),
    ],
  };
}

function longIdentityCatalog() {
  const identities = [
    `${'A'.repeat(130)}`,
    '😀'.repeat(64),
  ];
  assert.equal(Buffer.byteLength(identities[1], 'utf8'), 256);
  return {
    identities,
    catalog: [
      resource({ id: 'ordinary-report-control', title: 'Recurso ordinario visible', order: 3 }),
      ...identities.map((id, index) => resource({
        id,
        title: `Recurso largo ${index + 1}`,
        order: 2 - index,
      })),
    ],
  };
}

function sourceReferenceCatalog() {
  const sourceId = `source:${'s'.repeat(140)}`;
  assert.ok(sourceId.length > 128);
  const sourceTitle = 'Fuente AWS con identidad larga';
  return {
    sourceId,
    sourceTitle,
    catalog: [
      resource({ id: sourceId, title: sourceTitle, kind: 'source', order: 1 }),
      resource({
        id: 'content-related-to-long-source',
        title: 'Artículo relacionado con la fuente larga',
        order: 3,
        sourceId,
      }),
    ],
  };
}

function communityIdentity() {
  const id = `community:${'é'.repeat(123)}`;
  assert.equal(Buffer.byteLength(id, 'utf8'), 256);
  return { id, title: 'Comunidad de Córdoba con identidad larga' };
}

function communityReferenceCatalog() {
  const { id: communityId, title: communityTitle } = communityIdentity();
  return {
    communityId,
    communityTitle,
    catalog: [
      resource({ id: communityId, title: communityTitle, kind: 'community', order: 1, country: 'AR', city: 'Córdoba' }),
      resource({
        id: 'content-related-to-long-community',
        title: 'Artículo relacionado con la comunidad larga',
        order: 2,
        communityId,
      }),
    ],
  };
}

function eventCommunityCatalog() {
  const { id: communityId, title: communityTitle } = communityIdentity();
  const otherCommunityId = 'community-other';
  return {
    communityId,
    otherCommunityId,
    communityTitle,
    catalog: [
      resource({ id: communityId, title: communityTitle, kind: 'community', order: 1, country: 'AR', city: 'Córdoba' }),
      resource({ id: otherCommunityId, title: 'Comunidad de Mendoza', kind: 'community', order: 2, country: 'AR', city: 'Mendoza' }),
      event({
        id: 'event_related_to_long_community',
        title: 'Encuentro de la comunidad larga',
        order: 5,
        communityId,
        country: undefined,
        city: undefined,
      }),
      event({
        id: 'event_other_community_may06',
        title: 'Encuentro de la otra comunidad',
        order: 6,
        communityId: otherCommunityId,
        country: undefined,
        city: undefined,
      }),
    ],
  };
}

function invalidReferenceControlCatalog() {
  return [
    resource({ id: 'visible-community', title: 'Comunidad pública válida', kind: 'community', order: 1, country: 'AR', city: 'Córdoba' }),
    resource({ id: 'hidden-community', title: 'Comunidad oculta de prueba', kind: 'community', order: 2, country: 'AR', hidden: true }),
    resource({ id: 'wrong-kind-source', title: 'Fuente pública de tipo incorrecto', kind: 'source', order: 3 }),
    resource({ id: 'wrong-kind-community', title: 'Comunidad pública de tipo incorrecto', kind: 'community', order: 4, country: 'AR' }),
    resource({
      id: 'content-missing-community', title: 'Artículo con comunidad inexistente', order: 5,
      communityId: 'community-that-does-not-exist',
    }),
    resource({
      id: 'content-hidden-community', title: 'Artículo con comunidad oculta', order: 6,
      communityId: 'hidden-community',
    }),
    resource({
      id: 'content-community-target-is-source', title: 'Artículo con comunidad de tipo incorrecto', order: 7,
      communityId: 'wrong-kind-source',
    }),
    resource({
      id: 'content-source-target-is-community', title: 'Artículo con fuente de tipo incorrecto', order: 8,
      sourceId: 'wrong-kind-community',
    }),
    event({
      id: 'event-missing-community', title: 'Evento con comunidad inexistente', order: 9,
      communityId: 'community-that-does-not-exist', country: 'AR',
    }),
    event({
      id: 'event-hidden-community', title: 'Evento con comunidad oculta', order: 9,
      communityId: 'hidden-community', country: 'AR',
    }),
    event({
      id: 'event-community-target-is-source', title: 'Evento con comunidad de tipo incorrecto', order: 9,
      communityId: 'wrong-kind-source', country: 'AR',
    }),
  ];
}

const identityBoundary = identityBoundaryCatalog();
const boundaryTest = browserTest.extend({
  app: [appWithCatalog(identityBoundary.catalog), { scope: 'worker' }],
});

const longIdentities = longIdentityCatalog();
const longIdentityTest = browserTest.extend({
  app: [appWithCatalog(longIdentities.catalog), { scope: 'worker' }],
});

const sourceReference = sourceReferenceCatalog();
const sourceReferenceTest = browserTest.extend({
  app: [appWithCatalog(sourceReference.catalog), { scope: 'worker' }],
});

const communityReference = communityReferenceCatalog();
const communityReferenceTest = browserTest.extend({
  app: [appWithCatalog(communityReference.catalog), { scope: 'worker' }],
});

const eventCommunity = eventCommunityCatalog();
const eventCommunityHostname = 'catalog-identities.example.com';
const eventCommunityTest = browserTest.extend({
  app: [appWithCatalog(eventCommunity.catalog, { hostname: eventCommunityHostname }), { scope: 'worker' }],
});
// twitter-text shortens public-form URLs, but not numeric loopback URLs. Keep
// the real share formatter and long ID, and change only local browser transport.
eventCommunityTest.use({
  launchOptions: {
    args: [`--host-resolver-rules=MAP ${eventCommunityHostname} 127.0.0.1`, '--no-proxy-server'],
  },
});

const invalidReferenceTest = browserTest.extend({
  app: [appWithCatalog(invalidReferenceControlCatalog()), { scope: 'worker' }],
});

for (const test of [boundaryTest, longIdentityTest, sourceReferenceTest, communityReferenceTest, eventCommunityTest, invalidReferenceTest]) {
  test.setTimeout(90_000);
}

boundaryTest('the real resource card keeps a Unicode identity and title intact in its safe report link', async ({ app, page }) => {
  const response = await page.goto(`${app.origin}/aprender/`);
  assert.equal(response?.status(), 200, 'the public content directory renders the raw projected record');

  const card = page.locator('li.resource-card').filter({ hasText: identityBoundary.title });
  await expect(card).toHaveAttribute('id', `resource-${identityBoundary.id}`);
  const details = reportDetails(await card.getByRole('link', { name: 'Reportar enlace roto o dato incorrecto' }).getAttribute('href'));
  assertSafeReportEnvelope(details);
  assert.ok(details.body.includes(`Título: ${identityBoundary.title}`), 'the 240-code-point title remains whole');
  assert.ok(details.body.includes(`Referencia: ${JSON.stringify(identityBoundary.id)}`), 'the report keeps the complete resource identity');
  assert.ok(!details.body.includes('private-contact-secret') && !details.body.includes('private-account-secret'));
  await expect(page.getByRole('heading', { name: 'Recurso ordinario visible', exact: true })).toBeVisible();
});

longIdentityTest('no-JavaScript SSR reports and the fetched public selection index preserve full 130-ASCII and 256-byte IDs', async ({ app, publicPage }) => {
  const response = await publicPage.goto(`${app.origin}/aprender/`);
  assert.equal(response?.status(), 200, 'valid long resource identities render through the public projection');

  const selectionResponse = await publicPage.request.get(`${app.origin}/catalog-selection.json`);
  assert.equal(selectionResponse.status(), 200, 'the public selection endpoint returns the projected catalog');
  const selection = await selectionResponse.json();
  const ordinaryCard = publicPage.locator('li.resource-card').filter({ hasText: 'Recurso ordinario visible' });
  await expect(ordinaryCard).toBeVisible();
  const ordinaryReport = reportDetails(await ordinaryCard.getByRole('link', { name: 'Reportar enlace roto o dato incorrecto' }).getAttribute('href'));
  assertSafeReportEnvelope(ordinaryReport);
  const reportReferences = [];
  for (const id of longIdentities.identities) {
    const entry = selection.find((item) => item.id === id);
    assert.ok(entry, 'the public selection index preserves the exact identity');
    assert.deepEqual(Object.keys(entry).sort(), ['id', 'tipo', 'title', 'url']);
  }

  for (const [index, id] of longIdentities.identities.entries()) {
    const card = publicPage.locator('li.resource-card').filter({ hasText: `Recurso largo ${index + 1}` });
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('id', `resource-${id}`);
    const href = await card.getByRole('link', { name: 'Reportar enlace roto o dato incorrecto' }).getAttribute('href');
    const details = reportDetails(href);
    reportReferences.push(details.body.split('\n').find((line) => line.startsWith('Referencia: '))?.slice('Referencia: '.length));
    assertSafeReportEnvelope(details);
  }
  assert.ok(!JSON.stringify(selection).includes('private-contact-secret'));
  assert.ok(!JSON.stringify(selection).includes('private-account-secret'));
  assert.ok(!(await publicPage.content()).includes('private-contact-secret'));
  assert.ok(!(await publicPage.content()).includes('private-account-secret'));
  assert.deepEqual(reportReferences, longIdentities.identities.map((id) => JSON.stringify(id)),
    'each decoded report reference is the complete literal ID');
});

boundaryTest('the real EventAgenda renders a Unicode title with a valid narrow event ID and complete report context', async ({ app, page }) => {
  await page.clock.setFixedTime(new Date('2099-05-04T10:00:00Z'));
  const response = await page.goto(`${app.origin}/eventos/argentina/`);
  assert.equal(response?.status(), 200, 'the country event page renders the projected event');

  const eventCard = page.locator('#event-event_unicode_boundary');
  await expect(eventCard).toBeVisible();
  const member = eventCard.locator('[data-event-member-id="event_unicode_boundary"]');
  await expect(member.locator('[data-event-title]')).toHaveText(identityBoundary.title);
  await eventCard.locator('summary[data-event-detail-toggle]').click();
  const details = reportDetails(await eventCard.getByRole('link', { name: 'Reportar enlace roto o dato incorrecto' }).getAttribute('href'));
  assertSafeReportEnvelope(details);
  assert.ok(details.body.includes(`Título: ${identityBoundary.title}`));
  assert.ok(details.body.includes('Referencia: "event_unicode_boundary"'));
});

sourceReferenceTest('a source reference longer than 128 ASCII characters resolves to its exact card and browser focus', async ({ app, page }) => {
  const homeResponse = await page.goto(`${app.origin}/`);
  assert.equal(homeResponse?.status(), 200, 'the public homepage provides the starting point');
  await page.getByRole('link', { name: 'Aprender', exact: true }).click();

  const sourceArticle = page.locator('li.resource-card').filter({ hasText: 'Artículo relacionado con la fuente larga' });
  const sourceLink = sourceArticle.getByRole('link', { name: `Autor o fuente: ${sourceReference.sourceTitle}`, exact: true });
  const expectedSourceHref = `/creadores/${resourceFragment(sourceReference.sourceId)}`;
  await expect(sourceLink).toHaveAttribute('href', expectedSourceHref);
  await sourceLink.click();
  await expect(page).toHaveURL(`${app.origin}${expectedSourceHref}`);
  const sourceCard = page.locator('li.resource-card').filter({ hasText: sourceReference.sourceTitle });
  await expect(sourceCard).toHaveAttribute('id', `resource-${sourceReference.sourceId}`);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe(`resource-${sourceReference.sourceId}`);
});

communityReferenceTest('a colon and Unicode 256-byte community reference resolves to its exact related card and browser focus', async ({ app, page }) => {
  const homeResponse = await page.goto(`${app.origin}/`);
  assert.equal(homeResponse?.status(), 200, 'the public homepage provides the starting point');
  await page.getByRole('link', { name: 'Aprender', exact: true }).click();

  const communityArticle = page.locator('li.resource-card').filter({ hasText: 'Artículo relacionado con la comunidad larga' });
  const communityLink = communityArticle.getByRole('link', { name: `Comunidad: ${communityReference.communityTitle}`, exact: true });
  const expectedCommunityHref = `/comunidades/argentina/${resourceFragment(communityReference.communityId)}`;
  await expect(communityLink).toHaveAttribute('href', expectedCommunityHref);
  await communityLink.click();
  await expect(page).toHaveURL(`${app.origin}${expectedCommunityHref}`);
  const communityCard = page.locator('li.resource-card').filter({ hasText: communityReference.communityTitle });
  await expect(communityCard).toHaveAttribute('id', `resource-${communityReference.communityId}`);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe(`resource-${communityReference.communityId}`);
});

eventCommunityTest('EventAgenda uses the exact long community for organizer links, filters, venue fallback, and public index data', async ({ app, page }) => {
  await page.clock.setFixedTime(new Date('2099-05-05T10:00:00Z'));
  const response = await page.goto(`${app.origin}/eventos/argentina/`);
  assert.equal(response?.status(), 200, 'the public country agenda renders the raw projected event reference');

  const eventCard = page.locator('#event-event_related_to_long_community');
  await expect(eventCard).toBeVisible();
  await expect(eventCard).toHaveAttribute('data-event-city', 'AR:Córdoba');
  await expect(eventCard).toHaveAttribute('data-country', 'AR');
  const member = eventCard.locator('[data-event-member-id="event_related_to_long_community"]');
  await expect(member).toHaveAttribute('data-member-community-id', eventCommunity.communityId);
  await expect(member.locator('[data-event-place]')).toContainText('Córdoba');
  await expect(member.locator('[data-event-place]')).toContainText('Argentina');

  const communityOptions = await page.locator('[data-event-community] option').evaluateAll((options) => options.map((option) => ({ value: option.value, text: option.textContent })));
  assert.ok(communityOptions.some((option) => option.value === eventCommunity.communityId && option.text === eventCommunity.communityTitle));

  await page.locator('[data-event-secondary-disclosure] summary').click();
  const communityFilter = page.locator('[data-event-community]');
  await expect(page.locator('#event-event_other_community_may06')).toBeVisible();
  await communityFilter.selectOption(eventCommunity.communityId);
  await expect.poll(() => new URL(page.url()).searchParams.get('community')).toBe(eventCommunity.communityId);
  await expect(eventCard).toBeVisible();
  await expect(page.locator('#event-event_other_community_may06')).toBeHidden();

  await eventCard.locator('summary[data-event-detail-toggle]').click();
  const organizerLink = eventCard.getByRole('link', { name: eventCommunity.communityTitle, exact: true });
  const expectedCommunityHref = `/comunidades/argentina/${resourceFragment(eventCommunity.communityId)}`;
  await expect(organizerLink).toHaveAttribute('href', expectedCommunityHref);
  await organizerLink.click();
  await expect(page).toHaveURL(`${app.origin}${expectedCommunityHref}`);
  const communityCard = page.locator('li.resource-card').filter({ hasText: eventCommunity.communityTitle });
  await expect(communityCard).toHaveAttribute('id', `resource-${eventCommunity.communityId}`);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe(`resource-${eventCommunity.communityId}`);

  const selectionResponse = await page.request.get(`${app.transportOrigin}/catalog-selection.json`);
  assert.equal(selectionResponse.status(), 200, 'the downloadable public selection index accepts the same identity');
  const selection = await selectionResponse.json();
  const entry = selection.find((item) => item.id === eventCommunity.communityId);
  assert.ok(entry, 'the exact community identity appears in the public index');
  assert.deepEqual(Object.keys(entry).sort(), ['id', 'tipo', 'title', 'url']);
  assert.equal(entry.tipo, 'community');
  assert.ok(!JSON.stringify(selection).includes('private-contact-secret'));
  assert.ok(!JSON.stringify(selection).includes('private-account-secret'));

  const searchPage = await page.goto(`${app.origin}/buscar/`);
  assert.equal(searchPage?.status(), 200, 'the browser search page loads its public index through the normal route');
  await page.getByLabel('¿Qué quieres aprender?').fill('Encuentro comunidad larga');
  await page.locator('#site-type').selectOption('event');
  const searchIndexResponsePromise = page.waitForResponse((candidate) => new URL(candidate.url()).pathname === '/search-index.json');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  const searchIndexResponse = await searchIndexResponsePromise;
  assert.equal(searchIndexResponse.status(), 200, 'the real search index serves the browser search interaction');
  const searchIndex = await searchIndexResponse.json();
  const indexedEvent = searchIndex.find((item) => item.type === 'event' && item.title === 'Encuentro de la comunidad larga');
  assert.ok(indexedEvent, 'the public search index includes the event backed by the long community reference');
  assert.equal(indexedEvent.url, '/eventos/argentina/#event-event_related_to_long_community');
  assert.ok(indexedEvent.metadata.includes('Córdoba'), 'the search entry uses the community-backed effective venue');

  const searchResult = page.locator('[data-search-results] .search-results__result-link');
  await expect(page.locator('[data-search-status]')).toHaveText('1 resultado.');
  await expect(searchResult).toHaveAttribute('href', indexedEvent.url);
  await searchResult.click();
  const expectedDestination = new URL(indexedEvent.url, app.origin);
  await expect(page).toHaveURL((url) => url.origin === expectedDestination.origin
    && url.pathname === expectedDestination.pathname && url.hash === expectedDestination.hash);
  const indexedEventCard = page.locator('#event-event_related_to_long_community');
  await expect(indexedEventCard).toBeVisible();
  await expect(indexedEventCard).toBeFocused();
});

invalidReferenceTest('missing, hidden, and wrong-kind targets never produce related or organizer links or expose private fields', async ({ app, page }) => {
  const response = await page.goto(`${app.origin}/aprender/`);
  assert.equal(response?.status(), 200, 'valid target-ineligible associations do not abort the public catalog');

  const missing = page.locator('li.resource-card').filter({ hasText: 'Artículo con comunidad inexistente' });
  const hidden = page.locator('li.resource-card').filter({ hasText: 'Artículo con comunidad oculta' });
  const wrongKindCommunity = page.locator('li.resource-card').filter({ hasText: 'Artículo con comunidad de tipo incorrecto' });
  const wrongKindSource = page.locator('li.resource-card').filter({ hasText: 'Artículo con fuente de tipo incorrecto' });
  await expect(missing.getByRole('link', { name: /^Comunidad:/u })).toHaveCount(0);
  await expect(hidden.getByRole('link', { name: /^Comunidad:/u })).toHaveCount(0);
  await expect(wrongKindCommunity.getByRole('link', { name: /^Comunidad:/u })).toHaveCount(0);
  await expect(wrongKindSource.getByRole('link', { name: /^Autor o fuente:/u })).toHaveCount(0);
  assert.ok(!(await page.content()).includes('Comunidad oculta de prueba'));

  const selectionResponse = await page.request.get(`${app.origin}/catalog-selection.json`);
  assert.equal(selectionResponse.status(), 200);
  const selection = await selectionResponse.json();
  assert.ok(!selection.some((item) => item.id === 'hidden-community'));
  assert.ok(!JSON.stringify(selection).includes('private-contact-secret'));
  assert.ok(!JSON.stringify(selection).includes('private-account-secret'));

  await page.clock.setFixedTime(new Date('2099-05-09T10:00:00Z'));
  const eventResponse = await page.goto(`${app.origin}/eventos/argentina/`);
  assert.equal(eventResponse?.status(), 200);
  for (const eventId of ['event-missing-community', 'event-hidden-community', 'event-community-target-is-source']) {
    const card = page.locator(`#event-${eventId}`);
    await expect(card).toBeVisible();
    await card.locator('summary[data-event-detail-toggle]').click();
    await expect(card.getByRole('link', { name: 'Fuente pública de tipo incorrecto', exact: true })).toHaveCount(0);
    await expect(card.locator('dd').filter({ hasText: 'Organizador alternativo' })).toContainText('Organizador alternativo');
  }
  assert.ok(!(await page.content()).includes('private-contact-secret'));
  assert.ok(!(await page.content()).includes('private-account-secret'));
});
