# ¿Dónde Aprendo AWS?

Static directory, community event agenda, and blog built with Astro and hosted on AWS Amplify. DynamoDB owns the catalog; site code and blog articles are files in Git. Codex is an editing tool, not a content store.

The production site is https://dondeaprendoaws.com/. Its contribution form stores pending submissions through the owned API. `/blog/` retains the original 15-card index, and all 196 inventoried article paths are generated from Git files. The `www` and default Amplify hostnames redirect to the apex. Google Analytics uses the existing `G-3NXS6QFKHZ` property and loads only on the apex.

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

After either static build, run `npm run verify:blog` and `npm run verify:site` to check the 15-card index, all 196 original article routes, owned assets, sitemap, indexing mode, and Analytics tags. Pass the same `PUBLIC_PRODUCTION` and `PUBLIC_SITE_ORIGIN` values to the verifiers that you used for the build. CI tests both preview and production build modes; Amplify checks its active mode after each build.

Do not set `CATALOG_FIXTURE` for an Amplify deployment or combine it with `CATALOG_TABLE`. Never commit credentials, submission contact information, or raw database dumps.

## Blog editing

Edit the article Markdown files in `src/content/blog/` and keep their images in `public/assets/blog/`. Frontmatter controls title, date, description, cover image, related cards, and the current index order. HTML blocks in articles preserve source structures such as figures and tables. See [blog behavior](docs/intent/blog.md) for the content contract.

The production build uses `PUBLIC_SITE_ORIGIN=https://dondeaprendoaws.com` for absolute social-image URLs; canonical URLs use the same domain. Avoid reintroducing Unicorn or SEObot scripts or remote media in article files.

## Production hosting

The `main` Amplify branch has `PUBLIC_PRODUCTION=true` and `PUBLIC_SITE_ORIGIN=https://dondeaprendoaws.com`. Its build emits indexable pages and a 198-URL sitemap. The single Analytics loader runs only on the apex hostname. Amplify manages the apex and `www` DNS records and certificate; `www` and `main.d33kh9d3cyassq.amplifyapp.com` redirect to the apex, preserving paths. Keep those branch variables and redirects when updating the app. An hourly publication check starts a fresh build when approved public catalog data changes.

The submission stack permits both the apex and default Amplify origins. Preserve its Lambda artifact key and catalog table when updating CORS or code. If a content deployment fails, Amplify keeps the prior deployed revision; inspect the failed job before starting another. Check the custom-domain association, redirects, Route 53 apex/`www` records, and email records before changing hosting. A previous successful Amplify revision can be rebuilt from Git if a new content revision regresses.

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

## Automatic catalog publication

The publication stack uses an hourly EventBridge rule and a Node.js 24 Lambda. It reads the same public fields as the site build, hashes only published records, and stores the last successfully deployed hash in the reserved `__system#publication` item of the existing catalog table. A short conditional lease on that item prevents overlapping Lambda checks. Pending submissions and private contact edits do not trigger builds. While an Amplify build is running, the Lambda waits for the next check. A failed job raises a Lambda error and a CloudWatch alarm; the next hourly check retries. The alarm sends email through SNS when an alert address is configured and its subscription is confirmed.

Package the Lambda from the checked-out revision and upload it to the directory stack's private artifacts bucket under its content hash:

```sh
npm run package:publication
aws sts get-caller-identity
aws s3 cp build/publication.zip s3://ARTIFACT_BUCKET/publication/SHA256.zip --region us-east-1
```

Read `DeploymentArtifactsBucket` from the directory stack and `sha256` from `build/publication.json`. Deploy `infra/publication.yaml` as stack `donde-aprendo-aws-publication` with parameters `CatalogTableName=donde-aprendo-aws-catalog`, `AmplifyAppId=d33kh9d3cyassq`, `ArtifactBucket=ARTIFACT_BUCKET`, `ArtifactKey=publication/SHA256.zip`, and `AlertEmail=ADDRESS` when an address is known. Review a CloudFormation change set before applying future updates. The recipient must confirm the SNS subscription email. Keep the rule, function, and alarm together in this stack; the original catalog table is not replaced.

