export const KIND_LABELS = Object.freeze({
  content: 'Aprender',
  source: 'Creadores y canales',
  community: 'Comunidades',
});

export const FORMATS_BY_KIND = Object.freeze({
  content: Object.freeze(['Artículo', 'Video', 'Curso', 'Episodio de podcast', 'Herramienta', 'Otro']),
  source: Object.freeze(['Blog', 'Canal de YouTube', 'Podcast', 'Newsletter', 'Sitio web', 'Red social']),
  community: Object.freeze(['User Group', 'Student Builder Group', 'Grupo de estudio', 'Comunidad en línea']),
});

export const TOPICS = Object.freeze([
  'Arquitectura', 'Certificaciones', 'Comunidad', 'Contenedores', 'Cómputo', 'Datos',
  'Desarrollo web', 'DevOps', 'Fundamentos', 'Herramientas', 'Inteligencia Artificial',
  'Internet de las Cosas', 'Novedades', 'Operaciones', 'Redes', 'Seguridad', 'Serverless',
]);

/** The maximum number of explicit topics accepted by every resource writer. */
export const MAX_RESOURCE_TOPICS = 3;

const TOPIC_FOR_CATEGORY = Object.freeze({
  'Aplicaciones Móviles': 'Desarrollo web',
  'Aplicaciones Web': 'Desarrollo web',
  'Bases de Datos': 'Datos',
  Certificaciones: 'Certificaciones',
  Computo: 'Cómputo',
  Contenedores: 'Contenedores',
  Eventos: 'Comunidad',
  Frontend: 'Desarrollo web',
  Herramientas: 'Herramientas',
  'Ingeniería de Datos': 'Datos',
  'Inteligencia Artificial': 'Inteligencia Artificial',
  'Internet de las Cosas': 'Internet de las Cosas',
  Operaciones: 'Operaciones',
  Redes: 'Redes',
  Seguridad: 'Seguridad',
  Serverless: 'Serverless',
});

const NEWSLETTER_HOSTS = new Set(['desplegando.substack.com', 'newsletter.cuarzo.dev', 'es.simpleaws.dev']);

export function classifyLegacyResource(record) {
  const category = record.category ?? record.Category ?? '';
  const url = record.url;
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./u, '');
  const kind = inferKind(category, host, parsed.pathname);
  const format = inferFormat(kind, category, host, parsed.pathname, record.title ?? '');
  const topics = TOPIC_FOR_CATEGORY[category] ? [TOPIC_FOR_CATEGORY[category]] : [];
  return { kind, format, topics };
}

function inferKind(category, host, path) {
  if (category === 'Comunidad') return 'community';
  if (['Blog', 'Canal de YouTube', 'Podcast', 'TikTok', 'LinkedIn', 'Instagram'].includes(category)) return 'source';
  if (host === 'youtube.com' && (path.startsWith('/@') || path.startsWith('/channel/'))) return 'source';
  return 'content';
}

function inferFormat(kind, category, host, path, title) {
  if (kind === 'community') return 'User Group';
  if (kind === 'source') {
    if (host === 'youtube.com' || host === 'youtu.be') return 'Canal de YouTube';
    if (category === 'Podcast') return 'Podcast';
    if (NEWSLETTER_HOSTS.has(host)) return 'Newsletter';
    if (['TikTok', 'LinkedIn', 'Instagram'].includes(category)) return 'Red social';
    if (host === 'linktr.ee') return 'Sitio web';
    return 'Blog';
  }
  if (category === 'Curso' || (host === 'youtube.com' && path === '/playlist') || /^(curso|bootcamp|aws cloud practitioner challenge|grupo de estudio)/iu.test(title)) return 'Curso';
  if (host === 'youtube.com' || host === 'youtu.be') return 'Video';
  if (path.includes('/podcast-')) return 'Episodio de podcast';
  return 'Artículo';
}

