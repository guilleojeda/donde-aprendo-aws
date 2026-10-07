---
title: "Seguridad en AWS: por dónde empezar y en qué orden"
description: "Ordena las primeras decisiones de seguridad en AWS: responsabilidades, accesos, datos, registros y detección, con límites y costos que conviene revisar."
author: "guille-ojeda"
publishedAt: "2024-01-28"
publishedTimestamp: "2024-01-28T01:13:20.58Z"
modifiedTimestamp: "2026-10-07T10:00:50-03:00"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Snapshots de Amazon EBS: crear, restaurar y automatizar respaldos"
    url: "https://dondeaprendoaws.com/blog/respaldos-y-snapshots-en-ebs/"
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"

---

Si buscas por dónde empezar con la seguridad en AWS, avanza en este orden: define qué debes proteger, limita quién puede acceder, revisa si tus datos están expuestos, decide qué actividad necesitas registrar y habilita detecciones que respondan a un riesgo concreto. Después asigna a alguien la tarea de investigar los hallazgos y comprobar las correcciones.

Esta secuencia sirve para una cuenta o una carga de trabajo que estás empezando a asegurar. No hace falta activar todos los servicios a la vez: primero entiende las responsabilidades, el alcance de las cuentas y regiones, y el tipo de datos que tienes.

## 1. Define qué protege AWS y qué debes configurar tú

El modelo de responsabilidad compartida reparte tareas entre AWS y el cliente. AWS protege la infraestructura que ofrece; lo que te corresponde en AWS depende del servicio que usas. En una instancia de Amazon EC2 debes gestionar el sistema operativo, sus actualizaciones, las aplicaciones y las reglas de red. En Amazon S3, AWS opera la plataforma, pero tú administras los datos y sus permisos. La guía del [modelo de responsabilidad compartida de AWS](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/shared-responsibility.html) explica cómo cambia ese reparto por servicio.

Si quieres una introducción antes de revisar tu propia cuenta, lee [los fundamentos de seguridad en AWS](/blog/aws-seguridad-fundamentos-esenciales/). La idea práctica es anotar la cuenta, las regiones, los servicios y los datos que tiene una carga de trabajo; así sabes qué controles y responsabilidades revisar.

## 2. Protege las identidades antes de sumar herramientas

Empieza por la identidad que tiene más privilegios: el usuario raíz de la cuenta. Protege sus credenciales con MFA, no generes claves de acceso root y resérvalo para las tareas que requieren root. Para el trabajo diario, usa una identidad administrativa separada. Las [prácticas recomendadas para el usuario raíz](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html) y las [prácticas de seguridad de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) describen estas medidas.

Para las personas, AWS recomienda acceso federado con credenciales temporales, por ejemplo mediante IAM Identity Center. Para aplicaciones y otros workloads, asigna roles de IAM que entreguen credenciales temporales. Limita cada identidad a las acciones y recursos que necesita y revisa las credenciales de larga duración que todavía existan. MFA agrega protección al inicio de sesión, pero no limita por sí sola las acciones que permite una política.

Por ejemplo, si una aplicación solo necesita leer objetos de un prefijo concreto de S3, no le des permisos para administrar todos los buckets de la cuenta. Si una integración necesita una clave de acceso de larga duración, documenta por qué la necesita y quién debe reemplazarla.

## 3. Reduce la exposición de datos; después evalúa el cifrado

Para un bucket privado de S3, comprueba Block Public Access tanto en la cuenta como en el bucket. Revisa además sus políticas y los accesos concedidos a roles o cuentas externas. AWS recomienda bloquear el acceso público salvo que la aplicación tenga un motivo explícito para publicar esos objetos; consulta las [prácticas de seguridad de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html) y la guía de [Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html).

S3 cifra en reposo las nuevas cargas de objetos con claves administradas por S3 (SSE-S3) cuando no configuras otro cifrado predeterminado ni solicitas otra opción en la carga. Un bucket puede tener SSE-KMS como cifrado predeterminado. El cifrado protege los datos almacenados, pero no decide quién puede leerlos y no obliga a una conexión HTTPS; consulta las [opciones de cifrado de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html). Si eliges SSE-KMS para controlar el uso de una clave, comprueba que la clave autorice a la identidad o al servicio que necesita usarla. La política de clave es el control principal de KMS; una política IAM solo concede acceso si la política de clave lo permite. Puedes profundizar en [seguridad, versiones y costos de Amazon S3](/blog/mejores-practicas-para-amazon-s3/) y en la [documentación de políticas de claves KMS](https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html).

