import { createAccountStore } from '../lib/account-store.mjs';

const RESET_TRIGGER = 'PostConfirmation_ConfirmForgotPassword';

function identityForEvent(event) {
  const { region, userPoolId } = event;
  const sub = event.request?.userAttributes?.sub;
  if (typeof region !== 'string' || !/^[a-z0-9-]+$/.test(region)
    || typeof userPoolId !== 'string' || !userPoolId.startsWith(`${region}_`)
    || typeof sub !== 'string' || sub.length === 0) {
    throw new TypeError('invalid Cognito password reset event');
  }
  return { issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`, sub };
}

export function createPasswordResetHandler({ store, now = Date.now, issuer } = {}) {
  if (!store || typeof store.advanceAuthBoundary !== 'function') {
    throw new TypeError('store does not implement advanceAuthBoundary');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  return async function handlePasswordReset(event) {
    if (event?.triggerSource !== RESET_TRIGGER) return event;
    const identity = identityForEvent(event);
    if (issuer && identity.issuer !== issuer) throw new TypeError('Cognito issuer does not match the reset event');
    const atMs = now();
    if (!Number.isFinite(atMs) || atMs < 0) throw new TypeError('clock returned an invalid time');
    await store.advanceAuthBoundary(identity, Math.floor(atMs));
    return event;
  };
}

let lambdaHandler;

export async function handler(event) {
  if (!lambdaHandler) {
    const tableName = process.env.ACCOUNTS_TABLE;
    const store = createAccountStore({ tableName, region: process.env.AWS_REGION || 'us-east-1' });
    lambdaHandler = createPasswordResetHandler({ store, issuer: process.env.COGNITO_ISSUER });
  }
  return lambdaHandler(event);
}
