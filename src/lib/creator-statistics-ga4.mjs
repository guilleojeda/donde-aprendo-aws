const API_ROOT = 'https://analyticsdata.googleapis.com/v1beta/properties/';
const LINK_PAGE_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 100;
const TRANSIENT_STATUSES = new Set([408, 500, 502, 503, 504]);
const DIRECT_SOURCE = 'Directo o sin origen identificable';

const REPORTS = [
  {
    key: 'visits',
    section: 'visits',
    dimensions: [],
    metrics: ['eventCount', 'totalUsers'],
    eventFilter: { value: 'creator_view' },
  },
  {
    key: 'daily',
    section: 'daily',
    dimensions: ['date', 'eventName'],
    metrics: ['eventCount'],
    eventFilter: { values: ['creator_view', 'creator_link_click'] },
    orderBys: [
      { dimension: { dimensionName: 'date' }, desc: false },
      { dimension: { dimensionName: 'eventName' }, desc: false },
    ],
    limit: 100,
  },
  {
    key: 'links',
    section: 'links',
    dimensions: ['customEvent:link_id'],
    metrics: ['eventCount'],
    eventFilter: { value: 'creator_link_click' },
    orderBys: [{ dimension: { dimensionName: 'customEvent:link_id' }, desc: false }],
    limit: LINK_PAGE_SIZE,
  },
  {
    key: 'sources',
    section: 'sources',
    dimensions: ['sessionSourceMedium'],
    metrics: ['eventCount'],
    eventFilter: { value: 'creator_view' },
    orderBys: [{ dimension: { dimensionName: 'sessionSourceMedium' }, desc: false }],
    limit: LINK_PAGE_SIZE,
  },
  {
    key: 'clicks',
    section: 'clicks',
    dimensions: [],
    metrics: ['eventCount'],
    eventFilter: { value: 'creator_link_click' },
  },
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unavailable() {
  return new Error('GA4 statistics are temporarily unavailable.');
}

function validCaptureTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function localDate(timeZone, milliseconds) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(milliseconds));
  } catch {
    throw unavailable();
  }
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = `${values.year}-${values.month}-${values.day}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw unavailable();
  return date;
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw unavailable();
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function reportDate(value) {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) throw unavailable();
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) throw unavailable();
  return date;
}

function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function dateRange(period, timeZone, nowValue) {
  const endDate = localDate(timeZone, nowValue);
  return { startDate: addDays(endDate, -(period - 1)), endDate, timeZone };
}

function validCounter(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw unavailable();
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw unavailable();
  return count;
}

function eventFilter(profileId, filter) {
  const selectedEvent = filter.values
    ? { inListFilter: { values: filter.values, caseSensitive: true } }
    : { stringFilter: { matchType: 'EXACT', value: filter.value, caseSensitive: true } };
  return {
    andGroup: {
      expressions: [
        {
          filter: {
            fieldName: 'customEvent:creator_id',
            stringFilter: { matchType: 'EXACT', value: profileId, caseSensitive: true },
          },
        },
        { filter: { fieldName: 'eventName', ...selectedEvent } },
      ],
    },
  };
}

function queryFor(spec, profileId, period, page = 1) {
  const query = {
    dateRanges: [{ startDate: `${period - 1}daysAgo`, endDate: 'today' }],
    metrics: spec.metrics.map((name) => ({ name })),
    dimensionFilter: eventFilter(profileId, spec.eventFilter),
    returnPropertyQuota: true,
  };
  if (spec.dimensions.length > 0) query.dimensions = spec.dimensions.map((name) => ({ name }));
  if (spec.orderBys) query.orderBys = spec.orderBys;
  if (spec.limit) query.limit = String(spec.limit);
  if (spec.key === 'links') query.offset = String((page - 1) * LINK_PAGE_SIZE);
  if (spec.key === 'sources') query.offset = '0';
  return query;
}

function transientNetworkError(error) {
  return error?.name === 'AbortError' || error instanceof TypeError;
}

function pauseBeforeRetry() {
  return new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
}

function hasMetadataContent(value) {
  if (Array.isArray(value)) return value.some(hasMetadataContent);
  if (isRecord(value)) return Object.values(value).some(hasMetadataContent);
  return value !== undefined && value !== null && value !== false && value !== '';
}

async function fetchJson({ fetchImpl, url, body, token, timeoutMs }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (attempt === 0 && transientNetworkError(error)) {
        await pauseBeforeRetry();
        continue;
      }
      throw unavailable();
    }

    try {
      if (controller.signal.aborted) throw unavailable();
      if (!response || typeof response.ok !== 'boolean') throw unavailable();
      if (!response.ok) {
        if (attempt === 0 && TRANSIENT_STATUSES.has(response.status)) {
          clearTimeout(timeout);
          await pauseBeforeRetry();
          continue;
        }
        throw unavailable();
      }
      const payload = await response.json();
      if (controller.signal.aborted) throw unavailable();
      if (!isRecord(payload)) throw unavailable();
      return payload;
    } catch {
      throw unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }
  throw unavailable();
}

function headerMap(report, field, expectedNames) {
  const rawHeaders = report[field];
  if (field === 'dimensionHeaders' && rawHeaders === undefined && expectedNames.length === 0) return new Map();
  if (!Array.isArray(rawHeaders)) throw unavailable();
  const names = rawHeaders.map((header) => {
    if (!isRecord(header) || typeof header.name !== 'string' || header.name === '') throw unavailable();
    return header.name;
  });
  if (names.length !== expectedNames.length || new Set(names).size !== names.length
    || expectedNames.some((name) => !names.includes(name))) throw unavailable();
  return new Map(names.map((name, index) => [name, index]));
}

function omittedEmptyReport(report, spec, offset) {
  if (!isRecord(report)
    || !isRecord(report.metadata)
    || !isRecord(report.propertyQuota)
    || report.kind !== 'analyticsData#runReport'
    || Object.hasOwn(report, 'rows')
    || Object.hasOwn(report, 'rowCount')) return null;
  if (offset > 0 && spec.key !== 'links') throw unavailable();

  const noHeaders = !Object.hasOwn(report, 'dimensionHeaders') && !Object.hasOwn(report, 'metricHeaders');
  if (noHeaders) {
    if (spec.dimensions.length > 0) throw unavailable();
  } else {
    headerMap(report, 'dimensionHeaders', spec.dimensions);
    headerMap(report, 'metricHeaders', spec.metrics);
    for (const header of report.metricHeaders) if (header.type !== 'TYPE_INTEGER') throw unavailable();
  }

  const warnings = copyKnownMetadata(report.metadata).map((warning) => ({ ...warning, section: spec.section }));
  if (typeof report.metadata.timeZone !== 'string') throw unavailable();
  return {
    rows: [],
    rowCount: 0,
    rowsOmitted: true,
    timeZone: report.metadata.timeZone,
    warnings,
    metadata: report.metadata,
  };
}

function truncationReason(value) {
  if (!isRecord(value)) throw unavailable();
  const reason = {};
  if (Object.hasOwn(value, 'dataTruncationType')) {
    if (typeof value.dataTruncationType !== 'string') throw unavailable();
    reason.dataTruncationType = value.dataTruncationType;
  }
  if (Object.hasOwn(value, 'dataTruncationMessage')) {
    if (typeof value.dataTruncationMessage !== 'string') throw unavailable();
    reason.dataTruncationMessage = value.dataTruncationMessage;
  }
  if (Object.hasOwn(value, 'dataTruncationDate')) {
    if (value.dataTruncationDate !== '' && !validIsoDate(value.dataTruncationDate)) throw unavailable();
    reason.dataTruncationDate = value.dataTruncationDate;
  }
  if (Object.hasOwn(value, 'dataTruncationDateRanges')) {
    if (!Array.isArray(value.dataTruncationDateRanges)) throw unavailable();
    reason.dataTruncationDateRanges = value.dataTruncationDateRanges.map((range) => {
      if (!isRecord(range)) throw unavailable();
      const safeRange = {};
      for (const field of ['startDate', 'endDate']) {
        if (!Object.hasOwn(range, field)) continue;
        if (range[field] !== '' && !validIsoDate(range[field])) throw unavailable();
        safeRange[field] = range[field];
      }
      return safeRange;
    });
  }
  return reason;
}

function copyKnownMetadata(metadata) {
  const warnings = [];
  if (Object.hasOwn(metadata, 'emptyReason')) {
    if (typeof metadata.emptyReason !== 'string' || metadata.emptyReason !== '') throw unavailable();
  }

  if (Object.hasOwn(metadata, 'subjectToThresholding') && typeof metadata.subjectToThresholding !== 'boolean') {
    throw unavailable();
  }
  if (metadata.subjectToThresholding === true) {
    warnings.push({ section: '', code: 'thresholding', details: { subjectToThresholding: true } });
  }

  if (Object.hasOwn(metadata, 'dataLossFromOtherRow') && typeof metadata.dataLossFromOtherRow !== 'boolean') {
    throw unavailable();
  }
  if (metadata.dataLossFromOtherRow === true) {
    warnings.push({ section: '', code: 'other-row', details: { dataLossFromOtherRow: true } });
  }

  if (Object.hasOwn(metadata, 'samplingMetadatas')) {
    if (!Array.isArray(metadata.samplingMetadatas)) throw unavailable();
    const samples = metadata.samplingMetadatas.map((sample) => {
      if (!isRecord(sample)) throw unavailable();
      const { samplesReadCount, samplingSpaceSize } = sample;
      if (typeof samplesReadCount !== 'string' || !/^\d+$/.test(samplesReadCount)
        || typeof samplingSpaceSize !== 'string' || !/^\d+$/.test(samplingSpaceSize)) throw unavailable();
      return { samplesReadCount, samplingSpaceSize };
    });
    if (samples.length > 0) warnings.push({ section: '', code: 'sampling', details: { samplingMetadatas: samples } });
  }

  if (Object.hasOwn(metadata, 'schemaRestrictionResponse')) {
    const restrictions = metadata.schemaRestrictionResponse;
    if (!isRecord(restrictions)) throw unavailable();
    if (hasMetadataContent(restrictions)) {
      warnings.push({ section: '', code: 'restricted', details: { schemaRestrictionResponse: structuredClone(restrictions) } });
    }
  }

  if (Object.hasOwn(metadata, 'dataTruncationReasons')) {
    const reasons = metadata.dataTruncationReasons;
    if (!Array.isArray(reasons)) throw unavailable();
    const safeReasons = reasons.map(truncationReason);
    if (safeReasons.length > 0) warnings.push({ section: '', code: 'data-loss', details: { dataTruncationReasons: safeReasons } });
  }

  return warnings;
}

function parseReport(report, spec, { offset = 0, limit } = {}) {
  if (!isRecord(report)) throw unavailable();
  const omitted = omittedEmptyReport(report, spec, offset);
  if (omitted) return omitted;
  if (!isRecord(report.metadata) || typeof report.metadata.timeZone !== 'string') throw unavailable();
  const dimensions = headerMap(report, 'dimensionHeaders', spec.dimensions);
  const metrics = headerMap(report, 'metricHeaders', spec.metrics);
  for (const header of report.metricHeaders) if (header.type !== 'TYPE_INTEGER') throw unavailable();

  const rowCount = report.rowCount;
  if (!Number.isSafeInteger(rowCount) || rowCount < 0) throw unavailable();
  const rows = report.rows === undefined ? [] : report.rows;
  if (!Array.isArray(rows)) throw unavailable();
  if (limit !== undefined && rows.length > limit) throw unavailable();
  const emptyLinkPagePastEnd = spec.key === 'links' && rows.length === 0 && offset > rowCount;
  if (offset > rowCount && !emptyLinkPagePastEnd) throw unavailable();
  if (offset + rows.length > rowCount && !emptyLinkPagePastEnd) throw unavailable();

  const parsedRows = rows.map((row) => {
    if (!isRecord(row)) throw unavailable();
    const dimensionValues = row.dimensionValues === undefined ? [] : row.dimensionValues;
    const metricValues = row.metricValues;
    if (!Array.isArray(dimensionValues) || dimensionValues.length !== dimensions.size
      || !Array.isArray(metricValues) || metricValues.length !== metrics.size) throw unavailable();
    const parsedDimensions = {};
    for (const [name, index] of dimensions) {
      const value = dimensionValues[index]?.value;
      if (value !== undefined && typeof value !== 'string') throw unavailable();
      parsedDimensions[name] = value ?? '';
    }
    const parsedMetrics = {};
    for (const [name, index] of metrics) {
      parsedMetrics[name] = validCounter(metricValues[index]?.value);
    }
    return { dimensions: parsedDimensions, metrics: parsedMetrics };
  });

  const warnings = copyKnownMetadata(report.metadata).map((warning) => ({ ...warning, section: spec.section }));
  return {
    rows: parsedRows,
    rowCount,
    timeZone: report.metadata.timeZone,
    warnings,
    metadata: report.metadata,
  };
}

function ensureCompleteUnpaginated(report, spec) {
  const parsed = parseReport(report, spec);
  if (parsed.rows.length !== parsed.rowCount) throw unavailable();
  if (spec.dimensions.length === 0 && parsed.rows.length > 1) throw unavailable();
  return parsed;
}

function warningsFrom(reports) {
  const seen = new Set();
  const warnings = [];
  for (const spec of REPORTS) {
    for (const warning of reports[spec.key].warnings) {
      const identity = `${warning.section}\u0000${warning.code}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      warnings.push(warning);
    }
  }
  return warnings;
}

