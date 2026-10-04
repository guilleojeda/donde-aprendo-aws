import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESOURCE_COLLECTIONS,
  groupCertificationResources,
  isGenerativeAIResource,
  lookupResourceCollection,
  resourceCollectionResources,
} from '../src/lib/resource-collections.mjs';

test('registry exposes each approved collection route once', () => {
  const expectedPaths = [
    '/aprender/cursos/', '/aprender/videos/', '/aprender/articulos/',
    '/aprender/certificaciones/', '/aprender/serverless/', '/aprender/seguridad/',
    '/aprender/ia-generativa/', '/creadores/youtube/', '/creadores/blogs/',
    '/creadores/podcasts/', '/creadores/newsletters/',
    '/comunidades/user-groups/', '/comunidades/estudiantes/',
  ];

  assert.deepEqual(RESOURCE_COLLECTIONS.map(({ path }) => path), expectedPaths);
  assert.equal(new Set(RESOURCE_COLLECTIONS.map(({ path }) => path)).size, expectedPaths.length);
  assert.equal(RESOURCE_COLLECTIONS.length, expectedPaths.length);
  for (const path of expectedPaths) assert.equal(lookupResourceCollection(path)?.path, path);
});

test('format, topic, and kind selectors keep each collection within its intended scope', () => {
  const records = [
    { id: 'course', kind: 'content', format: 'Curso', topics: ['Seguridad'] },
    { id: 'video', kind: 'content', format: 'Video', topics: ['Serverless'] },
    { id: 'article', kind: 'content', format: 'Artículo', topics: ['Certificaciones'] },
    { id: 'blog', kind: 'source', format: 'Blog', topics: ['Seguridad'] },
    { id: 'podcast', kind: 'source', format: 'Podcast', topics: [] },
    { id: 'user-group', kind: 'community', format: 'User Group', topics: [] },
    { id: 'student-group', kind: 'community', format: 'Student Builder Group', topics: [] },
  ];
  const selectIds = (path) => resourceCollectionResources(lookupResourceCollection(path), records).map(({ id }) => id);

  assert.deepEqual(selectIds('/aprender/cursos/'), ['course']);
  assert.deepEqual(selectIds('/aprender/videos/'), ['video']);
  assert.deepEqual(selectIds('/aprender/articulos/'), ['article']);
  assert.deepEqual(selectIds('/aprender/certificaciones/'), ['article']);
  assert.deepEqual(selectIds('/aprender/serverless/'), ['video']);
  assert.deepEqual(selectIds('/aprender/seguridad/'), ['course']);
  assert.deepEqual(selectIds('/creadores/blogs/'), ['blog']);
  assert.deepEqual(selectIds('/creadores/podcasts/'), ['podcast']);
  assert.deepEqual(selectIds('/comunidades/user-groups/'), ['user-group']);
  assert.deepEqual(selectIds('/comunidades/estudiantes/'), ['student-group']);
});

test('generative-AI collection matches explicit GenAI and AWS agent terms, not generic AI', () => {
  const records = [
    { id: 'bedrock', kind: 'content', format: 'Video', topics: ['Inteligencia Artificial'], title: 'Crear una aplicación con Amazon Bedrock' },
    { id: 'spanish-genai', kind: 'content', format: 'Artículo', topics: ['Inteligencia Artificial'], title: 'Introducción a IA generativa en AWS' },
    { id: 'strands', kind: 'content', format: 'Curso', topics: ['Inteligencia Artificial'], title: 'Agentes con Strands Agents' },
    { id: 'agentcore', kind: 'content', format: 'Curso', topics: ['Inteligencia Artificial'], description: 'Desplegá agentes en Bedrock AgentCore.' },
    { id: 'bounded-genai', kind: 'content', format: 'Video', topics: [], title: 'GenAI en aplicaciones con AWS' },
    { id: 'generative-ia', kind: 'content', format: 'Video', topics: ['Inteligencia Artificial'], title: 'E-meetups JavaScript Chile: Crea tu propio asistente personal de Generative IA', description: 'Aprende a desarrollar un asistente de IA generativo en WhatsApp.' },
    { id: 'generic-ai', kind: 'content', format: 'Artículo', topics: ['Inteligencia Artificial'], title: 'Inteligencia artificial y aprendizaje automático en AWS' },
    { id: 'generic-ai-english', kind: 'content', format: 'Artículo', topics: [], title: 'Generic AI overview for AWS' },
    { id: 'reinvent-ai', kind: 'content', format: 'Video', topics: ['Inteligencia Artificial'], title: 'Novedades de IA en AWS re:Invent 2025' },
    { id: 'source', kind: 'source', format: 'Blog', topics: ['Inteligencia Artificial'], title: 'Amazon Bedrock' },
  ];

  assert.deepEqual(
    resourceCollectionResources(lookupResourceCollection('/aprender/ia-generativa/'), records).map(({ id }) => id),
    ['bedrock', 'spanish-genai', 'strands', 'agentcore', 'bounded-genai', 'generative-ia'],
  );
  assert.equal(isGenerativeAIResource(records[6]), false);
  assert.equal(isGenerativeAIResource(records[7]), false);
  assert.equal(isGenerativeAIResource(records[8]), false);
});

