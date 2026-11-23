import { updateFieldDescription } from '../lib/field-description.mjs';
import { isPublicCatalogResourceId } from '../lib/catalog-identity.mjs';

const form = document.querySelector('[data-contribution-form]');

if (form) {
  const deliveryDeadlineMs = 12_000;
  const endpoint = form.dataset.apiUrl || '';
  const submitButton = form.querySelector('[data-contribution-submit]');
  const status = form.querySelector('[data-contribution-status]');
  const kindSelect = form.querySelector('[data-contribution-kind]');
  const formatSelect = form.querySelector('[data-contribution-format]');
  const topicBoxes = [...form.querySelectorAll('[data-contribution-topic]')];
  const topicsGroup = form.querySelector('[data-contribution-topics-group]');
  const topicOptions = form.querySelector('.contribution-form__topic-options');
  const taxonomyGroup = form.querySelector('[data-contribution-taxonomy]');
  let draftRevision = 0;
  let activeAttempt;
  let invalidCycle = false;

  const diagnosticMessages = Object.freeze({
    'email:required': 'Completa tu correo electrónico.',
    'email:invalid_email': 'Escribe un correo electrónico válido.',
    'email:too_long': 'Tu correo electrónico es demasiado largo.',
    'email:invalid_value': 'Quita los caracteres no permitidos del correo electrónico.',
    'full_name:required': 'Completa tu nombre completo.',
    'full_name:too_long': 'Tu nombre completo es demasiado largo.',
    'full_name:invalid_value': 'Quita los caracteres no permitidos de tu nombre completo.',
    'title:required': 'Completa el título o nombre.',
    'title:too_long': 'El título o nombre es demasiado largo.',
    'title:invalid_value': 'Quita los caracteres no permitidos del título o nombre.',
    'url:required': 'Completa la URL.',
    'url:too_long': 'La URL es demasiado larga.',
    'url:invalid_url': 'Escribe una URL HTTP o HTTPS válida.',
    'url:invalid_value': 'Quita los caracteres no permitidos de la URL.',
    'text:required': 'Completa la descripción.',
    'text:too_long': 'La descripción es demasiado larga.',
    'text:invalid_value': 'Quita los caracteres no permitidos de la descripción.',
    'topics:invalid_option': 'Elige hasta tres temas válidos.',
    'kind-format:invalid_combination': 'Elige una combinación válida de tipo y formato.',
  });

  const isValidReceiptDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
  };
  const validReceipt = (value) => value && typeof value === 'object' && !Array.isArray(value)
    && value.ok === true
    && value.code === 'created'
    && isPublicCatalogResourceId(value.id)
    && isValidReceiptDate(value.submittedAt);

  const resetFormatOptions = () => {
    if (!formatSelect) return;
    formatSelect.value = '';
    for (const option of formatSelect.options) {
      if (!option.value) continue;
      option.hidden = true;
      option.disabled = true;
    }
  };

  const updateFormatOptions = () => {
    if (!kindSelect || !formatSelect) return;
    formatSelect.value = '';
    for (const option of formatSelect.options) {
      if (!option.value) continue;
      const available = option.dataset.formatKind === kindSelect.value;
      option.hidden = !available;
      option.disabled = !available;
    }
  };

  const formSnapshot = () => {
    const data = new FormData(form);
    return {
      email: data.get('email'),
      full_name: data.get('full_name'),
      title: data.get('title'),
      url: data.get('url'),
      text: data.get('text'),
      kind: data.get('kind'),
      format: data.get('format'),
      topics: data.getAll('topics'),
      website: data.get('website'),
    };
  };

  const restoreSubmitControl = () => {
    if (!submitButton) return;
    submitButton.disabled = false;
    submitButton.removeAttribute('aria-busy');
    submitButton.textContent = 'Enviar para revisión';
  };

  const fieldError = (field) => [...form.querySelectorAll('[data-contribution-error]')]
    .find((error) => error.id === `${field.id}-error`);
  const fieldMessage = (field) => {
    if (field.validity?.valueMissing) {
      return field.tagName?.toLowerCase() === 'select' ? 'Selecciona una opción.' : 'Completa este campo.';
    }
    if (field.validity?.typeMismatch) {
      if (field.type === 'email') return 'Escribe un correo electrónico válido.';
      if (field.type === 'url') return 'Escribe una URL válida.';
    }
    if (field.validity?.tooLong) return 'Reduce la longitud de este campo.';
    return 'Revisa este campo.';
  };

  const setFieldError = (field, visible, message = fieldMessage(field)) => {
    const error = fieldError(field);
    if (!error) return;

    if (visible) {
      error.textContent = message;
      error.hidden = false;
      field.setAttribute('aria-invalid', 'true');
      updateFieldDescription(field, error.id, true);
      return;
    }

    error.textContent = '';
    error.hidden = true;
    field.removeAttribute('aria-invalid');
    updateFieldDescription(field, error.id, false);
  };

  const groupControls = (group) => group === 'topics' ? topicBoxes : [kindSelect, formatSelect].filter(Boolean);
  const groupError = (group) => form.querySelector(`#contribution-${group === 'topics' ? 'topics' : 'kind-format'}-error`);
  const groupContainer = (group) => group === 'topics' ? topicsGroup : taxonomyGroup;
  const restoreTopicErrorPlacement = () => {
    const error = groupError('topics');
    if (error && topicOptions && error.parentElement === topicOptions) topicOptions.after(error);
  };
  const placeTopicErrorNear = (box) => {
    const error = groupError('topics');
    const label = box.closest('label');
    if (error && label) label.after(error);
  };
  const setGroupError = (group, visible, message = '') => {
    const error = groupError(group);
    const container = groupContainer(group);
    if (!error || !container) return;
    const controls = groupControls(group);

    if (visible) {
      error.textContent = message;
      error.hidden = false;
      container.setAttribute('aria-invalid', 'true');
      updateFieldDescription(container, error.id, true);
      for (const control of controls) {
        control.setAttribute('aria-invalid', 'true');
        updateFieldDescription(control, error.id, true);
      }
      return;
    }

    error.textContent = '';
    error.hidden = true;
    container.removeAttribute('aria-invalid');
    updateFieldDescription(container, error.id, false);
    for (const control of controls) {
      if (fieldError(control)?.hidden === false) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
      updateFieldDescription(control, error.id, false);
    }
  };

  const clearGroupError = (group) => {
    if (group === 'topics') restoreTopicErrorPlacement();
    if (groupError(group)?.hidden === false) setGroupError(group, false);
  };

  const errorLabel = (control) => control?.labels?.[0] ?? control?.closest('label');
  const revealErrorContext = (control, error, { focus = false } = {}) => {
    if (!control || !error || error.hidden) return false;
    if (focus) {
      control.focus({ preventScroll: true });
      if (document.activeElement !== control) return false;
    }

    const rects = [errorLabel(control), control, error]
      .filter((element) => typeof element?.getBoundingClientRect === 'function')
      .map((element) => element.getBoundingClientRect());
    if (rects.length === 0) return true;
    const bounds = rects
      .reduce((combined, element) => {
        return {
          top: Math.min(combined.top, element.top),
          bottom: Math.max(combined.bottom, element.bottom),
        };
      }, { top: Number.POSITIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY });
    const viewportHeight = window.innerHeight;
    if (viewportHeight > 0 && (bounds.top < 0 || bounds.bottom > viewportHeight)) {
      const distance = (bounds.top + bounds.bottom - viewportHeight) / 2;
      window.scrollBy({ top: distance, behavior: 'instant' });
    }
    return true;
  };

  const updateVisibleFieldError = (event) => {
    const field = event.target;
    if (!field?.id || !field.validity) return;
    if (field === kindSelect || field === formatSelect) clearGroupError('kind-format');
    if (fieldError(field)?.hidden === false) setFieldError(field, !field.validity.valid);
  };

  form.addEventListener('invalid', (event) => {
    const field = event.target;
    if (!field?.id || !fieldError(field)) return;
    event.preventDefault();
    setFieldError(field, true);
    if (invalidCycle) return;
    invalidCycle = true;
    setTimeout(() => {
      revealErrorContext(field, fieldError(field), { focus: true });
      invalidCycle = false;
    }, 0);
  }, true);
  form.addEventListener('input', (event) => {
    draftRevision += 1;
    updateVisibleFieldError(event);
  });
  form.addEventListener('change', (event) => {
    draftRevision += 1;
    updateVisibleFieldError(event);
  });

  kindSelect?.addEventListener('change', updateFormatOptions);

  topicBoxes.forEach((box) => box.addEventListener('change', () => {
    clearGroupError('topics');
    const selected = topicBoxes.filter((item) => item.checked);
    if (selected.length <= 3) return;
    box.checked = false;
    placeTopicErrorNear(box);
    setGroupError('topics', true, 'Puedes elegir hasta tres temas.');
    revealErrorContext(box, groupError('topics'));
  }));

  const uncertainMessage = 'No pudimos confirmar el resultado de tu envío. Conserva el formulario y revisa antes de intentarlo de nuevo.';
  const messages = {
    400: 'Revisa los datos del formulario e inténtalo de nuevo.',
    409: 'Ese enlace ya está registrado o pendiente de revisión. No hace falta enviarlo de nuevo.',
    413: 'La información enviada es demasiado larga. Reduce el texto e inténtalo de nuevo.',
    415: 'No pudimos procesar este envío. Inténtalo de nuevo.',
    429: 'Recibimos muchos envíos en poco tiempo. Espera unos minutos e inténtalo de nuevo.',
  };

  const showStatus = (message, type, { focus = true } = {}) => {
    if (!status) return;
    status.textContent = message;
    status.dataset.status = type;
    status.hidden = false;
    if (focus) status.focus();
  };

  const showReceipt = ({ id, submittedAt, title }, { focus }) => {
    if (!status) return;

    status.replaceChildren();
    status.append('¡Gracias! Recibimos ');
    const submittedTitle = document.createElement('strong');
    submittedTitle.textContent = typeof title === 'string' && title.length > 0 ? `«${title}»` : 'tu aporte';
    status.append(submittedTitle, '. Quedó pendiente de revisión editorial antes de su posible publicación. ');

    const referenceLabel = document.createElement('strong');
    referenceLabel.textContent = 'Referencia: ';
    status.append(referenceLabel);

    const reference = document.createElement('code');
    reference.textContent = id;
    status.append(reference, document.createTextNode('.'));

    status.append(document.createTextNode(' Fecha de envío: '));
    const time = document.createElement('time');
    time.dateTime = submittedAt;
    time.textContent = `${new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(submittedAt))} UTC`;
    status.append(time, document.createTextNode('.'));

    status.dataset.status = 'success';
    status.hidden = false;
    if (focus) status.focus();
  };

  const finishAttempt = (attempt) => {
    if (activeAttempt !== attempt) return false;
    activeAttempt = undefined;
    clearTimeout(attempt.deadlineId);
    restoreSubmitControl();
    return true;
  };

  const canFocusAttemptResult = (attempt) => {
    if (draftRevision !== attempt.revision) return false;
    const current = document.activeElement;
    if (!current || current === document.documentElement || current === document.body) return true;
    return current === submitButton || (current === attempt.focusedElement && form.contains(current));
  };

  const showUncertain = (attempt) => {
    showStatus(uncertainMessage, 'error', { focus: canFocusAttemptResult(attempt) });
  };

  const diagnosticMessage = ({ field, reason }) => diagnosticMessages[`${field}:${reason}`];
  const readFieldDiagnostics = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.ok !== false
      || body.code !== 'invalid_request' || !Array.isArray(body.fieldErrors)
      || body.fieldErrors.length === 0) return [];
    const seen = new Set();
    const diagnostics = [];
    for (const item of body.fieldErrors) {
      if (!item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.field !== 'string' || typeof item.reason !== 'string') return [];
      const key = `${item.field}:${item.reason}`;
      if (!Object.hasOwn(diagnosticMessages, key) || !diagnosticMessage(item)) return [];
      if (seen.has(key)) continue;
      seen.add(key);
      diagnostics.push({ field: item.field, reason: item.reason });
    }
    return diagnostics;
  };

  const snapshotValue = (target, snapshot) => {
    if (target === 'topics') return JSON.stringify(snapshot.topics);
    if (target === 'kind-format') return JSON.stringify([snapshot.kind, snapshot.format]);
    return JSON.stringify(snapshot[target]);
  };
  const currentValue = (target) => {
    if (target === 'topics') return JSON.stringify(topicBoxes.filter((box) => box.checked).map((box) => box.value));
    if (target === 'kind-format') return JSON.stringify([kindSelect?.value ?? '', formatSelect?.value ?? '']);
    const field = form.elements.namedItem(target);
    return JSON.stringify(field && typeof field !== 'string' ? field.value : undefined);
  };
  const diagnosticControl = (target) => {
    if (target === 'topics') return topicBoxes[0];
    if (target === 'kind-format') return kindSelect || formatSelect;
    const field = form.elements.namedItem(target);
    return field && typeof field !== 'string' ? field : undefined;
  };
  const showDiagnostic = (diagnostic, { nearFocus = true } = {}) => {
    const { field } = diagnostic;
    const message = diagnosticMessage(diagnostic);
    if (field === 'topics' || field === 'kind-format') {
      if (field === 'topics' && nearFocus) placeTopicErrorNear(topicBoxes[0]);
      setGroupError(field, true, message);
      return { control: diagnosticControl(field), error: groupError(field) };
    }
    const control = diagnosticControl(field);
    if (!control) return undefined;
    setFieldError(control, true, message);
    return { control, error: fieldError(control) };
  };

  const applyFieldDiagnostics = (attempt, diagnostics) => {
    const applicable = diagnostics.filter(({ field }) => (
      snapshotValue(field, attempt.payload) === currentValue(field)
    ));
    if (applicable.length === 0) return false;
    const shouldFocus = canFocusAttemptResult(attempt);
    const shown = applicable.map((diagnostic) => showDiagnostic(diagnostic, { nearFocus: shouldFocus })).filter(Boolean);
    if (shouldFocus) {
      const first = shown[0];
      if (first) revealErrorContext(first.control, first.error, { focus: true });
    }
    return true;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    // Native validation has already run before submit is dispatched. Calling
    // reportValidity here would dispatch every invalid event a second time.
    if (activeAttempt || !endpoint || !submitButton) return;

    const focusedElement = document.activeElement;
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.textContent = 'Enviando…';
    if (status) status.hidden = true;

    const attempt = {
      payload: formSnapshot(),
      revision: draftRevision,
      focusedElement,
      controller: new AbortController(),
      headersReceived: false,
      responseStatus: undefined,
    };
    activeAttempt = attempt;
    attempt.deadlineId = setTimeout(() => {
      if (activeAttempt !== attempt) return;
      const definitiveInvalidRequest = attempt.headersReceived && attempt.responseStatus === 400;
      if (!finishAttempt(attempt)) return;
      attempt.controller.abort();
      if (definitiveInvalidRequest) {
        showStatus(messages[400], 'error', { focus: canFocusAttemptResult(attempt) });
      } else {
        showUncertain(attempt);
      }
    }, deliveryDeadlineMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt.payload),
        signal: attempt.controller.signal,
      });
      attempt.headersReceived = true;
      attempt.responseStatus = response.status;

      let body;
      if (response.status === 201 || response.status === 400) {
        try {
          body = await response.json();
        } catch {
          body = undefined;
        }
      }
      if (!finishAttempt(attempt)) return;

      const unchanged = draftRevision === attempt.revision;
      if (response.status !== 201) {
        if (response.status === 400) {
          const diagnostics = readFieldDiagnostics(body);
          if (applyFieldDiagnostics(attempt, diagnostics)) return;
        }
        showStatus(messages[response.status] ?? uncertainMessage, 'error', { focus: canFocusAttemptResult(attempt) });
        return;
      }
      if (!validReceipt(body)) {
        showUncertain(attempt);
        return;
      }
      if (unchanged) {
        clearGroupError('topics');
        clearGroupError('kind-format');
        for (const field of form.querySelectorAll('input[aria-invalid], select[aria-invalid], textarea[aria-invalid]')) {
          setFieldError(field, false);
        }
        form.reset();
        resetFormatOptions();
      }
      showReceipt({ id: body.id, submittedAt: body.submittedAt, title: attempt.payload.title }, { focus: canFocusAttemptResult(attempt) });
    } catch {
      if (finishAttempt(attempt)) showUncertain(attempt);
    }
  });
}
