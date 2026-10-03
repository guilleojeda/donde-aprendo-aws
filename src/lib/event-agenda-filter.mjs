const FIELDS = ['from', 'to', 'mode', 'country', 'city', 'community'];

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
  return {
    from: validDate(query.get('from') ?? '') ? query.get('from') : '',
    to: validDate(query.get('to') ?? '') ? query.get('to') : '',
    mode: allowed.mode.has(query.get('mode')) ? query.get('mode') : '',
    country,
    city: country && city && !cityMatchesCountry ? '' : city,
    community,
  };
}

export function serializeEventAgendaSearch(search, filters) {
  const query = new URLSearchParams(search);
  for (const field of FIELDS) {
    query.delete(field);
    if (filters[field]) query.set(field, filters[field]);
  }
  return query.toString();
}

export function eventMatchesFilters(event, filters, now = Date.now()) {
  const communities = event.communities ?? (event.community ? [event.community] : []);
  const countries = event.countries ?? (event.country ? [event.country] : []);
  return Date.parse(event.endsAt) > now
    && (!filters.from || event.localDate >= filters.from)
    && (!filters.to || event.localDate <= filters.to)
    && (!filters.mode || event.mode === filters.mode)
    && (!filters.country || countries.includes(filters.country))
    && (!filters.community || communities.includes(filters.community))
    && (!filters.city || event.city === filters.city);
}