function reportHasUnknownValues(report) {
  return report.warnings.some(({ code }) => code === 'thresholding' || code === 'restricted' || code === 'data-loss');
}

function reportMayHideMissingRows(report) {
  return report.warnings.length > 0;
}

function dimensionValue(row, name) {
  const value = row.dimensions[name];
  if (typeof value !== 'string') throw unavailable();
  return value;
}

function eventValue(row, name) {
  const value = row.metrics[name];
  if (!Number.isSafeInteger(value) || value < 0) throw unavailable();
  return value;
}

function readEventTotals(report, metric) {
  if (report.rows.length === 0 && report.warnings.length > 0) return null;
  if (reportHasUnknownValues(report)) return null;
  if (report.rows.length === 0) return 0;
  return eventValue(report.rows[0], metric);
}

function normalizeLinkId(value) {
  return value === '' ? '(not set)' : value;
}

function normalizeSource(value) {
  return value === '' || value === '(not set)' || value === '(direct) / (none)'
    ? DIRECT_SOURCE
    : value;
}

function aggregateLinks(report, page, offset) {
  const combined = new Map();
  for (const row of report.rows) {
    const linkId = normalizeLinkId(dimensionValue(row, 'customEvent:link_id'));
    const count = eventValue(row, 'eventCount');
    const prior = combined.get(linkId) ?? 0;
    const value = reportHasUnknownValues(report) ? null : prior === null ? null : prior + count;
    combined.set(linkId, value);
  }
  const expectedRows = Math.min(LINK_PAGE_SIZE, Math.max(0, report.rowCount - offset));
  if (report.rows.length !== expectedRows) throw unavailable();
  return {
    page,
    pageSize: LINK_PAGE_SIZE,
    totalRows: report.rowCount,
    rows: [...combined].map(([linkId, clicks]) => ({ linkId, clicks })),
  };
}

