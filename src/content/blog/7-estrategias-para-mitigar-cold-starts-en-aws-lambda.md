---
title: "Cold starts en AWS Lambda: cómo medirlos y reducir su impacto"
description: "Aprende a medir los cold starts de AWS Lambda y cuándo optimizar Init, usar SnapStart o aprovisionar concurrencia según tu tráfico y latencia."
author: "guille-ojeda"
publishedAt: "2024-05-15"
publishedTimestamp: "2024-05-15T06:00:17.055Z"
modifiedTimestamp: "2026-10-04T22:31:52-03:00"
review:
  date: "2026-10-04"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []
---

Si una función de AWS Lambda responde lento de forma intermitente, primero comprueba si el tiempo se consume al crear el entorno o dentro del handler. Para reducir la inicialización, recorta imports, dependencias y trabajo ejecutado fuera del handler. Si necesitas una latencia más predecible, compara SnapStart —si tu runtime y diseño son compatibles— con concurrencia aprovisionada, que mantiene una cantidad de entornos inicializados a cambio de cargos mientras está activa.

Ninguna de estas opciones elimina por sí sola todos los retrasos en cualquier escenario. Una invocación puede usar capacidad bajo demanda, exceder la concurrencia aprovisionada o reiniciar un entorno después de un error. Los pings programados y la concurrencia reservada tampoco garantizan que la siguiente solicitud use un entorno ya inicializado.

## Qué significa un cold start en Lambda

En el modelo habitual de Lambda bajo demanda, un cold start ocurre cuando una invocación necesita un entorno de ejecución nuevo. Lambda inicia las extensiones, prepara el runtime y ejecuta el código de inicialización de la función, que suele incluir imports, configuración y creación de clientes. Después ejecuta el handler. Si llega otra invocación a un entorno que Lambda conserva, puede reutilizarlo; esa reutilización no tiene una duración garantizada.

El orden ayuda a distinguir tres fases:

| Fase | Qué ocurre | Qué revisar |
| --- | --- | --- |
| `Init` | Lambda inicia las extensiones y el runtime y ejecuta el código estático de la función. | Imports, dependencias, inicialización y conexiones. |
| `Invoke` | Se procesa el evento en el handler. | Lógica de la solicitud y llamadas a servicios. |
| `Restore` | Con SnapStart, Lambda reanuda un entorno desde una instantánea en lugar de inicializarlo desde cero. | Duración de restore, hooks y estado que deba renovarse. |

Lambda puede terminar entornos por mantenimiento, fallos o cambios de demanda; no dependas de que una función permanezca caliente aunque reciba tráfico con frecuencia. Un fallo durante una invocación también puede reiniciar el entorno. En ese caso, una **suppressed init** puede ejecutarse antes de la siguiente invocación sin aparecer como una línea `INIT` separada en los logs; parte de ese trabajo queda incluido en `Duration` del `REPORT`. La Telemetry API emite eventos de inicialización con `phase=invoke` para detectar ese caso.

