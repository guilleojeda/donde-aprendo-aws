---
title: "AWS Config: reglas de cumplimiento y remediación segura"
description: "Aprende qué registra AWS Config, cómo evaluar reglas y conformance packs, y cómo revisar una remediación con Systems Manager antes de automatizarla."
author: "guille-ojeda"
publishedAt: "2025-01-09"
publishedTimestamp: "2025-01-09T00:16:49.41Z"
modifiedTimestamp: "2026-10-05T00:15:04-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related: []
---

AWS Config registra la configuración de los recursos de AWS que seleccionas y evalúa reglas sobre esos datos. Así puedes consultar cambios anteriores y detectar recursos que no coinciden con una política. La evaluación no corrige el recurso por sí sola: si quieres aplicar un cambio, AWS Config puede invocar una automatización de Systems Manager, pero primero conviene revisar el hallazgo, el alcance y el efecto de esa acción.

Esta guía explica qué configurar, cómo elegir y leer las reglas, y cómo probar una remediación con aprobación antes de considerar la ejecución automática. La conformidad que informa una regla describe su resultado técnico; no equivale a una certificación ni demuestra por sí sola que una organización cumple una ley o un estándar.

## Qué hace AWS Config y qué hacen otros servicios

AWS Config crea elementos de configuración para los tipos de recursos compatibles que registra. Cada elemento representa un estado puntual; el historial ayuda a ver cómo cambió un recurso y qué relaciones tiene con otros. Las reglas comparan esa información con los criterios que defines. Para empezar, consulta la [guía oficial sobre cómo funciona AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/how-does-config-work.html).

