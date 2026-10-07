---
title: "Trazas distribuidas en AWS con X-Ray y OpenTelemetry"
description: "Aprende a seguir solicitudes con AWS X-Ray, entender segmentos, spans y muestreo, y enviar trazas actuales con OpenTelemetry y ADOT."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:29:48.795Z"
modifiedTimestamp: "2026-10-07T00:03:47-03:00"
review:
  date: "2026-10-07"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []
---

Para encontrar por qué una solicitud falla o tarda dentro de una aplicación distribuida, sigue su recorrido con una traza. **AWS X-Ray** recibe y muestra trazas de aplicaciones instrumentadas; para instrumentar código nuevo, AWS recomienda **OpenTelemetry (OTel)** y su distribución **ADOT**. Desde el 25 de febrero de 2026, los SDK de X-Ray y su daemon están en modo de mantenimiento: AWS limita sus versiones a correcciones de seguridad y ya no agrega funciones, según el [cronograma del SDK y daemon](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-daemon-timeline.html). Ese aviso se refiere a esos componentes; X-Ray sigue siendo un destino para trazas de OpenTelemetry.

## Qué muestra una traza distribuida

Una traza reúne el trabajo generado por una solicitud y lo conecta mediante un mismo identificador de traza. Cada paso medido es un **span**: registra su inicio, duración, resultado y atributos. En X-Ray, esos pasos se representan como **segmentos** y **subsegmentos**. Al exportar spans de OpenTelemetry a X-Ray, los spans de servidor se convierten en segmentos y los demás, normalmente llamadas a dependencias, en subsegmentos.

El **mapa de servicios** resume qué componentes participaron y cómo se relacionan. Al abrir una traza puedes ver una línea de tiempo con la duración de cada segmento y subsegmento. La vista depende de los datos que enviaron tus componentes: un nodo o una llamada que no estén instrumentados no aparecerán por arte de magia. AWS explica el modelo en la [guía de conceptos de X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-concepts.html) y la [guía de migración a OpenTelemetry](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html).

