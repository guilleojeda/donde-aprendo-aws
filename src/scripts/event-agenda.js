const agenda = document.querySelector('[data-event-list]');
const empty = document.querySelector('[data-event-empty]');

if (agenda && empty) {
  const cards = [...agenda.querySelectorAll('[data-event-ends-at]')];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const visitorTime = new Intl.DateTimeFormat('es', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
  });
  let expiryTimer;

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
    let visible = 0;
    for (const card of cards) {
      const end = Date.parse(card.dataset.eventEndsAt);
      card.hidden = end <= now;
      if (!card.hidden) {
        visible += 1;
        nextEnd = Math.min(nextEnd, end);
      }
    }
    empty.hidden = visible > 0;
    if (Number.isFinite(nextEnd)) expiryTimer = setTimeout(refresh, Math.min(Math.max(nextEnd - now, 1), 2_147_483_647));
  }

  refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
