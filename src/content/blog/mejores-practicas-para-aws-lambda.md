---
title: "Mejores prácticas para AWS Lambda: reintentos, concurrencia y seguridad"
description: "Guía práctica de AWS Lambda: reutiliza recursos sin compartir datos entre solicitudes, maneja reintentos con idempotencia, protege dependencias y mide memoria, logs y SnapStart."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:26:48.732Z"
modifiedTimestamp: "2026-10-06T23:48:20-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS Lambda: cómo funciona, invocaciones y concurrencia"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/"
  - title: "Cold starts en AWS Lambda: cómo medirlos y reducir su impacto"
    url: "https://dondeaprendoaws.com/blog/7-estrategias-para-mitigar-cold-starts-en-aws-lambda/"
  - title: "AWS Lambda: cómo medir costo y rendimiento"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/"
---

Las mejores prácticas para AWS Lambda empiezan por una pregunta: **¿quién invoca la función y qué hará ese servicio si algo falla?** Esa respuesta determina cómo configurar reintentos, duplicados, concurrencia y alarmas. A partir de ahí puedes mejorar el rendimiento sin exponer datos ni enviar más trabajo del que tus dependencias soportan.

Esta guía se refiere al modo de cómputo predeterminado de Lambda. Si eliges **Lambda Managed Instances**, revisa su modelo: varias invocaciones pueden ejecutarse en el mismo entorno al mismo tiempo, por lo que el estado mutable requiere aislamiento y seguridad entre hilos. La guía de [Lambda y sus tipos de invocación y concurrencia](https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/) explica cómo ubicar esa configuración en el flujo de tu aplicación.

## Elige y mantén un runtime compatible

Usa una versión de runtime admitida y planifica la migración antes de su fecha de deprecación. La [lista de runtimes de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) publica las fechas previstas; pueden cambiar, así que consulta la tabla vigente en cada actualización. Las versiones en vista previa no son una opción para cargas de producción.

En runtimes administrados, Lambda aplica actualizaciones de runtime automáticamente por defecto. Eso mantiene el runtime al día con parches, pero no sustituye la migración entre versiones principales del lenguaje. Si despliegas una imagen de contenedor, debes reconstruirla desde una imagen base actualizada y volver a desplegarla. Incluye pruebas de compatibilidad en tu flujo de actualización y evita depender de paquetes internos no documentados del runtime.

## Reutiliza recursos, no datos de cada solicitud

Lambda puede reutilizar un entorno de ejecución para invocaciones posteriores de la misma función. Inicializa fuera del handler lo costoso y estable, como clientes de AWS SDK, configuración y conexiones a bases de datos. Así puedes aprovechar esa reutilización sin depender de que el entorno siga disponible: Lambda puede detenerlo en cualquier momento y crear otro.

Separa la validación del evento, la lógica de negocio y la respuesta del handler. Para un procesador de órdenes, por ejemplo, valida la estructura recibida, ejecuta una función de negocio con datos explícitos y devuelve el resultado esperado por el invocador. Esa separación facilita probar la lógica con entradas representativas sin desplegar la integración completa.

No guardes en variables globales datos de un usuario, el evento actual, autorizaciones ni resultados que deban pertenecer a una sola solicitud. El estado permanente debe ir a un almacenamiento duradero; el directorio `/tmp` sirve para datos temporales de un entorno, no para compartir estado ni conservarlo como respaldo. Una variable global puede conservar un valor entre invocaciones reutilizadas y mezclar información si se trata como almacenamiento de sesión.

Las conexiones inactivas pueden cerrarse. Configura el keep-alive apropiado para tu runtime y trata una conexión fallida como algo que debes validar o volver a abrir; no supongas que una conexión creada durante la inicialización sigue viva. AWS resume estas pautas en sus [prácticas recomendadas para Lambda](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html).

## Diseña reintentos e idempotencia según el invocador

