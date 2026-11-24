import { TOPICS } from './resource-taxonomy.mjs';

export const RESOURCE_KIND_LABELS = Object.freeze({
  content: 'Aprender',
  source: 'Creadores y canales',
  community: 'Comunidades',
  event: 'Eventos',
  unclassified: 'Sin clasificar',
});

export const RESOURCE_KIND_ORDER = Object.freeze([
  'content', 'source', 'community', 'event', 'unclassified',
]);

export function sortFacetValues(values) {
  return [...new Set(values.filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
}

export function representedKinds(records) {
  const represented = new Set(records.map(({ kind }) => kind).filter(Boolean));
  return RESOURCE_KIND_ORDER
    .filter((kind) => represented.has(kind))
    .map((value) => ({ value, label: RESOURCE_KIND_LABELS[value] }));
}

export function representedFormats(records) {
  return sortFacetValues(records.map(({ format }) => format));
}

export function representedTopics(records) {
  const represented = new Set(records.flatMap(({ topics = [] }) => topics));
  return TOPICS.filter((topic) => represented.has(topic));
}

export function activeFacetCount(root, fields = ['kind', 'format', 'topic']) {
  return fields.reduce((count, field) => count + (root.querySelector(`[data-${field}-filter]`)?.value ? 1 : 0), 0);
}

