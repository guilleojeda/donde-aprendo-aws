import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const RUNTIME_ENVIRONMENT_FIELDS = Object.freeze([
  'ACCOUNT_ORIGIN',
  'COGNITO_ISSUER',
  'COGNITO_CLIENT_ID',
  'COGNITO_DOMAIN',
  'ACCOUNTS_TABLE',
  'CATALOG_TABLE',
  'CREATOR_PROFILES_TABLE',
  'CREATOR_PHOTOS_BUCKET',
  'GA4_PROPERTY_ID',
  'GA4_CREDENTIALS_SECRET_ARN',
  'CREATOR_ANALYTICS_CAPTURE_STARTED_AT',
]);

export const PREVIEW_RUNTIME_ENVIRONMENT_FIELDS = Object.freeze(
  RUNTIME_ENVIRONMENT_FIELDS.filter((name) => name !== 'CATALOG_TABLE'
    && !name.startsWith('GA4_') && name !== 'CREATOR_ANALYTICS_CAPTURE_STARTED_AT'),
);

const ORIGIN_FIELDS = new Set(['ACCOUNT_ORIGIN', 'COGNITO_DOMAIN']);
const HOSTED_IDENTITY_FIELDS = ['AWS_APP_ID', 'AWS_BRANCH', 'AWS_PULL_REQUEST_ID'];

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be set to a nonempty value.`);
  }
  return value;
}

function canonicalHttpsUrl(value, name, { originOnly = false, allowSurroundingWhitespace = false } = {}) {
  const source = requiredString(value, name);
  if (!allowSurroundingWhitespace && source !== source.trim()) {
    throw new Error(`${name} must not contain leading or trailing whitespace.`);
  }
  let parsed;
  try {
    parsed = new URL(allowSurroundingWhitespace ? source.trim() : source);
  } catch (cause) {
    throw new Error(`${name} must be a valid HTTPS URL.`, { cause });
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTPS URL without credentials, query, or fragment.`);
  }
  if (originOnly && parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(`${name} must be an HTTPS origin without a path.`);
  }
  const path = originOnly || parsed.pathname === '/' ? '' : parsed.pathname;
  return `${parsed.origin}${path}`;
}

export function canonicalRuntimeValue(name, value) {
  return ORIGIN_FIELDS.has(name)
    ? canonicalHttpsUrl(value, name, { originOnly: true, allowSurroundingWhitespace: true })
    : String(value);
}

function assertSame(name, actual, expected) {
  const actualValue = requiredString(actual, name);
  const expectedValue = requiredString(expected, `Release context ${name}`);
  if (canonicalRuntimeValue(name, actualValue) !== canonicalRuntimeValue(name, expectedValue)) {
    throw new Error(`${name} does not match the selected release context.`);
  }
}

function assertProductionDeployment(deployment) {
  requiredString(deployment?.appId, 'Deployment appId');
  requiredString(deployment?.branchName, 'Deployment branchName');
  requiredString(deployment?.siteOrigin, 'Deployment siteOrigin');
  canonicalHttpsUrl(deployment.siteOrigin, 'Deployment siteOrigin', { originOnly: true });
  const runtime = deployment.runtimeEnvironment;
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
    throw new Error('Deployment runtimeEnvironment must declare the production runtime mapping.');
  }
  assertFieldSet(runtime, RUNTIME_ENVIRONMENT_FIELDS, 'Deployment runtimeEnvironment');
  for (const name of RUNTIME_ENVIRONMENT_FIELDS) requiredString(runtime[name], `Deployment ${name}`);
  requiredString(deployment.submissionApiUrl, 'Deployment submissionApiUrl');
  canonicalHttpsUrl(deployment.submissionApiUrl, 'Deployment submissionApiUrl');
}

function assertFieldSet(value, expectedFields, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedFields].sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    const unexpected = actual.filter((name) => !expected.includes(name));
    const missing = expected.filter((name) => !actual.includes(name));
    const detail = [missing.length && `missing ${missing.join(', ')}`, unexpected.length && `unexpected ${unexpected.join(', ')}`]
      .filter(Boolean).join('; ');
    throw new Error(`${label} must contain exactly the approved runtime fields${detail ? ` (${detail})` : ''}.`);
  }
}

