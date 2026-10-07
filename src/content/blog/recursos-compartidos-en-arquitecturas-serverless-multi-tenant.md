---
title: "Serverless multi-tenant en AWS: recursos compartidos y aislamiento"
description: "Aprende a compartir Lambda, DynamoDB y S3 entre tenants: modelos pool, silo y bridge, autorización, noisy neighbor, caché y observabilidad."
author: "guille-ojeda"
publishedAt: "2024-05-18"
publishedTimestamp: "2024-05-18T01:35:00.225Z"
modifiedTimestamp: "2026-10-06T23:36:27-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Mejores prácticas para Amazon DynamoDB: claves, consultas y costos"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-dynamodb/"
  - title: "Caché en AWS serverless: patrones, TTL y costos"
    url: "https://dondeaprendoaws.com/blog/estrategias-de-cache-rentables-para-apps-serverless/"
  - title: "AWS Lambda: qué es, cómo funciona y cuándo usarlo"
    url: "https://dondeaprendoaws.com/blog/que-es-aws-lambda-preguntas-y-respuestas/"
---

Una aplicación **serverless multi-tenant** puede compartir una función Lambda, una tabla DynamoDB o un bucket S3 entre varios clientes. Esto permite aprovechar infraestructura común, pero exige resolver dos problemas distintos: impedir que un cliente acceda a los datos de otro y evitar que su carga degrade el servicio para los demás. Añadir un campo `tenantId` no resuelve ninguno por sí solo.

Un **tenant** es el cliente o la organización que usa el producto; puede tener muchos usuarios. Por ejemplo, dos empresas pueden utilizar el mismo sistema de pedidos, con usuarios, datos y permisos independientes. Esta guía explica las opciones para compartir recursos en AWS y los controles que debes comprobar en cada capa, desde la identidad hasta las colas y la observabilidad.

## Pool, silo y bridge: qué compartes y qué separas

AWS distingue estos [modelos de SaaS en su Well-Architected SaaS Lens](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html):

| Modelo | Ejemplo serverless | Ventaja y costo de operarlo |
| --- | --- | --- |
| **Pool**: recursos compartidos | Una Lambda y una tabla DynamoDB para varios tenants | Centraliza despliegues y puede aprovechar mejor los recursos. Debes aplicar aislamiento lógico y controlar la contención. |
| **Silo**: recursos dedicados | Función y tabla independientes por tenant | Permite acotar permisos y capacidad por recurso. Aumenta el número de recursos que debes provisionar, actualizar y observar. |
| **Bridge**: combinación | API compartida y almacenamiento dedicado para ciertos tenants | Separa los componentes que lo necesitan. Requiere enrutar correctamente y operar ambas modalidades. |

La elección puede variar por servicio y por categoría de cliente. Compartir la API no obliga a compartir las tablas. Tener recursos dedicados tampoco basta si el rol de la aplicación puede leer los de cualquier tenant. En todos los modelos debes validar los permisos y mantener una operación coherente para los clientes.

Antes de elegir, identifica qué exige separación, qué carga comparten los clientes y cuánto cuesta operar recursos independientes. Compara con tráfico representativo: serverless administra infraestructura, pero no elimina las cuotas ni garantiza que compartir siempre sea más barato.

## La identidad del tenant debe llegar desde un contexto confiable

**Autenticar** responde quién hace la solicitud. **Autorizar** decide si esa identidad puede ejecutar la operación sobre esos datos. El [aislamiento entre tenants](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-isolation.html) debe impedir accesos cruzados incluso entre usuarios autenticados.

Supón que alguien solicita `GET /tenants/beta/orders/42`, pero pertenece a `acme`. Que tenga un token válido no le concede acceso a `beta`. El backend debe comprobar la pertenencia y los permisos antes de consultar el pedido. Si una persona pertenece a varias organizaciones, también debe comprobar que puede actuar en la seleccionada.

Un flujo concreto sería:

