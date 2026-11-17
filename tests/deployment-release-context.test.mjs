import assert from 'node:assert/strict';
import test from 'node:test';
import deployment from '../config/deployment.json' with { type: 'json' };
import productionFixture from './fixtures/release-production-context.json' with { type: 'json' };
import previewFixture from './fixtures/release-preview-context.json' with { type: 'json' };
import { resolveReleaseContext } from '../scripts/lib/deployment-context.mjs';

// This expected release is declared independently of PUBLIC_* or the values
// supplied to a build. Provider identifiers here are synthetic and inert.
const declared = {
  ...deployment,
  siteOrigin: 'https://dondeaprendoaws.com',
  submissionApiUrl: 'https://submission.example.test/submissions',
  runtimeEnvironment: {
    ...productionFixture.runtimeEnvironment,
    COGNITO_CLIENT_ID: 'declared-production-client',
    ACCOUNTS_TABLE: 'declared-production-accounts',
    CATALOG_TABLE: deployment.tableName,
    CREATOR_PROFILES_TABLE: 'declared-production-profiles',
    CREATOR_PHOTOS_BUCKET: 'declared-production-photos',
    GA4_PROPERTY_ID: '424203315',
    GA4_CREDENTIALS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:719535286359:secret:declared-ga4-abcdef',
    CREATOR_ANALYTICS_CAPTURE_STARTED_AT: '2026-10-23T23:38:00Z',
  },
};
const hostedProduction = () => ({
  AWS_APP_ID: deployment.appId,
  AWS_BRANCH: deployment.branchName,
  ...declared.runtimeEnvironment,
  PUBLIC_PRODUCTION: 'true',
  PUBLIC_SITE_ORIGIN: declared.siteOrigin,
  PUBLIC_SUBMISSION_API_URL: declared.submissionApiUrl,
});

async function resolveContext(env, releaseContext) {
  return resolveReleaseContext({ env, deployment: declared, releaseContext });
}

test('the configured Amplify app and main branch establish production authority', async () => {
  const context = await resolveContext(hostedProduction());
  assert.equal(context.mode, 'production');
  assert.equal(context.siteOrigin, declared.siteOrigin);
  assert.deepEqual(context.runtimeEnvironment, declared.runtimeEnvironment);
});

test('recognized PR and branch previews stay nonindexable under their own origin', async (t) => {
  const origin = 'https://preview.example.test';
  for (const identity of [
    { AWS_APP_ID: deployment.appId, AWS_BRANCH: 'feature-release-check' },
    { AWS_APP_ID: deployment.appId, AWS_BRANCH: deployment.branchName, AWS_PULL_REQUEST_ID: '42' },
  ]) {
    await t.test(JSON.stringify(identity), async () => {
      const context = await resolveContext({
        ...previewFixture.runtimeEnvironment, ...identity,
        PUBLIC_PRODUCTION: 'false', PUBLIC_SITE_ORIGIN: origin,
        PUBLIC_SUBMISSION_API_URL: previewFixture.submissionApiUrl,
      });
      assert.equal(context.mode, 'preview');
      assert.equal(context.siteOrigin, origin);
    });
  }
});

test('missing or contradictory hosted identity cannot acquire release authority', async (t) => {
  for (const change of [
    { AWS_APP_ID: undefined }, { AWS_BRANCH: undefined },
    { AWS_APP_ID: 'different-app' }, { AWS_PULL_REQUEST_ID: '42' },
  ]) {
    await t.test(JSON.stringify(change), async () => {
      const env = { ...hostedProduction(), ...change };
      await assert.rejects(() => resolveContext(env));
    });
  }
  await assert.rejects(() => resolveContext({ ...declared.runtimeEnvironment,
    PUBLIC_PRODUCTION: 'true', PUBLIC_SITE_ORIGIN: declared.siteOrigin }));
});

test('production refuses absent or false public mode and a missing or different apex', async (t) => {
  for (const [name, value] of [
    ['PUBLIC_PRODUCTION', undefined], ['PUBLIC_PRODUCTION', 'false'],
    ['PUBLIC_PRODUCTION', 'TRUE'], ['PUBLIC_SITE_ORIGIN', undefined],
    ['PUBLIC_SITE_ORIGIN', 'https://preview.example.test'],
  ]) {
    await t.test(`${name}=${value}`, async () => {
      const env = { ...hostedProduction(), [name]: value };
      await assert.rejects(() => resolveContext(env), new RegExp(name, 'u'));
    });
  }
  const context = await resolveContext({ ...hostedProduction(),
    PUBLIC_SITE_ORIGIN: 'https://DONDEAPRENDOAWS.COM:443/',
    ACCOUNT_ORIGIN: ' https://DONDEAPRENDOAWS.COM:443/ ' });
  assert.equal(context.siteOrigin, declared.siteOrigin);
  assert.equal(context.runtimeEnvironment.ACCOUNT_ORIGIN, declared.runtimeEnvironment.ACCOUNT_ORIGIN);
});

