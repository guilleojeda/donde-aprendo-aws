export class SurfaceElement {
  constructor({ tagName = 'DIV', name, type, value = '', files = [], dataset = {}, selectors = {}, lists = [], textContent = '' } = {}) {
    this.tagName = tagName.toUpperCase();
    this.name = name;
    this.type = type;
    this.value = value;
    this.files = files;
    this.dataset = { ...dataset };
    this.selectors = { ...selectors };
    this.lists = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.parentElement = null;
    this.form = null;
    this.textContent = textContent;
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.className = '';
    this.isConnected = true;
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
    for (const child of lists) this.append(child);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(child) {
    if (!(child instanceof SurfaceElement)) return;
    child.parentElement = this;
    this.lists.push(child);
  }

  remove() {
    if (this.parentElement) this.parentElement.lists = this.parentElement.lists.filter((child) => child !== this);
    this.parentElement = null;
    this.isConnected = false;
  }

  descendants() {
    const result = [];
    const seen = new Set();
    const visit = (element) => {
      for (const child of element.lists ?? []) {
        if (!(child instanceof SurfaceElement) || seen.has(child)) continue;
        seen.add(child);
        result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  querySelector(selector) {
    return this.selectors[selector] ?? this.descendants().find((item) => item.matches(selector)) ?? null;
  }

  querySelectorAll(selector) {
    return this.descendants().filter((item) => item.matches(selector));
  }

  matches(selector) {
    return selector.split(',').some((part) => this.matchesSimple(part.trim()));
  }

  matchesSimple(selector) {
    const notMatches = [...selector.matchAll(/:not\(([^()]*)\)/g)].map(([, part]) => part);
    const simple = selector.replace(/:not\([^()]*\)/g, '').replaceAll(':checked', '').trim();
    if (notMatches.some((part) => this.matchesSimple(part))) return false;
    if (selector.includes(':checked') && !this.checked) return false;
    const tag = simple.match(/^[a-z][a-z0-9-]*/i)?.[0];
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    const id = simple.match(/#([\w-]+)/)?.[1];
    if (id && this.getAttribute('id') !== id) return false;
    for (const [, className] of simple.matchAll(/\.([\w-]+)/g)) {
      if (!this.className.split(/\s+/).includes(className)) return false;
    }

    for (const [, expression] of simple.matchAll(/\[([^\]]+)\]/g)) {
      const match = expression.match(/^\s*([\w-]+)\s*(?:(\^=|\$=|\*=|~=|=)\s*(?:"([^"]*)"|'([^']*)'|(.+?)))?\s*$/);
      if (!match) return false;
      const [, attribute, operator, doubleQuoted, singleQuoted, bare] = match;
      const expected = doubleQuoted ?? singleQuoted ?? bare?.trim();
      const actual = attribute === 'name' ? this.name
        : attribute === 'type' ? this.type
          : attribute === 'disabled' ? (this.disabled ? '' : undefined)
            : attribute === 'checked' ? (this.checked ? '' : undefined)
              : this.getAttribute(attribute);

      if (actual === undefined || actual === null) return false;
      if (!operator) continue;
      const value = String(actual);
      if (operator === '=' && value !== expected) return false;
      if (operator === '^=' && !value.startsWith(expected)) return false;
      if (operator === '$=' && !value.endsWith(expected)) return false;
      if (operator === '*=' && !value.includes(expected)) return false;
      if (operator === '~=' && !value.split(/\s+/).includes(expected)) return false;
    }
    return true;
  }

  closest(selector) {
    for (let item = this; item; item = item.parentElement) {
      if (item.matches?.(selector)) return item;
    }
    return null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name) {
    if (name.startsWith('data-')) return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] ?? null;
    if (name === 'name') return this.name ?? null;
    if (name === 'type') return this.type ?? null;
    if (name === 'class') return this.className || null;
    if (name === 'disabled') return this.disabled ? '' : null;
    if (name === 'checked') return this.checked ? '' : null;
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) { return this.getAttribute(name) !== null; }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    if (name === 'disabled') this.disabled = false;
  }

  reportValidity() { return true; }
  setCustomValidity(message) { this.validationMessage = message; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.ownerDocument && (this.ownerDocument.activeElement = this); }

  async dispatch(type, extra = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      ...extra,
    };
    const chain = [];
    for (let item = this; item; item = item.parentElement) chain.push(item);
    for (const currentTarget of chain) {
      event.currentTarget = currentTarget;
      for (const listener of currentTarget.listeners.get(type) ?? []) await listener(event);
      if (event.propagationStopped) break;
    }
    return event;
  }
}

export class SurfaceFormData {
  constructor(form) {
    this.values = new Map();
    for (const control of form?.elements ?? []) {
      if (!control.name || control.disabled) continue;
      if (control.type === 'checkbox' && !control.checked) continue;
      const value = control.type === 'file' ? (control.files[0] ?? null) : control.value;
      const values = this.values.get(control.name) ?? [];
      values.push(value);
      this.values.set(control.name, values);
    }
  }
  get(name) { return this.values.get(name)?.[0] ?? null; }
  getAll(name) { return [...(this.values.get(name) ?? [])]; }
  append(name, value) {
    const values = this.values.get(name) ?? [];
    values.push(value);
    this.values.set(name, values);
  }
  *entries() { for (const [name, values] of this.values) for (const value of values) yield [name, value]; }
}
