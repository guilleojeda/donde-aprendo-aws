---
title: "Detección de amenazas en AWS: GuardDuty, CloudTrail y alertas"
description: "Combina GuardDuty, CloudTrail, CloudWatch y Security Hub para detectar e investigar amenazas en AWS, validar las alertas y resolver la ausencia de hallazgos."
author: "guille-ojeda"
publishedAt: "2024-05-11"
publishedTimestamp: "2024-05-11T05:27:40.366Z"
modifiedTimestamp: "2026-10-04T21:44:34-03:00"
cover: "/assets/blog/c03425ae80465af167cf55e5.jpg"
coverAlt: "Nube azul formada por piezas de rompecabezas con símbolos de seguridad"
ogImage: "/assets/blog/c03425ae80465af167cf55e5.jpg"
related: []
---

Para detectar actividad sospechosa en AWS, habilita **Amazon GuardDuty** en las cuentas y regiones que necesitas vigilar, define cómo recibir sus hallazgos y comprueba que esa ruta de alertas funciona. **AWS CloudTrail** aporta evidencia de actividad de la cuenta; **Amazon CloudWatch** analiza los logs y las métricas que hayas configurado. **AWS Security Hub** y **AWS Security Hub CSPM** ayudan a priorizar hallazgos y evaluar la postura, con funciones distintas.

