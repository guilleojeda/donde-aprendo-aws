import { randomUUID } from 'node:crypto';
import { getAccountAuth } from './account-runtime.mjs';
import { createCreatorPagesService } from './creator-pages.mjs';
import { createCreatorStore } from './creator-store.mjs';
import { createCreatorPhotoService } from './creator-photos.mjs';
import { createCreatorPhotoS3 } from './creator-photo-objects.mjs';
import { createCreatorHttpHandler } from './creator-http.mjs';

let runtime;

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing server configuration: ${name}`);
  return value.trim();
}

export function getCreatorRuntime() {
  if (runtime) return runtime;
  const auth = getAccountAuth();
  const origin = required('ACCOUNT_ORIGIN');
  const region = process.env.AWS_REGION || 'us-east-1';
  const store = createCreatorStore({
    accountsTableName: required('ACCOUNTS_TABLE'),
    profilesTableName: required('CREATOR_PROFILES_TABLE'),
    catalogTableName: required('CATALOG_TABLE'),
    region,
  });
  const service = createCreatorPagesService({ store, authenticate: (request) => auth.getPrincipal(request), origin, createId: randomUUID });
  const s3 = createCreatorPhotoS3({ bucket: required('CREATOR_PHOTOS_BUCKET'), region });
  const photos = createCreatorPhotoService({ store, ...s3, now: Date.now, createId: randomUUID });
  const handle = createCreatorHttpHandler({ service, photos, auth, store, origin });
  runtime = { service, photos, auth, handle };
  return runtime;
}
