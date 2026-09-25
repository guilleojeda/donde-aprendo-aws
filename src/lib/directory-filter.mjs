export function normalizeSearch(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('es');
}

export function filterResources(resources, { kind = '', format = '', topic = '', country = '', level = '', query = '' } = {}) {
  const normalizedQuery = normalizeSearch(query.trim());
  return resources.filter((resource) => (
    (!kind || resource.kind === kind)
    && (!format || resource.format === format)
    && (!topic || resource.topics.includes(topic))
    && (!country || resource.country === country)
    && (!level || resource.level === level)
    && (!normalizedQuery || normalizeSearch(resource.search).includes(normalizedQuery))
  ));
}

export function sortResources(resources, sort = 'directory') {
  if (sort === 'directory') return resources;
  const indexed = resources.map((resource, index) => ({ resource, index }));
  if (sort === 'recent') {
    indexed.sort((left, right) => (right.resource.addedAt ?? '').localeCompare(left.resource.addedAt ?? '')
      || left.index - right.index);
  } else if (sort === 'recommended') {
    indexed.sort((left, right) => Number(right.resource.featured) - Number(left.resource.featured)
      || (right.resource.addedAt ?? '').localeCompare(left.resource.addedAt ?? '')
      || left.index - right.index);
  }
  return indexed.map(({ resource }) => resource);
}
