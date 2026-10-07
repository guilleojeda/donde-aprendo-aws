import assert from 'node:assert/strict';
import test from 'node:test';
import { setupLearningTopicDisclosure } from '../src/scripts/learning-topic-navigation.js';

class FakeElement {
  constructor(name, document) {
    this.name = name;
    this.document = document;
    this.listeners = new Map();
    this.children = new Set();
    this.open = false;
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
    return element === this || this.children.has(element);
  }

  focus() {
    this.document.activeElement = this;
  }
}

function createNavigation() {
  const document = {
    activeElement: null,
    listeners: new Map(),
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
  const firstTopic = new FakeElement('first-topic', document);
  const lastTopic = new FakeElement('last-topic', document);
  const sort = new FakeElement('resource-sort', document);
  const outside = new FakeElement('outside', document);
  disclosure.children.add(summary);
  disclosure.children.add(firstTopic);
  disclosure.children.add(lastTopic);
  disclosure.querySelector = (selector) => {
    assert.equal(selector, 'summary');
    return summary;
  };

  setupLearningTopicDisclosure(document);
  return { document, disclosure, summary, firstTopic, lastTopic, sort, outside };
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

test('the disclosure stays open while focus moves among its summary and topic links, then closes on exit', () => {
  const navigation = createNavigation();
  const { document, disclosure, summary, firstTopic, lastTopic, sort } = navigation;
  disclosure.open = true;

  document.activeElement = summary;
  disclosure.emit('focusout', { relatedTarget: firstTopic });
  assert.equal(disclosure.open, true, 'Tab into the topic links keeps the panel open.');

  document.activeElement = firstTopic;
  disclosure.emit('focusout', { relatedTarget: lastTopic });
  assert.equal(disclosure.open, true, 'Moving between topic links keeps the panel open.');

  document.activeElement = sort;
  disclosure.emit('focusout', { relatedTarget: sort });
  assert.equal(disclosure.open, false, 'Tab to the sort control closes the panel.');
  assert.equal(document.activeElement, sort, 'Closing on focus exit preserves the natural destination.');

  disclosure.open = true;
  document.activeElement = summary;
  disclosure.emit('focusout', { relatedTarget: summary });
  assert.equal(disclosure.open, true, 'Shift+Tab back to the summary keeps the panel open.');

  document.activeElement = summary;
  disclosure.emit('focusout', { relatedTarget: sort });
  assert.equal(disclosure.open, false, 'Leaving the disclosure from its summary closes it too.');

  disclosure.open = true;
  document.activeElement = null;
  disclosure.emit('focusout', { relatedTarget: null });
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
