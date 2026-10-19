import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import {
  eventMatchesFilters,
  parseEventAgendaSearch,
  secondaryEventAgendaFilterCount,
  serializeEventAgendaSearch,
  shouldOpenEventAgendaSecondaryFilters,
} from '../src/lib/event-agenda-filter.mjs';
import { trackRegistrationClick } from '../src/lib/event-analytics.mjs';
import { eventAgendaSummaryText, nextEventAgendaTransition } from '../src/lib/event-agenda-summary.mjs';
import { eventGroupsForAgenda } from '../src/lib/event-agenda-groups.mjs';
import { eventLocalDate } from '../src/lib/events.mjs';

const script = readFileSync(new URL('../src/scripts/event-agenda.js', import.meta.url), 'utf8')
  .replace(/^import \{[\s\S]*?\} from '[^']+';\s*/gmu, '');

class MockElement {
  constructor(document, { tagName = 'DIV', dataset = {}, value = '', hidden = false, checked = false, textContent = '' } = {}) {
    this.document = document;
    this.tagName = tagName;
    this.dataset = dataset;
    this.value = value;
    this.hidden = hidden;
    this.checked = checked;
    this.children = [];
    this.listeners = new Map();
    this.textContent = textContent;
    this.options = [];
    this.scrollIntoViewCalls = [];
  }

  get selectedOptions() {
    return this.options.filter((option) => option.value === this.value);
  }

  addEventListener(type, handler) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(handler);
    this.listeners.set(type, listeners);
  }

  emit(type, event = {}) {
    return (this.listeners.get(type) ?? []).map((handler) => handler(event));
  }

  focus() { this.document.activeElement = this; }

  click() {
    if (this.hidden) return;
    this.focus();
    this.emit('click');
  }

  scrollIntoView(options) { this.scrollIntoViewCalls.push(options); }

  contains(element) {
    return element === this || this.children.some((child) => child.contains(element));
  }
}

function createEventCards(count, {
  now, alternateModes = false, expiringFirst = false,
  eventCountriesByCard = [], eventCommunitiesByCard = [], events = [],
} = {}) {
  return Array.from({ length: count }, (_, index) => {
    const spec = events[index] ?? {};
    const mode = alternateModes && index % 2 ? 'online' : 'in-person';
    const startsAt = spec.startsAt ?? (expiringFirst && index === 0 ? now - 10_000 : now + 10_000 + index);
    const endsAt = spec.endsAt ?? (expiringFirst && index === 0 ? now + 500 : now + 100_000);
    const card = new MockElement(null, {
      tagName: 'LI',
      dataset: {
        eventId: spec.id ?? `event-${index}`,
        eventStartsAt: new Date(startsAt).toISOString(),
        eventEndsAt: new Date(endsAt).toISOString(),
        eventTimeZone: spec.timeZone ?? 'UTC',
        eventDate: spec.localDate ?? '2026-10-05',
        eventMode: spec.mode ?? mode,
        country: spec.country ?? 'AR',
        eventCountries: spec.countries ?? eventCountriesByCard[index] ?? spec.country ?? 'AR',
        eventCommunities: spec.communities ?? eventCommunitiesByCard[index] ?? '',
        eventCity: spec.city ?? '',
        eventAliasIds: spec.aliasIds ?? '',
      },
    });
    card.id = `event-${card.dataset.eventId}`;
    // The public markup now keeps one view per co-host inside the occurrence.
    // Expand the existing aggregate fixture metadata into those member views.
    const countries = card.dataset.eventCountries.split('|').filter(Boolean);
    const communities = card.dataset.eventCommunities.split('|').filter(Boolean);
    const aliases = card.dataset.eventAliasIds.split('|').filter(Boolean);
    card.members = Array.from({ length: Math.max(countries.length, communities.length, aliases.length + 1, 1) }, (_, memberIndex) => {
      const view = new MockElement(null, {
        tagName: 'ARTICLE',
        hidden: memberIndex > 0,
        dataset: {
          eventMemberId: memberIndex === 0 ? card.dataset.eventId : aliases[memberIndex - 1] ?? `${card.dataset.eventId}-cohost-${memberIndex}`,
          memberStartsAt: card.dataset.eventStartsAt,
          memberEndsAt: card.dataset.eventEndsAt,
          memberTimeZone: card.dataset.eventTimeZone,
          memberMode: card.dataset.eventMode,
          country: countries[memberIndex] ?? countries[0] ?? '',
          memberCity: card.dataset.eventCity.replace(/^[^:]*:/u, ''),
          memberCommunityId: communities[memberIndex] ?? communities[0] ?? '',
        },
      });
      view.status = new MockElement(null);
      view.registration = new MockElement(null, { textContent: 'Inscribirme' });
      view.registration.href = spec.registrationUrl ?? `https://example.test/events/${index}`;
      view.querySelector = (selector) => ({
        '[data-event-status]': view.status,
        '[data-event-registration]': view.registration,
        '[data-visitor-time]': null,
        '[data-visitor-time-value]': null,
      }[selector] ?? null);
      view.children = [view.status, view.registration];
      return view;
    });
    card.children = card.members;
    card.status = card.members[0].status;
    card.registration = card.members[0].registration;
    card.querySelectorAll = (selector) => selector === '[data-event-member-id]' ? card.members : [];
    return card;
  });
}

