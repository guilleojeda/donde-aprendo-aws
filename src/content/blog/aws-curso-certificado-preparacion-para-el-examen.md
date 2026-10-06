---
title: "Cómo prepararse para una certificación AWS: guía de estudio"
description: "Elige un examen AWS según tu perfil, arma un plan con la guía oficial y practica con recursos y comunidades en español. Revisa costos, registro y reintentos."
author: "guille-ojeda"
publishedAt: "2024-01-23"
publishedTimestamp: "2024-01-23T17:34:37.557Z"
modifiedTimestamp: "2026-10-06T10:14:29-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-certificacion.png"
coverAlt: "Tres tarjetas de estudio con apuntes y hitos sobre un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-certificacion.png"
related: []
---

Para prepararte para una certificación AWS, elige primero el examen que corresponde al trabajo que quieres demostrar. Después usa su guía vigente como lista de objetivos, estudia las lagunas que encuentres, practica con preguntas y escenarios, y reserva el examen cuando puedas explicar tus decisiones. Hacer un curso puede ayudar, pero AWS no lo exige y terminarlo no equivale a obtener la certificación.

No hay un curso, un simulacro ni una cantidad de horas que garantice aprobar. La meta es entender los conceptos y saber aplicarlos a situaciones nuevas, no memorizar respuestas. Esta guía te ayuda a elegir una ruta, organizar el estudio, encontrar apoyo en español y revisar las condiciones del examen antes de pagar.

Los códigos, idiomas y fechas de transición mencionados aquí se comprobaron el **6 de octubre de 2026**. Vuelve a consultar la ficha oficial y la disponibilidad de Pearson VUE antes de inscribirte.

## Qué certificación AWS elegir

Empieza por el área en la que quieres trabajar. Estas cinco rutas cubren necesidades distintas; no hace falta rendir una certificación Foundational antes de un examen Associate si tu experiencia ya corresponde al rol.

