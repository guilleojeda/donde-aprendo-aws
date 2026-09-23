# ¿Dónde Aprendo AWS?

Static directory built with Astro and hosted on AWS Amplify. DynamoDB owns the resource catalog; site code and blog articles are files in Git. Codex is an editing tool, not a content store.

The directory preview is hosted at https://main.d33kh9d3cyassq.amplifyapp.com/. Blog and contribution links lead to the existing production site while those capabilities are migrated. The preview is not indexed and does not send Google Analytics pageviews. Production analytics will retain `G-3NXS6QFKHZ` when the domain is migrated.

## Development

Use the Node version in `.nvmrc`, then install the pinned dependencies:

```sh
nvm use
npm ci
npm run check
npm test
CATALOG_FIXTURE=tests/fixtures/catalog.json npm run dev
```

`CATALOG_FIXTURE` deliberately selects synthetic local/CI data. It is never an automatic fallback for a missing table or a failed AWS read. To build the real directory, use your normal short-lived AWS session:

```sh
AWS_REGION=us-east-1 CATALOG_TABLE=donde-aprendo-aws-catalog npm run build
npm run preview
```

Do not set `CATALOG_FIXTURE` for an Amplify deployment or combine it with `CATALOG_TABLE`. Never commit credentials, submission contact information, or raw database dumps.

## AWS setup

The target is account `719535286359`, region `us-east-1`. Non-secret deployment identifiers are in `config/deployment.json`.

Confirm your identity before provisioning:

```sh
aws sts get-caller-identity
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name donde-aprendo-aws-directory \
  --template-file infra/catalog.yaml \
  --capabilities CAPABILITY_IAM
```

The template creates the on-demand catalog table and an Amplify role that can only scan that table. The table is retained if the stack is removed. Amplify's one-time GitHub connection is configured through its supported GitHub App flow; hosting does not need a custom repository-access service or an embedded access token.

Connect Amplify in `us-east-1` to `guilleojeda/donde-aprendo-aws`, branch `main`. Assign the role from the stack's `AmplifyBuildRoleArn` output, and set `CATALOG_TABLE=donde-aprendo-aws-catalog` in the build environment. The loader uses Amplify's AWS region or the configured us-east-1 default; do not create a custom AWS_-prefixed Amplify environment variable. Use `amplify.yml` for the build. Record the resulting app ID in `config/deployment.json`. Keep the existing custom domain unchanged until the full migration is verified.

## Initial catalog import

The import command accepts the original TSV path and creates each current entry with `published=true`. It uses conditional creation so rerunning it does not overwrite subsequent edits or republish an entry that has been hidden. The TSV is a one-time migration input, not another editable production catalog.

Use `npm run import:catalog -- --help` for arguments and a dry run before writing. The command checks the AWS account before writes. Preserve the source file locally; do not commit future private submission exports.

## Publish catalog changes

Edit the record directly in DynamoDB. `published` must be a Boolean: `true` includes the entry; `false` excludes it. Then run:

```sh
npm run publish
```

This starts a **fresh build from Git**, reads the current table, and waits for its deployment. It does not redeploy an old artifact. Changes are visible only after the job succeeds; if a build fails, the previous deployed site remains available. The command prints the job ID so an interrupted wait can be resumed by inspecting that job in Amplify before starting another.

Git pushes to the connected branch also rebuild the site. There is no automatic DynamoDB change trigger or synchronization of resource records into Git.

## Verification

GitHub Actions runs `npm run check`, `npm test`, and an explicitly selected fixture build. Amplify runs the same checks and builds from the live table. A successful fixture build does not prove that AWS access or live catalog publication works; verify the deployed directory and the database-change → fresh-build behavior as part of delivery.

See [directory behavior](docs/intent/directory.md) for the content and publication rules.
