---
title: "AWS Lambda: cómo medir costo y rendimiento"
description: "Calcula GB-segundos y compara memoria, arquitectura y cold starts en AWS Lambda. Mide costo por operación correcta sin asumir ahorros ni rendimiento."
author: "guille-ojeda"
publishedAt: "2024-05-08"
publishedTimestamp: "2024-05-08T05:33:11.031Z"
modifiedTimestamp: "2026-10-05T14:54:05-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS Lambda: cómo funciona, invocaciones y concurrencia"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/"
  - title: "AWS Lambda y API Gateway: crea una HTTP API paso a paso"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/"
---

Para optimizar costo y rendimiento en AWS Lambda, compara **la duración facturada, los GB-segundos y la latencia que percibe el usuario** con una carga representativa. La función con menos memoria no siempre es la más barata: más memoria aporta más CPU y puede terminar antes. Tampoco la más rápida cumple necesariamente tu presupuesto.

Esta guía se centra en el **modo de cómputo predeterminado, bajo demanda**. Las fórmulas no describen Lambda Managed Instances, cuyo modelo incluye instancias EC2 y cargos de administración, ni todos los cargos de funciones durables, streaming u otras capacidades. Comprueba el modo y la región antes de calcular.

Si todavía estás aprendiendo el servicio, comienza por [cómo funciona Lambda y su concurrencia](https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/). Para practicar con una entrada HTTP concreta tienes [la guía de Lambda y API Gateway](https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/); aquí analizaremos cómo medir, sin repetir ese despliegue.

## Qué medir antes de cambiar la configuración

Define la decisión con una frase, por ejemplo: «Elegir la configuración de memoria que cumpla la latencia de mi API al menor costo por operación correcta». El objetivo de latencia, los errores tolerables y el presupuesto pertenecen a tu aplicación; no existe un valor universal.

Conserva una referencia antes de tocar parámetros: versión del código y runtime, arquitectura, memoria, timeout, región, tamaño de entrada, concurrencia y dependencias. El resultado de un saludo sin llamadas externas no describe el de un procesador de imágenes ni el de una función que espera una base de datos.

| Señal | Para qué te sirve |
| --- | --- |
| Latencia de extremo a extremo | Saber cuánto espera el cliente, incluyendo la API, inicialización y dependencias. |
| `Duration`, con media y percentiles | Observar el tiempo de procesamiento de la función. |
| `Billed Duration` y memoria configurada | Calcular consumo facturado por invocación. |
| `Init Duration`, cuando esté presente | Investigar inicialización de un entorno nuevo. |
| Memoria utilizada | Detectar presión de memoria, sin olvidar que memoria configurada también controla CPU. |
| Errores, timeouts, throttling y reintentos | Evitar que un promedio rápido o un costo aparente oculten operaciones fallidas. |

Consulta las [métricas oficiales de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html) y los registros de cada invocación. **`Duration` no incluye el tiempo de cold start**; no la uses como sustituto automático de latencia de cliente o de duración facturada. `Max Memory Used` describe el uso observado del entorno y no demuestra por sí solo cuál es la memoria óptima.

## Cómo calcular el consumo de una función bajo demanda

En el caso sencillo, suma la memoria configurada multiplicada por la duración facturada de cada ejecución:

```text
GB-segundos = Σ [(memoria_MB / 1024) × (Billed_Duration_ms / 1000)]
costo de cómputo = GB-segundos facturables × tarifa aplicable por GB-segundo
costo de solicitudes = unidades de solicitud facturables × tarifa por unidad
```

