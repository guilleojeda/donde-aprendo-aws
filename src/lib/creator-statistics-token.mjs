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

  let authClient;
  let authClientPromise;

  async function getAuthClient() {
    if (authClient) return authClient;
    if (authClientPromise) return authClientPromise;

    const pending = (async () => {
      const credentials = await loadCredentials();
      if (!isServiceAccountCredentials(credentials)) {
        throw new Error(UNAVAILABLE_MESSAGE);
      }

      const client = await createAuth({
        credentials,
        scopes: [ANALYTICS_READONLY_SCOPE],
      });
      if (!client || typeof client.getAccessToken !== 'function') {
        throw new Error(UNAVAILABLE_MESSAGE);
      }
      return client;
    })();

    authClientPromise = pending;
    try {
      authClient = await pending;
      return authClient;
    } catch {
      if (authClientPromise === pending) authClientPromise = undefined;
      throw new Error(UNAVAILABLE_MESSAGE);
    }
  }

  return Object.freeze({
    async getAccessToken() {
      try {
        const client = await getAuthClient();
        const response = await client.getAccessToken();
        const token = typeof response === 'string' ? response : response?.token;
        if (typeof token !== 'string' || token.trim() === '') {
          throw new Error(UNAVAILABLE_MESSAGE);
        }
        return token;
      } catch {
        throw new Error(UNAVAILABLE_MESSAGE);
      }
    },
  });
}
