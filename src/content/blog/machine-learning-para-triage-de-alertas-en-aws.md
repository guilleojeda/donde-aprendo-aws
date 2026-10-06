---
title: "Triage de alertas de seguridad en AWS con machine learning"
description: "Cuándo usar ML para priorizar hallazgos de GuardDuty y Security Hub, cómo evaluar un modelo con decisiones verificadas y qué automatizar con cuidado."
author: "guille-ojeda"
publishedAt: "2025-03-27"
publishedTimestamp: "2025-03-27T01:18:04.566000+00:00"
modifiedTimestamp: "2026-10-06T17:34:19-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
review:
  date: "2026-10-06"
  note: "Revisión técnica de triage, servicios de seguridad de AWS y recursos enlazados."
related:
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"
  - title: "Detección de amenazas en AWS: GuardDuty, CloudTrail y alertas"
    url: "https://dondeaprendoaws.com/blog/10-mejores-practicas-de-aws-para-deteccion-de-amenazas-en-tiempo-real/"

---

**Si buscas priorizar hallazgos de seguridad en AWS, primero aprovecha GuardDuty, Security Hub y sus reglas; entrena un modelo propio solo cuando tengas decisiones revisadas por analistas y una necesidad que esas opciones no cubran.** Amazon GuardDuty ya usa modelos de machine learning como parte de la detección de actividad sospechosa. Eso no significa que clasifique cada hallazgo según el contexto de negocio de tu equipo. Un modelo propio puede ordenar una cola de revisión con ese contexto, pero su puntuación no confirma que haya un ataque ni debería descartar una alerta sin revisión.

En esta guía verás cómo distinguir detección, priorización y respuesta; cuándo puede servir un clasificador o ranking supervisado; cómo evaluarlo sin ocultar falsos negativos; y qué límites comprobar antes de conectar el resultado con una acción. Los ejemplos son ficticios y describen un diseño, no una práctica sobre cuentas de AWS.

## Primero decide si hace falta un modelo propio

Antes de entrenar, separa tres tareas que suelen confundirse:

### Detectar actividad: Amazon GuardDuty

[Amazon GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html) analiza fuentes y registros compatibles y usa inteligencia de amenazas y ML para generar hallazgos. Cada hallazgo requiere evaluación; no es una decisión final sobre un incidente.

### Reunir señales: Security Hub y Security Hub CSPM

[Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-are-securityhub-services.html) evalúa la postura de seguridad y recibe hallazgos. El servicio Security Hub correlaciona señales para mostrar riesgos y exposiciones con más contexto. Revisa qué servicios y capacidades están habilitados en tus cuentas y regiones.

### Cambiar el estado de hallazgos conocidos

Las [reglas de automatización de Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/automations.html) y las [reglas de supresión de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/findings_suppression-rule.html) aplican criterios definidos por el equipo, como tipo de hallazgo, cuenta o recurso. Son reglas configuradas, no un modelo que aprende la prioridad de tu organización.

