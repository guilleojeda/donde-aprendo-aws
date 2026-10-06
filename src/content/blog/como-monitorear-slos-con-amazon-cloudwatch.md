---
title: "Cómo crear SLOs en AWS con CloudWatch Application Signals"
description: "Define indicadores de disponibilidad y latencia, calcula el error budget y configura alertas de burn rate con CloudWatch Application Signals."
author: "guille-ojeda"
publishedAt: "2025-02-24"
modifiedTimestamp: "2026-10-06T10:03:48-03:00"
publishedTimestamp: "2025-02-24T06:43:53.013Z"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cómo habilitar CloudWatch Logs en API Gateway: REST, HTTP y WebSocket"
    url: "https://dondeaprendoaws.com/blog/como-habilitar-cloudwatch-logs-en-api-gateway-guia-paso-a-paso/"
  - title: "AWS X-Ray: trazas, diagnóstico y OpenTelemetry"
    url: "https://dondeaprendoaws.com/blog/aws-x-ray-herramientas-de-depuracion-y-rastreo-distribuido/"

review:
  date: "2026-10-06"
---

Para monitorear SLOs en AWS, elige una métrica que represente la experiencia de una operación, define qué resultado cuenta como bueno y fija una meta para un intervalo. CloudWatch Application Signals permite crear SLOs con sus métricas de disponibilidad y latencia, o con una métrica de CloudWatch y una expresión de Metric Math. Puedes evaluar el resultado por períodos o por solicitudes, y configurar alarmas de presupuesto de error y burn rate.

En esta guía vas a crear dos SLOs para la operación técnica `POST /checkout`: que el 99,9 % de las solicitudes no registre `Fault` según `Availability`, y que el 99 % responda en 300 ms o menos durante una ventana móvil de 28 días. La disponibilidad estándar cuenta las respuestas 4xx como exitosas; eso no garantiza que la lógica de negocio haya completado una compra. Si un rechazo de negocio debe contar como fallo, crea un SLI propio que lo incluya. Los valores son un ejemplo; ajústalos a los usuarios, el tráfico y los compromisos de tu servicio.

## SLI, SLO, SLA y presupuesto de error

