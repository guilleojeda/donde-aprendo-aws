for (const form of document.querySelectorAll<HTMLFormElement>('[data-account-logout]')) {
  const token = form.querySelector<HTMLInputElement>('input[name="csrfToken"]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const status = form.querySelector<HTMLElement>('[data-account-logout-status]');
  if (!token?.value || !button || !status) continue;

  let pending = false;
  const setState = (state: 'idle' | 'pending' | 'error', message = '') => {
    status.dataset.state = state;
    status.hidden = state === 'idle';
    status.textContent = message;
    button.setAttribute('aria-busy', String(state === 'pending'));
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    if (!form.dispatchEvent(new Event('account:logout', { bubbles: true, cancelable: true }))) return;

    const hadFocus = typeof document !== 'undefined' && document.activeElement === button;
    pending = true;
    button.disabled = true;
    setState('pending', 'Cerrando sesión…');
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timeout = controller && typeof window.setTimeout === 'function'
      ? window.setTimeout(() => controller.abort(), 8_000)
      : undefined;

    try {
      // A native navigation POST sends Origin:null from a no-referrer page.
      // CORS fetch keeps the browser's Origin without disclosing a Referer.
      const response = await fetch('/cuenta/salir/', {
        method: 'POST',
        mode: 'cors',
        credentials: 'same-origin',
        redirect: 'error',
        ...(controller ? { signal: controller.signal } : {}),
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
      const message = typeof payload?.message === 'string'
        ? payload.message
        : 'No pudimos confirmar el cierre de sesión. Inténtalo de nuevo.';
      setState('error', message);
    } catch {
      setState('error', 'No pudimos confirmar el cierre de sesión. Inténtalo de nuevo.');
    } finally {
      if (timeout !== undefined && typeof window.clearTimeout === 'function') window.clearTimeout(timeout);
    }

    pending = false;
    button.disabled = false;
    button.textContent = 'Reintentar cierre de sesión';

    // Disabling the submitted button can remove focus. Restore it only when
    // this request displaced the focus that started the attempt; a person who
    // moved to another control while waiting keeps that newer focus.
    const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
    const hasUsableFocus = activeElement instanceof HTMLElement
      && activeElement !== document.body
      && activeElement !== document.documentElement
      && activeElement.isConnected
      && (activeElement as HTMLButtonElement).disabled !== true
      && activeElement.getAttribute('aria-disabled') !== 'true';
    if (hadFocus && activeElement !== button && !hasUsableFocus) {
      button.focus();
    }
  });
  button.disabled = false;
  setState('idle');
}
