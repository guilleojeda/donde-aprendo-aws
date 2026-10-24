# ¿Dónde Aprendo AWS?

Static directory, dedicated learning, community and event pages, guided learning paths, certification guidance, blog archive, and unified search are built with Astro and hosted on AWS Amplify. Public creator profiles at `/c/<slug>/` render on demand; `/cuenta/`, `/cuenta/creador/`, `/cuenta/estadisticas/`, `/cuenta/administracion/`, authentication operations, APIs and 404 responses also run on demand. Public directory and blog pages remain prerendered. Published communities with a known country also get static community and event pages from the same DynamoDB catalog snapshot; `/comunidades/` remains the complete directory and `/eventos/` the overall agenda. DynamoDB owns the resource catalog and private creator/account state; site code, learning paths, certification guidance and blog articles are files in Git. Codex is an editing tool, not a content store.

The production site is https://dondeaprendoaws.com/. Its contribution form stores pending submissions through the owned API and shows the resulting reference ID and submission date. Resource and event cards include a contextual link to report incorrect data by email. `/blog/` presents six selected articles and links to the other 190 articles in a dated archive. `/recorridos/` links to existing blog and approved catalog entries in four editorial sequences. `/buscar/` searches those articles, paths and the approved catalog using a build-generated public index. Community cards link to their country's stable agenda and retain their community-specific event filter when upcoming events are available. Creator support defines public profile data and shared catalog links; creator highlights and directory selection are separate. The `www` and default Amplify hostnames redirect to the apex. Google Analytics uses the existing `G-3NXS6QFKHZ` property and loads only on the apex; the creator-page code sends `creator_view` and `creator_link_click` events with stable IDs when Analytics is available. The private creator dashboard reads GA4 reports through the server and retains aggregates in the profile table for caching and failure fallback.

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

`npm run preview` serves the mixed build locally on `127.0.0.1:4321`, including prerendered pages and Compute routes; use `-- --port PORT` to change the port. It needs a completed build. It rewrites existing static directory paths locally; production hostname redirects and Amplify custom rules must be checked on the deployed site. `npm run verify:preview` exercises this command's built HTTP output after building.

After either build, run `npm run verify:blog` and `npm run verify:site` to check the featured and archive links, all 196 article routes, search index, owned assets, sitemap, indexing mode, and Analytics tags. The static client is `.amplify-hosting/static`. Pass the same `PUBLIC_PRODUCTION` and `PUBLIC_SITE_ORIGIN` values to the verifiers that you used for the build. CI tests both preview and production build modes; Amplify checks its active mode after each build. The deployment also packages production dependencies in `.amplify-hosting/compute/default/node_modules` and runs `npm run verify:hosting` against the built server, not Astro's development server.

Do not set `CATALOG_FIXTURE` for an Amplify deployment or combine it with `CATALOG_TABLE`. Never commit credentials, submission contact information, or raw database dumps.

## Blog editing

Edit the article Markdown files in `src/content/blog/` and keep their images in `public/assets/blog/`. Frontmatter controls title, date, description, cover image, related cards, and the current index order. HTML blocks in articles preserve source structures such as figures and tables. See [blog behavior](docs/intent/blog.md) for the content contract.

The production build uses `PUBLIC_SITE_ORIGIN=https://dondeaprendoaws.com` for absolute social-image URLs; canonical URLs use the same domain. Avoid reintroducing Unicorn or SEObot scripts or remote media in article files.

## Certification editing

`/aprender/certificaciones/` shows the complete reviewed AWS credential offer and keeps the resource library below it. Cloud Practitioner, Solutions Architect Associate and AI Practitioner have their own preparation pages. Edit facts, sources, guidance, FAQs and selection context in `src/lib/certifications.mjs`; resource titles, URLs and publication still belong to DynamoDB, referenced by ID. The [certification contract and maintenance steps](docs/intent/certifications.md) explain review dates, exam transitions and how withdrawals or changed destinations affect a selection.

## Production hosting

The `main` Amplify branch has `PUBLIC_PRODUCTION=true` and `PUBLIC_SITE_ORIGIN=https://dondeaprendoaws.com`. Its build emits indexable content pages and a sitemap containing fixed site pages, blog articles, and community and event country pages generated from currently published communities; `/buscar/` is excluded with `noindex, follow`, and `/cuenta/` is private and excluded. The country-page count follows the published catalog. Analytics loads only on the apex and is omitted from account pages. Amplify manages the apex and `www` DNS records and certificate; `www` and `main.d33kh9d3cyassq.amplifyapp.com` redirect to the apex, preserving paths and queries.

