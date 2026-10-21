import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import {
  eventMatchesFilters,
  parseEventAgendaSearch,
  secondaryEventAgendaFilterCount,
  serializeEventAgendaSearch,
} from '../src/lib/event-agenda-filter.mjs';
import { trackRegistrationClick } from '../src/lib/event-analytics.mjs';
import { eventAgendaSummaryText, nextEventAgendaTransition } from '../src/lib/event-agenda-summary.mjs';
import { eventGroupsForAgenda } from '../src/lib/event-agenda-groups.mjs';
import { eventDateLabel, eventEndTimeLabel, eventLocalDate, eventTimeLabel } from '../src/lib/events.mjs';

const periodModuleUrl = new URL('../src/lib/event-agenda-period.mjs', import.meta.url);
let eventAgendaPeriodApi = {};
try {
  eventAgendaPeriodApi = await import(periodModuleUrl.href);
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== periodModuleUrl.href) throw error;
}
const eventLocationModuleUrl = new URL('../src/lib/event-location.mjs', import.meta.url);
let eventLocationApi = {};
try {
  eventLocationApi = await import(eventLocationModuleUrl.href);
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== eventLocationModuleUrl.href) throw error;
}
const eventAgendaShareModuleUrl = new URL('../src/lib/event-agenda-share.mjs', import.meta.url);
let eventAgendaShareApi = {};
try {
  eventAgendaShareApi = await import(eventAgendaShareModuleUrl.href);
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== eventAgendaShareModuleUrl.href) throw error;
}
const script = readFileSync(new URL('../src/scripts/event-agenda.js', import.meta.url), 'utf8')
  .replace(/^import \{[\s\S]*?\} from '[^']+';\s*/gmu, '');

class MockElement {
  constructor(document, { tagName = 'DIV', dataset = {}, value = '', hidden = false, checked = false, textContent = '' } = {}) {
    this.document = document;
    this.tagName = tagName;
    this.dataset = dataset;
    this._value = '';
    this.hidden = hidden;
    if (tagName !== 'A') this.disabled = false;
    this.checked = checked;
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.textContent = textContent;
    this.options = [];
    this.scrollIntoViewCalls = [];
    this.focusCalls = [];
    this.attributes = new Map();
    this.style = {
      properties: new Map(),
      setProperty(name, value) { this.properties.set(name, String(value)); },
      removeProperty(name) { this.properties.delete(name); },
    };
    this.value = value;
  }

  get value() { return this._value; }

  get hidden() { return this._hidden ?? false; }
  set hidden(value) {
    this._hidden = Boolean(value);
    const focused = this.document?.activeElement;
    if (this._hidden && focused && (focused === this || this.children?.some((child) => child.contains(focused)))) {
      this.document.activeElement = this.document.body;
    }
  }

  set value(value) {
    const next = String(value ?? '');
    this._value = this.tagName === 'SELECT' && next && !this.options.some((option) => option.value === next)
      ? ''
      : next;
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
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }
  hasAttribute(name) { return this.attributes.has(name); }
  closest(selector) {
    assert.equal(selector, '[data-theme-toggle]', 'the fake implements only the public theme-toggle selector');
    for (let element = this; element; element = element.parentElement) {
      if (element.hasAttribute('data-theme-toggle')) return element;
    }
    return null;
  }
  getAttribute(name) { return name === 'href' ? this.href ?? null : this.attributes.get(name) ?? null; }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'href') delete this.href;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }

  append(...children) {
    for (const child of children) {
      if (child.parentElement) {
        const previousParent = child.parentElement;
        previousParent.children = previousParent.children.filter((item) => item !== child);
        if (previousParent.tagName === 'SELECT') {
          previousParent.options = previousParent.options.filter((item) => item !== child);
        }
      }
      this.children = this.children.filter((item) => item !== child);
      this.children.push(child);
      child.parentElement = this;
      if (this.tagName === 'SELECT' && !this.options.includes(child)) this.options.push(child);
    }
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  matches(selector) {
    if (selector === 'a') return this.tagName === 'A';
    if (/^[a-z]+$/iu.test(selector)) return this.tagName === selector.toUpperCase();
    const attribute = /^\[data-([a-z0-9-]+)\]$/u.exec(selector);
    if (attribute) {
      const key = attribute[1].replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
      return Object.hasOwn(this.dataset, key);
    }
    const taggedAttribute = /^(\w+)\[data-([a-z0-9-]+)\]$/u.exec(selector);
    if (taggedAttribute) {
      const key = taggedAttribute[2].replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
      return this.tagName === taggedAttribute[1].toUpperCase() && Object.hasOwn(this.dataset, key);
    }
    return false;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (parent) => {
      for (const child of parent.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  emit(type, event = {}) {
    return (this.listeners.get(type) ?? []).map((handler) => handler(event));
  }

  emitBubbling(type, event = {}) {
    if (!Object.hasOwn(event, 'target')) event.target = this;
    for (let element = this; element; element = element.parentElement) {
      event.currentTarget = element;
      element.emit(type, event);
    }
    this.document?.dispatchEvent(event);
  }

  focus(options) {
    this.focusCalls.push(options);
    const previous = this.document?.activeElement;
    if (previous === this) return;
    this.document.activeElement = this;
    previous?.emitBubbling('focusout', { type: 'focusout', target: previous, relatedTarget: this });
  }

  click() {
    for (let element = this; element; element = element.parentElement) {
      if (element.hidden || element.disabled) return;
    }
    if (this.parentElement?.tagName === 'DETAILS' && !this.parentElement.open && this.tagName !== 'SUMMARY') return;
    this.focus();
    if (this.tagName === 'SUMMARY' && this.parentElement?.tagName === 'DETAILS') {
      this.parentElement.open = !this.parentElement.open;
      this.parentElement.emit('toggle');
    }
    this.emit('click');
  }

  scrollIntoView(options) { this.scrollIntoViewCalls.push(options); }

  contains(element) { return element === this || this.children.some((child) => child.contains(element)); }
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
        eventVenueCountry: spec.venueCountry ?? '',
        eventCountries: spec.countries ?? eventCountriesByCard[index] ?? spec.country ?? 'AR',
        eventCommunities: spec.communities ?? eventCommunitiesByCard[index] ?? '',
        eventCity: spec.city ?? '',
        eventAliasIds: spec.aliasIds ?? '',
      },
    });
    card.id = `event-${card.dataset.eventId}`;
    card.dayHeading = new MockElement(null, {
      tagName: 'H3',
      dataset: { eventDayHeading: '', eventDay: spec.headingDate ?? '' },
      textContent: spec.headingLabel ?? '',
    });
    card.dayDate = new MockElement(null, { tagName: 'TIME' });
    card.dayHeading.append(card.dayDate);
    // Give each co-host its own detail disclosure and action links, as consumed by the agenda client.
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
          memberVenueCountry: memberSpec.venueCountry ?? (memberIndex === 0 ? card.dataset.eventVenueCountry : ''),
          memberCity: memberSpec.city ?? card.dataset.eventCity.replace(/^[^:]*:/u, ''),
          memberCommunityId: memberSpec.communityId ?? communities[memberIndex] ?? communities[0] ?? '',
          memberTitle: memberSpec.title ?? (memberIndex === 0 ? spec.title : undefined) ?? `Evento de agenda ${index + 1}${memberIndex ? ` · comunidad ${memberIndex + 1}` : ''}`,
          memberRegistrationUrl: memberSpec.registrationUrl ?? spec.registrationUrl ?? `https://example.test/events/${index}${memberIndex ? `/community-${memberIndex + 1}` : ''}`,
        },
      });
      view.status = new MockElement(null);
      view.registration = new MockElement(null, { tagName: 'A', textContent: 'Inscribirme' });
      view.registration.href = view.dataset.memberRegistrationUrl;
      view.calendar = new MockElement(null, { tagName: 'A', textContent: 'Agregar al calendario (.ics)' });
      view.calendar.href = `/eventos/${view.dataset.eventMemberId}.ics`;
      view.report = new MockElement(null, { tagName: 'A', textContent: 'Reportar dato incorrecto' });
      view.report.href = `mailto:contact@example.test?body=${view.dataset.eventMemberId}`;
      view.recording = new MockElement(null, { tagName: 'A', textContent: 'Ver grabación' });
      view.recording.href = `/aprender/?eventId=${view.dataset.eventMemberId}`;
      view.details = new MockElement(null, { tagName: 'DETAILS', dataset: { eventDetail: '' } });
      view.details.open = false;
      view.detailToggle = new MockElement(null, { tagName: 'SUMMARY', dataset: { eventDetailToggle: '' }, textContent: 'Detalles' });
      view.description = new MockElement(null, { textContent: memberSpec.description ?? `Descripción de ${view.dataset.eventMemberId}` });
      view.details.append(view.detailToggle, view.description, view.calendar, view.recording, view.report);
      view.dateLabel = new MockElement(null);
      view.timeLabel = new MockElement(null);
      view.endTimeLabel = new MockElement(null);
      view.participationLabel = new MockElement(null);
      view.querySelector = (selector) => ({
        '[data-event-status]': view.status,
        '[data-event-registration]': view.registration,
        '[data-event-date-label]': view.dateLabel,
        '[data-event-time-label]': view.timeLabel,
        '[data-event-time-end-label]': view.endTimeLabel,
        '[data-event-participation]': view.participationLabel,
        '[data-event-detail]': view.details,
        '[data-event-detail-toggle]': view.detailToggle,
        '[data-visitor-time]': null,
        '[data-visitor-time-value]': null,
      }[selector] ?? MockElement.prototype.querySelector.call(view, selector));
      view.querySelectorAll = (selector) => MockElement.prototype.querySelectorAll.call(view, selector);
      view.append(view.status, view.registration, view.dateLabel, view.timeLabel, view.endTimeLabel, view.participationLabel, view.details);
      return view;
    });
    card.children = [card.dayHeading, ...card.members];
    card.dayHeading.parentElement = card;
    for (const member of card.members) member.parentElement = card;
    card.status = card.members[0].status;
    card.registration = card.members[0].registration;
    card.querySelectorAll = (selector) => selector === '[data-event-member-id]'
      ? card.members : MockElement.prototype.querySelectorAll.call(card, selector);
    return card;
  });
}

