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
import { eventDateLabel, eventLocalDate, eventTimeLabel } from '../src/lib/events.mjs';

const periodModuleUrl = new URL('../src/lib/event-agenda-period.mjs', import.meta.url);
let eventAgendaPeriodApi = {};
try {
  eventAgendaPeriodApi = await import(periodModuleUrl.href);
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== periodModuleUrl.href) throw error;
}
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
    this.attributes = new Map();
  }

  get selectedOptions() {
    return this.options.filter((option) => option.value === this.value);
  }

  addEventListener(type, handler) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(handler);
    this.listeners.set(type, listeners);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'href') this.href = String(value);
  }
  getAttribute(name) { return name === 'href' ? this.href ?? null : this.attributes.get(name) ?? null; }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'href') delete this.href;
  }

  append(...children) {
    this.children.push(...children);
    if (this.tagName === 'SELECT') this.options.push(...children);
  }

  appendChild(child) {
    this.append(child);
    return child;
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
    const memberSpecs = spec.members ?? [];
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
    card.members = Array.from({ length: Math.max(countries.length, communities.length, aliases.length + 1, memberSpecs.length, 1) }, (_, memberIndex) => {
      const memberSpec = memberSpecs[memberIndex] ?? {};
      const view = new MockElement(null, {
        tagName: 'ARTICLE',
        hidden: memberIndex > 0,
        dataset: {
          eventMemberId: memberIndex === 0 ? card.dataset.eventId : aliases[memberIndex - 1] ?? `${card.dataset.eventId}-cohost-${memberIndex}`,
          memberStartsAt: new Date(memberSpec.startsAt ?? startsAt).toISOString(),
          memberEndsAt: new Date(memberSpec.endsAt ?? endsAt).toISOString(),
          memberTimeZone: memberSpec.timeZone ?? card.dataset.eventTimeZone,
          memberMode: memberSpec.mode ?? card.dataset.eventMode,
          country: memberSpec.country ?? countries[memberIndex] ?? countries[0] ?? '',
          memberCity: memberSpec.city ?? card.dataset.eventCity.replace(/^[^:]*:/u, ''),
          memberCommunityId: memberSpec.communityId ?? communities[memberIndex] ?? communities[0] ?? '',
        },
      });
      view.status = new MockElement(null);
      view.registration = new MockElement(null, { textContent: 'Inscribirme' });
      view.registration.href = spec.registrationUrl ?? `https://example.test/events/${index}`;
      view.dateLabel = new MockElement(null);
      view.timeLabel = new MockElement(null);
      view.querySelector = (selector) => ({
        '[data-event-status]': view.status,
        '[data-event-registration]': view.registration,
        '[data-event-date-label]': view.dateLabel,
        '[data-event-time-label]': view.timeLabel,
        '[data-visitor-time]': null,
        '[data-visitor-time-value]': null,
      }[selector] ?? null);
      view.children = [view.status, view.registration, view.dateLabel, view.timeLabel];
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
  hostname = 'dondeaprendoaws.com', visitorTimeZone = 'UTC', pathname = '/eventos/', hash = '',
  routeCountry = '', routeModes = [], additionalKnownEventIds = [],
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

  const knownEventIds = [...new Set([
    ...cards.flatMap((card) => card.members.map((member) => member.dataset.eventMemberId)),
    ...additionalKnownEventIds,
  ])];
  const agenda = new MockElement(document, {
    tagName: 'OL',
    dataset: {
      eventKnownIds: knownEventIds.join('|'),
      eventContextCountry: routeCountry,
      eventContextModes: routeModes.join('|'),
    },
  });
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
  const viewButtons = ['week', 'month'].map((view) => {
    const button = new MockElement(document, {
      tagName: 'BUTTON',
      dataset: { eventView: view },
      textContent: view === 'week' ? 'Semana' : 'Mes',
    });
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    Object.defineProperty(button, 'ariaPressed', {
      get: () => button.getAttribute('aria-pressed'),
      set: (value) => button.setAttribute('aria-pressed', value),
    });
    return button;
  });
  const previousPeriod = new MockElement(document, { tagName: 'BUTTON', textContent: 'Anterior' });
  previousPeriod.type = 'button';
  previousPeriod.ariaLabel = 'Anterior';
  previousPeriod.setAttribute('aria-label', 'Anterior');
  const nextPeriod = new MockElement(document, { tagName: 'BUTTON', textContent: 'Siguiente' });
  nextPeriod.type = 'button';
  nextPeriod.ariaLabel = 'Siguiente';
  nextPeriod.setAttribute('aria-label', 'Siguiente');
  const periodLabel = new MockElement(document);
  const zoneFilter = new MockElement(document, { tagName: 'SELECT' });
  zoneFilter.options = ['UTC', 'America/Bogota', 'America/New_York', 'Asia/Tokyo']
    .map((value) => ({ value, dataset: {} }));
  const routeLinks = ['/eventos/', '/eventos/argentina/', '/eventos/online/', '/eventos/presenciales/']
    .map((href) => {
      const link = new MockElement(document, { tagName: 'A', dataset: { eventAgendaRoute: 'true' } });
      link.href = href;
      return link;
    });
  const unrelatedRouteLink = new MockElement(document, { tagName: 'A' });
  unrelatedRouteLink.href = '/aprender/';
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
    '[data-event-zone]': zoneFilter,
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
    ['[data-event-view=\"week\"]', viewButtons[0]],
    ['[data-event-view=\"month\"]', viewButtons[1]],
    ['[data-event-period-prev]', previousPeriod],
    ['[data-event-period-next]', nextPeriod],
    ['[data-event-period-label]', periodLabel],
    ['[data-event-zone]', zoneFilter],
  ]);
  document.querySelector = (selector) => elements.get(selector) ?? null;
  document.querySelectorAll = (selector) => {
    if (selector === '[data-event-view]') return viewButtons;
    if (selector === 'a[data-event-agenda-route]' || selector === '[data-event-agenda-route]') return routeLinks;
    return [];
  };
  document.createElement = (tagName) => new MockElement(document, { tagName: String(tagName).toUpperCase() });
  document.addEventListener = (type, handler) => document.listeners.set(type, handler);

  const windowListeners = new Map();
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (type, handler) => windowListeners.set(type, handler),
    location: { hostname, href: '' },
    gtag: (...args) => telemetryCalls.push(args),
  };
  const storage = {
    getItem(key) { storageCalls.push(['getItem', key]); return null; },
    setItem(key, value) { storageCalls.push(['setItem', key, value]); },
    removeItem(key) { storageCalls.push(['removeItem', key]); },
  };
  window.localStorage = storage;
  window.sessionStorage = storage;
  const location = { pathname, search: filter, hash };
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
    forward() {
      if (historyIndex >= historyUrls.length - 1) return;
      historyIndex += 1;
      applyUrl(historyUrls[historyIndex]);
      windowListeners.get('popstate')?.();
    },
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const controlledIntl = Object.create(Intl);
  controlledIntl.supportedValuesOf = (key) => key === 'timeZone'
    ? ['UTC', 'America/Bogota', 'America/New_York', 'Asia/Tokyo']
    : Intl.supportedValuesOf?.(key) ?? [];
  controlledIntl.DateTimeFormat = function DateTimeFormat(locale, options) {
    if (arguments.length === 0) return { resolvedOptions: () => ({ timeZone: visitorTimeZone }) };
    return new Intl.DateTimeFormat(locale, options);
  };

  runInNewContext(script, {
    document, window, location, history, URLSearchParams, URL,
    eventMatchesFilters, parseEventAgendaSearch, secondaryEventAgendaFilterCount,
    serializeEventAgendaSearch, shouldOpenEventAgendaSecondaryFilters, trackRegistrationClick,
    eventAgendaSummaryText, nextEventAgendaTransition, eventGroupsForAgenda,
    eventDateLabel, eventLocalDate, eventTimeLabel,
    ...eventAgendaPeriodApi, Intl: controlledIntl,
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
    get children() { return agenda.children; },
    viewButtons, previousPeriod, nextPeriod, periodLabel, zoneFilter, routeLinks, unrelatedRouteLink, window,
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

test('a new agenda chooses this week in the selected zone and falls back from invalid zones', () => {
  const now = Date.parse('2026-01-01T01:00:00Z');
  const browserZone = 'America/Argentina/Cordoba';
  const visitorZone = createAgenda({ count: 0, now, visitorTimeZone: browserZone });
  const visitorQuery = new URLSearchParams(visitorZone.location.search);
  assert.equal(visitorQuery.get('view'), 'week');
  assert.equal(visitorQuery.get('date'), '2025-12-31',
    'the current date is derived from the visitor zone, even across the UTC year boundary');
  assert.equal(visitorQuery.get('tz'), browserZone);
  assert.equal(visitorZone.zoneFilter.value, browserZone);
  assert.ok(visitorZone.zoneFilter.options.some((option) => option.value === browserZone),
    'a valid browser IANA zone is offered even when it is not in the supportedValuesOf list');

  const explicitUtc = createAgenda({
    count: 0, now, visitorTimeZone: browserZone, filter: '?tz=UTC',
  });
  const utcQuery = new URLSearchParams(explicitUtc.location.search);
  assert.equal(utcQuery.get('date'), '2026-01-01',
    'an explicit valid URL zone takes precedence over the browser zone when choosing today');
  assert.equal(utcQuery.get('tz'), 'UTC');

  const invalidVisitor = createAgenda({ count: 0, now, visitorTimeZone: 'Invalid/Zone' });
  const fallbackQuery = new URLSearchParams(invalidVisitor.location.search);
  assert.equal(fallbackQuery.get('tz'), 'UTC', 'an invalid browser zone falls back to UTC');
  assert.equal(fallbackQuery.get('date'), '2026-01-01');
});

test('legacy date ranges open their first date as a week and normalize the URL', () => {
  const agenda = createAgenda({
    count: 0,
    filter: '?utm_source=legacy&from=2026-10-02&to=2026-10-16&view=month&date=bad&tz=America%2FBogota&includeEnded=0&mode=online',
  });
  const query = new URLSearchParams(agenda.location.search);

  assert.equal(query.get('view'), 'week', 'an old from/to link becomes a week even if it also carried a view');
  assert.equal(query.get('date'), '2026-10-02');
  assert.equal(query.get('tz'), 'America/Bogota');
  assert.equal(query.has('from'), false);
  assert.equal(query.has('to'), false);
  assert.equal(query.has('includeEnded'), false);
  assert.equal(query.get('utm_source'), 'legacy');
  assert.equal(query.get('mode'), 'online');
  assert.equal(agenda.includeEnded.checked, true, 'an old checkbox parameter does not survive a new page load');
});

test('view changes, month navigation, clear, and history preserve the period reference and local checkbox', () => {
  const agenda = createAgenda({
    count: 0,
    withCommunityFilters: true,
    filter: '?utm_source=period-test&view=week&date=2026-10-01&tz=UTC&mode=online&country=AR&community=community-ar&includeEnded=0',
  });
  const initialHistoryLength = agenda.historyEntries.length;
  assert.equal(agenda.includeEnded.checked, true);
  assert.equal(agenda.viewButtons[0].getAttribute('aria-pressed'), 'true');
  assert.equal(agenda.viewButtons[1].getAttribute('aria-pressed'), 'false');

  agenda.includeEnded.checked = false;
  agenda.includeEnded.emit('change');
  assert.equal(agenda.historyEntries.length, initialHistoryLength, 'checkbox changes do not create history entries');
  agenda.viewButtons[1].click();
  assert.equal(agenda.viewButtons[0].getAttribute('aria-pressed'), 'false');
  assert.equal(agenda.viewButtons[1].getAttribute('aria-pressed'), 'true');
  let query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('view'), 'month');
  assert.equal(query.get('date'), '2026-10-01', 'switching view preserves the reference date inside both periods');
  assert.equal(query.get('tz'), 'UTC');
  assert.equal(query.get('mode'), 'online');
  assert.equal(query.get('country'), 'AR');
  assert.equal(query.get('community'), 'community-ar');
  assert.equal(query.get('utm_source'), 'period-test');
  assert.equal(query.has('includeEnded'), false);
  assert.equal(agenda.includeEnded.checked, false);
  assert.ok(agenda.periodLabel.textContent.length > 0);

  agenda.nextPeriod.click();
  query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('view'), 'month');
  assert.equal(query.get('date'), '2026-11-01');
  assert.equal(query.get('tz'), 'UTC');
  assert.equal(agenda.includeEnded.checked, false);

  agenda.history.back();
  query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('date'), '2026-10-01');
  assert.equal(query.get('view'), 'month');
  assert.equal(agenda.includeEnded.checked, false, 'back restores the period but not the local checkbox');
  agenda.history.forward();
  query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('date'), '2026-11-01');
  assert.equal(query.get('view'), 'month');
  assert.equal(agenda.includeEnded.checked, false, 'forward keeps the same checkbox state');

  agenda.clear.click();
  query = new URLSearchParams(agenda.location.search);
  assert.equal(query.has('mode'), false);
  assert.equal(query.has('country'), false);
  assert.equal(query.has('community'), false);
  assert.equal(query.get('view'), 'month');
  assert.equal(query.get('date'), '2026-11-01');
  assert.equal(query.get('tz'), 'UTC');
  assert.equal(agenda.includeEnded.checked, false);
});