Hosting uses platform `WEB_COMPUTE`, the community `astro-aws-amplify` adapter and explicit Node 24 runtime. The ordered rules in `config/amplify-custom-rules.json` rewrite fixed public route families to their static `index.html` files, retaining canonical-host and trailing-slash redirects. Account and unknown routes reach Compute. There is no `404-200` catchall: Astro renders missing-page HTML with HTTP 404 while retaining the requested URL. `/assets/*` is reserved to Static by the adapter and has no Compute fallback. Apply app routing explicitly with `aws amplify update-app --region us-east-1 --app-id d33kh9d3cyassq --custom-rules file://config/amplify-custom-rules.json`; Git builds do not apply those rules. After a routing update, verify missing routes/files, existing pages/assets and canonical redirects. An hourly publication check still starts a fresh build when approved catalog data changes.

Keep exact index rewrites before parameterized detail redirects: Amplify can match an empty parameter at an index path. Event detail slash normalization uses Astro's native routing so the same directory's `.ics` files reach Static without acquiring a trailing slash. Check calendar MIME on Amplify itself; the local adapter serves these files as generic binary content.

The submission stack permits both the apex and default Amplify origins. Preserve its Lambda artifact key and catalog table when updating CORS or code. If a deployment fails, Amplify keeps the prior deployed revision; inspect that job before starting another. Before changing hosting, retain its platform, app/branch variables, roles, routing and prior artifact/revision. Recovery from a hosting migration must restore that compatible set, not just rebuild an old commit against new rules. Check custom-domain association, apex/`www` DNS and existing email records before changing hosting.

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

## Account configuration and deployment

`/cuenta/` uses Cognito Essentials Managed Login in Spanish and SES transactional email. Registration, verification/re-send, login, logout and password recovery do not publish a creator page or assign catalog ownership. See [account behavior](docs/intent/accounts.md) for session, privacy and reset guarantees.

Before opening registration, verify the owned sender domain in SES `us-east-1`, add only its required DKIM CNAME records, and obtain production access. Preserve existing MX/TXT and other DKIM records. A verified domain in the SES sandbox is insufficient: users outside verified identities cannot receive their codes. Check `aws sesv2 get-account` and `get-email-identity`; a denied production request needs resolution through its AWS Support case. Do not silently switch to Cognito's limited default sender or verify every recipient as a substitute for open registration.

Package the reset trigger with `npm run package:password-reset`. Read `build/password-reset.json`, upload its ZIP to the existing `DeploymentArtifactsBucket` under its exact `s3Key`, and prepare a CloudFormation change set for `infra/accounts.yaml`, stack `donde-aprendo-aws-accounts`. Parameters are `ArtifactBucket`, `ArtifactKey`, `CognitoDomainPrefix`, `SesSourceArn`, `SesFromAddress`, `SesReplyToAddress` and `Ga4ReaderSecretArn` (see the GA4 setup below). Use the verified domain identity ARN and `contact@dondeaprendoaws.com` for sender/reply-to. Review the change set before execution. The stack retains the account table, creator-profile table, photo bucket and User Pool on removal. It does not replace the catalog; the compute role receives the table-level creator-application permissions listed below.

Read the stack outputs and set these variables on the intended Amplify branch. Creator support adds the profile table and photo bucket outputs to the existing account stack; review an update change set before applying it, retain the existing tables and Cognito resources, and preserve the current build role and variables.

| Variable | Value |
|---|---|
| `ACCOUNT_ORIGIN` | `https://dondeaprendoaws.com` |
| `COGNITO_ISSUER` | `AccountsIssuer` output, including `https://` |
| `COGNITO_CLIENT_ID` | `AccountsClientId` output |
| `COGNITO_DOMAIN` | `AccountsDomain` output, including `https://` |
| `ACCOUNTS_TABLE` | `AccountsTableName` output |
| `CREATOR_PROFILES_TABLE` | `CreatorProfilesTableName` output |
| `CREATOR_PHOTOS_BUCKET` | `CreatorPhotosBucketName` output |
| `CATALOG_TABLE` | Existing `donde-aprendo-aws-catalog` table |
| `GA4_PROPERTY_ID` | `424203315` |
| `GA4_CREDENTIALS_SECRET_ARN` | ARN passed as `Ga4ReaderSecretArn` |
| `CREATOR_ANALYTICS_CAPTURE_STARTED_AT` | `2026-10-23T23:38:00Z` (observed to minute precision) |