Obtén las tarifas de la [página de precios de Lambda](https://aws.amazon.com/lambda/pricing/) para tu **región, arquitectura y tramo de consumo**. Para una estimación mensual, considera también la oferta gratuita, créditos o descuentos que realmente correspondan a tu cuenta, después de calcular el consumo bruto. El volumen compartido con otras funciones puede cambiar la parte facturable.

Desde el **1 de agosto de 2025**, AWS estandarizó el [cobro de la fase INIT](https://aws.amazon.com/blogs/compute/aws-lambda-standardizes-billing-for-init-phase/), incluyendo funciones ZIP con runtimes administrados bajo demanda. Una hoja que multiplica solamente el tiempo del handler puede subestimar el consumo. Utiliza el `Billed Duration` real y no sumes otra vez un INIT que ya esté incluido.

Una operación de negocio puede necesitar varias invocaciones por reintentos. Además, en eventos asíncronos mayores de 256 KB se agregan unidades de solicitud por tramos de 64 KB hasta el límite admitido de 1 MB. **Un evento no siempre equivale a una unidad facturable.** Verifica ese detalle en precios cuando proceses payloads grandes.

### Ejemplo aritmético: más memoria puede consumir menos

Estos valores son **supuestos para explicar la cuenta**, no mediciones de Lambda ni una promesa de mejora:

| Configuración | Duración facturada supuesta | GB-segundos por invocación | GB-segundos para 100.000 invocaciones |
| --- | --- | --- | --- |
| A: 512 MB | 1.000 ms | 0,5 | 50.000 |
| B: 1.024 MB | 400 ms | 0,4 | 40.000 |
| C: 1.024 MB | 700 ms | 0,7 | 70.000 |

Con la misma tarifa de cómputo, B consume menos que A; C consume más. Duplicar la memoria necesita reducir la duración a menos de la mitad para disminuir esos GB-segundos. El número de solicitudes se mantiene igual en este ejemplo; no incluye descuentos ni otros cargos. Para una función real necesitas medir las duraciones, no elegir la fila que te gustaría obtener.

## Memoria y CPU: busca el cuello de botella

Lambda asigna CPU en proporción a la memoria configurada. La [guía de memoria](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html) explica por qué un trabajo limitado por CPU puede mejorar al aumentarla. Prueba varias configuraciones que tengan sentido para tu carga y revisa si la reducción de duración compensa el aumento de memoria.

Si la función pasa la mayor parte del tiempo esperando una API o consulta lenta, más CPU puede aportar poco. Mide cada dependencia, reduce trabajo innecesario y reutiliza conexiones cuando sea correcto. Una caché requiere decidir caducidad y consistencia: ahorrar llamadas devolviendo datos incorrectos no cumple el objetivo.

Para una lectura práctica en español, [Tunea tus funciones Lambda, de Camilo Cabrales](https://dev.to/cecamilo/tunea-tus-funciones-lambda-31a4), muestra el enfoque de explorar memoria. [Diagnóstico de AWS Lambda, de Hazel Sáenz](https://dev.to/aws-espanol/eleva-el-rendimiento-de-aws-lambda-7il), ayuda a investigar señales y cuellos de botella. Úsalos como métodos; vuelve a medir con tu código y precios actuales.

## Compara x86_64 y arm64 con tus dependencias

La [guía de arquitecturas de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html) distingue x86_64 y arm64. Antes de cambiar, verifica librerías nativas, capas, extensiones e imágenes de contenedor. Un paquete compilado para x86_64 no se vuelve compatible con arm64 por cambiar una casilla.

Compara ambas arquitecturas manteniendo código, entradas, memoria y patrón de tráfico equivalentes. Usa la tarifa correspondiente a cada una. No atribuyas a la arquitectura una diferencia causada por otra versión de librería, una caché recién vacía o un servicio externo saturado.

La grabación [Deja de asumir: comparación de costos de Python, Go y Rust en serverless](https://www.youtube.com/watch?v=4UJLnLnxUwo) aporta una discusión sobre comparar cargas y lenguajes. Sus resultados pertenecen a sus condiciones de prueba; no conviertas una charla ni un benchmark ajeno en el porcentaje esperado para tu aplicación.

## Cold starts y concurrencia aprovisionada

Un cold start prepara un entorno nuevo; un aumento de tráfico puede provocarlo aunque haya otras ejecuciones activas. Primero reduce inicialización innecesaria y comprueba cuánto afecta a la latencia de tu carga. Invocar la función periódicamente no garantiza que una ráfaga encuentre todos los entornos listos.

La [concurrencia aprovisionada](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html) prepara capacidad sobre una versión o alias. Si la integración llama a otro destino, no usa esa capacidad. El tráfico que la excede puede ejecutarse bajo demanda; observa `ProvisionedConcurrencySpilloverInvocations` para no evaluar solo las solicitudes que entraron en los entornos preparados.

Su consumo de capacidad se calcula así:

```text
GB-segundos aprovisionados = concurrencia configurada × (memoria_MB / 1024)
                             × segundos habilitados facturables
```

A ese cargo agrega solicitudes, ejecución y cualquier tráfico excedente con sus tarifas. El período se redondea a intervalos de cinco minutos y hay cobro aunque no llegue tráfico, según [precios de concurrencia aprovisionada](https://aws.amazon.com/lambda/pricing/#Provisioned_Concurrency_Pricing). No confundas esta capacidad con **concurrencia reservada**, que limita y aparta capacidad de ejecución sin preparar entornos.

[SnapStart](https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html) es otra opción para inicialización, con compatibilidad, restricciones y precios propios. Verifica runtime, región y condiciones; no lo actives como si fuese intercambiable con concurrencia aprovisionada.

## Un experimento pequeño y repetible

1. **Elige una operación y entradas representativas.** Incluye tamaños frecuentes y casos exigentes que ocurran realmente. Usa datos ficticios o autorizados y evita efectos reales como pagos o envíos.
2. **Fija la referencia.** Guarda configuración y resultados actuales. Asegúrate de que cada candidata produzca respuestas correctas.
3. **Cambia una variable.** Por ejemplo, memoria con arquitectura fija; después compara arquitectura con la memoria seleccionada. Conserva las demás condiciones.
4. **Separa inicialización y reutilización.** Identifica qué ejecuciones tuvieron INIT; no mezcles un ensayo de cold starts con otro que solo reutilizó entornos. Evita enviar todas las variantes al mismo tiempo si compiten por una dependencia.
5. **Repite y registra.** Anota invocaciones, distribución de latencias, duración facturada, errores y consumo. Si tienes pocas observaciones, no presentes un p99 como una estimación estable.
6. **Calcula costo por operación correcta.** Incluye los intentos que consumieron recursos y fallaron. Extrapola al mes solo si el volumen y la distribución de entradas son razonables.
7. **Comprueba bajo el tráfico esperado.** Un ajuste que funciona con una llamada a la vez puede saturar conexiones al aumentar la concurrencia. Limita volumen, duración y presupuesto del experimento antes de ejecutarlo.

Una tabla de resultados puede guardar: configuración, número de muestras, frío/caliente, p50/p95, errores, GB-segundos y costo estimado. Elige la opción de menor costo que cumpla tus objetivos y conserva evidencia para repetir la comparación tras cambios relevantes de código o dependencias.

### Herramientas que ayudan, sin decidir por ti

[AWS Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning) es una herramienta de código abierto que ejecuta varias configuraciones usando Step Functions en tu cuenta. **Invoca la función real y genera consumo**; utiliza una función de prueba sin efectos peligrosos. Revisa entradas, repeticiones, permisos y valores de precio configurados. El gráfico resultante no verifica corrección funcional ni reproduce por sí solo el tráfico de producción.

[Compute Optimizer](https://docs.aws.amazon.com/compute-optimizer/latest/ug/requirements.html) puede recomendar memoria si cumples sus requisitos y habilitas el servicio. Actualmente exige memoria configurada de hasta 1.792 MB y al menos 50 invocaciones en los últimos 14 días para esas recomendaciones. La ausencia de recomendación no demuestra que tu función sea óptima; puede faltar cobertura o datos.

El artículo [Optimizaciones Lambda AWS, de Kevin Lupera](https://dev.to/kevinlupera/optimizaciones-lambda-aws-2one) y la grabación [AWS Lambda, estrategias para una vida feliz](https://www.youtube.com/watch?v=IdYttArX-FU) permiten explorar más prácticas. Comprueba cuáles atacan el cuello de botella que mediste antes de añadir mecanismos.

## Incluye el costo de toda la operación

La factura de una API no termina en Lambda: considera API Gateway, logs, almacenamiento, bases de datos, transferencia aplicable y componentes de red como NAT Gateway si los utilizas. La transferencia depende del origen, destino y región; no apliques una tarifa única a todas las llamadas entre servicios AWS.

El almacenamiento efímero adicional se cobra por la capacidad configurada **por encima de los 512 MB incluidos** y el tiempo de ejecución, no por cuántos bytes de archivos guardaste. La [guía de almacenamiento efímero](https://docs.aws.amazon.com/lambda/latest/dg/configuration-ephemeral-storage.html) describe qué estás configurando. Valora asimismo el volumen y retención de logs: registrar el cuerpo completo de cada solicitud puede aumentar consumo y exponer datos.

Consulta [AWS Pricing Calculator](https://calculator.aws/) para una estimación con los componentes elegidos y compárala después con la facturación real. En el laboratorio, elimina recursos que ya no necesitas; si experimentaste con concurrencia aprovisionada, desactívala explícitamente al terminar.

## Contrasta tus mediciones con la comunidad

Sigue el trabajo de [Hazel Sáenz](https://hazelsaenz.tech/) para diagnóstico y proyectos, [Camilo Cabrales en DEV](https://dev.to/cecamilo) para ejemplos y [Desplegando.cloud](https://desplegando.substack.com/) para cambios de Lambda y serverless. Lleva a [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) una tabla con región, runtime, memoria, arquitectura, tamaño de entradas y método de prueba: permite discutir un resultado reproducible sin compartir credenciales ni datos privados.

También puedes consultar actividades de [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/), [AWS User Group Ciudad de México](https://awsugcdmx.com/) y [AWS Women Colombia](https://awswomencolombia.com/). Las comunidades generales de AWS son útiles para revisar costos de red, observabilidad y dependencias que condicionan el rendimiento de tu función.

## Preguntas frecuentes

### ¿Aumentar memoria siempre reduce el costo?

No. Necesitas que la caída de duración compense el aumento de memoria y evaluar los demás cargos. Una función limitada por esperas puede consumir más sin mejorar significativamente.

### ¿Puedo calcular costo solo con el promedio de Duration?

Sirve como aproximación del procesamiento, pero omite inicialización y puede esconder variación, fallos y reintentos. Usa duración facturada y cantidades reales para consumo; percentiles y latencia de cliente para experiencia.

### ¿Lambda sigue siendo gratis si no hay solicitudes?

Una función bajo demanda sin ejecuciones no consume cómputo de invocación. Puede haber otros cargos: capacidad aprovisionada activa, recursos asociados, almacenamiento o logs conservados. Revisa todo lo que dejaste creado y la oferta vigente de tu cuenta.
