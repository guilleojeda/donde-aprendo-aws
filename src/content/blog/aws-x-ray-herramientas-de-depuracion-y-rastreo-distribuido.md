---
title: "AWS X-Ray: trazas, diagnóstico y OpenTelemetry"
description: "Guía actualizada de AWS X-Ray: segmentos, diagnóstico de trazas, Lambda, permisos, muestreo y transición recomendada a OpenTelemetry."
author: "guille-ojeda"
publishedAt: "2024-05-07"
publishedTimestamp: "2024-05-07T05:49:02.026Z"
modifiedTimestamp: "2026-10-05T23:42:46Z"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS Lambda: cómo funciona, invocaciones y concurrencia"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/"
---

AWS X-Ray recibe y analiza trazas distribuidas para mostrar por qué una solicitud se demoró o falló al pasar por una aplicación y sus dependencias. La consola puede mostrar una vista de servicios y los detalles de cada solicitud. Para instrumentar aplicaciones nuevas, AWS recomienda OpenTelemetry (OTel) y ofrece su distribución AWS Distro for OpenTelemetry (ADOT).

Hay una diferencia importante entre el servicio y sus componentes de instrumentación: **AWS X-Ray sigue siendo un destino activo para las trazas; sus SDK y daemon entraron en modo de mantenimiento el 25 de febrero de 2026**. Desde esa fecha AWS limita sus versiones a correcciones de seguridad, sin mejoras nuevas, y recomienda migrar la instrumentación a OpenTelemetry. El [cronograma vigente de soporte](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-daemon-timeline.html) no indica una fecha de fin para ese modo; la [guía de migración a OpenTelemetry](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html) explica las alternativas.

## Qué registra AWS X-Ray

Una **traza** reúne las partes observadas de una solicitud. Un **segmento** describe el trabajo que hizo un servicio al recibirla; sus **subsegmentos** pueden detallar llamadas a otra API, una base de datos o un servicio de AWS. X-Ray relaciona los segmentos con un identificador de traza y presenta la secuencia en la vista de trazas. Así puedes comparar la duración de cada parte y localizar el tramo que concentra la latencia o el error.

En OpenTelemetry, esas unidades de trabajo se llaman *spans*. Al exportarlas a X-Ray, los *spans* de servidor se convierten en segmentos y otros *spans* en subsegmentos. Los atributos de OTel se guardan como metadatos por defecto; si quieres filtrar trazas por un campo, configúralo como anotación indexada según la [guía de migración](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html).

