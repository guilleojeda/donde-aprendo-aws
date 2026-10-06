---
title: "Correlación de eventos en AWS: IDs, EventBridge y CloudWatch"
description: "Sigue una operación entre servicios con correlationId, causationId y traceId; consulta CloudWatch Logs Insights y distingue EventBridge, Step Functions y persistencia."
author: "guille-ojeda"
publishedAt: "2024-12-26"
publishedTimestamp: "2024-12-26T19:07:36.754Z"
modifiedTimestamp: "2026-10-06T13:57:53-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
  - title: "AWS X-Ray: trazas, diagnóstico y OpenTelemetry"
    url: "https://dondeaprendoaws.com/blog/aws-x-ray-herramientas-de-depuracion-y-rastreo-distribuido/"
  - title: "AWS Step Functions: qué es y cómo elegir Standard o Express"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-aws-step-functions/"
---

Cuando una solicitud pasa por API Gateway, Lambda, una cola y otros servicios, cada componente registra identificadores distintos. Para reconstruir **qué pasó con una misma operación**, define un identificador de correlación y propágalo en los eventos y registros. Ese ID ayuda a encontrar datos relacionados; por sí solo no explica qué evento causó a otro ni cuánto tardó cada llamada.

En AWS, las piezas cumplen funciones diferentes: **EventBridge enruta eventos**, **Step Functions coordina una ejecución** y **CloudWatch Logs Insights consulta registros que ya se guardaron**. Separar esas funciones evita esperar una unión histórica automática del bus o tratar el historial de un flujo como un registro permanente del negocio.

## Correlation ID, causation ID, trace ID y request ID

Elige cada identificador según la pregunta que necesitas responder:

| Identificador | Qué relaciona | Alcance |
| --- | --- | --- |
| `correlationId` | Registros y eventos de una misma operación lógica, como procesar un pedido. | Lo define la aplicación y lo conserva en cada salto, incluso si el trabajo continúa de forma asíncrona. |
| `causationId` | El evento o comando que produjo directamente otro evento. | Lo agrega el productor al publicar el nuevo evento; sirve para reconstruir una cadena de causas. |
| `id` de EventBridge | Un evento concreto dentro del bus. | EventBridge genera un ID único para cada evento; no es el ID compartido por todos los eventos de una operación. |
| `traceId` | El recorrido instrumentado de una solicitud y sus segmentos o *spans*. | Lo gestiona el sistema de trazas, como OpenTelemetry con AWS X-Ray como destino. La propagación depende de la instrumentación y del transporte. |
| `requestId` | Una solicitud o invocación registrada por un servicio, por ejemplo una invocación de Lambda. | Suele ser local a un servicio o intento; cambia entre componentes y no reemplaza un ID de negocio. |

Un `correlationId` no es un identificador de causa: varios eventos pueden compartirlo sin que uno haya originado directamente al otro. Tampoco es una clave de idempotencia. Si un consumidor repite un efecto después de un reintento, necesita comprobar una clave de idempotencia o un ID de evento procesado y guardar esa comprobación junto con el cambio de negocio.

Para instrumentar trazas, el [modelo de AWS X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-concepts.html) describe cómo se reúnen segmentos con el mismo ID de traza. La traza muestra el camino y los tiempos observados; no conviene usarla como identificador duradero de una orden o como prueba de que todas las llamadas quedaron registradas. Para una implementación nueva, consulta también la guía interna sobre [X-Ray y OpenTelemetry](/blog/aws-x-ray-herramientas-de-depuracion-y-rastreo-distribuido/), que explica el estado actual de los SDK y las opciones de instrumentación.

## Qué hace cada servicio

