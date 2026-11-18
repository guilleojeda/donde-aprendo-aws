import { createHash } from 'node:crypto';

const ANALYTICS_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const UNAVAILABLE_MESSAGE = 'GA4 authentication is unavailable.';
const TOKEN_TRANSPORT_TIMEOUT_MS = 3_000;

function isServiceAccountCredentials(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.type === 'service_account'
    && typeof value.client_email === 'string'
    && value.client_email.trim() !== ''
    && typeof value.private_key === 'string'
    && value.private_key.trim() !== '';
}

async function createGoogleAuthClient({ credentials, scopes }) {
  const { JWT } = await import('google-auth-library');
  return new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes,
    transporterOptions: {
      timeout: TOKEN_TRANSPORT_TIMEOUT_MS,
      retryConfig: { retry: 1, noResponseRetries: 1 },
    },
  });
}

function signingIdentity({ client_email, private_key }) {
  const normalizedKey = private_key.replaceAll('\r\n', '\n').trim();
  return createHash('sha256').update(JSON.stringify([client_email.trim(), normalizedKey])).digest('hex');
}

function isRejectedSigningKey(error) {
  const response = error?.response;
  const description = response?.data?.error_description;
  // The OAuth endpoint also uses invalid_grant for invalid claims and clock skew.
  return response?.status === 400
    && response.data?.error === 'invalid_grant'
    && typeof description === 'string'
    && /^Invalid JWT Signature\.?$/iu.test(description.trim());
}

async function accessToken(client) {
  const response = await client.getAccessToken();
  const token = typeof response === 'string' ? response : response?.token;
  if (typeof token !== 'string' || token.trim() === '') throw new Error(UNAVAILABLE_MESSAGE);
  return token;
}

/**
 * Creates a lazy GA4 service-account token provider.
 *
 * The caller owns secret retrieval. Authentication is initialized only on the
 * first token request so unrelated server routes do not depend on GA4 access.
 */
export function createGA4TokenProvider({ loadCredentials, createAuth = createGoogleAuthClient } = {}) {
  if (typeof loadCredentials !== 'function') {
    throw new TypeError('loadCredentials must be a function.');
  }
  if (typeof createAuth !== 'function') {
    throw new TypeError('createAuth must be a function.');
  }

  let generation;
  let pendingToken;

  async function loadGeneration(rejectedIdentity) {
    const credentials = await loadCredentials();
    if (!isServiceAccountCredentials(credentials)) throw new Error(UNAVAILABLE_MESSAGE);
    const identity = signingIdentity(credentials);
    if (identity === rejectedIdentity) throw new Error(UNAVAILABLE_MESSAGE);

    const client = await createAuth({
      credentials,
      scopes: [ANALYTICS_READONLY_SCOPE],
    });
    if (!client || typeof client.getAccessToken !== 'function') throw new Error(UNAVAILABLE_MESSAGE);
    return { client, identity };
  }

  async function readToken() {
    generation ??= await loadGeneration();
    try {
      return await accessToken(generation.client);
    } catch (error) {
      if (!isRejectedSigningKey(error)) throw error;
      const rejectedIdentity = generation.identity;
      generation = undefined;
      const replacement = await loadGeneration(rejectedIdentity);
      const token = await accessToken(replacement.client);
      generation = replacement;
      return token;
    }
  }

  return Object.freeze({
    getAccessToken() {
      pendingToken ??= readToken().catch(() => {
        throw new Error(UNAVAILABLE_MESSAGE);
      }).finally(() => {
        pendingToken = undefined;
      });
      return pendingToken;
    },
  });
}
