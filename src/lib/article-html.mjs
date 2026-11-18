import { parseFragment } from 'parse5';

const HEADING = /^h[1-6]$/u;
const SKIPPED_TEXT_ELEMENTS = new Set(['script', 'style', 'template']);
const CODE_ANCESTORS = new Set(['code', 'pre']);

function walk(node, visit, ancestors = []) {
  visit(node, ancestors);
  for (const child of node.childNodes ?? []) walk(child, visit, [...ancestors, node]);
}

function visibleText(node) {
  const text = [];
  walk(node, (current, ancestors) => {
    if (SKIPPED_TEXT_ELEMENTS.has(current.tagName)
      || ancestors.some((ancestor) => SKIPPED_TEXT_ELEMENTS.has(ancestor.tagName))) return;
    if (current.nodeName === '#text') text.push(current.value);
    if (current.nodeName === 'br') text.push(' ');
  });
  return text.join('').replace(/\s+/gu, ' ').trim();
}

/**
 * Extract only headings represented by the rendered article fragment.
 * parse5 decodes entities and gives us the same structural view that the
 * browser receives, so fenced HTML is not mistaken for a heading.
 */
export function extractArticleHeadings(html = '') {
  const fragment = parseFragment(String(html));
  const headings = [];
  walk(fragment, (node, ancestors) => {
    if (!HEADING.test(node.tagName ?? '')
      || ancestors.some((ancestor) => CODE_ANCESTORS.has(ancestor.tagName))) return;
    const heading = visibleText(node);
    if (heading) headings.push(heading);
  });
  return headings.join(' ');
}

function attributeValueRange(source, location) {
  if (!location || !Number.isInteger(location.startOffset) || !Number.isInteger(location.endOffset)) return;
  const raw = source.slice(location.startOffset, location.endOffset);
  const equals = raw.indexOf('=');
  if (equals < 0) return;
  let start = equals + 1;
  while (/\s/u.test(raw[start] ?? '')) start += 1;
  const quote = raw[start];
  if (quote === '"' || quote === "'") {
    if (raw.at(-1) !== quote || start + 1 > raw.length - 1) return;
    return [location.startOffset + start + 1, location.endOffset - 1];
  }
  return [location.startOffset + start, location.endOffset];
}

function escapeAttribute(value, quote) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': quote === '"' ? '&quot;' : '"',
    "'": quote === "'" ? '&#39;' : "'",
  })[character]);
}

/**
 * Rewrite selected href values without serializing the fragment again.
 * Keeping the original bytes preserves rendered assets, IDs, highlighting,
 * whitespace, and unrelated links.
 */
export function rewriteArticleLinks(html = '', rewriteHref) {
  if (typeof rewriteHref !== 'function') return String(html);
  const source = String(html);
  const fragment = parseFragment(source, { sourceCodeLocationInfo: true });
  const edits = [];
  walk(fragment, (node) => {
    if (node.tagName !== 'a') return;
    const href = node.attrs?.find((attribute) => attribute.name === 'href');
    const location = node.sourceCodeLocation?.attrs?.href;
    const range = attributeValueRange(source, location);
    if (!href || !range) return;
    const next = rewriteHref(href.value, node);
    if (typeof next !== 'string' || next === href.value) return;
    const rawAttribute = source.slice(location.startOffset, location.endOffset);
    const equals = rawAttribute.indexOf('=');
    let valueStart = equals + 1;
    while (/\s/u.test(rawAttribute[valueStart] ?? '')) valueStart += 1;
    const quote = rawAttribute[valueStart] === '"' || rawAttribute[valueStart] === "'"
      ? rawAttribute[valueStart]
      : '"';
    edits.push({ start: range[0], end: range[1], value: escapeAttribute(next, quote) });
  });
  edits.sort((left, right) => right.start - left.start);
  let result = source;
  for (const edit of edits) result = `${result.slice(0, edit.start)}${edit.value}${result.slice(edit.end)}`;
  return result;
}
