---
title: "Tablas globales de Amazon DynamoDB: consistencia, regiones y costos"
description: "Compara MREC y MRSC en las tablas globales de DynamoDB: replicación, pérdida potencial de datos, regiones, límites, seguridad y facturación."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T02:19:41.967Z"
modifiedTimestamp: "2026-10-05T23:42:46Z"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Amazon DynamoDB para principiantes: claves y consultas"
    url: "https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/"
  - title: "¿Qué base de datos elegir en AWS? RDS, Aurora y DynamoDB"
    url: "https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/"
  - title: "Amazon RDS o Aurora: cómo elegir una base de datos relacional en AWS"
    url: "https://dondeaprendoaws.com/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/"

---

Las tablas globales de Amazon DynamoDB replican una tabla entre regiones de AWS. Cada región tiene una réplica que puede atender operaciones, pero el comportamiento depende del modo de consistencia elegido al crear la tabla global: **MREC**, con consistencia eventual entre regiones, o **MRSC**, con consistencia fuerte entre regiones. MREC es el modo predeterminado; el modo queda fijo cuando creas la tabla.

La decisión principal es cuánto retraso y latencia puede tolerar la aplicación. MREC suele ofrecer escrituras más rápidas, pero puede mostrar datos desactualizados y perder las escrituras que aún no se replicaron durante una interrupción. MRSC confirma una escritura después de replicarla de forma síncrona; a cambio, las lecturas y escrituras fuertes tienen más latencia y el diseño debe cumplir límites específicos.

