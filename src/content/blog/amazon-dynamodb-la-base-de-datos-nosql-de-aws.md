---
title: "Amazon DynamoDB: qué es, cómo funciona y cuándo usarlo"
description: "Entiende las claves de DynamoDB, aprende a consultar una tabla y evalúa cuándo conviene frente a una base de datos relacional."
author: "guille-ojeda"
publishedAt: "2024-01-31"
publishedTimestamp: "2024-01-31T00:13:19.305Z"
modifiedTimestamp: "2026-10-05T00:04:02-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/b55473f49a3eacffcaae0175.jpg"
coverAlt: "Cilindro de base de datos conectado a varios cilindros más pequeños"
ogImage: "/assets/blog/b55473f49a3eacffcaae0175.jpg"
related: []
---

Amazon DynamoDB es una base de datos NoSQL administrada por AWS que almacena datos como pares clave-valor y documentos. Para usarla bien, primero hay que decidir qué preguntas hará la aplicación y luego elegir claves que permitan responderlas con consultas directas. [La documentación oficial presenta sus modelos y capacidades](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html).

Esta guía explica las piezas básicas con un ejemplo de pedidos, muestra cuándo usar `Query` o `Scan` y resume los límites y costos que conviene considerar antes de elegir DynamoDB.

## Tablas, elementos y atributos

DynamoDB organiza los datos en **tablas**. Cada tabla guarda **elementos** —similares a registros— y cada elemento tiene **atributos** —sus datos—. Por ejemplo, un elemento de una tabla de pedidos podría incluir un identificador de cliente, una fecha, un estado y un total.

No hace falta definir por adelantado todos los atributos de cada elemento: dos elementos de una tabla pueden tener atributos distintos. La excepción importante es la clave primaria: su estructura sí se define al crear la tabla. [AWS describe estos componentes y sus reglas](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html).

## La clave primaria determina cómo vas a consultar

Una tabla puede usar una clave primaria simple, formada por una **clave de partición**, o una clave compuesta, formada por una **clave de partición** y una **clave de ordenación**. La clave de partición identifica el grupo de datos que se busca. Cuando varios elementos comparten ese valor, la clave de ordenación los distingue y los ordena.

Conviene diseñar la tabla a partir de sus patrones de acceso: qué necesita leer o actualizar la aplicación. DynamoDB usa el valor de partición para ubicar los datos; los elementos con la misma clave de partición quedan organizados por su clave de ordenación. [La guía de modelado de AWS recomienda identificar primero esos patrones](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-modeling-nosql.html).

Imaginemos una tabla `Orders` con estos atributos de clave, ambos de tipo cadena:

| PK (partición) | SK (ordenación) | Otros atributos |
|---|---|---|
| `CUSTOMER#42` | `ORDER#2026-09-18#A120` | `status: "sent"`, `total: 58.40` |
| `CUSTOMER#42` | `ORDER#2026-09-25#A138` | `status: "processing"`, `total: 23.00` |
| `CUSTOMER#73` | `ORDER#2026-09-21#A129` | `status: "sent"`, `total: 91.10` |

Con esta forma, la aplicación puede responder “¿qué pedidos tiene el cliente 42?” usando el valor `CUSTOMER#42`. Si además usa el prefijo `ORDER#` en las claves de ordenación, puede pedir solo ese tipo de elemento. Los formatos con `#` son una convención de la aplicación; DynamoDB no les asigna un significado especial.

