---
title: "Detección de anomalías en CloudWatch Logs: configuración y alertas"
description: "Aprende a configurar la detección de anomalías en CloudWatch Logs, revisar sus límites, crear alertas y entender los costos con una guía para consola y AWS CLI."
author: "guille-ojeda"
publishedAt: "2025-01-27"
publishedTimestamp: "2025-01-27T00:39:09.213Z"
modifiedTimestamp: "2026-10-06T13:58:52-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Métricas DevOps en AWS: DORA, fiabilidad y costos"
    url: "https://dondeaprendoaws.com/blog/10-metricas-clave-de-devops-en-aws/"
---

CloudWatch Logs puede detectar cambios inusuales en los patrones de tus registros, como un mensaje de error nuevo o un aumento repentino de eventos. Para vigilar un grupo de logs de forma continua, crea un detector de anomalías. Esta función analiza patrones de texto; no es el detector de anomalías de métricas que crea una banda alrededor de CPU u otra serie numérica.

AWS ofrece tres opciones con nombres parecidos:

| Necesidad | Opción |
| --- | --- |
| Vigilar continuamente los eventos nuevos de un grupo de logs | Detector de anomalías de CloudWatch Logs |
| Investigar un período de logs bajo demanda | Comando <code>anomaly</code> de CloudWatch Logs Insights |
| Detectar cambios en una métrica numérica, como <code>CPUUtilization</code> | Detección de anomalías de métricas de CloudWatch |