Lambda no aplica una única política de reintentos a todas las funciones. En una invocación síncrona, el cliente decide si reintenta. En una invocación asíncrona, Lambda vuelve a intentar por defecto dos veces los errores de la función. En los mapeos de fuentes de eventos, el comportamiento depende de la fuente: SQS vuelve a entregar mensajes según su tiempo de visibilidad y su política de redrive; los flujos como Kinesis o DynamoDB Streams pueden reintentar un lote y bloquear el shard afectado mientras persista un error. Consulta la política específica de tu disparador en la documentación de [reintentos de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html).

En móvil, desplaza las tablas hacia los lados para ver todas las columnas.

| Tipo de invocación | Qué debes revisar |
| --- | --- |
| Síncrona, por ejemplo desde una API | El cliente recibe la respuesta o el error y controla el reintento. Define un timeout coherente entre cliente, API y función. |
| Asíncrona, como un evento de S3 o EventBridge | Revisa intentos, antigüedad máxima del evento y destino de fallos o DLQ; una función con errores puede acumular eventos. |
| Mapeo de una cola o un flujo | Define lotes, retención, reintentos y destino para los registros fallidos. En SQS, configura el tiempo de visibilidad al menos seis veces mayor que el timeout de la función y, si usas una ventana de lote, suma también `MaximumBatchingWindowInSeconds`; consulta la [configuración oficial de SQS con Lambda](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html). |

Asume que un evento puede llegar más de una vez, incluso si tu handler terminó parte del trabajo antes de fallar. Para evitar cobrar dos veces o repetir una operación, vuelve idempotente la acción de negocio:

1. Elige una clave estable del negocio, como `orderId` más el tipo de operación. No uses el ID de invocación de Lambda: cambia en cada intento.
2. Registra esa clave de forma persistente y atómica antes de aplicar el efecto. Guarda también el resultado y define cuánto tiempo debe considerarse duplicado según la ventana de reintentos y reprocesamiento.
3. Si la misma clave ya se completó, devuelve o reutiliza el resultado sin repetir el efecto. Decide qué hacer si otra ejecución todavía la está procesando o si la ejecución anterior falló.
4. Si llamas a un sistema externo, pásale la misma clave de idempotencia cuando lo admita. Lambda no puede hacer atómica una escritura local y un cobro remoto por sí sola.