function assertPreviewFields(value, label) {
  const actual = Object.keys(value).sort();
  const allowed = [...RUNTIME_ENVIRONMENT_FIELDS].sort();
  const required = [...PREVIEW_RUNTIME_ENVIRONMENT_FIELDS];
  const unexpected = actual.filter((name) => !allowed.includes(name));
  const missing = required.filter((name) => !actual.includes(name));
  if (unexpected.length || missing.length) {
    const detail = [missing.length && `missing ${missing.join(', ')}`, unexpected.length && `unexpected ${unexpected.join(', ')}`]
      .filter(Boolean).join('; ');
    throw new Error(`${label} must include baseline settings and only approved optional catalog/analytics fields${detail ? ` (${detail})` : ''}.`);
  }
}

export async function readReleaseContextFile(env = process.env) {
  const file = requiredString(env.RELEASE_CONTEXT_FILE, 'RELEASE_CONTEXT_FILE');
  let source;
  try {
    source = await readFile(resolve(file), 'utf8');
  } catch (cause) {
    throw new Error(`Could not read RELEASE_CONTEXT_FILE (${file}).`, { cause });
  }
  let context;
  try {
    context = JSON.parse(source);
  } catch (cause) {
    throw new Error(`RELEASE_CONTEXT_FILE (${file}) must contain valid JSON.`, { cause });
  }
  return context;
}

function hasHostedIdentity(env) {
  return HOSTED_IDENTITY_FIELDS.some((name) => typeof env[name] === 'string' && env[name].trim() !== '');
}

function assertPublicBuildInputs(env, context) {
  const production = context.mode === 'production' || context.mode === 'production-fixture';
  const mode = requiredString(env.PUBLIC_PRODUCTION, 'PUBLIC_PRODUCTION');
  if (mode !== (production ? 'true' : 'false')) {
    throw new Error(`PUBLIC_PRODUCTION must be '${production ? 'true' : 'false'}' for ${context.mode}.`);
  }
  const origin = canonicalHttpsUrl(env.PUBLIC_SITE_ORIGIN, 'PUBLIC_SITE_ORIGIN', { originOnly: true });
  if (origin !== canonicalHttpsUrl(context.siteOrigin, 'Release context siteOrigin', { originOnly: true })) {
    throw new Error('PUBLIC_SITE_ORIGIN does not match the selected release context.');
  }
  const submissionApiUrl = canonicalHttpsUrl(env.PUBLIC_SUBMISSION_API_URL, 'PUBLIC_SUBMISSION_API_URL');
  if (submissionApiUrl !== canonicalHttpsUrl(context.submissionApiUrl, 'Release context submissionApiUrl')) {
    throw new Error('PUBLIC_SUBMISSION_API_URL does not match the selected release context.');
  }
}

function validateRuntimeInputs(env, context) {
  const fields = Object.keys(context.runtimeEnvironment);
  if (context.mode === 'preview') assertPreviewFields(context.runtimeEnvironment, 'Release context preview runtimeEnvironment');
  else assertFieldSet(context.runtimeEnvironment, RUNTIME_ENVIRONMENT_FIELDS, `Release context ${context.mode} runtimeEnvironment`);
  for (const name of fields) {
    requiredString(context.runtimeEnvironment[name], `Release context ${name}`);
    assertSame(name, env[name], context.runtimeEnvironment[name]);
  }
  if (context.mode === 'preview') {
    for (const name of RUNTIME_ENVIRONMENT_FIELDS.filter((field) => !fields.includes(field))) {
      if (Object.hasOwn(env, name)) {
        throw new Error(`${name} is configured but omitted from the independent preview release context.`);
      }
    }
  }
  if (context.mode === 'production' && typeof env.CATALOG_FIXTURE === 'string' && env.CATALOG_FIXTURE.trim() !== '') {
    throw new Error('CATALOG_FIXTURE is forbidden in a hosted production build.');
  }
}

/**
 * Resolve production authority from Amplify's reserved build identity, or an
 * explicitly selected offline fixture. Public build inputs are always checked
 * against the resulting independent context before any provider reads occur.
 */
