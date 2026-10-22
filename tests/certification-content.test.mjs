import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CERTIFICATIONS,
  CERTIFICATIONS_OVERVIEW,
  getCertificationPages,
} from '../src/lib/certifications.mjs';

const faqGroups = [
  CERTIFICATIONS_OVERVIEW.faq,
  ...CERTIFICATIONS.filter(({ page }) => page).map(({ page }) => page.faq),
];

test('FAQ links expose the label and destination shape used by the shared renderer', () => {
  for (const faq of faqGroups) {
    for (const { question, links = [] } of faq.items) {
      for (const link of links) {
        assert.equal(typeof link.label, 'string', `${question}: link label`);
        assert.equal(typeof link.href, 'string', `${question}: link destination`);
        assert.ok(link.href.length, `${question}: destination is not empty`);
      }
    }
  }
});

test('exam FAQs remain useful without any selected local material', () => {
  for (const certification of CERTIFICATIONS.filter(({ page }) => page)) {
    const faqText = JSON.stringify(certification.page.faq);
    assert.ok(certification.page.faq.items.length > 0, certification.id);
    for (const selection of certification.page.selections) {
      assert.ok(!faqText.includes(selection.id), `${certification.id}: FAQ must not depend on selection ${selection.id}`);
      if (selection.reviewedUrl) {
        assert.ok(!faqText.includes(selection.reviewedUrl), `${certification.id}: FAQ must not link to a selected resource`);
      }
    }
  }
});

test('SAA FAQ gives specific guidance for old material, subscription access, and readiness', () => {
  const saaFaq = CERTIFICATIONS.find(({ id }) => id === 'solutions-architect-associate').page.faq.items;
  assert.ok(saaFaq.some(({ question, answer }) => /versi[oó]n anterior|material.*Professional/iu.test(question)
    && /gu[ií]a.*SAA-C03|c[oó]digo.*gu[ií]a/iu.test(answer)));
  assert.ok(saaFaq.some(({ question, answer }) => /gratuita|suscripci[oó]n/iu.test(question)
    && /20 preguntas|conjunto oficial/iu.test(answer) && /suscripci[oó]n/iu.test(answer)));
  assert.ok(saaFaq.some(({ question, answer }) => /listo|practico/iu.test(question)
    && /brechas|dominio/iu.test(answer) && /garant/iu.test(answer)));
});

test('duplicate detail routes are rejected before they can feed sitemap or search', () => {
  const source = CERTIFICATIONS.find(({ page }) => page);
  const duplicate = { ...source, id: 'duplicate-route-fixture', page: { ...source.page } };
  assert.throws(
    () => getCertificationPages([...CERTIFICATIONS, duplicate]),
    /duplicate certification page path/iu,
  );
  assert.throws(
    () => getCertificationPages([{ ...source, page: { ...source.page, path: '/aprender/certificaciones/nested/detail/' } }]),
    /invalid certification page path/iu,
  );
  for (const path of [
    '/aprender/certificaciones/',
    '/aprender/certificaciones/slug',
    '/aprender/certificaciones/slug/extra/',
    '/elsewhere/certificaciones/slug/',
  ]) {
    assert.throws(
      () => getCertificationPages([{ ...source, page: { ...source.page, path } }]),
      /invalid certification page path/iu,
      `non-canonical path must be rejected: ${path}`,
    );
  }
});
