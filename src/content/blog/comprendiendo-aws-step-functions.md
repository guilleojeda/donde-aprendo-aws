---
title: "AWS Step Functions: qué es y cómo elegir Standard o Express"
description: "Aprende qué es AWS Step Functions, cuándo usar Standard o Express y cómo modelar un flujo ASL con JSONPath, decisiones y manejo de errores."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:40:56.477Z"
modifiedTimestamp: "2026-10-06T09:52:18-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
  - title: "AWS Lambda: cómo funciona, invocaciones y concurrencia"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/"
  - title: "Amazon ECS: qué es y cómo ejecutar tu primera tarea"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-amazon-ecs/"
  - title: "Qué es Amazon Bedrock y cómo usarlo: API, permisos y costos"
    url: "https://dondeaprendoaws.com/blog/como-utilizar-amazon-bedrock/"
  - title: "Monitoreo y logs de AWS Step Functions: guía 2024"
    url: "https://dondeaprendoaws.com/blog/monitoreo-y-logs-de-aws-step-functions-guia-2024/"

---

AWS Step Functions coordina los pasos de un proceso y conserva el estado de su ejecución. Puedes usarlo para llamar servicios de AWS o APIs, elegir una ruta según los datos, ejecutar ramas en paralelo y manejar errores. Defines el flujo con **Amazon States Language (ASL)** —un formato JSON— o lo diseñas visualmente en **Workflow Studio**. Step Functions coordina el trabajo; las tareas siguen ejecutándose en el servicio que las realiza, como Lambda, ECS o Bedrock.

Te conviene cuando necesitas ver y controlar una secuencia con decisiones, esperas, reintentos o varias tareas. Para una operación breve que solo requiere una función, quizá baste con invocar Lambda directamente. Si tu objetivo es publicar eventos para que varios servicios reaccionen de forma independiente, compara ese patrón con la [arquitectura dirigida por eventos en AWS](https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/).

## ¿Qué es una máquina de estados en Step Functions?

Una máquina de estados es un flujo de pasos conectados. Cada paso es un **estado**: recibe datos JSON, realiza una tarea o controla el recorrido, y entrega datos al siguiente estado. `StartAt` indica dónde empieza el flujo; `States` reúne las definiciones de sus pasos y cada estado termina con `Next`, `End`, una rama o un resultado de éxito o error.

