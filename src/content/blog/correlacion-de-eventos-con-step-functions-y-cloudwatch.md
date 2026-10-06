---
title: "Cómo correlacionar eventos en AWS con correlationId"
description: "Propaga correlationId con EventBridge y Step Functions, búscalo en CloudWatch Logs y separa la trazabilidad de la persistencia y la idempotencia."
author: "guille-ojeda"
publishedAt: "2025-03-17"
publishedTimestamp: "2025-03-17T03:58:59.832000+00:00"
modifiedTimestamp: "2026-10-06T13:57:35-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS Step Functions: qué es y cómo elegir Standard o Express"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-aws-step-functions/"
  - title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
  - title: "Cómo conectar alarmas de CloudWatch con EventBridge"
    url: "https://dondeaprendoaws.com/blog/cloudwatch-y-eventbridge-integracion/"
---

Si un pedido activa varios servicios, un `correlationId` estable te ayuda a encontrar los registros y ejecuciones que pertenecen al mismo proceso. En este diseño, **Amazon EventBridge recibe y enruta eventos, AWS Step Functions coordina el trabajo, Amazon CloudWatch Logs permite buscar actividad y un almacén persistente conserva el estado de negocio que necesitas consultar**.

Usa además un `eventId` distinto para identificar cada evento y el `executionArn` que Step Functions asigna a cada ejecución. Esos tres valores describen cosas diferentes: un proceso de negocio, un evento individual y una ejecución concreta.

## Define los identificadores antes de conectar servicios

Supón que el pedido `8421` genera eventos cuando se confirma, se prepara y se envía. Los tres comparten `correlationId: "pedido-8421"`, pero cada uno tiene su propio `eventId`. Si un evento vuelve a publicarse por un reintento, conserva el mismo `eventId`; si ocurre un nuevo hecho de negocio, crea otro.

Un productor puede publicar detalles como estos en EventBridge:

```json
{
  "source": "com.ejemplo.pedidos",
  "detail-type": "PedidoActualizado",
  "detail": {
    "correlationId": "pedido-8421",
    "eventId": "evt-01",
    "eventType": "confirmado",
    "pedidoId": "8421"
  }
}
```

