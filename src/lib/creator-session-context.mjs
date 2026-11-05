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

/** A missing marker preserves legacy callers; supplied markers must match the page's current account and role. */
export function creatorPageSessionBindingFailure(requestedBinding, currentBinding) {
  if (requestedBinding === null) return undefined;
  if (!isCreatorPageSessionBinding(requestedBinding)) return { status: 422, error: 'INVALID_CONTEXT' };
  if (requestedBinding !== currentBinding) return { status: 409, error: 'SESSION_CONTEXT_CHANGED' };
  return undefined;
}
