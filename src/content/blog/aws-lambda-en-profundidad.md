---
title: "AWS Lambda: cómo funciona, invocaciones y concurrencia"
description: "Entiende el ciclo de vida de AWS Lambda, eventos, reintentos, concurrencia y límites. Aprende a diagnosticar fallos y continúa con recursos en español."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T02:11:48.464Z"
modifiedTimestamp: "2026-10-05T14:54:05-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS Lambda y API Gateway: crea una HTTP API paso a paso"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/"
  - title: "AWS Lambda: cómo medir costo y rendimiento"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/"
---

AWS Lambda ejecuta tu código en respuesta a eventos y administra la infraestructura donde corre. Para usarlo bien necesitas entender **qué recibe tu función, quién la invoca, cómo se repiten los intentos y cuántas ejecuciones pueden coincidir**. El escalado automático no elimina los límites ni vuelve infalibles tus dependencias.

Esta guía explica las funciones con el modo de cómputo predeterminado de Lambda. Si quieres construir una API, continúa con [Lambda y API Gateway paso a paso](https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/); para elegir memoria y comparar configuraciones, usa la guía de [costo y rendimiento](https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/).

## Qué hace Lambda y qué sigue siendo tu responsabilidad

Una función combina código, runtime, configuración y un rol de ejecución. El **handler** es el punto de entrada: recibe un evento y un contexto, realiza una tarea y devuelve un resultado o un error. AWS administra los servidores; tú defines la lógica, permisos, dependencias, tiempos de espera y comportamiento ante fallos. La [guía del modelo de programación](https://docs.aws.amazon.com/lambda/latest/dg/foundation-progmodel.html) describe ese contrato.

Lambda encaja en tareas como transformar un archivo al llegar a S3, responder una consulta HTTP o procesar mensajes de una cola. Una invocación breve también puede iniciar un trabajo batch en otro servicio y guardar su identificador. Consulta el estado en una ejecución posterior o coordina el flujo con un servicio adecuado; mantener la función esperando consume tiempo y puede terminar en un timeout.

Antes de añadir una función que solo reenvía datos, revisa las integraciones directas disponibles. [Llamar APIs desde Step Functions con SAM, de Andres Moreno](https://www.andmore.dev/es/blog/http-invoke-with-sam/), muestra una alternativa concreta a una Lambda intermediaria. No todos los pasos de una aplicación serverless necesitan código propio.

## El entorno de ejecución puede reutilizarse

El [ciclo de vida del entorno de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html) incluye inicialización, invocación y apagado:

1. **Init:** se prepara el runtime y se ejecuta la inicialización de tu código, como cargar librerías o crear clientes.
2. **Invoke:** corre el handler con el evento recibido.
3. **Reutilización o apagado:** Lambda puede conservar y congelar el entorno para otra llamada, o retirarlo.

La preparación de un entorno nuevo produce un **cold start** y agrega latencia. Una llamada posterior puede aprovechar un entorno ya inicializado, pero no tienes garantía de recibir el mismo. Un aumento del tráfico también puede requerir entornos nuevos aunque la función se haya invocado recientemente.

Puedes crear clientes reutilizables fuera del handler, comprobando conexiones caducadas. Mantén los datos de cada usuario dentro de la invocación: una variable global con información de la solicitud anterior puede contaminar la siguiente. `/tmp` sirve como almacenamiento temporal y caché local; no es una base de datos ni un lugar confiable para conservar el estado de la aplicación.

Las capas permiten compartir dependencias, pero no hacen que una función arranque más rápido por sí solas. [Empaquetar con esbuild en lugar de capas](https://www.andmore.dev/es/blog/layerless-esbuild-lambda/), también de Andres Moreno, compara una forma de distribuir código compartido. Evalúa tamaño, dependencias y mantenimiento con tu proyecto, sin convertir una técnica de empaquetado en una promesa de rendimiento.

## Sincronía, asincronía y fuentes de eventos

El contenido de `event` depende de quien invoca la función. No existe un único JSON universal para HTTP, S3 y SQS. Estas tres formas de entrega también tienen comportamientos diferentes:

| Forma de invocación | Ejemplo | Qué ocurre con el resultado y los fallos |
| --- | --- | --- |
| Síncrona | API Gateway o una llamada directa con respuesta | El invocador espera el resultado. Debes revisar cómo ese cliente o servicio maneja los errores y reintentos. |
| Asíncrona | Notificación de S3 | Lambda acepta el evento en una cola interna y lo procesa después. Aceptado no significa completado. |
| Mapeo de fuente de eventos | SQS, Kinesis o DynamoDB Streams | Lambda lee mensajes o registros y los entrega al handler. Los lotes, reintentos y orden dependen de la fuente. |

La [documentación de invocaciones](https://docs.aws.amazon.com/lambda/latest/dg/lambda-invocation.html) y la de [comportamiento de reintentos](https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html) son el punto de partida para elegir el contrato correcto. API Gateway no vuelve a invocar automáticamente una función que falló: devuelve el error al cliente, según la [guía de errores de esa integración](https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway-errors.html).

### Reintentos y duplicados no son lo mismo

En la [invocación asíncrona](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html), un error de la función genera dos intentos adicionales de forma predeterminada. Los errores de capacidad o del servicio siguen otra política. Puedes ajustar antigüedad y reintentos, y capturar invocaciones fallidas con destinos o eventos descartados con una cola de mensajes no procesados. Incluso una ejecución exitosa puede recibir un evento repetido.

Por eso, diseña tareas **idempotentes**: repetir la misma operación no debe duplicar su efecto. Por ejemplo, usa el identificador estable del pedido para registrar de manera persistente si ya se procesó, con una escritura condicional o transacción. Un conjunto guardado en la memoria de una Lambda no protege frente a otros entornos ni frente a su reemplazo.

Con [SQS y Lambda](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html), el handler recibe un lote. Si falla y no configuras respuestas parciales, pueden repetirse mensajes que ya procesaste correctamente. Revisa el timeout de visibilidad, la política de redrive y el procesamiento parcial del lote; no copies la configuración de reintentos asíncronos de Lambda a esta integración.

Para ver un diseño completo, [Procesamiento serverless orientado a eventos, de Alfredo Domínguez](https://www.alfredo-dominguez.dev/arquitecturas/03-event-driven-serverless/), ofrece un ejemplo de arquitectura. La grabación [Lambda y Amazon EventBridge con Diana Alfaro](https://www.youtube.com/watch?v=cmBR1BxFSj0) es otra entrada en español a los eventos; contrasta los pasos de consola de cualquier grabación con la documentación vigente.

## Cómo escala Lambda y qué significa concurrencia

La **concurrencia** cuenta las invocaciones en curso. En el modo predeterminado, cada entorno atiende una invocación a la vez; el servicio añade entornos para atender llamadas simultáneas. Una estimación inicial es:

```text
concurrencia media ≈ solicitudes por segundo × duración media en segundos
100 solicitudes/s × 0,2 s = 20 ejecuciones simultáneas
```

Es una estimación de capacidad, no una garantía sobre picos. La [guía de escalado](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html) explica también los límites de solicitudes por segundo y la velocidad de crecimiento. Una ráfaga, una base de datos lenta o una cuota compartida pueden producir throttling aunque el promedio parezca bajo.

| Configuración | Para qué sirve | Qué debes tener en cuenta |
| --- | --- | --- |
| Concurrencia sin reservar | Comparte la capacidad disponible de la cuenta y región | Otras funciones pueden consumirla. |
| Concurrencia reservada | Aparta capacidad para una función y establece su máximo | No prepara entornos ni elimina cold starts. Configurarla no añade un cargo propio. |
| Concurrencia aprovisionada | Mantiene una cantidad de entornos inicializados | Tiene costo adicional y se configura sobre una versión o alias. |

La [concurrencia reservada](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html) puede ayudar a proteger una base de datos de demasiadas conexiones, siempre que valores también los mensajes pendientes o solicitudes rechazadas. Con [concurrencia aprovisionada](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html), la integración debe invocar la versión o alias configurado; el tráfico excedente puede usar capacidad bajo demanda y tener cold starts.

## Límites que conviene comprobar antes de diseñar

Para el modo predeterminado, la [tabla de cuotas de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html) documenta una duración máxima por invocación de 900 segundos, memoria de 128 a 10.240 MB y `/tmp` de 512 a 10.240 MB. La cuota general publicada de concurrencia es 1.000 por cuenta y región, pero las cuentas nuevas pueden comenzar con valores menores: consulta **Service Quotas** en tu cuenta.

Los límites del servicio que llama a Lambda también importan. Una API HTTP puede agotar su tiempo de integración mucho antes que la función. Para archivos grandes suele ser mejor enviar una referencia de S3 y procesar el objeto que intentar meterlo completo en el evento.

No extrapoles esta tabla a todos los productos de Lambda. [Lambda Managed Instances](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances.html) tiene un modelo de capacidad distinto y admite hasta 90 minutos en determinados tipos de invocación. Las [funciones durables](https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html) permiten flujos con pasos y esperas persistidos; la duración de ese flujo no equivale al tiempo de una invocación individual. Revisa también los límites específicos de una respuesta en streaming antes de aplicarle los de una respuesta buffered.

## Permisos, red y observabilidad

Separa dos preguntas: **¿qué puede hacer el código?** y **¿quién puede invocar la función?** El rol de ejecución responde la primera; las políticas aplicables a los invocadores y al recurso responden la segunda. La [guía de permisos de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-permissions.html) explica esta separación. Un permiso para leer una tabla no concede a API Gateway permiso para llamar a la función.

Conecta Lambda a una VPC cuando necesite alcanzar recursos privados. No es un requisito universal de seguridad. Una función en una subred pública no obtiene automáticamente una IP pública; para salida a internet revisa rutas y el mecanismo de egreso en la [guía de conectividad VPC](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html).

Para diagnosticar problemas, combina logs con métricas: `Errors`, `Throttles`, `Duration` y `ConcurrentExecutions`. En sistemas asíncronos observa además la edad y el descarte de eventos o los indicadores de la fuente. Las [métricas de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html) describen qué cuenta cada señal. Un HTTP 400 que tu handler devuelve como respuesta válida no es automáticamente un error de ejecución de Lambda.

Registra identificadores y resultados sin volcar secretos o cuerpos sensibles. [Búfer de logs con Lambda Powertools](https://www.andmore.dev/es/blog/log-buffering/) muestra una herramienta concreta para gestionar logs; el artículo de Diana Alfaro sobre [ejecuciones concurrentes y CloudWatch](https://blog.alfalfita.cloud/identificando-ejecuciones-concurrentes-de-lambdas-sobre-una-cuenta-con-amazon-cloudwatch) ayuda a explorar la señal de concurrencia.

## Continúa aprendiendo con creadores y comunidades

Si necesitas reforzar la base, tienes [Fundamentos de AWS Lambda: cómo se ejecuta tu código](https://builder.aws.com/content/3FoaikPUMJDyJPdt0qHQ6igjiDm/fundamentos-de-aws-lambda-cmo-se-ejecuta-tu-cdigo-sin-servidores) y el curso [Todo sobre AWS Lambda, de Marcia Villalba](https://join.desplegando.cloud/curso/todo-sobre-lambda/?utm_campaign=link&utm_content=lambda&utm_medium=link&utm_source=marciadev). Revisa acceso y condiciones del curso antes de inscribirte. Para seguir cambios del servicio, [Desplegando.cloud](https://desplegando.substack.com/) publica noticias y recursos en español. [AndMore Dev](https://www.andmore.dev/es/) y [Alfalfita, el blog de Diana Alfaro](https://blog.alfalfita.cloud/), reúnen más ejemplos técnicos.

Lleva una pregunta concreta a [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/): comparte tipo de evento, modo de invocación, error e identificadores sin datos privados. Su encuentro online [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/) está anunciado para el **20 de octubre de 2026, de 19:00 a 21:00 GMT-5**; comprueba en el enlace si mantiene fecha e inscripción. Después de esa fecha, consulta las nuevas actividades del grupo.

También puedes aprender acompañado en [AWS Women Colombia](https://awswomencolombia.com/), [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) o [AWS User Group Ciudad de México](https://awsugcdmx.com/). Sus sitios permiten conocer actividades y formas de participar; una comunidad general de AWS también es útil para conversar sobre IAM, redes y observabilidad alrededor de Lambda.

## Preguntas frecuentes

### ¿Serverless significa que no hay servidores?

Hay infraestructura de cómputo, pero AWS administra su operación. Tu aplicación sigue necesitando código seguro, límites, recuperación ante fallos y observabilidad.

### ¿El estado global se comparte entre todas las invocaciones?

No. Puede persistir dentro de un entorno reutilizado, pero no se comparte de manera confiable con otros. Conserva el estado importante en un almacenamiento externo.

### ¿Debo usar concurrencia aprovisionada desde el principio?

Primero mide la latencia que percibe tu usuario y comprueba si la inicialización explica el problema. La capacidad preparada tiene costo y no acelera una consulta lenta a una dependencia. La siguiente guía de la serie te permite practicar el contrato HTTP; la de costo y rendimiento te ayuda a evaluar los ajustes.
