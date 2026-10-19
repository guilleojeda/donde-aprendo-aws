import { createAccountAuth } from './account-auth.mjs';
import { createAccountStore } from './account-store.mjs';

let accountAuth;

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing server configuration: ${name}`);
  return value.trim();
}

export function getAccountAuth() {
  if (accountAuth) return accountAuth;
  const origin = required('ACCOUNT_ORIGIN');
  const issuer = required('COGNITO_ISSUER');
  const clientId = required('COGNITO_CLIENT_ID');
  const cognitoDomain = required('COGNITO_DOMAIN');
  const tableName = required('ACCOUNTS_TABLE');
  const store = createAccountStore({ tableName, region: process.env.AWS_REGION || 'us-east-1' });
  accountAuth = createAccountAuth({ origin, issuer, clientId, cognitoDomain, store });
  return accountAuth;
}
