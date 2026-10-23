const PRODUCTION_HOST = 'dondeaprendoaws.com';

function canSend(context) {
  return context?.view === 'public'
    && context?.location?.hostname === PRODUCTION_HOST
    && typeof context?.gtag === 'function';
}

function send(context, name, parameters) {
  if (!canSend(context)) return;
  try {
    context.gtag('event', name, parameters);
  } catch {
    // Analytics is optional and must never affect navigation or rendering.
  }
}

export function trackCreatorView(context, creator) {
  if (typeof creator?.id !== 'string' || creator.id.length === 0) return;
  send(context, 'creator_view', { creator_id: creator.id });
}

export function trackCreatorLinkClick(context, creator, link) {
  if (typeof creator?.id !== 'string' || creator.id.length === 0
    || typeof link?.id !== 'string' || link.id.length === 0) return;
  send(context, 'creator_link_click', {
    creator_id: creator.id,
    link_id: link.id,
  });
}
