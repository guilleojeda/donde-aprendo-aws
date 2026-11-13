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
  assert.equal(body, `Título: ${title}\nReferencia: ${JSON.stringify(recordId)}\nEnlace público: ${targetUrl}`);
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
  assert.ok(body.includes(`Referencia: ${JSON.stringify('catalog-123')}`));
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

for (const [label, recordId] of [
  ['127 ASCII characters plus a supplementary Unicode character', `${'i'.repeat(127)}🧭`],
  ['130 ASCII characters', 'i'.repeat(130)],
  ['the full 256-byte ASCII boundary', 'i'.repeat(256)],
]) {
  test(`report reference remains a complete reversible JSON string: ${label}`, () => {
    const parsed = new URL(buildReportMailto({ recordId }));
    const body = parsed.searchParams.get('body');
    const lines = body.split('\n');
    const expectedReference = `Referencia: ${JSON.stringify(recordId)}`;

    assert.equal(parsed.pathname, 'contact@dondeaprendoaws.com');
    assert.equal(parsed.searchParams.get('subject'), 'Reporte de enlace');
    assert.deepEqual([...parsed.searchParams.keys()].sort(), ['body', 'subject']);
    assert.deepEqual(lines, [expectedReference], 'the reference remains one body line even when its ID contains syntax characters');
    assert.equal(JSON.parse(lines[0].slice('Referencia: '.length)), recordId,
      'the approved JSON string representation recovers the exact accepted ID');
  });
}

test('a reference containing quote and newline characters cannot inject mail headers', () => {
  const recordId = 'resource"\nBcc: attacker@example.invalid';
  const parsed = new URL(buildReportMailto({
    recordId,
    title: '',
    targetUrl: '',
    email: 'private@example.invalid',
    accountId: 'private-account',
    message: 'private-message',
  }));
  const body = parsed.searchParams.get('body');

  assert.equal(body, `Referencia: ${JSON.stringify(recordId)}`);
  assert.equal(JSON.parse(body.slice('Referencia: '.length)), recordId);
  assert.equal(parsed.pathname, 'contact@dondeaprendoaws.com');
  assert.equal(parsed.searchParams.get('subject'), 'Reporte de enlace');
  assert.deepEqual([...parsed.searchParams.keys()].sort(), ['body', 'subject']);
  assert.equal(body.includes('private@example.invalid'), false);
  assert.equal(body.includes('private-account'), false);
  assert.equal(body.includes('private-message'), false);
});

test('title presentation cleans whitespace and remains well-formed when clipping at 240 code points', () => {
  const clean = new URL(buildReportMailto({ title: '  Curso\n  de   AWS 🧭  ' }));
  assert.equal(clean.searchParams.get('body'), 'Título: Curso de AWS 🧭');

  const title = `${'a'.repeat(239)}🧭after`;
  const clipped = new URL(buildReportMailto({ title }));
  const clippedTitle = clipped.searchParams.get('body').slice('Título: '.length);
  assert.equal(clippedTitle, `${'a'.repeat(239)}🧭`);
  assert.equal([...clippedTitle].length, 240);
  assert.equal(clippedTitle.isWellFormed(), true);
});

test('malformed title text is repaired for presentation without changing ID encoding', () => {
  const parsed = new URL(buildReportMailto({ title: 'Curso\uD800 AWS', recordId: 'exact\u0085identity' }));
  const body = parsed.searchParams.get('body');

  assert.equal(body, `Título: Curso\uFFFD AWS\nReferencia: ${JSON.stringify('exact\u0085identity')}`);
  assert.equal(JSON.parse(body.split('\n')[1].slice('Referencia: '.length)), 'exact\u0085identity');
});

test('report links omit URLs with credentials, unsupported schemes, surrounding space, or controls', () => {
  for (const targetUrl of [
    'javascript:alert(1)',
    'ftp://example.invalid/file',
    'https://user:secret@example.invalid/path',
    ' https://example.invalid/path',
    'https://example.invalid/path\nBcc:attacker@example.invalid',
  ]) {
    const parsed = new URL(buildReportMailto({ targetUrl }));
    assert.equal(parsed.searchParams.get('body').includes(targetUrl.trim()), false,
      `unsafe destination is omitted: ${JSON.stringify(targetUrl)}`);
    assert.deepEqual([...parsed.searchParams.keys()].sort(), ['body', 'subject']);
  }
});
