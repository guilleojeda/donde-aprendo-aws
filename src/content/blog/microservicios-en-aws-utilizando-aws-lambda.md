---
title: "Microservicios en AWS Lambda: cuándo conviene y cómo diseñarlos"
description: "Diseña microservicios con AWS Lambda a partir de dominios y datos propios. Compara APIs y eventos, y planifica reintentos, idempotencia y operación."
author: "guille-ojeda"
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T00:50:24.052Z"
modifiedTimestamp: "2026-10-06T23:54:03-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
  - title: "Mejores prácticas para AWS Lambda: reintentos, concurrencia y seguridad"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-aws-lambda/"

---

AWS Lambda puede ejecutar partes de una arquitectura de microservicios, pero una función no se convierte en microservicio por usar Lambda. Primero define límites de negocio y propiedad de datos; después elige si cada trabajo encaja en el modelo de invocación de Lambda, en un proceso de contenedor o en otra forma de cómputo.

Para entender el ciclo de una función, consulta [Fundamentos de AWS Lambda: cómo se ejecuta tu código sin servidores](https://builder.aws.com/content/3FoaikPUMJDyJPdt0qHQ6igjiDm/fundamentos-de-aws-lambda-cmo-se-ejecuta-tu-cdigo-sin-servidores), artículo de Hazel Sáenz en AWS Builder Center.

Este ejemplo usa una tienda: el servicio de pedidos recibe solicitudes, el de inventario reserva unidades y el de notificaciones avisa al cliente. La misma arquitectura sirve para comparar [microservicios en AWS con contenedores](/blog/microservicios-en-aws-utilizando-contenedores/).

## Qué hace que una parte sea un microservicio

Un microservicio agrupa una capacidad de negocio que un equipo puede cambiar y operar con límites claros. Un servicio de pedidos puede tener varias funciones Lambda —por ejemplo, una para crear pedidos y otra para responder consultas— y seguir siendo una sola capacidad. Dividir cada endpoint, tabla o función en un microservicio separado añade llamadas, despliegues y fallas distribuidas sin garantizar autonomía.

Busca límites alrededor de capacidades como pedidos, inventario y pagos. Cada servicio valida sus reglas y escribe su propio estado. El resto de la aplicación lo consulta por una API o recibe hechos de negocio por eventos; no lee directamente las tablas de otro servicio. AWS explica este enfoque en sus guías para [descomponer por capacidad de negocio](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-decomposing-monoliths/decompose-business-capability.html) y el patrón de [una base de datos por servicio](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-data-persistence/database-per-service.html).

Si el dominio todavía cambia mucho, una aplicación modular puede ser más sencilla de mantener. Separa un servicio cuando un límite de negocio, un ritmo de cambio, un equipo o una necesidad de escalado justifican el costo de operar una frontera distribuida. Hazel Sáenz desarrolla esta decisión en [Escala inteligente con microservicios serverless](https://dev.to/aws/escala-inteligente-con-microservicios-serverless-3lbe), con una explicación de cuándo separar servicios y cómo relacionar eventos, datos y observabilidad.

## Ejemplo: pedidos por API y trabajo por eventos

Un flujo pequeño puede ser así:

1. El cliente envía `POST /orders` a una API. [Amazon API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html) puede publicar el endpoint y enrutar la solicitud a la función Lambda del servicio de pedidos.
2. La función valida las reglas, crea el pedido y registra un evento de salida en la misma transacción de datos. Un publicador envía después ese evento a un bus de Amazon EventBridge. El registro de salida —un *outbox*— evita confirmar un pedido y perder su notificación si falla la publicación; AWS explica el [patrón transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) y el problema de la escritura dual.
3. Una regla de EventBridge dirige `OrderPlaced` a una cola de Amazon SQS para inventario y, si hace falta, a otra cola para notificaciones. Cada consumidor avanza y se recupera por separado.
4. Una función Lambda consumidora reserva inventario y guarda el resultado en los datos que pertenecen al servicio de inventario.

El cliente necesita una respuesta inmediata para saber si su pedido se aceptó, así que la creación usa una llamada HTTP síncrona. Reservar inventario y enviar una notificación pueden continuar después; una cola desacopla esos trabajos del tiempo de respuesta del cliente. EventBridge enruta hechos, SQS conserva trabajo pendiente y amortigua picos. Para una comparación más detallada, consulta la [guía de decisión de AWS para SQS, SNS y EventBridge](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/sns-or-sqs-or-eventbridge.html) y el artículo de Marcia Villalba [SQS, SNS, EventBridge o Kinesis: ¿cuál usás?](https://desplegando.substack.com/p/sqs-sns-eventbridge-o-kinesis-cual), publicado en septiembre de 2026.

El contenido de `detail` de un evento propio podría verse así:

```json
{
  "eventId": "evt-01J9Q2K7M4",
  "schemaVersion": 1,
  "orderId": "ord-8042",
  "occurredAt": "2026-10-06T12:00:00Z",
  "items": [
    { "sku": "cafe-250g", "quantity": 2 }
  ]
}
```

Si se envía a EventBridge, el servicio añade metadatos como `source`, `detail-type`, `id`, cuenta y región. Mantén `eventId` estable cuando se vuelva a publicar el mismo hecho; versiona el esquema y no incluyas datos personales que los consumidores no necesitan.

## Diseña cada llamada para que pueda repetirse

Una entrega puede repetirse. Las funciones invocadas por una API, de forma asíncrona o mediante un mapeo de origen de eventos siguen reglas de error diferentes. Los mapeos que leen colas o streams procesan al menos una vez y pueden entregar registros duplicados; la estrategia depende del origen y su configuración. Revisa la [guía de AWS sobre reintentos de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html) y el comportamiento de [mapeos de origen de eventos](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html) antes de decidir cuántas veces se intenta un mensaje.

Para que un reintento no cree otro pedido ni descuente inventario dos veces:

- El endpoint de creación acepta una clave de idempotencia del cliente. Si recibe la misma clave y la misma solicitud, devuelve el resultado guardado en vez de crear otro pedido.
- El consumidor conserva `eventId` como clave de deduplicación. Registra ese identificador y aplica el cambio de negocio en una operación atómica cuando la base de datos lo permite; si el efecto ocurre en un proveedor externo, usa también su mecanismo de idempotencia o diseña una compensación.
- Configura reintentos acotados y una cola de mensajes no procesables (DLQ) en la capa que controla la entrega. Inspecciona el mensaje, corrige la causa y reprocésalo de forma segura; una DLQ no corrige por sí sola los datos ni la lógica.

El servicio sigue siendo dueño de su estado incluso cuando usa una cola. Los otros servicios reaccionan a `OrderPlaced` o consultan una API acordada, pero no escriben en la tabla de pedidos.

## Cuándo elegir Lambda

| Lambda suele encajar cuando… | Compara con un contenedor cuando… |
| --- | --- |
| El trabajo empieza por una solicitud o un evento y termina al procesarlo. | El proceso debe permanecer activo, mantener conexiones o atender protocolos de larga duración. |
| El volumen sube y baja, y quieres escalar cada consumidor por separado. | La carga es estable, necesita control del sistema operativo o depende de un runtime y herramientas que no encajan con Lambda. |
| El equipo quiere delegar la administración de servidores y puede trabajar con los límites de invocación del servicio. Una función Lambda estándar puede ejecutarse hasta **15 minutos por invocación**; AWS documenta excepciones para ciertos tipos de invocación con Lambda Managed Instances en sus [cuotas vigentes](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html). | El trabajo debe exceder el límite aplicable, mantener un proceso residente o usar una unidad de despliegue basada en una imagen de contenedor. |

No elijas Lambda solo por una promesa de menor costo. El costo depende de invocaciones, duración y configuración, además de API Gateway, EventBridge, SQS, almacenamiento, registros, red y base de datos. Recursos como una tabla o una capacidad aprovisionada pueden seguir generando cargos aunque haya pocas invocaciones. Consulta los [precios de Lambda](https://aws.amazon.com/lambda/pricing/) y de los otros servicios que formen la arquitectura.

Una imagen de contenedor también puede ser un formato de paquete para una función Lambda. Lambda sigue ejecutando esa imagen bajo su modelo de invocación; no crea una tarea de larga duración ni un servicio de contenedores. La [documentación de imágenes para Lambda](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html) describe ese formato. ECS y EKS cumplen otra función: orquestan contenedores. Para elegir entre ambos enfoques, revisa el [artículo complementario sobre ECS, EKS, Fargate y EC2](/blog/microservicios-en-aws-utilizando-contenedores/).

## Opera con fallas visibles y permisos acotados

- Asigna un rol de ejecución mínimo a cada función. La función de pedidos no necesita permisos para escribir el inventario; la función de inventario sí necesita acceso a su cola y sus propios datos.
- Configura timeout, memoria y concurrencia según mediciones representativas. La concurrencia puede proteger una base de datos o un proveedor externo de una ráfaga excesiva.
- Registra de forma estructurada `eventId`, `orderId` y un identificador de correlación. No escribas secretos ni datos personales completos en los logs.
- Observa invocaciones, errores, throttles y duración en CloudWatch. Para consumidores de SQS, sigue también la cantidad y antigüedad de mensajes, las fallas y el crecimiento de la DLQ. Define quién recibe la alerta y cómo se recupera el flujo.
- Prueba la lógica de negocio sin AWS, y prueba aparte la integración entre API Gateway, Lambda, colas, permisos y almacenamiento en un entorno controlado. Una prueba simulada no confirma permisos, cuotas ni entrega real del servicio.

Para ajustar memoria, concurrencia, secretos y alarmas de estas funciones, continúa con las [mejores prácticas de AWS Lambda](/blog/mejores-practicas-para-aws-lambda/). Esa guía desarrolla los controles operativos sin cambiar los límites de negocio del servicio.

## Recursos y comunidades para practicar microservicios con Lambda

Para practicar la parte de eventos, la grabación [AWS SQS vs SNS vs EventBridge: ¿cuál escoger?](https://www.youtube.com/watch?v=6gITIiiXQNg) de Marcia Villalba compara los modelos de mensajería. Para seguir con servicios de API, lee [Amazon API Gateway: la puerta de entrada a tu backend en la nube](https://dev.to/aws/amazon-api-gateway-la-puerta-de-entrada-a-tu-backend-en-la-nube-1bbi), una introducción en español publicada por AWS.

Si quieres compartir dudas con personas que trabajan con Lambda, visita el [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/). También puedes consultar el grupo general [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/), que reúne a personas interesadas en computación en la nube para compartir experiencias sobre AWS y otras tecnologías. Revisa cada ficha para conocer sus actividades y condiciones de participación.

Para discutir la elección de cómputo, el [AWS User Group Tlaxcala FireflyCloud](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/) anuncia la sesión online [EC2 vs Lambda](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/) para el **16 de octubre de 2026, de 16:00 a 17:00 (UTC−06:00)**. La ficha propone comparar ventajas, costos y escenarios de ambos servicios; el enlace de reunión es visible para asistentes. Confirma el registro y las condiciones en la página del organizador.

El AWS User Group Serverless Colombia anuncia [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/), una sesión virtual para el **20 de octubre de 2026 a las 19:00 (UTC−05:00)**. La ficha indica acceso libre; el enlace de reunión se muestra a las personas asistentes, así que confirma la inscripción y los detalles vigentes allí. La agenda se consultó el 6 de octubre de 2026. Para encontrar otras comunidades y eventos, consulta el [directorio de comunidades AWS](/comunidades/) y la [agenda actual de eventos](/eventos/). El [directorio de videos AWS en español](/aprender/videos/) reúne más grabaciones de grupos de usuarios y creadores; busca allí recursos de Lambda, API Gateway y arquitectura dirigida por eventos.
