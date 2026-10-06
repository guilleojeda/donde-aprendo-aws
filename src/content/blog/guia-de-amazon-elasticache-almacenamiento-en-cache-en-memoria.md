---
title: "Amazon ElastiCache: motores, caché y conexión segura"
description: "Aprende cuándo usar ElastiCache y elegir Valkey, Redis OSS o Memcached. Incluye Serverless, nodos, TTL, conexión segura y costos."
author: "guille-ojeda"
publishedAt: "2024-05-08"
publishedTimestamp: "2024-05-08T04:19:02.817Z"
modifiedTimestamp: "2026-10-06T16:00:55-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Caché en AWS serverless: patrones, TTL y costos"
    url: "https://dondeaprendoaws.com/blog/estrategias-de-cache-rentables-para-apps-serverless/"

---

Amazon ElastiCache es un servicio administrado para crear una caché o un almacén de datos distribuido en memoria con **Valkey, Redis OSS o Memcached**. La aplicación consulta el caché mediante el cliente de ese motor; ElastiCache no intercepta ni acelera automáticamente las consultas a una base de datos. Antes de añadirlo, comprueba que las lecturas se repiten, que puedes tolerar una ventana de datos desactualizados y que el ahorro de trabajo en el origen compensa otra conexión, otro costo y otra pieza que operar. [La guía de AWS presenta el servicio y sus motores](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html).

## Elige el motor y el tipo de despliegue

Son dos decisiones distintas: el **motor** define el protocolo y las operaciones disponibles; el **despliegue** define cuánto control tendrás sobre la capacidad y los nodos.

| Motor | Cuándo evaluarlo | Qué comprobar |
| --- | --- | --- |
| Valkey | Si tu aplicación puede usar un cliente compatible y quieres evaluar las funciones y versiones disponibles en ElastiCache. | Compatibilidad de comandos, tipo de despliegue y versión. Valkey y Redis OSS comparten una parte importante del ecosistema de clientes, pero no supongas que toda función existe en todas las versiones. |
| Redis OSS | Si ya dependes de sus clientes o de comandos específicos y quieres conservar ese contrato. | Comandos admitidos por ElastiCache, modo de clúster y versión del motor. |
| Memcached | Para una caché sencilla de objetos con claves y valores, cuando te sirve su modelo y el uso de varios hilos por nodo. | No ofrece el mismo conjunto de estructuras y capacidades de clúster que Valkey o Redis OSS. Revisa la tabla de funciones antes de elegirlo. |

AWS compara [los motores y sus capacidades](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/SelectEngine.html) y mantiene una lista de [comandos admitidos y restringidos](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/SupportedCommands.html). Si migras una aplicación existente, prueba las operaciones que realmente usa: la compatibilidad del cliente por sí sola no demuestra que cada comando esté disponible.

Después, elige el despliegue:

| Despliegue | Tiene sentido cuando | Costos de operación |
| --- | --- | --- |
| Serverless | Estás empezando o la demanda cambia y prefieres que AWS gestione el escalado de capacidad. | No dimensionas nodos, pero pagas por datos guardados y solicitudes. Para Valkey o Redis OSS, el cliente debe admitir modo de clúster habilitado. |
| Clúster con nodos | Puedes estimar la carga o necesitas controlar el tipo y la cantidad de nodos, su ubicación y el diseño del clúster. | Debes observar la capacidad y ajustar los nodos. La facturación depende de cada nodo y de cuánto tiempo permanece activo. |

Consulta la [comparación vigente entre Serverless y nodos](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.deployment.html) antes de escoger. Las versiones compatibles y algunas funciones varían según el motor y el despliegue.

