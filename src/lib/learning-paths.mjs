import { resourceHref } from './catalog-routes.mjs';

/** Editorial order and guidance live in Git; titles and destinations come from their owners. */
export const LEARNING_PATHS = Object.freeze([
  {
    id: 'primeros-pasos',
    title: 'Primeros pasos en AWS',
    audience: 'Para empezar',
    intro: 'Entendé la nube, cuidá tu cuenta y elegí una forma de seguir aprendiendo.',
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
    title: 'De Lambda a una aplicación serverless',
    audience: 'Con fundamentos de AWS',
    intro: 'Pasá de las funciones a una API y conocé la orquestación de tareas.',
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
    title: 'Fundamentos de seguridad en AWS',
    audience: 'Para empezar',
    intro: 'Construí una base de identidad, protección y detección antes de profundizar.',
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
    title: 'IA generativa con AWS',
    audience: 'Con fundamentos de desarrollo',
    intro: 'Recorré los conceptos y después compará aplicaciones y patrones de agentes.',
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
      href: `/recorridos/#${path.id}`,
      nextStep: path.steps[index + 1] ?? null,
    }];
  });
}
