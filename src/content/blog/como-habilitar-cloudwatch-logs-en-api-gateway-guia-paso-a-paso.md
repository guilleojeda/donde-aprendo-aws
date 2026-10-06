---
title: "Cómo habilitar CloudWatch Logs en API Gateway: REST, HTTP y WebSocket"
description: "Configura logs de ejecución y acceso en API Gateway según el tipo de API. Incluye permisos IAM por región, JSON, consultas, costos y diagnóstico."
author: "guille-ojeda"
publishedAt: "2024-04-29"
modifiedTimestamp: "2026-10-06T10:03:48-03:00"
publishedTimestamp: "2024-04-29T07:48:00.212Z"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Mejores prácticas de observabilidad en AWS"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/"
  - title: "Observabilidad en AWS con Amazon X-Ray"
    url: "https://dondeaprendoaws.com/blog/observabilidad-en-aws-con-amazon-x-ray/"
  - title: "Cómo crear SLOs en AWS con CloudWatch Application Signals"
    url: "https://dondeaprendoaws.com/blog/como-monitorear-slos-con-amazon-cloudwatch/"

review:
  date: "2026-10-06"
---

Para habilitar **CloudWatch Logs en API Gateway**, primero identifica el tipo de API: las API REST y WebSocket admiten logs de ejecución y de acceso; las HTTP API admiten **solo logs de acceso**. REST y WebSocket necesitan un rol IAM de CloudWatch Logs configurado por cuenta y región. En una HTTP API, crea un grupo de CloudWatch Logs y asígnalo a cada etapa que quieras registrar.