test('period arrows use calendar steps and clamp a month-end reference date', () => {
  const agenda = createAgenda({
    count: 0,
    filter: '?view=month&date=2026-03-31&tz=UTC',
  });

  agenda.previousPeriod.click();
  let query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('view'), 'month');
  assert.equal(query.get('date'), '2026-02-28', 'month navigation clamps to the final civil date in February');

  agenda.nextPeriod.click();
  query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('date'), '2026-03-28');
  agenda.viewButtons[0].click();
  query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('view'), 'week');
  assert.equal(query.get('date'), '2026-03-28', 'changing back to week preserves the month reference date');

  agenda.nextPeriod.click();
  query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('view'), 'week');
  assert.equal(query.get('date'), '2026-04-04', 'week navigation advances seven civil days');
});

test('week and month selections use zone-aware overlap boundaries and main event labels', () => {
  const now = Date.parse('2026-10-05T03:15:00Z');
  const agenda = createAgenda({
    count: 5,
    now,
    visitorTimeZone: 'America/Argentina/Cordoba',
    filter: '?view=week&date=2026-10-05&tz=America%2FArgentina%2FCordoba',
    events: [
      { id: 'ends-at-week-start', startsAt: '2026-10-05T01:00:00Z', endsAt: '2026-10-05T03:00:00Z' },
      { id: 'starts-at-week-start', startsAt: '2026-10-05T03:00:00Z', endsAt: '2026-10-05T04:00:00Z' },
      { id: 'crosses-week-start', startsAt: '2026-10-05T02:30:00Z', endsAt: '2026-10-05T04:30:00Z' },
      { id: 'crosses-week-end', startsAt: '2026-10-12T02:30:00Z', endsAt: '2026-10-12T03:30:00Z' },
      { id: 'starts-at-week-end', startsAt: '2026-10-12T03:00:00Z', endsAt: '2026-10-12T04:00:00Z' },
    ],
  });

  assert.equal(agenda.countLabel.textContent, '3 eventos');
  assert.deepEqual(agenda.children.filter((card) => !card.hidden).map((card) => card.dataset.eventId),
    ['crosses-week-start', 'starts-at-week-start', 'crosses-week-end'],
    'the rendered agenda follows the selected events’ start-time order');
  const crossingCard = agenda.cards.find((card) => card.dataset.eventId === 'crosses-week-end');
  const localDateDigits = crossingCard.members[0].dateLabel.textContent.match(/\d+/gu) ?? [];
  const localTimeDigits = crossingCard.members[0].timeLabel.textContent.match(/\d+/gu) ?? [];
  assert.ok(localDateDigits.includes('11'), 'the selected zone places the event start on Sunday the 11th');
  assert.ok(localTimeDigits.includes('23') && localTimeDigits.includes('30'),
    'the primary schedule uses the selected zone rather than the organizer or browser default');

  agenda.nextPeriod.click();
  let query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('date'), '2026-10-12');
  assert.equal(agenda.countLabel.textContent, '2 eventos',
    'a multi-day occurrence appears in both periods, while the period end remains exclusive');

  agenda.zoneFilter.value = 'UTC';
  agenda.zoneFilter.emit('change');
  query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('date'), '2026-10-12', 'changing zone keeps the reference date');
  assert.equal(query.get('tz'), 'UTC');
  assert.equal(agenda.zoneFilter.value, 'UTC');
  const utcDateDigits = crossingCard.members[0].dateLabel.textContent.match(/\d+/gu) ?? [];
  const utcTimeDigits = crossingCard.members[0].timeLabel.textContent.match(/\d+/gu) ?? [];
  assert.ok(utcDateDigits.includes('12'), 'the primary date changes with the selected zone');
  assert.ok(utcTimeDigits.some((digit) => Number(digit) === 2) && utcTimeDigits.includes('30'),
    'the primary time changes with the selected zone');
});

