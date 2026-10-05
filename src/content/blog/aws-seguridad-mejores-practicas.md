---
title: "Mejores prácticas de seguridad en AWS: checklist y cómo verificarlas"
description: "Revisa root y MFA, permisos, S3, red, CloudTrail y respuesta a incidentes. Cada práctica incluye una comprobación concreta y recursos en español para profundizar."
author: "guille-ojeda"
publishedAt: "2024-01-24"
publishedTimestamp: "2024-01-24T01:20:24.308Z"
modifiedTimestamp: "2026-10-05T12:46:00-03:00"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"
---

**Para mejorar la seguridad en AWS, revisa primero el acceso a la cuenta, los permisos y la exposición de datos y red; después comprueba los registros, la detección y tu capacidad de respuesta.** Activar servicios sin verificar su alcance deja preguntas importantes sin responder.

Este checklist sirve para una revisión inicial de una cuenta o una aplicación. Registra la cuenta, las Regiones utilizadas, el recurso, la evidencia y quién corregirá cada problema. Si necesitas entender el reparto de responsabilidades antes de actuar, empieza por los [fundamentos de seguridad en AWS](https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/).

| Control | Evidencia que debes buscar |
| --- | --- |
| Root protegido | MFA registrado, sin claves de acceso root y recuperación accesible |
| Acceso diario con alcance definido | Personas con acceso federado; aplicaciones con roles y credenciales temporales |
| Permisos necesarios | Tarea permitida funciona; acción fuera del alcance se rechaza |
| Datos protegidos | Exposición de S3 revisada, cifrado adecuado y secretos fuera del código |
| Red restringida | Cada regla entrante tiene un origen, puerto y motivo definidos |
| Actividad conservada | Evento localizado y cobertura/retención del trail documentadas |
| Detección operativa | Cobertura comprobada y aviso de prueba recibido por el responsable |
| Recuperación y respuesta | Restauración ensayada y procedimiento de incidente practicado |

## 1. Protege root y comprueba cómo entra cada persona

No uses root para trabajar a diario ni crees claves de acceso para él. AWS exige MFA en el acceso root a la consola. Protege también el correo y los demás mecanismos de recuperación. En organizaciones que eliminan las credenciales root de las cuentas miembro, comprueba la administración centralizada en lugar de intentar registrar un dispositivo en cada cuenta sin credenciales. La [guía de seguridad del usuario raíz](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html) describe ambos escenarios.

**Cómo comprobarlo:** revisa las credenciales de seguridad root y los contactos de la cuenta. Para una persona, confirma que puede entrar con el rol previsto y que el proveedor de identidad aplica MFA. Si usas IAM Identity Center, comprueba la configuración de su fuente de identidades; no asumas que todas las fuentes aplican MFA de la misma forma.

Prioriza federación para las personas y roles para las aplicaciones, según las [prácticas de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html). Si una integración realmente necesita una clave permanente, documenta su dueño, su uso y cómo reemplazarla. MFA del usuario no añade automáticamente un segundo factor a todas las llamadas realizadas con esa clave.

Con una sesión de AWS CLI ya configurada, puedes confirmar la cuenta y la identidad que estás utilizando:

```bash
aws sts get-caller-identity --profile revision
```