test('production requires independently declared runtime and submission configuration', async (t) => {
  for (const name of [...Object.keys(declared.runtimeEnvironment), 'PUBLIC_SUBMISSION_API_URL']) {
    for (const value of [undefined, '', name === 'ACCOUNT_ORIGIN' ? 'https://wrong.example.test' : 'wrong-release-value']) {
      await t.test(`${name}=${value}`, async () => {
        await assert.rejects(() => resolveContext({ ...hostedProduction(), [name]: value }),
          new RegExp(name, 'u'));
      });
    }
  }
  await assert.rejects(() => resolveContext({ ...hostedProduction(), CATALOG_FIXTURE: '/tmp/catalog.json' }),
    /CATALOG_FIXTURE/u);
  for (const name of ['COGNITO_CLIENT_ID', 'ACCOUNTS_TABLE', 'CATALOG_TABLE']) {
    await t.test(`${name} identity comparison preserves whitespace`, async () => {
      await assert.rejects(() => resolveContext({
        ...hostedProduction(), [name]: `${declared.runtimeEnvironment[name]} `,
      }), new RegExp(name, 'u'));
    });
  }
  await t.test('COGNITO_ISSUER keeps its configured issuer path exact', async () => {
    await assert.rejects(() => resolveContext({
      ...hostedProduction(), COGNITO_ISSUER: `${declared.runtimeEnvironment.COGNITO_ISSUER}/`,
    }), /COGNITO_ISSUER/u);
  });
  await t.test('submission endpoint path keeps its trailing slash exact', async () => {
    await assert.rejects(() => resolveContext({
      ...hostedProduction(), PUBLIC_SUBMISSION_API_URL: `${declared.submissionApiUrl}/`,
    }), /PUBLIC_SUBMISSION_API_URL/u);
  });
});

test('explicit offline contexts permit synthetic builds without impersonating hosted production', async () => {
  const fixtureEnv = {
    ...productionFixture.runtimeEnvironment,
    PUBLIC_PRODUCTION: 'true', PUBLIC_SITE_ORIGIN: productionFixture.siteOrigin,
    PUBLIC_SUBMISSION_API_URL: productionFixture.submissionApiUrl,
  };
  const context = await resolveContext(fixtureEnv, productionFixture);
  assert.equal(context.mode, 'production-fixture');
  assert.equal(context.siteOrigin, productionFixture.siteOrigin);
  assert.deepEqual(context.runtimeEnvironment, productionFixture.runtimeEnvironment);
  const preview = await resolveContext({
    ...previewFixture.runtimeEnvironment, PUBLIC_PRODUCTION: 'false',
    PUBLIC_SITE_ORIGIN: previewFixture.siteOrigin,
    PUBLIC_SUBMISSION_API_URL: previewFixture.submissionApiUrl,
  }, previewFixture);
  assert.equal(preview.mode, 'preview');
  assert.equal(preview.runtimeEnvironment.GA4_PROPERTY_ID, undefined);
  const previewWithOptional = {
    ...previewFixture,
    runtimeEnvironment: {
      ...previewFixture.runtimeEnvironment,
      CATALOG_TABLE: 'preview-catalog',
      GA4_PROPERTY_ID: '123456789',
      GA4_CREDENTIALS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:000000000000:secret:preview-abcdef',
      CREATOR_ANALYTICS_CAPTURE_STARTED_AT: '2000-01-01T00:00:00.000Z',
    },
  };
  const optionalPreview = await resolveContext({
    ...previewWithOptional.runtimeEnvironment, PUBLIC_PRODUCTION: 'false',
    PUBLIC_SITE_ORIGIN: previewWithOptional.siteOrigin,
    PUBLIC_SUBMISSION_API_URL: previewWithOptional.submissionApiUrl,
  }, previewWithOptional);
  assert.equal(optionalPreview.runtimeEnvironment.CATALOG_TABLE, 'preview-catalog');
  assert.equal(optionalPreview.runtimeEnvironment.GA4_PROPERTY_ID, '123456789');
  await assert.rejects(() => resolveContext({
    ...previewFixture.runtimeEnvironment, CATALOG_TABLE: 'undeclared-preview-table',
    PUBLIC_PRODUCTION: 'false', PUBLIC_SITE_ORIGIN: previewFixture.siteOrigin,
    PUBLIC_SUBMISSION_API_URL: previewFixture.submissionApiUrl,
  }, previewFixture), /CATALOG_TABLE/u);
  await assert.rejects(() => resolveContext(hostedProduction(), productionFixture));
  await assert.rejects(() => resolveContext({
    ...fixtureEnv, AWS_APP_ID: deployment.appId, AWS_BRANCH: deployment.branchName,
  }, productionFixture));
});
