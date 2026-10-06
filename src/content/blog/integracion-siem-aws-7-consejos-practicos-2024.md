---
title: "Cómo integrar AWS con un SIEM: fuentes, rutas y pruebas"
description: "Elige qué señales enviar a tu SIEM, cómo entregarlas desde CloudTrail, Security Hub, CloudWatch Logs o Security Lake y cómo comprobar su recepción."
author: "guille-ojeda"
publishedAt: "2024-05-05"
publishedTimestamp: "2024-05-05T01:12:15.503Z"
modifiedTimestamp: "2026-10-06T17:35:53-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Amazon GuardDuty: listas de inteligencia de amenazas"
    url: "https://dondeaprendoaws.com/blog/integracion-de-guardduty-de-aws-para-inteligencia-de-amenazas/"
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"
---

Para integrar AWS con un SIEM —un sistema de gestión de eventos e información de seguridad— decide primero qué necesitas investigar y cuánto tarda la señal en llegar. Envía **CloudTrail a S3** para conservar actividad de cuenta; usa **EventBridge** para enrutar hallazgos de Security Hub o GuardDuty con poca demora; conecta **CloudWatch Logs** cuando el SIEM necesita registros de una aplicación; considera **Amazon Security Lake** si tu SIEM tiene un conector compatible con sus datos OCSF.

No hace falta enviar todos los registros ni activar todos los servicios. Define las cuentas, regiones, fuentes, retención y formato que realmente necesitas, elige una ruta para cada fuente y prueba la recepción antes de activar alertas o respuestas.

## Elige la ruta según la señal

Un SIEM correlaciona eventos de seguridad de distintas fuentes. En AWS, conviene separar los registros que describen actividad, las detecciones que resumen un riesgo y el transporte que entrega cada dato.

| Señal | Qué aporta | Ruta habitual | Límite que debes considerar |
| --- | --- | --- | --- |
| AWS CloudTrail | Llamadas a API y actividad de administración; también eventos de datos si los habilitas | Trail hacia Amazon S3; opcionalmente, CloudWatch Logs | El historial de eventos no equivale a un trail continuo. Los eventos de datos no se incluyen por defecto y pueden tener cargos adicionales. |
| Amazon GuardDuty | Hallazgos de amenazas que detecta GuardDuty | Regla de EventBridge o integración documentada por el SIEM | Un hallazgo no es el registro completo que lo originó ni una respuesta automática. |
| AWS Security Hub | Hallazgos, controles de postura y señales correlacionadas | Integración compatible o regla de EventBridge | Security Hub y Security Hub CSPM son servicios complementarios con formatos y tipos de evento distintos. |
| Registros de aplicación y servicio | Mensajes que ya se publicaron en un grupo de CloudWatch Logs | Filtro de suscripción hacia Firehose, Kinesis Data Streams o Lambda | Debes seleccionar el grupo y los eventos; vigila el formato, la tasa y la retención. |
| Tráfico de red | Metadatos de los flujos IP de una VPC | VPC Flow Logs hacia S3, CloudWatch Logs o Firehose | Son registros de flujo, no una captura del contenido de los paquetes. |
| Fuentes compatibles con Security Lake | Registros convertidos al esquema OCSF y formato Parquet | Suscriptor con acceso a datos o consultas | El SIEM debe admitir una de las modalidades de suscriptor y las fuentes que habilitaste. |

La [guía para elegir servicios de seguridad de AWS](/blog/aws-seguridad-servicios-esenciales/) explica qué problema cubre cada servicio. Para GuardDuty, esta [guía complementaria de inteligencia de amenazas](/blog/integracion-de-guardduty-de-aws-para-inteligencia-de-amenazas/) se centra en sus detecciones y fuentes de inteligencia; aquí nos ocupamos del trayecto de los datos hasta el SIEM.

## Comprueba primero qué acepta tu SIEM

Antes de cambiar AWS, confirma con la documentación de tu SIEM:

- Si tiene un conector nativo para CloudTrail, Security Hub, GuardDuty o Security Lake, y qué edición, región y formato admite.
- Si lee objetos de S3, usa una cola SQS para enterarse de nuevos archivos, recibe eventos HTTPS, consume Kinesis o Firehose, o espera una función adaptadora.
- Si procesa JSON comprimido, registros con varios eventos, el formato AWS Security Finding Format (ASFF) o el esquema Open Cybersecurity Schema Framework (OCSF).
- Cómo autentica la conexión: prefiere un rol entre cuentas, una conexión administrada o credenciales temporales; no guardes claves de IAM permanentes en un script.
- Qué límites de tamaño, tasa, retención y reintento aplica, y cómo informa de errores o datos rechazados.