function createAgenda({
  count, now = Date.parse('2026-10-05T12:00:00Z'), alternateModes = false,
  expiringFirst = false, filter = '', withCommunityFilters = false,
  nationalAgenda = false, communityOptions = [
    { value: 'community-ar', dataset: { eventCountry: 'AR' } },
    { value: 'community-co', dataset: { eventCountry: 'CO' } },
  ], eventCountriesByCard = [], eventCommunitiesByCard = [], events = [], includeEnded = true,
  hostname = 'dondeaprendoaws.com',
}) {
  let clock = now;
  let nextTimer = 0;
  const timers = new Map();
  const storageCalls = [];
  const telemetryCalls = [];
  const document = { activeElement: null, hidden: false, listeners: new Map() };
  document.body = new MockElement(document, { tagName: 'BODY' });
  document.activeElement = document.body;
  const cards = createEventCards(count, {
    now, alternateModes, expiringFirst, eventCountriesByCard, eventCommunitiesByCard, events,
  });
  for (const card of cards) {
    card.document = document;
    for (const member of card.members) {
      member.document = document;
      member.status.document = document;
      member.registration.document = document;
    }
  }

  const agenda = new MockElement(document, { tagName: 'OL' });
  agenda.children = [...cards];
  agenda.querySelectorAll = (selector) => selector === '[data-event-ends-at]' ? agenda.children : [];
  agenda.append = (...children) => {
    for (const child of children) {
      if (child.contains(document.activeElement)) document.activeElement = document.body;
      agenda.children = agenda.children.filter((item) => item !== child);
      agenda.children.push(child);
    }
  };
  const empty = new MockElement(document, {
    hidden: true,
    dataset: { eventNoMatches: 'No hay eventos que coincidan con estos filtros.' },
  });
  const more = new MockElement(document, { tagName: 'BUTTON', hidden: true });
  const countLabel = new MockElement(document);
  const summary = new MockElement(document, {
    dataset: { eventSummaryIntro: 'Hay', eventSummaryEmpty: 'No hay eventos publicados en esta agenda.' },
  });
  const modeFilter = new MockElement(document, { tagName: 'SELECT' });
  modeFilter.options = ['', 'online', 'in-person'].map((value) => ({ value, dataset: {} }));
  const countryFilter = withCommunityFilters && !nationalAgenda ? new MockElement(document, { tagName: 'SELECT' }) : null;
  const communityFilter = withCommunityFilters ? new MockElement(document, { tagName: 'SELECT' }) : null;
  if (countryFilter) countryFilter.options = ['', 'AR', 'CO'].map((value) => ({ value, dataset: {} }));
  if (communityFilter) communityFilter.options = [{ value: '', dataset: {} }, ...communityOptions];
  const filterFields = new MockElement(document);
  filterFields.querySelector = (selector) => ({
    '[data-event-mode]': modeFilter,
    // Preserve the old selector's DOM behavior so the national regression test
    // would fail if the script starts treating the first community option as a country control.
    '[data-event-country]': countryFilter ?? communityFilter?.options[1] ?? null,
    'select[data-event-country]': countryFilter,
    '[data-event-community]': communityFilter,
  }[selector] ?? null);
  const clear = withCommunityFilters ? new MockElement(document, { tagName: 'BUTTON' }) : null;
  const includeEndedFilter = new MockElement(document, {
    tagName: 'INPUT', checked: true,
  });
  const elements = new Map([
    ['[data-event-list]', agenda], ['[data-event-empty]', empty], ['.event-agenda__filters', filterFields],
    ['[data-event-secondary-disclosure]', null], ['[data-event-secondary-label]', null],
    ['[data-event-clear]', clear], ['[data-event-more]', more], ['[data-event-count]', countLabel],
    ['[data-event-summary]', summary],
    ['[data-event-include-ended]', includeEndedFilter],
  ]);
  document.querySelector = (selector) => elements.get(selector) ?? null;
  document.addEventListener = (type, handler) => document.listeners.set(type, handler);

  const windowListeners = new Map();
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (type, handler) => windowListeners.set(type, handler),
    location: { hostname },
    gtag: (...args) => telemetryCalls.push(args),
  };
  const storage = {
    getItem(key) { storageCalls.push(['getItem', key]); return null; },
    setItem(key, value) { storageCalls.push(['setItem', key, value]); },
    removeItem(key) { storageCalls.push(['removeItem', key]); },
  };
  window.localStorage = storage;
  window.sessionStorage = storage;
  const location = { pathname: '/eventos/', search: filter, hash: '' };
  const historyEntries = [];
  const historyUrls = [filter];
  let historyIndex = 0;
  const applyUrl = (url) => {
    const hashStart = url.indexOf('#');
    const queryStart = url.indexOf('?');
    location.search = queryStart === -1
      ? ''
      : url.slice(queryStart, hashStart === -1 ? undefined : hashStart);
    location.hash = hashStart === -1 ? '' : url.slice(hashStart);
  };
  const history = {
    pushState(_state, _title, url) {
      historyEntries.push({ method: 'pushState', url });
      historyUrls.splice(historyIndex + 1);
      historyUrls.push(url);
      historyIndex += 1;
      applyUrl(url);
    },
    replaceState(_state, _title, url) {
      historyEntries.push({ method: 'replaceState', url });
      historyUrls[historyIndex] = url;
      applyUrl(url);
    },
    back() {
      if (historyIndex === 0) return;
      historyIndex -= 1;
      applyUrl(historyUrls[historyIndex]);
      windowListeners.get('popstate')?.();
    },
  };
  class ClockDate extends Date {
    static now() { return clock; }
  }

  runInNewContext(script, {
    document, window, location, history, URLSearchParams,
    eventMatchesFilters, parseEventAgendaSearch, secondaryEventAgendaFilterCount,
    serializeEventAgendaSearch, shouldOpenEventAgendaSecondaryFilters, trackRegistrationClick,
    eventAgendaSummaryText, nextEventAgendaTransition, eventGroupsForAgenda, eventLocalDate,
    Date: ClockDate,
    localStorage: storage,
    sessionStorage: storage,
    clearTimeout(timerId) { timers.delete(timerId); },
    setTimeout(callback, delay) {
      const timerId = ++nextTimer;
      timers.set(timerId, { callback, delay });
      return timerId;
    },
    requestAnimationFrame: (callback) => callback(),
  });
  if (!includeEnded) {
    includeEndedFilter.checked = false;
    includeEndedFilter.emit('change');
  }

  return {
    cards, countLabel, document, empty, modeFilter, more, countryFilter, communityFilter, clear,
    includeEnded: includeEndedFilter, summary, historyEntries, history, location, storageCalls, telemetryCalls,
    advanceTime(ms) { clock += ms; },
    refreshVisibility() { document.listeners.get('visibilitychange')?.(); },
    fireNextTimer() {
      const [timerId, timer] = [...timers.entries()].sort((left, right) => left[1].delay - right[1].delay)[0] ?? [];
      if (!timer) return false;
      timers.delete(timerId);
      timer.callback();
      return true;
    },
    changeHash(hash) {
      location.hash = hash;
      windowListeners.get('hashchange')?.();
    },
  };
}