La relación entre servicios depende de que la instrumentación propague el contexto de la traza entre cada salto. X-Ray usa el encabezado `X-Amzn-Trace-Id`; OpenTelemetry usa W3C Trace Context (`traceparent`) por defecto y también puede usar el propagador de X-Ray. Si un servicio receptor no entiende el formato que le envía el anterior, o no está instrumentado, la traza puede terminar allí o aparecer separada. [La guía de conceptos de X-Ray explica el encabezado y la propagación](https://docs.aws.amazon.com/xray/latest/devguide/xray-concepts.html).

## X-Ray, OpenTelemetry y CloudWatch Application Signals

Estos componentes cumplen funciones distintas y se pueden combinar:

- **AWS X-Ray** recibe y analiza trazas. Muestra los detalles de cada solicitud y las relaciones entre servicios en la consola de CloudWatch. Es el destino de los datos; el modo de mantenimiento anunciado no aplica al servicio.
- **El SDK de X-Ray y el daemon** instrumentan aplicaciones existentes y entregan segmentos a X-Ray. El daemon recibe los datos del SDK y los envía a AWS. Ambos están en modo de mantenimiento desde el 25 de febrero de 2026, por lo que conviene planificar la migración al evolucionar esas aplicaciones.
- **OpenTelemetry y ADOT** instrumentan aplicaciones con una interfaz estándar y envían trazas, métricas y registros mediante un agente o collector. AWS los recomienda para instrumentación nueva; ADOT puede exportar trazas a X-Ray.
- **CloudWatch Application Signals** supervisa la salud de servicios y operaciones, muestra métricas de aplicación, topología y SLO, y permite profundizar en trazas correlacionadas. Complementa el análisis de una traza concreta; no es otro nombre para el servicio X-Ray.
- **AWS CloudTrail** registra actividad de cuenta y llamadas a la API de AWS para auditoría. No reemplaza una traza de aplicación que sigue una solicitud a través de sus servicios.

Para repasar cómo se complementan métricas, registros, trazas y auditoría, lee [Observabilidad en la Nube de AWS](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m), un artículo de la comunidad publicado en 2024. Úsalo como orientación general y consulta la documentación actual para instrumentación y configuración.

Para instrumentar algo nuevo, sigue la [guía de AWS para OpenTelemetry y X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html). Puedes enviar telemetría a un collector de OpenTelemetry con el exportador de X-Ray, o usar el agente de CloudWatch cuando quieras integrar la recolección con otras funciones de CloudWatch. Si ya tienes aplicaciones con el SDK de X-Ray, el servicio aún recibe sus trazas mediante el daemon o un agente compatible; evita copiar ejemplos antiguos de instalación sin revisar su fecha y el estado de soporte.

Si necesitas una vista diaria de salud y objetivos de servicio, revisa [CloudWatch Application Signals](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Monitoring-Intro.html). Para buscar transacciones y analizar spans en CloudWatch, consulta [CloudWatch Transaction Search](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Transaction-Search.html). Esas funciones amplían el análisis en CloudWatch; no cambian el papel de X-Ray como servicio de trazas.

## Muestreo y trazas incompletas

X-Ray no necesariamente registra todas las solicitudes. La regla predeterminada del SDK registra una solicitud por segundo y, después, el cinco por ciento de las adicionales. **El muestreo integrado de X-Ray en Lambda usa ese ritmo y no se puede configurar para las funciones Lambda.** OpenTelemetry puede usar otros muestreadores; la decisión depende del SDK y de la configuración que hayas desplegado. Por eso, una traza ausente no demuestra por sí sola que el exportador esté roto. Revisa el [muestreo de X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-console-sampling.html) junto con la configuración concreta de tu aplicación.

El contexto también puede perderse entre procesos, servicios externos o colas. Ambos lados del salto deben poder propagar y leer el mismo formato. En aplicaciones basadas en eventos, usa las integraciones de trazado compatibles con el origen y el consumidor; no supongas que una llamada asíncrona conserva por sí sola la relación padre-hijo de una llamada HTTP.

## Cómo diagnosticar una traza ausente o lenta

Empieza por seguir la solicitud desde el primer componente que la recibe:

1. **Confirma el entorno de búsqueda.** Comprueba cuenta, región y ventana temporal de CloudWatch. Conserva el ID de traza de forma segura para buscar la solicitud.
2. **Averigua si la solicitud llegó a la aplicación.** Un [bloqueo de AWS WAF](/blog/aws-web-application-firewall-waf/), un error de entrada en API Gateway u otro rechazo previo al código puede no producir un segmento de aplicación. Revisa las señales del punto de entrada además de X-Ray.
3. **Comprueba que la instrumentación haya emitido datos.** En Lambda, verifica el modo de seguimiento y si el muestreo incluyó esa invocación. En otras cargas, revisa la inicialización del SDK OTel/ADOT y los registros del collector o agente.
4. **Revisa permisos y destino.** Para que el exportador del collector escriba segmentos en X-Ray, el rol que usa el collector necesita `xray:PutTraceSegments`. Si usas la integración de X-Ray de Lambda, el rol de ejecución necesita `xray:PutTraceSegments` y `xray:PutTelemetryRecords`. El uso de reglas de muestreo remotas puede requerir permisos adicionales de lectura y reporte; ajusta el rol al modo configurado. La [guía de IAM de X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/security_iam_id-based-policy-examples.html) detalla las acciones y políticas.
5. **Busca el salto donde se separa la traza.** Confirma que los servicios emisor y receptor estén instrumentados y que propaguen un formato compatible. OTel usa W3C por defecto; añade el propagador de X-Ray cuando un servicio integrado lo requiera.
6. **Localiza la demora.** En la línea de tiempo, compara el tiempo del segmento con sus subsegmentos o *spans* hijos. Si una consulta a RDS o una llamada HTTP concentra el tiempo, continúa el diagnóstico en esa dependencia y correlaciona la traza con métricas y registros usando identificadores seguros.

El video [Cómo debuggear una aplicación en la nube usando X-Ray y trazas](https://www.youtube.com/watch?v=VO3_dcOzcDc), del canal de Marcia en Desplegando Cloud, es una demostración complementaria. Si muestra configuración con el SDK o el daemon clásico, sigue la [guía vigente de migración a OpenTelemetry](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html) para elegir los pasos actuales.

### Seguimiento activo de X-Ray en Lambda

Lambda ofrece dos modos para X-Ray. **Active** genera y envía segmentos para las invocaciones muestreadas. **PassThrough** propaga el contexto recibido, pero no envía trazas automáticamente. Para saber dónde se emplea el tiempo dentro del handler, instrumenta además las llamadas a dependencias; el segmento de la invocación por sí solo no desglosa cada operación interna.

Si mantienes la integración clásica, habilita Active y concede al rol de ejecución los permisos de X-Ray necesarios. Si instrumentas con OpenTelemetry, AWS ofrece [capas administradas ADOT para Lambda](https://aws-otel.github.io/docs/getting-started/lambda/); sigue la guía correspondiente al runtime y configura el envío y el contexto según la capa elegida. Para entender reintentos, invocaciones y señales operativas de Lambda, consulta nuestra guía de [cómo funciona Lambda y cómo diagnosticar sus fallos](https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/).

## Retención, límites, costo y privacidad

AWS conserva las trazas y los datos del mapa de servicios de X-Ray durante **30 días**. Un documento de segmento admite hasta **64 kB**; el límite dinámico de un documento de traza puede llegar a **500 kB**. X-Ray indexa como máximo **50 anotaciones por traza**. Para otros límites de tasa y cuotas regionales, consulta la [referencia actual de cuotas de X-Ray](https://docs.aws.amazon.com/general/latest/gr/xray.html). Si necesitas conservar o consultar datos por más tiempo, define una estrategia de exportación y retención acorde con el destino; no asumas que el almacenamiento de X-Ray es un archivo histórico permanente.

El costo depende de las trazas registradas y consultadas y de las funciones de CloudWatch que habilites, como Transaction Search. Comprueba las [tarifas vigentes de Amazon CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) para la región y la modalidad elegidas; las tarifas publicadas en tutoriales antiguos pueden haber cambiado.

Una traza puede incluir método y URL HTTP, dirección IP del cliente, agente de usuario, estado de respuesta, excepciones y los datos que agregues como anotaciones o metadatos. **No registres contraseñas, tokens, encabezados de autenticación, cuerpos completos de solicitudes ni datos personales que no necesites.** X-Ray cifra los datos en reposo de forma predeterminada y permite configurar una clave de KMS administrada por el cliente; el cifrado no sustituye la minimización de datos. Revisa la [protección de datos de X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-console-encryption.html). Si un encabezado de traza puede venir de clientes no confiables, evalúa retirarlo o validarlo en el punto de entrada antes de usarlo para correlación o muestreo.

## Recursos y comunidades en español

Si prefieres ampliar con videos, [CloudWatch explicado fácil: métricas, logs y trazas](https://www.youtube.com/watch?v=48f2d-oM00Y) recorre las señales de observabilidad. La grabación [Observabilidad en aplicaciones serverless](https://www.youtube.com/watch?v=UdBDmelLlOQ), del podcast *Charlas Técnicas de AWS*, amplía el contexto para Lambda y otros servicios administrados. Ambos videos son del canal de [Marcia en Desplegando Cloud](https://www.youtube.com/@marcia_); también puedes seguir su [newsletter y podcast Desplegando.cloud](https://desplegando.substack.com/) y el [archivo de Charlas Técnicas de AWS](https://podcast.marcia.dev/). Sus pasos de SDK, daemon o consola pueden reflejar una configuración anterior; contrástalos con la [guía actual de migración a OpenTelemetry](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html) antes de aplicarlos.

La comunidad [AWS Women Colombia](https://awswomencolombia.com/) publicó la lectura [#100DíasdeAWS | Día 25 | AWS X-Ray](https://awswomencolombia.com/100diasdeaws-dia-25-aws-x-ray), una pieza de 2023 útil como introducción histórica. Sus instrucciones corresponden a instrumentación clásica; para una implementación nueva, parte de OpenTelemetry. Su charla [La Amenaza del Nivel 100: CloudWatch, CloudTrail, X-Ray y Config](https://www.youtube.com/watch?v=TfBZFzGokQM) compara herramientas de operación y auditoría. La comunidad también comparte más encuentros en su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw) y mantiene un [archivo de eventos y encuentros](https://awswomencolombia.com/page/eventos).

Para ampliar la conversación sobre prácticas de producción, el [canal del AWS User Group Medellín](https://www.youtube.com/@awsugmed) tiene la sesión [Cloud Forge: observabilidad, ingeniería del caos y Java en AWS](https://www.youtube.com/watch?v=CL7jJfyg6bg). Es una charla más amplia que X-Ray; puedes conocer al grupo y sus actividades en [Meetup](https://www.meetup.com/awsugmed/).

En AWS Builder Center también puedes leer [CloudWatch Transaction Search: del span al SLI sin muestrear a ciegas](https://builder.aws.com/content/3J6HsX79yjI9RdhLPwsaBSOKa5Q/cloud-watch-transaction-search-del-span-al-sli-sin-muestrear-a-ciegas), sobre consultas de spans y métricas de servicio, y [Service Events en CloudWatch Application Signals](https://builder.aws.com/content/3JfhMyOFONdCzpGDYBsVRaKzPPH/service-events-en-amazon-cloud-watch-application-signals-el-detalle-ya-estaba-capturado), sobre el diagnóstico de incidentes con Application Signals. Son artículos de la comunidad; utiliza la documentación oficial enlazada arriba como referencia para configurar AWS.

Si quieres aprender acompañado, explora el [directorio de comunidades AWS por país](https://dondeaprendoaws.com/comunidades/) y la [agenda de próximos eventos AWS](https://dondeaprendoaws.com/eventos/) para encontrar talleres, charlas y encuentros online o presenciales de Latinoamérica. Las fechas y condiciones de inscripción cambian; verifica la ficha del organizador antes de asistir.

## Preguntas frecuentes

### ¿AWS X-Ray sigue disponible?

Sí. AWS X-Ray continúa siendo el servicio que recibe y analiza trazas. El modo de mantenimiento anunciado desde el 25 de febrero de 2026 aplica a los SDK de X-Ray y al daemon, que solo reciben correcciones de seguridad. La línea de tiempo vigente no publica una fecha final para ese modo.

### ¿AWS X-Ray y OpenTelemetry son lo mismo?

No. OpenTelemetry es un estándar y conjunto de herramientas para instrumentar y enviar telemetría. X-Ray es un destino y servicio de análisis de trazas de AWS. ADOT permite instrumentar con OTel y exportar trazas a X-Ray.

### ¿Por qué no aparece una invocación de Lambda en X-Ray?

Comprueba que la función use seguimiento **Active**, que la solicitud haya sido seleccionada por el muestreo, que el rol de ejecución pueda escribir en X-Ray y que el contexto se propague hasta la función. **PassThrough** solo reenvía el contexto y no genera trazas automáticamente. Consulta la [documentación de X-Ray para Lambda](https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html) para revisar el modo y sus permisos.
