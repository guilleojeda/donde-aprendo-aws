---
title: "Automatizar AWS Security Hub: reglas V1/V2 y remediación segura"
description: "Guía para automatizar hallazgos de AWS Security Hub con EventBridge, distinguir reglas V1/V2 y separar una actualización del hallazgo de la remediación del recurso."
author: "guille-ojeda"
publishedAt: "2025-05-05"
publishedTimestamp: "2025-05-05T06:01:04.872000+00:00"
modifiedTimestamp: "2026-10-05T20:43:59-03:00"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Cómo conectar alarmas de CloudWatch con EventBridge"
    url: "https://dondeaprendoaws.com/blog/cloudwatch-y-eventbridge-integracion/"
---

AWS Security Hub ayuda a reunir y analizar hallazgos de seguridad. Eso no significa que una regla de automatización cambie por sí sola una política de IAM, el bloqueo público de un bucket S3 o las reglas de un grupo de seguridad. La regla modifica datos del hallazgo; para cambiar un recurso hace falta conectar el evento con una acción externa, como un runbook de AWS Systems Manager Automation o una función Lambda.

La diferencia importa cuando buscas cómo automatizar políticas con AWS Security Hub: primero define qué hallazgo debe activar una respuesta y qué cambio concreto se autoriza. Después valida ambos por separado.

## Security Hub CSPM V1 y Security Hub V2 usan formatos distintos

CSPM significa gestión de la postura de seguridad en la nube. La documentación de AWS mantiene dos rutas de automatización, con formatos y APIs distintos:

| Ruta | Formato del hallazgo | API de reglas | Evento de EventBridge |
| --- | --- | --- | --- |
| Security Hub CSPM, reglas V1 | AWS Security Finding Format (ASFF), con campos como `Severity.Label` y `Workflow.Status` | `CreateAutomationRule` | `Security Hub Findings - Imported` |
| Security Hub, reglas V2 | Open Cybersecurity Schema Framework (OCSF), con campos como `severity` y `status` | `CreateAutomationRuleV2` | `Findings Imported V2` |

Las reglas V1 actualizan campos de los hallazgos de Security Hub CSPM. Las reglas V2 hacen lo mismo sobre hallazgos OCSF de Security Hub. Para lanzar una respuesta fuera del servicio, ambos caminos pueden usar EventBridge y un destino. No copies criterios ni patrones ASFF a una integración V2: comprueba el formato y el tipo de evento que produce la configuración que tienes habilitada.

- [Automatización en Security Hub](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-v2-automations.html) explica la diferencia entre actualizar hallazgos y ejecutar respuestas o remediaciones con EventBridge.
- Para la ruta V1, consulta [las reglas de automatización de Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/automation-rules.html).
- Para la ruta V2, consulta [las reglas de automatización de Security Hub](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-v2-automation-rules.html), que filtran atributos OCSF.
- AWS describe las diferencias entre [ASFF](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html) y [OCSF](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-ocsf.html).

Cada generación también tiene estados diferentes. En Security Hub CSPM, el estado de una regla puede ser `ENABLED` o `DISABLED`; `Workflow.Status` describe la revisión del hallazgo y admite `NEW`, `NOTIFIED`, `RESOLVED` y `SUPPRESSED`. En Security Hub V2, el atributo `status` del hallazgo incluye estados como `New`, `In Process`, `Resolved` y `Suppressed`. No confundas el estado de la regla con el del hallazgo, ni el del hallazgo con el estado real del recurso. `Suppressed` significa que no se requiere una acción sobre ese hallazgo; no aplica una corrección. Confirma el cambio en el recurso antes de marcar un hallazgo como resuelto.

También revisa el alcance antes de habilitar reglas. Las reglas V1 se crean para cada región donde deben aplicarse, desde la cuenta administradora de Security Hub CSPM. Las reglas V2 pueden crearse en la región principal de agregación y aplicarse a sus regiones vinculadas; las regiones sin vínculo necesitan su propia regla. En la consola, examina la vista previa de los hallazgos coincidentes y verifica las cuentas, regiones y recursos incluidos.