Anota también el objetivo: por ejemplo, conservar cambios de permisos durante un año, alertar sobre hallazgos críticos en minutos o buscar accesos a determinados objetos de S3. Ese objetivo determina si necesitas registros completos, hallazgos filtrados o ambas señales. Los títulos de los hallazgos no sustituyen los campos estructurados de cuenta, región, recurso, tipo, hora e identidad.

## Ruta 1: conservar CloudTrail en S3 para auditoría

CloudTrail registra actividad de AWS. Su **Event history** permite consultar hasta 90 días de eventos de administración por región; para entregar archivos de forma continua al SIEM, configura un trail con un destino S3. La [documentación de CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-create-a-trail-using-the-console-first-time.html) recomienda un trail multirregión para incluir la actividad de las regiones habilitadas.

Un recorrido de referencia es:

1. Crea o elige un bucket dedicado y aplica la política de bucket que permita a CloudTrail entregar los archivos. Conserva el prefijo que utilizará el trail y evita dar lectura general al bucket.
2. Configura un trail multirregión, selecciona los eventos de administración que necesitas y activa la validación de integridad de archivos.
3. Añade eventos de datos solo para los recursos y operaciones que debas investigar. Por ejemplo, CloudTrail no registra lecturas de objetos S3 como GetObject en el trail si no habilitas selectores de eventos de datos para ese alcance.
4. Configura el conector del SIEM para leer el bucket y prefijo previstos. Si usa S3 y SQS, limita el acceso a esos objetos y cola, y confirma que el conector descomprime los archivos .json.gz.
5. Busca una llamada de prueba y confirma en el SIEM la cuenta, región, hora, identidad y nombre de evento esperados.

CloudTrail puede tardar en promedio unos cinco minutos en entregar un archivo, pero AWS indica que ese tiempo no está garantizado. Usa esta ruta para registro y auditoría; no prometas latencia instantánea. Si ya tienes un trail, inspecciona su estado y selectores antes de crear otro. Los comandos de ejemplo requieren AWS CLI configurado con una sesión vigente y una identidad con permisos para cada operación de lectura indicada (CloudTrail, EC2 o EventBridge). Estos comandos ayudan a revisar una configuración existente:

~~~bash
aws cloudtrail get-trail-status \
  --name "<nombre-o-ARN-del-trail>" \
  --region "<region-de-origen>"
aws cloudtrail get-event-selectors \
  --trail-name "<nombre-o-ARN-del-trail>" \
  --region "<region-de-origen>"
~~~

En la salida de `get-trail-status`, comprueba que `IsLogging` sea `true` y revisa campos como `LatestDeliveryError` o `LatestCloudWatchLogsDeliveryError` si aparecen. El primero señala problemas de entrega a S3; el segundo, errores de la ruta a CloudWatch Logs. La guía de [resolución de problemas de CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-troubleshooting.html) indica revisar la política del bucket o el rol de CloudWatch Logs según el destino.

Para probar recepción sin crear recursos, usa una llamada de administración de solo lectura que coincida con tus selectores; por ejemplo, `aws ec2 describe-regions --region "<region>"` si tu identidad tiene permiso `ec2:DescribeRegions` y el trail registra eventos de lectura. Espera a que CloudTrail entregue el archivo y busca el evento `DescribeRegions` en el bucket y luego en el índice del SIEM. Una búsqueda vacía no demuestra que no hubo actividad: comprueba primero que la región, el tipo de evento, los selectores y el prefijo de S3 coinciden con la prueba.

Si necesitas flujo de logs más continuo, puedes configurar CloudTrail para enviar eventos a un grupo de CloudWatch Logs y conectar ese grupo a un filtro de suscripción. CloudWatch Logs puede entregar los eventos que coinciden con el filtro a Kinesis Data Streams, Firehose o Lambda; el destino necesita permisos y capacidad para el volumen previsto. Esta ruta duplica almacenamiento o transporte si mantienes también la ingesta desde S3, así que úsala cuando resuelva una necesidad de latencia concreta.

Para repasar la diferencia entre CloudWatch, X-Ray y CloudTrail, consulta el artículo comunitario [Observabilidad en la nube de AWS](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m). Se publicó en 2024 y sirve para los conceptos; usa la documentación de AWS para comprobar la interfaz y configuración actual.

## Ruta 2: enrutar hallazgos con EventBridge

