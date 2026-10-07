---
title: "AWS Lambda: qué es, cómo funciona y cuándo usarlo"
description: "Entiende AWS Lambda con un ejemplo en Python: eventos, permisos IAM, reintentos, cold starts, límites y costos. Encuentra recursos y comunidades en español."
author: "guille-ojeda"
publishedAt: "2025-03-31"
publishedTimestamp: "2025-03-31T03:16:05.470000+00:00"
modifiedTimestamp: "2026-10-06T23:36:27-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Serverless en AWS: qué es, cómo funciona y cómo empezar"
    url: "https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/"
  - title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
  - title: "AWS Free Tier: planes, créditos, límites y cargos"
    url: "https://dondeaprendoaws.com/blog/aws-free-tier-guia-para-principiantes-2024/"
  - title: "Endpoints de VPC en AWS: gateway, interfaz y PrivateLink"
    url: "https://dondeaprendoaws.com/blog/que-son-los-endpoints-de-vpc-en-aws/"
---

**AWS Lambda es un servicio de cómputo que ejecuta tu código cuando recibe una solicitud o un evento, sin que tengas que administrar los servidores que lo ejecutan.** Puedes usarlo para responder una petición de una API, procesar un archivo recién subido a S3 o atender mensajes de una cola. AWS administra la infraestructura; tú eliges el código, los permisos, la configuración y cómo manejar sus errores.

Lambda encaja especialmente bien en trabajos acotados que responden a eventos y cuya demanda varía. No garantiza que cualquier aplicación sea más barata ni elimina los límites de capacidad. Esta guía empieza por **funciones estándar con capacidad bajo demanda (*on-demand*)**, el modelo habitual para aprender Lambda. Otras modalidades, como Lambda Managed Instances, tienen condiciones diferentes.

## Cómo funciona Lambda: del evento al resultado

Una función tiene un **handler**, el punto de entrada de tu programa. Lambda prepara un entorno con el runtime del lenguaje y tus dependencias, y llama al handler con los datos del evento. Cuando termina, puede reutilizar ese entorno para otra invocación. Consulta el [modelo de funcionamiento de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/concepts-basics.html) para distinguir función, runtime, evento y disparador.

Por ejemplo, una tienda recibe `GET /pedidos/123`. API Gateway recibe la petición HTTP e invoca una función; el handler busca el pedido en una base de datos y devuelve una respuesta al gateway. El evento que recibe la función contiene los datos de la petición en el formato definido por la integración. No es el mismo objeto que enviaría S3 o SQS: **el origen determina el formato y el modo de invocación**.

Lambda es una pieza de una aplicación [serverless en AWS](/blog/introduccion-a-serverless-en-aws/). El almacenamiento permanente, la API y las colas cumplen otros trabajos. Guarda los datos que deban sobrevivir a una ejecución en servicios como S3 o DynamoDB; la memoria de un entorno y sus archivos temporales no sustituyen una base de datos.

