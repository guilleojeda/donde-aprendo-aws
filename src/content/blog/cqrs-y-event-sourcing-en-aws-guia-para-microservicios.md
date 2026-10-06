---
title: "CQRS y Event Sourcing en AWS: diferencias y ejemplo con DynamoDB"
description: "Entiende cómo se relacionan CQRS y Event Sourcing en AWS, y qué límites tienen DynamoDB Streams, EventBridge y Kinesis al proyectar eventos."
author: "guille-ojeda"
publishedAt: "2024-05-14"
publishedTimestamp: "2024-05-14T02:22:09.107Z"
modifiedTimestamp: "2026-10-06T13:58:52-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
  - title: "Amazon DynamoDB para principiantes: claves y consultas"
    url: "https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/"
---

CQRS y Event Sourcing suelen aparecer juntos al diseñar microservicios, pero resuelven problemas distintos. **CQRS separa los modelos que procesan cambios de los que responden consultas. Event Sourcing conserva los cambios aceptados como eventos para reconstruir el estado.** Puedes usar uno sin el otro; combinarlos agrega una forma de crear modelos de lectura desde un historial, a cambio de más trabajo de diseño y operación. Ninguno garantiza por sí solo más rendimiento o escalabilidad.

## CQRS y Event Sourcing no son lo mismo

| Patrón | Qué separa o conserva | Cuándo puede servir | Qué añade |
| --- | --- | --- | --- |
| CQRS (*Command Query Responsibility Segregation*) | Separa el modelo que valida y aplica comandos del modelo que atiende consultas. Pueden compartir base de datos; también pueden usar almacenes distintos. | Las lecturas y escrituras tienen formas de acceso, volumen o latencia diferentes. | Hay que mantener sincronizados los modelos si la consulta lee una proyección actualizada en segundo plano. |
| Event Sourcing | Conserva los hechos de negocio aceptados en un registro ordenado y reconstruye el estado aplicándolos. | Necesitas historial de cambios, vistas derivadas distintas o reconstrucción de estados pasados. | Debes manejar orden, concurrencia, versiones de eventos, reprocesamiento y crecimiento del registro. |

