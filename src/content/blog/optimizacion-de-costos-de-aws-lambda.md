---
title: "Cómo optimizar costos de AWS Lambda: mide antes de cambiar"
description: "Entiende qué se factura en AWS Lambda y compara memoria, arquitectura y concurrencia con una carga real, incluidos INIT y los servicios asociados."
author: "guille-ojeda"
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T01:39:56.043Z"
modifiedTimestamp: "2026-10-06T23:58:58-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS Lambda: cómo medir costo y rendimiento"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/"
  - title: "AWS Lambda: cómo funciona, invocaciones y concurrencia"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/"
  - title: "Concurrencia aprovisionada en AWS Lambda: cómo configurarla"
    url: "https://dondeaprendoaws.com/blog/concurrencia-aprovisionada-solucion-a-cold-starts-en-aws-lambda/"
---

Para optimizar los costos de AWS Lambda, mide primero qué parte de cada operación genera gasto y latencia; después compara una configuración por vez con entradas representativas. Más memoria puede reducir la duración de una función limitada por CPU, pero no garantiza una factura menor. El valor de timeout tampoco se cobra completo: establece el máximo que puede durar una invocación.

Esta guía trata el modelo estándar de Lambda bajo demanda. Concurrencia aprovisionada, Lambda Managed Instances y otras modalidades tienen cargos distintos; revisa sus precios por separado antes de aplicar las fórmulas de abajo.

## Qué se factura en una función bajo demanda

