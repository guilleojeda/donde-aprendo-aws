(() => {
  const state = history.state;
  const hasIndex = (entry) => Number.isSafeInteger(entry?.creatorOwnerIndex) && entry.creatorOwnerIndex >= 0;
  const script = document.currentScript;
  if (!hasIndex(state)) {
    history.replaceState({
      ...state,
      creatorOwnerIndex: 0,
      creatorOwnerSeriesQueryValid: script.dataset.seriesValid === 'true',
      creatorOwnerLinksQueryValid: script.dataset.linksValid === 'true',
    }, '');
  }

  let activation;
  document.addEventListener('click', (event) => {
    activation = undefined;
    const anchor = event.target instanceof Element && event.target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement) || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.hasAttribute('download')
      || (anchor.target && anchor.target.toLowerCase() !== '_self')) return;
    const current = new URL(location.href);
    const target = new URL(anchor.href);
    if (target.origin !== current.origin || target.pathname !== current.pathname || target.search !== current.search
      || !target.hash || !hasIndex(history.state)) return;
    if (target.hash === current.hash) {
      if (!anchor.matches('.skip-link[href="#contenido"]')) return;
      // Firefox can replace the active entry's history state when the current
      // skip link is activated again, without a popstate or hashchange event.
      event.preventDefault();
      const content = document.getElementById('contenido');
      content?.focus({ preventScroll: true });
      content?.scrollIntoView({ behavior: 'instant' });
      return;
    }
    activation = { event, href: target.href, from: history.state };
  }, { capture: true });

  function recordNativeFragment() {
    // Only a completed native anchor activation establishes a new forward slot.
    // A traversed entry keeps the index it already had.
    if (!activation) return;
    const { event, href, from } = activation;
    activation = undefined;
    if (event.defaultPrevented || location.href !== href) return;
    if (!hasIndex(history.state)) history.replaceState({ ...history.state, creatorOwnerIndex: from.creatorOwnerIndex + 1,
      creatorOwnerSeriesQueryValid: from.creatorOwnerSeriesQueryValid,
      creatorOwnerLinksQueryValid: from.creatorOwnerLinksQueryValid }, '');
    window.dispatchEvent(new Event('creator-owner:native-fragment'));
  }

  window.addEventListener('popstate', recordNativeFragment);
  window.addEventListener('hashchange', recordNativeFragment);
})();