test('an empty period retains valid filters and clear changes only filters', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const agenda = createAgenda({
    count: 1,
    now,
    withCommunityFilters: true,
    filter: '?view=week&date=2026-10-05&tz=UTC&mode=online&country=AR&community=community-ar',
    events: [
      { id: 'next-week', startsAt: '2026-10-12T01:00:00Z', endsAt: '2026-10-12T02:00:00Z', mode: 'online', country: 'AR', communities: 'community-ar' },
    ],
  });

  assert.equal(agenda.countLabel.textContent, '0 eventos');
  assert.equal(agenda.empty.hidden, false);
  assert.equal(agenda.modeFilter.value, 'online');
  assert.equal(agenda.countryFilter.value, 'AR');
  assert.equal(agenda.communityFilter.value, 'community-ar');

  agenda.includeEnded.checked = false;
  agenda.includeEnded.emit('change');
  agenda.nextPeriod.click();
  let query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('date'), '2026-10-12');
  assert.equal(query.get('mode'), 'online');
  assert.equal(query.get('country'), 'AR');
  assert.equal(query.get('community'), 'community-ar');
  assert.equal(agenda.countLabel.textContent, '1 evento');
  assert.equal(agenda.includeEnded.checked, false);

  agenda.clear.click();
  query = new URLSearchParams(agenda.location.search);
  assert.equal(query.has('mode'), false);
  assert.equal(query.has('country'), false);
  assert.equal(query.has('community'), false);
  assert.equal(query.get('view'), 'week');
  assert.equal(query.get('date'), '2026-10-12');
  assert.equal(query.get('tz'), 'UTC');
  assert.equal(agenda.includeEnded.checked, false);
});