test('unknown collections and empty catalog inputs produce no records', () => {
  const collection = lookupResourceCollection('/aprender/cursos/');
  assert.deepEqual(resourceCollectionResources(undefined, [{ id: 'x' }]), []);
  assert.deepEqual(resourceCollectionResources(collection, []), []);
  assert.deepEqual(resourceCollectionResources(collection, undefined), []);
});

test('certification resources form a complete, unique purpose grouping from title and description', () => {
  const records = [
    { id: 'cloud-course', title: 'Curso AWS Cloud Practitioner', description: 'Preparación inicial.' },
    { id: 'cloud-series', title: 'Cómo preparar el examen CLF-C02', description: 'Serie de estudio.' },
    { id: 'schedule', title: 'Cómo hacer las certificaciones de AWS en español', description: 'Cómo agendar el examen.' },
    { id: 'strategy', title: 'Aprueba tu examen de AWS', description: 'Estrategias según cada certificación.' },
    { id: 'experience', title: 'Mi experiencia Developer Associate', description: 'Consejos sobre certificarme.' },
    { id: 'architect', title: 'Qué es ser Arquitecto de soluciones y por qué certificarse como AWS Solutions Architect', description: 'Alinear la tecnología con la estrategia de la organización.' },
    { id: 'journey', title: 'Mi Cloud Journey', description: '¿Vale la pena obtener una certificación?' },
    { id: 'study-group', title: 'Grupo de estudio AWS Girls Perú', description: 'Preparar certificaciones en comunidad.' },
    { id: 'fallback-id-is-ignored', title: 'Certificación AWS', description: 'Panorama general sin más detalle.' },
  ];
  const groups = groupCertificationResources(records);
  const groupedIds = groups.flatMap(({ resources: groupResources }) => groupResources.map(({ id }) => id));

  assert.deepEqual(groupedIds.toSorted(), records.map(({ id }) => id).toSorted());
  assert.equal(new Set(groupedIds).size, records.length, 'every resource appears exactly once');
  assert.deepEqual(groups.map(({ id }) => id), [
    'cloud-practitioner', 'exam-preparation', 'experiences', 'study-community', 'other-certification-resources',
  ]);
  assert.deepEqual(groups[0].resources.map(({ id }) => id), ['cloud-course', 'cloud-series']);
  assert.deepEqual(groups[1].resources.map(({ id }) => id), ['schedule', 'strategy']);
  assert.deepEqual(groups[2].resources.map(({ id }) => id), ['experience', 'architect', 'journey']);
  assert.deepEqual(groups[3].resources.map(({ id }) => id), ['study-group']);
  assert.deepEqual(groups[4].resources.map(({ id }) => id), ['fallback-id-is-ignored']);
});

test('selected collection pages expose only their useful FAQ and early route guidance', () => {
  const byPath = new Map(RESOURCE_COLLECTIONS.map((collection) => [collection.path, collection]));
  for (const path of ['/aprender/cursos/', '/aprender/certificaciones/', '/comunidades/user-groups/', '/comunidades/estudiantes/']) {
    assert.ok(byPath.get(path)?.faq?.items.length, `${path} has its planned FAQ content`);
  }
  for (const [path, expectedRoute] of [
    ['/aprender/serverless/', '/recorridos/serverless/'],
    ['/aprender/seguridad/', '/recorridos/seguridad/'],
    ['/aprender/ia-generativa/', '/recorridos/ia-generativa/'],
  ]) {
    const collection = byPath.get(path);
    assert.equal(collection?.earlyRoute?.path, expectedRoute);
    assert.equal(collection?.guide.links.includes(expectedRoute), false, 'the route is linked once before the filters');
  }
});
