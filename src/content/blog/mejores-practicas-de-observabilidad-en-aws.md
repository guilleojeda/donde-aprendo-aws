---
title: "Cómo diagnosticar problemas en aplicaciones AWS con CloudWatch"
description: "Diagnostica errores y latencia en AWS con CloudWatch, Logs Insights y trazas. Revisa alarmas, datos ausentes, OpenTelemetry y costos."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:43:53.201Z"
modifiedTimestamp: "2026-10-06T17:50:38-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cómo crear SLOs en AWS con CloudWatch Application Signals"
    url: "https://dondeaprendoaws.com/blog/como-monitorear-slos-con-amazon-cloudwatch/"
---

Cuando una aplicación en AWS devuelve errores o responde lento, empieza por el síntoma que ve el usuario y sigue la evidencia hasta la operación afectada. CloudWatch puede reunir métricas, logs y trazas, pero cada señal responde una pregunta distinta y solo estará disponible si el servicio o la aplicación la publica y está configurada para enviarla.

En la práctica, el monitoreo vigila condiciones conocidas con métricas, tableros y alarmas; la observabilidad ayuda a investigar por qué ocurrió un comportamiento que no habías previsto. Una métrica muestra un patrón, los logs aportan contexto de eventos y una traza sigue una solicitud entre servicios. Juntas permiten investigar; ninguna garantiza por sí sola que tengas todos los datos de cada solicitud. [CloudWatch documenta cómo trabaja con OpenTelemetry para estos tres tipos de telemetría](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OpenTelemetry-Sections.html).