function createAgenda({
  count, now = Date.parse('2026-10-05T12:00:00Z'), alternateModes = false,
  expiringFirst = false, filter = '', communityOptions = [
    { value: 'community-ar', dataset: { eventCountry: 'AR', eventCity: 'Córdoba' } },
    { value: 'community-co', dataset: { eventCountry: 'CO', eventCity: 'Bogotá' } },
  ], eventCountriesByCard = [], eventCommunitiesByCard = [], events = [], includeEnded = true,
  hostname = 'dondeaprendoaws.com', visitorTimeZone = 'UTC', pathname = '/eventos/', hash = '',
  defaultCountry = '', defaultMode = '', additionalKnownEventIds = [], clipboard,
  cityOptions = [
    { value: 'AR:Córdoba', dataset: { eventCountries: 'AR' } },
    { value: 'CO:Bogotá', dataset: { eventCountries: 'CO' } },
  ],
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
    card.parentElement = null;
    card.dayHeading.document = document;
    card.dayDate.document = document;
    for (const member of card.members) {
      member.document = document;
      for (const child of [member.details, member.detailToggle, member.description, ...member.querySelectorAll('a')]) {
        child.document = document;
      }
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
      eventDefaultCountry: defaultCountry,
      eventDefaultMode: defaultMode,
    },
  });
  agenda.children = [...cards];
  for (const card of agenda.children) card.parentElement = agenda;
  agenda.append = (...children) => {
    for (const child of children) {
      if (child.contains(document.activeElement)) document.activeElement = document.body;
    }
    MockElement.prototype.append.apply(agenda, children);
  };
  const empty = new MockElement(document, {
    hidden: true,
    dataset: { eventNoMatches: 'No hay eventos que coincidan con estos filtros.' },
  });
  const more = new MockElement(document, { tagName: 'BUTTON', hidden: true });
  const countLabel = new MockElement(document);
  const routeCountryLabel = { AR: 'Argentina', CO: 'Colombia', PE: 'Perú' }[defaultCountry];
  document.title = 'Eventos AWS | ¿Dónde Aprendo AWS?';
  const pageHeading = new MockElement(document, {
    textContent: routeCountryLabel ? `Eventos AWS en ${routeCountryLabel}` : 'Eventos AWS publicados',
  });
  const pageIntro = new MockElement(document, {
    textContent: routeCountryLabel
      ? `Consulta eventos organizados por comunidades de ${routeCountryLabel}.`
      : 'Consulta eventos de comunidades AWS de Latinoamérica.',
  });
  const summary = new MockElement(document, {
    dataset: {
      eventSummaryIntro: 'En la agenda de eventos AWS hay',
      eventSummaryEmpty: 'No hay eventos publicados en esta agenda.',
    },
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
  zoneFilter.options = ['UTC', 'America/Bogota', 'America/New_York', 'America/Argentina/Cordoba', 'Asia/Tokyo']
    .map((value) => ({ value, dataset: {} }));
  const secondaryZone = zoneFilter;
  const routeLinks = [
    { href: '/eventos/', dataset: {}, target: '' },
    { href: '/eventos/argentina/', dataset: { eventAgendaCountry: 'AR' }, target: '' },
    { href: '/eventos/colombia/', dataset: { eventAgendaCountry: 'CO' }, target: '_blank' },
    { href: '/eventos/online/', dataset: { eventAgendaModes: 'online' }, target: '' },
    { href: '/eventos/presenciales/', dataset: { eventAgendaModes: 'in-person' }, target: '' },
  ].map(({ href, dataset, target }) => {
      const link = new MockElement(document, { tagName: 'A', dataset: { eventAgendaRoute: 'true', ...dataset } });
      link.href = href;
      link.target = target;
      link.rel = target === '_blank' ? 'noopener noreferrer' : '';
      return link;
    });
  const unrelatedRouteLink = new MockElement(document, { tagName: 'A' });
  unrelatedRouteLink.href = '/aprender/';
  const modeFilter = new MockElement(document, { tagName: 'SELECT' });
  modeFilter.options = ['', 'online', 'in-person'].map((value) => ({ value, dataset: {} }));
  const countryFilter = new MockElement(document, { tagName: 'SELECT' });
  countryFilter.options = ['', 'AR', 'CO', 'PE'].map((value) => ({ value, dataset: {} }));
  const cityFilter = new MockElement(document, { tagName: 'SELECT' });
  cityFilter.options = [{ value: '', dataset: {} }, ...cityOptions];
  const communityFilter = new MockElement(document, { tagName: 'SELECT' });
  communityFilter.options = [{ value: '', dataset: {} }, ...communityOptions];
  const secondaryDisclosure = new MockElement(document, { tagName: 'DETAILS' });
  secondaryDisclosure.open = false;
  const secondaryDisclosureToggle = new MockElement(document, { tagName: 'SUMMARY', textContent: 'Más filtros' });
  const secondaryLabel = new MockElement(document, { dataset: { eventSecondaryLabel: '' }, textContent: 'Más filtros' });
  const secondaryFields = new MockElement(document);
  secondaryDisclosureToggle.append(secondaryLabel);
  secondaryFields.append(communityFilter, zoneFilter);
  secondaryDisclosure.append(secondaryDisclosureToggle, secondaryFields);
  const filterFields = new MockElement(document);
  filterFields.querySelector = (selector) => ({
    '[data-event-mode]': modeFilter,
    '[data-event-country]': countryFilter,
    'select[data-event-country]': countryFilter,
    '[data-event-community]': communityFilter,
    '[data-event-city]': cityFilter,
    '[data-event-zone]': zoneFilter,
  }[selector] ?? null);
  const clear = new MockElement(document, { tagName: 'BUTTON' });
  const includeEndedFilter = new MockElement(document, {
    tagName: 'INPUT', checked: true,
  });
  const shareControls = new MockElement(document, { hidden: true });
  const shareMenu = new MockElement(document, { tagName: 'DETAILS' });
  shareMenu.open = false;
  const shareToggle = new MockElement(document, { tagName: 'SUMMARY', textContent: 'Compartir' });
  const xShareLink = new MockElement(document, { tagName: 'A', textContent: 'X' });
  xShareLink.href = '/eventos/';
  xShareLink.target = '_blank';
  xShareLink.rel = 'noopener noreferrer';
  const linkedinShareLink = new MockElement(document, { tagName: 'A', textContent: 'LinkedIn' });
  linkedinShareLink.href = '/eventos/';
  linkedinShareLink.target = '_blank';
  linkedinShareLink.rel = 'noopener noreferrer';
  const copyButton = new MockElement(document, { tagName: 'BUTTON', textContent: 'Copiar' });
  copyButton.type = 'button';
  const shareStatus = new MockElement(document);
  shareStatus.setAttribute('role', 'status');
  shareStatus.setAttribute('aria-live', 'polite');
  const themeToggle = new MockElement(document, { tagName: 'BUTTON' });
  themeToggle.setAttribute('data-theme-toggle', '');
  const themeIcon = new MockElement(document, { tagName: 'SVG' });
  themeToggle.append(themeIcon);
  shareToggle.parentElement = shareMenu;
  shareMenu.children = [shareToggle, xShareLink, linkedinShareLink, copyButton];
  shareControls.children = [shareMenu, shareStatus];
  for (const child of shareMenu.children) child.parentElement = shareMenu;
  for (const child of shareControls.children) child.parentElement = shareControls;
  const currentWeekButton = new MockElement(document, {
    tagName: 'BUTTON', dataset: { eventCurrentWeek: '' }, textContent: 'Semana actual',
  });
  currentWeekButton.type = 'button';
  const elements = new Map([
    ['[data-event-list]', agenda], ['[data-event-empty]', empty], ['.event-agenda__filters', filterFields],
    ['[data-event-page-heading]', pageHeading], ['[data-event-page-intro]', pageIntro],
    ['[data-event-secondary-disclosure]', secondaryDisclosure], ['[data-event-secondary-label]', secondaryLabel],
    ['[data-event-current-week]', currentWeekButton],
    ['[data-event-clear]', clear], ['[data-event-more]', more], ['[data-event-count]', countLabel],
    ['[data-event-summary]', summary],
    ['[data-event-include-ended]', includeEndedFilter],
    ['[data-event-view=\"week\"]', viewButtons[0]],
    ['[data-event-view=\"month\"]', viewButtons[1]],
    ['[data-event-period-prev]', previousPeriod],
    ['[data-event-period-next]', nextPeriod],
    ['[data-event-period-label]', periodLabel],
    ['[data-event-zone]', zoneFilter],
    ['[data-event-share-controls]', shareControls],
    ['[data-event-share-menu]', shareMenu],
    ['[data-event-share-toggle]', shareToggle],
    ['[data-event-share-x]', xShareLink],
    ['[data-event-share-linkedin]', linkedinShareLink],
    ['[data-event-share-copy]', copyButton],
    ['[data-event-share-status]', shareStatus],
  ]);
  document.querySelector = (selector) => elements.get(selector) ?? null;
  document.querySelectorAll = (selector) => {
    if (selector === '[data-event-view]') return viewButtons;
    if (selector === 'a[data-event-agenda-route]' || selector === '[data-event-agenda-route]') return routeLinks;
    return [];
  };
  document.createElement = (tagName) => new MockElement(document, { tagName: String(tagName).toUpperCase() });
  document.addEventListener = (type, handler) => {
    const handlers = document.listeners.get(type) ?? [];
    handlers.push(handler);
    document.listeners.set(type, handlers);
  };
  document.dispatchEvent = (event) => {
    event.currentTarget = document;
    let result;
    for (const handler of document.listeners.get(event.type) ?? []) result = handler(event);
    windowListeners.get(event.type)?.(event);
    return result;
  };

  const windowListeners = new Map();
  const mediaListeners = [];
  const mobileDisclosure = {
    matches: false,
    addEventListener(type, handler) {
      if (type === 'change') mediaListeners.push(handler);
    },
    setMatches(matches) {
      this.matches = Boolean(matches);
      for (const listener of mediaListeners) listener({ matches: this.matches });
    },
  };
  const window = {
    matchMedia: () => mobileDisclosure,
    addEventListener: (type, handler) => windowListeners.set(type, handler),
    location: { hostname, href: '' },
    gtag: (...args) => telemetryCalls.push(args),
  };
  const navigator = {};
  const clipboardCalls = [];
  const windowOpenCalls = [];
  const setClipboard = (api) => {
    if (api === undefined) {
      delete navigator.clipboard;
      return;
    }
    navigator.clipboard = {
      writeText(...args) {
        clipboardCalls.push(args);
        return api.writeText(...args);
      },
    };
  };
  if (clipboard !== undefined) setClipboard(clipboard);
  window.navigator = navigator;
  window.open = (...args) => { windowOpenCalls.push(args); return {}; };
  const storage = {
    getItem(key) { storageCalls.push(['getItem', key]); return null; },
    setItem(key, value) { storageCalls.push(['setItem', key, value]); },
    removeItem(key) { storageCalls.push(['removeItem', key]); },
  };
  window.localStorage = storage;
  window.sessionStorage = storage;
  const location = { pathname, search: filter, hash };
  let assignedWindowHref = '';
  Object.defineProperties(window.location, {
    origin: { get: () => `https://${hostname}` },
    href: {
      get: () => assignedWindowHref || `https://${hostname}${location.pathname}${location.search}${location.hash}`,
      set: (value) => { assignedWindowHref = new URL(String(value), `https://${hostname}`).href; },
    },
  });
  const historyEntries = [];
  const historyUrls = [`${pathname}${filter}${hash}`];
  let historyIndex = 0;
  const applyUrl = (url) => {
    const hashStart = url.indexOf('#');
    const queryStart = url.indexOf('?');
    const pathEnd = queryStart === -1
      ? (hashStart === -1 ? url.length : hashStart)
      : hashStart === -1 ? queryStart : Math.min(queryStart, hashStart);
    const nextPath = url.slice(0, pathEnd);
    if (nextPath.startsWith('/')) location.pathname = nextPath;
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
    serializeEventAgendaSearch, trackRegistrationClick,
    eventAgendaSummaryText, nextEventAgendaTransition, eventGroupsForAgenda,
    effectiveEventLocation: eventLocationApi.effectiveEventLocation,
    normalizeEventCityKey: eventLocationApi.normalizeEventCityKey,
    buildEventAgendaShare: eventAgendaShareApi.buildEventAgendaShare,
    eventDateLabel, eventEndTimeLabel, eventLocalDate, eventTimeLabel,
    navigator,
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
    cards, countLabel, document, empty, modeFilter, more, countryFilter, cityFilter, communityFilter, clear,
    pageHeading, pageIntro, secondaryDisclosure, secondaryDisclosureToggle, secondaryLabel, secondaryFields,
    secondaryZone,
    shareControls, shareMenu, shareToggle, xShareLink, linkedinShareLink, copyButton, shareStatus,
    themeToggle, themeIcon,
    navigator, clipboardCalls, windowOpenCalls, setClipboard,
    get children() { return agenda.children; },
    viewButtons, previousPeriod, nextPeriod, periodLabel, zoneFilter, routeLinks, unrelatedRouteLink, window,
    currentWeekButton,
    includeEnded: includeEndedFilter, summary, historyEntries, history, location, storageCalls, telemetryCalls,
    advanceTime(ms) { clock += ms; },
    refreshVisibility() {
      for (const handler of document.listeners.get('visibilitychange') ?? []) handler();
    },
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
    setViewportMobile(matches) { mobileDisclosure.setMatches(matches); },
  };
}

function expectAgendaDayHeadings(agenda, timeZone) {
  const visibleCards = agenda.children.filter((card) => !card.hidden);
  const seenDays = new Set();
  const expectedHeadings = [];
  for (const card of visibleCards) {
    const heading = card.querySelector('[data-event-day-heading]');
    assert.ok(heading, `occurrence ${card.dataset.eventId} keeps a semantic day heading in the DOM`);
    assert.equal(heading.tagName, 'H3');
    const day = eventLocalDate(card.dataset.eventStartsAt, timeZone);
    assert.equal(heading.dataset.eventDay, day,
      `heading follows the occurrence start day ${day} in ${timeZone}`);
    const isFirstVisibleOccurrence = !seenDays.has(day);
    assert.equal(heading.hidden, !isFirstVisibleOccurrence,
      `only the first visible occurrence on ${day} has a visible heading`);
    if (isFirstVisibleOccurrence) {
      expectedHeadings.push(day);
      seenDays.add(day);
    }
  }
  const visibleHeadings = visibleCards
    .filter((card) => !card.querySelector('[data-event-day-heading]').hidden)
    .map((card) => card.querySelector('[data-event-day-heading]').dataset.eventDay);
  assert.deepEqual(visibleHeadings, expectedHeadings,
    'visible headings match the selected occurrence days without duplicates or orphan rows');
  return expectedHeadings;
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

test('Semana actual uses the selected zone, preserves query and checkbox state, and participates in history', () => {
  const now = Date.parse('2026-01-01T01:00:00Z');
  for (const [timeZone, expectedDate] of [
    ['UTC', '2026-01-01'],
    ['America/Argentina/Cordoba', '2025-12-31'],
  ]) {
    const agenda = createAgenda({
      count: 0,
      now,
      filter: `?campaign=week-test&view=month&date=2025-12-15&tz=${encodeURIComponent(timeZone)}&mode=in-person&country=AR&city=AR%3AC%C3%B3rdoba&community=community-ar`,
      hash: '#previous-anchor',
    });
    agenda.includeEnded.checked = false;
    const startingQuery = new URLSearchParams(agenda.location.search);

    agenda.currentWeekButton.click();

    let query = new URLSearchParams(agenda.location.search);
    assert.equal(query.get('view'), 'week');
    assert.equal(query.get('date'), expectedDate,
      `today is calculated in ${timeZone}, including the New Year boundary`);
    assert.equal(query.get('tz'), timeZone);
    for (const key of ['campaign', 'mode', 'country', 'city', 'community']) {
      assert.equal(query.get(key), startingQuery.get(key), `${key} survives navigation to the current week`);
    }
    assert.equal(agenda.includeEnded.checked, false, 'the session-local ended-events checkbox is preserved');
    assert.equal(agenda.location.hash, '', 'current-week navigation clears the prior fragment');
    assert.equal(agenda.historyEntries.at(-1)?.method, 'pushState');
    assert.ok(!agenda.historyEntries.at(-1)?.url.includes('#'));

    agenda.history.back();
    query = new URLSearchParams(agenda.location.search);
    assert.equal(query.get('view'), 'month');
    assert.equal(query.get('date'), '2025-12-15');
    assert.equal(agenda.location.hash, '#previous-anchor', 'Back restores the prior fragment and period');
    assert.equal(agenda.includeEnded.checked, false);
    agenda.history.forward();
    query = new URLSearchParams(agenda.location.search);
    assert.equal(query.get('view'), 'week');
    assert.equal(query.get('date'), expectedDate);
    assert.equal(agenda.location.hash, '', 'Forward returns to the hash-free current-week entry');
    assert.equal(agenda.includeEnded.checked, false);
  }

  const events = Array.from({ length: 27 }, (_, index) => ({
    id: `january-event-${index}`,
    startsAt: now + 10_000 + index,
    endsAt: now + 3_600_000 + index,
    localDate: '2026-01-01',
  }));
  const agenda = createAgenda({
    count: events.length,
    now,
    events,
    filter: '?view=month&date=2026-01-15&tz=UTC',
  });
  assert.equal(agenda.cards.filter((card) => !card.hidden).length, 12);
  assert.equal(agenda.countLabel.textContent, '27 eventos');
  agenda.more.click();
  assert.equal(agenda.cards.filter((card) => !card.hidden).length, 24);
  assert.equal(agenda.countLabel.textContent, '27 eventos');

  agenda.currentWeekButton.click();
  assert.equal(new URLSearchParams(agenda.location.search).get('view'), 'week');
  assert.equal(new URLSearchParams(agenda.location.search).get('date'), '2026-01-01');
  assert.equal(agenda.cards.filter((card) => !card.hidden).length, 12,
    'navigating to the current week restores the first page');
  assert.equal(agenda.countLabel.textContent, '27 eventos', 'pagination does not truncate the selected total');
});

test('secondary filters stay closed on boot and across query, filtering, history, and viewport changes', () => {
  const agenda = createAgenda({
    count: 1,
    filter: '?view=week&date=2026-10-05&tz=UTC&mode=in-person&country=AR&city=AR%3AC%C3%B3rdoba&community=community-ar',
  });
  assert.equal(agenda.secondaryDisclosure.open, false,
    'an active community query is indicated without opening Secondary filters');
  assert.equal(agenda.secondaryLabel.textContent, 'Más filtros (1 activo)');

  agenda.setViewportMobile(true);
  assert.equal(agenda.secondaryDisclosure.open, false, 'resizing to mobile does not auto-open the disclosure');
  agenda.setViewportMobile(false);
  assert.equal(agenda.secondaryDisclosure.open, false, 'resizing back to desktop does not auto-open it');

  agenda.communityFilter.value = '';
  agenda.communityFilter.emit('change');
  assert.equal(agenda.secondaryDisclosure.open, false, 'changing a secondary filter does not open its disclosure');
  assert.equal(agenda.secondaryLabel.textContent, 'Más filtros');
  agenda.history.back();
  assert.equal(agenda.secondaryDisclosure.open, false, 'restoring an active community query stays closed');
  assert.equal(agenda.secondaryLabel.textContent, 'Más filtros (1 activo)');
  agenda.communityFilter.value = '';
  agenda.communityFilter.emit('change');
  agenda.communityFilter.value = 'community-ar';
  agenda.communityFilter.emit('change');
  assert.equal(agenda.secondaryDisclosure.open, false, 'selecting an active secondary filter keeps it closed');
  assert.equal(agenda.secondaryLabel.textContent, 'Más filtros (1 activo)');
  agenda.setViewportMobile(true);
  assert.equal(agenda.secondaryDisclosure.open, false, 'resize with active history state stays closed');
});

test('More options stays open through Tab to theme, then closes on focusout without stealing focus', () => {
  const agenda = createAgenda({
    count: 1,
    filter: '?view=week&date=2026-10-05&tz=UTC&mode=online',
  });
  const queryBefore = agenda.location.search;
  const historyBefore = agenda.historyEntries.length;
  const cardsBefore = [...agenda.children];
  const moreBefore = agenda.more.hidden;
  const focusoutTransitions = [];
  agenda.document.addEventListener('focusout', (event) => {
    focusoutTransitions.push([event.target, event.relatedTarget]);
  });

  // Closed-on-load is covered separately; isolate focusout behavior here.
  agenda.secondaryDisclosure.open = false;
  agenda.secondaryDisclosureToggle.click();
  assert.equal(agenda.secondaryDisclosure.open, true);
  assert.equal(agenda.document.activeElement, agenda.secondaryDisclosureToggle);
  const tab = { key: 'Tab', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  agenda.secondaryDisclosure.emit('keydown', tab);
  assert.equal(tab.defaultPrevented, false, 'Tab remains native');
  agenda.communityFilter.focus();
  assert.equal(agenda.secondaryDisclosure.open, true);
  agenda.secondaryZone.focus();
  assert.equal(agenda.document.activeElement, agenda.secondaryZone);
  assert.equal(agenda.secondaryDisclosure.open, true);

  agenda.themeToggle.focus();
  assert.equal(agenda.document.activeElement, agenda.themeToggle);
  assert.equal(agenda.themeToggle.hidden, false);
  assert.equal(agenda.secondaryDisclosure.open, true,
    'focus moving from an internal filter to the theme toggle does not close More options');
  agenda.themeToggle.click();
  agenda.document.dispatchEvent({ type: 'click', target: agenda.themeIcon });
  assert.equal(agenda.secondaryDisclosure.open, true,
    'a click whose target is inside the theme toggle does not close More options');

  agenda.modeFilter.focus();
  assert.equal(agenda.secondaryDisclosure.open, false,
    'moving focus out from the theme toggle to an outer control closes More options');
  assert.equal(agenda.document.activeElement, agenda.modeFilter,
    'closing More options does not steal focus from the outer control');
  assert.ok(focusoutTransitions.some(([target, relatedTarget]) => target === agenda.secondaryZone
    && relatedTarget === agenda.themeToggle));
  assert.ok(focusoutTransitions.some(([target, relatedTarget]) => target === agenda.themeToggle
    && relatedTarget === agenda.modeFilter));

  assert.deepEqual(agenda.children, cardsBefore, 'opening filters does not reorder or replace agenda occurrences');
  assert.equal(agenda.more.hidden, moreBefore);
  assert.equal(agenda.location.search, queryBefore);
  assert.equal(agenda.historyEntries.length, historyBefore);

  agenda.secondaryDisclosureToggle.click();
  agenda.secondaryDisclosureToggle.focus();
  const escape = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  agenda.secondaryDisclosure.emit('keydown', escape);
  assert.equal(agenda.secondaryDisclosure.open, false);
  assert.equal(agenda.document.activeElement, agenda.secondaryDisclosureToggle,
    'Escape closes the disclosure and restores focus to its summary');
  assert.equal(escape.defaultPrevented, true);

  agenda.secondaryDisclosureToggle.click();
  agenda.document.dispatchEvent({ type: 'click', target: agenda.modeFilter });
  assert.equal(agenda.secondaryDisclosure.open, false, 'an outside click closes the disclosure');
  assert.equal(agenda.document.activeElement, agenda.secondaryDisclosureToggle,
    'outside click closure does not move focus on its own');
  assert.equal(agenda.location.search, queryBefore);
  assert.equal(agenda.historyEntries.length, historyBefore);
  assert.deepEqual(agenda.children, cardsBefore);
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

test('day headings group visible occurrence starts across pagination, filters, and timezone changes', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const events = [
    {
      id: 'starts-before-week', mode: 'online',
      startsAt: '2026-10-02T20:00:00Z', endsAt: '2026-10-05T07:00:00Z',
    },
    ...Array.from({ length: 13 }, (_, index) => ({
      id: `monday-${index}`, mode: index % 2 ? 'in-person' : 'online',
      startsAt: new Date(Date.parse('2026-10-05T00:30:00Z') + index * 60_000).toISOString(),
      endsAt: '2026-10-05T05:30:00Z',
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `tuesday-${index}`, mode: index % 2 ? 'in-person' : 'online',
      startsAt: new Date(Date.parse('2026-10-06T12:00:00Z') + index * 60_000).toISOString(),
      endsAt: '2026-10-06T13:00:00Z',
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `wednesday-${index}`, mode: index % 2 ? 'in-person' : 'online',
      startsAt: new Date(Date.parse('2026-10-07T12:00:00Z') + index * 60_000).toISOString(),
      endsAt: '2026-10-07T13:00:00Z',
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      id: `thursday-${index}`, mode: index % 2 ? 'in-person' : 'online',
      startsAt: new Date(Date.parse('2026-10-08T12:00:00Z') + index * 60_000).toISOString(),
      endsAt: '2026-10-08T13:00:00Z',
    })),
  ];
  const agenda = createAgenda({
    count: events.length,
    now,
    events,
    filter: '?view=week&date=2026-10-05&tz=UTC',
  });

  assert.equal(agenda.cards.length, 24);
  assert.equal(agenda.cards[0].dataset.eventId, 'starts-before-week');
  assert.equal(agenda.cards[0].hidden, false,
    'a multi-day occurrence that starts before the period remains visible when it overlaps');
  assert.deepEqual(expectAgendaDayHeadings(agenda, 'UTC'), ['2026-10-02', '2026-10-05'],
    'the first page ends partway through Monday without adding a second day heading');

  agenda.more.click();
  assert.deepEqual(expectAgendaDayHeadings(agenda, 'UTC'), [
    '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
  ], 'revealing the second batch adds each later day heading once');

  agenda.modeFilter.value = 'online';
  agenda.modeFilter.emit('change');
  expectAgendaDayHeadings(agenda, 'UTC');

  agenda.zoneFilter.value = 'America/Argentina/Cordoba';
  agenda.zoneFilter.emit('change');
  const headings = expectAgendaDayHeadings(agenda, 'America/Argentina/Cordoba');
  assert.ok(headings.includes('2026-10-04'),
    'the UTC-midnight starts move to the prior civil day around local midnight');
  assert.equal(agenda.cards[0].hidden, false,
    'the occurrence is retained by overlap even though its start day precedes the selected week');
  assert.equal(agenda.cards[0].dayHeading.dataset.eventDay, '2026-10-02',
    'the heading uses the true local start day without clamping to the period boundary');

  agenda.communityFilter.value = 'community-co';
  agenda.communityFilter.emit('change');
  assert.equal(agenda.countLabel.textContent, '0 eventos');
  assert.equal(agenda.cards.every((card) => card.hidden), true,
    'no occurrence remains visible when the active community has no matching events');
  assert.deepEqual(expectAgendaDayHeadings(agenda, 'America/Argentina/Cordoba'), [],
    'an empty result has no visible or orphan day headings');
  const visibleOrphanCount = agenda.children
    .filter((card) => !card.hidden)
    .flatMap((card) => card.querySelectorAll('[data-event-day-heading]'))
    .filter((heading) => !heading.hidden).length;
  assert.equal(visibleOrphanCount, 0);
});

test('an empty period retains valid filters and clear changes only filters', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const agenda = createAgenda({
    count: 1,
    now,
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

test('route defaults yield to query overrides and online keeps the physical location inactive', () => {
  const agenda = createAgenda({
    count: 4,
    pathname: '/eventos/argentina/',
    defaultCountry: 'AR',
    defaultMode: 'in-person',
    filter: '?view=week&date=2026-10-05&tz=UTC&country=CO&city=CO%3ABogot%C3%A1&mode=in-person',
    events: [
      {
        id: 'organizer-ar-venue-co', mode: 'in-person', country: 'AR', venueCountry: 'CO',
        city: 'Bogotá', communities: 'community-ar',
      },
      {
        id: 'organizer-co-venue-ar', mode: 'hybrid', country: 'CO', venueCountry: 'AR',
        city: 'Córdoba', communities: 'community-co',
      },
      { id: 'remote-co', mode: 'online', country: 'CO', communities: 'community-co' },
      {
        id: 'organizer-ar-venue-ar', mode: 'in-person', country: 'AR', venueCountry: 'AR',
        city: 'Córdoba', communities: 'community-ar',
      },
    ],
  });

  assert.ok(agenda.modeFilter && agenda.countryFilter && agenda.cityFilter && agenda.communityFilter,
    'national routes keep every agenda filter control available');
  assert.equal(agenda.modeFilter.value, 'in-person');
  assert.equal(agenda.countryFilter.value, 'CO', 'the explicit country overrides the Argentina route default');
  assert.equal(agenda.cityFilter.value, 'CO:Bogotá');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId), ['organizer-ar-venue-co'],
    'the physical venue determines location even when its organizer is from another country');
  assert.doesNotMatch(agenda.pageHeading.textContent, /Argentina/u,
    'the page heading follows the query selection instead of the original route');
  assert.doesNotMatch(agenda.pageIntro.textContent, /Argentina/u,
    'the page introduction does not retain a contradictory route country');

  agenda.modeFilter.value = 'online';
  agenda.modeFilter.emit('change');
  assert.equal(agenda.countryFilter.value, 'CO', 'online retains the selected country');
  assert.equal(agenda.cityFilter.value, 'CO:Bogotá', 'online retains the selected city');
  assert.equal(agenda.countryFilter.disabled, true);
  assert.equal(agenda.cityFilter.disabled, true);
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId), [
    'organizer-co-venue-ar', 'remote-co',
  ], 'online includes remote and hybrid events globally, including the hybrid outside Bogotá');
  const remoteHybrid = agenda.cards.find((card) => card.dataset.eventId === 'organizer-co-venue-ar');
  assert.match(remoteHybrid.members[0].participationLabel.textContent, /participación remota/iu,
    'an out-of-location hybrid identifies the remote way it matched the online selection');
  const onlineUrl = new URL(agenda.historyEntries.at(-1).url, 'https://dondeaprendoaws.com');
  assert.equal(onlineUrl.pathname, '/eventos/argentina/', 'changing filters keeps the current route');
  assert.equal(onlineUrl.searchParams.get('country'), 'CO');
  assert.equal(onlineUrl.searchParams.get('city'), 'CO:Bogotá');
  assert.equal(onlineUrl.searchParams.get('mode'), 'online');

  agenda.modeFilter.value = 'in-person';
  agenda.modeFilter.emit('change');
  assert.equal(agenda.countryFilter.disabled, false);
  assert.equal(agenda.cityFilter.disabled, false);
  assert.equal(agenda.countryFilter.value, 'CO');
  assert.equal(agenda.cityFilter.value, 'CO:Bogotá');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId), ['organizer-ar-venue-co']);

  agenda.history.back();
  assert.equal(agenda.modeFilter.value, 'online');
  assert.equal(agenda.countryFilter.disabled, true);
  assert.equal(agenda.cityFilter.disabled, true);
  agenda.history.forward();
  assert.equal(agenda.modeFilter.value, 'in-person');
  assert.equal(agenda.countryFilter.value, 'CO');
  assert.equal(agenda.cityFilter.value, 'CO:Bogotá');
});

test('a query-overridden national route reveals an event fragment without switching routes', () => {
  const agenda = createAgenda({
    count: 1,
    pathname: '/eventos/argentina/',
    defaultCountry: 'AR',
    defaultMode: 'in-person',
    filter: '?view=week&date=2026-10-05&tz=UTC&country=CO&mode=online',
    hash: '#event-remote-co',
    events: [{ id: 'remote-co', mode: 'online', country: 'CO', communities: 'community-co' }],
  });

  assert.equal(agenda.cards[0].hidden, false,
    'the effective query selection controls fragment eligibility on a national route');
  assert.equal(agenda.document.activeElement, agenda.cards[0]);
  assert.equal(agenda.location.pathname, '/eventos/argentina/');
  assert.equal(agenda.location.hash, '#event-remote-co');
  const browserUrl = new URL(agenda.window.location.href);
  assert.equal(browserUrl.pathname, '/eventos/argentina/', 'a compatible query override does not trigger a global-route fallback');
  assert.equal(browserUrl.search, agenda.location.search);
  assert.equal(browserUrl.hash, '#event-remote-co');
});

test('an omitted query mode uses the route default and normalizes away its duplicate value', () => {
  const agenda = createAgenda({
    count: 3,
    pathname: '/eventos/online/',
    defaultMode: 'online',
    events: [
      { id: 'pure-online', mode: 'online', country: 'CO' },
      { id: 'remote-hybrid', mode: 'hybrid', country: 'AR', venueCountry: 'AR', city: 'Córdoba' },
      { id: 'physical-only', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba' },
    ],
  });

  assert.ok(agenda.modeFilter && agenda.countryFilter && agenda.cityFilter && agenda.communityFilter,
    'the online collection route also keeps every agenda filter control available');
  assert.equal(agenda.modeFilter.value, 'online');
  assert.equal(new URLSearchParams(agenda.location.search).has('mode'), false,
    'the route supplies its modality without storing a duplicate override');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId), [
    'pure-online', 'remote-hybrid',
  ]);
});

