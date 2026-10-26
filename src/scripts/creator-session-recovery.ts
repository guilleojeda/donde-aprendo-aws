type SessionResponse = { error?: unknown; csrfToken?: unknown };

interface CreatorSessionRecoveryOptions {
  root: HTMLElement;
  isWriteActive: () => boolean;
  updateCsrf: (csrfToken: string) => void;
}

export function createCreatorSessionRecovery({ root, isWriteActive, updateCsrf }: CreatorSessionRecoveryOptions) {
  const shell = root.querySelector<HTMLElement>('[data-session-recovery-shell]');
  const status = root.querySelector<HTMLElement>('[data-session-recovery-status]');
  const signInLink = root.querySelector<HTMLAnchorElement>('[data-session-recovery-sign-in]');
  const checkButton = root.querySelector<HTMLButtonElement>('[data-session-recovery-check]');
  const binding = root.dataset.sessionBinding;
  let recoveryRequired: 'expired' | 'csrf' | undefined;
  let checking = false;

  function writeMessage() {
    return recoveryRequired === 'csrf'
      ? 'La sesión cambió. Comprueba la sesión antes de volver a intentarlo.'
      : 'Tu sesión terminó. Conservamos tus cambios; ingresa con la misma cuenta en otra pestaña y después pulsa «Comprobar sesión».';
  }

  function announce(message: string) {
    if (shell) shell.hidden = false;
    if (status) {
      status.textContent = message;
      status.hidden = false;
    }
  }

  function showRecovery(reason: 'expired' | 'csrf') {
    recoveryRequired = reason;
    announce(writeMessage());
    if (signInLink) signInLink.hidden = false;
    if (checkButton) {
      checkButton.hidden = false;
      checkButton.disabled = false;
    }
  }

  async function responseBody(response: Response): Promise<SessionResponse | null> {
    try {
      const value: unknown = await response.clone().json();
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
      return value as SessionResponse;
    } catch {
      return null;
    }
  }

  async function observeWriteResponse(response: Response): Promise<void> {
    if (response.status === 401) {
      showRecovery('expired');
      return;
    }
    if (response.status === 403 && (await responseBody(response))?.error === 'CSRF_REJECTED') {
      showRecovery('csrf');
    }
  }

  async function checkSession() {
    if (!recoveryRequired || checking) return;
    if (isWriteActive()) {
      announce('Espera a que termine la operación antes de comprobar la sesión. Tus cambios siguen aquí.');
      return;
    }
    if (!binding || !/^[a-f0-9]{64}$/.test(binding)) {
      announce('No pudimos comprobar el contexto de esta página. Tus cambios siguen aquí; vuelve a ingresar con la misma cuenta y abre una página nueva.');
      return;
    }

    checking = true;
    if (checkButton) checkButton.disabled = true;
    announce('Comprobando la sesión…');
    try {
      const response = await fetch('/api/creador/sesion/', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-Creator-Page-Binding': binding },
      });
      const payload = await responseBody(response);
      if (response.status === 200 && response.ok
        && typeof payload?.csrfToken === 'string' && payload.csrfToken.trim().length > 0) {
        updateCsrf(payload.csrfToken);
        recoveryRequired = undefined;
        announce('Sesión comprobada. Tus cambios siguen aquí; vuelve a guardar la acción que quieras completar.');
        if (signInLink) signInLink.hidden = true;
        if (checkButton) checkButton.hidden = true;
        return;
      }

      const message = response.status === 401
        ? 'No hay una sesión activa. Ingresa con la misma cuenta en otra pestaña y vuelve a comprobarla.'
        : response.status === 403 && payload?.error === 'ACCOUNT_DISABLED'
          ? 'Esta cuenta está desactivada. Tus cambios siguen aquí; contacta al equipo antes de volver a intentarlo.'
          : response.status === 409 && payload?.error === 'SESSION_CONTEXT_CHANGED'
            ? 'La sesión activa pertenece a otra cuenta o tiene otros permisos. Conservamos tus cambios; ingresa con la cuenta y los permisos originales antes de volver a comprobarla.'
            : response.status === 422 && payload?.error === 'INVALID_CONTEXT'
              ? 'No pudimos comprobar el contexto de esta página. Tus cambios siguen aquí; abre una página nueva con la cuenta original.'
              : 'No pudimos comprobar la sesión. Tus cambios siguen aquí; inténtalo de nuevo.';
      announce(message);
    } catch {
      announce('No pudimos conectar para comprobar la sesión. Tus cambios siguen aquí; inténtalo de nuevo.');
    } finally {
      checking = false;
      if (checkButton && recoveryRequired) checkButton.disabled = false;
    }
  }

  checkButton?.addEventListener('click', (event) => {
    event.preventDefault();
    void checkSession();
  });

  return {
    blocksWrites(): boolean {
      return recoveryRequired !== undefined;
    },
    announceBlocked() {
      announce(writeMessage());
    },
    writeFailureMessage() {
      return writeMessage();
    },
    observeWriteResponse,
  };
}
