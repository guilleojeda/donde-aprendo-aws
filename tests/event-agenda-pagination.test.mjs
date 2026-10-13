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

const script = readFileSync(new URL('../src/scripts/event-agenda.js', import.meta.url), 'utf8')
  .replace(/^import \{[\s\S]*?\} from '[^']+';\s*/gmu, '');

class MockElement {
  constructor(document, { tagName = 'DIV', dataset = {}, value = '', hidden = false } = {}) {
    this.document = document;
    this.tagName = tagName;
    this.dataset = dataset;
    this.value = value;
    this.hidden = hidden;
    this.children = [];
    this.listeners = new Map();
    this.textContent = '';
    this.options = [];
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
}

function createEventCards(count, {
  now, alternateModes = false, expiringFirst = false,
  eventCountriesByCard = [], eventCommunitiesByCard = [],
} = {}) {
  return Array.from({ length: count }, (_, index) => {
    const mode = alternateModes && index % 2 ? 'online' : 'in-person';
    const startsAt = expiringFirst && index === 0 ? now - 10_000 : now + 10_000;
    const endsAt = expiringFirst && index === 0 ? now + 500 : now + 100_000;
    return new MockElement(null, {
      tagName: 'LI',
      dataset: {
        eventId: `event-${index}`,
        eventStartsAt: new Date(startsAt).toISOString(),
        eventEndsAt: new Date(endsAt).toISOString(),
        eventTimeZone: 'UTC',
        eventDate: '2026-10-05',
        eventMode: mode,
        country: 'AR',
        eventCountries: eventCountriesByCard[index] ?? 'AR',
        eventCommunities: eventCommunitiesByCard[index] ?? '',
        eventCity: '',
      },
    });
  });
}

function createAgenda({
  count, now = Date.parse('2026-10-05T12:00:00Z'), alternateModes = false,
  expiringFirst = false, filter = '', withCommunityFilters = false,
  nationalAgenda = false, communityOptions = [
    { value: 'community-ar', dataset: { eventCountry: 'AR' } },
    { value: 'community-co', dataset: { eventCountry: 'CO' } },
  ], eventCountriesByCard = [], eventCommunitiesByCard = [],
}) {
  let clock = now;
  let nextTimer = 0;
  const document = { activeElement: null, hidden: false, listeners: new Map() };
  document.body = new MockElement(document, { tagName: 'BODY' });
  document.activeElement = document.body;
  const cards = createEventCards(count, {
    now, alternateModes, expiringFirst, eventCountriesByCard, eventCommunitiesByCard,
  });
  for (const card of cards) {
    card.document = document;
    card.querySelector = () => null;
  }

  const agenda = new MockElement(document, { tagName: 'OL' });
  agenda.querySelectorAll = (selector) => selector === '[data-event-ends-at]' ? cards : [];
  const empty = new MockElement(document, { hidden: true, dataset: { eventNoUpcoming: 'Sin próximos eventos.' } });
  const more = new MockElement(document, { tagName: 'BUTTON', hidden: true });
  const countLabel = new MockElement(document);
  const summary = new MockElement(document, { dataset: { eventSummaryIntro: 'Hay', eventSummaryEmpty: 'No hay eventos.' } });
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
  const elements = new Map([
    ['[data-event-list]', agenda], ['[data-event-empty]', empty], ['.event-agenda__filters', filterFields],
    ['[data-event-secondary-disclosure]', null], ['[data-event-secondary-label]', null],
    ['[data-event-clear]', clear], ['[data-event-more]', more], ['[data-event-count]', countLabel],
    ['[data-event-summary]', summary],
  ]);
  document.querySelector = (selector) => elements.get(selector) ?? null;
  document.addEventListener = (type, handler) => document.listeners.set(type, handler);

  const windowListeners = new Map();
  const window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (type, handler) => windowListeners.set(type, handler),
  };
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
    document, window, location, history,
    eventMatchesFilters, parseEventAgendaSearch, secondaryEventAgendaFilterCount,
    serializeEventAgendaSearch, shouldOpenEventAgendaSecondaryFilters, trackRegistrationClick,
    eventAgendaSummaryText, nextEventAgendaTransition,
    Date: ClockDate,
    clearTimeout() {},
    setTimeout() { return ++nextTimer; },
    requestAnimationFrame: (callback) => callback(),
  });

  return {
    cards, countLabel, document, empty, modeFilter, more, countryFilter, communityFilter, clear, historyEntries, history,
    advanceTime(ms) { clock += ms; },
    refreshVisibility() { document.listeners.get('visibilitychange')?.(); },
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
  const agenda = createAgenda({ count: 28, alternateModes: true, expiringFirst: true, filter: '?mode=in-person' });
  assert.equal(agenda.countLabel.textContent, '14 eventos');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId),
    Array.from({ length: 12 }, (_, index) => `event-${index * 2}`));

  agenda.more.focus();
  agenda.advanceTime(501);
  agenda.refreshVisibility();
  assert.equal(agenda.document.activeElement, agenda.more, 'automatic expiration refresh leaves focus where the visitor put it');
  assert.equal(agenda.cards[24].hidden, false, 'the next active filtered event fills the expired slot');

  agenda.more.click();
  assert.equal(agenda.document.activeElement, agenda.cards[26], 'Show More focuses the next event in the filtered active set');
  assert.equal(agenda.cards[25].hidden, true, 'an event outside the selected mode stays hidden');
  assert.equal(agenda.more.hidden, true);
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
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId), ['event-0', 'event-1']);

  agenda.history.back();
  assert.equal(agenda.countryFilter.value, 'AR', 'back restores the prior country');
  assert.equal(agenda.communityFilter.value, 'community-ar', 'back restores the compatible community');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId), ['event-0', 'event-2']);
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
