---
title: "Amazon Aurora Global Database: cómo funciona y cuándo usarla"
description: "Conoce la replicación entre regiones de Aurora Global Database, sus endpoints, costos y las diferencias entre un switchover planificado y un failover."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:04:43.715Z"
modifiedTimestamp: "2026-10-05T23:42:46Z"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Amazon RDS o Aurora: cómo elegir una base de datos relacional en AWS"
    url: "https://dondeaprendoaws.com/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/"
  - title: "¿Qué base de datos elegir en AWS? RDS, Aurora y DynamoDB"
    url: "https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/"
  - title: "Tablas globales de Amazon DynamoDB: consistencia, regiones y costos"
    url: "https://dondeaprendoaws.com/blog/base-de-datos-global-con-amazon-dynamodb/"

---

Amazon Aurora Global Database extiende un clúster de Aurora a varias regiones de AWS. Sirve para atender lecturas cerca de usuarios distribuidos y prepararse para una interrupción regional. Mantiene **una sola región primaria para las escrituras**; las regiones secundarias son de lectura y reciben cambios mediante replicación asíncrona.

Antes de elegirla, separa tres necesidades que suelen confundirse:

- **Alta disponibilidad dentro de una región:** una configuración Multi-AZ ayuda ante fallos de instancia o zona.
- **Lecturas en otras regiones:** los clústeres secundarios de Global Database pueden acercar las lecturas a la aplicación.
- **Recuperación ante una interrupción regional:** un failover puede promover un secundario, con una pérdida potencial de las escrituras aún no replicadas.

Si estás comparando motores relacionales y opciones Multi-AZ, consulta la [guía para elegir entre Amazon RDS y Aurora](/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/).

## Cómo se distribuyen las lecturas y escrituras

Una base global tiene un clúster primario en una región y puede tener hasta diez clústeres secundarios, cada uno en una región diferente. Las escrituras se procesan en el primario. Aurora copia los cambios a los secundarios con una latencia que AWS describe como normalmente inferior a un segundo; el retraso puede variar y no es una garantía de que todas las lecturas regionales vean una escritura de inmediato.

La aplicación puede enviar lecturas al endpoint de lectura del clúster más cercano. Si una lectura en una región secundaria tiene que reflejar una escritura recién confirmada en la región primaria, considera dirigir esa lectura al primario o definir cómo tolerará la aplicación datos rezagados.

El **endpoint global de escritura** apunta al escritor actual y sigue la región primaria después de un cambio planificado o una recuperación. Cada clúster también tiene endpoints de escritura y lectura. Aurora puede reenviar ciertas escrituras desde un clúster secundario al primario (*write forwarding*); no convierte el sistema en multiwriter y no admite todas las instrucciones SQL. Comprueba la compatibilidad del motor y revisa cómo cambia la conexión tras un failover o switchover.

La [guía de Aurora Global Database](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database.html) explica la topología, sus límites y las versiones disponibles. La [guía de conexión y endpoints](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database-connecting.html) detalla los endpoints global, de escritura y de lectura; la [documentación de write forwarding](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database-write-forwarding.html) describe las consultas que puede reenviar.

