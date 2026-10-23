import { trackCreatorLinkClick, trackCreatorView } from '../lib/creator-analytics.mjs';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const profile = document.querySelector<HTMLElement>('[data-creator-profile]');
const creatorId = profile?.dataset.creatorId;
const slug = profile?.dataset.creatorSlug;

if (profile && creatorId) {
  const creator = { id: creatorId, slug };
  const context = {
    location: window.location,
    view: 'public',
    gtag: (...args: unknown[]) => window.gtag?.(...args),
  };

  trackCreatorView(context, creator);

  function trackActivation(event: MouseEvent) {
    if (event.type === 'click' && event.button !== 0) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const linkElement = target.closest<HTMLAnchorElement>('a[data-creator-link-id]');
    const linkId = linkElement?.dataset.creatorLinkId;
    if (!linkId) return;
    trackCreatorLinkClick(context, creator, { id: linkId });
  }

  profile.addEventListener('click', trackActivation);
  profile.addEventListener('auxclick', trackActivation);
}
