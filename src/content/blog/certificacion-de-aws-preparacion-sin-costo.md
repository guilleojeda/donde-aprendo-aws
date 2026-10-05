---
title: "Cómo preparar una certificación AWS sin pagar cursos"
description: "Organiza tu preparación para una certificación AWS con materiales gratuitos: diagnóstico, objetivos de estudio, práctica, repaso y condiciones para reservar el examen."
author: "guille-ojeda"
publishedAt: "2024-01-28"
publishedTimestamp: "2024-01-28T23:43:20.471Z"
modifiedTimestamp: "2026-10-05T20:31:27-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-certificacion.png"
coverAlt: "Tres tarjetas de estudio con apuntes y hitos sobre un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-certificacion.png"
related:
  - title: "Materiales gratuitos para certificaciones AWS en español"
    url: "https://dondeaprendoaws.com/blog/certificacion-aws-gratis-materiales-de-estudio/"
  - title: "Qué certificación AWS elegir primero según tu experiencia"
    url: "https://dondeaprendoaws.com/blog/aws-curso-certificado-guia-de-inicio/"
---

**Puedes preparar una certificación AWS sin comprar cursos si organizas el estudio alrededor de la guía oficial, trabajas tus lagunas y compruebas lo aprendido.** El presupuesto de preparación es distinto del costo del examen: ni terminar un curso ni usar recursos gratuitos paga automáticamente la inscripción.

Este plan sirve para convertir los materiales disponibles en tareas concretas. No fija un número de semanas ni promete que aprobarás al terminarlo. El tiempo depende del examen, de lo que ya sabes y de cuánto necesites practicar.

## 1. Define qué quieres demostrar

Antes de abrir una playlist, escribe un objetivo: «quiero entender las conversaciones sobre nube de mi equipo», «quiero desarrollar aplicaciones en AWS» o «quiero diseñar soluciones y justificar sus decisiones». Esa diferencia evita estudiar para una credencial que no responde a tu necesidad.

