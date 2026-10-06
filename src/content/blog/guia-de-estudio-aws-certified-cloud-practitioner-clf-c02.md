---
title: "Cómo estudiar para AWS Cloud Practitioner (CLF-C02): plan de estudio y práctica"
description: "Prepara el examen CLF-C02 con los dominios oficiales, un método para practicar cada objetivo y criterios para decidir cuándo reservarlo."
author: "guille-ojeda"
publishedAt: "2024-05-04"
publishedTimestamp: "2024-05-04T02:21:52.821Z"
modifiedTimestamp: "2026-10-06T16:00:55-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-certificacion.png"
coverAlt: "Tres tarjetas de estudio con apuntes y hitos sobre un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-certificacion.png"
related:
  - title: "AWS Cloud Practitioner (CLF-C02): cómo preparar el examen en español"
    url: "https://dondeaprendoaws.com/blog/recursos-en-espanol-para-certificacion-aws-cloud-practitioner/"
  - title: "Curso AWS con certificado: qué obtienes y cómo elegir"
    url: "https://dondeaprendoaws.com/blog/aws-curso-certificado-guia-basica/"

---

Para estudiar para **AWS Certified Cloud Practitioner (CLF-C02)**, empieza por la guía oficial vigente. Convierte cada objetivo en una pregunta que puedas explicar, practica con situaciones nuevas y usa tus errores para elegir qué repasar. Reserva el examen cuando puedas justificar tus respuestas y hayas comprobado las condiciones para rendir; ningún curso ni porcentaje de un simulacro garantiza el resultado.

Al 6 de octubre de 2026, AWS publica CLF-C02 como el examen vigente de Cloud Practitioner. Comprueba de nuevo el código y la guía antes de comenzar, porque el alcance puede cambiar. Si primero necesitas elegir materiales, la [guía de recursos para Cloud Practitioner en español](/blog/recursos-en-espanol-para-certificacion-aws-cloud-practitioner/) reúne cursos, grabaciones, práctica y comunidades. Esta página se concentra en cómo estudiar con esos recursos y decidir cuándo presentarte.

## Qué evalúa CLF-C02

AWS describe Cloud Practitioner como una certificación de nivel fundacional para demostrar conocimiento general de la nube, sus servicios y su terminología. No hay requisitos previos formales para obtener una certificación de AWS. La guía plantea un perfil con hasta seis meses de exposición a AWS y recomienda conocimientos de nube, seguridad, servicios principales y economía; ese perfil es una orientación de preparación, no una condición de inscripción.

La guía vigente distribuye el contenido puntuado entre cuatro dominios:

| Dominio | Peso | Pregunta para orientar el repaso |
|---|---:|---|
| Conceptos de la nube | 24 % | ¿Qué valor de la nube responde a la necesidad que describe el caso? |
| Seguridad y cumplimiento | 30 % | ¿Qué responsabilidad conserva AWS y cuál le corresponde al cliente en este servicio? |
| Tecnología y servicios en la nube | 34 % | ¿Qué categoría de servicio resuelve el caso y por qué? |
| Facturación, precios y soporte | 12 % | ¿Se necesita estimar un gasto, analizar el uso o recibir una alerta? |

