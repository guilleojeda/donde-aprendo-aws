---
title: "Diferencia entre SLA y SLO en AWS: SLI y presupuesto de error"
description: "Distingue el SLA de AWS del SLO de tu aplicación: define un SLI, calcula el presupuesto de error y aprende a medirlo con CloudWatch Application Signals."
author: "guille-ojeda"
publishedAt: "2025-01-20"
publishedTimestamp: "2025-01-20T00:15:06.029Z"
modifiedTimestamp: "2026-10-06T13:57:53-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "SLA de AWS: cómo se mide la disponibilidad y cuándo aplican créditos"
    url: "https://dondeaprendoaws.com/blog/acuerdos-de-nivel-de-servicio-aws-guia-basica/"
  - title: "Cómo crear SLOs en AWS con CloudWatch Application Signals"
    url: "https://dondeaprendoaws.com/blog/como-monitorear-slos-con-amazon-cloudwatch/"
---

El **SLA de un servicio de AWS** describe el compromiso publicado para ese servicio y las condiciones que se aplican si no se cumple. El **SLO de tu aplicación** es una meta que defines para la experiencia de una operación, durante una ventana concreta. Para medirla necesitas un **SLI**: un indicador con una regla clara sobre qué cuenta como resultado correcto.

Son niveles distintos. Que un servicio de AWS cumpla su SLA no demuestra que tu aplicación atendió bien a sus usuarios: también influyen el código, la configuración, las dependencias y el recorrido completo de una solicitud.

## SLA, SLI y SLO: diferencias

| Término | Qué describe | Ejemplo |
| --- | --- | --- |
| **SLI** (indicador de nivel de servicio) | Una medición y su regla de cálculo, con un alcance y una ventana definidos. | Solicitudes válidas de compra que terminaron con un pedido confirmado ÷ total de solicitudes válidas. |
| **SLO de aplicación** (objetivo de nivel de servicio) | La meta que el equipo fija para un SLI durante un intervalo. Por sí sola, no es un acuerdo contractual. | Que al menos el 99,9 % de las solicitudes válidas de compra termine correctamente en una ventana móvil de 30 días. |
| **SLO publicado por AWS** | Un objetivo publicado para el servicio de AWS al que se refiere. No sustituye el objetivo de tu aplicación. | Un objetivo de AWS para una operación o métrica de un servicio concreto. |
| **SLA de AWS** (acuerdo de nivel de servicio) | Los términos aplicables a un servicio: alcance, medición, exclusiones y el remedio que corresponda si se cumplen las condiciones. | El acuerdo de disponibilidad publicado para Amazon S3. |

