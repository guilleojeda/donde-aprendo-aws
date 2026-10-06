---
title: "Caché en AWS serverless: patrones, TTL y costos"
description: "Guía para elegir caché en Lambda, API Gateway, CloudFront, ElastiCache o DAX: TTL, claves por tenant, invalidación y medición de costos y latencia."
author: "guille-ojeda"
publishedAt: "2024-10-27"
publishedTimestamp: "2024-10-27T02:26:14.893Z"
modifiedTimestamp: "2026-10-06T14:19:21-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Amazon CloudFront: qué es, cómo funciona y cómo configurarlo"
    url: "https://dondeaprendoaws.com/blog/amazon-cloudfront-comprendiendo-el-cdn-de-aws/"
  - title: "Caché de autorizadores Lambda en API Gateway: TTL y permisos"
    url: "https://dondeaprendoaws.com/blog/cache-para-autorizadores-lambda-en-api-gateway/"

---

El caché puede reducir lecturas repetidas y el tiempo que una solicitud pasa esperando a un backend, pero agrega almacenamiento, llamadas de red y reglas para mantener los datos correctos. Conviene cuando se repiten consultas con una respuesta que puede reutilizarse durante un tiempo conocido. No existe un TTL ni un servicio que resulte siempre más rápido o barato: primero identifica qué trabajo quieres evitar y cuánto tiempo puede tolerarse una respuesta desactualizada.

## Elige la capa según los datos y el recorrido

| Opción | Úsala cuando | Qué debes tener en cuenta |
| --- | --- | --- |
| Navegador y CloudFront | Muchos usuarios piden los mismos archivos o respuestas públicas desde distintas ubicaciones. | La clave y los encabezados TTL determinan qué respuesta se comparte y durante cuánto tiempo. CloudFront tiene cargos propios; la privacidad depende también de la autorización de los lectores y de la política de caché. |
| Caché de respuestas de API Gateway | Quieres conservar respuestas repetidas de métodos GET en una REST API. | Se configura por etapa, se cobra por hora según capacidad y no está incluido en el nivel gratuito. API Gateway HTTP API no ofrece esta función de caché de respuestas. |
| Memoria o /tmp de Lambda | Una misma instancia puede reutilizar una configuración o un archivo estático. | Es una caché local por entorno de ejecución, no compartida entre instancias ni garantizada entre invocaciones. No guardes ahí estado de usuario o datos sensibles. |
| ElastiCache | Varias ejecuciones necesitan consultar una caché compartida, por ejemplo para claves de lectura frecuentes. | Añade una dependencia de red y su propia facturación. Compara Serverless y los clústeres con nodos para la carga real. |
| DynamoDB Accelerator (DAX) | La aplicación lee repetidamente datos de DynamoDB y puede aceptar las condiciones de consistencia de DAX. | Solo se integra con DynamoDB. Las lecturas fuertes pasan a DynamoDB y no quedan en caché; el caché de consultas tiene reglas de expiración distintas. |

