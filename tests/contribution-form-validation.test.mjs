import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/scripts/contribution-form.js', import.meta.url), 'utf8');

class Field {
  constructor({ id, type = 'text', tagName = 'INPUT', validity, describedBy = 'contribution-help' }) {
    this.id = id;
    this.type = type;
    this.tagName = tagName;
    this.validity = validity;
    this.attributes = new Map([['aria-describedby', describedBy]]);
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
}

class ErrorMessage {
  constructor(id) {
    this.id = id;
    this.hidden = true;
    this.textContent = '';
  }
}

function createForm(fields) {
  const errors = fields.map((field) => new ErrorMessage(`${field.id}-error`));
  const listeners = new Map();
  const form = {
    dataset: {},
    addEventListener(type, handler, options) {
      const handlers = listeners.get(type) ?? [];
      handlers.push({ handler, options });
      listeners.set(type, handlers);
    },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '[data-contribution-topic]') return [];
      if (selector === '[data-contribution-error]') return errors;
      return [];
    },
  };
  runInNewContext(source, { document: { querySelector: () => form } });
  return {
    errors,
    listeners,
    emit(type, target) {
      for (const { handler } of listeners.get(type) ?? []) handler({ target });
    },
  };
}

test('shows native required errors next to fields and keeps help linked', () => {
  const email = new Field({
    id: 'contribution-email', type: 'email',
    validity: { valid: false, valueMissing: true, typeMismatch: false },
  });
  const { errors, listeners, emit } = createForm([email]);
  const [error] = errors;

  assert.equal(listeners.get('invalid')[0].options, true);
  emit('invalid', email);

  assert.equal(error.textContent, 'Completa este campo.');
  assert.equal(error.hidden, false);
  assert.equal(email.getAttribute('aria-invalid'), 'true');
  assert.equal(email.getAttribute('aria-describedby'), 'contribution-help contribution-email-error');
});

test('updates a visible error while invalid and clears it after input or change', () => {
  const email = new Field({
    id: 'contribution-email', type: 'email',
    validity: { valid: false, valueMissing: true, typeMismatch: false },
  });
  const select = new Field({
    id: 'contribution-kind', tagName: 'SELECT',
    validity: { valid: false, valueMissing: true, typeMismatch: false },
  });
  const { errors, emit } = createForm([email, select]);
  const [emailError, selectError] = errors;

  emit('invalid', email);
  email.validity = { valid: false, valueMissing: false, typeMismatch: true };
  emit('input', email);
  assert.equal(emailError.textContent, 'Escribe un correo electrónico válido.');

  email.validity = { valid: true, valueMissing: false, typeMismatch: false };
  emit('input', email);
  assert.equal(emailError.hidden, true);
  assert.equal(emailError.textContent, '');
  assert.equal(email.getAttribute('aria-invalid'), null);
  assert.equal(email.getAttribute('aria-describedby'), 'contribution-help');

  emit('invalid', select);
  assert.equal(selectError.textContent, 'Selecciona una opción.');
  select.validity = { valid: true, valueMissing: false, typeMismatch: false };
  emit('change', select);
  assert.equal(selectError.hidden, true);
  assert.equal(select.getAttribute('aria-describedby'), 'contribution-help');
});

test('uses native mismatch state to give a URL-specific message', () => {
  const url = new Field({
    id: 'contribution-url', type: 'url',
    validity: { valid: false, valueMissing: false, typeMismatch: true },
  });
  const { errors, emit } = createForm([url]);
  emit('invalid', url);
  assert.equal(errors[0].textContent, 'Escribe una URL válida.');

  url.validity = { valid: false, valueMissing: false, typeMismatch: false, patternMismatch: true };
  emit('input', url);
  assert.equal(errors[0].textContent, 'Revisa este campo.');
});