1. Validar la credencial con el proveedor y authorizer apropiados: firma, emisor, destinatario y vigencia del token, además de los permisos de la ruta. Por ejemplo, AWS explica esas comprobaciones en los [JWT authorizers de HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html).
2. Resolver el tenant autorizado desde claims verificados o una relación de pertenencia controlada por el backend. Un encabezado, subdominio o parámetro enviado por el cliente puede seleccionar un tenant, pero no demostrar que tiene acceso.
3. Propagar ese contexto a las consultas, escrituras, claves de caché y trabajos asíncronos. Los consumidores de mensajes deben conservar los mismos límites.
4. Restringir el acceso al almacenamiento para que un error de selección no abra todos los datos.

La guía de [Lambda authorizers: seguridad, JWT y caché en API Gateway](/blog/5-practicas-de-seguridad-para-lambda-authorizers/) desarrolla la validación y el alcance de las decisiones cacheadas. Como práctica en español, [Asegurar API Gateway con Amazon Cognito usando SAM, de Andres Moreno](https://andmore.dev/es/blog/api-cognito/), muestra autenticación máquina a máquina con scopes. Sirve para estudiar la entrada a la API; debes agregar los controles de pertenencia y datos de tu SaaS.

## DynamoDB compartido: las claves organizan; IAM restringe

En una tabla con claves compuestas puedes agrupar pedidos de un tenant de esta forma:

| PK | SK | Datos de ejemplo |
| --- | --- | --- |
| `TENANT#acme` | `ORDER#42` | Pedido de Acme |
| `TENANT#acme` | `ORDER#43` | Otro pedido de Acme |
| `TENANT#beta` | `ORDER#42` | Pedido de Beta |

El backend construye `PK` desde el contexto autorizado, no desde el cuerpo recibido. Sin embargo, un rol con acceso a toda la tabla todavía puede consultar ambas particiones. AWS muestra cómo [usar credenciales temporales restringidas para una Lambda compartida](https://aws.amazon.com/blogs/security/security-practices-in-aws-multi-tenant-saas-environments/): el código accede a los datos mediante una sesión con permisos del tenant correspondiente.

Esta política de lectura ilustra el uso de `dynamodb:LeadingKeys`. Sustituye región, cuenta y tabla; presupone una sesión IAM etiquetada con `TenantId` por un componente confiable:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:Query"],
    "Resource": "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/Orders",
    "Condition": {
      "ForAllValues:StringEquals": {
        "dynamodb:LeadingKeys": ["TENANT#${aws:PrincipalTag/TenantId}"]
      },
      "Null": {
        "dynamodb:LeadingKeys": "false",
        "aws:PrincipalTag/TenantId": "false"
      }
    }
  }]
}
```

Para una sesión con `TenantId=acme`, esa concesión permite leer `TENANT#acme` y no concede `TENANT#beta`. La comparación es exacta: tampoco incluye `TENANT#acme2`. Las comprobaciones `Null` exigen que existan la clave de condición y la etiqueta. Consulta la referencia de [condiciones IAM de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/specifying-conditions.html) y la explicación de [ForAllValues y claves ausentes](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-single-vs-multi-valued-context-keys.html).

La política no concede escrituras, `Scan` ni acceso a índices; no es una configuración completa para producción. La confianza del rol debe impedir que quien pide acceso elija una etiqueta ajena. Revisa otras concesiones IAM: un permiso amplio adicional puede anular el efecto práctico de una concesión limitada. Si usas una política de sesión, sus permisos se intersectan con los del rol, como explica [AWS STS AssumeRole](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html). El cliente DynamoDB debe usar las credenciales restringidas, y el camino habitual de datos no debe conservar una alternativa con acceso general.

