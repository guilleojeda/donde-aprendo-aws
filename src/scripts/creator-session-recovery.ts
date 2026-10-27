type SessionResponse = { error?: unknown; csrfToken?: unknown };

interface CreatorSessionRecoveryOptions {
  root: HTMLElement;
  additionalRoot?: HTMLElement;
  isWriteActive: () => boolean;
  updateCsrf: (csrfToken: string) => void;
}

export function createCreatorSessionRecovery({ root, additionalRoot, isWriteActive, updateCsrf }: CreatorSessionRecoveryOptions) {
  function matching<T extends HTMLElement>(selector: string): T[] {
    const surfaces = additionalRoot && additionalRoot !== root ? [root, additionalRoot] : [root];
    const elements = surfaces.flatMap((surface) => {
      const element = surface.querySelector<T>(selector);
      return element ? [element] : [];
    });
    return [...new Set(elements)];
  }

  const shells = matching<HTMLElement>('[data-session-recovery-shell]');
  const statuses = matching<HTMLElement>('[data-session-recovery-status]');
  const signInLinks = matching<HTMLAnchorElement>('[data-session-recovery-sign-in]');
  const checkButtons = matching<HTMLButtonElement>('[data-session-recovery-check]');
  const binding = root.dataset.sessionBinding;
  let recoveryRequired: 'expired' | 'csrf' | undefined;
  let checking = false;

  function writeMessage() {
    return recoveryRequired === 'csrf'
      ? 'La sesión cambió. Comprueba la sesión antes de volver a intentarlo.'
      : 'La sesión terminó. Ingresa con la misma cuenta en otra pestaña y después pulsa «Comprobar sesión» para volver a guardar.';
  }

  function announce(message: string) {
    shells.forEach((shell) => { shell.hidden = false; });
    statuses.forEach((status) => {
      status.textContent = message;
      status.hidden = false;
    });
  }

  function showRecovery(reason: 'expired' | 'csrf') {
    recoveryRequired = reason;
    announce(writeMessage());
    signInLinks.forEach((signInLink) => { signInLink.hidden = false; });
    checkButtons.forEach((checkButton) => {
      checkButton.hidden = false;
      checkButton.disabled = false;
    });
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
    checkButtons.forEach((checkButton) => { checkButton.disabled = true; });
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
        announce('Sesión comprobada. Tus cambios siguen aquí; puedes volver a guardar la acción que quieras completar.');
        signInLinks.forEach((signInLink) => { signInLink.hidden = true; });
        checkButtons.forEach((checkButton) => { checkButton.hidden = true; });
        return;
      }

      const message = response.status === 401
        ? 'No hay una sesión activa. Ingresa con la misma cuenta en otra pestaña y vuelve a comprobarla.'
        : response.status === 403 && payload?.error === 'ACCOUNT_DISABLED'
          ? 'Esta cuenta está desactivada. Contacta al equipo antes de volver a intentarlo.'
          : response.status === 409 && payload?.error === 'SESSION_CONTEXT_CHANGED'
            ? 'La sesión activa pertenece a otra cuenta o tiene otros permisos. Ingresa con la cuenta y los permisos originales antes de volver a guardar.'
            : response.status === 422 && payload?.error === 'INVALID_CONTEXT'
              ? 'No pudimos comprobar el contexto de esta página. Abre una página nueva con la cuenta original.'
              : 'No pudimos comprobar la sesión. Inténtalo de nuevo.';
      announce(message);
    } catch {
      announce('No pudimos conectar para comprobar la sesión. Inténtalo de nuevo.');
    } finally {
      checking = false;
      if (recoveryRequired) checkButtons.forEach((checkButton) => { checkButton.disabled = false; });
    }
  }

  checkButtons.forEach((checkButton) => {
    checkButton.addEventListener('click', (event) => {
      event.preventDefault();
      void checkSession();
    });
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
