---
title: "Mejores prácticas para Amazon DynamoDB: claves, consultas y costos"
description: "Aprende a modelar claves e índices para tus consultas y a controlar capacidad, consistencia, throttling y respaldos en Amazon DynamoDB."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T04:08:02.203Z"
modifiedTimestamp: "2026-10-06T17:50:38-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Amazon DynamoDB para principiantes: claves y consultas"
    url: "https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/"
  - title: "Cómo diagnosticar problemas en aplicaciones AWS con CloudWatch"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/"
---

Amazon DynamoDB funciona mejor cuando sus claves y consultas responden a las operaciones concretas de una aplicación. Antes de crear tablas, anota qué datos debe obtener cada pantalla o proceso, qué claves tiene disponibles y con qué frecuencia leerá o escribirá. Ese diseño evita depender de recorridos completos de tabla para las consultas habituales.

Esta guía reúne prácticas para modelar claves, decidir cuándo agregar índices, elegir capacidad, diagnosticar throttling y proteger los datos. DynamoDB administra la infraestructura, pero no convierte una tabla en un motor de consultas libres: si necesitas buscar repetidamente por atributos que no forman parte de una clave, debes modelar ese acceso o añadir un índice.

## Diseña las claves desde los patrones de acceso

Empieza por enumerar las consultas y escrituras que la aplicación necesita. Para cada patrón, identifica:

- Qué elemento o conjunto de elementos quieres recuperar.
- Si ya conoces la clave de partición y qué rango, prefijo u orden necesitas.
- Cuántos elementos leerás y con qué frecuencia.
- Qué datos se actualizan juntos y cuánto tiempo deben conservarse.

La [guía de AWS para modelar datos en DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-modeling-nosql.html) recomienda entender primero las preguntas que la aplicación debe responder. El diseño de una sola tabla puede ser útil si consultas juntas varias entidades relacionadas; varias tablas pueden ser más claras cuando esas entidades tienen necesidades operativas distintas. Ninguna forma es obligatoria para todas las aplicaciones. AWS explica esos [dos enfoques de diseño](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling-foundations.html).

Una tabla puede tener una clave primaria simple, formada solo por una clave de partición, o una clave compuesta por clave de partición y clave de ordenación. La clave de partición determina cómo se distribuyen los elementos; la de ordenación organiza los elementos que comparten la partición. Elige la clave de partición según el tráfico real: muchos valores distintos suelen ayudar, pero un valor muy popular todavía puede concentrar solicitudes y provocar una partición caliente. Una clave como el estado del pedido, con pocos valores posibles, requiere cuidado. Consulta las [recomendaciones de AWS para distribuir la carga](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-uniform-load.html).

Si quieres practicar claves y consultas sin enviar operaciones al servicio de AWS, la guía [Amazon DynamoDB para principiantes: claves y consultas](https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/) propone un ejercicio local con AWS CLI y DynamoDB Local. El ejercicio permite familiarizarte con operaciones básicas, pero no mide cuotas, latencia, permisos ni costos de una tabla en AWS.

### Ejemplo: pedidos por cliente y por estado

Supón que necesitas dos accesos:

1. Listar los pedidos de un cliente durante un mes.
2. Encontrar pedidos pendientes de todos los clientes durante un mes.

La tabla usa <code>PK</code> y <code>SK</code> como clave primaria compuesta; el GSI define <code>GSI1PK</code> y <code>GSI1SK</code> como sus claves de partición y ordenación. Para este ejemplo, podrían representar las consultas así:

| PK | SK | GSI1PK | GSI1SK | estado |
| --- | --- | --- | --- | --- |
| <code>CLIENTE#42</code> | <code>PEDIDO#2026-10-04T08:00:00Z#9000</code> | — | — | enviado |
| <code>CLIENTE#42</code> | <code>PEDIDO#2026-10-05T14:30:00Z#9001</code> | <code>ESTADO#PENDIENTE#2026-10</code> | <code>2026-10-05T14:30:00Z#9001</code> | pendiente |
| <code>CLIENTE#77</code> | <code>PEDIDO#2026-10-06T09:00:00Z#9002</code> | <code>ESTADO#PENDIENTE#2026-10</code> | <code>2026-10-06T09:00:00Z#9002</code> | pendiente |

Para la primera consulta, usa <code>Query</code> sobre la tabla con <code>PK = CLIENTE#42</code> y el prefijo <code>PEDIDO#2026-10</code> en la clave de ordenación. Para la segunda, consulta el GSI con <code>GSI1PK = ESTADO#PENDIENTE#2026-10</code> y un prefijo de octubre en <code>GSI1SK</code>. Las marcas de tiempo con el mismo formato UTC se ordenan cronológicamente como texto; el identificador al final distingue pedidos con la misma marca.