function aggregateSources(report) {
  const combined = new Map();
  for (const row of report.rows) {
    const sourceMedium = normalizeSource(dimensionValue(row, 'sessionSourceMedium'));
    const count = eventValue(row, 'eventCount');
    const prior = combined.get(sourceMedium) ?? 0;
    combined.set(sourceMedium, prior === null ? null : prior + count);
  }

  const limited = reportHasUnknownValues(report);
  return [...combined]
    .map(([sourceMedium, views]) => ({ sourceMedium, views: limited ? null : views }))
    .sort((left, right) => {
      if (left.views === null && right.views !== null) return 1;
      if (left.views !== null && right.views === null) return -1;
      if (left.views !== right.views) return (right.views ?? 0) - (left.views ?? 0);
      return left.sourceMedium < right.sourceMedium ? -1 : left.sourceMedium > right.sourceMedium ? 1 : 0;
    })
    .slice(0, 10);
}

async function readSourcePages({ report, spec, query, endpoint, fetchImpl, token, timeoutMs }) {
  const parsedFirst = parseReport(report, spec, { limit: LINK_PAGE_SIZE });
  if (parsedFirst.rowCount < parsedFirst.rows.length) throw unavailable();
  const rows = [...parsedFirst.rows];
  const warnings = [...parsedFirst.warnings];
  let offset = rows.length;
  while (offset < parsedFirst.rowCount) {
    if (rows.length === 0) throw unavailable();
    const nextQuery = { ...query, offset: String(offset) };
    const response = await fetchJson({ fetchImpl, url: endpoint.replace(':batchRunReports', ':runReport'), body: nextQuery, token, timeoutMs });
    const page = parseReport(response, spec, { offset, limit: LINK_PAGE_SIZE });
    if (page.timeZone !== parsedFirst.timeZone || page.rowCount !== parsedFirst.rowCount
      || page.rows.length === 0 || page.rows.length > parsedFirst.rowCount - offset) throw unavailable();
    rows.push(...page.rows);
    warnings.push(...page.warnings);
    offset += page.rows.length;
  }
  return { ...parsedFirst, rows, warnings };
}

