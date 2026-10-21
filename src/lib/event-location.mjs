/** @typedef {import('../types/catalog').CatalogEvent} CatalogEvent */
/** @typedef {import('../types/catalog').CatalogResource} CatalogResource */

const COUNTRY_DISPLAY_NAMES = new Intl.DisplayNames('es', { type: 'region', fallback: 'none' });

/**
 * Build a comparison key for a complete `CC:city` identity without changing its source value.
 * Accent, letter-case, and repeated-whitespace differences do not distinguish a city; country does.
 */
export function normalizeEventCityKey(value) {
  if (typeof value !== 'string' || value === '') return '';
  const match = /^([A-Z]{2}):(.+)$/u.exec(value);
  if (!match) return '';

  const city = match[2].normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/gu, ' ');
  return city ? `${match[1]}:${city}` : '';
}

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