test('a valid city absent from the catalog is represented and incompatible cities are discarded', () => {
  const city = 'AR:San Juan';
  const agenda = createAgenda({ count: 0, filter: `?country=AR&city=${encodeURIComponent(city)}` });

  assert.equal(agenda.cityFilter.value, city);
  assert.equal(agenda.cityFilter.selectedOptions[0]?.value, city,
    'the selected city is represented by a selectable option even when no resource provides it');
  assert.equal(agenda.cityFilter.options.some((option) => option.value === city), true);

  const incompatible = createAgenda({ count: 0, filter: '?country=CO&city=AR%3ASan%20Juan' });
  assert.equal(incompatible.cityFilter.value, '');
  assert.equal(incompatible.cityFilter.options.some((option) => option.value === city), false);
});

test('a community without matching events remains selectable independently of physical country', () => {
  const agenda = createAgenda({
    count: 1,
    filter: '?country=AR&community=community-pe',
    communityOptions: [
      { value: 'community-ar', dataset: { eventCountry: 'AR', eventCity: 'Córdoba' } },
      { value: 'community-co', dataset: { eventCountry: 'CO', eventCity: 'Bogotá' } },
      { value: 'community-pe', dataset: { eventCountry: 'PE', eventCity: 'Lima' } },
    ],
    events: [{ id: 'argentina-event', mode: 'in-person', country: 'AR', venueCountry: 'AR', communities: 'community-ar' }],
  });

  assert.equal(agenda.countLabel.textContent, '0 eventos');
  assert.equal(agenda.communityFilter.value, 'community-pe');
  assert.equal(agenda.communityFilter.selectedOptions[0]?.value, 'community-pe');
  assert.equal(agenda.communityFilter.options[3].disabled, false);
  assert.equal(agenda.communityFilter.options[3].hidden, false);
  assert.equal(new URLSearchParams(agenda.location.search).get('community'), 'community-pe');
  assert.equal(agenda.empty.hidden, false);

  const reloaded = createAgenda({
    count: 1,
    filter: agenda.location.search,
    communityOptions: [
      { value: 'community-ar', dataset: { eventCountry: 'AR', eventCity: 'Córdoba' } },
      { value: 'community-co', dataset: { eventCountry: 'CO', eventCity: 'Bogotá' } },
      { value: 'community-pe', dataset: { eventCountry: 'PE', eventCity: 'Lima' } },
    ],
    events: [{ id: 'argentina-event', mode: 'in-person', country: 'AR', venueCountry: 'AR', communities: 'community-ar' }],
  });
  assert.equal(reloaded.communityFilter.value, 'community-pe');
  assert.equal(reloaded.countLabel.textContent, '0 eventos',
    'reload does not discard a published community identity when its period has no matching cards');
});

