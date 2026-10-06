---
title: "Mejores prácticas de seguridad en AWS: checklist y cómo verificarlas"
description: "Checklist de seguridad en AWS: protege el acceso raíz, limita permisos, usa roles y verifica exposición pública, registros y recuperación."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:50:54.456Z"
modifiedTimestamp: "2026-10-06T17:50:38-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"
---

Las mejores prácticas de seguridad en AWS empiezan por proteger el acceso a la cuenta, dar a cada persona y carga de trabajo solo los permisos necesarios, reducir la exposición de redes y datos, y comprobar que puedas detectar y recuperarte de un incidente. Este checklist te ayuda a revisar esos controles en ese orden.

Es una guía operativa para empezar; no demuestra por sí sola cumplimiento normativo ni elimina todo riesgo. El reparto de tareas también depende del servicio: revisa el [modelo de responsabilidad compartida de AWS](https://aws.amazon.com/es/compliance/shared-responsibility-model/) para distinguir qué protege AWS y qué debes configurar tú.

## Checklist de seguridad en AWS

- [ ] Protege el usuario raíz con MFA, evita usarlo en el trabajo diario y no crees claves de acceso para esa identidad.
- [ ] Da a las personas acceso federado con credenciales temporales y asigna roles de IAM a las aplicaciones.
- [ ] Limita cada permiso a las acciones y recursos necesarios; revisa accesos no usados y externos.
- [ ] Revisa qué recursos son accesibles desde Internet y qué datos almacenan.
- [ ] Configura registros y detección para las cuentas, regiones y tipos de eventos que necesitas observar.
- [ ] Prueba que puedes restaurar los datos importantes y seguir un procedimiento ante incidentes.

A continuación, cada punto incluye una forma concreta de comprobarlo y el límite que conviene tener presente.

## 1. Protege el acceso raíz y usa identidades individuales

El usuario raíz de una cuenta AWS tiene privilegios amplios. Resérvalo para las tareas que lo requieren, activa MFA y protege el correo y los mecanismos usados para recuperar la cuenta. AWS recomienda no crear claves de acceso para el usuario raíz. Si una tarea administrativa diaria requiere acceso, utiliza una identidad administrativa separada.

**Cómo comprobarlo:** en las credenciales de seguridad de la cuenta raíz, confirma que MFA esté configurado y que no haya claves de acceso activas. Comprueba que el correo y teléfono de recuperación sean accesibles por las personas responsables. Revisa los inicios de sesión y el uso de root en los registros de CloudTrail. La [guía vigente para proteger el usuario raíz](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html) explica qué tareas lo requieren y cómo proteger su recuperación.

Para el acceso cotidiano de personas, AWS recomienda federación y credenciales temporales. **AWS IAM Identity Center** puede centralizar el acceso del personal a varias cuentas; si ya utilizas un proveedor de identidad, también puedes federar desde allí. Aplica MFA en el flujo de identidad que corresponda y revisa el acceso de administradores por separado.

Las aplicaciones y servicios también deben tener identidades propias. Asigna un rol al entorno de ejecución —por ejemplo, un perfil de instancia para EC2 o un rol de ejecución para Lambda— para que obtenga credenciales temporales. Evita guardar claves permanentes en el código, archivos de configuración, imágenes de contenedor o variables de despliegue.

Las claves de largo plazo solo son necesarias en algunos casos que no admiten roles. Si no puedes evitar una, documenta su propósito y responsable, limita los permisos, protege su almacenamiento y revisa cuándo se usó. Desactiva las que ya no se utilizan. AWS recomienda actualizar claves cuando el caso de uso lo requiere; no establece una regla universal de rotación cada cierto número de días. Consulta las [prácticas de seguridad de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html).

Para profundizar en IAM, el artículo de [Road to CloudSec LATAM sobre una auditoría de claves, MFA y permisos en AWS Organizations](https://roadtocloudsec.la/posts/encontre-access-key-2018-activa-produccion-python-boto3) muestra un caso avanzado con credenciales temporales y roles entre cuentas. Léelo como una experiencia técnica que requiere adaptar roles y permisos a cada organización, no como un script que debas ejecutar sin revisión.

## 2. Reduce permisos y confirma qué puede hacer cada identidad

Mínimo privilegio significa conceder solo las acciones necesarias sobre los recursos necesarios y, cuando convenga, restringirlas con condiciones. Una función que lee un objeto de S3 no necesita permisos para administrar todos los buckets o borrar datos.

**Cómo comprobarlo:** parte de las tareas reales de cada persona o aplicación. Revisa las políticas asociadas al rol, las políticas de recursos y las relaciones entre cuentas. En un entorno de prueba, confirma que las acciones requeridas funcionan y que una acción fuera del alcance se rechaza. Luego revisa los permisos cuando cambien la aplicación, el equipo o sus responsabilidades.

[IAM Access Analyzer](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-findings.html) puede generar hallazgos de acceso externo, rutas de acceso interno y permisos o credenciales sin uso según el analizador y alcance que configures. No lo trates como una revisión universal de cada riesgo: comprueba qué cuentas, recursos y tipos de hallazgo cubre. Los análisis de acceso interno y sin uso pueden tener cargos; revisa los [precios de IAM Access Analyzer](https://aws.amazon.com/iam/access-analyzer/pricing/).

## 3. Revisa la red, la exposición pública y los datos

Empieza por dibujar el camino que debería seguir una solicitud desde Internet hasta la aplicación y sus datos. Deja público solo el punto de entrada que realmente lo necesite. En una aplicación web, por ejemplo, un balanceador podría aceptar HTTPS, mientras que los servidores de aplicación y la base de datos aceptan tráfico únicamente de sus componentes autorizados.

Los grupos de seguridad controlan el tráfico entrante y saliente de los recursos asociados. **Cómo comprobarlo:** revisa cada regla, su puerto, origen y destino. Asegúrate de poder explicar los permisos abiertos a 0.0.0.0/0 o ::/0; evita exponer directamente puertos administrativos o de bases de datos al mundo salvo que un caso concreto lo requiera y tenga controles adicionales. La [guía de grupos de seguridad de Amazon VPC](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html) describe sus reglas y límites.

Para datos en Amazon S3, deja activado **Block Public Access** en la cuenta y en los buckets que deben seguir privados. Los buckets nuevos bloquean el acceso público de forma predeterminada. Si después desactivas esa protección o cambias permisos, vuelve a comprobar el resultado. S3 aplica la combinación más restrictiva de los ajustes de bloqueo de la cuenta, el bucket y el punto de acceso, incluidas las políticas de organización aplicables; una política pública no anula un bloqueo activo. Revisa la configuración de acceso público, las políticas del bucket y quién puede modificarlas. Si publicas un sitio, separa el contenido público de los datos privados. Consulta las [prácticas de seguridad de Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html) y la guía de [Block Public Access y sus niveles de aplicación](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html).

Comprueba también cómo protege los datos cada servicio. Amazon S3 cifra los objetos nuevos en reposo de forma predeterminada con SSE-S3; otros servicios y necesidades pueden requerir opciones distintas. Si utilizas claves de AWS KMS, revisa quién puede administrarlas y quién puede usarlas. El cifrado protege los datos almacenados o transferidos, pero no corrige una política de acceso demasiado amplia ni reemplaza las copias de seguridad.

Mantén actualizados los sistemas operativos, dependencias y contenedores que administras. Amazon Inspector puede buscar vulnerabilidades en recursos compatibles como instancias EC2, imágenes en ECR y funciones Lambda, pero debes revisar qué recursos y tipos de análisis están cubiertos en tus cuentas y regiones. La [descripción y alcance de Amazon Inspector](https://docs.aws.amazon.com/inspector/latest/user/what-is-inspector.html) explica qué examina el servicio.

## 4. Registra la actividad y revisa los hallazgos

AWS CloudTrail registra actividad de la cuenta. En Event history puedes consultar hasta 90 días de eventos de administración por región; ese historial no incluye por defecto eventos de datos como leer objetos de S3. Si necesitas guardar eventos durante más tiempo o registrar acciones sobre objetos concretos, configura un trail y selecciona los tipos de eventos adecuados. Los eventos de datos requieren selección explícita y pueden generar cargos adicionales. Consulta los [límites de Event history](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html) y la [configuración de eventos de datos en CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html).

**Cómo comprobarlo:** revisa la página **Trails** y confirma que la grabación esté activa en las regiones habilitadas que necesitas cubrir. En AWS Organizations, comprueba que el trail aplique a las cuentas miembro. Si necesitas saber quién leyó o modificó objetos, verifica los selectores de eventos de datos de S3; un historial de eventos de administración no prueba que estés registrando esas lecturas. Revisa también que la entrega de archivos no tenga errores y protege el destino de registros. Consulta la guía de [trails de organización](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/creating-trail-organization.html), los [eventos de administración](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-management-events-with-cloudtrail.html) y la [gestión de costos de CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-trail-manage-costs.html).

AWS Config registra los tipos de recursos que incluyes y evalúa las reglas habilitadas para su alcance. **Cómo comprobarlo:** en cada cuenta y región que te importe, revisa que el grabador esté activo, que registre los tipos de recurso necesarios y que las reglas tengan evaluaciones recientes. Un resultado sin datos o una regla sin alcance no demuestra que el recurso esté seguro. Las reglas proactivas de Config tampoco impiden por sí solas un despliegue ni corrigen recursos.

AWS Security Hub CSPM puede reunir hallazgos de servicios integrados y evaluar controles de seguridad. La mayoría de esos controles necesita que AWS Config esté configurado para registrar los recursos que evalúa. Verifica qué estándares y controles están habilitados, en qué cuentas y regiones, y qué recursos cubren. Un resultado de un control describe esa comprobación específica; no es una certificación de cumplimiento. Consulta la [introducción a Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html) y la integración de [evaluaciones de AWS Config con Security Hub CSPM](https://docs.aws.amazon.com/config/latest/developerguide/setting-up-aws-config-rules-with-console-integration.html).

Amazon GuardDuty es un servicio de detección de amenazas que genera hallazgos a partir de sus fuentes y planes habilitados. Revisa que esté activo en las cuentas y regiones que necesitas y define quién analizará sus hallazgos. Un hallazgo no bloquea por sí mismo al actor ni completa una investigación. Security Hub puede actualizar hallazgos; cualquier respuesta que cambie recursos necesita una acción y permisos configurados aparte. Comprueba el efecto de esa acción antes de automatizarla. Consulta [qué analiza GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/) y cómo [configurar una respuesta mediante EventBridge](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-cloudwatch-events.html).

Al habilitar registro, reglas o análisis adicionales, revisa cobertura, región, volumen y precios del servicio. No asumas que todos los tipos de eventos se capturan, que todos los recursos se evalúan o que todas las funciones operan sin cargos.

## 5. Prueba copias de seguridad y prepara una respuesta

Define qué datos y configuraciones necesitas recuperar, con qué antigüedad y en cuánto tiempo. AWS Backup puede programar copias de los recursos que admite, pero un trabajo de copia exitoso no demuestra que la aplicación se pueda recuperar. Limita quién puede cambiar o eliminar las copias y considera aislar una copia en otra cuenta cuando necesites reducir el impacto de una credencial de producción comprometida; la separación puede limitar el alcance si mantienes aislados los permisos para administrar y eliminar las copias, como explica esta [práctica recomendada para políticas de backup](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_backup_best-practices.html).

**Cómo comprobarlo:** restaura periódicamente un recurso en un destino de prueba y valida que los datos estén completos, la aplicación pueda utilizarlos y el tiempo de recuperación corresponda a tu objetivo. Comprueba también las dependencias, permisos y claves de cifrado requeridas. AWS recomienda probar la recuperación frente a objetivos de tiempo y pérdida de datos en su práctica de [pruebas periódicas de recuperación](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_backing_up_data_periodic_recovery_testing_data.html).

Prepara un procedimiento breve para situaciones probables, como una clave expuesta, un bucket que quedó público o un hallazgo de GuardDuty. Anota cómo confirmar el alcance, quién decide el aislamiento, cómo limitar credenciales o tráfico, qué evidencia conservar y cómo volver a un estado confiable. Ensaya el procedimiento con las personas responsables. AWS explica cómo [desarrollar y probar manuales de respuesta a incidentes](https://docs.aws.amazon.com/wellarchitected/latest/framework/sec_incident_response_playbooks.html).

Para estudiar respuesta a incidentes, mira la charla de AWS Women Colombia [“Cuando la Fuerza se Rompe: planes de respuesta a incidentes”](https://www.youtube.com/watch?v=wyamnDooEt4).

## Recursos, comunidades y próximas actividades

Si quieres aprender con otras personas, puedes elegir una comunidad regional o local:

- [AWS Security Users Group LatAm en Meetup](https://www.meetup.com/awssecuritylatam/) comparte actividades en español sobre seguridad en AWS; su [canal de YouTube](https://www.youtube.com/@AWSSecurityLATAM) reúne charlas grabadas.
- [AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/) y [AWS User Group Security Colombia](https://www.meetup.com/aws-user-group-security-colombia/) publican actividades para sus comunidades locales.
- [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/) publica sesiones y enlaza su [grupo de Meetup](https://www.meetup.com/aws-user-group-security-ecuador/).

El grupo de Ecuador anuncia una charla virtual, [“Compliance as Code en AWS: de la política a la acción automática”](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/), para el 20 de octubre de 2026 a las 19:00 (UTC−5). La página indica cupos limitados; consulta allí las condiciones y el registro antes de participar.

Para encontrar encuentros de otros grupos y seguir las actividades futuras, consulta el [directorio de comunidades AWS](/comunidades/) y la [agenda de eventos](/eventos/). Cuando lleves una duda, describe el permiso o control que estás revisando con datos ficticios y explica qué resultado esperabas.

Para seguir con una introducción paso a paso, lee [Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida](https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/). Si quieres comparar los servicios y sus límites, continúa con [Servicios de seguridad de AWS: cuál usar para cada problema](https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/).

## Preguntas frecuentes

### ¿Tengo que rotar las claves de IAM cada 90 días?

AWS no recomienda una rotación universal por calendario para toda clave de acceso. Prefiere credenciales temporales y roles cuando el caso lo permite. Si una carga antigua necesita una clave permanente, gestiona su acceso, revisa su uso y cámbiala cuando sea necesario o se haya expuesto.

### ¿CloudTrail registra quién leyó un objeto de S3?

No en el historial básico de eventos de administración. Las operaciones sobre objetos, como leer o eliminar, son eventos de datos y deben seleccionarse explícitamente en el trail para los buckets que necesitas observar. Revisa su costo y cobertura.

### ¿GuardDuty bloquea una amenaza automáticamente?

GuardDuty genera hallazgos de amenazas potenciales. Para contener una amenaza hace falta que una persona siga un procedimiento o que configures una acción de respuesta separada, con alcance y permisos revisados.

### ¿Security Hub confirma que mi cuenta cumple una norma?

No por sí solo. Security Hub CSPM compara recursos cubiertos con controles habilitados y presenta hallazgos. El resultado no demuestra que se satisfagan todas las obligaciones legales, contractuales u organizacionales que puedan aplicarte.