Consulta el [ciclo de vida del entorno de ejecución de Lambda](https://docs.aws.amazon.com/es_es/lambda/latest/dg/lambda-runtime-environment.html) para ver los detalles de `Init`, `Invoke`, `Restore` y los reinicios.

## Cómo medirlos sin confundir init con latencia de usuario

Con el formato de logs de texto habitual, los registros `REPORT` pueden incluir `Init Duration`. En CloudWatch, abre **Logs Insights**, selecciona el grupo de logs de la función —por defecto, `/aws/lambda/nombre-de-la-función`— y el intervalo de tiempo que quieres analizar. Esta consulta agrupa por intervalos de cinco minutos el porcentaje de líneas `REPORT` que contienen una duración de inicialización visible y la duración media reportada:

```text
filter @type = "REPORT"
| stats sum(strcontains(@message, "Init Duration"))/count(*) * 100 as coldStartPct, avg(@duration)
  by bin(5m)
```

`coldStartPct` es una estimación a partir de esas líneas de log, no un contador universal de cold starts. La consulta sirve como punto de partida para funciones bajo demanda con logs de texto. No mide el `Restore Duration` de SnapStart y no cuenta como invocaciones frías los informes `platform.initReport` que Lambda genera durante la asignación de concurrencia aprovisionada. Si usas logs JSON, adapta el filtro a los campos de ese formato.

En una suppressed init puede no existir una línea `REPORT` con `Init Duration` aunque el `Duration` informado incluya parte de la inicialización. Para investigar reinicios ocultos, usa una extensión suscrita a la [Telemetry API](https://docs.aws.amazon.com/lambda/latest/dg/telemetry-api.html) y busca `INIT_START`, `INIT_RUNTIME_DONE` e `INIT_REPORT` con `phase=invoke`. Para revisar restauraciones de SnapStart, busca `RESTORE_REPORT` y `Restore Duration`.

Por separado, compara la latencia que observa el cliente y los percentiles de las invocaciones. El campo `Duration` de `REPORT` mide el tiempo del handler y normalmente excluye `Init`; no representa por sí solo el tiempo de respuesta de una API ni el efecto de una inicialización. Si una ruta HTTP es sensible a la latencia, mide el recorrido completo con métricas o trazas del cliente y de los servicios que la componen. La [guía de logs de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-view.html) documenta los campos `REPORT` y esta [consulta de Logs Insights para cold starts](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-view.html#useful-logs-queries).

Para ampliar el diagnóstico de rendimiento —línea base, tendencias y trazas— puedes leer [Diagnóstico de AWS Lambda: Guía para detectar y solucionar problemas de rendimiento](https://dev.to/aws-espanol/eleva-el-rendimiento-de-aws-lambda-7il), publicado por AWS Español en mayo de 2024. Es una guía general, no un manual actualizado de cold starts: su sección sobre inicios en frío los vincula a la inactividad y conviene contrastarla con el ciclo de vida y la consulta anteriores.

## Qué cambiar primero en el código y la configuración

### Reduce el trabajo de inicialización que sí necesitas

Mide qué ocurre en `Init` antes de cambiar el diseño. Importa solo los módulos que usa la función, elimina dependencias y archivos que no se necesitan en el despliegue y evita cargar frameworks, archivos o clientes que solo requiere una ruta poco frecuente. Si el trabajo puede esperar hasta que se use esa ruta, evalúa inicialización perezosa y mide su efecto en el handler.

Crear clientes fuera del handler permite reutilizarlos cuando Lambda reutiliza el mismo entorno. Aun así, una conexión puede cerrarse o quedar obsoleta; comprueba su estado y vuelve a conectarla cuando corresponda. No guardes allí datos propios de una invocación, secretos efímeros ni valores que deban ser únicos por solicitud.

La memoria asignada también cambia la potencia de CPU disponible: más memoria puede ayudar a una inicialización limitada por CPU, red o memoria, pero no garantiza un `Init` más rápido ni un costo menor. Compara el tiempo y el costo de ejecuciones representativas con la misma carga; AWS documenta la relación en [configuración de memoria de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html).

Para ver un ejemplo en español de comparación entre configuraciones, consulta [Tunea tus funciones Lambda](https://dev.to/cecamilo/tunea-tus-funciones-lambda-31a4), publicado en marzo de 2023. Muestra AWS Lambda Power Tuning con una función sintética de cálculo factorial. Compara duración media y costo según la memoria, no mide `Init Duration` de manera aislada: usa la idea de comparar, pero no extrapoles su resultado de memoria ni sus comandos antiguos. Antes de ejecutarlo, revisa el [repositorio actual de Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning): despliega Step Functions en tu cuenta y ejecuta tu función con el payload que configures, por lo que puede realizar llamadas HTTP/SDK y generar cargos. Comprueba permisos, llamadas externas y costos, usa una carga representativa y elimina la infraestructura cuando termines.

No quites una función de una VPC solo por una recomendación antigua sobre penalizaciones generales de ENI. Lambda administra y puede reutilizar Hyperplane ENI para funciones que comparten una combinación de subredes y grupos de seguridad; la primera asociación de esa combinación puede tardar varios minutos en quedar lista. Conserva la conectividad privada que requiere la arquitectura y mide el inicio y las conexiones reales. Consulta la [documentación vigente de acceso a VPC](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html).

### Evalúa SnapStart si tu runtime y tu inicialización son compatibles

SnapStart toma una instantánea cuando publicas una versión y reanuda entornos nuevos desde ella. La documentación actual admite runtimes administrados **Java 11 o posterior, Python 3.12 o posterior y .NET 8 o posterior**. Se configura sobre versiones publicadas o alias que apuntan a una versión; no funciona sobre `$LATEST`.

Antes de activarlo, revisa estas condiciones:

- No se combina con concurrencia aprovisionada y no admite EFS, S3 Files ni almacenamiento efímero superior a 512 MB.
- Un ID, secreto, número aleatorio u otro valor que deba ser único no debe quedar congelado en la instantánea. Genera esos valores después de inicializar o en un hook compatible.
- El estado de una conexión de red creada durante `Init` no está garantizado al restaurar. Comprueba las conexiones y vuelve a establecer las que lo necesiten; refresca credenciales temporales y datos que puedan caducar antes de usarlos.
- El costo depende del runtime y del uso: los runtimes administrados de Java no tienen un cargo adicional específico de SnapStart; para Python y .NET se cobra la caché por versión publicada (con un mínimo de tres horas y mientras siga activa) y cada restauración, según la memoria. Comprueba la disponibilidad en tu región y revisa la [página de precios de Lambda](https://aws.amazon.com/lambda/pricing/) antes de elegir.

La guía de [SnapStart y sus límites](https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html) enlaza las instrucciones para [mantener unicidad](https://docs.aws.amazon.com/lambda/latest/dg/snapstart-uniqueness.html) y para [refrescar secretos con Secrets Manager](https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html).

### Usa concurrencia aprovisionada cuando debas preparar capacidad

La concurrencia aprovisionada inicializa por adelantado una cantidad definida de entornos. Puede ayudar en una API interactiva o un pico conocido cuando el código ya está optimizado y la latencia importa. Se configura para una **versión publicada o un alias**, no para `$LATEST`; el origen de eventos debe invocar exactamente esa versión o alias. Espera a que el estado de asignación llegue a `READY` antes de asumir que la capacidad está lista.

Dimensiona esa cantidad con la concurrencia observada —solicitudes por segundo multiplicadas por duración media de la solicitud es una aproximación inicial— y vuelve a medir en los picos reales. Si se agota la concurrencia aprovisionada, Lambda puede atender solicitudes con capacidad bajo demanda y producir invocaciones con cold start; observa `ProvisionedConcurrencySpilloverInvocations`. Si la concurrencia reservada fija un límite más bajo, las solicitudes que excedan ese máximo pueden recibir throttling. Si un alias ponderado distribuye tráfico entre dos versiones durante un canary, comprueba la capacidad asignada a ambas: la distribución es probabilística y el spillover puede aumentar. Lambda puede seguir reciclando entornos incluso con capacidad aprovisionada.

La capacidad aprovisionada genera cargos mientras permanece activa, aunque no reciba solicitudes; también se factura su inicialización. Para picos con horario conocido se puede programar Application Auto Scaling, pero la asignación necesita tiempo para completarse. Considera esos cargos junto con la latencia observada en la [página de precios de Lambda](https://aws.amazon.com/lambda/pricing/). AWS detalla la [configuración de concurrencia aprovisionada](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html), las métricas de [spillover y utilización](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html) y el [enrutamiento ponderado de alias](https://docs.aws.amazon.com/lambda/latest/dg/configuring-alias-routing.html).

### No confundas concurrencia reservada ni pings con entornos listos

La concurrencia reservada protege un tramo del límite de concurrencia de la cuenta y fija el máximo que puede usar una función; no inicializa entornos. Por eso puede limitar la competencia con otras funciones, pero no es una solución a los cold starts. La concurrencia aprovisionada prepara un número de entornos por adelantado; la [guía de escalado de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html) compara ambas opciones.

Una regla de EventBridge que invoca la función periódicamente tampoco reserva capacidad ni garantiza que la siguiente solicitud real vaya al mismo entorno. Lambda puede terminar o crear entornos a medida que cambia la carga. Trátala, como mucho, como una invocación sintética para comprobar la aplicación; no como control de latencia.

## Una opción distinta para cargas de alto volumen

Lambda Managed Instances ejecuta funciones sobre instancias EC2 administradas por Lambda. Al publicar una versión, Lambda inicia entornos antes de marcarla activa; después agrega o retira capacidad de forma asíncrona según el uso de CPU y la saturación de concurrencia. AWS describe este modelo como uno que no admite cold starts, pero eso no significa que pueda responder sin demoras a cualquier pico: advierte que un tráfico que más que se duplique en cinco minutos puede sufrir throttling mientras escala. Cada entorno admite invocaciones concurrentes, así que el código debe ser seguro frente a concurrencia y aislar correctamente el estado. Comprueba los [runtimes admitidos](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-runtimes.html) y la [disponibilidad regional vigente](https://aws.amazon.com/about-aws/whats-new/2026/06/aws-lambda-managed-instances-region-expansion/) antes de evaluarlo.

Es una alternativa para evaluar en cargas estables y de alto volumen, no un cambio de configuración equivalente a la Lambda bajo demanda. También cambia el modelo de costos a cargos de solicitud y capacidad EC2, con una tarifa de administración; compara condiciones y precios actuales antes de decidir. Consulta [cómo escala Managed Instances](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-scaling.html), su [modelo de entorno y concurrencia](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-execution-environment.html) y sus [precios](https://aws.amazon.com/lambda/pricing/). Para una charla en español de AWS User Group Mixtli sobre arquitectura serverless y Lambda Managed Instances, mira [esta grabación del 20 de mayo de 2026](https://www.youtube.com/watch?v=bKjvBBsNlyQ). La grabación es anterior a la expansión regional de junio de 2026; consulta la documentación enlazada arriba para revisar compatibilidad, escalado y costos vigentes. Si comparas Lambda con un servicio de contenedores que permanece activo, revisa también la guía de [costos de Amazon ECS con Fargate](https://dondeaprendoaws.com/blog/7-estrategias-para-reducir-costos-en-aws-fargate/) y el análisis de [costos serverless para startups](https://dondeaprendoaws.com/blog/7-estrategias-de-serverless-para-startups-optimiza-costos/).

## Recursos en español y comunidades AWS

Para seguir noticias y conversaciones sobre AWS y serverless en español, puedes consultar la [newsletter y el podcast Desplegando.cloud](https://desplegando.substack.com/). Si quieres preguntar, compartir experiencias o encontrar un grupo en tu país, explora el [directorio de comunidades AWS en Latinoamérica](https://dondeaprendoaws.com/comunidades/). El [AWS User Group Serverless Colombia en Meetup](https://www.meetup.com/aws-user-group-serverless-colombia/) mantiene su perfil y agenda de encuentros.

Si estás empezando con Lambda, la grabación [AWS Lambda, estrategias para una vida feliz](https://www.youtube.com/watch?v=IdYttArX-FU), de Surfeando la nube, se publicó en octubre de 2023. La descripción del video la presenta como una charla de introducción al cloud con Juan Kungfoo; no es una guía específica de cold starts.

Al revisar la agenda el 4 de octubre de 2026, figuraban estas sesiones virtuales futuras. No son talleres específicos de cold starts, pero ayudan a decidir el tipo de carga o a profundizar en la arquitectura:

- **EC2 vs Lambda**, viernes 16 de octubre de 2026, de 16:00 a 17:00 (GMT-6, hora del organizador): compara ventajas, costos y escenarios de ambos servicios. Revisa la [ficha e inscripción en Meetup](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/).
- **El Combo Indestructible de AWS: SQS + Lambda**, martes 20 de octubre de 2026, de 19:00 a 21:00 (COT, hora de Colombia): sesión virtual de acceso libre sobre resiliencia y escalabilidad; la ficha indica que el enlace se muestra a asistentes. Consulta la [ficha e inscripción en Meetup](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/).

Comprueba fecha, horario, cupos y modalidad en cada ficha antes de inscribirte, o busca otras actividades en la [Agenda de eventos AWS](https://dondeaprendoaws.com/eventos/).

## Preguntas frecuentes

### ¿La concurrencia reservada mantiene caliente una Lambda?

No. Reserva capacidad dentro de la cuenta y limita la concurrencia máxima de la función, pero no prepara entornos. En Lambda estándar, la concurrencia aprovisionada sí inicia por adelantado una cantidad fija; Managed Instances usa un modelo de capacidad distinto.

### ¿Un ping de EventBridge evita los cold starts?

No lo garantiza. Una invocación programada no reserva el entorno para la siguiente solicitud y no controla cuántas instancias necesita Lambda cuando aumenta el tráfico.

### ¿SnapStart elimina todos los cold starts?

No. Reanuda entornos desde una instantánea para los runtimes compatibles, pero añade la fase `Restore` y tiene límites de compatibilidad. Revisa unicidad, secretos, datos temporales, conexiones, precio y métricas de restore antes de activarlo.

### ¿Tener una Lambda en una VPC causa siempre un cold start más lento?

No. Lambda reutiliza Hyperplane ENI en condiciones compatibles y no hay una penalización antigua que se aplique a cada arranque por igual. Mide tu función y sus conexiones antes de modificar la VPC.
