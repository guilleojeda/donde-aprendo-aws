---
title: "Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida"
description: "Entiende qué protege AWS y qué debes proteger tú. Aprende identidad, permisos, datos, redes y registros con ejemplos y recursos de comunidades en español."
author: "guille-ojeda"
publishedAt: "2024-01-23"
publishedTimestamp: "2024-01-23T17:26:25.234Z"
modifiedTimestamp: "2026-10-05T12:46:00-03:00"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Mejores prácticas de seguridad en AWS: checklist y cómo verificarlas"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/"
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"
---

**La seguridad en AWS empieza por entender dos responsabilidades: AWS protege la infraestructura que ofrece y tú proteges los datos, los accesos y la configuración de lo que construyes sobre ella.** El reparto cambia según el servicio; contratar un servicio administrado reduce ciertas tareas, pero no elimina tus decisiones de seguridad.

Para empezar, aprende cinco cosas: quién puede entrar, qué puede hacer, cómo proteger los datos, qué expones a la red y dónde revisar la actividad. No necesitas memorizar todos los servicios de seguridad para entenderlas.

## Qué significa la responsabilidad compartida

El [modelo de responsabilidad compartida de AWS](https://aws.amazon.com/es/compliance/shared-responsibility-model/) distingue la seguridad **de la nube**, a cargo de AWS, y la seguridad **en la nube**, a cargo del cliente. AWS opera los centros de datos, el hardware y la infraestructura de sus servicios. Tus tareas dependen de cuánto administra el servicio elegido.

| Si utilizas… | Ejemplo de responsabilidad de AWS | Ejemplo de responsabilidad tuya |
| --- | --- | --- |
| Amazon EC2 | Hardware y capa de virtualización | Actualizar el sistema operativo de la instancia, la aplicación y sus reglas de red |
| Amazon S3 | Infraestructura y plataforma del almacenamiento | Decidir quién puede leer los objetos y qué datos almacenas |
| AWS Lambda | Infraestructura y entorno administrado del servicio | Proteger el código, sus dependencias y los permisos de ejecución |

Imagina un bucket de S3 con facturas. AWS protege el sistema de almacenamiento; tú decides si el bucket admite acceso público, qué aplicación puede leerlo y cuánto tiempo conservarás esos datos. Que S3 sea administrado no autoriza a nadie a compartir las facturas.

Puedes repasar la idea con el [video sobre responsabilidad compartida de Tech with Sheyla](https://www.youtube.com/watch?v=K4Xh7-m2qFg) o la [lectura de AWS Women Colombia sobre el mismo modelo](https://awswomencolombia.com/100diasdeaws-dia-31-aws-shared-responsibility-model). Esta última forma parte de una serie de 2023: sirve para estudiar el concepto, mientras que la documentación actual debe guiar la configuración.

## 1. Identidad: quién entra a tu cuenta

El usuario **root**, o usuario raíz, tiene acceso privilegiado a la cuenta. Resérvalo para tareas que lo requieren, protege sus mecanismos de recuperación y configura autenticación multifactor (MFA). AWS exige MFA para el acceso root a la consola; no es solo una recomendación opcional. La [guía de protección del usuario raíz](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html) detalla los requisitos y el caso de las cuentas miembro que administran el acceso root de forma centralizada.

Para el acceso diario de personas, AWS recomienda federación y credenciales temporales, por ejemplo con **AWS IAM Identity Center**. Para una aplicación en EC2 o Lambda, utiliza un **rol de IAM**: el servicio entrega credenciales temporales a la carga de trabajo. Evita empezar creando claves permanentes para cada persona y aplicación. Estas son las [prácticas actuales de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html).

Tres conceptos que conviene separar:

- **Autenticación:** comprobar quién eres; por ejemplo, al iniciar sesión con MFA.
- **Autorización:** decidir qué acciones puedes realizar después de entrar.
- **Credenciales:** el mecanismo que utilizas para identificarte. Que sean temporales limita su duración, pero sus permisos siguen siendo importantes.

MFA no reemplaza los permisos ni convierte una clave de acceso permanente en una credencial temporal. Para estudiar usuarios, roles y políticas con una comunidad, tienes la [sesión de IAM de AWS Girls Chile con Rodrigo Alarcón](https://www.youtube.com/watch?v=duoXbvsI3KY). Contrasta los pasos de interfaz y las recomendaciones de credenciales de las grabaciones con la documentación vigente.

## 2. Permisos: qué puede hacer cada identidad

**Mínimo privilegio** significa conceder las acciones necesarias sobre los recursos necesarios, con las condiciones apropiadas. Si una aplicación solo necesita leer un archivo de configuración en S3, no necesita administrar todos los buckets ni borrar objetos.

Una política puede especificar la acción `s3:GetObject` y el objeto que se permite leer. Otras políticas también intervienen en la evaluación: por ejemplo, la política del bucket y, si usas una clave de AWS KMS, sus permisos. Una denegación explícita puede impedir el acceso aunque otra política lo permita. La [explicación de evaluación de políticas de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html) ayuda a interpretar esos casos.

La prueba útil tiene dos partes: confirmar que la tarea autorizada funciona y que una acción fuera del alcance se rechaza. «Pude entrar a la consola» no demuestra mínimo privilegio.

## 3. Datos: acceso, cifrado y recuperación

El cifrado protege los datos en reposo o durante una transferencia. **No evita que una identidad autorizada los lea**, ni reemplaza una copia recuperable.

En S3, las nuevas cargas de objetos se cifran automáticamente en reposo con SSE-S3 como base. Puedes elegir SSE-KMS cuando necesitas controles específicos sobre las claves. Cambiar el cifrado predeterminado de un bucket no modifica automáticamente sus objetos existentes. AWS explica estos detalles en la [documentación de cifrado de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html).

Para el bucket de facturas, piensa en controles distintos:

- Restringir acceso a las personas y aplicaciones que lo necesitan.
- Revisar el [bloqueo de acceso público de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html).
- Utilizar HTTPS para la transferencia y la opción de cifrado adecuada en reposo.
- Definir una estrategia de recuperación y comprobar que puedes restaurar los datos.

Una copia que nunca has intentado recuperar deja sin comprobar una parte esencial del plan.

## 4. Red: qué está expuesto y a quién

Una VPC organiza la red de tus recursos. Los **security groups** controlan el tráfico de los recursos asociados mediante reglas de permiso y mantienen el estado de las conexiones. No contienen reglas explícitas de denegación. Las listas de control de acceso de red, o NACL, operan en las subredes y tienen un comportamiento distinto. Puedes consultar la [documentación de security groups](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html).

Para una aplicación web, quizás necesites HTTPS desde internet hacia el balanceador. Eso no implica abrir SSH ni el puerto de la base de datos al mundo. La base de datos puede aceptar conexiones únicamente desde el security group de la aplicación.

La etiqueta «subred privada» tampoco sustituye la revisión de rutas, accesos y permisos. El objetivo es poder explicar cada camino por el que alguien o algo llega a tus recursos.

## 5. Registros y detección: cómo sabes qué ocurrió

**CloudTrail registra actividad; un registro no es, por sí mismo, una alerta.** Su historial de eventos está disponible automáticamente y muestra los últimos 90 días de eventos de administración en cada Región. No incluye los eventos de datos, como la lectura de objetos de S3. Para conservar actividad más tiempo y seleccionar otros tipos de eventos, necesitas configurar un registro de seguimiento —*trail*— u otra opción compatible. Consulta los [límites del historial de CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html).

Después puedes sumar detección según el problema: GuardDuty para amenazas, Inspector para vulnerabilidades de cargas compatibles y Macie para datos sensibles en S3. Nuestra [guía para elegir servicios de seguridad](https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/) explica sus diferencias.

La [introducción a seguridad del AWS User Group Medellín](https://www.youtube.com/watch?v=tqEolntK4qg) y la [sesión de AWS Women Colombia sobre seguridad de workloads](https://www.youtube.com/watch?v=Q_TmTf3Hl-Y) te permiten volver sobre estos conceptos desde el contexto de una carga de trabajo.

## Una ruta corta para aprender y seguir acompañado

Empieza por clasificar las responsabilidades de una aplicación sencilla; continúa con identidad y permisos; luego revisa datos, red y registros. Cuando puedas explicar esos controles, utiliza el [checklist de seguridad y sus comprobaciones](https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/) para revisar una cuenta o proyecto.

Para conversar, seguir charlas y encontrar compañeros de aprendizaje:

- [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/) reúne una comunidad enfocada en seguridad de AWS en español. Su [canal de grabaciones](https://www.youtube.com/@AWSSecurityLATAM) permite estudiar sesiones a tu ritmo.
- [AWS Women Colombia](https://awswomencolombia.com/) publica materiales en español y reúne su [archivo de eventos y grabaciones](https://awswomencolombia.com/page/eventos).
- [AWS Guatemala](https://www.meetup.com/aws-guatemala/) ofrece un grupo generalista para aprender AWS y conversar sobre casos de uso. Es útil si también necesitas reforzar los fundamentos de nube.

Antes de publicar una duda, describe el servicio, la acción que intentas y el error, con datos de ejemplo. No compartas credenciales, tokens, registros con información sensible ni capturas sin revisar. Puedes pedir ayuda sin exponer tu cuenta.
