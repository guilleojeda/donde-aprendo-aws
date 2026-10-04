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
  const indexed = resources.map((resource, index) => ({
    resource,
    index: Number.isFinite(resource.directoryIndex) ? resource.directoryIndex : index,
  }));
  if (sort === 'directory') {
    indexed.sort((left, right) => left.index - right.index);
  } else if (sort === 'purpose') {
    indexed.sort((left, right) => (left.resource.purposeGroupIndex ?? Number.MAX_SAFE_INTEGER)
      - (right.resource.purposeGroupIndex ?? Number.MAX_SAFE_INTEGER)
      || Number(right.resource.featured) - Number(left.resource.featured)
      || left.index - right.index);
  } else if (sort === 'recent') {
    indexed.sort((left, right) => (right.resource.addedAt ?? '').localeCompare(left.resource.addedAt ?? '')
      || left.index - right.index);
  } else if (sort === 'recommended') {
    indexed.sort((left, right) => Number(right.resource.featured) - Number(left.resource.featured)
      || (right.resource.addedAt ?? '').localeCompare(left.resource.addedAt ?? '')
      || left.index - right.index);
  }
  return indexed.map(({ resource }) => resource);
}

export function directoryListEntries(ordered, visibleResources, sort = 'directory') {
  const visible = new Set(visibleResources);
  const entries = [];
  let previousVisibleGroupId;

  for (const resource of ordered) {
    const isVisible = visible.has(resource);
    if (isVisible && sort === 'purpose' && resource.purposeGroupId
      && resource.purposeGroupId !== previousVisibleGroupId) {
      entries.push({
        type: 'heading',
        id: resource.purposeGroupId,
        label: resource.purposeGroupLabel,
        description: resource.purposeGroupDescription,
      });
    }
    if (isVisible) previousVisibleGroupId = resource.purposeGroupId;
    entries.push({ type: 'resource', resource, visible: isVisible });
  }

  return entries;
}
