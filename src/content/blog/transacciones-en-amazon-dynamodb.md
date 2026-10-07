---
title: 'Transacciones en Amazon DynamoDB: guía práctica de TransactWriteItems'
description: Aprende cuándo usar TransactWriteItems y TransactGetItems, sus límites, un ejemplo de pedido e inventario y cómo diagnosticar cancelaciones.
author: guille-ojeda
publishedAt: '2024-03-19'
publishedTimestamp: '2024-03-19T01:07:24.799Z'
modifiedTimestamp: '2026-10-07T10:03:05-03:00'
cover: /assets/blog/editorial-datos-ia.png
coverAlt: Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja.
ogImage: /assets/blog/editorial-datos-ia.png
related:
- title: 'Amazon DynamoDB para principiantes: claves y consultas'
  url: https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/
- title: 'Mejores prácticas para Amazon DynamoDB: claves, consultas y costos'
  url: https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-dynamodb/
review:
  date: '2026-10-07'
---


Una transacción de DynamoDB agrupa operaciones relacionadas para que una escritura completa se aplique o no se aplique, o para leer varios elementos como una misma instantánea. Usa `TransactWriteItems` cuando varias escrituras deben mantenerse juntas —por ejemplo, crear un pedido y descontar inventario— y `TransactGetItems` cuando necesitas leer varios elementos con una vista coherente.

La guía está pensada para quienes implementan aplicaciones con DynamoDB. Si todavía estás decidiendo cómo organizar claves y consultas, puedes repasar primero [Amazon DynamoDB para principiantes: claves y consultas](/blog/amazon-dynamodb-guia-basica/) y luego las [mejores prácticas para claves, consultas y costos](/blog/mejores-practicas-para-amazon-dynamodb/).

## Cuándo usar cada API

| API | Qué reúne | Cuándo sirve |
| --- | --- | --- |
| `TransactWriteItems` | Hasta 100 acciones `Put`, `Update`, `Delete` o `ConditionCheck`. | Cuando todas las escrituras deben confirmarse juntas. |
| `TransactGetItems` | Hasta 100 lecturas `Get` por clave primaria. | Cuando necesitas consultar varios elementos con una misma instantánea. |

Las dos operaciones son atómicas dentro de una solicitud. En una escritura, DynamoDB confirma todas las acciones o cancela todas; en una lectura transaccional, los resultados corresponden a una vista coherente de los elementos solicitados. Una serie de llamadas separadas a `GetItem` puede leer algunos elementos antes y otros después de una escritura concurrente. Si necesitas una instantánea de varios elementos, usa `TransactGetItems`. La [guía de transacciones de AWS](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html) detalla estas APIs y sus niveles de aislamiento.

Una transacción no es una forma de ejecutar operaciones sobre índices: cada acción trabaja con un elemento identificado por su clave primaria. Además, una misma escritura transaccional no puede incluir dos acciones para el mismo elemento. Por ejemplo, no puedes agregar un `ConditionCheck` y un `Update` dirigidos al mismo elemento; incorpora la condición en la propia acción `Update`.

## Límites y alcance regional

Antes de diseñar una transacción, considera estos límites vigentes:

- Cada solicitud admite hasta **100 acciones** y hasta **4 MB de datos en total**.
- Cada elemento sigue sujeto al máximo de **400 KB**, incluidos los nombres y valores de sus atributos.
- Puedes abarcar varias tablas, pero deben pertenecer a la misma cuenta de AWS y a la misma Región.
- Las acciones deben dirigirse a elementos distintos; las transacciones no usan índices secundarios.

Los límites de 4 MB por transacción y 400 KB por elemento son independientes: respetar uno no garantiza respetar el otro. La referencia de AWS reúne las [cuotas y restricciones de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html).

Las transacciones tampoco dan atomicidad entre regiones de una tabla global. En una tabla con consistencia eventual multirregión (MREC), una escritura se confirma primero en la región de origen y sus cambios se replican después. Durante esa replicación, otra región puede mostrar solo parte de la transacción. Las tablas globales con consistencia fuerte multirregión (MRSC) **no admiten operaciones transaccionales**. Revisa la documentación actual de AWS sobre [tablas globales y transacciones](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/globaltables-CoreConcepts.html) si tu aplicación opera en más de una región.

## Ejemplo: crear un pedido y descontar inventario

Este ejemplo crea un pedido solo si su identificador todavía no existe y descuenta dos unidades de un producto solo si hay stock suficiente. Si cualquiera de las condiciones falla, DynamoDB cancela ambas acciones: no queda el pedido creado ni se modifica el inventario.

El ejemplo supone que ya existen dos tablas en la misma cuenta y Región:

- `Orders`, con clave de partición de tipo string llamada `orderId`.
- `Inventory`, con clave de partición de tipo string llamada `productId`, y el elemento `SKU-42` ya existe con un atributo numérico `stock` de al menos `2`.