- **Conocer la nube o empezar sin experiencia técnica:** [AWS Certified Cloud Practitioner](https://aws.amazon.com/certification/certified-cloud-practitioner/) valida una comprensión general de AWS. La guía vigente al 6 de octubre de 2026 es **CLF-C02**. Puede servir a principiantes y a personas de áreas no técnicas que necesitan entender la nube.
- **Entender usos de IA y machine learning en AWS:** [AWS Certified AI Practitioner](https://aws.amazon.com/certification/certified-ai-practitioner/) cubre conceptos y casos de uso de IA, ML e IA generativa. La guía vigente al revisar este artículo es **AIF-C01**. Es una ruta de fundamentos; por sí sola no acredita que puedas construir soluciones de IA en producción.
- **Desarrollar aplicaciones:** [AWS Certified Developer – Associate](https://aws.amazon.com/es/certification/certified-developer-associate/) corresponde a quienes desarrollan, despliegan y mantienen aplicaciones con AWS. Al **6 de octubre de 2026**, AWS aún ofrece **DVA-C02** y anuncia que abrirá la inscripción de **DVA-C03 el 27 de octubre**, con entrega general prevista para el 1 de diciembre. El [anuncio oficial de septiembre](https://aws.amazon.com/blogs/training-and-certification/september-2026-new-offerings/) da el 30 de noviembre como último día para DVA-C02; la ficha oficial en español indica el 1 de diciembre. Si vas a rendir DVA-C02, planea hacerlo a más tardar el 30 de noviembre y confirma el turno en Pearson VUE.
- **Diseñar soluciones en la nube:** [AWS Certified Solutions Architect – Associate](https://aws.amazon.com/certification/certified-solutions-architect-associate/) se enfoca en decisiones de arquitectura, como seguridad, resiliencia, rendimiento y costo. La guía que AWS publica actualmente es **SAA-C03**.
- **Operar cargas de trabajo:** [AWS Certified CloudOps Engineer – Associate](https://aws.amazon.com/certification/certified-cloudops-engineer-associate/) cubre operaciones, monitorización, automatización, redes y continuidad. La versión actual es **SOA-C03**; el examen SysOps **SOA-C02 tuvo su última fecha de rendición el 29 de septiembre de 2025**, según el [anuncio de transición de AWS](https://aws.amazon.com/blogs/training-and-certification/exam-update-and-new-name-for-operations-certification/). Al revisar este artículo, la página de AWS lista inglés, japonés, coreano y chino simplificado, no español; indica que coreano y chino simplificado dejarán de ofrecerse después del 19 de noviembre de 2026.

Los nombres, códigos y calendarios pueden cambiar. Antes de empezar y antes de reservar, consulta el [índice oficial de guías de examen](https://docs.aws.amazon.com/aws-certification/latest/examguides/) y la página de la certificación elegida. Si un curso muestra otro código, puede cubrir una versión anterior aunque mantenga un título parecido.

## Un plan de estudio que puedes ajustar

No necesitas seguir un cronograma fijo. Organiza sesiones según tu disponibilidad y avanza cuando puedas explicar los objetivos, no solo cuando termines un curso.

### 1. Diagnostica tus conocimientos con la guía

Abre la guía del examen y revisa cada dominio y objetivo. Marca cada punto como **lo puedo explicar**, **necesito repasar** o **todavía no lo entiendo**. Agrega una pregunta concreta para los temas pendientes.

Por ejemplo, “vi un video de IAM” registra una actividad. “Puedo explicar por qué una aplicación usa un rol y qué permisos necesita” describe algo que ya puedes demostrar.

AWS mantiene un [catálogo de guías de examen](https://docs.aws.amazon.com/aws-certification/latest/examguides/) con objetivos y referencias a los servicios dentro y fuera del alcance. La guía delimita lo que se evalúa; no reemplaza la documentación ni pretende explicar cada concepto desde cero.

### 2. Estudia por lagunas, no por cantidad de cursos

Elige un recurso principal que cubra el examen y complétalo con materiales específicos para las dudas que detectaste. En [AWS Skill Builder](https://aws.amazon.com/certification/certification-prep/) hay contenido gratuito, como conjuntos oficiales de preguntas y cursos de preparación, y otros materiales que requieren suscripción, como exámenes oficiales de práctica y algunos laboratorios. Comprueba las condiciones de acceso de cada actividad.

La formación no es un requisito para rendir. Un curso, un video o un certificado de finalización acredita participación según las condiciones de quien lo ofrece; la certificación AWS se obtiene al aprobar el examen supervisado.

Al cerrar cada sesión, intenta explicar el concepto sin consultar apuntes. Para cada servicio, anota qué problema resuelve, qué alternativa considerarías y qué dato del escenario justifica la elección. Si estudias arquitectura, por ejemplo, compara almacenamiento de objetos con un sistema de archivos compartido a partir de lo que necesita la aplicación.

### 3. Practica al nivel del examen

El tipo de práctica depende de la certificación. Para Cloud Practitioner, clasificar servicios y explicar sus casos de uso puede ser suficiente para muchos objetivos; no tienes que desplegar una aplicación completa para estudiar conceptos. En exámenes técnicos, suma prácticas que correspondan al rol: investigar una alarma para operaciones, corregir un permiso en desarrollo o comparar opciones de disponibilidad en arquitectura.

Si usas una cuenta de AWS para laboratorios, revisa el precio de los servicios y elimina los recursos que ya no necesites. Que un curso o laboratorio sea gratuito no implica que los servicios que despliegues en tu cuenta no generen cargos.

### 4. Convierte cada error en una pregunta de repaso

Usa preguntas de práctica para descubrir qué no entiendes. Después de responder, anota por qué elegiste esa opción y qué detalle descartó las otras. Clasifica el error: concepto desconocido, dos servicios que confundiste, requisito del escenario que pasaste por alto o respuesta que recordabas sin poder justificar.

Vuelve a estudiar ese punto y prueba con una pregunta diferente. Repetir la misma respuesta puede medir memoria de la pregunta y no comprensión del tema. Prioriza materiales que expliquen por qué una opción funciona y enlacen a referencias verificables; evita memorizar bancos que afirman contener preguntas reales del examen.

Los conjuntos de preguntas oficiales de Skill Builder sirven para conocer el estilo de examen. Un resultado alto en una práctica ayuda a encontrar avances y temas pendientes, pero no predice ni garantiza el resultado del examen real.

### 5. Decide cuándo reservar

Antes de pagar, recorre otra vez los objetivos que marcaste como pendientes. Una señal útil es poder explicar los temas principales y resolver escenarios nuevos con una razón para elegir y descartar alternativas. No necesitas acertar todas las preguntas de práctica ni completar todos los recursos disponibles.

Si todavía confundes varios conceptos, aprovecha ese diagnóstico para ajustar el estudio. Si ya puedes explicar tus decisiones, consulta la modalidad, el idioma y la disponibilidad de turnos de tu examen.

## Estudiar con recursos y comunidades en español

Los grupos de estudio permiten poner en palabras tus dudas, escuchar cómo razonan otras personas y comparar formas de resolver un problema. Lleva una pregunta concreta y comparte el recurso que consultaste; la conversación será más útil que pedir una lista genérica de “preguntas para aprobar”.

### Refuerzos por tipo de examen

- Para Cloud Practitioner, el [AWS Cloud Practitioner Challenge de AWS User Group Medellín](https://www.youtube.com/watch?v=U9KAboCim2o) tiene una sesión grabada de práctica con preguntas. Es contenido comunitario, no un examen oficial; contrasta los temas con la guía vigente.
- Si estudias fundamentos de IA y ML, esta [sesión de AWS Certification Challenge de AWS User Group Mixtli](https://www.youtube.com/watch?v=4WRBFQDJmmA) introduce esos conceptos. Es una grabación comunitaria, no material oficial de examen; úsala como explicación complementaria y verifica el alcance en la guía vigente.
- Si elegiste Solutions Architect Associate, esta [checklist de servicios y decisiones para SAA-C03](/blog/checklist-servicios-aws-esenciales-para-saa-c03/) organiza los temas por dominios, compara alternativas de arquitectura y enlaza grabaciones de un grupo de estudio de Guatemala. Fue revisada el 5 de octubre de 2026; vuelve a cotejarla con la guía oficial si AWS actualiza el examen.
- Para Developer Associate, la [experiencia de estudio de Kevin Lupera](https://dev.to/kevinlupera/domina-el-desarrollo-en-la-nube-consejos-para-la-certificacion-aws-certified-developer-associate-1n90), publicada en enero de 2025, describe cómo combinó curso, práctica y repaso de servicios. Es una referencia personal de la versión anterior: úsala para ideas de estudio, no como lista del temario DVA-C03.
- Para una primera explicación de operaciones, el artículo de AWS Community Builders sobre [CloudWatch, X-Ray y CloudTrail](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m) distingue métricas, trazas y registros. Se publicó en 2024 y no es una guía de SOA-C03; compara sus conceptos con el examen vigente.

### Comunidades y eventos donde estudiar

- [AWS Women in Cloud Buenos Aires](https://awswomenincloudba.com.ar/) organiza grupos colaborativos de estudio, mentorías, talleres y encuentros para aprender sobre cloud y prepararse para certificaciones.
- Para conocer las actividades de grupos de usuarios abiertos, consulta [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) o [AWS User Group Medellín](https://www.meetup.com/awsugmed/); cada comunidad publica sus propios encuentros y condiciones para participar.
- En el [directorio de comunidades AWS](https://dondeaprendoaws.com/comunidades/) puedes buscar grupos de usuarios y comunidades estudiantiles en otros países. Consulta la [agenda de eventos](https://dondeaprendoaws.com/eventos/) para encontrar sesiones, talleres y encuentros próximos; revisa la fecha, el idioma, la modalidad, los cupos y las condiciones de inscripción de cada organizador.

Si elegiste Cloud Practitioner, esta [selección de recursos en español para CLF-C02](/blog/recursos-en-espanol-para-certificacion-aws-cloud-practitioner/) reúne guías, cursos, grabaciones y formas de practicar por tema. Para construir un plan con materiales gratuitos, consulta también cómo [preparar una certificación AWS sin pagar cursos](/blog/certificacion-de-aws-preparacion-sin-costo/).

## Costos, formatos e inscripción

Los datos cambian según el examen y el lugar donde rindas. Verifícalos en la página oficial de la certificación y en el calendario de Pearson VUE antes de pagar.

### ¿Cuánto cuesta un examen AWS?

Según las [preguntas frecuentes de AWS Certification](https://aws.amazon.com/certification/faqs/), los exámenes Foundational y Business cuestan **100 USD**, los Associate **150 USD** y los Professional y Specialty **300 USD**. Es el precio por intento; pueden aplicarse impuestos y algunas monedas locales tienen precios publicados distintos. Comprueba el total de tu turno al registrarte.

### ¿Cuánto dura y qué formato tiene?

La duración, la cantidad de preguntas, los tipos de respuesta y la puntuación dependen del examen. Por ejemplo, AWS publica para Cloud Practitioner CLF-C02 una duración de **90 minutos** y **65 preguntas** de opción múltiple o respuesta múltiple. Revisa la ficha y la guía del examen que elegiste; no extrapoles esos datos a otra certificación.

### ¿Puedo rendir en español o desde casa?

Cada examen tiene su propia lista de idiomas. La supervisión en línea también tiene idiomas y horarios de disponibilidad propios, que no siempre coinciden con los idiomas del examen. Por ejemplo, la ficha actual de CloudOps Associate no ofrece preguntas en español, aunque sí hay supervisión en español latinoamericano para citas en línea en ciertos horarios. Comprueba ambos datos por separado en la [ficha de tu examen](https://aws.amazon.com/certification/) y en las [opciones de evaluación](https://aws.amazon.com/certification/certification-prep/testing/).

Los exámenes se programan mediante Pearson VUE, en un centro de evaluación o con supervisión en línea cuando la opción esté disponible para tu examen. Para reservar, inicia sesión en tu cuenta de AWS Certification, selecciona **Schedule New Exam**, elige **Schedule with Pearson VUE** y sigue los pasos para elegir modalidad, idioma, fecha y hora. La cuenta de certificación es distinta de una cuenta de servicios AWS. Revisa también los requisitos de identificación y las condiciones del proveedor antes de confirmar.

AWS permite reprogramar o cancelar sin cargo hasta **24 horas antes** de la cita. Dentro de ese plazo ya no puedes cambiarla; si no te presentas, puedes perder el pago. Lee las [políticas de AWS antes de rendir](https://aws.amazon.com/certification/policies/before-testing/) y el correo de confirmación de Pearson VUE.

## Preguntas frecuentes

### ¿Necesito hacer un curso oficial para certificarme en AWS?

No. AWS recomienda prepararse, pero no exige completar un curso. Elige formación si te ayuda a entender un objetivo o a practicar; comprueba si requiere pago y si corresponde a la versión vigente del examen.

### ¿Qué pasa si no apruebo el examen?

Debes esperar **14 días calendario** antes de volver a rendir. AWS no limita la cantidad de intentos, pero cada nuevo intento requiere pagar la tarifa de inscripción vigente. Consulta la política completa en las [preguntas frecuentes oficiales](https://aws.amazon.com/certification/faqs/).

### ¿El curso o simulacro me da la certificación?

No. Completar un curso o aprobar su simulacro no otorga una certificación AWS. La credencial se obtiene al aprobar el examen supervisado de la certificación elegida.

## Tu próximo paso

Elige uno de los cinco perfiles, abre su guía vigente y marca tres temas que necesitas estudiar primero. Usa esa lista para escoger tus próximas sesiones, llevar una duda a una comunidad y decidir cuándo estarás listo para reservar.