El registro se configura por etapa. Guardar un ajuste de logging de etapa no requiere publicar un deployment nuevo. Los cambios en recursos, métodos, rutas o integraciones sí requieren publicar la configuración de la API en REST y WebSocket; una HTTP API los publica automáticamente solo si su etapa tiene `autoDeploy` habilitado. Consulta las guías de [actualizaciones REST](https://docs.aws.amazon.com/apigateway/latest/developerguide/updating-api.html), [despliegue WebSocket](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-set-up-websocket-deployment.html) y [etapas HTTP](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-stages.html).

| Tipo de API | Logs disponibles |
| --- | --- |
| REST | Ejecución y acceso. |
| HTTP | Solo acceso. |
| WebSocket | Ejecución y acceso. |

Los **logs de ejecución** describen cómo API Gateway procesa una solicitud o mensaje y ayudan a investigar errores dentro del gateway. Los **logs de acceso** registran una entrada por solicitud con los campos `$context` que selecciones, por ejemplo, el identificador de solicitud, la ruta, el estado HTTP y la latencia. Puedes habilitar ambos tipos de manera independiente en REST y WebSocket; en HTTP API, configura el registro de acceso.

## Antes de configurar el registro

Elige la cuenta, región, API y etapa que quieres observar. Los logs de acceso se configuran por etapa. La API debe tener una etapa antes de poder recibir invocaciones; para comprobar los logs, también tendrás que generar una solicitud o un mensaje de prueba. [AWS documenta cómo desplegar una API REST](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-deployments.html) y [cómo ver sus grupos de logs](https://docs.aws.amazon.com/apigateway/latest/developerguide/view-cloudwatch-log-events-in-cloudwatch-console.html).

Para logs de **REST y WebSocket**, configura el rol de CloudWatch Logs en API Gateway. En IAM, crea un rol cuyo servicio de confianza sea `apigateway.amazonaws.com` y asígnale la política administrada `AmazonAPIGatewayPushToCloudWatchLogs`. En la consola de API Gateway, selecciona la región, abre **Settings → Logging** y guarda el ARN en **CloudWatch log role ARN**. Es una configuración de cuenta y región, compartida por las API que la usan; no crees otra por cada etapa. [AWS explica el rol, la política y el requisito de AWS STS regional](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html).

Si el rol ya está configurado, conserva el existente. Para establecerlo desde la AWS CLI en `us-east-1`, reemplaza el ID de cuenta y el nombre del rol:

```bash
aws apigateway update-account \
  --patch-operations op='replace',path='/cloudwatchRoleArn',value='arn:aws:iam::123456789012:role/APIGatewayToCloudWatchLogs' \
  --region us-east-1
```

`update-account` cambia la configuración de la cuenta **en la región indicada**; repite el ajuste en cada región donde lo necesites. La identidad que ejecuta el comando necesita permiso `apigateway:PATCH` para actualizar la cuenta y `iam:PassRole` para pasar el rol a API Gateway. Si el servicio no puede asumir el rol, confirma la relación de confianza, la política y que AWS STS esté activo allí. Consulta la [referencia de AWS CLI para `update-account`](https://docs.aws.amazon.com/cli/latest/reference/apigateway/update-account.html) y las [acciones IAM de API Gateway](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigateway.html).

Las HTTP API usan otro flujo: crea un grupo de CloudWatch Logs y permite que la identidad que guarda la configuración de API Gateway administre la entrega de logs y la etapa. La guía de [logging para HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging.html) publica la lista de permisos para crear el grupo y configurar la entrega, incluidos `logs:CreateLogGroup`, `logs:CreateLogDelivery`, `logs:PutResourcePolicy`, `logs:UpdateLogDelivery` y `logs:DeleteLogDelivery`. La identidad también necesita `apigateway:PATCH` para actualizar la etapa, según la [referencia IAM de API Gateway V2](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigatewayv2.html). No configures el rol `cloudWatchRoleArn` como sustituto de esos permisos.

## Habilitar logs de ejecución y acceso

### API REST

1. Abre la API REST y elige una etapa existente. En **Logs and tracing**, selecciona **Edit**.
2. En **CloudWatch Logs**, elige `ERROR` para registrar errores o `INFO` si necesitas los eventos informativos de ejecución. AWS recomienda uno de esos niveles. Deja **Data tracing** desactivado en producción: registra detalles de solicitudes y respuestas que pueden contener información sensible. API Gateway oculta algunos valores, como claves de API y encabezados de autorización, pero esa redacción no cubre todos los campos de tu aplicación. Consulta la guía de [logs de ejecución para REST](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-execution-logging.html).
3. Para registrar accesos, crea o elige un grupo de CloudWatch Logs en la cuenta y región de la API, activa **Custom access logging**, indica el ARN del grupo y pega un formato JSON de una sola línea. En REST, el formato debe incluir `$context.requestId` **o** `$context.extendedRequestId`; incluir ambos facilita la correlación con otros registros. La [guía de logs de acceso REST](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-access-logging.html) muestra las variables compatibles. Por ejemplo:

   ```json
   {"requestId":"$context.requestId","extendedRequestId":"$context.extendedRequestId","method":"$context.httpMethod","resourcePath":"$context.resourcePath","status":"$context.status","latencyMs":"$context.responseLatency"}
   ```
4. Guarda los cambios.

En el modo estándar, los eventos de ejecución REST se truncan a 1 KiB y API Gateway administra el nombre del grupo. Si necesitas otro destino o conservar eventos mayores, AWS ofrece [CloudWatch Logs delivery para logs de ejecución](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-execution-logging.html#rest-api-execution-logging-delivery): admite eventos de hasta 1 MiB, pero reemplaza el flujo estándar para esa etapa.

### API WebSocket

1. Abre la API WebSocket y elige la etapa. En **Logs and tracing**, activa el nivel de ejecución `ERROR` o `INFO` para las rutas que quieras observar. Puedes configurar el valor predeterminado de las rutas y sobrescribirlo por ruta.
2. Si necesitas registrar el payload completo de mensajes, **Data tracing** puede hacerlo; evita activarlo en producción porque los mensajes pueden incluir datos personales o secretos.
3. Para logs de acceso, elige un grupo de CloudWatch Logs y usa variables propias de WebSocket. `eventType` toma los valores `CONNECT`, `MESSAGE` o `DISCONNECT`; `routeKey` identifica la ruta y `connectionId` identifica la conexión. Un formato JSON compacto podría ser:

   ```json
   {"requestId":"$context.requestId","eventType":"$context.eventType","routeKey":"$context.routeKey","connectionId":"$context.connectionId","status":"$context.status"}
   ```

   El formato debe ocupar una sola línea e incluir `$context.requestId`. No uses `httpMethod` o `resourcePath` como si fueran mensajes HTTP. Consulta la lista completa de variables en la guía de [logging para WebSocket](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-logging.html).

API Gateway crea el grupo de ejecución WebSocket `/aws/apigateway/{api-id}/{stage}`. La guía de AWS para [activar logs de REST y WebSocket](https://repost.aws/knowledge-center/api-gateway-cloudwatch-logs) explica también la configuración regional del rol y cómo encontrar el grupo administrado.

### HTTP API

Una HTTP API no tiene logs de ejecución de API Gateway. Configura logs de acceso así:

1. En CloudWatch, crea un grupo como `/apigateway/orders/access` en la región de la API y copia su ARN.
2. En API Gateway, abre la HTTP API y ve a **Monitor → Logging**. Selecciona la etapa, activa **Access logging**, pega el ARN y elige el formato.
3. Guarda. Usa variables de HTTP API como `routeKey`, `httpMethod`, `status` y `responseLatency`; revisa la referencia de [formatos y variables para HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging.html).

La AWS CLI puede crear el grupo y asignar el formato a una etapa. Cambia el API ID, cuenta y región por los de tu entorno; crea el grupo solo si aún no existe:

```bash
aws logs create-log-group \
  --log-group-name '/apigateway/orders/access' \
  --region us-east-1

aws apigatewayv2 update-stage \
  --api-id a1b2c3d4 \
  --stage-name '$default' \
  --access-log-settings '{"DestinationArn":"arn:aws:logs:us-east-1:123456789012:log-group:/apigateway/orders/access","Format":"{\"requestId\":\"$context.requestId\",\"time\":\"$context.requestTime\",\"method\":\"$context.httpMethod\",\"routeKey\":\"$context.routeKey\",\"status\":\"$context.status\",\"latencyMs\":\"$context.responseLatency\"}"}' \
  --region us-east-1
```

El ARN sigue la forma `arn:aws:logs:{region}:{account-id}:log-group:{log-group-name}`. En este ejemplo, las comillas simples protegen `$default` y las variables `$context` de la shell. La [referencia de AWS CLI para `update-stage`](https://docs.aws.amazon.com/cli/latest/reference/apigatewayv2/update-stage.html) muestra la estructura de `access-log-settings`.

## Comprobar los logs y encontrar errores

Envía una solicitud segura a una ruta que ya exista. Por ejemplo, para una etapa con nombre en REST o HTTP API:

```bash
GATEWAY_API_ID=a1b2c3d4
GATEWAY_REGION=us-east-1
GATEWAY_STAGE=dev
GATEWAY_ROUTE=health

curl -i "https://${GATEWAY_API_ID}.execute-api.${GATEWAY_REGION}.amazonaws.com/${GATEWAY_STAGE}/${GATEWAY_ROUTE}"
```

Reemplaza los valores y agrega la autenticación requerida por tu API. Una etapa HTTP API `$default` se invoca sin el segmento de etapa en la URL. Para WebSocket, usa un cliente compatible para conectarte y enviar un mensaje. Toda solicitud real puede invocar tu backend y generar cargos; prueba una ruta que no modifique datos y una etapa controlada.

En CloudWatch, cambia a la misma región de la API y abre **Logs → Log groups**. Busca el grupo de ejecución o el grupo de acceso que configuraste, luego el flujo más reciente. La entrega puede tardar un poco. Si tienes más de un grupo, revisa también su nombre y la etapa asociada.

Con JSON estructurado puedes filtrar errores de servidor en CloudWatch Logs Insights. Esta consulta usa los nombres del formato HTTP API de arriba:

```text
fields @timestamp, requestId, method, routeKey, status, latencyMs
| filter status like /^5[0-9][0-9]$/
| sort @timestamp desc
| limit 20
```

En el formato JSON, `status` llega como texto; la expresión regular selecciona códigos 5xx sin convertirlo a número. Puedes ver solicitudes recientes desde el [lenguaje de consultas de CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-Filter.html).

Los logs ayudan a inspeccionar solicitudes concretas; las métricas ayudan a ver tasas y tendencias. Para REST, revisa `Count`, `4XXError`, `5XXError`, `Latency` e `IntegrationLatency`; para HTTP API, los nombres son `Count`, `4xx`, `5xx`, `Latency` e `IntegrationLatency`. WebSocket expone métricas propias como `ConnectCount`, `MessageCount`, `ClientError`, `ExecutionError` e `IntegrationError`. Activar métricas detalladas por método, recurso o ruta puede tener cargos adicionales. Consulta las referencias de [métricas REST](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html), [métricas HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-metrics.html) y [métricas WebSocket](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-logging.html).

Si API Gateway integra una Lambda, sus eventos aparecen en el grupo `/aws/lambda/{nombre-de-la-función}`. Ese grupo registra el proceso de Lambda; los logs de API Gateway registran el procesamiento del gateway. Para entender CloudWatch como conjunto de métricas, logs y trazas, mira [CloudWatch explicado fácil](https://www.youtube.com/watch?v=48f2d-oM00Y). El video [¿Dónde están mis logs en AWS?](https://www.youtube.com/watch?v=tsCvaRv5EkU) se enfoca en encontrar logs en una aplicación serverless. Para estructurar logs de aplicación y emitir métricas propias desde Lambda, consulta [logs estructurados y métricas personalizadas con CloudWatch](https://www.youtube.com/watch?v=UBPPGJaBIVY). Los tres videos son del [canal de Marcia en YouTube](https://www.youtube.com/@marcia_).

## Errores frecuentes

| Síntoma | Qué revisar |
| --- | --- |
| REST o WebSocket no muestra logs de ejecución | Confirma la región seleccionada, que el rol de CloudWatch tenga a `apigateway.amazonaws.com` como entidad de confianza y que incluya la política correcta. Verifica que STS esté activo, que el nivel sea `ERROR` o `INFO` y que elegiste la etapa correcta. Puedes comprobar el rol guardado con `aws apigateway get-account --region us-east-1 --query cloudwatchRoleArn --output text`. |
| HTTP API no registra solicitudes | HTTP API no genera logs de ejecución: revisa **Access logging** en la etapa, el ARN del grupo, la región y los permisos de entrega de CloudWatch Logs para quien guarda la configuración. |
| No encuentras el grupo | Para REST, busca `API-Gateway-Execution-Logs_{api-id}/{stage}`. Para WebSocket, busca `/aws/apigateway/{api-id}/{stage}`. Para HTTP API, busca el grupo que elegiste. Para errores internos de Lambda, revisa aparte `/aws/lambda/{nombre-de-la-función}`. |
| El JSON tiene campos vacíos o no se guarda | Usa nombres de variables compatibles con el tipo de API y respeta mayúsculas y minúsculas. En REST, incluye `$context.requestId` o `$context.extendedRequestId` (ambos son útiles para correlación); HTTP y WebSocket usan `requestId`. REST usa `resourcePath`; HTTP y WebSocket usan `routeKey`; WebSocket también tiene `eventType` y `connectionId`. El formato debe ser una sola línea. |
| Cambiaste el rol y aún no aparecen eventos | Espera unos minutos y vuelve a probar; AWS indica que el rol nuevo puede tardar en aplicarse. También hay errores que API Gateway rechaza antes de enrutar y que no aparecen en logs de ejecución; compara los logs de acceso y las métricas. |

Los logs y las métricas no cubren todos los fallos de entrada. AWS indica que REST o HTTP API pueden no generar telemetría, por ejemplo, para solicitudes 413, 431 (REST), demasiados 429, errores 400 de dominios personalizados sin mapeo y ciertos 500 internos. Revisa los límites de la medición en las guías de [monitoreo REST](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-monitor.html) y [monitoreo HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-monitor.html).

## Seguridad, retención y costos

Los logs de ejecución pueden incluir valores de parámetros, datos del autorizador y, si activas data tracing, el contenido completo de solicitudes y respuestas. Conserva solo los campos que realmente necesitas. Evita tokens, datos personales, claves, cookies y cuerpos de mensajes en los logs de acceso; limita quién puede leer los grupos.

CloudWatch Logs conserva los eventos **indefinidamente por defecto**. Define una retención compatible con tus requisitos operativos, legales y de auditoría. Por ejemplo, para dejar 30 días en un grupo propio:

```bash
aws logs put-retention-policy \
  --log-group-name '/apigateway/orders/access' \
  --retention-in-days 30 \
  --region us-east-1
```

Treinta días es solo un ejemplo: elige el plazo que corresponda a tu entorno. El costo depende de la región y del volumen que ingieres, conservas y consultas con Logs Insights. Las métricas detalladas también pueden sumar cargos. Revisa la [página de precios de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) y no asumas que el registro será gratuito por habilitarlo.

No borres manualmente los grupos de ejecución que administra API Gateway: AWS advierte que eliminarlos puede interrumpir el registro. Puedes ajustar su retención. El grupo de acceso que creaste tú puede retirarse cuando hayas desactivado el registro de esa etapa y ya no necesites sus datos.

## Recursos y comunidad

Para entender cómo se complementan métricas, logs y trazas, lee [Observabilidad en la nube de AWS: CloudWatch, X-Ray y CloudTrail](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m), una explicación en español publicada por AWS Community Builders. Si tus logs ya contienen estado y latencia y quieres investigar cómo convertir esos campos en indicadores de servicio, el artículo comunitario [Observabilidad desde los logs: cómo construir SLIs sin esperar a instrumentar el código](https://builder.aws.com/content/3IlpApiKwsNpk6eWH4T0NdgFfkf/observabilidad-desde-los-logs-como-construir-slis-sin-esperar-a-que-alguien-instrumente-el-codigo) compara metric filters, Embedded Metric Format y consultas de Logs Insights. Para seguir una solicitud entre servicios, continúa con [Mejores prácticas de observabilidad en AWS](https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/) y [Observabilidad en AWS con Amazon X-Ray](https://dondeaprendoaws.com/blog/observabilidad-en-aws-con-amazon-x-ray/). Si los logs ya te permiten diagnosticar fallos y quieres convertir la salud del servicio en objetivos medibles de disponibilidad y latencia, sigue con [Cómo crear SLOs en AWS con CloudWatch Application Signals](https://dondeaprendoaws.com/blog/como-monitorear-slos-con-amazon-cloudwatch/).

Si buscas un grupo en tu país, explora el [directorio de comunidades AWS en Latinoamérica](https://dondeaprendoaws.com/comunidades/), filtrable por país, tipo de grupo y temas; para encuentros remotos o presenciales, consulta la [agenda de eventos AWS](https://dondeaprendoaws.com/eventos/) y confirma cupos y condiciones en la página de cada actividad. Si estás en Córdoba, puedes conocer al [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) y consultar sus actividades en Meetup. Para estudiantes de la región, el [AWS Student Community Day Córdoba 2026](https://www.meetup.com/aws-sbg-at-national-university-of-cordoba/events/316848908/) está anunciado para el **7 de noviembre de 2026, de 13:00 a 20:00 ART**, en FaMAF, Ciudad Universitaria. Al **6 de octubre de 2026**, Meetup indicaba registro abierto, entrada gratuita y cupos limitados; revisa la página antes de inscribirte porque la disponibilidad y las condiciones pueden cambiar.
