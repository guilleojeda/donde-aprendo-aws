import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';
import { scanCatalogItems, scanCreatorItems } from '../src/lib/catalog.mjs';
import { putCatalogResourceOnce } from '../src/lib/catalog-resource-writer.mjs';
import { currentUrlReservationId } from '../src/lib/catalog-url.mjs';

const publicCatalogFields = [
  'id', 'title', 'url', 'description', 'category', 'order', 'featured', 'kind', 'format', 'topics',
  'addedAt', 'country', 'level', 'sourceId', 'communityId', 'eventId', 'recordType', 'startsAt', 'endsAt',
  'timeZone', 'organizer', 'mode', 'place', 'city', 'venueCountry', 'registrationUrl', 'directoryControl',
  'hidden', 'approvalRevoked', 'published',
];
const publicCreatorFields = [
  'pk', 'sk', 'recordType', 'id', 'profileId', 'resourceId', 'published', 'hidden',
  'selectedForDirectory', 'selected', 'slug',
];
const creatorTableActions = [
  'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem',
  'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:ConditionCheckItem',
].sort();
const referencedResourceFields = ['id', 'recordType', 'url', 'registrationUrl'];
const catalogTableActions = [
  'dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem',
  'dynamodb:Scan', 'dynamodb:ConditionCheckItem',
].sort();

