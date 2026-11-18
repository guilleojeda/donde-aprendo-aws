const SCHEMA_VERSION = 1;
const FRESHNESS_MS = 60 * 60 * 1000;
const RETENTION_MS = 7 * 24 * FRESHNESS_MS;
const LINK_PAGE_SIZE = 100;
const COUNTERS = ['views', 'visitors', 'clicks'];
const WINDOW_CHANGED = Symbol('statistics window changed');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeQuery(input, { kind = 'page' } = {}) {
  if (!isObject(input)) throw new TypeError('statistics query must be an object');
  const { profileId, period } = input;
  const page = input.page ?? 1;
  if (typeof profileId !== 'string' || profileId.trim() === '' || profileId !== profileId.trim()) {
    throw new TypeError('profileId must be a non-empty string');
  }
  if (period !== 7 && period !== 30) throw new TypeError('period must be 7 or 30');
  if (!Number.isSafeInteger(page) || page < 1) throw new TypeError('page must be a positive integer');
  return { profileId, period, ...(kind === 'page' ? { page } : {}) };
}

function keyFor(query, kind, page) {
  return {
    profileId: query.profileId,
    period: query.period,
    kind,
    ...(kind === 'page' ? { page: page ?? query.page } : {}),
  };
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) return null;
  return milliseconds;
}

function isoValue(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)
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
    const date = `${values.year}-${values.month}-${values.day}`;
    return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : null;
  } catch {
    return null;
  }
}

function validRange(range, period) {
  if (!isObject(range) || typeof range.timeZone !== 'string' || range.timeZone === '') return false;
  const start = dateValue(range.startDate);
  const end = dateValue(range.endDate);
  if (start === null || end === null || end < start
    || Math.round((end - start) / 86_400_000) + 1 !== period
    || localDate(range.timeZone, end) === null) return false;
  return true;
}

function sameRange(left, right) {
  return isObject(left) && isObject(right)
    && left.startDate === right.startDate
    && left.endDate === right.endDate
    && left.timeZone === right.timeZone;
}

function validWarnings(warnings) {
  return Array.isArray(warnings) && warnings.every(isObject);
}

function validSummary(report, key) {
  if (!isObject(report)
    || report.creatorId !== key.profileId
    || report.period !== key.period
    || !validRange(report.range, key.period)
    || !isObject(report.totals)
    || !validWarnings(report.warnings)
    || !isoValue(report.captureStartedAt)) return false;
  return COUNTERS.every((field) => countValue(report.totals[field]));
}

function validCommon(report, key) {
  if (!validSummary(report, key)
    || !Array.isArray(report.daily)
    || !Array.isArray(report.sources)
    || report.daily.length !== key.period) return false;
  const start = dateValue(report.range.startDate);
  for (let index = 0; index < report.daily.length; index += 1) {
    const day = report.daily[index];
    if (!isObject(day) || dateValue(day.date) !== start + index * 86_400_000
      || !countValue(day.views) || !countValue(day.clicks)) return false;
  }
  return report.sources.every((source) => isObject(source)
    && typeof source.sourceMedium === 'string'
    && countValue(source.views));
}

function validLinks(links, page) {
  if (!isObject(links)
    || links.page !== page
    || links.pageSize !== LINK_PAGE_SIZE
    || !Number.isSafeInteger(links.totalRows)
    || links.totalRows < 0
    || !Array.isArray(links.rows)
    || links.rows.length > LINK_PAGE_SIZE) return false;
  return links.rows.every((row) => isObject(row)
    && typeof row.linkId === 'string'
    && row.linkId !== ''
    && countValue(row.clicks));
}

function validFull(report, key) {
  return validCommon(report, key)
    && report.page === key.page
    && validLinks(report.links, key.page);
}

function validPeriod(report, key) {
  return validCommon(report, key);
}

function validLinkPart(report, key) {
  return isObject(report)
    && report.creatorId === key.profileId
    && report.period === key.period
    && report.page === key.page
    && validRange(report.range, key.period)
    && validLinks(report.links, key.page)
    && validWarnings(report.warnings)
    && isoValue(report.captureStartedAt);
}

function isCurrentWindow(report, milliseconds) {
  return localDate(report.range.timeZone, milliseconds) === report.range.endDate;
}

function isFreshAt(report, updatedAt, milliseconds) {
  return milliseconds < updatedAt + FRESHNESS_MS && isCurrentWindow(report, milliseconds);
}

function validNow(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('now must return a non-negative epoch timestamp in milliseconds');
  }
  return value;
}

