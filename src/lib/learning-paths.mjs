import { resourceHref } from './catalog-routes.mjs';

/** Editorial order and guidance live in Git; titles and destinations come from their owners. */
export const LEARNING_PATHS = Object.freeze([
  {
    id: 'primeros-pasos',
    title: 'Ruta para aprender AWS desde cero',
    seoTitle: 'Ruta para aprender AWS desde cero | ¿Dónde Aprendo AWS?',
    seoDescription: 'Una ruta para conocer qué ofrece AWS, revisar conceptos básicos, proteger tu cuenta y elegir materiales para seguir aprendiendo.',
    audience: 'Para empezar desde cero',
    intro: 'Empezá por qué ofrece AWS, recorré conceptos básicos, protegé tu cuenta y elegí cómo seguir aprendiendo.',
    steps: [
      { type: 'resource', id: 'catalog-f8a1bdedb229541186365e6bf325ed7f', note: 'Empezá con una explicación breve de qué ofrece AWS.' },
      { type: 'blog', id: 'aws-fundamentos-guia-de-inicio-rapido', note: 'Ordená los conceptos y servicios fundamentales.' },
      { type: 'resource', id: 'catalog-08facfe178c25c04cfb53fb1e179894a', note: 'Conocé usuarios, roles y permisos de IAM.' },
      { type: 'resource', id: 'catalog-0b83d84a42b3ec5866fe9945a2903dcd', note: 'Aplicá una práctica básica para proteger tu cuenta.' },
      { type: 'resource', id: 'catalog-72be9fccc43511c1da87b6b7733b195d', note: 'Continuá con un curso para principiantes.' },
      { type: 'blog', id: 'aprender-aws-gratis-recursos-y-comunidad', note: 'Encontrá otras formas de practicar y aprender con la comunidad.' },
    ],
  },
  {
    id: 'serverless',
    title: 'Ruta serverless en AWS: Lambda, API Gateway y Step Functions',
    seoTitle: 'Ruta serverless en AWS: Lambda, API Gateway y Step Functions | ¿Dónde Aprendo AWS?',
    seoDescription: 'Una secuencia para aprender serverless en AWS: conectá una función Lambda con API Gateway y conocé la coordinación con Step Functions.',
    audience: 'Para quienes ya conocen los fundamentos de AWS',
    intro: 'Con una base de AWS, conectá una función Lambda con API Gateway y avanzá a flujos coordinados con Step Functions.',
    steps: [
      { type: 'blog', id: 'que-es-aws-lambda-preguntas-y-respuestas', note: 'Repasá el modelo de ejecución de Lambda.' },
      { type: 'blog', id: 'aws-lambda-y-api-gateway-guia-basica', note: 'Conectá una función a una API.' },
      { type: 'resource', id: 'catalog-9858156c362d82f0c872a7276caef82e', note: 'Seguí una implementación de API con infraestructura como código.' },
      { type: 'blog', id: 'comprendiendo-aws-step-functions', note: 'Entendé cómo coordinar varios pasos.' },
      { type: 'resource', id: 'catalog-66ab950151f404507dc91738be5b3ec8', note: 'Aplicá Step Functions a llamadas HTTP con SAM.' },
    ],
  },
  {
    id: 'seguridad',
    title: 'Ruta de seguridad en AWS para principiantes',
    seoTitle: 'Ruta de seguridad en AWS para principiantes | ¿Dónde Aprendo AWS?',
    seoDescription: 'Empezá con el modelo de responsabilidad compartida y avanzá por IAM, protección de la cuenta, seguridad web y detección de amenazas.',
    audience: 'Para empezar con seguridad en la nube',
    intro: 'Empezá por el modelo de responsabilidad compartida y avanzá por identidad, protección de cuenta, aplicaciones y detección.',
    steps: [
      { type: 'blog', id: 'aws-seguridad-fundamentos-esenciales', note: 'Ubicá los controles principales de seguridad.' },
      { type: 'resource', id: 'catalog-08facfe178c25c04cfb53fb1e179894a', note: 'Aprendé la base de identidad y permisos.' },
      { type: 'resource', id: 'catalog-0b83d84a42b3ec5866fe9945a2903dcd', note: 'Evitá usar el usuario raíz para tareas diarias.' },
      { type: 'resource', id: 'catalog-fef15b4369959bd2e57d3cd80bd6a040', note: 'Pensá una estrategia de seguridad para tu entorno.' },
      { type: 'blog', id: 'aws-web-application-firewall-waf', note: 'Explorá la protección de aplicaciones web.' },
      { type: 'resource', id: 'catalog-236bc32e29d9c355d20dbb2a198d9117', note: 'Conocé una herramienta de detección de amenazas.' },
    ],
  },
  {
    id: 'ia-generativa',
    title: 'Ruta de IA generativa en AWS: Amazon Bedrock y agentes',
    seoTitle: 'Ruta de IA generativa en AWS: Amazon Bedrock y agentes | ¿Dónde Aprendo AWS?',
    seoDescription: 'Conocé el panorama de IA en AWS, revisá decisiones de aplicaciones y explorá ejemplos con Amazon Bedrock y agentes.',
    audience: 'Para desarrolladores con fundamentos',
    intro: 'Partí del panorama de IA en AWS, revisá decisiones de aplicación y seguí con ejemplos de Amazon Bedrock y agentes.',
    steps: [
      { type: 'blog', id: 'introduccion-a-la-inteligencia-artificial-en-aws', note: 'Empezá por el panorama de servicios de IA.' },
      { type: 'blog', id: 'como-desarrollar-aplicaciones-de-inteligencia-artificial-en-aws', note: 'Revisá las decisiones para crear una aplicación.' },
      { type: 'resource', id: 'catalog-3ebdcb69c732d7e8448058a32c45cc32', note: 'Seguí un ejemplo con React y Amazon Bedrock.' },
      { type: 'resource', id: 'catalog-5bc783c09682bfd962c72ae69832fd06', note: 'Mirá otra integración práctica con WhatsApp.' },
      { type: 'resource', id: 'catalog-57c144120f13ed6db9a77d344317b3f5', note: 'Construí y desplegá agentes paso a paso.' },
      { type: 'resource', id: 'catalog-0e20b9da7aa891e2cfdcc6e2af4a5805', note: 'Compará patrones cuando ya conocés los componentes.' },
    ],
  },
]);

