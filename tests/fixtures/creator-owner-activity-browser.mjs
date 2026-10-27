/** Small DOM surface for the owner activity controller acceptance tests. */
export class ActivityElement {
  constructor({ tagName = 'DIV', attrs = {}, textContent = '', value = '' } = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attrs).map(([name, value]) => [name, String(value)]));
    this.listeners = new Map();
    this.children = [];
    this.parentElement = null;
    this.textContent = textContent;
    this.value = value;
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
  }

  get dataset() {
    return new Proxy({}, {
      get: (_target, key) => {
        if (typeof key !== 'string') return undefined;
        return this.getAttribute(`data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
      },
      set: (_target, key, value) => {
        if (typeof key !== 'string') return false;
        this.setAttribute(`data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value);
        return true;
      },
    });
  }

  get href() { return this.getAttribute('href') ?? ''; }
  set href(value) { this.setAttribute('href', value); }
  get dateTime() { return this.getAttribute('datetime') ?? ''; }
  set dateTime(value) { this.setAttribute('datetime', value); }

  append(...elements) {
    for (const element of elements) {
      element.parentElement = this;
      this.children.push(element);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    if (!event.target) Object.defineProperty(event, 'target', { value: this, configurable: true });
    for (let current = this; current; current = current.parentElement) {
      Object.defineProperty(event, 'currentTarget', { value: current, configurable: true });
      for (const listener of current.listeners.get(event.type) ?? []) listener.call(current, event);
      if (!event.bubbles) break;
    }
    return !event.defaultPrevented;
  }

  click() {
    const event = {
      type: 'click',
      target: this,
      bubbles: true,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    this.dispatchEvent(event);
    return event;
  }

  matches(selector) {
    return selector.split(',').some((part) => this.matchesOne(part.trim()));
  }

  matchesOne(selector) {
    const tag = selector.match(/^[a-z][a-z0-9-]*/iu)?.[0];
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    for (const [, attribute, operator, doubleQuoted, singleQuoted, bare] of selector.matchAll(/\[([\w-]+)(?:\s*(=|\^=|\$=|\*=|~=)\s*(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/gu)) {
      const expected = doubleQuoted ?? singleQuoted ?? bare?.trim();
      const actual = this.getAttribute(attribute);
      if (actual === null) return false;
      if (!operator) continue;
      if (operator === '=' && actual !== expected) return false;
      if (operator === '^=' && !actual.startsWith(expected)) return false;
      if (operator === '$=' && !actual.endsWith(expected)) return false;
      if (operator === '*=' && !actual.includes(expected)) return false;
      if (operator === '~=' && !actual.split(/\s+/u).includes(expected)) return false;
    }
    return true;
  }

  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (current.matches(selector)) return current;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const result = [];
    const visit = (parent) => {
      for (const child of parent.children) {
        if (child.matches(selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
}

export function activityBrowser({ profileState = 'published', creatorId = 'fixture-id-1', search = '' } = {}) {
  const owner = new ActivityElement({ tagName: 'MAIN', attrs: { 'data-creator-owner': '' } });
  const activity = new ActivityElement({ tagName: 'SECTION', attrs: {
    'data-owner-activity': '',
    'data-owner-profile-state': profileState,
    'data-owner-creator-id': creatorId,
  } });
  const status = new ActivityElement({ attrs: { 'data-owner-activity-status': '' }, textContent: 'Cargando estadísticas…' });
  const totals = Object.fromEntries(['views', 'visitors', 'clicks'].map((name) => [name,
    new ActivityElement({ attrs: { 'data-owner-activity-total': name }, textContent: '—' })]));
  const rangeStart = new ActivityElement({ tagName: 'TIME', attrs: { 'data-owner-activity-start': '' } });
  const rangeEnd = new ActivityElement({ tagName: 'TIME', attrs: { 'data-owner-activity-end': '' } });
  const updated = new ActivityElement({ tagName: 'TIME', attrs: { 'data-owner-activity-updated': '' } });
  const periods = [7, 30].map((period) => new ActivityElement({ tagName: 'BUTTON', attrs: {
    'data-owner-activity-period': String(period),
    type: 'button',
  } }));
  const detail = new ActivityElement({ tagName: 'A', attrs: {
    'data-owner-activity-detail': '',
    href: '/cuenta/?vista=estadisticas&periodo=30&pagina=1',
  } });
  const retry = new ActivityElement({ tagName: 'BUTTON', attrs: {
    'data-owner-activity-retry': '',
    type: 'button',
  } });
  retry.hidden = true;
  activity.append(status, totals.views, totals.visitors, totals.clicks, rangeStart, rangeEnd, updated, ...periods, detail, retry);
  const edit = new ActivityElement({ tagName: 'BUTTON', attrs: { 'data-owner-edit': '', type: 'button' } });
  owner.append(activity, edit);

  const documentListeners = new Map();
  const document = {
    querySelector(selector) {
      if (selector === '[data-creator-owner]' || selector === '[data-owner-root]') return owner;
      if (selector === '[data-owner-activity]') return activity;
      return owner.querySelector(selector);
    },
    querySelectorAll(selector) { return owner.querySelectorAll(selector); },
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) ?? [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
  };
  const location = {
    href: `https://example.test/cuenta/${search}`,
    origin: 'https://example.test',
    pathname: '/cuenta/',
    search,
    reloadCount: 0,
    reload() { this.reloadCount += 1; },
    assign(href) { this.href = href; },
  };
  const window = { location, history: { pushState() {}, replaceState() {} }, addEventListener() {} };
  return { owner, activity, status, totals, rangeStart, rangeEnd, updated, periods, detail, retry, edit, document, documentListeners, window };
}
