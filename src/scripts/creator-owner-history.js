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
      || !target.hash || target.hash === current.hash || !hasIndex(history.state)) return;
    activation = { event, href: target.href, from: history.state };
  }, { capture: true });

  function recordNativeFragment() {
    // Only a completed native anchor activation establishes a new forward slot.
    // A traversed entry keeps the index it already had.
    if (!activation) return;
    const { event, href, from } = activation;
    activation = undefined;
    if (!event.defaultPrevented && location.href === href && !hasIndex(history.state)) {
      history.replaceState({ ...history.state, creatorOwnerIndex: from.creatorOwnerIndex + 1,
        creatorOwnerSeriesQueryValid: from.creatorOwnerSeriesQueryValid,
        creatorOwnerLinksQueryValid: from.creatorOwnerLinksQueryValid }, '');
    }
  }

  window.addEventListener('popstate', recordNativeFragment);
  window.addEventListener('hashchange', recordNativeFragment);
})();