test('Show More focuses the first newly visible event on each page, including 72→74', () => {
  const agenda = createAgenda({ count: 74 });
  assert.equal(agenda.cards.filter((card) => !card.hidden).length, 12);
  assert.equal(agenda.document.activeElement, agenda.document.body, 'initial rendering does not move focus');

  for (let page = 1; page <= 5; page += 1) {
    agenda.more.click();
    assert.equal(agenda.cards.filter((card) => !card.hidden).length, (page + 1) * 12);
    assert.equal(agenda.document.activeElement, agenda.cards[page * 12]);
    assert.equal(agenda.more.hidden, false);
  }

  agenda.more.click();
  assert.equal(agenda.cards.filter((card) => !card.hidden).length, 74);
  assert.equal(agenda.document.activeElement, agenda.cards[72], 'the final partial batch keeps focus on its first event');
  assert.equal(agenda.more.hidden, true);
});

test('pagination uses the active filter and expiry refreshes never take focus', () => {
  const agenda = createAgenda({
    count: 28, alternateModes: true, expiringFirst: true, filter: '?mode=in-person', includeEnded: false,
  });
  assert.equal(agenda.countLabel.textContent, '14 eventos');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId),
    Array.from({ length: 12 }, (_, index) => `event-${index * 2}`));
  assert.equal(agenda.cards[0].status.textContent, 'En curso', 'a running event remains visible before its end');

  agenda.more.focus();
  agenda.advanceTime(501);
  agenda.refreshVisibility();
  assert.equal(agenda.document.activeElement, agenda.more, 'automatic expiration refresh leaves focus where the visitor put it');
  assert.equal(agenda.cards[0].status.textContent, 'Finalizado');
  assert.equal(agenda.cards[0].hidden, true, 'with the checkbox off, an event leaves the list when it ends');
  assert.equal(agenda.countLabel.textContent, '13 eventos');
  assert.equal(agenda.cards[24].hidden, false, 'the next active filtered event fills the expired slot');

  agenda.more.click();
  assert.equal(agenda.document.activeElement, agenda.cards[26], 'Show More focuses the next event in the filtered active set');
  assert.equal(agenda.cards[25].hidden, true, 'an event outside the selected mode stays hidden');
  assert.equal(agenda.more.hidden, true);
});

