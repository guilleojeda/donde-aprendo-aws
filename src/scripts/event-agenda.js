import {
  eventMatchesFilters,
  parseEventAgendaSearch,
  secondaryEventAgendaFilterCount,
  serializeEventAgendaSearch,
  shouldOpenEventAgendaSecondaryFilters,
} from '../lib/event-agenda-filter.mjs';
import { trackRegistrationClick } from '../lib/event-analytics.mjs';
import { eventAgendaSummaryText, nextEventAgendaTransition } from '../lib/event-agenda-summary.mjs';

const agenda = document.querySelector('[data-event-list]');
const empty = document.querySelector('[data-event-empty]');
const filterFields = document.querySelector('.event-agenda__filters');
const secondaryDisclosure = document.querySelector('[data-event-secondary-disclosure]');
const secondaryDisclosureLabel = document.querySelector('[data-event-secondary-label]');
const mobileDisclosure = window.matchMedia('(max-width: 640px)');
const controls = {
  from: filterFields?.querySelector('[data-event-from]'),
  to: filterFields?.querySelector('[data-event-to]'),
  mode: filterFields?.querySelector('[data-event-mode]'),
  country: filterFields?.querySelector('[data-event-country]'),
  community: filterFields?.querySelector('[data-event-community]'),
  city: filterFields?.querySelector('[data-event-city]'),
};
const clear = document.querySelector('[data-event-clear]');
const more = document.querySelector('[data-event-more]');
const count = document.querySelector('[data-event-count]');
const factSummary = document.querySelector('[data-event-summary]');
const emptyFilters = { from: '', to: '', mode: '', country: '', city: '', community: '' };

if (agenda && empty) {
  const cards = [...agenda.querySelectorAll('[data-event-ends-at]')];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const visitorTime = new Intl.DateTimeFormat('es', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
  });
  const allowedFilters = Object.fromEntries(['mode', 'country', 'city', 'community']
    .map((field) => [field, new Set([...(controls[field]?.options ?? [])].map((option) => option.value))]));
  const countriesForCity = new Map([...(controls.city?.options ?? [])]
    .filter((option) => option.value)
    .map((option) => [option.value, new Set(option.dataset.eventCountries?.split('|').filter(Boolean)
      ?? [option.value.split(':')[0]])]));
  const allowed = { ...allowedFilters, countriesForCity };
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
      const countries = option.dataset.eventCountries?.split('|').filter(Boolean) ?? [option.value.split(':')[0]];
      option.disabled = Boolean(country && !countries.includes(country));
      option.hidden = option.disabled;
    }
    if (controls.city?.selectedOptions[0]?.disabled) controls.city.value = '';
  };
  const syncSecondaryDisclosure = (followViewport = false) => {
    const active = secondaryEventAgendaFilterCount(currentFilters());
    if (secondaryDisclosureLabel) {
      secondaryDisclosureLabel.textContent = active
        ? `Más filtros (${active} ${active === 1 ? 'activo' : 'activos'})`
        : 'Más filtros';
    }
    if (secondaryDisclosure) {
      if (active > 0) secondaryDisclosure.open = true;
      else if (followViewport) {
        secondaryDisclosure.open = shouldOpenEventAgendaSecondaryFilters(currentFilters(), mobileDisclosure.matches);
      }
    }
  };
  const updateFactSummary = (events, now) => {
    if (!factSummary) return;
    factSummary.textContent = eventAgendaSummaryText(events, now, {
      intro: factSummary.dataset.eventSummaryIntro ?? 'En la agenda de eventos AWS hay',
      emptyMessage: factSummary.dataset.eventSummaryEmpty ?? 'No hay próximos eventos publicados en esta agenda.',
    });
  };
  const readUrl = () => {
    setFilters(parseEventAgendaSearch(location.search, allowed));
    updateCityOptions();
    syncSecondaryDisclosure(true);
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
    const events = cards.map((card) => ({
      id: card.dataset.eventId,
      startsAt: card.dataset.eventStartsAt,
      endsAt: card.dataset.eventEndsAt,
      timeZone: card.dataset.eventTimeZone,
      localDate: card.dataset.eventDate,
      mode: card.dataset.eventMode,
      country: card.dataset.country,
      countries: (card.dataset.eventCountries ?? card.dataset.country ?? '').split('|').filter(Boolean),
      city: card.dataset.eventCity,
      communities: (card.dataset.eventCommunities ?? '').split('|').filter(Boolean),
    }));
    updateFactSummary(events, now);
    const filters = currentFilters();
    let matching = 0;
    let active = 0;
    for (const [index, card] of cards.entries()) {
      const event = events[index];
      const end = Date.parse(event.endsAt);
      if (end > now) active += 1;
      if (eventMatchesFilters(event, filters, now)) {
        card.hidden = matching >= limit;
        matching += 1;
      } else card.hidden = true;
    }
    empty.hidden = matching > 0;
    empty.textContent = active === 0
      ? (empty.dataset.eventNoUpcoming ?? 'No hay próximos eventos publicados. Vuelve pronto para ver nuevas fechas.')
      : 'No hay eventos que coincidan con estos filtros. Prueba con otras fechas o limpia los filtros.';
    if (more) more.hidden = matching <= limit;
    if (count) count.textContent = `${matching} ${matching === 1 ? 'evento' : 'eventos'}`;
    const nextTransition = nextEventAgendaTransition(events, now);
    if (nextTransition !== null) expiryTimer = setTimeout(refresh, Math.min(Math.max(nextTransition - now, 1), 2_147_483_647));
  }

  const revealEventHash = () => {
    if (!location.hash.startsWith('#event-')) return;
    const card = cards.find((item) => `#${item.id}` === location.hash);
    if (!card || Date.parse(card.dataset.eventEndsAt) <= Date.now()) return;
    setFilters(emptyFilters);
    updateCityOptions();
    syncSecondaryDisclosure(true);
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
      syncSecondaryDisclosure();
      writeUrl();
      refresh();
    });
  }
  clear?.addEventListener('click', () => {
    setFilters(emptyFilters);
    updateCityOptions();
    limit = 12;
    syncSecondaryDisclosure();
    writeUrl();
    refresh();
  });
  more?.addEventListener('click', () => {
    const previouslyVisible = new Set(cards.filter((card) => !card.hidden));
    limit += 12;
    refresh();
    cards.find((card) => !card.hidden && !previouslyVisible.has(card))?.focus();
  });
  window.addEventListener('hashchange', revealEventHash);
  window.addEventListener('popstate', () => { limit = 12; readUrl(); refresh(); revealEventHash(); });
  mobileDisclosure.addEventListener('change', () => syncSecondaryDisclosure(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
