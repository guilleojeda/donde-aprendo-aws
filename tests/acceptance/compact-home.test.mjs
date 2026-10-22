import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { FORMATS_BY_KIND, KIND_LABELS } from '../../src/lib/resource-taxonomy.mjs';
import { LEARNING_PATHS, learningPathHref } from '../../src/lib/learning-paths.mjs';

// These checks cover public HTML structure. Responsive geometry and first-view
// legibility need direct browser verification.
const htmlPath = resolve('dist/index.html');
assert.ok(existsSync(htmlPath), 'Build the site before running compact home acceptance.');

const decode = (value) => value.replace(/&#(?:x([\da-f]+)|(\d+));/giu,
  (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)))
  .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
  .replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ');
const attributes = (tag) => new Map([...tag.replace(/^<[\w:-]+/u, '').matchAll(
  /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu,
)].map(([, key, quoted, single, bare]) => [key.toLowerCase(), decode(quoted ?? single ?? bare ?? '')]));
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// A small scanner is enough for balanced generated Astro HTML. Script and style
// bodies are opaque so their text cannot be mistaken for page elements.
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
      const node = {
        tag: open[1].toLowerCase(), attrs: attributes(token), children: [],
        parent: stack.at(-1), order: order++,
      };
      node.parent.children.push(node);
      if (!voidTags.has(node.tag) && !/\/>$/u.test(token)) stack.push(node);
    } else {
      stack.at(-1).children.push({ text: decode(token), parent: stack.at(-1), order: order++ });
    }
  }
  return root;
}

const tree = parse(readFileSync(htmlPath, 'utf8'));
const descendants = (node) => node.children?.flatMap((child) => [child, ...descendants(child)]) ?? [];
const has = (node, name) => node.attrs?.has(name) ?? false;
const text = (node) => (node.text ?? (node.children ?? []).map(text).filter(Boolean).join(' ')).replace(/\s+/gu, ' ').trim();
const all = descendants(tree);
const nodesWithValue = (node, name, value) => descendants(node).filter((child) => child.attrs?.get(name) === value);
const elements = (node) => descendants(node).filter((child) => child.tag);
function visible(node) {
  for (let current = node; current?.tag !== '#document'; current = current.parent) {
    if (has(current, 'hidden') || has(current, 'inert') || current.attrs?.get('aria-hidden') === 'true') return false;
    if (current.parent?.tag === 'details' && !has(current.parent, 'open') && current.tag !== 'summary') return false;
  }
  return true;
}

const mainLandmarks = nodesWithValue(tree, 'id', 'contenido');
assert.equal(mainLandmarks.length, 1, 'Home keeps one main content landmark.');
assert.equal(elements(tree).filter((node) => node.tag === 'main').length, 1, 'Home has one main landmark.');
const main = mainLandmarks[0];
assert.equal(main.tag, 'main', 'The public home content has one main landmark.');
const familyRoutes = [
  { href: '/aprender/', label: /\baprender\b/iu },
  { href: '/creadores/', label: /\bcreadores\b/iu },
  { href: '/comunidades/', label: /\bcomunidades\b/iu },
  { href: '/eventos/', label: /\beventos\b/iu },
];
const familyNavs = descendants(main).filter((node) => node.tag === 'nav'
  && familyRoutes.every(({ href }) => descendants(node).some((child) => child.tag === 'a' && child.attrs.get('href') === href)));
assert.equal(familyNavs.length, 1, 'Home has one navigation landmark containing all four primary destinations.');
const familyNav = familyNavs[0];