Si prefieres una lectura inicial en español, [#100DíasdeAWS | Día 25 | AWS X-Ray](https://awswomencolombia.com/100diasdeaws-dia-25-aws-x-ray), de AWS Women Colombia, presenta el servicio y el concepto de trazado distribuido. Es material de 2023: sirve como introducción, pero no refleja el ciclo de vida actual de los SDK y el daemon.

Por ejemplo, una solicitud `POST /pedidos` puede pasar por `checkout`, consultar `inventario` y guardar la compra. La traza permite comparar el tiempo de cada llamada. Si la espera está en `inventario`, inspecciona esa dependencia; si el tramo que tarda es `checkout`, agrega spans dentro del código de esa operación para medir sus pasos. Es un ejemplo conceptual: cada aplicación necesita instrumentación y propagación de contexto compatibles.

| Concepto | Para qué sirve |
| --- | --- |
| Traza | Agrupa el trabajo relacionado con una solicitud. |
| Span | Mide una operación y puede tener spans hijos. |
| Segmento de X-Ray | Representa el trabajo de un servicio; suele corresponder a un span de servidor. |
| Subsegmento de X-Ray | Detalla una operación dentro del servicio, como una llamada a otra dependencia. |
| Mapa de servicios | Resume las relaciones y señales observadas entre componentes. |

Una traza tampoco reemplaza los logs o la auditoría. Las métricas ayudan a observar tendencias; los logs guardan eventos y contexto detallado; las trazas muestran el recorrido de una solicitud. X-Ray no es un registro de auditoría de cambios en la cuenta ni una alarma de seguridad. Para revisar eventos de API de AWS, usa [CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-events.html). Si quieres una explicación comunitaria de X-Ray, CloudWatch, CloudTrail y Config, consulta [La Amenaza del Nivel 100](https://www.youtube.com/watch?v=TfBZFzGokQM), grabación de AWS Women Colombia de 2021; sigue la documentación para los pasos actuales.

## Cómo se conectan los servicios

La propagación de contexto mantiene la relación entre spans creados por procesos distintos. OpenTelemetry usa W3C Trace Context de forma predeterminada; para integrarte con servicios que esperan el encabezado de X-Ray, puedes configurar el **X-Ray Propagator**. Si cada servicio genera un ID nuevo, o un componente no pasa el encabezado al siguiente, la traza queda separada en partes.

Los SDK de OpenTelemetry ofrecen instrumentación automática para determinados lenguajes, frameworks y bibliotecas. Eso puede crear spans para entradas HTTP y llamadas conocidas sin escribir un span a mano, pero la cobertura varía según el runtime y la biblioteca. La instrumentación automática tampoco conoce por sí sola qué pasos de negocio quieres comparar. Revisa la compatibilidad en la [guía de instrumentación de OpenTelemetry](https://opentelemetry.io/docs/concepts/instrumentation/) y agrega spans manuales para las operaciones importantes que falten. Para más contexto sobre entornos serverless, mira la grabación [Observabilidad en aplicaciones Serverless](https://www.youtube.com/watch?v=UdBDmelLlOQ), de Charlas Técnicas de AWS; la documentación actual de X-Ray y ADOT sigue siendo la referencia para configurarlos.

En la traza también puedes anotar datos para encontrar solicitudes, pero evita incluir credenciales, tokens, datos personales u otra información que no necesites. Mantén los atributos breves y revisa qué campos exporta la instrumentación automática.

## X-Ray y Transaction Search

El mapa y la línea de tiempo de X-Ray ayudan a seguir dependencias y tiempos entre servicios. Si activas **Transaction Search** en CloudWatch, los spans enviados a X-Ray también se ingieren como registros estructurados en el grupo `aws/spans`; puedes buscarlos y analizarlos con atributos. X-Ray indexa un porcentaje de esos spans como resúmenes de traza. Es una capacidad de búsqueda distinta del mapa de servicios: revisa sus [requisitos y precios de CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Transaction-Search.html) antes de habilitarla.

La decisión de muestreo determina qué trazas se registran en una configuración convencional de X-Ray u OpenTelemetry. Si una solicitud no fue muestreada, quizá no encuentres su traza aunque la aplicación haya funcionado. Ajusta el muestreo a tu volumen y a la clase de solicitudes que quieras investigar; no supongas que X-Ray y cada configuración de OpenTelemetry aplican la misma regla.

Si envías a través de la [nueva dirección OTLP de CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLPEndpoint.html), el patrón para trazas es `https://xray.<región>.amazonaws.com/v1/traces`. Esa ruta requiere que **Transaction Search** esté habilitado y que las solicitudes se firmen con AWS Signature Version 4 (SigV4). El [SDK ADOT sin collector](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLP-UsingADOT.html) está documentado para ciertos agentes y lenguajes; en esta opción, el muestreo predeterminado es del 100 %, así que decide qué porcentaje necesitas antes de usarla en producción.

## Enviar trazas con ADOT

Para una aplicación instrumentada con OpenTelemetry, un **ADOT Collector** puede recibir datos OTLP, procesarlos y usar el exportador `awsxray` incluido en la distribución ADOT para enviarlos a X-Ray. Si ya administras el agente de CloudWatch en EC2 o en servidores propios, su versión 1.300025.0 o posterior también puede recibir trazas de OpenTelemetry. AWS documenta ambos recorridos y pasos específicos para EC2, ECS y Elastic Beanstalk en su [guía de migración desde el daemon de X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html).

Este ejemplo mínimo recibe OTLP por HTTP en el mismo host y usa `us-east-1` como región de exportación. Cambia la región y el punto de entrada para que coincidan con tu entorno:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 127.0.0.1:4318

processors:
  batch:

exporters:
  awsxray:
    region: us-east-1

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [awsxray]
```

Configura el cliente OTLP de tu aplicación para enviar trazas por HTTP/Protobuf al collector. Si el SDK admite las variables estándar de OpenTelemetry, usa el endpoint específico de trazas:

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://127.0.0.1:4318/v1/traces"
export OTEL_EXPORTER_OTLP_TRACES_PROTOCOL="http/protobuf"
```

Con el endpoint general `OTEL_EXPORTER_OTLP_ENDPOINT`, en cambio, se configura la URL base `http://127.0.0.1:4318`: el exporter añade la ruta de cada señal. La [especificación del exporter OTLP](https://opentelemetry.io/docs/specs/otel/protocol/exporter/) explica esta diferencia, que evita repetir `/v1/traces` en la URL.

Ese destino es el receptor local del collector, no el endpoint regional de X-Ray. La dirección local funciona si la aplicación y el collector comparten el mismo espacio de red, por ejemplo, en un host común, en contenedores de una tarea ECS con modo `awsvpc` o en contenedores de un mismo pod de Kubernetes. En modo bridge o si están en tareas, pods o hosts separados, cambia **tanto** el punto de enlace del receptor (por ejemplo, a `0.0.0.0:4318`) como la dirección del cliente, y limita el acceso a la red privada y a los emisores autorizados. No publiques el receptor en Internet.

El rol de la instancia o tarea que ejecuta el collector debe permitir escribir segmentos en X-Ray (`xray:PutTraceSegments`). AWS también documenta permisos adicionales para telemetría, muestreo remoto y otras señales: agrega solo los que necesite la configuración elegida. Si usas un muestreador remoto de X-Ray, el collector o SDK también necesitará permisos de lectura para sus reglas y objetivos de muestreo. Consulta la [lista de permisos de ADOT](https://aws-otel.github.io/docs/setup/permissions/) y la guía de AWS para la plataforma donde lo ejecutarás. El exporter usa la región configurada para el servicio X-Ray; no reemplaces `region` con la URL OTLP anterior, porque son rutas de exportación distintas.

## Diagnosticar una traza vacía o incompleta

Cuando no aparece la solicitud esperada, revisa estos puntos en orden:

1. **Cuenta, región y hora.** Confirma que buscas en la región que recibe la traza y en el intervalo de tiempo correcto.
2. **Muestreo.** Revisa qué componente toma la decisión y si la solicitud fue seleccionada. Si no se registra, X-Ray no puede mostrarla.
3. **Propagación.** Compara el ID de traza en cada servicio y verifica que el contexto viaje en el encabezado HTTP o mensaje adecuado. Usa el propagador X-Ray cuando debas interoperar con servicios que leen `X-Amzn-Trace-Id`; W3C es el formato predeterminado de OpenTelemetry.
4. **Instrumentación.** Comprueba que el framework y el cliente HTTP, de base de datos o AWS SDK tengan instrumentación compatible. Si falta un paso propio de negocio, crea un span manual.
5. **Exportación e IAM.** Revisa los logs del collector, su conexión con el endpoint regional, las credenciales de su rol y `xray:PutTraceSegments`. En una migración, no dejes el daemon antiguo escuchando en el mismo puerto que el collector o agente nuevo: AWS advierte que puede causar un conflicto.
6. **Correlación con logs.** Si la traza te lleva a un error, abre el evento de aplicación correspondiente. Para enlazar spans con CloudWatch Logs debes configurar los atributos y la integración de logs; no ocurre automáticamente en toda aplicación. La [guía para diagnosticar problemas con CloudWatch](https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/) muestra cómo seguir un ID de traza desde los logs y contrastarlo con otras señales.

Si el flujo usa Step Functions, habilita el trazado de la máquina de estados y comprueba que el encabezado de traza se propague desde el servicio anterior cuando necesites una sola traza. X-Ray admite Standard y Express; no incluye las ejecuciones hijas iniciadas por un estado Distributed Map. La [documentación de trazas de Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-xray-tracing.html) detalla estos límites. Para inspeccionar estados, fallos y datos del flujo de trabajo, sigue la [guía para monitorear y depurar Step Functions con CloudWatch](https://dondeaprendoaws.com/blog/monitoreo-y-logs-de-aws-step-functions-guia-2024/). El historial y los logs de la máquina complementan las trazas de sus dependencias.

Si quieres ver un ejemplo de diagnóstico en español, mira [Cómo debuggear tu aplicación en la nube usando X-Ray y Trazas](https://www.youtube.com/watch?v=VO3_dcOzcDc), de [Marcia en Desplegando Cloud](https://www.youtube.com/@marcia_). La grabación ayuda a seguir el recorrido de investigación; confirma la configuración actual en la documentación de AWS.

Para ampliar la práctica, [Cloud Forge: Observabilidad, Ingeniería del Caos y Java en AWS](https://www.youtube.com/watch?v=CL7jJfyg6bg), del AWS User Group Medellín, conecta observabilidad con fallos controlados en sistemas distribuidos. Es una charla grabada sobre observabilidad, caos y Java, no un tutorial de configuración de X-Ray.

## Sigue aprendiendo en comunidad

Si quieres seguir grabaciones y participar en encuentros, revisa el [archivo de eventos de AWS Women Colombia](https://awswomencolombia.com/page/eventos) y su [grupo en Meetup](https://www.meetup.com/aws-women-colombia-user-group/). El archivo enlaza también su canal de [YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw); las fechas y los temas cambian, así que confirma la agenda antes de inscribirte. El [canal de AWS User Group Medellín](https://www.youtube.com/@awsugmed) publica charlas comunitarias y su [grupo en Meetup](https://www.meetup.com/awsugmed/) mantiene un calendario de actividades. Revisa las fichas para confirmar si una sesión próxima trata trazas u observabilidad.
