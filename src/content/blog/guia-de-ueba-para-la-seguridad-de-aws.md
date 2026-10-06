---
title: "UEBA en AWS: GuardDuty, CloudTrail y análisis del comportamiento"
description: "UEBA en AWS es un enfoque, no un servicio. Aprende qué detecta GuardDuty y cómo investigar actividad de identidad con CloudTrail e IAM Identity Center."
author: "guille-ojeda"
publishedAt: "2024-04-29"
publishedTimestamp: "2024-04-29T00:07:13.97Z"
modifiedTimestamp: "2026-10-06T15:59:00-03:00"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related: []

---

**UEBA** (*User and Entity Behavior Analytics*, análisis del comportamiento de usuarios y entidades) describe una forma de buscar actividad que se aparta de lo esperado para una identidad, una carga de trabajo o un recurso. No es el nombre de un servicio nativo de AWS ni una función que se active con un único ajuste.

En AWS, puedes combinar hallazgos de **Amazon GuardDuty**, eventos de **AWS CloudTrail**, contexto de **IAM e IAM Identity Center** y una plataforma de análisis propia o de terceros. Esas piezas aportan señales distintas. GuardDuty tiene detecciones de anomalías basadas en aprendizaje automático para determinados tipos de hallazgo, pero no equivale por sí solo a una solución UEBA general ni garantiza que toda actividad inusual produzca una alerta.

## Qué aporta cada servicio al análisis de comportamiento

- **Amazon GuardDuty:** genera hallazgos de amenazas. En los tipos cuyo nombre termina en `AnomalousBehavior`, su modelo de aprendizaje automático identifica solicitudes API inusuales según factores como la identidad, la ubicación y la API. Es una señal de detección, no una explicación de la intención de la persona ni una garantía de detectar cualquier anomalía.
- **AWS CloudTrail:** aporta eventos para reconstruir qué solicitud se hizo, cuándo, desde qué IP y con qué identidad o sesión. Event history tiene cobertura y consultas limitadas; los eventos de datos, como leer un objeto S3, requieren configuración explícita.
- **IAM e IAM Identity Center:** aportan el contexto de permisos de usuarios, roles y sesiones. Una sesión de rol no siempre identifica directamente a una persona: hay que correlacionar el evento con el directorio, el proveedor de identidad y la asignación de permisos.
- **AWS Security Hub CSPM:** evalúa configuraciones frente a controles y estándares de seguridad y recibe hallazgos de servicios integrados, como GuardDuty. Evalúa la postura; no establece una línea base de comportamiento de usuarios.
- **AWS Security Hub:** correlaciona señales de postura, vulnerabilidades, amenazas y datos sensibles para priorizar exposiciones y organizar la respuesta. Depende de sus fuentes habilitadas y tampoco es un motor UEBA de identidades.

La documentación de GuardDuty explica que los hallazgos `AnomalousBehavior` comparan solicitudes API con el comportamiento perfilado de la cuenta y de la identidad. En sus detalles puedes revisar qué API fue la principal, otras llamadas cercanas y qué factores se marcaron como inusuales. En este contexto, «inusual» puede significar que el modelo no había observado ese patrón para la identidad durante su periodo de entrenamiento; no demuestra que la operación sea maliciosa ni que se haya detectado toda conducta anómala. Consulta [cómo GuardDuty presenta el comportamiento anómalo](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings-summary.html).