| Necesidad | Servicio o capacidad | Límite que conviene recordar |
| --- | --- | --- |
| Enviar cada evento a destinos según su contenido | [Amazon EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-bus.html) evalúa patrones cuando llegan eventos y los envía a los destinos configurados. | Una regla filtra y enruta el evento actual; no busca automáticamente eventos anteriores para unirlos por `correlationId`. |
| Retener y volver a procesar eventos | Un [archivo de EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-archive.html) conserva los eventos seleccionados durante el período configurado y permite reproducirlos. | El *replay* vuelve a enviar eventos al bus y no es una consulta que una registros. AWS advierte que no necesariamente conserva el orden en que los eventos entraron al archivo; los consumidores pueden ejecutar otra vez sus efectos. |
| Coordinar pasos de un proceso | [AWS Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-statemachines.html) conserva el contexto de una ejecución y pasa datos JSON entre estados. | El [historial de Standard](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-view-execution-details.html) está disponible durante 90 días después de completarse. Express necesita registros de CloudWatch para consultar ejecuciones. Ninguno sustituye el almacenamiento duradero del estado de negocio. |
| Buscar registros históricos | [CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html) consulta campos de logs estructurados. Su comando [`join`](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-Join.html) combina fuentes por un campo común. | Es análisis de logs retenidos, no una correlación automática en tiempo real. `join` usa igualdad entre campos y puede examinar más datos; limita grupos y rango de tiempo. |

