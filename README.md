# ¿Dónde Aprendo AWS?

Static directory, dedicated learning, creator, community and event pages, guided learning paths, blog archive, and unified search built with Astro and hosted on AWS Amplify. Published communities with a known country also get static community and event pages from the same DynamoDB catalog snapshot; `/comunidades/` remains the complete directory and `/eventos/` the overall agenda. DynamoDB owns the catalog; site code, learning paths and blog articles are files in Git. Codex is an editing tool, not a content store.

The production site is https://dondeaprendoaws.com/. Its contribution form stores pending submissions through the owned API and shows the resulting reference ID and submission date. Resource and event cards include a contextual link to report incorrect data by email. `/blog/` presents six selected articles and links to the other 190 articles in a dated archive. `/recorridos/` links to existing blog and approved catalog entries in four editorial sequences. `/buscar/` searches those articles, paths and the approved catalog using a build-generated public index. Community cards link to their country's stable agenda and retain their community-specific event filter when upcoming events are available. The `www` and default Amplify hostnames redirect to the apex. Google Analytics uses the existing `G-3NXS6QFKHZ` property and loads only on the apex.

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

After either static build, run `npm run verify:blog` and `npm run verify:site` to check the featured and archive links, all 196 article routes, search index, owned assets, sitemap, indexing mode, and Analytics tags. Pass the same `PUBLIC_PRODUCTION` and `PUBLIC_SITE_ORIGIN` values to the verifiers that you used for the build. CI tests both preview and production build modes; Amplify checks its active mode after each build.

Do not set `CATALOG_FIXTURE` for an Amplify deployment or combine it with `CATALOG_TABLE`. Never commit credentials, submission contact information, or raw database dumps.

## Blog editing

Edit the article Markdown files in `src/content/blog/` and keep their images in `public/assets/blog/`. Frontmatter controls title, date, description, cover image, related cards, and the current index order. HTML blocks in articles preserve source structures such as figures and tables. See [blog behavior](docs/intent/blog.md) for the content contract.

The production build uses `PUBLIC_SITE_ORIGIN=https://dondeaprendoaws.com` for absolute social-image URLs; canonical URLs use the same domain. Avoid reintroducing Unicorn or SEObot scripts or remote media in article files.

## Production hosting

The `main` Amplify branch has `PUBLIC_PRODUCTION=true` and `PUBLIC_SITE_ORIGIN=https://dondeaprendoaws.com`. Its build emits indexable content pages and a sitemap containing fixed site pages, blog articles, and community and event country pages generated from currently published communities; the search utility at `/buscar/` is excluded with `noindex, follow`. The country-page count follows the published catalog and is not fixed in code or documentation. The single Analytics loader runs only on the apex hostname. Amplify manages the apex and `www` DNS records and certificate; `www` and `main.d33kh9d3cyassq.amplifyapp.com` redirect to the apex, preserving paths. Keep those branch variables and redirects when updating the app. The ordered rules in `config/amplify-custom-rules.json` also use Amplify’s `404-200` rewrite to serve `/404.html` for missing URLs with HTTP 404 while preserving the requested URL. Apply them to the existing app with `aws amplify update-app --region us-east-1 --app-id d33kh9d3cyassq --custom-rules file://config/amplify-custom-rules.json`; Git builds do not apply app-level routing rules. After a routing update, verify a genuinely missing URL, existing pages and assets, and both canonical hostname redirects. An hourly publication check starts a fresh build when approved public catalog data changes.

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

The form writes new records to `donde-aprendo-aws-catalog` with `published=false`. In the DynamoDB console for account `719535286359`, region `us-east-1`, inspect the pending record and its private `submitterName`/`submitterEmail` fields. Edit public fields as needed, including `kind` (`content`, `source`, or `community`), a compatible `format`, and up to three `topics`. The legacy `category` field remains for compatibility; public filters use the three new fields. If verified, set `country` to a supported two-letter country code, `level` (`inicial`, `intermedio`, or `avanzado`) for learning content, and `sourceId` or `communityId` to the stable ID of a published related card. Set `featured=true` only for an editorial recommendation. On approval, set `addedAt` to the actual approval date in `YYYY-MM-DD` format; leave it absent for older records whose date is unknown. Set `published` to the Boolean `true` to approve, or `false` to hide. The hourly Lambda publishes the change automatically. To request an immediate build instead, run:

```sh
npm run publish
```

This starts a **fresh build from Git**, reads the current table, and waits for its deployment. It does not redeploy an old artifact. Changes are visible only after the job succeeds; if a build fails, the previous deployed site remains available. The command prints the job ID so an interrupted wait can be resumed by inspecting that job in Amplify before starting another.

Git pushes to the connected branch also rebuild the site. There is no immediate DynamoDB change trigger or synchronization of resource records into Git.

The API conditionally creates one record per exact submitted URL. If an owner edits a record's URL later, its stable ID still represents the originally submitted URL; review possible duplicates when moderating. Contributor contact values remain in DynamoDB and must not be copied into public fields or Git.