`revision` es un nombre de ejemplo: reemplázalo por tu perfil. Comprueba `Account` y `Arn` antes de seguir. Este comando consulta la identidad; no demuestra que tenga permisos limitados ni que se haya aplicado MFA. La [referencia de GetCallerIdentity](https://docs.aws.amazon.com/cli/latest/reference/sts/get-caller-identity.html) explica su respuesta.

## 2. Reduce permisos y revisa las credenciales que siguen activas

Busca políticas administrativas asignadas sin una necesidad actual, acciones `*`, recursos demasiado amplios y credenciales cuyo dueño o uso ya no puedes explicar. Algunas acciones requieren `Resource: "*"`; no lo elimines sin revisar la compatibilidad de la acción.

**Cómo comprobarlo:** elige una tarea real. Si un proceso solo debe leer un objeto de S3, verifica que puede leerlo y que no puede borrar ese objeto ni leer otro fuera de su alcance. Haz la prueba negativa en un entorno aislado o con un recurso de prueba; no intentes borrar datos de producción para comprobar una denegación.

Utiliza la [validación de políticas de IAM Access Analyzer](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-validation.html) para detectar errores y advertencias antes de guardar cambios. Una política sintácticamente válida todavía necesita pruebas con tu aplicación.

Para aprender a inventariar claves antiguas en varias cuentas, lee el [caso de auditoría de IAM de Gerardo Castro](https://roadtocloudsec.la/posts/encontre-access-key-2018-activa-produccion-python-boto3) y examina su [herramienta iam-audit](https://github.com/gerardokaztro/iam-audit). Revisa los permisos y el alcance del código antes de ejecutarlo; una auditoría no justifica conceder administración completa. La antigüedad de una clave es una señal para investigar, no prueba por sí sola de un compromiso.

## 3. Comprueba acceso a S3, cifrado y secretos

Para datos privados, revisa el bloqueo de acceso público y las políticas del bucket. S3 combina los ajustes aplicables de bucket, cuenta y organización: mirar un solo nivel no describe necesariamente el acceso efectivo. La [documentación de Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html) explica la combinación y las excepciones.

En un **bucket de propósito general** que ya existe, estas consultas muestran los ajustes del bucket sin cambiarlos:

```bash
aws s3api get-public-access-block \
  --bucket NOMBRE-DEL-BUCKET --profile revision

aws s3api get-bucket-encryption \
  --bucket NOMBRE-DEL-BUCKET --profile revision
```

Reemplaza el nombre por un bucket de tu revisión. Necesitas `s3:GetBucketPublicAccessBlock` y `s3:GetEncryptionConfiguration`, respectivamente. Para un bucket privado, comprueba las cuatro opciones de bloqueo y completa la revisión con las políticas y los niveles superiores. `AccessDenied` indica que falta acceso a la consulta: no demuestra que el bucket esté protegido. Consulta las referencias de [bloqueo público](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-public-access-block.html) y [cifrado predeterminado](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-bucket-encryption.html).

S3 cifra las nuevas cargas de objetos con SSE-S3 de forma predeterminada. Si necesitas SSE-KMS, verifica la clave y quién puede utilizarla; el cambio del valor predeterminado no transforma los objetos existentes. El cifrado tampoco impide que una identidad con permisos lea los datos. Estos comportamientos están documentados en la [guía de cifrado de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html).

**Cómo comprobarlo:** revisa un objeto representativo, los permisos de su lector y el acceso por HTTPS. Busca contraseñas y tokens en el código, variables expuestas y registros. Para secretos de aplicaciones, evalúa [AWS Secrets Manager y sus opciones de rotación](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html). Guardar un secreto en el servicio no configura por sí solo su rotación ni limita quién puede recuperarlo.

## 4. Justifica cada acceso de red

Busca reglas de entrada desde `0.0.0.0/0` o `::/0` hacia SSH, RDP, bases de datos o interfaces administrativas. Una aplicación pública puede necesitar HTTPS desde internet; cada puerto adicional necesita una razón.

**Cómo comprobarlo:** en la consola de VPC, abre los security groups de la aplicación y revisa origen, protocolo y puerto. Confirma qué recursos usan cada grupo antes de cambiar una regla compartida. En una base de datos, comprueba si puedes restringir el origen al security group de la aplicación. Revisa IPv4 e IPv6 y prueba que el flujo autorizado sigue funcionando. AWS documenta el [comportamiento de los security groups](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html).

Si estudias administración de EC2 sin abrir SSH a internet, puedes examinar las [plantillas de EC2 privada con VPC Endpoints y Systems Manager de Pablo González Robles](https://github.com/pangoro24/aws-privatelink-private-instance-ssm). Es una práctica que crea infraestructura: revisa los costos de EC2 y los endpoints de interfaz, despliega en una cuenta de laboratorio y elimina los stacks y recursos restantes cuando termines.

Para una aplicación web, evalúa AWS WAF según sus amenazas y observa el efecto de las reglas antes de bloquear tráfico válido. La [charla sobre protección web con WAF del AWS User Group Ecuador](https://www.youtube.com/watch?v=ropgqUGWhro) ofrece una introducción práctica.

## 5. Verifica qué registra CloudTrail y durante cuánto tiempo

El historial de CloudTrail proporciona automáticamente 90 días de eventos de administración por Región. **No contiene los eventos de datos de S3 ni reemplaza un trail para conservación continua.** La [guía del historial](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html) describe esas limitaciones.

**Cómo comprobarlo:** localiza un cambio conocido y verifica la identidad, hora y recurso. Por ejemplo, si en esa Región hubo cambios de reglas de entrada de security groups durante los últimos 90 días:

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=AuthorizeSecurityGroupIngress \
  --region REGION-DE-TU-REVISION --profile revision
```

El comando requiere `cloudtrail:LookupEvents`; reemplaza la Región por la que revisas. Un resultado vacío puede significar que no hubo ese evento allí durante el período, no que CloudTrail esté fallando. La [referencia de lookup-events](https://docs.aws.amazon.com/cli/latest/reference/cloudtrail/lookup-events.html) detalla los filtros.

Después revisa el trail: Regiones incluidas, eventos de administración, eventos de datos seleccionados, destino de registros y retención. Si necesitas investigar lecturas de objetos, selecciona esos eventos explícitamente. Revisa los costos de eventos de datos, almacenamiento y análisis; no todos quedan cubiertos por el historial sin cargo.

## 6. Comprueba cobertura, avisos y correcciones

Define qué necesitas detectar antes de activar herramientas. GuardDuty, Inspector y Macie cubren problemas diferentes; la [comparación de servicios de seguridad](https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/) te ayuda a elegir.

**Cómo comprobarlo:** revisa las cuentas, Regiones, recursos y planes habilitados. Genera un [hallazgo de ejemplo de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/sample_findings.html), si ese es el servicio que revisas, y comprueba que llega al canal previsto y que alguien sabe qué hacer. Un hallazgo de ejemplo prueba el recorrido del aviso, no la detección de un ataque real.

Si usas Security Hub CSPM para revisar configuraciones, confirma que AWS Config registra los tipos de recursos necesarios. AWS advierte que la mayoría de los controles depende de Config y que su registro puede generar cargos incluso durante una prueba de CSPM. Revisa las [dependencias y condiciones de Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html) y los [precios de AWS Config](https://aws.amazon.com/config/pricing/).

Un panel sin hallazgos puede tener cobertura incompleta. Y un hallazgo marcado como resuelto no sustituye comprobar que el recurso ya tiene la configuración correcta.

## 7. Practica recuperación y respuesta antes del incidente

Elige datos de prueba y restaura una copia en un entorno aislado. Comprueba integridad, acceso y tiempo de recuperación; elimina la restauración de prueba al terminar. Conserva la evidencia sin incluir datos sensibles.

Prepara también un procedimiento breve: quién recibe el aviso, cómo valida el incidente, qué puede aislar, cómo conserva evidencia y quién autoriza recuperar el servicio. La [sesión de planes de respuesta de AWS Women Colombia](https://www.youtube.com/watch?v=wyamnDooEt4) ayuda a discutir esas decisiones.

Para estudiar automatización, el [repositorio de respuesta a incidentes de Kevin Lupera y Security Ecuador](https://github.com/kevinlupera/aws-incident-response-security-ecuador-demo) muestra integración de GuardDuty, EventBridge, Lambda y notificaciones. Puede modificar accesos y aislar recursos: léelo primero y pruébalo únicamente en un laboratorio. Revisa sus costos y la limpieza; algunos registros se conservan después de eliminar stacks. La corrección automática requiere configuración, permisos y pruebas de impacto.

## Mantén la revisión y aprende con comunidades

Repite los controles afectados después de cambios de permisos, aplicaciones o red. Conserva excepciones con motivo, responsable y fecha de revisión; no reduzcas la seguridad a una puntuación de un panel.

Para compartir dudas y seguir profundizando:

- [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/) reúne charlas y actividades de defensa, identidades y automatización. Su [sesión virtual de Compliance as Code](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) está anunciada para el **20 de octubre de 2026, a las 19:00 de Ecuador (UTC−5)**; incluye un caso de credenciales IAM. Comprueba la inscripción y las condiciones del organizador antes de asistir.
- [AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/) y [AWS User Group Security Colombia](https://www.meetup.com/aws-user-group-security-colombia/) permiten conectar con grupos dedicados al tema y consultar sus actividades.
- [Road to CloudSec LATAM](https://roadtocloudsec.la/) publica casos y herramientas de seguridad de AWS. [Desplegando.cloud](https://desplegando.substack.com/) ayuda a seguir noticias de AWS en español; revisa qué novedades afectan los servicios que utilizas.

Los comandos de esta guía son consultas: no crean recursos. Las prácticas externas que despliegan infraestructura sí requieren planificar permisos, gastos y limpieza.