EventBridge agrega metadatos al evento, incluido `id`, un identificador único generado por el servicio. Ese `id` sirve para seguir **un evento** por reglas y destinos; no agrupa por sí solo varios hechos del mismo pedido. Conserva el `correlationId` de negocio en `detail` y no lo reemplaces por el `id` del sobre de EventBridge. [La referencia de estructura de eventos de AWS describe ambos campos](https://docs.aws.amazon.com/eventbridge/latest/ref/events-structure.html).

Si el evento de origen es de un servicio AWS y no trae un `correlationId`, elige una clave de negocio que realmente identifique el proceso, si existe. Cuando solo puedas identificar ese hecho puntual, usa el identificador del evento para rastrearlo y evita fingir que representa una correlación entre varios hechos.

Una regla puede seleccionar, por ejemplo, los eventos de pedido confirmado con este patrón:

```json
{
  "source": ["com.ejemplo.pedidos"],
  "detail-type": ["PedidoActualizado"],
  "detail": {
    "eventType": ["confirmado"]
  }
}
```

EventBridge compara el patrón con los metadatos y los campos de `detail`, y envía al destino los eventos que coinciden. [Consulta cómo crear patrones de eventos](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html).

## Qué hace cada servicio

| Parte del flujo | Responsabilidad | Qué guardar o transmitir |
| --- | --- | --- |
| Ingesta y enrutamiento | EventBridge recibe el evento y una regla decide si lo envía al destino configurado. | El evento original, con `correlationId` y `eventId` en `detail`. |
| Orquestación | Step Functions coordina estados y tareas; la forma de su entrada depende de cómo configures el destino de EventBridge. | Conserva los identificadores de cada evento y pásalos explícitamente a las tareas que los necesiten. |
| Persistencia | Un almacén persistente registra estados de negocio, resultados y claves de idempotencia. | Por ejemplo, `correlationId`, `eventId`, `executionArn`, estado y fecha de actualización. |
| Consulta operativa | CloudWatch Logs almacena registros de ejecución y de aplicación que puedes buscar con Logs Insights. | Registros estructurados con los identificadores que quieras consultar. |

Una regla puede iniciar directamente una máquina de estados de Step Functions. Antes de definir las rutas del flujo, comprueba la forma de entrada del destino y conserva `correlationId` y `eventId` al transformarla. El destino Step Functions que usa `StepFunctionsParameters` inicia una ejecución por lote y entrega sus eventos en un array JSON; `BatchConfiguration.MaxBatchSize: 1` limita el lote a un evento, pero la entrada sigue siendo un array. Si el lote puede contener varios eventos, usa un estado `Map` para procesarlos todos y llevar cada par de identificadores a su tarea; un lote puede reunir distintos `correlationId`. [Step Functions usa `Map` para procesar cada elemento de un array](https://docs.aws.amazon.com/step-functions/latest/dg/state-map.html). Consulta también [la referencia del destino Step Functions y su batching](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-target-sfn.html) y [cómo transformar entradas de EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-transform-target-input.html).

Cuando el payload que recibe la máquina tiene forma de objeto, una rama `Choice` puede leer `$.detail.eventType` para decidir qué tarea ejecutar. Esa ruta no sirve para una entrada que es un array: usa `Map` para recorrerla y pasa el `correlationId` y el `eventId` de cada elemento a sus tareas. Si una tarea invoca Lambda, una API u otro servicio, transmite ambos valores explícitamente. Para ver un ejemplo de una tarea que llama a una API con Step Functions y SAM, consulta [esta guía en español](https://www.andmore.dev/es/blog/http-invoke-with-sam/). Si el proceso publica un nuevo evento, conserva el `correlationId` y asigna un `eventId` para ese nuevo hecho.

Para ampliar el tema de las integraciones directas desde Step Functions, mira la [sesión de AWS Women Colombia sobre integración de servicios](https://www.youtube.com/watch?v=Je-7jIzLdJA).

La diferencia importa: un mismo pedido puede originar varios eventos y, por tanto, varias ejecuciones. El `executionArn` identifica una de ellas; no sustituye a la clave que conecta todo el proceso. Para una explicación de EventBridge, SNS y SQS y de sus responsabilidades, continúa con [la guía de arquitectura dirigida por eventos en AWS](https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/).

## Elige Standard o Express según la ejecución

| Tipo de flujo | Historial y entrega | Encaja cuando… |
| --- | --- | --- |
| Standard | Step Functions conserva el historial de ejecución durante 90 días. Su modelo es exactamente una vez, salvo que la definición incluya reintentos. | Necesitas consultar el recorrido de cada ejecución o coordinar procesos largos. |
| Express asíncrono | Step Functions no conserva el historial de ejecución; el modelo de entrega es al menos una vez. Configura CloudWatch Logs para consultar eventos, sabiendo que la entrega de esos registros es de mejor esfuerzo. | Procesas cargas cortas y puedes hacer idempotentes las tareas. |
| Express síncrono | Step Functions no conserva el historial de ejecución; el modelo es como máximo una vez. | El invocador espera el resultado y tu flujo se ajusta a ese modo. |

Los historiales de Standard están disponibles por la API hasta 90 días después de completarse. Express no registra su historial dentro de Step Functions: para verlo debes habilitar CloudWatch Logs. AWS advierte que la integridad y puntualidad de la entrega de esos registros no están garantizadas; si necesitas conservar cada resultado, registra los datos del flujo en almacenamiento apropiado. [Compara los tipos de flujo](https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html) y [los detalles de su historial y registro](https://docs.aws.amazon.com/step-functions/latest/dg/cw-logs.html).

La operación `StartExecution` tampoco deduplica ambos tipos por igual. Es idempotente para Standard si se repiten el mismo nombre y la misma entrada mientras esa ejecución sigue abierta; no lo es para Express. Un `correlationId` que abarca varios eventos no debe usarse como sustituto automático del nombre de ejecución. [La API documenta estas condiciones](https://docs.aws.amazon.com/step-functions/latest/apireference/API_StartExecution.html).

## Diseña para reintentos y eventos duplicados

EventBridge reintenta entregas que fallan y, en casos poco frecuentes, una regla o su destino pueden ejecutarse más de una vez para el mismo evento. Por eso, el `eventId` debe seguir siendo estable ante reintentos del productor, y las tareas con efectos secundarios deben poder reconocer una operación ya aplicada. [AWS describe los reintentos de entrega](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html) y [los casos de invocación duplicada](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-troubleshooting.html).

Para una tabla de DynamoDB, una clave compuesta como `(correlationId, eventId)` permite registrar eventos individuales dentro de un proceso. Una escritura condicional con `attribute_not_exists` puede impedir que la misma clave sobrescriba un registro anterior. Esa condición protege la escritura de la tabla; el código aún debe definir qué hacer con el duplicado y cómo evitar repetir el efecto de negocio, como un cobro o una notificación. [La API de `PutItem` explica las escrituras condicionales](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html).

Puedes configurar una cola de mensajes fallidos (DLQ) en el destino para conservar eventos que EventBridge no consiguió entregar tras sus reintentos. La DLQ cubre el fallo de entrega al destino; no representa el resultado de una ejecución que sí comenzó y luego falló dentro de Step Functions. Para ese recorrido, consulta el estado de la ejecución y registra el resultado de negocio en tu almacenamiento.

Si, además de investigar la ejecución, necesitas avisar al equipo cuando falle, consulta la [guía de avisos operativos de AWS en Slack o Teams](https://dondeaprendoaws.com/blog/configurar-aws-para-comunicacion-en-equipo-7-pasos/). Esa notificación es un paso separado de la correlación y del registro durable.

## Busca el correlationId en CloudWatch Logs

Configura Step Functions para enviar sus eventos de ejecución al grupo de CloudWatch Logs que uses para ese flujo. Para buscar el identificador dentro de la entrada de ejecución, incluye los datos de ejecución en los registros y revisa si esa entrada también contiene información sensible. Otra opción es emitir desde las tareas registros JSON propios con `correlationId` como campo de primer nivel:

```json
{
  "correlationId": "pedido-8421",
  "eventId": "evt-01",
  "executionArn": "arn:aws:states:us-east-1:123456789012:execution:ProcesarPedido:exec-abc123",
  "paso": "validacion",
  "estado": "ok"
}
```

En Logs Insights, selecciona el grupo de registros pertinente y un intervalo de tiempo acotado. Si tus eventos JSON exponen esos campos, esta consulta muestra la secuencia para el pedido:

```text
fields @timestamp, correlationId, eventId, executionArn, paso, estado
| filter correlationId = "pedido-8421"
| sort @timestamp asc
```

Los nombres de campo deben coincidir con el formato que emite tu aplicación. Para revisar registros de Step Functions que guardan la entrada como texto anidado, puedes buscar el valor en el mensaje:

```text
fields @timestamp, @message
| filter @message like /pedido-8421/
| sort @timestamp asc
```

[CloudWatch Logs Insights admite estos comandos de consulta](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html). Limita los grupos y el período consultado para reducir el volumen de datos que analiza cada búsqueda.

Si necesitas diseñar los registros JSON que emiten tus tareas, puedes ver esta [explicación de logs estructurados y métricas con CloudWatch en aplicaciones serverless](https://www.youtube.com/watch?v=UBPPGJaBIVY). Es material complementario, no una referencia para configurar Step Functions hoy.

CloudWatch Logs es una herramienta de diagnóstico, no un registro transaccional. Step Functions entrega sus registros a CloudWatch con el mejor esfuerzo: pueden faltar o llegar tarde. Además, la entrada y la salida de una ejecución pueden truncarse en los registros si superan los límites de tamaño. Usa el historial de Step Functions Standard o un almacén persistente cuando necesites conservar un historial operativo o de negocio para consultarlo después.

## Separa los permisos de cada rol

En una regla de EventBridge, el rol de destino necesita confiar en `events.amazonaws.com` y autorizar `states:StartExecution` sobre la máquina de estados concreta. Para un escenario de la misma cuenta, la política de permisos puede limitarse así:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "states:StartExecution",
      "Resource": "arn:aws:states:us-east-1:123456789012:stateMachine:ProcesarPedido"
    }
  ]
}
```

Reemplaza la región, la cuenta y el nombre por los de tu máquina. `iam:PassRole`, cuando corresponda, pertenece a la identidad que crea o actualiza el destino para que pueda asignar ese rol a EventBridge; no es un permiso que el rol de destino necesite para iniciar la ejecución. [AWS detalla el rol y los permisos de los destinos de EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-events-iam-roles.html). [IAM explica cuándo la identidad que configura el destino requiere `iam:PassRole`](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html).

El rol de ejecución de Step Functions es independiente: confía en Step Functions y concede las acciones que requieren sus tareas. Si habilitas registros, ese rol necesita además los permisos de CloudWatch Logs que documenta AWS; algunas de esas acciones no permiten restringir `Resource` a un grupo concreto. No reemplaces estas políticas separadas con acceso completo a Step Functions o CloudWatch.

## Recursos y comunidad

Si buscas una comunidad para conversar sobre arquitectura serverless y AWS, visita [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/). Al 6 de octubre de 2026, el grupo anuncia el encuentro virtual [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/) para el 20 de octubre a las 19:00 (hora de Colombia); la ficha indica acceso libre. Si estás en Argentina, también puedes seguir las actividades y conversaciones del [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/).

Si quieres comparar la elección entre Standard y Express con más detalle, lee [la guía de Step Functions](https://dondeaprendoaws.com/blog/comprendiendo-aws-step-functions/). Para el caso en que el disparador sea una alarma de CloudWatch, consulta [cómo conectar alarmas de CloudWatch con EventBridge](https://dondeaprendoaws.com/blog/cloudwatch-y-eventbridge-integracion/).