Los porcentajes corresponden al contenido puntuado, no a una fórmula para asignar horas. Tecnología tiene el mayor peso y seguridad le sigue de cerca. El dominio de facturación también cuenta aunque tenga un porcentaje menor. Consulta los objetivos y las listas de servicios dentro y fuera del alcance en la [guía oficial CLF-C02 en español](https://docs.aws.amazon.com/es_es/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html); la tabla de arriba solo resume cómo orientar el estudio.

El examen busca conocimientos generales y la selección de servicios para casos comunes. La guía deja fuera tareas como programar, diseñar arquitecturas, solucionar problemas, implementar soluciones y hacer pruebas de carga o rendimiento. No hace falta desplegar una aplicación para preparar esos objetivos. Puedes empezar con escenarios escritos y sumar laboratorios si te ayudan a entender un concepto.

## Convierte el temario en un plan personal

Abre la guía y clasifica sus enunciados en tres grupos:

- **Lo puedo explicar:** puedo responder con mis palabras y dar un ejemplo.
- **Lo reconozco, pero lo confundo:** identifico el tema, pero no sé distinguir opciones cercanas.
- **Necesito estudiarlo:** todavía no puedo explicar de qué trata ni cómo se aplica.

Agrega una evidencia breve junto a cada objetivo. “Vi una clase de IAM” registra una actividad; “puedo explicar qué parte de la seguridad administra AWS y qué parte debe proteger el cliente en este servicio” registra algo que puedes comprobar. Para ordenar prioridades, cruza el peso del dominio con la dificultad que te mostró ese diagnóstico. No conviertas el porcentaje del examen en una meta idéntica de tiempo para todas las personas: lo que ya dominas necesita menos repaso que una confusión persistente.

Puedes usar esta tabla como punto de partida:

| Objetivo que marca la guía | Comprobación propia | Próximo repaso |
|---|---|---|
| Explicar el valor de la nube | Relacionar una necesidad de demanda variable con elasticidad o agilidad | Resolver otro caso y comparar los beneficios posibles |
| Comprender el modelo de responsabilidad compartida | Explicar qué responsabilidades de seguridad corresponden a AWS y cuáles conserva el cliente según el servicio | Revisar el objetivo oficial y explicar el caso con un servicio distinto |
| Reconocer servicios para casos comunes | Elegir una categoría para almacenar objetos, ejecutar código o guardar datos | Comparar dos opciones y justificar por qué una responde mejor al escenario |
| Entender costos, economía y facturación | Distinguir estimar una carga planeada, analizar costos y uso, y seguir un presupuesto | Explicar cuándo usar Pricing Calculator, Cost Explorer o AWS Budgets |

Son ejemplos de trabajo, no una lista completa del examen. Para verificar la diferencia entre herramientas de costos, consulta la documentación de AWS sobre [estimaciones con Pricing Calculator](https://docs.aws.amazon.com/es_es/cost-management/latest/userguide/pricing-calculator.html), [análisis con Cost Explorer](https://docs.aws.amazon.com/es_es/cost-management/latest/userguide/ce-what-is.html) y [seguimiento con AWS Budgets](https://docs.aws.amazon.com/es_es/cost-management/latest/userguide/budgets-managing-costs.html).

## Estudia cada objetivo con un ciclo breve

Repite este ciclo para las tareas que marcaste como pendientes:

1. **Elige un objetivo concreto.** Por ejemplo, comparar dos categorías de almacenamiento para un caso.
2. **Estudia una explicación.** Usa el curso, la documentación o la grabación que responda a esa duda. Si es una grabación antigua, toma de ella los conceptos y confirma nombres, precios y condiciones actuales con AWS.
3. **Cierra el material y recuerda.** Explica la idea sin mirar apuntes; después abre la guía o documentación y corrige lo que faltó.
4. **Resuelve un escenario distinto.** Di qué opción elegirías, qué dato del caso te llevó a hacerlo y por qué descartarías las alternativas cercanas.
5. **Guarda el error útil.** Anota la diferencia que te hizo cambiar de respuesta y vuelve a probar el concepto más adelante con otra pregunta.

No repitas una serie completa cada vez que aparezca una laguna. Busca la explicación de ese objetivo y úsala para resolver un caso nuevo. Si la respuesta solo te resulta familiar porque viste la misma pregunta, todavía no comprobaste que puedas aplicar el concepto.

## Usa preguntas de práctica para detectar lagunas

AWS recomienda familiarizarse primero con el formato mediante su **conjunto oficial de 20 preguntas de práctica**, disponible gratis en Skill Builder. El examen oficial de práctica completo y preguntas adicionales requieren una suscripción. Revisa la [oferta actual de preparación de AWS](https://aws.amazon.com/es/certification/certification-prep/) antes de elegir una actividad: AWS describe allí qué incluye cada opción. Para una persona que estudia por su cuenta, AWS recomienda iniciar sesión con un AWS Builder ID; también existen opciones de acceso para organizaciones y partners. El Builder ID es un perfil personal gratuito, distinto de la suscripción a Skill Builder y de la cuenta de AWS donde se crean recursos facturables. Consulta las [preguntas frecuentes de AWS Training](https://aws.amazon.com/es/training/faqs/) y la explicación de [AWS Builder ID](https://docs.aws.amazon.com/es_es/signin/latest/userguide/sign-in-builder-id.html) si no sabes qué acceso necesitas.

Para practicar en español latinoamericano, [CloudPrep: AWS en práctica](https://thomassr30.github.io/cloudprep-clf-es/) ofrece preguntas originales, explicaciones y referencias. Su [repositorio público](https://github.com/thomassr30/cloudprep-clf-es) describe un simulacro de 65 preguntas y 90 minutos; declara que el material es independiente de AWS y que el banco se revisó el 19 de septiembre de 2026. Sus resultados sirven para encontrar temas que conviene repasar. Su porcentaje no es la puntuación escalada de AWS ni predice si aprobarás.

También puedes escuchar otra forma de razonar preguntas en la grabación de [AWS User Group Medellín: práctica con preguntas de examen](https://www.youtube.com/watch?v=U9KAboCim2o), una sesión de su Cloud Practitioner Challenge. Es una explicación comunitaria; úsala para poner a prueba tus argumentos y vuelve a la guía cuando una afirmación dependa del alcance vigente.

Cuando revises una respuesta, registra algo más que “correcta” o “incorrecta”:

| Resultado | Qué revisar |
|---|---|
| Acierto con explicación | Comprueba que también puedas aplicarlo a otro escenario |
| Acierto por recordar la opción | Busca una pregunta nueva sobre el mismo objetivo |
| Error entre dos servicios | Escribe la necesidad que resuelve cada uno y vuelve a compararlos |
| Error por un detalle del caso | Subraya qué condición cambia la decisión |
| Duda sobre un dato actual | Contrástalo con la guía o documentación oficial |

AWS informa el resultado en una escala de 100 a 1000. La puntuación mínima de aprobación de CLF-C02 es 700 y AWS usa una puntuación escalada; 700 no significa que haya una conversión fija de 70 % de aciertos. El modelo es compensatorio, así que no necesitas aprobar cada dominio por separado. Usa los resultados por dominio para localizar lagunas, no para inventar un puntaje mínimo personal que AWS no publica.

## Decide cuándo reservar

No existe un número de horas, una cantidad de preguntas acertadas o un porcentaje comunitario que garantice la aprobación. Antes de reservar, comprueba estas señales:

- Puedes explicar los objetivos de la guía que más te costaban sin depender de una respuesta memorizada.
- Resuelves preguntas nuevas y justificas tanto la opción elegida como las alternativas que descartas.
- Volviste a revisar las lagunas recurrentes en los cuatro dominios, prestando atención a su peso y a tus dificultades.
- Conoces el formato, el idioma y la modalidad disponibles para tu cita; el costo y los requisitos encajan con tu plan.

AWS recomienda evaluar la preparación con su examen oficial de práctica, que requiere suscripción. Si decides hacerlo, úsalo como una señal adicional y como oportunidad para practicar con una puntuación escalada; el resultado no puede garantizar el del examen supervisado. Repetir el mismo banco puede medir memoria, así que combina los resultados con tu capacidad de explicar objetivos y aplicar conceptos a casos nuevos.

## Formato, costo y condiciones del examen

Confirma estos datos en las [páginas oficiales de Cloud Practitioner](https://aws.amazon.com/es/certification/certified-cloud-practitioner/) y de [políticas para candidatos](https://aws.amazon.com/es/certification/policies/before-testing/), porque los precios, la disponibilidad de citas y las condiciones pueden cambiar.

| Dato | Información publicada por AWS |
|---|---|
| Versión | CLF-C02, según la guía vigente consultada |
| Duración y preguntas | 90 minutos y 65 preguntas; hay preguntas de opción única y de respuesta múltiple |
| Preguntas que puntúan | 50 afectan la puntuación; 15 no tienen puntaje y no se identifican durante el examen |
| Preguntas sin responder | Se califican como incorrectas; no hay penalización por adivinar |
| Aprobación | 700 puntos en una escala de 100 a 1000; la puntuación es escalada |
| Idiomas del examen | Incluye español de América Latina y español de España |
| Modalidad | Centro Pearson VUE o examen supervisado en línea |
| Precio de referencia | 100 USD por intento para el nivel fundacional; pueden aplicarse impuestos y el precio local puede variar |
| Vigencia | La certificación es válida durante tres años desde la fecha en que se obtiene |

AWS no exige completar un curso ni presentar experiencia laboral como requisito previo. Para reservar, crea o usa una cuenta de AWS Certification siguiendo las [instrucciones vigentes para candidatos](https://aws.amazon.com/es/certification/policies/before-testing/). AWS indica que el acceso se configura con un ID de creador de AWS (AWS Builder ID) y que la cuenta de certificación es independiente de la cuenta donde creas servicios de AWS. Al rendir, tendrás que presentar una identificación oficial válida; los documentos aceptados dependen de tu residencia y de si eliges un centro o supervisión en línea. Revisa los requisitos y la confirmación de Pearson VUE antes de la cita.

AWS ofrece adaptaciones razonables para personas con discapacidades documentadas, coordinadas con el proveedor del examen. Deben solicitarse antes de programar cada examen. Si rindes en inglés y no eres hablante nativo, puedes solicitar la adaptación ESL +30, que agrega 30 minutos; revisa los pasos y condiciones en la política vigente.

Si no apruebas, AWS pide esperar 14 días calendario antes de volver a rendir y cobra el precio completo por cada intento, según su [política posterior al examen](https://aws.amazon.com/es/certification/policies/after-testing/). La certificación dura tres años desde que la obtienes; cuando se acerque el vencimiento, confirma en tu cuenta las opciones que AWS ofrezca entonces para mantenerla activa. Un curso puede acompañar tu preparación y entregar su propio certificado de finalización, pero la AWS Certification se obtiene al aprobar el examen supervisado. Para distinguir esos documentos, consulta [qué recibes al terminar un curso de AWS](/blog/aws-curso-certificado-guia-basica/).

## Estudia acompañado y sigue actividades

Compartir una duda concreta ayuda a recibir respuestas que puedas aplicar: lleva el objetivo que estudiaste, el escenario y la opción que te resultó difícil. Si aprendes mejor con otras personas, **AWS Women in Cloud Buenos Aires** publica grupos de estudio colaborativos para certificaciones, mentoría, talleres y actividades en su [sitio comunitario](https://awswomenincloudba.com.ar/). Su página dirige a Meetup para ver encuentros; confirma allí la fecha, la modalidad y las condiciones para participar.

Para conversar sobre AWS y encontrar eventos de una comunidad general, revisa el [AWS User Group Medellín en Meetup](https://www.meetup.com/awsugmed/). Su página presenta reuniones y actividades del grupo; los temas, horarios y cupos pertenecen a cada convocatoria. También puedes buscar otros grupos en el [directorio de AWS User Groups](/comunidades/user-groups/) y consultar la [agenda de eventos AWS en Latinoamérica](/eventos/) para encontrar sesiones en línea o presenciales.

Como complemento grabado, AWS Girls Argentina publicó el [Cloud Practitioner Challenge — Exam Prep](https://www.youtube.com/watch?v=6RajcfoPy6Q) el 23 de julio de 2025. Es una sesión de comunidad, no una guía oficial del examen; úsala para escuchar un enfoque de preparación y contrasta cualquier dato cambiante con CLF-C02. AWS Girls Argentina explica en su [grupo de Meetup](https://www.meetup.com/aws-girls-argentina/) que comparte próximos eventos, cursos y talleres; el grupo se orienta a conectar mujeres interesadas en formarse y compartir conocimientos de AWS.

## Preguntas frecuentes

### ¿Necesito experiencia o terminar un curso para presentar CLF-C02?

AWS no establece requisitos previos formales ni obliga a completar un curso. La guía describe el conocimiento recomendado y el perfil de candidato para ayudarte a medir tu preparación. Terminar una formación no sustituye el examen supervisado.

### ¿Cuántas horas debo estudiar?

No hay una duración universal que asegure el resultado. Usa los objetivos que todavía no puedes explicar, tus errores en preguntas nuevas y el tiempo que tengas disponible para decidir el ritmo.

### ¿Un 70 % en un simulacro significa que voy a aprobar?

No. AWS informa el examen mediante una puntuación escalada, y los simulacros independientes tienen su propia selección y dificultad. Interpreta cada resultado como una pista sobre qué tema repasar.

### ¿Tengo que crear una cuenta de AWS para estudiar?

No necesitas una cuenta de servicios de AWS para consultar la guía, ver grabaciones o practicar en CloudPrep. Para usar Skill Builder, inicia sesión con el método disponible para ti; AWS recomienda Builder ID para particulares. No hace falta desplegar servicios para estudiar los objetivos de CLF-C02. Si aun así practicas con recursos de una cuenta de AWS, revisa antes los precios y lo que puede generar cargos.
