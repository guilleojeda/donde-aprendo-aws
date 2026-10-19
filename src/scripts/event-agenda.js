import { eventGroupsForAgenda } from '../lib/event-agenda-groups.mjs';
import { eventLocalDate } from '../lib/events.mjs';
import {
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
const includeEndedControl = document.querySelector('[data-event-include-ended]');
const mobileDisclosure = window.matchMedia('(max-width: 640px)');
const controls = {
  from: filterFields?.querySelector('[data-event-from]'),
  to: filterFields?.querySelector('[data-event-to]'),
  mode: filterFields?.querySelector('[data-event-mode]'),
  country: filterFields?.querySelector('select[data-event-country]'),
  community: filterFields?.querySelector('[data-event-community]'),
  city: filterFields?.querySelector('[data-event-city]'),
};
const clear = document.querySelector('[data-event-clear]');
const more = document.querySelector('[data-event-more]');
const count = document.querySelector('[data-event-count]');
const factSummary = document.querySelector('[data-event-summary]');
const emptyFilters = { from: '', to: '', mode: '', country: '', city: '', community: '' };
const filterFieldsInOrder = Object.keys(emptyFilters);

if (agenda && empty) {
  const cards = [...agenda.querySelectorAll('[data-event-ends-at]')];
  const groups = cards.map((card) => {
    const events = [...card.querySelectorAll('[data-event-member-id]')].map((view) => ({
      id: view.dataset.eventMemberId,
      startsAt: view.dataset.memberStartsAt,
      endsAt: view.dataset.memberEndsAt,
      timeZone: view.dataset.memberTimeZone,
      mode: view.dataset.memberMode,
      country: view.dataset.country || undefined,
      city: view.dataset.memberCity || '',
      communityId: view.dataset.memberCommunityId || undefined,
      view,
    }));
    return {
      card,
      event: events.find((event) => event.id === card.dataset.eventId) ?? events[0],
      events,
    };
  });
  const allEvents = groups.flatMap((group) => group.events);
  const routeCountry = agenda.dataset.eventContextCountry || undefined;
  const routeModes = (agenda.dataset.eventContextModes ?? '').split('|').filter(Boolean);
  const knownEventIds = new Set((agenda.dataset.eventKnownIds ?? '').split('|').filter(Boolean));
  const visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const visitorTime = new Intl.DateTimeFormat('es', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
  });
  const allowedFilters = Object.fromEntries(['mode', 'country', 'city', 'community']
    .map((field) => [field, new Set([...(controls[field]?.options ?? [])].map((option) => option.value))]));
  const communityCountries = new Map([...(controls.community?.options ?? [])]
    .filter((option) => option.value)
    .map((option) => [option.value, option.dataset.eventCountry ?? '']));
  const countriesForCity = new Map([...(controls.city?.options ?? [])]
    .filter((option) => option.value)
    .map((option) => [option.value, new Set(option.dataset.eventCountries?.split('|').filter(Boolean)
      ?? [option.value.split(':')[0]])]));
  const allowed = { ...allowedFilters, communityCountries, countriesForCity };
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
  const updateCommunityOptions = () => {
    const country = controls.country?.value ?? '';
    for (const option of [...(controls.community?.options ?? [])].slice(1)) {
      option.disabled = Boolean(country && option.dataset.eventCountry !== country);
      option.hidden = option.disabled;
    }
    if (controls.community?.selectedOptions[0]?.disabled) controls.community.value = '';
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
      emptyMessage: allEvents.length > 0
        ? empty.dataset.eventNoMatches ?? 'No hay eventos que coincidan con estos filtros.'
        : factSummary.dataset.eventSummaryEmpty ?? 'No hay eventos publicados en esta agenda.',
    });
  };
  const readUrl = () => {
    setFilters(parseEventAgendaSearch(location.search, allowed));
    updateCityOptions();
    updateCommunityOptions();
    syncSecondaryDisclosure(true);
  };
  const writeUrl = (method = 'pushState', keepHash = false) => {
    const query = serializeEventAgendaSearch(location.search, currentFilters());
    history[method](null, '', `${location.pathname}${query ? `?${query}` : ''}${keepHash ? location.hash : ''}`);
  };
  const selectGroups = (sourceGroups, filters, includeEnded, now) => eventGroupsForAgenda(sourceGroups, {
    communityById: new Map(),
    country: routeCountry,
    modes: routeModes.length ? routeModes : undefined,
    filters,
    includeEnded,
    now,
  });

  for (const group of groups) {
    for (const member of group.events) {
      const row = member.view.querySelector('[data-visitor-time]');
      const value = member.view.querySelector('[data-visitor-time-value]');
      if (row && value) {
        const start = new Date(member.startsAt);
        const end = new Date(member.endsAt);
        value.textContent = `${visitorTime.format(start)} – ${visitorTime.format(end)} (${visitorZone})`;
        row.hidden = false;
      }
      member.view.querySelector('[data-event-registration]')?.addEventListener('click', () => {
        if (Date.parse(member.endsAt) <= Date.now()) return;
        trackRegistrationClick(window, {
          id: member.id,
          mode: member.mode,
          country: member.country,
        });
      });
    }
  }

  function updateMemberState(member, now) {
    const end = Date.parse(member.endsAt);
    const start = Date.parse(member.startsAt);
    const finalized = end <= now;
    const status = member.view.querySelector('[data-event-status]');
    const registration = member.view.querySelector('[data-event-registration]');
    if (status) status.textContent = finalized ? 'Finalizado' : start <= now ? 'En curso' : 'Próximo';
    if (registration) registration.textContent = finalized ? 'Ver evento' : 'Inscribirme';
  }

  function applyRepresentative(group, member) {
    for (const item of group.events) item.view.hidden = item.id !== member.id;
    const { card } = group;
    const country = member.country ?? '';
    card.dataset.eventId = member.id;
    card.dataset.eventStartsAt = member.startsAt;
    card.dataset.eventEndsAt = member.endsAt;
    card.dataset.eventTimeZone = member.timeZone;
    card.dataset.eventMode = member.mode;
    card.dataset.country = country;
    card.dataset.eventDate = eventLocalDate(member.startsAt, member.timeZone);
    card.dataset.eventCity = member.city ? `${country}:${member.city}` : '';
    card.dataset.eventCountries = [...new Set(group.events.map((item) => item.country).filter(Boolean))].join('|');
    card.dataset.eventCommunities = [...new Set(group.events.map((item) => item.communityId).filter(Boolean))].join('|');
  }

  function currentCardOrder() {
    return [...agenda.querySelectorAll('[data-event-ends-at]')];
  }

  function syncCardOrder(matchingGroups) {
    const selectedCards = new Set(matchingGroups.map((group) => group.card));
    const orderedCards = matchingGroups.map((group) => group.card);
    const before = currentCardOrder().filter((card) => selectedCards.has(card));
    // Hidden cards do not affect reading order. Moving their visible siblings
    // merely to put them last can blur a link during an automatic expiry.
    if (before.every((card, index) => card === orderedCards[index])) return;
    const focused = document.activeElement;
    agenda.append(...orderedCards);
    if (focused && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }

  function refresh() {
    clearTimeout(expiryTimer);
    const now = Date.now();
    for (const member of allEvents) updateMemberState(member, now);

    const filters = currentFilters();
    const includeEnded = Boolean(includeEndedControl?.checked);
    const matchingGroups = selectGroups(groups, filters, includeEnded, now);
    const matchingByCard = new Map(matchingGroups.map((group) => [group.card, group]));
    for (const group of groups) {
      const selected = matchingByCard.get(group.card);
      group.card.hidden = !selected || matchingGroups.indexOf(selected) >= limit;
      if (selected) applyRepresentative(group, selected.event);
    }
    syncCardOrder(matchingGroups);

    const selectedEvents = matchingGroups.map((group) => group.event);
    updateFactSummary(selectedEvents, now);
    empty.hidden = matchingGroups.length > 0;
    if (empty.hidden === false) {
      empty.textContent = allEvents.length > 0
        ? empty.dataset.eventNoMatches ?? 'No hay eventos que coincidan con estos filtros.'
        : empty.dataset.eventNoEvents ?? 'No hay eventos publicados en esta agenda.';
    }
    if (more) more.hidden = matchingGroups.length <= limit;
    if (count) count.textContent = `${matchingGroups.length} ${matchingGroups.length === 1 ? 'evento' : 'eventos'}`;

    const nextTransition = nextEventAgendaTransition(allEvents, now);
    if (nextTransition !== null) {
      expiryTimer = setTimeout(refresh, Math.min(Math.max(nextTransition - now, 1), 2_147_483_647));
    }
    return matchingGroups;
  }

  function combinations(fields, size, start = 0, chosen = [], result = []) {
    if (chosen.length === size) {
      result.push([...chosen]);
      return result;
    }
    for (let index = start; index < fields.length; index += 1) {
      chosen.push(fields[index]);
      combinations(fields, size, index + 1, chosen, result);
      chosen.pop();
    }
    return result;
  }

  function compatibleFilters(group, filters, now) {
    const selectedFields = filterFieldsInOrder.filter((field) => Boolean(filters[field]));
    for (let retained = selectedFields.length; retained >= 0; retained -= 1) {
      for (const fields of combinations(selectedFields, retained)) {
        const compatible = { ...emptyFilters };
        for (const field of fields) compatible[field] = filters[field];
        if (selectGroups([group], compatible, true, now).length > 0) return compatible;
      }
    }
    return { ...emptyFilters };
  }

  const fallbackToGlobalAgenda = (eventId) => {
    if (!knownEventIds.has(eventId) || location.pathname === '/eventos/') return false;
    const filters = currentFilters();
    if (routeCountry && !filters.country) filters.country = routeCountry;
    if (routeModes.length === 1 && !filters.mode) filters.mode = routeModes[0];
    const query = serializeEventAgendaSearch(location.search, filters);
    window.location.href = `/eventos/${query ? `?${query}` : ''}#event-${eventId}`;
    return true;
  };

  const revealEventHash = () => {
    if (!location.hash.startsWith('#event-')) return;
    const eventId = location.hash.slice('#event-'.length);
    const group = groups.find((item) => item.card.id === `event-${eventId}`
      || (item.card.dataset.eventAliasIds ?? '').split('|').includes(eventId));
    if (!group) {
      fallbackToGlobalAgenda(eventId);
      return;
    }

    const now = Date.now();
    const targetMember = group.events.find((member) => member.id === eventId);
    if (targetMember && Date.parse(targetMember.endsAt) <= now && includeEndedControl && !includeEndedControl.checked) {
      includeEndedControl.checked = true;
    }
    const before = currentFilters();
    const after = compatibleFilters(group, before, now);
    const changed = filterFieldsInOrder.some((field) => before[field] !== after[field]);
    if (changed) {
      setFilters(after);
      updateCityOptions();
      updateCommunityOptions();
      syncSecondaryDisclosure(true);
    }

    const matchingGroups = refresh();
    const groupIndex = matchingGroups.findIndex((item) => item.card === group.card);
    if (groupIndex < 0) return;
    limit = Math.max(limit, groupIndex + 1);
    refresh();
    if (changed || new URLSearchParams(location.search).has('includeEnded')) writeUrl('replaceState', true);
    requestAnimationFrame(() => {
      group.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      group.card.focus({ preventScroll: true });
    });
  };

  if (includeEndedControl) includeEndedControl.checked = true;
  readUrl();
  if (new URLSearchParams(location.search).has('includeEnded')) writeUrl('replaceState', true);
  refresh();
  revealEventHash();

  for (const control of Object.values(controls)) {
    control?.addEventListener('change', () => {
      if (control === controls.country) {
        updateCityOptions();
        updateCommunityOptions();
      }
      limit = 12;
      syncSecondaryDisclosure();
      writeUrl();
      refresh();
    });
  }
  includeEndedControl?.addEventListener('change', () => {
    limit = 12;
    refresh();
  });
  clear?.addEventListener('click', () => {
    setFilters(emptyFilters);
    updateCityOptions();
    updateCommunityOptions();
    limit = 12;
    syncSecondaryDisclosure();
    writeUrl();
    refresh();
  });
  more?.addEventListener('click', () => {
    const previouslyVisible = new Set(cards.filter((card) => !card.hidden));
    limit += 12;
    const matchingGroups = refresh();
    matchingGroups.find((group) => !group.card.hidden && !previouslyVisible.has(group.card))?.card.focus();
  });
  window.addEventListener('hashchange', revealEventHash);
  window.addEventListener('popstate', () => { limit = 12; readUrl(); refresh(); revealEventHash(); });
  mobileDisclosure.addEventListener('change', () => syncSecondaryDisclosure(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