Si prefieres una explicación en video antes de practicar, [CloudWatch explicado fácil: métricas, logs y trazas en AWS](https://www.youtube.com/watch?v=48f2d-oM00Y), de [Marcia en Desplegando Cloud](https://www.youtube.com/@marcia_), presenta esos tres tipos de señales. Úsalo para orientarte y sigue las referencias actuales de AWS para configurar tu aplicación.

## Empieza por el impacto y el intervalo

Supón que aumentaron los errores al completar una compra. Anota cuándo empezó, qué región y entorno están afectados, qué operación falla y qué versión se desplegó cerca de ese momento. Elige una ventana de tiempo acotada y una métrica que refleje el síntoma, como el volumen de solicitudes, la tasa de errores o la latencia de la operación. Contrástala con el tráfico normal y, si tienes varias regiones o versiones, compara esos grupos por separado.

Una alarma debería señalar un cambio que requiere actuar, no cada fluctuación de infraestructura. Para una operación importante, define qué significa una respuesta correcta para tu producto y cuándo una demora ya perjudica a los usuarios. Los [SLO de CloudWatch Application Signals](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-ServiceLevelObjectives.html) pueden usar métricas de disponibilidad y latencia, además de métricas o expresiones de CloudWatch. El [artículo sobre cómo crear SLO con Application Signals](/blog/como-monitorear-slos-con-amazon-cloudwatch/) explica cómo elegir el indicador, objetivo y ventana.

Revisa también qué ocurre cuando falta una métrica. Una alarma de CloudWatch puede tratar los puntos ausentes como `missing`, `notBreaching`, `breaching` o `ignore`; la opción adecuada depende de cómo se produce la señal. La ausencia de errores en una métrica que dejó de publicarse no prueba que la aplicación esté sana. Consulta [cómo evalúa CloudWatch los datos ausentes](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html) y decide si necesitas una comprobación adicional para detectar que dejó de llegar telemetría.

Ten presente la definición de las métricas estándar de Application Signals: `Availability` cuenta respuestas 5xx como fallidas y las 4xx como exitosas. Si un rechazo de negocio —por ejemplo, una compra no aceptada— debe contar como fallo para tus usuarios, crea un indicador que represente ese resultado en vez de asumir que la métrica estándar lo refleja. La [referencia de métricas de Application Signals](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AppSignals-MetricsCollected.html) detalla sus definiciones.

Si ya tienes logs y necesitas construir ese indicador, la lectura comunitaria [Observabilidad desde los logs: cómo construir SLIs sin esperar a instrumentar el código](https://builder.aws.com/content/3IlpApiKwsNpk6eWH4T0NdgFfkf/observabilidad-desde-los-logs-como-construir-slis-sin-esperar-a-que-alguien-instrumente-el-codigo) compara filtros de métricas, Embedded Metric Format y consultas de Logs Insights, con sus requisitos y límites. Un SLI es el indicador que usarás para evaluar el objetivo; el recurso te ayuda a elegir cómo obtenerlo desde los eventos que ya produces.

## Busca el contexto en CloudWatch Logs Insights

Los logs estructurados hacen más fácil filtrar por servicio, identificador de solicitud y resultado. Por ejemplo, una línea JSON podría verse así:

```json
{
  "level": "ERROR",
  "service": "checkout",
  "requestId": "req-7f3",
  "traceId": "1-65e022fe-3ea832b76d8c9c59b688993e",
  "statusCode": 503,
  "durationMs": 840,
  "message": "inventory timeout"
}
```

Si esos campos están presentes en los eventos de los grupos de logs que elegiste, esta consulta devuelve errores recientes para inspeccionar:

```text
fields @timestamp, service, requestId, traceId, level, statusCode, durationMs, @message
| filter statusCode >= 500 or level = "ERROR"
| sort @timestamp desc
| limit 50
```

Para seguir una solicitud concreta por los logs que comparten ese identificador:

```text
fields @timestamp, service, level, statusCode, durationMs, @message
| filter requestId = "req-7f3"
| sort @timestamp asc
| limit 100
```

En la consola de Logs Insights, selecciona los grupos y el período que correspondan al incidente. Los nombres y campos disponibles dependen del formato y del servicio que escribe los logs; adapta la consulta a tus eventos. La documentación de AWS incluye la sintaxis de [Logs Insights QL](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_AnalyzeLogData_LogsInsights.html) y [consultas de ejemplo](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-examples.html).

La segunda consulta puede aprovechar un índice de campo para `requestId` si ese campo existe y configuraste el índice: los índices pueden reducir los eventos procesados por filtros de igualdad o `IN`; un filtro `like` no los utiliza. Consulta la documentación de [filtros e índices de Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-Filter.html). Para mantener acotado el costo y acelerar la investigación, reduce el rango de tiempo y el conjunto de grupos antes de ejecutar una consulta; CloudWatch cobra las consultas de Logs Insights según los datos analizados. La [página de precios de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) describe los cargos vigentes.

## Sigue la solicitud con una traza

Una vez que tienes el identificador de solicitud o de traza en los logs, usa la traza para ver los tramos y dependencias que participaron. Si el log contiene `traceId`, búscalo en la vista de trazas disponible para tu configuración de CloudWatch o X-Ray. Comprueba en qué servicio aumenta la latencia o aparece el error, y contrasta ese tramo con los logs y métricas de la misma ventana.

Una traza puede faltar o verse incompleta aunque la solicitud haya ocurrido: el muestreo puede conservar solo parte del tráfico, la aplicación quizá no esté instrumentada, el contexto puede no propagarse entre servicios o el exportador puede no estar enviando los datos. Una capa o agente instalado no significa que todo el código ya produzca trazas. Revisa la plataforma y versión compatibles, la configuración de instrumentación, los errores de exportación y los permisos del agente. AWS describe el [muestreo y la estructura de una traza X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-concepts.html), ofrece una guía para [diagnosticar telemetría ausente en Application Signals](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-Enable-Troubleshoot.html) y explica [cómo se propaga el contexto de traza al migrar a OpenTelemetry](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html).

Ten en cuenta el ciclo de vida actual: desde el **25 de febrero de 2026**, los SDK de AWS X-Ray y el daemon están en modo de mantenimiento y solo reciben versiones para corregir problemas de seguridad; el soporte termina el **25 de febrero de 2027**. Estas fechas corresponden a esos SDK y al daemon, no anuncian el fin del servicio de trazas X-Ray. Para instrumentar aplicaciones nuevas y planificar la migración de las existentes, AWS recomienda OpenTelemetry; consulta el [cronograma de soporte de X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-daemon-timeline.html) y la [guía de migración a OpenTelemetry](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html).

## Distingue observabilidad de auditoría

CloudTrail responde otra pregunta: qué actividad ocurrió en la cuenta de AWS, por ejemplo, quién hizo una llamada a una API y cuándo. Es útil para auditoría y cambios de configuración; no reemplaza los logs de aplicación ni una traza de la solicitud del usuario. AWS describe los [eventos que registra CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-events.html).

## Controla el volumen de señales

Antes de ampliar la telemetría, revisa qué datos necesitas para operar y durante cuánto tiempo. Los logs tienen costos de ingesta, almacenamiento y consulta; las métricas personalizadas dependen de las series que publiques; las alarmas y las trazas también pueden generar cargos según la función habilitada y el volumen. Consulta los [precios de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) con tu región y configuración.

En métricas personalizadas, evita usar un identificador único de solicitud o de usuario como dimensión: cada combinación distinta de dimensiones puede crear otra métrica. Conserva identificadores particulares en logs o trazas, donde sirven para investigar un caso específico. CloudWatch explica cómo las dimensiones forman la identidad de una métrica en su guía de [métricas y conceptos](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_concepts.html). En trazas, el muestreo reduce el volumen observado, pero significa que una búsqueda de trazas no representa necesariamente todas las solicitudes.

## Si no aparece la telemetría

Antes de cambiar umbrales o concluir que no hubo errores, revisa lo siguiente:

| Señal | Qué comprobar |
| --- | --- |
| Logs | Cuenta y región seleccionadas, grupo de logs, período de retención y ventana consultada; confirma que el servicio o agente envía eventos y que conserva los permisos necesarios. |
| Métricas | Namespace, nombre y dimensiones exactas; confirma que haya puntos recientes para esa serie y que la alarma trate los datos ausentes como corresponde. |
| Trazas | Instrumentación compatible y activa, decisión de muestreo, propagación del contexto, salida del exportador y permisos del agente; acota la búsqueda a la misma cuenta, región y período. |

Después de corregir una causa, genera una solicitud de prueba y confirma qué señales llegaron antes de cerrar el incidente. Si no llega ninguna, investiga primero el flujo de envío y los permisos; agregar más alarmas sobre datos ausentes no repara ese flujo.

## Sigue aprendiendo y participa

Puedes intercambiar experiencias en los grupos generales [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) y [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/). Si buscas una comunidad de mujeres en tecnología cloud, [AWS Women in Cloud Buenos Aires](https://awswomenincloudba.com.ar/) organiza talleres, mentorías, encuentros y grupos de estudio; [AWS Girls Argentina](https://www.meetup.com/aws-girls-argentina/) conecta a mujeres que quieren aprender y compartir sobre tecnología y AWS. Los temas y condiciones dependen de cada actividad. Consulta el [directorio de comunidades AWS](/comunidades/) y la [agenda de eventos de comunidades](https://dondeaprendoaws.com/eventos/) para revisar fechas, modalidad y registro antes de participar.

Para plantear una duda útil, lleva el síntoma, el intervalo, la métrica afectada y una consulta o log de ejemplo con datos ficticios. Evita compartir tokens, información personal o registros reales de clientes. Una pregunta como «la alarma cambió a datos insuficientes después del despliegue y esta serie dejó de publicar puntos» permite comparar experiencias sin prometer que la comunidad resolverá el incidente por ti.
