import { eventGroupsForAgenda } from '../lib/event-agenda-groups.mjs';
import { eventDateLabel, eventLocalDate, eventTimeLabel } from '../lib/events.mjs';
import {
  createEventAgendaPeriod,
  eventOverlapsAgendaPeriod,
  parseEventAgendaPeriod,
  serializeEventAgendaPeriod,
  shiftEventAgendaPeriod,
} from '../lib/event-agenda-period.mjs';
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
const viewButtons = [...document.querySelectorAll('[data-event-view]')];
const previousPeriod = document.querySelector('[data-event-period-prev]');
const nextPeriod = document.querySelector('[data-event-period-next]');
const periodLabel = document.querySelector('[data-event-period-label]');
const timeZoneControl = document.querySelector('[data-event-zone]');
const mobileDisclosure = window.matchMedia('(max-width: 640px)');
const controls = {
  mode: filterFields?.querySelector('[data-event-mode]'),
  country: filterFields?.querySelector('select[data-event-country]'),
  community: filterFields?.querySelector('[data-event-community]'),
  city: filterFields?.querySelector('[data-event-city]'),
};
const clear = document.querySelector('[data-event-clear]');
const more = document.querySelector('[data-event-more]');
const count = document.querySelector('[data-event-count]');
const factSummary = document.querySelector('[data-event-summary]');
const emptyFilters = { mode: '', country: '', city: '', community: '' };
const filterFieldsInOrder = Object.keys(emptyFilters);
const agendaRouteLinks = [...document.querySelectorAll('a[data-event-agenda-route]')];
const routeLinkBases = new Map(agendaRouteLinks.map((link) => [link, link.getAttribute('href') ?? link.href]));

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
  const allowedFilters = Object.fromEntries(['mode', 'country', 'city', 'community']
    .map((field) => [field, new Set([...(controls[field]?.options ?? [])].map((option) => option.value))]));
  if (routeCountry) allowedFilters.country.add(routeCountry);
  for (const mode of routeModes) allowedFilters.mode.add(mode);
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
  const hiddenFilters = {};
  const visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let period = parseEventAgendaPeriod(location.search, { timeZone: visitorZone, now: Date.now() });

  const currentFilters = () => Object.fromEntries(Object.entries(controls)
    .map(([field, control]) => [field, control ? control.value : hiddenFilters[field] ?? '']));
  const setFilters = (filters) => {
    for (const [field, control] of Object.entries(controls)) {
      if (control) control.value = filters[field] ?? '';
      else hiddenFilters[field] = filters[field] ?? '';
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
  const syncPeriodControls = () => {
    if (timeZoneControl) timeZoneControl.value = period.timeZone;
    for (const button of viewButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.eventView === period.view));
    }
    if (periodLabel) {
      if (period.view === 'month') {
        const month = new Intl.DateTimeFormat('es', {
          month: 'long', year: 'numeric', timeZone: period.timeZone,
        }).format(new Date(period.start));
        periodLabel.textContent = `${month} · ${period.timeZone}`;
      } else {
        const formatDate = new Intl.DateTimeFormat('es', {
          day: 'numeric', month: 'long', year: 'numeric', timeZone: period.timeZone,
        });
        periodLabel.textContent = `Semana del ${formatDate.format(new Date(period.start))} al ${formatDate.format(new Date(period.end - 1))} · ${period.timeZone}`;
      }
    }
  };
  const ensureTimeZoneOption = (timeZone) => {
    if (!timeZoneControl || [...timeZoneControl.options].some((option) => option.value === timeZone)) return;
    const option = document.createElement('option');
    option.value = timeZone;
    option.textContent = timeZone;
    timeZoneControl.append(option);
  };
  const serializeAgendaQuery = (search, filters, selectedPeriod = period) => {
    const withPeriod = serializeEventAgendaPeriod(search, selectedPeriod);
    return serializeEventAgendaSearch(withPeriod, filters);
  };
  const updateFactSummary = (events, now) => {
    if (!factSummary) return;
    factSummary.textContent = eventAgendaSummaryText(events, now, {
      intro: factSummary.dataset.eventSummaryIntro ?? 'En la agenda de eventos AWS hay',
      emptyMessage: allEvents.length > 0
        ? empty.dataset.eventNoMatches ?? 'No hay eventos que coincidan con estos filtros.'
        : factSummary.dataset.eventSummaryEmpty ?? 'No hay eventos publicados en esta agenda.',
      timeZone: period.timeZone,
    });
  };
  const readUrl = () => {
    period = parseEventAgendaPeriod(location.search, { timeZone: visitorZone, now: Date.now() });
    ensureTimeZoneOption(period.timeZone);
    setFilters(parseEventAgendaSearch(location.search, allowed));
    updateCityOptions();
    updateCommunityOptions();
    syncSecondaryDisclosure(true);
    syncPeriodControls();
  };
  const writeUrl = (method = 'pushState', keepHash = false) => {
    const query = serializeAgendaQuery(location.search, currentFilters());
    history[method](null, '', `${location.pathname}${query ? `?${query}` : ''}${keepHash ? location.hash : ''}`);
    updateRouteLinks();
  };
  const selectGroups = (sourceGroups, filters, includeEnded, now, selectedPeriod = period) => eventGroupsForAgenda(sourceGroups, {
    communityById: new Map(),
    country: routeCountry,
    modes: routeModes.length ? routeModes : undefined,
    filters,
    includeEnded,
    now,
    period: selectedPeriod,
  });

  function compatibleRouteFilters(filters, link) {
    const selected = { ...filters };
    const destinationCountry = link.dataset.eventAgendaCountry;
    const destinationModes = (link.dataset.eventAgendaModes ?? '').split('|').filter(Boolean);
    if (destinationCountry) {
      if (selected.country && selected.country !== destinationCountry) selected.country = '';
      const cityCountries = countriesForCity.get(selected.city);
      const cityMatchesCountry = cityCountries
        ? cityCountries.has(destinationCountry)
        : selected.city.startsWith(`${destinationCountry}:`);
      if (selected.city && !cityMatchesCountry) selected.city = '';
      const communityCountry = communityCountries.get(selected.community);
      if (selected.community && communityCountry && communityCountry !== destinationCountry) selected.community = '';
    }
    if (destinationModes.length && selected.mode && !destinationModes.includes(selected.mode)) selected.mode = '';
    return selected;
  }

  function updateRouteLinks() {
    const currentQuery = new URLSearchParams(location.search);
    const stateKeys = new Set(['view', 'date', 'tz', 'from', 'to', 'includeEnded', 'mode', 'country', 'city', 'community']);
    const currentFilters = parseEventAgendaSearch(location.search, allowed);
    for (const link of agendaRouteLinks) {
      const baseHref = routeLinkBases.get(link);
      if (!baseHref) continue;
      const origin = window.location.origin || `https://${window.location.hostname}`;
      const url = new URL(baseHref, origin);
      const query = new URLSearchParams(url.search);
      for (const [key, value] of currentQuery) {
        if (!stateKeys.has(key) && !query.has(key)) query.append(key, value);
      }
      const targetFilters = parseEventAgendaSearch(query, allowed);
      const mergedFilters = { ...targetFilters };
      for (const field of filterFieldsInOrder) {
        if (currentFilters[field]) mergedFilters[field] = currentFilters[field];
      }
      const compatible = compatibleRouteFilters(mergedFilters, link);
      const nextQuery = serializeAgendaQuery(query.toString(), compatible);
      url.search = nextQuery;
      link.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
    }
  }

  for (const group of groups) {
    for (const member of group.events) {
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
    const dateLabel = member.view.querySelector('[data-event-date-label]');
    const startTimeLabel = member.view.querySelector('[data-event-time-label]');
    const endTimeLabel = member.view.querySelector('[data-event-time-end-label]');
    if (status) status.textContent = finalized ? 'Finalizado' : start <= now ? 'En curso' : 'Próximo';
    if (registration) registration.textContent = finalized ? 'Ver evento' : 'Inscribirme';
    if (dateLabel) dateLabel.textContent = eventDateLabel(member.startsAt, period.timeZone);
    if (startTimeLabel) startTimeLabel.textContent = eventTimeLabel(member.startsAt, period.timeZone);
    if (endTimeLabel) endTimeLabel.textContent = eventTimeLabel(member.endsAt, period.timeZone);
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
    card.dataset.eventDate = eventLocalDate(member.startsAt, period.timeZone);
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
    const focusedElement = document.activeElement;
    const focusedCard = focusedElement && groups.find(({ card }) => card.contains(focusedElement))?.card;
    for (const member of allEvents) updateMemberState(member, now);

    const filters = currentFilters();
    const includeEnded = Boolean(includeEndedControl?.checked);
    const matchingGroups = selectGroups(groups, filters, includeEnded, now);
    const focusedGroupIndex = matchingGroups.findIndex((group) => group.card === focusedCard);
    if (focusedGroupIndex >= limit) limit = focusedGroupIndex + 1;
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
        ? `${empty.dataset.eventNoMatches ?? 'No hay eventos que coincidan con estos filtros.'} Período: ${periodLabel?.textContent ?? ''}.`
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

  function compatibleFilters(group, filters, now, selectedPeriod = period) {
    const selectedFields = filterFieldsInOrder.filter((field) => Boolean(filters[field]));
    for (let retained = selectedFields.length; retained >= 0; retained -= 1) {
      for (const fields of combinations(selectedFields, retained)) {
        const compatible = { ...emptyFilters };
        for (const field of fields) compatible[field] = filters[field];
        if (selectGroups([group], compatible, true, now, selectedPeriod).length > 0) return compatible;
      }
    }
    return { ...emptyFilters };
  }

  const fallbackToGlobalAgenda = (eventId) => {
    if (!knownEventIds.has(eventId) || location.pathname === '/eventos/') return false;
    const filters = currentFilters();
    const explicitQuery = new URLSearchParams(location.search);
    for (const field of filterFieldsInOrder) {
      if (explicitQuery.has(field)) filters[field] = explicitQuery.get(field) ?? '';
    }
    const preservedQuery = serializeAgendaQuery(location.search, filters);
    window.location.href = `/eventos/${preservedQuery ? `?${preservedQuery}` : ''}#event-${eventId}`;
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
    if (targetMember && ((routeCountry && targetMember.country !== routeCountry)
      || (routeModes.length && !routeModes.includes(targetMember.mode)))) {
      fallbackToGlobalAgenda(eventId);
      return;
    }
    if (targetMember && Date.parse(targetMember.endsAt) <= now && includeEndedControl && !includeEndedControl.checked) {
      includeEndedControl.checked = true;
    }
    const currentSelection = selectGroups([group], currentFilters(), Boolean(includeEndedControl?.checked), now, period);
    const targetPeriod = targetMember && currentSelection.length === 0 && !eventOverlapsAgendaPeriod(targetMember, period)
      ? createEventAgendaPeriod({
        view: period.view,
        date: eventLocalDate(targetMember.startsAt, period.timeZone),
        timeZone: period.timeZone,
        now,
      })
      : period;
    const periodChanged = targetPeriod.view !== period.view
      || targetPeriod.date !== period.date
      || targetPeriod.timeZone !== period.timeZone;
    if (periodChanged) {
      period = targetPeriod;
      ensureTimeZoneOption(period.timeZone);
      syncPeriodControls();
    }
    const before = currentFilters();
    const after = compatibleFilters(group, before, now, period);
    const filtersChanged = filterFieldsInOrder.some((field) => before[field] !== after[field]);
    if (filtersChanged) {
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
    if (periodChanged || filtersChanged || new URLSearchParams(location.search).has('includeEnded')) {
      writeUrl('replaceState', true);
    }
    requestAnimationFrame(() => {
      group.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      group.card.focus({ preventScroll: true });
    });
  };

  if (includeEndedControl) includeEndedControl.checked = true;
  readUrl();
  const normalizedQuery = serializeAgendaQuery(location.search, currentFilters());
  if (normalizedQuery !== new URLSearchParams(location.search).toString()) writeUrl('replaceState', true);
  updateRouteLinks();
  refresh();
  revealEventHash();

  for (const button of viewButtons) {
    button.addEventListener('click', () => {
      const view = button.dataset.eventView;
      if (view !== 'week' && view !== 'month') return;
      period = createEventAgendaPeriod({ view, date: period.date, timeZone: period.timeZone, now: Date.now() });
      limit = 12;
      syncPeriodControls();
      writeUrl();
      refresh();
    });
  }
  previousPeriod?.addEventListener('click', () => {
    period = shiftEventAgendaPeriod(period, -1);
    limit = 12;
    syncPeriodControls();
    writeUrl();
    refresh();
  });
  nextPeriod?.addEventListener('click', () => {
    period = shiftEventAgendaPeriod(period, 1);
    limit = 12;
    syncPeriodControls();
    writeUrl();
    refresh();
  });
  timeZoneControl?.addEventListener('change', () => {
    const timeZone = timeZoneControl.value;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      timeZoneControl.value = period.timeZone;
      return;
    }
    period = createEventAgendaPeriod({ view: period.view, date: period.date, timeZone, now: Date.now() });
    limit = 12;
    syncPeriodControls();
    writeUrl();
    refresh();
  });

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
  window.addEventListener('popstate', () => {
    limit = 12;
    readUrl();
    updateRouteLinks();
    refresh();
    revealEventHash();
  });
  mobileDisclosure.addEventListener('change', () => syncSecondaryDisclosure(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
