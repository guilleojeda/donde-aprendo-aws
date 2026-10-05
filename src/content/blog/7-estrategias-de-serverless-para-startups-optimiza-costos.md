---
title: "Serverless en AWS para startups: cuándo usar Lambda o Fargate y cómo estimar costos"
description: "Compara Lambda y Fargate para una startup, estima el costo de ejecución y suma API Gateway, DynamoDB, logs, NAT y reintentos antes de decidir."
author: "guille-ojeda"
publishedAt: "2024-05-01"
publishedTimestamp: "2024-05-01T02:41:51.509Z"
modifiedTimestamp: "2026-10-04T22:31:52-03:00"
review:
  date: "2026-10-04"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []
---

Serverless puede reducir el trabajo de administrar servidores, pero no elimina las operaciones ni vuelve una aplicación gratis. Para una startup, AWS Lambda suele encajar con tareas breves que reaccionan a eventos y con tráfico irregular; AWS Fargate suele encajar con procesos en contenedores que deben seguir ejecutándose, mantener conexiones o consumir recursos de forma continua. Ninguna opción es siempre más barata: compara el costo del recorrido completo y el tiempo que tu equipo dedica a operarlo.

## Elegir entre AWS Lambda y Fargate

Las dos opciones abstraen la administración de los servidores subyacentes, pero ejecutan el trabajo de maneras distintas. La [guía de decisión de AWS sobre Lambda y Fargate](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/fargate-or-lambda.html) resume sus límites y modelos de ejecución.

### Lambda: funciones que reaccionan a eventos

Lambda ejecuta código en respuesta a solicitudes HTTP, archivos, mensajes, cambios de datos o tareas programadas. AWS administra la capacidad de cómputo y escala los entornos de ejecución con las solicitudes. Una invocación estándar puede durar hasta 15 minutos; la duración y la cantidad de solicitudes determinan buena parte del costo.

Este modelo puede ser práctico cuando el tráfico llega en picos o pasa períodos sin actividad, cuando cada unidad de trabajo es acotada y cuando el equipo quiere desplegar código sin mantener un servicio siempre encendido. Sigue siendo necesario diseñar reintentos, permisos, observabilidad, cuotas y respuestas ante fallos.

