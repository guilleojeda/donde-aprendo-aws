/** Editorial collection pages over the published catalog. Content stays in the catalog. */
import { resourceHref } from './catalog-routes.mjs';

export const RESOURCE_COLLECTIONS = Object.freeze([
  {
    id: 'cursos', path: '/aprender/cursos/', kind: 'content', label: 'Cursos',
    title: 'Cursos de AWS en español',
    description: 'Encontrá cursos, bootcamps y series para aprender AWS en español. Compará el nivel, la práctica y el objetivo antes de elegir.',
    intro: 'Encontrá cursos, bootcamps y series de clases de AWS en español. Elegí por tema y nivel para seguir aprendiendo a tu ritmo.',
    selector: { format: 'Curso' },
    guide: {
      heading: 'Cómo elegir un curso de AWS',
      body: 'Empezá por tu objetivo: conocer los fundamentos, prepararte para una certificación o construir una aplicación. Compará el temario y el nivel con ese objetivo antes de inscribirte.',
      points: [
        'Buscá ejercicios o proyectos si querés practicar, y revisá qué cuenta o servicios necesitás para seguirlos.',
        'Comprobá la fecha de actualización, el idioma y si hay costos de inscripción o de uso de AWS.',
        'Un curso puede ayudar a estudiar para un examen, pero no concede una certificación AWS.',
      ],
      links: ['/aprender/videos/', '/aprender/certificaciones/', '/recorridos/'],
    },
    faq: {
      id: 'cursos-faq',
      heading: 'Dudas sobre los cursos de AWS',
      items: [
        {
          id: 'free-course-access',
          question: '¿Hay cursos de AWS gratis?',
          answer: 'El precio y las condiciones de acceso dependen de cada proveedor. Confirmá la información en la página del curso antes de inscribirte; las prácticas que usan servicios de AWS también pueden generar cargos.',
        },
        {
          question: '¿Un curso de AWS me da una certificación?',
          answer: 'No por sí solo. Un curso puede ayudarte a estudiar, pero una certificación AWS se obtiene aprobando el examen correspondiente. Revisá los requisitos oficiales vigentes para ese examen.',
          links: [{ label: 'Explorar recursos para certificaciones', href: '/aprender/certificaciones/' }, { label: 'Ver AWS Certification', href: 'https://aws.amazon.com/certification/' }],
        },
        {
          question: '¿Cómo encuentro cursos de AWS para mi nivel?',
          answer: 'Abrí Filtros adicionales y elegí el nivel que buscás. Si estás empezando, podés elegir Inicial. Cuando una ficha no indique nivel, consultá su descripción y el programa del proveedor antes de decidir.',
        },
      ],
    },
  },
  {
    id: 'videos', path: '/aprender/videos/', kind: 'content', label: 'Videos',
    title: 'Videos y tutoriales de AWS en español',
    description: 'Encontrá videos y tutoriales para aprender AWS en español, desde explicaciones puntuales hasta clases grabadas.',
    intro: 'Encontrá videos, charlas grabadas y tutoriales de AWS en español. Elegí una explicación o una demostración sobre el tema que querés aprender.',
    selector: { format: 'Video' },
    guide: {
      heading: 'Cómo aprovechar los videos de AWS',
      body: 'Para una duda puntual, elegí una explicación breve. Para practicar, buscá una demostración que muestre el problema, los pasos y el resultado.',
      points: [
        'Buscá por servicio o tema y elegí el nivel que mejor coincida con tu experiencia.',
        'Si querés una serie de clases para estudiar en orden, explorá la colección de cursos.',
        'Para encontrar quién publica nuevos videos, explorá los canales de YouTube del directorio.',
      ],
      links: ['/creadores/youtube/', '/aprender/cursos/', '/aprender/'],
    },
  },
  {
    id: 'articulos', path: '/aprender/articulos/', kind: 'content', label: 'Artículos',
    title: 'Artículos sobre AWS en español',
    description: 'Leé guías, tutoriales y artículos en español sobre servicios y prácticas de AWS.',
    intro: 'Consultá guías y tutoriales escritos sobre AWS. Los artículos permiten volver a un paso, comparar alternativas y profundizar en un tema a tu ritmo.',
    selector: { format: 'Artículo' },
    guide: {
      heading: 'Cómo elegir una guía escrita',
      body: 'Buscá artículos que expliquen el contexto además de los pasos. Eso ayuda a adaptar una solución a tu cuenta, región y versión del servicio.',
      points: [
        'Revisá cuándo se publicó o actualizó y si los ejemplos corresponden al servicio que estás usando.',
        'Para resolver una tarea concreta, elegí un tutorial; para entender una decisión, buscá una guía que compare alternativas.',
        'Para conocer publicaciones recurrentes, visitá los blogs de AWS en español.',
      ],
      links: ['/creadores/blogs/', '/blog/', '/aprender/'],
    },
  },
  {
    id: 'certificaciones', path: '/aprender/certificaciones/', kind: 'content', label: 'Certificaciones',
    title: 'Certificaciones AWS: recursos para estudiar en español',
    description: 'Recursos de preparación, sesiones de estudio, experiencias y orientación en español sobre distintas certificaciones AWS.',
    intro: 'Encontrá materiales de preparación, sesiones de estudio y experiencias sobre distintas certificaciones AWS. Elegí un examen o explorá los recursos generales.',
    selector: { topic: 'Certificaciones' },
    guide: {
      heading: 'Elegí cómo estudiar para el examen',
      body: 'Partí del rol que te interesa y de la experiencia que ya tenés. La guía oficial de cada examen permite comparar sus objetivos y los servicios que evalúa.',
      points: [
        'Revisá el propósito y el nivel del examen antes de elegir material.',
        'Usá cursos para ordenar el estudio y relatos de experiencia para conocer cómo prepararon otras personas.',
        'Confirmá que el contenido y los pasos para agendar sigan vigentes en la página oficial.',
      ],
      links: ['/aprender/cursos/', '/aprender/videos/', '/aprender/'],
    },
    faq: {
      id: 'certificaciones-faq',
      heading: 'Dudas sobre las certificaciones AWS',
      items: [
        {
          question: '¿Esta colección prepara para todas las certificaciones AWS?',
          answer: 'No. Reúne los recursos publicados sobre distintas certificaciones y temas generales de preparación. Consultá la guía oficial del examen que te interesa para confirmar su temario y versión.',
          links: [{ label: 'Ver las guías oficiales de examen', href: 'https://docs.aws.amazon.com/aws-certification/latest/examguides/' }],
        },
        {
          question: '¿Dónde confirmo el idioma y cómo agendo el examen?',
          answer: 'La disponibilidad de idiomas, horarios y modalidades depende de cada examen y lugar. Consultá las opciones oficiales vigentes antes de reservar.',
          links: [{ label: 'Consultar opciones y agendar un examen', href: 'https://aws.amazon.com/certification/certification-prep/testing/' }],
        },
      ],
    },
  },
  {
    id: 'serverless', path: '/aprender/serverless/', kind: 'content', label: 'Serverless',
    title: 'Recursos y tutoriales de serverless en AWS',
    description: 'Explorá tutoriales y recursos en español sobre AWS Lambda, API Gateway, Step Functions y aplicaciones serverless.',
    intro: 'Explorá recursos para aprender arquitectura serverless en AWS, desde funciones hasta APIs y flujos de trabajo. Elegí una práctica según lo que quieras conectar o automatizar.',
    selector: { topic: 'Serverless' },
    guide: {
      heading: 'Cómo recorrer los recursos serverless',
      body: 'Elegí Lambda para entender la ejecución de funciones, API Gateway para exponer una API y Step Functions para coordinar tareas. Después explorá cómo combinar esos componentes en una aplicación.',
      points: [
        'Los ejemplos de despliegue ayudan a conectar el código con la infraestructura de una aplicación.',
        'Filtrá por formato para elegir entre una lectura, un video o una serie de clases.',
        'Buscá ejemplos que conecten los componentes que querés integrar.',
      ],
      links: ['/aprender/cursos/', '/aprender/'],
    },
    earlyRoute: { path: '/recorridos/serverless/', label: 'Seguí la ruta serverless', text: '¿Preferís aprender paso a paso?' },
  },
  {
    id: 'seguridad', path: '/aprender/seguridad/', kind: 'content', label: 'Seguridad',
    title: 'Recursos para aprender seguridad en AWS',
    description: 'Encontrá recursos en español para estudiar identidad, permisos y prácticas de seguridad en AWS.',
    intro: 'Reunimos recursos sobre seguridad en AWS para estudiar identidad, permisos y protección de cargas de trabajo. Podés empezar por los controles de cuenta y avanzar hacia servicios y patrones.',
    selector: { topic: 'Seguridad' },
    guide: {
      heading: 'Un orden práctico para estudiar seguridad',
      body: 'Entendé quién puede hacer qué antes de agregar controles más específicos. IAM, la protección de la cuenta y la detección de amenazas forman una base útil para seguir.',
      points: [
        'Para estudiar acceso y permisos, empezá por los recursos de AWS IAM.',
        'Después explorá protección de aplicaciones y detección de amenazas según lo que necesites aprender.',
        'Combiná explicaciones con prácticas que se adapten a lo que necesitás proteger.',
      ],
      links: ['/aprender/cursos/', '/aprender/'],
    },
    earlyRoute: { path: '/recorridos/seguridad/', label: 'Seguí la ruta de seguridad', text: '¿Preferís aprender paso a paso?' },
  },
  {
    id: 'ia-generativa', path: '/aprender/ia-generativa/', kind: 'content', label: 'IA generativa',
    title: 'IA generativa en AWS: cursos, videos y recursos',
    description: 'Explorá cursos, ejemplos y tutoriales en español sobre Amazon Bedrock, Strands Agents y Bedrock AgentCore.',
    intro: 'Explorá cursos, ejemplos y tutoriales de IA generativa en AWS, con foco en Amazon Bedrock y agentes con Strands Agents o Bedrock AgentCore.',
    selector: { generativeAI: true },
    guide: {
      heading: 'Elegí recursos según lo que querés construir',
      body: 'Podés comenzar con una aplicación que llama a un modelo en Amazon Bedrock y después comparar cómo se organizan los agentes y sus herramientas.',
      points: [
        'Los ejemplos con Amazon Bedrock muestran cómo integrar modelos en una aplicación.',
        'Para construir agentes, explorá el curso y los patrones que usan Strands Agents y Bedrock AgentCore.',
        'Elegí una explicación de acuerdo con el servicio o patrón que quieras probar.',
      ],
      links: ['/aprender/cursos/', '/aprender/'],
    },
    earlyRoute: { path: '/recorridos/ia-generativa/', label: 'Seguí la ruta de IA generativa', text: '¿Preferís aprender paso a paso?' },
  },
  {
    id: 'youtube', path: '/creadores/youtube/', kind: 'source', label: 'Canales de YouTube',
    title: 'Canales de YouTube para aprender AWS en español',
    description: 'Compará canales de YouTube en español sobre AWS por temas, público y tipo de contenido.',
    intro: 'Descubrí canales de YouTube que publican contenido sobre AWS en español. Mirá sus temas y elegí si preferís clases, demostraciones o explicaciones breves.',
    selector: { format: 'Canal de YouTube' },
    guide: {
      heading: 'Cómo elegir un canal de AWS',
      body: 'Un canal puede cubrir muchos temas o concentrarse en un servicio. Revisá sus videos recientes y elegí una serie que coincida con tu nivel y objetivo.',
      points: [
        'Usá los videos individuales del directorio para ir directo a una explicación concreta.',
        'Buscá playlists si preferís una serie de clases, o charlas y demostraciones para conocer un tema puntual.',
        'Para otros formatos de publicación, explorá blogs, podcasts y newsletters.',
      ],
      links: ['/aprender/videos/', '/creadores/blogs/', '/creadores/'],
    },
  },
  {
    id: 'blogs', path: '/creadores/blogs/', kind: 'source', label: 'Blogs',
    title: 'Blogs de AWS en español',
    description: 'Encontrá blogs y publicaciones para seguir tutoriales, guías y novedades de AWS en español.',
    intro: 'Encontrá blogs que publican guías, tutoriales y experiencias de AWS en español. Revisá el enfoque de cada autor para elegir lecturas útiles para tu trabajo o estudio.',
    selector: { format: 'Blog' },
    guide: {
      heading: 'Cómo seguir un blog técnico',
      body: 'Elegí un autor por los temas que desarrolla y su forma de explicarlos. Los blogs permiten seguir una publicación y volver a sus guías cuando necesitás resolver una tarea.',
      points: [
        'Los artículos del catálogo te llevan a lecturas individuales; esta página reúne las fuentes para seguir.',
        'Explorá publicaciones recientes para conocer los temas y el nivel de detalle que ofrece cada blog.',
        'Para escuchar conversaciones, explorá los podcasts; para recibir lecturas por correo, visitá las newsletters.',
      ],
      links: ['/aprender/articulos/', '/creadores/podcasts/', '/creadores/newsletters/'],
    },
  },
  {
    id: 'podcasts', path: '/creadores/podcasts/', kind: 'source', label: 'Podcasts',
    title: 'Podcasts sobre AWS en español',
    description: 'Explorá podcasts en español sobre AWS, sus temas y enlaces para escuchar cada programa.',
    intro: 'Explorá podcasts en español que conversan sobre AWS, la nube y el trabajo con sus servicios. Elegí un programa por sus temas y el formato de sus episodios.',
    selector: { format: 'Podcast' },
    guide: {
      heading: 'Encontrá un podcast que te sirva',
      body: 'Escuchá conversaciones sobre experiencias, servicios y novedades de la nube. Las entrevistas y los episodios temáticos ofrecen formas distintas de acercarte a AWS.',
      points: [
        'Revisá la descripción del programa y los episodios recientes para conocer su enfoque.',
        'Buscá notas del episodio si menciona herramientas, enlaces o demostraciones.',
        'Para seguir publicaciones por escrito, visitá blogs y newsletters.',
      ],
      links: ['/creadores/blogs/', '/creadores/newsletters/', '/creadores/'],
    },
  },
  {
    id: 'newsletters', path: '/creadores/newsletters/', kind: 'source', label: 'Newsletters',
    title: 'Newsletters de AWS en español',
    description: 'Encontrá newsletters y boletines en español para recibir noticias y publicaciones sobre AWS por email.',
    intro: 'Encontrá newsletters y boletines en español sobre AWS para recibir novedades y lecturas en tu correo. Revisá la frecuencia y el enfoque antes de suscribirte.',
    selector: { format: 'Newsletter' },
    guide: {
      heading: 'Elegí qué novedades recibir',
      body: 'Una newsletter puede resumir noticias, seleccionar artículos o anunciar actividades. Su descripción y las ediciones anteriores ayudan a saber qué vas a recibir.',
      points: [
        'Explorá las ediciones anteriores para conocer la frecuencia y los temas de la publicación.',
        'Para estudiar un servicio con más detalle, complementá las novedades con cursos y tutoriales.',
        'También podés seguir autores y programas en blogs o podcasts.',
      ],
      links: ['/creadores/blogs/', '/creadores/podcasts/', '/aprender/'],
    },
  },
  {
    id: 'user-groups', path: '/comunidades/user-groups/', kind: 'community', label: 'AWS User Groups',
    title: 'AWS User Groups en Latinoamérica',
    description: 'Encontrá AWS User Groups en Latinoamérica, conocé cómo participar y buscá grupos por país.',
    intro: 'Los AWS User Groups reúnen a personas interesadas en AWS para compartir aprendizaje y experiencias. Explorá los grupos publicados y sus enlaces para conocer cómo participar.',
    selector: { format: 'User Group' },
    guide: {
      heading: 'Qué esperar de un AWS User Group',
      body: 'Cada grupo define sus actividades y canales. Algunos organizan charlas o encuentros y otros comparten novedades en línea; consultá sus enlaces para ver qué propone el grupo.',
      points: [
        'Buscá un grupo por país y abrí sus canales para conocer sus encuentros y cómo participar.',
        'Las condiciones para asistir, participar o proponer una charla dependen de cada comunidad.',
        'Si estudiás, también podés buscar Student Builder Groups.',
      ],
      links: ['/comunidades/estudiantes/', '/comunidades/'],
    },
    faq: {
      id: 'user-groups-faq',
      heading: 'Dudas sobre los AWS User Groups',
      items: [
        {
          question: '¿La agenda muestra todos los eventos de los grupos?',
          answer: 'No necesariamente. La agenda muestra los eventos de los grupos publicados en ¿Dónde Aprendo AWS?; revisá también sus enlaces para conocer otras actividades y confirmar fechas o inscripción.',
          links: [{ label: 'Ver la agenda de eventos AWS', href: '/eventos/' }],
        },
      ],
    },
  },
  {
    id: 'estudiantes', path: '/comunidades/estudiantes/', kind: 'community', label: 'Grupos para estudiantes',
    title: 'Comunidades AWS para estudiantes',
    description: 'Encontrá AWS Student Builder Groups, el programa que continúa AWS Cloud Clubs. Comunidades para estudiantes en Latinoamérica y cómo participar.',
    intro: 'Encontrá AWS Student Builder Groups para aprender y construir con otros estudiantes. Elegí tu país y consultá cómo sumarte a cada comunidad.',
    selector: { format: 'Student Builder Group' },
    guide: {
      heading: 'Cómo encontrar una comunidad estudiantil',
      body: 'Elegí tu país y buscá grupos de universidades o comunidades estudiantiles. En sus canales podés conocer las actividades y cómo participar.',
      points: [
        'La organización y la frecuencia de reuniones varían entre grupos.',
        'Usá los enlaces publicados para verificar si aceptan integrantes y qué actividades tienen previstas.',
        'Los AWS User Groups también pueden ser una alternativa para conectar con la comunidad local.',
      ],
      links: ['/comunidades/user-groups/', '/comunidades/'],
    },
    faq: {
      id: 'student-builder-groups-faq',
      heading: 'Dudas sobre los Student Builder Groups',
      items: [
        {
          question: '¿Qué relación tienen Student Builder Groups y AWS Cloud Clubs?',
          answer: 'AWS Student Builder Groups es el programa antes conocido como AWS Cloud Clubs. Consultá la página oficial para conocer sus requisitos y cómo participar.',
          links: [{ label: 'Conocer el programa oficial', href: 'https://builder.aws.com/community/student-builder-groups' }],
        },
        {
          question: '¿Puedo crear un grupo si todavía no hay uno en mi universidad?',
          answer: 'AWS invita a iniciar un grupo cuando todavía no existe uno en el campus. Consultá la página oficial para revisar los requisitos y los pasos vigentes para postularte.',
          links: [{ label: 'Consultar cómo iniciar un grupo', href: 'https://builder.aws.com/community/student-builder-groups' }],
        },
      ],
    },
  },
]);

