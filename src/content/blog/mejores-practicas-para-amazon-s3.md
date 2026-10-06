---
title: "Amazon S3: buenas prácticas de seguridad, versiones y costos"
description: "Protege buckets de Amazon S3, recupera versiones y controla costos con una guía práctica sobre permisos, cifrado, Lifecycle, replicación y AWS CLI."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T04:13:21.58Z"
modifiedTimestamp: "2026-10-06T17:37:38-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Clases de almacenamiento de Amazon S3: diferencias y cómo elegir"
    url: "https://dondeaprendoaws.com/blog/clases-de-almacenamiento-de-amazon-s3/"
  - title: "Cómo cifrar datos con AWS KMS: claves de datos y S3"
    url: "https://dondeaprendoaws.com/blog/cifrado-de-datos-con-aws-kms-guia-practica/"
  - title: "AWS Backup: cómo crear planes y probar restauraciones"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-aws-backup/"

---

Para operar Amazon S3 con seguridad, conserva los buckets privados, limita cada identidad a las acciones y objetos que necesita y decide cómo recuperar datos antes de automatizar su borrado. S3 cifra por defecto las cargas nuevas con SSE-S3, pero ese cifrado no reemplaza los permisos, el versionado ni un respaldo comprobado.

Esta guía se centra en **buckets de propósito general**. Los buckets de directorio, tabla y vectores tienen funciones y controles diferentes; confirma que cada práctica aplique al tipo de bucket que utilizas en la [documentación de tipos de bucket de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html).

Si estás revisando un bucket, empieza por esta lista:

- Mantén activado **S3 Block Public Access** en la cuenta y en los buckets privados. Confirma que las aplicaciones no dependan de acceso público antes de cambiar la configuración.
- Concede permisos mínimos mediante políticas de IAM y de bucket. En la mayoría de los casos, desactiva las ACL con **Bucket owner enforced**.
- Usa el cifrado predeterminado SSE-S3. Elige SSE-KMS cuando necesites administrar permisos, auditar el uso o controlar el ciclo de vida de una clave KMS.
- Activa **S3 Versioning** para datos que debas recuperar de sobrescrituras o borrados; combina el versionado con reglas de ciclo de vida que también administren las versiones anteriores.
- Usa replicación para distribuir objetos entre buckets o regiones. Es asíncrona y no constituye por sí sola un respaldo ni una conmutación de la aplicación.
- Mide el almacenamiento, las versiones, las solicitudes, las recuperaciones y las transferencias antes de elegir una clase o una regla de expiración.

## Protege el acceso al bucket

Un bucket nuevo suele crearse con Block Public Access activado, pero una política o una configuración posterior puede cambiarlo. Para buckets que no deban ser públicos, revisa los cuatro controles de bloqueo en la cuenta y el bucket; si usas puntos de acceso, revisa también su configuración. S3 aplica la combinación más restrictiva entre los controles de la organización, la cuenta, el bucket y los puntos de acceso aplicables. Si necesitas publicar archivos, documenta el motivo y limita el acceso al contenido previsto; no desactives los controles de manera general para resolver un permiso puntual. La [guía de seguridad de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html) y la [referencia de Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html) explican estos ajustes.

En los buckets de propósito general, **Bucket owner enforced** desactiva las ACL y deja la administración del acceso en las políticas. Conserva ACL solo si una integración necesita expresamente ese modelo; consulta la documentación de [S3 Object Ownership](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html). Para cada aplicación o rol, limita `s3:ListBucket` al bucket y `s3:GetObject`, `s3:PutObject` o `s3:DeleteObject` a las claves que necesita. Comprueba las políticas de identidad, bucket, punto de acceso y endpoint de VPC; una política de KMS también puede impedir la lectura de un objeto cifrado con esa clave.