export function validateTaxonomy(value, index = 0) {
  const { kind, format, topics } = value ?? {};
  if (kind === undefined || format === undefined
    || (typeof kind === 'string' && kind.length === 0)
    || (typeof format === 'string' && format.length === 0)) {
    const error = new Error(`Catalog record ${index + 1} has a required kind and format`);
    error.fieldErrors = [{ field: 'kind-format', reason: 'required' }];
    throw error;
  }
  if (typeof kind !== 'string' || !Object.hasOwn(KIND_LABELS, kind)) {
    throw new Error(`Catalog record ${index + 1} has an invalid kind`);
  }
  if (!FORMATS_BY_KIND[kind].includes(format)) {
    const error = new Error(`Catalog record ${index + 1} has an invalid format`);
    if (typeof format === 'string') error.fieldErrors = [{ field: 'kind-format', reason: 'invalid_combination' }];
    throw error;
  }
  if (!Array.isArray(topics) || topics.length > MAX_RESOURCE_TOPICS || new Set(topics).size !== topics.length
    || topics.some((topic) => !TOPICS.includes(topic))) {
    const error = new Error(`Catalog record ${index + 1} has invalid topics`);
    if (Array.isArray(topics) && topics.every((topic) => typeof topic === 'string')) {
      error.fieldErrors = [{ field: 'topics', reason: 'invalid_option' }];
    }
    throw error;
  }
  return { kind, format, topics: [...topics] };
}

const TAXONOMY_FIELDS = Object.freeze(['kind', 'format', 'topics']);

/**
 * Resolve the stored classification without changing the row.  A row that
 * contains any explicit taxonomy key is never interpreted as legacy data: a
 * partial or malformed tuple is `invalid`, even when its category or URL
 * could otherwise be inferred.
 */
export function resolveResourceClassification(record = {}, index = 0) {
  if (record?.recordType === 'event') return { state: 'event' };

  const hasExplicit = TAXONOMY_FIELDS.some((field) => Object.hasOwn(record, field));
  if (hasExplicit) {
    try {
      return { state: 'explicit', ...validateTaxonomy(record, index) };
    } catch {
      return { state: 'invalid' };
    }
  }

  const hasCategory = Object.hasOwn(record ?? {}, 'category') || Object.hasOwn(record ?? {}, 'Category');
  const category = Object.hasOwn(record ?? {}, 'category') ? record.category : record.Category;
  if (!hasCategory) return { state: 'absent' };
  if (typeof category !== 'string' || category.trim() === '') {
    return { state: 'invalid' };
  }
  try {
    return { state: 'legacy', ...validateTaxonomy(classifyLegacyResource(record), index) };
  } catch {
    return { state: 'invalid' };
  }
}

/** Return the three-key explicit tuple, or undefined for an omitted group. */
export function explicitTaxonomyFrom(value) {
  const present = TAXONOMY_FIELDS.filter((field) => Object.hasOwn(value ?? {}, field));
  if (present.length === 0) return undefined;
  if (present.length !== TAXONOMY_FIELDS.length) {
    const error = new Error('classification must include kind, format, and topics');
    error.fieldErrors = [{ field: 'kind-format', reason: 'required' }];
    throw error;
  }
  return validateTaxonomy(value);
}

export const RESOURCE_TAXONOMY_FIELDS = TAXONOMY_FIELDS;

// Retain the old field for existing integrations while the new taxonomy owns filtering.
export function legacyCategoryFor(taxonomy) {
  if (taxonomy.kind === 'community') return 'Comunidad';
  if (taxonomy.kind === 'source') {
    return { 'Canal de YouTube': 'Canal de YouTube', Podcast: 'Podcast', 'Red social': 'Otros' }[taxonomy.format] ?? 'Blog';
  }
  if (taxonomy.format === 'Curso') return 'Curso';
  const topic = taxonomy.topics[0];
  return {
    Arquitectura: 'Otros', Comunidad: 'Otros', Cómputo: 'Computo', Datos: 'Ingeniería de Datos',
    'Desarrollo web': 'Frontend', DevOps: 'Operaciones', Fundamentos: 'Otros', Novedades: 'Otros',
  }[topic] ?? topic ?? 'Otros';
}