| Servicio | Pregunta que ayuda a responder |
|---|---|
| AWS Config | ¿Qué configuración tiene o tuvo este recurso? ¿Cumple la regla que definí? |
| AWS CloudTrail | ¿Qué actividad o llamada a la API ocurrió en la cuenta, y quién la realizó? [CloudTrail registra eventos de actividad](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-events.html). |
| AWS Security Hub CSPM | ¿Qué hallazgos de seguridad y resultados de controles conviene reunir y priorizar? [Security Hub CSPM consolida información de seguridad](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html); usa AWS Config para muchos de sus controles. |
| AWS Control Tower | ¿Cómo establecer y gobernar un entorno de varias cuentas con controles preventivos, detectivos y proactivos? [Control Tower organiza una landing zone de varias cuentas](https://docs.aws.amazon.com/controltower/latest/userguide/what-is-control-tower.html). |

Estos servicios pueden integrarse, pero no son equivalentes. Por ejemplo, una regla de Config puede detectar una configuración después de un cambio; no sustituye el registro de actividad de CloudTrail ni, por sí sola, impide que alguien cree el recurso.

Para comparar Config con CloudTrail, CloudWatch y X-Ray, puedes ver la charla grabada en 2021 [La Amenaza del Nivel 100: Amazon CloudWatch, AWS CloudTrail, AWS X-Ray y AWS Config](https://www.youtube.com/watch?v=TfBZFzGokQM), del canal [AWS Women Colombia](https://www.youtube.com/@awswomencolombia). Es una introducción general; confirma los detalles actuales en la documentación oficial.

Security Hub CSPM complementa la evaluación de configuración con hallazgos y controles de seguridad. Para conocer ese servicio por separado, consulta la charla [El Ataque del Nivel 200: Cumplimiento con AWS Security Hub](https://www.youtube.com/watch?v=e2W6tTO6USc), también publicada por AWS Women Colombia. No es un tutorial de AWS Config.

## Prepara la grabación antes de crear reglas

AWS Config opera por cuenta y región. Antes de habilitarlo, confirma en cuáles necesitas inventario e historial, qué tipos de recursos vas a registrar y si están disponibles en esas regiones. Las reglas evalúan los tipos de recursos que AWS Config registra; una regla sin datos del tipo que necesita no puede darte un resultado útil. Revisa la [cobertura de recursos por región y las opciones de grabación](https://docs.aws.amazon.com/config/latest/developerguide/select-resources.html).

El grabador de configuración registra cambios y estados de los tipos de recursos incluidos. El canal de entrega permite enviar el historial y las instantáneas a un bucket de Amazon S3 y, si lo configuras, notificaciones a Amazon SNS. AWS Config admite un canal de entrega por cuenta y región. Asegura los permisos y la retención de esos datos de acuerdo con las políticas de tu organización; consulta [el grabador](https://docs.aws.amazon.com/config/latest/developerguide/stop-start-recorder.html) y [el canal de entrega](https://docs.aws.amazon.com/config/latest/developerguide/manage-delivery-channel.html).

Mantén separadas dos decisiones que suelen confundirse:

- **Frecuencia de grabación:** cuándo AWS Config genera elementos de configuración.
- **Disparador de la regla:** cuándo se vuelve a evaluar el cumplimiento.

Cambiar una frecuencia no cambia automáticamente la otra. Revisa el alcance y la cobertura antes de interpretar un tablero como inventario completo.

## Elige una regla y define cuándo evaluarla

Empieza con una [regla administrada por AWS](https://docs.aws.amazon.com/config/latest/developerguide/managed-rules-by-aws-config.html) que mida una política concreta. Por ejemplo, [s3-bucket-public-read-prohibited](https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-public-read-prohibited.html) comprueba si la política, la ACL y la configuración Block Public Access permiten lectura pública en buckets S3. Antes de adoptarla, revisa qué recurso evalúa y si la regla está disponible en las regiones donde la necesitas.

Si ninguna regla administrada cubre tu requisito, puedes crear una regla personalizada de dos formas:

- **AWS CloudFormation Guard:** un lenguaje de políticas declarativo para reglas personalizadas de Config. Define condiciones sobre la configuración del recurso con la sintaxis Guard descrita en la [guía oficial](https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config_develop-rules_cfn-guard.html).
- **AWS Lambda:** una función evalúa los recursos y entrega los resultados a AWS Config. Esta opción sirve cuando la lógica requiere código o consultas adicionales; revisa la [guía de reglas personalizadas con Lambda](https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config_develop-rules_lambda-functions.html).

Para recursos ya creados, las reglas pueden evaluarse cuando Config detecta un cambio, de forma periódica o con ambos disparadores cuando la regla lo admite. Una evaluación proactiva analiza propiedades antes de aprovisionar un recurso, pero las reglas proactivas de Config no bloquean el despliegue ni reparan el recurso. Solo algunas reglas y tipos de recursos admiten ese modo. Consulta [los modos y disparadores de evaluación](https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config_components.html) y [la evaluación proactiva](https://docs.aws.amazon.com/config/latest/developerguide/evaluating-your-resources.html).

Si validas plantillas de infraestructura antes de desplegar, complementa este enfoque con controles de IaC y una revisión de cambios. La evaluación proactiva de Config no debe confundirse con un bloqueo de despliegue. Nuestra guía [Seguridad de IaC en AWS: 9 controles para Terraform y CloudFormation](https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/) explica controles para revisar plantillas y cambios antes de aplicarlos.

## Despliega reglas en varias cuentas y reúne resultados

Un [conformance pack](https://docs.aws.amazon.com/config/latest/developerguide/conformancepack-sample-templates.html) agrupa reglas administradas o personalizadas y posibles acciones de remediación en una plantilla YAML que puedes desplegar como una unidad. Se puede aplicar en una cuenta y región, o administrar para cuentas de una organización. Los ejemplos de AWS ayudan a empezar, pero AWS aclara que las plantillas de muestra, incluso las asociadas a estándares, no garantizan el cumplimiento de un estándar específico.

Para desplegar un conjunto común de reglas en cuentas de AWS Organizations, consulta la [gestión organizacional de conformance packs](https://docs.aws.amazon.com/config/latest/developerguide/conformance-pack-organization-apis.html). En cambio, un agregador de AWS Config reúne datos de configuración y cumplimiento de cuentas y regiones autorizadas en una vista central de solo lectura. **El agregador no despliega ni modifica reglas en las cuentas de origen.**

## Interpreta los resultados antes de tomar medidas

Una regla puede marcar recursos como COMPLIANT o NON_COMPLIANT. INSUFFICIENT_DATA significa que AWS Config no tiene resultados actuales para esa regla; no lo interpretes como aprobado ni como incumplido. Revisa el estado y la última invocación de la regla, los recursos que entran en su alcance y si Config está grabando los tipos requeridos.

Si la regla ya existe en la cuenta y región fuente, esta consulta de solo lectura muestra los recursos evaluados y sus resultados. Cambia us-east-1 por la región donde está la regla y usa credenciales de AWS CLI con permisos de lectura de Config. El valor de config-rule-name debe ser el nombre real configurado en esa cuenta; el siguiente ejemplo presupone que coincide con el identificador de la regla administrada:

~~~bash
aws configservice get-compliance-details-by-config-rule \
  --config-rule-name s3-bucket-public-read-prohibited \
  --region us-east-1
~~~

En EvaluationResults, revisa el tipo e identificador del recurso, ComplianceType, las marcas de tiempo y Annotation. La [referencia de AWS CLI](https://docs.aws.amazon.com/cli/latest/reference/configservice/get-compliance-details-by-config-rule.html) describe esta operación y sus resultados; para limitar la consulta a recursos no conformes puedes usar el filtro NON_COMPLIANT. El ejemplo consulta una regla existente: no crea reglas ni cambia recursos.

Si la regla personalizada usa Lambda, comprueba también que la función esté entregando evaluaciones a Config y tenga los permisos correspondientes, incluido config:PutEvaluations cuando aplique. AWS explica las causas habituales de INSUFFICIENT_DATA en la referencia de [DescribeComplianceByConfigRule](https://docs.aws.amazon.com/config/latest/APIReference/API_DescribeComplianceByConfigRule.html). Para problemas de identidad y permisos, consulta la [guía de solución de problemas de IAM de AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/security_iam_troubleshoot.html).

Cuando una regla no muestre resultados, confirma en este orden: región seleccionada, grabador activo, tipo de recurso registrado, recurso dentro del alcance y última evaluación correcta. Un resultado vacío puede indicar falta de recursos aplicables o de datos, no necesariamente un error de Config.

## Remedia solo después de revisar el cambio

AWS Config aplica remediaciones mediante documentos de automatización de AWS Systems Manager. Puedes asociar una acción administrada por AWS o un documento propio, y elegir ejecución manual o automática. La remediación automática puede modificar recursos activos; el permiso para evaluar no implica que cualquier corrección sea segura para cada aplicación. Consulta cómo funciona la [remediación de recursos no conformes](https://docs.aws.amazon.com/config/latest/developerguide/remediation.html) y cómo se [configura la remediación automática](https://docs.aws.amazon.com/config/latest/developerguide/setup-autoremediation.html).

Para una explicación general de documentos de Systems Manager, mira la charla [Automatiza tus tareas de Seguridad con AWS Systems Manager Documents](https://www.youtube.com/watch?v=fFcoFODfNXo), publicada por [AWS User Group Guatemala](https://www.youtube.com/@awsugguatemala). La charla ayuda a conocer Documents; revisa la documentación de AWS Config para confirmar cómo se asocia una remediación a una regla.

Un flujo más seguro es:

1. Revisa el recurso afectado y confirma que la regla mida la política que realmente necesitas.
2. Comprueba si el estado reportado es un incumplimiento real o una excepción aprobada.
3. En un entorno de prueba, ejecuta el documento de Systems Manager en modo manual y valida su efecto y los permisos usados.
4. Registra quién aprueba el cambio, qué recursos puede tocar y cómo se revierte.
5. Considera la automatización después de validar el documento, limitar su alcance y acordar las excepciones. Ajusta los reintentos: los intentos de remediación fallidos pueden generar cargos de Systems Manager Automation.

Por ejemplo, detectar que un bucket no cumple tu política de acceso no basta para activar un bloqueo global. Primero determina si el acceso público es intencional, qué aplicaciones dependen de él y cuál es exactamente el control requerido. Luego prueba una acción acotada con una persona responsable aprobándola. No uses como plantilla de producción el código de un tutorial sin revisar sus permisos y alcance.

El artículo de Pablo González Robles [Remediación automática con AWS Config y Systems Manager](https://dev.to/pangoro24/remediacion-automatica-con-aws-config-y-systems-manager-seguridad-proactiva-en-la-nube-4pbi) muestra un flujo concreto y enlaza su [plantilla de CloudFormation](https://github.com/pangoro24/aws-public-buckets-auto-remediation). Esa plantilla activa automáticamente los cuatro controles de bloqueo de acceso público de S3 y concede a su rol permiso para aplicarlos a cualquier bucket. Úsala como material para revisar en un entorno de prueba: limita permisos y alcance y consigue aprobación antes de adaptar esa acción a una cuenta real.

## Ten en cuenta el costo y la cobertura

AWS Config cobra según los elementos de configuración registrados, las evaluaciones activas de reglas y las evaluaciones de conformance packs. También pueden aplicarse cargos de Amazon S3, Amazon SNS, AWS Lambda y Systems Manager Automation según lo que habilites. El costo depende del uso, los tipos de recursos, las frecuencias y la región: consulta [los precios vigentes de AWS Config](https://aws.amazon.com/config/pricing/) y [los precios de Systems Manager Automation](https://aws.amazon.com/systems-manager/pricing/) antes de fijar un alcance.

Grabar menos tipos de recursos puede reducir el volumen, pero también deja recursos fuera de las reglas e historial. Ajusta el alcance según la política que quieres verificar; no reduzcas la cobertura solo para obtener un costo menor sin evaluar qué dejarías de observar.

## Preguntas frecuentes

### ¿AWS Config certifica que mi empresa cumple una norma?

No. Config informa si los recursos coinciden con reglas técnicas que se ejecutaron. Un paquete de reglas puede apoyar una revisión, pero no sustituye la interpretación de los requisitos, los controles organizacionales ni la evidencia que pueda solicitar un auditor.

### ¿Un agregador de AWS Config instala reglas en las cuentas?

No. El agregador centraliza datos en una vista de solo lectura. Para desplegar reglas en cuentas de una organización, usa reglas organizacionales o conformance packs y verifica su estado por cuenta y región.

### ¿Una regla proactiva de AWS Config bloquea recursos incorrectos?

No. La evaluación proactiva informa si las propiedades propuestas cumplirían la regla; por sí sola, no bloquea el aprovisionamiento ni remedia el recurso.

## Recursos y comunidades en español

- [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/) comparte información sobre su comunidad y grabaciones de sus charlas; consulta el sitio para conocer sus actividades vigentes.
- En [Meetup](https://www.meetup.com/aws-user-group-security-ecuador/) puedes seguir al grupo y revisar sus próximos encuentros.
- El grupo anuncia [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) para el martes 20 de octubre de 2026 a las 19:00 ECT, en línea. La ficha indica cupos limitados e inscripción; consulta allí la disponibilidad y cualquier condición vigente.