export async function selectReleaseContext({ env = process.env, deployment, releaseContext } = {}) {
  if (!env || typeof env !== 'object' || !deployment || typeof deployment !== 'object') {
    throw new TypeError('selectReleaseContext requires env and deployment objects.');
  }

  let context;
  if (hasHostedIdentity(env)) {
    for (const name of HOSTED_IDENTITY_FIELDS.slice(0, 2)) requiredString(env[name], name);
    if (releaseContext || (typeof env.RELEASE_CONTEXT_FILE === 'string' && env.RELEASE_CONTEXT_FILE.trim() !== '')) {
      throw new Error('RELEASE_CONTEXT_FILE cannot override a hosted Amplify deployment identity.');
    }
    assertProductionDeployment(deployment);
    if (env.AWS_APP_ID !== deployment.appId) throw new Error('AWS_APP_ID does not match deployment.appId.');
    const pullRequestId = typeof env.AWS_PULL_REQUEST_ID === 'string' && env.AWS_PULL_REQUEST_ID.trim()
      ? requiredString(env.AWS_PULL_REQUEST_ID, 'AWS_PULL_REQUEST_ID') : undefined;
    if (pullRequestId && !/^\d+$/u.test(pullRequestId)) throw new Error('AWS_PULL_REQUEST_ID must be a numeric pull request identity.');
    const production = env.AWS_BRANCH === deployment.branchName && !pullRequestId;
    if (production) {
      context = {
        mode: 'production',
        siteOrigin: deployment.siteOrigin,
        submissionApiUrl: deployment.submissionApiUrl,
        runtimeEnvironment: deployment.runtimeEnvironment,
      };
    } else {
      // Preview settings are deployment inputs, while production expectations
      // remain the independently declared deployment mapping. Optional
      // catalog and analytics settings are included only when configured.
      const siteOrigin = requiredString(env.PUBLIC_SITE_ORIGIN, 'PUBLIC_SITE_ORIGIN');
      const submissionApiUrl = requiredString(env.PUBLIC_SUBMISSION_API_URL, 'PUBLIC_SUBMISSION_API_URL');
      const optionalRuntimeFields = RUNTIME_ENVIRONMENT_FIELDS.filter((name) => !PREVIEW_RUNTIME_ENVIRONMENT_FIELDS.includes(name));
      const previewFields = [...PREVIEW_RUNTIME_ENVIRONMENT_FIELDS,
        ...optionalRuntimeFields.filter((name) => typeof env[name] === 'string' && env[name].trim() !== '')];
      const runtimeEnvironment = Object.fromEntries(previewFields.map((name) => [name, env[name]]));
      context = {
        mode: 'preview',
        siteOrigin,
        submissionApiUrl,
        runtimeEnvironment,
      };
    }
  } else {
    if (HOSTED_IDENTITY_FIELDS.some((name) => typeof env[name] === 'string' && env[name].trim() !== '')) {
      throw new Error('Hosted Amplify identity is incomplete or contradictory.');
    }
    context ??= releaseContext ?? await readReleaseContextFile(env);
    if (!context || !['preview', 'production-fixture'].includes(context.mode)) {
      throw new Error('Offline builds must select a preview or production-fixture release context.');
    }
    if (context.mode === 'production-fixture') {
      canonicalHttpsUrl(deployment.siteOrigin, 'Deployment siteOrigin', { originOnly: true });
      if (canonicalHttpsUrl(context.siteOrigin, 'Release context siteOrigin', { originOnly: true })
        !== canonicalHttpsUrl(deployment.siteOrigin, 'Deployment siteOrigin', { originOnly: true })) {
        throw new Error('Production fixture siteOrigin must match the declared production apex.');
      }
    }
  }

  requiredString(context.siteOrigin, 'Release context siteOrigin');
  canonicalHttpsUrl(context.siteOrigin, 'Release context siteOrigin', { originOnly: true });
  requiredString(context.submissionApiUrl, 'Release context submissionApiUrl');
  canonicalHttpsUrl(context.submissionApiUrl, 'Release context submissionApiUrl');
  if (!context.runtimeEnvironment || typeof context.runtimeEnvironment !== 'object' || Array.isArray(context.runtimeEnvironment)) {
    throw new Error('Release context runtimeEnvironment must be an object.');
  }
  if (context.mode === 'preview') assertPreviewFields(context.runtimeEnvironment, 'Release context preview runtimeEnvironment');
  else assertFieldSet(context.runtimeEnvironment, RUNTIME_ENVIRONMENT_FIELDS, `Release context ${context.mode} runtimeEnvironment`);
  for (const [name, value] of Object.entries(context.runtimeEnvironment)) requiredString(value, `Release context ${name}`);
  return Object.freeze({
    mode: context.mode,
    siteOrigin: canonicalHttpsUrl(context.siteOrigin, 'Release context siteOrigin', { originOnly: true }),
    submissionApiUrl: canonicalHttpsUrl(context.submissionApiUrl, 'Release context submissionApiUrl'),
    runtimeEnvironment: Object.freeze({ ...context.runtimeEnvironment }),
  });
}

/** Resolve and validate all PUBLIC_* and runtime values before a build starts. */
export async function resolveReleaseContext(options = {}) {
  const env = options.env ?? process.env;
  const context = await selectReleaseContext(options);
  assertPublicBuildInputs(env, context);
  validateRuntimeInputs(env, context);
  return context;
}