La documentación actual distingue **AWS Security Hub CSPM** de **AWS Security Hub**. CSPM evalúa configuraciones y reúne hallazgos de fuentes integradas; Security Hub recibe los hallazgos de CSPM y los correlaciona con otras señales —por ejemplo, de GuardDuty o Inspector— para priorizar exposiciones y responder. Ninguno establece por sí solo una línea base de comportamiento de cada usuario. Consulta la [explicación actual de ambos servicios](https://docs.aws.amazon.com/securityhub/latest/userguide/what-are-securityhub-services.html) y la [introducción a Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html).

GuardDuty también ofrece **Custom Detection Rules**: una biblioteca de reglas predefinidas que permite señalar acciones de administración inesperadas en cuentas concretas. En modo *dry run*, evalúa eventos de CloudTrail y emite métricas sin crear hallazgos; ese modo caduca a los 14 días. Son reglas mantenidas por GuardDuty para eventos de administración, no un motor general de perfiles de usuario ni reglas libres para eventos de datos como `GetObject`. Revisa la [documentación de Custom Detection Rules](https://docs.aws.amazon.com/guardduty/latest/ug/custom-detection-rules.html) y el [anuncio de disponibilidad y alcance](https://aws.amazon.com/about-aws/whats-new/2026/09/guardduty-optional-detection-rules/). Una [guía en español de AWS Builder Center](https://builder.aws.com/content/3JLNouyvKVW2fDRLGzMd72WHwff/amazon-guardduty-custom-detection-rules-definir-que-actividad-es-sospechosa-en-tus-cuentas) muestra cómo elegir y medir estas reglas; contrasta sus pasos con la documentación vigente antes de cambiar una cuenta.

Otro tipo de hallazgo es una **secuencia de ataque**: GuardDuty correlaciona señales débiles y hallazgos cuando su orden coincide con ciertos patrones de compromiso. Esto ayuda a investigar varios indicios relacionados, pero cubre escenarios definidos por GuardDuty y no equivale a una línea base UEBA de toda identidad. Consulta los [tipos de hallazgo de secuencia de ataque](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-attack-sequence-finding-types.html) y el [runbook de triaje en español publicado en AWS Builder Center](https://builder.aws.com/content/3J68JRbkTcnENVoKrtfk44wFHBD/secuencias-de-ataque-en-amazon-guard-duty-un-runbook-de-triaje-para-el-hallazgo-critical-que-correlaciona-el-resto); los datos que cubre cada secuencia dependen de sus fuentes y planes de protección.

## Cómo investigar una señal de comportamiento de IAM

Supongamos que GuardDuty genera un hallazgo de comportamiento anómalo para una sesión de rol y, al revisar CloudTrail, encuentras una llamada `AttachRolePolicy` en el mismo periodo. La llamada puede corresponder a un cambio aprobado o a una actividad sospechosa. El nombre de la API, por sí solo, no permite decidir cuál.

1. **Registra el contexto del hallazgo.** Anota el ID y el tipo del hallazgo, la cuenta y región, la hora, el recurso o principal implicado, la API señalada y los factores que GuardDuty describe como inusuales. Conserva el hallazgo original para que el equipo pueda volver a consultarlo.
2. **Busca los eventos cercanos en CloudTrail.** Revisa el nombre del evento, el servicio, `sourceIPAddress`, `userAgent`, `requestParameters`, el resultado y el bloque `userIdentity`. Comprueba si la llamada aparece en la región y el intervalo de tiempo correctos, y busca cambios relacionados antes y después.
3. **Relaciona la sesión con la identidad y sus permisos.** Si `userIdentity.type` es `AssumedRole`, `sessionContext.sessionIssuer` describe el rol asociado a esas credenciales temporales. Cuando CloudTrail registra una llamada hecha en nombre de un usuario de IAM Identity Center, `userIdentity.onBehalfOf` puede incluir su `userId` y el ARN del almacén de identidades. Correlaciona esos campos con el directorio y pide a la persona administradora que confirme qué conjunto de permisos se asignó a esa identidad en esa cuenta.
4. **Contrasta la actividad con el trabajo autorizado.** Pregunta al responsable del cambio o revisa el ticket, la automatización de despliegue y la política efectiva del rol. Compara la región, el origen, la API y el horario con el uso esperado. Una acción legítima poco frecuente puede ser nueva para el perfil de GuardDuty.
5. **Decide y deja registro.** Si no puedes explicar una ampliación de permisos o la actividad no fue autorizada, sigue el procedimiento de respuesta a incidentes de tu organización. Si confirmas que era un cambio legítimo, documenta el motivo y evalúa si hace falta ajustar una regla de notificación. No suprimas hallazgos en lote solo para reducir ruido.

GuardDuty tiene además **Investigation (preview)**, un análisis asistido que puede reunir contexto relacionado con un hallazgo y ofrecer evidencia y recomendaciones. No remedia el recurso, y AWS indica que los análisis generados pueden ser erróneos o incompletos: revísalos con una persona analista. La función sigue en vista previa y tiene regiones y cuotas limitadas; consulta la [documentación actual de GuardDuty Investigation](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-investigation.html) antes de planificar su uso. Este [runbook en español de AWS Builder Center](https://builder.aws.com/content/3IxlSCJHWWEoMV3Ufj9pF0A8eW7/runbook-de-triage-con-el-agente-de-investigacion-de-amazon-guard-duty-preview) describe el flujo y sus permisos como una ayuda para el triage, no como sustituto de la investigación humana.

En eventos de IAM Identity Center, `onBehalfOf` ayuda a identificar al usuario, pero no describe por sí solo todas las acciones permitidas. Un conjunto de permisos es una colección de políticas asignada a usuarios o grupos para acceder a una cuenta; IAM Identity Center crea roles controlados por el servicio con esas políticas. Revisa la asignación y las políticas efectivas antes de concluir que una API estaba dentro o fuera del alcance. Consulta [cómo CloudTrail registra la identidad de IAM Identity Center](https://docs.aws.amazon.com/singlesignon/latest/userguide/sso-cloudtrail-use-cases.html) y [cómo los conjuntos de permisos conceden acceso a cuentas](https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html). Para una explicación práctica de Organizations, conjuntos de permisos y asignaciones de usuarios, Diana Alfaro publicó esta [guía de IAM Identity Center](https://blog.alfalfita.cloud/configurando-nuestro-entorno-de-trabajo-con-aws-organization-y-aws-identity-center) en 2023. Su sección final de AWS CLI usa `aws configure`; verifica ese paso con la [guía actual de inicio de sesión SSO de AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html) antes de configurarlo.

## Qué eventos puedes ver y qué tienes que habilitar

El **Event history de CloudTrail** permite buscar los últimos 90 días de eventos de administración en una región. Está limitado a una cuenta y región por consulta, y solo permite filtrar por un atributo más el periodo. No muestra eventos de datos ni reemplaza un registro de seguimiento (*trail*) o un almacén de datos de eventos para conservar y consultar actividad durante más tiempo. Revisa las [limitaciones de Event history](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html) antes de usarlo como único registro de auditoría.

Para una introducción en español, puedes leer el artículo histórico de [AWS Women Colombia sobre CloudTrail](https://awswomencolombia.com/100diasdeaws-dia-7-cloudtrail), actualizado en 2023. Repasa Event history, trails e Insights; usa la documentación actual citada aquí para verificar alcance, regiones y tipos de eventos antes de configurar la cuenta. Si prefieres una explicación en video más amplia, esta [sesión de AWS Women Colombia recorre CloudWatch, CloudTrail, X-Ray y Config](https://www.youtube.com/watch?v=TfBZFzGokQM); abarca observabilidad general y no se centra en atribuir una llamada API a una identidad.

Los eventos de datos de S3 —por ejemplo, `GetObject`— no se registran por defecto en trails ni en event data stores. Si tu investigación requiere saber quién leyó un objeto, habilita los eventos de lectura para los buckets o prefijos necesarios y confirma que el alcance cubre la cuenta y región pertinentes. La configuración selectiva importa: una búsqueda vacía no demuestra que no hubo acceso si CloudTrail no registraba ese tipo de evento. La guía de [CloudTrail para registrar eventos de datos](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html) detalla los selectores disponibles y los posibles cargos.

GuardDuty consume por su cuenta un flujo independiente de eventos de administración de CloudTrail para sus detecciones; no cambia la configuración ni la retención de tus trails. Tener un hallazgo en GuardDuty, por tanto, no significa que ya tengas un archivo de auditoría propio con el alcance y el periodo que tu investigación necesita. Consulta las [fuentes de datos fundamentales de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_data-sources.html).

Los hallazgos nuevos de GuardDuty se publican en Amazon EventBridge. Para enviarlos a correo, chat, un sistema de tickets o una función de respuesta, debes crear una regla y configurar su destino; la publicación de un hallazgo no aísla recursos ni revoca permisos por sí sola. Antes de automatizar una acción, valida el filtro, los permisos y el efecto en las cargas de trabajo. La guía de [procesamiento de hallazgos de GuardDuty con EventBridge](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings_eventbridge.html) explica este flujo.

Para ver una integración comunitaria con un SIEM, AWS User Group CreaTicas grabó una [charla sobre GuardDuty y SIEM](https://www.youtube.com/watch?v=CQUICC2h0Oc). La grabación de [un meetup de AWS User Group Panamá](https://www.youtube.com/watch?v=B0ns55LItRs) incluye primero una charla sobre detección y respuesta con GuardDuty y luego otra sobre DMS y Athena. Gerardo Castro también publicó [diapositivas sobre detección y respuesta con GuardDuty](https://speakerdeck.com/gerardokaztro/como-detectar-y-responder-amenazas-con-aws-guardduty) en 2021; son un repaso visual histórico, así que valida nombres, integraciones y pasos con la documentación actual.

El [repositorio de una demo de respuesta a incidentes](https://github.com/kevinlupera/aws-incident-response-security-ecuador-demo) conecta GuardDuty, Security Hub, EventBridge, Lambda y SNS, incluida una acción que aísla un recurso. Es código de demostración: su README dice que los hallazgos de prueba son sintéticos y que el aislamiento automático requiere aprobación humana en producción. Revísalo como ejemplo de arquitectura y confirma las políticas, permisos y servicio de Security Hub que despliega; no lo tomes como una respuesta lista para aplicar a una cuenta real.

## UEBA no sustituye la evidencia de red

El análisis de comportamiento de identidad parte de eventos de acceso y del contexto de quién asumió una sesión y con qué permisos. Si la investigación también necesita inspeccionar paquetes de red, **VPC Traffic Mirroring** permite copiar tráfico seleccionado hacia un destino de análisis. Esa observación de red puede aportar otro contexto, pero no identifica por sí sola a la persona que hizo una llamada a la API. Para esa perspectiva complementaria, consulta nuestra [guía de VPC Traffic Mirroring en AWS](/blog/guia-de-mejores-practicas-para-vpc-traffic-mirroring-en-aws/).

## Comunidades y recursos para seguir aprendiendo

- [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/) comparte contenido de seguridad en AWS para personas hispanohablantes. Es un grupo independiente; su página publica sus actividades y eventos.
- [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/) reúne material y actividades comunitarias sobre seguridad en la nube de AWS, con temas como IAM, GuardDuty y respuesta a incidentes.
- Al 6 de octubre de 2026, el [AWS Community Day Panamá: Security & Data Edition 2026](https://www.meetup.com/aws-user-group-panama/events/316732293/) está anunciado para el 14 de noviembre. La página todavía no publica la sede, así que confirma allí los detalles antes de planificar la asistencia.

Para encontrar otros encuentros, consulta la [agenda de eventos de las comunidades AWS](/eventos/).

Al compartir una consulta en una comunidad, describe la API, la región, la hora aproximada y el tipo de identidad. Redacta los datos sensibles y no publiques claves, tokens ni credenciales.

## Preguntas frecuentes sobre UEBA en AWS

### ¿UEBA es un servicio de AWS?

No. UEBA es un enfoque de análisis del comportamiento. AWS ofrece detecciones de anomalías en GuardDuty y servicios que aportan registros o consolidan hallazgos, pero esas funciones no son un servicio general con el nombre UEBA.

### ¿GuardDuty reemplaza a CloudTrail?

No. GuardDuty usa un flujo independiente de eventos de administración para sus detecciones. CloudTrail Event history, trails y event data stores cubren necesidades de consulta, selección y retención de auditoría; configura la opción que corresponda a los datos que necesitas conservar.

### ¿Puedo ver accesos a objetos S3 en Event history?

No. Event history muestra eventos de administración, no eventos de datos como `GetObject`. Para investigar lecturas de objetos, configura y verifica eventos de datos de S3 en un trail o event data store antes de necesitar esa evidencia.

### ¿Una anomalía significa que una cuenta fue comprometida?

No necesariamente. GuardDuty marca actividad que difiere de su comportamiento perfilado; una tarea legítima, una migración o una ubicación nueva también pueden ser inusuales. Confirma la actividad con el responsable y la evidencia de CloudTrail antes de clasificar el incidente o automatizar una respuesta.
