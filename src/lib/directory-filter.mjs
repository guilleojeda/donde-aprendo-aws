export function normalizeSearch(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('es');
}

export function filterResources(resources, { kind = '', format = '', topic = '', query = '' } = {}) {
  const normalizedQuery = normalizeSearch(query.trim());
  return resources.filter((resource) => (
    (!kind || resource.kind === kind)
    && (!format || resource.format === format)
    && (!topic || resource.topics.includes(topic))
    && (!normalizedQuery || normalizeSearch(resource.search).includes(normalizedQuery))
  ));
}