Si tu aplicación necesita agrupar varios tipos de elementos, el artículo de Brenda Galicia sobre [criterios para el diseño de una tabla única](https://dev.to/bardengalicia/simplicidad-y-eficiencia-desmitificando-el-diseno-de-una-sola-tabla-en-amazon-dynamodb-8oc) ofrece un siguiente tema de modelado. Es una lectura de 2023 sobre un patrón más avanzado: contrasta las decisiones con la guía actual de AWS y no asumas que una tabla única garantiza menor costo o mejor rendimiento. No hace falta adoptarlo para empezar con DynamoDB.

## `Query` y `Scan` resuelven problemas distintos

`Query` busca elementos con un valor de clave de partición específico. Puede acotar el resultado con una condición sobre la clave de ordenación. Por eso la consulta anterior se puede expresar así en AWS CLI, desde Bash o Zsh:

```sh
aws dynamodb query \
  --table-name Orders \
  --key-condition-expression "PK = :pk AND begins_with(SK, :prefix)" \
  --expression-attribute-values '{":pk":{"S":"CUSTOMER#42"},":prefix":{"S":"ORDER#"}}'
```

El comando supone que ya existe `Orders` con `PK` como clave de partición y `SK` como clave de ordenación, ambas de tipo cadena, en la Región activa de la CLI. También requiere credenciales configuradas y permiso de lectura `dynamodb:Query`. La igualdad de la partición es obligatoria; `begins_with` limita el rango de la clave de ordenación. [AWS documenta esta expresión y ejemplos de AWS CLI](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.KeyConditionExpressions.html).

`Scan`, en cambio, examina los elementos de una tabla o índice. Puede aplicar un filtro para devolver solo los elementos que cumplen una condición, pero ese filtro se ejecuta después de leerlos y no reduce la capacidad de lectura consumida. Por eso suele reservarse para tareas puntuales o tablas pequeñas; para una ruta habitual de la aplicación, diseña una clave que permita `Query`. [La documentación de `Scan` explica el costo de filtrar después de la lectura](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html).

Cada respuesta de `Query` puede contener hasta 1 MB. Si hay más resultados, la API y los SDK permiten continuar la paginación; la AWS CLI la maneja automáticamente de forma predeterminada. [Más detalles sobre la paginación](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.Pagination.html).

### ¿Qué pasa si necesitas otra forma de buscar?

Si también necesitas consultar pedidos por un atributo alternativo —por ejemplo, por `status`—, puedes evaluar un índice secundario. Un índice global secundario (GSI) permite consultar con otra clave; DynamoDB lo mantiene al día de forma asíncrona, así que sus lecturas son eventualmente consistentes. Los índices añaden almacenamiento y actividad de escritura, y una capacidad de escritura insuficiente en un GSI puede afectar escrituras de la tabla. [Revisa cómo funcionan los GSI antes de agregarlos](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html).

Si prefieres empezar en tu equipo, [esta guía en español ejecuta una aplicación con Docker y DynamoDB Local](https://blog.295devops.com/de-lo-local-se-aprende-desplegando-tu-primera-app-con-docker-y-dynamodb-local). Requiere Docker y Python; sus pasos describen un ejercicio local, no el despliegue de producción.

## Consistencia de lectura

Una lectura eventualmente consistente —la opción predeterminada— puede no reflejar de inmediato una escritura reciente. Cuando la aplicación necesita leer la versión más reciente, puede solicitar una lectura fuertemente consistente sobre una tabla o un índice local secundario (LSI). Los GSI no admiten lecturas fuertemente consistentes. Esto importa, por ejemplo, si la interfaz vuelve a leer un pedido justo después de actualizarlo. [AWS detalla qué operaciones admiten cada opción](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html).

DynamoDB también ofrece PartiQL, un lenguaje compatible con parte de SQL. Eso no lo convierte en una base relacional: no admite `JOIN`, y una consulta sin una condición adecuada de clave puede terminar en un escaneo. Si una aplicación depende de joins entre tablas, considera una base relacional como Amazon RDS y compara el diseño completo antes de decidir. [La guía de AWS compara la lectura relacional con DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SQLtoNoSQL.ReadData.html). Para analizar informes sobre conjuntos de datos preparados, consulta [cuándo puede encajar Amazon Redshift](/blog/amazon-redshift-el-poder-del-data-warehousing-en-aws/).

Para otra perspectiva sobre la diferencia entre consultas de DynamoDB y joins relacionales, escucha la grabación comunitaria [DynamoDB 101: ¿dónde está mi JOIN?](https://www.youtube.com/watch?v=kttKpUpyAH4), publicada por AWS User Group Ecuador.


## Límites y costos que conviene conocer

Un elemento no puede superar los **400 KB**; el tamaño incluye tanto los nombres como los valores de sus atributos. Si cada registro crece más que eso, hay que replantear qué guardar en el elemento y qué almacenar en otro servicio. [Consulta la lista oficial de cuotas y restricciones](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html).

Al crear una tabla eliges entre dos modos de capacidad para lecturas y escrituras, según la carga y la forma de administrar el rendimiento. [AWS compara ambos modos de capacidad](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html):

- **Bajo demanda (on-demand):** pagas por las solicitudes realizadas y no defines de antemano el rendimiento de lectura y escritura. Puede servir para comenzar o para cargas variables.
- **Aprovisionado (provisioned):** defines capacidad de lectura y escritura, y pagas por la capacidad aprovisionada. Puede ser adecuado cuando el patrón de uso es estable y puedes estimarlo.

En ambos casos, el precio también depende del almacenamiento y de las funciones que habilites, como índices, copias de seguridad o replicación. Región, tamaño de los elementos y consistencia de lectura también influyen en el uso facturable. No hay un precio único por “tener DynamoDB”: revisa la [página oficial de precios](https://aws.amazon.com/dynamodb/pricing/) y estima tu carga antes de crear recursos.

## ¿Cuándo tiene sentido elegir DynamoDB?

DynamoDB puede encajar cuando puedes describir con claridad las búsquedas que hará la aplicación y resolverlas con claves e índices. Por ejemplo, guardar una sesión, leer el carrito de un cliente por identificador o consultar los pedidos de un cliente por fecha.

Considera otra base cuando necesitas hacer muchas preguntas nuevas sobre los datos sin conocerlas de antemano, combinar tablas con `JOIN` o ejecutar informes relacionales frecuentes. DynamoDB puede escalar con cargas grandes, pero esa capacidad no compensa un modelo que obliga a escanear datos para las consultas principales.

Una decisión útil empieza con una lista concreta: qué elementos se leen, cuáles se escriben, por qué clave se buscan y con qué frecuencia. Luego modela esas operaciones, estima el tamaño y el costo, y comprueba que la aplicación puede responder a cada pregunta sin depender de escaneos habituales.

## Recursos para seguir aprendiendo

Para practicar el concepto de clave primaria en una cuenta de AWS, el [séptimo laboratorio de esta guía de diez prácticas](/blog/10-laboratorios-practicos-de-aws-para-principiantes/) crea una tabla pequeña y recupera un elemento por su clave. Allí también se explican los permisos, posibles costos y la limpieza de recursos.

Para escuchar una conversación sobre modelado, mira la [grabación del meetup #18 del AWS User Group Córdoba](https://www.youtube.com/watch?v=7Xk0MKt69Is), que incluye una sesión sobre diseño de datos en DynamoDB. El [grupo de AWS en Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) es una comunidad más amplia para compartir experiencias sobre AWS y nube; desde su perfil puedes consultar sus actividades. También puedes explorar [comunidades AWS por país](/comunidades/) y revisar la [agenda de eventos](/eventos/) para encontrar otras charlas y encuentros.