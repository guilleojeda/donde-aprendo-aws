const CREATOR_STATISTICS_LINK_PAGE_SIZE = 100;
const COUNTERS = ['views', 'visitors', 'clicks'];
const RUNTIME_FIELDS = ['state', 'freshness', 'updatedAt'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasAny(value, fields) {
  return fields.some((field) => Object.hasOwn(value, field));
}

function validIdentity(key, item) {
  return isObject(key)
    && typeof key.profileId === 'string'
    && key.profileId.trim() !== ''
    && (key.period === 7 || key.period === 30)
    && isObject(item)
    && item.creatorId === key.profileId
    && item.period === key.period;
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(milliseconds)
    && new Date(milliseconds).toISOString().slice(0, 10) === value
    ? milliseconds
    : null;
}

function isoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    && Number.isFinite(Date.parse(value));
}

function validCounter(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function validWarnings(value) {
  return Array.isArray(value) && value.every((warning) => isObject(warning)
    && typeof warning.section === 'string'
    && typeof warning.code === 'string');
}

function validRange(value, period) {
  if (!isObject(value) || typeof value.timeZone !== 'string' || value.timeZone === '') return false;
  const start = dateValue(value.startDate);
  const end = dateValue(value.endDate);
  if (start === null || end === null || end < start
    || Math.round((end - start) / 86_400_000) + 1 !== period) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format();
  } catch {
    return false;
  }
  return true;
}

function validDaily(value, key) {
  if (!Array.isArray(value.daily) || value.daily.length !== key.period) return false;
  const start = dateValue(value.range.startDate);
  for (let index = 0; index < value.daily.length; index += 1) {
    const point = value.daily[index];
    if (!isObject(point) || dateValue(point.date) !== start + index * 86_400_000
      || !validCounter(point.views) || !validCounter(point.clicks)) return false;
  }
  return true;
}

function validSources(value) {
  return Array.isArray(value.sources) && value.sources.every((source) => isObject(source)
    && typeof source.sourceMedium === 'string'
    && validCounter(source.views));
}

function validLinks(value, page) {
  if (!isObject(value.links)
    || value.links.page !== page
    || value.links.pageSize !== CREATOR_STATISTICS_LINK_PAGE_SIZE
    || !Number.isSafeInteger(value.links.totalRows)
    || value.links.totalRows < 0
    || !Array.isArray(value.links.rows)
    || value.links.rows.length > CREATOR_STATISTICS_LINK_PAGE_SIZE
    || value.links.rows.length > value.links.totalRows) return false;
  return value.links.rows.every((row) => isObject(row)
    && typeof row.linkId === 'string'
    && validCounter(row.clicks));
}

function validRuntimeEnvelope(value, representation) {
  if (representation === 'ready') {
    return value.state === 'ready'
      && (value.freshness === 'fresh' || value.freshness === 'stale')
      && isoTimestamp(value.updatedAt);
  }
  return !hasAny(value, RUNTIME_FIELDS);
}

function validKindShape(value, key, kind) {
  if (kind === 'summary') {
    return !hasAny(value, ['page', 'daily', 'links', 'sources']);
  }
  if (kind === 'period') {
    return !hasAny(value, ['page', 'links']) && validDaily(value, key) && validSources(value);
  }
  if (kind === 'page') {
    return Number.isSafeInteger(key.page) && key.page >= 1
      && value.page === key.page
      && validDaily(value, key)
      && validSources(value)
      && validLinks(value, key.page);
  }
  if (kind === 'links') {
    return Number.isSafeInteger(key.page) && key.page >= 1
      && value.page === key.page
      && !hasAny(value, ['totals', 'daily', 'sources'])
      && validLinks(value, key.page);
  }
  return false;
}

/**
 * @param {unknown} value
 * @param {{ kind: 'summary'|'period'|'page'|'links', profileId: string, period: 7|30, page?: number, representation?: 'payload'|'ready' }} options
 * @returns {boolean}
 */
export function isCreatorStatisticsReport(value, {
  kind,
  profileId,
  period,
  page,
  representation = 'payload',
} = {}) {
  if (!['summary', 'period', 'page', 'links'].includes(kind)
    || !['payload', 'ready'].includes(representation)) return false;
  const key = { profileId, period, ...(kind === 'page' || kind === 'links' ? { page } : {}) };
  if (!validIdentity(key, value)
    || !validRuntimeEnvelope(value, representation)
    || !validRange(value.range, period)
    || !validWarnings(value.warnings)
    || !isoTimestamp(value.captureStartedAt)) return false;
  if (kind !== 'links' && (!isObject(value.totals)
    || !COUNTERS.every((field) => validCounter(value.totals[field])))) return false;
  return validKindShape(value, key, kind);
}
