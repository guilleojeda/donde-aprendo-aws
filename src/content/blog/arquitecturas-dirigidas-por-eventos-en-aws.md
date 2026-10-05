---
title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
description: "Compara EventBridge, SNS y SQS y diseña un flujo de pedidos en AWS con outbox, idempotencia, reintentos, DLQ y orden explícito."
author: "guille-ojeda"
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T00:59:24.459Z"
modifiedTimestamp: "2026-10-05T00:19:53-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []
---

Una arquitectura dirigida por eventos (EDA) permite que un servicio publique un hecho que ya ocurrió —por ejemplo, `OrderPlaced`— y que otros servicios reaccionen sin que el productor tenga que llamarlos uno por uno. En AWS, **EventBridge enruta eventos**, **SNS distribuye publicaciones a suscriptores** y **SQS conserva trabajo pendiente para que un consumidor lo procese a su ritmo**. Se pueden combinar, pero cumplen funciones distintas.

Para procesar pedidos, una base sólida es guardar el pedido y su evento de salida en la misma transacción, publicar ese evento con un outbox, enrutarlo a una cola por consumidor y hacer que cada consumidor tolere duplicados. Eso permite desacoplar el trabajo; no vuelve atómicas las operaciones entre servicios ni garantiza por sí solo que un pedido se complete.

## EventBridge, SNS y SQS: cuál elegir