test('clear writes empty overrides for route defaults and reload preserves combined no-location selection', () => {
  const defaults = createAgenda({
    count: 0,
    pathname: '/eventos/argentina/',
    defaultCountry: 'AR',
    filter: '?view=month&date=2026-10-01&tz=UTC&country=AR&city=AR%3AC%C3%B3rdoba&community=community-ar',
  });
  defaults.includeEnded.checked = false;
  defaults.clear.click();
  let query = new URLSearchParams(defaults.location.search);
  assert.equal(query.has('country'), true);
  assert.equal(query.get('country'), '', 'country= clears the national route default');
  assert.equal(query.has('city'), false);
  assert.equal(query.has('community'), false);
  assert.equal(query.get('view'), 'month');
  assert.equal(query.get('date'), '2026-10-01');
  assert.equal(query.get('tz'), 'UTC');
  assert.equal(defaults.includeEnded.checked, false);

  const afterNationalReload = createAgenda({
    count: 0, pathname: '/eventos/argentina/', defaultCountry: 'AR',
    filter: defaults.location.search,
  });
  assert.equal(afterNationalReload.countryFilter.value, '');

  const online = createAgenda({
    count: 0,
    pathname: '/eventos/online/',
    defaultMode: 'online',
    filter: '?view=week&date=2026-10-05&tz=UTC&mode=online&country=AR&city=AR%3AC%C3%B3rdoba',
  });
  online.includeEnded.checked = false;
  online.clear.click();
  query = new URLSearchParams(online.location.search);
  assert.equal(query.has('mode'), true);
  assert.equal(query.get('mode'), '', 'mode= clears the online route default');
  assert.equal(query.has('country'), false);
  assert.equal(query.has('city'), false);
  assert.equal(query.get('view'), 'week');
  assert.equal(query.get('date'), '2026-10-05');
  assert.equal(query.get('tz'), 'UTC');
  assert.equal(online.includeEnded.checked, false);

  const afterOnlineReload = createAgenda({
    count: 0, pathname: '/eventos/online/', defaultMode: 'online',
    filter: online.location.search,
  });
  assert.equal(afterOnlineReload.modeFilter.value, '', 'reload honors the explicit combined-mode override');
});

