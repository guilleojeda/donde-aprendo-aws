---
title: "Instancias RDS y Aurora: cómo elegir clase, familia y tamaño"
description: "Elige clases de instancia para RDS y Aurora: familias M, R, X y T, Graviton, Serverless v2, compatibilidad por región y métricas para ajustar costo y rendimiento."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T01:35:47.279Z"
modifiedTimestamp: "2026-10-07T09:41:54-03:00"
review:
  date: "2026-10-07"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Amazon RDS o Aurora: cómo elegir una base de datos relacional en AWS"
    url: "https://dondeaprendoaws.com/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/"
  - title: "Seguridad y control de costos en AWS: evita gastos inesperados"
    url: "https://dondeaprendoaws.com/blog/seguridad-y-control-de-costos-en-aws-guia-2024/"
  - title: "SLA de AWS: disponibilidad, créditos y cómo reclamarlos"
    url: "https://dondeaprendoaws.com/blog/slas-en-aws-conceptos-legales-clave/"

---

**Para elegir una instancia de RDS o Aurora, confirma primero el motor, la versión, la región y el despliegue; después compara CPU, memoria y límites de I/O de las clases compatibles.** Usa familias de capacidad fija para una carga sostenida, evalúa clases T para desarrollo y pruebas con picos breves, y considera Aurora Serverless v2 si necesitas que el cómputo cambie automáticamente dentro de un rango. La decisión final debe apoyarse en tus consultas, métricas y costo total.

Amazon Aurora forma parte de Amazon RDS. Si todavía estás decidiendo entre un motor estándar de RDS y Aurora compatible con MySQL o PostgreSQL, empieza con la [comparación de bases relacionales en AWS](/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/). Aquí nos concentraremos en la capacidad que ejecuta la base.

## Qué significa una clase como db.r7g.large

Una **clase de instancia DB** define recursos de cómputo y memoria, además de límites de red y acceso al almacenamiento. En `db.r7g.large`, `db` identifica una clase de base de datos, `r7g` es la familia y generación, y `large` es el tamaño. No deduzcas los vCPU o GiB solo del tamaño: consulta las [especificaciones de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Summary.html) o las [de Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.DBInstanceClass.Summary.html).

Estas decisiones son diferentes:

| Decisión | Qué cambia |
| --- | --- |
| Motor y versión | Compatibilidad SQL, funciones y extensiones disponibles |
| Clase y tamaño | CPU, memoria y límites de la instancia |
| Despliegue | Instancias escritoras, lectores y opciones de alta disponibilidad |
| Almacenamiento | Capacidad, IOPS, throughput y forma de facturación |

Cambiar a una clase con más memoria no convierte PostgreSQL en Aurora PostgreSQL. Tampoco habilita por sí mismo Multi-AZ ni aumenta automáticamente los IOPS provisionados del almacenamiento.