test('expiry leaves focus inside an unaffected event card', () => {
  const agenda = createAgenda({ count: 2, expiringFirst: true, includeEnded: false });
  agenda.cards[1].registration.focus();
  agenda.advanceTime(501);
  assert.equal(agenda.fireNextTimer(), true);
  assert.equal(agenda.cards[0].hidden, true);
  assert.equal(agenda.cards[1].hidden, false);
  assert.equal(agenda.document.activeElement, agenda.cards[1].registration,
    'hiding an earlier event must not detach and blur the still-visible focused card');
});

test('the checkbox defaults on, stays session-local across filters/history, and the summary counts the selection', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const events = [
    { id: 'past-online', startsAt: now - 7_200_000, endsAt: now - 3_600_000, mode: 'online' },
    { id: 'running-online', startsAt: now - 3_600_000, endsAt: now + 3_600_000, mode: 'online' },
    { id: 'future-in-person', startsAt: now + 3_600_000, endsAt: now + 7_200_000, mode: 'in-person' },
  ];
  const agenda = createAgenda({ count: events.length, now, events, filter: '?includeEnded=0' });

  assert.equal(agenda.includeEnded.checked, true, 'a fresh agenda opens with finalizados included');
  assert.deepEqual(agenda.cards.map((card) => card.hidden), [false, false, false]);
  assert.deepEqual(agenda.cards.map((card) => card.status.textContent), ['Finalizado', 'En curso', 'Próximo']);
  assert.match(agenda.cards[0].registration.textContent, /Ver evento/u);
  assert.doesNotMatch(agenda.cards[0].registration.textContent, /Inscribirme/u);
  assert.equal(agenda.cards[0].registration.href, 'https://example.test/events/0', 'the original event URL remains available');
  assert.equal(agenda.countLabel.textContent, '3 eventos');
  assert.match(agenda.summary.textContent, /3 eventos/u);

  const historyLength = agenda.historyEntries.length;
  agenda.includeEnded.checked = false;
  agenda.includeEnded.emit('change');
  assert.equal(agenda.historyEntries.length, historyLength, 'changing only the checkbox does not add history');
  assert.deepEqual(agenda.cards.map((card) => card.hidden), [true, false, false]);
  assert.equal(agenda.countLabel.textContent, '2 eventos');
  assert.match(agenda.summary.textContent, /2 eventos/u, 'the summary follows the filtered selection before pagination');

  agenda.modeFilter.value = 'online';
  agenda.modeFilter.emit('change');
  assert.equal(agenda.includeEnded.checked, false, 'filter changes preserve the current checkbox');
  assert.equal(agenda.cards[0].hidden, true);
  assert.equal(agenda.cards[1].hidden, false);
  assert.equal(agenda.cards[2].hidden, true);
  assert.equal(agenda.countLabel.textContent, '1 evento');
  assert.match(agenda.summary.textContent, /1 evento/u);
  const writtenQuery = new URLSearchParams(agenda.location.search);
  assert.equal(writtenQuery.get('mode'), 'online');
  assert.equal(writtenQuery.has('includeEnded'), false, 'the checkbox value is never serialized');
  assert.equal(agenda.storageCalls.length, 0, 'the checkbox is not stored in browser storage');

  agenda.history.back();
  assert.equal(agenda.includeEnded.checked, false, 'back restores filters but leaves the in-session checkbox alone');
  assert.equal(agenda.modeFilter.value, '', 'back restores the previous filter state');
  assert.equal(agenda.countLabel.textContent, '2 eventos');

  const reloaded = createAgenda({ count: events.length, now, events, filter: agenda.location.search });
  assert.equal(reloaded.includeEnded.checked, true, 'a new page context starts with finalizados included again');
  assert.equal(reloaded.countLabel.textContent, '3 eventos');
});