const CERTIFICATION_PURPOSES = Object.freeze([
  { id: 'cloud-practitioner', label: 'Cloud Practitioner', description: 'Materiales de estudio y experiencias sobre Cloud Practitioner.' },
  { id: 'ai-practitioner', label: 'AI Practitioner', description: 'Materiales de estudio y experiencias sobre AI Practitioner.' },
  { id: 'solutions-architect', label: 'Solutions Architect', description: 'Recursos sobre Solutions Architect. Revisá cada ficha para conocer el examen al que corresponde.' },
  { id: 'developer-associate', label: 'Developer Associate', description: 'Recursos sobre Developer Associate.' },
  { id: 'sysops', label: 'SysOps', description: 'Recursos sobre SysOps Administrator.' },
  { id: 'ai-business-strategist', label: 'AI Business Strategist', description: 'Recursos sobre AI Business Strategist.' },
  { id: 'advanced-networking', label: 'Advanced Networking', description: 'Recursos sobre Advanced Networking.' },
  { id: 'multiple-exams', label: 'Varios exámenes', description: 'Materiales que abarcan distintas certificaciones AWS.' },
  { id: 'exam-preparation', label: 'Preparación general', description: 'Estrategias generales para estudiar o encontrar y agendar un examen.' },
  { id: 'experiences', label: 'Experiencias y elección', description: 'Relatos personales y orientación para evaluar una certificación.' },
  { id: 'study-community', label: 'Estudio en comunidad', description: 'Recursos para preparar certificaciones junto a otras personas.' },
  { id: 'other-certification-resources', label: 'Otros recursos', description: 'Otros materiales relacionados; consultá su título y descripción para conocer el alcance.' },
]);

