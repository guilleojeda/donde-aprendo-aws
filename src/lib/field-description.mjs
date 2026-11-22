/**
 * Updates one error reference while keeping the control's other descriptions.
 * @param {Element} element
 * @param {string} errorId
 * @param {boolean} include
 */
export function updateFieldDescription(element, errorId, include) {
  let ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
  if (include) {
    if (!ids.includes(errorId)) ids.push(errorId);
  } else {
    ids = ids.filter((id) => id !== errorId);
  }
  if (ids.length > 0) element.setAttribute('aria-describedby', ids.join(' '));
  else element.removeAttribute('aria-describedby');
  return ids;
}