Si necesitas repasar la diferencia entre métricas, logs y trazas, mira [CloudWatch explicado fácil](https://www.youtube.com/watch?v=48f2d-oM00Y), de [Marcia en Desplegando Cloud](https://www.youtube.com/@marcia_). Es una introducción a CloudWatch; para configurar el detector sigue los pasos y la documentación de esta guía.

El detector de logs aprende patrones repetidos, separa texto fijo de valores variables —como un ID de solicitud— y señala patrones nuevos o cambios importantes en su frecuencia o valores. La prioridad de una anomalía no es un porcentaje de probabilidad que configures: CloudWatch la calcula a partir de la gravedad del patrón y cuánto se aparta de lo esperado. La gravedad del patrón puede basarse en palabras como <code>FATAL</code>, <code>ERROR</code> y <code>WARN</code>.

**Ejemplo hipotético.** Una función en <code>/aws/lambda/pedidos-prod</code> registra repetidamente pedidos procesados. Después de una versión, empieza a emitir un mensaje nuevo, como <code>ERROR timeout al guardar pedido</code>. El detector podría mostrar ese patrón como una anomalía. Revisa la muestra, la hora del despliegue y la tendencia antes de decidir si debes revertir el cambio: la señal identifica una diferencia, no confirma por sí sola su causa.

## Requisitos y límites que conviene conocer

El detector se asocia con un grupo de logs de la misma cuenta y Región. El grupo debe usar la clase **Standard**; la detección de anomalías no está disponible para grupos **Infrequent Access (IA)**. La clase Delivery se destina a entregar logs de Lambda a S3 o Firehose y tampoco es una opción para el análisis completo de CloudWatch Logs. Comprueba la clase antes de elegir el grupo: no se puede cambiar después de crearlo. Consulta la [tabla de funciones por clase de log](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html).

Los logs de aplicaciones con formatos repetidos suelen ser un buen punto de partida. Los registros de auditoría o acceso, como CloudTrail y VPC Flow Logs, pueden ser menos adecuados para detectar problemas de aplicaciones. En líneas de más de 1.500 caracteres, el análisis de patrones considera solo los primeros 1.500; los campos que queden después no se toman en cuenta. AWS recomienda usar el recuento de patrones como señal de idoneidad: un grupo con alrededor de 300 patrones o menos podría funcionar bien. Es una orientación, no un límite máximo de patrones.

Para profundizar en el formato de los eventos, la grabación de Marcia [cómo hacer logs estructurados y métricas personalizadas en aplicaciones serverless](https://www.youtube.com/watch?v=UBPPGJaBIVY), publicada en 2022, ofrece contexto sobre ambos tipos de señal. Úsala para entender los conceptos y contrasta los pasos de configuración con la documentación vigente.

Cada detector puede vigilar un solo grupo de logs. La cuota predeterminada es de 500 detectores activos por cuenta y Región, y se puede solicitar un aumento. El detector es regional: créalo en la Región donde está el grupo y confirma que la función esté disponible allí en la consola. La [tabla vigente de cuotas de CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html) muestra el límite para cada Región compatible.

## Crear un detector

Antes de empezar, elige un grupo Standard que reciba registros de aplicación y confirma que tu rol de IAM permite consultar el grupo y crear, ver y eliminar detectores. No necesitas crear métricas o filtros de métricas para activar la detección: el detector inspecciona los eventos del grupo. El patrón de filtro es opcional y usa la sintaxis de filtros de CloudWatch Logs, no una consulta de Logs Insights.

Si todavía no sabes en qué grupo aparecen los registros de tu aplicación, empieza por el video [¿Dónde están mis logs en AWS? CloudWatch explicado para desarrolladores serverless](https://www.youtube.com/watch?v=tsCvaRv5EkU), de Marcia Villalba. Localizar los logs es el paso previo a elegir qué grupo analizar.

### Desde la consola

1. Abre CloudWatch en la misma cuenta y Región que el grupo.
2. En el panel de navegación, elige **Logs**, **Log Anomalies** y **Create anomaly detector**.
3. Selecciona el grupo y asigna un nombre al detector.
4. Conserva o cambia la frecuencia de evaluación. El valor predeterminado es cinco minutos; elige una frecuencia que tenga sentido para el ritmo con que llegan tus logs. Las opciones de la API son uno, cinco, diez, quince o treinta minutos y una hora.
5. Deja el filtro vacío para comenzar con todos los eventos o agrega un patrón si quieres limitar qué mensajes se analizan. Puedes probarlo con mensajes de ejemplo en la consola.
6. En la configuración avanzada, si lo necesitas, cambia el período máximo de visibilidad de anomalías.
7. Elige **Enable Anomaly Detection**.

CloudWatch entrena el modelo con los eventos de las dos semanas anteriores del grupo. Ese período histórico no significa que debas esperar dos semanas después de crear el detector: AWS indica que el entrenamiento puede tardar hasta 15 minutos. Cuando termina, el estado pasa a analizar logs entrantes. Revisa **Logs → Log Anomalies** para ver el resumen, la prioridad, el patrón, la tendencia y muestras de eventos.

### Con AWS CLI

El siguiente ejemplo crea un detector para un grupo existente de Lambda en <code>us-east-1</code>. Sustituye el número de cuenta y el grupo por los tuyos:

~~~bash
aws logs create-log-anomaly-detector \
  --detector-name pedidos-prod \
  --log-group-arn-list \
    "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/pedidos-prod" \
  --evaluation-frequency FIVE_MIN \
  --region us-east-1
~~~

El ARN que recibe <code>--log-group-arn-list</code> no lleva el sufijo <code>:*</code>. Si copias el ARN mostrado por <code>describe-log-groups</code>, quita ese sufijo; el objeto de grupo también ofrece el campo <code>logGroupArn</code> sin él. Aunque el parámetro se llame “lista”, la API permite un solo grupo por detector. La respuesta de creación incluye <code>anomalyDetectorArn</code>.

Para revisar el estado y eliminar el detector cuando termines:

~~~bash
aws logs list-log-anomaly-detectors --region us-east-1
aws logs delete-log-anomaly-detector \
  --anomaly-detector-arn \
    "PEGA_AQUI_EL_ARN_DEVUELTO_AL_CREAR" \
  --region us-east-1
~~~

La eliminación borra el detector, no el grupo de logs. Consulta la [referencia del comando para crear detectores](https://docs.aws.amazon.com/cli/latest/reference/logs/create-log-anomaly-detector.html) y la [referencia para eliminarlos](https://docs.aws.amazon.com/cli/latest/reference/logs/delete-log-anomaly-detector.html).

## Crear una alarma y decidir qué hacer

Un hallazgo no siempre indica un incidente. Por ejemplo, un aumento de respuestas <code>200</code> puede apartarse de la frecuencia normal y aun así ser positivo. Abre el patrón y revisa las muestras y la tendencia antes de cambiar la aplicación o suprimir la anomalía.

AWS documenta este flujo en [crear alarmas para detectores de anomalías de logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/LogsAnomalyDetection-Alarms.html). Para notificarte cuando aparezcan anomalías:

1. En **Logs → Log Anomalies**, selecciona el detector y elige **Create alarm**.
2. La alarma usa la métrica <code>AnomalyCount</code> del espacio de nombres <code>AWS/Logs</code>. Si lo deseas, filtra por prioridad: <code>HIGH</code> cuenta solo anomalías altas; <code>MEDIUM</code> cuenta las de prioridad media y alta.
3. Define el número de anomalías y el período que harán entrar a la alarma en estado <code>ALARM</code>. Puedes usar un umbral estático; también se permite una banda de detección de anomalías para esta métrica de recuento, pero no es obligatorio ni sustituye al detector de logs.
4. Configura la acción de la alarma. CloudWatch admite [notificaciones por SNS e invocación de Lambda](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarm-actions.html); también puedes [reaccionar a cambios de estado con EventBridge](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch-and-eventbridge.html).

No se configura una severidad del 80 % ni una ventana mínima de 15 minutos. La alarma evalúa el recuento de anomalías durante el período elegido y puede filtrar por prioridad. Si el objetivo es una CPU que sale de su rango habitual, configura una [alarma de anomalía de métricas](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Anomaly_Detection.html); es otro modelo y sus alarmas pueden generar cargos. Para profundizar en señales numéricas y fiabilidad, consulta nuestra guía de [métricas DevOps en AWS](https://dondeaprendoaws.com/blog/10-metricas-clave-de-devops-en-aws/).

Para una introducción general a las alarmas, puedes ver [Observabilidad de tus aplicaciones de nube: CloudWatch Alarms](https://www.youtube.com/watch?v=uS0QE0NeqpA), de Marcia. Complementa la configuración del detector con conceptos de alarmas; para las funciones actuales de anomalías de logs, consulta las referencias oficiales de esta sección.

## Costos y mantenimiento

AWS indica que crear el detector de anomalías de logs no genera un cargo separado; el anuncio del servicio dice que la detección está incluida en los cargos de ingesta de logs. Aun así, se aplican los precios normales de ingesta y retención de los eventos. Las consultas de Logs Insights, las alarmas, las acciones que configures y una clave KMS pueden tener cargos propios. Revisa la [página de precios de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) para tu Región y uso.

El período máximo de visibilidad de anomalías es de 21 días de forma predeterminada y se puede configurar entre 7 y 90 días. Al terminar ese período, una anomalía que continúa puede pasar a considerarse comportamiento normal y dejar de señalarse. Puedes suprimir una anomalía concreta o todas las asociadas a un patrón por un tiempo definido o sin vencimiento; si lo haces, sigue revisando las muestras para no ocultar un problema real.

## Preguntas frecuentes

### ¿Tengo que esperar dos semanas para ver anomalías?

No. El modelo usa los eventos de las dos semanas anteriores como contexto de entrenamiento, y AWS indica que el entrenamiento puede tardar hasta 15 minutos. Si el grupo tiene poco historial o recibe eventos con poca frecuencia, revisa los resultados con cuidado: una base escasa puede aportar menos contexto.

### ¿Qué hago si el detector no muestra anomalías?

Confirma que el detector haya terminado el entrenamiento y esté analizando. Comprueba que la Región y la clase del grupo sean compatibles, que el grupo reciba eventos nuevos y que el filtro opcional no excluya los mensajes que buscas. Usa el análisis de patrones de Logs Insights para saber si los eventos forman patrones repetibles. Ten presente que las partes de los eventos ocultas por el enmascaramiento de datos sensibles no se analizan.

### ¿Puedo recibir una alerta en Lambda?

Sí. Crea una alarma desde el detector y elige Lambda como acción de CloudWatch, o envía el cambio de estado a EventBridge para orquestar una respuesta. Revisa los permisos de invocación de Lambda y prueba la acción con el procedimiento operativo de tu equipo.

### ¿El detector reemplaza una alarma de métricas?

No. El detector de logs analiza patrones de texto, mientras que una alarma de métricas evalúa una serie numérica, como CPU o latencia. Se pueden usar en conjunto: una señal encuentra un cambio en los mensajes y la otra mide el comportamiento de un recurso o servicio.

## Recursos y comunidad

- La [guía oficial de detección de anomalías en CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/LogsAnomalyDetection.html) reúne el flujo continuo, las prioridades, la supresión y las limitaciones.
- Si buscas anomalías en una consulta histórica, consulta [detección de anomalías en Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/LogsAnomalyDetection-Insights.html). Para inspeccionar si los eventos de un grupo forman patrones, revisa [análisis de patrones](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_AnalyzeLogData_Patterns.html).
- Para ubicar logs, métricas y trazas en el panorama de observabilidad, lee esta [introducción en español a CloudWatch, X-Ray y CloudTrail](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m). La charla embebida está en inglés.
- El [canal de AWS User Group Caracas](https://www.youtube.com/@awsugcaracas) publicó [Grupo de estudio 📚🧠 Cloud Practitioner 2024 - 28.2.2024 - Laboratorio práctico de Amazon CloudWatch](https://www.youtube.com/watch?v=ZdMM2W0vrvA). Es material comunitario de fundamentos de métricas y monitoreo, no un tutorial del detector de anomalías.
- Para conversar con otras personas que trabajan o aprenden AWS, puedes visitar el [grupo de AWS User Group Caracas en Telegram](https://t.me/awsCaracas); el directorio [AWS User Groups](https://builder.aws.com/community/user-groups) permite buscar grupos locales o virtuales y consultar sus actividades.
- También puedes explorar las [comunidades AWS en Latinoamérica](https://dondeaprendoaws.com/comunidades/) y la [agenda de eventos AWS](https://dondeaprendoaws.com/eventos/). Sus listados cambian y abarcan distintos temas: revisa la ficha o agenda para confirmar el formato y si habrá una sesión sobre CloudWatch.
