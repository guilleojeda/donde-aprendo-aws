# Directory behavior

The public directory helps visitors discover other people's AWS learning resources. It displays the approved titles, descriptions, legacy category values, and exact outbound URLs, including their query strings. The build does not invent missing descriptions. The public interface uses three sections: **Aprender** for individual articles, videos, courses, episodes and tools; **Seguir** for continuing sources such as blogs, channels, podcasts and newsletters; and **Comunidades** for groups and community spaces. Kind, format and up to three topics are separate DynamoDB fields. Search and format/topic controls operate in the browser; all published links are also present in the generated HTML.

## Content ownership

DynamoDB is the single authoritative catalog. Site templates, assets, and blog article files belong in Git. Approved catalog records are not copied into Git for ongoing editing.

The initial migration created 95 supplied entries with the Boolean `published=true`; 12 more were approved later. The type migration classifies the 107 published records in DynamoDB and changes only `kind`, `format`, and `topics`. The original `category` field remains for compatibility, but it does not control the new directory filters. Legacy records without the new fields are classified at build time so they remain visible during migration; incomplete explicit taxonomy is a build error. Reimporting an old export does not overwrite existing records, their content, or their publication flags.

The discovery pass repaired seven empty descriptions and four moved links, and hid one duplicate Spotify listing for the podcast whose own site remains published. The hidden record stays in DynamoDB for review. The 12 resources added on 2026-09-25 have that verified `addedAt` date; older migrated records have no invented date. **Añadidos recientemente** shows only records with a known date. Sorting by recency puts undated records after dated ones. **Recomendados** uses the editorial `featured` flag. The country field means the known country of the creator or organizing community, not an AWS region; level applies only to individual learning content. Both fields are optional and are shown only when verified. Country, level, format and topic filters can be combined.

Optional `sourceId` and `communityId` values point to existing catalog IDs. When the referenced source or community is published, the content card links to its directory card; a hidden or missing target is not linked. Deep links reveal cards even when another section was selected. The build projects only these public fields and never private contributor contact details.

Only records with a Boolean `published=true` can appear in public output. Missing or false flags are unpublished; malformed publication values must not accidentally expose a submission. Public output is constructed from an explicit allowlist of resource fields, never by serializing a database item that may contain submitter contact details.

The build must consume every scan page. Failed or malformed reads stop publication instead of producing a partial or empty catalog. A successful read with no published entries is a valid empty state.

## Publication

The site is a static snapshot. An hourly Lambda hashes the approved public catalog and starts a fresh Amplify build when it differs from the last successfully deployed hash. A Git deployment also reads the current catalog. Unpublishing follows the same rule; changing the flag does not instantly erase already-deployed HTML or external caches. The publication state lives in the reserved `__system#publication` item of the same DynamoDB table and is not a public resource. The Lambda records the hash only after Amplify reports success, checks for active builds before starting another, and raises an alarmable error when its build fails. An owner can still request an immediate build with `npm run publish`.

Visitors submit contact details, title, URL, description, kind, format, and optional topics through the owned form. The API validates them, conditionally creates a catalog record with `published=false`, and confirms receipt only after DynamoDB accepts the write. The API temporarily accepts the old `Category` payload from already-deployed pages. Duplicate exact URLs are rejected without changing an existing record. The record also contains private submitter name and email fields for the owner's review. The build's projection excludes those fields even after approval. Newly approved entries default to order zero and appear after the imported records; the owner can edit their order directly.

The build reads DynamoDB using a scoped AWS role that can scan only the public attributes named in its projection. Visitors do not receive AWS credentials or access the table. No runtime catalog API, scheduled rebuild, database stream processor, or database-to-Git synchronization is necessary for this workflow.

## Preview boundary

The directory preview uses an Amplify default hostname. Before cutover it is excluded from indexing and production Analytics collection. Its contributor form uses the owned API. Blog leads to the local 15-card index, and all 196 inventoried article paths are generated locally. The production build enables indexing and the sitemap; its Analytics module sends data only when the browser hostname is `dondeaprendoaws.com`.

The site uses owned styles, scripts, and assets. Unicorn's generic client bundle and SEObot's publishing integration are not part of the replacement. Existing articles remain content to preserve, regardless of the tool originally used to write them.