These identifiers are not credentials. The adapter copies exactly this allowlist into the private compute `.env`; it never copies the entire build environment. Associate `AccountsComputeRoleArn` with the `main` branch and use `WEB_COMPUTE`. This role reads and writes account and creator application records, reads and writes the catalog for creator operations, accesses only the temporary and final photo object paths, and reads only the configured GA4 credential secret; the static build and publication roles read only their public projections and do not gain access to account email or sessions. Do not attach this production authority to pull-request previews. Callback and logout URLs are fixed to the apex. Keep the `CREATOR_PROFILES_TABLE` value aligned with the account-stack output and the public build/publication configuration. The runtime uses Amplify's region or the existing `us-east-1` default; do not add a custom `AWS_REGION` variable.

The first administrator is provisioned by a controlled update to `isAdmin: true` on an existing private account record in `ACCOUNTS_TABLE`, after resolving the Cognito identity by issuer and `sub`. Do not grant it by email, profile name or a browser field. The app has no self-service administrator assignment, Cognito admin group or separate admin secret.

The photo bucket named by `CreatorPhotosBucketName` is private, blocks public S3 access, encrypts objects at rest and permits browser POST uploads only from the apex. It expires temporary uploads after one day. The app processes JPEG, PNG or WebP uploads up to 15 MiB and 40 megapixels into an oriented, metadata-stripped WebP variant at most 512 pixels per side; only that immutable version is served through `/media/fotos/<profileId>/<version>.webp`. If a profile-write acknowledgement is uncertain, the finished variant is retained because the profile may already reference it; final objects do not expire. Revisit cleanup only if observed orphan storage creates material cost.

### Creator URL migration and publication

Before allowing creator writes against the existing catalog, deploy the current URL-reservation-aware versions of the submission writer, catalog import tools and Meetup event sync. Arrange a short maintenance window for catalog writers, run the inventory first, then apply and verify the reservation migration before enabling the creator editor. The migration checks AWS account `719535286359`, scans every catalog page, backfills missing resource versions, and creates internal `__url#<sha256>` reservations keyed by the exact current URL, including query strings and trailing slashes. It does not merge duplicate resources or choose which permission wins. Duplicate URLs become collision records for manual review and cannot be automatically reused for editing.

```sh
node scripts/migrate-catalog-url-reservations.mjs --table donde-aprendo-aws-catalog --dry-run
node scripts/migrate-catalog-url-reservations.mjs --table donde-aprendo-aws-catalog --apply
node scripts/migrate-catalog-url-reservations.mjs --table donde-aprendo-aws-catalog --dry-run
```

Review the first report and any collisions before applying. Keep controlled writers paused during the apply and verification pass; enable only the current reservation-aware writers afterward. Do not restore an older submission/event writer that can add an unreserved URL. The migration is repeatable and verifies resource versions and reservation coverage after writing. `urlReservation` records are internal and never appear in the public directory.

Creator pages read current profile data on request. Directory membership remains a static snapshot produced by the hourly publication checker and a successful Amplify build, so an edit can take up to one hour plus build time to appear or disappear from the directory. The publisher must have `CREATOR_PROFILES_TABLE` set to the profile-table output and its scoped read projection before creator-controlled resources are enabled. Existing immediate `npm run publish` can start an update outside the hourly check.

### Private creator statistics and GA4 setup

