const SCHEMA_VERSION = 1;
const FRESHNESS_MS = 60 * 60 * 1000;
const RETENTION_MS = 7 * 24 * FRESHNESS_MS;
const LINK_PAGE_SIZE = 100;
const COUNTERS = ['views', 'visitors', 'clicks'];
// Only read() owns the bounded retry for this internal result.
const WINDOW_CHANGED = Symbol('statistics window changed');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKey(input) {
  if (!isObject(input)) throw new TypeError('statistics query must be an object');
  const { profileId, period } = input;
  const page = input.page ?? 1;
  if (typeof profileId !== 'string' || profileId.trim() === '' || profileId !== profileId.trim()) {
    throw new TypeError('profileId must be a non-empty string');
  }
  if (period !== 7 && period !== 30) throw new TypeError('period must be 7 or 30');
  if (!Number.isSafeInteger(page) || page < 1) throw new TypeError('page must be a positive integer');
  return { profileId, period, page };
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) return null;
  return milliseconds;
}

function isoValue(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function countValue(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function localDate(timeZone, milliseconds) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(milliseconds));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

function isCurrentWindow(report, milliseconds) {
  return localDate(report.range.timeZone, milliseconds) === report.range.endDate;
}

function isFreshAt(report, updatedAt, milliseconds) {
  return milliseconds < updatedAt + FRESHNESS_MS && isCurrentWindow(report, milliseconds);
}

function validReport(report, key) {
  if (!isObject(report)
    || report.creatorId !== key.profileId
    || report.period !== key.period
    || report.page !== key.page
    || !isObject(report.range)
    || !isObject(report.totals)
    || !isObject(report.links)
    || !Array.isArray(report.daily)
    || !Array.isArray(report.links.rows)
    || !Array.isArray(report.sources)
    || !Array.isArray(report.warnings)
    || !isoValue(report.captureStartedAt)) return false;

  const start = dateValue(report.range.startDate);
  const end = dateValue(report.range.endDate);
  if (start === null || end === null || end < start
    || Math.round((end - start) / 86_400_000) + 1 !== key.period
    || typeof report.range.timeZone !== 'string'
    || localDate(report.range.timeZone, end) === null) return false;

  for (const field of COUNTERS) if (!countValue(report.totals[field])) return false;
  if (report.daily.length !== key.period) return false;
  for (let index = 0; index < report.daily.length; index += 1) {
    const day = report.daily[index];
    if (!isObject(day) || dateValue(day.date) !== start + index * 86_400_000
      || !countValue(day.views) || !countValue(day.clicks)) return false;
  }

  if (report.links.page !== key.page
    || report.links.pageSize !== LINK_PAGE_SIZE
    || !Number.isSafeInteger(report.links.totalRows)
    || report.links.totalRows < 0
    || report.links.rows.length > LINK_PAGE_SIZE) return false;
  for (const row of report.links.rows) {
    if (!isObject(row) || typeof row.linkId !== 'string' || row.linkId === '' || !countValue(row.clicks)) return false;
  }
  for (const source of report.sources) {
    if (!isObject(source) || typeof source.sourceMedium !== 'string' || !countValue(source.views)) return false;
  }
  return true;
}

function validEnvelope(envelope, key, now) {
  if (!isObject(envelope)
    || envelope.schemaVersion !== SCHEMA_VERSION
    || !Number.isSafeInteger(envelope.updatedAt)
    || !Number.isSafeInteger(envelope.expiresAt)
    || !Number.isSafeInteger(envelope.retainUntil)
    || envelope.updatedAt < 0
    || envelope.updatedAt > now
    || envelope.expiresAt !== envelope.updatedAt + FRESHNESS_MS
    || envelope.retainUntil !== envelope.updatedAt + RETENTION_MS
    || !validReport(envelope.report, key)) return null;
  return envelope;
}

function response(report, freshness, updatedAt) {
  return {
    ...structuredClone(report),
    state: 'ready',
    freshness,
    updatedAt: new Date(updatedAt).toISOString(),
  };
}

function validNow(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('now must return a non-negative epoch timestamp in milliseconds');
  return value;
}

export function createCachedCreatorStatistics({ reader, cache, now = Date.now } = {}) {
  if (!reader || typeof reader.read !== 'function') throw new TypeError('reader.read is required');
  if (!cache || typeof cache.get !== 'function' || typeof cache.put !== 'function') {
    throw new TypeError('cache.get and cache.put are required');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const inFlight = new Map();

  async function readOnce(key) {
    let at = validNow(now);
    let previous;
    try {
      const cached = await cache.get(key);
      at = validNow(now);
      previous = validEnvelope(cached, key, at);
    } catch {
      // The cache is an optimization. A read outage must not block the provider.
      previous = null;
      at = validNow(now);
    }

    if (previous && at < previous.expiresAt
      && isCurrentWindow(previous.report, at)) {
      return response(previous.report, 'fresh', previous.updatedAt);
    }

    let report;
    try {
      report = await reader.read(key);
      if (!validReport(report, key)) throw new Error('statistics reader returned an invalid report');
    } catch (error) {
      at = validNow(now);
      if (previous && at < previous.retainUntil) return response(previous.report, 'stale', previous.updatedAt);
      throw error;
    }

    const updatedAt = validNow(now);
    if (!isCurrentWindow(report, updatedAt)) {
      return { [WINDOW_CHANGED]: true, report, updatedAt };
    }
    const envelope = {
      schemaVersion: SCHEMA_VERSION,
      report: structuredClone(report),
      updatedAt,
      expiresAt: updatedAt + FRESHNESS_MS,
      retainUntil: updatedAt + RETENTION_MS,
    };
    try {
      await cache.put(key, envelope);
    } catch {
      // A healthy provider response remains useful when the persistent cache is down.
    }
    const completedAt = validNow(now);
    if (!isFreshAt(report, updatedAt, completedAt)) {
      return { [WINDOW_CHANGED]: true, report, updatedAt };
    }
    return response(report, 'fresh', updatedAt);
  }

  async function read(input) {
    const key = normalizeKey(input);
    const fingerprint = JSON.stringify([key.profileId, key.period, key.page]);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let shared = inFlight.get(fingerprint);
      if (!shared) {
        shared = readOnce(key).finally(() => {
          if (inFlight.get(fingerprint) === shared) inFlight.delete(fingerprint);
        });
        inFlight.set(fingerprint, shared);
      }
      const value = await shared;
      const checkedAt = validNow(now);
      if (value[WINDOW_CHANGED]) {
        if (attempt === 1) return response(value.report, 'stale', value.updatedAt);
        continue;
      }
      const updatedAt = Date.parse(value.updatedAt);
      if (value.freshness !== 'fresh' || isFreshAt(value, updatedAt, checkedAt)) {
        return structuredClone(value);
      }
      if (attempt === 1) return { ...structuredClone(value), freshness: 'stale' };
    }
  }

  return { read };
}
