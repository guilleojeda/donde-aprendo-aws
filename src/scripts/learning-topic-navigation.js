/** Add dismissal behavior to the native topic disclosure without changing focus on exit. */
export function setupLearningTopicDisclosure(documentObject) {
  const disclosure = documentObject.querySelector('.collection-navigation__details');
  if (!disclosure) return;

  const summary = disclosure.querySelector('summary');
  const isThemeToggleTarget = (target) => Boolean(target?.closest?.('[data-theme-toggle]'));

  documentObject.addEventListener('focusout', (event) => {
    if (!disclosure.open) return;

    const focusLeavesManagedArea = disclosure.contains(event.target) || isThemeToggleTarget(event.target);
    if (!focusLeavesManagedArea) return;

    const nextTargetStaysInManagedArea = disclosure.contains(event.relatedTarget)
      || isThemeToggleTarget(event.relatedTarget);
    if (!nextTargetStaysInManagedArea) disclosure.open = false;
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
    if (disclosure.open && !disclosure.contains(event.target) && !isThemeToggleTarget(event.target)) {
      disclosure.open = false;
    }
  });
}
