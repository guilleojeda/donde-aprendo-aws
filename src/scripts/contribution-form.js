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
  let draftRevision = 0;
  let activeAttempt;

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
    return 'Revisa este campo.';
  };
  const setFieldError = (field, visible) => {
    const error = fieldError(field);
    if (!error) return;

    const describedBy = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (visible) {
      error.textContent = fieldMessage(field);
      error.hidden = false;
      field.setAttribute('aria-invalid', 'true');
      if (!describedBy.includes(error.id)) describedBy.push(error.id);
      field.setAttribute('aria-describedby', describedBy.join(' '));
      return;
    }

    error.textContent = '';
    error.hidden = true;
    field.removeAttribute('aria-invalid');
    const remainingDescriptions = describedBy.filter((id) => id !== error.id);
    if (remainingDescriptions.length) field.setAttribute('aria-describedby', remainingDescriptions.join(' '));
    else field.removeAttribute('aria-describedby');
  };
  const updateVisibleFieldError = (event) => {
    const field = event.target;
    const error = field?.id ? fieldError(field) : null;
    if (!error || error.hidden || !field.validity) return;
    setFieldError(field, !field.validity.valid);
  };

  form.addEventListener('invalid', (event) => {
    const field = event.target;
    if (field?.id && fieldError(field)) setFieldError(field, true);
  }, true);
  form.addEventListener('input', updateVisibleFieldError);
  form.addEventListener('change', updateVisibleFieldError);

  kindSelect?.addEventListener('change', () => {
    if (formatSelect) {
      formatSelect.value = '';
      for (const option of formatSelect.options) {
        if (!option.value) continue;
        const available = option.dataset.formatKind === kindSelect.value;
        option.hidden = !available;
        option.disabled = !available;
      }
    }
  });

  topicBoxes.forEach((box) => box.addEventListener('change', () => {
    const selected = topicBoxes.filter((item) => item.checked);
    if (selected.length > 3) box.checked = false;
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

  const showUncertain = (attempt) => {
    showStatus(uncertainMessage, 'error', { focus: draftRevision === attempt.revision });
  };

  form.addEventListener('input', () => {
    draftRevision += 1;
  });
  form.addEventListener('change', () => {
    draftRevision += 1;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (activeAttempt || !form.reportValidity() || !endpoint || !submitButton) return;

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.textContent = 'Enviando…';
    if (status) status.hidden = true;

    const attempt = {
      payload: formSnapshot(),
      revision: draftRevision,
      controller: new AbortController(),
    };
    activeAttempt = attempt;
    attempt.deadlineId = setTimeout(() => {
      if (!finishAttempt(attempt)) return;
      attempt.controller.abort();
      showUncertain(attempt);
    }, deliveryDeadlineMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt.payload),
        signal: attempt.controller.signal,
      });
      const receipt = response.status === 201 ? await response.json() : undefined;
      if (!finishAttempt(attempt)) return;

      const unchanged = draftRevision === attempt.revision;
      if (response.status !== 201) {
        showStatus(messages[response.status] ?? uncertainMessage, 'error', { focus: unchanged });
        return;
      }
      if (!validReceipt(receipt)) {
        showUncertain(attempt);
        return;
      }
      if (unchanged) {
        form.reset();
        resetFormatOptions();
      }
      showReceipt({ id: receipt.id, submittedAt: receipt.submittedAt, title: attempt.payload.title }, { focus: unchanged });
    } catch {
      if (finishAttempt(attempt)) showUncertain(attempt);
    }
  });
}
