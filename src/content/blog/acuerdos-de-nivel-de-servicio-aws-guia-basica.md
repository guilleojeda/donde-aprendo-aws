---
title: "SLA de AWS: cómo se mide la disponibilidad y cuándo aplican créditos"
description: "Cómo leer un SLA de AWS, revisar métricas y exclusiones, pedir créditos si aplican y distinguir su compromiso de los SLO de tu aplicación."
author: "guille-ojeda"
publishedAt: "2024-11-27"
publishedTimestamp: "2024-11-27T01:51:56.354Z"
modifiedTimestamp: "2026-10-05T00:15:07-03:00"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Cómo monitorear SLOs con Amazon CloudWatch"
    url: "https://dondeaprendoaws.com/blog/como-monitorear-slos-con-amazon-cloudwatch/"

---

Un **SLA de AWS** (acuerdo de nivel de servicio) define el compromiso publicado para un servicio, cómo se evalúa y qué remedio ofrece si se incumple; puede incluir un crédito condicionado a los términos del acuerdo. No garantiza que una aplicación construida con AWS esté siempre disponible: cada SLA delimita qué servicio, solicitudes, periodo y condiciones cuentan. Consulta el [índice oficial de SLA de AWS](https://aws.amazon.com/legal/service-level-agreements/) y abre el acuerdo del servicio que usas antes de aplicar un porcentaje.

La disponibilidad de un servicio medida según su SLA tampoco es lo mismo que la disponibilidad que perciben tus usuarios. Tu aplicación puede depender de varios servicios, de tu configuración, del código y de redes ajenas a AWS. Para decidir si tu operación cumple su objetivo y para determinar si un crédito es elegible, hay que mirar métricas y condiciones distintas. Si entregas archivos de S3 mediante [Amazon CloudFront](/blog/amazon-cloudfront-comprendiendo-el-cdn-de-aws/), la guía de la CDN te ayuda a distinguir el origen, la caché y la respuesta al navegador: medir S3 por sí solo no describe todo ese recorrido.

## SLA, disponibilidad, SLI y SLO: qué significa cada término

| Término | Qué describe |
| --- | --- |
| SLA | El compromiso de AWS para un servicio y las condiciones, exclusiones y créditos definidos en su acuerdo. |
| Disponibilidad medida | El resultado observado para un servicio o una aplicación, con una métrica, un alcance y un periodo concretos. |
| SLI | El indicador y la regla de cálculo usados para medir una operación, como solicitudes válidas completadas sobre solicitudes válidas recibidas. |
| SLO | El objetivo que un equipo fija para un SLI durante un intervalo, por ejemplo, el porcentaje de solicitudes que debe completarse a tiempo. |

Un SLA es contractual; un SLI es una medición y un SLO es una meta operativa. Una gráfica de CloudWatch o una prueba desde el navegador puede mostrar lo que observó tu aplicación, pero no cambia la fórmula ni el alcance que establece el SLA de AWS.

## Ejemplo concreto: qué mide el SLA de Amazon S3

El [SLA de Amazon S3](https://aws.amazon.com/s3/sla/) ilustra por qué no conviene resumir todos los servicios con una cifra genérica. El compromiso expresa que AWS usará esfuerzos comercialmente razonables para mantener disponible el servicio. El acuerdo diferencia clases de almacenamiento y define una métrica propia. Para las solicitudes de S3 Standard, el esquema de créditos empieza cuando el porcentaje de disponibilidad mensual definido por el SLA cae por debajo de **99,9 %**. Otras clases de S3 tienen umbrales distintos.

En S3, AWS calcula una tasa de error por cuenta, tipo de solicitud y clase de almacenamiento en cada intervalo de cinco minutos. Cuenta los errores internos `InternalError` y `ServiceUnavailable` frente al total de solicitudes de ese tipo en el intervalo. El porcentaje de disponibilidad mensual es 100 % menos el promedio de esas tasas de error; un intervalo sin solicitudes se considera con 0 % de errores. Por eso, no traduzcas automáticamente el 99,9 % de este SLA a una cantidad de minutos de caída: su fórmula usa errores de solicitudes, no solo minutos en los que un monitor externo vio el servicio inaccesible.

La fórmula, los recursos incluidos y el periodo cambian según el SLA. Al revisar otro servicio, busca sus definiciones en vez de reutilizar el ejemplo de S3.

## Qué cubren los créditos de servicio de S3

Una tabla agrupa solicitudes de S3 Standard, S3 Express One Zone, S3 Glacier Flexible Retrieval, S3 Glacier Deep Archive y otras solicitudes no especificadas en otra tabla. El crédito se calcula sobre los cargos pagados por la clase de almacenamiento aplicable en la región AWS afectada; para S3 Express One Zone, el alcance es la zona de disponibilidad afectada. Los tramos son:

| Disponibilidad mensual según el SLA | Crédito sobre los cargos aplicables |
| --- | ---: |
| Menos de 99,9 % y al menos 99,0 % | 10 % |
| Menos de 99,0 % y al menos 95,0 % | 25 % |
| Menos de 95,0 % | 100 % |

Ese 100 % se calcula sobre los cargos que el SLA identifica para el servicio y la clase afectados; no es un reembolso de toda la factura de AWS. El crédito se aplica a pagos futuros de S3, no equivale a una devolución en efectivo, no se transfiere a otra cuenta y solo se emite si supera USD 1. El acuerdo permite que AWS, a su discreción, aplique el crédito a la tarjeta usada para pagar el ciclo afectado. Salvo que otro acuerdo con AWS disponga algo distinto, el SLA de S3 identifica el crédito —si calificas— como remedio único y exclusivo por la falta de disponibilidad u otro incumplimiento de S3. La elegibilidad y el monto dependen de que AWS confirme el incumplimiento según sus términos.

Para S3 Intelligent-Tiering, S3 Standard-Infrequent Access, S3 One Zone-Infrequent Access y S3 Glacier Instant Retrieval, el documento usa otra escala: 10 % cuando la disponibilidad mensual es inferior a 99,0 % y al menos 98,0 %; 25 % si es inferior a 98,0 % y al menos 95,0 %; y 100 % si es inferior a 95,0 %.

Para solicitar un crédito de S3, abre un caso en AWS Support Center **antes de que termine el segundo ciclo de facturación posterior al incidente**. El caso debe incluir el asunto `SLA Credit Request`, el ciclo y la región, la fecha y hora de cada incidente reclamado y los registros de las solicitudes que lo documenten. Quita o enmascara información confidencial de los registros. Si AWS confirma que la disponibilidad mensual fue inferior al compromiso, el SLA prevé emitir el crédito dentro del ciclo de facturación siguiente al mes de confirmación. Si no presentas la solicitud y la información requerida dentro del plazo, el SLA indica que no calificas para el crédito.

Lee también las exclusiones del servicio. En el caso de S3, el compromiso no se aplica a problemas causados por factores fuera del control razonable de AWS —como fuerza mayor o problemas de acceso a Internet fuera del límite del servicio—, por acciones u omisiones del cliente, por sus equipos, software u otra tecnología, ni por una suspensión o terminación prevista en el acuerdo de AWS. Si la disponibilidad se afecta por factores que la fórmula no contempla, el SLA deja a AWS la opción de considerar esos factores y emitir un crédito a su discreción. Las exclusiones pertenecen a cada SLA: no presupongas que cualquier mantenimiento programado o error de configuración se trata igual en todos los servicios.

## Cómo definir un SLO para tu aplicación

El SLA responde qué compromiso publica AWS para un servicio; un SLO te ayuda a decidir qué experiencia debe ofrecer tu propia aplicación. Por ejemplo, un equipo de comercio electrónico podría definir el SLI como la proporción de solicitudes válidas de compra que llegan a la confirmación en menos de un segundo y fijar, como meta interna ilustrativa, que al menos 99,5 % lo logre en una ventana móvil de 30 días. El umbral y el periodo son decisiones del equipo, no una recomendación de AWS ni el SLA de un servicio.

[Amazon CloudWatch permite crear SLOs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-ServiceLevelObjectives.html) sobre disponibilidad, latencia o una métrica o expresión de CloudWatch. Application Signals ofrece una métrica estándar de disponibilidad basada en respuestas: considera `5xx` errores y trata `4xx` como respuestas correctas. Si esa regla no representa lo que significa una operación exitosa para tu producto, define un indicador propio con métricas que distingan solicitudes buenas y totales. Para profundizar en el seguimiento, continúa con [Cómo monitorear SLOs con Amazon CloudWatch](/blog/como-monitorear-slos-con-amazon-cloudwatch/).

Si una operación pasa por varios componentes, las trazas ayudan a investigar dónde se degradó una transacción concreta. El catálogo incluye una lectura de AWS Builder Center titulada [CloudWatch Transaction Search: del span al SLI sin muestrear a ciegas](https://builder.aws.com/content/3J6HsX79yjI9RdhLPwsaBSOKa5Q/cloud-watch-transaction-search-del-span-al-sli-sin-muestrear-a-ciegas), una continuación sobre el uso de spans para razonar sobre un indicador. Úsala para profundizar en observabilidad; la elegibilidad para un crédito sigue dependiendo del SLA oficial del servicio.

Mantén separados ambos registros: el SLO sirve para observar la experiencia que prometes a tus usuarios; un reclamo de SLA depende de la definición, el alcance, la evidencia y el plazo del acuerdo AWS del servicio afectado.

## Comunidades y eventos AWS para intercambiar experiencias

Si estás analizando cómo medir una operación, también puede servir contrastar decisiones y experiencias con otras personas que trabajan con AWS. En el [directorio de comunidades AWS](/comunidades/) puedes buscar grupos por país, formato y tema. En México, el perfil del [AWS User Group Querétaro](https://www.meetup.com/es-es/amazon-web-services-queretaro/) describe talleres sobre arquitectura y alta disponibilidad. Para una conversación en línea, el [grupo de Telegram de AWS User Group Caracas](https://t.me/awsCaracas) ofrece un canal comunitario. Son espacios de intercambio, no canales para presentar un reclamo contractual a AWS.

Para encontrar charlas, talleres y encuentros en línea o presenciales, consulta la [agenda de eventos AWS](/eventos/) y confirma la fecha y la inscripción en la página de cada organizador.

## Preguntas frecuentes sobre los SLA de AWS

### ¿El 99,9 % de S3 equivale a 43 minutos de caída al mes?

No necesariamente. El SLA de S3 calcula el porcentaje mensual a partir de tasas de error de solicitudes en intervalos de cinco minutos. La conversión simple a minutos supone una fórmula basada solo en tiempo indisponible, que no es la definición de este acuerdo.

### ¿Un crédito de SLA devuelve todo lo que pagué a AWS?

No. En S3 se calcula sobre los cargos de la clase de almacenamiento aplicable en la región afectada y se aplica como crédito sujeto a las condiciones del SLA. Otros servicios pueden definir otra base, otros tramos y otro procedimiento.

### ¿Un SLO de CloudWatch demuestra que AWS incumplió su SLA?

No. Un SLO mide una operación según la métrica y el intervalo que eligió tu equipo. Para saber si puedes reclamar un crédito, aplica el SLA del servicio, que define su propia métrica, exclusiones, evidencia y plazo.
