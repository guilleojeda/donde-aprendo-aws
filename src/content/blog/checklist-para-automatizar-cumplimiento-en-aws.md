---
title: "Automatizar el cumplimiento en AWS: controles, evidencia y remediación"
description: "Una guía para separar evaluación técnica, evidencia de auditoría y respuesta automática con AWS Config, Security Hub CSPM, Audit Manager y CloudTrail."
author: "guille-ojeda"
publishedAt: "2025-01-13"
publishedTimestamp: "2025-01-13T00:14:28.589Z"
modifiedTimestamp: "2026-10-05T20:34:07-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "AWS Config: reglas de cumplimiento y remediación segura"
    url: "https://dondeaprendoaws.com/blog/automatizacion-de-cumplimiento-con-aws-config/"
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"
  - title: "Cómo cifrar datos con AWS KMS: claves de datos y S3"
    url: "https://dondeaprendoaws.com/blog/cifrado-de-datos-con-aws-kms-guia-practica/"
---

Automatizar controles en AWS ayuda a detectar configuraciones que se apartan de una política y a reunir registros para revisarlas. No demuestra por sí solo que una empresa cumpla una ley, una norma o un contrato: esa conclusión depende del alcance, de controles técnicos y organizativos, y de la revisión de las personas responsables.

Para diseñar un flujo útil, separa cuatro tareas: definir qué requisito comprobar, evaluar el estado de los recursos, conservar evidencia y decidir si corresponde corregir un hallazgo. **AWS Config**, **AWS Security Hub CSPM**, **AWS Audit Manager** y **AWS CloudTrail** colaboran, pero cada uno responde a una pregunta distinta.

## Qué hace cada servicio

En móvil, desliza las tablas hacia los lados para ver todas las columnas.

| Necesidad | Servicio | Qué aporta y qué no concluye |
|---|---|---|
| Controlar quién puede realizar acciones | **AWS Identity and Access Management (IAM)** | Administra identidades, roles y permisos. Es parte de los controles preventivos; una política de IAM no evalúa por sí sola si la organización cumple un estándar. |
| Registrar y evaluar la configuración de recursos | **AWS Config** | Mantiene historial de los tipos de recursos compatibles que configuras para registrar y evalúa reglas. Un resultado COMPLIANT significa que el recurso pasó esa regla, no que toda la carga o la empresa cumpla una norma. |
| Comprobar prácticas de seguridad y reunir hallazgos | **AWS Security Hub CSPM** | Ejecuta controles de seguridad alineados con prácticas y estándares admitidos y reúne hallazgos. La mayoría de sus controles usa reglas de AWS Config, por lo que debes configurar Config y registrar los recursos correspondientes. |
| Correlacionar riesgos y gestionar respuestas | **AWS Security Hub** | Es la experiencia unificada de seguridad de AWS: correlaciona señales de CSPM y otros servicios para priorizar riesgos y apoyar flujos de respuesta. No sustituye la cobertura ni la configuración de los servicios que producen esas señales. |
| Recopilar evidencia para una evaluación | **AWS Audit Manager** | Organiza evaluaciones y recopila evidencia automatizada o manual desde fuentes compatibles, como Config, Security Hub CSPM y CloudTrail. No determina si cumples una ley ni garantiza que la evidencia alcance para una auditoría. |
| Investigar quién hizo qué | **AWS CloudTrail** | Registra actividad de la cuenta, como llamadas a las API. Ayuda a investigar cambios, pero no es un inventario del estado actual de cada recurso. |

