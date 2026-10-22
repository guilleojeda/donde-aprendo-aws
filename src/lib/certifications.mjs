const REVIEWED_AT = '2026-10-22';
const MAP_PATH = '/aprender/certificaciones/';

const AWS_CERTIFICATION = 'https://aws.amazon.com/certification/';
const EXAM_GUIDES = 'https://docs.aws.amazon.com/aws-certification/latest/examguides/';
const BEFORE_TESTING = 'https://aws.amazon.com/certification/policies/before-testing/';
const AFTER_TESTING = 'https://aws.amazon.com/certification/policies/after-testing/';
const CERTIFICATION_FAQ = 'https://aws.amazon.com/certification/faqs/';
const RECERTIFICATION = 'https://aws.amazon.com/certification/recertification/';
const CONTACT = 'mailto:contact@dondeaprendoaws.com';

const EXAM_FACTS = Object.freeze({
  basePriceUsd: Object.freeze({ Business: 100, Foundational: 100, Associate: 150, Professional: 300, Specialty: 300 }),
  eligibility: 'AWS no exige una certificación anterior, experiencia laboral ni formación para inscribirte. La experiencia indicada para cada examen es una recomendación de preparación.',
  resultAndRetake: 'AWS publica los resultados en la cuenta de AWS Certification dentro de cinco días hábiles, salvo que estén bajo revisión por razones técnicas o de seguridad. Si no apruebas un examen estándar, debes esperar 14 días calendario y pagar el nuevo intento; no hay un límite general de intentos. La beta se puede presentar una sola vez y, para repetir, debes esperar hasta la disponibilidad general.',
  scheduling: 'La inscripción se inicia en la cuenta de AWS Certification y continúa con Pearson VUE. Según el examen y la cita disponible, puedes elegir un centro o supervisión en línea; confirma idioma, horario y requisitos antes de pagar.',
  cancellation: 'Puedes cancelar o cambiar la cita hasta 24 horas antes. AWS permite reprogramar cada cita como máximo dos veces; después debes cancelar y reservar otra. Si no te presentas o cancelas dentro de ese plazo, normalmente pierdes la tarifa.',
  currency: 'Pueden aplicarse impuestos y los importes en moneda local dependen del cambio vigente; las promociones y los precios beta también cambian. Confirma el total en la página del examen y al reservar.',
  resources: 'AWS ofrece guías, planes de preparación y distintos materiales oficiales; algunos contenidos de Skill Builder requieren suscripción. Los recursos comunitarios dependen de quien los publica. Un curso o una cuenta de práctica no incluye necesariamente la tarifa del examen ni elimina posibles cargos de servicios.',
  reviewed: 'La fecha indica cuándo revisamos ese material para el propósito y alcance descritos. No garantiza que el autor lo mantenga, que cubra todo el examen ni que su contenido siga actualizado después de esa revisión.',
  byCode: Object.freeze({
    'CLF-C02': Object.freeze({
      recommendedExperience: 'hasta seis meses de exposición a diseño, implementación u operaciones de AWS Cloud',
      durationMinutes: 90,
      questionCount: 65,
      scoredQuestionCount: 50,
      unscoredQuestionCount: 15,
      questionFormats: 'selección única o múltiple',
      passingScore: 700,
      scaledScoreMaximum: 1000,
      validityYears: 3,
      languages: 'Está disponible en español de Latinoamérica y de España, además de árabe, inglés, francés de Francia, alemán, italiano, japonés, coreano, portugués de Brasil y chino simplificado y tradicional.',
      languageTransition: 'AWS anunció el retiro de las versiones en alemán e italiano después del 31 de diciembre de 2026.',
      domains: Object.freeze([
        Object.freeze({ name: 'Conceptos de la nube', weight: 24 }),
        Object.freeze({ name: 'Seguridad y cumplimiento', weight: 30 }),
        Object.freeze({ name: 'Tecnología y servicios en la nube', weight: 34 }),
        Object.freeze({ name: 'Facturación, precios y soporte', weight: 12 }),
      ]),
      renewal: 'AWS permite renovarla con Cloud Quest: Recertify Cloud Practitioner, aprobar la versión vigente de CLF-C02 o aprobar cualquier examen Associate o Professional. Cloud Quest es gratuita y se habilita cuando faltan hasta seis meses para el vencimiento.',
    }),
    'AIF-C01': Object.freeze({
      recommendedExperience: 'hasta seis meses de exposición a tecnologías de IA/ML en AWS',
      durationMinutes: 90,
      questionCount: 65,
      scoredQuestionCount: 50,
      unscoredQuestionCount: 15,
      questionFormats: 'selección única o múltiple, ordenamiento y correspondencia',
      passingScore: 700,
      scaledScoreMaximum: 1000,
      validityYears: 3,
      languages: 'Está disponible en español de Latinoamérica y de España, además de árabe, inglés, francés de Francia, japonés, coreano, portugués de Brasil y chino simplificado y tradicional.',
      languageTransition: 'AWS retiró las versiones en alemán e italiano después del 15 de octubre de 2026.',
      domains: Object.freeze([
        Object.freeze({ name: 'Fundamentos de IA y ML', weight: 20 }),
        Object.freeze({ name: 'Fundamentos de IA generativa', weight: 24 }),
        Object.freeze({ name: 'Aplicaciones de modelos fundacionales', weight: 28 }),
        Object.freeze({ name: 'Pautas de IA responsable', weight: 14 }),
        Object.freeze({ name: 'Seguridad, cumplimiento y gobernanza de soluciones de IA', weight: 14 }),
      ]),
      renewal: 'AWS permite renovarla aprobando la versión vigente de AI Practitioner, Machine Learning Engineer Associate o Generative AI Developer Professional.',
    }),
    'SAA-C03': Object.freeze({
      recommendedExperience: 'al menos un año de experiencia práctica diseñando soluciones cloud con servicios de AWS',
      durationMinutes: 130,
      questionCount: 65,
      scoredQuestionCount: 50,
      unscoredQuestionCount: 15,
      questionFormats: 'selección única o múltiple',
      passingScore: 720,
      scaledScoreMaximum: 1000,
      validityYears: 3,
      languages: 'Está disponible en español de Latinoamérica y de España, además de inglés, francés de Francia, italiano, japonés, coreano, portugués de Brasil y chino simplificado y tradicional.',
      languageTransition: 'AWS anunció el retiro de la versión en italiano después del 31 de diciembre de 2026.',
      domains: Object.freeze([
        Object.freeze({ name: 'Diseñar arquitecturas seguras', weight: 30 }),
        Object.freeze({ name: 'Diseñar arquitecturas resilientes', weight: 26 }),
        Object.freeze({ name: 'Diseñar arquitecturas de alto rendimiento', weight: 24 }),
        Object.freeze({ name: 'Diseñar arquitecturas optimizadas en costo', weight: 20 }),
      ]),
      renewal: 'AWS permite renovarla aprobando la versión vigente de SAA-C03 o Solutions Architect Professional. También ofrece mantenimiento de un año con actividades de Skill Builder: la certificación debe seguir activa y estar dentro de sus 90 días anteriores al vencimiento, y se requiere una suscripción de pago.',
    }),
  }),
});

const sharedLinks = Object.freeze({
  certification: { label: 'Oferta oficial de AWS Certification', href: AWS_CERTIFICATION },
  examGuides: { label: 'Índice oficial de guías de examen', href: EXAM_GUIDES },
  certificationFaq: { label: 'FAQ oficial de AWS Certification', href: CERTIFICATION_FAQ },
  beforeTesting: { label: 'Política oficial antes del examen', href: BEFORE_TESTING },
  afterTesting: { label: 'Política oficial después del examen', href: AFTER_TESTING },
  recertification: { label: 'Opciones oficiales de renovación y mantenimiento', href: RECERTIFICATION },
  skillBuilderFaq: { label: 'FAQ oficial de preparación en AWS Skill Builder', href: 'https://skillbuilder.aws/support/faq/digital-training' },
});

const clfFacts = EXAM_FACTS.byCode['CLF-C02'];
const aifFacts = EXAM_FACTS.byCode['AIF-C01'];
const saaFacts = EXAM_FACTS.byCode['SAA-C03'];

function formatDomainWeights(domains) {
  return domains.map(({ name, weight }) => `${name} (${weight}%)`).join(', ');
}