El perfil y la región de AWS CLI deben estar configurados para la cuenta donde están esas tablas. La identidad necesita `dynamodb:PutItem` sobre `Orders` y `dynamodb:UpdateItem` sobre `Inventory`. Si ejecutas la lectura transaccional de la sección siguiente, también necesita `dynamodb:GetItem` sobre ambas. AWS autoriza cada acción transaccional con el permiso de su operación subyacente; la [guía de IAM para transacciones](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html) explica el alcance por tabla.

El siguiente comando cambia datos en las tablas de la cuenta y región configuradas. Pruébalo primero en un entorno de desarrollo con tablas de prueba. Guarda estas acciones en un archivo llamado `transact-items.json`:

```json
[
  {
    "Put": {
      "TableName": "Orders",
      "Item": {
        "orderId": { "S": "order-9001" },
        "productId": { "S": "SKU-42" },
        "quantity": { "N": "2" },
        "status": { "S": "PENDING" }
      },
      "ConditionExpression": "attribute_not_exists(#orderId)",
      "ExpressionAttributeNames": {
        "#orderId": "orderId"
      }
    }
  },
  {
    "Update": {
      "TableName": "Inventory",
      "Key": {
        "productId": { "S": "SKU-42" }
      },
      "UpdateExpression": "SET #stock = #stock - :qty",
      "ConditionExpression": "attribute_exists(#productId) AND #stock >= :qty",
      "ExpressionAttributeNames": {
        "#productId": "productId",
        "#stock": "stock"
      },
      "ExpressionAttributeValues": {
        ":qty": { "N": "2" }
      }
    }
  }
]
```

Genera un token distinto para este pedido y llama a la API:

```bash
CLIENT_REQUEST_TOKEN="$(python3 -c 'import uuid; print(uuid.uuid4())')"
aws dynamodb transact-write-items \
  --transact-items file://transact-items.json \
  --client-request-token "$CLIENT_REQUEST_TOKEN" \
  --return-consumed-capacity TOTAL
```

Si la solicitud termina con éxito, el pedido aparece en `Orders` y el inventario disminuye de forma conjunta. La condición `attribute_not_exists(#orderId)` impide reemplazar accidentalmente un pedido con la misma clave; la condición del inventario impide descontar stock inexistente o insuficiente. No hay dos acciones para el mismo elemento: una modifica `Orders` y la otra `Inventory`.

El token de cliente hace idempotente el reintento de esa solicitud. Si la respuesta se pierde o expira, conserva el mismo token y el mismo contenido de `transact-items.json` al reintentar: DynamoDB reconoce la solicitud repetida durante una ventana de **10 minutos**. Si reutilizas el token dentro de esa ventana pero cambias la solicitud, recibirás `IdempotentParameterMismatchException`; después de la ventana, el token se considera nuevo. En una aplicación, genera y guarda el token junto con el identificador de la operación para poder recuperarlo tras un timeout. La condición de clave única del pedido protege además frente a un segundo descuento si el mismo pedido se vuelve a procesar más adelante. Consulta las reglas de [idempotencia de `TransactWriteItems`](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html).

## Leer el pedido y el inventario como una instantánea

Si después necesitas mostrar ambos elementos con una vista coherente, guarda la siguiente lista en `read-items.json`:

```json
[
  {
    "Get": {
      "TableName": "Orders",
      "Key": {
        "orderId": { "S": "order-9001" }
      }
    }
  },
  {
    "Get": {
      "TableName": "Inventory",
      "Key": {
        "productId": { "S": "SKU-42" }
      }
    }
  }
]
```

Ejecuta la lectura transaccional:

```bash
aws dynamodb transact-get-items \
  --transact-items file://read-items.json
```

La respuesta contiene un resultado por cada acción `Get`, en el mismo orden. Si un elemento no existe, esa entrada no trae atributos; la lectura no crea el elemento. La operación sirve para mostrar una combinación coherente de estado del pedido e inventario, no para sustituir consultas por patrones de acceso ni para buscar elementos por atributos que no forman parte de sus claves.

## Capacidad y efecto en el costo

DynamoDB hace dos lecturas o escrituras internas por cada elemento transaccional: una para preparar la transacción y otra para confirmarla. Como referencia, una escritura transaccional de hasta 1 KB requiere **2 WCU** en modo aprovisionado —o unidades de escritura equivalentes en modo bajo demanda—; una lectura transaccional de hasta 4 KB requiere **2 RCU** —o unidades de lectura equivalentes—. Los elementos mayores consumen más unidades según las reglas de redondeo de DynamoDB. Una transacción cancelada también consume capacidad por las acciones que intentó ejecutar. AWS explica el [cálculo de capacidad para transacciones](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html) y el consumo general en [lecturas y escrituras](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html).

