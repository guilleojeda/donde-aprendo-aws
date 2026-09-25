export const KIND_LABELS = Object.freeze({
  content: 'Aprender',
  source: 'Seguir',
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
  if (!Object.hasOwn(KIND_LABELS, kind)) throw new Error(`Catalog record ${index + 1} has an invalid kind`);
  if (!FORMATS_BY_KIND[kind].includes(format)) throw new Error(`Catalog record ${index + 1} has an invalid format`);
  if (!Array.isArray(topics) || topics.length > 3 || new Set(topics).size !== topics.length
    || topics.some((topic) => !TOPICS.includes(topic))) {
    throw new Error(`Catalog record ${index + 1} has invalid topics`);
  }
  return { kind, format, topics: [...topics] };
}

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