La caché de respuestas de API Gateway es una función de **REST API**: por defecto almacena respuestas GET, el TTL predeterminado documentado es de 300 segundos y el máximo es de 3600. Es de mejor esfuerzo, se factura por hora según el tamaño del clúster y no reúne las condiciones del nivel gratuito. Compara los [precios actuales de API Gateway](https://aws.amazon.com/api-gateway/pricing/) para la región de uso. Revisa los contadores CacheHitCount y CacheMissCount para confirmar si realmente atiende solicitudes. La [guía de caché de REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html) y la [comparación entre REST API y HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html) detallan estas diferencias. Para estudiar configuración declarativa, el [ejemplo comunitario de API Gateway con CDK](https://github.com/hsaenzG/APIGatewayCacheImplementation-CDK) muestra caché por endpoint según su README; contrasta tipo de API y versión de CDK antes de adaptar el código.

No confundas esa caché de respuestas con la caché del resultado de un Lambda authorizer. Una conserva la respuesta de la integración; la otra conserva una decisión de autorización durante su propio TTL. Si buscas resolver permisos, consulta la [guía de caché de authorizers, fuentes de identidad y alcance de políticas](/blog/cache-para-autorizadores-lambda-en-api-gateway/).

### Lambda: reutiliza el entorno sin depender de él

Lambda puede reutilizar un entorno de ejecución cuando vuelve a recibir trabajo para ese entorno. Por eso AWS recomienda inicializar fuera del handler los clientes de SDK y conexiones, y mantener archivos estáticos locales en /tmp cuando sea útil. Sin embargo, Lambda puede crear más entornos al escalar y terminar entornos existentes; una variable global o un archivo local no es un almacén compartido ni duradero. Trata cada solicitud como si empezara sin esa caché y deja una ruta normal para reconstruir el dato. La [guía del ciclo de vida del entorno de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html) explica la reutilización y la [guía de buenas prácticas](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html) advierte que no se guarden datos de usuario, eventos u otra información sensible entre invocaciones.

### ElastiCache y DAX: caché compartida con condiciones distintas

ElastiCache puede ofrecer una caché compartida para funciones concurrentes. En Serverless, AWS mide los datos almacenados en GB-h y las solicitudes en ECPU. El mínimo de almacenamiento medido depende del motor: 100 MB por caché para Valkey y 1 GB para Redis OSS o Memcached. En clústeres con nodos, se factura cada nodo por hora. Ese piso puede pesar en cachés pequeños con pocos aciertos, así que compara el motor, la región y los [precios vigentes de ElastiCache](https://aws.amazon.com/elasticache/pricing/) antes de elegir. Para escuchar una explicación comunitaria de ElastiCache Serverless y sus consideraciones de rendimiento, mira la charla [ElastiCache Serverless en RoxsFest](https://youtu.be/zn_k5AZcPNA), presentada por Odina Jacobs; úsala junto a la documentación y las tarifas actuales.

DAX es más específico: se ubica delante de DynamoDB y almacena resultados de lecturas compatibles. Las lecturas eventualmente consistentes pueden servirse desde el caché; las lecturas fuertemente consistentes y las transacciones de lectura se envían a DynamoDB y no se guardan en DAX. Además, una escritura a la tabla que evita DAX no invalida automáticamente sus valores almacenados. La [guía de consistencia de DAX](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.consistency.html), los [criterios de AWS para evaluar si DAX conviene](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/evaluate-dax-suitability.html) y los [precios vigentes de DynamoDB y DAX](https://aws.amazon.com/dynamodb/pricing/) explican cuándo esa capa agrega valor y cuándo solo suma costo o complejidad.

## Patrón práctico: cache-aside con clave por tenant

En *cache-aside*, la aplicación consulta primero el caché. Ante un fallo, lee la fuente de verdad, guarda el resultado con un TTL y lo devuelve. El caché puede perder todos sus datos sin perder la fuente. El siguiente ejemplo supone que `read_product_for_tenant` devuelve un diccionario serializable a JSON y consulta usando ambos identificadores. El adaptador del caché traduce errores de conexión o timeout a `CacheUnavailable`; configura un timeout corto y registra esos desvíos. No conviertas errores de autorización, serialización o lectura de la fuente en fallos de caché.

<pre><code class="language-python">import json

# cache tiene un timeout corto y devuelve texto.
# CacheUnavailable representa fallos de conexión o timeout del adaptador.
# verified_tenant_id proviene de la identidad autenticada, no de la solicitud.

def get_product(verified_tenant_id, product_id):
    key = "product:v1:" + json.dumps(
        [verified_tenant_id, product_id], separators=(",", ":")
    )
    try:
        cached = cache.get(key)
    except CacheUnavailable:
        cached = None  # Desvío a la fuente; registra el fallo.

    if cached is not None:
        return json.loads(cached)

    product = read_product_for_tenant(verified_tenant_id, product_id)
    if product is not None:
        try:
            cache.set(key, json.dumps(product), ex=60)
        except CacheUnavailable:
            pass  # La lectura de la fuente ya produjo la respuesta.
    return product</code></pre>

La clave serializa el par de identificadores en JSON para distinguir sus límites incluso si contienen `:`. Concatenarlos con ese separador sin codificarlos puede hacer que pares distintos produzcan la misma clave.

Los 60 segundos solo ilustran dónde se configura un TTL, no son una recomendación universal. En producción, el identificador del tenant debe salir de una identidad verificada, y la consulta a la base también debe limitarse a ese tenant. Incluye en la clave cada valor que cambie el contenido —por ejemplo, tenant, idioma o versión— y evita claves globales para respuestas privadas.

Este ejemplo continúa con la fuente de verdad cuando falla la conexión al caché y devuelve el dato leído aunque no pueda guardarlo. Ese desvío aumenta las lecturas al origen; úsalo solo si este puede absorber esa carga y vigila los timeouts para no convertir una caída de caché en una sobrecarga de la base.

Después de confirmar una escritura en la fuente, elimina la misma clave. Si la invalidación falla, el valor anterior puede seguir sirviéndose hasta que expire; registra el fallo y elige un TTL compatible con esa ventana. Una lectura iniciada antes de la escritura también podría volver a cargar el valor antiguo después del borrado. Si no toleras ninguna lectura desactualizada, consulta la fuente o usa una estrategia de versiones/coordinación que cumpla ese requisito.

## TTL, invalidación y privacidad

El TTL representa cuánto puede reutilizarse un valor antes de tratarlo como vencido. Elígelo según la frecuencia de cambio del dato y el retraso máximo que tu producto puede aceptar. Un catálogo público puede tolerar una ventana más amplia que un inventario o un permiso. Un TTL corto no garantiza que los datos estén siempre actualizados: después de una escritura también puede hacer falta invalidar la clave, publicar una versión nueva o consultar la fuente de verdad.

Con CloudFront, el origen puede usar encabezados como Cache-Control para expresar vigencia. La clave por defecto incluye el dominio y la ruta; añade encabezados, cookies o parámetros solo si cambian la respuesta. Si el TTL mínimo de una política es mayor que cero, CloudFront puede conservar contenido durante ese mínimo incluso cuando el origen indica no-cache, no-store o private. Para archivos que cambian, los nombres versionados suelen ser más predecibles que depender de invalidaciones. Revisa la documentación de [claves de caché](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html), [TTL y comportamiento de caché](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html) e [invalidaciones](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html), además de los [precios de CloudFront](https://aws.amazon.com/cloudfront/pricing/). Para una guía más extensa sobre orígenes, claves e invalidación, consulta [Amazon CloudFront: qué es y cómo configurarlo](/blog/amazon-cloudfront-comprendiendo-el-cdn-de-aws/).

Si una respuesta depende de usuario, tenant, rol, idioma u otro atributo, ese dato debe influir en la clave efectiva o la respuesta no debe compartirse. No tomes el tenant directamente de una query string como prueba de identidad. Si no puedes demostrar que dos solicitudes cacheadas deben recibir exactamente la misma respuesta y los mismos permisos, desactiva esa caché. Este cuidado también aplica a un proxy CDN delante de una API y a las cachés del navegador.

## Cómo saber si el caché ayuda

Antes de comparar resultados, define qué latencia y proporción de respuestas correctas necesita el usuario; la guía de [SLI, SLO y presupuesto de error en AWS](/blog/diferencias-entre-sla-y-slo-en-aws/) ayuda a fijar ese objetivo. Compara el mismo tipo de tráfico antes y después, incluyendo la distribución de claves, concurrencia y tamaño de respuesta. Mide al menos:

- Aciertos y fallos de caché, y cuántas consultas al backend evitó cada acierto.
- Latencia p50 y p95 de extremo a extremo, no solo el tiempo que tarda el caché.
- Invocaciones y duración de Lambda, lecturas de la base de datos y errores o throttling.
- Costo de la caché, almacenamiento, transferencia y servicios de origen durante el mismo período.

Para caché de respuestas de REST API, empieza con CacheHitCount y CacheMissCount. En ElastiCache Serverless, AWS publica BytesUsedForCache y ElastiCacheProcessingUnits; puedes revisar estas métricas junto con su [documentación de escalado y límites de uso](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Scaling-serverless.html). Un porcentaje alto de aciertos no basta para afirmar que ahorras: resta el costo de mantener la caché y atender sus solicitudes a los costos reales que evita. Si medir muestra poco reuso o la aplicación apenas mejora, elimina la capa.

| Síntoma | Qué revisar primero |
| --- | --- |
| Casi todos los accesos son fallos | Si las claves incluyen parámetros innecesarios, si hay demasiados valores únicos y si las solicitudes repiten el mismo contenido. No quites datos que cambien la respuesta. |
| Aparecen datos viejos | El TTL, el camino de escritura e invalidación y los valores que forman la clave. Comprueba qué capa respondió antes de vaciar o invalidar. |
| Un tenant recibe datos de otro | Desactiva la caché afectada mientras corriges la clave y valida tanto la autorización como la consulta a la fuente. No basta con ocultar el dato en la interfaz. |
| La latencia o factura sube | Mide la llamada al caché, transferencias, almacenamiento y aciertos reales. Un salto de red puede costar más que leer un origen pequeño. |

## Recursos y comunidad para continuar

- El [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) permite conectar con personas que comparten sesiones de AWS serverless; consulta allí qué actividades tienen anunciadas y su modalidad. Para buscar grupos de otros países, usa el [directorio de comunidades AWS](/comunidades/).
- La [agenda de eventos AWS](/eventos/) reúne fechas, modalidades y enlaces de inscripción de eventos publicados por comunidades de Latinoamérica. La oferta cambia según cada organizador, así que confirma los datos en el enlace de registro.

## Preguntas frecuentes

### ¿Una variable global de Lambda es un caché compartido?

No. Puede sobrevivir a varias invocaciones procesadas por el mismo entorno, pero otra instancia tiene su propia memoria y Lambda no garantiza que el entorno siga disponible. Úsala como optimización local reconstruible, no como fuente de estado ni como caché entre tenants.

### ¿API Gateway guarda las respuestas en caché para HTTP API?

No. La caché de respuestas integrada está disponible para REST API. HTTP API y REST API son productos diferentes, así que verifica la tabla de capacidades antes de aplicar instrucciones de configuración.

### ¿ElastiCache Serverless siempre cuesta menos que leer DynamoDB?

No. ElastiCache Serverless factura almacenamiento y ECPU, y su mínimo medido depende del motor: 100 MB para Valkey y 1 GB para Redis OSS o Memcached. El costo neto depende además de frecuencia de acceso, tamaño y vida de los valores, cantidad de fallos, red, región y carga evitada. Compara con mediciones y precios de tu región.

### ¿DAX sirve como caché para cualquier base de datos?

No. DAX está diseñado para acelerar lecturas de DynamoDB. Si la aplicación necesita lecturas fuertemente consistentes, esas operaciones se consultan en DynamoDB y no se guardan en DAX; revisa la consistencia que necesita tu caso.
