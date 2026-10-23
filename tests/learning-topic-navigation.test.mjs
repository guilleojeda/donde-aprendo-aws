import assert from 'node:assert/strict';
import test from 'node:test';
import { setupLearningTopicDisclosure } from '../src/scripts/learning-topic-navigation.js';

class FakeElement {
  constructor(name, document) {
    this.name = name;
    this.document = document;
    this.ownerDocument = document;
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.children = new Set();
    this.attributes = new Set();
    this.parentElement = null;
    this.open = false;
  }

  getBoundingClientRect() {
    return { left: 24, right: 124, top: 24, bottom: 64, width: 100, height: 40 };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  contains(element) {
    return element === this || Boolean(element?.parentElement && this.contains(element.parentElement));
  }

  append(child) {
    child.parentElement = this;
    this.children.add(child);
  }

  setAttribute(name) {
    this.attributes.add(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  closest(selector) {
    assert.equal(selector, '[data-theme-toggle]', 'the fake implements only the public theme-toggle selector');
    for (let element = this; element; element = element.parentElement) {
      if (element.hasAttribute('data-theme-toggle')) return element;
    }
    return null;
  }

  focus() {
    this.document.activeElement = this;
  }
}

function createNavigation() {
  const viewListeners = new Map();
  const document = {
    activeElement: null,
    listeners: new Map(),
    documentElement: { clientWidth: 1024, clientHeight: 768 },
    defaultView: {
      requestAnimationFrame(callback) { callback(); },
      addEventListener(type, listener) {
        const listeners = viewListeners.get(type) ?? [];
        listeners.push(listener);
        viewListeners.set(type, listeners);
      },
    },
    addEventListener(type, listener, options) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push({ listener, options });
      this.listeners.set(type, listeners);
    },
    querySelector(selector) {
      assert.equal(selector, '.collection-navigation__details');
      return disclosure;
    },
    emit(type, event) {
      for (const { listener } of this.listeners.get(type) ?? []) listener(event);
    },
  };
  const disclosure = new FakeElement('disclosure', document);
  const summary = new FakeElement('summary', document);
  const panel = new FakeElement('panel', document);
  const firstTopic = new FakeElement('first-topic', document);
  const lastTopic = new FakeElement('last-topic', document);
  const sort = new FakeElement('resource-sort', document);
  const outside = new FakeElement('outside', document);
  const themeToggle = new FakeElement('theme-toggle', document);
  themeToggle.setAttribute('data-theme-toggle');
  const themeIcon = new FakeElement('theme-icon', document);
  disclosure.append(summary);
  disclosure.append(panel);
  panel.append(firstTopic);
  panel.append(lastTopic);
  themeToggle.append(themeIcon);
  disclosure.querySelector = (selector) => {
    if (selector === 'summary') return summary;
    if (selector === '[data-directory-overlay-panel]') return panel;
    assert.fail(`Unsupported disclosure selector: ${selector}`);
  };

  setupLearningTopicDisclosure(document);
  return { document, disclosure, summary, firstTopic, lastTopic, sort, outside, themeToggle, themeIcon };
}

function keyboardEvent(key, target) {
  return {
    key,
    target,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
}

function focusout(navigation, target, relatedTarget) {
  const event = { target, relatedTarget };
  if (navigation.disclosure.contains(target)) navigation.disclosure.emit('focusout', event);
  navigation.document.emit('focusout', event);
}

test('the disclosure stays open while focus moves among its summary and topic links, then closes on exit', () => {
  const navigation = createNavigation();
  const { document, disclosure, summary, firstTopic, lastTopic, sort } = navigation;
  disclosure.open = true;

  document.activeElement = summary;
  focusout(navigation, summary, firstTopic);
  assert.equal(disclosure.open, true, 'Tab into the topic links keeps the panel open.');

  document.activeElement = firstTopic;
  focusout(navigation, firstTopic, lastTopic);
  assert.equal(disclosure.open, true, 'Moving between topic links keeps the panel open.');

  document.activeElement = sort;
  focusout(navigation, lastTopic, sort);
  assert.equal(disclosure.open, false, 'Tab to the sort control closes the panel.');
  assert.equal(document.activeElement, sort, 'Closing on focus exit preserves the natural destination.');

  disclosure.open = true;
  document.activeElement = summary;
  focusout(navigation, summary, summary);
  assert.equal(disclosure.open, true, 'Shift+Tab back to the summary keeps the panel open.');

  document.activeElement = summary;
  focusout(navigation, summary, sort);
  assert.equal(disclosure.open, false, 'Leaving the disclosure from its summary closes it too.');

  disclosure.open = true;
  document.activeElement = null;
  focusout(navigation, summary, null);
  assert.equal(disclosure.open, false, 'A null relatedTarget also closes when focus leaves the document.');
  assert.equal(document.activeElement, null, 'A null relatedTarget does not trigger focus restoration.');
});

test('Escape inside closes and returns focus to the summary', () => {
  const { document, disclosure, summary, lastTopic } = createNavigation();
  disclosure.open = true;
  document.activeElement = lastTopic;
  const event = keyboardEvent('Escape', lastTopic);

  document.emit('keydown', event);

  assert.equal(disclosure.open, false);
  assert.equal(document.activeElement, summary);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(document.listeners.get('keydown')[0].options.capture, true,
    'Escape is handled before the site header keyboard handler can move focus.');
});

test('Escape outside and outside clicks close without moving focus', () => {
  const { document, disclosure, sort, outside, firstTopic } = createNavigation();
  disclosure.open = true;
  document.activeElement = sort;
  const event = keyboardEvent('Escape', sort);

  document.emit('keydown', event);

  assert.equal(disclosure.open, false);
  assert.equal(document.activeElement, sort);
  assert.equal(event.prevented, false);
  assert.equal(event.stopped, false, 'Escape outside the topic panel remains available to other controls and handlers.');

  disclosure.open = true;
  document.emit('click', { target: firstTopic });
  assert.equal(disclosure.open, true, 'Clicks within the disclosure do not close it before link activation.');

  document.activeElement = outside;
  document.emit('click', { target: outside });
  assert.equal(disclosure.open, false);
  assert.equal(document.activeElement, outside);
});

test('theme toggle and its SVG do not dismiss an open topic disclosure', () => {
  const navigation = createNavigation();
  const { document, disclosure, summary, outside, themeToggle, themeIcon } = navigation;
  disclosure.open = true;
  document.activeElement = summary;

  focusout(navigation, summary, themeToggle);
  assert.equal(disclosure.open, true, 'moving focus to the theme toggle keeps the disclosure open');

  document.activeElement = themeToggle;
  document.emit('click', { target: themeIcon });
  assert.equal(disclosure.open, true, 'clicking the SVG inside the theme toggle keeps it open');
  assert.equal(document.activeElement, themeToggle, 'the theme control retains its natural focus');

  disclosure.open = true;
  document.activeElement = outside;
  document.emit('click', { target: outside });
  assert.equal(disclosure.open, false, 'an unrelated outside click still dismisses the disclosure');
  assert.equal(document.activeElement, outside, 'outside dismissal does not restore focus');
});

test('focus leaving the theme toggle closes the topic disclosure but returning inside keeps it open', () => {
  const navigation = createNavigation();
  const { disclosure, summary, firstTopic, sort, themeToggle } = navigation;
  disclosure.open = true;

  focusout(navigation, summary, themeToggle);
  assert.equal(disclosure.open, true, 'focus entering the theme toggle is an allowed transition');
  focusout(navigation, themeToggle, sort);
  assert.equal(disclosure.open, false, 'focus leaving the theme toggle to another outside control dismisses the panel');

  disclosure.open = true;
  focusout(navigation, summary, themeToggle);
  focusout(navigation, themeToggle, firstTopic);
  assert.equal(disclosure.open, true, 'focus returning from the theme toggle into the panel keeps it open');
  focusout(navigation, firstTopic, null);
  assert.equal(disclosure.open, false, 'a null relatedTarget still dismisses the panel');
});

test('generic collection navigation does not install disclosure handlers', () => {
  const document = {
    querySelector(selector) {
      assert.equal(selector, '.collection-navigation__details');
      return null;
    },
    addEventListener() {
      assert.fail('No listeners are needed when the topic disclosure is absent.');
    },
  };

  assert.equal(setupLearningTopicDisclosure(document), undefined);
});
