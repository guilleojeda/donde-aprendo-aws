export function usableCreatorOwnerFocusTarget(target: HTMLElement | null | undefined): target is HTMLElement {
  return Boolean(target?.isConnected
    && target.getClientRects().length > 0
    && !target.matches(':disabled, [aria-disabled="true"]')
    && !target.closest('[hidden], [inert]'));
}
