---
title: "AWS Snowmobile: retiro del servicio y alternativas de migración"
description: "AWS Snowmobile fue retirado. Compara DataSync, Data Transfer Terminal y otras opciones para migrar datos a AWS, validar la copia y planificar el cambio."
author: "guille-ojeda"
publishedAt: "2024-05-16"
publishedTimestamp: "2024-05-16T15:02:01.266Z"
modifiedTimestamp: "2026-10-06T23:48:20-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Amazon S3: buenas prácticas de seguridad, versiones y costos"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-s3/"
  - title: "Clases de almacenamiento de Amazon S3: diferencias y cómo elegir"
    url: "https://dondeaprendoaws.com/blog/clases-de-almacenamiento-de-amazon-s3/"
  - title: "Amazon EFS vs FSx: cómo elegir almacenamiento de archivos en AWS"
    url: "https://dondeaprendoaws.com/blog/guia-completa-sobre-amazon-efs-y-fsx/"
---

**AWS Snowmobile ya no está disponible: AWS registra el fin de soporte el 14 de marzo de 2024.** Si buscas cómo solicitar un Snowmobile o migrar datos con ese servicio, necesitas evaluar una alternativa. La [lista oficial de servicios retirados](https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html) confirma su estado; los anuncios históricos no son instrucciones para contratarlo hoy.

Para una migración nueva, compara **AWS DataSync** si puedes transferir por red, **AWS Data Transfer Terminal** si puedes transportar tus propios equipos a una instalación habilitada y las soluciones de partners cuando la conectividad o la logística requieren otra opción. La decisión depende del origen, el destino, el volumen, el ancho de banda efectivo y la fecha en que debes dejar de escribir en el sistema anterior.

## Qué era AWS Snowmobile y por qué cambió esta guía

