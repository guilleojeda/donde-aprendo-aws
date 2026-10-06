---
title: "Serverless en AWS: qué es, cómo funciona y cómo empezar"
description: "Qué significa serverless en AWS, cómo encajan Lambda, API Gateway y los servicios de datos, cuándo conviene y qué revisar en costos, límites y seguridad."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T02:49:31.55Z"
modifiedTimestamp: "2026-10-06T17:34:19-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS Lambda y API Gateway: crea una HTTP API paso a paso"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/"
  - title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
  - title: "AWS SAM: qué es y cómo desplegar una API sencilla"
    url: "https://dondeaprendoaws.com/blog/aws-sam-guia-basica-para-aplicaciones-serverless/"
  - title: "AWS Lambda: cómo medir costo y rendimiento"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/"
---

**Serverless en AWS** es una forma de construir aplicaciones con servicios administrados que ejecutan código, procesan eventos o guardan datos sin que tengas que aprovisionar y mantener los servidores. Los servidores siguen existiendo: AWS opera esa infraestructura; tú sigues a cargo del código, los permisos, los datos, la configuración y el costo de los servicios que eliges.

Un ejemplo habitual conecta **Amazon API Gateway** con **AWS Lambda** para atender una petición web y con **Amazon DynamoDB** para guardar los datos. También puedes iniciar una función cuando llega un archivo a Amazon S3 o cuando un mensaje aparece en una cola de Amazon SQS. La idea clave es aprender a conectar estas piezas y decidir qué trabajo corresponde a cada una.

## Cómo funciona una aplicación serverless

Imagina una tienda que recibe una solicitud para crear un pedido. El navegador envía `POST /pedidos` a API Gateway; el gateway invoca Lambda; la función valida la solicitud y guarda el pedido en DynamoDB. Lambda devuelve una respuesta a API Gateway, que responde al navegador. Este es un ejemplo conceptual: el artículo no despliega recursos ni usa una cuenta de AWS.

API Gateway ofrece la ruta HTTP y envía la solicitud a Lambda. AWS documenta el mismo patrón en su [tutorial para crear una HTTP API con Lambda](https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started.html).

Si la confirmación del pedido requiere trabajo que puede terminar más tarde, la función puede enviar un mensaje a SQS para que otro proceso lo atienda. Una cola ayuda a separar al productor del consumidor y a absorber trabajo pendiente. **Amazon EventBridge** cumple otro papel: enruta eventos a destinos según reglas. **AWS Step Functions** coordina pasos cuando un flujo necesita decisiones, reintentos o seguimiento de su estado. No hace falta añadir todos estos servicios a una primera aplicación.

Estos servicios cubren partes diferentes de la aplicación; puedes empezar con unos pocos:

- **API Gateway** ofrece rutas HTTP para que una aplicación web o móvil llame a tu backend.
- **AWS Lambda** ejecuta lógica de negocio en respuesta a una solicitud o un evento.
- **Amazon DynamoDB** o **Amazon S3** guardan registros o archivos que deben persistir después de una ejecución.
- [**Amazon SQS**](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html) guarda trabajo pendiente y desacopla al productor del consumidor; úsala cuando necesites que ambos avancen a ritmos distintos.
- [**Amazon EventBridge**](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-bus.html) enruta eventos a destinos según reglas; considéralo cuando varios componentes deban reaccionar a hechos de una aplicación o de AWS.
- [**AWS Step Functions**](https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html) coordina tareas, decisiones y manejo de errores cuando el flujo tiene varios pasos que deben avanzar en un orden explícito.
- [**AWS Fargate**](https://aws.amazon.com/fargate/) ejecuta contenedores con Amazon ECS o Amazon EKS sin que tengas que administrar la infraestructura de cómputo subyacente; compáralo con Lambda si tu proceso no encaja en una función.

Lambda suele ser un buen punto de entrada para entender el modelo, pero **serverless es más que Lambda**: incluye servicios administrados de cómputo, almacenamiento, API e integración. Puedes ver más ejemplos en la [guía de servicios serverless de AWS](https://aws.amazon.com/serverless/) y en el [diseño de aplicaciones con Lambda](https://docs.aws.amazon.com/lambda/latest/dg/concepts-application-design.html).

Si prefieres una introducción en video a cómo encajan las funciones, servicios y eventos, el [canal de AWS User Group Chile](https://www.youtube.com/channel/UCYUBBIe0XzNsxcq9Tu_Wqsw) publica grabaciones de charlas; su sesión [*Serverless 101*](https://www.youtube.com/watch?v=lzzSp4LLRY0) es una explicación comunitaria para continuar desde este panorama. Es una grabación, así que consulta la documentación de AWS para confirmar límites y precios actuales.

## Qué significa “sin servidor” en AWS

“Sin servidor” describe cuánto de la infraestructura operas tú. No significa que no haya servidores ni que AWS tome todas las decisiones por ti. El proveedor administra la infraestructura de los servicios serverless y tareas como aprovisionar capacidad o aplicar parches al sistema subyacente. Tú diseñas la aplicación, decides qué servicios usar, configuras los permisos y respondes por cómo se manejan los datos.

El modelo también cambia según el servicio. Con Lambda no eliges ni mantienes una máquina virtual para cada función. Con Fargate entregas una imagen de contenedor y eliges los recursos de una tarea, mientras AWS administra la infraestructura de cómputo que la ejecuta. En ambos casos siguen existiendo cuotas, configuración y responsabilidades de aplicación.

## Qué debes saber sobre AWS Lambda

### Las funciones se activan por eventos

Una función Lambda tiene un punto de entrada —su *handler*— que recibe un evento y procesa sus datos. El evento puede llegar desde API Gateway, Amazon S3, SQS, EventBridge u otro origen compatible. El [modelo de ejecución de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/concepts-how-lambda-runs-code.html) explica cómo el servicio prepara el entorno y llama al handler.

Para ver ese ciclo explicado en español, el video [Fundamentos de AWS Lambda: cómo se ejecuta tu código sin servidores](https://www.youtube.com/watch?v=fR5-TDI3g-I), de AWS en Español con Hazel Sáenz, repasa eventos, handler, inicialización y costos. La versión escrita en [AWS Builder Center](https://builder.aws.com/content/3FoaikPUMJDyJPdt0qHQ6igjiDm/fundamentos-de-aws-lambda-cmo-se-ejecuta-tu-cdigo-sin-servidores) explica qué pasa entre el evento y la ejecución de la función.

### Guarda el estado permanente fuera de la función

Diseña cada invocación para poder funcionar sin depender de datos que haya dejado otra ejecución. Persiste los datos que deban durar en un servicio de almacenamiento, como DynamoDB o S3. Lambda puede reutilizar un entorno de ejecución y sus recursos inicializados para otra invocación, pero no debes contar con que ese entorno se mantenga. Tampoco uses su memoria o archivos temporales para conservar datos de una persona entre llamadas. AWS describe este enfoque en su guía para [diseñar aplicaciones con Lambda](https://docs.aws.amazon.com/lambda/latest/dg/concepts-application-design.html).

### Prevé reintentos y eventos repetidos

En flujos asíncronos, un evento puede volver a entregarse después de un error. Diseña la operación para que procesar el mismo evento otra vez no duplique el efecto; por ejemplo, identifica el pedido ya procesado antes de cobrarlo de nuevo. Este enfoque se llama **idempotencia**. Los reintentos y su comportamiento dependen de cómo se invoca la función, así que revisa la configuración del origen. La documentación de [buenas prácticas para Lambda](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html) recomienda contemplar duplicados.

### Considera la latencia inicial y los límites

Cuando Lambda prepara un entorno nuevo, la inicialización puede aumentar la latencia de esa invocación; suele llamarse *cold start*. Un entorno reutilizado puede evitar parte de esa inicialización en una llamada posterior, pero no está garantizado ni ocurre necesariamente solo en “la primera llamada” de la vida de la función. Mide el efecto en la aplicación antes de pagar por capacidad previamente inicializada.

Las funciones Lambda estándar pueden ejecutarse hasta **15 minutos por invocación**. Esa cifra no describe todas las opciones de cómputo de AWS: por ejemplo, Fargate ejecuta tareas en contenedores con otro modelo. Además, las cuotas de concurrencia y otros límites pueden variar según cuenta, región, servicio y configuración. Comprueba los valores aplicables en las [cuotas vigentes de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html) y en los servicios que formen parte de tu flujo.

## Cuándo conviene y qué límites tiene

Serverless suele encajar cuando una aplicación responde a solicitudes o eventos, necesita cambiar de capacidad con la demanda o se puede dividir en trabajos acotados. Algunos ejemplos son una API, el procesamiento de archivos al cargarlos en S3, una tarea programada o la reacción a mensajes de una cola.

No es automáticamente la opción más barata ni la más simple para todo sistema. Una carga sostenida puede tener otra economía que una carga intermitente; una función con muchas dependencias o llamadas remotas puede tardar más y costar más de lo esperado; y los límites de cada servicio influyen en el diseño. Si el requisito es ejecutar un contenedor o un proceso prolongado, compara Lambda con opciones como Fargate. Decide a partir del patrón de uso, la latencia, los límites y el costo total, no solo del precio de una función aislada.

## Costos: calcula la aplicación completa

El costo de una arquitectura serverless se distribuye entre sus servicios. Para Lambda estándar, el cálculo incluye solicitudes y duración, y la duración depende, entre otros factores, de la memoria configurada. API Gateway, el almacenamiento, las colas, los flujos, los logs, la transferencia de datos y las opciones de capacidad tienen sus propios precios y unidades de cobro. Revisa las [tarifas actuales de Lambda](https://aws.amazon.com/lambda/pricing/) y [API Gateway](https://aws.amazon.com/api-gateway/pricing/) para la región y las opciones que usarás.

Antes de probar un despliegue, estima los componentes que crearás y configura una notificación de costo con [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html). Una alerta permite enterarte de que te acercas a un umbral; no equivale a un tope automático de gasto y puede llegar después de que se generen cargos. Al terminar un ejercicio en AWS, elimina los recursos y revisa que también se hayan limpiado los logs u otros elementos creados por separado.

Para mantenerte al día con AWS y serverless en español, [Desplegando.cloud](https://desplegando.substack.com/) publica un newsletter y podcast con novedades y conversaciones técnicas; consulta cada edición para ver qué tema trata.

## Seguridad y operación

La función Lambda usa un **rol de ejecución de IAM** para acceder a otros recursos, como una tabla de DynamoDB o CloudWatch Logs. Concédele solo las acciones y recursos que necesita. Ese rol responde a lo que la función puede hacer; los permisos basados en recursos de Lambda pueden autorizar qué servicio está habilitado para invocar la función. Son controles distintos. Consulta cómo [administrar permisos en Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-permissions.html) antes de abrir una integración.

Para operar la aplicación, revisa errores, duración, límites y reintentos. Lambda envía registros a CloudWatch Logs si su rol tiene los permisos necesarios; esos logs tienen los cargos estándar de CloudWatch. Protege las rutas públicas con el método de autenticación apropiado y guarda secretos fuera del código. Consulta las guías de AWS para [proteger endpoints públicos](https://docs.aws.amazon.com/lambda/latest/dg/security-public-endpoints.html) y seguir las [buenas prácticas de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html).

## Cómo empezar con serverless paso a paso

No necesitas aprender cada servicio de AWS antes de comenzar. Una ruta acotada te permite entender el ciclo completo:

1. Aprende lo básico de eventos, funciones, HTTP, JSON y roles de IAM.
2. Crea una función pequeña que reciba una entrada y devuelva una respuesta, sin guardar datos todavía.
3. Conéctala a una ruta HTTP con API Gateway y verifica el formato de respuesta que espera la integración.
4. Describe los recursos como infraestructura en código. **AWS SAM** ofrece una sintaxis basada en CloudFormation y una CLI para definir, compilar, probar localmente y desplegar una aplicación serverless; SAM es una herramienta y un modelo de infraestructura, no el nombre de una función ni un servicio de cómputo.
5. Agrega almacenamiento o trabajo asíncrono solo cuando el caso lo necesite; al hacerlo, configura permisos, reintentos y protección contra eventos duplicados.
6. Revisa logs, límites y costo estimado. Si desplegaste recursos, sigue los pasos de limpieza del tutorial y confirma que ya no se necesiten.

Si te resulta más fácil seguir clases guiadas, en el [catálogo de cursos de Marcia Villalba](https://www.marcia.dev/courses/) figura *Todo sobre AWS Lambda*. Revisa en la ficha vigente el idioma, nivel, temario, precio y acceso antes de inscribirte.

La [guía oficial de inicio con AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-getting-started-hello-world.html) incluye creación, pruebas locales, despliegue y eliminación de la aplicación de ejemplo. Las pruebas locales ayudan a iterar sobre código y eventos, pero no sustituyen la verificación en AWS de permisos, integraciones y red. El tutorial de AWS crea recursos en una cuenta; consulta precios y limpieza antes de desplegar.

Para practicar con ejemplos paso a paso, puedes continuar con [una HTTP API de Lambda y API Gateway](https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/), o con [AWS SAM para desplegar una API sencilla](https://dondeaprendoaws.com/blog/aws-sam-guia-basica-para-aplicaciones-serverless/). Si quieres profundizar en eventos, revisa [cómo elegir entre EventBridge, SNS y SQS](https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/). Para revisar costo y rendimiento en Lambda, consulta [qué medir antes de cambiar su configuración](https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/).

## Errores frecuentes al empezar

Si la API devuelve **403**, comprueba la ruta, el método de autenticación y quién puede invocar la función. Si Lambda muestra un error de acceso a DynamoDB, revisa las acciones y el recurso incluidos en su rol de ejecución. Si la llamada devuelve **5xx** o vence el tiempo de espera, sigue la invocación en los logs de Lambda y verifica el formato de respuesta, la integración y los tiempos de espera de cada servicio. El diagnóstico depende del origen y del tipo de invocación; AWS mantiene una guía para [resolver problemas de invocación de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/troubleshooting-invocation.html).

Si funciona desde una herramienta de API pero falla desde el navegador, revisa la configuración de **CORS** de la API y la respuesta de la integración. Si un proceso aparece duplicado, revisa los reintentos del origen y haz idempotente la operación antes de desactivarlos sin entender su función.

## Comunidades y eventos para continuar

Explora el [directorio de comunidades AWS en Latinoamérica](/comunidades/) para localizar grupos por país y revisar sus formatos, temas y enlaces. Como ejemplos, el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) es una comunidad general de computación en la nube, y el [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) se centra en serverless. Confirma en cada página si hay próximos encuentros, su modalidad, cupos y condiciones de inscripción.

Para encontrar próximos encuentros en línea, presenciales o híbridos, consulta la [agenda de eventos AWS](/eventos/). Las fechas y condiciones cambian; comprueba la ficha antes de planificar.