Si todavía no elegiste, consulta [qué certificación AWS estudiar primero](/blog/aws-curso-certificado-guia-de-inicio/). AWS [no exige cursos ni certificaciones previas](https://aws.amazon.com/es/certification/policies/before-testing/) para presentarte: Cloud Practitioner puede ser útil para empezar, pero no es un requisito para rendir un Associate.

Una vez que elijas, abre la guía desde el [índice oficial de guías de examen](https://docs.aws.amazon.com/aws-certification/latest/examguides/). Anota su código y comprueba que tus recursos correspondan a esa versión. Una actualización puede cambiar el alcance aunque el nombre de la certificación siga siendo parecido.

## 2. Haz un diagnóstico antes de estudiar todo

Recorre las tareas de cada dominio y clasifícalas: **puedo explicarla**, **la reconozco pero confundo detalles** o **necesito aprenderla**. Agrega un ejemplo que justifique la clasificación. «Vi un video sobre IAM» describe una actividad; «puedo explicar cuándo una aplicación usa un rol» describe conocimiento.

Puedes usar una tabla sencilla:

| Tema u objetivo | Qué puedo explicar hoy | Qué falta | Próxima tarea |
|---|---|---|---|
| Almacenamiento | Distingo objetos de bloques | Cuándo usar almacenamiento de archivos | Ver una explicación de S3, EBS y EFS y comparar dos casos |
| Seguridad | Sé qué significa responsabilidad compartida | Cómo cambia según el servicio | Contrastar EC2 y un servicio administrado en la documentación |
| Costos | Conozco herramientas de facturación | Confundo análisis de gasto con alertas | Comparar Cost Explorer y AWS Budgets con un ejemplo |

Las filas son ejemplos de estudio, no una lista completa del temario. Para un Associate añade las tareas propias de su rol, como desplegar, depurar, diseñar o monitorear según la guía. Prioriza la combinación de importancia en el examen y dificultad personal; no asignes el mismo tiempo a lo que ya dominas y a lo que nunca usaste.

## 3. Elige una base y complementos pequeños

Usa **un recorrido principal**, oficial o comunitario, y añade materiales para las lagunas detectadas. Puedes encontrar opciones por necesidad en la [selección de materiales gratuitos en español](/blog/certificacion-aws-gratis-materiales-de-estudio/).

Por ejemplo, para Cloud Practitioner puedes empezar con [AWS Cloud Practitioner Essentials](https://aws.amazon.com/es/training/course-descriptions/cloud-practitioner-essentials/) o las [grabaciones del Challenge de Medellín](https://www.youtube.com/playlist?list=PLhbdvasxz8wwO-b9nlRBYYzY6n5CvSOvj). Un curso introductorio puede ordenar conceptos generales; si elegiste otra certificación, añade formación y práctica que correspondan a sus objetivos.

Reserva una sesión de estudio para producir algo comprobable:

1. Elige una tarea de la guía y una pregunta que quieras responder.
2. Lee o mira el recurso que la explica.
3. Cierra el material y explica la respuesta con tus palabras.
4. Resuelve un caso o realiza una práctica pertinente.
5. Registra qué salió bien y qué debes volver a consultar.

Si no puedes explicar una idea, busca otra explicación de ese tema. Volver a empezar una serie completa suele dejar el mismo vacío sin identificar.

## 4. Comprueba conceptos antes de desplegar

La práctica debe corresponder a la profundidad del examen. En [Cloud Practitioner, la programación y la implementación quedan fuera del alcance](https://docs.aws.amazon.com/es_es/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html). Puedes trabajar muchos objetivos comparando escenarios, sin crear infraestructura.

Un ejercicio útil es este: una tienda tiene fotografías de productos y registros de pedidos. Explica por qué el almacenamiento de objetos y una base de datos cumplen funciones distintas. Después, cambia el caso: una aplicación necesita acceder a archivos compartidos. Revisa si tu elección seguiría siendo adecuada y qué información adicional necesitas.

Para certificaciones técnicas, añade prácticas acordes con las tareas evaluadas. En desarrollo, por ejemplo, comprueba cómo una aplicación obtiene permisos y cómo localizar un fallo; en operaciones, interpreta métricas y registros; en arquitectura, compara alternativas frente a disponibilidad, seguridad y costo. Guarda el resultado y el motivo de tus decisiones, además de la lista de pasos.

Si quieres practicar sin una cuenta personal de infraestructura, [AWS Educate](https://aws.amazon.com/education/awseducate/) ofrece laboratorios iniciales gratuitos sin tarjeta de crédito. No cubren automáticamente todas las prácticas de una certificación técnica. Si usas tu propia cuenta, revisa [planes y límites del AWS Free Tier](/blog/aws-free-tier-guia-para-principiantes-2024/) antes de desplegar, estima el consumo y elimina los recursos que ya no necesites. Que la guía o el video sea gratuito no vuelve gratuito el despliegue.

## 5. Usa las preguntas para investigar errores

Empieza con el [conjunto oficial de preguntas de tu examen](https://aws.amazon.com/es/certification/certification-prep/). Es una muestra para conocer su estilo. El examen oficial de práctica completo es una actividad distinta que requiere suscripción; comprueba el acceso antes de incluirlo en un plan sin compras.

Después de cada respuesta, anota el concepto que te llevó a elegirla. Un registro breve alcanza:

| Qué ocurrió | Qué conviene hacer |
|---|---|
| Acerté y puedo explicar cada alternativa | Prueba otro escenario del mismo tema |
| Acerté porque recordaba la respuesta | Comprueba el concepto con una pregunta nueva |
| Fallé por confundir dos servicios | Escribe su diferencia y un caso de uso para cada uno |
| Fallé por una condición que no leí | Relee el escenario y explica cómo esa condición cambia la elección |
| No entiendo la explicación | Busca su fuente oficial y lleva la duda concreta a una comunidad |

No conviertas el porcentaje de un banco comunitario en una predicción de la nota oficial. AWS usa puntuaciones escaladas y cada material tiene su propia dificultad y cobertura. Resolver varias veces las mismas preguntas mide también memoria; busca escenarios nuevos cuando sea posible.

## 6. Lleva una duda concreta a una comunidad

El [AWS User Group Medellín](https://www.meetup.com/awsugmed/) y [AWS Guatemala](https://www.meetup.com/aws-guatemala/) publican actividades y grabaciones de estudio. Para seguir explicaciones de servicios, puedes visitar los canales de [AWS UG Medellín](https://www.youtube.com/@awsugmed) y [AWS User Group Guatemala](https://www.youtube.com/@awsugguatemala). Comprueba cuándo se grabó una sesión y coteja los detalles cambiantes con AWS.

Una pregunta como «sé que CloudWatch maneja métricas, pero no entiendo cuándo necesito CloudTrail para investigar actividad» permite una conversación más útil que «¿qué estudio para aprobar?». Incluye lo que consultaste y cuál es la parte que aún no puedes explicar.

Busca encuentros en la [agenda de eventos](/eventos/), donde puedes abrir cada convocatoria original. Como ejemplo, **[Más allá de la certificación, de AWS Tech Girls](https://www.meetup.com/aws-tech-girls/events/316766139/)** está anunciado para el **29 de octubre de 2026, de 17:30 a 20:30 (GMT-6)**, presencial en Puerta Polanco, Ciudad de México. Cierra una ruta de AI Practitioner y la convocatoria lo dirige a cualquier persona interesada en nube, IA y comunidad. Para acceder al edificio pide registro con nombre real e identificación; confirma la inscripción y los cupos antes de asistir.

## 7. Reserva cuando tu preparación tenga evidencia

Antes de pagar, vuelve a la guía. Revisa especialmente las tareas que marcaste como pendientes, las confusiones repetidas y las preguntas nuevas que todavía no puedes justificar. Haber terminado un curso es un hito de estudio, pero no demuestra por sí solo que cubras el examen.

Confirma también el [precio, los impuestos y las condiciones aplicables](https://aws.amazon.com/es/certification/policies/before-testing/). Un descuento solo entra en tu presupuesto cuando tienes un beneficio válido para el examen y la fecha elegidos.

AWS ofrece [centros Pearson VUE y supervisión en línea](https://aws.amazon.com/certification/certification-prep/testing/). Comprueba por separado el idioma del examen y el de la supervisión, además de la identificación y los requisitos técnicos. Si eliges rendir en línea, realiza la prueba del sistema que indica el proveedor antes de la cita.

## Preguntas frecuentes

### ¿Cuántas horas necesito para aprobar una certificación AWS?

No hay una cantidad que garantice el resultado. Usa los objetivos de la guía y tus errores para decidir qué estudiar. El tiempo de un curso describe su contenido, no todas las horas de repaso y práctica que necesitarás.

### ¿Necesito pagar un curso para rendir?

No es obligatorio. Puedes construir la preparación con recursos gratuitos. Una formación de pago es una opción si resuelve una necesidad concreta de explicación, práctica o acompañamiento; pagarla no garantiza aprobar.

### ¿Tengo que terminar Cloud Practitioner antes de preparar un Associate?

No. Si te faltan fundamentos, estúdialos primero; puedes hacerlo sin rendir un examen intermedio. Si ya trabajas en un rol técnico, compara directamente tus conocimientos con la guía del Associate que corresponda.

### ¿Qué hago si fallo muchas preguntas del mismo tema?

Detén ese bloque de preguntas y vuelve al concepto. Busca una explicación y un caso diferente, comprueba la documentación y explica qué cambió en tu razonamiento. Luego prueba otra pregunta: repetir inmediatamente la misma puede ocultar la laguna.