ASL puede llamar directamente integraciones optimizadas o acciones de API de AWS. Por eso, no necesitas agregar una función Lambda solo para conectar dos servicios. Un estado `Task` puede invocar Lambda, consultar DynamoDB o Bedrock, llamar a una API, o iniciar un trabajo de ECS/Fargate. Si quieres ver cómo Step Functions coordina tareas en contenedores, continúa con [la guía de Amazon ECS](https://dondeaprendoaws.com/blog/comprendiendo-amazon-ecs/); para integrar IA generativa, revisa [la guía de Amazon Bedrock](https://dondeaprendoaws.com/blog/como-utilizar-amazon-bedrock/). Según la integración, también puede esperar a que termine un trabajo o a que una persona devuelva un token. Esos patrones de espera están disponibles en Standard y solo para los servicios que los admiten.

| Estado | Para qué sirve |
| --- | --- |
| `Task` | Ejecutar una unidad de trabajo mediante una integración, una actividad o una API. |
| `Choice` | Elegir la siguiente ruta a partir de los datos de entrada. |
| `Map` | Aplicar pasos a los elementos de una lista. |
| `Parallel` | Ejecutar varias ramas del flujo. |
| `Pass` | Pasar o preparar datos sin llamar a un servicio externo. |
| `Wait` | Pausar el flujo por una duración o hasta un momento definido. |
| `Succeed` y `Fail` | Finalizar la ejecución con éxito o error. |

Workflow Studio permite editar estos pasos con una interfaz visual y ver la definición ASL correspondiente. La definición sigue siendo útil para revisiones de código, control de versiones e infraestructura como código.

## Standard o Express: cuál elegir

El tipo de flujo cambia la duración máxima, la semántica de ejecución, el historial disponible y el modelo de cobro. **Debes elegirlo al crear la máquina de estados: no se puede cambiar después.**

| Criterio | Standard | Express |
| --- | --- | --- |
| Duración máxima | Hasta un año. | Hasta cinco minutos. |
| Semántica de ejecución | Exactamente una vez, salvo que configures un `Retry` que vuelva a ejecutar un estado. | Asíncrono: al menos una vez; una ejecución puede repetirse. Síncrono: como máximo una vez; una excepción no reinicia la ejecución. |
| Historial | El historial de la ejecución se puede consultar durante 90 días después de completarse. | Step Functions no guarda el historial de ejecución; activa CloudWatch Logs para inspeccionarlo. |
| Integraciones | Admite todos los patrones de integración que soporte cada servicio, incluidos algunos trabajos con espera (`.sync`) y callbacks (`.waitForTaskToken`). | Admite solicitudes y respuestas; no admite los patrones `.sync` ni `.waitForTaskToken`. |
| Cobro de Step Functions | Por cantidad de transiciones de estado. | Por cantidad de ejecuciones, duración y memoria consumida. |

Elige **Standard** para procesos duraderos o auditables, aprobaciones humanas y trabajos que deben esperar una operación de varios minutos u horas. **Express** encaja con flujos breves y frecuentes, como procesar eventos o atender un backend que necesita una respuesta síncrona. En cualquier tipo, revisa qué ocurre si una tarea se repite y cómo observarás sus resultados. Consulta los [detalles de tipos y semántica](https://docs.aws.amazon.com/es_es/step-functions/latest/dg/choosing-workflow-type.html) y los [precios vigentes de Step Functions](https://aws.amazon.com/step-functions/pricing/); la ejecución de los servicios integrados y el almacenamiento de logs pueden tener cargos propios.

## JSONPath y JSONata: elige una sintaxis de datos

ASL define el flujo; `QueryLanguage` indica cómo seleccionar y transformar sus datos. Si omites este campo, Step Functions usa **JSONPath**. En JSONPath, una ruta como `$.total` apunta al campo `total`; para transformar datos también existen campos como `InputPath`, `Parameters`, `ResultPath` y `OutputPath`.

**JSONata** ofrece otra sintaxis. Se declara con `"QueryLanguage": "JSONata"`, expresa cálculos entre `{%` y `%}`, y usa campos como `Arguments` y `Output`. Dentro de un estado, no combines esos campos con `Parameters` o claves que terminan en `.$`: pertenecen a modelos distintos. ASL permite migrar por partes si la máquina declara JSONPath en el nivel superior y algunos estados lo anulan con JSONata; en una máquina declarada como JSONata no puedes volver a mezclar estados JSONPath. AWS recomienda JSONata para nuevas máquinas creadas desde la consola, pero JSONPath sigue siendo el valor predeterminado si omites `QueryLanguage`. Este ejemplo fija JSONPath de forma explícita; consulta la [guía de JSONata](https://docs.aws.amazon.com/es_es/step-functions/latest/dg/transforming-data.html) antes de adaptar una definición a esa sintaxis.

## Ejemplo ASL: decidir qué hacer con una orden

Esta máquina aprueba automáticamente solo las órdenes cuyo `total` es un número menor que 1000. Las demás entradas —incluido un monto alto, ausente o con otro tipo de dato— van a revisión manual. Solo usa los estados `Choice` y `Pass`: no invoca Lambda ni otros servicios de AWS.

```json
{
  "Comment": "Clasificar una orden por monto",
  "QueryLanguage": "JSONPath",
  "StartAt": "EvaluateTotal",
  "States": {
    "EvaluateTotal": {
      "Type": "Choice",
      "Choices": [
        {
          "And": [
            {
              "Variable": "$.total",
              "IsPresent": true
            },
            {
              "Variable": "$.total",
              "IsNumeric": true
            },
            {
              "Variable": "$.total",
              "NumericLessThan": 1000
            }
          ],
          "Next": "ApproveAutomatically"
        }
      ],
      "Default": "ManualReview"
    },
    "ManualReview": {
      "Type": "Pass",
      "Result": {
        "decision": "review"
      },
      "End": true
    },
    "ApproveAutomatically": {
      "Type": "Pass",
      "Result": {
        "decision": "approved"
      },
      "End": true
    }
  }
}
```

Prueba la lógica leyendo estos datos; `total` debe ser un número JSON, sin comillas:

- Con `{"orderId":"ord-123","total":450}`, `$.total` es menor que 1000 y `Choice` lleva a `ApproveAutomatically`; el resultado es `{"decision":"approved"}`.
- Con `{"orderId":"ord-456","total":1250}`, la regla no coincide y `Default` lleva a `ManualReview`; el resultado es `{"decision":"review"}`. El mismo `Default` recibe una orden si falta `total` o si no es un número.

Para revisar el formato JSON sin una cuenta de AWS, guarda la definición en `order-routing.asl.json` y ejecuta `jq empty order-routing.asl.json`. Esto comprueba que el archivo sea JSON válido; no valida las reglas ASL. El ejercicio se resuelve localmente y no crea una máquina ni ejecuta recursos facturables. Si luego quieres probar un estado en AWS, [TestState](https://docs.aws.amazon.com/es_es/step-functions/latest/dg/test-and-debug.html) permite ejecutar estados compatibles sin crear o actualizar una máquina de estados. Usa mocks para evitar que una prueba de integración llame al servicio real.

## Reintentos, errores e idempotencia

`Retry` vuelve a intentar un estado cuando ocurre un error que coincide con la política configurada. Puedes limitar intentos y aumentar la espera entre ellos. `Catch` captura errores seleccionados y lleva el flujo a un estado alternativo, por ejemplo para registrar un rechazo o iniciar una compensación. Estos campos se configuran en estados `Task`, `Parallel` y `Map`; una captura no convierte cada fallo posible de la ejecución en un caso recuperable.

Un reintento puede repetir un efecto externo. Una API puede haber guardado un pedido aunque la respuesta se haya perdido o haya llegado tarde. Por eso, no trates la semántica de Standard como una garantía de que el efecto de negocio jamás se duplicará: un `Retry` explícito, una nueva ejecución o el servicio llamado pueden repetirlo. Diseña las tareas para que sean **idempotentes**: usa un identificador estable de operación, una escritura condicional o un token de idempotencia si la API lo admite. Si una operación no se puede repetir, define también cómo compensarla.

Los roles de ejecución de la máquina necesitan permisos IAM para las acciones que invocan sus tareas. Limítalos a los recursos y operaciones necesarios; evita otorgar permisos amplios solo para que una integración funcione. La [guía de control de errores](https://docs.aws.amazon.com/es_es/step-functions/latest/dg/concepts-error-handling.html) y la documentación para [crear un rol de ejecución](https://docs.aws.amazon.com/es_es/step-functions/latest/dg/procedure-create-iam-role.html) describen esos controles.

## Límites que afectan el diseño

El tamaño máximo de entrada o salida de una tarea, estado o ejecución es **256 KiB** de datos codificados como texto UTF-8, tanto para Standard como para Express. Para archivos o mensajes mayores, conserva los datos en S3 u otro almacenamiento y pasa una referencia en el flujo. Revisa también las cuotas de concurrencia, solicitudes e historial aplicables a tu región en la [tabla de cuotas de Step Functions](https://docs.aws.amazon.com/es_es/step-functions/latest/dg/service-quotas.html).

Si eliges Express, habilita CloudWatch Logs cuando necesites revisar en detalle qué pasó en una ejecución; los registros se guardan según el grupo y la retención que configures. Considera el costo de Step Functions, los servicios invocados y los logs en conjunto, y prueba con un volumen parecido al esperado antes de estimar el gasto.

## Tutoriales, videos y comunidades en español

Para avanzar desde la definición hasta las integraciones, estas referencias cubren niveles distintos:

- La documentación de AWS reúne [tutoriales y talleres de Step Functions](https://docs.aws.amazon.com/es_es/step-functions/latest/dg/learning-resources.html) sobre tareas, ramas, manejo de errores y mapas. El [AWS Step Functions Workshop](https://catalog.workshops.aws/stepfunctions/en-US) es interactivo; este enlace abre la versión en inglés y cubre funciones actuales como JSONata. Antes de seguir un módulo en tu cuenta, revisa sus requisitos, si crea recursos y sus instrucciones de costos y limpieza.
- [Aplicaciones distribuidas usando eventos y máquinas de estado](https://blog.marcia.dev/estados-y-workflows), de Marcia Villalba, enlaza una introducción a Step Functions, un ejemplo con SAM y una charla que contrasta eventos con máquinas de estado. Es una colección publicada en 2023; úsala para explorar los patrones y confirma la sintaxis actual en la documentación de AWS.
- [Llamar APIs desde Step Functions con SAM](https://www.andmore.dev/es/blog/http-invoke-with-sam/), de AndMore Dev, muestra un estado HTTP Task y una conexión de EventBridge con una clave para una API externa. Para reproducirlo hacen falta esa credencial y los recursos descritos en el artículo; revisa además las condiciones y costos del proveedor externo.
- [Al día con AWS #15: Step Functions Workflow Studio](https://www.youtube.com/watch?v=802UN9PYzG8), de Carlos Cortez, demuestra el diseñador visual. La ficha lo asocia con AWS User Group Perú; consulta sus [actividades en Meetup](https://www.meetup.com/awsperu/) para conocer encuentros actuales.
- [Episodio II: Ataque del Nivel 200: AWS Step Functions: Integración de servicios](https://www.youtube.com/watch?v=Je-7jIzLdJA) es una sesión grabada de AWS Women Colombia sobre integraciones directas. La comunidad publica sus [grabaciones y actividades](https://awswomencolombia.com/page/eventos) y mantiene un [grupo en Meetup](https://www.meetup.com/aws-women-colombia-user-group/).
- [Orquestación y procesamiento de datos en batch con Step Functions](https://www.youtube.com/watch?v=R5RCR8oWFl4) es una charla grabada de AWS User Group Ecuador. Puedes seguir los [eventos y talleres del grupo](https://www.awsugecuador.com/) o revisar su canal y agenda desde el sitio.
- [Aprende sobre máquinas de estado con AWS Step Functions](https://www.youtube.com/watch?v=rvhOKO-XROs) es una grabación del canal de AWS User Group Guatemala. El grupo publica charlas y grupos de estudio en [su canal](https://www.youtube.com/@awsugguatemala).
- La grabación del [31.º meetup de AWS User Group Panamá sobre DynamoDB y Step Functions](https://www.youtube.com/watch?v=5Dmamlu1f9I) incluye una ponencia dedicada a Step Functions. Consulta el [grupo de Panamá en Meetup](https://www.meetup.com/aws-user-group-panama/) para ver sus próximas actividades; esta grabación es un encuentro pasado.
- El índice de cursos de Marcia Villalba presenta en español [Automatización de procesos con Step Functions e inteligencia artificial](https://join.desplegando.cloud/curso/orquestacion-step-functions/), de nivel intermedio-avanzado y cinco horas. La ficha invita a una lista de espera y el catálogo del autor muestra actualmente `$399`; comprueba precio, disponibilidad y condiciones antes de anotarte. El mismo catálogo ofrece en inglés [The ultimate AWS Step Functions guide](https://blog.marcia.dev/the-ultimate-aws-step-functions-guide), que el autor marca como gratuito y organiza alrededor de estados, errores, costos, integraciones y patrones.

## Preguntas frecuentes

### ¿Step Functions reemplaza a Lambda?

No. Step Functions coordina el recorrido y puede llamar a Lambda, pero no ejecuta por sí solo el código de negocio de una función. También puede llamar directamente a muchas APIs de AWS y evitar una Lambda intermediaria cuando no se necesita lógica propia.

### ¿Se puede probar sin crear una máquina de estados?

Sí. El tutorial de esta página se sigue en un archivo local. Si necesitas probar en AWS, TestState ejecuta un estado compatible sin crear o actualizar una máquina. Para integraciones externas, usa mocks si no quieres realizar la llamada durante la prueba.

### ¿Standard garantiza que un cobro, pedido o escritura ocurra una sola vez?

Garantiza la semántica de ejecución de Standard, con la excepción de los reintentos que configures. No elimina los efectos ambiguos cuando un servicio externo completa una operación pero Step Functions no recibe la respuesta. Usa idempotencia o compensaciones para proteger el proceso de negocio.
