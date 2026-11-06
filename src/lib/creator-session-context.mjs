import { createHash } from 'node:crypto';

const SESSION_BINDING_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Return an opaque marker for comparing a private page with the current
 * authenticated account and role. It can reject a stale page write, but never
 * grants authority; each API operation still authorizes its current principal.
 */
export function creatorPageSessionBinding(principal) {
  if (!principal || typeof principal.accountId !== 'string' || principal.accountId.trim().length === 0
    || typeof principal.isAdmin !== 'boolean') return undefined;

  return createHash('sha256')
    .update(JSON.stringify(['creator-page-recovery-v1', principal.accountId, principal.isAdmin]))
    .digest('hex');
}

export function isCreatorPageSessionBinding(value) {
  return typeof value === 'string' && SESSION_BINDING_PATTERN.test(value);
}

/** Compare a supplied owner-page marker before classifying a disabled account. */
export function creatorPageSessionBindingFailureForRequest(requestedBinding, principal, { required = false } = {}) {
  const disabled = principal?.state === 'disabled';
  if (requestedBinding === null) {
    if (required) return { status: 422, error: 'INVALID_CONTEXT' };
    return disabled ? { status: 403, error: 'ACCOUNT_DISABLED' } : undefined;
  }
  if (!isCreatorPageSessionBinding(requestedBinding)) return { status: 422, error: 'INVALID_CONTEXT' };
  const currentBinding = creatorPageSessionBinding(principal);
  if (!currentBinding) return { status: 503, error: 'AUTH_UNAVAILABLE' };
  if (requestedBinding !== currentBinding) return { status: 409, error: 'SESSION_CONTEXT_CHANGED' };
  return disabled ? { status: 403, error: 'ACCOUNT_DISABLED' } : undefined;
}