function validEnvelope(envelope, key, validator, now, { requireRevision = false } = {}) {
  if (!isObject(envelope)
    || envelope.invalid === true
    || envelope.schemaVersion !== SCHEMA_VERSION
    || (requireRevision && (typeof envelope.revision !== 'string' || envelope.revision.trim() === ''))
    || !Number.isSafeInteger(envelope.updatedAt)
    || !Number.isSafeInteger(envelope.expiresAt)
    || !Number.isSafeInteger(envelope.retainUntil)
    || envelope.updatedAt < 0
    || envelope.updatedAt > now
    || envelope.expiresAt !== envelope.updatedAt + FRESHNESS_MS
    || envelope.retainUntil !== envelope.updatedAt + RETENTION_MS
    || !validator(envelope.report, key)) return null;
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

function cacheEnvelope(report, updatedAt) {
  return {
    schemaVersion: SCHEMA_VERSION,
    report: structuredClone(report),
    updatedAt,
    expiresAt: updatedAt + FRESHNESS_MS,
    retainUntil: updatedAt + RETENTION_MS,
  };
}

function periodFromFull(report) {
  const { links: ignored, page: ignoredPage, ...common } = report;
  common.warnings = common.warnings.filter(({ section }) => section !== 'links');
  return common;
}

function summaryFromPeriod(report) {
  return {
    creatorId: report.creatorId,
    period: report.period,
    range: structuredClone(report.range),
    totals: structuredClone(report.totals),
    warnings: structuredClone(report.warnings.filter(({ section }) => section === 'visits' || section === 'clicks')),
    captureStartedAt: report.captureStartedAt,
  };
}

function mergedWarnings(...groups) {
  const result = [];
  const seen = new Set();
  for (const group of groups) {
    for (const warning of group) {
      const identity = JSON.stringify(warning);
      if (seen.has(identity)) continue;
      seen.add(identity);
      result.push(structuredClone(warning));
    }
  }
  return result;
}

function combinePeriodAndLinks(period, links) {
  return {
    ...structuredClone(period),
    page: links.page,
    links: structuredClone(links.links),
    warnings: mergedWarnings(period.warnings, links.warnings),
  };
}

function observation(raw, key, validator, now, readable = true) {
  const valid = validEnvelope(raw, key, validator, now, { requireRevision: true });
  return {
    valid,
    authority: readable && (raw === undefined || valid !== null),
    revision: valid?.revision,
  };
}

function isConflict(error) {
  return error?.conditionalConflict === true
    || error?.code === 'CREATOR_STATISTICS_CACHE_CONFLICT'
    || error?.name === 'CreatorStatisticsCacheConflict';
}

export function createCachedCreatorStatistics({ reader, cache, now = Date.now } = {}) {
  if (!reader || typeof reader.read !== 'function') throw new TypeError('reader.read is required');
  if (!cache || typeof cache.get !== 'function' || typeof cache.put !== 'function') {
    throw new TypeError('cache.get and cache.put are required');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const inFlight = new Map();

  async function observe(key, validator) {
    let raw;
    try {
      raw = await cache.get(key);
    } catch {
      return observation(undefined, key, validator, validNow(now), false);
    }
    return observation(raw, key, validator, validNow(now));
  }

  async function publish(key, envelope, predecessor) {
    if (!predecessor.authority) return 'unauthorized';
    try {
      await cache.put(key, envelope, predecessor.revision);
      return 'published';
    } catch (error) {
      return isConflict(error) ? 'conflict' : 'failed';
    }
  }

  async function rereadWinner(key, validator) {
    try {
      const raw = await cache.get(key);
      const checkedAt = validNow(now);
      return validEnvelope(raw, key, validator, checkedAt, { requireRevision: true });
    } catch {
      return null;
    }
  }

  async function legacyFallback(query, kind) {
    if (typeof cache.readLegacy !== 'function') return null;
    const legacyKey = keyFor(query, 'page', query.page ?? 1);
    try {
      const raw = await cache.readLegacy(legacyKey);
      const checkedAt = validNow(now);
      const pageKey = { profileId: query.profileId, period: query.period, page: query.page ?? 1 };
      const envelope = validEnvelope(raw, pageKey, (report, key) => validFull(report, key), checkedAt);
      if (!envelope || checkedAt >= envelope.retainUntil) return null;
      if (kind === 'summary') return { report: summaryFromPeriod(envelope.report), updatedAt: envelope.updatedAt };
      return { report: envelope.report, updatedAt: envelope.updatedAt };
    } catch {
      return null;
    }
  }

  async function fallbackDetail(query, pageObservation, nowValue) {
    if (pageObservation.valid && nowValue < pageObservation.valid.retainUntil) {
      return response(pageObservation.valid.report, 'stale', pageObservation.valid.updatedAt);
    }
    const legacy = await legacyFallback(query, 'page');
    return legacy ? response(legacy.report, 'stale', legacy.updatedAt) : null;
  }

  async function fallbackSummary(query, summaryObservation, periodObservation, nowValue) {
    if (summaryObservation.valid && nowValue < summaryObservation.valid.retainUntil) {
      return response(summaryObservation.valid.report, 'stale', summaryObservation.valid.updatedAt);
    }
    if (periodObservation.valid && nowValue < periodObservation.valid.retainUntil) {
      return response(summaryFromPeriod(periodObservation.valid.report), 'stale', periodObservation.valid.updatedAt);
    }
    const legacy = await legacyFallback(query, 'summary');
    return legacy ? response(legacy.report, 'stale', legacy.updatedAt) : null;
  }

  async function readSummaryOnce(query) {
    const summaryKey = keyFor(query, 'summary');
    const periodKey = keyFor(query, 'period');
    const summaryObservation = await observe(summaryKey, validSummary);
    let checkedAt = validNow(now);
    if (summaryObservation.valid && isFreshAt(summaryObservation.valid.report, summaryObservation.valid.updatedAt, checkedAt)) {
      return response(summaryObservation.valid.report, 'fresh', summaryObservation.valid.updatedAt);
    }
    const periodObservation = await observe(periodKey, validPeriod);
    if (periodObservation.valid && isFreshAt(periodObservation.valid.report, periodObservation.valid.updatedAt, checkedAt)) {
      const report = summaryFromPeriod(periodObservation.valid.report);
      checkedAt = validNow(now);
      if (isFreshAt(report, periodObservation.valid.updatedAt, checkedAt)) {
        return response(report, 'fresh', periodObservation.valid.updatedAt);
      }
    }

    let report;
    try {
      if (typeof reader.readSummary === 'function') report = await reader.readSummary(query);
      else {
        const detail = await reader.read({ ...query, page: 1 });
        report = summaryFromPeriod(detail);
      }
      if (!validSummary(report, query)) throw new Error('statistics reader returned an invalid summary');
    } catch (error) {
      checkedAt = validNow(now);
      return (await fallbackSummary(query, summaryObservation, periodObservation, checkedAt)) ?? Promise.reject(error);
    }

    const updatedAt = validNow(now);
    if (!isCurrentWindow(report, updatedAt)) return { [WINDOW_CHANGED]: true, report, updatedAt };
    const publication = await publish(summaryKey, cacheEnvelope(report, updatedAt), summaryObservation);
    checkedAt = validNow(now);
    if (!isFreshAt(report, updatedAt, checkedAt)) return { [WINDOW_CHANGED]: true, report, updatedAt };
    if (publication === 'conflict') {
      const winner = await rereadWinner(summaryKey, validSummary);
      if (winner && isFreshAt(winner.report, winner.updatedAt, validNow(now))) {
        return response(winner.report, 'fresh', winner.updatedAt);
      }
    }
    return response(report, 'fresh', updatedAt);
  }

  async function readDetailOnce(query) {
    const pageKey = keyFor(query, 'page');
    const periodKey = keyFor(query, 'period');
    const pageObservation = await observe(pageKey, validFull);
    let checkedAt = validNow(now);
    if (pageObservation.valid && isFreshAt(pageObservation.valid.report, pageObservation.valid.updatedAt, checkedAt)) {
      return response(pageObservation.valid.report, 'fresh', pageObservation.valid.updatedAt);
    }
    const periodObservation = await observe(periodKey, validPeriod);
    checkedAt = validNow(now);

    let report;
    let commonUpdatedAt;
    let fullProvider = true;
    try {
      if (periodObservation.valid && isFreshAt(periodObservation.valid.report, periodObservation.valid.updatedAt, checkedAt)
        && typeof reader.readLinks === 'function') {
        fullProvider = false;
        const links = await reader.readLinks({
          profileId: query.profileId,
          period: query.period,
          page: query.page,
          range: structuredClone(periodObservation.valid.report.range),
        });
        if (!validLinkPart(links, query)
          || !sameRange(links.range, periodObservation.valid.report.range)
          || links.captureStartedAt !== periodObservation.valid.report.captureStartedAt) {
          throw new Error('statistics reader returned an invalid link page');
        }
        report = combinePeriodAndLinks(periodObservation.valid.report, links);
        commonUpdatedAt = periodObservation.valid.updatedAt;
      } else {
        report = await reader.read(query);
      }
      if (!validFull(report, query)) throw new Error('statistics reader returned an invalid report');
    } catch (error) {
      checkedAt = validNow(now);
      return (await fallbackDetail(query, pageObservation, checkedAt)) ?? Promise.reject(error);
    }

    const updatedAt = commonUpdatedAt ?? validNow(now);
    checkedAt = validNow(now);
    if (!isFreshAt(report, updatedAt, checkedAt)) return { [WINDOW_CHANGED]: true, report, updatedAt };
    if (fullProvider) {
      const periodReport = periodFromFull(report);
      if (periodObservation.authority) {
        // A period conflict does not invalidate this full candidate: its
        // common fields and requested links were produced together. Keep that
        // coherent result instead of mixing it with another period winner.
        await publish(periodKey, cacheEnvelope(periodReport, updatedAt), periodObservation);
        checkedAt = validNow(now);
        if (!isFreshAt(report, updatedAt, checkedAt)) return { [WINDOW_CHANGED]: true, report, updatedAt };
      }
      if (pageObservation.authority) {
        const pagePublication = await publish(pageKey, cacheEnvelope(report, updatedAt), pageObservation);
        checkedAt = validNow(now);
        if (!isFreshAt(report, updatedAt, checkedAt)) return { [WINDOW_CHANGED]: true, report, updatedAt };
        if (pagePublication === 'conflict') {
          const winner = await rereadWinner(pageKey, validFull);
          if (winner && isFreshAt(winner.report, winner.updatedAt, validNow(now))) {
            return response(winner.report, 'fresh', winner.updatedAt);
          }
        }
      }
    } else {
      if (pageObservation.authority) {
        const pagePublication = await publish(pageKey, cacheEnvelope(report, updatedAt), pageObservation);
        checkedAt = validNow(now);
        if (!isFreshAt(report, updatedAt, checkedAt)) return { [WINDOW_CHANGED]: true, report, updatedAt };
        if (pagePublication === 'conflict') {
          const winner = await rereadWinner(pageKey, validFull);
          if (winner && isFreshAt(winner.report, winner.updatedAt, validNow(now))) {
            return response(winner.report, 'fresh', winner.updatedAt);
          }
        }
      }
    }
    return response(report, 'fresh', updatedAt);
  }

  async function settle(fingerprint, run, rolloverFallback) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let shared = inFlight.get(fingerprint);
      if (!shared) {
        shared = run().finally(() => {
          if (inFlight.get(fingerprint) === shared) inFlight.delete(fingerprint);
        });
        inFlight.set(fingerprint, shared);
      }
      const value = await shared;
      if (value?.[WINDOW_CHANGED]) {
        if (attempt === 1) return rolloverFallback(value);
        continue;
      }
      const checkedAt = validNow(now);
      const updatedAt = Date.parse(value.updatedAt);
      if (value.freshness !== 'fresh' || isFreshAt(value, updatedAt, checkedAt)) return structuredClone(value);
      if (attempt === 1) return { ...structuredClone(value), freshness: 'stale' };
    }
    throw new Error('statistics read did not settle');
  }

  async function read(input) {
    const query = normalizeQuery(input, { kind: 'page' });
    const fingerprint = JSON.stringify(['page', query.profileId, query.period, query.page]);
    return settle(
      fingerprint,
      () => readDetailOnce(query),
      async (value) => {
        const fallback = await legacyFallback(query, 'page');
        return fallback ? response(fallback.report, 'stale', fallback.updatedAt) : response(value.report, 'stale', value.updatedAt);
      },
    );
  }

  async function readSummary(input) {
    const query = normalizeQuery(input, { kind: 'summary' });
    const fingerprint = JSON.stringify(['summary', query.profileId, query.period]);
    return settle(
      fingerprint,
      () => readSummaryOnce(query),
      async (value) => {
        const fallback = await legacyFallback(query, 'summary');
        return fallback ? response(fallback.report, 'stale', fallback.updatedAt) : response(value.report, 'stale', value.updatedAt);
      },
    );
  }

  return { read, readSummary };
}

export {
  SCHEMA_VERSION as CREATOR_STATISTICS_CACHE_SCHEMA_VERSION,
  FRESHNESS_MS as CREATOR_STATISTICS_FRESHNESS_MS,
  RETENTION_MS as CREATOR_STATISTICS_RETENTION_MS,
};