async function readTemplate(filename) {
  const source = await readFile(new URL(`../infra/${filename}.yaml`, import.meta.url), 'utf8');
  const normalized = source
    .replace(/Target: !Join\s+- ''\s+-\s+- integrations\/\s+- !Ref SubmissionIntegration/u, 'Target: integrations/SubmissionIntegration')
    .replace(/!(?:Ref|GetAtt|Sub|Not|Equals)\s*/gu, '');
  return parse(normalized);
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function strings(value) {
  return asArray(value).map(String);
}

function policyStatements(template, roleName) {
  return template.Resources[roleName].Properties.Policies.flatMap((policy) => policy.PolicyDocument.Statement);
}

function actions(statement) {
  return strings(statement.Action).sort();
}

function resourceText(statement) {
  return JSON.stringify(statement.Resource);
}

function scanStatements(template, roleName) {
  return policyStatements(template, roleName).filter((statement) => actions(statement).includes('dynamodb:Scan'));
}

function scanFields(statement) {
  assert.equal(statement.Condition.StringEquals['dynamodb:Select'], 'SPECIFIC_ATTRIBUTES');
  return statement.Condition['ForAllValues:StringEquals']['dynamodb:Attributes'];
}

async function runtimeProjection(readPage) {
  let request;
  await readPage((parameters) => {
    request = parameters;
    return { Items: [] };
  }, 'projection-test');
  const fields = request.ProjectionExpression.split(',').map((attribute) => {
    const name = attribute.trim();
    return request.ExpressionAttributeNames?.[name] ?? name;
  });
  assert.equal(fields.length, new Set(fields).size, 'runtime scan projection has no duplicate fields');
  return fields;
}

function findStatement(statements, resourceNeedle, requiredAction) {
  const statement = statements.find((candidate) => resourceText(candidate).includes(resourceNeedle)
    && actions(candidate).includes(requiredAction));
  assert.ok(statement, `expected ${requiredAction} on ${resourceNeedle}`);
  return statement;
}

function assertProjectedTargetRead(statements, resourceNeedle) {
  const statement = statements.find((candidate) => actions(candidate).length === 1
    && actions(candidate)[0] === 'dynamodb:GetItem'
    && resourceText(candidate).includes(resourceNeedle)
    && candidate.Condition?.['ForAllValues:StringEquals']?.['dynamodb:Attributes']);
  assert.ok(statement, `expected projected GetItem on ${resourceNeedle}`);
  assert.deepEqual(statement.Condition['ForAllValues:StringEquals']['dynamodb:Attributes'], referencedResourceFields);
  assert.equal(statement.Condition['ForAllValues:StringLike']?.['dynamodb:LeadingKeys'], undefined,
    'target validation has no partition-prefix restriction');
  assert.equal(statement.Condition['ForAllValues:StringEquals']['dynamodb:LeadingKeys'], undefined,
    'target validation allows legacy resource IDs outside writer-owned prefixes');
  return statement;
}

test('accounts stack retains the PK/SK profiles table and a private temporary-photo bucket', async () => {
  const template = await readTemplate('accounts');
  assert.deepEqual(Object.keys(template.Parameters).sort(), [
    'ArtifactBucket', 'ArtifactKey', 'CognitoDomainPrefix', 'SesFromAddress', 'SesReplyToAddress', 'SesSourceArn',
  ]);
  assert.equal(template.Resources.UserPool.Properties.EmailConfiguration.From, 'SesFromAddress');
  assert.equal(template.Resources.UserPool.Properties.EmailConfiguration.ReplyToEmailAddress, 'SesReplyToAddress');
  assert.equal(template.Resources.UserPool.Properties.EmailConfiguration.SourceArn, 'SesSourceArn');
  assert.deepEqual(template.Resources.UserPoolClient.Properties.CallbackURLs, ['https://dondeaprendoaws.com/cuenta/callback/']);
  assert.deepEqual(template.Resources.UserPoolClient.Properties.LogoutURLs, ['https://dondeaprendoaws.com/cuenta/']);

  const accounts = template.Resources.AccountsTable;
  assert.equal(accounts.Properties.TableName, 'donde-aprendo-aws-accounts');
  assert.equal(accounts.Properties.BillingMode, 'PAY_PER_REQUEST');
  assert.deepEqual(accounts.Properties.KeySchema, [{ AttributeName: 'pk', KeyType: 'HASH' }]);

  const profiles = template.Resources.CreatorProfilesTable;
  assert.equal(profiles.Type, 'AWS::DynamoDB::Table');
  assert.equal(profiles.DeletionPolicy, 'Retain');
  assert.equal(profiles.UpdateReplacePolicy, 'Retain');
  assert.equal(profiles.Properties.TableName, 'donde-aprendo-aws-profiles');
  assert.equal(profiles.Properties.BillingMode, 'PAY_PER_REQUEST');
  assert.deepEqual(profiles.Properties.KeySchema, [
    { AttributeName: 'pk', KeyType: 'HASH' },
    { AttributeName: 'sk', KeyType: 'RANGE' },
  ]);

  const bucket = template.Resources.CreatorPhotosBucket;
  assert.equal(bucket.Type, 'AWS::S3::Bucket');
  assert.equal(bucket.DeletionPolicy, 'Retain');
  assert.equal(bucket.UpdateReplacePolicy, 'Retain');
  assert.match(bucket.Properties.BucketName, /^donde-aprendo-aws-creator-photos-/u);
  assert.deepEqual(bucket.Properties.PublicAccessBlockConfiguration, {
    BlockPublicAcls: true,
    BlockPublicPolicy: true,
    IgnorePublicAcls: true,
    RestrictPublicBuckets: true,
  });
  assert.deepEqual(bucket.Properties.OwnershipControls.Rules, [{ ObjectOwnership: 'BucketOwnerEnforced' }]);
  assert.equal(bucket.Properties.BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.SSEAlgorithm, 'AES256');
  assert.deepEqual(bucket.Properties.CorsConfiguration.CorsRules, [{
    AllowedHeaders: ['*'],
    AllowedMethods: ['POST'],
    AllowedOrigins: ['https://dondeaprendoaws.com'],
    MaxAge: 300,
  }]);
  assert.deepEqual(bucket.Properties.LifecycleConfiguration.Rules, [{
    Id: 'ExpireTemporaryCreatorPhotoUploads',
    Status: 'Enabled',
    Prefix: 'photos/tmp/',
    ExpirationInDays: 1,
  }]);
  assert.equal(template.Resources.CreatorPhotosBucket.Properties.WebsiteConfiguration, undefined);
});

test('Amplify compute gets app access to creator tables and only temporary/final photo objects', async () => {
  const template = await readTemplate('accounts');
  const statements = policyStatements(template, 'AccountsComputeRole');
  const account = findStatement(statements, 'AccountsTable.Arn', 'dynamodb:PutItem');
  assert.deepEqual(actions(account), [
    'dynamodb:DeleteItem', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
  ]);
  const profiles = findStatement(statements, 'CreatorProfilesTable.Arn', 'dynamodb:ConditionCheckItem');
  assert.deepEqual(actions(profiles), creatorTableActions);
  const catalog = findStatement(statements, 'table/donde-aprendo-aws-catalog', 'dynamodb:ConditionCheckItem');
  assert.deepEqual(actions(catalog), catalogTableActions);

  const photoPolicy = statements.find((statement) => actions(statement).includes('s3:PutObject'));
  assert.ok(photoPolicy);
  assert.deepEqual(actions(photoPolicy), ['s3:DeleteObject', 's3:GetObject', 's3:PutObject']);
  assert.deepEqual(strings(photoPolicy.Resource).sort(), [
    '${CreatorPhotosBucket.Arn}/photos/final/*',
    '${CreatorPhotosBucket.Arn}/photos/tmp/*',
  ]);
  assert.equal(actions(photoPolicy).includes('s3:ListBucket'), false);
});

test('static build and hourly publication scan only the catalog and public creator projections', async () => {
  const [catalogTemplate, publicationTemplate] = await Promise.all([
    readTemplate('catalog'),
    readTemplate('publication'),
  ]);
  const runtimeCatalogFields = await runtimeProjection(scanCatalogItems);
  const runtimeCreatorFields = await runtimeProjection(scanCreatorItems);
  assert.deepEqual([...runtimeCatalogFields].sort(), [...publicCatalogFields].sort());
  assert.deepEqual([...runtimeCreatorFields].sort(), [...publicCreatorFields].sort());
  for (const [template, roleName, catalogResource] of [
    [catalogTemplate, 'AmplifyBuildRole', 'Catalog.Arn'],
    [publicationTemplate, 'PublicationRole', 'table/${CatalogTableName}'],
  ]) {
    const scans = scanStatements(template, roleName);
    assert.equal(scans.length, 2);
    const catalogScan = findStatement(scans, catalogResource, 'dynamodb:Scan');
    const profileScan = findStatement(scans, 'table/donde-aprendo-aws-profiles', 'dynamodb:Scan');
    const allowedCatalogFields = scanFields(catalogScan);
    const allowedCreatorFields = scanFields(profileScan);
    assert.deepEqual([...allowedCatalogFields].sort(), [...publicCatalogFields].sort());
    assert.deepEqual([...allowedCreatorFields].sort(), [...publicCreatorFields].sort());
    for (const field of runtimeCatalogFields) {
      assert.ok(allowedCatalogFields.includes(field), `${roleName} allows runtime catalog projection field ${field}`);
    }
    for (const field of runtimeCreatorFields) {
      assert.ok(allowedCreatorFields.includes(field), `${roleName} allows runtime creator projection field ${field}`);
    }
    for (const statement of scans) {
      assert.doesNotMatch(JSON.stringify(scanFields(statement)), /email|socials|photo|accountId|claim|evidence/iu);
      assert.doesNotMatch(resourceText(statement), /accounts|sessions/iu);
    }
  }

  const functionEnvironment = publicationTemplate.Resources.PublicationFunction.Properties.Environment.Variables;
  assert.equal(functionEnvironment.CATALOG_TABLE, 'CatalogTableName');
  assert.equal(functionEnvironment.CREATOR_PROFILES_TABLE, 'donde-aprendo-aws-profiles');
  assert.equal(functionEnvironment.AMPLIFY_APP_ID, 'AmplifyAppId');
  assert.equal(functionEnvironment.AMPLIFY_BRANCH, 'AmplifyBranchName');
  const state = policyStatements(publicationTemplate, 'PublicationRole').find((statement) =>
    actions(statement).includes('dynamodb:GetItem') && actions(statement).includes('dynamodb:UpdateItem'));
  assert.ok(state);
  assert.deepEqual(actions(state), ['dynamodb:GetItem', 'dynamodb:UpdateItem']);
  assert.deepEqual(state.Condition['ForAllValues:StringEquals']['dynamodb:LeadingKeys'], ['__system#publication']);
});

test('catalog writers can read and transact only on resource and URL-reservation IDs', async () => {
  const [submission, meetup] = await Promise.all([
    readTemplate('submissions'),
    readTemplate('meetup-events'),
  ]);
  const submissionStatements = policyStatements(submission, 'SubmissionRole');
  const submissionWrite = findStatement(submissionStatements, 'table/${CatalogTableName}', 'dynamodb:PutItem');
  assert.deepEqual(actions(submissionWrite), [
    'dynamodb:GetItem', 'dynamodb:PutItem',
  ]);
  assert.deepEqual(submissionWrite.Condition['ForAllValues:StringLike']['dynamodb:LeadingKeys'], ['resource-*', '__url#*']);
  assertProjectedTargetRead(submissionStatements, 'table/${CatalogTableName}');

  const meetupStatements = policyStatements(meetup, 'MeetupEventsRole');
  const meetupWrite = findStatement(meetupStatements, 'table/${CatalogTableName}', 'dynamodb:UpdateItem');
  assert.deepEqual(actions(meetupWrite), [
    'dynamodb:DeleteItem', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
  ]);
  assert.deepEqual(meetupWrite.Condition['ForAllValues:StringLike']['dynamodb:LeadingKeys'], ['meetup-event-*', '__url#*']);
  assertProjectedTargetRead(meetupStatements, 'table/${CatalogTableName}');
  assert.equal(scanStatements(meetup, 'MeetupEventsRole').length, 1);

  const templates = await Promise.all([
    readTemplate('accounts'), readTemplate('catalog'), readTemplate('publication'),
  ]);
  for (const template of [submission, meetup, ...templates]) {
    assert.doesNotMatch(JSON.stringify(template.Resources), /dynamodb:\*|dynamodb:TransactWriteItems/u);
  }
});

test('referenced legacy resource validation uses exactly the IAM public URL projection', async () => {
  const requestedUrl = 'https://example.com/legacy';
  const reservationId = currentUrlReservationId(requestedUrl);
  const reads = [];
  const result = await putCatalogResourceOnce({
    tableName: 'catalog',
    item: { id: 'resource-new', url: requestedUrl },
    getItem: async (parameters) => {
      reads.push(parameters);
      if (parameters.Key.id === 'resource-new') return { Item: undefined };
      if (parameters.Key.id === reservationId) {
        return { Item: {
          id: reservationId,
          recordType: 'urlReservation',
          url: requestedUrl,
          status: 'reserved',
          version: 1,
          resourceId: 'meetup-legacy-event',
        } };
      }
      if (parameters.Key.id === 'meetup-legacy-event') {
        return { Item: {
          id: 'meetup-legacy-event', recordType: 'event', registrationUrl: requestedUrl,
        } };
      }
      assert.fail(`unexpected catalog read ${parameters.Key.id}`);
    },
    transactWrite: async () => assert.fail('duplicate URL must not write'),
  });

  assert.equal(result.status, 'duplicate');
  assert.deepEqual(result.resourceIds, ['meetup-legacy-event']);
  const targetRead = reads.at(-1);
  assert.equal(targetRead.ConsistentRead, true);
  assert.deepEqual(
    Object.values(targetRead.ExpressionAttributeNames),
    referencedResourceFields,
  );
  assert.deepEqual(
    targetRead.ProjectionExpression.split(',').map((field) => targetRead.ExpressionAttributeNames[field]),
    referencedResourceFields,
  );
});
