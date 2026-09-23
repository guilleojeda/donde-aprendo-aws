# ¿Dónde Aprendo AWS?

Static directory built with Astro and hosted on AWS Amplify. DynamoDB owns the resource catalog; site code is in Git. The existing blog stays on the original site until its articles are migrated as Git files. Codex is an editing tool, not a content store.

The directory preview is hosted at https://main.d33kh9d3cyassq.amplifyapp.com/. Its contribution form stores pending submissions through the owned API; Blog still leads to the original site. The preview is not indexed and does not send Google Analytics pageviews. Production analytics will retain `G-3NXS6QFKHZ` when the domain is migrated.

## Development

Use the Node version in `.nvmrc`, then install the pinned dependencies:

```sh
nvm use
npm ci
npm run check
npm test
CATALOG_FIXTURE=tests/fixtures/catalog.json PUBLIC_SUBMISSION_API_URL=https://api.example.invalid/submissions npm run dev
```

`CATALOG_FIXTURE` deliberately selects synthetic local/CI data. It is never an automatic fallback for a missing table or a failed AWS read. To build the real directory, use your normal short-lived AWS session:

```sh
AWS_REGION=us-east-1 CATALOG_TABLE=donde-aprendo-aws-catalog PUBLIC_SUBMISSION_API_URL=YOUR_SUBMISSION_ENDPOINT npm run build
npm run preview
```

Do not set `CATALOG_FIXTURE` for an Amplify deployment or combine it with `CATALOG_TABLE`. Never commit credentials, submission contact information, or raw database dumps.

## AWS setup

The target is account `719535286359`, region `us-east-1`. Non-secret deployment identifiers are in `config/deployment.json`.

Confirm your identity before provisioning. This directory stack already exists; inspect a CloudFormation change set before updating it, and proceed only if the existing catalog table and Amplify role are not replaced. The deploy command below then applies that reviewed template:

```sh
aws sts get-caller-identity
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name donde-aprendo-aws-directory \
  --template-file infra/catalog.yaml \
  --capabilities CAPABILITY_IAM
```

The template creates the on-demand catalog table, an Amplify role that can scan only the public attributes, and a private bucket for Lambda deployment artifacts. The table and bucket are retained if the stack is removed. Amplify's one-time GitHub connection is configured through its supported GitHub App flow; hosting does not need a custom repository-access service or an embedded access token.

Amplify is connected in `us-east-1` to `guilleojeda/donde-aprendo-aws`, branch `main`, with `CATALOG_TABLE=donde-aprendo-aws-catalog` and the role from `AmplifyBuildRoleArn`. Set `PUBLIC_SUBMISSION_API_URL` to the full endpoint output by the submission stack, preserving `CATALOG_TABLE`. The loader uses Amplify's AWS region or the configured us-east-1 default; do not create a custom AWS_-prefixed Amplify environment variable. Use `amplify.yml` for the build. The app ID is in `config/deployment.json`. Keep the existing custom domain unchanged until the full migration is verified.

## Submission API deployment

The API uses `infra/submissions.yaml`, a Node.js 24 Lambda, and the existing catalog table. Build its zip from the checked-out Git revision:

```sh
npm run package:submission
aws sts get-caller-identity
aws cloudformation describe-stacks --region us-east-1 --stack-name donde-aprendo-aws-directory --query 'Stacks[0].Outputs'
```

Read `DeploymentArtifactsBucket` from the stack outputs and `sha256` from `build/submission.json`. Upload the zip under a key containing that hash, then deploy the submission stack with that exact key:

```sh
aws s3 cp build/submission.zip s3://ARTIFACT_BUCKET/submission/SHA256.zip --region us-east-1
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name donde-aprendo-aws-submissions \
  --template-file infra/submissions.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides CatalogTableName=donde-aprendo-aws-catalog ArtifactBucket=ARTIFACT_BUCKET ArtifactKey=submission/SHA256.zip
aws cloudformation describe-stacks --region us-east-1 --stack-name donde-aprendo-aws-submissions --query 'Stacks[0].Outputs'
```

The `SubmissionEndpoint` output is the value for Amplify's `PUBLIC_SUBMISSION_API_URL`. Do not publish the site with a missing endpoint. On later Lambda code updates, package and upload the new zip under its new hash and redeploy the stack with the new `ArtifactKey`.

## Initial catalog import

The import command accepts the original TSV path and creates each current entry with `published=true`. It uses conditional creation so rerunning it does not overwrite subsequent edits or republish an entry that has been hidden. The TSV is a one-time migration input, not another editable production catalog.

Use `npm run import:catalog -- --help` for arguments and a dry run before writing. The command checks the AWS account before writes. Preserve the source file locally; do not commit future private submission exports.

## Publish catalog changes

The form writes new records to `donde-aprendo-aws-catalog` with `published=false`. In the DynamoDB console for account `719535286359`, region `us-east-1`, inspect the pending record and its private `submitterName`/`submitterEmail` fields. Edit public fields as needed. Set `published` to the Boolean `true` to approve, or `false` to hide. Then run:

```sh
npm run publish
```

This starts a **fresh build from Git**, reads the current table, and waits for its deployment. It does not redeploy an old artifact. Changes are visible only after the job succeeds; if a build fails, the previous deployed site remains available. The command prints the job ID so an interrupted wait can be resumed by inspecting that job in Amplify before starting another.

Git pushes to the connected branch also rebuild the site. There is no automatic DynamoDB change trigger or synchronization of resource records into Git.

The API conditionally creates one record per exact submitted URL. If an owner edits a record's URL later, its stable ID still represents the originally submitted URL; review possible duplicates when moderating. Contributor contact values remain in DynamoDB and must not be copied into public fields or Git.

## Verification

GitHub Actions runs `npm run check`, `npm test`, Lambda packaging, and an explicitly selected fixture build. Amplify runs the site checks and builds from the live table. A successful fixture build does not prove that AWS access or live catalog publication works; verify the deployed directory, form, and database-change → fresh-build behavior as part of delivery.

See [directory behavior](docs/intent/directory.md) for the content and publication rules.
