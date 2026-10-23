import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Acceptance of the approved theme ownership: UI consumes color roles, while
// the two theme files own their definitions. Browser contrast is checked on
// rendered pairs separately; this source check cannot establish legibility.
const root = fileURLToPath(new URL('../', import.meta.url));
const palettePaths = ['src/styles/themes/light.css', 'src/styles/themes/dark.css'];
const read = (path) => readFileSync(join(root, path), 'utf8');
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//gu, '');
const roleName = /^--(?:color-|astro-code-)/u;

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function declarations(css) {
  return [...withoutComments(css).matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;{}]*)(?=;|\})/gu)]
    .map(([, property, value]) => [property, value.trim()]);
}

function palette(path) {
  assert.ok(existsSync(join(root, path)), `The complete theme definition is missing: ${path}`);
  return declarations(read(path)).filter(([property]) => property.startsWith('--'));
}

function consumerStyles() {
  const styles = [];
  for (const absolute of filesUnder(join(root, 'src'))) {
    const path = relative(root, absolute).replaceAll('\\', '/');
    if (path.startsWith('src/styles/themes/')) continue;
    if (path.endsWith('.css')) styles.push([path, read(path)]);
    if (!path.endsWith('.astro')) continue;
    const source = read(path);
    for (const [block] of source.matchAll(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gu)) {
      styles.push([path, block.replace(/^<style\b[^>]*>|<\/style\s*>$/gu, '')]);
    }
    for (const [, , value] of source.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gu)) {
      styles.push([`${path} (style attribute)`, `{${value}}`]);
    }
  }
  return styles;
}

// Named CSS colors are included so replacing a hex value with "white" cannot
// accidentally satisfy the separation requirement. Contextual keywords such
// as transparent, currentColor and inherit are intentionally allowed.
const namedColors = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgrey darkgreen darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray grey green greenyellow honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgrey lightgreen lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(' '));

function hasLiteralColor(value) {
  const unquoted = value.replace(/(["'])[\s\S]*?\1/gu, '').replace(/url\([^)]*\)/giu, '');
  if (/#[\da-f]{3,8}\b/iu.test(unquoted)) return true;
  if (/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[+\-.\d]/iu.test(unquoted)) return true;
  if (/\bcolor\(\s*[\w-]+\s+[+\-.\d]/iu.test(unquoted)) return true;
  const withoutVariables = unquoted.replace(/var\(\s*--[\w-]+\s*(?=[,)])/gu, 'var(');
  return [...withoutVariables.matchAll(/[a-z][a-z-]*/giu)]
    .some(([word]) => namedColors.has(word.toLowerCase()));
}

test('light and dark define the same nonempty semantic theme contract', () => {
  const [light, dark] = palettePaths.map(palette);
  const keys = (items) => items.map(([property]) => property).sort();
  assert.ok(light.length > 0, 'The light palette must own its role definitions');
  assert.deepEqual(keys(light), keys(dark), 'Both appearances must support every theme role');
  for (const [path, entries] of [[palettePaths[0], light], [palettePaths[1], dark]]) {
    assert.equal(new Set(keys(entries)).size, entries.length, `${path}: a theme role is defined more than once`);
    for (const [property, value] of entries) assert.ok(value, `${path}: ${property} is empty`);
  }
  assert.ok(declarations(read(palettePaths[0])).some(([property, value]) => property === 'color-scheme' && value === 'light'));
  assert.ok(declarations(read(palettePaths[1])).some(([property, value]) => property === 'color-scheme' && value === 'dark'));
});

test('UI styles contain no independent color definitions or literal color fallbacks', () => {
  const violations = consumerStyles().flatMap(([path, css]) => declarations(css)
    .filter(([property, value]) => roleName.test(property) || hasLiteralColor(value))
    .map(([property, value]) => `${path}: ${property}: ${value}`));
  assert.deepEqual(violations, [], 'Move role definitions and literal colors into the two themes; UI only consumes them');
});

test('every color role consumed by UI is available in both themes', () => {
  const styles = consumerStyles();
  for (const path of palettePaths) {
    const defined = new Set(palette(path).map(([property]) => property));
    const missing = styles.flatMap(([consumer, css]) => [...withoutComments(css).matchAll(/var\(\s*(--(?:color-|astro-code-)[\w-]+)/gu)]
      .filter(([, property]) => !defined.has(property))
      .map(([, property]) => `${consumer}: ${property}`));
    assert.deepEqual([...new Set(missing)], [], `${path}: a UI color has no definition in this theme`);
  }
});

test('appearance branches and color-scheme belong to theme definitions, not UI styles', () => {
  const violations = consumerStyles().filter(([, css]) =>
    /prefers-color-scheme|\[data-theme\b|\bcolor-scheme\s*:|(?:html|:root)\.(?:dark|light)\b/iu.test(withoutComments(css)))
    .map(([path]) => path);
  assert.deepEqual(violations, [], 'UI components must not own separate light/dark presentation logic');
});

test('both themes define all syntax-highlight roles without literal fallbacks in consumers', () => {
  const required = ['background', 'foreground', ...[
    'comment', 'constant', 'function', 'keyword', 'parameter', 'punctuation',
    'string', 'string-expression', 'link', 'inserted', 'deleted', 'changed',
  ].map((role) => `token-${role}`)].map((role) => `--astro-code-${role}`);
  for (const path of palettePaths) {
    const defined = new Set(palette(path).map(([property]) => property));
    assert.deepEqual(required.filter((property) => !defined.has(property)), [], `${path}: syntax colors must also belong to the theme`);
  }
});

test('theme role references resolve within each palette without cycles', () => {
  for (const path of palettePaths) {
    const definitions = new Map(palette(path));
    const resolved = new Set();
    const resolveRole = (name, chain = []) => {
      assert.ok(definitions.has(name), `${path}: ${name} has no theme definition`);
      assert.ok(!chain.includes(name), `${path}: cyclic theme reference ${[...chain, name].join(' → ')}`);
      if (resolved.has(name)) return;
      for (const [, reference] of definitions.get(name).matchAll(/var\(\s*(--[\w-]+)/gu)) {
        resolveRole(reference, [...chain, name]);
      }
      resolved.add(name);
    };
    for (const name of definitions.keys()) resolveRole(name);
  }
});
