const form = document.querySelector('[data-contribution-form]');

if (form) {
  const endpoint = form.dataset.apiUrl || '';
  const submitButton = form.querySelector('[data-contribution-submit]');
  const status = form.querySelector('[data-contribution-status]');
  const kindSelect = form.querySelector('[data-contribution-kind]');
  const formatSelect = form.querySelector('[data-contribution-format]');
  const topicBoxes = [...form.querySelectorAll('[data-contribution-topic]')];
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

  const messages = {
    400: 'Revisa los datos del formulario e inténtalo de nuevo.',
    409: 'Ese enlace ya está registrado o tiene un envío pendiente de revisión editorial. No hace falta enviarlo de nuevo.',
    413: 'La información enviada es demasiado larga. Reduce el texto e inténtalo de nuevo.',
    415: 'No pudimos procesar este envío. Inténtalo de nuevo.',
    429: 'Recibimos muchos envíos en poco tiempo. Espera unos minutos e inténtalo de nuevo.',
    500: 'No pudimos guardar tu contenido. Inténtalo de nuevo más tarde.',
    network: 'No pudimos conectar con el formulario. Revisa tu conexión e inténtalo de nuevo.',
    unknown: 'No pudimos procesar tu envío. Inténtalo de nuevo más tarde.',
  };

  const showStatus = (message, type) => {
    if (!status) return;
    status.textContent = message;
    status.dataset.status = type;
    status.hidden = false;
    status.focus();
  };

  const showReceipt = ({ id, submittedAt } = {}) => {
    if (!status) return;

    status.replaceChildren();
    status.append('¡Gracias! Recibimos tu aporte. Quedó pendiente de revisión editorial antes de su posible publicación. ');

    const referenceLabel = document.createElement('strong');
    referenceLabel.textContent = 'Referencia: ';
    status.append(referenceLabel);

    const reference = document.createElement('code');
    reference.textContent = typeof id === 'string' && id.length > 0 ? id : 'no disponible';
    status.append(reference, document.createTextNode('.'));

    if (typeof submittedAt === 'string' && submittedAt.length > 0) {
      status.append(document.createTextNode(' Fecha de envío: '));
      const time = document.createElement('time');
      time.dateTime = submittedAt;
      const date = new Date(submittedAt);
      time.textContent = Number.isNaN(date.getTime())
        ? submittedAt
        : `${new Intl.DateTimeFormat('es-AR', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(date)} UTC`;
      status.append(time, document.createTextNode('.'));
    }

    status.dataset.status = 'success';
    status.hidden = false;
    status.focus();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.reportValidity() || !endpoint || !submitButton) return;

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.textContent = 'Enviando…';
    if (status) status.hidden = true;

    const formData = new FormData(form);
    const payload = {
      email: formData.get('email'),
      full_name: formData.get('full_name'),
      title: formData.get('title'),
      url: formData.get('url'),
      text: formData.get('text'),
      kind: formData.get('kind'),
      format: formData.get('format'),
      topics: formData.getAll('topics'),
      website: formData.get('website'),
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 201) {
        const receipt = await response.json().catch(() => ({}));
        form.reset();
        if (formatSelect) {
          for (const option of formatSelect.options) {
            if (option.value) { option.hidden = true; option.disabled = true; }
          }
        }
        showReceipt(receipt);
      } else {
        showStatus(messages[response.status] || messages.unknown, 'error');
      }
    } catch {
      showStatus(messages.network, 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      submitButton.textContent = 'Enviar para revisión';
    }
  });
}
