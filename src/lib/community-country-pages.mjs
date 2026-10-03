import { COUNTRY_LABELS } from './resource-discovery.mjs';

/** Stable public slugs for countries supported by the published catalog. */
export const COMMUNITY_COUNTRY_SLUGS = Object.freeze({
  AR: 'argentina',
  BO: 'bolivia',
  BR: 'brasil',
  CL: 'chile',
  CO: 'colombia',
  CR: 'costa-rica',
  DO: 'republica-dominicana',
  EC: 'ecuador',
  ES: 'espana',
  GT: 'guatemala',
  HN: 'honduras',
  JM: 'jamaica',
  MX: 'mexico',
  NI: 'nicaragua',
  PA: 'panama',
  PE: 'peru',
  PR: 'puerto-rico',
  PY: 'paraguay',
  UY: 'uruguay',
  VE: 'venezuela',
});

export function communityCountryPath(country) {
  const slug = COMMUNITY_COUNTRY_SLUGS[country];
  return slug ? `/comunidades/${slug}/` : undefined;
}

export function communityCountryPages(resources) {
  const counts = new Map();
  for (const resource of resources) {
    if (resource.kind !== 'community' || !resource.country || !communityCountryPath(resource.country)) continue;
    counts.set(resource.country, (counts.get(resource.country) ?? 0) + 1);
  }

  return [...counts].flatMap(([country, count]) => {
    const label = COUNTRY_LABELS[country];
    const slug = COMMUNITY_COUNTRY_SLUGS[country];
    const path = communityCountryPath(country);
    return label && slug && path ? [{ country, label, slug, path, count }] : [];
  }).sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }));
}