“Tiempo real” no significa que toda actividad produzca una alerta instantánea. GuardDuty envía un hallazgo nuevo a Amazon EventBridge en tiempo casi real cuando lo genera; AWS documenta que GuardDuty suele enviarlo a Security Hub CSPM dentro de cinco minutos. Esos tiempos describen el envío después de crear el hallazgo, no una garantía desde el inicio de una actividad hasta que alguien la investiga. [Documentación de GuardDuty sobre EventBridge](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings_eventbridge.html) y [su integración con Security Hub CSPM](https://docs.aws.amazon.com/guardduty/latest/ug/securityhub-integration.html).

## Qué hace cada servicio

- **Detectar actividad sospechosa:** [Amazon GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html). Analiza fuentes como eventos de administración de CloudTrail, tráfico de red y consultas DNS. Los planes de protección amplían los tipos de carga y actividad observados.
- **Investigar acciones de cuenta:** [AWS CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html). Permite consultar eventos de administración recientes por región. Para retener y centralizar actividad, configura un trail y selecciona los tipos de eventos necesarios.
- **Vigilar logs y métricas propios:** [Amazon CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html). Busca datos enviados a CloudWatch Logs y activa alarmas según métricas o filtros que configures. No recibe automáticamente todos los logs de todas tus aplicaciones.
- **Revisar postura y priorizar hallazgos:** [AWS Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html) y [AWS Security Hub](https://docs.aws.amazon.com/securityhub/latest/userguide/what-are-securityhub-services.html). CSPM ejecuta controles de seguridad y consolida hallazgos. AWS Security Hub agrega contexto, ayuda a priorizar exposiciones y ofrece flujos de respuesta. Comprueba qué servicios y planes están habilitados en tu cuenta.

## GuardDuty detecta amenazas; los planes determinan parte de la cobertura

GuardDuty empieza a analizar fuentes fundamentales cuando lo habilitas: eventos de administración de CloudTrail, VPC Flow Logs de instancias EC2 y consultas DNS de Route 53 Resolver. Para estas fuentes, GuardDuty recibe un flujo independiente. No necesitas configurar un trail de CloudTrail o tus propios VPC Flow Logs para que GuardDuty analice esos datos, y esa integración no cambia la configuración de logging de tu cuenta. [AWS describe las fuentes fundamentales y las condiciones de DNS](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_data-sources.html).

Esto no equivale a guardar todos los logs en tu cuenta ni a inspeccionar cada paquete, solicitud de aplicación o evento de datos. La cobertura adicional —por ejemplo, para actividad de S3, EKS, RDS, Lambda o eventos de runtime— depende de las funciones y planes de protección disponibles y habilitados. Revisa la lista vigente de [funciones de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html) por cuenta y región. AWS recomienda habilitar GuardDuty en todas las regiones disponibles; valida también las cuentas miembro si usas AWS Organizations.

Al activar GuardDuty por primera vez en una región, AWS inicia una prueba de 30 días y habilita algunos planes de protección por defecto, pero no todos. Revisa qué quedó activo y qué incluye la prueba en la [guía vigente de precios y prueba gratuita de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-pricing.html); el uso que continúe después del periodo puede generar cargos.

Los hallazgos describen actividad potencialmente maliciosa que el servicio reconoció dentro de ese alcance. La ausencia de un hallazgo no demuestra por sí sola que no haya actividad sospechosa: puede faltar cobertura para esa cuenta, región, carga de trabajo o tipo de evento.

Para ver una charla en español sobre cómo conectar GuardDuty con un SIEM, consulta la grabación [“Amazon GuardDuty integrado con SIEM”](https://www.youtube.com/watch?v=CQUICC2h0Oc), publicada por AWS User Group CreaTicas.

## CloudTrail sirve para reconstruir actividad, con límites claros

CloudTrail Event history ofrece hasta 90 días de eventos de administración por cuenta y región, sin cargo adicional. No es un archivo completo de todo lo que ocurre en tus aplicaciones: Event history no muestra eventos de datos, eventos de Insights ni eventos de actividad de red, y no agrega la actividad de toda una organización.

Para conservar actividad durante más tiempo o analizar eventos de datos, configura un trail de CloudTrail con un destino de almacenamiento y selecciona los tipos de eventos necesarios. Los trails registran eventos de administración por defecto; los eventos de datos e Insights requieren configuración aparte y pueden generar cargos. CloudTrail Lake dejó de admitir nuevos clientes el 31 de mayo de 2026; los clientes existentes pueden seguir usando el servicio. Consulta el aviso oficial de [disponibilidad de CloudTrail Lake](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-lake-service-availability-change.html), además de [los límites de Event history](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html) y [la configuración de eventos de administración](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-management-events-with-cloudtrail.html). Por eso, ante una API que no aparece, verifica primero la región y el tipo de evento; una llamada a la API de un servicio y una acción sobre un objeto S3, por ejemplo, no necesariamente pertenecen a la misma categoría.

GuardDuty analiza su propio flujo de eventos de administración de CloudTrail, independientemente de los trails configurados por el cliente. Crear un trail sigue siendo útil para tu auditoría, retención e investigación, pero no es un requisito para que GuardDuty analice su fuente fundamental de eventos de administración.

Como repaso general de observabilidad, el canal de AWS Women Colombia publica una charla titulada [“La Amenaza del Nivel 100: Amazon CloudWatch, AWS CloudTrail, AWS X-Ray y AWS Config”](https://www.youtube.com/watch?v=TfBZFzGokQM). Usa la documentación enlazada en esta guía para verificar el alcance y la configuración actuales de cada servicio.

## CloudWatch analiza los logs que le envías

CloudWatch Logs puede recibir logs de algunos servicios de AWS automáticamente. Para otros servicios, sistemas o aplicaciones, debes configurar la entrega, un agente o una integración. Después puedes buscar eventos, crear filtros que generen métricas y configurar alarmas sobre esas métricas. Una alarma solo puede avisar sobre la señal y la condición que definiste; CloudWatch no clasifica por sí solo todos los logs como ataques. Revisa [cómo se envían logs a CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html) y [cómo funcionan las alarmas](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Alarms.html).

Usa CloudWatch para señales operativas y registros que no cubre GuardDuty, como errores o patrones específicos de una aplicación. Evita llamar “detección de amenazas” a una alarma sin definir qué dato recibe, qué condición evalúa y quién investiga cuando se activa.

Si quieres repasar alarmas de CloudWatch con un ejemplo en español, Marcia Villalba publicó la grabación [“Observabilidad de tus aplicaciones de nube - CLOUDWATCH ALARMS”](https://www.youtube.com/watch?v=uS0QE0NeqpA).

## Security Hub y Security Hub CSPM no son sinónimos en la documentación actual

AWS documenta **AWS Security Hub CSPM** y **AWS Security Hub** como servicios complementarios. Security Hub CSPM compara recursos con prácticas recomendadas y estándares, genera hallazgos de controles e ingiere hallazgos compatibles de GuardDuty y otros productos. La mayoría de sus controles requiere que AWS Config registre los recursos pertinentes; además, CSPM solo procesa en las regiones donde está habilitado y no incorpora retroactivamente hallazgos anteriores. [Descripción y requisitos de Security Hub CSPM](https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html).

**AWS Security Hub** ofrece una experiencia más amplia para correlacionar y priorizar riesgos y organizar la respuesta. Según el plan vigente, puede incluir CSPM y capacidades de Threat Analytics impulsadas por GuardDuty. Revisa la [comparación de ambos servicios](https://docs.aws.amazon.com/securityhub/latest/userguide/what-are-securityhub-services.html) y los [planes y precios actuales de AWS Security Hub](https://aws.amazon.com/security-hub/pricing/) antes de asumir qué capacidades o cargos corresponden a tu cuenta.

**Amazon Inspector** tiene otra función: administra vulnerabilidades de software y exposición de red en recursos compatibles. Un CVE o una ruta de red abierta necesita remediación, pero no demuestra que un atacante la esté explotando. Úsalo para reducir debilidades y complementa sus resultados con detección de actividad como GuardDuty. [Qué analiza Amazon Inspector](https://docs.aws.amazon.com/inspector/latest/user/what-is-inspector.html).

## Prevención, detección, investigación y respuesta

- **Prevención:** limita permisos con IAM, usa roles y aplica mínimo privilegio para reducir accesos y el impacto de credenciales comprometidas. Repasa identidades, roles y permisos con el video [“Qué es AWS IAM? - Explicado en 5 minutos”](https://www.youtube.com/watch?v=t51vW-BDwF0), publicado por Marcia Villalba; usa las [buenas prácticas oficiales de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) para definir permisos de producción.
- **Detección:** usa GuardDuty para los tipos de actividad que cubren sus fuentes y planes; define señales de CloudWatch para logs y métricas adicionales.
- **Investigación:** empieza por el hallazgo y el recurso afectados. Correlaciona su fecha, identidad y actividad de API con CloudTrail; consulta logs de carga de trabajo en CloudWatch si están habilitados. El hallazgo orienta la investigación, no reemplaza la evidencia de esos sistemas. Para relacionar el impacto con señales de fiabilidad, costos o cambios de despliegue, consulta [Métricas DevOps en AWS](https://dondeaprendoaws.com/blog/10-metricas-clave-de-devops-en-aws/); esas medidas operativas ayudan a poner el incidente en contexto, pero no demuestran por sí mismas una intrusión.
- **Respuesta:** usa Amazon EventBridge para enrutar hallazgos a un destino como Amazon SNS, un sistema de tickets o un flujo de automatización. Security Hub también ofrece gestión de flujos de respuesta. Prueba cualquier acción que cambie recursos o accesos antes de automatizarla y conserva aprobación humana cuando el impacto operativo lo justifique. [Procesamiento de hallazgos de GuardDuty con EventBridge](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings_eventbridge.html).

## Cómo comprobar que la alerta llega

Puedes validar la ruta sin generar tráfico malicioso ni desplegar recursos de prueba:

1. Hazlo en una cuenta de prueba o asegúrate de que el destino de EventBridge no dispare una acción correctiva real. Selecciona un detector de GuardDuty y una región donde esté habilitado. El ID del detector aparece en **GuardDuty > Settings**. Si lo consultas con `ListDetectors`, esa operación requiere el permiso IAM `guardduty:ListDetectors` ([referencia de autorización de GuardDuty](https://docs.aws.amazon.com/service-authorization/latest/reference/list_guardduty.html)).
2. La llamada de muestra requiere `guardduty:CreateSampleFindings`. La referencia IAM no define un tipo de recurso para limitar esa acción a un detector específico, así que concede solo esa acción a la identidad de prueba y retírala cuando termines. Con AWS CLI autorizado, genera un único hallazgo de muestra. Sustituye ambos valores entre comillas por el ID del detector y la región correctos:

   ```bash
   aws guardduty create-sample-findings \
     --detector-id "REEMPLAZAR_CON_ID_DEL_DETECTOR" \
     --finding-types "Backdoor:EC2/DenialOfService.Tcp" \
     --region "REEMPLAZAR_CON_REGION"
   ```

3. Confirma que el hallazgo marcado como `[SAMPLE]` aparece en GuardDuty. Si usas EventBridge, revisa que la regla coincida con eventos `GuardDuty Finding` y que el destino de prueba reciba el evento. El patrón básico documentado por AWS es:

   ```json
   {
     "source": ["aws.guardduty"],
     "detail-type": ["GuardDuty Finding"]
   }
   ```

4. Si habilitaste GuardDuty y Security Hub CSPM en la misma cuenta y región, comprueba si el hallazgo aparece en CSPM; AWS indica que suele enviarse en cinco minutos. Al terminar, archiva el hallazgo de muestra para no confundirlo con uno real.

La muestra comprueba el formato y la ruta de distribución de un hallazgo. No prueba que GuardDuty haya observado o detectado una actividad real. [AWS explica qué contienen y qué no prueban los hallazgos de muestra](https://docs.aws.amazon.com/guardduty/latest/ug/sample_findings.html).

## Si no aparecen hallazgos o alertas

| Síntoma | Qué revisar |
| --- | --- |
| No aparece un hallazgo en GuardDuty | Cuenta, región, estado del detector y plan de protección que cubre esa carga o tipo de evento. Un plan ausente no se sustituye con una regla de EventBridge. |
| Hay hallazgo en GuardDuty, pero no llega al destino | Regla de EventBridge, patrón `source`/`detail-type`, bus, región y permisos del destino. Prueba el trayecto con una muestra en un destino controlado. |
| GuardDuty muestra el hallazgo, pero no aparece en Security Hub CSPM | Confirma que ambos servicios están habilitados en la misma cuenta y región, que CSPM se habilitó antes del hallazgo y que no filtraste o archivaste el resultado. Revisa AWS Config si falta un hallazgo de control de postura. |
| No encuentras una API en CloudTrail | Busca en la región correcta y distingue evento de administración de evento de datos. Event history solo contiene los eventos de administración recientes; configura selectores para eventos de datos que necesites conservar. |
| Faltan logs de una aplicación en CloudWatch | Comprueba que el servicio o agente realmente los envía al grupo de logs esperado y que permisos, región y retención sean correctos. Las alarmas solo evalúan los datos recibidos y la condición configurada. |

## Costos: estima la cobertura antes de habilitarla

No hay un precio único para “monitorear AWS”. GuardDuty cobra según los logs, eventos, cargas o datos analizados, la región y los planes activos; al habilitarlo por primera vez en una región, algunos planes se activan por defecto y tienen una prueba de 30 días. Si habilitas AWS Security Hub, la facturación de las capacidades incluidas en sus planes se consolida en Security Hub; las capacidades de GuardDuty que no estén incluidas conservan su facturación independiente. CloudTrail Event history de administración tiene una vista gratuita de 90 días, mientras que categorías de eventos adicionales, copias, almacenamiento o análisis pueden tener cargos. CloudWatch puede cobrar por ingesta y retención de logs, consultas y alarmas. AWS Security Hub usa planes y unidades de recursos, y sus complementos no se incluyen en la prueba gratuita de Essentials; además, los controles de CSPM pueden requerir uso de AWS Config.

Antes de habilitar la cobertura, compara el alcance y precio en las páginas oficiales de [GuardDuty](https://aws.amazon.com/guardduty/pricing/), [CloudTrail](https://aws.amazon.com/cloudtrail/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) y [Security Hub](https://aws.amazon.com/security-hub/pricing/). Estima por cuenta y región y revisa AWS Billing después de activar el servicio; una prueba gratuita no implica que todas las fuentes, integraciones o servicios relacionados sean gratuitos.

## Comunidades para conversar y practicar

- **[AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/):** grupo regional que comparte contenido de seguridad en AWS en español; útil para intercambiar experiencias con personas de otros países.
- **[AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/):** espacio local dedicado a seguridad cloud con AWS, para conectar con usuarios y revisar si hay actividades publicadas en Argentina.
- **[AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/):** comunidad centrada en seguridad de AWS; su página publica charlas y encuentros online o presenciales.
- **[AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/):** grupo general de AWS para aprender y compartir experiencias; no necesitas que una comunidad esté especializada en seguridad para consultar dudas o practicar servicios.

La disponibilidad de intercambios y encuentros cambia; revisa cada página para saber si tiene actividades vigentes y confirmar modalidad y cupos. Estos grupos son comunidades independientes y no canales de soporte oficial de AWS.

## Preguntas frecuentes

### ¿GuardDuty registra todas las llamadas a la API?

No. GuardDuty analiza las fuentes y funciones habilitadas que AWS documenta; CloudTrail también tiene categorías de eventos y límites de retención. Para conservar registros y auditar actividad, configura CloudTrail con los selectores y el destino que requiere tu caso.

### ¿CloudWatch detecta amenazas automáticamente?

CloudWatch puede analizar logs y métricas y activar alarmas sobre condiciones que configuras. La aplicación, servicio o agente debe enviar los datos necesarios, y la regla debe representar una señal que quieras vigilar.

### ¿Amazon Inspector detecta ataques activos?

Inspector identifica vulnerabilidades de software y exposición de red en recursos compatibles. Sus hallazgos sirven para gestionar y corregir debilidades; por sí solos no indican que un ataque esté ocurriendo.

### ¿Un hallazgo de muestra confirma que la detección funciona?

Confirma que puedes ver un hallazgo sintético y comprobar su distribución hacia EventBridge o Security Hub CSPM. No reproduce una actividad maliciosa ni prueba la cobertura de detección para tus recursos.
