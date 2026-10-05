---
title: "¿Qué base de datos elegir en AWS? RDS, Aurora y DynamoDB"
description: "Compara Amazon RDS, Aurora y DynamoDB según tus datos, consultas, disponibilidad, respaldos, seguridad y costo."
author: "guille-ojeda"
publishedAt: "2024-01-27"
publishedTimestamp: "2024-01-27T00:58:59.942Z"
modifiedTimestamp: "2026-10-05T00:34:04-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related: []
---

La elección depende de cómo tu aplicación organiza y consulta los datos. **Empieza por Amazon RDS** si necesitas SQL, relaciones entre tablas y consultas variadas. **Compara RDS con Amazon Aurora** si tu motor es compatible con MySQL o PostgreSQL y necesitas evaluar su arquitectura y opciones de operación. **Elige Amazon DynamoDB** cuando tus consultas se ajustan a claves y patrones de acceso definidos. Para análisis de grandes conjuntos de datos, considera Amazon Redshift; para acelerar lecturas repetidas, Amazon ElastiCache puede complementar una base de datos duradera.

No hay una opción que sea siempre la más rápida o la más barata. Esta guía compara los usos habituales, los costos que debes estimar y las decisiones de disponibilidad, recuperación y seguridad que conviene tomar antes de poner datos en producción. Para revisar también otras opciones de AWS, consulta la [guía oficial para elegir un servicio de base de datos](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/databases-on-aws-how-to-choose.html).

## RDS, Aurora, DynamoDB, Redshift y ElastiCache: comparación rápida

En una pantalla pequeña, desliza la tabla hacia los lados para ver todas las columnas.

