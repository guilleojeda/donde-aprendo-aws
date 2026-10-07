---
title: 'Tipos y tamaños de instancias RDS: cómo elegir la clase'
description: Guía para elegir una clase y un tamaño de Amazon RDS según el motor, la carga, CPU, memoria, almacenamiento, disponibilidad y costo.
author: guille-ojeda
publishedAt: '2024-03-09'
publishedTimestamp: '2024-03-09T00:25:35.456Z'
cover: /assets/blog/editorial-datos-ia.png
coverAlt: Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja.
ogImage: /assets/blog/editorial-datos-ia.png
related:
- title: 'Amazon RDS o Aurora: cómo elegir una base de datos relacional en AWS'
  url: https://dondeaprendoaws.com/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/
- title: 'Cómo usar AWS Cost Explorer: filtros y costos que no aparecen'
  url: https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/
- title: Cómo visualizar costos de AWS con CUR 2.0, Athena y QuickSight
  url: https://dondeaprendoaws.com/blog/visualiza-costos-con-aws-cost-and-usage-reports-y-quicksight/
- title: 'Amazon ElastiCache: motores, caché y conexión segura'
  url: https://dondeaprendoaws.com/blog/guia-de-amazon-elasticache-almacenamiento-en-cache-en-memoria/
modifiedTimestamp: '2026-10-07T10:03:05-03:00'
review:
  date: '2026-10-07'
---


Para elegir el tamaño de una instancia de Amazon RDS, confirma primero qué clases admite tu motor, su versión y tu Región de AWS. Luego identifica el límite de la carga —CPU, memoria, almacenamiento o conexiones— y compara clases con métricas de un período representativo. No hay un tamaño universal para «desarrollo», «pruebas» o «producción»: la carga, el motor y el nivel de disponibilidad cambian la decisión.

## Qué significan el tipo y el tamaño

Una **clase de instancia de base de datos** combina un tipo de clase y un tamaño. Por ejemplo, en <code>db.r6g.2xlarge</code>, <code>db.r6g</code> identifica el tipo y <code>2xlarge</code> el tamaño. El tipo indica el perfil de cómputo; el tamaño define la capacidad disponible dentro de esa familia. La clase influye en CPU y memoria, además de los límites de rendimiento de red y de E/S.

La clase y el almacenamiento son decisiones relacionadas, pero distintas. Elegir una instancia más grande no aumenta automáticamente los GB asignados, las IOPS aprovisionadas ni el rendimiento del volumen. A la vez, una clase puede limitar cuánto aprovecha la base de datos del almacenamiento que configuraste. Confirma ambas partes antes de cambiar una.

