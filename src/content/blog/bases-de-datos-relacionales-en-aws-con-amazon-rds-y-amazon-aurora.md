---
title: "Amazon RDS o Aurora: cómo elegir una base de datos relacional en AWS"
description: "Compara los motores de Amazon RDS y Aurora, las opciones Multi-AZ, las réplicas de lectura, la seguridad y los costos para elegir una base relacional en AWS."
author: "guille-ojeda"
publishedAt: "2024-01-31"
publishedTimestamp: "2024-01-31T00:42:48.279Z"
modifiedTimestamp: "2026-10-05T23:42:46Z"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "¿Qué base de datos elegir en AWS? RDS, Aurora y DynamoDB"
    url: "https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/"
  - title: "Amazon Aurora Global Database: cómo funciona y cuándo usarla"
    url: "https://dondeaprendoaws.com/blog/base-de-datos-global-con-amazon-aurora/"
  - title: "Tablas globales de Amazon DynamoDB: consistencia, regiones y costos"
    url: "https://dondeaprendoaws.com/blog/base-de-datos-global-con-amazon-dynamodb/"

---

Amazon Aurora forma parte de la oferta de Amazon RDS. Para elegir una base relacional, compara **RDS para motores estándar** con **Aurora, sus motores compatibles con MySQL y PostgreSQL y su arquitectura propia**. La decisión depende de la compatibilidad que necesita la aplicación, la disponibilidad requerida y el costo de la carga, no de una regla universal de que uno sea siempre más rápido o más barato.

Si recién comparas los tipos de bases de datos en AWS, comienza con esta [guía para elegir entre RDS, Aurora y DynamoDB](/blog/aws-bases-de-datos-introduccion-basica/).

## Elige primero el motor y la compatibilidad

Entre los motores estándar de Amazon RDS están **IBM Db2, MariaDB, Microsoft SQL Server, MySQL, Oracle y PostgreSQL**, con versiones y funciones que varían por región. Aurora ofrece motores compatibles con MySQL y PostgreSQL; esa compatibilidad no hace que Aurora MySQL sea idéntico a RDS para MySQL ni que Aurora PostgreSQL sea idéntico a RDS para PostgreSQL. Antes de migrar, verifica versión, extensiones, funciones, controladores y diferencias de comportamiento.

### RDS para un motor estándar

Evalúa RDS para Db2, MariaDB, SQL Server, MySQL, Oracle o PostgreSQL si la aplicación depende de ese motor y de sus funciones concretas. La [lista de motores de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateDBInstance.html) sirve para orientarse; confirma allí las versiones y características disponibles en la región que te interesa.

### Aurora compatible con MySQL o PostgreSQL

