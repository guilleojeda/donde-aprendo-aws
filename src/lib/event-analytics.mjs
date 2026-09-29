/** The existing GA4 property receives only public event facets on the production domain. */
export function trackRegistrationClick(context, event) {
  if (context.location.hostname !== 'dondeaprendoaws.com' || typeof context.gtag !== 'function') return;
  context.gtag('event', 'event_registration_click', {
    event_id: event.id,
    event_mode: event.mode,
    event_country: event.country || 'unknown',
  });
}
