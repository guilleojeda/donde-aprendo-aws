import { randomUUID } from 'node:crypto';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { getAccountAuth } from './account-runtime.mjs';
import { createCreatorPagesService } from './creator-pages.mjs';
import { createCreatorStore } from './creator-store.mjs';
import { createCreatorPhotoService } from './creator-photos.mjs';
import { createCreatorPhotoS3 } from './creator-photo-objects.mjs';
import { createCreatorHttpHandler } from './creator-http.mjs';
import { createGA4TokenProvider } from './creator-statistics-token.mjs';
import { createGA4StatisticsReader } from './creator-statistics-ga4.mjs';
import { createCachedCreatorStatistics } from './creator-statistics.mjs';
import { createCreatorStatisticsStore } from './creator-statistics-store.mjs';

let runtime;

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing server configuration: ${name}`);
  return value.trim();
}

function lazyStatistics(region, profilesTableName) {
  let statistics;
  return {
    async read(query) {
      // The editor and login remain available when Analytics is not configured.
      if (!statistics) {
        const propertyId = required('GA4_PROPERTY_ID');
        const tokens = createGA4TokenProvider({
          loadCredentials: async () => {
            const client = new SecretsManagerClient({ region });
            const secret = await client.send(new GetSecretValueCommand({
              SecretId: required('GA4_CREDENTIALS_SECRET_ARN'),
            }));
            if (typeof secret.SecretString !== 'string') throw new Error('GA4 credentials are unavailable');
            return JSON.parse(secret.SecretString);
          },
        });
        statistics = createCachedCreatorStatistics({
          reader: createGA4StatisticsReader({
            propertyId,
            captureStartedAt: required('CREATOR_ANALYTICS_CAPTURE_STARTED_AT'),
            getAccessToken: () => tokens.getAccessToken(),
          }),
          cache: createCreatorStatisticsStore({ profilesTableName, propertyId, region }),
        });
      }
      return statistics.read(query);
    },
  };
}

export function getCreatorRuntime() {
  if (runtime) return runtime;
  const auth = getAccountAuth();
  const origin = required('ACCOUNT_ORIGIN');
  const region = process.env.AWS_REGION || 'us-east-1';
  const profilesTableName = required('CREATOR_PROFILES_TABLE');
  const store = createCreatorStore({
    accountsTableName: required('ACCOUNTS_TABLE'),
    profilesTableName,
    catalogTableName: required('CATALOG_TABLE'),
    region,
  });
  const service = createCreatorPagesService({
    store, authenticate: (request) => auth.getPrincipal(request), origin, createId: randomUUID,
    statistics: lazyStatistics(region, profilesTableName),
  });
  const s3 = createCreatorPhotoS3({ bucket: required('CREATOR_PHOTOS_BUCKET'), region });
  const photos = createCreatorPhotoService({ store, ...s3, now: Date.now, createId: randomUUID });
  const handle = createCreatorHttpHandler({ service, photos, auth, store, origin });
  runtime = { service, photos, auth, handle };
  return runtime;
}