export function resolveLearningPaths(paths, resources, posts) {
  const resourcesById = new Map(resources.filter((resource) => resource.kind === 'content')
    .map((resource) => [resource.id, resource]));
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const ids = new Set();

  return paths.map((path) => {
    if (ids.has(path.id)) throw new Error(`Duplicate learning path: ${path.id}`);
    ids.add(path.id);
    const steps = path.steps.flatMap((step) => {
      if (step.type === 'blog') {
        const post = postsById.get(step.id);
        if (!post) throw new Error(`Missing blog article in ${path.id}: ${step.id}`);
        return [{ ...step, title: post.data.title, href: `/blog/${post.id}/`, label: 'Artículo del blog' }];
      }
      if (step.type === 'resource') {
        const resource = resourcesById.get(step.id);
        // A DynamoDB approval can be withdrawn without making the entire static build fail.
        return resource ? [{ ...step, title: resource.title, href: resourceHref(resource), label: resource.format }] : [];
      }
      throw new Error(`Invalid learning path step in ${path.id}: ${step.type}`);
    });
    return { ...path, steps };
  });
}

/** Canonical detail URL for a learning path. */
export function learningPathHref(pathId) {
  return `/recorridos/${pathId}/`;
}

/**
 * Use resolved steps so withdrawn resources cannot become article continuation links.
 * @param {Array<{ id: string, title: string, steps: Array<{ id: string, type: string, title: string, href: string, label: string }> }>} paths
 * @param {string} articleId
 */
export function articlePathNavigation(paths, articleId) {
  return paths.flatMap((path) => {
    const index = path.steps.findIndex((step) => step.type === 'blog' && step.id === articleId);
    if (index === -1) return [];
    return [{
      title: path.title,
      href: learningPathHref(path.id),
      nextStep: path.steps[index + 1] ?? null,
    }];
  });
}