The report links on resource and event cards open an email draft to `contact@dondeaprendoaws.com` with public context. The visitor must send it. Investigate the referenced ID in DynamoDB, correct the authoritative record, and let the hourly publication check rebuild the site. The generic footer report link asks the sender to include the affected page. For an article report, edit the article in Git and deploy it through the normal branch workflow.

## Event agenda editing

Create a hand-curated event directly in the same DynamoDB table with a unique `id`, `recordType` set to `event`, `title`, `description`, `startsAt`, `endsAt`, `timeZone`, `organizer`, `mode`, and `registrationUrl`. Use full ISO timestamps with an explicit UTC offset for start and end, and an IANA zone such as `America/Asuncion` for display. `endsAt` must be after `startsAt`. Use `mode=online`, `in-person`, or `hybrid`; add `place` for a physical or hybrid event. Set `country` when the organizer's country is known. Keep `published=false` until the details and registration link are verified, then set the Boolean to `true`. Only public event fields are projected into the site. To connect a new recording, create or edit a published **Aprender** record with `kind=content`, `format=Video` (or its actual format), and `eventId` equal to the event's ID. The recording stays in Aprender when the event ends. The public form is for resource submissions.

### Spanish-language Latin American Meetup groups and events

`data/meetup-communities.json` is the reviewed snapshot of 88 AWS User Groups and 145 AWS Student Builder Groups from Spanish-speaking Latin America and the Caribbean as of 2026-09-28. `docs/meetup-user-groups-audit.csv` records the inclusion decision for each of the 429 User Groups in the supplied global directory. Brazilian groups and the English-language Jamaica group are excluded. Meetup classifies the Puerto Rico groups as US; the snapshot assigns them `PR`. The Macul campus group is classified as Mexico by Meetup but located in Santiago; the snapshot assigns it `CL`. Review additions individually for language before changing this file. `npm run import:meetup-communities -- --dry-run` validates all records; the real import verifies AWS account `719535286359` and conditionally creates approved DynamoDB records without overwriting existing IDs. Removing a group from this seed does not remove an imported item: unpublish it in DynamoDB as well.

`donde-aprendo-aws-meetup-events` reads the published `meetup-<group-id>` records every hour, excluding groups in Brazil or Jamaica, subscribes to each group's public iCalendar feed, and reads the structured metadata of unsuppressed, non-cancelled events still listed there. Future Scheduled/Rescheduled events create or update `meetup-event-<event-id>` records with `published=true` when mapped fields change. Existing events keep their publication flag when they finish or disappear after their end time. A Scheduled/Rescheduled page whose end is past can refresh an existing record's facts, but its update omits `published`; a past event without a record is not imported. Repeating unchanged syncs does not write again. This also catches page edits whose feed `LAST-MODIFIED` did not change. The sync stores the approved `communityId` and, for physical events, `city` only when Meetup supplies `addressLocality`.

An explicit cancellation in the feed or page, another known valid nonpublishable page status, a future event's disappearance from a healthy feed, or removal of its organizing group from approved sync sources unpublishes the event. Cancellation and source removal apply to past events too. A missing, malformed or unknown page status is a source failure, not a cancellation. Feed/page errors preserve the existing safeguards and raise an error for the CloudWatch alarm; healthy sources can still update. Existing hand-curated event records are never edited. To suppress a synced event editorially, set both `published=false` and the private `autoSync=false`; conditional writes preserve source ownership and this suppression. Absence-based retraction also checks the end time read, so it cannot overwrite a concurrent reschedule.

Retention starts with this policy; previously hidden past records are not automatically restored because their flags do not distinguish expiry from cancellation or other removal. The sync does not revisit every historical page absent from its feed, so later corrections/cancellations there require a catalog edit or a newly observed source entry. All public agendas include published ended events by default, with a session-local Incluir eventos finalizados checkbox. Reloading or opening a link checks it again; its value is not saved in URL/history/storage. Homepage and search still select upcoming/in-progress events. The agenda groups occurrences by canonical registration URL plus start instant (with the compatible title/venue fallback), keeps co-hosts and chooses a matching member for the current filters. Its count/summary use the complete selection before the twelve-card pagination. Every agenda has Semana/Mes and previous/next arrows, opening on the current Monday–Sunday week. The selected IANA zone defines calendar periods, primary dates/hours and the next-event summary; Más filtros allows changing it, and organizer times remain a separate reference. Events are included by duration overlap, so a multi-day event can appear in consecutive periods. Primary and organizer schedules show the end date when it differs from the start date in that zone. URL fields view/date/tz preserve a concrete period and zone, while legacy from/to links normalize to the week of their first valid date. Switching views keeps the reference date; month navigation clamps to the last valid day when necessary. History restores period/zone/filters without restoring checkbox state, and clearing filters keeps period/zone. An empty period does not clear valid filters or jump elsewhere. Links between agendas carry period/zone and explicit attendance/location/community filters; destination country or mode is an editable default. Explicit empty query fields can clear those defaults. Without JavaScript, every public route event remains in the HTML with its original links and organizer schedule; the notice explains that interactive period selection requires JavaScript. Past cards use Ver evento and integrate their recording link instead of a separate archive. Published recordings remain in Aprender. Every public event ID has its own .ics download, including past and co-host IDs; each file preserves the row's own UID/dates/URL. The download is not a subscription. Fragment links reveal past/co-host cards and release incompatible filters, opening their start period in the selected zone when necessary and using the global agenda when a route default is incompatible. Groups from Spanish-speaking Latin American countries remain on automatic sync even if an occasional event is in English; those exceptions are accepted editorially.