Para una introducción en video, Marcia Villalba explica el servicio en [Qué es AWS Lambda: introducción en español a serverless](https://www.youtube.com/watch?v=1wNb_RMvI9E). Es una grabación para entender el modelo; los límites y precios actuales se comprueban en la documentación de AWS.

## Qué puede activar una función

La forma de invocar importa porque determina quién espera el resultado y qué pasa cuando falla el código:

| Origen y modo | Cómo llega el trabajo | Qué ocurre con el resultado |
| --- | --- | --- |
| API Gateway o una llamada directa síncrona | El invocador envía la solicitud y espera. | Recibe la respuesta o el error. Lambda no reintenta automáticamente los errores del código en una llamada directa; API Gateway devuelve el error al cliente. |
| Notificaciones de S3 o SNS, asíncronas | Lambda acepta el evento en una cola interna y lo procesa después. | La aceptación no confirma que el código haya terminado. Para funciones estándar hay reintentos y puedes configurar un destino de fallos o una DLQ. |
| SQS, Kinesis o DynamoDB Streams | Un mapeo de origen de eventos lee registros y los envía a la función, normalmente en lotes. | El procesamiento y los reintentos dependen del origen y de la configuración del mapeo. |

AWS explica las diferencias en su guía de [comportamiento de reintentos](https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html). No apliques las reglas de S3 a una cola SQS solo porque ambas terminan ejecutando Lambda.

También puedes programar una invocación con EventBridge Scheduler o enrutar eventos de una aplicación con EventBridge. Si estás eligiendo entre un bus, una cola y notificaciones, continúa con [arquitecturas dirigidas por eventos: EventBridge, SNS y SQS](/blog/arquitecturas-dirigidas-por-eventos-en-aws/).

## Un ejemplo pequeño en Python, sin desplegar AWS

Este handler recibe un **evento propio con un objeto JSON** y devuelve un saludo. No utiliza servicios de AWS ni requiere credenciales. Copia el código en un archivo llamado `lambda_function.py`:

```python
def lambda_handler(event, context):
    nombre = event.get("nombre")
    if not isinstance(nombre, str) or not nombre.strip():
        raise ValueError("nombre debe ser un texto no vacío")
    return {"mensaje": f"Hola, {nombre.strip()}"}
```

Para comprobarlo localmente, agrega debajo y ejecuta `python lambda_function.py`:

```python
if __name__ == "__main__":
    print(lambda_handler({"nombre": "Ana"}, None))
```

La salida es `{'mensaje': 'Hola, Ana'}`. Si llamas al handler con `{}` o `{"nombre": "   "}`, lanza `ValueError`. Así puedes comprobar tanto una entrada válida como el error de validación.

En Lambda, el nombre de handler sería `lambda_function.lambda_handler`: archivo y función. El runtime entrega `event` y `context`; aquí usamos `None` porque el ejemplo local no necesita información de la invocación. La [guía de handlers Python de AWS](https://docs.aws.amazon.com/lambda/latest/dg/python-handler.html) detalla ese contrato.

**Esta prueba verifica la lógica Python.** Una integración con API Gateway requiere adaptar el evento y la respuesta a su contrato; probar localmente tampoco verifica IAM, red ni entrega de eventos en AWS.

## Qué permisos necesita Lambda

Hay dos preguntas separadas:

- **¿Qué puede hacer el código?** El [rol de ejecución](https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html) permite que la función lea un objeto S3, consulte una tabla o escriba logs. Su política de confianza permite que `lambda.amazonaws.com` asuma el rol. Concede las acciones y recursos que necesita; una función que lee un prefijo de un bucket no necesita acceso completo a todo S3.
- **¿Quién puede ejecutarlo?** Los permisos de invocación autorizan al usuario o servicio que llama a Lambda. Una [política basada en recursos de la función](https://docs.aws.amazon.com/lambda/latest/dg/access-control-resource-based.html) puede permitir que S3 la invoque, restringiendo el bucket y la cuenta de origen. Para una llamada directa de una identidad IAM, revisa también sus permisos de `lambda:InvokeFunction`.

Que el rol tenga acceso a S3 no autoriza a S3 a invocar la función. Y poder invocar la función no concede al código permiso para leer el bucket.

### ¿Necesito conectar Lambda a una VPC?

Conéctala a tu VPC cuando deba alcanzar recursos privados, como una base de datos. Esa configuración controla **la conexión del código a la red**; no convierte por sí sola el punto de invocación en privado. Además, colocar la función en una subred pública no le da automáticamente acceso a Internet. Revisa rutas, grupos de seguridad y la salida necesaria en la [guía de acceso de Lambda a una VPC](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html).

Si necesitas llamar a servicios de AWS desde esa red sin pasar por una salida a Internet, revisa [qué son los endpoints de VPC](/blog/que-son-los-endpoints-de-vpc-en-aws/). La conectividad y la autorización IAM son controles distintos: necesitas que ambos permitan la operación.

## Errores, reintentos e idempotencia

Para una **invocación asíncrona estándar**, Lambda reintenta por defecto dos veces después de un error del código o del runtime, como un timeout. Los errores de capacidad o del servicio tienen otra política. Incluso una ejecución exitosa puede recibir de nuevo el mismo evento. Configura la edad máxima del evento, los reintentos y un destino de fallos o DLQ según el impacto del trabajo, como explica AWS en [errores de invocación asíncrona](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html).

Con SQS, configura el tiempo de visibilidad y la política de redrive en la cola. Si un lote contiene diez registros y solo uno falla, una respuesta parcial puede indicar ese registro para no repetir los nueve exitosos. Debes habilitar la opción correspondiente e implementar la respuesta en el handler; consulta [manejo de errores de SQS con Lambda](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html).

La **idempotencia** significa que repetir una operación no vuelve a producir su efecto. Por ejemplo, dos entregas del evento `pedido-123` no deberían generar dos cobros. Usa un identificador estable de negocio y una operación persistente que controle duplicados; para cobrar mediante una API externa, usa su mecanismo de idempotencia cuando esté disponible. Guardar identificadores en una variable global del handler no protege frente a otros entornos o reinicios. AWS desarrolla este principio en [diseño de aplicaciones Lambda](https://docs.aws.amazon.com/lambda/latest/dg/concepts-application-design.html).

## Cold starts y concurrencia: cómo medir el rendimiento

Un **cold start** ocurre cuando una invocación necesita inicializar un entorno de ejecución. Puede aparecer al comenzar, al aumentar la demanda o al reemplazar entornos; no es solamente “la primera llamada” de la función. El runtime, las dependencias y el trabajo de inicialización influyen en esa latencia. Lambda puede reutilizar clientes de SDK creados fuera del handler, pero no garantiza conservar el entorno. La [guía del ciclo de vida del entorno](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html) explica las fases de inicialización y ejecución.

La **concurrencia** cuenta ejecuciones simultáneas; no equivale a solicitudes por segundo. La [concurrencia reservada](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html) asigna una parte de la capacidad disponible a la función y limita cuánto puede consumir, sin precalentarla. La [concurrencia aprovisionada](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html) mantiene entornos inicializados y tiene costo adicional; si la demanda la supera, puede haber invocaciones bajo demanda. Elige a partir de la latencia medida y del tráfico esperado.

Empieza por `Errors`, `Throttles`, `Duration` y `ConcurrentExecutions` en CloudWatch. `Duration` mide el procesamiento del evento y **no incluye el tiempo del cold start**; para entender la espera del usuario observa también inicialización y latencia de la aplicación completa. No confundas un rechazo por falta de concurrencia con un error que ocurrió dentro del handler. Consulta las [métricas de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html).

Dos lecturas comunitarias ayudan a pasar de la explicación a la práctica:

- [Diagnóstico de AWS Lambda](https://dev.to/aws-espanol/eleva-el-rendimiento-de-aws-lambda-7il), de Hazel Sáenz, recorre métricas, una referencia inicial de rendimiento y comparación de resultados antes de optimizar.
- [Tunea tus funciones Lambda](https://dev.to/cecamilo/tunea-tus-funciones-lambda-31a4), de Camilo Cabrales, muestra cómo usar AWS Lambda Power Tuning para comparar configuraciones de memoria. Su práctica despliega recursos y ejecuta funciones en una cuenta: revisa permisos, precios y limpieza antes de seguirla.

## Límites que debes revisar antes de elegir Lambda

Estos valores describen las funciones estándar bajo demanda; consulta siempre las [cuotas actuales y las asignadas a tu cuenta](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html):

| Configuración | Valor y condición |
| --- | --- |
| Timeout | Hasta 900 segundos: 15 minutos por invocación. |
| Memoria | De 128 a 10.240 MB; la CPU aumenta en proporción a la memoria configurada. |
| Almacenamiento temporal `/tmp` | De 512 a 10.240 MB, configurable; no es almacenamiento permanente. |
| Paquete ZIP | 50 MB comprimidos al subir directamente por consola, API o SDK; 250 MB descomprimidos, incluidas las capas. Para ZIP mayores, la carga usa S3. |
| Imagen de contenedor | Hasta 10 GB descomprimidos, incluidas sus capas. |
| Concurrencia de cuenta por región | Valor predeterminado de 1.000, ajustable; las cuentas nuevas pueden tener cuotas menores. No es capacidad garantizada para cada función. |

El límite de 15 minutos **no describe todos los modos de Lambda**. Lambda Managed Instances admite hasta 90 minutos para invocaciones asíncronas y mapeos de origen de eventos, excepto Amazon MQ y Amazon DocumentDB, según el [anuncio de AWS de septiembre de 2026](https://aws.amazon.com/es/about-aws/whats-new/2026/09/aws-lambda-90-minute-function/). Ese modo tiene otro modelo de capacidad y facturación; no basta con subir el timeout de una función bajo demanda a 90 minutos.

Si necesitas empaquetar dependencias de Node.js, [Elimina el uso de capas en Lambda utilizando ESBuild](https://www.andmore.dev/es/blog/layerless-esbuild-lambda/), de Andrés Moreno, muestra una alternativa de empaquetado. No necesitas agregar una capa solo porque varias funciones compartan código.

## Cuánto cuesta y qué significa el Free Tier

En el modelo estándar bajo demanda, el cobro principal combina **solicitudes y duración facturada según la memoria configurada**, medida en GB-segundos. Un millón de ejecuciones con 1 GB y 0,2 segundos facturados por ejecución consume `1.000.000 × 1 × 0,2 = 200.000 GB-segundos`. Es una cuenta de consumo, no el precio total de la aplicación. La duración facturada incluye la inicialización: AWS [unificó el cobro de la fase INIT desde agosto de 2025](https://aws.amazon.com/blogs/compute/aws-lambda-standardizes-billing-for-init-phase/). Por eso, la métrica `Duration` y el valor `Billed Duration` de los logs pueden diferir.

La [página de precios de Lambda](https://aws.amazon.com/lambda/pricing/) publica una oferta mensual de **un millón de solicitudes y 400.000 GB-segundos**. Revisa condiciones: un evento asíncrono de más de 256 KB cuenta como varias solicitudes, y la concurrencia aprovisionada no recibe esa oferta. También pueden generar cargos el almacenamiento temporal adicional, logs, API Gateway, S3, bases de datos, transferencia y componentes de red. El costo varía por región, arquitectura y modalidad.

**El límite mensual de Lambda y los créditos de una cuenta son beneficios distintos.** Comprueba tu plan y ofertas en Billing. El plan Free actual para clientes nuevos termina a los seis meses o al agotar sus créditos; en Paid puede haber cargos por consumo no cubierto. Consulta la [comparación oficial de planes](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html) y nuestra [guía de AWS Free Tier](/blog/aws-free-tier-guia-para-principiantes-2024/).

## Cuándo conviene una función y cuándo comparar alternativas

Lambda suele encajar para validar y transformar entradas de una API, generar miniaturas, reaccionar a cambios de datos o ejecutar una tarea programada. Define un trabajo concreto, persiste los resultados fuera del entorno y comprueba que termina dentro de los límites aplicables.

Compara otras opciones si necesitas un proceso continuamente activo, control del sistema operativo, una GPU o un trabajo que excede los recursos o duración disponibles. Una carga sostenida también merece comparar su costo completo. La [guía de decisión entre Fargate y Lambda](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/fargate-or-lambda.html) ayuda a contrastar tareas en contenedores con funciones por eventos.

A veces puedes eliminar la función: si solo transmite una operación de un servicio a otro, comprueba si existe una integración directa. En [Cómo desarrollar una API serverless sin un solo Lambda](https://www.andmore.dev/es/blog/build-serverless-api-with-no-lambda/), Andrés Moreno muestra una API con API Gateway y DynamoDB mediante OpenAPI y SAM. Es un ejemplo de integración directa, no una regla para quitar la lógica de negocio que tu aplicación sí necesita.

## Aprende Lambda en español y conversa con la comunidad

Si prefieres un recorrido de clases, [Todo sobre AWS Lambda](https://join.desplegando.cloud/curso/todo-sobre-lambda/?utm_campaign=link&utm_content=lambda&utm_medium=link&utm_source=marciadev), de Marcia Villalba, presenta un temario de ciclo de vida, monitoreo, errores, escalado y costos, con fundamentos de AWS como prerrequisito. Su [catálogo de cursos](https://www.marcia.dev/courses/) lo lista como pago y la ficha muestra una lista de espera: comprueba precio y disponibilidad antes de inscribirte.

Para seguir novedades, [Desplegando.cloud](https://desplegando.substack.com/) reúne newsletter y podcast en español sobre AWS y serverless. Para clases grabadas de comunidad, el [canal AWS UG Buenos Aires](https://www.youtube.com/@awsugbsas) permite consultar encuentros anteriores; busca las sesiones serverless que correspondan a tu pregunta.

No necesitas pertenecer a un grupo especializado en Lambda para aprender acompañado. Puedes llevar una duda concreta —un error de permisos, un evento repetido o una ejecución lenta— a estas comunidades y consultar sus actividades:

- [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/): encuentros enfocados en serverless y un espacio para conectar con personas que trabajan con estos servicios.
- [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/): grupo general de AWS que publica encuentros y enlaces a sus grabaciones.
- [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/): comunidad general para compartir experiencias y conocimientos de AWS en Argentina.
- [AWS User Group Perú](https://awsugperu.cloud/): portal para encontrar grupos locales, talleres, actividades y recursos de aprendizaje.

A la fecha de esta revisión hay dos encuentros virtuales anunciados que continúan las preguntas de esta guía:

- [EC2 vs Lambda](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/), del AWS User Group Tlaxcala FireflyCloud, el **16 de octubre de 2026 a las 16:00, UTC−6**: comparación de ventajas, costos y escenarios de uso. La ficha muestra el enlace de acceso para asistentes; revisa la inscripción y sus condiciones.
- [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/), el **20 de octubre de 2026 a las 19:00, hora de Colombia, UTC−5**: sesión de Serverless Colombia sobre procesamiento y tolerancia a fallos. Se anuncia con acceso libre y enlace visible para asistentes registrados.

Confirma horarios, cupos y cambios en cada ficha. Si ya pasaron esas fechas o buscas otra ubicación, consulta la [agenda de eventos](/eventos/) y el [directorio de comunidades AWS](/comunidades/). Para ampliar las lecturas, el [catálogo de recursos](/aprender/) permite buscar Lambda y serverless entre artículos, videos y cursos.