Lambda también puede tener *cold starts*: al iniciar un entorno nuevo, la función carga el runtime, las dependencias y el código. El efecto depende del runtime y de la inicialización; mídelo con la latencia que importa a tu producto antes de pagar por mantener entornos preparados. Si la primera respuesta o su percentil alto afecta la experiencia, puedes continuar con esta [guía para analizar los cold starts de Lambda](https://dondeaprendoaws.com/blog/7-estrategias-para-mitigar-cold-starts-en-aws-lambda/).

No confundas **concurrencia reservada** con instancias reservadas ni con un descuento: limita y aparta parte de la concurrencia para una función, pero no deja entornos precalentados. La **concurrencia aprovisionada** mantiene entornos listos para responder y tiene un cargo adicional, incluso mientras espera solicitudes. La [documentación de concurrencia de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html) explica la diferencia. La concurrencia reservada puede proteger una dependencia de demasiadas llamadas, aunque las solicitudes que superen el límite se van a limitar (*throttle*).

### Fargate: procesos y servicios en contenedores

Con Amazon ECS y Fargate puedes ejecutar una aplicación empaquetada como contenedor sin administrar instancias EC2. Es una opción a evaluar si necesitas un proceso persistente, conexiones abiertas, un runtime específico o una tarea que supera el límite de una invocación estándar de Lambda. El contenedor sigue necesitando configuración, despliegues, redes, permisos, métricas y respuesta a incidentes.

Fargate cobra por el vCPU y la memoria asignados a cada tarea mientras se ejecuta; en las versiones actuales compatibles, hay 20 GiB de almacenamiento efímero incluidos por tarea y se cobra el almacenamiento adicional que configures. La tarifa de ECS no añade un cargo separado por orquestación. El tiempo facturable empieza al descargar la imagen y termina cuando se detiene la tarea; se redondea por segundo, con un mínimo de un minuto en Linux y de cinco minutos en contenedores Windows. Si un servicio mantiene una tarea activa todo el día, ese tiempo cuenta aunque la aplicación esté ociosa. La [página de precios de ECS y Fargate](https://aws.amazon.com/ecs/pricing/) detalla la facturación vigente.

Si ya confirmaste que un contenedor persistente encaja, puedes seguir con esta [guía de costos de ECS Fargate](https://dondeaprendoaws.com/blog/7-estrategias-para-reducir-costos-en-aws-fargate/) para revisar más variables del servicio.

Hay una excepción útil a la regla simplista de “Lambda solo sirve para trabajo breve”: las **Durable Functions** permiten orquestar un flujo de varios pasos durante hasta un año. En modalidad bajo demanda, las esperas no generan cargos por duración de cómputo, pero sí pueden cobrarse las operaciones durables, los datos escritos y su retención; los reintentos o replays también pueden añadir invocaciones. Eso no equivale a mantener un proceso que consume CPU o una conexión abierta. Para ese trabajo continuo, compara Fargate; para un flujo que pasa tiempo esperando aprobaciones o respuestas externas, revisa los cargos y límites de Durable Functions en la [página de precios de Lambda](https://aws.amazon.com/lambda/pricing/). Como lectura complementaria en español, [Hazel Sáenz compara Durable Functions y Step Functions](https://dev.to/aws/lambda-durable-functions-mata-a-step-functions-o-no-2p6c); confirma cuotas y precios en la documentación de AWS.

## Estimar el costo con un ejemplo repetible

Lambda factura solicitudes y duración, medida en GB-segundos según la memoria asignada y el tiempo facturable. La tarifa depende de la región y la arquitectura del procesador. Para dejar claro qué se está estimando, supongamos un endpoint con 100.000 solicitudes por día durante 30 días, una invocación de Lambda por solicitud, 256 MiB asignados y 180 milisegundos de duración facturable promedio, sin reintentos ni concurrencia aprovisionada:

- Solicitudes del mes: `100.000 × 30 = 3.000.000`.
- Cómputo del mes: `3.000.000 × (256 / 1.024) GB × 0,18 s = 135.000 GB-s`.
- Estimación de Lambda: `3.000.000 × precio_por_solicitud + 135.000 × precio_por_GB-s`.

Los volúmenes se pueden reproducir con una calculadora o una hoja de cálculo; completa los precios desde la [página de precios de Lambda](https://aws.amazon.com/lambda/pricing/) para la región y arquitectura que realmente usarías. El ejemplo estima **solo Lambda**: no resta créditos ni una capa gratuita, ni agrega los demás servicios del endpoint.

Para Fargate, suma por tarea sus segundos facturables y los recursos asignados: `∑ tareas [segundos_tarea × (vCPU × tarifa_vCPU-segundo + GB_memoria × tarifa_GB-segundo + GB_almacenamiento_adicional × tarifa_GB-segundo)]`. Cuenta como `GB_almacenamiento_adicional` lo que configures por encima de los 20 GiB incluidos. Redondea los segundos según la facturación y aplica el mínimo correspondiente al sistema operativo: un minuto en Linux y cinco minutos en Windows. Consulta las tarifas actuales por región, sistema operativo y arquitectura en la [página de precios de ECS](https://aws.amazon.com/ecs/pricing/). Si las tareas permanecen arriba aunque no reciban tráfico, incluye esas horas; si arrancan solo por lotes, usa el tiempo de ejecución observado.

Estas fórmulas no dan un punto de equilibrio universal. Para elegir, repite la comparación con tus períodos tranquilos, carga normal y picos esperados, y agrega la base de datos, red, registro, transferencia, alta disponibilidad y trabajo operativo que realmente necesitas. Para cargas sostenidas y de mucho volumen, AWS también ofrece **Lambda Managed Instances**, un modelo distinto del Lambda estándar: ejecuta funciones sobre instancias EC2 administradas, admite varias invocaciones simultáneas por entorno y suma cargos por solicitudes, instancias y gestión. Revisa los [runtimes y condiciones compatibles](https://docs.aws.amazon.com/lambda/latest/dg/lambda-managed-instances-runtimes.html) y su [modelo de precios](https://aws.amazon.com/lambda/pricing/) antes de compararlo con Fargate. Revisa la cuenta con facturación y mediciones propias.

## Costos que quedan fuera del cómputo

Una arquitectura serverless suele conectar varios servicios. Cada uno tiene su propia forma de cobrar, por lo que una función rápida o sin tráfico no convierte automáticamente a toda la solución en una factura pequeña.

- **API Gateway** cobra por solicitudes y datos transferidos; el caché, si lo habilitas, tiene su propia tarifa. Si solo necesitas un endpoint HTTP sencillo, compara también una [URL de función Lambda](https://docs.aws.amazon.com/lambda/latest/dg/furls-http-invoke-decision.html) con API Gateway: la URL de Lambda no añade un cargo de endpoint, pero ofrece menos capacidades de administración de API. Revisa autenticación, dominio, control de tráfico y otras funciones antes de elegir. Usa los [precios de API Gateway](https://aws.amazon.com/api-gateway/pricing/) para estimar las llamadas y respuestas de tu caso.
- **DynamoDB** puede cobrar por lecturas y escrituras bajo demanda, además del almacenamiento y las copias de seguridad. Con capacidad aprovisionada también pagas la capacidad por hora que reservaste, aunque no la consumas completa. Revisa el modo de capacidad y el patrón real de acceso en la [página de precios de DynamoDB](https://aws.amazon.com/dynamodb/pricing/).
- **CloudWatch Logs** factura de acuerdo con el uso; las funciones Lambda y otros servicios envían registros con tarifas estándar. Establece cuánto detalle necesitas y cuánto tiempo conservarlo. La [documentación de facturación de CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/LogsBillingDetails.html) y los [precios de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) describen los componentes.
- **NAT Gateway** suma cargos por hora disponible y por cada GB procesado cuando el tráfico de una subred privada realmente pasa por esa puerta de enlace. No toda función Lambda requiere un NAT: depende de la conexión a la VPC y de la ruta de red. Si accedes a servicios de AWS, compara las rutas y puntos de enlace disponibles con la [guía de precios de NAT Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html).
- **Reintentos y mensajes repetidos** pueden ejecutar la función y sus llamadas descendentes más de una vez. Con SQS, Lambda procesa cada evento al menos una vez; si falla un elemento del lote, sin respuestas parciales puede volver a quedar visible el lote completo. Haz que el efecto de procesar un mensaje repetido sea seguro (*idempotente*) y considera respuestas parciales para reintentar solo los elementos fallidos. Consulta la [guía de Lambda con SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html) y la [configuración de fallos por lote](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html).

Si un servicio puede llamar directamente a otro y no hay lógica de negocio que ejecutar, compara una integración directa antes de sumar una función de paso. API Gateway, Step Functions y EventBridge pueden integrar algunos servicios sin ese código intermedio, pero cada llamada y capacidad sigue teniendo sus propios límites y cargos. La [guía de integraciones directas de AWS](https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/direct-integrations.html) explica el patrón. Una función pequeña que solo transforma una entrada o aplica una regla propia puede seguir siendo la opción más clara.

## Optimizar después de medir

Empieza por identificar qué componentes explican la factura. Revisa el detalle por servicio en [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) y compara las métricas de ejecución con la carga que procesaste. Para separar el gasto por producto y entorno, aplica etiquetas y actívalas como claves de asignación de costos siguiendo los [pasos de AWS Billing](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html); puede tardar hasta 24 horas en aparecer una clave nueva, y Cost Explorer actualiza los datos al menos una vez cada 24 horas. El ejemplo de [Kevin Lupera sobre etiquetas de costo con CDK](https://dev.to/aws-builders/aws-cost-optimization-por-que-las-tags-son-tu-mejor-aliado-1h8j) explica esa preparación; contrasta los pasos de facturación con la documentación vigente de AWS. Ajustar memoria puede subir el costo por segundo y, a la vez, acortar suficiente el tiempo para mejorar costo y latencia; prueba ambas variables con una muestra representativa. Por ejemplo, [Camilo Cabrales muestra cómo probar memoria y rendimiento en Lambda](https://dev.to/cecamilo/tunea-tus-funciones-lambda-31a4). Su tutorial, publicado en 2023, despliega una máquina de Step Functions y una función mediante SAM: requiere una cuenta de AWS y Docker, puede generar cargos y recomienda eliminar la pila de CloudFormation al terminar. No tomes su precio de ejemplo como tarifa actual.

Para trabajo que puede esperar, una cola puede amortiguar picos y permitir procesar lotes. Eso puede reducir invocaciones por elemento, pero no elimina el costo de SQS ni el de procesar cada elemento; los lotes grandes también cambian latencia, memoria y efecto de un fallo. La [guía práctica de colas de Hazel Sáenz](https://dev.to/aws/guia-practica-de-colas-el-secreto-para-sobrevivir-picos-de-trafico-2g6l) explica el patrón y enlaza un [demo de S3, SQS y Lambda](https://github.com/hsaenzG/queue-101-demo). El demo necesita una cuenta de AWS con facturación habilitada y `cdk bootstrap`; despliega recursos reales. Su README indica hacer `cdk destroy` y revisar CloudWatch Logs, porque algunos grupos de logs pueden quedar después.

Si quieres ver una integración API Gateway → DynamoDB sin una Lambda de intermediación, [Andrés Moreno publica un ejemplo serverless con SAM](https://www.andmore.dev/es/blog/build-serverless-api-with-no-lambda/). El tutorial es de 2021: sirve para visualizar el patrón, no para copiar tarifas o asumir que sus detalles de API, permisos y esquema de datos siguen siendo una recomendación actual. Contrasta la configuración con la documentación y precios vigentes antes de desplegarlo.

Para practicar el lado de contenedores, [Roxs comparte ECS Canary in Action](https://github.com/roxsross/aws-ecs-canary-in-action), un laboratorio de despliegue canary para Fargate. Puedes recorrer el flujo localmente con Docker sin una cuenta de AWS; el modo AWS crea recursos como ALB, ECS/Fargate, ECR, DynamoDB y CloudWatch mediante Terraform. Necesitas permisos para esos servicios y debes ejecutar `terraform destroy` cuando termines para retirar la infraestructura.

Las alertas de [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html) ayudan a detectar gasto real o previsto, pero no son un techo de consumo: se actualizan con retraso y puedes acumular cargos antes de recibir una notificación. Budgets permite configurar acciones aparte; no dependas de una alerta como interruptor de seguridad. Los créditos de [AWS Activate](https://aws.amazon.com/startups/credits/) tampoco son universales: la elegibilidad depende de condiciones del programa, etapa y cuenta, y los créditos están sujetos a términos. Si tu startup los recibe, reduce solo los cargos elegibles durante el período que corresponda; no cambia el costo de la arquitectura cuando termina la promoción.

Serverless tampoco significa que AWS se encargue de la seguridad completa de la aplicación. AWS administra componentes de la infraestructura según el servicio elegido; tu equipo sigue a cargo, entre otras cosas, de los datos, permisos, configuración y protección de la aplicación. Es parte del [modelo de responsabilidad compartida de AWS](https://aws.amazon.com/compliance/shared-responsibility-model/).

## Recursos, comunidades y eventos

Además de los enlaces técnicos de esta guía, puedes comparar experiencias con personas de comunidades AWS. El [directorio de comunidades por país](https://dondeaprendoaws.com/comunidades/) ayuda a encontrar grupos locales. Si estás en Córdoba, Argentina, el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) se presenta como un espacio para compartir experiencias sobre computación en la nube; al revisar su ficha el 4 de octubre de 2026, no mostraba próximos encuentros. La página del [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) sí mostraba una reunión online para el 20 de octubre. Comprueba en cada ficha el tema, el horario, la modalidad y las condiciones de acceso.

Al revisar la agenda el **4 de octubre de 2026**, estaban anunciados dos encuentros online relacionados con estos temas:

- **16 de octubre de 2026, 16:00–17:00 (hora de México, GMT−6):** [EC2 vs Lambda](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/), online, de AWS User Group Tlaxcala FireflyCloud; la ficha compara ventajas y costos.
- **20 de octubre de 2026, 19:00–21:00 (COT/GMT−5):** [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/), online, de AWS User Group Serverless Colombia; la ficha anuncia acceso libre.

Consulta cada ficha para confirmar horario en la zona del organizador, registro y cambios. Si estos encuentros ya pasaron cuando leas el artículo, revisa la [agenda de eventos AWS](https://dondeaprendoaws.com/eventos/) y la página de la comunidad por si hay nuevas fechas o una grabación.

## Preguntas frecuentes

### ¿Serverless significa gratis?

No. Lambda cobra solicitudes y duración; Fargate, recursos por tarea y tiempo. API Gateway, bases de datos, colas, registros, red y transferencia también pueden generar cargos. Comprueba los límites de la capa gratuita o los créditos solo si tu cuenta cumple sus condiciones.

### ¿Lambda siempre cuesta menos que Fargate?

No. Lambda puede evitar pagar por capacidad inactiva en cargas intermitentes; Fargate cobra mientras mantiene las tareas solicitadas, pero el costo relativo puede cambiar con el uso sostenido, los recursos asignados y los servicios que acompañan cada opción. Estima el mismo escenario completo para ambas.

### ¿AWS Budgets detiene los recursos cuando supero mi límite?

Una notificación de presupuesto por sí sola no detiene recursos y puede llegar después de que los cargos ya aumentaron. Puedes configurar acciones de presupuesto por separado, pero sigue revisando qué permiten, qué recursos afectan y cuánto demora su aplicación.

### ¿Qué hago si Lambda presenta cold starts o throttling?

Primero revisa métricas de duración, concurrencia, límites de cuenta y función, y latencia durante picos. La concurrencia aprovisionada puede reducir algunas demoras iniciales si mantener entornos listos justifica su precio; la concurrencia reservada limita y aparta capacidad, pero no elimina los cold starts. Prueba y documenta la opción con carga representativa.