test('an event that ends stays visible when included and refreshes its status and link at expiry', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const agenda = createAgenda({
    count: 28,
    now,
    alternateModes: true,
    filter: '?mode=in-person',
    events: [{ startsAt: now + 200, endsAt: now + 500 }],
  });
  assert.equal(agenda.includeEnded.checked, true);
  assert.equal(agenda.cards[0].hidden, false);
  assert.equal(agenda.cards[0].status.textContent, 'Próximo');
  assert.match(agenda.cards[0].registration.textContent, /Inscribirme/u);
  const beforeCount = agenda.countLabel.textContent;
  agenda.more.focus();

  agenda.advanceTime(200);
  assert.equal(agenda.fireNextTimer(), true, 'the scheduled expiry refresh runs at the temporal boundary');
  assert.equal(agenda.cards[0].status.textContent, 'En curso', 'the start transition is reflected in the visible state');
  assert.equal(agenda.document.activeElement, agenda.more, 'the start refresh does not move focus');

  agenda.advanceTime(301);
  assert.equal(agenda.fireNextTimer(), true);
  assert.equal(agenda.cards[0].hidden, false, 'the finalizado card remains in the list while included');
  assert.equal(agenda.cards[0].status.textContent, 'Finalizado');
  assert.match(agenda.cards[0].registration.textContent, /Ver evento/u);
  assert.equal(agenda.countLabel.textContent, beforeCount, 'expiry does not remove an included event from the count');
  assert.equal(agenda.document.activeElement, agenda.more, 'the end refresh does not move focus');

  agenda.includeEnded.checked = false;
  agenda.includeEnded.emit('change');
  assert.equal(agenda.cards[0].hidden, true);
  assert.equal(agenda.countLabel.textContent, '13 eventos');
  agenda.includeEnded.checked = true;
  agenda.includeEnded.emit('change');
  agenda.advanceTime(1_000);
  agenda.refreshVisibility();
  assert.equal(agenda.cards[0].hidden, false, 'visibilitychange refresh respects the checkbox state');
  assert.equal(agenda.cards[0].status.textContent, 'Finalizado');
  assert.equal(agenda.countLabel.textContent, beforeCount);
});

