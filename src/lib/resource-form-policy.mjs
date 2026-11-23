import { FORMATS_BY_KIND, KIND_LABELS, MAX_RESOURCE_TOPICS, TOPICS, validateTaxonomy } from './resource-taxonomy.mjs';

export const RESOURCE_METADATA_POLICIES = Object.freeze({
  public: Object.freeze({
    title: Object.freeze({ maxLength: 240, required: true }),
    url: Object.freeze({ maxLength: 2048, required: true }),
    description: Object.freeze({ maxLength: 8000, required: true }),
  }),
  owner: Object.freeze({
    title: Object.freeze({ maxLength: 200, required: true }),
    url: Object.freeze({ maxLength: 2048, required: true }),
    description: Object.freeze({ maxLength: 2000, required: false }),
  }),
});

export const RESOURCE_CLASSIFICATION_LIMITS = Object.freeze({ maxTopics: MAX_RESOURCE_TOPICS });

export function formatsForKind(kind) {
  return Object.hasOwn(FORMATS_BY_KIND, kind) ? FORMATS_BY_KIND[kind] : [];
}

export function isResourceKind(value) {
  return typeof value === 'string' && Object.hasOwn(KIND_LABELS, value);
}

export function isResourceFormat(value) {
  return typeof value === 'string' && Object.values(FORMATS_BY_KIND).some((formats) => formats.includes(value));
}

export function isResourceTopic(value) {
  return typeof value === 'string' && TOPICS.includes(value);
}

/**
 * Apply one user action without normalising unrelated initial values. This
 * keeps invalid stored values visible in Administration until corrected.
 */
export function transitionResourceClassification(current, change) {
  const next = {
    kind: typeof current?.kind === 'string' ? current.kind : '',
    format: typeof current?.format === 'string' ? current.format : '',
    topics: Array.isArray(current?.topics) ? [...current.topics] : [],
  };

  if (change.type === 'kind') {
    next.kind = change.value;
    if (!formatsForKind(change.value).includes(next.format)) next.format = '';
    return { value: next, accepted: true };
  }

  if (change.type === 'format') {
    next.format = change.value;
    return { value: next, accepted: true };
  }

  const index = next.topics.indexOf(change.value);
  if (change.checked) {
    if (index >= 0) return { value: next, accepted: true };
    if (next.topics.length >= RESOURCE_CLASSIFICATION_LIMITS.maxTopics) {
      return { value: next, accepted: false, rejectedField: 'topics' };
    }
    next.topics.push(change.value);
  } else if (index >= 0) {
    next.topics.splice(index, 1);
  }
  return { value: next, accepted: true };
}

export function validateResourceClassification(value) {
  try {
    const normalized = validateTaxonomy(value);
    return { valid: true, value: normalized };
  } catch (error) {
    const fieldError = error && typeof error === 'object' && Array.isArray(error.fieldErrors)
      ? error.fieldErrors[0] : undefined;
    if (fieldError && typeof fieldError === 'object'
      && (fieldError.field === 'kind-format' || fieldError.field === 'topics')
      && (fieldError.reason === 'invalid_combination' || fieldError.reason === 'invalid_option')) {
      return { valid: false, field: fieldError.field, reason: fieldError.reason };
    }
    return { valid: false, field: 'kind-format', reason: 'required' };
  }
}

export { FORMATS_BY_KIND, KIND_LABELS, TOPICS };
