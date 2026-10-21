import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

// These assertions inspect the public HTML. Geometry and native focus still
// require direct verification in a browser.
const dist = resolve('dist');
assert.ok(existsSync(join(dist, 'eventos/index.html')), 'Build the site before running agenda HTML acceptance.');
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? files(path) : [path];
});
const decode = (value) => value.replace(/&#(?:x([\da-f]+)|(\d+));/giu,
  (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)))
  .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
  .replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ');
const attrs = (tag) => new Map([...tag.replace(/^<[\w:-]+/u, '').matchAll(
  /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu,
)].map(([, key, quoted, single, bare]) => [key.toLowerCase(), decode(quoted ?? single ?? bare ?? '')]));
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// A small stack scanner is sufficient for generated, balanced Astro HTML.
// Opaque script/style bodies cannot create false elements in the assertions.
function parse(html) {
  const root = { tag: '#document', attrs: new Map(), children: [], order: -1 };
  const stack = [root];
  let order = 0;
  const source = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, '');
  for (const [token] of source.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/giu)) {
    if (/^<!/u.test(token)) continue;
    const close = token.match(/^<\/([\w:-]+)/u);
    if (close) {
      const index = stack.findLastIndex((node) => node.tag === close[1].toLowerCase());
      if (index > 0) stack.length = index;
      continue;
    }
    const open = token.match(/^<([\w:-]+)/u);
    if (open) {
      const node = { tag: open[1].toLowerCase(), attrs: attrs(token), children: [], parent: stack.at(-1), order: order++ };
      node.parent.children.push(node);
      if (!voidTags.has(node.tag) && !/\/>$/u.test(token)) stack.push(node);
    } else stack.at(-1).children.push({ text: decode(token), parent: stack.at(-1), order: order++ });
  }
  return root;
}
const descendants = (node) => node.children?.flatMap((child) => [child, ...descendants(child)]) ?? [];
const has = (node, attribute) => node.attrs?.has(attribute) ?? false;
const find = (node, attribute) => descendants(node).filter((child) => has(child, attribute));
const text = (node) => (node.text ?? (node.children ?? []).map(text).join('')).replace(/\s+/gu, ' ').trim();
const isInside = (node, parent) => {
  for (let current = node.parent; current; current = current.parent) if (current === parent) return true;
  return false;
};
function visible(node) {
  for (let current = node; current?.tag !== '#document'; current = current.parent) {
    if (has(current, 'hidden')) return false;
    if (current?.parent?.tag === 'details' && !has(current.parent, 'open') && current.tag !== 'summary') return false;
  }
  return true;
}
const pages = files(join(dist, 'eventos')).filter((path) => path.endsWith('.html')).map((path) => ({
  path: relative(dist, path), tree: parse(readFileSync(path, 'utf8')),
}));
assert.ok(pages.some(({ path }) => path === 'eventos/online/index.html'), 'Build must include the online agenda.');
assert.ok(pages.some(({ path }) => path === 'eventos/presenciales/index.html'), 'Build must include the physical agenda.');
assert.ok(pages.length > 3, 'Build must include at least one national agenda.');

function one(node, attribute, context) {
  const matches = find(node, attribute);
  assert.equal(matches.length, 1, `${context}: expected one ${attribute}`);
  return matches[0];
}

test('every agenda keeps primary controls and a native current-week action, with a visible ended-events recovery target', () => {
  for (const { path, tree } of pages) {
    const currentWeek = one(tree, 'data-event-current-week', path);
    assert.equal(currentWeek.tag, 'button', path);
    assert.equal(currentWeek.attrs.get('type'), 'button', path);
    assert.match(currentWeek.attrs.get('aria-label') || text(currentWeek), /semana actual/iu, path);
    const ended = one(tree, 'data-event-include-ended', path);
    assert.equal(ended.tag, 'input', path);
    assert.equal(ended.attrs.get('type'), 'checkbox', path);
    assert.ok(has(ended, 'checked'), `${path}: finalized events start included`);
    assert.ok(visible(ended), `${path}: expiry can return focus to this visible control`);
    const secondary = one(tree, 'data-event-secondary-disclosure', path);
    for (const field of ['mode', 'country', 'city']) {
      const control = descendants(tree).find((node) => node.tag === 'select' && has(node, `data-event-${field}`));
      assert.ok(control && !isInside(control, secondary), `${path}: ${field} stays in the primary controls`);
      assert.ok(visible(control), `${path}: ${field} is available without opening secondary filters`);
    }
  }
});