test('Ver evento for a finalized card does not record a registration click', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const urls = [
    'https://example.test/events/running?ref=registration',
    'https://example.test/events/upcoming?ref=registration',
  ];
  const agenda = createAgenda({
    count: 2,
    now,
    includeEnded: true,
    events: [
      {
        id: 'running', startsAt: now - 60_000, endsAt: now + 500,
        mode: 'in-person', country: 'AR', registrationUrl: urls[0],
      },
      {
        id: 'upcoming', startsAt: now + 10_000, endsAt: now + 20_000,
        mode: 'online', country: 'CO', registrationUrl: urls[1],
      },
    ],
  });

  assert.deepEqual(agenda.cards.map((card) => card.hidden), [false, false]);
  assert.deepEqual(agenda.cards.map((card) => card.status.textContent), ['En curso', 'Próximo']);
  agenda.cards[0].registration.click();
  agenda.cards[1].registration.click();
  assert.deepEqual(agenda.telemetryCalls, [
    ['event', 'event_registration_click', { event_id: 'running', event_mode: 'in-person', event_country: 'AR' }],
    ['event', 'event_registration_click', { event_id: 'upcoming', event_mode: 'online', event_country: 'CO' }],
  ]);

  agenda.advanceTime(501);
  assert.equal(agenda.fireNextTimer(), true);
  assert.equal(agenda.cards[0].hidden, false, 'the expired event remains visible with the checkbox on');
  assert.equal(agenda.cards[0].status.textContent, 'Finalizado');
  assert.match(agenda.cards[0].registration.textContent, /Ver evento/u);
  assert.doesNotMatch(agenda.cards[0].registration.textContent, /Inscribirme/u);
  assert.equal(agenda.cards[0].registration.href, urls[0]);

  agenda.cards[0].registration.click();
  assert.equal(agenda.telemetryCalls.length, 2, 'opening an ended event is not counted as a registration');
  assert.equal(agenda.cards[0].registration.href, urls[0], 'Ver evento retains the original public event URL');
});

test('a past-only agenda has a non-empty summary while included, and no result when excluded', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const events = [
    { id: 'past-one', startsAt: now - 7_200_000, endsAt: now - 3_600_000 },
    { id: 'past-two', startsAt: now - 3_600_000, endsAt: now - 1_800_000 },
  ];
  const agenda = createAgenda({ count: events.length, now, events });

  assert.equal(agenda.countLabel.textContent, '2 eventos');
  assert.match(agenda.summary.textContent, /2 eventos/u);
  assert.equal(agenda.empty.hidden, true);

  agenda.includeEnded.checked = false;
  agenda.includeEnded.emit('change');
  assert.equal(agenda.countLabel.textContent, '0 eventos');
  assert.match(agenda.summary.textContent, /No hay/u);
  assert.match(agenda.summary.textContent, /coincidan con estos filtros/u,
    'excluding published past events must not claim that the catalog is empty');
  assert.equal(agenda.empty.hidden, false);
  assert.equal(agenda.cards.every((card) => card.hidden), true);
});

