---
title: "AWS Session Manager: cómo configurar el acceso a EC2"
description: "Configura AWS Session Manager para EC2: revisa IAM, SSM Agent y red, conéctate por consola o CLI, reenvía puertos y entiende registros y costos."
author: "guille-ojeda"
publishedAt: "2024-03-18"
publishedTimestamp: "2024-03-18T23:43:17.278Z"
modifiedTimestamp: "2026-10-05T20:43:59-03:00"
cover: "/assets/blog/editorial-practica.png"
coverAlt: "Un cuaderno abierto con una secuencia de estaciones y un camino azul con punto naranja."
ogImage: "/assets/blog/editorial-practica.png"
related:
  - title: "Infraestructura como código en AWS con CloudFormation: guía práctica"
    url: "https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/"
  - title: "Mejores prácticas de seguridad en AWS: checklist y cómo verificarlas"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/"
---

AWS Systems Manager Session Manager permite abrir una terminal interactiva en una instancia EC2 desde la consola o la AWS CLI. Para una sesión de shell normal, el agente de la instancia inicia una conexión HTTPS hacia Systems Manager: no necesitas abrir el puerto TCP 22 entrante ni asignar una IP pública si la instancia ya puede alcanzar los endpoints de AWS.

La conexión depende de dos identidades con funciones distintas: los permisos de la persona que inicia la sesión y los permisos de la instancia para registrarse y comunicarse con Systems Manager. Configurar uno no sustituye al otro.

## Requisitos para conectar una instancia

- **Sistema operativo y agente:** usa un sistema operativo compatible con Systems Manager y un SSM Agent activo. AWS documenta como mínimo la versión 2.3.68.0 para sesiones básicas; recomienda mantener el agente actualizado. Algunas funciones requieren versiones posteriores: 3.0.222.0 para port forwarding o sesiones SSH y 3.0.284.0 para transmitir registros a CloudWatch Logs. Revisa los [requisitos de Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-prerequisites.html) y [cómo instalar o actualizar SSM Agent](https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-agent.html). Session Manager admite las versiones de Linux compatibles con Systems Manager y Windows Server 2012 o posterior; Windows Server 2016 Nano no está admitido.
- **Permisos de la instancia:** la instancia necesita un rol de IAM asociado mediante un perfil de instancia que permita a SSM Agent comunicarse con Systems Manager. Para empezar, AWS ofrece la política administrada [`AmazonSSMManagedInstanceCore`](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonSSMManagedInstanceCore.html). La [configuración de permisos de instancia](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-instance-profile.html) también describe otras opciones.
- **Permisos de quien se conecta:** la persona o el rol que usa la consola o la CLI necesita permisos de IAM para iniciar una sesión en esa instancia y usar el documento de sesión permitido. Por ejemplo, `ssm:StartSession` debe estar autorizado para el nodo de destino. La [guía de acceso de Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-restrict-access.html) incluye políticas de ejemplo; limita el alcance a las instancias y acciones necesarias.
- **Red desde la instancia:** SSM Agent debe poder iniciar conexiones HTTPS salientes por TCP 443 hacia los endpoints regionales `ssm` y `ssmmessages`. En regiones lanzadas antes de 2024 puede ser necesario `ec2messages`; ese endpoint no está disponible en regiones lanzadas en 2024 o después. Puedes dar salida a internet mediante la red de la VPC o, para una red privada sin salida a internet, configurar endpoints de interfaz de VPC para los servicios requeridos. Revisa los [endpoints de Systems Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/troubleshooting-ssm-agent.html) y las [operaciones de ssmmessages y ec2messages](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-setting-up-messageAPIs.html).

Con endpoints de VPC, comprueba que la resolución DNS privada y el DNS de la VPC estén habilitados. El grupo de seguridad del endpoint debe permitir HTTPS entrante desde la instancia. Si restringiste la salida de la instancia, permite TCP 443 hacia el endpoint. La instancia inicia la conexión: para el shell nativo de Session Manager no hace falta una regla entrante para SSH en el grupo de seguridad ni en la ACL de red. Si vas a enviar registros a CloudWatch Logs o S3, también hacen falta permisos y conectividad hacia esos servicios.

## Conectarse desde la consola o la AWS CLI

En la consola de EC2, selecciona la instancia, elige **Connect** y abre la pestaña **Session Manager**. También puedes iniciar la sesión desde Systems Manager, en **Session Manager → Start session**. El nodo debe aparecer administrado y en línea.

Para conectarte desde una terminal, instala la AWS CLI y el [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) en tu computadora. Revisa las versiones con `aws --version` y `session-manager-plugin --version`. AWS indica que actualices el plugin a 1.2.764.0 o posterior y advierte que versiones anteriores dejarán de admitirse próximamente. Después usa credenciales de AWS con los permisos descritos arriba:

~~~bash
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --region us-east-1 \
  --profile soporte
~~~

Reemplaza el ID, la región y el perfil por los de tu cuenta. Sin `--document-name`, AWS inicia el shell predeterminado de Session Manager. Consulta la referencia de [`aws ssm start-session`](https://docs.aws.amazon.com/cli/latest/reference/ssm/start-session.html) para otras opciones.

### Reenviar un puerto local a la instancia

El port forwarding permite alcanzar un servicio que escucha en la instancia mediante un puerto local. Por ejemplo, si una aplicación de prueba escucha en el puerto 8080 de la instancia, puedes abrir el puerto 18080 en tu computadora:

~~~bash
aws ssm start-session \
  --target i-0123456789abcdef0 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8080"],"localPortNumber":["18080"]}' \
  --region us-east-1 \
  --profile soporte
~~~

Mientras la sesión siga activa, abre `http://localhost:18080` en tu navegador o cliente. El ejemplo supone que la aplicación ya está en ejecución en el puerto remoto 8080; iniciar la sesión no instala ni inicia esa aplicación. Al terminar, cierra la sesión con `Ctrl+C`. Para terminar una sesión que quedó activa, un administrador con permiso `ssm:TerminateSession` puede usar el campo `SessionId` devuelto por `start-session`:

~~~bash
aws ssm terminate-session \
  --session-id ID-DE-LA-SESION \
  --region us-east-1 \
  --profile soporte
~~~

Si no anotaste el ID, puedes consultarlo con `aws ssm describe-sessions --state Active` si tu identidad tiene permiso para ver esas sesiones.

## Identidad del sistema y límites de auditoría

IAM determina quién puede iniciar la sesión y a qué nodo puede dirigirse. En el sistema operativo, sin embargo, SSM Agent crea la cuenta `ssm-user` y las sesiones usan sus credenciales administrativas de forma predeterminada. Revisa quién puede iniciar sesiones; si una shell administrativa no es apropiada, consulta cómo [restringir los permisos administrativos de `ssm-user`](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-ssm-user-permissions.html) y configura el usuario del sistema operativo según tu política.

CloudTrail puede registrar las llamadas de API para iniciar y terminar sesiones. Si habilitas las preferencias de Session Manager, los comandos y su salida de una sesión de shell también pueden guardarse en CloudWatch Logs o S3. Revisa [cómo funciona el registro de actividad de Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-logging.html) y [qué actividad registra CloudTrail](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-auditing.html).

**Session Manager no registra el contenido de las sesiones que usan port forwarding ni SSH.** En esos casos funciona como un túnel; CloudTrail puede conservar metadatos de inicio y fin, pero los comandos o el tráfico que circuló no quedan auditados por el registro de contenido de sesión de CloudWatch Logs o S3. No presentes esos registros de metadatos como evidencia del contenido transmitido. En shells con registro habilitado, evita escribir secretos en texto visible porque los comandos y su salida pueden quedar guardados.

## Errores frecuentes

- `AccessDeniedException` al iniciar: comprueba la identidad activa en la CLI, la cuenta y región seleccionadas, y que la política de esa identidad permita `ssm:StartSession` sobre el destino y el documento. Adjuntar `AmazonSSMManagedInstanceCore` al rol de EC2 no concede permisos a la persona.
- `TargetNotConnected`: confirma que elegiste la misma cuenta y región donde está la instancia, que el nodo aparece en Systems Manager y que SSM Agent está ejecutándose. Después revisa el rol de instancia, DNS y conectividad saliente HTTPS a los endpoints regionales. AWS resume estas causas en su guía de [solución de problemas de Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-troubleshooting.html).
- **La CLI informa que falta el plugin:** instálalo o actualízalo en la computadora desde la que ejecutas la CLI. Session Manager no instala ese componente en tu cliente.

## Costos y cierre de una prueba

AWS no cobra un cargo adicional por usar Session Manager con instancias EC2. Eso no significa que toda la configuración sea gratuita:

- CloudWatch Logs cobra por ingestión, retención y consultas según uso y región. Como referencia concreta, la tarifa publicada de ingestión bajo demanda en **US East (N. Virginia)** es **USD 0,50 por GB**; consulta los [precios de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) para la región y los cargos vigentes.
- Los endpoints de interfaz de VPC generan cargos por endpoint-hora en cada zona de disponibilidad donde se provisionan y por datos procesados. La tarifa publicada para el primer nivel de procesamiento es **USD 0,01 por GB**; por ejemplo, 10 GB suman USD 0,10 de procesamiento, además de las horas de endpoint. Consulta los [precios de AWS PrivateLink](https://aws.amazon.com/privatelink/pricing/) y calcula el costo por región y cantidad de zonas.
- El almacenamiento, las solicitudes y la transferencia de S3, el uso de una clave administrada por KMS, NAT y la propia instancia EC2 pueden sumar cargos de sus servicios.
- Desde el **30 de septiembre de 2026**, AWS cobra **USD 0,05 por sesión** en nodos híbridos y multinube; ese precio no aplica a sesiones de instancias EC2. Consulta los [precios de Systems Manager](https://aws.amazon.com/systems-manager/pricing/) antes de estimar el total.

Para un laboratorio, cierra la sesión cuando termines. Si creaste endpoints de VPC o destinos de registros solo para esa prueba, elimínalos únicamente después de confirmar que no los comparte otro sistema; los endpoints siguen generando cargos mientras existen. El [calculador de precios de AWS](https://calculator.aws/) permite estimar la configuración completa.

## Recursos para seguir aprendiendo

- Para estudiar operaciones, AWS Women Colombia publicó una grabación titulada [“El Despertar de la Fuerza Cloud: AWS Certified SysOps Administrator: AWS Systems Manager”](https://www.youtube.com/watch?v=0sRNTZwaWvc). El título identifica el tema; contrasta los requisitos y comandos con la documentación de AWS.
- Para repasar IAM y EC2 en conjunto, AWS Women Colombia publicó la grabación [“Practitioner, Una Nueva Esperanza: AWS IAM y Amazon EC2”](https://www.youtube.com/watch?v=rFppvIDrNoA). Úsala como material complementario; las políticas concretas de Session Manager están en la [guía oficial de acceso](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-restrict-access.html).
- Si quieres conocer otra función de Systems Manager, AWS User Group Guatemala tiene la grabación [“Automatiza tus tareas de Seguridad con AWS Systems Manager Documents”](https://www.youtube.com/watch?v=fFcoFODfNXo), disponible en su [canal de YouTube](https://www.youtube.com/@awsugguatemala). Los documentos y Run Command sirven para automatizar tareas; son distintos de la shell interactiva de Session Manager.
- El artículo comunitario [Cómo configurar el agente de CloudWatch con Systems Manager para monitorear la memoria de una instancia EC2](https://dev.to/cecamilo/como-configurar-el-agente-de-cloudwatch-con-systems-manager-para-monitorear-la-memoria-de-una-instancia-ec2-3ib7), publicado en 2022, muestra otro uso de Systems Manager: instalar y configurar CloudWatch Agent mediante Run Command. Sus pantallas son antiguas; confirma los pasos vigentes en la [documentación de CloudWatch Agent](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html). Estas métricas de la instancia son distintas del registro del contenido de una sesión.

El [repositorio comunitario de CloudFormation para EC2 privadas con Systems Manager](https://github.com/pangoro24/aws-privatelink-private-instance-ssm) sirve para comparar una arquitectura con endpoints de VPC, pero no lo despliegues sin revisarlo. Su plantilla agrega `ec2messages` sin condición, aunque ese endpoint no está disponible en regiones lanzadas desde 2024; además, el README muestra un ejemplo de Windows que pasa una contraseña como parámetro de un comando. No copies ese ejemplo con credenciales reales y adapta la plantilla a la región, los permisos y los servicios que realmente necesitas. Nuestra [guía de CloudFormation](https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/) explica una plantilla acotada, validación y revisión de cambios antes de ejecutar una pila. Para una vista más amplia de controles de AWS, consulta también el [checklist de seguridad](https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/).

## Comunidades y eventos AWS en español

El [directorio de comunidades AWS](https://dondeaprendoaws.com/comunidades/) reúne grupos para encontrar actividades y conversar con otras personas. Para aprender con comunidades de seguridad AWS en español:

- [AWS Security Users Group LatAm en Meetup](https://www.meetup.com/awssecuritylatam/), un grupo regional con actividades sobre seguridad en AWS.
- [AWS Security UserGroup Argentina en Meetup](https://www.meetup.com/aws-security-usergroup-argentina/), [AWS User Group Security Colombia](https://www.meetup.com/aws-user-group-security-colombia/) y [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/), con páginas para seguir sus encuentros y actividades locales.
- El [sitio de AWS User Group Security Ecuador](https://www.awssecurityecuador.com/) publica recursos de la comunidad; su [grupo en Meetup](https://www.meetup.com/aws-user-group-security-ecuador/) permite consultar actividades locales.
- El [canal de YouTube de AWS Security Users Group LatAm](https://www.youtube.com/@AWSSecurityLATAM) reúne grabaciones de la comunidad. Revisa la descripción y fecha de cada video antes de usarlo como referencia técnica.
- Consulta la [agenda de eventos de comunidades AWS en español](https://dondeaprendoaws.com/eventos/) para encontrar encuentros próximos. La [agenda oficial de eventos y webinars de AWS](https://aws.amazon.com/events/) es otra fuente para actividades organizadas por AWS. Las fechas y condiciones de inscripción cambian; confirma los detalles en cada convocatoria.