Creators open `/cuenta/estadisticas/` for 7/30-day views, estimated period visitors, link clicks, daily activity and session source/medium. See [metric and access rules](docs/intent/creator-pages.md#estadísticas-privadas). Account/editor routes do not require Analytics credentials; published-profile statistics return a sanitized unavailable state if the reader cannot be used and no retained report exists.

GA4 creator events use property `424203315`, measurement ID `G-3NXS6QFKHZ`, with registered event-scoped custom dimensions `creator_id` and `link_id`. The capture start above records the first observed production capture; it is not a per-profile publication date. Reports can take 24–48 hours to process.

The reader uses Google Cloud project `guilleojeda-content-stats`, with Google Analytics Data API enabled. The service account `donde-aprendo-aws-stats@guilleojeda-content-stats.iam.gserviceaccount.com` has Viewer access to this GA4 property, no GCP project role, and uses only `https://www.googleapis.com/auth/analytics.readonly`. Keep its JSON key in Secrets Manager (`donde-aprendo-aws/ga4-reader`, us-east-1). Never put the JSON or access tokens in Amplify environment variables, repository files, public settings or logs. Amplify receives only the secret ARN, property ID and capture timestamp; `Ga4ReaderSecretArn` grants compute `GetSecretValue` on that exact ARN. Build/publication roles cannot read it.

For a fresh setup, create the read-only identity, register its property access and store its JSON key securely before updating the account stack with the secret ARN. Inspect `getMetadata`, `checkCompatibility` and actual reports using that identity to verify the custom dimensions, metrics, mandatory creator/event filters, property time zone and processed data. Realtime receipt alone does not prove reporting availability. Do not choose a broader GA4 role to repair an invalid report.

Aggregates use the existing profile table under `ANALYTICS#<profileId>` / `GA4#<propertyId>#v1#<period>#<page>`. Its TTL attribute is `ttl` in epoch seconds. Results are fresh for one hour, or until the property day changes, and retained up to seven days for failure fallback. The app validates expiry even before DynamoDB deletes an item. A failed cache read/write does not prevent a valid Data API result; failed or limited reports never become fabricated zeros. No catalog migration or writer pause is needed for these cache records.

To rotate the key, create a replacement for the same reader, update the existing Secrets Manager secret value without changing its ARN, and redeploy through Amplify so new runtime processes load the replacement. Verify a real dashboard miss before revoking the previous Google key. Warm authentication clients reuse the key loaded in their process; updating the secret alone is not proof that every running process has switched.

For unavailable data, distinguish missing configuration, Secrets Manager/IAM or Google Viewer/scope failures, API quota and normal processing delay. Retain only sanitized diagnostics; never print the credential, bearer token or full private account/session record. Quota/permission errors do not trigger repeated requests; the page shows its last successful report with the original timestamp/window, or an explicit retry state. Sampling, thresholds and grouped detail are disclosed when GA4 returns those limits.

`ACCOUNT_ORIGIN` must be an HTTPS origin and must match the build configuration, runtime configuration and exact Cognito callback/logout URLs. Astro's trusted proxy hostname and the built-runtime checks use that same value. An isolated test deployment needs its own narrowly scoped compute role and exact allowed URLs; remove that temporary configuration when the deployment is retired.

Local/CI fixture builds use explicit synthetic values for the origin, Cognito, account, profile-table and photo-bucket variables, as shown in the workflow, without contacting Cognito or sending emails. The selected `CATALOG_FIXTURE` replaces `CATALOG_TABLE`; do not set both. `npm test` exercises OIDC validation using signed test tokens and simulated transport. Full login/email/reset verification requires the deployed origin and real controlled mailboxes. The built-runtime check starts the packaged server and verifies private account responses, proxy-aware logout, real 404 behavior and that the editor/admin/statistics pages are not prerendered. Statistics fixture builds need no Google credential and never contact Data API.

The reset Lambda's log group is `/aws/lambda/donde-aprendo-aws-password-reset`. If recovery reports a trigger failure, inspect that invocation and the account's durable reset boundary; Cognito password changes and the private table are not one transaction. Never log passwords, codes, raw cookies or full user records. Release verification must show that old sessions lose access after recovery and that another account remains unaffected.

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

On a successful `201` response, the API returns `ok`, `code`, the stored `id`, and `submittedAt`; it does not return contributor contact fields. Deploy the updated Lambda before a site build that expects to show the full receipt.

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

The scheduler checks hourly, so an approved change normally reaches the site within about an hour plus the Amplify build. It also rebuilds after a published event's end instant; browser code immediately updates the agenda state and hides it only when Incluir eventos finalizados is unchecked. Homepage/search remain limited to upcoming/in-progress events while the static snapshot catches up. The Lambda checks a tracked build on the next invocation before recording its hash as published. It starts no new build when the public hash is unchanged. A Git push also builds the site; this check may make one conservative extra build if Git published a catalog change that its state has not recorded. Build failures leave the previous site available. Inspect the Amplify job and CloudWatch log group `/aws/lambda/donde-aprendo-aws-publication` when the alarm fires. `npm run publish` remains a manual immediate-build command; it does not update the hourly Lambda's recorded hash.

## Moderate catalog changes

New submissions start unpublished and remain outside the public directory until reviewed. Use `/cuenta/administracion/` with an administrator account to classify each resource (`kind`, compatible `format`, up to three `topics`, and the legacy `category` field), approve or revoke its directory approval, or hide and restore it. Approval requires a valid classification. Approving sets `published=true` and clears `approvalRevoked`; revoking sets `published=false` and records `approvalRevoked=true`. Hiding is a separate action that excludes the resource from public output while retaining its approval state. Do not moderate by editing these flags directly in DynamoDB. Contributor `submitterName` and `submitterEmail` remain private in the catalog and must never be copied into public fields or Git.

The hourly Lambda publishes approved changes automatically. To request an immediate build instead, run:

```sh
npm run publish
```

This starts a **fresh build from Git**, reads the current table, and waits for its deployment. It does not redeploy an old artifact. Changes are visible only after the job succeeds; if a build fails, the previous deployed site remains available. The command prints the job ID so an interrupted wait can be resumed by inspecting that job in Amplify before starting another.

Git pushes to the connected branch also rebuild the site. There is no immediate DynamoDB change trigger or synchronization of resource records into Git.

The API conditionally creates one record per exact submitted URL. A stable ID identifies the catalog resource, while a separate internal reservation tracks its current exact URL. URL changes must go through an authorized transactional editor that updates the resource and its reservation atomically; do not edit `url` or `registrationUrl` directly in DynamoDB. Existing reservation collisions need manual review and are never merged automatically. Contributor contact values remain private in DynamoDB and must not be copied into public fields or Git.

The report links on resource and event cards open an email draft to `contact@dondeaprendoaws.com` with public context. The visitor must send it. Investigate the referenced ID in DynamoDB, correct the authoritative record, and let the hourly publication check rebuild the site. The generic footer report link asks the sender to include the affected page. For an article report, edit the article in Git and deploy it through the normal branch workflow.

## Event agenda editing

Create a hand-curated event with a stable, unique `id`, `recordType=event`, `version=1`, `title`, `description`, `startsAt`, `endsAt`, `timeZone`, `organizer`, `mode`, and `registrationUrl`. Use full ISO timestamps with explicit UTC offsets, an IANA zone such as `America/Asuncion` for display, and ensure `endsAt` is after `startsAt`. Use `mode=online`, `in-person`, or `hybrid`; add `place` for a physical or hybrid event. Set `country` when the organizer's country is known. Start it with `published=false`. The event row and its current-URL reservation must be created together in one conditional DynamoDB `TransactWriteItems` operation: the reservation key is `__url#<sha256 of the exact registrationUrl>`, with `recordType=urlReservation`, `url` equal to that exact URL, `status=reserved`, `resourceId` equal to the event ID, and `version=1`. Do not use an isolated console `PutItem` for either row. There is no standalone event-creation CLI; use a reviewed checked writer or operation based on the existing transactional catalog writers. For a later registration URL change, update the event and transfer its URL reservation atomically through an authorized transactional editor. Only public event fields are projected into the site. To connect a new recording, create or edit a published **Aprender** record with `kind=content`, `format=Video` (or its actual format), and `eventId` equal to the event's ID. The recording stays in Aprender when the event ends. Use `/cuenta/administracion/` to approve, revoke, hide, or restore the event; the public form is for resource submissions.

### Spanish-language Latin American Meetup groups and events

`data/meetup-communities.json` is the reviewed snapshot of 88 AWS User Groups and 145 AWS Student Builder Groups from Spanish-speaking Latin America and the Caribbean as of 2026-09-28. `docs/meetup-user-groups-audit.csv` records the inclusion decision for each of the 429 User Groups in the supplied global directory. Brazilian groups and the English-language Jamaica group are excluded. Meetup classifies the Puerto Rico groups as US; the snapshot assigns them `PR`. The Macul campus group is classified as Mexico by Meetup but located in Santiago; the snapshot assigns it `CL`. Review additions individually for language before changing this file. `npm run import:meetup-communities -- --dry-run` validates all records; the real import verifies AWS account `719535286359` and conditionally creates approved DynamoDB records without overwriting existing IDs. Removing a group from this seed does not remove an imported item: revoke its approval in `/cuenta/administracion/` as well.

`donde-aprendo-aws-meetup-events` reads the published `meetup-<group-id>` records every hour, excluding groups in Brazil or Jamaica, subscribes to each group's public iCalendar feed, and reads the structured metadata of unsuppressed, non-cancelled events still listed there. Future Scheduled/Rescheduled events create or update `meetup-event-<event-id>` records with `published=true` when mapped fields change. Existing events keep their publication flag when they finish or disappear after their end time. A Scheduled/Rescheduled page whose end is past can refresh an existing record's facts, but its update omits `published`; a past event without a record is not imported. Repeating unchanged syncs does not write again. This also catches page edits whose feed `LAST-MODIFIED` did not change. The sync stores the approved `communityId` and, for physical events, `city` only when Meetup supplies `addressLocality`.

An explicit cancellation in the feed or page, another known valid nonpublishable page status, a future event's disappearance from a healthy feed, or removal of its organizing group from approved sync sources unpublishes the event. Cancellation and source removal apply to past events too. A complete feed containing only explicit cancellations does not need a timezone because those entries are retracted by identity without fetching or mapping their pages; scheduled entries still require a valid feed timezone. A missing, malformed or unknown page status is a source failure, not a cancellation. Publishable pages also require a string name that remains nonempty after trimming; an invalid name preserves the prior record and reports a source error before writing. Feed/page errors preserve the existing safeguards and raise an error for the CloudWatch alarm; healthy sources can still update. Existing hand-curated event records are never edited. To suppress a synced event editorially, revoke its approval in `/cuenta/administracion/`; this sets `published=false` and `approvalRevoked=true`, which the sync preserves and respects on later runs. Reapproving it in the admin page clears that override. `autoSync=false` is a separate source-update control, not a required moderation step. Absence-based retraction also checks the end time read, so it cannot overwrite a concurrent reschedule.

Retention starts with this policy; previously hidden past records are not automatically restored because their flags do not distinguish expiry from cancellation or other removal. The sync does not revisit every historical page absent from its feed, so later corrections/cancellations there require a catalog edit or a newly observed source entry. All public agendas include published ended events by default, with a session-local Incluir eventos finalizados checkbox. Reloading or opening a link checks it again; its value is not saved in URL/history/storage. Homepage and search still select upcoming/in-progress events. The agenda groups occurrences by canonical registration URL plus start instant (with the compatible title/venue fallback), keeps co-hosts and chooses a matching member for the current filters. Its count/summary use the complete selection before the twelve-card pagination. Every agenda has Semana/Mes and previous/next arrows, opening on the current Monday–Sunday week. The selected IANA zone defines calendar periods, primary dates/hours and the next-event summary; Más filtros allows changing it, and organizer times remain a separate reference. Events are included by duration overlap, so a multi-day event can appear in consecutive periods. Primary and organizer schedules show the end date when it differs from the start date in that zone. URL fields view/date/tz preserve a concrete period and zone, while legacy from/to links normalize to the week of their first valid date. Switching views keeps the reference date; month navigation clamps to the last valid day when necessary. History restores period/zone/filters without restoring checkbox state, and clearing filters keeps period/zone. An empty period does not clear valid filters or jump elsewhere. Links between agendas carry period/zone and explicit attendance/location/community filters; destination country or mode is an editable default. Explicit empty query fields can clear those defaults. Without JavaScript, every public route event remains in the HTML with its original links and organizer schedule; the notice explains that interactive period selection requires JavaScript. Past cards use Ver evento and integrate their recording link instead of a separate archive. Published recordings remain in Aprender. Every public event ID has its own .ics download, including past and co-host IDs; each file preserves the row's own UID/dates/URL. The download is not a subscription. Fragment links reveal past/co-host cards and release incompatible filters, opening their start period in the selected zone when necessary and using the global agenda when a route default is incompatible. Groups from Spanish-speaking Latin American countries remain on automatic sync even if an occasional event is in English; those exceptions are accepted editorially.

Attendance filters use physical location: Solo online includes online and hybrid remote access globally; Solo presencial includes physical and hybrid local access; Presencial + online combines both without duplicating hybrids. Country and city stay selected but disabled in Solo online. City identity ignores accents, case and repeated whitespace within the same country; equivalent options appear once and legacy city spellings resolve to that option without editing catalog facts. Community is an exact independent published ID. The three primary controls appear on every agenda, with community and zone in Más filtros. Every route carries the full public catalog; its static selection follows editable country/mode defaults, and the browser applies the requested week/month. A query overriding a default uses neutral visible heading/intro/title. Canonical/social metadata stay route-based, without promising filtered previews.

Strong registration identity keeps query parameters except the catalog's attribution keys `source` and `ref`; keys such as `id`, their values and order remain significant. This prevents distinct query-based registrations from being collapsed while preserving the independent title/start/venue grouping of co-hosts. Original URLs remain unchanged in cards, copied text and calendar downloads.

Compartir opens one native dropdown on every agenda. X and LinkedIn receive prepared, editable posts through native links; Copiar immediately writes the complete selection as plain text, with WhatsApp-style emphasis, full titles, original registration URLs, dates/hours in the selected zone, participation and ended labels, including occurrences beyond the twelve visible cards. LinkedIn lists every selected occurrence while its final body fits 3,000 UTF-16 units; above that it replaces the entire list with an explicit total and a link to the complete agenda. X uses the period, count, attendance/location context and agenda link, measured with twitter-text against 280 weighted characters including the trailing space observed in its editor. Only the city may be visibly abbreviated by grapheme; its exact value remains in the URL and in LinkedIn/Copiar. Both native links send the complete body and final agenda link through a single `text` parameter. LinkedIn text prefilling was observed in an authenticated web editor but has no public parameter contract found; fresh-login continuation and native mobile apps are not certified. Sharing builds a global `/eventos/` URL with concrete period/zone and effective attendance/location/community filters, dropping fragments, tracking and checkbox state. A recipient opens with ended events included, even if the sender excluded them, and later catalog changes can alter the selection. Copy reports success only after the browser confirms the write; a failure permits retry. The visitor confirms posting in the social network; previews retain the static global route metadata. The formatter imports the published but package-internal `dist/parseTweet.js` entry of pinned twitter-text 3.1.0 to avoid bundling unused exports; dependency upgrades need to preserve the Node and Astro import compatibility covered by the formatter tests and build.

Event `country` remains organizer country; optional `venueCountry` is the explicit physical country (two uppercase ASCII letters, independent of the organizer-country enum). Event `city` is explicit physical city; communities may expose a reviewed optional city. Effective location falls back to the organizer, borrowing a community city only when its country is compatible. Online events have no physical location. The derived fallback is not copied to DynamoDB, inferred from group names or labeled separately in the UI. Physical destinations follow the venue where a national route exists; remote events and unsupported venue routes use `/eventos/`. All three scan allowlists must admit venueCountry, and the publication package must include its public projection so edits affect the existing build fingerprint.

Package with `npm run package:meetup-events`, upload `dist/meetup-events.zip` to the private deployment artifacts bucket under a content-hashed key, and deploy `infra/meetup-events.yaml` as stack `donde-aprendo-aws-meetup-events`. Parameters are `CatalogTableName`, `ArtifactBucket`, `ArtifactKey`, `PublicationFunctionName=donde-aprendo-aws-publication`, and the existing publication `FailureTopicArn`. Confirm the CloudFormation change set before applying it. The sync Lambda invokes the publication checker after a catalog change; the original hourly publication check still handles manual approvals. Run `python3 scripts/import-meetup-events.py --dry-run` to audit the current feeds without AWS writes, or run it without the flag in the verified target account for a manual sync.

When a new public event field is added, update the DynamoDB scan allowlists in the directory and publication stacks before a site build reads it. Deploy the Meetup role and Lambda artifact together, then run one sync to populate newly supported fields on existing events. Package and deploy the updated publication Lambda too, so its public-data hash includes the new field and the hourly check rebuilds after later edits. Confirm the build and publication Lambdas can scan the table before relying on the hourly schedule.

## Verification

GitHub Actions runs `npm run check`, `npm test`, the Meetup sync unit tests, all three Lambda packaging commands, a packaged submission-handler smoke call against a local DynamoDB stub, and an explicitly selected fixture build. Amplify runs the site checks and builds from the live table. A successful fixture build does not prove that AWS access or live catalog publication works; verify the deployed directory, form, and database-change → fresh-build behavior as part of delivery.

See [directory behavior](docs/intent/directory.md), [creator page behavior](docs/intent/creator-pages.md), [account behavior](docs/intent/accounts.md), and [blog behavior](docs/intent/blog.md) for the content and publication rules.

See [site identity](docs/intent/identity.md) for the shared brand, visual system and owned Spanish voice.