const CERTIFICATION_EXAMS = Object.freeze([
  { id: 'cloud-practitioner', patterns: [/\b(?:aws\s+certified\s+)?cloud\s+practitioner\b/u, /\bclf-?c0?2\b/u] },
  { id: 'ai-practitioner', patterns: [/\b(?:aws\s+certified\s+)?ai\s+practitioner\b/u, /\baif-?c0?1\b/u] },
  { id: 'solutions-architect', patterns: [/\b(?:aws\s+certified\s+)?solutions?\s+architect\b/u, /\b(?:saa-?c03|sap-?c02)\b/u] },
  { id: 'developer-associate', patterns: [/\b(?:aws\s+certified\s+)?developer\s*(?:[-–—]\s*)?associate\b/u, /\bdva-?c0?2\b/u] },
  { id: 'sysops', patterns: [/\b(?:aws\s+certified\s+)?sysops(?:\s+administrator)?\b/u, /\bsoa-?c0?2\b/u] },
  { id: 'ai-business-strategist', patterns: [/\b(?:aws\s+certified\s+)?ai\s+business\s+strategist\b/u, /\baib-?c0?1\b/u] },
  { id: 'advanced-networking', patterns: [/\b(?:aws\s+certified\s+)?advanced\s+networking\b/u, /\bans-?c0?1\b/u] },
]);