function validateReadInput({ profileId, period, page }) {
  if (typeof profileId !== 'string' || profileId.trim() === '' || profileId !== profileId.trim()) throw new TypeError('profileId must be a non-empty string');
  if (period !== 7 && period !== 30) throw new TypeError('period must be 7 or 30');
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger((page - 1) * LINK_PAGE_SIZE)) {
    throw new TypeError('page must be a positive integer');
  }
  return { profileId, period, page };
}

export function createGA4StatisticsReader({
  propertyId,
  captureStartedAt,
  now = Date.now,
  getAccessToken,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof propertyId !== 'string' || !/^\d+$/.test(propertyId)) throw new TypeError('propertyId must be a GA4 property ID');
  if (!validCaptureTimestamp(captureStartedAt)) throw new TypeError('captureStartedAt must be an ISO UTC timestamp');
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  if (typeof getAccessToken !== 'function') throw new TypeError('getAccessToken must be a function');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch must be a function');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('timeoutMs must be a positive integer');

  const endpoint = `${API_ROOT}${encodeURIComponent(propertyId)}`;

  return {
    async read(input) {
      const key = validateReadInput(input);

      let token;
      try {
        token = await getAccessToken();
      } catch {
        throw unavailable();
      }
      if (typeof token !== 'string' || token.trim() === '' || /\s/.test(token)) throw unavailable();
      const nowValue = now();
      if (!Number.isSafeInteger(nowValue) || nowValue < 0) throw new TypeError('now must return a non-negative epoch timestamp in milliseconds');

      const queries = REPORTS.map((spec) => queryFor(spec, key.profileId, key.period, key.page));
      const response = await fetchJson({
        fetchImpl,
        url: `${endpoint}:batchRunReports`,
        body: { requests: queries },
        token,
        timeoutMs,
      });
      if (!Array.isArray(response.reports) || response.reports.length !== REPORTS.length) throw unavailable();

      const reports = {};
      for (let index = 0; index < REPORTS.length; index += 1) {
        const spec = REPORTS[index];
        const rawReport = response.reports[index];
        if (spec.key === 'links') {
          const offset = (key.page - 1) * LINK_PAGE_SIZE;
          reports.links = parseReport(rawReport, spec, { offset, limit: LINK_PAGE_SIZE });
        } else if (spec.key === 'sources') {
          reports.sources = await readSourcePages({
            report: rawReport,
            spec,
            query: queries[index],
            endpoint: `${endpoint}:batchRunReports`,
            fetchImpl,
            token,
            timeoutMs,
          });
        } else {
          reports[spec.key] = ensureCompleteUnpaginated(rawReport, spec);
        }
      }

      const timeZone = reports.visits.timeZone;
      try {
        new Intl.DateTimeFormat('en', { timeZone });
      } catch {
        throw unavailable();
      }
      for (const spec of REPORTS) if (reports[spec.key].timeZone !== timeZone) throw unavailable();

      const finishValue = now();
      if (!Number.isSafeInteger(finishValue) || finishValue < 0) throw new TypeError('now must return a non-negative epoch timestamp in milliseconds');
      if (localDate(timeZone, nowValue) !== localDate(timeZone, finishValue)) throw unavailable();

      const range = dateRange(key.period, timeZone, nowValue);
      const measuredFrom = localDate(timeZone, Date.parse(captureStartedAt));
      const dailyCounts = new Map();
      const seenDaily = new Set();
      for (const row of reports.daily.rows) {
        const date = reportDate(dimensionValue(row, 'date'));
        const eventName = dimensionValue(row, 'eventName');
        if (date < range.startDate || date > range.endDate
          || (eventName !== 'creator_view' && eventName !== 'creator_link_click')) throw unavailable();
        const identity = `${date}\u0000${eventName}`;
        if (seenDaily.has(identity)) throw unavailable();
        seenDaily.add(identity);
        const counts = dailyCounts.get(date) ?? { views: null, clicks: null };
        if (eventName === 'creator_view') counts.views = eventValue(row, 'eventCount');
        else counts.clicks = eventValue(row, 'eventCount');
        dailyCounts.set(date, counts);
      }

      const dailyLimited = reportMayHideMissingRows(reports.daily);
      const daily = [];
      for (let index = 0; index < key.period; index += 1) {
        const date = addDays(range.startDate, index);
        if (date < measuredFrom) {
          daily.push({ date, views: null, clicks: null });
          continue;
        }
        if (reports.daily.warnings.some(({ code }) => code === 'thresholding')) {
          daily.push({ date, views: null, clicks: null });
          continue;
        }
        const counts = dailyCounts.get(date);
        daily.push({
          date,
          views: counts?.views ?? (dailyLimited ? null : 0),
          clicks: counts?.clicks ?? (dailyLimited ? null : 0),
        });
      }

      return {
        creatorId: key.profileId,
        period: key.period,
        page: key.page,
        range,
        totals: {
          views: readEventTotals(reports.visits, 'eventCount'),
          visitors: readEventTotals(reports.visits, 'totalUsers'),
          clicks: readEventTotals(reports.clicks, 'eventCount'),
        },
        daily,
        links: aggregateLinks(reports.links, key.page, (key.page - 1) * LINK_PAGE_SIZE),
        sources: aggregateSources(reports.sources),
        warnings: warningsFrom(reports),
        captureStartedAt,
      };
    },
  };
}