function isSiteSearch(node) {
  const searchHref = (node.attrs.get('href') ?? '').toLowerCase();
  if (node.tag === 'a') return /^\/buscar\/(?:[?#]|$)/u.test(searchHref);
  if (node.tag === 'input' && node.attrs.get('type') === 'search') return true;
  for (let current = node; current && current !== main; current = current.parent) {
    if (current.tag === 'form' && (current.attrs.get('role') === 'search'
      || /(?:^|\/)buscar(?:\/|[?#]|$)/u.test(current.attrs.get('action') ?? ''))) return true;
  }
  return false;
}

function hasCountItems(node) {
  const metrics = node.children.filter((child) => child.tag &&
    /\b\d[\d.,]*\s+(?:recursos?|fuentes?|comunidades?|eventos?|elementos?)\b/iu.test(text(child)));
  return metrics.length >= 3;
}

function isStatisticsRegion(node) {
  const labelledStatistics = /(?:contenido|directorio|estad[ií]sticas?|recuento|resumen)/iu.test(
    `${node.attrs?.get('aria-label') ?? ''} ${node.attrs?.get('role') ?? ''}`,
  );
  return hasCountItems(node) || (labelledStatistics && elements(node).some((child) =>
    /\b\d[\d.,]*\s+(?:recursos?|fuentes?|comunidades?|eventos?|elementos?)\b/iu.test(text(child))));
}

test('the short home introduction leads to four visible, labelled family choices before secondary actions and statistics', () => {
  const headings = descendants(main).filter((node) => node.tag === 'h1');
  assert.equal(headings.length, 1, 'Home has one page heading.');
  const heading = headings[0];
  assert.ok(visible(heading), 'The page heading is visible.');
  assert.ok(text(heading), 'The page heading is readable.');

  const intro = descendants(main).filter((node) => node.tag === 'p' && node.order > heading.order && node.order < familyNav.order)[0];
  assert.ok(intro && visible(intro), 'A visible introductory sentence follows the heading before the family choices.');
  assert.ok(heading.order < intro.order && intro.order < familyNav.order, 'The heading and introduction precede the family choices.');

  const navName = familyNav.attrs.get('aria-label')?.trim()
    || familyNav.attrs.get('aria-labelledby')?.split(/\s+/u).map((id) => all.find((node) => node.attrs?.get('id') === id))
      .filter(Boolean).map(text).join(' ').trim();
  assert.ok(navName, 'The family choices have a programmatic navigation label.');
  assert.ok(visible(familyNav), 'The family navigation is not hidden.');

  const familyLinks = descendants(familyNav).filter((node) => node.tag === 'a');
  assert.deepEqual(familyLinks.map((node) => node.attrs.get('href')), familyRoutes.map(({ href }) => href),
    'The four primary links use their existing canonical routes and order.');
  familyRoutes.forEach(({ href, label }, index) => {
    const link = familyLinks[index];
    const linkText = text(link);
    assert.ok(visible(link), `${href}: the entry is available without opening a disclosure.`);
    assert.match(linkText, label, `${href}: the entry has a recognizable label.`);
    const labelNode = elements(link).filter((node) => ['h2', 'h3', 'p', 'small', 'span', 'strong'].includes(node.tag)
      && label.test(text(node))).sort((left, right) => text(left).length - text(right).length)[0];
    assert.ok(labelNode && text(labelNode), `${href}: the recognizable label has its own readable text.`);
    const labelWords = new Set(text(labelNode).toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
    const description = descendants(link).find((node) => ['p', 'small', 'span'].includes(node.tag)
      && node !== labelNode
      && (text(node).toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).some((word) => !labelWords.has(word)));
    assert.ok(description, `${href}: the entry has a contextual description beyond repeating its label.`);
  });

  const statistics = elements(main).filter(isStatisticsRegion);
  assert.ok(statistics.every((node) => node.order > familyNav.order), 'Any semantic count region follows the family choices.');
  const beforeChoices = descendants(main).filter((node) => node.order < familyNav.order
    && ['a', 'button', 'form', 'input', 'select', 'textarea'].includes(node.tag)
    && !(node.tag === 'input' && node.attrs.get('type') === 'hidden'));
  assert.ok(beforeChoices.every(isSiteSearch), 'Only site search may be interactive before the family choices.');
});

test('four learning-path summaries use the public registry and follow the family choices', () => {
  for (const path of LEARNING_PATHS) {
    const href = learningPathHref(path.id);
    const summaries = descendants(main).filter((node) => node.tag === 'a' && node.attrs.get('href') === href
      && [path.title, path.audience, path.intro].every((part) => text(node).includes(part)));
    assert.equal(summaries.length, 1, `${href}: one summary exposes the published title, audience, and introduction.`);
    assert.ok(summaries[0].order > familyNav.order, `${href}: the summary follows the primary family choices.`);
    assert.ok(visible(summaries[0]), `${href}: the summary is visible without opening a disclosure.`);
  }
  assert.ok(descendants(main).some((node) => node.tag === 'a' && node.attrs.get('href') === '/recorridos/'
    && node.order > familyNav.order && visible(node)), 'The summaries retain a visible link to the full path index.');
});

test('home objectives, learning guidance, and upcoming-events recovery remain available after the primary choices', () => {
  const objectiveRoutes = ['/aprender/certificaciones/', '/aprender/serverless/', '/aprender/seguridad/', '/aprender/ia-generativa/'];
  for (const href of objectiveRoutes) {
    const links = descendants(main).filter((node) => node.tag === 'a' && node.attrs.get('href') === href && visible(node));
    assert.ok(links.some((node) => node.order > familyNav.order), `${href}: objective navigation follows the primary choices.`);
  }

  const guide = descendants(main).filter((node) => node.attrs?.get('id') === 'como-aprender');
  assert.equal(guide.length, 1, 'The five-question learning guide keeps its public anchor.');
  assert.ok(visible(guide[0]), 'The learning guide is available in the page.');
  assert.ok(guide[0].order > familyNav.order, 'The learning guide follows the primary choices.');
  const questions = descendants(guide[0]).filter((node) => node.tag === 'h3');
  assert.equal(questions.length, 5, 'The learning guide retains five question headings.');
  for (const question of questions) {
    assert.ok(text(question) && visible(question), 'Each learning question has visible, readable text.');
    const item = question.parent;
    assert.ok(descendants(item).some((node) => node.tag === 'p' && text(node) && visible(node)),
      `${text(question)}: its answer remains available.`);
  }
  const guideRoutes = [
    '/recorridos/primeros-pasos/', '/aprender/cursos/', '/aprender/videos/', '/aprender/articulos/',
    '/comunidades/', '/comunidades/user-groups/', '/comunidades/estudiantes/',
    '/eventos/', '/eventos/online/', '/eventos/presenciales/',
  ];
  for (const href of guideRoutes) {
    assert.ok(descendants(guide[0]).some((node) => node.tag === 'a' && node.attrs.get('href') === href && visible(node)),
      `The learning guide retains ${href}.`);
  }

  const eventsSections = descendants(main).filter((node) => node.tag === 'section'
    && descendants(node).some((child) => child.tag === 'h2' && /eventos/iu.test(text(child)))
    && descendants(node).some((child) => child.tag === 'a' && child.attrs.get('href') === '/eventos/'));
  assert.equal(eventsSections.length, 1, 'Upcoming events retain a section and a link to the full agenda.');
  const eventsSection = eventsSections[0];
  assert.ok(eventsSection.order > familyNav.order, 'Upcoming events follow the primary choices.');
  const eventItems = descendants(eventsSection).filter((node) => node.tag === 'li'
    && descendants(node).some((child) => child.tag === 'a' && /^\/eventos\//u.test(child.attrs.get('href') ?? '')));
  if (eventItems.length === 0) {
    assert.ok(descendants(eventsSection).some((node) => node.tag === 'p' && text(node) && /eventos?/iu.test(text(node))),
      'An empty upcoming-events list explains its state.');
  }
});

test('the contribution form and six closed FAQ answers remain functional after the primary choices', () => {
  const formSection = descendants(main).filter((node) => node.attrs?.get('id') === 'cta_form-01-839181');
  assert.equal(formSection.length, 1, 'The contribution form keeps its existing public anchor.');
  assert.ok(formSection[0].order > familyNav.order, 'The contribution form follows the primary choices.');
  const form = descendants(formSection[0]).find((node) => node.tag === 'form' && has(node, 'data-contribution-form'));
  assert.ok(form, 'The form remains a real, functional form.');
  assert.ok(visible(form), 'The form remains available in the page.');

  const fields = [
    ['full_name', 'input', 'text', /nombre/iu],
    ['email', 'input', 'email', /correo/iu],
    ['title', 'input', 'text', /t[ií]tulo|nombre/iu],
    ['url', 'input', 'url', /url|enlace/iu],
    ['text', 'textarea', undefined, /descripci[oó]n/iu],
    ['kind', 'select', undefined, /compartes|secci[oó]n/iu],
    ['format', 'select', undefined, /formato/iu],
  ];
  const fieldByName = (name) => {
    const matches = descendants(form).filter((node) => ['input', 'select', 'textarea'].includes(node.tag)
      && node.attrs.get('name') === name);
    assert.equal(matches.length, 1, `${name}: the existing field remains in the form.`);
    return matches[0];
  };
  for (const [name, tag, type, labelPattern] of fields) {
    const field = fieldByName(name);
    assert.equal(field.tag, tag, `${name}: the field retains its native control.`);
    if (type) assert.equal(field.attrs.get('type') ?? (field.tag === 'input' ? 'text' : undefined), type,
      `${name}: native input behavior remains available.`);
    assert.ok(has(field, 'required'), `${name}: the field remains required.`);
    const id = field.attrs.get('id');
    const label = descendants(form).find((node) => node.tag === 'label' && node.attrs.get('for') === id);
    assert.ok(id && label && labelPattern.test(text(label)), `${name}: a readable label remains associated.`);
  }

  const kind = fieldByName('kind');
  assert.ok(has(kind, 'data-contribution-kind'), 'The contribution kind control retains its script hook.');
  const kindValues = descendants(kind).filter((node) => node.tag === 'option' && node.attrs.get('value'))
    .map((node) => node.attrs.get('value'));
  assert.deepEqual(kindValues, Object.keys(KIND_LABELS), 'The three existing contribution kinds remain selectable.');
  const format = fieldByName('format');
  assert.ok(has(format, 'data-contribution-format'), 'The contribution format control retains its script hook.');
  const formatPairs = descendants(format).filter((node) => node.tag === 'option' && node.attrs.get('value'))
    .map((node) => [node.attrs.get('data-format-kind'), node.attrs.get('value')]);
  assert.deepEqual(formatPairs, Object.entries(FORMATS_BY_KIND).flatMap(([kindName, values]) => values.map((value) => [kindName, value])),
    'Format choices remain associated with their contribution kind.');

  const describedIds = (form.attrs.get('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
  const describedNodes = describedIds.map((id) => descendants(form).find((node) => node.attrs?.get('id') === id));
  assert.ok(describedIds.length >= 3 && describedNodes.every(Boolean), 'Form help and status references resolve to page content.');
  const status = descendants(form).find((node) => has(node, 'data-contribution-status'));
  assert.ok(status && describedIds.includes(status.attrs.get('id')), 'Submission status is associated with the form.');
  const helpAndPrivacy = describedNodes.filter((node) => node !== status && node.tag === 'p' && text(node));
  assert.ok(helpAndPrivacy.length >= 2, 'Submission instructions and privacy information remain associated with the form.');
  assert.match(helpAndPrivacy.map(text).join(' '), /nombre[\s\S]*correo[\s\S]*(?:no\s+(?:se\s+)?public|privad)/iu,
    'The contact notice explains that name and email remain private.');
  assert.ok(has(status, 'data-contribution-status'), 'Submission status retains its script hook.');
  assert.equal(status.attrs.get('role'), 'status', 'Submission status remains announced to assistive technology.');
  assert.equal(status.attrs.get('aria-live'), 'polite', 'Submission status remains a polite live update.');
  assert.ok(descendants(form).some((node) => node.tag === 'noscript' && text(node)), 'The no-script submission guidance remains.');
  const topicFieldset = descendants(form).find((node) => node.tag === 'fieldset'
    && descendants(node).some((child) => child.tag === 'legend' && /temas/iu.test(text(child))));
  assert.ok(topicFieldset, 'The optional topic choices remain grouped with a legend.');
  assert.ok(descendants(topicFieldset).some((node) => node.tag === 'input' && node.attrs.get('name') === 'topics' && node.attrs.get('type') === 'checkbox'),
    'Topic checkboxes remain available.');
  assert.ok(descendants(topicFieldset).some((node) => node.tag === 'legend' && /hasta tres/iu.test(text(node))),
    'The topic limit remains explained.');
  assert.ok(descendants(form).some((node) => node.tag === 'button' && node.attrs.get('type') === 'submit' && text(node)),
    'A labelled submit action remains.');

  const faqSections = descendants(main).filter((node) => node.tag === 'section' && node.attrs.get('id') === 'faq');
  assert.equal(faqSections.length, 1, 'The FAQ keeps its public anchor.');
  const faq = faqSections[0];
  assert.ok(faq.order > familyNav.order && faq.order > formSection[0].order, 'The FAQ follows the primary choices and contribution form.');
  const disclosures = descendants(faq).filter((node) => node.tag === 'details');
  assert.equal(disclosures.length, 6, 'All six FAQ answers remain.');
  for (const disclosure of disclosures) {
    assert.equal(has(disclosure, 'open'), false, 'FAQ answers stay closed until requested.');
    const summary = disclosure.children.find((node) => node.tag === 'summary');
    assert.ok(summary && text(summary), 'Each answer has a readable native question.');
    assert.ok(text(disclosure).length > text(summary).length, 'Each question retains its answer in HTML.');
  }
  assert.ok(descendants(disclosures[0]).some((node) => node.tag === 'a'
    && (node.attrs.get('href') ?? '').endsWith('#cta_form-01-839181')),
  'The first FAQ answer still links to the contribution form.');
});