El índice del ejemplo es disperso: solo los pedidos pendientes tienen atributos <code>GSI1PK</code> y <code>GSI1SK</code>, así que son los únicos que aparecen en ese GSI. Agrupar por estado y mes ilustra una consulta posible, pero no garantiza una distribución uniforme: si un valor del índice concentra demasiado tráfico, revisa el diseño y la carga antes de usarlo en producción.

Para ver un diseño aplicado, la grabación [AWS User Group Córdoba Meetup #18](https://www.youtube.com/watch?v=7Xk0MKt69Is) incluye una charla sobre cómo modelar datos de una tienda en DynamoDB y otra sobre OpenSearch. La publica el canal [Cloud en Español](https://www.youtube.com/@CloudenEspa%C3%B1ol-z8y).

## Usa Query para leer por clave y Scan con cuidado

<code>GetItem</code> recupera un elemento cuando conoces todos los valores de su clave primaria. <code>Query</code> requiere el valor exacto de la clave de partición y puede acotar resultados por la clave de ordenación. Por eso permite resolver los dos accesos del ejemplo sin recorrer los pedidos de otros clientes o estados. Revisa la documentación de [Query](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html) y su [paginación](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.Pagination.html) al implementar recorridos de resultados extensos.

<code>Scan</code> lee todos los elementos de una tabla o de un índice, en páginas de hasta 1 MB. Puede servir para una tarea ocasional, una tabla pequeña o un proceso de mantenimiento; no suele ser la base adecuada para una consulta repetida de una aplicación. Un filtro de <code>Query</code> o <code>Scan</code> elimina elementos de la respuesta después de leerlos y no reduce la capacidad consumida por esos elementos. Para un patrón frecuente, resuélvelo con las claves de la tabla o un índice. AWS describe [cómo funciona Scan](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html) y [cuándo se aplican sus filtros](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html#Scan.FilterExpression).

Los resultados de <code>Query</code> también se devuelven en páginas de hasta 1 MB; sigue la clave de paginación que devuelve la operación hasta completar la consulta. No fijes un tamaño de página universal: elige cuánto procesar por llamada según la respuesta que la aplicación pueda manejar y la latencia que necesite.

## Agrega índices solo para consultas que lo necesitan

Un índice secundario ofrece otra clave para <code>Query</code>, pero se mantiene junto con la tabla y tiene costos de almacenamiento y escritura. Define qué atributos necesita devolver la consulta y proyecta solo esos atributos; una consulta a un GSI solo puede devolver las claves y atributos proyectados en él.

Un GSI puede usar una clave de partición y una clave de ordenación distintas de las de la tabla. DynamoDB actualiza el índice de forma asíncrona, por lo que sus lecturas son siempre eventualmente consistentes. En modo aprovisionado, el GSI tiene capacidad de lectura y escritura propia; si no puede procesar las actualizaciones derivadas de escrituras en la tabla, esas escrituras también pueden sufrir throttling.

Un índice secundario local (LSI) conserva la clave de partición de la tabla y cambia la clave de ordenación. Se define al crear la tabla; no puede añadirse después. Sus lecturas y escrituras usan la capacidad de la tabla, y permite pedir lecturas fuertemente consistentes. En tablas con LSI, los elementos de la tabla y las proyecciones de sus LSI que comparten un valor de clave de partición tienen un [límite conjunto de 10 GB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/LSI.html). No es un índice gratuito ni ofrece una clave de partición alternativa. La [comparación oficial entre GSI y LSI](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SecondaryIndexes.html) explica sus límites y consumo.

## Elige el modo de capacidad según la carga

DynamoDB ofrece capacidad bajo demanda (*on-demand*) y aprovisionada (*provisioned*):

- **Bajo demanda** cobra por las solicitudes de lectura y escritura utilizadas y evita tener que especificar capacidad por adelantado. Es un punto de partida práctico para tráfico nuevo o difícil de prever.
- **Aprovisionada** cobra por la capacidad configurada por hora, aunque no la consumas por completo. Puede convenir cuando el tráfico es estable y se puede estimar; puedes evaluar autoescalado y ajustar sus límites.

El modo bajo demanda no significa capacidad ilimitada ni ausencia de throttling. Una clave muy solicitada, una cuota de cuenta o un máximo de solicitudes configurado pueden limitar el tráfico. En el modo aprovisionado también puedes superar la capacidad disponible de la tabla o de un GSI. Compara ambos modos con la carga real y consulta las [tarifas vigentes de DynamoDB](https://aws.amazon.com/dynamodb/pricing/); no hay un modo que siempre cueste menos.

Un índice tiene su propio almacenamiento, y sus actualizaciones pueden aumentar el trabajo de escritura. Antes de crear un GSI, confirma qué consulta habilita, qué atributos devuelve y si la clave del índice distribuye bien lecturas y escrituras. La [guía de capacidad de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html) describe cómo se administran los dos modos.

## Diagnostica el throttling antes de subir capacidad

Si una operación se limita, determina primero si el problema está en la tabla, en un GSI o en una clave que concentra tráfico. DynamoDB puede devolver excepciones con un motivo de throttling y el recurso afectado; una tabla con capacidad libre todavía puede tener una clave caliente o un índice que limite las escrituras.

En CloudWatch, revisa <code>ConsumedReadCapacityUnits</code> y <code>ConsumedWriteCapacityUnits</code> para observar el consumo de lecturas y escrituras. Compara <code>ThrottledRequests</code> con <code>ReadThrottleEvents</code> y <code>WriteThrottleEvents</code> para localizar lecturas o escrituras limitadas en la tabla y sus índices. Estas métricas ayudan a diagnosticar capacidad y tráfico; consulta facturación y precios para entender el costo monetario. AWS detalla los motivos y pasos de [diagnóstico del throttling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TroubleshootingThrottling.html) y las [métricas de DynamoDB en CloudWatch](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Monitoring-metrics-with-Amazon-CloudWatch.html).

Cuando encuentres una clave caliente, revisa el patrón de acceso y la distribución de claves antes de escalar. Si el recurso agotado es un GSI, aumentar solo la capacidad de la tabla no resuelve necesariamente el problema. La guía de [diagnóstico de aplicaciones con CloudWatch](/blog/mejores-practicas-de-observabilidad-en-aws/) amplía el trabajo con métricas y señales de otras capas de una aplicación.

Revisa también el [comportamiento de reintentos de tu AWS SDK](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html): puede reintentar errores temporales o de throttling con espera progresiva y variación aleatoria. Confirma el modo, la versión y el número máximo de intentos configurados. Los reintentos acotados ayudan a manejar fallos temporales; no corrigen una clave caliente ni la falta sostenida de capacidad.

## Elige cuándo necesitas lecturas fuertes

Las lecturas eventualmente consistentes son el valor predeterminado. Una lectura fuertemente consistente refleja las escrituras exitosas anteriores, pero solo está disponible para tablas y LSI; un GSI solo admite lecturas eventualmente consistentes. Solicita consistencia fuerte cuando el flujo de la aplicación dependa de ver inmediatamente una escritura anterior y el origen de datos lo permita. La [guía de consistencia de lectura de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html) detalla las opciones.

## Protege las escrituras y planifica la recuperación

Por defecto, <code>PutItem</code> puede reemplazar un elemento con la misma clave primaria. Si una creación debe fallar cuando el elemento ya existe, usa una condición como <code>attribute_not_exists(PK)</code>. También puedes condicionar una actualización a que el estado actual siga siendo el esperado; esto evita sobrescribir un cambio concurrente que ya modificó ese elemento. Las [expresiones de condición de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html) muestran estas operaciones.

Para proteger los datos ante borrados o cambios accidentales, evalúa respaldos bajo demanda y la recuperación a un momento dado (PITR). PITR mantiene puntos de recuperación continuos durante una ventana configurable de hasta 35 días; una restauración crea una tabla nueva, así que revisa el proceso para volver a conectar la aplicación antes de depender de él. Consulta [backup y recuperación en DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Backup-and-Restore.html) para opciones, disponibilidad y cargos.

La seguridad empieza por los permisos: usa roles y otorga solo las acciones que la aplicación necesita sobre sus tablas e índices. DynamoDB cifra los datos en reposo por defecto; el cifrado no sustituye la autorización de IAM. Evita incluir correos, tokens u otros datos sensibles en claves: los nombres y valores de claves pueden aparecer en metadatos y registros. Revisa las [prácticas preventivas de seguridad de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices-security-preventative.html).

## Sigue aprendiendo y conversa con la comunidad

El [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) es un grupo abierto a personas interesadas en cloud que comparte experiencias y conocimientos sobre AWS; en su página puedes consultar los encuentros anunciados. Si estás en otro país o ciudad, explora el [directorio de comunidades AWS](/comunidades/) y la [agenda de eventos](/eventos/). Para conversar sobre un diseño, lleva los patrones de acceso y un ejemplo de claves con datos ficticios: así puedes comparar cómo otras personas resuelven consultas, índices y distribución de tráfico.
