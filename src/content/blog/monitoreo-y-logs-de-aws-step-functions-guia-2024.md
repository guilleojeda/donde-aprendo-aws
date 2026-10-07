---
title: "Cómo monitorear y depurar AWS Step Functions con CloudWatch"
description: "Guía para revisar historiales Standard y Express, configurar CloudWatch Logs, consultar ejecuciones con Logs Insights y crear alertas para AWS Step Functions."
author: "guille-ojeda"
publishedAt: "2024-11-26"
publishedTimestamp: "2024-11-26T19:49:41.97Z"
modifiedTimestamp: "2026-10-07T00:03:47-03:00"
review:
  date: "2026-10-07"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []
---

Para depurar una ejecución de **AWS Step Functions**, abre su historial en la consola si es Standard; si es Express, configura **Amazon CloudWatch Logs**, porque Step Functions no conserva allí el historial. Usa las métricas de CloudWatch para detectar tendencias y alarmas, y Logs Insights para buscar eventos concretos. **Standard conserva el historial durante 90 días después de finalizar la ejecución, por defecto; Express depende de los registros de CloudWatch para mostrarlo.**

## Standard y Express guardan el historial de forma distinta

- **Standard:** Step Functions conserva el historial y permite consultar ejecuciones completadas durante 90 días por defecto. CloudWatch Logs es opcional: actívalo si quieres enviar los eventos también a CloudWatch o consultarlos con Logs Insights.
- **Express:** Step Functions no conserva el historial. La consola lo reconstruye desde el grupo de CloudWatch Logs. Configura el registro si necesitas inspeccionar ejecuciones; sin esos logs no tendrás el historial detallado.