test('navigation links carry the current period and zone without rewriting unrelated links', () => {
  const agenda = createAgenda({
    count: 0,
    filter: '?utm_source=keep&view=week&date=2026-10-05&tz=UTC&mode=online',
  });
  for (const link of agenda.routeLinks) {
    const url = new URL(link.href, 'https://dondeaprendoaws.com');
    assert.equal(url.searchParams.get('view'), 'week');
    assert.equal(url.searchParams.get('date'), '2026-10-05');
    assert.equal(url.searchParams.get('tz'), 'UTC');
  }
  assert.equal(agenda.unrelatedRouteLink.href, '/aprender/');

  agenda.nextPeriod.click();
  for (const link of agenda.routeLinks) {
    const url = new URL(link.href, 'https://dondeaprendoaws.com');
    assert.equal(url.searchParams.get('view'), 'week');
    assert.equal(url.searchParams.get('date'), '2026-10-12');
    assert.equal(url.searchParams.get('tz'), 'UTC');
  }
  assert.equal(agenda.unrelatedRouteLink.href, '/aprender/');
});

test('an out-of-period co-host fragment opens its start period and keeps compatible filters', () => {
  const agenda = createAgenda({
    count: 1,
    now: Date.parse('2026-10-05T12:00:00Z'),
    withCommunityFilters: true,
    filter: '?view=week&date=2026-10-05&tz=America%2FArgentina%2FCordoba&mode=online&country=AR&community=community-ar',
    hash: '#event-cohost',
    events: [
      {
        id: 'event-primary', aliasIds: 'cohost',
        startsAt: '2027-01-01T01:00:00Z', endsAt: '2027-01-01T02:00:00Z',
        mode: 'online', country: 'AR', countries: 'AR', communities: 'community-ar',
      },
    ],
  });
  const query = new URLSearchParams(agenda.location.search);

  assert.equal(query.get('view'), 'week');
  assert.equal(query.get('date'), '2026-12-31',
    'the fragment uses its start date in the selected zone, even across a UTC year boundary');
  assert.equal(query.get('tz'), 'America/Argentina/Cordoba');
  assert.equal(query.get('mode'), 'online');
  assert.equal(query.get('country'), 'AR');
  assert.equal(query.get('community'), 'community-ar');
  assert.equal(agenda.location.hash, '#event-cohost');
  assert.equal(agenda.cards[0].hidden, false);
  assert.equal(agenda.document.activeElement, agenda.cards[0]);
  assert.equal(agenda.historyEntries.at(-1).method, 'replaceState');
});