const collectionByPath = new Map(RESOURCE_COLLECTIONS.map((collection) => [collection.path, collection]));
export function lookupResourceCollection(path) {
  return collectionByPath.get(path);
}

/** Group certification resources from their existing public title and description only. */
export function groupCertificationResources(resources) {
  const groups = new Map(CERTIFICATION_PURPOSES.map((purpose) => [purpose.id, { ...purpose, resources: [], filterResources: [] }]));
  for (const resource of resources) {
    const exams = detectCertificationExams(resource);
    const groupIds = exams.length > 1 ? ['multiple-exams'] : exams.length === 1 ? exams : [certificationPurpose(resource)];
    for (const groupId of groupIds) groups.get(groupId).resources.push(resource);
    const filterGroupIds = [...new Set([...groupIds, ...exams])];
    for (const groupId of filterGroupIds) groups.get(groupId).filterResources.push(resource);
  }
  return [...groups.values()].filter(({ resources: groupResources, filterResources }) => groupResources.length > 0 || filterResources.length > 0);
}

/** Detect only explicit public exam names and codes; the title takes precedence over description. */
export function detectCertificationExams(resource) {
  const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('en');
  const title = normalize(resource?.title);
  const titleMatches = matchesCertificationExams(title);
  return titleMatches.length ? titleMatches : matchesCertificationExams(normalize(resource?.description));
}