EventBridge resulta útil cuando quieres enviar solo ciertos hallazgos a un SIEM o a una cola de entrada. Security Hub publica hallazgos como eventos; una regla filtra los atributos y dirige el resultado a un destino compatible, como una API HTTPS, SQS, Kinesis o Lambda. Si tu SIEM tiene una integración nativa con Security Hub, revisa primero sus instrucciones: puede gestionar la autenticación, el formato y los reintentos de manera distinta.

### Distingue Security Hub de Security Hub CSPM

La documentación actual describe dos servicios complementarios. **Security Hub CSPM** evalúa la postura contra controles y estándares y utiliza ASFF para sus hallazgos. **AWS Security Hub** ofrece una experiencia unificada para priorizar riesgos y correlaciona señales de servicios como GuardDuty, Inspector, Macie y CSPM; sus hallazgos usan OCSF. La nueva experiencia de Security Hub pasó a disponibilidad general el 2 de diciembre de 2025. Consulta [qué son Security Hub y Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-are-securityhub-services.html) antes de seguir una guía antigua que solo mencione “Security Hub”.

Ambos servicios publican eventos con el origen `aws.securityhub`, pero el `detail-type` cambia. Para la nueva experiencia, el tipo es `Findings Imported V2`; CSPM usa `Security Hub Findings - Imported`. Elige el patrón del servicio que tienes habilitado. Mezclar reglas ASFF y OCSF, o escuchar ambos tipos sin deduplicar, puede duplicar hallazgos. La documentación de [eventos de Security Hub](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-v2-cwe-event-types.html) detalla esta diferencia. Confirma que Security Hub y la fuente que produce el hallazgo estén habilitados en las cuentas y regiones pertinentes; si centralizas una organización, verifica también la cuenta administradora y la región de agregación.

Este esqueleto identifica eventos de la nueva experiencia, pero no filtra hallazgos:

~~~json
{
  "source": ["aws.securityhub"],
  "detail-type": ["Findings Imported V2"]
}
~~~

Este patrón recoge todos los hallazgos V2 que lleguen a esa regla. Puede ser adecuado si el SIEM debe conservarlos todos y ya has previsto el alcance y el volumen; si no, limita la regla después de inspeccionar el payload real. Copia el primer objeto a pattern-v2.json y el segundo a finding-v2.json para probar solo la coincidencia de origen y tipo:

~~~json
{
  "version": "0",
  "id": "prueba-sintetica-1",
  "source": "aws.securityhub",
  "detail-type": "Findings Imported V2",
  "account": "111122223333",
  "time": "2026-10-06T12:00:00Z",
  "region": "us-east-1",
  "resources": ["finding-sintetico"],
  "detail": {
    "findings": [{"severity": "Critical"}]
  }
}
~~~