test('a fragment outside the period keeps it when another co-host already overlaps', () => {
  const agenda = createAgenda({
    count: 1,
    now: Date.parse('2026-10-05T12:00:00Z'),
    filter: '?view=week&date=2026-10-05&tz=UTC',
    hash: '#event-short',
    events: [{
      id: 'long',
      aliasIds: 'short',
      startsAt: '2026-10-04T23:00:00Z',
      endsAt: '2026-10-05T01:00:00Z',
      members: [
        { startsAt: '2026-10-04T23:00:00Z', endsAt: '2026-10-05T01:00:00Z' },
        { startsAt: '2026-10-04T23:00:00Z', endsAt: '2026-10-04T23:30:00Z' },
      ],
    }],
  });

  assert.equal(new URLSearchParams(agenda.location.search).get('date'), '2026-10-05');
  assert.equal(agenda.location.hash, '#event-short');
  assert.equal(agenda.cards[0].hidden, false);
  assert.equal(agenda.document.activeElement, agenda.cards[0]);
});

test('unknown fragments do not change the period or filters', () => {
  const agenda = createAgenda({
    count: 1,
    filter: '?view=month&date=2026-10-01&tz=UTC&mode=online',
    hash: '#event-not-published',
    events: [{ id: 'known', startsAt: '2026-10-05T10:00:00Z', endsAt: '2026-10-05T11:00:00Z', mode: 'online' }],
  });

  const query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('view'), 'month');
  assert.equal(query.get('date'), '2026-10-01');
  assert.equal(query.get('tz'), 'UTC');
  assert.equal(query.get('mode'), 'online');
  assert.equal(agenda.location.hash, '#event-not-published');
  assert.ok(agenda.historyEntries.every((entry) => entry.method !== 'pushState'),
    'an unknown fragment does not create a navigation history entry');
  assert.equal(agenda.document.activeElement, agenda.document.body);
});

