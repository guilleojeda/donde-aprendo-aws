import { eventMatchesFilters, parseEventAgendaSearch, serializeEventAgendaSearch } from '../lib/event-agenda-filter.mjs';
import { trackRegistrationClick } from '../lib/event-analytics.mjs';

const agenda = document.querySelector('[data-event-list]');
const empty = document.querySelector('[data-event-empty]');
const controls = {
  from: document.querySelector('[data-event-from]'),
  to: document.querySelector('[data-event-to]'),
  mode: document.querySelector('[data-event-mode]'),
  country: document.querySelector('[data-event-country]'),
  community: document.querySelector('[data-event-community]'),
  city: document.querySelector('[data-event-city]'),
};
const clear = document.querySelector('[data-event-clear]');
const more = document.querySelector('[data-event-more]');
const count = document.querySelector('[data-event-count]');
const emptyFilters = { from: '', to: '', mode: '', country: '', city: '', community: '' };

if (agenda && empty) {
  const cards = [...agenda.querySelectorAll('[data-event-ends-at]')];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const visitorTime = new Intl.DateTimeFormat('es', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
  });
  const allowed = Object.fromEntries(['mode', 'country', 'city', 'community']
    .map((field) => [field, new Set([...(controls[field]?.options ?? [])].map((option) => option.value))]));
  let expiryTimer;
  let limit = 12;

  const currentFilters = () => Object.fromEntries(Object.entries(controls)
    .map(([field, control]) => [field, control?.value ?? '']));
  const setFilters = (filters) => {
    for (const [field, control] of Object.entries(controls)) {
      if (control) control.value = filters[field] ?? '';
    }
  };
  const updateCityOptions = () => {
    const country = controls.country?.value ?? '';
    for (const option of [...(controls.city?.options ?? [])].slice(1)) {
      option.disabled = Boolean(country && !option.value.startsWith(`${country}:`));
      option.hidden = option.disabled;
    }
    if (controls.city?.selectedOptions[0]?.disabled) controls.city.value = '';
  };
  const readUrl = () => {
    setFilters(parseEventAgendaSearch(location.search, allowed));
    updateCityOptions();
  };
  const writeUrl = (method = 'pushState', keepHash = false) => {
    const query = serializeEventAgendaSearch(location.search, currentFilters());
    history[method](null, '', `${location.pathname}${query ? `?${query}` : ''}${keepHash ? location.hash : ''}`);
  };

  for (const card of cards) {
    const row = card.querySelector('[data-visitor-time]');
    const value = card.querySelector('[data-visitor-time-value]');
    if (row && value) {
      const start = new Date(row.dataset.startsAt);
      const end = new Date(row.dataset.endsAt);
      value.textContent = `${visitorTime.format(start)} – ${visitorTime.format(end)} (${zone})`;
      row.hidden = false;
    }
    card.querySelector('[data-event-registration]')?.addEventListener('click', () => {
      trackRegistrationClick(window, { id: card.dataset.eventId, mode: card.dataset.eventMode, country: card.dataset.country });
    });
  }

  function refresh() {
    clearTimeout(expiryTimer);
    const now = Date.now();
    const filters = currentFilters();
    let nextEnd = Infinity;
    let matching = 0;
    let active = 0;
    for (const card of cards) {
      const event = {
        endsAt: card.dataset.eventEndsAt,
        localDate: card.dataset.eventDate,
        mode: card.dataset.eventMode,
        country: card.dataset.country,
        city: card.dataset.eventCity,
        communities: (card.dataset.eventCommunities ?? '').split('|').filter(Boolean),
      };
      const end = Date.parse(event.endsAt);
      if (end > now) {
        active += 1;
        nextEnd = Math.min(nextEnd, end);
      }
      if (eventMatchesFilters(event, filters, now)) {
        card.hidden = matching >= limit;
        matching += 1;
      } else card.hidden = true;
    }
    empty.hidden = matching > 0;
    empty.textContent = active === 0
      ? 'No hay próximos eventos publicados. Vuelve pronto para ver nuevas fechas.'
      : 'No hay eventos que coincidan con estos filtros. Probá con otras fechas o lugares.';
    if (more) more.hidden = matching <= limit;
    if (count) count.textContent = `${matching} ${matching === 1 ? 'evento' : 'eventos'}`;
    if (Number.isFinite(nextEnd)) expiryTimer = setTimeout(refresh, Math.min(Math.max(nextEnd - now, 1), 2_147_483_647));
  }

  const revealEventHash = () => {
    if (!location.hash.startsWith('#event-')) return;
    const card = cards.find((item) => `#${item.id}` === location.hash);
    if (!card || Date.parse(card.dataset.eventEndsAt) <= Date.now()) return;
    setFilters(emptyFilters);
    updateCityOptions();
    writeUrl('replaceState', true);
    limit = Math.max(limit, cards.indexOf(card) + 1);
    refresh();
    requestAnimationFrame(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.focus({ preventScroll: true });
    });
  };

  readUrl();
  refresh();
  revealEventHash();
  for (const control of Object.values(controls)) {
    control?.addEventListener('change', () => {
      if (control === controls.country) updateCityOptions();
      limit = 12;
      writeUrl();
      refresh();
    });
  }
  clear?.addEventListener('click', () => {
    setFilters(emptyFilters);
    updateCityOptions();
    limit = 12;
    writeUrl();
    refresh();
  });
  more?.addEventListener('click', () => { limit += 12; refresh(); });
  window.addEventListener('hashchange', revealEventHash);
  window.addEventListener('popstate', () => { limit = 12; readUrl(); refresh(); revealEventHash(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
