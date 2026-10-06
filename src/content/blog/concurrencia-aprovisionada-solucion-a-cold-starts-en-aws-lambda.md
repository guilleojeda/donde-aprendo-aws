---
title: "Concurrencia aprovisionada en AWS Lambda: cómo configurarla"
description: "Qué es y cómo configurar concurrencia aprovisionada en una versión o alias de Lambda; revisa spillover, cold starts, límites, métricas y costos."
author: "guille-ojeda"
publishedAt: "2024-05-20"
publishedTimestamp: "2024-05-20T00:03:01.19Z"
modifiedTimestamp: "2026-10-06T14:04:22-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cold starts en AWS Lambda: cómo medirlos y reducir su impacto"
    url: "https://dondeaprendoaws.com/blog/7-estrategias-para-mitigar-cold-starts-en-aws-lambda/"

---

La **concurrencia aprovisionada** (Provisioned Concurrency) le pide a AWS Lambda que inicialice por adelantado una cantidad definida de entornos de ejecución para una versión publicada o un alias. En la documentación en español de AWS también aparece como «simultaneidad aprovisionada». Las invocaciones que caben en esa capacidad evitan esperar a que Lambda inicialice un entorno nuevo. Esto puede ayudar a una API sensible a la latencia, pero no garantiza que toda solicitud quede libre de demoras: la función todavía puede exceder esa capacidad, recibir tráfico por otro calificador o esperar al handler y a sus dependencias.

Esta guía explica cómo funciona, en qué se diferencia de la concurrencia reservada y SnapStart, cómo configurarla y qué mirar para ajustar capacidad y costo.

