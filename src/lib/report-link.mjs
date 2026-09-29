const CONTACT_EMAIL = 'contact@dondeaprendoaws.com';
const REPORT_SUBJECT = 'Reporte de enlace roto o dato incorrecto';
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

/**
 * Build a mailto URL using only public resource context. All values are encoded
 * as URI components so titles and URLs cannot add recipients or headers.
 */
export function buildReportMailto({ title, recordId, targetUrl } = {}) {
  const lines = [
    'Hola, quiero reportar un enlace roto o un dato incorrecto en Dónde Aprendo AWS.',
    '',
  ];

  const safeTitle = publicText(title, 240);
  const safeRecordId = publicText(recordId, 128);
  const safeTargetUrl = publicHttpUrl(targetUrl);

  if (safeTitle) lines.push(`Título: ${safeTitle}`);
  if (safeRecordId) lines.push(`Referencia: ${safeRecordId}`);
  if (safeTargetUrl) lines.push(`Enlace público: ${safeTargetUrl}`);

  if (!safeTitle && !safeRecordId && !safeTargetUrl) {
    lines.push('Incluye el enlace público que quieres reportar.');
  }

  lines.push('', 'Describe brevemente el problema. Gracias.');

  return `mailto:${CONTACT_EMAIL}?subject=${encodeUriComponent(REPORT_SUBJECT)}&body=${encodeUriComponent(lines.join('\n'))}`;
}

function publicText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength);
}

function publicHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 2_048 || value.trim() !== value || CONTROL_CHARACTERS.test(value)) {
    return '';
  }

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      return '';
    }
  } catch {
    return '';
  }

  return value;
}

function encodeUriComponent(value) {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
