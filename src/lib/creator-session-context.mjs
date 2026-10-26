import { createHash } from 'node:crypto';

const SESSION_BINDING_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Return a non-authoritative marker for comparing a private page with a later
 * authenticated session. Authorization continues to use the validated
 * principal at the point of each API operation.
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