The scheduler checks hourly, so an approved change normally reaches the site within about an hour plus the Amplify build. It also rebuilds after a published event's end instant; browser code removes the event from the upcoming list immediately while the static snapshot catches up. The Lambda checks a tracked build on the next invocation before recording its hash as published. It starts no new build when the public hash is unchanged. A Git push also builds the site; this check may make one conservative extra build if Git published a catalog change that its state has not recorded. Build failures leave the previous site available. Inspect the Amplify job and CloudWatch log group `/aws/lambda/donde-aprendo-aws-publication` when the alarm fires. `npm run publish` remains a manual immediate-build command; it does not update the hourly Lambda's recorded hash.

## Moderate catalog changes

The form writes new records to `donde-aprendo-aws-catalog` with `published=false`. In the DynamoDB console for account `719535286359`, region `us-east-1`, inspect the pending record and its private `submitterName`/`submitterEmail` fields. Edit public fields as needed, including `kind` (`content`, `source`, or `community`), a compatible `format`, and up to three `topics`. The legacy `category` field remains for compatibility; public filters use the three new fields. If verified, set `country` to a supported two-letter country code, `level` (`inicial`, `intermedio`, or `avanzado`) for learning content, and `sourceId` or `communityId` to the stable ID of a published related card. Set `featured=true` only for an editorial recommendation. On approval, set `addedAt` to the actual approval date in `YYYY-MM-DD` format; leave it absent for older records whose date is unknown. Set `published` to the Boolean `true` to approve, or `false` to hide. The hourly Lambda publishes the change automatically. To request an immediate build instead, run:

```sh
npm run publish
```

This starts a **fresh build from Git**, reads the current table, and waits for its deployment. It does not redeploy an old artifact. Changes are visible only after the job succeeds; if a build fails, the previous deployed site remains available. The command prints the job ID so an interrupted wait can be resumed by inspecting that job in Amplify before starting another.

Git pushes to the connected branch also rebuild the site. There is no immediate DynamoDB change trigger or synchronization of resource records into Git.

The API conditionally creates one record per exact submitted URL. If an owner edits a record's URL later, its stable ID still represents the originally submitted URL; review possible duplicates when moderating. Contributor contact values remain in DynamoDB and must not be copied into public fields or Git.

## Event agenda editing

Create an event directly in the same DynamoDB table with a unique `id`, `recordType` set to `event`, `title`, `description`, `startsAt`, `endsAt`, `timeZone`, `organizer`, `mode`, and `registrationUrl`. Use full ISO timestamps with an explicit UTC offset for start and end, and an IANA zone such as `America/Asuncion` for display. `endsAt` must be after `startsAt`. Use `mode=online`, `in-person`, or `hybrid`; add `place` for a physical or hybrid event. Keep `published=false` until the details and registration link are verified, then set the Boolean to `true`. Only those public event fields are projected into the site. To connect a new recording, create or edit a published **Aprender** record with `kind=content`, `format=Video` (or its actual format), and `eventId` equal to the event's ID. The recording stays in Aprender when the event ends. The owner currently enters event details in DynamoDB; the public form is for resource submissions.

## Verification

GitHub Actions runs `npm run check`, `npm test`, both Lambda packaging commands, a packaged submission-handler smoke call against a local DynamoDB stub, and an explicitly selected fixture build. Amplify runs the site checks and builds from the live table. A successful fixture build does not prove that AWS access or live catalog publication works; verify the deployed directory, form, and database-change → fresh-build behavior as part of delivery.

See [directory behavior](docs/intent/directory.md) and [blog behavior](docs/intent/blog.md) for the content and publication rules.