Como complemento a la opción Serverless, mira la charla [RoxsFest: Amazon ElastiCache Serverless](https://www.youtube.com/watch?v=zn_k5AZcPNA), con Odina Jacobs, sobre el uso y el rendimiento del servicio.

Una caché clásica suele guardar datos que la aplicación puede reconstruir desde otra fuente. Eso no significa que cada configuración de ElastiCache sea siempre efímera: **Valkey 9.0 en un clúster con nodos puede habilitar durabilidad** mediante un registro transaccional Multi-AZ. Es una configuración específica, no disponible en Serverless, con garantías y costos propios; si la aplicación no puede reconstruir los datos, evalúa [la función de durabilidad](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/durability.html), sus [limitaciones](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Durability.Limitations.html) y los requisitos antes de tratar el servicio como almacén principal.

Para escuchar una conversación más amplia sobre ElastiCache junto a sus fuentes de datos, la comunidad AWS Women Colombia publicó en 2021 [Ataque del Nivel 200: Amazon RDS, Amazon Aurora y Amazon ElastiCache](https://www.youtube.com/watch?v=5xlrzYNEFs0). Es una grabación histórica para conocer experiencias, no una referencia para configurar versiones actuales.

## Patrón cache-aside: leer, cargar y expirar

En *cache-aside*, la aplicación decide cuándo consultar el caché y cuándo acudir a la fuente de verdad:

1. Construye una clave que identifique el dato y cada dimensión que cambie la respuesta. Por ejemplo, `producto:v1:tienda-42:sku-381`.
2. Busca esa clave en ElastiCache. Si existe, devuelve el valor guardado.
3. Si no existe, lee el producto de la base de datos, guarda el resultado con un TTL y responde al usuario.
4. Después de confirmar una actualización en la base, invalida la clave correspondiente. El siguiente lector volverá a cargar el valor desde el origen.

El TTL limita cuánto tiempo queda una entrada antes de expirar; **no sincroniza** el caché con la base. Elígelo según la antigüedad máxima que tolera el producto: una descripción de catálogo puede admitir más demora que una existencia o un permiso. Si la invalidación falla, el dato viejo podría seguir apareciendo hasta el vencimiento. Un lector concurrente también puede volver a cargar un valor antiguo justo después de que otra solicitud lo haya borrado; para requisitos estrictos de actualidad, coordina lecturas y escrituras o evita servir ese dato desde caché.

Incluye en la clave el tenant, la versión, el idioma u otros atributos que alteren el resultado. Obtén el identificador del tenant de la identidad autenticada y limita también la consulta al origen con ese identificador. Si dos usuarios no deben compartir la misma respuesta, no uses una clave global. Si los identificadores pueden contener el separador elegido, codifica cada componente de forma inequívoca.

Cuando el caché no responde, puedes continuar con la base solo si esta soporta las lecturas adicionales; ante una caída, el desvío de muchas solicitudes puede sobrecargarla. Define timeouts cortos, registra aciertos, fallos y errores de conexión, y maneja como fallo de caché únicamente los errores de red previstos. La explicación de [caché-aside, TTL e invalidación de AWS](https://aws.amazon.com/blogs/database/building-resilient-applications-design-patterns-for-handling-database-outages/) describe el mismo flujo. Para comparar otras capas, consulta también [la guía de caché en aplicaciones serverless](/blog/estrategias-de-cache-rentables-para-apps-serverless/), que cubre Lambda, API Gateway, CloudFront y DAX.

## Conexión, TLS y autenticación

Para un endpoint privado de VPC, ejecuta el cliente en una red con ruta al caché y permite en el grupo de seguridad del caché solo el tráfico TCP que necesite el grupo de seguridad de la aplicación. No abras el puerto a cualquier origen. Usa el nombre DNS del endpoint que entrega ElastiCache; la dirección IP subyacente puede cambiar. Los puertos predeterminados son **6379** para Valkey o Redis OSS y **11211** para Memcached. Serverless de Valkey o Redis OSS utiliza **6379** para el endpoint principal y **6380** para el endpoint de lectura; algunos clientes intentan conectar a ambos. Confirma puertos y rutas en la [guía de conectividad persistente](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/TroubleshootingConnections.html).

El cifrado en tránsito está activado en Serverless. En clústeres con nodos, habilítalo según el motor, la versión y el tipo de clúster; configura también el cliente para usar TLS. La [guía de TLS de ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html) detalla compatibilidad y restricciones. Como excepción, AWS documenta [endpoints públicos para cachés Serverless de Valkey 9.0 o posterior](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/serverless-public-endpoints-chapter.html); [conectarse a uno requiere IAM y TLS 1.3](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/connecting-public-endpoint.html). No presupongas que Redis OSS o Memcached ofrecen la misma opción.

Para Valkey y Redis OSS, configura usuarios y permisos mediante RBAC. La autenticación con IAM está disponible con Valkey 7.2 o posterior y Redis OSS 7.0 o posterior, requiere TLS y usa tokens temporales; en conexiones duraderas, el cliente debe renovar las credenciales. Consulta [autenticación con IAM](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/auth-iam.html) y aplica la opción de autenticación que corresponda al motor elegido. Guarda las credenciales fuera del código y verifica tanto el acceso de red como los permisos del usuario.

Si una conexión falla, revisa primero el endpoint, la región, la VPC o ruta, los grupos de seguridad, el puerto y TLS. Luego confirma credenciales y permisos. Si aparece `CROSSSLOT`, comprueba que el cliente admita modo de clúster y que las operaciones con varias claves respeten las ranuras del clúster. La [guía de resolución de problemas de ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/wwe-troubleshooting.html) reúne causas y pasos de diagnóstico.

## Mide el resultado y el costo

Una tasa alta de aciertos no prueba por sí sola que la caché convenga. Compara, con tráfico parecido, la latencia p50/p95 de la aplicación, lecturas y carga del origen, errores, tamaño guardado, solicitudes y costo total. En CloudWatch, revisa aciertos y fallos; para Serverless de Valkey o Redis OSS también puedes consultar `BytesUsedForCache`, `ElastiCacheProcessingUnits` y latencias del servicio. Estas últimas miden el tramo interno de ElastiCache, no el tiempo de red entre tu aplicación y el endpoint. AWS describe esas señales en [métricas de cachés Serverless](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/serverless-metrics-events-redis.html) y [métricas de ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/CacheMetrics.html).

| Opción | Qué se cobra principalmente |
| --- | --- |
| Serverless | Datos almacenados en GB-hora y solicitudes en unidades ECPU, que consideran procesamiento y datos transferidos. La página actual indica un mínimo medido de 100 MB por caché para Valkey y 1 GB para Redis OSS o Memcached. |
| Nodos bajo demanda | Tipo y número de nodos por hora. El precio cambia por motor, tamaño y región; otras opciones de precio pueden cambiar la tarifa. |

Copias de seguridad y transferencias pueden modificar el total. Estima con la [página de precios de ElastiCache](https://aws.amazon.com/elasticache/pricing/) y su calculadora para la región, el motor, los bytes por solicitud y la carga prevista. Las tarifas y mínimos cambian; no tomes Serverless como automáticamente más barato que un nodo o que consultar directamente el origen.

Al terminar una práctica, detén la aplicación y comprueba la cuenta, región y nombre del recurso en la consola de ElastiCache antes de borrarlo. Elige el motor y el recurso exactos (caché Serverless, clúster o grupo de replicación), abre **Actions → Delete** y revisa el diálogo de confirmación. El borrado no se puede cancelar una vez iniciado; decide antes si necesitas una copia final. La guía de AWS explica cómo [limpiar una caché Serverless](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/read-write-cleanup-mem.html), [borrar un grupo de replicación](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Replication.DeletingRepGroup.html) y [borrar un clúster Valkey o Redis OSS desde la consola](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Clusters.Delete-gs.redis.html). Para una caché independiente, consulta también [el procedimiento de borrado del clúster](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Clusters.Delete.html). Revisa las copias manuales: pueden conservarse después de borrar ciertos clústeres y se eliminan por separado.

## Recursos y comunidades para continuar

La [guía oficial para empezar con ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/GettingStarted.html) enlaza tutoriales de Python y de acceso desde Lambda en una VPC. Antes de aprovisionar recursos, revisa el precio y el apartado de limpieza del tutorial.

Puedes seguir las sesiones técnicas de AWS Women Colombia en su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw); la grabación sobre RDS, Aurora y ElastiCache aparece junto al contexto de motores más arriba.

Para preguntar, compartir una decisión de diseño o encontrar una actividad local, explora el [directorio de comunidades AWS](/comunidades/) y la [agenda de eventos](/eventos/). El portal de [AWS User Group Perú](https://awsugperu.cloud/) publica sus grupos locales, Cloud Clubs, actividades y recursos; confirma allí qué encuentros siguen vigentes. La comunidad [AWS Women Colombia](https://awswomencolombia.com/) comparte eventos, experiencias y material técnico en español.

## Preguntas frecuentes

### ¿ElastiCache reemplaza a la base de datos?

En el patrón de caché descrito aquí, no: la base conserva la fuente de verdad y la aplicación puede reconstruir las entradas vencidas o ausentes. Valkey 9.0 con durabilidad habilitada es una opción distinta; no la confundas con una caché cache-aside sin persistencia.

### ¿Qué conviene: ElastiCache Serverless o nodos?

Serverless reduce el trabajo de dimensionar capacidad y sigue la demanda, con costo por datos y solicitudes. Un clúster con nodos ofrece más control sobre hardware y topología y requiere planificar la capacidad. Compara el costo y el rendimiento con las métricas de tu carga antes de decidir.

### ¿Un TTL corto evita todos los datos desactualizados?

No. Reduce el tiempo máximo habitual que una entrada permanece guardada, pero una actualización también debe invalidar o versionar las claves relacionadas. Considera fallos de invalidación y escrituras concurrentes al definir cuánta demora es aceptable.