Las transacciones no necesitan un cargo fijo por activarse: el costo viene de las lecturas y escrituras que realizan y del modo de capacidad de las tablas e índices afectados. Por eso, si solo necesitas modificar un elemento con una condición, una llamada normal a `UpdateItem` puede ser suficiente. Reserva la transacción para reglas que realmente dependen de que varios elementos cambien juntos.

DynamoDB Accelerator (DAX) admite ambas APIs, pero no guarda localmente el resultado de `TransactGetItems`; esa operación pasa a DynamoDB. Las escrituras `TransactWriteItems` también pasan por DynamoDB y DAX puede hacer lecturas transaccionales adicionales para llenar su caché. Mide el efecto sobre latencia y capacidad antes de añadir DAX a una carga transaccional; no presupongas que acelerará esas llamadas.

## Cómo diagnosticar una transacción cancelada

`TransactionCanceledException` significa que la solicitud transaccional completa se canceló, pero no identifica por sí sola la causa de negocio. AWS documenta `CancellationReasons` en el orden de las acciones de `TransactItems`; la propiedad no está disponible igual en todos los lenguajes, así que confirma que tu SDK la exponga antes de basar la lógica en ella. Puedes distinguir, entre otros casos, una condición que no se cumplió, un conflicto con otra escritura o capacidad insuficiente.

| Motivo de cancelación | Qué revisar |
| --- | --- |
| Condición no satisfecha | Decide si el pedido ya existe, falta stock o cambió el estado esperado. No repitas la solicitud sin releer o recalcular la operación. |
| `TransactionConflict` | Otra transacción o escritura individual está usando el mismo elemento. Reduce la contención o vuelve a intentar con espera exponencial acotada y variación aleatoria (*jitter*). |
| Capacidad o throttling | Revisa el motivo de throttling y la tabla o índice que aparece en la excepción; ajusta la capacidad o la carga si corresponde. |
| Error de validación | Corrige la solicitud, la tabla o la clave antes de volver a enviarla. |

Los SDK de AWS no reintentan automáticamente una `TransactionCanceledException`. La nota del [API Reference de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/dynamodb-api.pdf) documenta `CancellationReasons` para Java e indica que la propiedad no se establece para otros lenguajes; la guía general de transacciones presenta los motivos sin esa limitación. Confirma la disponibilidad en el SDK que usas. Si no expone los motivos, usa el código y mensaje de error disponibles, además de los registros y métricas. Trata una condición falsa como un resultado de negocio, no como un error temporal; para conflictos concurrentes, implementa reintentos limitados con espera exponencial y *jitter*. Si la respuesta indica throttling, consulta sus detalles y las métricas de DynamoDB, incluida `TransactionConflict`. La guía de AWS cubre el [manejo de conflictos transaccionales](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html) y la [resolución de errores y reintentos](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html).

No confundas un conflicto con una condición rechazada. El conflicto puede ser transitorio; una condición rechazada suele indicar que el estado actual ya no cumple la regla, por lo que reintentar exactamente lo mismo repetirá la cancelación. Usa la respuesta y el estado vigente para decidir si corresponde informar el resultado, leer otra vez o construir una nueva solicitud con un nuevo token. Un `AccessDeniedException` es distinto: señala permisos IAM insuficientes y no es un motivo de `TransactionCanceledException`; revisa los permisos de las acciones y tablas implicadas.

## Recursos y comunidades en español

Para repasar el modelo del servicio antes de trabajar con transacciones, mira la charla [Introducción a AWS DynamoDB, de Charlas Técnicas de AWS](https://www.youtube.com/watch?v=ybG2Qnucmts). Para ampliar el contexto sobre diseño de datos, el [AWS User Group Córdoba Meetup #18](https://www.youtube.com/watch?v=7Xk0MKt69Is) incluye una charla sobre DynamoDB y OpenSearch. Ambos son grabaciones de comunidad, no referencias para verificar límites actuales; usa la documentación de AWS enlazada en esta guía para las cuotas y el comportamiento de las APIs.

Si primero quieres preparar un entorno de práctica local con Docker, DynamoDB Local y AWS CLI, la guía [De lo local se aprende: una app con Docker y DynamoDB Local](https://blog.295devops.com/de-lo-local-se-aprende-desplegando-tu-primera-app-con-docker-y-dynamodb-local) muestra ese flujo sin una cuenta de AWS ni infraestructura en la nube.

El canal [Cloud en Español](https://www.youtube.com/channel/UCjMLZUU8ep124ZZT-W2X4uA) reúne videos y encuentros en línea sobre temas AWS variados. Si quieres compartir un caso o buscar encuentros locales, puedes consultar [AWS User Group Córdoba en Meetup](https://www.meetup.com/aws-user-group-cordoba-argentina/) o encontrar un grupo de tu país en el [directorio de comunidades AWS](/comunidades/). Para revisar próximas charlas, talleres y su modalidad, visita la [agenda de eventos](/eventos/); las actividades disponibles cambian con el tiempo.