Snowmobile era una solución de transporte físico para migraciones de gran escala. El [anuncio de lanzamiento de 2016](https://aws.amazon.com/blogs/aws/aws-snowmobile-move-exabytes-of-data-to-the-cloud-in-weeks/) describía un contenedor transportado en un camión con hasta 100 PB de capacidad. AWS llevaba el equipo al centro de datos, se copiaban los datos y después se transportaba para incorporarlos a Amazon S3.

Esa capacidad histórica no era una promesa de que cualquier conjunto de 100 PB pudiera migrarse en pocas semanas. También importaban la velocidad de lectura, la red local, la preparación del sitio, el transporte y la verificación. Hoy no corresponde preparar estacionamiento, suministro eléctrico ni una solicitud de Snowmobile: el servicio está retirado.

**Snowball Edge tampoco es una alternativa disponible para cualquier cliente nuevo.** Su [aviso específico de disponibilidad](https://docs.aws.amazon.com/snowball/latest/developer-guide/snowball-edge-availability-change.html) indica que ya no acepta nuevos clientes y propone DataSync, Data Transfer Terminal y partners. Si ya usas Snowball, confirma con AWS qué dispositivos y condiciones se aplican a tu cuenta; no extrapoles instrucciones antiguas de un modelo a otro.

Para situar estos cambios entre las opciones de almacenamiento y transferencia, AWS Women Colombia comparte el [reCap de re:Invent 2025 sobre almacenamiento, migración y transferencia](https://www.youtube.com/watch?v=Ohvf0ZhyIzo). Es una grabación de novedades de aquella edición: contrasta la disponibilidad que mencione con la documentación actual.

## Alternativas a Snowmobile: elige por el problema que debes resolver

En móvil, desplaza las tablas hacia los lados para ver todas las columnas.

| Necesidad | Opción para evaluar | Qué debes comprobar |
| --- | --- | --- |
| Copiar archivos u objetos por una conexión disponible | AWS DataSync | Compatibilidad de origen y destino, agente, permisos, modo de tarea y rendimiento real. |
| Llevar datos en equipos propios a un punto de carga | AWS Data Transfer Terminal | Ubicación, reserva, acceso físico, equipo y conectividad compatibles; costo del traslado y de la sesión. |
| Mantener conectividad dedicada con AWS | AWS Direct Connect, junto con una herramienta de transferencia | Plazo de instalación, capacidad, redundancia y cifrado. Direct Connect proporciona conectividad; no ejecuta la migración. |
| Mantener acceso a archivos desde un entorno híbrido | [Amazon S3 File Gateway](https://docs.aws.amazon.com/filegateway/latest/files3/what-is-file-s3.html), de AWS Storage Gateway | Protocolo, caché local, semántica de archivos y operación continua. No equivale automáticamente a una migración completa. |
| Recibir archivos mediante SFTP u otros protocolos admitidos | AWS Transfer Family | Protocolos, identidad, endpoint y almacenamiento de destino; no confundir intercambio de archivos con sincronización masiva. |

### DataSync: copiar por red con control de la transferencia

[AWS DataSync](https://docs.aws.amazon.com/datasync/latest/userguide/what-is-datasync.html) automatiza transferencias entre ubicaciones compatibles, con opciones de selección, metadatos y verificación. Para un servidor NFS o SMB local necesitas un agente que acceda al origen. Algunas transferencias entre servicios de AWS no requieren agente. Consulta la [matriz de combinaciones admitidas](https://docs.aws.amazon.com/datasync/latest/userguide/working-with-locations.html), incluida la compatibilidad entre cuentas y regiones. En una transferencia local hacia AWS, DataSync cifra el recorrido del agente al servicio mediante TLS, como explica su [arquitectura de transferencia](https://docs.aws.amazon.com/datasync/latest/userguide/how-datasync-transfer-works.html); revisa por separado el acceso al servidor de origen y el cifrado del almacenamiento de destino.

DataSync no convierte una conexión lenta en una rápida ni migra por sí solo una aplicación o una base de datos en ejecución. Si el destino es S3, asegúrate de que la aplicación pueda trabajar con objetos; copiar un árbol de archivos a un bucket no lo transforma en un sistema de archivos POSIX. Para decidir entre objetos y archivos, compara [Amazon EFS y los productos FSx](/blog/guia-completa-sobre-amazon-efs-y-fsx/).

### Data Transfer Terminal: tú llevas el equipo a AWS

En [AWS Data Transfer Terminal](https://aws.amazon.com/data-transfer-terminal/faqs/) reservas una instalación, llevas tus dispositivos y realizas la carga usando la conectividad disponible allí. No es un camión que AWS envía a tu centro de datos. Debes confirmar la reserva, los documentos de acceso y las condiciones técnicas, incluido el transceptor compatible indicado por AWS.

Antes de elegirlo, revisa las [ubicaciones publicadas](https://aws.amazon.com/data-transfer-terminal/faqs/) y la [tarifa de la sesión](https://aws.amazon.com/data-transfer-terminal/pricing/). No presupongas que hay una instalación en tu país ni que el costo de transportar equipos está incluido. Evalúa también la custodia y el cifrado de los datos durante el traslado.

### Conectividad y acceso híbrido: funciones diferentes

Direct Connect puede formar parte de una transferencia sostenida, pero **no cifra el tráfico en tránsito de manera predeterminada**. Revisa las [opciones de cifrado de Direct Connect](https://docs.aws.amazon.com/directconnect/latest/UserGuide/encryption-in-transit.html) y el cifrado de la herramienta que copie los datos.

Si necesitas mantener una aplicación local con almacenamiento conectado a la nube, la sesión del AWS User Group Chile [Storage Gateway en entornos on-premises](https://www.youtube.com/watch?v=DUz3hP4pO4Y) ayuda a entender ese modelo. La explicación histórica de [Storage Gateway en #100DíasdeAWS](https://awswomencolombia.com/100diasdeaws-dia-34-aws-storage-gateway) sirve como introducción, con la documentación vigente como referencia de implementación.

Para intercambio por SFTP, la [guía de Transfer Family con Amazon EFS](/blog/como-usar-aws-transfer-family-con-amazon-efs/) desarrolla identidad, permisos y pruebas de acceso. Esa necesidad es distinta de copiar un repositorio completo por lotes.

## Calcula el tiempo de transferencia con unidades claras

El tamaño total ayuda, pero no basta. Anota también cantidad y tamaño de archivos, velocidad de lectura del origen, permisos, datos comprimidos, crecimiento diario y ventanas de mantenimiento. Millones de archivos pequeños pueden exigir mucho trabajo de listado y metadatos aunque sumen menos bytes que unos pocos archivos grandes.

Una estimación inicial para unidades decimales es:

```text
segundos = volumen_en_bytes × 8 / velocidad_efectiva_en_bits_por_segundo

100 TB a 1 Gbit/s efectivo:
100 × 10^12 × 8 / 10^9 = 800.000 segundos ≈ 9,26 días

1 PB a 1 Gbit/s efectivo ≈ 92,59 días
```

Es un límite aritmético para la fase de transferencia a velocidad constante. No incluye preparación, verificación, interrupciones ni nuevas escrituras. Si tu piloto mide 500 Mbit/s efectivos, esos tiempos se duplican. No mezcles TB decimales con TiB ni la capacidad nominal del enlace con el rendimiento observado.

La charla de AWS Girls Argentina [El enemigo silencioso: la latencia en migraciones y ambientes híbridos](https://www.youtube.com/watch?v=dGcgOhQSrws) aporta contexto para investigar el recorrido y los cuellos de botella. Usa una muestra representativa del origen para medir antes de comprometer una fecha de corte.

## Cómo preparar una migración de NFS a S3 con DataSync

Este recorrido supone un servidor NFS local, un bucket S3 de propósito general y una cuenta con acceso a DataSync. **Crear y ejecutar recursos puede generar cargos.** El piloto debe tener un alcance limitado y una retención acordada; no utilices datos sensibles para aprender.

### 1. Define el destino y las condiciones de aceptación

Elige cuenta, región, bucket y prefijo. Acuerda quién podrá leer la copia, qué metadatos deben conservarse y cómo comprobarás que la aplicación puede usarla. Revisa las [buenas prácticas de S3](/blog/mejores-practicas-para-amazon-s3/) para acceso privado, cifrado y recuperación.

Si todavía estás comparando tipos de almacenamiento, la [sesión de EBS, EFS y S3 del AWS User Group Buenos Aires](https://www.youtube.com/watch?v=GqYKhnqDDeI) y la [introducción al almacenamiento de Marcia Villalba](https://www.youtube.com/watch?v=urfLdkPLuPc) explican sus diferencias. Son materiales para entender conceptos; no sustituyen una comprobación actual de compatibilidad.

### 2. Despliega el agente y configura las ubicaciones

Sigue la [guía oficial de despliegue del agente](https://docs.aws.amazon.com/datasync/latest/userguide/deploy-agents.html) para el entorno y modo de tarea elegidos. El agente debe acceder a la exportación NFS y a los endpoints necesarios de DataSync. Confirma DNS, rutas, puertos y permisos; activar el agente no demuestra que pueda leer todos los archivos.

Crea la [ubicación NFS](https://docs.aws.amazon.com/datasync/latest/userguide/create-nfs-location.html) con el servidor, la exportación y el agente adecuados. Después crea la [ubicación S3](https://docs.aws.amazon.com/datasync/latest/userguide/create-s3-location.html) con el bucket, prefijo y rol que usará DataSync. Para SSE-KMS, revisa además el acceso a la clave: un permiso de S3 no concede automáticamente permisos de KMS.

### 3. Crea una tarea que no borre datos por accidente

Conecta las ubicaciones de origen y destino y elige un [modo de tarea compatible](https://docs.aws.amazon.com/datasync/latest/userguide/choosing-task-mode.html). Basic y Enhanced tienen capacidades diferentes; no copies una configuración entre ambos sin comprobarla.

Para el piloto, define explícitamente:

- **Selección:** un directorio o prefijo de prueba representativo, no toda la fuente.
- **Transferencia:** `CHANGED` si quieres copiar inicialmente y luego detectar diferencias en ejecuciones siguientes.
- **Borrados:** conservar en destino los archivos ausentes del origen, salvo que tengas un requisito explícito de replicar eliminaciones.
- **Sobrescrituras:** decidir si los cambios del origen deben reemplazar lo que ya existe en destino.
- **Metadatos:** preservar los compatibles con ambos sistemas; no asumir que S3 aplicará permisos POSIX como un servidor NFS.
- **Verificación:** `ONLY_FILES_TRANSFERRED` para comparar al final las sumas de comprobación de los datos transferidos. `POINT_IN_TIME_CONSISTENT` verifica el conjunto de origen y destino, pero no está admitido en Enhanced ni al transferir a S3 Glacier Flexible Retrieval o S3 Glacier Deep Archive.

AWS detalla las [opciones de archivos y metadatos](https://docs.aws.amazon.com/datasync/latest/userguide/configure-metadata.html) y las [opciones de verificación](https://docs.aws.amazon.com/datasync/latest/userguide/configure-data-verification-options.html). Configura logs o informes que permitan identificar errores y elementos omitidos.

Si usas AWS CLI v2, este comando **solo consulta** una tarea existente; sustituye el ARN y la región por los de tu cuenta:

```bash
MIGRATION_TASK_ARN="arn:aws:datasync:us-east-1:111122223333:task/task-0123456789abcdef0"

aws datasync describe-task \
  --task-arn "$MIGRATION_TASK_ARN" \
  --region us-east-1 \
  --query '{Estado:Status,Modo:TaskMode,Opciones:Options}'
```

La [referencia de `describe-task`](https://docs.aws.amazon.com/cli/latest/reference/datasync/describe-task.html) explica sus campos. Consultar las opciones no valida permisos sobre todos los archivos ni inicia una transferencia.

### 4. Ejecuta el piloto y revisa datos y costos

Sigue las instrucciones para [iniciar una ejecución de DataSync](https://docs.aws.amazon.com/datasync/latest/userguide/run-task.html). Mide duración, bytes transferidos, archivos procesados y errores. Abre una muestra de los datos desde la aplicación de destino; una verificación de integridad no prueba por sí sola que la aplicación los interprete correctamente.

Calcula el costo total con los [precios de DataSync](https://aws.amazon.com/datasync/pricing/) y los del almacenamiento: también pueden intervenir solicitudes S3, recuperaciones, transferencias entre regiones, infraestructura del agente y logs. Una migración no es más económica solo porque tenga menos días de duración.

### 5. Planifica los cambios finales y el corte

DataSync ejecuta tareas; no es una captura continua y transaccional de todas las escrituras. Después de la carga inicial, puedes repetir la tarea para copiar diferencias. Para el corte, coordina una ventana sin escrituras o utiliza una copia consistente del origen, ejecuta la pasada final y verifica los datos antes de redirigir la aplicación.

Conserva la fuente durante el plazo de recuperación acordado. No borres copias locales inmediatamente después de una transferencia exitosa. Documenta quién autoriza la retirada y prueba que puedes recuperar los datos necesarios.

## Problemas frecuentes durante una migración

| Síntoma | Qué revisar primero |
| --- | --- |
| `AccessDenied` en S3 | Rol de DataSync, política del bucket y permisos de KMS cuando corresponda. No hagas público el bucket para resolverlo. |
| Archivos omitidos o permisos NFS denegados | Exportación, lectura de archivos y acceso a directorios; compara los logs con lo esperado en la muestra. |
| Diferencias durante la verificación | Escrituras o eliminaciones simultáneas en origen o destino, metadatos y resultados por archivo. |
| Transferencia más lenta que el cálculo | Lectura del origen, archivos pequeños, red, recursos del agente y tiempo de preparación/verificación. |
| Cambios que no llegan al destino | Última ejecución, filtros y opción de sobrescritura; una tarea pasada no mantiene ambos lados sincronizados continuamente. |

Consulta la [resolución de problemas de ubicaciones](https://docs.aws.amazon.com/datasync/latest/userguide/troubleshooting-storage-issues.html) y los [errores de verificación](https://docs.aws.amazon.com/datasync/latest/userguide/troubleshooting-task-verification.html). Corrige la causa con una prueba acotada antes de repetir una carga completa.

## Sigue aprendiendo sobre migraciones en comunidad

Para presentar un caso real, prepara un resumen sin datos privados: origen y destino, volumen, cantidad de archivos, rendimiento medido, tasa de cambios y error observado. Así una comunidad puede ayudarte a discutir alternativas sin necesitar acceso a tu cuenta.

- El **AWS User Group Chile** comparte [las siete rutas de migración](https://www.youtube.com/watch?v=GynN8Zk3eFQ), útiles para distinguir mover datos de modernizar una aplicación. Puedes seguir su [canal de YouTube](https://www.youtube.com/channel/UCYUBBIe0XzNsxcq9Tu_Wqsw), consultar las [presentaciones publicadas en GitHub](https://github.com/awsusergroupsantiago/presentations) o revisar los encuentros en su [comunidad de Meetup](https://www.meetup.com/aws-user-group-chile/).
- **AWS Women Colombia** reúne una [sesión de servicios de migración](https://www.youtube.com/watch?v=0k7dJq-eBT8), el [archivo de grabaciones](https://awswomencolombia.com/page/eventos) y su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw). La [comunidad en Meetup](https://www.meetup.com/aws-women-colombia-user-group/) permite revisar próximos encuentros y sus condiciones. Usa las sesiones antiguas para entender decisiones; confirma los servicios que sigan disponibles.
- **AWS Girls Argentina** ofrece la charla de latencia enlazada arriba. En su [grupo de Meetup](https://www.meetup.com/aws-girls-argentina/) puedes buscar encuentros para continuar aprendiendo y compartir preguntas de operación. No necesitas encontrar una comunidad dedicada únicamente a Snowmobile.
- La [sesión de migraciones del AWS User Group Guatemala](https://www.youtube.com/watch?v=2CkH5li3Tis) aporta otra explicación para relacionar servicios y casos de uso; revisa el contexto de la grabación antes de reproducir procedimientos.
- Marcia Villalba propone [aprender AWS haciendo una migración](https://www.youtube.com/watch?v=jz461uBIslM). Utilízalo como ejemplo de aprendizaje práctico y compara herramientas, permisos y costos con las guías actuales.

Como siguiente práctica con datos sintéticos, el [workshop de data lake con S3, Glue y Athena](https://github.com/tuni56/aws-data-lake-workshop) muestra cómo usar los datos después de cargarlos. Es un paso de análisis posterior, no un sustituto de DataSync; requiere cuenta AWS, permisos sobre esos servicios y conocimientos básicos de SQL. Revisa sus módulos de configuración y limpieza, y calcula el costo de tu propia ejecución antes de desplegarlo.

El catálogo también incluye el [AWS Community Day Panamá — Security & Data Edition 2026](https://www.meetup.com/aws-user-group-panama/events/316732293/), anunciado para el **14 de noviembre de 2026**, presencial, con sede y programa detallado todavía por confirmar al revisar esta guía. Es una oportunidad para conocer a otras personas interesadas en seguridad y datos; consulta el registro y las condiciones en la página del organizador, sin asumir que habrá un taller específico de migración. Sigue al [AWS User Group Panamá](https://www.meetup.com/AWS-User-Group-Panama/) para revisar otros encuentros. Puedes buscar más opciones en [las comunidades AWS](/comunidades/) y la [agenda de eventos](/eventos/).

## Preguntas frecuentes

### ¿Puedo solicitar AWS Snowmobile desde la consola?

No. El servicio está retirado. Una página antigua o un video de lanzamiento no demuestra disponibilidad actual. Evalúa una alternativa según conectividad, destino y logística.

### ¿DataSync reemplaza a Snowmobile en todos los casos?

No. DataSync necesita una ruta de red para copiar los datos. Si no puedes cumplir el plazo con tu conectividad, evalúa Data Transfer Terminal o una solución de partner, incluyendo el transporte, la custodia y el proceso de incorporación a AWS.

### ¿Mover archivos a S3 conserva una aplicación sin cambios?

No necesariamente. S3 almacena objetos y no reproduce toda la semántica de un sistema de archivos. Comprueba accesos, metadatos y compatibilidad de la aplicación antes de elegir el destino.

### ¿Qué clase de S3 conviene después de migrar?

Depende de la frecuencia de lectura, la latencia de recuperación y la retención. Revisa la [comparación de clases de almacenamiento S3](/blog/clases-de-almacenamiento-de-amazon-s3/) antes de archivar la copia. AWS Women Colombia ofrece también una [introducción histórica a las clases de S3](https://awswomencolombia.com/100diasdeaws-dia-2-clases-de-almacenamiento-s3); usa las condiciones actuales para calcular el costo.
