const FIELDS = ['mode', 'country', 'city', 'community'];
const SECONDARY_FIELDS = ['mode', 'country', 'city', 'community'];

export function secondaryEventAgendaFilterCount(filters) {
  return SECONDARY_FIELDS.filter((field) => Boolean(filters[field])).length;
}

export function shouldOpenEventAgendaSecondaryFilters(filters, isMobile) {
  return secondaryEventAgendaFilterCount(filters) > 0 || !isMobile;
}

export function parseEventAgendaSearch(search, allowed) {
  const query = new URLSearchParams(search);
  const country = allowed.country.has(query.get('country')) ? query.get('country') : '';
  const city = allowed.city.has(query.get('city')) ? query.get('city') : '';
  const community = allowed.community.has(query.get('community')) ? query.get('community') : '';
  const countriesForCity = allowed.countriesForCity?.get(city);
  const cityMatchesCountry = countriesForCity
    ? countriesForCity.has(country)
    : city.startsWith(`${country}:`);
  const communityMatchesCountry = !country || !community || !allowed.communityCountries
    || allowed.communityCountries.get(community) === country;
  return {
    mode: allowed.mode.has(query.get('mode')) ? query.get('mode') : '',
    country,
    city: country && city && !cityMatchesCountry ? '' : city,
    community: communityMatchesCountry ? community : '',
  };
}

export function serializeEventAgendaSearch(search, filters) {
  const query = new URLSearchParams(search);
  for (const key of ['from', 'to', 'includeEnded']) query.delete(key);
  for (const field of FIELDS) {
    query.delete(field);
    if (filters[field]) query.set(field, filters[field]);
  }
  return query.toString();
}

export function eventMatchesFilters(event, filters, now = Date.now(), includeEnded = false) {
  const communities = event.communities ?? (event.community ? [event.community] : []);
  const countries = event.countries ?? (event.country ? [event.country] : []);
  return (includeEnded || Date.parse(event.endsAt) > now)
    && (!filters.mode || event.mode === filters.mode)
    && (!filters.country || countries.includes(filters.country))
    && (!filters.community || communities.includes(filters.community))
    && (!filters.city || event.city === filters.city);
}