Si trabajas con registros estructurados, la lectura en español [Observabilidad desde los logs: cómo construir SLIs sin esperar a instrumentar el código](https://builder.aws.com/content/3IlpApiKwsNpk6eWH4T0NdgFfkf/observabilidad-desde-los-logs-como-construir-slis-sin-esperar-a-que-alguien-instrumente-el-codigo) explora cómo obtener indicadores de esas señales. Si tu aplicación ya emite trazas, [CloudWatch Transaction Search: del span al SLI sin muestrear a ciegas](https://builder.aws.com/content/3J6HsX79yjI9RdhLPwsaBSOKa5Q/cloud-watch-transaction-search-del-span-al-sli-sin-muestrear-a-ciegas) ofrece otro camino: relaciona los spans de una transacción con el indicador y ayuda a investigar demoras que el promedio puede ocultar.

AWS publica acuerdos y objetivos de servicio por servicio; no hay un único porcentaje que describa la disponibilidad de todos los servicios AWS. Consulta el [índice oficial de SLA](https://aws.amazon.com/legal/service-level-agreements/) y los documentos del servicio concreto. AWS explica también la diferencia entre [sus SLA y los SLO que publica para sus servicios](https://aws.amazon.com/what-is/sla/).

## Ejemplo: un SLO para una operación de compra

Supongamos que quieres medir `POST /checkout`. Primero define qué significa que una solicitud salió bien. Una opción es contar como buena una solicitud válida que termina con un pedido confirmado y persistido; el total debe incluir las solicitudes válidas del mismo recorrido. Esas condiciones forman parte del SLI. Si un rechazo de pago cuenta como un intento fallido para el negocio, no lo excluyas solo porque la respuesta técnica fue HTTP 4xx.

Como **ejemplo ilustrativo**, podrías fijar estos objetivos para los últimos 30 días móviles:

- Al menos el **99,9 %** de las solicitudes válidas completa la compra correctamente.
- Al menos el **99 %** de las solicitudes válidas responde en **400 ms o menos**.

Son dos SLI distintos —resultado correcto y latencia— y dos SLO. Los porcentajes, el umbral y la ventana no son recomendaciones universales de AWS: el equipo debe elegirlos según la experiencia que necesita el usuario, los datos observados y el costo de una degradación. Para contrastar decisiones de arquitectura y disponibilidad, el perfil del [AWS User Group Querétaro](https://www.meetup.com/es-es/amazon-web-services-queretaro/) describe talleres sobre diseño en AWS y alta disponibilidad.

### Cómo interpretar el presupuesto de error

El presupuesto depende de cómo definiste el indicador:

- Para un SLO **basado en solicitudes**, el presupuesto de solicitudes malas es `(1 − objetivo) × solicitudes totales`. Con una meta de 99,9 % y un millón de solicitudes válidas en la ventana, el presupuesto es `0,001 × 1.000.000 = 1.000` solicitudes malas.
- Para un SLO **basado en tiempo**, una disponibilidad del 99,9 % en una ventana de exactamente 30 días permite `0,001 × 30 × 24 × 60 = 43,2` minutos —43 minutos y 12 segundos— de tiempo no disponible. Esa conversión solo aplica si el indicador y la regla del objetivo miden tiempo; no convierte automáticamente un presupuesto de solicitudes en minutos.

El presupuesto ayuda a decidir cuándo investigar, frenar cambios o priorizar confiabilidad. Una alarma de *burn rate* avisa si el ritmo de errores puede agotar ese presupuesto antes de que termine el intervalo. El equipo debe escoger ventanas y umbrales que conduzcan a una acción útil, no solo a más notificaciones. Para ampliar el contexto de operaciones y SRE, puedes ver la grabación [Track DevOps & SRE - AWS Community Day Arg](https://www.youtube.com/watch?v=JekD-szbhYg), publicada por el canal AWS Girls Argentina. Es una charla de la comunidad sobre DevOps y SRE; no se presenta como tutorial específico de SLOs.

## Por qué el SLA de AWS no equivale al SLO de tu aplicación

Cada SLA define qué servicio cubre, qué solicitudes o recursos cuentan, cómo se calcula el resultado, qué exclusiones aplican y cómo solicitar el remedio previsto. Por ejemplo, el [SLA de Amazon S3](https://aws.amazon.com/s3/sla/) calcula el porcentaje mensual a partir de tasas de error de solicitudes en intervalos de cinco minutos; su fórmula no es simplemente el tiempo que una aplicación completa estuvo inaccesible. El documento además define clases, tramos de crédito, exclusiones y un procedimiento de solicitud. Esas condiciones son propias de ese SLA y no se trasladan a otros servicios.

Por eso, una gráfica de CloudWatch, un SLO de la aplicación o una alarma que se activó no prueban por sí solos que AWS incumplió su SLA ni que corresponda un crédito. Para ese análisis hay que usar el acuerdo vigente del servicio y seguir sus definiciones, exclusiones, evidencia y plazo. La [guía sobre cómo medir un SLA de AWS y cuándo aplican créditos](/blog/acuerdos-de-nivel-de-servicio-aws-guia-basica/) desarrolla el ejemplo de S3.

Tampoco un SLA de un componente equivale a la disponibilidad de todo el workload ni certifica que cumpla automáticamente un requisito normativo. AWS Well-Architected define disponibilidad desde la función que la carga de trabajo debe cumplir y recomienda considerar los objetivos y dependencias de la carga; revisa la guía de [disponibilidad en el pilar de confiabilidad](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/availability.html).

## Medir un SLO con CloudWatch Application Signals

[CloudWatch Application Signals permite crear SLOs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-ServiceLevelObjectives.html) para operaciones y dependencias detectadas. Puedes usar sus métricas estándar de `Availability` y `Latency`, o una métrica o expresión de CloudWatch. La evaluación puede basarse en períodos o en solicitudes, con intervalos de calendario o móviles.

Revisa la definición antes de adoptar una métrica estándar como SLI: la disponibilidad de Application Signals cuenta las respuestas 5xx como fallos y las respuestas 4xx como exitosas. Si un 4xx representa una compra rechazada que tu producto debe medir como error, crea un indicador propio que represente ese resultado de negocio. Una alarma sobre un contador de errores tampoco es por sí sola un SLO: faltaría declarar la meta, el alcance y el intervalo.

Si no aparece una operación para elegir, confirma que Application Signals recibe telemetría de la aplicación y que la operación tuvo actividad reciente. En los flujos de creación de SLO para operaciones, CloudWatch documenta que los selectores incluyen las operaciones activas durante las últimas 24 horas. También puedes crear un SLO a partir de una métrica de CloudWatch o una expresión de Metric Math. Para ver los requisitos, un ejemplo completo y cómo investigar datos ausentes, continúa con [Cómo crear SLOs en AWS con CloudWatch Application Signals](/blog/como-monitorear-slos-con-amazon-cloudwatch/).

Si una operación continúa entre varios servicios, conserva un identificador de negocio o de correlación para relacionar sus resultados. La guía de [correlación de eventos con EventBridge y CloudWatch](/blog/estrategias-de-correlacion-de-eventos-aws/) muestra cómo seguir un pedido sin confundir eventos, reintentos y operaciones completadas.

## Recursos, comunidades y eventos AWS

El [directorio de AWS User Groups en Latinoamérica](/comunidades/user-groups/) permite buscar comunidades por país y tema. Son espacios para aprender e intercambiar experiencias sobre cómo diseñar y operar aplicaciones.

La [agenda de eventos AWS](/eventos/) reúne encuentros de comunidades en línea, presenciales e híbridos, con filtros por país, ciudad, grupo y fecha. Los temas y las condiciones de inscripción varían por evento: confirma los detalles en la ficha del organizador.

## Preguntas frecuentes

### ¿Un SLO de CloudWatch demuestra que AWS incumplió un SLA?

No. El SLO mide la operación de tu aplicación según el indicador, la meta y el intervalo que elegiste. La elegibilidad para cualquier remedio se determina con el SLA del servicio, sus métricas y sus condiciones.

### ¿El 99,9 % siempre equivale a 43 minutos de caída al mes?

No. Esa cifra corresponde a un indicador basado en tiempo y una ventana exacta de 30 días. Si el objetivo se basa en solicitudes, el presupuesto se calcula sobre solicitudes buenas y malas, no sobre minutos.

### ¿Qué hago si la métrica de Application Signals no representa el resultado del usuario?

Define un SLI propio con los eventos que sí representen ese resultado. Por ejemplo, si un HTTP 4xx significa que la compra no se completó, no uses sin ajustes una métrica que lo trata como respuesta exitosa.