test('a route fallback for a known fragment retains view, reference date and zone', () => {
  const agenda = createAgenda({
    count: 0,
    pathname: '/eventos/argentina/',
    routeCountry: 'AR',
    additionalKnownEventIds: ['event-outside-route'],
    filter: '?utm_source=route&view=month&date=2026-10-01&tz=America%2FBogota&country=AR&includeEnded=0',
    hash: '#event-event-outside-route',
  });
  const fallback = new URL(agenda.window.location.href, 'https://dondeaprendoaws.com');

  assert.equal(fallback.pathname, '/eventos/');
  assert.equal(fallback.searchParams.get('view'), 'month');
  assert.equal(fallback.searchParams.get('date'), '2026-10-01');
  assert.equal(fallback.searchParams.get('tz'), 'America/Bogota');
  assert.equal(fallback.searchParams.get('country'), 'AR');
  assert.equal(fallback.searchParams.get('utm_source'), 'route');
  assert.equal(fallback.searchParams.has('includeEnded'), false);
  assert.equal(fallback.hash, '#event-event-outside-route');
});

test('an open week does not move to tomorrow automatically at local midnight', () => {
  const agenda = createAgenda({
    count: 2,
    now: Date.parse('2026-10-11T23:50:00Z'),
    filter: '?view=week&date=2026-10-05&tz=UTC',
    events: [
      {
        id: 'crosses-midnight',
        startsAt: '2026-10-11T23:55:00Z',
        endsAt: '2026-10-12T00:15:00Z',
      },
      {
        id: 'ended-this-week',
        startsAt: '2026-10-08T10:00:00Z',
        endsAt: '2026-10-08T11:00:00Z',
      },
    ],
  });
  const labelBeforeMidnight = agenda.periodLabel.textContent;

  agenda.advanceTime(20 * 60_000);
  assert.equal(agenda.fireNextTimer(), true);
  assert.equal(agenda.countLabel.textContent, '2 eventos',
    'the previous week still includes a past event that would leave the new week');
  assert.equal(new URLSearchParams(agenda.location.search).get('date'), '2026-10-05');
  assert.equal(agenda.periodLabel.textContent, labelBeforeMidnight,
    'an open query stays anchored to the chosen week after midnight');
});

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

