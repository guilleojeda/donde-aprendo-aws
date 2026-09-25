export const COUNTRY_LABELS = Object.freeze({
  AR: 'Argentina',
  BO: 'Bolivia',
  BR: 'Brasil',
  CL: 'Chile',
  CO: 'Colombia',
  CR: 'Costa Rica',
  DO: 'República Dominicana',
  EC: 'Ecuador',
  ES: 'España',
  GT: 'Guatemala',
  HN: 'Honduras',
  JM: 'Jamaica',
  MX: 'México',
  NI: 'Nicaragua',
  PA: 'Panamá',
  PE: 'Perú',
  PR: 'Puerto Rico',
  PY: 'Paraguay',
  UY: 'Uruguay',
  VE: 'Venezuela',
});

export const LEVEL_LABELS = Object.freeze({
  inicial: 'Inicial',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
});

export const DISCOVERY_FIELDS = Object.freeze(['addedAt', 'country', 'level', 'sourceId', 'communityId', 'eventId']);
const RESOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

export function validateDiscoveryMetadata(record, index = 0) {
  const label = `Catalog record ${index + 1}`;
  if (record.addedAt !== undefined && (
    typeof record.addedAt !== 'string'
    || !DATE_ONLY.test(record.addedAt)
    || Number.isNaN(Date.parse(`${record.addedAt}T00:00:00Z`))
    || new Date(`${record.addedAt}T00:00:00Z`).toISOString().slice(0, 10) !== record.addedAt
  )) throw new Error(`${label} has an invalid addedAt date`);
  if (record.country !== undefined && !Object.hasOwn(COUNTRY_LABELS, record.country)) {
    throw new Error(`${label} has an invalid country`);
  }
  if (record.level !== undefined && (
    record.kind !== 'content' || !Object.hasOwn(LEVEL_LABELS, record.level)
  )) throw new Error(`${label} has an invalid level`);
  if (record.sourceId !== undefined && (record.kind !== 'content' || !RESOURCE_ID.test(record.sourceId) || record.sourceId === record.id)) {
    throw new Error(`${label} has an invalid sourceId`);
  }
  if (record.communityId !== undefined && (record.kind === 'community' || !RESOURCE_ID.test(record.communityId) || record.communityId === record.id)) {
    throw new Error(`${label} has an invalid communityId`);
  }
  if (record.eventId !== undefined && (record.kind !== 'content' || !RESOURCE_ID.test(record.eventId) || record.eventId === record.id)) {
    throw new Error(`${label} has an invalid eventId`);
  }
}

export function recentResources(resources, limit = 6) {
  return resources.filter((resource) => resource.addedAt)
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt)
      || Number(right.featured) - Number(left.featured)
      || right.order - left.order
      || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export function recommendedResources(resources, limit = 6) {
  return resources.filter((resource) => resource.featured)
    .sort((left, right) => (right.addedAt ?? '').localeCompare(left.addedAt ?? '')
      || right.order - left.order
      || left.id.localeCompare(right.id))
    .slice(0, limit);
}
