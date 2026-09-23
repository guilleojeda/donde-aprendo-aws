import { AmplifyClient, GetJobCommand, StartJobCommand } from '@aws-sdk/client-amplify';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { setTimeout } from 'node:timers/promises';
import deployment from '../config/deployment.json' with { type: 'json' };

const appId = process.env.AMPLIFY_APP_ID || deployment.appId;
if (!appId) {
  throw new Error('Connect the Amplify app and set its appId in config/deployment.json or AMPLIFY_APP_ID.');
}

const { Account } = await new STSClient({ region: deployment.region }).send(new GetCallerIdentityCommand({}));
if (Account !== deployment.accountId) {
  throw new Error(`Refusing to publish in account ${Account}; expected ${deployment.accountId}.`);
}

const client = new AmplifyClient({ region: deployment.region });
const { jobSummary } = await client.send(new StartJobCommand({
  appId,
  branchName: deployment.branchName,
  jobType: 'RELEASE',
  jobReason: 'Publish approved directory content',
}));
if (!jobSummary?.jobId) throw new Error('Amplify did not return a build job ID.');

console.log(`Started fresh build ${jobSummary.jobId} for ${deployment.branchName}.`);
let previousStatus;
for (;;) {
  const { job } = await client.send(new GetJobCommand({
    appId,
    branchName: deployment.branchName,
    jobId: jobSummary.jobId,
  }));
  const summary = job?.summary;
  if (!summary) throw new Error(`Could not read build ${jobSummary.jobId}; check it before starting another.`);
  if (summary.status !== previousStatus) {
    console.log(`Build ${summary.jobId}: ${summary.status}`);
    previousStatus = summary.status;
  }
  if (summary.status === 'SUCCEED') {
    console.log(`Published revision ${summary.commitId} at https://${deployment.branchName}.${appId}.amplifyapp.com/`);
    break;
  }
  if (['FAILED', 'CANCELLED'].includes(summary.status)) {
    throw new Error(`Build ${summary.jobId} ${summary.status.toLowerCase()}; the new catalog has not been published.`);
  }
  await setTimeout(15_000);
}
