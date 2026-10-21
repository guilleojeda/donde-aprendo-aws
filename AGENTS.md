# Project conventions

- UI colors belong to `src/styles/themes/light.css` and `dark.css`. Both define the same semantic roles; components and other styles consume them without literal colors, local role definitions or theme branches. Geometry variables and `currentColor` remain appropriate in consumers.
- `BaseLayout.astro` owns theme loading and the single early controller. Keep the preference, failure and accessibility behavior described in [identity.md](docs/intent/identity.md); do not add a second appearance state or bootstrap.
- Run `npm test` without a build's `CATALOG_FIXTURE` environment. Generated HTML acceptance runs through `npm run verify:site` after a build, alongside `npm run verify:blog`. Use the same production/origin settings for build and verification.