AWS ahora distingue **Security Hub CSPM** de **AWS Security Hub**. CSPM se centra en la postura y sus controles; Security Hub correlaciona esas señales con las de otros servicios y ofrece una experiencia unificada. Materiales anteriores pueden llamar “Security Hub” al producto de postura que hoy se documenta como Security Hub CSPM. Consulta la [comparación oficial entre ambos servicios](https://docs.aws.amazon.com/securityhub/latest/userguide/what-are-securityhub-services.html) y la [introducción a Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html).

## Checklist para diseñar la automatización

### 1. Traduce el requisito en un control verificable

Escribe el requisito concreto y acuerda su interpretación con la persona responsable de cumplimiento o seguridad. Define las cuentas, regiones, tipos de recursos, excepciones justificadas, evidencia esperada y quién aprobará una corrección. Una plantilla de AWS puede servir de punto de partida, pero no sustituye este mapeo: [AWS aclara que las plantillas de muestra de *conformance packs*](https://docs.aws.amazon.com/config/latest/developerguide/conformancepack-sample-templates.html) no aseguran cumplir un estándar ni garantizan aprobar una evaluación.

### 2. Decide qué debe prevenirse y qué debe detectarse

Define si necesitas bloquear una acción antes de que ocurra o encontrarla después. IAM, las políticas de la organización y los controles del proceso de despliegue pueden formar parte de una barrera preventiva. Las reglas proactivas de AWS Config evalúan propiedades propuestas antes del despliegue, pero no impiden por sí mismas el despliegue ni remedian recursos.

### 3. Configura la cobertura antes de interpretar resultados

AWS Config registra recursos compatibles según las opciones que habilites en cada cuenta y región. Revisa la cobertura por región, el grabador, los tipos de recursos y el alcance de cada regla. Puedes agrupar reglas administradas o personalizadas en un *conformance pack*. En AWS Security Hub CSPM, habilita los estándares y controles que necesitas y verifica que Config tenga los datos requeridos; un control deshabilitado o sin recursos registrados no equivale a un control aprobado.

![Página de documentación de AWS Config con enlaces a la guía de desarrollo, la referencia de API y la CLI](/assets/blog/0d81c3fbf8511245165b47df.jpg)

La [guía de AWS Config sobre reglas y remediación](https://dondeaprendoaws.com/blog/automatizacion-de-cumplimiento-con-aws-config/) explica cómo leer evaluaciones, revisar la cobertura y probar acciones correctivas sin asumir que un agregador central instala reglas en las cuentas de origen.

### 4. Usa Audit Manager para organizar evidencia, no como veredicto

Selecciona un marco y crea una evaluación con las cuentas y controles que correspondan. Comprueba que las fuentes necesarias estén habilitadas y que el control admita la evidencia que esperas: Audit Manager puede recopilar verificaciones compatibles desde AWS Config o Security Hub CSPM, actividad de usuario desde CloudTrail, datos de configuración mediante llamadas a API y también evidencia manual.

Revisa la evidencia y completa lo que no se pueda automatizar. AWS indica que Audit Manager no evalúa el cumplimiento de la organización y que la evidencia reunida puede no incluir toda la información que pida una auditoría. Las plantillas de control también necesitan validarse contra los requisitos concretos de la organización.

### 5. Separa la actualización de hallazgos de la corrección del recurso

Las reglas de automatización de Security Hub CSPM pueden actualizar o suprimir campos de un hallazgo, por ejemplo, su severidad o estado. Para iniciar una acción sobre un recurso, configura un flujo explícito: AWS documenta el uso de Amazon EventBridge para dirigir hallazgos a destinos como Lambda, Step Functions o notificaciones. La acción correctiva y sus permisos dependen de lo que diseñes.

AWS Config también permite asociar una remediación mediante un documento de automatización de AWS Systems Manager. Puedes comenzar con ejecución manual y pasar a automática después de comprobar la lógica, el alcance y los permisos. Antes de corregir en producción, prueba con recursos controlados, conserva excepciones aprobadas, limita las acciones y confirma que el resultado volvió al estado esperado.

### 6. Comprueba cobertura, evidencia y costo

Mide qué porcentaje de los recursos dentro del alcance tiene datos y una evaluación reciente. Investiga estados como ERROR, INSUFFICIENT_DATA o la ausencia de hallazgos; ninguno demuestra por sí solo que un control pasó. Revisa también las regiones y cuentas que quedaron fuera, las excepciones, quién aprobó las remediaciones y si el recurso quedó corregido.

Antes de habilitar grabación y evaluaciones en muchas cuentas o regiones, estima el costo de los elementos de configuración, las evaluaciones y la recopilación de evidencia. Consulta los [precios de AWS Config](https://aws.amazon.com/config/pricing/), [Security Hub CSPM](https://aws.amazon.com/security-hub/cspm/pricing/) y [AWS Audit Manager](https://aws.amazon.com/audit-manager/pricing/); los servicios relacionados también pueden generar cargos.

## Ejemplo: detectar lectura pública en un bucket S3

Supón que una política interna exige que ciertos buckets no permitan lectura pública. La regla administrada [`s3-bucket-public-read-prohibited`](https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-public-read-prohibited.html) comprueba configuraciones de bloqueo de acceso público, políticas de bucket y ACL. Su resultado cubre lo que evalúa esa regla; no determina si el conjunto de obligaciones de privacidad o protección de datos está satisfecho.

AWS Config puede detectar el estado del bucket. Security Hub CSPM puede mostrar hallazgos de controles compatibles si habilitaste el control y su cobertura. Audit Manager puede recopilar evidencia para un control con fuentes admitidas, que una persona revisará y complementará según lo requiera el proceso de auditoría. CloudTrail ayuda a investigar qué actividad modificó la política; su [historial de eventos](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html) muestra 90 días de eventos de administración por región. Para guardar un registro continuo o incluir otros tipos de eventos, configura un *trail* o un almacén de datos de eventos con la selección y retención requeridas.

Si decides corregir el hallazgo, verifica primero que el acceso público no sea intencional ni necesario para una aplicación. Después prueba una remediación acotada y comprueba su efecto. Un flujo que activa una acción al detectar cada incumplimiento sin revisar el contexto puede interrumpir un servicio legítimo.

Si el control que necesitas trata sobre cifrado, consulta también la [guía práctica de AWS KMS](https://dondeaprendoaws.com/blog/cifrado-de-datos-con-aws-kms-guia-practica/); cifrado y acceso público son controles diferentes y requieren verificaciones propias.

## Documentación y recursos para seguir aprendiendo

La documentación oficial explica el alcance y las condiciones de cada servicio:

- [Cómo funciona AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/how-does-config-work.html), [modos de evaluación](https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config_components.html) y [plantillas de *conformance packs*](https://docs.aws.amazon.com/config/latest/developerguide/conformancepack-sample-templates.html).
- [AWS Audit Manager](https://docs.aws.amazon.com/audit-manager/latest/userguide/what-is.html) y [cómo recopila evidencia](https://docs.aws.amazon.com/audit-manager/latest/userguide/how-evidence-is-collected.html).
- [Eventos de AWS CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-events.html) y [respuesta automatizada a hallazgos de Security Hub CSPM con EventBridge](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-cloudwatch-events.html).

Para ver explicaciones comunitarias, la charla [AWS Audit Manager: Automatiza y Simplifica la Auditoría en la Nube](https://www.youtube.com/watch?v=N-9cJGwEE1Q), publicada en 2025 por el [canal de AWS Women Colombia](https://www.youtube.com/@awswomencolombia), presenta el servicio como tema central. La sesión [Cumplimiento con AWS Security Hub](https://www.youtube.com/watch?v=e2W6tTO6USc), del mismo canal, es de 2024: puede servir como introducción, pero contrasta sus nombres y pasos con la documentación actual de Security Hub CSPM y Security Hub.

La comunidad [AWS Security Users Group LatAm en Meetup](https://www.meetup.com/awssecuritylatam/) se describe como un espacio en español dedicado a seguridad en AWS; su [canal de YouTube](https://www.youtube.com/@AWSSecurityLATAM) reúne grabaciones para profundizar en seguridad y respuesta. Meetup mostraba actividades anteriores, sin un próximo encuentro visible durante esta revisión; consulta la agenda antes de planificar una asistencia.

En Ecuador, el sitio de [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/) enlaza sus sesiones y actividades. Su ficha de Meetup anuncia el encuentro virtual [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) para el **20 de octubre de 2026, de 19:00 a 20:00, hora de Ecuador (UTC−5)**. La ficha indicaba el evento como programado al revisarla; verifica allí inscripción, cupos y condiciones antes de asistir. Para buscar grupos o actividades de otros países, explora el [directorio de comunidades AWS](https://dondeaprendoaws.com/comunidades/) y el [calendario de eventos](https://dondeaprendoaws.com/eventos/).