Para una introducción general en español a la arquitectura del servicio, consulta [Explorando Amazon Aurora de AWS Español](https://dev.to/aws-espanol/explorando-amazon-aurora-la-base-de-datos-relacional-de-proxima-generacion-4ln1). Se publicó en 2023; trata sus comparaciones de rendimiento como contexto, no como predicción para tu carga.

## Switchover planificado y failover no planificado

Un **switchover** cambia la región primaria en una operación planificada, por ejemplo, para probar la recuperación o mover una carga de trabajo. Aurora sincroniza primero el secundario elegido con el primario, por lo que el cambio planificado no pierde datos confirmados. Puede haber una interrupción breve mientras cambian los roles. Revisa que las versiones del motor y la configuración sean compatibles.

Un **failover** responde a una interrupción no planificada. La replicación entre regiones es asíncrona, así que puede perderse el tramo de escrituras que aún no llegó al secundario elegido. El RPO indica cuánto tiempo de datos recientes podría perderse; el RTO indica cuánto se tarda en restablecer la operación. AWS describe el RPO habitual en segundos y el tiempo de recuperación en minutos, pero el resultado depende del retraso de replicación, del motor y del estado de la carga. Para Aurora PostgreSQL existe una opción de RPO que puede frenar escrituras cuando ningún secundario cumple el objetivo configurado; es un intercambio entre limitar la pérdida potencial y mantener el ritmo de escrituras.

No trates el failover regional como un sustituto de Multi-AZ ni des por hecho que siempre termina en menos de un minuto. Define cuánto tiempo de interrupción y cuánta pérdida de datos puede tolerar la aplicación; después prueba el procedimiento y sus conexiones. AWS detalla estas diferencias en la [guía de switchovers y failovers](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database-disaster-recovery.html).

## Qué revisar antes de adoptarla

**Versiones y regiones.** Confirma que el motor y su versión admitan Global Database, write forwarding y el tipo de cambio regional que necesitas. La compatibilidad y los límites cambian por motor y versión; la [guía de requisitos de configuración](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database.configuration.requirements.html) mantiene esos detalles.

**Cifrado, KMS y permisos.** Comprueba el cifrado de cada clúster. Los clústeres creados antes del 18 de febrero de 2026 pueden no estar cifrados; los snapshots, clones y réplicas lectoras derivados de un origen sin cifrar también pueden permanecer sin cifrar. Los clústeres nuevos creados desde esa fecha usan por defecto una clave propiedad de AWS. Si necesitas una clave administrada por tu organización, elígela al crear el clúster; la clave no se cambia en el mismo clúster y deshabilitarla puede dejarlo inaccesible. Para cifrar un origen anterior, restaura una copia con una clave KMS. Al copiar snapshots cifrados entre regiones, usa una clave válida en la región de destino. Usa TLS para las conexiones de clientes. Aurora administra la replicación y crea su rol vinculado al servicio; la identidad que crea el clúster necesita permiso para esa operación. Consulta [cifrado y KMS en Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Overview.Encryption.html) y [roles vinculados al servicio](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/UsingWithRDS.IAM.ServiceLinkedRoles.html).

**Respaldos y restauración.** La replicación global no reemplaza una política de backup. Define la retención de copias automáticas, conserva snapshots según la necesidad y prueba restaurarlos. El almacenamiento de backups y las copias entre regiones pueden tener cargos; revisa la [guía de backups de Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-storage-backup.html).

**Costo total.** Una región secundaria añade recursos y operación. Estima las instancias o la capacidad de Aurora Serverless, almacenamiento, I/O, backups y transferencia de datos entre regiones para cada topología. Una réplica pequeña puede costar menos que una de lectura dimensionada para tráfico constante, pero la elección depende de la carga y del RTO esperado. Compara escenarios en los precios de [Amazon Aurora](https://aws.amazon.com/rds/aurora/pricing/) antes de decidir.

## Cuándo encaja

Considera Global Database si la aplicación necesita lecturas relacionales en varias geografías o una ruta de recuperación regional más rápida que restaurar una copia convencional, y acepta mantener una región escritora. Si solo necesitas tolerar fallos de instancia o zona, una configuración Multi-AZ puede resolverlo con menos componentes. Si necesitas escrituras cercanas a los usuarios en varias regiones y el modelo de datos es de clave-valor o documentos, compara también las [tablas globales de DynamoDB](/blog/base-de-datos-global-con-amazon-dynamodb/); resuelven un problema distinto y no sustituyen sin más a una base relacional.

Ejemplo: para una tienda con usuarios en varios países, el clúster primario puede procesar pedidos y las regiones secundarias servir consultas de catálogo. La aplicación debe decidir qué lecturas toleran retraso y cómo recuperará las escrituras si la región primaria deja de estar disponible.

## Recursos para seguir aprendiendo

- El [blog de bases de datos de AWS](https://aws.amazon.com/blogs/database/) publica explicaciones y novedades sobre Aurora, RDS y otros servicios de datos.
- Para seguir las charlas y participar, visita el [sitio de AWS Women Colombia](https://awswomencolombia.com/), su [User Group en Meetup](https://www.meetup.com/aws-women-colombia-user-group/) o el [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw).
- Explora [comunidades AWS de Latinoamérica](/comunidades/) para encontrar grupos y canales donde hacer preguntas o participar.
- Consulta la [agenda de eventos de comunidades AWS](/eventos/) para ver encuentros próximos; las fechas y condiciones de inscripción se actualizan en cada ficha.