Una clave por tenant facilita el ejemplo, pero puede concentrar demasiado tráfico. Para cargas mayores, diseña las colecciones según el acceso, por ejemplo combinando tenant y pedido. Revisa entonces la política y cada índice: no traslades esta igualdad exacta a un esquema de claves diferente. AWS desarrolla esas decisiones en [DynamoDB multi-tenancy, parte 2](https://aws.amazon.com/blogs/database/amazon-dynamodb-data-modeling-for-multi-tenancy-part-2/). Una expresión de filtro que descarta datos después de leerlos no reemplaza la autorización.

Para seguir estudiando el diseño, consulta [Mejores prácticas para Amazon DynamoDB: claves, consultas y costos](/blog/mejores-practicas-para-amazon-dynamodb/) y la lectura comunitaria de Brenda Galicia sobre [diseño de una sola tabla](https://dev.to/bardengalicia/simplicidad-y-eficiencia-desmitificando-el-diseno-de-una-sola-tabla-en-amazon-dynamodb-8oc). Esta última explica claves y relaciones; no implementa aislamiento multi-tenant.

## S3 y caché: un prefijo tampoco es una frontera de permisos

En un bucket compartido, `tenants/acme/invoices/42.pdf` permite organizar objetos, pero no impide que un rol lea `tenants/beta/invoices/42.pdf`. Restringe las operaciones sobre objetos al ARN del prefijo autorizado y, si permites listar, restringe `s3:ListBucket` con la condición `s3:prefix`. Son controles distintos: AWS documenta [políticas sobre objetos y listados por prefijo](https://docs.aws.amazon.com/AmazonS3/latest/userguide/amazon-s3-policy-keys.html).

El backend también debe comprobar el tenant antes de generar una [URL prefirmada para un objeto](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html). Cifrar los objetos no sustituye esa autorización: si un principal tiene los permisos necesarios para leer y descifrar, el cifrado no corrige un acceso cruzado.

En una caché compartida, una clave como `order:42` colisionaría entre los dos clientes del ejemplo. Una clave `tenant:acme:order:42:v1` distingue sus datos, pero debes construirla desde el contexto autorizado y comprobar el acceso también en un acierto de caché. Si la respuesta depende del usuario o de su rol, incluye ese alcance o evita compartirla.

Revisa TTL e invalidación cuando cambian datos o permisos. En Lambda, no conserves datos sensibles de una solicitud en variables globales o archivos temporales que otra invocación pueda reutilizar; las [prácticas de AWS Lambda](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html) advierten sobre ese riesgo. La guía de [caché en AWS serverless](/blog/estrategias-de-cache-rentables-para-apps-serverless/) desarrolla claves, privacidad y costo antes de añadir ElastiCache u otra capa.

## Noisy neighbor: protege la capacidad que comparten los clientes

Un **noisy neighbor** es un tenant cuya carga perjudica a otros. Puede producir una ráfaga de solicitudes, monopolizar consumidores de una cola o concentrar lecturas en una clave. Subir capacidad puede ayudar, pero también aumentar la factura sin corregir cómo se reparte el trabajo.

### Lambda: reservar concurrencia no crea una cuota por tenant

La [concurrencia reservada de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html) aparta capacidad y fija un máximo para una función. Si todos los tenants usan esa función, comparten ese máximo. No reserva una parte para cada uno. Para entender invocaciones, concurrencia y límites, lee [AWS Lambda: qué es, cómo funciona y cuándo usarlo](/blog/que-es-aws-lambda-preguntas-y-respuestas/).

Puedes evaluar límites de admisión por tenant antes de ejecutar tareas costosas, consumidores separados para cargas que lo necesitan o funciones dedicadas con sus propias reservas. Define qué trabajo rechazas o pospones y comprueba también el límite del recurso aguas abajo. Una alarma solo informa; para frenar consumo necesitas un control que actúe en ese flujo.

AWS ofrece además un [modo de aislamiento de tenants en Lambda](https://docs.aws.amazon.com/lambda/latest/dg/tenant-isolation.html) que asigna entornos de ejecución al `tenant-id` indicado. Evita reutilizar el mismo entorno entre tenants diferentes, pero mantiene el rol de ejecución compartido y el comportamiento de concurrencia. Por tanto, debes seguir autorizando datos y resolviendo la contención. Se habilita al crear la función, tiene cargos adicionales y no es compatible con Function URLs, concurrencia aprovisionada ni SnapStart. Verifica compatibilidad y región antes de adoptarlo.

### API Gateway y SQS: conoce el alcance de cada control

En **REST API**, los usage plans de API Gateway permiten objetivos de throttling y cuotas por API key. AWS aclara que se aplican con esfuerzo razonable y pueden superarse: no son un límite estricto de gasto. Las API keys tampoco deben usarse como autenticación o autorización. Consulta [usage plans y API keys](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html) antes de tratarlos como una garantía para clientes.

Para una cola **SQS standard** compartida, las [fair queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fair-queues.html) utilizan `MessageGroupId` para identificar tenants y mitigar el aumento de espera de otros grupos cuando uno concentra mensajes en procesamiento. El productor debe asignarlo desde el contexto confiable. Esta función no impone una tasa máxima por tenant ni da orden FIFO. Tampoco convierte una cola común en colas privadas: los consumidores deben aplicar el contexto y los permisos de cada tarea.

Si quieres estudiar el procesamiento asíncrono acompañado, el AWS User Group Serverless Colombia anuncia [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/) para el **20 de octubre de 2026, a las 19:00 de Colombia (UTC−5)**. Al revisar la ficha el 6 de octubre, figura como sesión virtual de acceso libre, con enlace visible para asistentes. Es una charla de arquitectura resiliente, no una promesa de taller sobre aislamiento; confirma agenda y registro en Meetup.

## Observabilidad y costo por tenant

Una media saludable puede ocultar que un cliente responde lento. Publica logs estructurados con identificador interno de tenant, operación, duración, resultado e ID de solicitud. Evita tokens y datos personales innecesarios. Las [operaciones conscientes del tenant en SaaS Lens](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-aware-operations.html) explican por qué necesitas esa vista además de las métricas globales.

Si tus logs de solicitudes contienen `tenantId` y `durationMs`, esta consulta de CloudWatch Logs Insights compara volumen y latencia p95 por tenant en el período y grupos seleccionados:

```text
filter ispresent(tenantId) and ispresent(durationMs)
| stats count(*) as requests, pct(durationMs, 95) as p95Ms by tenantId
| sort p95Ms desc
```

Registra un evento por solicitud si quieres que el conteo represente solicitudes; con varios eventos estarías contando líneas de log. La [sintaxis de stats](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-Stats.html) admite esas agregaciones. La consulta no crea métricas ni alarmas: debes configurarlas sobre señales publicadas y probar su respuesta. Si publicas métricas personalizadas por tenant, cada combinación de dimensiones crea una serie distinta; evalúa cantidad y costo antes de multiplicarlas. La referencia de [conceptos de métricas de CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_concepts.html) explica esa identidad.

Correlaciona logs y trazas para seguir la solicitud, y contrasta errores, throttling y capacidad del servicio afectado. La guía de [diagnóstico con CloudWatch](/blog/mejores-practicas-de-observabilidad-en-aws/) explica instrumentación, datos ausentes y OpenTelemetry. Como entrada en español, [Observabilidad en la Nube de AWS, de Sheyla Leacock](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m), compara métricas, logs y trazas. [Búfer de logs con Lambda Powertools, de Andres Moreno](https://andmore.dev/es/blog/log-buffering/), muestra cómo conservar y emitir logs bajo condiciones concretas; antes de usarlo, comprueba que tu diagnóstico y auditoría no dependan de eventos que terminarías descartando.

CloudTrail registra actividad de APIs, pero no equivale a todos los eventos de negocio. Los eventos de datos necesitan configuración y pueden tener cargos; revisa [cómo habilitarlos](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html) en vez de asumir que todos los accesos a objetos ya se auditan.

Para repartir costos compartidos necesitas un criterio explícito: solicitudes, duración, unidades consumidas u otra medida apropiada al servicio. Cost Explorer no identifica automáticamente qué tenant consumió cada invocación de una función compartida. Separa costos directamente atribuibles de estimaciones y gastos comunes; SaaS Lens desarrolla este problema en [medición y atribución del consumo](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/expenditure-awareness.html).

## Cómo comprobar el aislamiento antes de confiar en él

Prepara dos tenants ficticios y verifica accesos permitidos y rechazados, además de una carga desbalanceada. No basta con probar el camino correcto de un usuario:

| Caso | Qué debes comprobar |
| --- | --- |
| Usuario de Acme cambia el tenant en ruta, cuerpo o encabezado | La autorización rechaza el acceso a Beta antes de devolver datos. |
| Sesión de Acme intenta consultar claves o índices de Beta | Los permisos del almacén impiden el acceso; revisa también escrituras y operaciones por lotes si las habilitas. |
| Dos tenants usan el mismo ID de pedido | Consultas y caché mantienen respuestas separadas, incluyendo aciertos y cambios de permisos. |
| Una tarea se entrega nuevamente | El consumidor conserva el tenant y no repite efectos de negocio indebidamente. |
| Un tenant genera una ráfaga | Mide latencia, errores y espera de los demás; comprueba qué límite actúa y qué ocurre con el trabajo rechazado. |

La política ilustrativa y la consulta de logs no demuestran por sí solas el aislamiento de tu aplicación: debes comprobar la configuración efectiva y los caminos que usa el código, incluyendo los rechazos previstos.

## Recursos y comunidades para seguir aprendiendo

Puedes llevar un diagrama pequeño, claves ficticias y una pregunta concreta —por ejemplo, «¿cómo separo permisos de tabla y de índice?»— a una comunidad. Un grupo general también sirve para aprender y contrastar experiencias; no tiene que estar dedicado a SaaS.

- [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/): consulta sus encuentros para conversar sobre funciones, APIs y procesamiento de eventos.
- [AWS User Group Perú](https://awsugperu.cloud/): ofrece un portal con comunidades locales, actividades y grupos de estudio para encontrar personas con quienes aprender.
- [AWS User Group Chile](https://awsugchile.com/): reúne personas interesadas en AWS y ofrece vías para participar. Su [canal de YouTube](https://www.youtube.com/channel/UCYUBBIe0XzNsxcq9Tu_Wqsw) permite explorar charlas grabadas a tu ritmo.
- [AWS Women Colombia](https://awswomencolombia.com/): comparte publicaciones y actividades de la comunidad; su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw) es otra opción para revisar sesiones técnicas en español.
- [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/): publica encuentros y recursos para profundizar controles de acceso y seguridad en AWS.
- [AndMore Dev](https://www.andmore.dev/es/): permite continuar con artículos prácticos en español sobre APIs, SAM y Lambda, incluidos los ejemplos enlazados en esta guía.

Para encontrar otras opciones por país o formato, explora el [directorio de comunidades](/comunidades/), los [creadores y canales](/creadores/) y la [agenda de eventos AWS](/eventos/). Confirma fechas, modalidad, requisitos y condiciones con cada organizador.

## Preguntas frecuentes

### ¿Un tenantId en DynamoDB o un prefijo en S3 garantiza aislamiento?

No. Identifica y organiza datos. El aislamiento requiere validar la pertenencia del solicitante y restringir las operaciones al ámbito autorizado mediante controles del backend y del almacén.

### ¿Cognito aísla automáticamente los datos de cada cliente?

No. Puede aportar identidad y tokens para autorizar una API; la aplicación debe relacionar esa identidad con el tenant y sus permisos, y aplicar el límite en cada acceso a datos.

### ¿Una Lambda compartida puede reservar concurrencia por tenant?

La concurrencia reservada se configura para la función. Los tenants que la usan comparten ese límite. Un reparto por tenant necesita controles adicionales o recursos separados según el comportamiento que quieras garantizar.

### ¿Pool siempre cuesta menos que silo?

No. Puede aprovechar infraestructura común, pero el consumo, las capas adicionales y la operación también cuestan. Compara la carga y los controles necesarios; no atribuyas ahorros sin medirlos.

### ¿SQS fair queues reemplaza una cuota por cliente?

No. Mitiga el impacto de un vecino ruidoso en la espera de otros grupos, pero no fija una tasa de consumo máxima por tenant. Los límites comerciales y la autorización siguen siendo responsabilidades separadas.
