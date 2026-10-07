/** Add dismissal behavior to the native topic disclosure without changing focus on exit. */
export function setupLearningTopicDisclosure(documentObject) {
  const disclosure = documentObject.querySelector('.collection-navigation__details');
  if (!disclosure) return;

  const summary = disclosure.querySelector('summary');

  disclosure.addEventListener('focusout', (event) => {
    if (event.relatedTarget && disclosure.contains(event.relatedTarget)) return;
    disclosure.open = false;
  });

  documentObject.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !disclosure.open) return;

    if (disclosure.contains(event.target)) {
      event.stopPropagation();
      event.preventDefault();
      summary?.focus();
    }
    disclosure.open = false;
  }, { capture: true });

  documentObject.addEventListener('click', (event) => {
    if (disclosure.open && !disclosure.contains(event.target)) disclosure.open = false;
  });
}
