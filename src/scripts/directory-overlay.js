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

  panel.style.left = '12px';
  panel.style.top = '12px';
  const edge = 12;
  panel.style.maxWidth = `${Math.max(0, viewportWidth - edge * 2)}px`;
  panel.style.maxHeight = `${Math.max(0, viewportHeight - edge * 2)}px`;
  const triggerRect = summary.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const gap = 8;
  const preferredLeft = panel.dataset.overlayAlign === 'end'
    ? triggerRect.right - panelRect.width
    : triggerRect.left;
  const left = Math.min(Math.max(edge, preferredLeft), Math.max(edge, viewportWidth - panelRect.width - edge));
  const belowTop = triggerRect.bottom + gap;
  const aboveTop = triggerRect.top - panelRect.height - gap;
  const belowSpace = viewportHeight - edge - belowTop;
  const aboveSpace = triggerRect.top - edge - gap;
  const preferredTop = panelRect.height > belowSpace && aboveSpace > belowSpace ? aboveTop : belowTop;
  const top = Math.min(Math.max(edge, preferredTop), Math.max(edge, viewportHeight - panelRect.height - edge));

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}