test('filtering and Show More retain an unchecked finalized filter', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const events = Array.from({ length: 30 }, (_, index) => ({
    id: `event-${index}`,
    startsAt: now + (index < 15 ? -7_200_000 : 3_600_000),
    endsAt: now + (index < 15 ? -3_600_000 : 7_200_000),
  }));
  const agenda = createAgenda({ count: events.length, now, events });

  assert.equal(agenda.countLabel.textContent, '30 eventos', 'the default selection includes all 15 past and 15 future cards');
  assert.equal(agenda.cards.filter((card) => !card.hidden).length, 12);
  agenda.includeEnded.checked = false;
  agenda.includeEnded.emit('change');
  assert.equal(agenda.countLabel.textContent, '15 eventos');
  assert.equal(agenda.more.hidden, false);
  agenda.more.click();
  assert.equal(agenda.includeEnded.checked, false);
  assert.equal(agenda.cards.filter((card) => !card.hidden).length, 15);
  assert.equal(agenda.more.hidden, true);
});

test('a past co-host fragment reopens its group and clears only its incompatible mode filter', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const agenda = createAgenda({
    count: 2,
    now,
    withCommunityFilters: true,
    includeEnded: false,
    filter: '?country=CO&mode=in-person&community=community-co',
    events: [
      {
        id: 'event-primary', aliasIds: 'meetup-event-cohost',
        startsAt: now - 7_200_000, endsAt: now - 3_600_000, mode: 'online',
        countries: 'AR|CO', communities: 'community-ar|community-co', city: 'AR:Córdoba',
      },
      { id: 'other', startsAt: now + 3_600_000, endsAt: now + 7_200_000, mode: 'in-person' },
    ],
  });

  assert.equal(agenda.cards[0].hidden, true, 'the incompatible route filters hide the past group initially');
  agenda.changeHash('#event-meetup-event-cohost');

  assert.equal(agenda.includeEnded.checked, true, 'opening a past fragment activates finalizados for this session');
  assert.equal(agenda.cards[0].hidden, false, 'the public co-host ID reveals the representative card');
  assert.equal(agenda.document.activeElement, agenda.cards[0]);
  assert.equal(agenda.cards[0].scrollIntoViewCalls.length, 1);
  assert.equal(agenda.modeFilter.value, '', 'the incompatible modality filter is removed');
  assert.equal(agenda.countryFilter.value, 'CO', 'the co-host country filter remains selected');
  assert.equal(agenda.communityFilter.value, 'community-co', 'the co-host community filter remains selected');
  const writtenQuery = new URLSearchParams(agenda.location.search);
  assert.equal(writtenQuery.has('mode'), false);
  assert.equal(writtenQuery.get('country'), 'CO');
  assert.equal(writtenQuery.get('community'), 'community-co');
  assert.equal(writtenQuery.has('includeEnded'), false);
  assert.equal(agenda.location.hash, '#event-meetup-event-cohost');
  assert.equal(agenda.historyEntries.at(-1).method, 'replaceState', 'revealing a fragment does not create a history entry');
});

test('a fragment reveals an occurrence beyond the first page', () => {
  const agenda = createAgenda({ count: 30 });
  assert.equal(agenda.cards[25].hidden, true);
  agenda.changeHash('#event-event-25');
  assert.equal(agenda.cards[25].hidden, false);
  assert.equal(agenda.document.activeElement, agenda.cards[25]);
  assert.equal(agenda.cards[25].scrollIntoViewCalls.length, 1);
  assert.equal(agenda.countLabel.textContent, '30 eventos', 'revealing a later card does not truncate the selection');
  assert.equal(agenda.location.hash, '#event-event-25');
});