test('expiry keeps the focused twelfth card visible when a co-host representative reorders ahead of it', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const startsAt = now - 10_000;
  const events = [
    ...'abcdefghijk'.split('').map((id) => ({
      id, startsAt, endsAt: now + 100_000,
    })),
    { id: 'm', startsAt, endsAt: now + 100_000 },
    {
      id: 'z-short', startsAt, endsAt: now + 500,
      aliasIds: 'a-ended',
      members: [
        { id: 'z-short', startsAt, endsAt: now + 500 },
        { id: 'a-ended', startsAt, endsAt: now - 1_000 },
      ],
    },
  ];
  const agenda = createAgenda({ count: events.length, now, events });
  const focusedLink = agenda.cards.find((card) => card.dataset.eventId === 'm').registration;

  assert.equal(agenda.cards.filter((card) => !card.hidden).length, 12);
  focusedLink.focus();
  agenda.advanceTime(501);
  assert.equal(agenda.fireNextTimer(), true);

  assert.equal(agenda.cards.find((card) => card.dataset.eventId === 'm').hidden, false,
    'the selected group is kept visible after the newly ended co-host moves before it');
  assert.equal(agenda.document.activeElement, focusedLink,
    'expiry and reordering preserve the same focused link without moving focus elsewhere');
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
  const communityUrl = new URL(agenda.historyEntries.at(-1).url, 'https://dondeaprendoaws.com');
  assert.equal(communityUrl.pathname, '/eventos/');
  assert.equal(communityUrl.searchParams.get('country'), 'AR');
  assert.equal(communityUrl.searchParams.get('community'), 'community-ar');
  assert.ok(communityUrl.searchParams.has('view'));
  assert.ok(communityUrl.searchParams.has('date'));
  assert.ok(communityUrl.searchParams.has('tz'));

  agenda.countryFilter.value = 'CO';
  agenda.countryFilter.emit('change');
  assert.equal(agenda.communityFilter.value, '', 'changing country clears the incompatible community');
  assert.equal(agenda.communityFilter.options[1].disabled, true);
  assert.equal(agenda.communityFilter.options[2].disabled, false);
  const countryUrl = new URL(agenda.historyEntries.at(-1).url, 'https://dondeaprendoaws.com');
  assert.equal(countryUrl.pathname, '/eventos/');
  assert.equal(countryUrl.searchParams.get('country'), 'CO');
  assert.equal(countryUrl.searchParams.has('view'), true);
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
  const clearedUrl = new URL(agenda.historyEntries.at(-1).url, 'https://dondeaprendoaws.com');
  assert.equal(clearedUrl.pathname, '/eventos/');
  assert.equal(clearedUrl.searchParams.has('country'), false);
  assert.equal(clearedUrl.searchParams.has('community'), false);
  assert.equal(clearedUrl.searchParams.has('view'), true, 'Clear preserves the current period.');
  assert.equal(clearedUrl.searchParams.has('date'), true, 'Clear preserves the period reference date.');
  assert.equal(clearedUrl.searchParams.has('tz'), true, 'Clear preserves the selected time zone.');
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
  const nationalUrl = new URL(agenda.historyEntries.at(-1).url, 'https://dondeaprendoaws.com');
  assert.equal(nationalUrl.searchParams.get('community'), 'community-girls');
  assert.equal(nationalUrl.searchParams.has('view'), true);
  assert.equal(nationalUrl.searchParams.has('date'), true);
  assert.equal(nationalUrl.searchParams.has('tz'), true);

  agenda.clear.click();
  assert.equal(agenda.communityFilter.options[1].value, 'community-girls', 'Clear does not mutate the first community option.');
  assert.equal(agenda.communityFilter.value, '');
  const clearedNationalUrl = new URL(agenda.historyEntries.at(-1).url, 'https://dondeaprendoaws.com');
  assert.equal(clearedNationalUrl.pathname, '/eventos/');
  assert.equal(clearedNationalUrl.searchParams.has('community'), false);
  assert.equal(clearedNationalUrl.searchParams.has('view'), true);
  assert.equal(clearedNationalUrl.searchParams.has('date'), true);
  assert.equal(clearedNationalUrl.searchParams.has('tz'), true);
  agenda.history.back();
  assert.equal(agenda.communityFilter.value, 'community-girls', 'Back restores the first community selection.');
  assert.equal(agenda.communityFilter.options[1].value, 'community-girls');
});