Antes de medir cualquier modelo, comprueba qué cuentas, regiones y planes de protección de GuardDuty cubren tus recursos. El ranking no compensa una fuente de detección que no está activa; la [guía de detección en AWS](https://dondeaprendoaws.com/blog/10-mejores-practicas-de-aws-para-deteccion-de-amenazas-en-tiempo-real/) recorre esos límites.

GuardDuty usa ML en la detección, pero no todos sus hallazgos provienen de un modelo de anomalías. Por ejemplo, en ciertos hallazgos de EKS Runtime Monitoring cuyo nombre termina en `AnomalousBehavior`, AWS indica que el hallazgo fue generado por su modelo de detección de anomalías; otras detecciones pueden basarse en señales o mecanismos distintos. Una actividad inusual tampoco equivale por sí sola a una amenaza confirmada. Consulta los [detalles de los hallazgos de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings-summary.html) para interpretar el tipo y la evidencia disponibles.

Security Hub CSPM también permite automatizar cambios de campos o suprimir hallazgos con condiciones explícitas. Para ejecutar algo fuera de Security Hub —por ejemplo, avisar a un canal, abrir un caso o iniciar un flujo de respuesta— configura una regla de Amazon EventBridge y su destino. La [guía de EventBridge para hallazgos de Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-cloudwatch-events.html) enumera destinos como Lambda, Step Functions, SNS, SQS y herramientas externas.

La grabación en español [“Amazon GuardDuty integrado con SIEM”](https://www.youtube.com/watch?v=CQUICC2h0Oc), de AWS User Group CreaTicas, sirve para conocer un patrón de integración. Es una charla sobre SIEM, no un tutorial de ML; contrasta sus pasos de AWS con la documentación actual.

**Hay una alternativa administrada si el problema principal es el triage operativo:** AWS Security Incident Response puede ingerir hallazgos de GuardDuty y Security Hub CSPM y hacer triage con el contexto de la cuenta. Si determina que un hallazgo es benigno o esperado, puede archivar el hallazgo de GuardDuty o marcar como suprimido el flujo de trabajo de Security Hub CSPM; cuando las cuotas lo permiten, puede intentar crear una regla de supresión de GuardDuty o una regla de automatización de Security Hub CSPM para hallazgos futuros. Si no logra determinar que la actividad es esperada, el equipo de respuesta de AWS puede investigar el caso. No es un modelo de ranking que entrenas con tus propias etiquetas. Requiere configurar una membresía y aceptar permisos y alcance de cuentas. AWS limita las regiones donde se puede alojar la membresía —la lista actual incluye São Paulo— y ofrece soporte dedicado en inglés. Comprueba su [guía de triage y alcance](https://docs.aws.amazon.com/security-ir/latest/userguide/detect-and-analyze.html), [comportamiento al archivar](https://docs.aws.amazon.com/security-ir/latest/userguide/understanding-automatic-archiving.html), [regiones](https://docs.aws.amazon.com/security-ir/latest/userguide/) y [precios](https://aws.amazon.com/security-incident-response/pricing/) antes de considerarlo.

Si primero necesitas validar qué detecta GuardDuty, qué registros se conservan y cómo comprobar el recorrido de un hallazgo, consulta la [guía de detección en AWS](https://dondeaprendoaws.com/blog/10-mejores-practicas-de-aws-para-deteccion-de-amenazas-en-tiempo-real/). La [comparación de servicios de seguridad](https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/) explica, además, la diferencia entre Security Hub y Security Hub CSPM.

## Qué significa usar ML para priorizar

Un modelo de triage recibe un hallazgo más contexto de tu entorno y recomienda en qué orden revisarlo. Por ejemplo, puede aprender de casos anteriores que importan el tipo de actividad, la cuenta, la criticidad del recurso, su exposición, el equipo responsable y si había un cambio aprobado. El objetivo debe ser concreto: predecir qué casos necesitan atención humana primero según las decisiones del equipo, no declarar automáticamente “ataque” o “falso positivo”.

Conviene elegir la unidad que realmente revisa el equipo. Si varias detecciones terminan en un mismo caso, correlaciona y etiqueta el caso; contar cada hallazgo duplicado como un incidente separado distorsiona el historial. Conserva por separado la severidad original de AWS y la prioridad que recomienda tu modelo: expresan cosas distintas.

Un enfoque supervisado necesita ejemplos con resultados revisados. Etiquetas posibles son “amenaza confirmada”, “actividad autorizada o esperada”, “hallazgo incorrecto” y “sin evidencia suficiente”. No conviertas la última categoría en una etiqueta negativa: si nadie pudo concluir qué pasó, el dato no enseña al modelo que el hallazgo era benigno.

En cambio, un método no supervisado busca grupos o desviaciones sin etiquetas previas. Puede ayudar a señalar actividad poco habitual para investigar, pero no aprende por sí solo qué es aceptable en tu entorno. La detección de anomalías no es una prueba de ataque ni una base suficiente para archivar hallazgos.

## Un flujo posible en AWS

Para una solución propia, puedes usar este patrón conceptual:

```text
GuardDuty: hallazgo
        ↓
Amazon EventBridge
        ↓
Lambda: añade contexto
        ↓
SageMaker AI: prioridad opcional
        ↓
Sistema de casos: revisión humana
        ↓
Resultado revisado → evaluación
```

GuardDuty publica hallazgos en EventBridge; debes configurar una regla y un destino para procesarlos. Lambda puede preparar campos y, si desplegaste un modelo, invocar su endpoint de inferencia. AWS documenta el [formato de eventos de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings_eventbridge.html), la llamada a [un endpoint de SageMaker AI](https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_runtime_InvokeEndpoint.html) y las opciones para [entrenar modelos en SageMaker AI](https://docs.aws.amazon.com/sagemaker/latest/dg/train-model.html). Este diagrama no prescribe tamaños, latencias ni resultados: debes estimar capacidad, disponibilidad regional y costo para tu volumen.

Separa los datos del hallazgo de los datos de negocio que agregas. Tipo, severidad, cuenta, región y recurso vienen del hallazgo; criticidad, entorno, propietario y ventanas de mantenimiento pueden venir de un inventario o proceso interno. Da a cada función únicamente los permisos necesarios y transmite solo los atributos que el modelo necesita. Evita incluir credenciales, secretos o registros completos si bastan atributos normalizados.

## Cómo entrenarlo y comprobar si ayuda

1. **Define la decisión.** Especifica qué significa “prioridad alta” para tu equipo: por ejemplo, casos que los analistas deben revisar antes por su impacto potencial. No copies automáticamente la severidad como etiqueta; eso enseñaría al modelo a repetir el orden existente, sin comprobar si ese orden resuelve el problema.
2. **Revisa las etiquetas.** Usa decisiones documentadas por analistas y conserva los casos dudosos como pendientes. Si aún tienes pocos casos confirmados, registra primero las decisiones y mantén una cola basada en reglas. No fabriques etiquetas con alertas que se cerraron sin investigación.
3. **Establece una línea de base.** Compara el modelo con el método actual, como ordenar por severidad y añadir criticidad del recurso mediante reglas. Un modelo solo ayuda si mejora una decisión concreta respecto de esa base.
4. **Reserva casos posteriores para evaluación.** Separa datos por tiempo para probar el modelo con actividad que ocurrió después del período usado para entrenarlo. No uses para entrenar las mismas investigaciones con que declaras que funciona.
5. **Mide ambas clases de error.** La precisión indica qué parte de los casos priorizados resultó relevante; el recall indica qué parte de los casos relevantes el modelo alcanzó a priorizar. Revisa además los casos graves que dejó abajo y compara cuántos casos urgentes puede revisar el equipo en su carga habitual. En problemas con incidentes confirmados poco frecuentes, la exactitud global puede parecer alta aunque el modelo pase por alto casos importantes. AWS describe estas métricas en la guía de [evaluación de clasificación de SageMaker AI](https://docs.aws.amazon.com/sagemaker/latest/dg/autopilot-metrics-validation.html).
6. **Prueba primero en modo sombra.** Calcula el orden recomendado mientras los analistas siguen trabajando como hasta ahora. Pídeles que revisen ejemplos de prioridades altas y bajas, registren desacuerdos y comparen los errores con la línea de base antes de permitir que una predicción cambie el flujo de respuesta.

Un ejemplo ficticio: llegan dos hallazgos con severidad media. El primero afecta una cuenta de producción y un recurso crítico, y no coincide con una actividad aprobada conocida. El segundo coincide con un escaneo planificado en desarrollo que ya fue revisado. Un ranking entrenado con casos etiquetados podría colocar primero el caso de producción y dejar el segundo en revisión ordinaria. La salida es un orden sugerido y los datos que lo influyeron; no es una probabilidad de intrusión ni una autorización para borrar el hallazgo.

## Automatiza el flujo, no la conclusión del modelo

Al principio, usa la puntuación para ordenar tickets o dirigir hallazgos a revisión. Mantén visible el hallazgo original, la versión del modelo, los atributos usados, su recomendación y la decisión posterior del analista. Si el modelo no puede evaluar un caso —por ejemplo, falta el contexto de criticidad— conserva la ruta habitual de revisión.

Para acciones que cambian permisos, redes o recursos, exige una condición verificable y una aprobación adecuada al impacto. No conectes una puntuación baja directamente con el aislamiento de una instancia, el bloqueo de una identidad o el archivo de un hallazgo. Una excepción conocida se gestiona mejor con una regla específica, después de que el equipo haya confirmado repetidamente ese comportamiento. GuardDuty recomienda construir supresiones de forma reactiva y acotada; además, los hallazgos suprimidos no se envían a EventBridge ni se usan para correlacionar secuencias de ataque. Revisa sus [límites y retención](https://docs.aws.amazon.com/guardduty/latest/ug/findings_suppression-rule.html) antes de usarlas.

**Si el hallazgo aparece en GuardDuty pero no llega a Lambda**, comprueba si una regla de supresión lo archivó. Luego verifica el patrón de EventBridge, la regla, su destino y los permisos. AWS documenta explícitamente que GuardDuty no envía a EventBridge los hallazgos archivados automáticamente por reglas de supresión; la [guía de integración de GuardDuty y EventBridge](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings_eventbridge.html) describe este caso. Para límites de cobertura o recepción entre servicios, sigue la [guía de detección enlazada arriba](https://dondeaprendoaws.com/blog/10-mejores-practicas-de-aws-para-deteccion-de-amenazas-en-tiempo-real/).

Al medir en producción, separa el funcionamiento del endpoint —errores, latencia y consumo— de la calidad de sus prioridades, que solo puedes comprobar cuando recibes etiquetas revisadas. La documentación actual de AWS indica que [SageMaker Model Monitor ya no está abierto a nuevos clientes](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor.html); quienes ya lo usan pueden continuar. Confirma qué opciones de monitoreo están disponibles para tu cuenta antes de incorporarlo al diseño. Entrenamiento, almacenamiento e inferencia también tienen costos; consulta los [precios de SageMaker AI](https://aws.amazon.com/sagemaker-ai/pricing/) y de los demás servicios que uses.

## Recursos y comunidades para seguir

Para una lectura técnica actual, AWS explica cómo [acelerar la revisión de hallazgos con contexto de negocio en Security Hub CSPM](https://aws.amazon.com/blogs/security/how-to-accelerate-security-finding-reviews-using-automated-business-context-validation-in-aws-security-hub/) y propone una [hoja de ruta de operación de seguridad](https://aws.amazon.com/blogs/security/operationalizing-aws-security-a-maturity-roadmap/) que aborda el ajuste de hallazgos antes de automatizar respuestas.

También puedes conversar con comunidades que comparten temas relacionados:

- [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/) es un grupo regional que comparte seguridad AWS para personas hispanohablantes. Su [canal de YouTube](https://www.youtube.com/@AWSSecurityLATAM) reúne grabaciones sobre seguridad, investigación y respuesta.
- [AWS UG Machine Learning Latam](https://www.meetup.com/aws-ug-machine-learning-latam/) conecta a personas interesadas en ML en América Latina; revisa su agenda para conocer sus próximas actividades.
- [AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/) es un grupo de seguridad AWS con sede en Buenos Aires; su página muestra la información de participación y los encuentros que publique.
- [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/) organiza actividades sobre seguridad cloud. Consulta su [agenda de eventos en Ecuador](https://dondeaprendoaws.com/eventos/ecuador/) y confirma fecha, zona horaria, modalidad, cupos e inscripción en la página del organizador; esas condiciones pueden cambiar.

Un modelo propio puede servir para ordenar mejor una cola cuando el equipo tiene evidencia suficiente y una necesidad específica. Si todavía falta contexto, cobertura o decisiones revisadas, empieza por mejorar esa base y conserva a una persona responsable de cada hallazgo importante.