Para repasar el papel de cada servicio, puedes escuchar [Cómo elegir la base de datos correcta para tu aplicación](https://podcast.marcia.dev/932377/episodes/4850999-6-como-elegir-la-base-de-datos-correcta-para-tu-aplicacion), de Charlas Técnicas de AWS, o leer los [fundamentos de servicios de bases de datos de John Bulla](https://dev.to/aws-espanol/aws-database-services-fundamentos-5b2g). Son publicaciones históricas: el episodio es de 2020 y la guía de 2021, actualizada en 2023. Sirven como introducción, no como inventario actual de clases o precios.

## Familias de instancias: qué problema resuelve cada una

Esta tabla orienta la selección; los ejemplos **no garantizan disponibilidad** para todos los motores, versiones o regiones.

| Familia o categoría | Cuándo evaluarla | Qué comprobar |
| --- | --- | --- |
| M, uso general en RDS; por ejemplo `db.m7g` o `db.m7i` | Carga que necesita un equilibrio entre CPU, memoria y red | Compatibilidad del motor y capacidad sostenida del tamaño |
| R, optimizada para memoria; por ejemplo `db.r7g` o `db.r7i` | Caché de datos, consultas y concurrencia que requieren más memoria | Si la presión de memoria es real y qué consultas la generan |
| X, memoria elevada; por ejemplo `db.x2g` | Conjunto de trabajo que justifica mucha memoria por vCPU | Soporte concreto y costo de esa capacidad; X no significa una R más pequeña o barata |
| T, rendimiento ampliable; por ejemplo `db.t3` o `db.t4g` | Desarrollo y pruebas con períodos de baja CPU y picos breves | Créditos de CPU, cargos por excedentes y memoria suficiente |
| C, optimizada para cómputo en casos específicos de RDS | Carga intensiva en CPU | `db.c6gd` se limita a clústeres Multi-AZ de RDS; no es una alternativa universal |
| Clases con Optimized Reads | Consultas que usan temporales o cachés compatibles con almacenamiento NVMe local | Motor, versión, clase y funciones que usan ese almacenamiento |

AWS mantiene las listas de [tipos de clase para RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Types.html) y [tipos para Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.DBInstanceClass.Types.html). Aurora tiene su propia selección de clases: no copies la lista M de RDS suponiendo que existe en Aurora. `db.r5`, por ejemplo, pertenece a la categoría optimizada para memoria, no a uso general.

### Graviton o x86: verifica el motor, no solo el sufijo

Las clases `g` de los ejemplos usan procesadores AWS Graviton basados en Arm; las clases `i` citadas usan Intel x86. En RDS, familias Graviton como `db.m7g`, `db.r7g` o `db.t4g` tienen soporte para determinados motores y versiones de MySQL, MariaDB y PostgreSQL. **No supongas ese soporte para Oracle, SQL Server o Db2.** Aurora también ofrece familias Graviton, con una matriz propia para Aurora MySQL y Aurora PostgreSQL. Revisa las tablas de [motores compatibles en RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Support.html) y [en Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.DBInstanceClass.SupportAurora.html).

Como introducción en español, [Marcos Ortiz explica cómo empezar con Graviton](https://dev.to/aws-espanol/como-comenzar-a-trabajar-con-aws-graviton-la-pregunta-del-millon-1m6h). Su artículo es de 2023 e incluye ejemplos de EC2 y promociones de esa época: no traslades sus descuentos ni su oferta gratuita a una base RDS actual. Compara clases compatibles con la misma carga y precios vigentes.

### Clases T y créditos de CPU

Una clase T tiene un nivel base de CPU y utiliza créditos para superar ese nivel. En RDS, T3 y T4g funcionan en modo Unlimited: mantener uso por encima del nivel base puede generar cargos por créditos excedentes. Que la instancia pueda continuar trabajando no significa que ese cómputo esté incluido en su precio base. AWS recomienda las clases T para desarrollo, pruebas y otros entornos no productivos.

Observa `CPUCreditBalance` y `CPUSurplusCreditsCharged`, además de `CPUUtilization`. La [referencia de métricas de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-metrics.html) explica esas métricas. No confundas créditos de CPU con `BurstBalance`, que describe créditos de I/O de almacenamiento gp2.

### Optimized Reads e I/O-Optimized son cosas distintas

**Optimized Reads** aprovecha NVMe local en clases y motores compatibles. Por ejemplo, [RDS para PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PostgreSQL.optimizedreads.html) lo utiliza para objetos temporales. [Aurora PostgreSQL Optimized Reads](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.optimized.reads.html) permite temporales y, bajo ciertas configuraciones, una caché adicional. Tener NVMe no equivale a mover toda la base persistente a ese disco.

**Aurora I/O-Optimized** es una configuración de almacenamiento y facturación del clúster. No cobra por separado las operaciones de lectura y escritura de I/O, pero cambia los otros precios aplicables. Aurora Standard sí factura esas operaciones. Compara el total de ambas configuraciones usando tu volumen de I/O; no elijas I/O-Optimized solo porque una clase sea optimizada para memoria. La [guía de almacenamiento de Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.StorageReliability.html) describe las diferencias.

## Aurora provisionado o Serverless v2

En Aurora provisionado eliges una clase como `db.r7g.large`, con capacidad definida. El crecimiento automático del almacenamiento del clúster **no aumenta por sí solo la CPU ni la memoria de esa instancia**.

Aurora Serverless v2 usa la clase especial **`db.serverless`**. Configuras un mínimo y un máximo en **Aurora Capacity Units (ACU)** y Aurora ajusta el cómputo dentro de ese rango. Cada ACU representa aproximadamente 2 GiB de memoria y capacidad asociada de CPU y red; no es una equivalencia exacta con una clase provisionada. El rango admitido depende de la versión del motor y de la plataforma. Consulta [cómo funciona Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.how-it-works.html) y sus [requisitos](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.requirements.html).

Evalúa Serverless v2 para variaciones de demanda que dificultan elegir una capacidad fija. Compara una instancia provisionada para una carga estable. En ambos casos necesitas comprobar latencia, conexiones y costo de todas las instancias del clúster. Un máximo de ACU insuficiente puede limitar la carga; un mínimo elevado mantiene capacidad facturable aunque haya poca actividad.

La [pausa automática a cero ACU](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html) requiere versiones compatibles, mínimo en cero y condiciones que permitan pausar. Considera también el tiempo de reanudación y los cargos de almacenamiento. Serverless no significa costo cero en todo momento.

Para ver una aplicación concreta, Elizabeth Fuentes muestra un [motor de búsqueda multimodal con Titan, Aurora PostgreSQL y LangChain](https://dev.to/aws-espanol/desbloquea-el-poder-de-la-busqueda-multimodal-con-amazon-titan-embeddings-y-langchain-3j01) y su [despliegue con CDK y Lambda](https://dev.to/aws-espanol/desplegando-una-aplicacion-de-embeddings-serverless-con-aws-cdk-lambda-y-amazon-aurora-postgresql-k5f). Son ejemplos de 2024, no benchmarks entre clases; ejecutar sus despliegues puede crear recursos facturables.

## Cómo comprobar clases disponibles con AWS CLI

En la consola de RDS puedes revisar las clases ofrecidas para tu selección de motor, versión y región. Con AWS CLI puedes consultar lo mismo mediante operaciones de lectura, sin crear una base de datos.

Necesitas AWS CLI —preferentemente v2— configurado con credenciales de tu cuenta y permiso `rds:DescribeOrderableDBInstanceOptions`. Para listar versiones con el primer comando también necesitas `rds:DescribeDBEngineVersions`. El ejemplo usa sintaxis de Bash o Zsh y `us-east-1`; cambia la región si tu base está en otra.

Primero consulta las versiones disponibles del motor:

```bash
aws rds describe-db-engine-versions \
  --engine postgres \
  --region us-east-1 \
  --query 'DBEngineVersions[].EngineVersion' \
  --output json
```

Copia una versión de esa lista en `DB_VERSION` y consulta sus opciones:

```bash
DB_VERSION='PEGA_AQUI_UNA_VERSION_DE_LA_LISTA'

aws rds describe-orderable-db-instance-options \
  --engine postgres \
  --engine-version "$DB_VERSION" \
  --region us-east-1 \
  --query 'OrderableDBInstanceOptions[].{Clase:DBInstanceClass,Almacenamiento:StorageType,MultiAZ:MultiAZCapable}' \
  --output json
```

La salida contiene clase, tipo de almacenamiento y capacidad de Multi-AZ para cada opción. **Una misma clase puede aparecer varias veces** por sus distintas combinaciones de almacenamiento o licencia. `MultiAZCapable` no significa que tu base ya tenga Multi-AZ habilitado; esta consulta tampoco garantiza capacidad física disponible al crear o modificar una instancia.

Para Aurora usa `--engine aurora-mysql` o `--engine aurora-postgresql`, con una versión de ese motor. Para comprobar Serverless v2 añade `--db-instance-class db.serverless`. AWS publica este procedimiento en los [requisitos regionales de Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.requirements.html).

La CLI pagina automáticamente: evita `--no-paginate` si quieres consultar todas las opciones. Si usas `--max-items`, quita la proyección `--query` del ejemplo para conservar `NextToken` en la salida y continúa con `--starting-token`; así no tratarás una lista parcial como completa. `--page-size` modifica el tamaño de las llamadas, no el total de resultados. La [referencia del comando](https://docs.aws.amazon.com/cli/latest/reference/rds/describe-orderable-db-instance-options.html) documenta sus parámetros y campos; la [referencia de IAM para RDS](https://docs.aws.amazon.com/service-authorization/latest/reference/list_rds.html) detalla las acciones de lectura requeridas.

Si la respuesta es vacía, revisa motor, versión, región y filtros. Si obtienes `AccessDenied`, revisa los permisos de la identidad con la que ejecutas la CLI; no es evidencia de que la clase sea incompatible.

## Qué medir antes de aumentar el tamaño

Prueba consultas y concurrencia representativas, incluyendo el pico esperado. Mantén comparables los datos, índices, versión, despliegue y almacenamiento. Registra latencia de la aplicación —incluidos percentiles como p95—, transacciones por segundo, errores y costo durante el mismo intervalo.

| Señal observada | Qué investigar antes de decidir |
| --- | --- |
| CPU alta sostenida | Consultas costosas, planes e índices; luego compara más CPU o una generación compatible |
| Memoria disponible baja y degradación | Caché, concurrencia, conexiones y temporales; evalúa más memoria con las otras señales |
| Latencia de I/O o colas altas | IOPS, throughput y límites de instancia y almacenamiento; más RAM puede no resolver ese límite |
| Muchas conexiones o errores al abrirlas | Pool de conexiones, límites del motor y memoria por sesión |
| Créditos excedentes facturados en una T | Costo real de la carga sostenida frente a una clase de capacidad fija |
| Serverless cerca del máximo y latencia creciente | Límite de ACU, carga SQL y capacidad mínima que necesita la aplicación |

Usa las métricas aplicables de [RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-metrics.html) y [Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.AuroraMonitoring.Metrics.html). Para examinar carga de base y métricas juntas, la consola incorpora [CloudWatch Database Insights](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_Monitoring.html). Una métrica aislada no demuestra que necesites una familia más grande.

Para aprender a observar estas señales, tienes el [laboratorio de CloudWatch de AWS User Group Caracas](https://www.youtube.com/watch?v=ZdMM2W0vrvA), [CloudWatch explicado fácil](https://www.youtube.com/watch?v=48f2d-oM00Y) y una sesión de [alarmas de CloudWatch](https://www.youtube.com/watch?v=uS0QE0NeqpA) de Marcia Villalba. El artículo [Observabilidad en la nube de AWS](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m) amplía el contexto de métricas, logs y trazas.

Si el problema son conexiones desde Lambda, el tutorial de Camilo Cabrales sobre [RDS Proxy](https://dev.to/cecamilo/conectarse-a-rds-por-medio-de-un-proxy-desde-una-funcion-lambda-3cbg) muestra otro mecanismo que conviene entender antes de aumentar capacidad. Crear un proxy también tiene costo y requisitos de compatibilidad.

## Cambiar de clase: disponibilidad y costo del cambio

Aumentar o reducir la clase es **escalado vertical**. En una instancia RDS, [cambiar la clase provoca una interrupción](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ModifyInstance.Settings.html); puedes programar el cambio para la ventana de mantenimiento o aplicarlo de inmediato. La ventana decide cuándo sucede, no elimina la interrupción. Prueba la reconexión y los reintentos de la aplicación.

En Aurora provisionado, modificar directamente la clase también puede afectar el servicio. Para Aurora PostgreSQL, AWS describe una [alternativa con una réplica del tamaño deseado y failover](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.Managing.html) que reduce el tiempo de interrupción. Durante la transición pagas la capacidad adicional y debes comprobar sincronización, endpoints y comportamiento del cliente.

**Multi-AZ y réplicas de lectura no son equivalentes.** RDS Multi-AZ de instancia mantiene un standby y ofrece failover administrado; ese standby no atiende lecturas. Un clúster Multi-AZ de RDS sí tiene lectores. Consulta la [guía de Multi-AZ de instancia](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html) antes de contar ese standby como capacidad de lectura. Para separar alta disponibilidad de compromisos contractuales, lee la [guía de SLAs en AWS](/blog/slas-en-aws-conceptos-legales-clave/).

John Bulla explica [alta disponibilidad con RDS Multi-AZ](https://dev.to/aws-espanol/alta-disponibilidad-con-aws-rds-multi-az-750) y presenta una [práctica de implementación y failover](https://dev.to/aws-espanol/implementando-instancia-de-base-de-datos-aws-rds-multi-az-f30). Son materiales de 2023: revisa las opciones actuales de consola y limita las reglas de red al origen que necesita conectarse antes de repetirlos.

Para comparar costos, suma cómputo de escritor y lectores, almacenamiento, I/O o IOPS, backups, transferencia, licencias y soporte extendido cuando aplique. Usa los precios actuales de [RDS](https://aws.amazon.com/rds/pricing/), [Aurora](https://aws.amazon.com/rds/aurora/pricing/) y la [calculadora de AWS](https://calculator.aws/). Una clase menor puede bajar el precio por hora y aumentar la duración de las consultas; otra arquitectura puede cambiar el número de instancias y la factura de I/O. No hay un porcentaje universal de ahorro ni un multiplicador de rendimiento válido para toda aplicación.

## Recursos para practicar y continuar en comunidad

Puedes avanzar con estos materiales en español según lo que necesites comprobar. Son recursos de aprendizaje, no pruebas de que una clase concreta sea la mejor:

- **Introducción a RDS y Aurora:** [Introducción a Amazon RDS de CreaTicas](https://www.youtube.com/watch?v=2Ng-Ot0VH_k), [Amazon RDS de AWS Women Colombia](https://www.youtube.com/watch?v=1zDE9OhfQic) y su charla sobre [RDS, Aurora y ElastiCache](https://www.youtube.com/watch?v=5xlrzYNEFs0). Para lectura, consulta [RDS de John Bulla](https://dev.to/aws-espanol/aws-rds-servicio-de-base-de-datos-relacional-1450), [Explorando Aurora](https://dev.to/aws-espanol/explorando-amazon-aurora-la-base-de-datos-relacional-de-proxima-generacion-4ln1) y los artículos históricos de #100DíasdeAWS sobre [RDS](https://awswomencolombia.com/100diasdeaws-dia-9-amazon-rds) y [Aurora](https://awswomencolombia.com/100diasdeaws-dia-21-amazon-aurora).
- **Estudio de arquitectura y fundamentos:** el [grupo de estudio de bases relacionales de Guatemala](https://www.youtube.com/watch?v=GSU5GeVHEo4), su [sesión sobre servicios de bases de datos](https://www.youtube.com/watch?v=IQR8XbBNUy4), las sesiones de [Buenos Aires](https://www.youtube.com/watch?v=UqvVg1X4WIg) y [Medellín](https://www.youtube.com/watch?v=hIiPO70uWg4), y las clases de Axel Echevarría sobre [bases de datos en AWS](https://www.youtube.com/watch?v=PyLvAiJ3QNI) y [cómo agregar una capa de datos](https://www.youtube.com/watch?v=4SesiH1xqFk).
- **Práctica e integración:** el [laboratorio de RDS MySQL de Caracas](https://www.youtube.com/watch?v=nu9U0DA49w4), su encuentro sobre [AppSync y trabajo con RDS](https://www.youtube.com/watch?v=8PeYCGLQyvI), y el ejemplo de Alfredo Dominguez de un [backend con ECS Fargate y RDS](https://www.alfredo-dominguez.dev/arquitecturas/02-scalable-backend/). Si trabajas con recuperación, mira [Validando RDS Snapshots con AWS Backups](https://www.youtube.com/watch?v=MGxDa37qbPk), de AWS Girls Argentina; para migraciones, Roxs documenta [RDS PostgreSQL entre cuentas](https://blog.295devops.com/ruta-hacia-el-exito-migracion-de-amazon-rds-postgresql-entre-cuentas-en-aws-sin-contratiempos).
- **Contexto y novedades:** la charla de Marcia Villalba [Feliz 10 años Aurora](https://www.youtube.com/watch?v=kXH6MovNR8s) y el [reCap de bases de datos de re:Invent 2025](https://www.youtube.com/watch?v=hp-9y9c41dQ), de AWS Women Colombia, ayudan a entender su evolución. Sigue [Desplegando.cloud](https://desplegando.substack.com/) para noticias posteriores y [Wiki Cloud](https://wiki-cloud.co/es/category/aws/) para más artículos.

Puedes ver las grabaciones públicas sin desplegar sus ejemplos. Si repites laboratorios, revisa recursos que crearás, precios, credenciales, reglas de red y eliminación de recursos al finalizar. La [guía de seguridad y control de costos](/blog/seguridad-y-control-de-costos-en-aws-guia-2024/) ayuda a preparar la cuenta. No asumas que una práctica es gratuita por estar disponible en YouTube.

Las comunidades generales también sirven para conversar sobre mediciones, compartir dudas y encontrar compañeros de estudio:

- [AWS User Group Caracas](https://www.meetup.com/aws-user-group-caracas/) tiene [canal de grabaciones](https://www.youtube.com/channel/UCiHpr692pl33ehbaC3tExEw).
- [AWS Women Colombia](https://awswomencolombia.com/) publica charlas en su [canal](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw).
- [AWS Guatemala](https://www.meetup.com/aws-guatemala/) comparte grupos de estudio en su [canal de YouTube](https://www.youtube.com/@awsugguatemala).
- [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/), [AWS User Group Medellín](https://www.meetup.com/awsugmed/) y [AWS Girls Argentina](https://www.meetup.com/aws-girls-argentina/) publican sus actividades en Meetup.
- El [canal de AWS User Group CreaTicas](https://www.youtube.com/channel/UCLt3Cav92Ej0t_m3mliLGCQ) reúne sesiones técnicas de la comunidad costarricense.

Al **7 de octubre de 2026**, el AWS Student Builder Group del Instituto Tecnológico Superior de Atlixco anuncia [Amazon RDS: Bases de datos administradas](https://www.meetup.com/aws-sbg-at-higher-technological-institute-of-atilxco/events/316823085/) para el **29 de octubre, de 12:00 a 14:00, hora de Atlixco (UTC−6)**, presencial. La actividad propone crear una base SQL y conectarla con una aplicación; la ficha muestra Atlixco, pero no una dirección de calle. Confirma lugar, inscripción, costo y requisitos con el organizador antes de asistir. Para otras fechas o países, revisa la [agenda de eventos](/eventos/) y el [directorio de comunidades](/comunidades/).

## Preguntas frecuentes

### ¿Por qué no aparece la clase que busco en RDS o Aurora?

Puede no estar soportada para ese motor, edición, versión, región o tipo de despliegue. Comprueba las tablas oficiales y ejecuta `describe-orderable-db-instance-options` con los mismos parámetros. No uses una tabla de EC2 como prueba de soporte en RDS.

### ¿Una instancia T4g es siempre la más económica?

No. Considera sus créditos excedentes, memoria, duración del trabajo y compatibilidad. Para una carga sostenida, compara el costo medido contra una clase de capacidad fija. En Aurora, confirma además qué clases T admite tu motor y recuerda la recomendación de AWS de usarlas para entornos no productivos.

### ¿Aurora Serverless v2 usa un tamaño large o xlarge?

No: usa `db.serverless` y un rango de ACU. El servicio ajusta CPU y memoria dentro de ese rango; el almacenamiento se factura y gestiona por separado. La pausa a cero requiere soporte y configuración específicos.

### ¿Puedo cambiar de familia sin interrupciones?

No lo des por garantizado. El cambio de clase de una instancia provisionada puede interrumpir conexiones; una estrategia con réplicas y failover puede reducir ese impacto. Programa y prueba el procedimiento para tu despliegue, y compara métricas y factura después del cambio.