Los nombres de familia que aparecen abajo son una orientación, no un catálogo de compatibilidad. Las clases disponibles cambian según motor, versión y, en algunos casos, edición del motor, Región y modalidad de despliegue. La [documentación de AWS sobre clases de RDS](https://docs.aws.amazon.com/es_es/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.html) explica su formato; la [tabla de compatibilidad por motor](https://docs.aws.amazon.com/es_es/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Support.html) detalla las excepciones.

Si estás empezando por el servicio, la grabación [Introducción a Amazon RDS](https://www.youtube.com/watch?v=2Ng-Ot0VH_k) de AWS User Group CreaTicas repasa sus conceptos básicos.

En una pantalla pequeña, desliza la tabla hacia los lados para ver todas las columnas.

| Tipo de clase | Cuándo conviene evaluarlo | Qué revisar |
| --- | --- | --- |
| <code>db.m*</code>, uso general | Si buscas un equilibrio entre CPU y memoria para una carga relacional variada. | El consumo sostenido y los picos de la carga real. |
| <code>db.r*</code>, optimizada para memoria | Si la memoria es el límite: por ejemplo, cuando el conjunto de trabajo no cabe bien en memoria y aumenta la lectura desde disco. | Memoria disponible, actividad de E/S y rendimiento de consultas; no la elijas solo porque la base guarda muchos GB. |
| <code>db.c*</code>, optimizada para cómputo | Si la base necesita CPU sostenida y esa familia está disponible para el motor y despliegue que usas. | Compatibilidad exacta, licencias cuando correspondan y si el problema está en CPU o en consultas ineficientes. |
| <code>db.t*</code>, ampliable o burstable | Si la carga suele ser baja y tiene picos breves que pueden usar créditos de CPU. | La duración de los picos, el saldo de créditos y los cargos por créditos excedentes. |

Algunas clases basadas en AWS Graviton usan procesadores Arm; por ejemplo, en ciertos tipos el sufijo <code>g</code> identifica esa plataforma. Amazon RDS administra el servidor de base de datos: la aplicación cliente sigue conectándose mediante el protocolo del motor y no necesita usar un procesador Arm por esa elección. La clase basada en Graviton debe estar disponible para la combinación concreta de motor, versión y Región, así que compruébala igual que cualquier otra. RDS no da acceso directo al host en las instancias estándar; consulta la nota sobre [instancias de base de datos RDS](https://docs.aws.amazon.com/es_es/AmazonRDS/latest/UserGuide/Overview.DBInstance.html) si necesitas distinguirlas de RDS Custom.

## Cómo elegir una clase paso a paso

1. **Fija el motor, la versión y la Región.** La disponibilidad de una familia no se deduce de su nombre ni de que exista en otra Región. Incluye la edición de Db2, Oracle o SQL Server cuando corresponda, y comprueba las restricciones del despliegue.
2. **Mide una carga representativa.** Observa un período que incluya la actividad habitual y los picos. Si recién comienzas, usa un entorno de prueba con datos y consultas que se parezcan a los del uso previsto; vuelve a medir antes de aplicar la elección en producción.
3. **Busca el recurso que limita la base.** CPU alta, falta de memoria, espera por disco y exceso de conexiones apuntan a causas distintas. Antes de sumar capacidad, examina consultas lentas, bloqueos, esperas y patrones de conexión.
4. **Compara tamaños de la misma familia y después familias distintas.** Cambia una variable por vez cuando hagas una comparación. Registra latencia, errores, conexiones y costo de la configuración completa bajo una carga comparable.
5. **Decide el almacenamiento y la disponibilidad por separado.** Una réplica de lectura, una implementación Multi-AZ y un volumen con IOPS aprovisionadas responden a objetivos distintos y tienen costo propio.
6. **Planifica el cambio.** Cambiar la clase de RDS puede producir una interrupción. Confirma cuándo se aplicará el cambio, el efecto sobre tus conexiones y cómo recuperará el servicio la aplicación. La [tabla de cambios de configuración](https://docs.aws.amazon.com/es_es/AmazonRDS/latest/UserGuide/USER_ModifyInstance.Settings.html) indica el efecto esperado por ajuste.

Para comprobar qué combinaciones están disponibles, puedes usar la consola de RDS o la operación de solo lectura <code>describe-orderable-db-instance-options</code>. Este ejemplo consulta PostgreSQL en <code>us-east-1</code>; cambia el motor y la Región por los tuyos:

<pre><code>aws rds describe-orderable-db-instance-options \
  --engine postgres \
  --region us-east-1 \
  --query 'OrderableDBInstanceOptions[].{Version:EngineVersion,Class:DBInstanceClass,Storage:StorageType}' \
  --output table</code></pre>

Sin <code>--engine-version</code>, la salida puede incluir varias versiones compatibles. Agrega ese parámetro con la versión exacta que planeas usar para acotar la consulta. La operación enumera opciones disponibles; no modifica recursos ni calcula su precio. Consulta la [guía de AWS para verificar la compatibilidad regional](https://docs.aws.amazon.com/es_es/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.RegionSupport.html) y la [referencia del comando de AWS CLI](https://docs.aws.amazon.com/cli/latest/reference/rds/describe-orderable-db-instance-options.html). La consola y la consulta describen opciones compatibles; no reemplazan una prueba de carga.

Para practicar la creación y configuración de una base RDS para MySQL, puedes seguir [Práctica #5: Laboratorio práctico de Amazon RDS MySQL](https://www.youtube.com/watch?v=nu9U0DA49w4), de AWS User Group Caracas. Es un ejercicio con el servicio; consulta la compatibilidad actual de clases en la documentación de AWS.

## Usa las métricas para encontrar el límite

Las métricas de CloudWatch ayudan a decidir qué comparar, pero un valor aislado no es una recomendación automática de cambio. Mira tendencias y picos junto con las consultas y esperas de la base. AWS publica métricas de RDS en [CloudWatch](https://docs.aws.amazon.com/es_es/AmazonRDS/latest/UserGuide/rds-metrics.html); para analizar la carga de base de datos y filtrarla por esperas o sentencias SQL, consulta la [guía actual de CloudWatch Database Insights para RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_DatabaseInsights.html).

| Señal durante la carga | Qué puede indicar | Qué probar |
| --- | --- | --- |
| CPU alta durante períodos prolongados o muchas sesiones esperando CPU en Database Insights | Límite de cómputo o consultas que consumen demasiado. | Revisa consultas y esperas. Si la CPU sigue siendo el límite, compara un tamaño mayor o una clase optimizada para cómputo compatible. |
| Poca memoria disponible, especialmente junto con intercambio o lecturas frecuentes desde disco | El motor puede estar dedicando demasiado tiempo a traer a memoria los datos consultados. | Revisa el conjunto de trabajo y compara una clase optimizada para memoria. Valida el resultado con latencia y consultas. |
| Aumentan la latencia y la cola de disco mientras la CPU tiene margen | El volumen o los límites de E/S pueden ser el cuello de botella. | Comprueba IOPS y rendimiento configurados, tipo de almacenamiento y límite de EBS de la clase. Aumentar la clase por sí solo no siempre resuelve el límite del volumen. |
| Se agotan créditos de CPU o aparecen cargos por créditos excedentes en una clase <code>db.t*</code> | Los picos duran más que lo que permite su nivel de rendimiento de referencia. | Compara la carga y el costo con una clase no burstable. Revisa <code>CPUCreditBalance</code> y <code>CPUSurplusCreditsCharged</code>. |
| Muchas conexiones, pero sin saturación clara de CPU, memoria o E/S | El patrón de conexión de la aplicación puede ser el problema. | Revisa límites del motor, concurrencia y conexión agrupada antes de aumentar el tamaño. |

<code>DBLoad</code> representa sesiones activas, incluidas sesiones que esperan por recursos; por eso, no significa automáticamente que la CPU esté saturada. En Database Insights, desglosar la carga por CPU, espera y consulta ayuda a separar falta de capacidad de una consulta o un bloqueo. No cambies de clase a partir de un único promedio si la aplicación sufre en un pico breve.

## Las clases burstable no son siempre la opción más económica

Las clases <code>db.t3</code> y <code>db.t4g</code> ofrecen un nivel de rendimiento de referencia y pueden usar créditos para aumentarlo temporalmente. RDS configura ambas familias en modo Unlimited: si el uso sostenido supera los créditos que la instancia acumula, puede consumir créditos de CPU excedentes y generar cargos por esa capacidad adicional. AWS recomienda reservar las clases T para desarrollo, pruebas u otros servidores que no se usen en producción.

Antes de usar una clase burstable, mide si la base permanece con carga baja suficiente entre los picos. Revisa las métricas de créditos —se publican cada cinco minutos— y estima el costo si la carga deja de ser esporádica. Una clase T pequeña puede costar más de lo esperado si necesita sostener CPU alta. El sufijo <code>g</code> identifica una clase con procesador AWS Graviton; eso no cambia el modelo de créditos ni elimina la necesidad de revisar su compatibilidad.

## El almacenamiento tiene su propio perfil de rendimiento

El almacenamiento de RDS es otra parte del dimensionamiento. La capacidad en GB sirve para alojar datos; IOPS y rendimiento de lectura/escritura describen operaciones. Según el motor y el tamaño del volumen, puedes elegir entre SSD de uso general y SSD de IOPS aprovisionadas:

- **gp3** es la opción de uso general recomendada por AWS para muchos casos. Permite configurar capacidad y rendimiento por separado dentro de los límites compatibles con el motor y el volumen.
- **io2** y **io1** se orientan a cargas con necesidades sostenidas de I/O, baja latencia o IOPS aprovisionadas. Verifica si esa opción encaja con el patrón de E/S y si la clase puede aprovechar lo que configures.
- **gp2** es una generación anterior. El almacenamiento magnético está obsoleto para nuevas instancias; no lo uses como opción nueva.

AWS aclara que una clase puede impedir aprovechar todas las IOPS o todo el rendimiento provisionado del volumen si sus propios límites son menores. Revisa los límites de la clase y del motor junto con las métricas de lectura, escritura y cola; la [guía de almacenamiento de RDS](https://docs.aws.amazon.com/es_es/AmazonRDS/latest/UserGuide/CHAP_Storage.html) mantiene las opciones y restricciones actuales.

## Alta disponibilidad y lecturas no son lo mismo

Una implementación Multi-AZ tradicional de una instancia RDS mantiene una réplica en espera para alta disponibilidad y failover. Esa instancia en espera no atiende consultas de lectura. Si el objetivo es quitarle consultas a la instancia principal, evalúa réplicas de lectura o un clúster Multi-AZ compatible con el motor. Las réplicas de lectura pueden tener retraso y se facturan como instancias de base de datos; no son un reemplazo idéntico para el failover síncrono.

Comprueba qué despliegue tienes antes de tomar una decisión: la opción denominada Multi-AZ no identifica por sí sola una topología que escale lecturas. Revisa la guía de [despliegues Multi-AZ de instancia](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html), [clústeres Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts.html) y [réplicas de lectura](https://docs.aws.amazon.com/es_es/AmazonRDS/latest/UserGuide/USER_ReadRepl.html).

## Compara el costo de la configuración completa

El precio de una clase depende, entre otros factores, de la Región, el motor, su edición y la opción de licencia. A la tarifa de cómputo de cada instancia se suman los cargos aplicables por almacenamiento, IOPS o rendimiento aprovisionados, Multi-AZ, réplicas, copias de seguridad y transferencia de datos. No compares clases con precios de otra Región ni asumas que una clase con menos CPU siempre cuesta menos para completar la misma carga.

Usa los valores actuales de [precios de Amazon RDS](https://aws.amazon.com/rds/pricing/) y la [Calculadora de precios de AWS](https://calculator.aws/) para estimar tu configuración. Selecciona el motor y la Región, e incluye la clase, el almacenamiento y las opciones de disponibilidad que comparas. La estimación refleja los parámetros que ingreses; valida el resultado con el uso y la factura reales. Para investigar cambios de gasto, consulta la [guía de Cost Explorer](/blog/analisis-de-costos-de-aws-con-cost-explorer/). Si necesitas un panel propio con datos detallados de facturación, la [guía de CUR 2.0, Athena y QuickSight](/blog/visualiza-costos-con-aws-cost-and-usage-reports-y-quicksight/) muestra otro recorrido y sus requisitos.

## Amazon Aurora se dimensiona por separado

Aurora forma parte de Amazon RDS, pero usa una arquitectura de clúster. En Aurora **provisionado** eliges clases para las instancias de escritura y lectura del clúster. **Aurora Serverless v2** usa la clase <code>db.serverless</code> y un rango de capacidad en Aurora Capacity Units (ACU); no es una instancia <code>db.t*</code>, <code>db.m*</code> o <code>db.r*</code> con escalado automático.

La compatibilidad y los rangos de capacidad de Serverless v2 dependen de la versión del motor y de la Región. Compara el costo y el comportamiento de escalado con la carga que esperas: ni Aurora provisionado ni Serverless v2 son siempre más rápidos o más económicos que una instancia RDS. La guía de AWS detalla [Aurora Serverless](https://docs.aws.amazon.com/es_es/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html); para elegir entre los motores relacionales, sigue la comparación de [Amazon RDS y Aurora](/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/).

## Grupos, canales y encuentros

Puedes aprender con grabaciones prácticas y contrastar decisiones con grupos generales de AWS. No todos los grupos se especializan en bases de datos; revisa su agenda, modalidad y condiciones de inscripción antes de participar.

- El [grupo de Telegram de AWS User Group Caracas](https://t.me/awsCaracas) sirve para conversar sobre AWS con esa comunidad; es un canal comunitario general, no el soporte oficial de AWS.
- Si estás en México, la agenda de [AWS User Group Ciudad de México](https://awsugcdmx.com/) incluye encuentros generales sobre arquitectura, datos y otros temas. En Argentina, puedes ver las actividades del [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/). El portal de [AWS User Group Perú](https://awsugperu.cloud/) reúne grupos locales, talleres, grupos de estudio y recursos; [AWS Women Colombia](https://awswomencolombia.com/) publica encuentros y materiales en español de la comunidad.
- Si prefieres buscar un grupo de otro país, consulta el [directorio de AWS User Groups de AWS Builder Center](https://builder.aws.com/community/user-groups).
- Al momento de esta revisión, AWS Student Builder Group del Higher Technological Institute of Atlixco anunció el encuentro presencial [Amazon RDS: Bases de datos administradas](https://www.meetup.com/aws-sbg-at-higher-technological-institute-of-atilxco/events/316823085/), para el 29 de octubre de 2026, de 12:00 a 14:00 (hora de Atlixco). La ficha describe la creación y configuración de una base SQL. Consulta allí los requisitos, el costo, los cupos y la ubicación exacta, que pueden cambiar.

## Preguntas frecuentes

### ¿Cómo sé si me falta CPU, memoria o rendimiento de almacenamiento?

Correlaciona CloudWatch, Database Insights y la latencia que observa la aplicación. Una CPU alta sostenida, memoria baja o espera por disco orientan la prueba, pero también pueden señalar consultas, bloqueos o concurrencia que conviene corregir. Repite la comparación bajo una carga parecida antes de decidir.

### ¿Multi-AZ sirve para atender más lecturas?

No en el despliegue tradicional Multi-AZ de instancia: su standby sirve para failover, no para consultas. Para distribuir lecturas, comprueba compatibilidad de réplicas de lectura o del clúster Multi-AZ con tu motor y versión.

### ¿Puedo cambiar el tamaño después?

Sí. Puedes modificar la clase, pero el cambio puede causar una interrupción; define la ventana de aplicación, verifica la compatibilidad de la nueva clase y comprueba que la aplicación reconecte correctamente.
