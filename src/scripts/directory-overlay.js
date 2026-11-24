/** Position an open directory disclosure panel beside its native summary. */
export function positionDirectoryOverlay(disclosure) {
  if (!disclosure.open) return;

  const summary = disclosure.querySelector('summary');
  const panel = disclosure.querySelector('[data-directory-overlay-panel]');
  const viewport = disclosure.ownerDocument?.documentElement;
  if (!summary?.getBoundingClientRect || !panel?.getBoundingClientRect || !panel.style || !viewport) return;

  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  if (!viewportWidth || !viewportHeight) return;

  const edge = 12;
  const gap = 8;
  const header = disclosure.ownerDocument?.querySelector?.('.site-header');
  const headerRect = header?.getBoundingClientRect?.();
  const safeTop = Math.max(edge, Math.min(viewportHeight - edge, (headerRect?.bottom ?? 0) + gap));
  panel.style.left = `${edge}px`;
  panel.style.top = `${safeTop}px`;
  panel.style.maxWidth = `${Math.max(0, viewportWidth - edge * 2)}px`;
  panel.style.maxHeight = `${Math.max(0, viewportHeight - safeTop - edge)}px`;
  const triggerRect = summary.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const preferredLeft = panel.dataset.overlayAlign === 'end'
    ? triggerRect.right - panelRect.width
    : triggerRect.left;
  const left = Math.min(Math.max(edge, preferredLeft), Math.max(edge, viewportWidth - panelRect.width - edge));
  const belowTop = triggerRect.bottom + gap;
  const aboveTop = triggerRect.top - panelRect.height - gap;
  const belowSpace = viewportHeight - edge - belowTop;
  const aboveSpace = triggerRect.top - safeTop - gap;
  const canPlaceAbove = aboveTop >= safeTop;
  const canPlaceBelow = belowTop + panelRect.height <= viewportHeight - edge;
  const preferredTop = panelRect.height > belowSpace && aboveSpace > belowSpace && canPlaceAbove
    ? aboveTop
    : canPlaceBelow ? belowTop : safeTop;
  const top = Math.min(Math.max(safeTop, preferredTop), Math.max(safeTop, viewportHeight - panelRect.height - edge));

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}