Si estás aprendiendo el modelo de clave y las consultas, empieza con [DynamoDB Local y Docker](https://blog.295devops.com/de-lo-local-se-aprende-desplegando-tu-primera-app-con-docker-y-dynamodb-local). Es una práctica local útil antes de comparar modos globales, pero no reproduce la replicación entre regiones ni las garantías MREC/MRSC.

## MREC o MRSC

### MREC: consistencia eventual entre regiones

MREC replica los cambios de forma asíncrona. Suelen propagarse en menos de un segundo, pero el retraso varía. Una lectura en otra región puede devolver una versión anterior; incluso con `ConsistentRead=true`, la tabla devuelve la versión más reciente conocida en esa región, que puede no incluir una escritura reciente de otra región. Si la región que aceptó una escritura falla antes de replicarla, esa escritura podría perderse. Si hay escrituras simultáneas al mismo elemento en distintas regiones, se aplica una resolución *last writer wins* por elemento.

Las transacciones MREC son atómicas solo en la región donde se ejecutan. Sus cambios se replican como elementos individuales, así que una lectura en otra región puede observar una transacción parcialmente aplicada. Si la aplicación necesita transacciones, dirige esas operaciones a una región y define cómo atenderá una interrupción regional.

### MRSC: consistencia fuerte entre regiones

MRSC replica una escritura de forma síncrona a otra región antes de confirmarla. El objetivo de punto de recuperación (**RPO**) expresa cuánto tiempo de datos recientes podría perderse. En MRSC, **el RPO es cero para las escrituras confirmadas** durante un fallo regional; a cambio, las lecturas y escrituras fuertes tienen más latencia. Una escritura concurrente al mismo elemento puede fallar con `ReplicatedWriteConflictException` y requerir un reintento.

El modo MRSC no convierte automáticamente cada lectura en una lectura fuerte. En las operaciones compatibles sobre la tabla base, solicita `ConsistentRead=true`; las lecturas de índices secundarios globales (GSI) siempre son eventuales. MRSC no admite índices secundarios locales (LSI), operaciones transaccionales ni TTL. Una región necesita comunicarse con otra réplica o con el witness para establecer el quórum; si no puede, solo atiende lecturas eventuales. La [guía de consistencia de lectura de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html) detalla el parámetro y sus límites por tipo de lectura.

MRSC requiere **exactamente tres regiones**: tres réplicas completas o dos réplicas y una región *witness*. El witness ayuda a sostener la consistencia, pero no acepta lecturas ni escrituras de la aplicación. El modo se fija al crear la tabla global y no se puede cambiar después; además, no se añaden réplicas a una tabla MRSC existente. Evalúa el modo y la composición regional antes de cargar datos.

### Disponibilidad de regiones para MRSC

El 23 de septiembre de 2026, AWS anunció que MRSC ya admite quince regiones y cualquier combinación de tres regiones compatibles, incluidas configuraciones entre continentes. Por eso, al elegir las ubicaciones no dependas de listas antiguas de grupos regionales: consulta el [anuncio de disponibilidad de AWS](https://aws.amazon.com/about-aws/whats-new/2026/09/dynamodb-mrsc-additional-regions/) y confirma la compatibilidad vigente.

La [guía técnica sobre cómo funcionan las tablas globales](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_HowItWorks.html) explica consistencia, conflictos, transacciones y TTL, pero su apartado geográfico todavía muestra una distribución regional anterior. Para la cobertura actual de regiones usa el anuncio de AWS enlazado arriba; la guía sigue siendo útil para los límites de funcionamiento descritos en esta sección.

## Ejemplos para elegir

Piensa en un catálogo de productos consultado desde varios países. Si tolera que una región tarde brevemente en ver una actualización y prioriza lecturas y escrituras cercanas, MREC puede encajar. Conviene evitar escrituras concurrentes sobre el mismo elemento o hacer que la aplicación las dirija a una región, y hacer que las operaciones puedan repetirse de forma segura.

Para el estado de una reserva que debe verse de inmediato desde distintas regiones y no puede perder escrituras confirmadas durante un fallo regional, MRSC puede ser una alternativa. Acepta latencia adicional y verifica que la aplicación no dependa de TTL o transacciones globales. Un RPO cero no significa una interrupción cero ni una aplicación que se recupera sin redirigir tráfico.

Para repasar claves y consultas, consulta la [guía básica de Amazon DynamoDB](/blog/amazon-dynamodb-guia-basica/). También puedes revisar el [patrón de tabla única en DynamoDB](https://dev.to/bardengalicia/simplicidad-y-eficiencia-desmitificando-el-diseno-de-una-sola-tabla-en-amazon-dynamodb-8oc) para entender por qué el diseño de acceso a los datos sigue siendo importante aunque DynamoDB administre la replicación.

## Costos, permisos y cifrado

Una tabla global no replica gratis. Cada réplica añade almacenamiento y lecturas en su región; las escrituras replicadas se facturan en las regiones que tienen réplicas. El costo también depende del modo de capacidad, el tamaño de los elementos, los índices secundarios y el tráfico de la aplicación. AWS no cobra transferencia de datos entre regiones por la replicación de las tablas globales; un witness MRSC no añade cargos por unidades de escritura replicada, almacenamiento o transferencia hacia el witness. Consulta los componentes y ejemplos en la [guía de facturación de tablas globales](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/global-tables-billing.html) antes de comparar escenarios.

DynamoDB crea el rol vinculado al servicio `AWSServiceRoleForDynamoDBReplication` para operar la replicación. Las políticas de recursos no deben denegar los permisos que necesita ese rol. Las réplicas cifran sus datos en reposo con AWS KMS y deben usar el mismo tipo de clave KMS. La [documentación de seguridad de tablas globales](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/globaltables-security.html) detalla permisos y claves.

Si también estás evaluando replicación entre cuentas, el [episodio de Desplegando.cloud sobre Global Tables entre cuentas](https://desplegando.substack.com/p/dynamodb-global-tables-ahora-replica) resume ese anuncio de febrero de 2026. Esa opción es para aislamiento y gobernanza entre cuentas; la [guía de AWS](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GlobalTables.html) indica que MRSC solo admite tablas de una cuenta.

## Recursos y comunidades

- El [AWS User Group Córdoba Meetup #18](https://www.youtube.com/watch?v=7Xk0MKt69Is) tiene una grabación con charlas sobre modelado de datos en DynamoDB y OpenSearch.
- Para conversar con el [AWS User Group Córdoba en Meetup](https://www.meetup.com/aws-user-group-cordoba-argentina/), visita su grupo local sobre computación en la nube y AWS.
- En el [meetup de AWS User Group Panamá sobre DynamoDB 101 y Step Functions](https://www.youtube.com/watch?v=5Dmamlu1f9I) puedes escuchar dos temas de una sesión comunitaria; también puedes conocer sus próximas actividades en [Meetup](https://www.meetup.com/aws-user-group-panama/) y ver las grabaciones de su [canal de YouTube](https://www.youtube.com/channel/UCjr_J7Xva8QsHP31JfzYsYA).
- El [AWS Community Day Panamá: Security & Data Edition 2026](https://www.meetup.com/aws-user-group-panama/events/316732293/) está anunciado para el **14 de noviembre de 2026, de 08:00 a 13:00, hora de Panamá (UTC−5)**. La ficha indica “Save the Date” y todavía no especifica el lugar; confirma allí la sede, inscripción y agenda antes de asistir. Después de esa fecha, consulta la [agenda general de eventos AWS](/eventos/) para encontrar encuentros posteriores.
- Explora [comunidades AWS de Latinoamérica](/comunidades/) para encontrar grupos por país y sus canales de participación.