Si sirves archivos con una aplicación web, puedes mantener el bucket privado y distribuir el contenido mediante Amazon CloudFront con Origin Access Control (OAC). Configura como origen el endpoint REST del bucket de S3; OAC no funciona con el endpoint de sitio web de S3, que CloudFront trata como un origen personalizado. Autoriza a la distribución en la política del bucket para que los clientes reciban acceso desde CloudFront y no directamente desde un bucket abierto. Revisa la guía de AWS para [restringir el acceso de CloudFront a un origen S3](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) y el ejemplo de terceros de [CDN privada con CloudFront y S3](https://www.alfredo-dominguez.dev/arquitecturas/01-private-cdn/); inspecciona su código, permisos y costos antes de desplegarlo.

## Cifrado: qué configura S3 y cuándo elegir KMS

S3 cifra automáticamente en reposo las cargas nuevas. Si no se configuró otra opción de cifrado, utiliza claves administradas por S3 (SSE-S3). No hace falta activar un interruptor para obtener ese nivel de cifrado en una carga nueva. El cifrado en reposo no autoriza a una identidad a leer el objeto ni obliga a una aplicación a usar HTTPS; AWS documenta por separado el [cifrado de los datos en tránsito](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryptionInTransit.html). La [documentación de cifrado de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html) describe las opciones de cifrado en reposo.

SSE-KMS sirve cuando necesitas administrar quién puede usar una clave, auditar su uso o establecer requisitos de cifrado propios. La identidad necesita permisos de S3 y de KMS; por ejemplo, una carga SSE-KMS usa `kms:GenerateDataKey` y una lectura usa `kms:Decrypt`; las cargas multipart requieren ambos permisos. KMS añade cargos por solicitudes y requiere que la clave esté en la misma región que el bucket. Cambiar el cifrado predeterminado no vuelve a cifrar los objetos existentes: para eso hace falta una operación de copia o procesamiento masivo. La [guía de SSE-KMS para S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html) detalla permisos y límites. Para claves de datos y políticas, continúa con la [guía práctica de AWS KMS](/blog/cifrado-de-datos-con-aws-kms-guia-practica/).

## Versionado, ciclo de vida y recuperación

El versionado conserva varias versiones de una clave de objeto, pero solo protege los cambios y borrados que ocurren después de habilitarlo. Al sobrescribir un objeto, S3 guarda otra versión; al enviar un `DELETE` sin indicar un identificador de versión, agrega un marcador de eliminación en lugar de borrar de forma permanente la versión actual. Puedes retirar ese marcador o copiar una versión anterior para recuperarla. Sin embargo, cada versión cuenta como un objeto completo para el almacenamiento: S3 no cobra solo la diferencia entre ellas. Consulta [cómo funciona S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html) y [cómo eliminar versiones](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html).

El versionado ayuda a recuperarse de errores, pero guarda las versiones en el mismo bucket y no equivale a una copia independiente. Un rol con permisos para borrar versiones o cambiar la configuración puede afectar esa protección. Para datos críticos, define otra copia con permisos y retención separados, comprueba la compatibilidad por región y prueba restauraciones. [AWS Backup admite Amazon S3 en los casos indicados en su matriz de disponibilidad](https://docs.aws.amazon.com/aws-backup/latest/devguide/backup-feature-availability.html); la [guía para crear planes y probar restauraciones](/blog/comprendiendo-aws-backup/) muestra cómo verificar el proceso.

Configura S3 Lifecycle según una retención aprobada, no como una limpieza genérica. En un bucket con versionado, una regla que expira la versión actual puede crear un marcador de eliminación; para borrar permanentemente los datos antiguos hay que configurar la expiración de versiones no actuales. Esa acción es irreversible una vez que S3 elimina la versión. Revisa el filtro de claves, etiquetas y tamaños, porque las reglas pueden afectar objetos que ya existen cuando las agregas. Las reglas también pueden eliminar cargas multipart incompletas. La guía de [Lifecycle y sus acciones](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html) describe el comportamiento.

Si prefieres practicar la administración con una grabación, AWS Women Colombia publicó [fundamentos y administración de Amazon S3](https://www.youtube.com/watch?v=MjV3zGLBsrU) el 21 de abril de 2023 y un [laboratorio L-200](https://www.youtube.com/watch?v=K9M445_SerA) el 28 de abril de 2023. Son materiales de esa fecha: contrasta los pasos y opciones con la documentación vigente antes de aplicarlos.

> **S3 Object Lock** es una opción para retener versiones con un modelo WORM cuando existe un requisito de conservación o necesitas impedir su eliminación durante un plazo. Requiere versionado y no evita que se creen marcadores de eliminación. Revisa modos, plazos y efectos en el costo antes de activarlo en un bucket operativo; consulta [la guía de Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html).

La replicación entre regiones (CRR) o dentro de una región (SRR) copia objetos de forma asíncrona a otro bucket. Tanto el origen como el destino necesitan el versionado activado. La replicación en vivo cubre objetos nuevos o actualizados después de configurar la regla; para objetos anteriores se requiere S3 Batch Replication. No configura por sí sola el enrutamiento de la aplicación ni una conmutación automática: el plan de recuperación también debe definir quién cambia el tráfico, cómo se validan los datos y cómo se vuelve al origen. Revisa [los requisitos y límites de replicación](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html) y el manejo de [objetos existentes con Batch Replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-batch-replication-batch.html).

Elegir entre estos mecanismos depende de lo que quieras recuperar:

- **Una sobrescritura o un borrado accidental:** versionado y un procedimiento que restaure la versión correcta.
- **Una copia retenida con permisos separados:** un plan de respaldo compatible, una cuenta o bóveda de destino adecuada y una prueba de restauración.
- **Una copia geográfica para requisitos de residencia o distribución:** replicación, más el procedimiento de conmutación que requiera la aplicación.

## Prefijos y rendimiento: optimiza ante una señal concreta

Los prefijos, como `logs/2026/` o `clientes/42/`, ayudan a organizar y filtrar claves. No necesitas añadir caracteres aleatorios a cada nombre para “acelerar” un bucket por defecto. S3 escala automáticamente a tasas altas de solicitudes; al cambiar bruscamente el patrón de tráfico pueden aparecer respuestas `503 Slow Down` mientras el servicio se adapta. Usa un AWS SDK actualizado, que ofrece reintentos con backoff, y mide el comportamiento. Si una carga sostenida lo requiere, evalúa la distribución de solicitudes entre prefijos según los [patrones de rendimiento de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html).

La replicación tampoco reduce automáticamente la latencia: la aplicación debe leer del bucket regional adecuado o usar una distribución como CloudFront. Evalúa la copia adicional, el retraso de replicación y el costo de transferencia junto con el beneficio para los usuarios.

## Costos que conviene revisar

El costo de S3 depende del almacenamiento y de cómo opera la aplicación. Según la clase y el patrón de uso, puede incluir:

- Datos de la versión actual y de las versiones no actuales.
- Solicitudes de lectura, escritura, listado y transición de objetos.
- Recuperaciones desde clases de archivo y plazos mínimos de almacenamiento.
- Transferencias de datos a Internet, entre regiones o hacia otros servicios, según el trayecto.
- Solicitudes de KMS, eventos de datos de CloudTrail, análisis de GuardDuty o Macie y niveles avanzados de métricas.
- Almacenamiento y solicitudes de las réplicas en el bucket de destino.

Antes de activar una regla, estima cuántos objetos alcanzará, su tamaño, la retención y la frecuencia de lectura o restauración. Una clase con almacenamiento más barato puede elevar el total si muchos objetos son pequeños o se recuperan con frecuencia. Consulta los [precios actuales de Amazon S3](https://aws.amazon.com/s3/pricing/) para la región y las operaciones que uses; evita reutilizar una cifra fija de transferencia gratuita de una guía antigua. Para comparar los cargos y las condiciones de cada clase, consulta la [guía de clases de almacenamiento de S3](/blog/clases-de-almacenamiento-de-amazon-s3/).

S3 Storage Lens permite seguir tendencias de almacenamiento y actividad. Ofrece métricas gratuitas y un nivel avanzado de pago con métricas y funciones adicionales; revisa cuál está habilitado en cada dashboard. Sus [métricas y recomendaciones](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage_lens.html) ayudan a localizar buckets que crecen, versiones que ocupan espacio o reglas que faltan.

## Auditoría y detección: CloudTrail, GuardDuty y Macie

CloudTrail separa los eventos de administración de los **eventos de datos** de S3, que registran operaciones sobre objetos como `GetObject`, `PutObject` y `DeleteObject`. Los eventos de datos de S3 no se registran por defecto en CloudTrail Event history; si necesitas conservar ese detalle para auditar accesos, selecciona los buckets u objetos y habilita los eventos de datos en un trail o event data store. Pueden generar cargos según el volumen. Consulta [qué eventos de S3 registra CloudTrail](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cloudtrail-logging-s3-info.html) y los [precios de CloudTrail](https://aws.amazon.com/cloudtrail/pricing/).

Estas herramientas tienen propósitos distintos:

- **Amazon GuardDuty S3 Protection** analiza eventos de acceso a objetos para detectar actividad sospechosa. Se habilita por región; no necesitas configurar por separado el registro de eventos de datos en CloudTrail solo para que GuardDuty use su protección de S3. El análisis de GuardDuty tiene un precio propio basado en el volumen de eventos; consulta la [guía de S3 Protection](https://docs.aws.amazon.com/guardduty/latest/ug/s3-protection.html) y los [precios de GuardDuty](https://aws.amazon.com/guardduty/pricing/).
- **Amazon Macie** mantiene un inventario de buckets de propósito general y ayuda a descubrir datos sensibles, mediante análisis automatizado o trabajos de descubrimiento. No es un sustituto de GuardDuty para detectar patrones de acceso sospechosos. El cargo puede depender de los buckets, objetos y bytes analizados; revisa [cómo Macie monitorea los datos de S3](https://docs.aws.amazon.com/macie/latest/user/monitoring-s3.html) y los [precios de Macie](https://aws.amazon.com/macie/pricing/).

## Revisar la configuración con AWS CLI

Estos comandos consultan la configuración; no crean ni modifican recursos. Sustituye el bucket y la región por los valores de tu cuenta. Necesitas una sesión válida de AWS CLI y permisos de lectura para cada operación.

```bash
BUCKET='mi-bucket'
REGION='us-east-1'

aws s3api get-public-access-block \
  --bucket "$BUCKET" --region "$REGION"

aws s3api get-bucket-versioning \
  --bucket "$BUCKET" --region "$REGION"

aws s3api get-bucket-encryption \
  --bucket "$BUCKET" --region "$REGION"

aws s3api get-bucket-lifecycle-configuration \
  --bucket "$BUCKET" --region "$REGION"
```

La primera operación muestra el ajuste de Block Public Access del bucket, no el de la cuenta ni la organización. Verifica esos niveles por separado. Si un bucket no tiene una configuración explícita de bloqueo o de ciclo de vida, la API puede responder que esa configuración no existe. Estos resultados son un punto de partida para revisar; no demuestran por sí solos que el acceso efectivo sea privado. Consulta las referencias de AWS CLI para [`get-public-access-block`](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-public-access-block.html), [`get-bucket-versioning`](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-bucket-versioning.html), [`get-bucket-encryption`](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-bucket-encryption.html) y [`get-bucket-lifecycle-configuration`](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-bucket-lifecycle-configuration.html).

## Recursos y comunidades para aprender y practicar

Para entender el servicio y practicar, puedes elegir entre estos materiales comunitarios. Las grabaciones reflejan su fecha de publicación; usa la documentación oficial enlazada arriba para comprobar límites y procedimientos actuales.

- **Introducción breve:** [AWS Flash Talk: S3 con Bianca Torres](https://www.youtube.com/watch?v=1_wSH_lCB3Q), de AWS User Group Perú (marzo de 2021). Es una charla introductoria; no uses sus pantallas como referencia de configuración vigente.
- **Almacenamiento en AWS:** [Cloud Practitioner Challenge, sesión 4](https://www.youtube.com/watch?v=j81cCHrfmqA), de AWS User Group Medellín (mayo de 2025), recorre almacenamiento en el contexto de la certificación.
- **Práctica con S3:** [Laboratorio práctico de Amazon S3](https://www.youtube.com/watch?v=sp36Dcw7ePU), de AWS User Group Caracas (abril de 2024). Revisa qué recursos y operaciones propone antes de repetirlo en una cuenta.
- **Clasificación de datos:** [AWS Perú Security Day: Amazon Macie con Gerardo Castro](https://www.youtube.com/watch?v=ABz26Hj-F54) es una charla de septiembre de 2020. Sirve como contexto histórico para la función de Macie, cuyas opciones han evolucionado.
- **Exposición accidental:** [El peor día de un AWS Cloud Security Engineer: es solo un bucket público](https://www.youtube.com/watch?v=vorKsK1XmGU), de 2025, muestra el riesgo de publicar datos por error.

Si trabajas con analítica, el [workshop de data lake con S3, Glue y Athena](https://github.com/tuni56/aws-data-lake-workshop) ofrece instrucciones en español de nivel 200. Requiere una cuenta AWS activa y permisos para crear recursos en S3, Glue, Athena e IAM; el repositorio incluye una limpieza. Su README estima menos de USD 1 si completas esa limpieza, pero esa cifra es una estimación de sus autores, no una tarifa garantizada: puede variar por región, tiempo y uso. Consulta los precios actuales y elimina los recursos cuando termines. Para un flujo de procesamiento de imágenes, el artículo de [arquitectura serverless orientada a eventos con S3, SQS, Lambda y DynamoDB](https://www.alfredo-dominguez.dev/arquitecturas/03-event-driven-serverless/) muestra otro uso de los objetos como entrada de una aplicación.

Para aprender con otras personas, [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) recibe a quienes se interesan por AWS y la nube; el [portal de AWS User Group Perú](https://awsugperu.cloud/) publica talleres, actividades y grupos de estudio. El [directorio de comunidades AWS en Latinoamérica](/comunidades/) permite explorar grupos por país y tipo, y la [agenda regional de eventos](/eventos/) reúne fechas, modalidad y enlaces de inscripción.

También puedes considerar una actividad de seguridad en Ecuador: la ficha de [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) anuncia una sesión virtual de AWS User Group Security Ecuador para el **20 de octubre de 2026 a las 19:00 GMT-5**. La descripción trata controles automatizados de AWS e IAM en general; no se anuncia como un taller específico de S3. La ficha indica cupos limitados y que el enlace de acceso se muestra a las personas inscritas. Confirma en Meetup las condiciones vigentes; puedes consultar otras actividades en la [agenda de eventos](/eventos/).

## Preguntas frecuentes sobre Amazon S3

### ¿S3 cifra los objetos automáticamente?

Sí. S3 cifra en reposo las cargas nuevas con SSE-S3 por defecto. Esto no reemplaza las políticas de acceso. Si necesitas controlar la clave o auditar su uso, evalúa SSE-KMS. Cambiar el cifrado predeterminado no modifica los objetos que ya estaban guardados.

### ¿El versionado es un respaldo?

No por sí solo. Ayuda a recuperar versiones dentro del mismo bucket, pero todas las versiones comparten el bucket y los permisos que las administran. Para datos críticos, define una copia con controles separados y prueba que puedas restaurarla.

### ¿La replicación crea una copia de respaldo o un failover?

No automáticamente. S3 copia objetos de forma asíncrona de acuerdo con las reglas de replicación; la aplicación necesita su propio procedimiento para leer del destino o cambiar el tráfico. La replicación en vivo tampoco incluye los objetos existentes antes de la regla: para ellos existe Batch Replication.

### ¿Qué reviso si recibo Access Denied (403)?

Identifica la acción, el bucket o la clave y el rol que hizo la solicitud. Revisa los permisos IAM y de bucket, los controles de la organización, las políticas del endpoint o punto de acceso y, si el objeto usa SSE-KMS, los permisos de la clave. Un `Deny` explícito puede bloquear la operación aunque otra política la permita. No abras el bucket ni desactives Block Public Access para resolver un permiso privado: corrige la acción y el recurso que necesita la aplicación. La [guía de AWS para diagnosticar errores 403 en S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshoot-403-errors.html) distingue estas causas y sus mensajes.

### ¿Cuál es el tamaño máximo de un objeto en S3?

Hasta **50 TB por objeto** mediante carga multipart. Una sola operación `PutObject` admite hasta 5 GB; el límite de la consola de S3 es 160 GB. Para objetos grandes, usa multipart upload desde AWS CLI, un SDK o la API. Revisa los [límites de carga vigentes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html).