La [guía de CQRS de AWS](https://docs.aws.amazon.com/es_es/prescriptive-guidance/latest/modernization-data-persistence/cqrs-pattern.html) muestra varias combinaciones para los lados de escritura y lectura. CQRS no exige dos bases de datos ni un bus de eventos. Para entender el concepto por separado, consulta también las explicaciones de Martin Fowler sobre [CQRS](https://martinfowler.com/bliki/CQRS.html) y [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html).

En Event Sourcing, un evento es un hecho —por ejemplo, `PedidoConfirmado`—, no una solicitud futura ni cualquier cambio técnico de una fila. Un comando expresa intención, como `ConfirmarPedido`; el servicio valida las reglas del negocio y solo si el comando se acepta guarda el evento resultante. Un comando rechazado no debe convertirse en un evento de confirmación.

## Ejemplo: pedidos con un modelo de lectura

Supón que un cliente confirma el pedido `pedido-8042`. El servicio de pedidos recibe `ConfirmarPedido` con una versión esperada y una clave de idempotencia; si recibe otra vez la misma solicitud, puede devolver el resultado previo sin crear otro evento. Si el pedido sigue en el estado correcto, registra `PedidoConfirmado` como el siguiente evento de ese pedido. Si dos solicitudes intentan cambiarlo al mismo tiempo, la escritura condicional por versión permite detectar el conflicto y volver a cargar el agregado antes de decidir qué hacer.

El registro podría tener una fila por evento con estos campos:

| Campo | Ejemplo | Para qué sirve |
| --- | --- | --- |
| `aggregateId` | `pedido-8042` | Identifica el pedido cuya historia se conserva. |
| `version` | `4` | Ordena el evento dentro de ese pedido. |
| `eventId` | `evt-91f2` | Permite reconocer el mismo evento cuando hay reintentos. |
| `type` | `PedidoConfirmado` | Nombra el hecho de negocio. |
| `schemaVersion` | `1` | Identifica la forma del contenido del evento. |

A partir de ese registro, un proyector puede actualizar una vista de lectura como “pedidos por cliente” o “pedidos pendientes”. Una aplicación consulta esa vista, que puede tardar un poco en reflejar el comando recién aceptado. Si la interfaz necesita mostrar una confirmación inmediata, diseña esa respuesta de forma explícita; no supongas que la proyección ya se actualizó.

Supón que cada pedido tiene un identificador único y que su versión entera aumenta de a una. Esa versión ordena eventos solo dentro del pedido, no entre pedidos. Si un comando genera varios eventos, define el orden entre ellos y cómo guardarlos juntos antes de proyectarlos. El ejemplo ilustra el flujo y no crea recursos de AWS. Si necesitas repasar claves de partición y ordenación antes de modelar una tabla, consulta nuestra guía de [Amazon DynamoDB para principiantes](https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/).

## Una opción de implementación en AWS

Una arquitectura didáctica posible usa un servicio de pedidos para procesar comandos, una tabla de DynamoDB como registro de eventos, DynamoDB Streams para avisar a un proyector y otro almacén para las consultas:

1. El servicio lee el estado del pedido y procesa el comando con las reglas del dominio.
2. Escribe el siguiente evento como un ítem nuevo. Modela la tabla con `aggregateId` como clave de partición y `version` numérica como clave de ordenación, para consultar la secuencia de un pedido. Una escritura condicional o una transacción con la versión esperada evita que dos comandos aceptados asignen la misma versión. El [ejemplo de AWS para construir un event store CQRS con DynamoDB](https://aws.amazon.com/blogs/database/build-a-cqrs-event-store-with-amazon-dynamodb/) describe un modelo de eventos por agregado, control optimista de concurrencia y snapshots para reducir la carga al restaurar agregados largos.
3. Un consumidor procesa los eventos y actualiza una vista optimizada para las consultas de la aplicación. Puede usar una tabla distinta de DynamoDB o una base relacional si los patrones de consulta lo justifican.
4. La API de lectura responde desde esa vista y acepta la demora de proyección que requiera el producto.

En esta opción, DynamoDB contiene el historial de eventos de negocio que la aplicación decide guardar. La tabla no es inmutable por defecto: limita con la aplicación y los permisos quién puede modificar o borrar esos ítems, y define retención y respaldo según lo que debas reconstruir. **DynamoDB Streams es un registro de cambios de la tabla, no ese historial de negocio:** captura modificaciones de ítems por hasta 24 horas y mantiene el orden de cambios de cada ítem, no un orden global ni necesariamente el orden de todos los eventos del mismo agregado. Si el consumidor se atrasa más que la retención, debe poder recuperarse desde el registro de eventos. Además, los mapeos de origen de eventos de Lambda procesan al menos una vez, por lo que el proyector debe tolerar duplicados; usa `eventId` y la versión del agregado para ignorarlos o detectar huecos.

## EventBridge, Kinesis y Streams cumplen funciones distintas

| Servicio | Aporta | Límite que debes considerar |
| --- | --- | --- |
| DynamoDB Streams | Notifica cambios recientes de ítems de una tabla y puede activar Lambda para construir proyecciones. | Retiene registros por 24 horas. Es CDC y su garantía de orden es por ítem; no lo confundas con un event store que conserva y reproduce todo el historial. |
| Amazon EventBridge | Enruta eventos de aplicación entre productores y consumidores. Sus archivos permiten reproducir eventos hacia el bus de origen. | Define la retención del archivo. El replay vuelve al bus de origen y no necesariamente conserva el orden en que los eventos llegaron al archivo; no asumas que basta para reconstruir estrictamente cada agregado. |
| Amazon Kinesis Data Streams | Distribuye flujos continuos de registros a consumidores; la clave de partición determina el shard y permite agrupar registros relacionados. | Retiene 24 horas por defecto y puede ampliarse hasta 365 días con costo adicional. El orden es por shard, no global, y depende de cómo el productor secuencia las escrituras. Si necesitas conservar eventos por más tiempo, define una copia duradera y su proceso de recuperación; la guía de AWS ilustra un event store en Kinesis con persistencia en S3. |

AWS describe EventBridge y Kinesis como alternativas en su guía del [patrón Event Sourcing](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-data-persistence/service-per-team.html). Eso no vuelve equivalentes sus garantías: EventBridge se centra en enrutar y archivar para replay; Kinesis administra un flujo con retención temporal; una tabla de eventos modelada por agregado conserva los hechos de dominio que la aplicación necesita reconstruir. Si el replay debe respetar el orden del agregado, fija y valida una secuencia de negocio en el productor y en cada consumidor.

Para comparar la función de EventBridge, SNS, SQS y Kinesis con más detalle, lee el episodio de Marcia Villalba [“SQS, SNS, EventBridge o Kinesis: ¿cuál usás?”](https://desplegando.substack.com/p/sqs-sns-eventbridge-o-kinesis-cual). La guía oficial de [archivos y replay de EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-archive.html), la referencia de [DynamoDB Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html), la documentación de [Lambda con DynamoDB Streams](https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html) y los [conceptos de Kinesis Data Streams](https://docs.aws.amazon.com/streams/latest/dev/key-concepts.html) detallan sus límites de retención, entrega y orden.

Si estás evaluando microservicios dirigidos por eventos, nuestra guía de [arquitectura dirigida por eventos en AWS](https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/) compara buses, temas y colas con un flujo de pedidos. Para una introducción en español, puedes ver la grabación de Marcia Villalba titulada [“Introducción a arquitecturas orientadas a eventos y Amazon EventBridge”](https://www.youtube.com/watch?v=TkU1RS5Fw1o). Si buscas una presentación audiovisual de Kinesis, su canal también publica [“Serverless 101: Entendiendo Amazon Kinesis para tus aplicaciones”](https://www.youtube.com/watch?v=APdDJdF7nM4). Como otra perspectiva comunitaria en español, puedes ver la grabación del [AWS User Group Ecuador titulada “Estrategias Event-Driven en AWS”](https://www.youtube.com/watch?v=i0lY6S_avOI).

## Costos y límites operativos

Si conservas todo el historial, el event store crece con cada cambio aceptado. Las escrituras, lecturas, almacenamiento, respaldos, consumidores, proyecciones y replays pueden generar cargos según los servicios y su configuración. Los snapshots pueden reducir el número de eventos que hace falta aplicar al restaurar un agregado, pero no sustituyen el historial que necesitas para reconstruirlo desde el principio; agregan otro formato y procedimiento que debes mantener. Estima los cargos con el tamaño y volumen de eventos esperados y los precios de la región; aquí no hay una tarifa fija ni una promesa de ahorro.

Si DynamoDB guarda el historial principal, AWS replica sus datos entre tres zonas de disponibilidad dentro de la región, pero define también cómo recuperarte de una escritura o borrado accidental. La recuperación a un momento dado (PITR) conserva puntos de recuperación con granularidad de un segundo hasta por 35 días; la restauración crea una tabla nueva y no reemplaza una política de archivo del historial de más largo plazo. Revisa la [guía de resiliencia de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/disaster-recovery-resiliency.html), [PITR](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html) y [restauración de una tabla](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-pitr-recovery-table-restore.html), y practica el procedimiento en un entorno de prueba.

Antes de elegir el patrón, revisa además estos puntos:

- **Duplicados e idempotencia:** los reintentos pueden volver a entregar un evento. El consumidor debe registrar su progreso y aplicar cada versión sin repetir el efecto de negocio.
- **Evolución del esquema:** conserva la versión del evento y define cómo leer registros anteriores cuando cambie el código.
- **Privacidad y retención:** evita guardar datos personales que no necesitas. Si corriges, expurgas o eliminas eventos, documenta cómo cambia la reconstrucción y el historial.
- **Coordinación entre servicios:** un event store no crea una transacción atómica entre microservicios. Si una operación de negocio cruza varios servicios, define cómo se coordina y compensa cada paso; no supongas que publicar un evento completa todo el proceso.
- **Complejidad:** si solo necesitas separar lecturas y escrituras, CQRS puede bastar. Si solo necesitas un registro de auditoría, quizá alcance con un historial separado. Fowler también advierte que CQRS añade complejidad y que Event Sourcing no es necesario para la mayoría de los sistemas CRUD simples.

## Preguntas frecuentes

### ¿CQRS necesita dos bases de datos?

No. CQRS separa modelos y responsabilidades; puedes implementarlos sobre el mismo almacén o elegir uno distinto para cada lado cuando sus patrones de acceso lo justifiquen.

### ¿DynamoDB Streams sirve como event store?

No por sí solo. Streams conserva cambios de ítems por hasta 24 horas y describe modificaciones en la tabla. Una tabla DynamoDB diseñada como registro append-only puede guardar eventos de dominio; Streams puede avisar al proyector de que llegó un nuevo ítem.

### ¿Debo combinar Event Sourcing con EventBridge?

No necesariamente. AWS describe EventBridge como una opción dentro de un diseño de Event Sourcing: el bus distribuye hechos y un archivo puede reproducirlos al bus de origen. Revisa qué eventos archiva, cuánto tiempo los conserva y en qué orden los reproduce. Si la aplicación debe reconstruir un agregado con una secuencia estricta y completa, persiste esa secuencia en un registro de eventos explícito y usa el bus para distribución según corresponda.

## Recursos y comunidad

- La [guía de AWS sobre CQRS](https://docs.aws.amazon.com/es_es/prescriptive-guidance/latest/modernization-data-persistence/cqrs-pattern.html) compara opciones para separar escrituras y consultas.
- La [guía de AWS sobre Event Sourcing](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/event-sourcing-pattern.html) explica eventos, replay, snapshots y consideraciones de implementación.
- El artículo técnico de AWS [“Build a CQRS event store with Amazon DynamoDB”](https://aws.amazon.com/blogs/database/build-a-cqrs-event-store-with-amazon-dynamodb/) profundiza en una opción concreta de almacenamiento y advierte sobre su complejidad.
- Para conversar con otros desarrolladores, consulta la agenda del [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/), que publica encuentros virtuales y presenciales. También puedes buscar actividades actuales en nuestro [directorio de eventos AWS](/eventos/) y otros grupos en el [directorio de comunidades](/comunidades/).