/** Find the current catalog course whose provider page documents free study materials. */
export function findFreeCourseExample(resources) {
  if (!Array.isArray(resources)) return undefined;
  return resources.find((resource) => resource.kind === 'content'
    && resource.format === 'Curso'
    && isFreeStudyMaterialsPage(resource.url));
}

/** Resolve visible FAQ copy and links from the current published collection records. */
export function resolveResourceCollectionFaq(collection, resources = []) {
  if (!collection?.faq?.items) return [];
  const items = collection.faq.items;
  const freeCourseExample = collection.id === 'cursos'
    ? findFreeCourseExample(resourceCollectionResources(collection, resources))
    : undefined;
  return items.map((item) => {
    if (collection.id !== 'cursos' || item.id !== 'free-course-access') return item;
    if (!freeCourseExample) {
      return {
        ...item,
        question: '¿Cómo compruebo si un curso de AWS es gratis?',
        answer: 'La ficha del directorio no siempre indica el precio o las condiciones de acceso. Confirmá esos datos en la página del proveedor antes de inscribirte; las prácticas que usan servicios de AWS también pueden generar cargos.',
      };
    }
    return {
      ...item,
      answer: 'Sí. AWS User Group Mixtli comparte materiales de estudio gratuitos en su AWS Certification Challenge 2026. Podés consultarlos desde la ficha del reto. Revisá las condiciones de cada recurso; las prácticas que usan servicios de AWS pueden generar cargos.',
      links: [{ label: `Ver la ficha de ${freeCourseExample.title}`, href: resourceHref(freeCourseExample) }],
    };
  });
}