El video [Stop Lambda Cold Starts in your Serverless Apps: Provision Concurrency vs. Lambda Ping](https://www.youtube.com/watch?v=Pvkq5g80MPg) compara la concurrencia aprovisionada con los pings periódicos. Está en inglés; consulta la documentación actual enlazada abajo para validar los límites y el comportamiento.

<iframe allowfullscreen="" loading="lazy" src="https://www.youtube.com/embed/Pvkq5g80MPg" title="Stop Lambda Cold Starts in your Serverless Apps (Provision Concurrency Vs Lambda Ping)"></iframe>

## Qué prepara Lambda antes de una invocación

En un arranque en frío, Lambda crea un entorno de ejecución, inicia extensiones y el runtime y ejecuta el código de inicialización de la función, como imports y clientes creados fuera del handler. Luego procesa la solicitud dentro del handler. Un entorno nuevo puede ser necesario al escalar, al desplegar código o configuración, o cuando Lambda recicla un entorno; no ocurre únicamente tras un período sin tráfico.

La concurrencia aprovisionada desplaza esa fase `Init` a la asignación de capacidad: Lambda inicializa los entornos antes de que lleguen las solicitudes y los mantiene disponibles. El trabajo que se ejecuta dentro del handler —incluidas consultas, llamadas de red y lógica propia de cada solicitud— sigue ocurriendo al invocar la función. Lambda también puede reciclar los entornos y volver a ejecutar la inicialización; AWS advierte que el primer uso de un entorno ya inicializado puede presentar variaciones de latencia según el runtime y la memoria.

Por eso, la mejora se refiere a la inicialización de los entornos atendidos por la capacidad aprovisionada. No garantiza la latencia total de una API, acelera automáticamente el código del handler ni convierte la función en un servicio de alta disponibilidad. Consulta el [ciclo de vida del entorno de ejecución](https://docs.aws.amazon.com/es_es/lambda/latest/dg/lambda-runtime-environment.html) y la [guía oficial de concurrencia aprovisionada](https://docs.aws.amazon.com/es_es/lambda/latest/dg/provisioned-concurrency.html) para los detalles de las fases y la asignación.

## Concurrencia aprovisionada, reservada y SnapStart

| Opción | Qué cambia | Qué no hace |
| --- | --- | --- |
| **Concurrencia reservada** | Reserva capacidad exclusiva para la función, como piso disponible y límite máximo de escalado, sin un cargo adicional por esa configuración. También ayuda a limitar la presión sobre bases de datos u otros recursos posteriores. | No inicializa entornos por adelantado ni evita por sí sola los arranques en frío. |
| **Concurrencia aprovisionada** | Inicializa una cantidad determinada de entornos para una versión o alias y cobra por mantener esa capacidad. | No cubre invocaciones por encima de la capacidad, ni elimina la latencia del handler o de servicios llamados por la función. |
| **SnapStart** | Guarda una instantánea de un entorno inicializado al publicar una versión y la usa para restaurar nuevos entornos compatibles. | No mantiene una cantidad fija de entornos listos. No se puede combinar con concurrencia aprovisionada en la misma versión. |

Puedes configurar concurrencia reservada y aprovisionada para una función; la cantidad aprovisionada no puede superar la reservada. Si se usa toda la capacidad aprovisionada, Lambda puede atender el exceso con concurrencia estándar si queda capacidad disponible. Si se alcanza también el límite reservado o el límite regional, las invocaciones pueden recibir throttling. La concurrencia asignada afecta la capacidad disponible para otras funciones, incluso mientras parte de ella está inactiva. La [guía de escalado de Lambda](https://docs.aws.amazon.com/es_es/lambda/latest/dg/lambda-concurrency.html) describe esta relación.

SnapStart es otra opción para reducir la inicialización. La documentación actual indica compatibilidad con runtimes administrados Java 11 o posterior, Python 3.12 o posterior y .NET 8 o posterior; esos runtimes y límites pueden cambiar, así que verifica la [compatibilidad vigente de SnapStart](https://docs.aws.amazon.com/es_es/lambda/latest/dg/snapstart.html). No puedes usarlo junto con concurrencia aprovisionada en una misma versión.

## Cuándo conviene y cómo dimensionarla

Evalúa esta opción cuando las mediciones muestran que las inicializaciones afectan una API interactiva o un flujo donde la latencia importa. Primero mide la experiencia del cliente y los picos de concurrencia. Como cálculo inicial, AWS propone:

```text
concurrencia aproximada = solicitudes por segundo × duración media de cada solicitud (segundos)
```

Por ejemplo, 10 solicitudes por segundo con una duración media de 0,5 segundos equivalen a unas 5 solicitudes simultáneas. Es una aproximación, no un valor final: el promedio puede ocultar ráfagas. Para las invocaciones **síncronas**, Lambda documenta además un límite de solicitudes por segundo por versión o alias igual a 10 veces la concurrencia aprovisionada asignada. Es una cuota agregada del calificador, no un máximo de 10 solicitudes por segundo para cada entorno, y no se debe extrapolar a invocaciones asíncronas. Por ejemplo, una función que tarda 20 ms puede tener una concurrencia media de 2 con 100 solicitudes por segundo, pero esa cuota síncrona requiere al menos 10 unidades aprovisionadas. Compara tanto la concurrencia máxima observada como la tasa de solicitudes y valida el ajuste con una carga representativa. Para funciones con un alias ponderado durante un despliegue gradual, el reparto entre versiones es probabilístico y puede desviarse del porcentaje configurado, especialmente con poco tráfico. La [guía de cuotas de Lambda](https://docs.aws.amazon.com/es_es/lambda/latest/dg/gettingstarted-limits.html) y la [explicación de concurrencia y solicitudes por segundo](https://docs.aws.amazon.com/es_es/lambda/latest/dg/lambda-concurrency.html) detallan estos límites.

CloudWatch publica `ConcurrentExecutions` para observar concurrencia, además de métricas específicas de capacidad aprovisionada. La [guía de monitoreo de concurrencia](https://docs.aws.amazon.com/es_es/lambda/latest/dg/monitoring-concurrency.html) explica las estadísticas y dimensiones que corresponden a cada una.

## Configuración en la consola o con AWS CLI

La concurrencia aprovisionada solo se asigna a una **versión publicada** o a un **alias** que apunte a una versión publicada. Una versión publicada es inmutable: después de cambiar código o configuración, publica otra versión y actualiza el alias. No puede configurarse en `$LATEST`. El servicio que invoca la función también debe llamar ese mismo alias o versión; si una API Gateway, una asignación de origen de eventos u otro cliente invoca `$LATEST` o el nombre sin calificador, no usará la capacidad configurada.

En la consola de Lambda, abre la función y elige **Configuración → Simultánea**. En **Configuraciones de concurrencia aprovisionadas**, selecciona **Agregar configuración**. Elige el alias o la versión y establece la cantidad deseada.

Con AWS CLI v2, el ejemplo siguiente supone que ya existe una función de prueba y un alias dedicado `pc-demo` que apunta a una versión publicada y no tiene una configuración de concurrencia aprovisionada que debas conservar. Ajusta también la región, el perfil y la cantidad para tu entorno. El comando cambia la configuración de Lambda y puede generar cargos:

```bash
aws lambda put-provisioned-concurrency-config \
  --function-name my-function \
  --qualifier pc-demo \
  --provisioned-concurrent-executions 10
```

La respuesta puede mostrar `IN_PROGRESS`: la capacidad todavía se está inicializando. Consulta el estado hasta que sea `READY` y la cantidad disponible coincida con la solicitada. Si aparece `FAILED`, revisa `StatusReason` antes de invocar:

```bash
aws lambda get-provisioned-concurrency-config \
  --function-name my-function \
  --qualifier pc-demo \
  --query '{Status:Status,Requested:RequestedProvisionedConcurrentExecutions,Available:AvailableProvisionedConcurrentExecutions,StatusReason:StatusReason}' \
  --output table
```

Prueba invocando el mismo alias —cambia el payload por uno válido para tu handler— y revisa que aumente `ProvisionedConcurrencyInvocations`. El siguiente ejemplo crea un archivo temporal para guardar la respuesta y lo elimina al salir de la sesión:

```bash
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

aws lambda invoke \
  --function-name my-function \
  --qualifier pc-demo \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' "$response_file"

cat "$response_file"
```

Cuando termines, elimina la configuración que agregaste para liberar esa capacidad y detener su cargo. Hazlo solo para el alias de prueba que controlas; quitarla de un alias usado por producción puede cambiar su latencia:

```bash
aws lambda delete-provisioned-concurrency-config \
  --function-name my-function \
  --qualifier pc-demo
```

La guía oficial incluye los pasos de consola y otros ejemplos de [configuración con AWS CLI](https://docs.aws.amazon.com/es_es/lambda/latest/dg/provisioned-concurrency.html); la referencia explica los estados que devuelve [GetProvisionedConcurrencyConfig](https://docs.aws.amazon.com/cli/latest/reference/lambda/get-provisioned-concurrency-config.html), el [comando para invocar una versión o alias](https://docs.aws.amazon.com/cli/latest/reference/lambda/invoke.html) y el [comando para eliminar la configuración](https://docs.aws.amazon.com/lambda/latest/dg/example_lambda_DeleteProvisionedConcurrencyConfig_section.html).

## Spillover, métricas y límites

Si todas las instancias aprovisionadas están ocupadas, Lambda puede atender más invocaciones mediante concurrencia estándar. Esas solicitudes se cuentan como **spillover** y pueden tener que inicializar un entorno nuevo. Si tampoco queda concurrencia estándar, las solicitudes se limitan. Vigila estas métricas en CloudWatch:

| Métrica | Cómo interpretarla |
| --- | --- |
| `ProvisionedConcurrencyInvocations` | Cantidad de invocaciones procesadas con entornos aprovisionados. Un valor mayor que cero confirma que las solicitudes usan esa capacidad. |
| `ProvisionedConcurrencySpilloverInvocations` | Invocaciones atendidas con concurrencia estándar cuando la capacidad aprovisionada se agotó. Un aumento puede señalar que falta capacidad o que hay ráfagas. |
| `ProvisionedConcurrencyUtilization` | Fracción de la capacidad aprovisionada que está en uso. Un valor bajo sostenido puede indicar capacidad ociosa. |
| `ProvisionedConcurrentExecutions` | Entornos aprovisionados que están procesando invocaciones simultáneamente; obsérvala con `MAX`. |
| `ConcurrentExecutions` | Concurrencia activa total; obsérvala con `MAX`. |
| `Throttles` | Invocaciones rechazadas por límites de concurrencia; compara su total con las invocaciones. |

Compara las métricas del mismo alias o versión y usa `SUM` para contadores de invocaciones y throttles, y `MAX` para uso concurrente o utilización. La métrica de spillover separa solicitudes atendidas por capacidad estándar de las procesadas con entornos aprovisionados; no la confundas con `ProvisionedConcurrentExecutions`, que mide entornos activos.

Si ves arranques en frío tras activar la configuración, revisa primero que su estado sea `READY`, que el trigger invoque el alias correcto y que no haya spillover. Para una prueba de despliegue gradual, revisa también la [distribución de tráfico de alias ponderados](https://docs.aws.amazon.com/lambda/latest/dg/configuring-alias-routing.html) y la [guía de solución de problemas de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/troubleshooting-invocation.html).

## Qué se cobra

Lambda cobra la capacidad aprovisionada según la cantidad configurada, la memoria de la función y el tiempo que permanece habilitada; el intervalo se redondea hacia arriba a cinco minutos. Ese importe se suma a los cargos de solicitudes y duración de las invocaciones. AWS también factura el código de inicialización aunque un entorno aprovisionado no atienda solicitudes y vuelve a ejecutarlo cuando recicla entornos. Las invocaciones de spillover usan las tarifas de ejecución estándar.

El precio exacto depende de la región y otros detalles de la configuración. Revisa los valores vigentes y ejemplos en los [precios oficiales de AWS Lambda](https://aws.amazon.com/lambda/pricing/) antes de estimar el costo. La página indica que el nivel gratuito de Lambda no se aplica a funciones que habilitan concurrencia aprovisionada.

Para patrones previsibles se puede programar Application Auto Scaling. El escalado por seguimiento de objetivo se ajusta a las métricas y no reacciona instantáneamente a cualquier ráfaga: AWS indica que la carga debe sostenerse al menos tres minutos para aprovisionar entornos adicionales; las alarmas también necesitan tres puntos de datos que alcancen el objetivo. Define un valor inicial, escala antes de los picos previsibles y prueba la respuesta bajo carga antes de depender de él. La sección sobre [Application Auto Scaling en la guía de concurrencia aprovisionada](https://docs.aws.amazon.com/es_es/lambda/latest/dg/provisioned-concurrency.html) describe sus opciones y límites.

## Preguntas frecuentes

### ¿La concurrencia aprovisionada elimina todos los cold starts?

No. Evita esperar la inicialización para las invocaciones que encuentran capacidad aprovisionada lista. Puede haber spillover, solicitudes dirigidas a otro calificador, inicialización durante una actualización o demoras en el handler y sus dependencias.

### ¿Puedo configurarla en `$LATEST`?

No. Publica una versión y configura la concurrencia en esa versión o en un alias que apunte a ella. Asegúrate de que el invocador use el mismo calificador.

### ¿Sirve un ping periódico como alternativa?

Una invocación programada no reserva capacidad ni garantiza que la próxima solicitud reutilice ese entorno. Consulta la comparación en el video de arriba y verifica los límites con la documentación oficial enlazada en esta guía.

## Recursos en español y comunidades AWS

Para empezar con Lambda, mira [Lambda Esencial: Descubriendo los Fundamentos de AWS en Nivel 100](https://www.youtube.com/watch?v=hvAGC6EXQNc), del [canal de AWS User Group Ecuador](https://www.youtube.com/@awsugecuador4610), o la charla [Serverless sin Misterios: tu primera API en AWS con Lambda, API Gateway y DynamoDB](https://www.youtube.com/watch?v=4afSBy20sQ0), del [canal de AWS User Group Medellín](https://www.youtube.com/@awsugmed). También puedes ver [AWS Lambda, estrategias para una vida feliz](https://www.youtube.com/watch?v=IdYttArX-FU), del [canal Surfeando la nube](https://www.youtube.com/@ricardoceci-dev). Son recursos de aprendizaje sobre Lambda y serverless; no sustituyen la referencia oficial de concurrencia aprovisionada.

Si quieres ampliar observabilidad y rendimiento en español, [Diagnóstico de AWS Lambda: guía para detectar y solucionar problemas de rendimiento](https://dev.to/aws-espanol/eleva-el-rendimiento-de-aws-lambda-7il) repasa métricas, CloudWatch, X-Ray, Logs Insights y benchmarks. Es una guía general publicada por AWS Español en 2024; para nombres, dimensiones y estadísticas vigentes de las métricas de concurrencia aprovisionada, usa la [documentación actual de monitoreo de Lambda](https://docs.aws.amazon.com/es_es/lambda/latest/dg/monitoring-concurrency.html). Para analizar específicamente las fases `Init` y otros inicios en frío, sigue con [Cold starts en AWS Lambda: cómo medirlos y reducir su impacto](https://dondeaprendoaws.com/blog/7-estrategias-para-mitigar-cold-starts-en-aws-lambda/).

Para conversar sobre AWS y consultar actividades, explora el [directorio de comunidades AWS en Latinoamérica](https://dondeaprendoaws.com/comunidades/) o el perfil de [AWS User Group Serverless Colombia en Meetup](https://www.meetup.com/aws-user-group-serverless-colombia/). La [agenda de eventos AWS](https://dondeaprendoaws.com/eventos/) reúne encuentros publicados por las comunidades; confirma en cada ficha la modalidad, la inscripción y cualquier condición vigente.
