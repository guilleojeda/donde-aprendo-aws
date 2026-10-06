---
title: "Cómo optimizar la transferencia de datos en API Gateway"
description: "Reduce los bytes y costos de salida de Amazon API Gateway con compresión, límites de payload, caché y mediciones que separan transferencia de solicitudes."
author: "guille-ojeda"
publishedAt: "2025-05-29"
publishedTimestamp: "2025-05-29T06:24:09.015000+00:00"
modifiedTimestamp: "2026-10-06T10:14:29-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []
---

Para reducir el costo de transferencia de datos en **Amazon API Gateway**, empieza por medir cuántos bytes salen de la API y qué respuestas los generan. En una REST API, puedes activar compresión gzip o deflate; para respuestas repetidas, evaluar CloudFront; y para archivos grandes, transferirlos directamente con Amazon S3. La compresión puede bajar los bytes enviados, pero no el cargo por cada solicitud ni los costos de tu integración.

La factura de API Gateway combina cargos por solicitudes con cargos por los datos transferidos hacia afuera; otros servicios del recorrido pueden sumar sus propios cargos. Los precios dependen del tipo de API, la región y la ruta. Revisa la [página de precios de API Gateway](https://aws.amazon.com/api-gateway/pricing/) antes de comparar alternativas. Las APIs privadas no tienen cargo de transferencia de salida de API Gateway, aunque el uso de AWS PrivateLink sí puede generar cargos.

## Primero identifica qué estás pagando

Separa tres preguntas que suelen confundirse:

- **¿Cuántas solicitudes recibe la API?** Cambiar el tamaño de una respuesta no reduce ese conteo.
- **¿Cuántos datos salen?** Una respuesta comprimida puede reducir la parte de transferencia facturada por bytes.
- **¿Qué trabajo hace la integración?** Las invocaciones de Lambda, las lecturas de bases de datos, la caché, CloudFront y otros servicios se facturan aparte.

Mide un conjunto representativo de respuestas —tamaño, tipo de contenido y frecuencia— y registra latencia y errores junto con los bytes. Si el problema es el volumen de respuestas, comprimir o devolver menos datos puede ayudar. Si el costo está en el número de solicitudes o en el backend, necesitas otra medida.

Al elegir entre REST API y HTTP API, compara funciones y cargos de solicitud, no un porcentaje fijo de ahorro. AWS describe HTTP APIs como la opción de menor precio cuando no necesitas capacidades que ofrece REST API, como caché de API, API keys, límites por cliente, validación de solicitudes, AWS WAF, endpoints privados o respuesta transmitida. Las tarifas varían según la región y el volumen; cambiar el tipo de API no elimina por sí mismo los bytes que envías al cliente. La [comparación oficial de REST APIs y HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html) enumera sus diferencias.

## Comprime respuestas de una REST API

La compresión administrada por API Gateway corresponde a **REST APIs**. Configura un umbral en bytes con `minimumCompressionSize`, despliega el cambio y pide la respuesta con `Accept-Encoding: gzip` o `Accept-Encoding: deflate`. API Gateway admite `gzip`, `deflate` e `identity`; el cliente debe aceptar una codificación compatible para recibir una respuesta comprimida. La [guía oficial de compresión para REST APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-gzip-compression-decompression.html) explica también cómo enviar una solicitud comprimida con `Content-Encoding`; la guía para [activar compresión con consola o CLI](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-enable-compression.html) documenta los pasos de configuración.

Este ejemplo establece un umbral ilustrativo de 1 KiB para una REST API existente. Antes de ejecutarlo, instala y configura AWS CLI con credenciales que puedan modificar esa API (`apigateway:PATCH`); reemplaza `REST_API_ID` por su ID y `AWS_REGION` por la región donde está desplegada. La [referencia del comando `update-rest-api`](https://docs.aws.amazon.com/cli/latest/reference/apigateway/update-rest-api.html) documenta la sintaxis:

```bash
aws apigateway update-rest-api \
  --rest-api-id "$REST_API_ID" \
  --region "$AWS_REGION" \
  --patch-operations \
  op=replace,path=/minimumCompressionSize,value=1024
```

Despliega la API después de actualizarla para que el cambio llegue a la etapa que usan tus clientes. La propiedad admite valores desde `0` hasta `10485760` bytes. Con `0`, API Gateway intenta comprimir cualquier respuesta que cumpla las condiciones; los cuerpos pequeños pueden terminar ocupando más espacio y la compresión/descompresión puede aumentar la latencia y el uso de CPU. Por eso, mide antes y después en vez de asumir un porcentaje de ahorro.

Cuando API Gateway devuelve una respuesta comprimida, el tamaño comprimido es el que se factura para la transferencia de datos, según la guía para [recibir una respuesta comprimida](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-receive-response-with-compressed-payload.html).

Prioriza JSON, XML y HTML con contenido repetido. Imágenes, audio, video y otros formatos ya comprimidos suelen obtener poco beneficio. Si el backend ya entrega un cuerpo comprimido y un encabezado `Content-Encoding`, API Gateway asume que el cuerpo está comprimido y no vuelve a comprimirlo.

**Si usas HTTP API:** no busques `minimumCompressionSize` en esa API; la función documentada es para REST. Si el backend comprime la respuesta, valida en una prueba que el cliente reciba el cuerpo y el encabezado `Content-Encoding` correctos. No copies la configuración de REST API sin comprobar el flujo completo.

## Reduce respuestas innecesarias y solicitudes repetidas

La forma más sencilla de mover menos datos puede ser no producirlos. Revisa si el cliente necesita todos los campos; ofrece paginación para listas grandes; evita enviar bloques repetidos que el cliente ya conoce; y acuerda límites razonables para respuestas. Una transformación con VTL puede ajustar el contrato de una REST API, pero añade lógica de mapeo que debes mantener y probar. No acortes nombres de parámetros ni cambies el método HTTP solo para ahorrar unos pocos bytes sin medir el efecto.

La caché requiere distinguir dos capas:

- La caché de etapa de API Gateway está disponible para REST APIs y puede reducir llamadas al backend. Se cobra por hora según la capacidad y no evita que API Gateway envíe cada respuesta al cliente; evalúa el costo junto con los aciertos de caché y el trabajo del backend. AWS la describe como *best effort* en su [documentación de caché para REST APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html).
- CloudFront delante de una API puede servir respuestas reutilizables sin volver a llamar al origen. Puede reducir solicitudes y transferencia desde API Gateway, pero suma cargos de CloudFront y solo funciona si la política de caché respeta autenticación, datos personales, encabezados y frescura. Compara el costo total de la [distribución de CloudFront](https://aws.amazon.com/cloudfront/pricing/) con el patrón real de acceso.

Si gestionas la infraestructura como código, el repositorio [Ejemplo de caché en API Gateway con AWS CDK](https://github.com/hsaenzG/APIGatewayCacheImplementation-CDK) muestra una implementación por endpoint. Revisa los recursos que despliega y el costo de la capacidad de caché antes de usarlo.

Si todavía estás definiendo la arquitectura, la [guía para crear APIs serverless con AWS Lambda y API Gateway](/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/) recorre el armado de esa integración. Para separar cargos de red por servicio y tipo de uso, continúa con [cómo usar AWS Cost Explorer para tráfico de red](/blog/como-usar-aws-cost-explorer-para-trafico-de-red/).

## No uses API Gateway como tubería de archivos grandes

Las HTTP APIs tienen una cuota de payload de 10 MB que no se puede aumentar; en REST APIs, el cuerpo de una solicitud tiene el mismo límite y una respuesta almacenada (*buffered*) también está limitada a 10 MB. La respuesta transmitida de una REST API es la excepción descrita abajo. Consulta las [cuotas de HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html) y las [cuotas generales de API Gateway](https://docs.aws.amazon.com/general/latest/gr/apigateway.html). Si una carga supera el límite del modo que usas, puedes encontrar `413 Request Entity Too Large` o fallos de integración.

Para una carga o descarga de objetos, suele ser más simple que tu API autorice la operación y entregue al cliente una URL prefirmada; el cliente transfiere el archivo directamente a S3. Una URL prefirmada otorga acceso temporal con los permisos de quien la creó, así que limita el objeto y la duración, protege el bucket y valida el archivo después de recibirlo. Consulta la [guía oficial de carga y descarga con URLs prefirmadas](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

Si necesitas generar una respuesta dinámica mayor que el límite almacenado, REST API también admite *response streaming* en integraciones `HTTP_PROXY` y `AWS_PROXY`. Esa modalidad transmite respuestas, no solicitudes; para datos por encima de 10 MB aplica un límite de 2 MB/s. No usa la caché de endpoint ni la compresión de respuesta administrada por API Gateway, y puede tener cargos adicionales. En ese caso, comprime desde el backend si corresponde y revisa las restricciones en la [guía de transmisión de respuestas](https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html). Para una carga grande hacia S3, la URL prefirmada sigue siendo la opción directa.

## Comprueba el resultado y resuelve fallas comunes

Prueba con solicitudes y respuestas del tamaño y tipo de contenido que produce tu aplicación. Por ejemplo, este `GET` pide gzip, muestra los encabezados y descarta el cuerpo mientras registra los bytes de payload descargados:

```bash
curl --silent --show-error \
  -H 'Accept-Encoding: gzip' \
  --dump-header - \
  --output /dev/null \
  --write-out '\nstatus=%{http_code} bytes=%{size_download} time=%{time_total}s\n' \
  'https://{api-id}.execute-api.{region}.amazonaws.com/{stage}/items'
```

Sustituye los componentes entre llaves por la URL de tu API. Repite la solicitud con `Accept-Encoding: identity` y el mismo recurso, autenticación y datos. No agregues `--compressed`: al enviar `Accept-Encoding` manualmente, curl conserva el cuerpo gzip sin descomprimirlo. Comprueba `Content-Encoding: gzip` y compara `size_download`, que cuenta los bytes del cuerpo sin los encabezados. Es una medición de la respuesta de prueba, no un sustituto de la factura. Si la respuesta depende de la hora, el usuario o datos cambiantes, usa una ruta de prueba estable.

Registra una línea de base y repite la misma prueba después del cambio, manteniendo iguales la región, la integración y el tráfico. Verifica el encabezado `Content-Encoding`, los bytes recibidos, la latencia total, la latencia de integración y la tasa de errores.

En HTTP APIs, la métrica de CloudWatch `DataProcessed` informa bytes procesados y sirve como señal de volumen; no reemplaza los datos de facturación. Para confirmar el efecto monetario, compara el cargo de API Gateway por período y región en Cost Explorer o en un informe de costos y uso. La [documentación de métricas de HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-metrics.html) describe `DataProcessed`, `Count`, `Latency` e `IntegrationLatency`.

Si una respuesta sigue llegando sin comprimir, revisa en este orden:

1. La API es REST y el cambio se desplegó en la etapa invocada.
2. El cliente envía `Accept-Encoding` con una codificación compatible y el cuerpo supera el umbral configurado.
3. El tipo de contenido y la respuesta de integración admiten el comportamiento esperado; confirma si el backend ya envía `Content-Encoding`.
4. El cliente descomprime gzip/deflate antes de interpretar el cuerpo.
5. Si aparece un `413`, mide el payload y confirma si estás usando la modalidad almacenada o una respuesta transmitida compatible.

## Recursos en español y comunidad

- La grabación [La Amenaza del Nivel 100: Amazon API Gateway](https://www.youtube.com/watch?v=p1otaxU9pOI), de AWS Women Colombia User Group, ofrece una sesión en español sobre el servicio.
- El [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) publica encuentros y espacios de conversación sobre serverless.
- Si lees esto antes del 8 de octubre de 2026, [Cloud Builders 04](https://www.meetup.com/aws-sbg-at-pan-american-university-cdmx/events/316387395/) es una sesión híbrida desde Ciudad de México para construir una API con Lambda, API Gateway y DynamoDB. Consulta en Meetup el horario local, el acceso en línea y la disponibilidad de registro.

La decisión útil no es comprimir todo ni migrar todas las APIs: identifica qué componente de la factura quieres cambiar, prueba la ruta que lo genera y conserva la alternativa que cumpla tus requisitos de latencia, seguridad y disponibilidad con menor costo total.