/** Return only records that belong to this collection's fixed editorial scope. */
export function resourceCollectionResources(collection, resources) {
  if (!collection || !Array.isArray(resources)) return [];
  const selector = collection.selector ?? {};
  return resources.filter((resource) => {
    if (!resource || resource.kind !== collection.kind) return false;
    if (selector.format && resource.format !== selector.format) return false;
    if (selector.topic && !resource.topics?.includes(selector.topic)) return false;
    if (selector.generativeAI && !isGenerativeAIResource(resource)) return false;
    return true;
  });
}

/**
 * Keep the generative-AI collection focused on named AWS generative-AI tools or
 * explicit generative-AI wording. A generic AI topic alone is too broad.
 */
export function isGenerativeAIResource(resource) {
  const searchable = [resource?.title, resource?.description, resource?.url]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('en');
  return /\b(?:ia generativa|ia generativo|generative ai|generative ia|generative artificial intelligence|gen\s*ai|amazon bedrock|bedrock|strands(?: agents)?|agentcore)\b/u.test(searchable);
}

function certificationPurpose(resource) {
  const text = [resource?.title, resource?.description]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('es');
  if (/\b(?:grupo de estudio|study group|estudio en comunidad)\b/u.test(text)) return 'study-community';
  if (/\b(?:experien\w*|journey|vale la pena|por que certific\w*)\b/u.test(text)) return 'experiences';
  if (/\b(?:examen(?:es)?|exam(?:s)?|simulacro|agend\w*|schedule\w*|prepar\w*)\b/u.test(text)
    || /\bestrateg\w*.{0,40}\b(?:certific|examen)\w*|\b(?:certific|examen)\w*.{0,40}\bestrateg\w*/u.test(text)) {
    return 'exam-preparation';
  }
  return 'other-certification-resources';
}

function matchesCertificationExams(text) {
  return CERTIFICATION_EXAMS.filter(({ patterns }) => patterns.some((pattern) => pattern.test(text)))
    .map(({ id }) => id);
}

function isFreeStudyMaterialsPage(value) {
  try {
    const url = new URL(value);
    return url.hostname === 'awsugmixtli.com' && url.pathname.replace(/\/+$/u, '') === '/certification-challenge';
  } catch {
    return false;
  }
}
