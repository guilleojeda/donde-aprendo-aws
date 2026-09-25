const agenda = document.querySelector('[data-event-list]');
const empty = document.querySelector('[data-event-empty]');
const countryFilter = document.querySelector('[data-event-country]');
const more = document.querySelector('[data-event-more]');
const count = document.querySelector('[data-event-count]');

if (agenda && empty) {
  const cards = [...agenda.querySelectorAll('[data-event-ends-at]')];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const visitorTime = new Intl.DateTimeFormat('es', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
  });
  let expiryTimer;
  let limit = 12;

  for (const card of cards) {
    const row = card.querySelector('[data-visitor-time]');
    const value = card.querySelector('[data-visitor-time-value]');
    if (row && value) {
      const start = new Date(row.dataset.startsAt);
      const end = new Date(row.dataset.endsAt);
      value.textContent = `${visitorTime.format(start)} – ${visitorTime.format(end)} (${zone})`;
      row.hidden = false;
    }
  }

  function refresh() {
    clearTimeout(expiryTimer);
    const now = Date.now();
    let nextEnd = Infinity;
    let matching = 0;
    for (const card of cards) {
      const end = Date.parse(card.dataset.eventEndsAt);
      const matchesCountry = !countryFilter?.value || card.dataset.country === countryFilter.value;
      if (end > now) {
        nextEnd = Math.min(nextEnd, end);
      }
      if (end > now && matchesCountry) {
        card.hidden = matching >= limit;
        matching += 1;
      } else card.hidden = true;
    }
    empty.hidden = matching > 0;
    if (more) more.hidden = matching <= limit;
    if (count) count.textContent = `${matching} ${matching === 1 ? 'evento' : 'eventos'}`;
    if (Number.isFinite(nextEnd)) expiryTimer = setTimeout(refresh, Math.min(Math.max(nextEnd - now, 1), 2_147_483_647));
  }

  refresh();
  countryFilter?.addEventListener('change', () => { limit = 12; refresh(); });
  more?.addEventListener('click', () => { limit += 12; refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