test('navigation links replace only the destination facet and keep native anchor paths', () => {
  const agenda = createAgenda({
    count: 0,
    filter: '?utm_source=keep&view=week&date=2026-10-05&tz=UTC&mode=online&country=AR&city=AR%3AC%C3%B3rdoba&community=community-ar',
  });
  const [globalLink, argentinaLink, colombiaLink, onlineLink, inPersonLink] = agenda.routeLinks;
  const globalUrl = new URL(globalLink.href, 'https://dondeaprendoaws.com');
  assert.equal(globalUrl.pathname, '/eventos/');
  assert.equal(globalUrl.searchParams.get('country'), 'AR');
  assert.equal(globalUrl.searchParams.get('city'), 'AR:Córdoba');
  assert.equal(globalUrl.searchParams.get('mode'), 'online');
  assert.equal(globalUrl.searchParams.get('community'), 'community-ar');

  const argentinaUrl = new URL(argentinaLink.href, 'https://dondeaprendoaws.com');
  assert.equal(argentinaUrl.pathname, '/eventos/argentina/');
  assert.equal(argentinaUrl.searchParams.get('country') ?? 'AR', 'AR');
  assert.equal(argentinaUrl.searchParams.get('city'), 'AR:Córdoba');
  assert.equal(argentinaUrl.searchParams.get('community'), 'community-ar');
  assert.equal(argentinaUrl.searchParams.get('mode'), 'online');

  const colombiaUrl = new URL(colombiaLink.href, 'https://dondeaprendoaws.com');
  assert.equal(colombiaUrl.pathname, '/eventos/colombia/');
  assert.equal(colombiaUrl.searchParams.get('country') ?? 'CO', 'CO');
  assert.equal(colombiaUrl.searchParams.get('city'), null, 'a city incompatible with the destination country is cleared');
  assert.equal(colombiaUrl.searchParams.get('community'), 'community-ar',
    'a country destination preserves a community identity from another country');
  assert.equal(colombiaUrl.searchParams.get('mode'), 'online');

  const onlineUrl = new URL(onlineLink.href, 'https://dondeaprendoaws.com');
  assert.equal(onlineUrl.pathname, '/eventos/online/');
  assert.equal(onlineUrl.searchParams.get('country'), 'AR');
  assert.equal(onlineUrl.searchParams.get('city'), 'AR:Córdoba');
  assert.equal(onlineUrl.searchParams.get('community'), 'community-ar');
  assert.equal(onlineUrl.searchParams.get('mode') ?? 'online', 'online');

  const inPersonUrl = new URL(inPersonLink.href, 'https://dondeaprendoaws.com');
  assert.equal(inPersonUrl.pathname, '/eventos/presenciales/');
  assert.equal(inPersonUrl.searchParams.get('country'), 'AR');
  assert.equal(inPersonUrl.searchParams.get('city'), 'AR:Córdoba');
  assert.equal(inPersonUrl.searchParams.get('community'), 'community-ar');
  assert.equal(inPersonUrl.searchParams.get('mode') ?? 'in-person', 'in-person');

  for (const link of agenda.routeLinks) {
    const url = new URL(link.href, 'https://dondeaprendoaws.com');
    assert.equal(url.searchParams.get('view'), 'week');
    assert.equal(url.searchParams.get('date'), '2026-10-05');
    assert.equal(url.searchParams.get('tz'), 'UTC');
    assert.equal(url.searchParams.get('utm_source'), 'keep');
    assert.equal(link.listeners.has('click'), false, 'route links keep native anchor navigation');
  }
  assert.equal(colombiaLink.target, '_blank', 'the script preserves a route link opened in a new tab');
  assert.equal(colombiaLink.rel, 'noopener noreferrer');
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

test('a route default uses combined mode unless an explicit legacy mode overrides it', () => {
  const normal = createAgenda({
    count: 0,
    pathname: '/eventos/online/',
    defaultMode: 'online',
  });
  assert.equal(normal.modeFilter.value, 'online');
  assert.equal(normal.modeFilter.options.some((option) => option.value === 'hybrid'), false,
    'hybrid has no permanent primary-mode option');

  const legacyHybrid = createAgenda({
    count: 3,
    filter: '?mode=hybrid',
    events: [
      { id: 'old-physical', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba' },
      { id: 'old-hybrid', mode: 'hybrid', country: 'CO', venueCountry: 'CO', city: 'Bogotá' },
      { id: 'old-online', mode: 'online', country: 'CO' },
    ],
  });
  assert.equal(legacyHybrid.modeFilter.value, 'hybrid');
  assert.equal(legacyHybrid.modeFilter.selectedOptions[0]?.value, 'hybrid',
    'the legacy value remains represented while the old URL is active');
  assert.deepEqual(legacyHybrid.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId), ['old-hybrid']);
  assert.equal(new URLSearchParams(legacyHybrid.location.search).get('mode'), 'hybrid');
});

test('an out-of-period co-host fragment opens its start period and keeps compatible filters', () => {
  const agenda = createAgenda({
    count: 1,
    now: Date.parse('2026-10-05T12:00:00Z'),
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
    defaultCountry: 'AR',
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

test('expiry sends focus to the visible ended-events control when the focused card leaves selection', () => {
  const agenda = createAgenda({ count: 1, expiringFirst: true, includeEnded: false });
  agenda.cards[0].registration.focus();
  agenda.advanceTime(501);

  assert.equal(agenda.fireNextTimer(), true);
  assert.equal(agenda.cards[0].hidden, true, 'the ended card leaves selection with the checkbox off');
  assert.equal(agenda.document.activeElement, agenda.includeEnded,
    'focus lands on a stable visible control after its card disappears');
  assert.equal(agenda.includeEnded.checked, false, 'moving focus does not toggle the checkbox');
  assert.equal(agenda.includeEnded.focusCalls.at(-1)?.preventScroll, true,
    'the fallback does not scroll the page');
});

test('expiry sends focus to the visible ended-events control when Show More disappears', () => {
  const agenda = createAgenda({ count: 13, expiringFirst: true, includeEnded: false });
  assert.equal(agenda.more.hidden, false);
  agenda.more.focus();
  agenda.advanceTime(501);

  assert.equal(agenda.fireNextTimer(), true);
  assert.equal(agenda.more.hidden, true, 'the final page control disappears when only twelve events remain');
  assert.equal(agenda.document.activeElement, agenda.includeEnded,
    'focus lands on a stable visible control after Show More disappears');
  assert.equal(agenda.includeEnded.checked, false, 'moving focus does not toggle the checkbox');
  assert.equal(agenda.includeEnded.focusCalls.at(-1)?.preventScroll, true,
    'the fallback does not scroll the page');
});

test('expiry leaves focus on the card when ended events remain included', () => {
  const agenda = createAgenda({ count: 1, expiringFirst: true, includeEnded: true });
  const focusedAction = agenda.cards[0].registration;
  focusedAction.focus();
  agenda.advanceTime(501);

  assert.equal(agenda.fireNextTimer(), true);
  assert.equal(agenda.cards[0].hidden, false);
  assert.equal(agenda.includeEnded.checked, true);
  assert.equal(agenda.document.activeElement, focusedAction,
    'an included event remains focused when its state changes to Finalizado');
});

test('expiry does not steal focus from an unrelated agenda control', () => {
  const agenda = createAgenda({ count: 1, expiringFirst: true, includeEnded: false });
  agenda.modeFilter.focus();
  agenda.advanceTime(501);

  assert.equal(agenda.fireNextTimer(), true);
  assert.equal(agenda.cards[0].hidden, true);
  assert.equal(agenda.document.activeElement, agenda.modeFilter,
    'an automatic refresh leaves focus on the filter that was already focused');
  assert.equal(agenda.includeEnded.focusCalls.length, 0);
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

test('co-host replacement preserves disclosure state and focus on its summary or calendar action', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  for (const action of ['detailToggle', 'calendar']) {
    const agenda = createAgenda({
      count: 1,
      now,
      filter: '?view=week&date=2026-10-05&tz=UTC',
      events: [{
        id: 'cohost-current-day',
        aliasIds: 'cohost-next-day',
        members: [
          { startsAt: '2026-10-05T11:00:00Z', endsAt: now + 500 },
          { startsAt: '2026-10-06T00:30:00Z', endsAt: '2026-10-06T02:00:00Z' },
        ],
      }],
    });
    const [current, next] = agenda.cards[0].members;
    current.details.open = true;
    current[action].focus();

    agenda.advanceTime(501);
    assert.equal(agenda.fireNextTimer(), true);

    assert.equal(current.hidden, true);
    assert.equal(next.hidden, false);
    assert.equal(next.details.open, true, 'the replacement keeps the visitor’s expanded local details');
    assert.equal(agenda.document.activeElement, next[action],
      `${action} focus moves to the corresponding control in the co-host replacement`);
    assert.equal(agenda.cards[0].dayHeading.dataset.eventDay, '2026-10-06',
      'the grouped heading follows the replacement occurrence start in the selected zone');
  }
});

test('co-host disclosure state follows the visible representative when focus is outside the card', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const agenda = createAgenda({
    count: 1,
    now,
    filter: '?view=week&date=2026-10-05&tz=UTC',
    events: [{
      id: 'current-outside-focus',
      aliasIds: 'future-outside-focus',
      members: [
        { startsAt: '2026-10-05T11:00:00Z', endsAt: now + 500 },
        { startsAt: '2026-10-06T00:30:00Z', endsAt: '2026-10-06T02:00:00Z' },
      ],
    }],
  });
  const [current, future] = agenda.cards[0].members;
  current.details.open = true;
  agenda.modeFilter.focus();

  agenda.advanceTime(501);
  assert.equal(agenda.fireNextTimer(), true);
  assert.equal(current.hidden, true);
  assert.equal(future.hidden, false);
  assert.equal(future.details.open, true, 'open details follow the replacement without requiring focus inside it');
  assert.equal(agenda.document.activeElement, agenda.modeFilter, 'the refresh leaves unrelated focus in place');

  future.details.open = false;
  agenda.advanceTime(-501);
  agenda.refreshVisibility();
  assert.equal(current.hidden, false);
  assert.equal(future.hidden, true);
  assert.equal(current.details.open, false, 'a later closed state replaces stale state from an earlier representative');
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
  assert.deepEqual(expectAgendaDayHeadings(agenda, 'UTC'), ['2026-10-05'],
    'revealing an occurrence beyond the first batch keeps one day heading for the entire visible group');
});

test('community identity stays selected across country changes and history', () => {
  const agenda = createAgenda({
    count: 3,
    filter: '?country=AR&community=community-co',
    events: [
      { id: 'community-co-in-ar', mode: 'hybrid', country: 'CO', venueCountry: 'AR', city: 'Córdoba', communities: 'community-co' },
      { id: 'community-co-in-co', mode: 'in-person', country: 'CO', venueCountry: 'CO', city: 'Bogotá', communities: 'community-co' },
      { id: 'community-ar-in-ar', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba', communities: 'community-ar' },
    ],
  });

  assert.equal(agenda.countryFilter.value, 'AR');
  assert.equal(agenda.communityFilter.value, 'community-co',
    'a community remains selected even when its organizer country differs from the physical location');
  assert.equal(agenda.communityFilter.options[2].disabled, false);
  assert.equal(agenda.cards[0].hidden, false, 'physical Argentina location and Colombia community can match together');
  assert.equal(agenda.cards[1].hidden, true);
  assert.equal(agenda.cards[2].hidden, true);

  agenda.countryFilter.value = 'CO';
  agenda.countryFilter.emit('change');
  assert.equal(agenda.communityFilter.value, 'community-co', 'changing physical country preserves community identity');
  assert.equal(agenda.communityFilter.options[1].disabled, false);
  assert.equal(agenda.communityFilter.options[2].disabled, false);
  assert.equal(agenda.cards[0].hidden, false, 'combined attendance retains the hybrid through global remote access');
  assert.equal(agenda.cards[1].hidden, false);
  assert.equal(agenda.cards[2].hidden, true);
  const communityUrl = new URL(agenda.historyEntries.at(-1).url, 'https://dondeaprendoaws.com');
  assert.equal(communityUrl.pathname, '/eventos/');
  assert.equal(communityUrl.searchParams.get('country'), 'CO');
  assert.equal(communityUrl.searchParams.get('community'), 'community-co');
  assert.ok(communityUrl.searchParams.has('view'));
  assert.ok(communityUrl.searchParams.has('date'));
  assert.ok(communityUrl.searchParams.has('tz'));

  agenda.history.back();
  assert.equal(agenda.countryFilter.value, 'AR', 'back restores the prior physical country');
  assert.equal(agenda.communityFilter.value, 'community-co', 'back restores the independent community selection');
  assert.equal(agenda.cards[0].hidden, false);
  assert.equal(agenda.cards[1].hidden, true);

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

test('all route types keep the full primary location and community controls', () => {
  const agenda = createAgenda({
    count: 3,
    pathname: '/eventos/argentina/',
    defaultCountry: 'AR',
    communityOptions: [
      { value: 'community-girls', dataset: { eventCountry: 'AR', eventCity: 'Córdoba' } },
      { value: 'community-co', dataset: { eventCountry: 'CO', eventCity: 'Bogotá' } },
    ],
    events: [
      { id: 'event-0', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba', communities: 'community-girls' },
      { id: 'event-1', mode: 'in-person', country: 'CO', venueCountry: 'CO', city: 'Bogotá', communities: 'community-co' },
      { id: 'event-2', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba', communities: 'community-girls' },
    ],
  });

  assert.ok(agenda.modeFilter);
  assert.ok(agenda.countryFilter, 'a national route still offers the location country control');
  assert.ok(agenda.cityFilter, 'a national route still offers the city control');
  assert.ok(agenda.communityFilter);
  assert.equal(agenda.countryFilter.value, 'AR', 'an omitted country query uses the national route default');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden).map((card) => card.dataset.eventId), ['event-0', 'event-2']);
  assert.equal(agenda.communityFilter.options[1].value, 'community-girls');
  assert.equal(agenda.communityFilter.options[2].disabled, false,
    'resource communities remain available independently of the route country');
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
  assert.equal(clearedNationalUrl.pathname, '/eventos/argentina/');
  assert.equal(clearedNationalUrl.searchParams.get('country'), '', 'Clear explicitly overrides the national default location');
  assert.equal(clearedNationalUrl.searchParams.has('community'), false);
  assert.equal(clearedNationalUrl.searchParams.has('view'), true);
  assert.equal(clearedNationalUrl.searchParams.has('date'), true);
  assert.equal(clearedNationalUrl.searchParams.has('tz'), true);
  agenda.history.back();
  assert.equal(agenda.communityFilter.value, 'community-girls', 'Back restores the first community selection.');
  assert.equal(agenda.communityFilter.options[1].value, 'community-girls');
});

test('the client represents a valid country and city even when neither appears in the catalog', () => {
  const agenda = createAgenda({ count: 0, filter: '?country=US&city=US%3AAnchorage' });

  assert.equal(agenda.countryFilter.value, 'US');
  assert.equal(agenda.countryFilter.options.some((option) => option.value === 'US'), true);
  assert.equal(agenda.cityFilter.value, 'US:Anchorage');
  assert.equal(agenda.cityFilter.options.some((option) => option.value === 'US:Anchorage'), true);
  const query = new URLSearchParams(agenda.location.search);
  assert.equal(query.get('country'), 'US');
  assert.equal(query.get('city'), 'US:Anchorage');
  assert.equal(agenda.countLabel.textContent, '0 eventos');
});

test('the client uses a published community city when the event has no explicit city', () => {
  const agenda = createAgenda({
    count: 1,
    filter: '?mode=in-person&country=CO&city=CO%3ABogot%C3%A1&community=community-co',
    events: [{
      id: 'community-city-fallback', mode: 'in-person', country: 'CO', communities: 'community-co',
    }],
  });

  assert.equal(agenda.countLabel.textContent, '1 evento');
  assert.equal(agenda.cards[0].hidden, false,
    'an absent raw member city is left undefined so effectiveEventLocation can use the published community city');
});

test('an implicit national location default falls back globally for an incompatible event fragment', () => {
  const agenda = createAgenda({
    count: 1,
    pathname: '/eventos/argentina/',
    defaultCountry: 'AR',
    hash: '#event-physical-co',
    events: [{
      id: 'physical-co', mode: 'in-person', country: 'CO', venueCountry: 'CO',
      city: 'Bogotá', communities: 'community-co',
    }],
  });
  const fallback = new URL(agenda.window.location.href, 'https://dondeaprendoaws.com');

  assert.equal(fallback.pathname, '/eventos/');
  assert.equal(fallback.hash, '#event-physical-co');
  assert.equal(fallback.searchParams.has('country'), false,
    'the incompatible implicit route location is cleared on the global destination');
  assert.equal(fallback.searchParams.has('view'), true);
  assert.equal(fallback.searchParams.has('date'), true);
  assert.equal(fallback.searchParams.has('tz'), true);
});

test('an implicit online default falls back globally for a physical-only event fragment', () => {
  const agenda = createAgenda({
    count: 1,
    pathname: '/eventos/online/',
    defaultMode: 'online',
    hash: '#event-physical-ar',
    events: [{
      id: 'physical-ar', mode: 'in-person', country: 'AR', venueCountry: 'AR',
      city: 'Córdoba', communities: 'community-ar',
    }],
  });
  const fallback = new URL(agenda.window.location.href, 'https://dondeaprendoaws.com');

  assert.equal(fallback.pathname, '/eventos/');
  assert.equal(fallback.hash, '#event-physical-ar');
  assert.equal(fallback.searchParams.has('mode'), false,
    'the incompatible implicit online default is cleared on the global destination');
  assert.equal(fallback.searchParams.has('view'), true);
  assert.equal(fallback.searchParams.has('date'), true);
  assert.equal(fallback.searchParams.has('tz'), true);
});

function preparedShareText(link) {
  const intent = new URL(link.href, 'https://dondeaprendoaws.com');
  assert.deepEqual([...intent.searchParams.keys()], ['text'],
    `${intent.hostname} carries the complete prepared post in one text parameter`);
  const text = intent.searchParams.get('text');
  assert.ok(text, `${intent.hostname} link carries prepared post text`);
  return text;
}

function embeddedAgendaUrl(link) {
  const intent = new URL(link.href, 'https://dondeaprendoaws.com');
  const text = preparedShareText(link);
  const value = text.split('\n').at(-1);
  assert.ok(value, `${intent.hostname} ends the prepared post with its agenda URL`);
  assert.equal(text.split(value).length - 1, 1,
    `${intent.hostname} includes the exact final agenda URL once in the post body`);
  const agendaUrl = new URL(value);
  assert.equal(agendaUrl.href, value, 'the extracted agenda URL is preserved exactly as serialized');
  assert.equal(agendaUrl.pathname, '/eventos/', 'the prepared body links to the global agenda');
  assert.equal(agendaUrl.hash, '', 'the prepared body does not carry an event fragment');
  assert.equal(agendaUrl.searchParams.has('includeEnded'), false,
    'the prepared URL does not serialize the sender checkbox');
  return agendaUrl;
}

function activateShareMenu(agenda) {
  const enter = { key: 'Enter', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  agenda.shareToggle.emit('keydown', enter);
  if (!enter.defaultPrevented) agenda.shareToggle.click();
}

function makeClipboard(writeText) {
  return { writeText };
}

async function captureShareActions(agenda) {
  activateShareMenu(agenda);
  const xText = preparedShareText(agenda.xShareLink);
  const linkedinText = preparedShareText(agenda.linkedinShareLink);
  const xUrl = embeddedAgendaUrl(agenda.xShareLink);
  const linkedinUrl = embeddedAgendaUrl(agenda.linkedinShareLink);
  assert.equal(xUrl.href, linkedinUrl.href, 'both social actions use the same current agenda selection');
  agenda.copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  return { xText, linkedinText, url: xUrl, copied: agenda.clipboardCalls.at(-1)?.[0] };
}

test('X and LinkedIn open native safe links with the approved prepared posts and complete global URL', async () => {
  const agenda = createAgenda({
    count: 3,
    filter: '?view=week&date=2026-10-19&tz=America%2FArgentina%2FCordoba&country=AR&city=AR%3AC%C3%B3rdoba',
    events: [
      { id: 'share-one', title: 'Arquitecturas serverless', mode: 'online', startsAt: '2026-10-21T21:00:00Z', endsAt: '2026-10-21T22:00:00Z', registrationUrl: 'https://example.test/registro/serverless' },
      { id: 'share-two', title: 'Meetup AWS Córdoba', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba', startsAt: '2026-10-22T22:00:00Z', endsAt: '2026-10-22T23:00:00Z', registrationUrl: 'https://example.test/registro/meetup' },
      { id: 'share-three', title: 'Seguridad en AWS', mode: 'online', startsAt: '2026-10-24T14:00:00Z', endsAt: '2026-10-24T15:00:00Z', registrationUrl: 'https://example.test/registro/seguridad' },
    ],
    clipboard: makeClipboard(async () => {}),
  });

  assert.equal(agenda.shareControls.hidden, false, 'JavaScript enables the server-hidden share controls');
  assert.equal(agenda.shareMenu.tagName, 'DETAILS');
  assert.equal(agenda.shareToggle.tagName, 'SUMMARY');
  activateShareMenu(agenda);
  assert.equal(agenda.shareMenu.open, true, 'the native summary control opens the menu with keyboard activation');
  assert.equal(agenda.countLabel.textContent, '3 eventos', 'the user example fixture selects all three expected events');

  const x = new URL(agenda.xShareLink.href, 'https://dondeaprendoaws.com');
  const linkedin = new URL(agenda.linkedinShareLink.href);
  assert.equal(x.origin, 'https://x.com');
  assert.equal(x.pathname, '/intent/tweet');
  assert.equal(linkedin.origin, 'https://www.linkedin.com');
  assert.equal(linkedin.pathname, '/sharing/share-offsite/');
  for (const link of [agenda.xShareLink, agenda.linkedinShareLink]) {
    assert.equal(link.target, '_blank');
    assert.match(link.rel, /\bnoopener\b/u);
    assert.match(link.rel, /\bnoreferrer\b/u);
    assert.doesNotMatch(link.href, /^javascript:/iu);
  }
  const sharedUrl = embeddedAgendaUrl(agenda.xShareLink);
  const xText = preparedShareText(agenda.xShareLink);
  const linkedinText = preparedShareText(agenda.linkedinShareLink);
  assert.equal(sharedUrl.href, embeddedAgendaUrl(agenda.linkedinShareLink).href);
  assert.equal(xText, `Agenda de eventos para aprender AWS, 19-25 de octubre. 3 eventos presenciales en Córdoba, Argentina, y online.\n\nAgenda completa e inscripciones:\n${sharedUrl.href}`);
  assert.equal(linkedinText, `Eventos para aprender AWS, del 19 al 25 de octubre. Presenciales en Córdoba, Argentina, y opciones online.\n- Mié 21/10, 18:00: Arquitecturas serverless - Online\n- Jue 22/10, 19:00: Meetup AWS Córdoba - Presencial\n- Sáb 24/10, 11:00: Seguridad en AWS - Online\n\nHorarios de Córdoba, Argentina (UTC-3).\n\nDetalles e inscripciones:\n${sharedUrl.href}`);
  assert.deepEqual([...x.searchParams.keys()], ['text'], 'X receives the body and URL together, without a separate url parameter');
  assert.deepEqual([...linkedin.searchParams.keys()], ['text'], 'LinkedIn receives the body and URL together, without a separate url parameter');
  assert.equal(sharedUrl.searchParams.get('view'), 'week');
  assert.equal(sharedUrl.searchParams.get('date'), '2026-10-19');
  assert.equal(sharedUrl.searchParams.get('tz'), 'America/Argentina/Cordoba');
  assert.equal(sharedUrl.searchParams.get('country'), 'AR');
  assert.equal(sharedUrl.searchParams.get('city'), 'AR:Córdoba');

  const beforeUrl = agenda.location.search;
  const beforeHistory = agenda.historyEntries.length;
  agenda.xShareLink.click();
  activateShareMenu(agenda);
  agenda.linkedinShareLink.click();
  assert.equal(agenda.clipboardCalls.length, 0, 'social links do not wait for or invoke clipboard access');
  assert.equal(agenda.windowOpenCalls.length, 0, 'native anchors open the destination without window.open');
  assert.equal(agenda.location.search, beforeUrl, 'opening a composer does not change the agenda query');
  assert.equal(agenda.historyEntries.length, beforeHistory);

  activateShareMenu(agenda);
  agenda.copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(agenda.clipboardCalls.length, 1);
  assert.equal(agenda.clipboardCalls[0][0], `*Agenda eventos AWS, 19-25 de octubre*\nPresenciales en Córdoba, Argentina, y online.\nHorarios de Córdoba, Argentina (UTC-3).\n\n*Mié 21/10, 18:00*\nArquitecturas serverless\nOnline\nhttps://example.test/registro/serverless\n\n*Jue 22/10, 19:00*\nMeetup AWS Córdoba\nPresencial: Córdoba, Argentina\nhttps://example.test/registro/meetup\n\n*Sáb 24/10, 11:00*\nSeguridad en AWS\nOnline\nhttps://example.test/registro/seguridad\n\nConsultar la agenda completa:\n${sharedUrl.href}`);
});

test('prepared X, LinkedIn and copy data follows period, filters, checkbox, expiry and history changes', async () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const events = [
    { id: 'current-cordoba', title: 'Evento presencial Córdoba', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba', communities: 'community-ar', startsAt: '2026-10-21T15:00:00Z', endsAt: '2026-10-21T16:00:00Z' },
    { id: 'closing-online', title: 'Cierre de hoy', mode: 'online', country: 'AR', communities: 'community-ar', startsAt: '2026-10-20T11:00:00Z', endsAt: '2026-10-20T12:00:30Z' },
    { id: 'current-colombia', title: 'Evento remoto Colombia', mode: 'online', country: 'CO', communities: 'community-co', startsAt: '2026-10-22T15:00:00Z', endsAt: '2026-10-22T16:00:00Z' },
    { id: 'next-buenos-aires', title: 'Presencial Buenos Aires', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Buenos Aires', communities: 'community-ar', startsAt: '2026-10-27T15:00:00Z', endsAt: '2026-10-27T16:00:00Z' },
  ];
  const agenda = createAgenda({
    count: events.length,
    now,
    filter: '?view=week&date=2026-10-19&tz=UTC',
    events,
    clipboard: makeClipboard(async () => {}),
  });
  const assertActions = async (expectedTitles, absentTitles = []) => {
    const actions = await captureShareActions(agenda);
    assert.ok(actions.copied, 'Copy writes the current selection as text');
    assert.ok(actions.copied.endsWith(`Consultar la agenda completa:\n${actions.url.href}`),
      'Copy ends with the exact same global agenda URL as the social posts');
    assert.equal(actions.copied.split(actions.url.href).length - 1, 1,
      'Copy includes the selected agenda URL once');
    assert.match(actions.xText, new RegExp(`\\b${expectedTitles.length}\\s+evento(?:s)?\\b`, 'u'),
      'X summarizes the current full selection count');
    for (const title of expectedTitles) {
      assert.ok(actions.linkedinText.includes(title), `LinkedIn includes ${title} from the current selection`);
      assert.ok(actions.copied.includes(title), `Copy includes ${title} from the current selection`);
      assert.ok(!actions.xText.includes(title), `X keeps its approved summary short instead of enumerating ${title}`);
    }
    for (const title of absentTitles) {
      assert.ok(!actions.linkedinText.includes(title), `LinkedIn excludes ${title} outside the current selection`);
      assert.ok(!actions.copied.includes(title), `Copy excludes ${title} outside the current selection`);
    }
    return actions;
  };

  assert.equal(agenda.shareMenu.open, false, 'the initial share menu is closed');
  assert.equal(agenda.countLabel.textContent, '3 eventos', 'the initial week selects its three in-period events');
  let actions = await assertActions(['Evento presencial Córdoba', 'Cierre de hoy', 'Evento remoto Colombia'], ['Presencial Buenos Aires']);
  assert.equal(agenda.shareMenu.open, false, 'copy closes the menu after capturing the prepared actions');
  assert.equal(actions.url.searchParams.get('view'), 'week');
  assert.equal(actions.url.searchParams.get('date'), '2026-10-19');

  agenda.nextPeriod.click();
  assert.equal(agenda.countLabel.textContent, '1 evento', 'the next week selects only its in-period event');
  actions = await assertActions(['Presencial Buenos Aires'], ['Evento presencial Córdoba', 'Cierre de hoy', 'Evento remoto Colombia']);
  assert.equal(actions.url.searchParams.get('date'), '2026-10-26', 'the prepared body follows the next week');
  for (const text of [actions.xText, actions.linkedinText, actions.copied]) {
    assert.match(text.split('\n')[0], /octubre.*noviembre/iu,
      'all three headings name both months of the selected 26 October–1 November week');
  }

  agenda.viewButtons[1].click();
  assert.equal(agenda.countLabel.textContent, '4 eventos', 'the month contains all four fixtures');
  actions = await assertActions(events.map(({ title }) => title));
  assert.equal(actions.url.searchParams.get('view'), 'month', 'the prepared body follows the month tab');
  assert.equal(actions.url.searchParams.get('date'), '2026-10-26');
  for (const text of [actions.xText, actions.linkedinText, actions.copied]) {
    assert.match(text.split('\n')[0], /octubre de 2026/iu,
      'all three headings follow the selected month instead of retaining the prior week');
  }

  agenda.zoneFilter.value = 'America/Bogota';
  agenda.zoneFilter.emit('change');
  agenda.countryFilter.value = 'AR';
  agenda.countryFilter.emit('change');
  agenda.cityFilter.value = 'AR:Córdoba';
  agenda.cityFilter.emit('change');
  agenda.communityFilter.value = 'community-ar';
  agenda.communityFilter.emit('change');
  actions = await assertActions(['Evento presencial Córdoba', 'Cierre de hoy'], ['Evento remoto Colombia', 'Presencial Buenos Aires']);
  assert.equal(actions.url.searchParams.get('tz'), 'America/Bogota');
  assert.equal(actions.url.searchParams.get('country'), 'AR');
  assert.equal(actions.url.searchParams.get('city'), 'AR:Córdoba');
  assert.equal(actions.url.searchParams.get('community'), 'community-ar');
  assert.match(actions.linkedinText, /Mié 21\/10, 10:00/u,
    'event dates and times use the selected zone');
  assert.match(actions.copied, /10:00/u, 'Copy uses the same selected zone');

  agenda.clear.click();
  actions = await assertActions(events.map(({ title }) => title));
  assert.equal(actions.url.searchParams.has('community'), false);
  agenda.communityFilter.value = 'community-co';
  agenda.communityFilter.emit('change');
  actions = await assertActions(['Evento remoto Colombia'], ['Evento presencial Córdoba', 'Cierre de hoy', 'Presencial Buenos Aires']);
  assert.equal(actions.url.searchParams.get('community'), 'community-co');

  agenda.history.back();
  actions = await assertActions(events.map(({ title }) => title));
  assert.equal(actions.url.searchParams.has('community'), false,
    'Back updates both prepared posts and Copy to the restored unfiltered selection');
  agenda.history.back();
  actions = await assertActions(['Evento presencial Córdoba', 'Cierre de hoy'], ['Evento remoto Colombia', 'Presencial Buenos Aires']);
  assert.equal(actions.url.searchParams.get('community'), 'community-ar',
    'another Back restores the prior community, location and prepared selection');

  const urlBeforeExpiry = actions.url.href;
  agenda.advanceTime(40_000);
  assert.equal(agenda.fireNextTimer(), true, 'the scheduled transition refreshes an event that just ended');
  actions = await assertActions(['Evento presencial Córdoba', 'Cierre de hoy']);
  assert.match(actions.linkedinText, /Finalizado/u, 'LinkedIn marks the now-ended event');
  assert.match(actions.copied, /Cierre de hoy[\s\S]*Finalizado/u, 'Copy marks the same event as finalized');

  agenda.includeEnded.checked = false;
  agenda.includeEnded.emit('change');
  actions = await assertActions(['Evento presencial Córdoba'], ['Cierre de hoy']);
  assert.equal(actions.url.href, urlBeforeExpiry, 'checkbox changes update prepared content without entering the shared URL');
  assert.equal(actions.url.searchParams.has('includeEnded'), false);

  const receiver = createAgenda({
    count: events.length,
    now: now + 40_000,
    pathname: actions.url.pathname,
    filter: actions.url.search,
    events,
    clipboard: makeClipboard(async () => {}),
  });
  assert.equal(receiver.includeEnded.checked, true, 'a recipient always reopens with finalized events included');
  const receivedActions = await captureShareActions(receiver);
  assert.ok(receivedActions.linkedinText.includes('Cierre de hoy'));
  assert.match(receivedActions.copied, /Cierre de hoy[\s\S]*Finalizado/u);
});

test('Copy writes the complete unpaginated plain-text selection, including a remote foreign hybrid', async () => {
  let resolveCopy;
  const pendingCopy = new Promise((resolve) => { resolveCopy = resolve; });
  const events = Array.from({ length: 14 }, (_, index) => ({
    id: `complete-share-${index + 1}`,
    title: `Agenda completa ${index + 1}`,
    mode: index === 13 ? 'hybrid' : 'online',
    country: index === 13 ? 'CO' : 'AR',
    venueCountry: index === 13 ? 'CO' : '',
    city: index === 13 ? 'Bogotá' : '',
    communities: index === 13 ? 'community-co' : 'community-ar',
    startsAt: `2026-10-${String(6 + (index % 5)).padStart(2, '0')}T15:${String(index).padStart(2, '0')}:00Z`,
    endsAt: `2026-10-${String(6 + (index % 5)).padStart(2, '0')}T16:${String(index).padStart(2, '0')}:00Z`,
    registrationUrl: `https://example.test/registro/${index + 1}`,
  }));
  const agenda = createAgenda({
    count: events.length,
    filter: '?view=week&date=2026-10-05&tz=America%2FBogota&mode=online&country=AR&city=AR%3AC%C3%B3rdoba',
    events,
    clipboard: makeClipboard(() => pendingCopy),
  });

  assert.equal(agenda.countLabel.textContent, '14 eventos');
  assert.equal(agenda.cards.filter((card) => !card.hidden).length, 12, 'the rendered list remains paginated');
  assert.equal(agenda.more.hidden, false);
  const linkedinText = preparedShareText(agenda.linkedinShareLink);
  const xText = preparedShareText(agenda.xShareLink);
  const preparedUrl = embeddedAgendaUrl(agenda.linkedinShareLink);
  assert.equal(preparedUrl.href, embeddedAgendaUrl(agenda.xShareLink).href);
  assert.match(xText, /\b14\s+eventos\b/u);
  for (const event of events) {
    assert.ok(linkedinText.includes(event.title), `LinkedIn includes the unpaginated result ${event.title}`);
    assert.ok(!xText.includes(event.title), 'X summarizes instead of enumerating events');
  }
  activateShareMenu(agenda);
  agenda.copyButton.click();

  assert.equal(agenda.clipboardCalls.length, 1, 'one click calls writeText immediately, before the promise settles');
  const copied = agenda.clipboardCalls[0][0];
  assert.equal(typeof copied, 'string');
  assert.ok(copied.length > 500, 'the output is the full agenda, not a compact preview');
  for (const event of events) {
    assert.ok(copied.includes(event.title), `The copied agenda contains ${event.title}, including results beyond the first page.`);
    assert.ok(copied.includes(event.registrationUrl), `The copied agenda preserves ${event.id}'s registration URL.`);
  }
  assert.match(copied, /Online\s+\(evento híbrido\)|participación remota/iu,
    'a hybrid venue in Colombia reached through Solo online is identified as remote participation');
  assert.doesNotMatch(copied, /^(?:Presencial|Participación presencial|Ubicación presencial):.*Bogotá/imu,
    'remote hybrid participation does not present Bogotá as its physical venue');
  assert.match(copied, /Bogotá.*UTC-5|America\/Bogota/u, 'the copied schedule identifies its selected time zone');
  assert.doesNotMatch(copied, /<[^>]+>/u, 'clipboard content is plain text');
  assert.doesNotMatch(agenda.shareStatus.textContent, /copiad|se copió/iu,
    'the interface does not report success while the write is pending');
  assert.equal(agenda.copyButton.disabled, true, 'only the Copy action is disabled while one write is pending');
  assert.equal(agenda.modeFilter.disabled, false);
  assert.equal(agenda.xShareLink.disabled, undefined);
  assert.equal(agenda.linkedinShareLink.disabled, undefined);
  assert.deepEqual(agenda.shareControls.children, [agenda.shareMenu, agenda.shareStatus],
    'copy does not reveal an intermediate preview or textarea');

  resolveCopy();
  await pendingCopy;
  assert.match(agenda.shareStatus.textContent, /copiad|se copió/iu,
    'success is announced only after writeText resolves');
  assert.equal(agenda.copyButton.disabled, false);
  assert.equal(agenda.shareMenu.open, false);
  assert.equal(agenda.document.activeElement, agenda.shareToggle, 'successful copy closes the menu and returns focus');
});

test('an oversized LinkedIn post replaces every event line with the approved total summary while Copy stays complete', async () => {
  const events = Array.from({ length: 40 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const title = `Evento largo ${number} - Aprendizaje de servicios y arquitectura de AWS con ejercicios prácticos guiados para equipos de desarrollo`;
    const day = String(10 + Math.floor(index / 2)).padStart(2, '0');
    return {
      id: `oversized-${number}`,
      title,
      mode: 'online',
      startsAt: `2026-10-${day}T15:00:00Z`,
      endsAt: `2026-10-${day}T16:00:00Z`,
      registrationUrl: `https://example.test/registro/oversized-${number}`,
    };
  });
  const agenda = createAgenda({
    count: events.length,
    filter: '?view=month&date=2026-10-05&tz=UTC&mode=online',
    events,
    clipboard: makeClipboard(async () => {}),
  });

  assert.equal(agenda.countLabel.textContent, '40 eventos');
  assert.equal(agenda.cards.filter((card) => !card.hidden).length, 12,
    'the visible page limit does not reduce either prepared output');
  assert.ok(events.reduce((total, event) => total + event.title.length, 0) > 3_000,
    'the full event titles alone exceed the approved conservative LinkedIn body limit');
  const actions = await captureShareActions(agenda);
  assert.match(actions.linkedinText, /\b40 eventos\b/u, 'the LinkedIn fallback reports the full selected count');
  assert.match(actions.linkedinText, /La lista completa de eventos, horarios e inscripciones:/u,
    'the LinkedIn fallback links to the complete agenda');
  assert.match(actions.linkedinText, /UTC/u, 'the LinkedIn fallback preserves the selected time zone');
  assert.match(actions.xText, /\b40\s+eventos\b/u);
  for (const event of events) {
    assert.ok(!actions.linkedinText.includes(event.title),
      'an oversized LinkedIn body does not keep an arbitrary prefix or sample of the events');
    assert.ok(!actions.xText.includes(event.title), 'X does not enumerate event titles');
    assert.ok(actions.copied.includes(event.title), `Copy retains the complete title ${event.title}`);
    assert.ok(actions.copied.includes(event.registrationUrl), `Copy retains ${event.id} registration URL`);
  }
  assert.ok(actions.copied.endsWith(`Consultar la agenda completa:\n${actions.url.href}`));
});

test('a pending copy keeps its captured selection truthful while filters and direct links stay usable', async () => {
  let resolveCopy;
  const pendingCopy = new Promise((resolve) => { resolveCopy = resolve; });
  const agenda = createAgenda({
    count: 3,
    filter: '?view=week&date=2026-10-05&tz=UTC&mode=online&country=AR&city=AR%3AC%C3%B3rdoba',
    events: [
      { id: 'captured-online', title: 'Selección inicial remota', mode: 'online', country: 'MX', startsAt: '2026-10-06T15:00:00Z', endsAt: '2026-10-06T16:00:00Z' },
      { id: 'captured-hybrid', title: 'Híbrido remoto extranjero', mode: 'hybrid', country: 'CO', venueCountry: 'CO', city: 'Bogotá', startsAt: '2026-10-06T16:00:00Z', endsAt: '2026-10-06T17:00:00Z' },
      { id: 'new-physical', title: 'Selección presencial nueva', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba', startsAt: '2026-10-06T17:00:00Z', endsAt: '2026-10-06T18:00:00Z' },
    ],
    clipboard: makeClipboard(() => pendingCopy),
  });
  activateShareMenu(agenda);
  agenda.copyButton.click();

  assert.equal(agenda.clipboardCalls.length, 1);
  const capturedText = agenda.clipboardCalls[0][0];
  assert.match(capturedText, /Selección inicial remota/u);
  assert.doesNotMatch(capturedText, /Selección presencial nueva/u);
  assert.equal(agenda.copyButton.disabled, true);

  const previousHistoryLength = agenda.historyEntries.length;
  agenda.modeFilter.value = 'in-person';
  agenda.modeFilter.emit('change');
  assert.equal(agenda.countLabel.textContent, '1 evento', 'the rest of the agenda remains usable while copying');
  assert.equal(agenda.cards.find((card) => card.dataset.eventId === 'new-physical').hidden, false);
  assert.equal(agenda.copyButton.disabled, true);
  const linkAfterFilterChange = embeddedAgendaUrl(agenda.xShareLink);
  assert.equal(linkAfterFilterChange.searchParams.get('mode'), 'in-person');
  assert.equal(agenda.historyEntries.length, previousHistoryLength + 1);

  agenda.xShareLink.click();
  agenda.linkedinShareLink.click();
  assert.equal(agenda.clipboardCalls.length, 1, 'social links do not wait for a pending clipboard operation');
  assert.equal(agenda.windowOpenCalls.length, 0);
  agenda.copyButton.click();
  assert.equal(agenda.clipboardCalls.length, 1, 'a second write cannot race the pending copy');

  resolveCopy();
  await pendingCopy;
  assert.match(agenda.shareStatus.textContent, /anterior|capturad|Selección inicial remota/iu,
    'the result identifies the selection that was copied when the button was pressed');
  assert.doesNotMatch(agenda.shareStatus.textContent, /Selección presencial nueva/u,
    'the result does not imply that the current, changed selection was copied');
  assert.equal(agenda.copyButton.disabled, false);
});

test('a rejected clipboard write reports an error and the same action can be retried', async () => {
  let rejectFirst;
  let resolveSecond;
  let writeNumber = 0;
  const first = new Promise((_resolve, reject) => { rejectFirst = reject; });
  const second = new Promise((resolve) => { resolveSecond = resolve; });
  const agenda = createAgenda({
    count: 1,
    events: [{ id: 'retry-event', title: 'Evento para reintentar' }],
    clipboard: makeClipboard(() => (++writeNumber === 1 ? first : second)),
  });
  activateShareMenu(agenda);
  agenda.copyButton.click();
  assert.doesNotMatch(agenda.shareStatus.textContent, /copiad|se copió/iu);
  rejectFirst(new Error('permission denied'));
  await first.catch(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(agenda.shareStatus.textContent, /no se pudo|no se puede|error|portapapeles|permiso/iu);
  assert.doesNotMatch(agenda.shareStatus.textContent, /copiad|se copió/iu);
  assert.equal(agenda.copyButton.disabled, false, 'a rejected write re-enables Copy');
  assert.deepEqual(agenda.shareControls.children, [agenda.shareMenu, agenda.shareStatus]);

  agenda.copyButton.click();
  assert.equal(agenda.clipboardCalls.length, 2, 'the same Copy action can retry once');
  resolveSecond();
  await second;
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(agenda.shareStatus.textContent, /copiad|se copió/iu);
});

test('missing clipboard support reports failure and allows a later retry', async () => {
  const agenda = createAgenda({
    count: 1,
    events: [{ id: 'clipboard-missing', title: 'Portapapeles no disponible' }],
  });
  activateShareMenu(agenda);
  agenda.copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(agenda.shareStatus.textContent, /no se pudo|no se puede|error|portapapeles|disponible/iu);
  assert.doesNotMatch(agenda.shareStatus.textContent, /copiad|se copió/iu);
  assert.equal(agenda.clipboardCalls.length, 0);
  assert.deepEqual(agenda.shareControls.children, [agenda.shareMenu, agenda.shareStatus]);

  let resolveRetry;
  const retry = new Promise((resolve) => { resolveRetry = resolve; });
  agenda.setClipboard(makeClipboard(() => retry));
  agenda.copyButton.click();
  assert.equal(agenda.clipboardCalls.length, 1);
  resolveRetry();
  await retry;
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(agenda.shareStatus.textContent, /copiad|se copió/iu);
});

test('fixed share links follow selection, period, zone, history and reload without checkbox or fragment', async () => {
  const events = [
    { id: 'share-remote-co', title: 'Online Colombia', mode: 'online', country: 'CO', communities: 'community-co' },
    { id: 'share-physical-co', title: 'Presencial Bogotá', mode: 'in-person', country: 'CO', venueCountry: 'CO', city: 'Bogotá', communities: 'community-co' },
    { id: 'share-physical-ar', title: 'Presencial Córdoba', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba', communities: 'community-ar' },
  ];
  const agenda = createAgenda({
    count: events.length,
    pathname: '/eventos/argentina/',
    defaultCountry: 'AR',
    defaultMode: 'in-person',
    filter: '?view=week&date=2026-10-05&tz=UTC&mode=online&country=CO&city=CO%3ABogot%C3%A1&community=community-co&includeEnded=0&tracking=retained#event-share-remote-co',
    events,
    clipboard: makeClipboard(async () => {}),
  });
  const x = new URL(agenda.xShareLink.href, 'https://dondeaprendoaws.com');
  const initialSharedUrl = embeddedAgendaUrl(agenda.xShareLink);
  assert.equal(x.origin, 'https://x.com');
  assert.deepEqual([...x.searchParams.keys()], ['text']);
  assert.equal(preparedShareText(agenda.xShareLink).split('\n').at(-1), initialSharedUrl.href);
  assert.equal(embeddedAgendaUrl(agenda.linkedinShareLink).href, initialSharedUrl.href);
  assert.equal(initialSharedUrl.pathname, '/eventos/', 'share always targets the route with no implicit defaults');
  assert.equal(initialSharedUrl.searchParams.get('view'), 'week');
  assert.equal(initialSharedUrl.searchParams.get('date'), '2026-10-05');
  assert.equal(initialSharedUrl.searchParams.get('tz'), 'UTC');
  assert.equal(initialSharedUrl.searchParams.get('mode'), 'online');
  assert.equal(initialSharedUrl.searchParams.get('country'), 'CO');
  assert.equal(initialSharedUrl.searchParams.get('city'), 'CO:Bogotá');
  assert.equal(initialSharedUrl.searchParams.get('community'), 'community-co');
  assert.equal(initialSharedUrl.searchParams.has('includeEnded'), false);
  assert.equal(initialSharedUrl.searchParams.has('tracking'), false);
  assert.equal(initialSharedUrl.hash, '', 'the shared URL does not preserve an event fragment');

  activateShareMenu(agenda);
  agenda.copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(agenda.shareStatus.textContent, /copiad|se copió/iu);

  agenda.viewButtons[1].click();
  assert.equal(agenda.shareStatus.textContent, '', 'changing the query clears an old copy confirmation');
  agenda.nextPeriod.click();
  agenda.zoneFilter.value = 'America/Bogota';
  agenda.zoneFilter.emit('change');
  agenda.communityFilter.value = '';
  agenda.communityFilter.emit('change');
  const changedShare = embeddedAgendaUrl(agenda.xShareLink);
  const currentQuery = new URLSearchParams(agenda.location.search);
  for (const key of ['view', 'date', 'tz', 'mode', 'country', 'city']) {
    assert.equal(changedShare.searchParams.get(key), currentQuery.get(key), `Sharing follows current ${key}.`);
  }
  assert.equal(changedShare.searchParams.has('community'), false, 'clearing a facet updates the fixed link');
  assert.equal(changedShare.hash, '');

  agenda.history.back();
  const afterBack = embeddedAgendaUrl(agenda.xShareLink);
  assert.equal(afterBack.searchParams.get('community'), 'community-co', 'back restores the previous facet in the share link');
  agenda.history.forward();
  const afterForward = embeddedAgendaUrl(agenda.xShareLink);
  assert.equal(afterForward.searchParams.has('community'), false, 'forward updates the link to the cleared facet');
  agenda.changeHash('#event-share-remote-co');
  assert.equal(embeddedAgendaUrl(agenda.xShareLink).hash, '', 'hashchange never puts a forced-event fragment in the share URL');
  activateShareMenu(agenda);
  agenda.copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(agenda.clipboardCalls.length, 2,
    'refreshes and history changes do not duplicate the Copy action handler');

  const reload = createAgenda({
    count: events.length,
    pathname: afterForward.pathname,
    filter: afterForward.search,
    events,
  });
  assert.equal(reload.includeEnded.checked, true, 'a recipient opens with finalized events included by default');
  assert.equal(reload.modeFilter.value, afterForward.searchParams.get('mode'));
  assert.equal(reload.countryFilter.value, afterForward.searchParams.get('country'));
  assert.equal(reload.cityFilter.value, afterForward.searchParams.get('city'));
  assert.equal(reload.communityFilter.value, '');
  assert.equal(reload.zoneFilter.value, afterForward.searchParams.get('tz'));
  assert.equal(embeddedAgendaUrl(reload.xShareLink).href, afterForward.href,
    'reloading the fixed URL reproduces its period and selected facets');
});

test('explicit empty route overrides share as the resolved global selection without restoring route defaults', () => {
  const agenda = createAgenda({
    count: 1,
    pathname: '/eventos/argentina/',
    defaultCountry: 'AR',
    defaultMode: 'in-person',
    filter: '?view=week&date=2026-10-05&tz=UTC&country=&mode=',
    events: [{ id: 'empty-override', title: 'Combinado sin ubicación', mode: 'online', country: 'CO' }],
  });
  const share = embeddedAgendaUrl(agenda.xShareLink);

  assert.equal(agenda.countryFilter.value, '', 'an explicit empty country remains effective');
  assert.equal(agenda.modeFilter.value, '', 'an explicit empty mode remains combined');
  assert.equal(share.pathname, '/eventos/');
  assert.equal(share.searchParams.get('view'), 'week');
  assert.equal(share.searchParams.get('date'), '2026-10-05');
  assert.equal(share.searchParams.get('tz'), 'UTC');
  assert.equal(share.searchParams.has('country'), false);
  assert.equal(share.searchParams.has('mode'), false);
});

test('a co-hosted occurrence shares the visible representative schedule and its own registration URL', async () => {
  const agenda = createAgenda({
    count: 1,
    clipboard: makeClipboard(async () => {}),
    filter: '?view=week&date=2026-10-05&tz=UTC&community=community-co',
    events: [{
      id: 'cohost-ar',
      aliasIds: 'cohost-co',
      countries: 'AR|CO',
      communities: 'community-ar|community-co',
      members: [
        { id: 'cohost-ar', country: 'AR', communityId: 'community-ar', title: 'Horario organizador Argentina', registrationUrl: 'https://example.test/registro/ar', startsAt: '2026-10-06T14:00:00Z', endsAt: '2026-10-06T15:00:00Z' },
        { id: 'cohost-co', country: 'CO', communityId: 'community-co', title: 'Horario organizador Colombia', registrationUrl: 'https://example.test/registro/co', startsAt: '2026-10-06T16:00:00Z', endsAt: '2026-10-06T17:30:00Z' },
      ],
    }],
  });
  const visibleMember = agenda.cards[0].members.find((member) => !member.hidden);
  assert.equal(visibleMember.dataset.eventMemberId, 'cohost-co');
  assert.equal(agenda.cards[0].hidden, false);
  activateShareMenu(agenda);
  agenda.copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(agenda.clipboardCalls.length, 1);
  const copied = agenda.clipboardCalls[0][0];
  assert.match(copied, /Horario organizador Colombia/u);
  assert.match(copied, /16:00/u);
  assert.doesNotMatch(copied, /17:30/u,
    'the approved same-day format includes the representative start time without its end time');
  assert.doesNotMatch(copied, /14:00|15:00/u,
    'the copied schedule uses the visible Colombian representative rather than the Argentine co-host');
  assert.match(copied, /https:\/\/example\.test\/registro\/co/u);
  assert.doesNotMatch(copied, /Horario organizador Argentina|registro\/ar/u,
    'copy uses the same representative that the card shows, with that member’s own schedule and URL');
  assert.equal(agenda.countLabel.textContent, '1 evento', 'co-hosting remains one displayed and shared occurrence');
});

test('an empty selection remains explicitly shareable with its period and filters', async () => {
  const agenda = createAgenda({
    count: 1,
    filter: '?view=week&date=2026-11-02&tz=UTC&mode=online&country=AR',
    events: [{ id: 'outside-selected-period', title: 'Evento de octubre', startsAt: '2026-10-06T15:00:00Z', endsAt: '2026-10-06T16:00:00Z' }],
    clipboard: makeClipboard(async () => {}),
  });
  assert.equal(agenda.countLabel.textContent, '0 eventos');
  assert.equal(agenda.copyButton.disabled, false, 'an empty result does not disable sharing');
  activateShareMenu(agenda);
  agenda.copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(agenda.clipboardCalls.length, 1);
  assert.match(agenda.clipboardCalls[0][0], /No hay eventos que coincidan con estos filtros/iu,
    'an empty selection is described with the approved no-matches wording');
  const shared = embeddedAgendaUrl(agenda.xShareLink);
  assert.equal(shared.searchParams.get('date'), '2026-11-02');
  assert.equal(shared.searchParams.get('mode'), 'online');
  assert.equal(shared.searchParams.get('country'), 'AR');
  assert.match(preparedShareText(agenda.xShareLink), /0\s+(?:eventos|resultados)/iu);
});

test('checkbox changes, recipient reload and event expiry update the copied agenda but never enter the share URL', async () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const events = [
    { id: 'already-ended', title: 'Evento ya finalizado', mode: 'online', startsAt: now - 120_000, endsAt: now - 60_000 },
    { id: 'ending-soon', title: 'Evento que finaliza', mode: 'online', startsAt: now - 60_000, endsAt: now + 1_000 },
    { id: 'still-upcoming', title: 'Evento que continúa', mode: 'online', startsAt: now + 60_000, endsAt: now + 120_000 },
  ];
  const clipboard = makeClipboard(async () => {});
  const agenda = createAgenda({
    count: events.length,
    now,
    filter: '?view=week&date=2026-10-05&tz=UTC&mode=online',
    events,
    clipboard,
  });
  const shareBeforeCheckbox = embeddedAgendaUrl(agenda.xShareLink).href;
  agenda.includeEnded.checked = false;
  agenda.includeEnded.emit('change');
  assert.equal(embeddedAgendaUrl(agenda.xShareLink).href, shareBeforeCheckbox,
    'the fixed URL deliberately excludes the sender’s local checkbox state');
  assert.match(preparedShareText(agenda.xShareLink), /\b2\s+eventos\b/u,
    'X summarizes only the sender’s current checkbox selection');
  assert.doesNotMatch(preparedShareText(agenda.linkedinShareLink), /Evento ya finalizado/u,
    'LinkedIn excludes a finalized event when the sender unchecks it');
  activateShareMenu(agenda);
  agenda.copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  let copied = agenda.clipboardCalls.at(-1)[0];
  assert.doesNotMatch(copied, /Evento ya finalizado/u);
  assert.match(copied, /Evento que continúa/u);

  const shared = embeddedAgendaUrl(agenda.xShareLink);
  const recipient = createAgenda({
    count: events.length,
    now,
    pathname: shared.pathname,
    filter: shared.search,
    events,
    clipboard: makeClipboard(async () => {}),
  });
  assert.equal(recipient.includeEnded.checked, true);
  assert.equal(recipient.cards.find((card) => card.dataset.eventId === 'already-ended').hidden, false,
    'the receiving page reopens with the finalized event included');
  assert.match(preparedShareText(recipient.linkedinShareLink), /Evento ya finalizado/u,
    'the receiving social post is prepared from the recipient’s default checked selection');
  activateShareMenu(recipient);
  recipient.copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(recipient.clipboardCalls[0][0], /Evento ya finalizado/u);

  agenda.includeEnded.checked = true;
  agenda.includeEnded.emit('change');
  assert.equal(embeddedAgendaUrl(agenda.xShareLink).href, shareBeforeCheckbox);
  agenda.advanceTime(2_000);
  assert.equal(agenda.fireNextTimer(), true, 'the scheduled event-state transition refreshes the agenda');
  assert.equal(embeddedAgendaUrl(agenda.xShareLink).href, shareBeforeCheckbox,
    'expiry changes prepared content without adding a temporal state to the URL');
  activateShareMenu(agenda);
  agenda.copyButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  copied = agenda.clipboardCalls.at(-1)[0];
  assert.match(copied, /Evento que finaliza/u);
  assert.match(copied, /Finalizado/u, 'copy reflects the event’s new finalized state after expiry');
  assert.match(preparedShareText(agenda.linkedinShareLink), /Evento que finaliza[\s\S]*Finalizado/u,
    'LinkedIn reflects the same event expiry as Copy');
});

test('the native share menu closes with Escape, restores focus and leaves agenda state untouched', () => {
  const agenda = createAgenda({
    count: 1,
    filter: '?view=week&date=2026-10-05&tz=UTC&mode=online',
    events: [{ id: 'keyboard-share', title: 'Teclado' }],
  });
  const currentSearch = agenda.location.search;
  const historyLength = agenda.historyEntries.length;
  const cardOrder = [...agenda.children];
  const visibleCards = agenda.cards.filter((card) => !card.hidden);
  const focusoutTransitions = [];
  agenda.document.addEventListener('focusout', (event) => {
    focusoutTransitions.push([event.target, event.relatedTarget]);
  });
  activateShareMenu(agenda);
  assert.equal(agenda.shareMenu.open, true);
  assert.equal(agenda.document.activeElement, agenda.shareToggle);
  assert.deepEqual(agenda.children, cardOrder, 'opening Share leaves occurrence nodes in their existing list order');
  assert.deepEqual(agenda.cards.filter((card) => !card.hidden), visibleCards,
    'opening Share does not change the visible event selection');
  const escape = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  agenda.shareMenu.emit('keydown', escape);
  assert.equal(agenda.shareMenu.open, false, 'Escape closes the native disclosure');
  assert.equal(agenda.document.activeElement, agenda.shareToggle, 'focus returns to the menu summary');
  assert.equal(escape.defaultPrevented, true);
  assert.equal(agenda.location.search, currentSearch);
  assert.equal(agenda.historyEntries.length, historyLength);

  agenda.shareToggle.click();
  assert.equal(agenda.shareMenu.open, true);
  const tab = { key: 'Tab', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  agenda.shareToggle.emit('keydown', tab);
  assert.equal(tab.defaultPrevented, false, 'Tab remains native inside Share');
  agenda.copyButton.focus();
  assert.equal(agenda.shareMenu.open, true, 'Tab focus inside Share keeps the menu open');
  assert.equal(agenda.document.activeElement, agenda.copyButton);
  agenda.themeToggle.focus();
  assert.equal(agenda.shareMenu.open, true,
    'focus moving from Share to the theme toggle does not close the menu');
  agenda.themeToggle.click();
  agenda.document.dispatchEvent({ type: 'click', target: agenda.themeIcon });
  assert.equal(agenda.shareMenu.open, true, 'clicking the theme toggle SVG leaves sharing open');
  assert.equal(agenda.document.activeElement, agenda.themeToggle, 'the theme toggle keeps natural focus');
  agenda.modeFilter.focus();
  assert.equal(agenda.shareMenu.open, false,
    'moving focus from the theme toggle to an outer control closes Share');
  assert.equal(agenda.document.activeElement, agenda.modeFilter,
    'closing Share does not steal focus from the outer control');
  assert.ok(focusoutTransitions.some(([target, relatedTarget]) => target === agenda.copyButton
    && relatedTarget === agenda.themeToggle));
  assert.ok(focusoutTransitions.some(([target, relatedTarget]) => target === agenda.themeToggle
    && relatedTarget === agenda.modeFilter));

  agenda.shareToggle.click();
  agenda.document.dispatchEvent({ type: 'click', target: agenda.modeFilter });
  assert.equal(agenda.shareMenu.open, false, 'an outside click closes the disclosure');
  assert.equal(agenda.document.activeElement, agenda.shareToggle,
    'outside click closure does not move focus on its own');
  assert.equal(agenda.location.search, currentSearch, 'closing the menu outside does not change filters');
  assert.equal(agenda.historyEntries.length, historyLength);
});

test('a pending copy preserves focus moved to an agenda filter before it resolves', async () => {
  let resolveCopy;
  const pendingCopy = new Promise((resolve) => { resolveCopy = resolve; });
  const agenda = createAgenda({
    count: 2,
    filter: '?view=week&date=2026-10-05&tz=UTC&mode=online',
    events: [
      { id: 'focus-online', title: 'Evento remoto', mode: 'online', startsAt: '2026-10-06T15:00:00Z', endsAt: '2026-10-06T16:00:00Z' },
      { id: 'focus-in-person', title: 'Evento presencial', mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba', startsAt: '2026-10-06T16:00:00Z', endsAt: '2026-10-06T17:00:00Z' },
    ],
    clipboard: makeClipboard(() => pendingCopy),
  });
  activateShareMenu(agenda);
  agenda.copyButton.click();
  assert.equal(agenda.clipboardCalls.length, 1);
  assert.equal(agenda.document.activeElement, agenda.shareToggle,
    'pending work keeps focus on the visible disclosure control while Copy is disabled');

  agenda.modeFilter.focus();
  agenda.modeFilter.value = 'in-person';
  agenda.modeFilter.emit('change');
  assert.equal(agenda.document.activeElement, agenda.modeFilter);

  resolveCopy();
  await pendingCopy;
  assert.equal(agenda.document.activeElement, agenda.modeFilter,
    'copy completion does not move focus away from a filter used while the write was pending');
  assert.match(agenda.shareStatus.textContent, /anterior|selección/iu);
  assert.equal(agenda.shareMenu.open, false);
  assert.equal(agenda.copyButton.disabled, false);
});

test('a representative expiry keeps each focused action on its replacement in the same occurrence', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  for (const action of ['registration', 'calendar', 'report']) {
    const agenda = createAgenda({
      count: 1, now, events: [{
        id: 'a-short', mode: 'online', startsAt: now - 3_600_000, endsAt: now + 1_000,
        aliasIds: 'b-long', members: [{}, { endsAt: now + 3_600_000 }],
      }],
    });
    const [before, after] = agenda.cards[0].members;
    if (action !== 'registration') before.details.open = true;
    before[action].focus();
    assert.equal(agenda.document.activeElement, before[action]);
    agenda.advanceTime(2_000);
    assert.equal(agenda.fireNextTimer(), true);
    assert.equal(before.hidden, true);
    assert.equal(after.hidden, false);
    assert.equal(agenda.cards[0].hidden, false);
    assert.equal(agenda.cards[0].dataset.eventId, 'b-long');
    assert.equal(agenda.document.activeElement, after[action], `${action} stays on a visible equivalent action`);
  }
});

test('multi-day card end labels retain their date and follow the selected zone', () => {
  const agenda = createAgenda({
    count: 1, now: Date.parse('2026-10-29T08:00:00Z'), filter: '?tz=UTC', events: [{
      mode: 'online', startsAt: '2026-10-29T15:00:00Z', endsAt: '2026-10-30T21:00:00Z',
    }],
  });
  const member = agenda.cards[0].members[0];
  assert.equal(member.endTimeLabel.textContent, '30 de octubre de 2026 · 21:00 UTC');
  agenda.zoneFilter.value = 'America/Bogota';
  agenda.zoneFilter.emit('change');
  assert.equal(member.endTimeLabel.textContent, '30 de octubre de 2026 · 16:00 GMT-5');

  const midnight = createAgenda({
    count: 1, now: Date.parse('2026-10-29T08:00:00Z'), filter: '?tz=UTC', events: [{
      mode: 'online', startsAt: '2026-10-29T22:00:00Z', endsAt: '2026-10-30T02:00:00Z',
    }],
  });
  assert.equal(midnight.cards[0].members[0].endTimeLabel.textContent, '30 de octubre de 2026 · 02:00 UTC');
  midnight.zoneFilter.value = 'America/Bogota';
  midnight.zoneFilter.emit('change');
  assert.equal(midnight.cards[0].members[0].endTimeLabel.textContent, '21:00 GMT-5', 'same-day schedules keep only the end time');
});

test('a city alias preserves local hybrid participation and canonical selected URL', () => {
  const agenda = createAgenda({
    count: 1, filter: '?country=AR&city=AR%3ACordoba', events: [{
      mode: 'hybrid', country: 'AR', city: 'AR:Cordoba',
    }],
  });
  assert.equal(agenda.cityFilter.value, 'AR:Córdoba');
  assert.equal(new URLSearchParams(agenda.location.search).get('city'), 'AR:Córdoba');
  assert.equal(agenda.cards[0].hidden, false);
  assert.equal(agenda.cards[0].members[0].participationLabel.textContent, 'Participación presencial y remota');
});