test('share and secondary filters are closed native disclosures with labelled triggers; selected-zone controls remain available', () => {
  for (const { path, tree } of pages) {
    for (const attribute of ['data-event-share-menu', 'data-event-secondary-disclosure']) {
      const disclosure = one(tree, attribute, path);
      assert.equal(disclosure.tag, 'details', path);
      assert.equal(has(disclosure, 'open'), false, `${path}: ${attribute} starts closed`);
      const summary = disclosure.children.find((node) => node.tag === 'summary');
      assert.ok(summary && text(summary), `${path}: native disclosure has a nonempty trigger`);
    }
    const secondary = one(tree, 'data-event-secondary-disclosure', path);
    for (const attribute of ['data-event-community', 'data-event-zone']) {
      const control = one(tree, attribute, path);
      assert.ok(isInside(control, secondary), `${path}: ${attribute} follows the approved More options design`);
      const id = control.attrs.get('id');
      assert.ok(id && descendants(tree).some((node) => node.tag === 'label' && node.attrs.get('for') === id),
        `${path}: ${attribute} has an associated visible label`);
    }
  }
});

test('static visible occurrences form ordered UTC day groups, without empty or repeated headings', () => {
  for (const { path, tree } of pages) {
    const list = one(tree, 'data-event-list', path);
    const cards = find(list, 'data-event-ends-at').filter(visible);
    const headings = find(list, 'data-event-day-heading').filter(visible);
    const expected = [...new Set(cards.map((card) => new Date(card.attrs.get('data-event-starts-at')).toISOString().slice(0, 10)))];
    assert.deepEqual(headings.map((heading) => heading.attrs.get('data-event-day')), expected,
      `${path}: one heading per nonempty displayed day, in reading order`);
    for (const heading of headings) {
      assert.equal(heading.tag, 'h3', `${path}: day is a real heading under the agenda heading`);
      const time = descendants(heading).find((node) => node.tag === 'time');
      assert.equal(time?.attrs.get('datetime'), heading.attrs.get('data-event-day'), `${path}: day has a machine-readable date`);
      assert.ok(text(heading), `${path}: day has a readable label`);
    }
    for (const card of cards) {
      const member = find(card, 'data-event-member-id').find(visible);
      assert.ok(member, `${path}: selected occurrence has one visible member`);
      const title = descendants(member).find((node) => node.tag === 'h4');
      assert.ok(title, `${path}: event title follows the day heading in the heading outline`);
      const heading = headings.findLast((node) => node.order < title.order);
      assert.equal(heading?.attrs.get('data-event-day'), new Date(card.attrs.get('data-event-starts-at')).toISOString().slice(0, 10),
        `${path}: visible event is read under its actual UTC start day, even for a multi-day overlap`);
    }
  }
});

test('each public member has a compact title, time and original action outside closed local details; details retain original schedules and secondary actions', () => {
  for (const { path, tree } of pages) {
    for (const member of find(tree, 'data-event-member-id')) {
      const id = member.attrs.get('data-event-member-id');
      const context = `${path} member ${id}`;
      const detail = one(member, 'data-event-detail', context);
      assert.equal(detail.tag, 'details', context);
      assert.equal(has(detail, 'open'), false, `${context}: initial row is compact`);
      const summary = one(detail, 'data-event-detail-toggle', context);
      assert.equal(summary.tag, 'summary', context);
      assert.match(summary.attrs.get('aria-label') || text(summary), /detall/iu, context);
      const title = descendants(member).find((node) => node.tag === 'h4');
      assert.equal(text(title ?? {}), member.attrs.get('data-member-title').replace(/\s+/gu, ' ').trim(), `${context}: full public title retained`);
      assert.equal(isInside(title, detail), false, `${context}: title is visible before details`);
      for (const attribute of ['data-event-time-label', 'data-event-time-end-label', 'data-event-registration']) {
        const node = one(member, attribute, context);
        assert.equal(isInside(node, detail), false, `${context}: primary time/action is visible before details`);
      }
      const registration = one(member, 'data-event-registration', context);
      assert.equal(registration.attrs.get('href'), member.attrs.get('data-member-registration-url'), `${context}: original registration remains the action`);
      assert.match(text(detail), /Horario del organizador/u, `${context}: original-zone reference retained`);
      assert.match(text(detail), /Organiza/u, `${context}: co-host information retained`);
      assert.ok(descendants(detail).some((node) => node.tag === 'a' && node.attrs.get('href') === `/eventos/${id}.ics`),
        `${context}: original member calendar stays accessible in details`);
      const reports = descendants(member).filter((node) => node.tag === 'a' && /Reportar/iu.test(text(node)));
      assert.equal(reports.length, 1, context);
      assert.ok(isInside(reports[0], detail), `${context}: report stays available in details`);
      for (const link of descendants(member).filter((node) => node.tag === 'a' && /Ver grabación/iu.test(text(node)))) {
        assert.ok(isInside(link, detail), `${context}: recording stays in the local details`);
      }
    }
  }
});
