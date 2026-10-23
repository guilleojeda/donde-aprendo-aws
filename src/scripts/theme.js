(() => {
  const storageKey = 'dondeaprendoaws.theme';
  const systemQuery = '(prefers-color-scheme: dark)';
  const darkStyle = document.getElementById('site-theme-dark');

  if (!darkStyle) return;

  const systemPreference = typeof window.matchMedia === 'function'
    ? window.matchMedia(systemQuery)
    : null;
  const initialPreference = readPreference();
  let manualPreference = initialPreference.ok ? initialPreference.value : null;
  let storageWriteFailed = false;
  let themeToggle = null;
  let themeToggleBound = false;

  function readPreference() {
    try {
      const value = window.localStorage.getItem(storageKey);
      return {
        ok: true,
        value: value === 'light' || value === 'dark' ? value : null,
      };
    } catch {
      return { ok: false, value: null };
    }
  }

  function isDark() {
    if (manualPreference !== null) return manualPreference === 'dark';
    return Boolean(systemPreference?.matches);
  }

  function updateToggle() {
    if (!themeToggle) return;
    themeToggle.hidden = false;
    themeToggle.setAttribute('aria-label', 'Modo oscuro');
    themeToggle.setAttribute('aria-pressed', String(isDark()));
  }

  function applyPreference() {
    darkStyle.media = manualPreference === 'dark'
      ? 'all'
      : manualPreference === 'light'
        ? 'not all'
        : systemQuery;
    updateToggle();
  }

  function bindToggle() {
    if (themeToggleBound) return;

    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;

    themeToggle = button;
    themeToggle.hidden = false;
    themeToggle.setAttribute('aria-label', 'Modo oscuro');
    themeToggle.setAttribute('aria-pressed', String(isDark()));
    themeToggle.addEventListener('click', () => {
      manualPreference = isDark() ? 'light' : 'dark';
      applyPreference();

      try {
        window.localStorage.setItem(storageKey, manualPreference);
        storageWriteFailed = false;
      } catch {
        storageWriteFailed = true;
      }
    });
    themeToggleBound = true;
  }

  applyPreference();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindToggle, { once: true });
  } else {
    bindToggle();
  }

  systemPreference?.addEventListener('change', () => {
    if (manualPreference === null) updateToggle();
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || storageWriteFailed) return;

    const preference = readPreference();
    if (!preference.ok) return;

    manualPreference = preference.value;
    applyPreference();
  });
})();
