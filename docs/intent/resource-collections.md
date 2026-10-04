# Resource collection pages

The public catalog has focused landing pages for courses, videos, articles, certification study, serverless, security, generative AI, YouTube channels, blogs, podcasts, newsletters, AWS User Groups, and Student Builder Groups. `src/lib/resource-collections.mjs` owns the routes, copy, selectors, and route lookup used by the pages and site integrations.

Each page filters the same published catalog by resource kind and its declared format or topic. The directory receives only the matching resources for its result list, search, filters, sorting, and resource hash links. It also receives the complete resource and event arrays so cards can resolve existing relationships such as creators, communities, and recordings. An empty match still renders the page guidance and route navigation.

The generative-AI collection uses explicit wording or named AWS tools in a resource title, description, or URL: generative AI / IA generativa, Amazon Bedrock, Strands Agents, or AgentCore. The `Inteligencia Artificial` topic by itself does not qualify, which keeps general AI and machine-learning material out of that focused page.

The shared `ResourceCollection` component renders the content and creator collections from static route parameters. The two community collections have named pages. Directory breadcrumbs and named slots support the community country pages while keeping their existing defaults. Collection pages omit a facet only when that dimension is already fixed by the selector; other applicable facets stay available.

The initial resource order is the existing editorial recommendation order: featured records first, then `addedAt`, with original catalog order as the stable tiebreaker. The explicit directory sort restores the original order and the recent sort uses `addedAt`. Certification study defaults to a purpose grouping derived from each resource's public title and description. The grouping assigns every matching resource once; choosing directory, recent, or recommended returns a flat list with the corresponding sort order.

Search stays visible while secondary facets use native `details` and `summary`. The complete resource list and its links are present in server-rendered HTML. Selected collection pages render visible FAQ content from `collection.faq`; those entries are also available to the site's search index. Three thematic collections link to their existing learning paths before the filter controls, with the same links omitted from their after-results guides.

These pages organize existing published records. They do not claim that a course is free, official, complete, current, or sufficient for certification unless its own published information supports that claim.
