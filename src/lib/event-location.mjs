/** @typedef {import('../types/catalog').CatalogEvent} CatalogEvent */
/** @typedef {import('../types/catalog').CatalogResource} CatalogResource */

const COUNTRY_DISPLAY_NAMES = new Intl.DisplayNames('es', { type: 'region', fallback: 'none' });

/** Return the Spanish region label when Intl knows it, otherwise retain the country code. */
export function eventCountryLabel(country) {
  if (typeof country !== 'string' || !country) return '';
  try {
    return COUNTRY_DISPLAY_NAMES.of(country) || country;
  } catch {
    return country;
  }
}

/** Resolve the physical venue from public event facts and an optional community fallback. */
/** @param {CatalogEvent} event @param {Map<string, CatalogResource>} [communityById] */
export function effectiveEventLocation(event, communityById = new Map()) {
  if (event.mode === 'online') return { country: '', city: '' };

  const community = communityById.get(event.communityId ?? '');
  const country = event.venueCountry ?? event.country ?? community?.country ?? '';
  const city = event.city ?? (country && community?.country === country ? community.city : undefined) ?? '';
  return {
    country: typeof country === 'string' ? country : '',
    city: typeof city === 'string' ? city : '',
  };
}