test('community options follow country filters, normalize history, and keep co-host data', () => {
  const agenda = createAgenda({
    count: 3,
    withCommunityFilters: true,
    filter: '?country=AR&community=community-co',
    eventCountriesByCard: ['AR|CO', 'CO', 'AR'],
    eventCommunitiesByCard: ['community-ar|community-co', 'community-co', 'community-ar'],
  });

  assert.equal(agenda.countryFilter.value, 'AR');
  assert.equal(agenda.communityFilter.value, '', 'an incompatible URL community is cleared before filtering');
  assert.equal(agenda.communityFilter.options[2].disabled, true);
  assert.equal(agenda.cards[0].hidden, false, 'the co-hosted card still matches Argentina');
  assert.equal(agenda.cards[1].hidden, true);
  assert.equal(agenda.cards[2].hidden, false);

  agenda.communityFilter.value = 'community-ar';
  agenda.communityFilter.emit('change');
  assert.equal(agenda.historyEntries.at(-1).url, '/eventos/?country=AR&community=community-ar');

  agenda.countryFilter.value = 'CO';
  agenda.countryFilter.emit('change');
  assert.equal(agenda.communityFilter.value, '', 'changing country clears the incompatible community');
  assert.equal(agenda.communityFilter.options[1].disabled, true);
  assert.equal(agenda.communityFilter.options[2].disabled, false);
  assert.equal(agenda.historyEntries.at(-1).url, '/eventos/?country=CO');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.id.slice('event-'.length)), ['event-0', 'event-1']);
  assert.equal(agenda.cards[0].dataset.eventId, 'event-0-cohost-1', 'the visible member switches to the matching co-host');
  assert.equal(agenda.cards[0].members[1].hidden, false);
  assert.equal(agenda.cards[0].members[0].hidden, true);

  agenda.history.back();
  assert.equal(agenda.countryFilter.value, 'AR', 'back restores the prior country');
  assert.equal(agenda.communityFilter.value, 'community-ar', 'back restores the compatible community');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.id.slice('event-'.length)), ['event-0', 'event-2']);
  assert.equal(agenda.cards[0].dataset.eventCommunities, 'community-ar|community-co', 'co-host metadata stays intact');

  agenda.clear.click();
  assert.equal(agenda.countryFilter.value, '');
  assert.equal(agenda.communityFilter.value, '');
  assert.equal(agenda.historyEntries.at(-1).url, '/eventos/');
  assert.equal(agenda.communityFilter.options[1].disabled, false);
  assert.equal(agenda.communityFilter.options[2].disabled, false);
});

test('national agendas preserve and filter their first community option without a country control', () => {
  const agenda = createAgenda({
    count: 3,
    withCommunityFilters: true,
    nationalAgenda: true,
    communityOptions: [
      { value: 'community-girls', dataset: { eventCountry: 'AR' } },
      { value: 'community-co', dataset: { eventCountry: 'CO' } },
    ],
    eventCountriesByCard: ['AR', 'AR|CO', 'AR'],
    eventCommunitiesByCard: ['community-girls', 'community-co', 'community-girls'],
  });

  assert.equal(agenda.countryFilter, null, 'National agendas have no country control.');
  assert.equal(agenda.communityFilter.options[1].value, 'community-girls');
  agenda.communityFilter.value = 'community-girls';
  agenda.communityFilter.emit('change');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId), ['event-0', 'event-2']);
  assert.equal(agenda.historyEntries.at(-1).url, '/eventos/?community=community-girls');

  agenda.clear.click();
  assert.equal(agenda.communityFilter.options[1].value, 'community-girls', 'Clear does not mutate the first community option.');
  assert.equal(agenda.communityFilter.value, '');
  assert.equal(agenda.historyEntries.at(-1).url, '/eventos/');
  agenda.history.back();
  assert.equal(agenda.communityFilter.value, 'community-girls', 'Back restores the first community selection.');
  assert.equal(agenda.communityFilter.options[1].value, 'community-girls');
});
