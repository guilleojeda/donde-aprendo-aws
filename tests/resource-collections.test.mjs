import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESOURCE_COLLECTIONS,
  detectCertificationExams,
  findFreeCourseExample,
  groupCertificationResources,
  isGenerativeAIResource,
  learningCollectionNavigation,
  lookupResourceCollection,
  resourceCollectionResources,
  resolveResourceCollectionFaq,
} from '../src/lib/resource-collections.mjs';

test('registry exposes each approved collection route once', () => {
  const expectedPaths = [
    '/aprender/cursos/', '/aprender/videos/', '/aprender/articulos/',
    '/aprender/certificaciones/', '/aprender/serverless/', '/aprender/seguridad/',
    '/aprender/ia-generativa/', '/aprender/fundamentos/', '/aprender/arquitectura/',
    '/aprender/datos/', '/aprender/devops/', '/creadores/youtube/', '/creadores/blogs/',
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

test('four topic collections have distinct guidance and select only their published topic', () => {
  const topicCases = [
    ['/aprender/fundamentos/', 'Fundamentos'],
    ['/aprender/arquitectura/', 'Arquitectura'],
    ['/aprender/datos/', 'Datos'],
    ['/aprender/devops/', 'DevOps'],
  ];
  const records = [
    ...topicCases.map(([, topic], index) => ({ id: `topic-${index}`, kind: 'content', format: 'Artículo', topics: [topic] })),
    { id: 'other-topic', kind: 'content', format: 'Curso', topics: ['Seguridad'] },
    { id: 'source-topic', kind: 'source', format: 'Blog', topics: ['Fundamentos'] },
  ];
  const copyFields = ['title', 'description', 'intro'];

  for (const [index, [path, topic]] of topicCases.entries()) {
    const collection = lookupResourceCollection(path);
    assert.equal(collection.selector.topic, topic);
    assert.deepEqual(resourceCollectionResources(collection, records).map(({ id }) => id), [`topic-${index}`]);
    for (const field of copyFields) {
      assert.ok(collection[field].trim(), `${path} has ${field} copy`);
    }
  }

  assert.equal(lookupResourceCollection('/aprender/fundamentos/').earlyRoute.path, '/recorridos/primeros-pasos/');
  assert.equal(lookupResourceCollection('/aprender/fundamentos/').guide.links.includes('/recorridos/primeros-pasos/'), false,
    'The fundamentals route is linked before filters and is not repeated after results.');
  for (const field of copyFields) {
    const values = topicCases.map(([path]) => lookupResourceCollection(path)[field]);
    assert.equal(new Set(values).size, values.length, `${field} is distinct for each new collection`);
  }
});

test('compact learning navigation covers formats and topic collections with the current selection', () => {
  const navigation = learningCollectionNavigation('/aprender/fundamentos/');
  assert.deepEqual(navigation.formats, [
    { path: '/aprender/', label: 'Todos los recursos' },
    { path: '/aprender/cursos/', label: 'Cursos' },
    { path: '/aprender/videos/', label: 'Videos' },
    { path: '/aprender/articulos/', label: 'Artículos' },
  ]);
  assert.deepEqual(navigation.topics.map(({ path }) => path), [
    '/aprender/certificaciones/', '/aprender/serverless/', '/aprender/seguridad/', '/aprender/ia-generativa/',
    '/aprender/fundamentos/', '/aprender/arquitectura/', '/aprender/datos/', '/aprender/devops/',
  ]);
  assert.equal(navigation.activeTopic, 'Fundamentos');
  assert.equal(navigation.currentPath, '/aprender/fundamentos/');
  assert.equal(learningCollectionNavigation('/aprender/').activeTopic, undefined);
  assert.deepEqual(navigation.topics.filter((topic) => topic.path.startsWith('/creadores/') || topic.path.startsWith('/comunidades/')), []);
});

test('certification groups use explicit title-first exam names and include mixed records in each exam filter', () => {
  const records = [
    { id: 'cloud', title: 'Curso AWS Cloud Practitioner', description: 'AI Practitioner también aparece aquí, pero el título manda.' },
    { id: 'ai', title: 'Cómo preparar AIF-C01', description: 'AWS Cloud Practitioner' },
    { id: 'solutions', title: 'AWS Certified Solutions Architect Professional' },
    { id: 'solution-alias', title: 'Solution Architect Certified: AWS IAM' },
    { id: 'developer', title: 'Certificación AWS', description: 'AWS Certified Developer – Associate (DVA-C02).' },
    { id: 'sysops', title: 'AWS SysOps Certified Challenge' },
    { id: 'business', title: 'AWS Certified AI Business Strategist' },
    { id: 'networking', title: 'Advanced Networking Specialty (ANS-C01)' },
    { id: 'mixed', title: 'Cloud Practitioner y AI Practitioner: dos exámenes AWS' },
    { id: 'preparation', title: 'Cómo preparar el examen de AWS' },
    { id: 'experience', title: 'Mi experiencia: ¿vale la pena certificarme?' },
    { id: 'study-group', title: 'Grupo de estudio AWS Girls Perú', description: 'Preparar certificaciones en comunidad.' },
    { id: 'other', title: 'Certificación AWS', description: 'Panorama general sin más detalle.' },
    { id: 'false-service', title: 'Diseño de soluciones con AWS Architect', description: 'El modelo practitioner de SageMaker.' },
    { id: 'false-network', title: 'Arquitectura de red avanzada en AWS', description: 'Certificación de redes.' },
    { id: 'false-prefix', title: 'Hardcloud Practitioner: una tecnología de AWS' },
    { id: 'false-suffix', title: 'Cloud Practitionerish: análisis de texto' },
  ];
  const groups = groupCertificationResources(records);
  const groupedIds = groups.flatMap(({ resources: groupResources }) => groupResources.map(({ id }) => id));

  assert.deepEqual(groupedIds.toSorted(), records.map(({ id }) => id).toSorted());
  assert.equal(new Set(groupedIds).size, records.length, 'every resource appears exactly once');
  assert.deepEqual(groups.map(({ id }) => id), [
    'cloud-practitioner', 'ai-practitioner', 'solutions-architect', 'developer-associate', 'sysops',
    'ai-business-strategist', 'advanced-networking', 'multiple-exams', 'exam-preparation', 'experiences',
    'study-community', 'other-certification-resources',
  ]);
  assert.deepEqual(groups[0].resources.map(({ id }) => id), ['cloud']);
  assert.deepEqual(groups[1].resources.map(({ id }) => id), ['ai']);
  assert.deepEqual(groups[2].resources.map(({ id }) => id), ['solutions', 'solution-alias']);
  assert.deepEqual(groups[3].resources.map(({ id }) => id), ['developer']);
  assert.deepEqual(groups[7].resources.map(({ id }) => id), ['mixed']);
  assert.deepEqual(groups[0].filterResources.map(({ id }) => id), ['cloud', 'mixed']);
  assert.deepEqual(groups[1].filterResources.map(({ id }) => id), ['ai', 'mixed']);
  assert.deepEqual(groups[2].filterResources.map(({ id }) => id), ['solutions', 'solution-alias']);
  assert.deepEqual(groups[8].resources.map(({ id }) => id), ['preparation']);
  assert.deepEqual(groups[9].resources.map(({ id }) => id), ['experience']);
  assert.deepEqual(groups[10].resources.map(({ id }) => id), ['study-group']);
  assert.deepEqual(groups[11].resources.map(({ id }) => id), ['other', 'false-service', 'false-network', 'false-prefix', 'false-suffix']);
  assert.deepEqual(detectCertificationExams(records.find(({ id }) => id === 'cloud')), ['cloud-practitioner']);
  assert.deepEqual(detectCertificationExams(records.find(({ id }) => id === 'developer')), ['developer-associate']);
  assert.deepEqual(detectCertificationExams(records.find(({ id }) => id === 'false-service')), []);
  assert.deepEqual(detectCertificationExams(records.find(({ id }) => id === 'false-network')), []);
  assert.deepEqual(detectCertificationExams(records.find(({ id }) => id === 'false-prefix')), []);
  assert.deepEqual(detectCertificationExams(records.find(({ id }) => id === 'false-suffix')), []);
  for (const [title, expectedGroup] of [
    ['CLF-C02', 'cloud-practitioner'],
    ['AIF-C01', 'ai-practitioner'],
    ['Ruta SAA-C03', 'solutions-architect'],
    ['DVA-C02', 'developer-associate'],
    ['SOA-C02', 'sysops'],
    ['AIB-C01', 'ai-business-strategist'],
    ['ANS-C01', 'advanced-networking'],
  ]) {
    assert.deepEqual(detectCertificationExams({ title }), [expectedGroup]);
  }
});

test('free-course example comes only from the current matching published course record', () => {
  const unrelated = { id: 'unrelated', kind: 'content', format: 'Curso', title: 'Curso gratis', url: 'https://example.com/course' };
  const example = {
    id: 'mixtli-challenge', kind: 'content', format: 'Curso',
    title: 'Reto de estudio — AWS User Group Mixtli',
    url: 'https://awsugmixtli.com/certification-challenge',
  };
  assert.equal(findFreeCourseExample([unrelated, example]), example);
  assert.equal(findFreeCourseExample([{ ...example, url: 'https://awsugmixtli.com/certification-challenge/?utm_source=course' }]).id, 'mixtli-challenge');
  assert.equal(findFreeCourseExample([unrelated]), undefined);
  assert.equal(findFreeCourseExample(undefined), undefined);
  assert.equal(findFreeCourseExample([{ ...example, url: 'https://awsugmixtli.com/another-course' }]), undefined);
  assert.equal(findFreeCourseExample([{ ...example, url: 'https://not-mixtli.example/certification-challenge' }]), undefined);
});

test('resolved course FAQ uses a published free-study example only when its primary source record exists', () => {
  const collection = lookupResourceCollection('/aprender/cursos/');
  const example = {
    id: 'mixtli-challenge', kind: 'content', format: 'Curso',
    title: 'AWS Certification Challenge 2026 — AWS User Group Mixtli',
    url: 'https://awsugmixtli.com/certification-challenge',
  };
  const unrelated = { id: 'other-course', kind: 'content', format: 'Curso', title: 'Todo sobre AWS Lambda', url: 'https://example.com/course' };
  const fallbackFaq = resolveResourceCollectionFaq(collection, [unrelated]);
  const resolvedFaq = resolveResourceCollectionFaq(collection, [example]);

  assert.equal(fallbackFaq[0].question, '¿Cómo compruebo si un curso de AWS es gratis?');
  assert.match(fallbackFaq[0].answer, /página del proveedor antes de inscribirte/u);
  assert.deepEqual(fallbackFaq[0].links ?? [], []);
  assert.equal(resolvedFaq[0].question, '¿Hay cursos de AWS gratis?');
  assert.match(resolvedFaq[0].answer, /materiales de estudio gratuitos/u);
  assert.match(resolvedFaq[0].answer, /AWS Certification Challenge 2026/u);
  assert.deepEqual(resolvedFaq[0].links, [{
    label: `Ver la ficha de ${example.title}`,
    href: '/aprender/#resource-mixtli-challenge',
  }]);
  assert.deepEqual(resolvedFaq.slice(1), fallbackFaq.slice(1));
});

test('a mixed-only exam group remains available as a filter without a visible result group', () => {
  const groups = groupCertificationResources([{
    id: 'mixed-sysops-business',
    title: 'SysOps Administrator y AI Business Strategist',
  }]);
  const sysops = groups.find(({ id }) => id === 'sysops');
  const multiExam = groups.find(({ id }) => id === 'multiple-exams');

  assert.deepEqual(sysops.resources, []);
  assert.deepEqual(sysops.filterResources.map(({ id }) => id), ['mixed-sysops-business']);
  assert.deepEqual(multiExam.resources.map(({ id }) => id), ['mixed-sysops-business']);
  assert.deepEqual(multiExam.filterResources.map(({ id }) => id), ['mixed-sysops-business']);
});

test('selected collection pages expose only their useful FAQ and early route guidance', () => {
  const byPath = new Map(RESOURCE_COLLECTIONS.map((collection) => [collection.path, collection]));
  for (const path of ['/aprender/cursos/', '/aprender/certificaciones/', '/comunidades/user-groups/', '/comunidades/estudiantes/']) {
    assert.ok(byPath.get(path)?.faq?.items.length, `${path} has its planned FAQ content`);
  }
  const courseQuestions = byPath.get('/aprender/cursos/').faq.items.map(({ question }) => question);
  assert.ok(courseQuestions.includes('¿Cómo encuentro cursos de AWS para mi nivel?'));
  assert.equal(courseQuestions.some((question) => /cuánto dura/i.test(question)), false);
  const levelFaq = byPath.get('/aprender/cursos/').faq.items.find(({ question }) => question === '¿Cómo encuentro cursos de AWS para mi nivel?');
  assert.equal(levelFaq.answer, 'Abre Filtros adicionales y elige el nivel que buscas. Si estás empezando, puedes elegir Inicial. Cuando una ficha no indique nivel, consulta su descripción y el programa del proveedor antes de decidir.');
  assert.doesNotMatch(levelFaq.answer, /cuenta|duraci[oó]n|cargos|precio/iu);
  assert.equal(byPath.get('/aprender/certificaciones/').intro,
    'Encuentra materiales de preparación, sesiones de estudio y experiencias sobre distintas certificaciones AWS. Elige un examen o explora los recursos generales.');
  assert.ok(groupCertificationResources([{ id: 'x', title: 'Solutions Architect' }])
    .find(({ id }) => id === 'solutions-architect').description.includes('conocer el examen al que corresponde'));
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
