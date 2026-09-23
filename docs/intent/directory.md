# Directory behavior

The public directory helps visitors discover other people's AWS learning resources. It preserves titles, descriptions, category labels, and exact outbound URLs, including their query strings. Empty source descriptions remain empty. Search and category controls operate in the browser; all published links are also present in the generated HTML.

## Content ownership

DynamoDB is the single authoritative catalog. Site templates, assets, and blog article files belong in Git. Approved catalog records are not copied into Git for ongoing editing.

The initial migration creates all 95 supplied entries with the Boolean `published=true`, as directed by the owner. Importing again does not overwrite existing records, their content, or their publication flags. This prevents an old export from undoing later moderation.

Only records with a Boolean `published=true` can appear in public output. Missing or false flags are unpublished; malformed publication values must not accidentally expose a submission. Public output is constructed from an explicit allowlist of resource fields, never by serializing a database item that may contain submitter contact details.

The build must consume every scan page. Failed or malformed reads stop publication instead of producing a partial or empty catalog. A successful read with no published entries is a valid empty state.

## Publication

The site is a static snapshot. A database edit takes effect after the owner starts a fresh Amplify build and the deployment succeeds. A Git deployment also reads the current catalog. Unpublishing follows the same rule; changing the flag does not instantly erase already-deployed HTML or external caches.

The build reads DynamoDB using a scoped AWS role. Visitors do not receive AWS credentials or access the table. No runtime catalog API, scheduled rebuild, database stream processor, or database-to-Git synchronization is necessary for this workflow.

## Preview boundary

The directory preview uses an Amplify default hostname and leaves production DNS unchanged. It is excluded from indexing and production Analytics collection. Its Blog and contribution links lead to the existing production destinations until their replacements are delivered. The preview does not present a nonfunctional submission form or placeholder blog pages.

The site uses owned styles, scripts, and assets. Unicorn's generic client bundle and SEObot's publishing integration are not part of the replacement. Existing articles remain content to preserve, regardless of the tool originally used to write them.