Para ver una explicación visual de reglas y buses, consulta la charla comunitaria [Introducción a arquitecturas orientadas a eventos y Amazon EventBridge](https://www.youtube.com/watch?v=TkU1RS5Fw1o), de Marcia en Desplegando Cloud. Si estás decidiendo entre publicar eventos o coordinar una secuencia, [¿Qué arquitectura es mejor para mi aplicación? Eventos o máquinas de estado?](https://www.youtube.com/watch?v=3UwgnYByOk8) presenta esa comparación.

El sobre de un evento de EventBridge incluye metadatos como `source`, `detail-type`, `time` e `id`; `detail` contiene los campos propios de la aplicación. El [esquema de eventos de AWS](https://docs.aws.amazon.com/eventbridge/latest/ref/events-structure.html) describe esos campos. El ID superior identifica el evento, mientras que el `correlationId` de `detail` puede mantenerse igual en varios eventos.

## Ejemplo: seguir un pedido entre servicios

Supongamos que una tienda acepta un pedido, reserva inventario y luego envía una notificación. Para concretar la regla, el ejemplo usa el modelo de reglas y destinos del **Custom Event Bus - Classic**. El [bus clásico y el Custom Event Bus actual](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-bus.html) tienen interfaces distintas; este patrón no configura una suscripción del bus nuevo, que se administra con [suscriptores](https://docs.aws.amazon.com/us_en/eventbridge/latest/userguide/eb-custom-bus-subscribers.html). Antes de propagar IDs, establece estas condiciones:

1. La API genera un `correlationId` al iniciar la operación lógica. Si el cliente propone uno, la aplicación lo valida o lo reemplaza; no uses datos personales como identificador.
2. Cada productor y consumidor conserva ese valor en el evento y lo escribe en logs JSON estructurados.
3. Cada nuevo evento recibe su propio ID. El productor puede copiar el ID del evento o comando que lo provocó en `causationId`.
4. Cada consumidor protege los efectos repetibles con una clave de idempotencia independiente del `correlationId`.

El sobre simplificado que recibe el destino de la regla podría verse así; omití otros metadatos del evento para centrar el ejemplo en los IDs:

```json
{
  "version": "0",
  "id": "d3c64b80-40c6-4cc3-85f2-7b29847e93aa",
  "source": "com.tienda.pedidos",
  "detail-type": "PedidoAceptado",
  "detail": {
    "orderId": "ord-8042",
    "correlationId": "corr-93b61f",
    "causationId": "cmd-4c129a"
  }
}
```

En este ejemplo, EventBridge genera `id` para ese evento. La regla puede enrutar por el productor y el tipo de evento, mientras la aplicación copia el `correlationId` al siguiente paso:

```json
{
  "source": ["com.tienda.pedidos"],
  "detail-type": ["PedidoAceptado"]
}
```

Si la regla inicia Step Functions, pasa `orderId`, `correlationId` y el `id` del evento recibido como entrada de la ejecución. Configura la entrada y salida de los estados para conservar esos campos cuando invoquen otro servicio. El log de inventario conserva el ID y los datos de causa del `PedidoAceptado` que consume:

```json
{
  "service": "inventario",
  "eventType": "PedidoAceptado",
  "message": "reserva_confirmada",
  "orderId": "ord-8042",
  "correlationId": "corr-93b61f",
  "eventId": "d3c64b80-40c6-4cc3-85f2-7b29847e93aa",
  "causationId": "cmd-4c129a",
  "traceId": "1-5759e988-bd862e3fe1be46a994272793",
  "requestId": "8e8fa234-39b0-4ac4-9f9d-e8b08b5f8dd9"
}
```

En ese log, `eventId` es el `id` del `PedidoAceptado` consumido y `causationId` conserva el campo del mismo evento. Si inventario publica un evento nuevo, por ejemplo `ReservaConfirmada`, EventBridge le asigna otro `id`; en el nuevo `detail.causationId`, el productor apunta al `id` de `PedidoAceptado` y conserva el mismo `correlationId`. Así puedes buscar toda la operación con el ID de correlación y seguir el vínculo directo con el ID de causa.

Al ejecutar esta consulta en Logs Insights, selecciona los grupos de logs que escriben la API y los consumidores, y acota el período a la operación investigada:

```text
fields @timestamp, service, message, orderId, eventId, causationId, traceId
| filter correlationId = "corr-93b61f"
| sort @timestamp asc
| limit 100
```

Logs Insights descubre campos en muchos logs JSON. Si dos grupos tienen el mismo `correlationId`, puedes consultarlos juntos; cuando necesitas combinar sus filas, el comando `join` documenta esa operación y sus límites. Ordenar por `@timestamp` ayuda a leer los registros, pero no demuestra por sí solo la causalidad ni garantiza el orden de llegada entre sistemas distribuidos. Conserva `causationId` o una versión de secuencia del agregado cuando el orden del negocio importe. Limita el rango temporal y los grupos consultados: AWS advierte que las consultas que escanean muchos datos pueden generar más cargos.

Para evaluar la confiabilidad del recorrido, define un indicador por operación de negocio, como pedidos confirmados sobre pedidos válidos aceptados. Contar filas de logs o invocaciones no equivale a contar pedidos: un mismo pedido puede generar varios eventos y reintentos. La guía de [SLI, SLO y presupuesto de error en AWS](/blog/diferencias-entre-sla-y-slo-en-aws/) ayuda a elegir la meta y la ventana de evaluación.

Si el volumen histórico debe conservarse más allá de la retención de logs o del archivo de eventos, define por separado el almacenamiento, la retención y los controles de acceso. EventBridge puede reproducir un archivo configurado; Step Functions puede mostrar el estado e historial de una ejecución según su tipo; ninguno crea automáticamente un registro de negocio de largo plazo. Para profundizar en el modelado de eventos, consulta [Arquitectura dirigida por eventos en AWS](/blog/arquitecturas-dirigidas-por-eventos-en-aws/) y la [guía de Step Functions](/blog/comprendiendo-aws-step-functions/).

## Reintentos, duplicados y orden

Un destino de una regla clásica de EventBridge puede recibir reintentos, y AWS documenta que la misma regla puede ejecutarse más de una vez para un evento. Si una entrega agota sus reintentos, se descarta salvo que configures una cola de mensajes fallidos (DLQ); consulta las guías de [reintentos para reglas clásicas](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html) y de [reintentos y DLQ para el Custom Event Bus](https://docs.aws.amazon.com/us_en/eventbridge/latest/userguide/eb-custom-bus-retry.html). Los valores predeterminados y el alcance de cada garantía dependen del bus: si configuras una clave de deduplicación o deduplicación por contenido, el Custom Event Bus puede suprimir una publicación repetida durante cinco minutos y entregar en orden dentro de grupos FIFO. Esas capacidades no hacen idempotente el efecto de negocio ni cubren repeticiones fuera de su ventana o grupo; revisa los detalles de [orden y deduplicación](https://docs.aws.amazon.com/us_en/eventbridge/latest/userguide/eb-custom-bus-ordering.html).

La correlación permite encontrar registros; la idempotencia protege un efecto de negocio. Por ejemplo, el consumidor puede guardar el `eventId` que procesa junto con la reserva de inventario en una transacción, o usar una clave idempotente del productor cuando una misma operación pueda publicarse con nuevos IDs de evento. No uses el `correlationId` como única clave de deduplicación: una orden válida puede producir varios eventos distintos.

No asumas un orden global. Si el negocio exige procesar cambios de una misma orden en secuencia, agrega una versión o número de secuencia al evento y configura un mecanismo cuya garantía sea explícita. EventBridge documenta suscripciones FIFO por grupo en el Custom Event Bus; esa garantía se limita al grupo y al camino configurado, no convierte todo el flujo en una única secuencia. En una suscripción FIFO del Custom Event Bus que invoque Lambda de forma asíncrona (`InvocationType=EVENT`), AWS garantiza el orden solo hasta la entrega a la cola asíncrona de Lambda. Para procesamiento ordenado, la documentación indica `REQUEST_RESPONSE`; comprueba la modalidad del destino además del grupo. Los *replays* de archivo tampoco necesariamente reproducen el orden de ingreso. Las marcas de tiempo ayudan a investigar, pero no reemplazan la relación de causa ni el orden definido por el productor.

Step Functions también puede reintentar tareas mediante su definición. Si una tarea llama a una API, escribe en una base de datos o publica otro evento, diseña el efecto para tolerar una repetición. La [guía de eventos y colas en AWS](/blog/arquitecturas-dirigidas-por-eventos-en-aws/) desarrolla este patrón con consumidores idempotentes, DLQ y orden explícito.

## Cuando el caso es de seguridad

No todos los eventos son registros de aplicación. CloudTrail registra actividad de la cuenta, incluidas llamadas a APIs observables; AWS aclara que sus archivos no son una traza de llamadas ordenada. [Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html) recibe y normaliza hallazgos de servicios integrados. Además, Security Hub puede correlacionar señales de seguridad para generar [hallazgos de exposición](https://docs.aws.amazon.com/securityhub/latest/userguide/exposure-findings.html). Son capacidades útiles para investigar postura y riesgo de seguridad, pero no sustituyen el ID de una operación de aplicación ni unen automáticamente cualquier log. Para ver un ejemplo comunitario de respuesta a incidentes, consulta la grabación [Nadie apretó un botón: respuesta automática a incidentes con servicios nativos de AWS](https://www.youtube.com/watch?v=kiz4Ls7YRm0), del AWS Security Users Group LatAm. También puedes revisar los conceptos de [CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-concepts.html).

## Comunidades y recursos en español

Para conversar sobre seguridad AWS, [AWS User Group Security Ecuador en Meetup](https://www.meetup.com/aws-user-group-security-ecuador/) reúne a profesionales y personas que están aprendiendo; revisa en la página el calendario y las condiciones de cada encuentro. El [canal de AWS Security Users Group LatAm](https://www.youtube.com/@AWSSecurityLATAM) ofrece grabaciones sobre seguridad en AWS para público hispanohablante. La [agenda de eventos de Dónde Aprendo AWS](/eventos/) permite explorar encuentros por país y modalidad, y el [directorio de AWS User Groups](/comunidades/user-groups/) ayuda a encontrar grupos locales. La fecha, el idioma, la modalidad, los cupos y el costo dependen de cada actividad; confírmalos en su página de inscripción.
