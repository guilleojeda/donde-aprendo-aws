import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildReportMailto } from '../src/lib/report-link.mjs';

test('encodes only public resource context into a mailto draft', () => {
  const title = 'AWS IAM & guía';
  const recordId = 'catalog-1234567890abcdef1234567890abcdef';
  const targetUrl = 'https://example.invalid/curso?source=directory&lang=es';
  const href = buildReportMailto({ title, recordId, targetUrl });
  const parsed = new URL(href);

  assert.equal(parsed.protocol, 'mailto:');
  assert.equal(parsed.pathname, 'contact@dondeaprendoaws.com');
  assert.equal(parsed.searchParams.get('subject'), 'Reporte de enlace');
  const body = parsed.searchParams.get('body');
  assert.equal(body, `Título: ${title}\nReferencia: ${recordId}\nEnlace público: ${targetUrl}`);
  assert.ok(body.includes(title));
  assert.ok(body.includes(recordId));
  assert.ok(body.includes(targetUrl));
  assert.ok(href.includes('%26'));
  assert.equal(parsed.searchParams.has('cc'), false);
  assert.equal(parsed.searchParams.has('bcc'), false);
  assert.equal(parsed.searchParams.has('to'), false);
});

test('ignores private submission fields and sanitizes header-like title text', () => {
  const href = buildReportMailto({
    title: 'Curso\nBcc: attacker@example.invalid',
    recordId: 'catalog-123',
    targetUrl: 'https://example.invalid/path?body=other',
    email: 'private@example.invalid',
    full_name: 'Private Submitter',
    text: 'Private description',
  });
  const parsed = new URL(href);
  const body = parsed.searchParams.get('body');

  assert.ok(body.includes('Título: Curso Bcc: attacker@example.invalid'));
  assert.ok(body.includes('Referencia: catalog-123'));
  assert.ok(body.includes('Enlace público: https://example.invalid/path?body=other'));
  assert.equal(body.includes('private@example.invalid'), false);
  assert.equal(body.includes('Private Submitter'), false);
  assert.equal(body.includes('Private description'), false);
  assert.equal(body.includes('Hola, quiero reportar'), false);
  assert.equal(body.includes('Gracias.'), false);
  assert.equal(parsed.searchParams.has('bcc'), false);
  assert.equal(parsed.searchParams.has('to'), false);
});

test('omits unsafe URLs and offers instructions for generic footer reports', () => {
  const unsafe = new URL(buildReportMailto({ title: 'Curso', targetUrl: 'javascript:alert(1)' }));
  assert.equal(unsafe.searchParams.get('body').includes('javascript:'), false);

  const generic = new URL(buildReportMailto());
  assert.equal(generic.searchParams.get('body'), 'Incluye el enlace público que quieres reportar.');
});