## 4. Decide qué actividad necesitas conservar

AWS CloudTrail Event history muestra hasta 90 días de eventos de administración por región. No es un registro de cada acción sobre los datos. Por ejemplo, las llamadas de S3 a nivel de objeto, como leer, cargar o borrar un objeto, son eventos de datos y no aparecen en Event history. Si necesitas conservar esos eventos para auditar accesos a objetos, selecciónalos en un trail o almacén de eventos; CloudTrail cobra los eventos de datos según su uso. Consulta [los límites de Event history](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html), la [configuración de eventos de datos](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html) y los [precios de CloudTrail](https://aws.amazon.com/cloudtrail/pricing/).

Amazon GuardDuty cumple otra función: analiza fuentes de datos para detectar actividad potencialmente maliciosa. Para las fuentes fundamentales, GuardDuty usa flujos independientes; no necesitas crear un trail propio de CloudTrail para que analice esos eventos. GuardDuty se habilita por cuenta y región, y las protecciones para tipos adicionales de cargas de trabajo dependen de las funciones que actives. Si quieres guardar eventos de objetos S3 en tus propios registros, configura CloudTrail por separado; habilitar la protección de S3 de GuardDuty no configura ese trail. Revisa la [cobertura de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_settingup.html) antes de asumir qué señales analiza.

## 5. Elige detección según la pregunta que necesitas responder

Estos servicios tienen objetivos distintos. Activa uno cuando responda una pregunta concreta y verifica las cuentas, regiones y recursos que cubre.

### GuardDuty: señales de actividad maliciosa

Amazon GuardDuty analiza las fuentes y funciones habilitadas para detectar actividad potencialmente maliciosa en cuentas y cargas. Un hallazgo requiere revisión y respuesta; no equivale a bloquear al atacante.

### Inspector: vulnerabilidades y exposición de red

Amazon Inspector examina recursos compatibles, como EC2, imágenes en ECR y funciones Lambda. Un CVE o una ruta de red expuesta señala una debilidad que debes corregir; no prueba que haya ocurrido una intrusión.

### Macie: datos sensibles en S3

Amazon Macie descubre datos sensibles en buckets de propósito general de S3. Su descubrimiento automatizado analiza muestras representativas de objetos elegibles: «sin hallazgos» no demuestra que todos los objetos hayan sido analizados.

Las páginas de AWS sobre [Amazon Inspector](https://docs.aws.amazon.com/inspector/latest/user/what-is-inspector.html) y [descubrimiento automatizado de datos sensibles con Macie](https://docs.aws.amazon.com/macie/latest/user/discovery-asdd-how-it-works.html) explican el alcance y sus límites. Macie mantiene inventario por región; la cobertura depende de que los objetos sean elegibles y de que los permisos permitan analizarlos. Encontrar datos sensibles tampoco cambia sus permisos o su cifrado: alguien debe decidir y aplicar la corrección. Para profundizar en la cobertura, la llegada de alertas y la investigación, continúa con la guía de [detección de amenazas con GuardDuty y CloudTrail](/blog/10-mejores-practicas-de-aws-para-deteccion-de-amenazas-en-tiempo-real/).

## 6. Asigna la respuesta y verifica el cambio

Antes de habilitar detecciones, define quién recibe cada hallazgo y qué hará con él. Una alerta sin una persona responsable no completa el flujo de seguridad. Para cada resultado, identifica el recurso y la región, investiga la evidencia disponible y corrige la causa: por ejemplo, restringe una política, bloquea un bucket que no debe ser público o aplica el parche indicado por Inspector.

Luego comprueba que el cambio resolvió el problema y que la aplicación sigue funcionando. La automatización puede ayudar con tareas repetibles, pero una acción que cambie permisos o aísle recursos necesita permisos acotados y una prueba que contemple su impacto operativo.

## 7. Comprueba que puedes recuperar los datos críticos

La seguridad también depende de poder restaurar los datos importantes después de una eliminación accidental, un error o un incidente. Define qué necesitas conservar y prueba la recuperación en un entorno aislado antes de depender de una copia.

Si tu carga usa volúmenes EBS, AWS no crea snapshots automáticamente por ti. La guía [Snapshots de Amazon EBS: crear, restaurar y automatizar respaldos](/blog/respaldos-y-snapshots-en-ebs/) explica cómo definir copias y probar una restauración.

## Revisa el costo y el alcance antes de habilitar

GuardDuty, Inspector y Macie pueden generar cargos según la cobertura, el uso y la región. CloudTrail cobra por registrar eventos de datos; SSE-KMS puede añadir cargos por el almacenamiento de claves administradas por el cliente y su uso. El almacenamiento de registros y otros servicios relacionados también puede tener costo. Antes de habilitar cada función, revisa los [precios de GuardDuty](https://aws.amazon.com/guardduty/pricing/), [Inspector](https://aws.amazon.com/inspector/pricing/), [Macie](https://aws.amazon.com/macie/pricing/) y [AWS KMS](https://aws.amazon.com/kms/pricing/). Las pruebas o niveles sin cargo que existan pueden tener condiciones, alcance y duración específicos; no supongas que cubren todos los servicios, cuentas y regiones. Después de activarlos, revisa el uso y los cargos reales en AWS Billing.

## Dónde seguir aprendiendo y conversar

Para repasar varios temas juntos, la grabación [Introducción a la seguridad en la nube](https://www.youtube.com/watch?v=tqEolntK4qg) de AWS User Group Medellín recorre el modelo de responsabilidad compartida, IAM, cifrado, redes, monitoreo y auditoría. También puedes ver [Introducción a Amazon GuardDuty en español](https://www.youtube.com/watch?v=_1BKh6CuWvs), de AWS Developers LATAM. Es una introducción publicada en 2022; la cobertura y configuración actuales están en la documentación oficial. El [canal de AWS Security Users Group LatAm](https://www.youtube.com/@AWSSecurityLATAM) reúne grabaciones regionales en español sobre seguridad de AWS y respuesta a incidentes.

Para hacer preguntas o compartir lo que estás aprendiendo, puedes conectar con [AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/), una comunidad independiente centrada en seguridad AWS para hispanohablantes, o con [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/), un grupo general para personas interesadas en la nube y AWS.

La agenda anuncia dos actividades futuras de AWS User Group Security Ecuador. [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) será virtual el **20 de octubre de 2026, de 19:00 a 20:00 (GMT−5)**; la descripción indica cupos limitados y trata controles automatizados, incluidas credenciales IAM. [AWS & Cloud Native Security Night](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/) está anunciada para el **23 de octubre de 2026, de 17:00 a 20:00 (GMT−5)** en Guayaquil, con foco en Kubernetes y seguridad cloud native; el organizador la anuncia gratuita y con cupos limitados. Confirma la inscripción, la disponibilidad de lugares y los detalles en cada ficha antes de asistir. Puedes encontrar más actividades en la [agenda regional de eventos](/eventos/).

## Preguntas frecuentes

### ¿Cifrar un bucket de S3 lo vuelve privado?

No. El cifrado protege los datos en reposo, pero los permisos de la cuenta, el bucket y sus identidades deciden quién puede leerlos. Revisa Block Public Access y las políticas por separado.

### ¿GuardDuty reemplaza un trail de CloudTrail?

No. GuardDuty analiza algunas fuentes mediante un flujo independiente. Un trail sirve para conservar los eventos que necesitas consultar o auditar; para revisar accesos a objetos de S3, selecciona los eventos de datos y considera sus cargos.

### ¿Debo habilitar todos los servicios de seguridad desde el primer día?

No es necesario empezar por todos. Define primero qué cuentas, regiones y cargas quieres cubrir; luego habilita solo las funciones que responden a tus riesgos y revisa su costo. Una señal detectada debe llegar a alguien que pueda investigarla y corregir el problema.