El evento es sintético y abreviado; solo prueba el patrón superior, no valida el esquema ni el campo de severidad que entregará tu cuenta. La página de reglas de EventBridge muestra un ejemplo con `Severity` en mayúscula, mientras que su lista de filtros usa `severity` en minúscula; la nueva experiencia de Security Hub usa OCSF. Antes de añadir filtros, inspecciona un evento real o consulta un hallazgo con [GetFindingsV2](https://docs.aws.amazon.com/cli/latest/reference/securityhub/get-findings-v2.html) y toma los nombres del payload que consume tu SIEM. La [documentación OCSF de Security Hub](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-ocsf.html) y el formato de [eventos V2](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-v2-cwe-event-formats.html) describen los formatos.

Para comprobar la coincidencia sin crear una regla, ejecuta el [comando `test-event-pattern` de AWS CLI](https://docs.aws.amazon.com/cli/latest/reference/events/test-event-pattern.html):

~~~bash
aws events test-event-pattern \
  --event-pattern file://pattern-v2.json \
  --event file://finding-v2.json \
  --region "<region>"
~~~

El comando solo comprueba si el JSON sintético coincide con el patrón. No crea una regla, no comprueba los permisos del destino y no prueba que el SIEM recibió nada. Para comprobar la ruta completa, usa un hallazgo de prueba en una cuenta aislada, dirige la regla primero a un destino de observación o índice de pruebas y verifica el evento recibido. AWS ofrece [reglas de EventBridge para Security Hub](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-v2-cwe-event-rules.html) y una lista de [integraciones de terceros para Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-partner-providers.html); confirma cuál corresponde a tu versión.

GuardDuty publica automáticamente hallazgos como eventos de EventBridge cuando está habilitado; su [guía oficial de integración](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings_eventbridge.html) explica las reglas y el esquema. Estos hallazgos sirven para alertas y correlación, pero no reemplazan el registro de auditoría de CloudTrail. La grabación comunitaria [Amazon GuardDuty integrado con SIEM](https://www.youtube.com/watch?v=CQUICC2h0Oc), publicada por AWS User Group CreaTicas, ofrece un ejemplo de conversación sobre esa integración; contrasta los pasos con la documentación vigente. Antes de desplegar una regla, comprueba su alcance por cuenta y región, el rol o política del destino y el formato que recibirá el SIEM.

En EventBridge, revisa las métricas MatchedEvents, Invocations y FailedInvocations. Configura una cola de mensajes fallidos (DLQ) para los eventos que agoten sus reintentos; AWS puede dejar de reintentar después de los límites configurados. Si el destino recibe una llamada pero rechaza el JSON, revisa su respuesta y conserva el evento original para corregir el mapeo. EventBridge puede invocar un destino más de una vez en algunos casos: usa el identificador del evento y el identificador del hallazgo para que el proceso de ingesta sea idempotente.

## Ruta 3: enviar logs de CloudWatch y VPC Flow Logs

CloudWatch Logs es una ruta de salida, no una fuente automática de todos los logs de tu cuenta. Primero comprueba que la aplicación o servicio escribe al grupo de logs correcto. Después crea un filtro de suscripción para reenviar todos los eventos o solo los que coincidan con un patrón a Kinesis Data Streams, Firehose o Lambda. La [guía de filtros de suscripción](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/SubscriptionFilters.html) explica los destinos, el rol necesario y el formato comprimido de los mensajes.

Para un SIEM externo, Firehose o una función adaptadora puede transformar y entregar el formato que espera el proveedor, si existe un destino compatible y configuras sus credenciales. Controla el tamaño de lote, la tasa de entrega y las métricas de fallos. Los filtros de suscripción entregan al menos una vez y pueden producir duplicados; conserva claves de correlación y evita que el proceso vuelva a reenviar los logs que él mismo genera.

Los **VPC Flow Logs** capturan metadatos del tráfico IP aceptado o rechazado en el alcance configurado. Puedes enviarlos directamente a S3, CloudWatch Logs o Amazon Data Firehose; elige el destino que soporte tu SIEM y el volumen previsto. No incluyen el contenido de los paquetes. La [guía de VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html) describe estos destinos y advierte que se aplican cargos por ingestión y archivo de logs. Limita la captura a las VPC, interfaces o campos que necesites investigar.

## Ruta 4: usar Security Lake como fuente normalizada

Security Lake puede ser útil si buscas una ubicación común para varias fuentes compatibles y tu SIEM tiene un conector de suscriptor probado. El servicio normaliza fuentes admitidas a OCSF y guarda archivos Parquet en S3. Entre las fuentes documentadas figuran CloudTrail, VPC Flow Logs y hallazgos de Security Hub CSPM; comprueba la [lista actual de fuentes](https://docs.aws.amazon.com/security-lake/latest/userguide/source-management.html) para la región y el producto que utilizas. No asumas que una integración de Security Hub CSPM cubre automáticamente cada función o evento de la nueva experiencia Security Hub.

Security Lake admite dos formas de suscriptor: acceso a datos de S3, con notificaciones HTTPS o SQS cuando llegan objetos, y acceso de consulta a tablas de Lake Formation. El SIEM debe admitir esa modalidad. Para acceso a datos, prepara la identidad del suscriptor y el permiso de lectura por fuente y región; para consultas, concede SELECT sobre las bases de datos y tablas pertinentes. Revisa la [gestión de suscriptores](https://docs.aws.amazon.com/security-lake/latest/userguide/subscriber-management.html) y las [integraciones de terceros](https://docs.aws.amazon.com/security-lake/latest/userguide/integrations-third-party.html). La grabación de AWS Women Colombia [Logging y Amazon Security Lake](https://www.youtube.com/watch?v=5PCIzFcUxos) es un recurso comunitario complementario; verifica sus pasos con las guías actuales.

Security Lake no es una opción sin costo permanente: cobra por volumen de datos ingeridos y convertidos, y pueden sumarse S3, SQS, EventBridge, Glue, consultas y otros servicios. La prueba publicada por AWS dura 15 días para el propio servicio; servicios relacionados aún pueden cobrar y la facturación empieza al continuar después de la prueba. Consulta [cómo se calcula el precio de Security Lake](https://docs.aws.amazon.com/security-lake/latest/userguide/estimating-costs.html) y estima también el costo del SIEM, la retención y la transferencia de datos.

## Diagnóstico de fallos

Sigue el evento desde el productor hasta el índice final. Comprueba una capa a la vez:

| Síntoma | Qué revisar |
| --- | --- |
| No aparecen eventos de CloudTrail | Cuenta y región del trail, estado del registro, selectores de eventos, política del bucket S3 y prefijo. |
| Llega CloudTrail a S3, pero no al SIEM | Lectura del bucket, cola SQS, descompresión de .json.gz, sondeo y límites del conector. |
| Security Hub detecta un hallazgo, pero EventBridge no lo enruta | Tipo de evento V1 o V2, patrón, nombres exactos de campos, cuenta, región y estado de la regla. |
| EventBridge encuentra coincidencias, pero la entrega falla | Permiso de invocación, autenticación del endpoint, cuota del consumidor, métricas FailedInvocations y DLQ. |
| CloudWatch Logs recibe, pero el SIEM muestra rechazos | Grupo y filtro, rol de entrega, destino activo, decodificación base64, descompresión gzip y esquema esperado. |
| Hay más hallazgos que alertas esperadas | Actualizaciones repetidas, reglas V1 y V2 solapadas, dos rutas para una misma fuente y reintentos. |
| El SIEM ingiere eventos, pero no puede correlacionarlos | Preserva cuenta, región, hora UTC, recurso e identidad; revisa el parser ASFF, OCSF, CloudTrail o Flow Logs. |

Guarda el evento original y agrega campos normalizados sin eliminar los campos propios de AWS o del producto de origen. Deduplica con una clave estable, como el identificador del evento de EventBridge o el identificador y hora de actualización del hallazgo. Una notificación de entrega no prueba que el SIEM indexó el dato: confirma su búsqueda e integridad en el índice de destino.

## Costos y seguridad operativa

El costo depende del volumen y el destino. Los eventos de datos e Insights de CloudTrail, los logs de VPC y CloudWatch, la conversión y retención de Security Lake, las colas, el cómputo de transformación, la transferencia y la licencia o ingesta del SIEM pueden facturarse por separado. Empieza con una fuente pequeña y revisa las [tarifas de CloudTrail](https://aws.amazon.com/cloudtrail/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) y [Security Hub](https://aws.amazon.com/security-hub/pricing/) antes de ampliar la captura. El [estimador de costos de Security Hub](https://docs.aws.amazon.com/securityhub/latest/userguide/security-hub-cost-estimator.html) permite comparar el modelo unificado con el costo de servicios individuales.

Usa privilegios mínimos en cada tramo. El conector que consume S3 necesita acceso solo al prefijo y cola elegidos; el rol de EventBridge debe invocar solo el destino de la regla. Define retención y acceso a registros sensibles antes de enviarlos a otra región o proveedor externo.

## Recursos y comunidades para continuar

Si quieres conversar con grupos dedicados a seguridad cloud, consulta [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/), [AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/), [AWS User Group Security Colombia](https://www.meetup.com/aws-user-group-security-colombia/) y [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/); también puedes revisar sus [eventos en Meetup](https://www.meetup.com/aws-user-group-security-ecuador/). El sitio de Ecuador presenta el acceso a la comunidad como gratuito; confirma por separado las condiciones de cada evento. El [canal de YouTube de AWS Security Users Group LatAm](https://www.youtube.com/@AWSSecurityLATAM) reúne grabaciones sobre seguridad, respuesta a incidentes y cumplimiento.

También puedes seguir a [CreaTicas AWS User Group](https://www.meetup.com/chiapa-uk-aws-users-meetup-group/), que publica charlas técnicas y tuvo una sesión de GuardDuty con SIEM, o sumarte a comunidades generales como [AWS User Group Perú](https://www.meetup.com/awsperu/) y [AWS User Group Panamá](https://www.meetup.com/aws-user-group-panama/) para consultar dudas más amplias sobre AWS. El [canal de YouTube de CreaTicas](https://www.youtube.com/channel/UCLt3Cav92Ej0t_m3mliLGCQ) ofrece sus grabaciones. La ficha de CreaTicas ya marca aquella sesión como pasada; consulta la página del grupo para próximos encuentros.

Al 6 de octubre de 2026, AWS User Group Security Ecuador anuncia el encuentro virtual [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) para el 20 de octubre a las 19:00 de Ecuador (UTC−5), con cupos limitados. El tema es automatización de controles, no una práctica de integración SIEM; revisa la página para conocer inscripción y condiciones vigentes. AWS User Group Panamá también anuncia un [AWS Community Day Security & Data Edition](https://www.meetup.com/aws-user-group-panama/events/316732293/) para el 14 de noviembre; su ficha indica “Save the Date” y aún deja sede y agenda por confirmar. Ninguna de las dos páginas indica que el acceso sea gratuito, así que comprueba el registro y las condiciones antes de asistir.