Para Express, la consola muestra por defecto las ejecuciones de las últimas tres horas. Puedes ampliar el intervalo, pero las consultas que revisan más datos pueden aumentar el costo de analizar logs. Si borras el grupo de logs, las ejecuciones Express dejan de aparecer en la pestaña **Executions**. Una cuenta puede solicitar a AWS reducir de 90 a 30 días la retención del historial Standard para una región. Consulta [cómo se presentan las ejecuciones Standard y Express](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-view-execution-details.html) y [las cuotas del historial](https://docs.aws.amazon.com/step-functions/latest/dg/service-quotas.html).

Los logs de Step Functions se entregan a CloudWatch Logs **con el mejor esfuerzo**: AWS no garantiza que lleguen todos ni cuándo llegarán. No los uses como registro de auditoría completo. Si un flujo Express necesita conservar cada resultado por un requisito operativo o de negocio, guarda esos datos en un almacenamiento duradero dentro del propio flujo. En Standard puedes recuperar el historial mediante `GetExecutionHistory`; esa API no está disponible para Express. [AWS detalla estas garantías y alternativas](https://docs.aws.amazon.com/step-functions/latest/dg/cw-logs.html).

Si todavía estás decidiendo qué tipo de flujo usar, revisa [la guía de Step Functions y la comparación entre Standard y Express](https://dondeaprendoaws.com/blog/comprendiendo-aws-step-functions/).

## Configura CloudWatch Logs para ver los pasos

Al crear una máquina Standard desde la consola, Step Functions no la configura automáticamente para enviar logs. La consola configura el envío de logs para Express con nivel `ALL` de forma predeterminada; si creas cualquiera de los dos tipos mediante API, CLI o CloudFormation, el nivel queda en `OFF` hasta que configures el registro y los permisos. Comprueba la configuración efectiva antes de investigar una ejecución.

Este fragmento corresponde a `LoggingConfiguration` al crear o actualizar una máquina. Usa un grupo de CloudWatch Logs preparado en la región de la máquina, reemplaza `REGION`, `ACCOUNT_ID` y `MI_FLUJO`, y termina el ARN del grupo en `:*`, como indica la [referencia de `CreateStateMachine`](https://docs.aws.amazon.com/step-functions/latest/apireference/API_CreateStateMachine.html).

```json
{
  "level": "ALL",
  "includeExecutionData": false,
  "destinations": [
    {
      "cloudWatchLogsLogGroup": {
        "logGroupArn": "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws/vendedlogs/states/MI_FLUJO:*"
      }
    }
  ]
}
```

El nivel `ALL` registra todos los tipos de eventos de ejecución. `ERROR` conserva eventos de error, `FATAL` registra fallos de la ejecución y `OFF` desactiva el registro. Con `ERROR` o `FATAL`, los detalles que la consola puede reconstruir para Express son parciales. El nivel no decide si también se guardan los datos de entrada y salida: eso lo controla `includeExecutionData`. En el ejemplo está en `false` para no copiar esos datos potencialmente sensibles a los logs. Si necesitas verlos para depurar, evalúa si el payload contiene información personal, credenciales o datos de negocio y limita quién puede consultar el grupo antes de habilitarlos.

El rol de ejecución de la máquina necesita los permisos de CloudWatch Logs documentados por AWS, entre ellos `logs:CreateLogDelivery`, `logs:PutLogEvents`, `logs:DescribeLogGroups` y permisos para administrar la entrega. La política de ejemplo de AWS usa `Resource: "*"` porque varias de esas acciones no permiten limitar el recurso a un grupo de logs. Revisa la [política y los pasos de solución de problemas de acceso](https://docs.aws.amazon.com/step-functions/latest/dg/cw-logs.html). Si hay muchos grupos, el prefijo `/aws/vendedlogs/states/` ayuda a evitar que las políticas de recursos de CloudWatch Logs excedan su límite.

Si defines la máquina como infraestructura, [esta grabación sobre AWS SAM](https://www.youtube.com/watch?v=nDOOP_aV5Us) muestra cómo declarar una máquina Step Functions con ASL. Se publicó en 2022 y no es una guía específica de `LoggingConfiguration`; consulta la [documentación actual de Step Functions con SAM](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-sam-sfn.html) para adaptar la plantilla y los permisos.

Los eventos pueden contener `input`, `output` y variables asignadas. Si los datos enviados a CloudWatch superan los límites aplicables, se truncan; inspecciona `inputDetails`, `outputDetails` o `assignedVariablesDetails` y su campo `truncated`. Para el historial Standard completo, usa `GetExecutionHistory`. Para payloads grandes, pasa referencias de Amazon S3 en el flujo en vez de depender de una copia truncada en los logs. Revisa [el detalle del truncamiento](https://docs.aws.amazon.com/step-functions/latest/apireference/API_HistoryEventExecutionDataDetails.html) y [las alternativas para cargas grandes](https://docs.aws.amazon.com/step-functions/latest/dg/sfn-best-practices.html).

Los registros de Step Functions describen los eventos de la máquina de estados. Los registros de una tarea, como la salida de una función Lambda, pertenecen al servicio que la ejecuta y se consultan en su grupo de logs. La vista de ejecución de Step Functions ofrece enlaces a esos registros para las tareas que los generan. Para familiarizarte con los logs que publican las aplicaciones serverless, esta [grabación sobre CloudWatch y logs estructurados](https://www.youtube.com/watch?v=UBPPGJaBIVY) muestra una perspectiva complementaria, con ejemplos de 2022 para logs de aplicación; no configura el historial de Step Functions.

El historial indica qué estado falló y qué datos intercambió cada paso. Si además necesitas examinar la latencia entre llamadas a servicios, consulta la [guía de trazas con AWS X-Ray y OpenTelemetry](https://dondeaprendoaws.com/blog/observabilidad-en-aws-con-amazon-x-ray/). Step Functions admite trazas para máquinas Standard y Express cuando X-Ray está habilitado; la cobertura depende del soporte o la instrumentación de cada integración, y no incluye las ejecuciones hijas de un `Map` distribuido. X-Ray aplica muestreo, así que una ejecución sin traza no demuestra por sí sola que no haya ocurrido. Revisa [las condiciones y límites actuales](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-xray-tracing.html) antes de interpretar una traza como evidencia de todas las llamadas.

## Busca fallos y duraciones con Logs Insights

En CloudWatch Logs Insights, selecciona el grupo configurado para la máquina y limita el intervalo al período que estás investigando. Esta consulta adaptada a partir del ejemplo de AWS muestra la hora, el ARN de ejecución y los fallos Express recientes:

```text
fields @timestamp, execution_arn, type
| filter type in ["ExecutionFailed", "ExecutionAborted", "ExecutionTimedOut"]
| sort @timestamp desc
| limit 100
```

El ARN permite localizar la ejecución concreta en la consola de Step Functions y revisar su estado y causa.

Para ordenar ejecuciones por duración y ver su último estado registrado, usa esta consulta oficial:

```text
fields ispresent(execution_arn) as exec_arn
| filter exec_arn
| filter type in ["ExecutionStarted", "ExecutionSucceeded", "ExecutionFailed", "ExecutionAborted", "ExecutionTimedOut"]
| stats latest(type) as status,
    tomillis(earliest(event_timestamp)) as UTC_starttime,
    tomillis(latest(event_timestamp)) as UTC_endtime,
    latest(event_timestamp) - earliest(event_timestamp) as duration_in_ms by execution_arn
| sort duration_in_ms desc
```

La consulta de fallos adapta los campos del ejemplo oficial; la consulta de duración está copiada de la [guía de solución de problemas de Express](https://docs.aws.amazon.com/step-functions/latest/dg/troubleshooting.html). Las operaciones `fields`, `filter`, `sort` y `limit` pertenecen al [lenguaje de consulta de Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html). Ejecuta la consulta de duración sobre un intervalo con ejecuciones finalizadas: si una ejecución sigue abierta, no habrá un evento terminal; si faltan eventos por la entrega de mejor esfuerzo, el tiempo calculado puede ser menor que la duración real. Los registros también pueden llegar tarde. Logs Insights cobra por los datos que analiza: elige solo los grupos necesarios y un rango de tiempo acotado. Revisa las [tarifas de CloudWatch Logs](https://aws.amazon.com/cloudwatch/pricing/) y establece una política de retención adecuada para cada grupo.

## Vigila métricas y configura alarmas

Step Functions publica métricas en el espacio `AWS/States`. Para observar una máquina específica, filtra por la dimensión `StateMachineArn`. Tanto Standard como Express emiten métricas de estado como `ExecutionsFailed` y `ExecutionsTimedOut`. **`ExecutionThrottled` sirve para investigar retrasos por la cuota de transiciones Standard**; Express no tiene el mismo límite de tasa de transiciones. Express también publica métricas específicas como `ExpressExecutionBilledDuration` y `ExpressExecutionBilledMemory` para revisar el tiempo y la memoria facturados. CloudWatch puede crear una alarma sobre una métrica y notificar por Amazon SNS cuando se cumple el umbral.

Para métricas de conteo, AWS recomienda la estadística `Sum`. No uses `SampleCount` como cantidad exacta de ejecuciones: Step Functions emite dos puntos para cada `ExecutionsStarted`, y otras métricas de estado pueden repetirse por su entrega al menos una vez. Además, las métricas llegan con el mejor esfuerzo, pueden retrasarse y no equivalen a un registro contable completo. Úsalas para seguimiento operativo y alarmas, y confirma la causa en el historial o los logs. Consulta [las métricas, dimensiones y alarmas de Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/procedure-cw-metrics.html).

El umbral de una alarma depende de lo que sea normal para tu carga. Por ejemplo, puedes alertar cuando `ExecutionsFailed` sea mayor que cero durante el período de evaluación que tenga sentido para el proceso. Ajusta el período y las acciones para que respondan al objetivo operativo de tu aplicación; no conviertas una alarma en una suposición de que cada métrica llegará a tiempo.

Para repasar el diseño de alarmas como infraestructura, puedes ver la [grabación de Marcia Villalba sobre CloudWatch Alarms](https://www.youtube.com/watch?v=uS0QE0NeqpA), publicada en 2022. Es material general, no una guía específica de Step Functions; verifica los nombres actuales de las métricas en la documentación enlazada arriba.

## Usa EventBridge para reaccionar al estado de la ejecución

EventBridge recibe de Step Functions el evento `Step Functions Execution Status Change` en el bus predeterminado. **Solo los flujos Standard envían este evento** y representa cambios en el estado de una ejecución, no cada transición entre estados. EventBridge entrega estos eventos con el mejor esfuerzo y pueden llegar desordenados. Sirven para notificar o iniciar una respuesta automatizada; no reemplazan el historial de ejecución ni el almacenamiento duradero.

Este patrón coincide con ejecuciones fallidas, vencidas o abortadas de una máquina concreta:

```json
{
  "source": ["aws.states"],
  "detail-type": ["Step Functions Execution Status Change"],
  "detail": {
    "status": ["FAILED", "TIMED_OUT", "ABORTED"],
    "stateMachineArn": ["arn:aws:states:REGION:ACCOUNT_ID:stateMachine:MI_FLUJO"]
  }
}
```

Asocia la regla a un destino, por ejemplo SNS, y configura sus permisos. El evento es un aviso sobre el estado de la ejecución; abre el historial Standard para averiguar qué estado produjo el fallo. Para Express, usa los registros de CloudWatch. Consulta [la referencia de eventos de Step Functions en EventBridge](https://docs.aws.amazon.com/step-functions/latest/dg/eventbridge-integration.html), que incluye la forma del evento y ejemplos de patrones.

## Sigue aprendiendo y practica en comunidad

- Para una práctica guiada, consulta el [AWS Step Functions Workshop](https://catalog.workshops.aws/stepfunctions/en-US), disponible en inglés. Antes de ejecutar los módulos, revisa qué recursos crean, sus permisos, posibles cargos y las instrucciones de limpieza.
- La grabación [Aprende sobre máquinas de estado con AWS Step Functions](https://www.youtube.com/watch?v=rvhOKO-XROs), del AWS User Group Guatemala, muestra conceptos y una demostración de consola. Es de 2023; úsala para repasar el servicio y verifica la configuración actual en la documentación.
- Si buscas una comunidad para hacer preguntas y conversar sobre AWS, visita el [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/). Su página tiene una sección de discusiones y enlaces a sus canales.
- El archivo de [eventos y grabaciones de AWS Women Colombia](https://awswomencolombia.com/page/eventos) permite explorar sesiones técnicas en español y seguir sus próximas actividades. La página enlaza su grupo de Meetup y su canal de YouTube; las grabaciones corresponden a encuentros pasados.
- Si quieres ampliar el tema hacia la resiliencia de aplicaciones serverless, AWS User Group Serverless Colombia anuncia el encuentro virtual [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/). La ficha consultada indica martes 20 de octubre de 2026, 19:00 (hora de Colombia) y acceso libre; confirma fecha y condiciones en Meetup. El encuentro es sobre SQS y Lambda, no sobre Step Functions.

Si la ejecución cruza servicios y necesitas encontrar todos sus eventos mediante un identificador común, sigue con [la guía para correlacionar eventos con `correlationId`](https://dondeaprendoaws.com/blog/correlacion-de-eventos-con-step-functions-y-cloudwatch/).