En el modelo estándar, los principales cargos propios de Lambda son el número de solicitudes y la duración facturada, que depende de la memoria configurada. Lambda factura la memoria asignada, no solo la cantidad que alcanzó a ocupar el código. La tarifa cambia según la región, la arquitectura y el tramo de uso; consulta los [precios actuales de Lambda](https://aws.amazon.com/lambda/pricing/) para el cálculo de tu cuenta.

La duración se redondea al milisegundo. Desde el 1 de agosto de 2025, AWS también factura la fase de inicialización (**INIT**) en todas las configuraciones. Para invocaciones bajo demanda empaquetadas como ZIP con runtime administrado, el INIT ahora forma parte de <code>Billed Duration</code>. Usa ese campo de los registros <code>REPORT</code> para estimar consumo y no sumes <code>Init Duration</code> otra vez. La [nota de AWS sobre el cambio de facturación de INIT](https://aws.amazon.com/blogs/compute/aws-lambda-standardizes-billing-for-init-phase/) y la [guía del ciclo de vida](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html) explican qué ocurre al preparar un entorno.

Para una primera estimación del cómputo bajo demanda:

~~~text
GB-segundos por invocación = (memoria configurada en MB / 1024)
                             × (Billed Duration en ms / 1000)

costo de cómputo = suma de GB-segundos facturables × tarifa de la región y arquitectura
costo de solicitudes = solicitudes facturables × tarifa por solicitud
~~~

Esta cuenta no incluye otros servicios ni es el modelo completo para concurrencia aprovisionada, Lambda Managed Instances, funciones durables o SnapStart. En particular, Lambda publica precios separados para algunas de esas modalidades; valida el tipo de cómputo antes de extrapolar.

### Un ejemplo para comparar memoria

Supón que una función tarda 500 ms con 512 MB y 200 ms con 1.024 MB. Son cifras hipotéticas para mostrar la cuenta, no una medición ni una promesa:

| Configuración | GB-segundos por invocación |
| --- | ---: |
| 512 MB × 500 ms | 0,25 |
| 1.024 MB × 200 ms | 0,20 |

Con la misma arquitectura, número de solicitudes y tarifa por GB-segundo, la segunda configuración usaría menos cómputo por invocación. En otra función, aumentar memoria puede acelerar poco y elevar el consumo. Mide tu código y calcula el costo con la tarifa y los descuentos que corresponden a tu cuenta.

## Timeout: un límite, no una reserva

El timeout define cuánto espera Lambda antes de detener una invocación; no reserva ni factura por adelantado todos esos segundos. Si una ejecución termina antes, no paga el tiempo restante del límite. Si agota el timeout, sí consume recursos durante la ejecución que llegó a realizar y puede generar nuevos intentos según el invocador, el tipo de evento y la configuración de reintentos.

Para el modelo estándar, el valor predeterminado es 3 segundos y puedes configurar entre 1 y 900 segundos. Elige un límite que permita terminar casos lentos válidos con cierto margen, y usa <code>Duration</code>, errores y latencia de la dependencia para investigar el problema. Reducir un timeout que casi nunca se alcanza no reduce por sí solo el costo; puede provocar fallos y reintentos. Consulta la [configuración de timeout](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html). Lambda Managed Instances tiene reglas de duración diferentes para algunas invocaciones y otra estructura de precios.

## Ajusta memoria con datos de tu carga

Lambda asigna más CPU cuando aumentas la memoria, que se configura entre 128 MB y 10.240 MB. Esto puede ayudar a un proceso limitado por CPU, pero no necesariamente a una función que pasa el tiempo esperando una base de datos o una API. La [guía de memoria de AWS](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html) explica esta relación y recomienda observar consumo y duración.

Antes de cambiar valores, guarda una referencia: versión de código y runtime, memoria, arquitectura, región, tamaño de las entradas, concurrencia y servicios llamados. Define qué debe mejorar —por ejemplo, el costo por operación correcta bajo una latencia p95 acordada— y registra duración, <code>Billed Duration</code>, <code>Init Duration</code>, memoria máxima usada, errores, timeouts y throttles. Para más detalle de costos por ajuste, sigue con [cómo medir costo y rendimiento de Lambda](https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/).

Prueba varias configuraciones de memoria con el mismo código y entradas. Repite la medición y evita ejecutar todas las variantes en paralelo si compiten por una base de datos u otro servicio limitado. Compara percentiles y errores además del promedio: una configuración rápida para una entrada pequeña puede fallar o volverse lenta ante un lote grande.

Si necesitas investigar un cuello de botella antes de cambiar memoria, [Diagnóstico de AWS Lambda: guía para detectar y solucionar problemas de rendimiento](https://dev.to/aws-espanol/eleva-el-rendimiento-de-aws-lambda-7il), de Hazel Sáenz (4 de mayo de 2024), recorre CloudWatch, X-Ray y Logs Insights. Es una guía de observabilidad anterior al cambio de facturación de INIT: úsala para explorar señales y contrasta los cálculos de costo con la documentación actual de AWS enlazada aquí.

### AWS Lambda Power Tuning

[AWS Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning) es una herramienta de código abierto basada en Step Functions. Invoca la función objetivo con los valores de memoria que configures y presenta promedios de costo y duración para estrategias como costo, rapidez o equilibrio. AWS también la recomienda en su [guía de memoria](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html).

La herramienta ejecuta tu función en tu cuenta: puede hacer llamadas HTTP y solicitudes con el SDK, además de crear cold starts. Por eso genera cargos de Lambda y Step Functions y podría escribir en sistemas reales o cargar una dependencia. Pruébala con una función y datos de ensayo seguros, comprueba sus efectos y permisos, limita las invocaciones y revisa los costos del estado de Step Functions. El gráfico ayuda a comparar configuraciones; no demuestra por sí solo que las salidas sean correctas ni que el tráfico de producción se comporte igual.

Para ver un recorrido en español, [Tunea tus funciones Lambda, de Camilo Cabrales](https://dev.to/cecamilo/tunea-tus-funciones-lambda-31a4) (9 de marzo de 2023) muestra un despliegue y una ejecución de Power Tuning. El tutorial antecede a la facturación actual de INIT; usa el repositorio del proyecto para confirmar los pasos vigentes y no tomes sus cifras de ejemplo como precios de hoy.

### Compara x86_64 y arm64 por separado

La arquitectura <code>arm64</code> con AWS Graviton puede ofrecer una relación precio-rendimiento favorable, pero la diferencia depende de la función. Haz una prueba aparte con código y entradas equivalentes y consulta el precio aplicable a cada arquitectura.

Antes de migrar, comprueba que tus dependencias nativas, capas y extensiones tengan una versión compatible. Las imágenes de contenedor también deben construirse para la arquitectura elegida. La [guía de AWS para arquitecturas Lambda](https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html) detalla estas condiciones y recomienda probar el rendimiento antes de cambiar tráfico.

## Concurrencia: controla capacidad, no la factura con un solo número

La concurrencia es la cantidad de invocaciones que se procesan al mismo tiempo. Ajustarla puede proteger una base de datos o ayudar a cumplir un objetivo de latencia, pero no convierte automáticamente el uso en más barato.

| Configuración | Qué hace | Efecto en costos y capacidad |
| --- | --- | --- |
| **Concurrencia reservada** | Establece capacidad exclusiva para una función y limita su máximo de ejecuciones simultáneas. | Configurarla no tiene cargo adicional. La capacidad apartada no queda disponible para otras funciones y un límite demasiado bajo puede causar throttles. |
| **Concurrencia aprovisionada** | Mantiene una cantidad de entornos inicializados antes de las solicitudes. | Añade un cargo por memoria, cantidad configurada y tiempo habilitado, redondeado a intervalos de cinco minutos. También se facturan solicitudes y duración; la capacidad excedida puede ejecutarse bajo demanda. |

Usa concurrencia reservada para aislar capacidad o poner un tope cuando haya una razón de capacidad. Considera concurrencia aprovisionada si las mediciones muestran que los cold starts incumplen una meta de latencia. Se cobra mientras está habilitada aunque parte de esa capacidad no atienda tráfico, y el nivel gratuito de Lambda no aplica a funciones que la activan. La [documentación de escalado](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html) y los [precios de concurrencia aprovisionada](https://aws.amazon.com/lambda/pricing/#Provisioned_Concurrency_Pricing) describen esos cargos. Para pasos de configuración y métricas, consulta [la guía de concurrencia aprovisionada](https://dondeaprendoaws.com/blog/concurrencia-aprovisionada-solucion-a-cold-starts-en-aws-lambda/).

## Optimiza el flujo completo, no solo el handler

En una API o un proceso por eventos, Lambda puede ser solo una parte de la factura. Haz un inventario de lo que el flujo crea o usa:

| Componente | Qué revisar |
| --- | --- |
| Registros, métricas y trazas | Volumen de logs, retención, consultas de Logs Insights y herramientas de observabilidad; revisa los [precios de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/). |
| Entrada HTTP | Solicitudes y transferencia de API Gateway; consulta sus [precios](https://aws.amazon.com/api-gateway/pricing/). |
| Colas y orquestación | Solicitudes, sondeo y transiciones de SQS, EventBridge o Step Functions; consulta [SQS](https://aws.amazon.com/sqs/pricing/), [EventBridge](https://aws.amazon.com/eventbridge/pricing/) y [Step Functions](https://aws.amazon.com/step-functions/pricing/). Power Tuning también incurre en cargos de Step Functions. |
| Red y transferencia | Tráfico entre servicios, salida a internet y NAT Gateway si tu arquitectura lo utiliza; revisa los [precios de VPC](https://aws.amazon.com/vpc/pricing/) y de transferencia asociados a la ruta. |
| Almacenamiento y datos | Bases de datos, EFS y otros servicios que la función consulta o modifica. Cada uno tiene su propia tarifa. |
| Espacio temporal <code>/tmp</code> | Los primeros 512 MB no tienen cargo adicional; el almacenamiento extra configurado se cobra según capacidad y duración. Los [precios de Lambda](https://aws.amazon.com/lambda/pricing/#Lambda_Ephemeral_Storage_Pricing) detallan la cuenta. |

Las capas Lambda ayudan a empaquetar y compartir dependencias, pero por sí solas no reducen el costo de ejecución. Del mismo modo, AWS puede reutilizar un entorno después de una invocación, pero no garantiza que la próxima llamada use ese mismo entorno. Mide cualquier cambio de empaquetado, inicialización o reutilización en tu carga antes de contar un ahorro.

Para estimar la arquitectura completa, usa la [AWS Pricing Calculator](https://calculator.aws/) con región y servicios concretos. Cuando el flujo ya está activo, Cost Explorer ayuda a investigar lo que se facturó: puedes filtrar por Lambda y agrupar por tipo de uso. La guía interna [Cómo usar Cost Explorer para investigar costos](https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/) explica ese análisis; Cost Explorer no muestra los cargos en tiempo real.

## Aprende con la comunidad AWS

Un benchmark sirve más si otras personas pueden entender y cuestionar cómo se hizo. Comparte región, runtime, arquitectura, memoria, tipo y tamaño de entrada, cantidad de muestras, p50/p95, <code>Billed Duration</code>, errores y costo estimado. No publiques credenciales, datos de clientes ni cuerpos sensibles.

La grabación [Deja de asumir: comparación de costos de Python, Go y Rust en serverless](https://www.youtube.com/watch?v=4UJLnLnxUwo) es del [canal de YouTube del AWS User Group Guatemala](https://www.youtube.com/@awsugguatemala), publicada el **25 de febrero de 2026**. Compara lenguajes en un contexto concreto; úsala para aprender el método y no como ahorro esperado para cualquier función.

También puedes conversar con [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) y preguntar por actividades o formas de participar. Dos sesiones en línea están anunciadas para octubre de 2026:

- [EC2 vs Lambda](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/), organizada por AWS User Group Tlaxcala FireflyCloud: **16 de octubre, 16:00–17:00, hora de México (UTC−6)**. Compara los dos modelos y sus costos.
- [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/), de AWS User Group Serverless Colombia: **20 de octubre, 19:00–21:00, hora de Colombia (UTC−5)**. Trata el uso de colas y Lambda ante fallos.

No hace falta encontrar un grupo dedicado exclusivamente a optimizar costos: un AWS User Group local también sirve para compartir una prueba, pedir una revisión o ayudar a reproducir un caso. Explora el [directorio de comunidades AWS en Latinoamérica](/comunidades/) y la [agenda de eventos](/eventos/) para encontrar otras actividades. Confirma fecha, modalidad e inscripción en cada ficha; las fechas de arriba pasarán.

## Preguntas frecuentes

### ¿Más memoria siempre reduce el costo?

No. Aumenta la CPU y puede acortar la ejecución, pero solo una prueba representativa mostrará si la duración baja lo suficiente para compensar el mayor recurso asignado.

### ¿Si el timeout está en 10 segundos pago 10 segundos en cada llamada?

No. Es el máximo permitido. Si la función termina antes, el límite no convierte el tiempo restante en cómputo facturado. Si alcanza el timeout, se factura el trabajo ejecutado y pueden existir reintentos.

### ¿La concurrencia reservada me cobra por las unidades sin usar?

No tiene un cargo propio, pero aparta parte de la capacidad regional. La concurrencia aprovisionada sí añade cargos mientras está habilitada, incluso si queda ociosa.

### ¿Qué significa el límite de 15 minutos?

Para el modelo estándar, una invocación puede durar hasta 900 segundos. Lambda Managed Instances permite hasta 5.400 segundos para algunas invocaciones asíncronas y de mapeos de eventos, con excepciones; tiene otro modelo de precios. Revisa el [límite de timeout](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html) y la documentación de [Lambda Managed Instances](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances.html) antes de diseñar un proceso largo.