Un **SLI** es la medición que eliges, como disponibilidad o latencia. Un **SLO** es la meta para ese indicador dentro de un intervalo. Un **SLA** es el acuerdo de servicio con un cliente y puede especificar qué ocurre si no se cumple. Un SLO operativo ayuda a detectar el riesgo de incumplir ese acuerdo, pero no lo reemplaza. AWS explica estos conceptos y su relación en su guía de [SLO eficaces](https://aws.amazon.com/blogs/mt/improve-application-reliability-with-effective-slos/).

El **presupuesto de error** es lo que el objetivo permite que falle. Si el objetivo es 99,9 % de solicitudes buenas, queda un presupuesto de 0,1 % de solicitudes malas en el intervalo. En un objetivo por períodos, el presupuesto se expresa como la proporción de períodos que pueden quedar por debajo del umbral.

Un objetivo del 100 % deja presupuesto cero: una sola solicitud o un período fallido hace imposible cumplirlo en ese intervalo. AWS recomienda fijar una meta alcanzable según las expectativas de los usuarios y el comportamiento real del servicio; 99 %, 99,9 % o 99,99 % no son valores universales.

## Elige una métrica que refleje el resultado del usuario

Application Signals recopila `Availability` y `Latency` para los servicios y operaciones que descubre. También registra `Fault` y `Error`. Revisa la definición de [métricas de Application Signals](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AppSignals-MetricsCollected.html) antes de usarlas:

- Application Signals calcula la disponibilidad estándar como `(1 - Faults / Total) × 100`. Las respuestas HTTP 5xx cuentan como fallos y las 4xx se consideran exitosas; la métrica `Error` registra los errores 4xx por separado. La métrica `Fault` también contempla errores de estado de spans de OpenTelemetry.
- `Latency` mide la demora de respuesta en milisegundos. Una meta como “el 99 % de las solicitudes tarda 300 ms o menos” describe mejor la experiencia que un promedio que puede ocultar respuestas lentas.
- Una alarma sobre el conteo de 5xx es una señal operativa, no un SLO completo: no mide por sí sola la latencia, el objetivo de cumplimiento a largo plazo ni los errores de negocio. Si un 4xx representa un resultado fallido para tu producto, define un SLI propio que lo incluya.

Puedes usar cualquier métrica de CloudWatch o expresión de Metric Math que produzca una serie temporal. Para una métrica propia por solicitudes, el cálculo básico es `solicitudes buenas / solicitudes totales`. Asegúrate de que numerador y denominador correspondan a la misma operación, dimensiones e intervalo.

## Evaluación por períodos o por solicitudes

CloudWatch ofrece dos formas de calcular el cumplimiento:

- **Por períodos (`Periods`)**: compara una estadística agregada con el umbral en cada período corto. El attainment es `períodos buenos / períodos totales`. Si un período resulta malo, toda su duración cuenta contra el presupuesto. Por ejemplo, con intervalos de un minuto, el SLO mide qué porcentaje de esos minutos pasó el umbral.
- **Por solicitudes (`Requests`)**: mide `solicitudes buenas / solicitudes totales` en el intervalo. Cada solicitud pesa en el resultado; esto suele ser más adecuado cuando el volumen cambia mucho entre períodos.

El **intervalo** del SLO es otra elección. Un intervalo de calendario, como un mes, se alinea con el período de informes y reinicia el cálculo al comenzar el siguiente. Un intervalo móvil de 28 días siempre mira hacia atrás 28 días; es útil para seguir la experiencia reciente sin esperar al cambio de mes. La [guía de SLOs de CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-ServiceLevelObjectives.html) explica cómo se relacionan evaluación, períodos e intervalos. Las ventanas de una alarma de métricas tienen una configuración independiente: las ventanas móviles evalúan datos recientes y las de reloj esperan los límites de tiempo definidos. No confundas esa opción de alarma con el intervalo calendario o móvil del SLO; consulta la [evaluación de alarmas por ventanas de tiempo](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarm-evaluation-window.html) y esta explicación de [ventanas de reloj en alarmas de CloudWatch](https://builder.aws.com/content/3Jw3mQgso7GLIzENc1b524e3L9z/alarmas-de-amazon-cloud-watch-con-ventana-de-reloj-un-da-no-es-lo-mismo-que-horas).

En un SLO request-based, el presupuesto de solicitudes se calcula como `(1 - objetivo decimal) × solicitudes totales`. Por ejemplo, un objetivo de 99,9 % permite un máximo de 1.000 solicitudes malas por cada 1.000.000 solicitudes del intervalo: `0,001 × 1.000.000 = 1.000`. Un objetivo del 99 % permitiría 10.000 en ese mismo volumen. Ese presupuesto cuenta solicitudes; no equivale a minutos de indisponibilidad.

## Requisitos antes de crear el SLO

Application Signals necesita recibir telemetría de la aplicación. Primero activa el descubrimiento de servicios en la cuenta; AWS crea el rol vinculado al servicio que necesita para leer las señales. Después habilita la instrumentación adecuada para la aplicación y genera tráfico representativo.

AWS documenta como plataformas compatibles y probadas Amazon EKS, Kubernetes nativo, Amazon ECS y Amazon EC2; Lambda tiene un [procedimiento de habilitación propio](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-Enable-LambdaMain.html). Los lenguajes, runtimes y bibliotecas compatibles dependen del método de instrumentación: revisa la [matriz de sistemas e instrumentación](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-supportmatrix.html) para tu entorno.

Antes de configurar el objetivo, confirma en CloudWatch que aparecen el servicio, la operación y sus métricas `Availability` o `Latency`. AWS indica que descubrir un servicio puede tardar hasta 10 minutos y evaluar la salud del SLI hasta 15 minutos. Las listas de servicios y operaciones también dependen de la actividad reciente. Consulta la guía de [habilitación de Application Signals](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-Enable.html) si la telemetría no aparece.

## Crea dos SLOs para una operación de compra

1. Abre CloudWatch y elige **Service Level Objectives (SLO)**, luego **Create SLO**.
2. En el tipo de indicador, elige **Service**. Selecciona la aplicación, el servicio y la operación que representa el recorrido de compra, por ejemplo `POST /checkout`.
3. Para el primer SLO, elige **Requests** y `Availability`. Define un attainment de **99,9 %** y un intervalo móvil de **28 días**. Esto mide la proporción de solicitudes exitosas de esa operación en toda la ventana.
4. Crea un segundo SLO para latencia: elige **Requests**, selecciona `Latency` y configura el límite de **300 ms** con attainment de **99 %** en el mismo intervalo. Así separas el objetivo de disponibilidad del objetivo de rapidez.
5. Configura las alarmas de SLO o de burn rate y, si corresponde, una notificación con Amazon SNS. Verifica que los umbrales representen acciones concretas para el equipo que recibe la alerta.

Si ya tienes datos históricos, Application Signals puede recomendar umbrales, attainment y ventanas de burn rate a partir de los últimos 30 días. Tómalos como punto de partida: confirma que encajan con el resultado que necesitan los usuarios y el negocio.

Si la operación aún no aparece como servicio instrumentado, puedes crear el SLO con una métrica de CloudWatch o una expresión de Metric Math. Para un SLO request-based, define un conteo de solicitudes que cumplen la condición del SLI y otro conteo total, con las mismas dimensiones y período. Para latencia propia, especifica qué observaciones cuentan como buenas y comprueba cómo las agrega la estadística que elijas antes de guardar.

Si partes de logs estructurados, esta [guía comunitaria para construir SLIs desde logs](https://builder.aws.com/content/3IlpApiKwsNpk6eWH4T0NdgFfkf/observabilidad-desde-los-logs-como-construir-slis-sin-esperar-a-que-alguien-instrumente-el-codigo) compara filtros de métricas, Embedded Metric Format y Logs Insights. Los filtros convierten eventos nuevos en métricas y solo funcionan con grupos de logs de clase Standard, según la [documentación de AWS](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/MonitoringLogData.html).

## Calcula el burn rate y elige alarmas

El **burn rate** indica cuántas veces más rápido o más lento se consume el presupuesto frente al ritmo permitido por el objetivo. Un valor de 1 representa el ritmo esperado; un valor superior a 1 implica que el presupuesto puede agotarse antes de terminar el intervalo.

Puedes definir una alarma con esta fórmula:

```text
umbral de burn rate = fracción del presupuesto que se permite consumir × duración del intervalo / ventana de observación
```

Para ver la unidad con claridad, considera un SLO **por períodos** con períodos de un minuto, objetivo de 99 % e intervalo móvil de 28 días: hay `40.320` períodos y su presupuesto es 1 % de ellos. Si quieres alertar cuando el ritmo observado equivale a consumir el 2 % de ese presupuesto en una ventana de 60 minutos, el umbral es `0,02 × 40.320 / 60 = 13,44`. Configura la alarma para ese burn rate durante 60 minutos: `13,44` significa 13,44 veces el ritmo de error permitido por el objetivo, no 13,44 % de solicitudes fallidas.

La misma fórmula sirve para un SLO por solicitudes, pero la interpretación como porcentaje de **solicitudes** consumidas en una hora depende del tráfico observado: el volumen cambia y el presupuesto absoluto de solicitudes también. En ese caso, lee `13,44` como un umbral de ritmo respecto a la tasa permitida, no como una garantía de que se gastó exactamente 2 % del presupuesto de solicitudes. La guía de AWS requiere que la ventana de burn rate sea múltiplo del período del SLO y menor que su intervalo.

Puedes combinar una ventana larga con otra corta y notificar solo cuando ambas excedan el umbral; así detectas un problema que sigue ocurriendo y evitas reaccionar a un pico aislado. Usa el [procedimiento de burn rate de CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-ServiceLevelObjectives.html) para escoger ventanas y configurar alarmas compuestas.

## Diagnostica datos ausentes antes de silenciar alertas

La falta de una métrica puede indicar cero tráfico, una operación inactiva, un problema de permisos, instrumentación detenida o retraso de publicación. No la trates automáticamente como señal saludable. Comprueba región y cuenta, genera solicitudes de prueba, confirma que el agente o la capa de instrumentación esté activo y revisa que la serie tenga dimensiones compatibles.

Application Signals calcula el burn rate a partir del attainment cuando no hay datos para la ventana de burn rate. Para las alarmas normales de CloudWatch, el tratamiento de datos ausentes es una opción aparte: `missing`, `notBreaching`, `breaching` o `ignore`. Elige según el comportamiento de esa señal; una métrica de tráfico continuo y un contador que solo aparece al ocurrir un error no deben recibir necesariamente el mismo tratamiento. Si dejar de recibir telemetría debe despertar al equipo, crea una comprobación separada de actividad o de envío de métricas. Revisa la guía de [datos ausentes en alarmas de CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html).

Si tienes poco tráfico real, un canary de CloudWatch Synthetics puede probar un recorrido importante desde una ubicación externa. Su SLO es por períodos y mide las ejecuciones del canary; complementa una SLI de solicitudes reales, pero no la reemplaza. Con varias ubicaciones puedes comparar si falla una región o el recorrido en general; cada réplica agrega ejecuciones y costo. Revisa la [documentación de canaries en múltiples ubicaciones](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Synthetics_Canaries_MultiLocation.html) y la explicación comunitaria de [cuántas ubicaciones deben fallar para alertar](https://builder.aws.com/content/3K46jibaz3OPYJp7TT5yFsTue4j/canaries-multiubicacin-en-amazon-cloud-watch-synthetics-cuntas-ubicaciones-tienen-que-fallar-para-despertar-a-alguien). La guía de SLOs también documenta SLOs para canaries.

Para aplicaciones instrumentadas, los Service Events de Application Signals reúnen eventos de rendimiento, errores y despliegues que ayudan a investigar qué cambió alrededor de una degradación. Consulta la [documentación de Service Events](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-ServiceEvents.html) para ver qué eventos captura, y esta [introducción comunitaria a Service Events](https://builder.aws.com/content/3JfhMyOFONdCzpGDYBsVRaKzPPH/service-events-en-amazon-cloud-watch-application-signals-el-detalle-ya-estaba-capturado). Son contexto para diagnosticar, no un sustituto del SLI ni de una alarma de telemetría ausente.

Para una operación de API Gateway, los logs de ejecución y acceso ayudan a investigar una alarma: consulta la [guía para habilitar CloudWatch Logs en API Gateway](https://dondeaprendoaws.com/blog/como-habilitar-cloudwatch-logs-en-api-gateway-guia-paso-a-paso/). Si el SLO se degrada por una dependencia o una llamada lenta, las [trazas de AWS X-Ray y OpenTelemetry](https://dondeaprendoaws.com/blog/aws-x-ray-herramientas-de-depuracion-y-rastreo-distribuido/) permiten seguir el recorrido y localizar el tramo afectado.

## Costos y limpieza

Application Signals cobra por la telemetría de solicitudes entrantes y salientes; cada SLO añade dos Application Signals por período de métrica de SLI. El intervalo que evalúas no es el único factor: el número de SLOs y la frecuencia de sus períodos también influyen. Además pueden cobrarse las métricas personalizadas, alarmas, logs, consultas de Logs Insights, trazas y funciones de observabilidad que habilites. Revisa los [precios vigentes de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) con tu volumen, región y configuración antes de extenderlo a más operaciones.

Evita dimensiones únicas por solicitud, como `requestId` o `userId`, en métricas personalizadas: cada combinación de dimensiones puede crear otra métrica facturable. La documentación de [CloudWatch Embedded Metric Format](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html) explica el efecto de las dimensiones de alta cardinalidad. Define también la retención de logs y ajusta el volumen de trazas a tus necesidades operativas.

Cuando retires el SLO, bórralo desde **Actions > Delete SLO** y revisa las alarmas relacionadas: CloudWatch indica que no se eliminan automáticamente junto con el SLO. Si ya no necesitas recopilar telemetría de la aplicación, desactiva también su instrumentación por separado y revisa las reglas de retención de los datos existentes.

## Recursos, comunidades y eventos

Para ver una charla en español sobre alarmas, consulta la grabación [Observabilidad de tus aplicaciones en la nube: CloudWatch Alarms](https://www.youtube.com/watch?v=uS0QE0NeqpA), publicada por el canal [Marcia en Desplegando Cloud](https://www.youtube.com/@marcia_). El canal [Cloud en Español](https://www.youtube.com/channel/UCjMLZUU8ep124ZZT-W2X4uA) reúne videos y encuentros online con temas que varían según cada sesión.

Para conversar con otros profesionales o aprender en grupo, puedes explorar el [directorio de comunidades AWS por país](/comunidades/) y conocer actividades del [AWS User Group Perú](https://awsugperu.cloud/) o del [AWS User Group Córdoba en Meetup](https://www.meetup.com/aws-user-group-cordoba-argentina/). La [agenda de eventos AWS](/eventos/) muestra fechas, modalidad y enlaces de inscripción de encuentros publicados por las comunidades.

Como contexto general sobre métricas, registros, trazas y auditoría, lee [Observabilidad en la nube de AWS: CloudWatch, X-Ray y CloudTrail](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m), un artículo de AWS Community Builders publicado en 2024. Sus ejemplos son una introducción; usa la documentación oficial actual para configurar Application Signals y SLOs.