Puedes implementar el registro con una escritura condicional en un almacén duradero o usar una utilidad de idempotencia de AWS Lambda Powertools adecuada a tu runtime. Por ejemplo, la [guía de Powertools para Python](https://docs.aws.amazon.com/powertools/python/latest/utilities/idempotency/) describe la clave, la caducidad, la gestión de errores y el almacenamiento persistente.

Si procesas una tanda SQS y falla un solo mensaje, por defecto pueden volver a la cola también los que ya se procesaron. Con `ReportBatchItemFailures`, la función puede indicar solo los mensajes fallidos para reintentarlos. Configura esa respuesta en el mapeo y en el handler, y conserva la idempotencia: una respuesta parcial reduce trabajo repetido, pero no elimina todas las entregas duplicadas. La guía de AWS explica [cómo manejar errores de una fuente SQS](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html).

## Usa la concurrencia como límite de capacidad

La concurrencia es el número de invocaciones que están en curso al mismo tiempo. Como estimación inicial para solicitudes individuales, puedes usar:

```text
concurrencia aproximada = solicitudes por segundo × duración media en segundos
```

Con 40 solicitudes por segundo y una duración media de 0,25 segundos, la estimación es 10 invocaciones concurrentes. Usa el pico esperado y vuelve a medir con la distribución real; los lotes de eventos y los límites de la fuente cambian el cálculo.

Lambda escala automáticamente, pero una base de datos o API externa puede tener un límite menor. **La concurrencia reservada** reserva capacidad de la cuenta para una función y también limita su máximo; puede proteger una dependencia de demasiadas solicitudes, pero una cifra demasiado baja genera throttling o acumulación en la fuente. Comprueba métricas y cuotas de tu cuenta y región antes de fijarla. La [guía oficial de concurrencia](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html) describe ambos lados de ese control.

**La concurrencia aprovisionada** inicializa entornos con anticipación para reducir latencia de arranque. Tiene cargos mientras está configurada; no hace más rápida una consulta externa ni elimina el trabajo del handler. Mídela frente al objetivo de latencia y el patrón de tráfico antes de habilitarla.

Evita ciclos de invocación involuntarios, por ejemplo, que una función escriba en un recurso que la vuelve a disparar sin condición de salida. Un bucle de eventos puede multiplicar invocaciones y costos. Añade límites o filtros cuando el flujo requiera volver a invocar la misma función y alerta sobre un crecimiento anormal.

## Ajusta memoria y costo con mediciones

La memoria también determina el CPU disponible: aumentarla puede acelerar cálculos, procesamiento de archivos o trabajo limitado por CPU, y a veces reduce la duración facturada. Si la función pasa el tiempo esperando una dependencia lenta, asignarle más CPU puede no resolver el cuello de botella. Revisa memoria utilizada, duración y latencia de extremo a extremo con entradas similares a las reales.

Para elegir una configuración, registra una línea base y cambia una variable por vez. Compara memoria, arquitectura y número de invocaciones con el mismo código y datos representativos; mide también errores y operaciones completadas, no solo la duración de ejecuciones exitosas. La guía de [costo y rendimiento de Lambda](https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/) ayuda a interpretar duración facturada y costo por operación.

AWS Lambda Power Tuning es una herramienta de código abierto que despliega una máquina de estados de Step Functions y ejecuta tu función con distintas asignaciones de memoria. **Invoca código real en tu cuenta**, incluidas sus llamadas HTTP y de AWS; usa una función de prueba sin efectos como pagos o envíos, limita el número de ejecuciones y considera los cargos de Lambda y Step Functions. El proyecto explica sus [parámetros y costos](https://github.com/alexcasalboni/aws-lambda-power-tuning). No lo trates como una prueba gratis ni como una garantía de que la configuración ganadora en un ensayo será la mejor con tráfico de producción.

## Protege secretos, permisos y datos de entrada

Usa variables de entorno para parámetros operativos que cambian entre ambientes, como un nombre de tabla o un nivel de log. Para credenciales, tokens y claves, AWS recomienda [Secrets Manager](https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html) en lugar de variables de entorno. Limita la política de acceso del rol de ejecución a las acciones y recursos que la función necesita. Si hay una política que permite a otro servicio invocarla, delimítala al servicio, cuenta o recurso que corresponda.

Valida el formato, tamaño y valores esperados del evento antes de usarlo. Los disparadores y clientes son parte de tu perímetro: no asumas que un evento es confiable solo porque proviene de una integración AWS. No escribas en logs contraseñas, tokens, cabeceras de autorización, datos personales ni el cuerpo completo de cada evento. Revisa también la retención de los logs, porque contienen información operativa de la aplicación.

## Observa fallos, retrasos y latencia de arranque

Lambda puede enviar logs a CloudWatch Logs si el rol de ejecución tiene los permisos necesarios. Emite mensajes estructurados con el ID de solicitud, la clave de negocio y un resultado resumido; esos campos ayudan a correlacionar intentos sin registrar datos sensibles. Las tarifas estándar de CloudWatch Logs aplican al almacenamiento y análisis. Si el volumen de logs se vuelve un problema, el artículo de Andres Moreno sobre [búfer de logs con Lambda Powertools](https://andmore.dev/es/blog/log-buffering/) demuestra el buffer y su descarga ante errores. Es opcional: el buffer tiene un límite y puede descartar los mensajes más antiguos cuando se llena, así que conserva la evidencia necesaria y prueba su comportamiento antes de depender de él.

Mira señales distintas para problemas distintos: `Errors` cuenta errores del código o runtime; `Throttles` se publica por separado y no se incluye en `Errors`; `ConcurrentExecutions` muestra ejecuciones simultáneas. La métrica `Duration` mide el tiempo del código y **no incluye el cold start**. Para detectar retrasos, combina estas señales con las de la fuente: `AsyncEventAge` para invocaciones asíncronas, `IteratorAge` para fuentes de flujo o la antigüedad del mensaje más antiguo de SQS. Configura alarmas con el objetivo de servicio de tu aplicación, no con umbrales universales. Consulta los [tipos de métricas de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html) y el flujo de [logs de función a CloudWatch](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html). Para recorrer una línea base y el diagnóstico de cuellos de botella en español, [Hazel Sáenz explica cómo diagnosticar el rendimiento de Lambda para AWS Español](https://dev.to/aws-espanol/eleva-el-rendimiento-de-aws-lambda-7il); usa la documentación vigente para confirmar métricas, costos y configuración.

También puedes profundizar con las grabaciones de [observabilidad en aplicaciones Serverless](https://www.youtube.com/watch?v=UdBDmelLlOQ) y [CloudWatch Alarms](https://www.youtube.com/watch?v=uS0QE0NeqpA), del canal de Marcia Villalba, Desplegando Cloud. Son material complementario; revisa las opciones actuales en la documentación oficial antes de cambiar la configuración.

Si la demora ocurre antes de que empiece el handler, mide el tiempo de inicialización en los logs y la latencia que observa el cliente. La guía de [cold starts en Lambda](https://dondeaprendoaws.com/blog/7-estrategias-para-mitigar-cold-starts-en-aws-lambda/) explica cuándo investigar esa fase y cuándo probar SnapStart.

## Evalúa SnapStart solo si tu función es compatible

SnapStart guarda una instantánea del estado de memoria y disco de un entorno inicializado para restaurarlo en nuevos entornos. Reduce parte de la latencia de inicialización; no acelera automáticamente el handler ni las dependencias externas. A la fecha de revisión, los runtimes administrados compatibles son **Java 11 o posterior, Python 3.12 o posterior y .NET 8 o posterior**, junto con sus imágenes base de Lambda correspondientes. Confirma el soporte de tu runtime, imagen y región en la [documentación de SnapStart](https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html) antes de elegirlo.

Hay restricciones concretas: SnapStart se activa en versiones publicadas y alias que apuntan a una versión, no en `$LATEST`. No es compatible con concurrencia aprovisionada, Amazon EFS, Amazon S3 Files ni almacenamiento efímero por encima de 512 MB. Revisa también el precio de almacenamiento y restauración de instantáneas; las condiciones varían por runtime.

El snapshot puede copiar el estado que tu código generó durante la inicialización. No generes allí valores que deban ser únicos para cada entorno, como IDs, secretos o semillas de aleatoriedad; crea esos valores después de restaurar o usa un hook de runtime compatible. Las conexiones establecidas durante la inicialización tampoco tienen un estado garantizado al restaurar: valídalas y vuelve a abrirlas cuando haga falta. En muchos casos las conexiones del AWS SDK se reanudan automáticamente. Los hooks son mecanismos del ciclo de vida de SnapStart; no existe un `onStartup` genérico para arreglar cada conexión.

## Continúa con recursos, comunidades y eventos

Para practicar la selección de memoria en español, [Camilo Cabrales explica cómo probar AWS Lambda Power Tuning](https://dev.to/cecamilo/tunea-tus-funciones-lambda-31a4). Es una guía publicada en 2023; úsala para entender el experimento y verifica los parámetros frente a la versión actual de la herramienta. [Diana Alfaro muestra cómo revisar ejecuciones concurrentes con CloudWatch](https://blog.alfalfita.cloud/identificando-ejecuciones-concurrentes-de-lambdas-sobre-una-cuenta-con-amazon-cloudwatch), con una fórmula y un gráfico de ejemplo.

Puedes consultar actividades y participar en [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/), que organiza encuentros sobre AWS y serverless, o en [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/), una comunidad general de usuarios AWS. El [directorio de comunidades AWS por país](/comunidades/) te ayuda a encontrar grupos más cercanos o con otros temas. Para seguir novedades y otros recursos en español, [Desplegando.cloud, de Marcia Villalba](https://desplegando.substack.com/), publica un boletín y podcast sobre AWS y Serverless.

El grupo Serverless Colombia anuncia el encuentro online [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/) para el **20 de octubre de 2026, de 19:00 a 21:00 GMT-5**. La página indica acceso libre y que el enlace aparece para asistentes; revisa allí las condiciones vigentes y el registro. Si ya pasó la fecha, consulta la [agenda de eventos AWS en línea](/eventos/online/) para encontrar próximas actividades.