Evalúa Aurora si la aplicación puede usar las versiones compatibles de Aurora MySQL o Aurora PostgreSQL. Compara su arquitectura de clúster, réplicas, Serverless o Global Database con la carga real. Las [preguntas frecuentes de Aurora](https://aws.amazon.com/rds/aurora/faqs/) resumen compatibilidad y diferencias del motor.

Para ampliar la comparación en español, mira la charla de [AWS Women Colombia sobre RDS, Aurora y ElastiCache](https://www.youtube.com/watch?v=5xlrzYNEFs0).

## Alta disponibilidad no es lo mismo que servir más lecturas

En RDS, el nombre **Multi-AZ** abarca dos tipos de despliegue que conviene distinguir:

- Un **despliegue Multi-AZ de instancia** mantiene una réplica en espera, con replicación síncrona y failover administrado. La réplica en espera no recibe consultas de lectura. Revisa los detalles del [despliegue Multi-AZ de instancia](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html).
- Un **clúster Multi-AZ** tiene un escritor y dos lectores en tres zonas de disponibilidad de la misma región. Los lectores pueden atender tráfico de lectura y servir como destinos de failover. No es un clúster de Aurora; la [guía de clústeres Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts.html) explica sus diferencias y compatibilidad por motor.

Las **réplicas de lectura** son otra opción: usan replicación asíncrona para atender consultas de lectura o servir como base para una recuperación. Si falla la instancia primaria, promover una réplica a una instancia independiente requiere una acción operativa; puede tener retraso y no equivale al failover automático de Multi-AZ. Revisa la compatibilidad por motor y región en la [guía de réplicas de lectura de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html).

Para una explicación en español con diagramas sobre Multi-AZ de instancia y de clúster, lee la guía de [alta disponibilidad con RDS Multi-AZ de John Bulla](https://dev.to/aws-espanol/alta-disponibilidad-con-aws-rds-multi-az-750). Se publicó en 2023 y su cuadro incluye tiempos y disponibilidad de esa época; usa la documentación oficial enlazada arriba para comprobar el soporte y los detalles vigentes.

Si quieres una práctica, [Implementando una instancia de RDS Multi-AZ](https://dev.to/aws-espanol/implementando-instancia-de-base-de-datos-aws-rds-multi-az-f30) crea recursos facturables de RDS y EC2 y modifica la red y un grupo de seguridad. Es de 2023: antes de seguirla, revisa en la guía oficial las opciones actuales, comprueba que el grupo de seguridad permita el puerto 3306 solo desde el origen que necesita conectarse y elimina los recursos de práctica al terminar para evitar exposición o cargos no deseados.

Aurora organiza la base en un clúster con una instancia escritora y réplicas lectoras. Para lecturas fuera de la región primaria y recuperación regional, Aurora Global Database añade clústeres secundarios en otras regiones. Un switchover planificado y un failover ante una caída tienen consecuencias distintas sobre los datos; la [guía de Aurora Global Database](/blog/base-de-datos-global-con-amazon-aurora/) explica esos casos.

La alta disponibilidad entre zonas ayuda ante ciertos fallos dentro de una región. Una réplica en otra región ayuda con lecturas distribuidas o recuperación regional. Ninguna opción elimina la necesidad de elegir endpoints, redirigir tráfico y probar el comportamiento de la aplicación.

## Rendimiento y costo: mide la carga que tienes

No uses las comparaciones de rendimiento publicadas como una predicción para cualquier aplicación. Las consultas, índices, concurrencia, tamaño de instancia y versión pueden cambiar el resultado. Prueba una carga representativa y compara latencia, capacidad de lectura, escritura y recuperación.

RDS y Aurora pueden implicar cargos de cómputo, almacenamiento, I/O, backups, transferencia y disponibilidad. Multi-AZ, réplicas de lectura y copias entre regiones suman recursos. Aurora Serverless v2 ajusta la capacidad de cómputo dentro de límites de unidades de capacidad de Aurora (ACU) que defines; cobra por capacidad utilizada, además de almacenamiento, I/O y otros componentes aplicables. No es automáticamente la opción más económica: compara la distribución de la carga y los mínimos de capacidad con una configuración provisionada.

Usa los precios actuales de [Amazon RDS](https://aws.amazon.com/rds/pricing/) y [Amazon Aurora](https://aws.amazon.com/rds/aurora/pricing/) para estimar configuraciones equivalentes. La [guía de Aurora Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.how-it-works.html) describe su escalado y requisitos.

## Seguridad, conectividad y respaldos

Mantén la base en una VPC y deja el acceso de red limitado a los servicios que la necesitan. Evita exponerla públicamente salvo que exista una razón concreta y controles adecuados. Usa TLS para la conexión cliente-base de datos; considera IAM para autenticación solo en los motores y flujos compatibles. AWS Secrets Manager puede administrar credenciales. La [guía de seguridad de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.html) enlaza las opciones de VPC, grupos de seguridad, TLS, autenticación y secretos.

El cifrado de almacenamiento y snapshots usa claves de AWS KMS. Decide si necesitas una clave administrada por el cliente antes de crear el clúster y conserva los permisos y el acceso a esa clave. Configura la retención de backups automáticos, entiende por cuánto tiempo necesitas recuperación a un punto en el tiempo y prueba restaurar una copia. Los backups no sustituyen una prueba de recuperación; los snapshots copiados y la retención pueden añadir costos.

## Ejemplo de decisión

Imagina una tienda que guarda pedidos, clientes e inventario en tablas relacionadas y usa transacciones para evitar estados parciales al confirmar un pedido. Si depende de extensiones específicas de PostgreSQL, compara primero RDS para PostgreSQL y Aurora PostgreSQL en las versiones compatibles. Si necesita lecturas en otras regiones, evalúa réplicas y Aurora Global Database, junto con el retraso de replicación que la aplicación puede tolerar.

En cambio, si el acceso principal se basa en claves y elementos, sin joins relacionales, compara DynamoDB y sus [tablas globales](/blog/base-de-datos-global-con-amazon-dynamodb/). Cada modelo resuelve necesidades distintas; evita elegir solo por una cifra de rendimiento o por el nombre del servicio.

## Recursos, comunidades y próximos encuentros

- El [laboratorio práctico de Amazon RDS para MySQL de AWS User Group Caracas](https://www.youtube.com/watch?v=nu9U0DA49w4) muestra un ejercicio sobre una base administrada. Antes de repetir prácticas, confirma si crean recursos en AWS, cuánto tiempo permanecen activos y qué cargos pueden generar. Para conectar con el grupo, visita [AWS User Group Caracas en Meetup](https://www.meetup.com/aws-user-group-caracas/) o su [grupo de Telegram](https://t.me/awsCaracas).
- Para seguir charlas y participar en AWS Women Colombia, visita su [sitio](https://awswomencolombia.com/), [User Group en Meetup](https://www.meetup.com/aws-women-colombia-user-group/) o [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw).
- El **AWS SBG at Higher Technological Institute of Atlixco** anuncia la actividad presencial [“Amazon RDS: Bases de datos administradas”](https://www.meetup.com/aws-sbg-at-higher-technological-institute-of-atilxco/events/316823085/) para el **29 de octubre de 2026, de 12:00 a 14:00, hora de Atlixco (UTC−6)**. La descripción propone configurar una base SQL y conectarla con una aplicación; la ficha pública muestra Atlixco, pero no una dirección de calle. Confirma en Meetup la ubicación exacta, inscripción y requisitos antes de asistir.
- Encuentra más [comunidades AWS de Latinoamérica](/comunidades/) y revisa la [agenda de eventos](/eventos/) para las actividades posteriores al 29 de octubre.