Attendance filters use physical location: Solo online includes online and hybrid remote access globally; Solo presencial includes physical and hybrid local access; Presencial + online combines both without duplicating hybrids. Country and city stay selected but disabled in Solo online. City identity ignores accents, case and repeated whitespace within the same country; equivalent options appear once and legacy city spellings resolve to that option without editing catalog facts. Community is an exact independent published ID. The three primary controls appear on every agenda, with community and zone in Más filtros. Every route carries the full public catalog; its static selection follows editable country/mode defaults, and the browser applies the requested week/month. A query overriding a default uses neutral visible heading/intro/title. Canonical/social metadata stay route-based, without promising filtered previews.

Compartir opens one native dropdown on every agenda. X and LinkedIn receive prepared, editable posts through native links; Copiar immediately writes the complete selection as plain text, with WhatsApp-style emphasis, full titles, original registration URLs, dates/hours in the selected zone, participation and ended labels, including occurrences beyond the twelve visible cards. LinkedIn lists every selected occurrence while its final body fits 3,000 UTF-16 units; above that it replaces the entire list with an explicit total and a link to the complete agenda. X uses the period, count, attendance/location context and agenda link, measured with twitter-text against 280 weighted characters including the trailing space observed in its editor. Only the city may be visibly abbreviated by grapheme; its exact value remains in the URL and in LinkedIn/Copiar. Both native links send the complete body and final agenda link through a single `text` parameter. LinkedIn text prefilling was observed in an authenticated web editor but has no public parameter contract found; fresh-login continuation and native mobile apps are not certified. Sharing builds a global `/eventos/` URL with concrete period/zone and effective attendance/location/community filters, dropping fragments, tracking and checkbox state. A recipient opens with ended events included, even if the sender excluded them, and later catalog changes can alter the selection. Copy reports success only after the browser confirms the write; a failure permits retry. The visitor confirms posting in the social network; previews retain the static global route metadata. The formatter imports the published but package-internal `dist/parseTweet.js` entry of pinned twitter-text 3.1.0 to avoid bundling unused exports; dependency upgrades need to preserve the Node and Astro import compatibility covered by the formatter tests and build.

Event `country` remains organizer country; optional `venueCountry` is the explicit physical country (two uppercase ASCII letters, independent of the organizer-country enum). Event `city` is explicit physical city; communities may expose a reviewed optional city. Effective location falls back to the organizer, borrowing a community city only when its country is compatible. Online events have no physical location. The derived fallback is not copied to DynamoDB, inferred from group names or labeled separately in the UI. Physical destinations follow the venue where a national route exists; remote events and unsupported venue routes use `/eventos/`. All three scan allowlists must admit venueCountry, and the publication package must include its public projection so edits affect the existing build fingerprint.

Package with `npm run package:meetup-events`, upload `dist/meetup-events.zip` to the private deployment artifacts bucket under a content-hashed key, and deploy `infra/meetup-events.yaml` as stack `donde-aprendo-aws-meetup-events`. Parameters are `CatalogTableName`, `ArtifactBucket`, `ArtifactKey`, `PublicationFunctionName=donde-aprendo-aws-publication`, and the existing publication `FailureTopicArn`. Confirm the CloudFormation change set before applying it. The sync Lambda invokes the publication checker after a catalog change; the original hourly publication check still handles manual approvals. Run `python3 scripts/import-meetup-events.py --dry-run` to audit the current feeds without AWS writes, or run it without the flag in the verified target account for a manual sync.

When a new public event field is added, update the DynamoDB scan allowlists in the directory and publication stacks before a site build reads it. Deploy the Meetup role and Lambda artifact together, then run one sync to populate newly supported fields on existing events. Package and deploy the updated publication Lambda too, so its public-data hash includes the new field and the hourly check rebuilds after later edits. Confirm the build and publication Lambdas can scan the table before relying on the hourly schedule.

## Verification

GitHub Actions runs `npm run check`, `npm test`, the Meetup sync unit tests, all three Lambda packaging commands, a packaged submission-handler smoke call against a local DynamoDB stub, and an explicitly selected fixture build. Amplify runs the site checks and builds from the live table. A successful fixture build does not prove that AWS access or live catalog publication works; verify the deployed directory, form, and database-change → fresh-build behavior as part of delivery.

See [directory behavior](docs/intent/directory.md) and [blog behavior](docs/intent/blog.md) for the content and publication rules.

See [site identity](docs/intent/identity.md) for the shared brand, visual system and owned Spanish voice.