| Servicio | Elígelo cuando… | Ejemplo | Qué revisar primero |
|---|---|---|---|
| [Amazon RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html) | Necesitas una base relacional administrada y SQL. | Pedidos, clientes e inventario que se consultan con relaciones entre tablas. | Motor, versión, consultas, transacciones y despliegue de alta disponibilidad. |
| [Amazon Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_AuroraOverview.html) | Tu aplicación usa PostgreSQL o MySQL y la edición compatible de Aurora satisface sus requisitos. | Una aplicación relacional que requiere evaluar el modelo de clúster y sus opciones de réplica. | Compatibilidad de versiones y funciones, arquitectura, Región y costo total. |
| [Amazon DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html) | Tus lecturas y escrituras siguen patrones conocidos por clave y quieres un modelo NoSQL administrado. | Sesiones, carritos o preferencias consultadas por el identificador de usuario. | Claves, índices, tamaño de los elementos, tráfico y modo de capacidad. |
| [Amazon Redshift](https://docs.aws.amazon.com/redshift/latest/mgmt/welcome.html) | Quieres consultar datos históricos o combinados para analítica e informes. | Informes de ventas que agregan millones de operaciones. | Volumen, frecuencia de consulta, latencia esperada y costo de cómputo y almacenamiento. |
| [Amazon ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html) | Quieres guardar en memoria resultados consultados con frecuencia para reducir lecturas a otra base de datos. | Catálogo o configuración que muchas solicitudes vuelven a leer. | Qué datos se pueden regenerar, expiración y coherencia de la caché. |

Redshift y ElastiCache resuelven problemas distintos de una base transaccional de la aplicación. Redshift está orientado al análisis de datos; ElastiCache suele actuar como una capa de caché y no como la fuente principal de verdad de un pedido o una cuenta.

## SQL o NoSQL: empieza por las consultas de tu aplicación

Una base relacional organiza datos en tablas, con filas, columnas y relaciones. SQL permite filtrar y combinar esas tablas, y el motor ofrece operaciones transaccionales de acuerdo con sus capacidades y configuración. Este modelo suele encajar cuando los datos tienen relaciones importantes —por ejemplo, un pedido pertenece a un cliente y contiene varios productos— o cuando necesitas consultas que pueden cambiar con el producto.

Una base NoSQL como DynamoDB modela los datos de otra manera. DynamoDB admite estructuras de clave-valor y documentos, y sus consultas se diseñan alrededor de claves e índices. No ofrece `JOIN` de SQL. Por eso conviene definir primero qué preguntas hará la aplicación y después diseñar las claves y los índices que permitan responderlas. La [guía oficial de modelado de datos para DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling.html) explica este enfoque.

Por ejemplo, una tienda puede guardar pedidos e inventario en RDS si necesita relacionar entidades y consultar combinaciones variadas. Puede usar DynamoDB para guardar el carrito asociado a un `userId` si las operaciones principales son obtenerlo y actualizarlo por esa clave. Una aplicación puede combinar más de un servicio, pero cada almacén adicional agrega decisiones de consistencia, monitoreo y costo; no es un requisito para empezar.

## Amazon RDS o Aurora: ¿Cuál conviene para una base relacional?

Amazon RDS es un servicio administrado donde eliges un motor relacional, como PostgreSQL, MySQL, MariaDB, Microsoft SQL Server, Oracle Database o IBM Db2. AWS gestiona tareas de infraestructura y operación del servicio, mientras que el equipo de la aplicación sigue siendo responsable, entre otras cosas, del diseño de datos, las consultas, los permisos y la configuración elegida.

Aurora es una familia de motores relacionales administrados por AWS, compatible con ediciones de MySQL y PostgreSQL. Se opera mediante las interfaces de Amazon RDS y organiza sus recursos como clústeres. En un clúster, una instancia escritora procesa lecturas y escrituras; las instancias lectoras opcionales sirven lecturas desde el mismo volumen de datos.

Ese volumen compartido es independiente de las instancias de cómputo y se distribuye entre tres zonas de disponibilidad. Por eso, agregar una instancia lectora no requiere copiar de nuevo todos los datos. Un lector también puede absorber consultas de lectura y ser un destino para la conmutación por error. AWS describe el modelo en la guía de [clústeres de Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.html), el [almacenamiento compartido de Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.StorageReliability.html) y la [replicación del clúster](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Replication.html).

**El almacenamiento distribuido no equivale a tener una instancia lectora lista.** Si solo hay una instancia escritora y falla, el clúster puede quedar sin servicio mientras AWS la recupera. La disponibilidad para la aplicación también depende de cómo restablece sus conexiones y reintenta las operaciones.

Esa diferencia permite decidir: RDS te deja elegir entre varios motores relacionales; Aurora puede ser una alternativa si ya trabajas con MySQL o PostgreSQL y quieres evaluar su volumen compartido, réplicas lectoras y comportamiento de clúster. Compara la edición compatible, la cantidad de instancias que vas a ejecutar y el costo de esa arquitectura con la configuración de RDS que ya conoces. Esa compatibilidad no significa que cada versión, extensión o comportamiento del motor original sea idéntico: antes de migrar, comprueba las [versiones y funciones compatibles de Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.VersionPolicy.html).

Una forma práctica de decidir:

- Si ya usas un motor soportado por RDS y quieres moverlo a un servicio administrado con cambios acotados, empieza por comparar ese motor en RDS.
- Si tu aplicación usa MySQL o PostgreSQL y necesitas evaluar el almacenamiento de clúster, la réplica o las opciones propias de Aurora, compáralo con la edición compatible de Aurora.
- Si no tienes mediciones que muestren un límite o una necesidad concreta, no elijas Aurora solo por afirmaciones generales de que siempre supera a RDS. Prueba la carga y compara el costo y la operación de ambas opciones.

RDS y Aurora tienen motores, capacidades, versiones y modelos de precio distintos. La decisión se toma con los requisitos de tu aplicación, no con una cifra genérica de rendimiento.

## ¿Cuándo tiene sentido DynamoDB?

DynamoDB es una base de datos NoSQL administrada para modelos de clave-valor y documentos. Puede encajar bien cuando la aplicación conoce las claves con las que va a leer y escribir. Una sesión identificada por `sessionId`, por ejemplo, tiene un patrón sencillo: buscar, actualizar y vencer los datos de esa sesión.

Antes de elegirlo, escribe las consultas que la aplicación necesita hacer. Define qué clave identifica cada elemento, qué consultas requieren un índice y cómo se distribuyen las lecturas y escrituras. Si el producto depende de combinaciones ad hoc entre varias entidades, filtros que cambian o relaciones complejas, evalúa primero una base relacional. DynamoDB admite transacciones para operaciones que cumplan sus condiciones, pero eso no lo convierte en una base SQL ni elimina la necesidad de modelar las consultas por adelantado.

DynamoDB ofrece modos de capacidad bajo demanda y aprovisionada. La [documentación de AWS sobre capacidad de lectura y escritura](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html) describe cómo se administran y facturan esos modos. El modo bajo demanda evita estimar de antemano una tasa fija de lectura y escritura; el aprovisionado requiere declarar capacidad y se cobra por la capacidad configurada. Ninguno garantiza por sí solo que la factura sea pequeña: el tamaño de los elementos, las operaciones, los índices y otras funciones también importan.

## Disponibilidad, copias de seguridad y seguridad

Elegir el motor es solo una parte de la decisión. Define por separado cuánto tiempo de interrupción y pérdida de datos tolera tu aplicación, quién puede conectarse y cómo vas a recuperar información borrada o dañada.

En RDS, una configuración Multi-AZ puede proporcionar conmutación por error entre zonas de disponibilidad. Las réplicas de lectura y las copias de seguridad cumplen funciones distintas: una réplica puede apoyar lecturas o recuperación según el diseño, mientras que un respaldo sirve para restaurar una versión anterior. Revisa qué ofrece el motor y despliegue elegidos en la [documentación de alta disponibilidad de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html).

Configura una política de respaldo y prueba la restauración. RDS permite definir la retención de copias automatizadas y recuperar a un punto en el tiempo dentro del período disponible; DynamoDB tiene copias bajo demanda y recuperación a un punto en el tiempo que se configuran y facturan según sus condiciones. Una copia existente no demuestra que la aplicación pueda restaurarla correctamente. Consulta la documentación de [copias y recuperación de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html) y de [recuperación a un punto en el tiempo de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html).

Para RDS, limita el acceso de red a los componentes que necesitan conectarse; suele convenir usar subredes privadas y reglas de grupo de seguridad acotadas. Revisa autenticación, cifrado en tránsito y cifrado en reposo. Para DynamoDB, controla el acceso a tablas mediante IAM y las políticas aplicables, y decide cómo proteger las copias de seguridad. Una subred privada de RDS no es el mecanismo de acceso a una tabla DynamoDB. La guía de [seguridad de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.html) y la guía de [seguridad de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/security.html) describen controles propios de cada servicio.

## Cómo estimar el costo de una base de datos en AWS

Compara el costo de una carga de trabajo concreta, con la Región y configuración que piensas usar. En RDS o Aurora considera el motor, cómputo, almacenamiento, entrada/salida, respaldos, transferencia y opciones como Multi-AZ o réplicas. En DynamoDB considera lecturas y escrituras, tamaño de los elementos, índices, almacenamiento, copias de seguridad y el modo de capacidad. Otros servicios y opciones pueden agregar conceptos a la factura.

Consulta los [precios actuales de Amazon RDS y Aurora](https://aws.amazon.com/rds/pricing/) y los [precios actuales de DynamoDB](https://aws.amazon.com/dynamodb/pricing/). Los importes dependen de la Región, el motor, el uso y la configuración; vuelve a calcularlos antes de desplegar. No hay un servicio que sea siempre el más barato, y una opción de capacidad flexible no es una garantía de gasto bajo. Si administras una cuenta de AWS, una alerta de presupuesto puede ayudarte a detectar cambios de gasto; la [guía de alertas de costos de AWS](/blog/automatizar-alertas-de-costos-aws-en-5-pasos/) explica ese seguimiento.

## Un recorrido simple para aprender y probar

1. Escribe tres o cuatro consultas que tu aplicación necesita hacer y cuántos datos espera guardar.
2. Decide si las relaciones, transacciones y consultas variadas apuntan a SQL, o si las operaciones conocidas por clave hacen viable NoSQL.
3. Compara las versiones compatibles, la disponibilidad, los respaldos, la seguridad y el costo en la Región elegida.
4. Prueba con datos no sensibles y una carga representativa; verifica también que puedas restaurar un respaldo.

Si quieres practicar una consulta por clave sin empezar por una aplicación completa, el [laboratorio de diez ejercicios de AWS para principiantes](/blog/10-laboratorios-practicos-de-aws-para-principiantes/) incluye una práctica para guardar dos notas en DynamoDB, consultarlas y revisar los costos y la limpieza de recursos.

Para ver cómo se diseña un acceso por claves, mira la [grabación del AWS User Group Córdoba sobre modelado de datos en DynamoDB](https://www.youtube.com/watch?v=7Xk0MKt69Is). La charla es de 2023 y recorre un ejemplo de comercio electrónico; sus conceptos sirven para estudiar el modelo, mientras que la documentación oficial enlazada arriba es la referencia para funciones actuales.

Si prefieres escuchar una comparación general, el [episodio 6 de Charlas Técnicas de AWS, «Cómo elegir la base de datos correcta para tu aplicación»](https://podcast.marcia.dev/932377/episodes/4850999-6-como-elegir-la-base-de-datos-correcta-para-tu-aplicacion) recorre RDS, Aurora, DynamoDB, Redshift y otros modelos. Se publicó en agosto de 2020; úsalo para conocer criterios y verifica los servicios y opciones actuales en la documentación oficial enlazada en esta guía.

Si prefieres practicar fuera de una cuenta de AWS, la [guía de Rossana Suárez para una aplicación con Docker y DynamoDB Local](https://blog.295devops.com/de-lo-local-se-aprende-desplegando-tu-primera-app-con-docker-y-dynamodb-local) muestra un ejemplo que corre localmente. DynamoDB Local permite explorar operaciones de desarrollo, pero no reproduce por sí solo las características, precios ni condiciones operativas del servicio administrado.

Al revisar esta guía el **4 de octubre de 2026**, había un taller presencial de Amazon RDS anunciado en Atlixco, México, para el **29 de octubre de 2026, de 12:00 a 14:00, hora de Ciudad de México**. Lo organiza AWS Student Builder Group at Higher Technological Institute of Atlixco y enseña a crear y conectar una base SQL. [Consulta los detalles e inscripción en Meetup](https://www.meetup.com/aws-sbg-at-higher-technological-institute-of-atilxco/events/316823085/); confirma allí la disponibilidad, los requisitos y cualquier cambio antes de asistir. Es presencial y local, no una sesión virtual.

Si buscas dónde preguntar o seguir aprendiendo después de practicar, consulta el [directorio de AWS User Groups de Builder Center](https://builder.aws.com/community/user-groups) para encontrar un grupo local o virtual. En Argentina, el [AWS User Group Córdoba en Meetup](https://www.meetup.com/aws-user-group-cordoba-argentina/) publica encuentros y espacios para compartir experiencias; revisa su agenda y las condiciones de cada actividad.

## Preguntas frecuentes sobre bases de datos en AWS

### ¿Qué diferencia hay entre RDS y DynamoDB?

RDS aloja motores relacionales que usan SQL; encaja con tablas relacionadas y consultas variadas. DynamoDB usa un modelo NoSQL de clave-valor y documentos; encaja cuando la aplicación conoce de antemano los patrones de acceso por clave. El modelo de datos y las consultas suelen ser la diferencia decisiva.

### ¿Amazon Aurora es lo mismo que Amazon RDS?

Aurora es una familia de motores relacionales administrados y compatibles con MySQL y PostgreSQL, operada mediante las interfaces de RDS. Tiene versiones, funciones, arquitectura y precios propios. Comprueba la compatibilidad antes de tratarla como reemplazo directo de otro motor.

### ¿Cuál es la base de datos más barata de AWS?

No existe una respuesta universal. Estima el costo con tu Región, motor, cantidad de datos, lecturas y escrituras, almacenamiento, respaldo, disponibilidad y transferencia. Después compara el cálculo con una prueba de carga representativa.

### ¿Redshift reemplaza a RDS para una aplicación web?

No suelen resolver el mismo problema. RDS es una opción para datos operativos y transacciones de una aplicación; Redshift es un almacén de datos para análisis e informes. La elección depende de si tu consulta atiende una operación del producto o analiza conjuntos de datos para obtener métricas.
