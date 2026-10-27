for (const form of document.querySelectorAll<HTMLFormElement>('[data-account-logout]')) {
  const token = form.querySelector<HTMLInputElement>('input[name="csrfToken"]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const status = form.querySelector<HTMLElement>('[data-account-logout-status]');
  if (!token?.value || !button || !status) continue;

  let pending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    if (!form.dispatchEvent(new Event('account:logout', { bubbles: true, cancelable: true }))) return;
    pending = true;
    button.disabled = true;
    status.hidden = false;
    status.textContent = 'Cerrando sesión…';

    try {
      // A native navigation POST sends Origin:null from a no-referrer page.
      // CORS fetch keeps the browser's Origin without disclosing a Referer.
      const response = await fetch('/cuenta/salir/', {
        method: 'POST',
        mode: 'cors',
        credentials: 'same-origin',
        redirect: 'error',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken: token.value }),
      });
      const payload = await response.json();
      if (response.ok && typeof payload.redirect === 'string') {
        const destination = new URL(payload.redirect, window.location.href);
        if (destination.username || destination.password
          || (destination.protocol !== 'https:' && destination.origin !== window.location.origin)) {
          throw new Error('invalid-logout-destination');
        }
        window.location.assign(destination.href);
        return;
      }
      status.textContent = typeof payload.message === 'string'
        ? payload.message
        : 'No pudimos confirmar el cierre de sesión. Inténtalo de nuevo.';
    } catch {
      status.textContent = 'No pudimos confirmar el cierre de sesión. Inténtalo de nuevo.';
    }

    pending = false;
    button.disabled = false;
    button.textContent = 'Reintentar cierre de sesión';
  });
  button.disabled = false;
}