const certificationRecords = [
  {
    id: 'cloud-practitioner',
    name: 'Cloud Practitioner',
    category: 'Foundational',
    purpose: 'Validar una comprensión general de AWS Cloud, sus servicios y terminología, sin centrarse en un rol técnico concreto.',
    officialUrl: 'https://aws.amazon.com/certification/certified-cloud-practitioner/',
    reviewedAt: REVIEWED_AT,
    exams: [{
      code: 'CLF-C02',
      status: 'Disponible',
      note: `${clfFacts.languageTransition} El examen también está disponible en español de Latinoamérica y de España.`,
    }],
    page: {
      path: MAP_PATH + 'cloud-practitioner/',
      title: 'AWS Cloud Practitioner: guía y recursos para prepararte',
      description: 'Prepara AWS Certified Cloud Practitioner CLF-C02: conoce sus dominios, la experiencia recomendada y una secuencia de estudio con recursos seleccionados.',
      intro: 'CLF-C02 valida conocimientos generales de la nube de AWS, sus servicios y terminología. Puede servir para iniciar una trayectoria cloud o para conversar mejor con equipos técnicos; no exige experiencia previa ni programación.',
      exam: {
        code: 'CLF-C02',
        experience: `AWS describe un perfil con ${clfFacts.recommendedExperience}. Es una orientación de preparación, no un requisito para inscribirte.`,
        requirements: 'No necesitas experiencia laboral, completar un curso ni aprobar otra certificación. La guía excluye programar, diseñar arquitecturas e implementar soluciones como tareas esperadas del candidato.',
        duration: `${clfFacts.durationMinutes} minutos`,
        questions: `${clfFacts.questionCount} preguntas: ${clfFacts.scoredQuestionCount} puntuadas y ${clfFacts.unscoredQuestionCount} no puntuadas. Son de ${clfFacts.questionFormats}; el resultado usa una escala de 100 a ${clfFacts.scaledScoreMaximum.toLocaleString('es-ES')}.`,
        price: `${EXAM_FACTS.basePriceUsd.Foundational} USD de precio base. ${EXAM_FACTS.currency}`,
        languages: `${clfFacts.languages} ${clfFacts.languageTransition} Confirma idioma y cita al reservar.`,
        validity: `${clfFacts.validityYears} años`,
        passingScore: `${clfFacts.passingScore} puntos en una escala de 100 a ${clfFacts.scaledScoreMaximum.toLocaleString('es-ES')}`,
        guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html',
      },
      domains: clfFacts.domains,
      preparation: [
        { title: 'Usa la guía como lista de objetivos', body: 'Marca qué puedes explicar, qué confundes y qué necesitas estudiar. Comprueba el código CLF-C02 y las listas de servicios dentro y fuera del alcance.' },
        { title: 'Aprende conceptos y casos de uso', body: 'Relaciona servicios con problemas habituales: identidad, cómputo, almacenamiento, bases de datos, redes, seguridad y costos. No hace falta desplegar una aplicación para estudiar los objetivos introductorios.' },
        { title: 'Practica con preguntas nuevas', body: 'Justifica la opción elegida y por qué descartarías las alternativas. Si fallas entre dos servicios, vuelve a la necesidad del caso y consulta la documentación vigente.' },
        { title: 'Evalúa las cuatro áreas', body: 'Combina preguntas oficiales y comunitarias con el peso de cada dominio y tus dificultades. Reserva cuando puedas explicar los objetivos y hayas revisado idioma, costo y modalidad.' },
      ],
      officialPreparation: [
        { title: 'Guía oficial CLF-C02', href: 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html', note: 'Define objetivos, dominios, tareas y servicios dentro y fuera del alcance.' },
        { title: 'Plan oficial de preparación', href: 'https://skillbuilder.aws/category/exam-prep/cloud-practitioner-foundational-CLF-C02', note: 'AWS propone conocer el examen, cubrir brechas, practicar y evaluar la preparación.' },
        { title: 'Preguntas oficiales de práctica', href: 'https://aws.amazon.com/certification/certified-cloud-practitioner/', note: 'La página del examen enlaza el conjunto de preguntas y otras actividades oficiales; revisa las condiciones de acceso de cada una.' },
      ],
      selections: [
        {
          type: 'resource',
          id: 'catalog-9637a2594f8a8be33e82e9ce86ab0adf',
          examCode: 'CLF-C02',
          purpose: 'Practicar preguntas originales en español latino y revisar explicaciones con referencias para seguir estudiando.',
          scope: 'El README declara un banco de 297 preguntas y un simulacro de 65 preguntas y 90 minutos que aproxima los pesos de los dominios. El contenido se declara revisado el 19 de septiembre de 2026; no se comprobó cada pregunta ni la cobertura de todos los objetivos.',
          reviewedAt: REVIEWED_AT,
          reviewedUrl: 'https://github.com/thomassr30/cloudprep-clf-es',
          language: 'Español latino',
          access: 'Aplicación pública de estudio independiente de AWS; la ejecución local documentada requiere Python 3 para servir los archivos.',
        },
        {
          type: 'blog',
          id: 'guia-de-estudio-aws-certified-cloud-practitioner-clf-c02',
          examCode: 'CLF-C02',
          purpose: 'Convertir los objetivos oficiales en un plan de repaso, practicar decisiones y decidir cuándo reservar.',
          scope: 'Guía del sitio para CLF-C02: convierte los objetivos oficiales en un plan de repaso y criterios para practicar y reservar. El artículo registra revisión editorial del 6 de octubre y actualización de enlaces/contenido el 22 de octubre de 2026; no es un banco de preguntas ni promete un resultado.',
          reviewedAt: REVIEWED_AT,
          language: 'Español',
          access: 'Artículo público del sitio.',
        },
      ],
      faq: {
        id: 'cloud-practitioner-faq',
        heading: 'Preguntas frecuentes sobre Cloud Practitioner',
        items: [
          {
            question: '¿Para quién sirve Cloud Practitioner y qué valida CLF-C02?',
            answer: 'Valida una comprensión general de AWS Cloud, servicios y terminología, independiente de un rol técnico específico. Puede ayudar a quien empieza en la nube o trabaja con equipos que usan AWS.',
            links: [{ label: 'Descripción y perfil oficial de CLF-C02', href: 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html' }],
          },
          {
            question: '¿Necesito experiencia, programar o aprobar otra certificación antes de CLF-C02?',
            answer: `No. AWS no establece requisitos previos; la guía describe ${clfFacts.recommendedExperience} como perfil recomendado. La programación e implementación de soluciones quedan fuera de las tareas esperadas del examen.`,
            links: [sharedLinks.beforeTesting, { label: 'Tareas dentro y fuera del alcance CLF-C02', href: 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html' }],
          },
          {
            question: '¿Debo aprobar Cloud Practitioner antes de AI Practitioner o Solutions Architect Associate?',
            answer: 'No. AWS no exige CLF-C02 ni otra certificación previa. Cloud Practitioner cubre fundamentos generales de nube; AI Practitioner, conceptos y casos de uso de IA/ML/GenAI; SAA-C03, decisiones para diseñar arquitecturas seguras, resilientes, de alto rendimiento y optimizadas en costo.',
            links: [
              { label: 'Guía de AI Practitioner', href: MAP_PATH + 'ai-practitioner/' },
              { label: 'Guía de Solutions Architect Associate', href: MAP_PATH + 'solutions-architect-associate/' },
              sharedLinks.beforeTesting,
            ],
          },
          {
            question: '¿Qué dominios tiene CLF-C02 y qué significan sus porcentajes?',
            answer: `La guía asigna ${formatDomainWeights(clfFacts.domains)}. Son pesos del contenido puntuado, no una cantidad de horas que cada persona deba estudiar.`,
            links: [{ label: 'Consultar los dominios oficiales', href: 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html' }],
          },
          {
            question: '¿Cuánto dura el examen y cómo se interpreta el puntaje?',
            answer: `Dura ${clfFacts.durationMinutes} minutos y tiene ${clfFacts.questionCount} preguntas: ${clfFacts.scoredQuestionCount} puntuadas y ${clfFacts.unscoredQuestionCount} no puntuadas, que no se identifican. El mínimo es ${clfFacts.passingScore} en una escala de 100 a ${clfFacts.scaledScoreMaximum.toLocaleString('es-ES')}; el puntaje escalado no equivale a un porcentaje fijo de respuestas correctas.`,
            links: [{ label: 'Ver formato y puntaje de CLF-C02', href: 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html' }],
          },
          {
            question: '¿Tengo que programar o hacer laboratorios para preparar CLF-C02?',
            answer: 'No. La guía deja la programación, el diseño arquitectónico y la implementación de soluciones fuera de las tareas esperadas. Puedes practicar con preguntas y repasar conceptos sin desplegar servicios; un laboratorio es opcional y, si usas una cuenta propia, revisa antes los posibles cargos.',
            links: [
              { label: 'Tareas y servicios dentro y fuera del examen', href: 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html' },
              { label: 'Plan oficial de preparación CLF-C02', href: 'https://skillbuilder.aws/category/exam-prep/cloud-practitioner-foundational-CLF-C02' },
            ],
          },
          {
            question: '¿Sirven los cursos o videos de versiones anteriores?',
            answer: 'Pueden ayudar con fundamentos, pero comprueba el código y coteja cada objetivo, servicio, precio y paso de consola con la guía CLF-C02 vigente. Una revisión menor puede actualizar la guía sin cambiar el código del examen.',
            links: [sharedLinks.examGuides],
          },
          {
            question: '¿Qué preparación puedo consultar sin pagar y qué puede costar?',
            answer: 'La guía y los conjuntos oficiales de 20 preguntas son gratuitos; algunos cursos también lo son. Los pretests y exámenes oficiales de práctica completos requieren suscripción a Skill Builder. La tarifa del examen es aparte, y usar servicios AWS en una cuenta propia puede generar cargos.',
            links: [
              { label: 'Plan oficial Cloud Practitioner', href: 'https://skillbuilder.aws/category/exam-prep/cloud-practitioner-foundational-CLF-C02' },
              sharedLinks.skillBuilderFaq,
              { label: 'Precios oficiales del examen', href: CERTIFICATION_FAQ },
            ],
          },
          {
            question: '¿Cuánto cuesta CLF-C02 y en qué idiomas está disponible?',
            answer: `El precio base publicado es ${EXAM_FACTS.basePriceUsd.Foundational} USD. ${clfFacts.languages} ${EXAM_FACTS.currency}`,
            links: [{ label: 'Detalles actuales del examen', href: 'https://aws.amazon.com/certification/certified-cloud-practitioner/' }, sharedLinks.beforeTesting],
          },
          {
            question: '¿Cómo sé si estoy listo para rendir CLF-C02?',
            answer: `No hay una cantidad de horas ni un resultado de práctica que garantice aprobar. Comprueba si puedes explicar los objetivos de sus ${clfFacts.domains.length} dominios y resolver situaciones nuevas con razones para elegir o descartar servicios. Usa las preguntas para localizar brechas y vuelve a los temas que aún no puedas explicar.`,
            links: [{ label: 'Plan oficial de preparación', href: 'https://skillbuilder.aws/category/exam-prep/cloud-practitioner-foundational-CLF-C02' }],
          },
          {
            question: '¿Cuánto dura la certificación CLF y cómo puedo renovarla?',
            answer: `La credencial dura ${clfFacts.validityYears} años. ${clfFacts.renewal} Comprueba tu elegibilidad y estado en AWS Skill Builder.`,
            links: [sharedLinks.recertification],
          },
          {
            question: '¿Cómo reservo CLF-C02 y qué pasa si no apruebo?',
            answer: EXAM_FACTS.scheduling,
            links: [sharedLinks.beforeTesting, sharedLinks.afterTesting],
          },
          {
            question: '¿Cuándo recibo el resultado y cuándo puedo repetir CLF-C02?',
            answer: EXAM_FACTS.resultAndRetake,
            links: [sharedLinks.afterTesting],
          },
        ],
      },
      library: { group: 'cloud-practitioner', label: 'Explorar materiales de Cloud Practitioner' },
      sources: [
        { label: 'AWS Certified Cloud Practitioner', href: 'https://aws.amazon.com/certification/certified-cloud-practitioner/' },
        { label: 'Guía oficial CLF-C02', href: 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html' },
        { label: 'Plan oficial de preparación CLF-C02', href: 'https://skillbuilder.aws/category/exam-prep/cloud-practitioner-foundational-CLF-C02' },
        sharedLinks.beforeTesting,
        sharedLinks.afterTesting,
        sharedLinks.recertification,
      ],
    },
  },
  {
    id: 'ai-practitioner',
    name: 'AI Practitioner',
    category: 'Foundational',
    purpose: 'Validar conocimientos fundacionales de IA, ML, IA generativa y casos de uso de servicios AWS; está orientada a usar estas tecnologías, no necesariamente a construirlas.',
    officialUrl: 'https://aws.amazon.com/certification/certified-ai-practitioner/',
    reviewedAt: REVIEWED_AT,
    exams: [{
      code: 'AIF-C01',
      status: 'Disponible',
      note: `${aifFacts.languageTransition} El examen también está disponible en español de Latinoamérica y de España.`,
    }],
    page: {
      path: MAP_PATH + 'ai-practitioner/',
      title: 'AWS AI Practitioner: guía y recursos para prepararte',
      description: 'Conoce el examen AWS Certified AI Practitioner AIF-C01, sus cinco dominios y una ruta para estudiar IA, ML y GenAI con responsabilidad.',
      intro: 'AIF-C01 valida que puedes reconocer conceptos de IA, ML y GenAI, relacionarlos con casos de negocio y elegir usos adecuados de servicios AWS. Sirve si trabajas en tecnología, datos, producto, ventas u otra función que necesita entender estas herramientas; no exige que construyas modelos.',
      exam: {
        code: 'AIF-C01',
        experience: `AWS describe un perfil con ${aifFacts.recommendedExperience}. Es una referencia de preparación, no un requisito para inscribirte.`,
        requirements: 'No exige programación, crear modelos ni aprobar Cloud Practitioner. La guía excluye construir y desplegar modelos o infraestructura como tareas esperadas del candidato.',
        duration: `${aifFacts.durationMinutes} minutos`,
        questions: `${aifFacts.questionCount} preguntas: ${aifFacts.scoredQuestionCount} puntuadas y ${aifFacts.unscoredQuestionCount} no puntuadas. Incluye ${aifFacts.questionFormats}; el resultado usa una escala de 100 a ${aifFacts.scaledScoreMaximum.toLocaleString('es-ES')}.`,
        price: `${EXAM_FACTS.basePriceUsd.Foundational} USD de precio base. ${EXAM_FACTS.currency}`,
        languages: `${aifFacts.languages} ${aifFacts.languageTransition} Confirma la disponibilidad al reservar.`,
        validity: `${aifFacts.validityYears} años`,
        passingScore: `${aifFacts.passingScore} puntos en una escala de 100 a ${aifFacts.scaledScoreMaximum.toLocaleString('es-ES')}`,
        guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html',
      },
      domains: aifFacts.domains,
      preparation: [
        { title: 'Aclara el alcance', body: 'Lee la guía AIF-C01 y separa los conceptos que necesitas explicar de las tareas de ingeniería que la guía deja fuera del perfil esperado.' },
        { title: 'Construye el vocabulario', body: 'Distingue IA, ML, aprendizaje profundo, modelos fundacionales y GenAI. Relaciona cada concepto con un problema que podría resolver y con sus límites.' },
        { title: 'Compara aplicaciones', body: 'Practica la elección de un enfoque y un servicio según datos, calidad, seguridad, costo y propósito. Incluye IA responsable y gobernanza en cada decisión.' },
        { title: 'Comprueba brechas', body: 'Usa preguntas oficiales, revisa por qué una opción corresponde al escenario y vuelve a los objetivos donde no puedas justificar tu decisión.' },
      ],
      officialPreparation: [
        { title: 'Guía oficial AIF-C01', href: 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html', note: 'Define los objetivos, dominios, habilidades y servicios dentro y fuera del alcance.' },
        { title: 'Plan oficial de preparación', href: 'https://skillbuilder.aws/category/exam-prep/ai-practitioner-AIF-C01', note: 'AWS organiza el recorrido en conocer el examen, cubrir brechas, practicar por dominio y evaluar la preparación.' },
        { title: 'Preguntas oficiales de práctica', href: 'https://aws.amazon.com/certification/certified-ai-practitioner/', note: 'La página del examen enlaza las preguntas y otras actividades oficiales; revisa las condiciones de acceso de cada una.' },
      ],
      selections: [
        {
          type: 'resource',
          id: 'catalog-325f32644f59ea54ecf859ea69324c18',
          examCode: 'AIF-C01',
          purpose: 'Usar una explicación en español para formar una base sobre IA, ML, GenAI y algunos criterios de elección antes de abordar los dominios del examen.',
          scope: 'Es el primer artículo de una serie comunitaria de cuatro. Se limita a fundamentos; no demuestra cobertura de todas las tareas AIF-C01 ni sustituye la guía oficial.',
          reviewedAt: REVIEWED_AT,
          reviewedUrl: 'https://builder.aws.com/content/3J0MYDbmWEnBT1pnpI0BEyScuAC/fundamentos-de-ia-y-ml-ai-practitioner-certification',
          language: 'Español',
          access: 'Artículo público en AWS Builder Center; no se comprobó un requisito de pago.',
        },
      ],
      faq: {
        id: 'ai-practitioner-faq',
        heading: 'Preguntas frecuentes sobre AI Practitioner',
        items: [
          {
            question: '¿Para quién sirve AI Practitioner y qué nivel técnico supone?',
            answer: 'AIF-C01 valida conocimientos fundacionales de IA, ML y GenAI y su aplicación en AWS. AWS describe a personas que usan estas tecnologías, pero no necesariamente las construyen; puede ser pertinente para funciones de nube, desarrollo, datos, IA o negocio.',
            links: [{ label: 'Perfil oficial del candidato y objetivos AIF-C01', href: 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html' }],
          },
          {
            question: '¿Necesito programar, entrenar modelos o tener Cloud Practitioner antes de AIF-C01?',
            answer: `No. AWS no exige otra certificación ni programación como requisito. AIF-C01 no evalúa implementar modelos, pipelines o infraestructura. AWS describe ${aifFacts.recommendedExperience} como orientación para la preparación, no como requisito de elegibilidad.`,
            links: [sharedLinks.beforeTesting],
          },
          {
            question: '¿En qué se diferencia AI Practitioner de Cloud Practitioner, AI Business Strategist y Machine Learning Engineer?',
            answer: 'Cloud Practitioner cubre fundamentos generales de la nube. AI Practitioner cubre conceptos de IA/ML/GenAI y usos de servicios AWS. AI Business Strategist evalúa decisiones de inversión, adopción y gobernanza desde el negocio; Machine Learning Engineer Associate evalúa construir, desplegar y operar soluciones de ML/GenAI en producción.',
            links: [
              { label: 'Mapa completo de certificaciones', href: MAP_PATH + '#certificaciones-mapa' },
              { label: 'MLA-C02 y su transición por idioma', href: 'https://aws.amazon.com/certification/certified-machine-learning-engineer-associate/' },
              { label: 'AI Business Strategist (beta)', href: 'https://aws.amazon.com/certification/certified-ai-business-strategist/' },
            ],
          },
          {
            question: '¿Qué dominios incluye AIF-C01 y dónde entran la IA responsable y la gobernanza?',
            answer: `La guía divide el examen entre ${formatDomainWeights(aifFacts.domains)}. Reconocer sus límites y riesgos forma parte explícita del mapa.`,
            links: [{ label: 'Consultar los cinco dominios oficiales', href: 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html' }],
          },
          {
            question: '¿AI Practitioner enseña a construir una aplicación de IA?',
            answer: 'No es un examen de implementación. Evalúa conceptos, casos de uso, elección de enfoques y uso responsable; no exige crear una solución. Para práctica técnica de construcción, elige formación de desarrollo y evalúa por separado los costos de los servicios.',
            links: [{ label: 'Revisar las tareas fuera del alcance AIF-C01', href: 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html' }],
          },
          {
            question: '¿Cómo compruebo si un recurso cubre todo AIF-C01?',
            answer: 'Compara sus objetivos, versión y ejemplos con los cinco dominios y las tareas de la guía vigente. Una introducción de IA generativa o una explicación de conceptos no demuestra cobertura de aplicaciones de modelos fundacionales, IA responsable, seguridad y gobernanza.',
            links: [sharedLinks.examGuides, { label: 'Guía oficial AIF-C01', href: 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html' }],
          },
          {
            question: '¿Qué duración, preguntas, puntaje, precio e idiomas tiene AIF-C01?',
            answer: `Dura ${aifFacts.durationMinutes} minutos; contiene ${aifFacts.questionCount} preguntas, de las cuales ${aifFacts.scoredQuestionCount} se puntúan y ${aifFacts.unscoredQuestionCount} no. El mínimo es ${aifFacts.passingScore} en una escala de 100 a ${aifFacts.scaledScoreMaximum.toLocaleString('es-ES')}; la escala no es un porcentaje de aciertos. El precio base es ${EXAM_FACTS.basePriceUsd.Foundational} USD. ${aifFacts.languages} ${EXAM_FACTS.currency}`,
            links: [
              { label: 'Detalles y disponibilidad por idioma', href: 'https://aws.amazon.com/certification/certified-ai-practitioner/' },
              { label: 'Guía AIF-C01 y puntaje', href: 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html' },
            ],
          },
          {
            question: '¿Qué preparación puedo consultar sin pagar y qué puede tener costo?',
            answer: 'La guía y el conjunto oficial de 20 preguntas son gratuitos; algunos cursos también lo son. Los pretests y exámenes oficiales de práctica completos requieren suscripción a Skill Builder. La tarifa del examen es aparte y practicar con servicios AWS puede generar cargos si usas recursos propios.',
            links: [
              { label: 'Plan oficial AIF-C01', href: 'https://skillbuilder.aws/category/exam-prep/ai-practitioner-AIF-C01' },
              sharedLinks.skillBuilderFaq,
              { label: 'Precios y condiciones de examen', href: CERTIFICATION_FAQ },
            ],
          },
          {
            question: '¿Cómo sé si estoy listo para rendir?',
            answer: 'Poder explicar los conceptos no basta si quedan dominios sin revisar. Usa el temario como lista de comprobación, justifica qué enfoque responde a cada caso y evalúa tus brechas con preguntas y práctica oficial. No hay un plazo universal ni un resultado de simulacro que garantice aprobar.',
            links: [{ label: 'Plan oficial de preparación', href: 'https://skillbuilder.aws/category/exam-prep/ai-practitioner-AIF-C01' }],
          },
          {
            question: '¿Cómo se agenda AIF-C01?',
            answer: EXAM_FACTS.scheduling,
            links: [sharedLinks.beforeTesting, sharedLinks.recertification],
          },
          {
            question: '¿Cuánto dura AI Practitioner y cómo se renueva?',
            answer: `La credencial dura ${aifFacts.validityYears} años. ${aifFacts.renewal} Comprueba las opciones actuales en tu cuenta de AWS Certification.`,
            links: [sharedLinks.recertification],
          },
          {
            question: '¿Cuándo recibo el resultado y qué hago si no apruebo?',
            answer: EXAM_FACTS.resultAndRetake,
            links: [sharedLinks.afterTesting],
          },
        ],
      },
      library: { group: 'ai-practitioner', label: 'Explorar materiales sobre AI Practitioner' },
      sources: [
        { label: 'AWS Certified AI Practitioner', href: 'https://aws.amazon.com/certification/certified-ai-practitioner/' },
        { label: 'Guía oficial AIF-C01', href: 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html' },
        { label: 'Plan oficial de preparación AIF-C01', href: 'https://skillbuilder.aws/category/exam-prep/ai-practitioner-AIF-C01' },
        sharedLinks.beforeTesting,
        sharedLinks.afterTesting,
        sharedLinks.recertification,
      ],
    },
  },
  {
    id: 'cloudops-engineer-associate',
    name: 'CloudOps Engineer',
    category: 'Associate',
    purpose: 'Validar habilidades para desplegar, gestionar, supervisar y operar cargas de trabajo en AWS, además de responder ante incidentes y optimizar costos y rendimiento.',
    officialUrl: 'https://aws.amazon.com/certification/certified-cloudops-engineer-associate/',
    reviewedAt: REVIEWED_AT,
    exams: [{
      code: 'SOA-C03',
      status: 'Disponible',
      note: 'El nombre CloudOps Engineer corresponde a SOA-C03. Las credenciales SysOps Administrator anteriores conservan su nombre y vigencia; ese examen se retiró en 2025. El coreano y el chino simplificado para SOA-C03 se retiran después del 19 de noviembre de 2026.',
    }],
  },
  {
    id: 'data-engineer-associate',
    name: 'Data Engineer',
    category: 'Associate',
    purpose: 'Validar la implementación de pipelines y almacenes de datos en AWS, la calidad de datos y la optimización de costo y rendimiento.',
    officialUrl: 'https://aws.amazon.com/certification/certified-data-engineer-associate/',
    reviewedAt: REVIEWED_AT,
    exams: [{ code: 'DEA-C01', status: 'Disponible' }],
  },
  {
    id: 'developer-associate',
    name: 'Developer',
    category: 'Associate',
    purpose: 'Validar habilidades para desarrollar, probar, desplegar y depurar aplicaciones basadas en AWS.',
    officialUrl: 'https://aws.amazon.com/certification/certified-developer-associate/',
    reviewedAt: REVIEWED_AT,
    exams: [
      {
        code: 'DVA-C02',
        status: 'Disponible',
        note: 'AWS mantiene DVA-C02 hasta el 30 de noviembre de 2026; el registro de DVA-C03 abre el 27 de octubre y su entrega general empieza el 1 de diciembre.',
      },
      {
        code: 'DVA-C03',
        status: 'Actualización anunciada',
        note: 'Registro anunciado desde el 27 de octubre y entrega general desde el 1 de diciembre de 2026. El código nuevo no se presenta como examen disponible antes de esa fecha.',
      },
    ],
  },
  {
    id: 'machine-learning-engineer-associate',
    name: 'Machine Learning Engineer',
    category: 'Associate',
    purpose: 'Validar la implementación, despliegue, mantenimiento y operación de soluciones y pipelines de ML en AWS.',
    officialUrl: 'https://aws.amazon.com/certification/certified-machine-learning-engineer-associate/',
    reviewedAt: REVIEWED_AT,
    exams: [
      {
        code: 'MLA-C01',
        status: 'Disponible por idioma',
        note: 'El inglés dejó de estar disponible el 28 de septiembre de 2026; japonés, coreano y chino simplificado siguen disponibles hasta el lanzamiento general de MLA-C02, anunciado para el 14 de enero de 2027.',
      },
      {
        code: 'MLA-C02',
        status: 'Beta en inglés',
        note: 'La beta está disponible solo en inglés desde el 29 de septiembre de 2026. El lanzamiento general con idiomas adicionales está anunciado para el 14 de enero de 2027.',
      },
    ],
  },
  {
    id: 'solutions-architect-associate',
    name: 'Solutions Architect',
    category: 'Associate',
    purpose: 'Validar el diseño de soluciones en AWS seguras, resilientes, de alto rendimiento y optimizadas en costo a partir de los requisitos de un escenario.',
    officialUrl: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/',
    reviewedAt: REVIEWED_AT,
    exams: [{ code: 'SAA-C03', status: 'Disponible', note: `${saaFacts.languageTransition} El examen también está disponible en español de Latinoamérica y de España.` }],
    page: {
      path: MAP_PATH + 'solutions-architect-associate/',
      title: 'AWS Solutions Architect Associate: guía y recursos para prepararte',
      description: 'Prepara AWS Certified Solutions Architect – Associate SAA-C03: experiencia recomendada, dominios oficiales, práctica de arquitectura y recursos seleccionados.',
      intro: 'SAA-C03 se centra en diseñar arquitecturas AWS a partir de necesidades y restricciones: seguridad, resiliencia, rendimiento y costo. Es una opción para quien ya trabaja con nube o sistemas de TI y quiere justificar decisiones de diseño; el temario exige comparar alternativas, no memorizar una lista de servicios.',
      exam: {
        code: 'SAA-C03',
        experience: `AWS recomienda ${saaFacts.recommendedExperience}. Es una guía de preparación, no un requisito obligatorio.`,
        requirements: 'No necesitas aprobar Cloud Practitioner ni completar un curso. AWS dice que no requiere programación profunda; conocer conceptos básicos de programación puede ayudar.',
        duration: `${saaFacts.durationMinutes} minutos`,
        questions: `${saaFacts.questionCount} preguntas: ${saaFacts.scoredQuestionCount} puntuadas y ${saaFacts.unscoredQuestionCount} no puntuadas. Son de ${saaFacts.questionFormats}; el resultado usa una escala de 100 a ${saaFacts.scaledScoreMaximum.toLocaleString('es-ES')}.`,
        price: `${EXAM_FACTS.basePriceUsd.Associate} USD de precio base. ${EXAM_FACTS.currency}`,
        languages: `${saaFacts.languages} ${saaFacts.languageTransition} Confirma idioma y cita al reservar.`,
        validity: `${saaFacts.validityYears} años`,
        passingScore: `${saaFacts.passingScore} puntos en una escala de 100 a ${saaFacts.scaledScoreMaximum.toLocaleString('es-ES')}`,
        guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html',
      },
      domains: saaFacts.domains,
      preparation: [
        { title: 'Lee la guía de SAA-C03', body: 'Usa los dominios y servicios dentro/fuera del alcance como índice. Para cada objetivo, marca qué puedes explicar y qué necesitas practicar.' },
        { title: 'Estudia por decisión', body: 'Relaciona cada escenario con disponibilidad, recuperación, seguridad, rendimiento, operación y costo. Practica justificar por qué una opción cumple mejor los requisitos que las alternativas.' },
        { title: 'Dibuja y recorre fallos', body: 'Bosqueja arquitecturas pequeñas y revisa qué ocurre si falla una zona, aumenta la carga, se pierde acceso a datos o cambia el patrón de lectura.' },
        { title: 'Cierra brechas con práctica', body: 'Resuelve preguntas oficiales, verifica servicios y restricciones en documentación, y vuelve a diseñar el escenario antes de evaluar otra vez tus áreas débiles.' },
      ],
      officialPreparation: [
        { title: 'Guía oficial SAA-C03', href: 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html', note: 'Define objetivos, dominios, tareas y servicios dentro y fuera del alcance.' },
        { title: 'Plan oficial de preparación', href: 'https://skillbuilder.aws/category/exam-prep/solutions-architect-associate-SAA-C03', note: 'Incluye pasos para conocer el examen, refrescar conocimientos, practicar y evaluar brechas.' },
        { title: 'Preguntas oficiales de práctica', href: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/', note: 'La página de AWS enlaza preguntas oficiales, actividades de práctica y el plan correspondiente.' },
      ],
      selections: [
        {
          type: 'resource',
          id: 'catalog-cfd600e1fedc80bfc4729e7e22c6eb0e',
          examCode: 'SAA-C03',
          purpose: 'Practicar escenarios y comparar respuestas en una aplicación de estudio en español.',
          scope: 'El README declara SAA-C03, 155 preguntas, un glosario de 415 términos y explicaciones. Revisé muestras del contenido y sus referencias, no el banco completo; el README no declara fecha de revisión ni mapeo completo por dominio. La app contiene un plan fechado y un vencimiento de voucher, que no son logística actual para el visitante; contrasta los temas con la guía vigente.',
          reviewedAt: REVIEWED_AT,
          reviewedUrl: 'https://github.com/Anedre/ruta-saa-c03',
          language: 'Español (según el README del proyecto)',
          access: 'La ficha describe una versión web y descargas para algunas plataformas; no declara si todas las funciones o el uso de cuenta son gratuitos.',
        },
        {
          type: 'blog',
          id: 'checklist-servicios-aws-esenciales-para-saa-c03',
          examCode: 'SAA-C03',
          purpose: 'Ordenar servicios y decisiones típicas por dominios y requisitos de arquitectura.',
          scope: 'Checklist del sitio revisada para SAA-C03; sirve para organizar fundamentos y comparar decisiones, no reemplaza la guía ni practica todos los formatos del examen.',
          reviewedAt: REVIEWED_AT,
        },
      ],
      faq: {
        id: 'solutions-architect-associate-faq',
        heading: 'Preguntas frecuentes sobre Solutions Architect Associate',
        items: [
          {
            question: '¿A quién le sirve SAA-C03 y cuánta experiencia conviene tener?',
            answer: `El examen valida decisiones de arquitectura para soluciones AWS. AWS recomienda ${saaFacts.recommendedExperience}, pero lo describe como una recomendación, no como una condición para inscribirte.`,
            links: [{ label: 'Perfil recomendado para SAA-C03', href: 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html' }],
          },
          {
            question: '¿Tengo que aprobar Cloud Practitioner antes de Solutions Architect Associate?',
            answer: 'No. AWS no exige certificaciones previas. Cloud Practitioner puede ayudar a quien empieza sin experiencia de TI, pero si ya puedes estudiar el nivel Associate puedes ir directamente a SAA-C03.',
            links: [sharedLinks.beforeTesting, { label: 'Comparar las tres guías de preparación', href: MAP_PATH }],
          },
          {
            question: '¿Cuál es la diferencia entre Solutions Architect Associate y Professional?',
            answer: 'SAA-C03 valida decisiones de diseño a nivel Associate. SAP-C02 es la versión actual en transición a SAP-C03 y valida arquitectura de mayor complejidad y amplitud. El grupo de materiales Solutions Architect del directorio contiene ambos niveles, por eso revisa el código antes de usar un recurso.',
            links: [
              { label: 'Mapa de certificaciones', href: MAP_PATH + '#certificaciones-mapa' },
              { label: 'Página oficial Solutions Architect Professional y transición SAP-C03', href: 'https://aws.amazon.com/certification/certified-solutions-architect-professional/' },
            ],
          },
          {
            question: '¿Cuánto código necesito para SAA-C03?',
            answer: 'AWS indica que no se necesita programación profunda; la familiaridad con conceptos básicos puede ayudar. El énfasis está en analizar requisitos, comparar servicios y defender una arquitectura, no en escribir una aplicación completa.',
            links: [{ label: 'Descripción oficial de SAA-C03', href: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/' }],
          },
          {
            question: '¿Qué evalúa SAA-C03: servicios de memoria o decisiones de diseño?',
            answer: `Sus dominios y pesos son ${formatDomainWeights(saaFacts.domains)}. Debes elegir servicios en escenarios y explicar cómo cumplen restricciones. AWS mantiene listas de servicios dentro y fuera del alcance, que pueden cambiar.`,
            links: [{ label: 'Consultar dominios y servicios oficiales', href: 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html' }],
          },
          {
            question: '¿Cómo practico y decido si estoy listo para SAA-C03?',
            answer: 'Empieza con la guía y las preguntas oficiales; después trabaja escenarios nuevos y comprueba tus decisiones con la documentación de AWS. Revisa brechas por dominio y evalúa si puedes justificar la arquitectura frente a cada requisito y restricción. No hay un plazo universal ni un resultado de simulacro que garantice aprobar.',
            links: [
              { label: 'Plan oficial SAA-C03', href: 'https://skillbuilder.aws/category/exam-prep/solutions-architect-associate-SAA-C03' },
              { label: 'Guía oficial SAA-C03', href: 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html' },
            ],
          },
          {
            question: '¿Los laboratorios requieren una cuenta AWS y pueden generar cargos?',
            answer: 'Hacer laboratorios no es un requisito para presentar el examen. Algunas actividades oficiales usan entornos provistos por AWS y otras prácticas pueden pedirte recursos propios. Antes de desplegar servicios, revisa quién proporciona la cuenta, cuánto dura el entorno y qué cargos podrían aplicarse.',
            links: [{ label: 'Plan oficial de preparación SAA-C03', href: 'https://skillbuilder.aws/category/exam-prep/solutions-architect-associate-SAA-C03' }],
          },
          {
            question: '¿Sirve estudiar con material de una versión anterior o de Professional?',
            answer: 'Puede ayudar con conceptos que siguen vigentes, pero comprueba el código, los objetivos y los servicios de la guía SAA-C03 actual. El examen Professional cubre problemas más complejos y amplios; un curso SAP-C02 o SAP-C03 no sustituye la práctica de SAA-C03 ni demuestra cobertura completa.',
            links: [
              { label: 'Guía oficial SAA-C03', href: 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html' },
              { label: 'Página oficial de Solutions Architect Professional', href: 'https://aws.amazon.com/certification/certified-solutions-architect-professional/' },
            ],
          },
          {
            question: '¿Qué preparación de AWS es gratuita y cuál requiere suscripción?',
            answer: 'La guía y el conjunto oficial de 20 preguntas son gratuitos; algunos cursos también lo son. Los pretests y exámenes oficiales de práctica completos requieren una suscripción a Skill Builder. La tarifa de SAA-C03 no está incluida en esos materiales.',
            links: [
              { label: 'Plan oficial SAA-C03', href: 'https://skillbuilder.aws/category/exam-prep/solutions-architect-associate-SAA-C03' },
              sharedLinks.skillBuilderFaq,
            ],
          },
          {
            question: '¿Qué duración, preguntas, puntaje, precio e idiomas tiene SAA-C03?',
            answer: `Dura ${saaFacts.durationMinutes} minutos; contiene ${saaFacts.questionCount} preguntas, de las cuales ${saaFacts.scoredQuestionCount} se puntúan y ${saaFacts.unscoredQuestionCount} no. El mínimo es ${saaFacts.passingScore} en una escala de 100 a ${saaFacts.scaledScoreMaximum.toLocaleString('es-ES')}; la escala no es un porcentaje de aciertos. El precio base es ${EXAM_FACTS.basePriceUsd.Associate} USD. ${saaFacts.languages} ${EXAM_FACTS.currency}`,
            links: [
              { label: 'Detalles vigentes del examen SAA-C03', href: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/' },
              { label: 'Guía y puntaje mínimo', href: 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html' },
            ],
          },
          {
            question: '¿Cómo me inscribo para SAA-C03?',
            answer: EXAM_FACTS.scheduling,
            links: [sharedLinks.beforeTesting, sharedLinks.afterTesting],
          },
          {
            question: '¿Cuándo recibo el resultado y cuándo puedo repetir SAA-C03?',
            answer: EXAM_FACTS.resultAndRetake,
            links: [sharedLinks.afterTesting],
          },
          {
            question: '¿Cuándo vence SAA y cómo puedo renovarla?',
            answer: `La credencial dura ${saaFacts.validityYears} años. ${saaFacts.renewal}`,
            links: [sharedLinks.recertification],
          },
        ],
      },
      library: { group: 'solutions-architect', label: 'Explorar materiales de Solutions Architect; comprueba el nivel' },
      sources: [
        { label: 'AWS Certified Solutions Architect – Associate', href: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/' },
        { label: 'Guía oficial SAA-C03', href: 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html' },
        { label: 'Plan oficial SAA-C03', href: 'https://skillbuilder.aws/category/exam-prep/solutions-architect-associate-SAA-C03' },
        sharedLinks.beforeTesting,
        sharedLinks.afterTesting,
        sharedLinks.recertification,
      ],
    },
  },
  {
    id: 'devops-engineer-professional',
    name: 'DevOps Engineer',
    category: 'Professional',
    purpose: 'Validar experiencia avanzada en automatizar entrega, operar sistemas distribuidos, responder a incidentes, medir sistemas y aplicar controles de seguridad en AWS.',
    officialUrl: 'https://aws.amazon.com/certification/certified-devops-engineer-professional/',
    reviewedAt: REVIEWED_AT,
    exams: [{ code: 'DOP-C02', status: 'Disponible' }],
  },
  {
    id: 'generative-ai-developer-professional',
    name: 'Generative AI Developer',
    category: 'Professional',
    purpose: 'Validar habilidades para integrar modelos fundacionales en aplicaciones y flujos de negocio, construir soluciones GenAI y operarlas en AWS.',
    officialUrl: 'https://aws.amazon.com/certification/certified-generative-ai-developer-professional/',
    reviewedAt: REVIEWED_AT,
    exams: [{ code: 'AIP-C01', status: 'Disponible' }],
  },
  {
    id: 'solutions-architect-professional',
    name: 'Solutions Architect',
    category: 'Professional',
    purpose: 'Validar diseño avanzado de soluciones complejas en AWS y optimización de seguridad, costo, rendimiento y operaciones.',
    officialUrl: 'https://aws.amazon.com/certification/certified-solutions-architect-professional/',
    reviewedAt: REVIEWED_AT,
    exams: [
      {
        code: 'SAP-C02',
        status: 'Disponible',
        note: 'SAP-C03 está anunciado; AWS publica el 16 de noviembre de 2026 como último día de SAP-C02 y el 17 de noviembre como inicio general de SAP-C03.',
      },
      {
        code: 'SAP-C03',
        status: 'Actualización anunciada',
        note: 'Registro anunciado desde el 27 de octubre y entrega general desde el 17 de noviembre de 2026; consulta el estado de registro antes de reservar.',
      },
    ],
  },
  {
    id: 'advanced-networking-specialty',
    name: 'Advanced Networking',
    category: 'Specialty',
    purpose: 'Validar experiencia en diseño y operación de redes complejas de AWS, incluidas arquitecturas avanzadas y conectividad híbrida.',
    officialUrl: 'https://aws.amazon.com/certification/certified-advanced-networking-specialty/',
    reviewedAt: REVIEWED_AT,
    exams: [{
      code: 'ANS-C01',
      status: 'Retiro anunciado',
      note: 'AWS mantiene la posibilidad de rendir hasta el 31 de diciembre de 2026; las credenciales obtenidas antes del retiro conservan tres años de vigencia.',
    }],
  },
  {
    id: 'security-specialty',
    name: 'Security',
    category: 'Specialty',
    purpose: 'Validar conocimientos avanzados para proteger cargas de trabajo y arquitecturas de AWS.',
    officialUrl: 'https://aws.amazon.com/certification/certified-security-specialty/',
    reviewedAt: REVIEWED_AT,
    exams: [{ code: 'SCS-C03', status: 'Disponible' }],
  },
  {
    id: 'ai-business-strategist',
    name: 'AI Business Strategist',
    category: 'Business',
    purpose: 'Validar criterio para evaluar inversiones de IA, preparar casos de negocio, establecer gobernanza y escalar su adopción en una organización.',
    officialUrl: 'https://aws.amazon.com/certification/certified-ai-business-strategist/',
    reviewedAt: REVIEWED_AT,
    exams: [{
      code: 'AIB-C01',
      status: 'Beta',
      note: 'La beta evalúa estrategia de negocio y se ofrece en inglés y japonés; no mide implementación de servicios AWS. La disponibilidad y el precio beta dependen de la página oficial al inscribirse.',
    }],
  },
];

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const CERTIFICATIONS = deepFreeze(certificationRecords);

const overviewFaq = {
  id: 'certificaciones-faq',
  heading: 'Preguntas frecuentes sobre certificaciones AWS',
  items: [
    {
      question: '¿Qué certificaciones AWS existen y qué significan sus categorías?',
      answer: 'AWS agrupa sus credenciales en Business, Foundational, Associate, Professional y Specialty. Business valida decisiones de adopción de tecnología; Foundational cubre una base general; Associate y Professional se enfocan en roles técnicos con complejidad creciente; Specialty profundiza en un área. No son una secuencia obligatoria: elige según el trabajo que quieres demostrar y tu experiencia.',
      links: [{ label: 'Ver la oferta oficial completa', href: AWS_CERTIFICATION }],
    },
    {
      question: '¿Cómo elegir una certificación según mi objetivo y experiencia?',
      answer: 'Empieza por el trabajo que quieres hacer, no por una lista de niveles. Cloud Practitioner sirve para fundamentos generales de nube; AI Practitioner para conceptos y usos de IA; SAA para decisiones de arquitectura; otros exámenes corresponden a desarrollo, operaciones, datos, seguridad o estrategia de negocio. Compara el perfil recomendado y los dominios de la guía antes de elegir.',
      links: [{ label: 'Comparar las credenciales disponibles', href: '#certificaciones-mapa' }],
    },
    {
      question: '¿Es obligatorio aprobar Cloud Practitioner antes de una certificación Associate o Professional?',
      answer: 'No. AWS no exige una certificación previa para inscribirte. Cloud Practitioner puede ser útil si estás empezando sin experiencia de TI, pero no es un requisito para rendir SAA u otro examen de nivel superior.',
      links: [sharedLinks.beforeTesting],
    },
    {
      question: '¿Un certificado de un curso o una insignia me da una certificación AWS?',
      answer: 'No. Terminar un curso puede entregar un certificado o una insignia de formación de quien lo ofrece. AWS Certification se obtiene al aprobar el examen supervisado correspondiente; revisa el nombre exacto de la credencial que valida cada insignia.',
      links: [sharedLinks.certificationFaq],
    },
    {
      question: '¿En qué se diferencia una microcredencial de una certificación AWS?',
      answer: 'AWS describe las microcredenciales como evaluaciones prácticas enfocadas en un tema. Son distintas de las certificaciones obtenidas mediante un examen supervisado y pueden tener condiciones, duración y vigencia propias.',
      links: [{ label: 'Consultar la FAQ oficial sobre microcredenciales', href: CERTIFICATION_FAQ }],
    },
    {
      question: '¿Qué significa que un examen esté en beta, se actualice o se retire?',
      answer: 'Una beta permite validar preguntas antes de una versión estándar y puede tener condiciones o precio diferentes. Una actualización anunciada puede coexistir un tiempo con la versión actual; el código nuevo no significa que ya puedas rendirlo. En la fecha de retiro publicada, el examen deja de poder rendirse, pero una credencial ya obtenida mantiene su vigencia original.',
      links: [{ label: 'Ver las políticas y anuncios oficiales', href: AWS_CERTIFICATION }],
    },
    {
      question: '¿Cómo distingo el código del examen de una revisión menor de su guía?',
      answer: 'El código identifica la serie del examen, como CLF-C02 o SAA-C03. AWS puede revisar tareas o servicios de la guía sin cambiar ese código. Comprueba la fecha de revisión, el código que cubre un material y la guía oficial vigente; un curso antiguo puede seguir explicando fundamentos, pero sus datos mutables pueden haber cambiado.',
      links: [sharedLinks.examGuides],
    },
    {
      question: '¿Hay exámenes y materiales de preparación en español?',
      answer: 'Sí, varios exámenes ofrecen español latinoamericano o de España; la disponibilidad cambia por certificación y puede cambiar durante una transición. El idioma de un examen no garantiza que cada curso, video o herramienta esté traducido. Revisa por separado la página de AWS y la ficha del material.',
      links: [sharedLinks.examGuides, { label: 'Consultar disponibilidad al reservar', href: BEFORE_TESTING }],
    },
    {
      question: '¿Puedo prepararme gratis o necesito pagar un curso?',
      answer: 'AWS no exige formación para rendir. Sus conjuntos oficiales de 20 preguntas y parte de los cursos de preparación son gratuitos; los exámenes completos de práctica, pretests y otros materiales pueden requerir suscripción. La tarifa del examen es aparte. Revisa quién proporciona la cuenta de práctica y si el uso de servicios puede generar cargos.',
      links: [{ label: 'Planes oficiales de preparación', href: 'https://skillbuilder.aws/' }, sharedLinks.skillBuilderFaq, sharedLinks.certificationFaq],
    },
    {
      question: '¿Necesito experiencia, saber programar o crear una cuenta de AWS para presentar el examen?',
      answer: 'La experiencia publicada para cada examen orienta cuánto conviene practicar, pero AWS no exige experiencia, programación ni una certificación previa como requisito general. Para agendar necesitas una cuenta de AWS Certification, que es distinta de una cuenta de consumo de servicios AWS. La preparación práctica puede tener requisitos propios.',
      links: [sharedLinks.beforeTesting, sharedLinks.certificationFaq],
    },
    {
      question: '¿Qué significa la fecha de revisión de una selección de recursos?',
      answer: EXAM_FACTS.reviewed + ' La nota también explica qué objetivo cubre y qué queda fuera; la selección es un punto de partida, no una promesa de cobertura total.',
      links: [sharedLinks.examGuides],
    },
    {
      question: '¿Cuánto cuesta un examen AWS? ¿Se agregan impuestos o hay promociones?',
      answer: `Como precios base estándar, AWS publica ${EXAM_FACTS.basePriceUsd.Business} USD para Business y Foundational, ${EXAM_FACTS.basePriceUsd.Associate} USD para Associate y ${EXAM_FACTS.basePriceUsd.Professional} USD para Professional y Specialty. Una beta puede tener un precio distinto. ${EXAM_FACTS.currency}`,
      links: [sharedLinks.certificationFaq, sharedLinks.beforeTesting],
    },
    {
      question: '¿Cómo me inscribo y puedo rendir en línea o en un centro?',
      answer: 'Inicia sesión en AWS Certification, elige el examen y continúa con Pearson VUE para seleccionar una cita. AWS ofrece centros de evaluación y supervisión en línea; los horarios y requisitos dependen de la ubicación y la modalidad. Comprueba las condiciones técnicas y de identificación antes de pagar.',
      links: [sharedLinks.beforeTesting],
    },
    {
      question: '¿Cómo confirmo el idioma, la fecha y la modalidad que realmente puedo reservar?',
      answer: 'Consulta la página de ese examen y luego verifica las citas disponibles al entrar en Pearson VUE. En una transición, los idiomas pueden permanecer disponibles para una versión mientras la beta de otra se ofrece solo en inglés. La disponibilidad mostrada en una guía o un curso no confirma una cita.',
      links: [sharedLinks.certification, sharedLinks.beforeTesting],
    },
    {
      question: '¿Cuándo llegan los resultados y cuándo puedo volver a intentar?',
      answer: EXAM_FACTS.resultAndRetake + ' Para una beta, comprueba sus condiciones específicas antes de registrarte.',
      links: [sharedLinks.afterTesting],
    },
    {
      question: '¿Puedo cancelar o reprogramar un examen sin perder la tarifa?',
      answer: EXAM_FACTS.cancellation + ' Consulta las reglas de Pearson VUE y cualquier excepción documentada antes de cambiar la cita.',
      links: [sharedLinks.beforeTesting],
    },
    {
      question: '¿Cuánto dura una certificación y cómo se renueva?',
      answer: 'Las certificaciones AWS suelen tener una vigencia de tres años. Las opciones dependen de la credencial: pueden incluir aprobar su versión vigente, otro examen de nivel superior o una ruta de mantenimiento en Skill Builder para credenciales elegibles. Revisa el estado activo, los plazos y condiciones actuales de tu certificación.',
      links: [sharedLinks.recertification],
    },
    {
      question: '¿Qué hago si todavía no hay una selección local para mi examen?',
      answer: 'La ausencia de una selección aquí no significa que la certificación no exista ni que AWS no publique preparación oficial. Usa el mapa y la guía oficial para ese código; la biblioteca reúne materiales que puedes explorar, sin prometer que todos cubran el examen completo.',
      links: [sharedLinks.examGuides, { label: 'Explorar materiales publicados', href: MAP_PATH + '#certificaciones-materiales' }],
    },
    {
      question: '¿Cómo sugiero un recurso o reporto un enlace incorrecto?',
      answer: 'Puedes contactar al sitio con el enlace, el código de examen relacionado y, si lo conoces, el objetivo que ayuda a estudiar. Para un enlace roto, indica también qué ocurre al abrirlo. Así podemos revisar su uso y sus límites antes de incorporarlo.',
      links: [{ label: 'Contactar al sitio', href: CONTACT }],
    },
  ],
};

const overviewTitle = 'Certificaciones AWS: cuál elegir y cómo prepararte';
const overviewDescription = 'Compara las certificaciones AWS por objetivo y perfil, conoce los estados de sus exámenes y encuentra guías oficiales y materiales para preparar la opción que te conviene.';

function buildOverviewSearch() {
  const credentials = CERTIFICATIONS.flatMap((certification) => [
    certification.name,
    certification.category,
    certification.purpose,
    ...certification.exams.flatMap((exam) => [exam.code, exam.status, exam.note ?? '']),
  ]);
  const faq = overviewFaq.items.flatMap(({ question, answer }) => [question, answer]);
  return [overviewTitle, overviewDescription, ...credentials, ...faq].filter(Boolean).join(' ');
}

export const CERTIFICATIONS_OVERVIEW = deepFreeze({
  title: overviewTitle,
  description: overviewDescription,
  intro: 'Explora la oferta oficial de certificaciones AWS, compara qué valida cada una y elige un examen según el trabajo que quieres demostrar y tu experiencia. El mapa no depende de los materiales que haya en la biblioteca: una selección local limitada no reduce la oferta oficial.',
  reviewedAt: REVIEWED_AT,
  faq: overviewFaq,
  search: buildOverviewSearch(),
  sources: [
    { label: 'AWS Certification: oferta y categorías oficiales', href: AWS_CERTIFICATION },
    { label: 'Índice oficial de guías de examen', href: EXAM_GUIDES },
    { label: 'Anuncio oficial de transiciones de septiembre de 2026', href: 'https://aws.amazon.com/blogs/training-and-certification/september-2026-new-offerings/' },
    { label: 'Anuncio de AWS Certified AI Business Strategist', href: 'https://aws.amazon.com/blogs/training-and-certification/introducing-aws-certified-ai-business-strategist-built-for-the-people-who-scale-ai/' },
    { label: 'AWS Certified Advanced Networking – Specialty', href: 'https://aws.amazon.com/certification/certified-advanced-networking-specialty/' },
  ],
});

/**
 * Return and validate the local detail routes derived from certification records.
 * @param {import('../types/certifications').CertificationRecord[]} [registry]
 * @returns {import('../types/certifications').CertificationPage[]}
 */
export function getCertificationPages(registry = CERTIFICATIONS) {
  const pages = registry.filter(({ page }) => page).map(({ page, ...certification }) => ({
    ...page,
    id: certification.id,
    name: certification.name,
    category: certification.category,
    officialUrl: certification.officialUrl,
    reviewedAt: certification.reviewedAt,
  }));
  const seenPaths = new Set();
  for (const page of pages) {
    const routeMatch = typeof page.path === 'string'
      ? /^\/aprender\/certificaciones\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/u.exec(page.path)
      : null;
    if (!routeMatch) {
      throw new Error('Invalid certification page path for ' + page.id);
    }
    if (seenPaths.has(page.path)) throw new Error('Duplicate certification page path: ' + page.path);
    seenPaths.add(page.path);
  }
  return pages;
}

export function certificationHref(id) {
  const certification = CERTIFICATIONS.find((entry) => entry.id === id);
  if (!certification) throw new Error('Unknown certification: ' + String(id));
  return certification.page?.path ?? null;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireText(value, name, selectionIndex) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Invalid certification selection ' + selectionIndex + ': ' + name + ' is required');
  }
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateSelection(selection, selectionIndex) {
  if (!isRecord(selection)) throw new Error('Invalid certification selection ' + selectionIndex + ': expected an object');
  if (selection.type !== 'resource' && selection.type !== 'blog') {
    throw new Error('Invalid certification selection ' + selectionIndex + ': unknown type ' + String(selection.type));
  }
  requireText(selection.id, 'id', selectionIndex);
  requireText(selection.examCode, 'examCode', selectionIndex);
  requireText(selection.purpose, 'purpose', selectionIndex);
  requireText(selection.scope, 'scope', selectionIndex);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(selection.id)) {
    throw new Error('Invalid certification selection ' + selectionIndex + ': id has an invalid format');
  }
  if (!isIsoDate(selection.reviewedAt)) {
    throw new Error('Invalid certification selection ' + selectionIndex + ': reviewedAt must be a real YYYY-MM-DD date');
  }
  for (const field of ['language', 'access']) {
    if (selection[field] !== undefined && (typeof selection[field] !== 'string' || !selection[field].trim())) {
      throw new Error('Invalid certification selection ' + selectionIndex + ': ' + field + ' must be non-empty text');
    }
  }
  if (selection.type === 'resource') {
    requireText(selection.reviewedUrl, 'reviewedUrl', selectionIndex);
    let reviewedUrl;
    try {
      reviewedUrl = new URL(selection.reviewedUrl);
    } catch {
      throw new Error('Invalid certification selection ' + selectionIndex + ': reviewedUrl must be a URL');
    }
    if (reviewedUrl.protocol !== 'https:') {
      throw new Error('Invalid certification selection ' + selectionIndex + ': reviewedUrl must use HTTPS');
    }
  }
}

function selectionContext(selection) {
  return {
    type: selection.type,
    id: selection.id,
    examCode: selection.examCode,
    purpose: selection.purpose,
    scope: selection.scope,
    reviewedAt: selection.reviewedAt,
    ...(selection.language === undefined ? {} : { language: selection.language }),
    ...(selection.access === undefined ? {} : { access: selection.access }),
  };
}

export function resolveCertificationSelections(selections, resources, posts) {
  if (!Array.isArray(selections)) throw new TypeError('Certification selections must be an array');
  if (!Array.isArray(resources)) throw new TypeError('Certification resources must be an array');
  if (!Array.isArray(posts)) throw new TypeError('Certification blog posts must be an array');

  selections.forEach((selection, index) => validateSelection(selection, index + 1));
  const resourcesById = new Map(resources.filter((resource) => isRecord(resource) && resource.kind === 'content'
    && typeof resource.id === 'string').map((resource) => [resource.id, resource]));
  const postsById = new Map(posts.filter((post) => isRecord(post) && typeof post.id === 'string')
    .map((post) => [post.id, post]));

  return selections.flatMap((selection) => {
    if (selection.type === 'blog') {
      const post = postsById.get(selection.id);
      if (!post) throw new Error('Missing blog article for certification selection: ' + selection.id);
      const title = post.data?.title;
      if (typeof title !== 'string' || !title.trim()) {
        throw new Error('Missing blog article title for certification selection: ' + selection.id);
      }
      return [{
        ...selectionContext(selection),
        title,
        href: '/blog/' + post.id + '/',
      }];
    }

    const resource = resourcesById.get(selection.id);
    if (!resource || typeof resource.title !== 'string' || !resource.title.trim()
      || typeof resource.url !== 'string' || resource.url !== selection.reviewedUrl) return [];
    let destination;
    try {
      destination = new URL(resource.url);
    } catch {
      return [];
    }
    if (destination.protocol !== 'https:') return [];
    return [{
      ...selectionContext(selection),
      title: resource.title,
      href: resource.url,
    }];
  });
}