| Servicio | Elígelo cuando necesitas | Qué aporta | Qué no resuelve por sí solo |
| --- | --- | --- | --- |
| [Amazon EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rules.html) | Recibir eventos de AWS, aplicaciones propias o SaaS y dirigirlos con reglas basadas en su contenido. | Un bus de eventos y reglas que pueden enviar un evento coincidente a uno o varios destinos. | No es una cola de trabajo ni promete un orden global entre eventos. Configura una cola o un archivo si necesitas retener trabajo o reproducir eventos. |
| [Amazon SNS](https://docs.aws.amazon.com/sns/latest/dg/welcome.html) | Publicar una notificación para varios suscriptores —por ejemplo, HTTP, Lambda o varias colas SQS— con un modelo pub/sub. | Entrega de una publicación a suscriptores; las políticas de filtro ayudan a seleccionar qué recibe cada suscripción. | No ofrece a cada consumidor una cola independiente salvo que suscribas colas SQS. |
| [Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html) | Amortiguar picos, desacoplar el ritmo de un productor y un trabajador, o mantener trabajo pendiente durante una interrupción del consumidor. | Una cola que el consumidor lee y cuyas entregas puede reintentar; una DLQ permite aislar mensajes que exceden los intentos configurados. | No enruta mensajes por sí misma a distintos consumidores según el contenido. La cola Standard permite duplicados y no garantiza orden. |

Una regla práctica: **EventBridge para decidir adónde va un hecho; SNS para difundir una publicación; SQS para poner trabajo en espera**. Por ejemplo, una regla de EventBridge puede enviar `OrderPlaced` a una cola SQS de inventario y a otra de notificaciones. Si todas las publicaciones de un productor deben llegar a muchos suscriptores con filtros sencillos, SNS con una cola SQS por suscriptor también puede encajar. La [guía de decisión de AWS para SNS, SQS y EventBridge](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/sns-or-sqs-or-eventbridge.html) compara estos modelos y sus casos de uso.

Para oír otra comparación práctica de los tres servicios, mira [AWS SQS vs SNS vs EventBridge: ¿cuál escoger?](https://www.youtube.com/watch?v=6gITIiiXQNg), de [Marcia en Desplegando Cloud](https://www.youtube.com/@marcia_); los criterios de arquitectura y entrega de la tabla se apoyan en la guía oficial de AWS enlazada arriba.

## Ejemplo: publicar un pedido sin perder la intención de notificar

Supongamos que una tienda debe reservar inventario y avisar al cliente cuando se confirma un pedido. El servicio de pedidos valida la solicitud y guarda el pedido junto con una fila de outbox en **una transacción de su base de datos**. Un publicador lee las filas ya confirmadas y envía el evento a un bus propio de EventBridge. Una regla filtra `source` y `detail-type`, y entrega el evento a una cola de inventario y a otra de notificaciones. Cada consumidor procesa su cola de forma independiente.

El outbox resuelve el hueco de una escritura dual: si la base de datos confirma el pedido pero falla la publicación, la fila sigue pendiente para que el publicador vuelva a intentarlo; si la transacción se revierte, tampoco queda el evento. El publicador aún puede enviar una misma fila más de una vez, así que los consumidores siguen necesitando idempotencia. AWS describe este compromiso en su guía del [patrón transactional outbox](https://docs.aws.amazon.com/es_es/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

Como ejemplo para estudiar el fan-out con una cola por consumidor, el repositorio [Streaming Serverless Demo: música con SQS, SNS y API Gateway](https://github.com/hsaenzG/streaming-serverless-demo) implementa en Python y AWS CDK una publicación SNS que alimenta tres colas SQS, cada una con su Lambda. Para ver otro pipeline con S3, SQS, Lambda y DynamoDB, consulta [Procesamiento serverless orientado a eventos](https://www.alfredo-dominguez.dev/arquitecturas/03-event-driven-serverless/). Son ejemplos de procesamiento y fan-out, no un diseño de pedidos listo para producción; revisa prerrequisitos, recursos y limpieza antes de desplegar el repositorio en una cuenta propia, porque el costo depende de la cuenta, región y uso.

Este objeto representa **el contenido de `detail` del evento propio**; EventBridge lo envuelve además con metadatos como `source`, `detail-type`, `id`, cuenta y región. `eventId` es un identificador estable que crea el servicio de pedidos y guarda junto con la fila outbox; sirve para reconocer la misma publicación cuando el publicador reintenta.

```json
{
  "eventId": "evt_01J9Q2K7M4",
  "schemaVersion": 1,
  "orderId": "ord_8042",
  "aggregateVersion": 1,
  "occurredAt": "2026-10-04T18:32:01Z",
  "items": [
    { "sku": "cafe-250g", "quantity": 2 }
  ]
}
```

El sobre estándar de EventBridge usa `source` para identificar al productor y `detail-type` para nombrar el hecho; las reglas pueden filtrar esos campos y valores de `detail`. Mantén el contrato versionado y envía solo los datos que los consumidores necesitan. Evita incluir credenciales o datos personales si basta con un identificador que el consumidor pueda resolver con autorización.

### Qué pasa cuando algo falla

Hay dos entregas distintas que conviene observar por separado:

1. **Del bus al destino.** Configura una DLQ en el destino de la regla para guardar fallas de entrega. EventBridge reintenta según la política configurada, pero algunos errores —como permisos faltantes o un destino inexistente— no son reintentables y pueden ir directamente a la DLQ. Sin DLQ, un error no reintentable o un evento que agota sus reintentos puede descartarse. La DLQ de destino usa SQS Standard y requiere permisos para que EventBridge escriba en ella. Esta DLQ captura fallas de entrega al destino; no captura errores dentro de una función Lambda que ya recibió el evento. Consulta las [condiciones de DLQ para EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html).
2. **De la cola al consumidor.** Si una Lambda que lee SQS falla, el mensaje vuelve a estar visible después del tiempo de visibilidad. Configura una política de redrive y una DLQ en la cola de origen para aislar mensajes que fallan repetidamente; después de corregir la causa, revisa y reprocesa los mensajes según el impacto de negocio. Una DLQ no arregla automáticamente un mensaje inválido ni reconcilia un pedido incompleto.

Con el mapeo de origen de eventos de SQS, Lambda puede recibir varios registros en una invocación. Si la invocación falla, por defecto puede volver a procesarse el lote completo; las respuestas parciales permiten informar cuáles registros fallaron. AWS recomienda que el tiempo de visibilidad de la cola sea al menos seis veces el timeout de la función, más la ventana de batching si configuraste una. Revisa la guía de [configuración de SQS con Lambda](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html) y [manejo de errores y respuestas parciales](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html) antes de fijar esos valores.

Una cola Standard ofrece entrega *at least once*: puede volver a entregar un mensaje y no mantiene siempre el orden. Haz cada efecto repetible sin daño. Una tabla inbox puede registrar `eventId` procesado en la misma transacción que el cambio de inventario; para una API externa, usa una clave de idempotencia si esa API la soporta. No dependas solo de eliminar el mensaje de SQS para impedir que un efecto se repita: puede fallar el proceso entre confirmar el cambio de negocio y eliminar el mensaje.

Si importa el orden **por pedido**, una cola FIFO con el mismo `MessageGroupId` —por ejemplo, el `orderId`— conserva el orden en que recibe los mensajes de ese grupo. El productor debe emitirlos en el orden de la secuencia de negocio. EventBridge no establece un orden global, y una cola FIFO conserva el orden de llegada: no corrige eventos que ya llegaron invertidos. Al configurar una cola FIFO como destino de una regla clásica de EventBridge, revisa también los requisitos de [parámetros del destino SQS](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-targets.html), incluida la deduplicación basada en contenido. La deduplicación de FIFO tampoco hace que un pago o una escritura en otra base de datos tenga efecto exactamente una vez. Revisa la documentación de [colas SQS FIFO](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fifo-queues.html) y los [límites de entrega de SQS Standard](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html).

El bus no debe tratarse como una cola que conserva trabajo para siempre. Si necesitas guardar y reproducir eventos para reprocesar después de una corrección, habilita y dimensiona un [archivo de EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-archive.html); la retención y el replay son una configuración explícita. Una DLQ guarda fallas de entrega o consumo en otra etapa, y también necesita alertas, revisión y un procedimiento de reproceso.

## Coreografía u orquestación

Para efectos independientes que pueden reaccionar al hecho —actualizar analítica o enviar una notificación— la coreografía con eventos mantiene a cada consumidor enfocado en su propio trabajo. Si reservar inventario, cobrar y confirmar el pedido forman una secuencia con ramas, esperas, compensaciones y un estado global que el equipo necesita consultar, evalúa orquestar ese proceso con [AWS Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html). El patrón saga coordina transacciones locales y define acciones compensatorias; no convierte varias bases de datos en una transacción ACID única. AWS recomienda valorar también la complejidad de depurar y mantener la saga en su guía de [orquestación](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-integrating-microservices/orchestration.html) y el [patrón saga](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-data-persistence/saga-pattern.html).

Para contrastar esos enfoques en español, mira [¿Qué arquitectura es mejor para mi aplicación? Eventos o máquinas de estado?](https://www.youtube.com/watch?v=3UwgnYByOk8), de [Marcia en Desplegando Cloud](https://www.youtube.com/@marcia_), y [Sesión 5: Orquestación vs. Coreografía – Diseñando Flujos de Integración en AWS](https://www.youtube.com/watch?v=iYCgmy-9Tg4), de [Axel Echevarría Piérola](https://www.youtube.com/@axlpierola). Toma las guías oficiales enlazadas arriba como referencia para los límites del diseño.

Si ese flujo además debe seguir disponible ante una caída regional, revisa la topología y recuperación de sus buses, colas y datos con la guía interna de [arquitecturas multi-región en AWS](https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/).

No hace falta orquestar todos los eventos: elige un flujo explícito cuando los requisitos de negocio necesitan decisiones, visibilidad de extremo a extremo o acciones compensatorias. Si el objetivo es publicar un hecho y dejar que varios interesados independientes reaccionen, no agregues un coordinador central sin una necesidad concreta.

## Recursos para seguir el tema

### Comparar servicios y entender el patrón

- [Arquitectura orientada a eventos: por qué tus servicios no deberían conocerse entre sí](https://builder.aws.com/content/3GBOuh54nfwbnkYqbA6IyhIW5RC/arquitectura-orientada-a-eventos-por-qu-tus-servicios-no-deberan-conocerse-entre-s): una lectura en AWS Builder Center sobre productores, consumidores, pub/sub y cuándo una llamada directa sigue siendo apropiada.
- [Introducción a arquitecturas orientadas a eventos y Amazon EventBridge](https://www.youtube.com/watch?v=TkU1RS5Fw1o), de [Marcia en Desplegando Cloud](https://www.youtube.com/@marcia_): una charla en español para continuar desde el papel de EventBridge.
- [SQS, SNS, EventBridge o Kinesis: ¿cuál usás?](https://desplegando.substack.com/p/sqs-sns-eventbridge-o-kinesis-cual): episodio de Desplegando Cloud para ampliar la comparación a procesamiento de streams.

### Conversar y encontrar actividades

Puedes llevar una pregunta concreta —por ejemplo, cómo deduplicar una reserva o cuándo poner SQS detrás de SNS— a un grupo de usuarios. Estos enlaces apuntan directamente a comunidades que anuncian encuentros, recursos o actividades:

- [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/), comunidad argentina para compartir experiencias y conocimientos de AWS.
- [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/), grupo local centrado en AWS serverless.
- [AWS User Group Perú](https://awsugperu.cloud/), portal con grupos locales, actividades, talleres y recursos de la comunidad.

El AWS User Group Serverless Colombia anuncia la sesión virtual **El Combo Indestructible de AWS: SQS + Lambda**, para el martes 20 de octubre de 2026 de 19:00 a 21:00 (hora de Colombia, UTC−5). [Consulta la ficha de Meetup](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/) para revisar la inscripción y cualquier cambio de horario o disponibilidad.

## Antes de llevarlo a producción

- Elige cada servicio por el modelo de entrega que el consumidor necesita: filtro y enrutamiento, difusión o buffer independiente.
- Registra el evento junto al cambio de negocio con outbox o CDC cuando no puedas tolerar que se confirme un pedido sin registrar la intención de publicarlo.
- Diseña consumidores idempotentes; espera reintentos y posibles duplicados.
- Separa las DLQ de entrega de EventBridge de las DLQ de procesamiento SQS, mide la antigüedad y cantidad de mensajes y define quién revisa y reprocesa cada una.
- Incluye un identificador estable, correlación y versión del contrato; no expongas datos sensibles innecesarios.
- Si la secuencia por agregado importa, documenta el orden esperado, el grupo FIFO y cómo el productor mantiene la secuencia.
- Mide latencia, errores, edad del mensaje más antiguo, invocaciones fallidas y costos con carga representativa. La facturación depende del volumen y de los servicios y configuraciones elegidos.

Una EDA útil hace visibles las fronteras y los fallos del sistema. EventBridge, SNS, SQS, outbox e idempotencia aportan piezas distintas; la garantía final depende de cómo la aplicación las combina y de cómo recupera sus estados de negocio.
