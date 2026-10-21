import { eventGroupsForAgenda } from '../lib/event-agenda-groups.mjs';
import { effectiveEventLocation, eventCountryLabel, normalizeEventCityKey } from '../lib/event-location.mjs';
import { eventDateLabel, eventEndTimeLabel, eventLocalDate, eventTimeLabel } from '../lib/events.mjs';
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
import { buildEventAgendaShare } from '../lib/event-agenda-share.mjs';

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
const pageHeading = document.querySelector('[data-event-page-heading]');
const pageIntro = document.querySelector('[data-event-page-intro]');
const shareControls = document.querySelector('[data-event-share-controls]');
const shareMenu = document.querySelector('[data-event-share-menu]');
const shareToggle = document.querySelector('[data-event-share-toggle]');
const xShareLink = document.querySelector('[data-event-share-x]');
const linkedinShareLink = document.querySelector('[data-event-share-linkedin]');
const copyButton = document.querySelector('[data-event-share-copy]');
const shareStatus = document.querySelector('[data-event-share-status]');
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
      venueCountry: view.dataset.memberVenueCountry || undefined,
      city: view.dataset.memberCity || undefined,
      communityId: view.dataset.memberCommunityId || undefined,
      title: view.dataset.memberTitle,
      registrationUrl: view.dataset.memberRegistrationUrl,
      view,
    }));
    return {
      card,
      event: events.find((event) => event.id === card.dataset.eventId) ?? events[0],
      events,
    };
  });
  const allEvents = groups.flatMap((group) => group.events);
  const routeDefaults = {
    country: agenda.dataset.eventDefaultCountry ?? '',
    mode: agenda.dataset.eventDefaultMode ?? '',
  };
  const knownEventIds = new Set((agenda.dataset.eventKnownIds ?? '').split('|').filter(Boolean));
  const communityById = new Map([...(controls.community?.options ?? [])]
    .filter((option) => option.value)
    .map((option) => [option.value, {
      id: option.value,
      title: option.textContent ?? '',
      country: option.dataset.eventCountry ?? '',
      city: option.dataset.eventCity ?? '',
    }]));
  const allowed = {
    mode: new Set(['', 'online', 'in-person', 'hybrid']),
    country: new Set([...(controls.country?.options ?? [])].map((option) => option.value)),
    city: new Set([...(controls.city?.options ?? [])].map((option) => option.value)),
    community: new Set([...(controls.community?.options ?? [])].map((option) => option.value)),
  };
  let expiryTimer;
  let latestShare;
  let lastShareSignature;
  let shareRevision = 0;
  let copyPending = false;
  let limit = 12;
  const visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let period = parseEventAgendaPeriod(location.search, { timeZone: visitorZone, now: Date.now() });
  const originalPageTitle = document.title;
  const originalHeading = pageHeading?.textContent ?? '';
  const originalIntro = pageIntro?.textContent ?? '';

  const ensureModeOption = (mode) => {
    if (!controls.mode || !mode || [...controls.mode.options].some((option) => option.value === mode)) return;
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode === 'hybrid' ? 'Híbrido (enlace anterior)' : mode;
    controls.mode.append(option);
  };
  const ensureCountryOption = (country) => {
    if (!controls.country || !country || [...controls.country.options].some((option) => option.value === country)) return;
    const option = document.createElement('option');
    option.value = country;
    option.textContent = typeof eventCountryLabel === 'function' ? eventCountryLabel(country) : country;
    controls.country.append(option);
    allowed.country.add(country);
  };
  const ensureCityOption = (city) => {
    if (!controls.city || !city || [...controls.city.options].some((option) => option.value === city)) return;
    const country = city.slice(0, 2);
    const option = document.createElement('option');
    option.value = city;
    option.dataset.eventCountries = country;
    option.textContent = `${city.slice(3)} · ${country}`;
    controls.city.append(option);
    allowed.city.add(city);
  };
  function updatePageCopy(filters) {
    const differsFromRouteDefault = filters.country !== routeDefaults.country || filters.mode !== routeDefaults.mode;
    if (pageHeading) pageHeading.textContent = differsFromRouteDefault ? 'Eventos AWS publicados' : originalHeading;
    if (pageIntro) {
      pageIntro.textContent = differsFromRouteDefault
        ? 'Consulta los eventos publicados y elige modalidad y ubicación de asistencia.'
        : originalIntro;
    }
    document.title = differsFromRouteDefault ? 'Eventos AWS | ¿Dónde Aprendo AWS?' : originalPageTitle;
  }

  const currentFilters = () => Object.fromEntries(Object.entries(controls)
    .map(([field, control]) => [field, control?.value ?? '']));
  const setFilters = (filters) => {
    ensureModeOption(filters.mode);
    ensureCountryOption(filters.country);
    ensureCityOption(filters.city);
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
    for (const option of [...(controls.community?.options ?? [])].slice(1)) {
      option.disabled = false;
      option.hidden = false;
    }
  };
  const updateLocationControls = () => {
    const inactive = controls.mode?.value === 'online';
    if (controls.country) controls.country.disabled = inactive;
    if (controls.city) controls.city.disabled = inactive;
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
    return serializeEventAgendaSearch(withPeriod, filters, routeDefaults);
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
    const filters = parseEventAgendaSearch(location.search, allowed, routeDefaults);
    setFilters(filters);
    updateCityOptions();
    updateCommunityOptions();
    updateLocationControls();
    updatePageCopy(filters);
    syncSecondaryDisclosure(true);
    syncPeriodControls();
  };
  const writeUrl = (method = 'pushState', keepHash = false) => {
    const query = serializeAgendaQuery(location.search, currentFilters());
    history[method](null, '', `${location.pathname}${query ? `?${query}` : ''}${keepHash ? location.hash : ''}`);
    updateRouteLinks();
  };
  const selectGroups = (sourceGroups, filters, includeEnded, now, selectedPeriod = period) => eventGroupsForAgenda(sourceGroups, {
    communityById,
    filters,
    includeEnded,
    now,
    period: selectedPeriod,
  });

  function updateShareControls(selection, filters, now) {
    if (!shareControls || !xShareLink || !linkedinShareLink) return;
    const nextShare = buildEventAgendaShare({
      selection,
      period,
      filters,
      communityById,
      url: window.location.href,
      now,
    });
    xShareLink.setAttribute('href', nextShare.xHref);
    linkedinShareLink.setAttribute('href', nextShare.linkedInHref);

    const signature = JSON.stringify([
      nextShare.url,
      Boolean(includeEndedControl?.checked),
      nextShare.text,
    ]);
    if (lastShareSignature !== undefined && lastShareSignature !== signature) {
      shareRevision += 1;
      if (shareStatus) shareStatus.textContent = '';
    }
    lastShareSignature = signature;
    latestShare = nextShare;
    shareControls.hidden = false;
  }

  function routeDefaultsFor(link) {
    const linkHref = routeLinkBases.get(link) ?? link.href ?? '';
    const path = new URL(linkHref, window.location.origin || `https://${window.location.hostname}`).pathname;
    const destinationCountry = link.dataset.eventAgendaCountry ?? '';
    const declaredModes = (link.dataset.eventAgendaModes ?? '').split('|').filter(Boolean);
    const declaredMode = link.dataset.eventAgendaMode
      ?? (declaredModes.length === 1 && declaredModes[0] === 'online' ? 'online'
        : declaredModes.includes('in-person') ? 'in-person' : '');
    return {
      country: destinationCountry,
      mode: declaredMode || (path === '/eventos/online/' ? 'online'
        : path === '/eventos/presenciales/' ? 'in-person' : ''),
    };
  }

  function compatibleRouteFilters(filters, link, destinationDefaults) {
    const selected = { ...filters };
    const destinationCountry = link.dataset.eventAgendaCountry;
    if (destinationCountry) {
      selected.country = destinationCountry;
      if (selected.city && !selected.city.startsWith(`${destinationCountry}:`)) selected.city = '';
    }
    if (link.dataset.eventAgendaModes || link.dataset.eventAgendaMode) {
      // Collection links replace only the modality facet.
      selected.mode = destinationDefaults.mode;
    }
    return selected;
  }

  function updateRouteLinks() {
    const currentQuery = new URLSearchParams(location.search);
    const stateKeys = new Set(['view', 'date', 'tz', 'from', 'to', 'includeEnded', 'mode', 'country', 'city', 'community']);
    const currentFilters = parseEventAgendaSearch(location.search, allowed, routeDefaults);
    for (const link of agendaRouteLinks) {
      const baseHref = routeLinkBases.get(link);
      if (!baseHref) continue;
      const origin = window.location.origin || `https://${window.location.hostname}`;
      const url = new URL(baseHref, origin);
      const query = new URLSearchParams(url.search);
      for (const [key, value] of currentQuery) {
        if (!stateKeys.has(key) && !query.has(key)) query.append(key, value);
      }
      const targetDefaults = routeDefaultsFor(link);
      const compatible = compatibleRouteFilters(currentFilters, link, targetDefaults);
      const nextQuery = serializeEventAgendaSearch(
        serializeEventAgendaPeriod(query.toString(), period), compatible, targetDefaults,
      );
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
    const participation = member.view.querySelector('[data-event-participation]');
    if (status) status.textContent = finalized ? 'Finalizado' : start <= now ? 'En curso' : 'Próximo';
    if (registration) registration.textContent = finalized ? 'Ver evento' : 'Inscribirme';
    if (dateLabel) dateLabel.textContent = eventDateLabel(member.startsAt, period.timeZone);
    if (startTimeLabel) startTimeLabel.textContent = eventTimeLabel(member.startsAt, period.timeZone);
    if (endTimeLabel) endTimeLabel.textContent = eventEndTimeLabel(member.startsAt, member.endsAt, period.timeZone);
    if (participation && member.mode === 'hybrid') {
      const filters = currentFilters();
      const physical = effectiveEventLocation(member, communityById);
      const hasLocation = Boolean(filters.country || filters.city);
      const locationMatches = (!filters.country || physical.country === filters.country)
        && (!filters.city || normalizeEventCityKey(`${physical.country}:${physical.city}`) === normalizeEventCityKey(filters.city));
      participation.textContent = filters.mode === 'online'
        || ((filters.mode === '' || filters.mode === 'hybrid') && hasLocation && !locationMatches)
        ? 'Participación remota'
        : filters.mode === 'in-person' ? 'Participación presencial'
          : 'Participación presencial y remota';
    }
  }

  function applyRepresentative(group, member) {
    const focused = document.activeElement;
    const previousView = group.events.find((item) => item.view.contains(focused))?.view;
    // Member views render the same actions in the same order. Keep that action
    // focused when expiry replaces its view, before the browser drops focus.
    const focusedAction = previousView && previousView !== member.view
      ? [...previousView.querySelectorAll('a')].indexOf(focused) : -1;
    for (const item of group.events) item.view.hidden = item.id !== member.id;
    const { card } = group;
    const physical = effectiveEventLocation(member, communityById);
    const country = physical.country ?? '';
    card.dataset.eventId = member.id;
    card.dataset.eventStartsAt = member.startsAt;
    card.dataset.eventEndsAt = member.endsAt;
    card.dataset.eventTimeZone = member.timeZone;
    card.dataset.eventMode = member.mode;
    card.dataset.country = country;
    card.dataset.eventDate = eventLocalDate(member.startsAt, period.timeZone);
    card.dataset.eventCity = physical.city ? `${country}:${physical.city}` : '';
    card.dataset.eventCountries = [...new Set(group.events.map((item) => effectiveEventLocation(item, communityById).country).filter(Boolean))].join('|');
    card.dataset.eventCommunities = [...new Set(group.events.map((item) => item.communityId).filter(Boolean))].join('|');
    if (focusedAction >= 0) {
      const replacement = [...member.view.querySelectorAll('a')][focusedAction] ?? card;
      replacement.focus({ preventScroll: true });
    }
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
    const focusedItemWillBeHidden = (focusedCard && !matchingByCard.has(focusedCard))
      || (focusedElement === more && matchingGroups.length <= limit);
    for (const group of groups) {
      const selected = matchingByCard.get(group.card);
      group.card.hidden = !selected || matchingGroups.indexOf(selected) >= limit;
      if (selected) applyRepresentative(group, selected.event);
    }
    syncCardOrder(matchingGroups);

    const selectedEvents = matchingGroups.map((group) => group.event);
    updatePageCopy(filters);
    updateFactSummary(selectedEvents, now);
    updateShareControls(matchingGroups, filters, now);
    empty.hidden = matchingGroups.length > 0;
    if (empty.hidden === false) {
      empty.textContent = allEvents.length > 0
        ? `${empty.dataset.eventNoMatches ?? 'No hay eventos que coincidan con estos filtros.'} Período: ${periodLabel?.textContent ?? ''}.`
        : empty.dataset.eventNoEvents ?? 'No hay eventos publicados en esta agenda.';
    }
    if (more) more.hidden = matchingGroups.length <= limit;
    if (count) count.textContent = `${matchingGroups.length} ${matchingGroups.length === 1 ? 'evento' : 'eventos'}`;
    if (focusedItemWillBeHidden) includeEndedControl?.focus({ preventScroll: true });

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

  function conflictsWithImplicitRouteDefault(member, now) {
    const query = new URLSearchParams(location.search);
    const implicitFilters = { ...emptyFilters };
    if (!query.has('country')) implicitFilters.country = routeDefaults.country;
    if (!query.has('mode')) implicitFilters.mode = routeDefaults.mode;
    return eventGroupsForAgenda([{ event: member, events: [member] }], {
      communityById,
      filters: implicitFilters,
      includeEnded: true,
      now,
    }).length === 0;
  }

  const fallbackToGlobalAgenda = (eventId, targetGroup) => {
    if (!knownEventIds.has(eventId) || location.pathname === '/eventos/') return false;
    const filters = currentFilters();
    const explicitQuery = new URLSearchParams(location.search);
    for (const field of filterFieldsInOrder) {
      if (explicitQuery.has(field)) filters[field] = explicitQuery.get(field) ?? '';
    }
    const globalFilters = targetGroup ? compatibleFilters(targetGroup, filters, Date.now(), null) : filters;
    const preservedQuery = serializeEventAgendaSearch(
      serializeEventAgendaPeriod(location.search, period), globalFilters, { country: '', mode: '' },
    );
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
    if (targetMember && conflictsWithImplicitRouteDefault(targetMember, now)) {
      fallbackToGlobalAgenda(eventId, group);
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
      updateLocationControls();
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

  const closeShareMenu = (returnFocus = false) => {
    if (!shareMenu) return;
    shareMenu.open = false;
    if (returnFocus) shareToggle?.focus({ preventScroll: true });
  };
  const copyFailureMessage = 'No se pudo copiar al portapapeles. Inténtalo de nuevo.';
  copyButton?.addEventListener('click', () => {
    if (copyPending) return;
    refresh();
    const capturedShare = latestShare;
    if (!capturedShare || typeof capturedShare.text !== 'string') {
      if (shareStatus) shareStatus.textContent = copyFailureMessage;
      return;
    }

    if (shareStatus) shareStatus.textContent = '';
    const clipboard = window.navigator?.clipboard;
    if (typeof clipboard?.writeText !== 'function') {
      if (shareStatus) shareStatus.textContent = 'No se pudo copiar: el portapapeles no está disponible en este navegador.';
      return;
    }

    const capturedRevision = shareRevision;
    copyPending = true;
    copyButton.disabled = true;
    const recoverCopyFailure = () => {
      if (shareStatus) shareStatus.textContent = copyFailureMessage;
      copyPending = false;
      copyButton.disabled = false;
    };
    let write;
    try {
      write = clipboard.writeText(capturedShare.text);
    } catch {
      recoverCopyFailure();
      return;
    }
    if (!write || typeof write.then !== 'function') {
      recoverCopyFailure();
      return;
    }
    if (shareStatus) shareStatus.textContent = 'Copiando la agenda al portapapeles…';
    shareToggle?.focus({ preventScroll: true });
    write.then(
      () => {
        const changedWhileCopying = shareRevision !== capturedRevision;
        if (shareStatus) {
          shareStatus.textContent = changedWhileCopying
            ? 'Se copió la selección anterior; la agenda cambió mientras se copiaba.'
            : 'Agenda copiada al portapapeles.';
        }
        closeShareMenu(Boolean(shareMenu?.contains(document.activeElement)));
        copyPending = false;
        copyButton.disabled = false;
      },
      () => {
        recoverCopyFailure();
      },
    );
  });

  shareMenu?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !shareMenu.open) return;
    event.preventDefault();
    closeShareMenu(true);
  });
  shareMenu?.addEventListener('toggle', () => {
    if (shareMenu.open) refresh();
  });
  for (const link of [xShareLink, linkedinShareLink]) {
    link?.addEventListener('click', () => closeShareMenu(true));
  }
  document.addEventListener('click', (event) => {
    if (shareMenu?.open && !shareControls?.contains(event.target)) closeShareMenu();
  });

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
      }
      if (control === controls.mode) updateLocationControls();
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
    updateLocationControls();
    updatePageCopy(emptyFilters);
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
