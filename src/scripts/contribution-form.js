const form = document.querySelector('[data-contribution-form]');

if (form) {
  const endpoint = form.dataset.apiUrl || '';
  const submitButton = form.querySelector('[data-contribution-submit]');
  const status = form.querySelector('[data-contribution-status]');

  const messages = {
    success: '¡Gracias! Guardamos tu contenido y queda pendiente de revisión.',
    400: 'Revisa los datos del formulario e inténtalo de nuevo.',
    409: 'Ese enlace ya está registrado en el directorio.',
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
      Category: formData.get('Category'),
      website: formData.get('website'),
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 201) {
        form.reset();
        showStatus(messages.success, 'success');
      } else {
        showStatus(messages[response.status] || messages.unknown, 'error');
      }
    } catch {
      showStatus(messages.network, 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      submitButton.textContent = 'Agregar mi contenido';
    }
  });
}