## Diseña el recorrido de la detección a la corrección

Una regla nativa de Security Hub es opcional si solo quieres filtrar y enrutar eventos. Úsala cuando necesites actualizar metadatos del hallazgo —por ejemplo, severidad, nota o estado de revisión— o crear un ticket. EventBridge puede seleccionar directamente los hallazgos de Security Hub y llamar a un destino externo. Ninguna de esas reglas cambia por sí sola una política de IAM, un bucket S3 o un grupo de seguridad.

Separa tres trabajos:

1. **Filtrar:** el patrón de EventBridge elige atributos estables del evento, como cuenta, región, recurso, tipo o gravedad. Si una regla de Security Hub V1/V2 ya modificó el hallazgo, EventBridge recibe y evalúa esa versión actualizada.
2. **Decidir:** empieza con una notificación o una cola para revisar coincidencias. Cuando el alcance esté validado, puedes dirigir el evento a Systems Manager Automation, Lambda, Step Functions u otro destino compatible.
3. **Actuar y comprobar:** el destino ejecuta el cambio con sus propios permisos. Verifica después el recurso y actualiza el hallazgo solo cuando exista evidencia de que la corrección funcionó.

Para una acción sensible —aislar una instancia, revocar una clave o modificar permisos— conserva una aprobación humana y un camino de recuperación. Un cambio de IAM puede quitar acceso a quienes operan la cuenta; una regla de red puede interrumpir la carga o el propio canal de respuesta. Systems Manager Automation admite el paso `aws:approve`; AWS documenta que ese paso no está disponible para automatizaciones multicuenta y multirregión. Consulta [cómo invocar Automation desde EventBridge](https://docs.aws.amazon.com/systems-manager/latest/userguide/running-automations-event-bridge.html) y los requisitos de [aprobación en runbooks](https://docs.aws.amazon.com/systems-manager/latest/userguide/automation-action-approve.html).

El rol de EventBridge y el rol de ejecución del runbook tienen responsabilidades distintas. Limita el primero a invocar el destino concreto y al segundo a las acciones necesarias sobre los recursos previstos; AWS explica los [roles IAM para destinos de EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-events-iam-roles.html). Una función Lambda también debe tener permisos mínimos y validar cuenta, región e identificadores del evento. Evita permisos administrativos generales y decisiones basadas solo en textos variables como el título del hallazgo.

Una actualización del hallazgo puede generar otro evento. Si la acción cambia la configuración y el proveedor vuelve a publicar el hallazgo, la regla podría ejecutarse de nuevo. Haz que el patrón solo coincida cuando exista una condición insegura y que la acción pueda repetirse sin producir un daño adicional. Security Hub V2 aplica sus reglas de automatización antes de que EventBridge reciba el evento; un patrón que espera `New` no coincidirá si una regla previa ya cambió `status` a `Suppressed`.

Para revisar el enrutamiento de eventos, puedes consultar [cómo conectar alarmas de CloudWatch con EventBridge](/blog/cloudwatch-y-eventbridge-integracion/). Aquí usamos un patrón de Security Hub V2 y un evento sintético para probar solo la coincidencia.

### Prueba el patrón V2 con JSON sintético

Guarda estos objetos como `pattern.json` y `event.json`. El patrón selecciona hallazgos críticos con estado `New` en eventos `Findings Imported V2`:

~~~json
{
  "source": ["aws.securityhub"],
  "detail-type": ["Findings Imported V2"],
  "detail": {
    "findings": {
      "severity": ["Critical"],
      "status": ["New"]
    }
  }
}
~~~

~~~json
{
  "version": "0",
  "id": "synthetic-event-1",
  "source": "aws.securityhub",
  "account": "111122223333",
  "time": "2026-09-01T12:00:00Z",
  "region": "us-east-1",
  "resources": ["synthetic-finding-1"],
  "detail-type": "Findings Imported V2",
  "detail": {
    "findings": [
      {
        "severity": "Critical",
        "status": "New"
      }
    ]
  }
}
~~~

Con AWS CLI configurado, prueba la coincidencia entre ambos archivos:

~~~bash
aws events test-event-pattern \
  --event-pattern file://pattern.json \
  --event file://event.json \
  --region us-east-1
~~~

El comando devuelve un booleano que indica si el patrón coincide con el evento sintético. Solo prueba el patrón; no crea una regla ni ejecuta un destino. Requiere permiso `events:TestEventPattern`. El ejemplo no representa un hallazgo OCSF completo. Antes de asociar un destino, compara los campos con un evento real de tu ruta V2 y acota el patrón a la cuenta, región, recursos y estados autorizados.

### Valida la entrega antes de habilitar una respuesta

La prueba anterior no comprueba permisos ni entrega al destino. Si vas a probar una integración en una cuenta de prueba autorizada, crea una regla propia en el bus predeterminado y en la región donde Security Hub publica los hallazgos. Asigna primero un destino de observación —por ejemplo, una cola o notificación de prueba—, concede solo los permisos que necesita y comprueba que llegan los eventos esperados. Revisa las métricas `Invocations` y `FailedInvocations` de la regla en [CloudWatch](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-monitoring.html). No conectes el runbook que modifica recursos hasta validar la coincidencia, los permisos y la entrega con un hallazgo controlado; entonces puedes añadir la acción sensible con la aprobación prevista. Si no dispones de un entorno aislado, detente en la prueba sintética.

Al terminar, deshabilita tu regla de prueba. Si vas a eliminarla, primero retira sus destinos y luego borra la regla; elimina también los recursos temporales que ya no necesites. No borres reglas administradas por AWS: podrían pertenecer a otro servicio. Consulta el procedimiento de [deshabilitar o eliminar reglas](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-delete-rule.html).

### Comprueba estados, fallos y efectos secundarios

Antes de activar una respuesta:

- Si usas una regla nativa de Security Hub, revisa la vista previa de hallazgos; para EventBridge, prueba el patrón con eventos válidos y no válidos. Descarta cuentas o recursos fuera del alcance previsto.
- Decide qué significa cada estado para tu equipo. `SUPPRESSED` no equivale a corregido, y un estado `RESOLVED` no reemplaza la verificación del recurso.
- Si varias reglas pueden modificar el mismo campo, revisa su orden: la regla que se aplica al final determina el valor.
- Simula los casos válidos y no válidos con el patrón de EventBridge. Una regla que detecta cualquier cambio y vuelve a cambiar el mismo recurso puede crear un bucle.
- Registra quién aprobó una acción sensible, qué recurso cambió y cómo se confirmó la corrección.

La [documentación de eventos de Security Hub V2](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-v2-cwe-event-formats.html) describe el formato `Findings Imported V2`; la [configuración de reglas para EventBridge](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-v2-cwe-event-rules.html) muestra cómo crear el filtro y asignar un destino. En V1, revisa los [tipos de evento de Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-cwe-integration-types.html) y cómo [configurar un patrón para hallazgos](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-cwe-all-findings.html).

Calcula el costo con las tarifas de tu cuenta y región antes de habilitar el flujo. Security Hub CSPM cobra según sus dimensiones de comprobaciones, ingesta de hallazgos y evaluaciones de reglas; Security Hub también ofrece un [estimador de costos](https://docs.aws.amazon.com/securityhub/latest/userguide/security-hub-cost-estimator.html). Systems Manager Automation cobra por pasos ejecutados y duración de `aws:executeScript` (la [página de precios](https://aws.amazon.com/systems-manager/pricing/) publica las tarifas vigentes). EventBridge no cobra por las reglas en sí, pero el tipo y volumen de eventos, la entrega entre cuentas y el destino pueden cambiar la factura; Lambda, por ejemplo, factura solicitudes y duración según sus [precios](https://aws.amazon.com/lambda/pricing/). Consulta también los [precios de EventBridge](https://aws.amazon.com/eventbridge/pricing/) y de [Security Hub CSPM](https://aws.amazon.com/security-hub/cspm/pricing/).

## Recursos y comunidades de seguridad AWS

Para ver una implementación basada en código, el catálogo incluye una [demo de respuesta automática a incidentes de seguridad en AWS](https://github.com/kevinlupera/aws-incident-response-security-ecuador-demo). Su README describe un flujo con GuardDuty, Security Hub, EventBridge y Lambda que aísla recursos EC2 o claves IAM, además de crear infraestructura con CDK. Úsalo para estudiar el diseño y revisa los efectos antes de ejecutar sus instrucciones.

Antes de automatizar un hallazgo, conviene decidir qué riesgo atender primero. Este artículo de AWS Builder explica cómo [priorizar hallazgos de exposición correlacionados en Security Hub](https://builder.aws.com/content/3J68Uuk6l1ZpaDLRRB6IRaESaRk/hallazgos-de-exposicin-en-aws-security-hub-cmo-elegir-qu-riesgo-correlacionado-atender-primero); se centra en priorización, no en una receta para cambiar recursos.

El canal regional de [AWS Security Users Group LatAm](https://www.youtube.com/@AWSSecurityLATAM) reúne sesiones en español. En el catálogo figuran, entre otras, la charla [Nadie apretó un botón](https://www.youtube.com/watch?v=kiz4Ls7YRm0) y una sesión de [AWS Women Colombia](https://awswomencolombia.com/) titulada [El Ataque del Nivel 200: Cumplimiento con AWS Security Hub](https://www.youtube.com/watch?v=e2W6tTO6USc). Para profundizar en Systems Manager, el catálogo también registra [Automatiza tus tareas de Seguridad con AWS Systems Manager Documents](https://www.youtube.com/watch?v=fFcoFODfNXo), publicada por AWS User Group Guatemala.

Puedes consultar y participar en comunidades dedicadas a AWS y seguridad en [Ecuador](https://www.awssecurityecuador.com/) y en [Meetup](https://www.meetup.com/aws-user-group-security-ecuador/), [Argentina](https://www.meetup.com/aws-security-usergroup-argentina/), [Colombia](https://www.meetup.com/aws-user-group-security-colombia/) y [Perú y la región](https://www.meetup.com/awssecuritylatam/). En Paraguay, el [anuncio de lanzamiento de AWS Security User Group Paraguay](https://es.linkedin.com/posts/aws-security-user-group-paraguay_aws-cloudsecurity-paraguay-activity-7500886396916731905-Xgar) enlaza su [grupo oficial de WhatsApp](https://chat.whatsapp.com/L0fYZQj5dpJFMZxPhVkIXZ). El [blog Road to CloudSec LATAM](https://roadtocloudsec.la/) también publica casos de seguridad y automatización en AWS. Revisa cada página para confirmar sus actividades vigentes.

Al 5 de octubre de 2026, la página de Meetup del AWS User Group Security Ecuador lista un encuentro virtual para el 20 de octubre, de 19:00 a 20:00 GMT-5: [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/). La ficha menciona controles automatizados, detección de desviaciones en credenciales IAM y remediación con servicios nativos de AWS; no afirma que sea una sesión específica de Security Hub ni informa un precio. Consulta la página para ver la inscripción y los detalles vigentes. Para encontrar otros encuentros de AWS en la región, revisa la [agenda comunitaria de eventos](https://dondeaprendoaws.com/eventos/).

Si buscas un encuentro presencial para conversar con otras personas que trabajan con AWS, el [AWS Community Day Paraguay](https://www.awscommunitydayparaguay.com/) anuncia una jornada general de charlas y talleres para el 17 de octubre de 2026, de 08:00 a 18:00, en el SNPP de San Lorenzo. Es una oportunidad para compartir experiencias y conocer la comunidad; consulta el registro y la agenda publicada para elegir las actividades que te interesen.

AWS Security Hub es útil para ordenar y enrutar hallazgos. La corrección real depende del destino, sus permisos, el alcance de la acción y la verificación posterior. Mantener separadas esas etapas evita que una alerta se convierta, sin revisión, en un cambio que bloquee una carga de trabajo.
