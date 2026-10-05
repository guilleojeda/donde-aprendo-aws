---
title: "Amazon DynamoDB para principiantes: claves y consultas"
description: "Aprende qué es DynamoDB, cómo elegir claves e índices y cuándo usar Query o Scan. Practica con AWS CLI y DynamoDB Local sin crear recursos en AWS."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T02:31:39.789Z"
modifiedTimestamp: "2026-10-05T00:15:07-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related: []
---

Amazon DynamoDB es una base de datos NoSQL administrada por AWS. Para usarla bien, primero hay que pensar qué consultas hará la aplicación y luego elegir las claves que las resuelvan. En esta guía vas a modelar una tabla pequeña de pedidos, consultarla y probar sus operaciones en una instancia local.

## Qué es DynamoDB y cuándo conviene

DynamoDB almacena datos en tablas; cada tabla reúne elementos (ítems) compuestos por atributos. Es una base de datos NoSQL de clave-valor y documentos: los atributos de dos ítems pueden variar, pero la clave primaria de la tabla debe estar definida. AWS administra la infraestructura del servicio; el diseño de los datos y las consultas sigue siendo responsabilidad de quien construye la aplicación. La [documentación de componentes de DynamoDB](https://docs.aws.amazon.com/es_es/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html) explica estas piezas y cómo se identifican los ítems.

Puede ser una buena opción cuando conoces las consultas principales de antemano y necesitas obtener ítems por su clave con rendimiento predecible. Si la aplicación depende de joins, filtros arbitrarios o reportes que cambian continuamente, una base de datos relacional puede resultar más natural. NoSQL no significa que no haya que diseñar un esquema: significa que conviene diseñarlo alrededor de los accesos que necesitas. AWS explica ese proceso en su guía para [modelar datos y patrones de acceso](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling.html).

Si buscas más material en español, el [directorio de creadores, canales, blogs y podcasts](/creadores/) permite explorar fuentes por tema, incluidos Datos y Serverless.

## Clave de partición y clave de ordenación

Una tabla puede usar una clave primaria simple o una compuesta:

- **Clave de partición** (*partition key*): identifica un grupo de ítems y ayuda a distribuirlos. Elige un atributo con valores diversos y evita concentrar todo el tráfico en un único valor.
- **Clave de ordenación** (*sort key*, opcional): ordena los ítems dentro del grupo y permite consultar un rango o un prefijo de valores.

Tomemos una aplicación que necesita listar los pedidos de cada cliente y los pedidos de un mes. Podemos definir `clienteId` como clave de partición y `fechaPedido` como clave de ordenación. El valor de `fechaPedido` combina una fecha ISO 8601 en UTC con el identificador del pedido, para que dos pedidos del mismo cliente no choquen si tienen la misma hora.

| clienteId (partición) | fechaPedido (ordenación) | estado | total |
| --- | --- | --- | ---: |
| `cliente-42` | `2026-10-03T14:30:00Z#ped-9001` | enviado | 79.90 |
| `cliente-42` | `2026-10-04T18:30:00Z#ped-9002` | preparando | 24.00 |
| `cliente-77` | `2026-10-04T10:00:00Z#ped-9003` | enviado | 18.00 |

La clave primaria completa es la combinación de `clienteId` y `fechaPedido`. Los dos primeros pedidos comparten la clave de partición y se distinguen por su clave de ordenación. Al guardar las fechas con el mismo formato UTC, los valores se ordenan cronológicamente como texto.

Antes de crear una tabla para producción, anota cada consulta que la aplicación necesita. Si también necesitas encontrar pedidos por `estado` entre todos los clientes, la tabla del ejemplo no alcanza: podrías crear un índice secundario global (GSI) cuya clave de partición sea `estado` y cuya clave de ordenación sea `fechaPedido`. Un índice mantiene otra vista de los datos, por lo que agrega almacenamiento y trabajo de escritura. No lo agregues sin un patrón de acceso que lo necesite.

Para profundizar en otro patrón, [Brenda Galicia explica el diseño de una sola tabla en DynamoDB](https://dev.to/bardengalicia/simplicidad-y-eficiencia-desmitificando-el-diseno-de-una-sola-tabla-en-amazon-dynamodb-8oc). Es una opción que puedes evaluar según las consultas de tu aplicación; no es un requisito para todas las tablas.

## Query y scan: consultar por clave o recorrer la tabla

`GetItem` recupera un ítem cuando conoces todos los valores de su clave primaria. `Query` recupera ítems que comparten un valor de clave de partición y, si hay clave de ordenación, admite una condición sobre ella. Para el ejemplo, `Query` puede traer los pedidos de `cliente-42` cuyo valor de `fechaPedido` empieza con `2026-10-`.

`Scan` recorre todos los ítems de una tabla o un índice. Puede ser útil para una comprobación ocasional sobre una tabla chica, pero no sustituye una consulta diseñada para el uso normal de la aplicación. Un filtro de `Query` o `Scan` se aplica después de leer la página: elimina elementos de la respuesta, pero no reduce la capacidad consumida por los ítems evaluados. Una operación `Query` o `Scan` devuelve hasta 1 MB y puede requerir paginación. Consulta la referencia de AWS sobre [Query](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html) y [Scan](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html) antes de diseñar consultas frecuentes.

Los índices secundarios resuelven otros patrones de consulta. Un GSI puede tener una clave de partición y una de ordenación distintas de las de la tabla. Un índice secundario local (LSI) comparte la clave de partición de la tabla y cambia la de ordenación; solo puedes definirlo al crear la tabla. En el ejemplo, `estado` tiene pocos valores posibles y un GSI con esa clave puede concentrar lecturas y escrituras en pocos valores de clave. El modelo es didáctico: antes de llevarlo a producción, revisa la distribución de lecturas y escrituras y elige una clave acorde a la carga.

| Lectura | Consistencia fuerte disponible |
| --- | --- |
| Tabla | Sí, si la solicitas; por defecto es eventual. |
| LSI | Sí, si la solicitas. |
| GSI | No; solo admite lectura eventual. |

La [guía de índices secundarios](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SecondaryIndexes.html) detalla además su capacidad y sus atributos proyectados. Las tablas globales actuales tienen dos modos de consistencia: MREC, con replicación eventual y predeterminado, y MRSC, con consistencia fuerte entre regiones compatibles y mayor latencia de escritura. MRSC no admite TTL ni LSI; revisa la [guía vigente de tablas globales](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_HowItWorks.html) antes de elegir una arquitectura multirregión.

## Capacidad, límites y costos

DynamoDB ofrece dos modos de capacidad de lectura y escritura:

| Modo | Cómo se cobra | Cuándo evaluarlo |
| --- | --- | --- |
| Bajo demanda (*on-demand*) | Por las unidades de solicitud de lectura y escritura utilizadas. | Cuando el tráfico es nuevo o difícil de prever. |
| Aprovisionado (*provisioned*) | Por la capacidad de lectura y escritura configurada, por hora. El autoescalado puede ajustar esa capacidad. | Cuando el tráfico es estable y se puede estimar. |

Ningún modo garantiza por sí solo el menor costo. El total también depende del tamaño y la frecuencia de las lecturas y escrituras, los índices, el almacenamiento, la clase de tabla, la región, los respaldos y la replicación. Compara la carga real con la [página de precios de DynamoDB](https://aws.amazon.com/dynamodb/pricing/) y sus condiciones actuales; AWS resume cuándo usar cada modo en su guía de [capacidad bajo demanda y aprovisionada](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html).

AWS también ofrece Database Savings Plans para DynamoDB. La página de precios publica descuentos de hasta 18% para throughput bajo demanda y hasta 12% para throughput aprovisionado, sujetos a un compromiso de uso elegible medido en USD por hora durante un año. El porcentaje máximo no es un descuento garantizado sobre toda la factura: el uso que supera el compromiso no recibe el descuento del plan y se factura según las tarifas del modo de capacidad elegido. El descuento de Database Savings Plans tampoco se combina con capacidad reservada de DynamoDB para el mismo uso. Revisa las [condiciones y tarifas de Database Savings Plans](https://aws.amazon.com/savingsplans/database-pricing/) y la [guía sobre compromisos y descuentos en AWS](/blog/ahorro-de-costos-en-aws-con-instancias-reservadas-y-savings-plans/) antes de estimar un ahorro.

Cada ítem de DynamoDB admite hasta **400 KB**, incluidos los nombres y valores de sus atributos. Para imágenes u otros archivos grandes, guarda el objeto en Amazon S3 y conserva en el ítem una referencia; AWS describe este [patrón para datos grandes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-use-s3-too.html). El límite completo está en la lista de [cuotas y restricciones de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html).

### TTL y respaldos

Time to Live (TTL) sirve para marcar ítems que ya no deberían conservarse, como sesiones o datos temporales. El atributo de vencimiento debe ser un número con una fecha Unix en segundos. DynamoDB borra el ítem en segundo plano —normalmente dentro de unos días—, así que un elemento vencido puede seguir apareciendo en lecturas mientras espera ser eliminado. Si la aplicación debe dejar de usarlo en el instante del vencimiento, comprueba esa fecha en la lectura; no dependas de TTL como borrado inmediato. Consulta la documentación de [TTL y los ítems vencidos](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html).

TTL no es un respaldo. La recuperación a un momento dado (PITR) mantiene respaldos continuos cuando se habilita, con una ventana configurable de hasta 35 días. Una restauración crea una tabla nueva. Revisa [PITR](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html), [cómo se restaura una tabla](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-pitr-recovery-table-restore.html) y sus cargos antes de depender de esta protección.

## Practica con AWS CLI sin crear recursos en AWS

Puedes probar el modelo anterior con DynamoDB Local. El ejercicio usa Docker, AWS CLI, credenciales ficticias y un endpoint en tu máquina; cada comando de AWS CLI apunta expresamente a `localhost`. No quites `--endpoint-url` ni reemplaces las credenciales locales en este ejemplo.

Inicia el contenedor local:

```bash
docker run --rm -d --name dynamodb-local-tutorial \
  -p 127.0.0.1:8000:8000 amazon/dynamodb-local
```

En esa misma terminal, configura valores locales ficticios para AWS CLI:

```bash
export AWS_ACCESS_KEY_ID=local
export AWS_SECRET_ACCESS_KEY=local
export AWS_DEFAULT_REGION=us-east-1
```

Crea la tabla. `PAY_PER_REQUEST` define el modo de capacidad de la tabla local; el endpoint mantiene las llamadas en DynamoDB Local.

```bash
aws dynamodb create-table \
  --table-name Pedidos \
  --attribute-definitions \
    AttributeName=clienteId,AttributeType=S \
    AttributeName=fechaPedido,AttributeType=S \
  --key-schema \
    AttributeName=clienteId,KeyType=HASH \
    AttributeName=fechaPedido,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url http://localhost:8000
```

Agrega dos pedidos del mismo cliente:

```bash
aws dynamodb put-item \
  --table-name Pedidos \
  --item '{
    "clienteId": {"S": "cliente-42"},
    "fechaPedido": {"S": "2026-10-03T14:30:00Z#ped-9001"},
    "estado": {"S": "enviado"},
    "total": {"N": "79.90"}
  }' \
  --endpoint-url http://localhost:8000

aws dynamodb put-item \
  --table-name Pedidos \
  --item '{
    "clienteId": {"S": "cliente-42"},
    "fechaPedido": {"S": "2026-10-04T18:30:00Z#ped-9002"},
    "estado": {"S": "preparando"},
    "total": {"N": "24.00"}
  }' \
  --endpoint-url http://localhost:8000
```

Consulta los pedidos del cliente para octubre. La condición usa la clave de partición y un prefijo de la clave de ordenación:

```bash
aws dynamodb query \
  --table-name Pedidos \
  --key-condition-expression \
    'clienteId = :c AND begins_with(fechaPedido, :mes)' \
  --expression-attribute-values '{
    ":c": {"S": "cliente-42"},
    ":mes": {"S": "2026-10-"}
  }' \
  --endpoint-url http://localhost:8000
```

Para borrar la tabla local y apagar el contenedor:

```bash
aws dynamodb delete-table \
  --table-name Pedidos \
  --endpoint-url http://localhost:8000
docker stop dynamodb-local-tutorial
```

AWS ofrece [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) para desarrollar y probar aplicaciones sin acceder al servicio web de DynamoDB. Esta práctica sirve para entender el modelo y el comando `Query`; no verifica cuotas, latencia, permisos IAM, costos ni replicación de una tabla real.

## Sigue aprendiendo con otras personas

Para ver DynamoDB en un producto serverless de comunidad, [Kiu y Sessionize: gestión de eventos en AWS User Groups](https://builder.aws.com/content/2s8GaGrxZZPB5KIoOOrlzJsXob2/kiu-y-sessionize-transformando-la-gesti-n-de-eventos-en-aws-user-groups) cuenta cómo un asistente para eventos integra DynamoDB con Lambda y Amazon Bedrock. Es un caso de arquitectura, no un tutorial de inicio.

También puedes conocer el grupo [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) y consultar sus encuentros, explorar **comunidades AWS por país y tipo de grupo** en el [directorio de comunidades](/comunidades/), o buscar **próximas charlas** en la [Agenda de eventos](/eventos/). Para seguir canales, blogs y podcasts en español, visita el [directorio de creadores](/creadores/); cada página enlaza sus destinos para que elijas el formato que te sirva.
