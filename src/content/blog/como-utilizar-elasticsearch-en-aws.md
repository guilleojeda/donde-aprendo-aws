---
title: "Elasticsearch en AWS: OpenSearch, búsqueda y migración"
description: "Compara Elasticsearch con Amazon OpenSearch Service, dominios y Serverless; aprende a indexar y buscar documentos y revisa compatibilidad, seguridad y costos."
author: "guille-ojeda"
publishedAt: "2024-03-08"
publishedTimestamp: "2024-03-08T13:19:46.73Z"
modifiedTimestamp: "2026-10-06T09:52:18-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "¿Qué base de datos elegir en AWS? RDS, Aurora y DynamoDB"
    url: "https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/"
  - title: "Qué es Amazon Bedrock y cómo usarlo: API, permisos y costos"
    url: "https://dondeaprendoaws.com/blog/como-utilizar-amazon-bedrock/"

---

Si buscas **Elasticsearch en AWS**, primero decide qué producto necesitas. **Amazon OpenSearch Service** es la opción administrada por AWS y ejecuta OpenSearch o versiones antiguas de Elasticsearch OSS; **Elastic Cloud Hosted** ofrece el producto de Elastic alojado sobre AWS; y en EC2 tú operas el clúster. Dentro de OpenSearch Service, puedes elegir un dominio con capacidad aprovisionada o una colección de OpenSearch Serverless.

Estas opciones comparten conceptos y algunas API, pero no son intercambiables en versiones, funciones, complementos, autenticación ni precio. La guía oficial de AWS mantiene las versiones y límites vigentes; consúltala antes de diseñar una integración.

## Elasticsearch y Amazon OpenSearch Service

AWS cambió el nombre de Amazon Elasticsearch Service a **Amazon OpenSearch Service** en 2021. El proyecto OpenSearch partió de Elasticsearch OSS 7.10.2 y siguió su propio desarrollo. Hoy, OpenSearch Service admite OpenSearch y algunas versiones heredadas de Elasticsearch OSS, hasta la 7.10; eso no significa que AWS aloje cualquier versión reciente de Elastic. Comprueba la [lista actual de versiones y soporte](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/what-is.html) y la [historia del proyecto OpenSearch](https://aws.amazon.com/blogs/opensource/introducing-opensearch/).

En OpenSearch, la interfaz web es **OpenSearch Dashboards**; Kibana pertenece al stack de Elastic. Las API de búsqueda e indexación se parecen en muchas operaciones, pero un cliente, consulta, complemento o función comercial de Elastic puede no funcionar igual en OpenSearch Service. AWS publica una [matriz de operaciones admitidas por versión](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/supported-operations.html); Serverless tiene [su propia lista de API y complementos](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-genref.html).

## Elige dónde ejecutarlo

| Opción | Cuándo evaluarla | Qué administras |
|---|---|---|
| **Dominio de Amazon OpenSearch Service** | Quieres la gestión de AWS y elegir tipos y cantidad de instancias, almacenamiento y capacidad. | AWS mantiene la infraestructura y reemplaza nodos con fallas. Tu equipo dimensiona el dominio, configura índices y fragmentos, revisa métricas y planifica actualizaciones. |
| **Colección de OpenSearch Serverless** | La carga varía y quieres delegar más decisiones de capacidad. | AWS escala las unidades de cómputo. No eliges nodos ni controlas fragmentos como en un dominio; hay operaciones, complementos y tipos de colección que no están disponibles. |
| **Elastic Cloud Hosted sobre AWS** | Necesitas la distribución actual de Elasticsearch y sus funciones. | Elastic administra el despliegue alojado en el proveedor de nube que eliges. Cuenta, plan y cargos dependen de Elastic; revisa qué incluye tu oferta. |
| **Instalación autogestionada en EC2** | Requieres control del sistema operativo, versión o instalación y tienes capacidad para operar el clúster. | Tu equipo aprovisiona, protege, escala, respalda, actualiza y recupera las instancias y el software. |

Un dominio es un clúster administrado con instancias y almacenamiento definidos al crearlo. Una colección Serverless agrupa índices para una carga de trabajo; no expone el modelo de nodos y clústeres de un dominio. Revisa la [comparación oficial entre dominios y colecciones](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-comparison.html) y las [opciones de despliegue de Elastic](https://www.elastic.co/docs/get-started/deployment-options) antes de decidir.

Si prefieres una explicación en audio, el episodio [OpenSearch Serverless nueva gen: de cero a miles de requests por segundo](https://desplegando.substack.com/p/opensearch-serverless-nueva-gen-de), de Desplegando.cloud, resume novedades anunciadas el 1 de junio de 2026. Es una edición de noticias, no una comparación técnica ni una cotización: verifica las funciones y los costos en la documentación de AWS vigente.

## Indexa un documento y búscalo por texto

OpenSearch organiza los datos en **índices** y **documentos JSON**. El *mapping* define cómo interpretar cada campo. Usa <code>text</code> para texto libre y <code>keyword</code> para valores que deban coincidir exactamente, filtrarse o agruparse. La [guía de tipos de campo de texto](https://docs.opensearch.org/latest/mappings/supported-field-types/string/) explica la diferencia.

El siguiente ejemplo es para un **dominio aprovisionado que ejecuta OpenSearch**. En OpenSearch Dashboards, envía estas solicitudes REST desde **Dev Tools**. Cada bloque usa ese formato de solicitudes, no es JSON independiente. El ejemplo crea un índice con mapping, guarda un documento con identificador fijo y espera al siguiente refresh antes de buscar palabras en el título:

~~~http
PUT /articulos-demo
{
  "mappings": {
    "properties": {
      "titulo": { "type": "text" },
      "categoria": { "type": "keyword" },
      "publicado": { "type": "date" }
    }
  }
}
~~~

~~~http
PUT /articulos-demo/_doc/1?refresh=wait_for
{
  "titulo": "Búsqueda de registros en una aplicación",
  "categoria": "observabilidad",
  "publicado": "2026-10-06"
}
~~~

~~~http
POST /articulos-demo/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "titulo": "búsqueda de registros" } }
      ],
      "filter": [
        { "term": { "categoria": "observabilidad" } }
      ]
    }
  }
}
~~~

Desde un cliente HTTP debes incluir el endpoint y la autenticación que correspondan. Si el dominio está dentro de una VPC, el cliente también necesita conectividad con esa red. Para IAM, las solicitudes a dominios usan SigV4 con el servicio <code>es</code>; Serverless firma con <code>aoss</code> y requiere permisos de la colección.

La primera solicitud crea un índice y la segunda escribe un documento; el uso del dominio puede generar cargos. Envíalas solo a un entorno de prueba autorizado y revisa sus costos. El parámetro <code>refresh=wait_for</code> espera el refresh periódico para que el documento aparezca en la búsqueda, sin forzar uno inmediato. Serverless admite un subconjunto de operaciones y algunos endpoints, como indexar con ID explícito, dependen del tipo de colección; consulta la [matriz de API y permisos](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-genref.html) antes de adaptar este ejemplo. Referencias: [API de indexación](https://docs.opensearch.org/latest/api-reference/document-apis/index-document/) y [API de búsqueda](https://docs.opensearch.org/latest/api-reference/search/).

Si necesitas ETL con AWS Glue, la conexión administrada para OpenSearch Service funciona con Glue for Spark 4.0 o posterior y guarda credenciales de autenticación básica en Secrets Manager. AWS advierte que ese conector no es compatible con Serverless. Confirma la red, autenticación y servicio de destino; Glue no es un requisito para indexar documentos desde una aplicación.

## Texto completo, vectores y RAG

Una consulta <code>match</code> busca texto según los términos y el análisis del campo. OpenSearch también ofrece búsqueda vectorial: almacena *embeddings* y busca los vectores cercanos. Para ello tienes que generar los embeddings y elegir un modelo, métrica y estrategia de índice; no basta con crear un índice normal. La [guía oficial de búsqueda vectorial](https://docs.opensearch.org/latest/vector-search/getting-started/vector-search-basics/) explica la diferencia entre coincidencia de palabras y similitud.

Un vector tampoco representa por sí solo las relaciones entre documentos. Si un agente debe responder preguntas que conectan varios hechos, una base de grafos puede complementar la búsqueda. [«Memoria de Grafo: Cuando la Búsqueda Vectorial Falla»](https://dev.to/aws-espanol/memoria-de-grafo-cuando-la-busqueda-vectorial-falla-1bdm), de Elizabeth Fuentes, muestra esa diferencia con Neo4j y Strands. Es una lectura sobre recuperación para agentes, no una guía de OpenSearch.

Para ver un flujo RAG de punta a punta, [De los Cómics a la Nube: Construyendo chatbots con Lex, Bedrock, S3 y OpenSearch](https://builder.aws.com/content/3GO5EqpR0Bvo14KotkDQWKx88Yl/de-los-cmics-a-la-nube-construyendo-chatbots-con-lex-bedrock-s-y-open-search), de Luis Daniel Paredes Zamudio, recorre una base de conocimiento de Bedrock con documentos en S3 y OpenSearch Serverless como almacén vectorial, además de la integración con Lex. Es un tutorial publicado en julio de 2026; confirma en la documentación vigente los pasos, modelos y permisos antes de replicarlos. El costo que el autor informa para su experimento de 36 horas corresponde a esa ejecución y no sirve como precio estimado para otra carga. Para entender la invocación de modelos, IAM y costos de Bedrock, sigue con [Cómo usar Amazon Bedrock: API, permisos y costos](/blog/como-utilizar-amazon-bedrock/).

## Compatibilidad y migración desde Elasticsearch

Una migración no consiste solo en cambiar la URL del clúster. Primero inventaría la versión de Elasticsearch, clientes, mappings, analizadores, plantillas, consultas, complementos y controles de acceso. Luego valida que el destino admita las operaciones que usa la aplicación. Una búsqueda sencilla que funciona no demuestra que sigan funcionando todos los filtros, agregaciones o complementos.

Para pasar a otro dominio, AWS documenta dos caminos habituales:

- **Snapshot y restauración:** puede servir al migrar a otro clúster, pero la combinación admitida depende de las versiones exactas. AWS documenta rutas distintas para Elasticsearch y OpenSearch; algunas versiones antiguas requieren pasos intermedios o recrear índices. Compara el origen y el destino con la [tabla oficial de migración por snapshot](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/snapshot-based-migration.html). Para actualizar un dominio existente, AWS recomienda evaluar primero la actualización *in-place*.
- **Reindexación remota:** lee documentos del origen y los escribe en el destino. AWS requiere OpenSearch 1.0 o posterior, o Elasticsearch 6.7 o posterior, en el destino; el origen debe ser de la misma versión mayor o una menor que el destino. Para esta comparación, AWS considera Elasticsearch anterior a OpenSearch. También hacen falta conectividad entre ambos y permisos para leer el índice de origen y escribir en el destino. Revisa los [requisitos de AWS](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/remote-reindex.html).

AWS no ofrece una conversión automática de un dominio administrado a Serverless: debes reindexar los datos. Antes de cambiar el tráfico, compara recuentos y mappings, prueba consultas representativas, filtros y agregaciones, valida permisos y mide latencia con datos de prueba. Si hay ingesta continua, planifica cómo sincronizar las escrituras durante el corte.

Elasticsearch OSS 7.10 es una versión heredada que OpenSearch Service mantiene por compatibilidad; no representa las versiones actuales del producto Elastic. Las versiones antiguas tienen fechas de fin de soporte y pueden generar cargos de soporte extendido. Antes de migrar, revisa las [versiones, fechas y reglas de facturación vigentes](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/what-is.html) junto con la compatibilidad de tu aplicación.

## Seguridad y costos

Para un dominio, protege el acceso en capas: red, política del dominio e identidad o control de acceso detallado. Si solo deben entrar aplicaciones dentro de AWS, evalúa una VPC y grupos de seguridad restrictivos. Usa HTTPS, cifrado en reposo con KMS cuando corresponda y permisos de lectura y escritura por necesidad; evita políticas públicas abiertas. AWS explica estas [capas de acceso](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/fgac.html) y recomienda desplegar dominios en una [VPC con permisos limitados](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/bp.html). El control de acceso detallado requiere HTTPS, cifrado en reposo y cifrado entre nodos; al habilitarlo no puedes desactivarlo en ese dominio.

Serverless usa políticas de red y de acceso a datos para colecciones, y el cifrado en reposo es obligatorio. No copies sin revisar las políticas de un dominio: el endpoint, la firma IAM y los permisos de colección son distintos.

El costo depende de cómo mantienes y usas cada opción:

- En un dominio pagas las horas de las instancias, el almacenamiento EBS adjunto y la transferencia que corresponda. La capacidad aprovisionada sigue contando aunque la actividad sea baja.
- En Serverless se factura el cómputo medido en OCU para ingesta y búsqueda, además del almacenamiento administrado. Revisa límites de capacidad y condiciones mínimas de tu configuración.
- Elastic Cloud Hosted y EC2 tienen sus propios cargos de servicio o infraestructura. Ingesta, snapshots, observabilidad y transferencia pueden añadir otros costos.

No hay un precio único para Elasticsearch en AWS. Región, versión, instancias, almacenamiento, redundancia y consultas cambian el cálculo. Antes de crear recursos, revisa la [página actual de precios de Amazon OpenSearch Service](https://aws.amazon.com/opensearch-service/pricing/) o la oferta de Elastic que usarías.

## Investiga problemas de conexión o rendimiento

Empieza por el síntoma y el endpoint real:

- **Timeout, DNS o error TLS:** confirma el hostname del dominio o colección, HTTPS y el puerto documentado, DNS y ruta de red. En una VPC revisa subredes y grupos de seguridad; en Serverless, las políticas de red. Los nodos administrados no aceptan SSH ni permiten editar directamente <code>opensearch.yml</code>.
- **403 de acceso denegado:** comprueba qué capa rechazó la solicitud: política de red, política IAM o del dominio, firma SigV4, autenticación y permisos por índice. Para Serverless revisa las políticas de acceso de datos y que la solicitud esté firmada para <code>aoss</code>.
- **403 con mensaje de throttling o 429:** inspecciona la respuesta y, en un dominio, métricas de CPU, <code>JVMMemoryPressure</code>, <code>FreeStorageSpace</code>, <code>ThreadpoolSearchRejected</code> y <code>ThreadpoolWriteRejected</code> en CloudWatch. Revisa consultas pesadas, picos de ingesta, colas y distribución de fragmentos; reduce trabajo innecesario y escala si las métricas muestran falta de capacidad. Para picos transitorios, usa reintentos con espera exponencial y variación aleatoria.
- **Estado amarillo o rojo:** revisa la salud y asignación de fragmentos. Amarillo suele indicar réplicas pendientes; rojo significa que al menos un fragmento primario no está asignado. AWS explica cómo investigar un [clúster rojo](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/handling-errors.html); no agregues fragmentos a ciegas, porque también aumentan trabajo y memoria.

AWS publica [métricas, alarmas y ejemplos de diagnóstico](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/managedomains-cloudwatchmetrics.html). En dominios administrados, usa la consola, AWS CLI, SDK o las API que admite el motor; no intentes conectarte a los nodos como si fueran instancias EC2 tuyas.

## Recursos y comunidades para seguir aprendiendo

La grabación de 2023 [AWS User Group Córdoba Meetup #18](https://www.youtube.com/watch?v=7Xk0MKt69Is) incluye una charla sobre diseño de índices de OpenSearch y actualización masiva de datos; la descripción también menciona búsquedas de palabras completas, parciales, sinónimos y coincidencias exactas. Sirve para estudiar decisiones de indexación. Contrasta sus pasos y pantallas con la documentación actual antes de reutilizarlos.

Si te interesa el contexto más amplio de datos y analítica en AWS, la charla de AWS Girls Perú [Data y Analítica: AWS EMR, Kinesis, Glue, Athena, Quicksigth y Elasticsearch](https://www.youtube.com/watch?v=7Gl5EnvkmAY) se publicó el 26 de septiembre de 2021. Es una grabación histórica sobre varios servicios de datos; su referencia a Elasticsearch es anterior al cambio de nombre a OpenSearch Service. Úsala para contexto, no como instrucciones actuales de configuración.

Para conversar sobre OpenSearch y sus clientes, el [foro oficial del proyecto](https://forum.opensearch.org/) tiene espacios para el motor, Dashboards, complementos y librerías cliente. Para intercambiar experiencias generales de AWS, el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) reúne a personas interesadas en nube y AWS; el [portal del AWS User Group Perú](https://awsugperu.cloud/) publica grupos locales, talleres, grupos de estudio y recursos para distintos niveles. Son comunidades generales, no canales especializados en soporte de una cuenta AWS.

Al revisar la agenda el **6 de octubre de 2026**, figuraba el [AWS Community Day Panamá — Security & Data Edition](https://www.meetup.com/aws-user-group-panama/events/316732293/) para el **14 de noviembre de 2026**, de **08:00 a 13:00 (UTC−5)** y en modalidad presencial. La ficha indicaba “Save the Date” y aún no informaba el lugar; anuncia seguridad y datos, no una sesión específica de OpenSearch. Si estás en Panamá y te interesa, confirma lugar, registro y condiciones en la [ficha del organizador](https://www.meetup.com/aws-user-group-panama/events/316732293/) o en la [agenda local](https://dondeaprendoaws.com/eventos/panama/#event-meetup-event-316732293) antes de planificar.

Explora el [directorio de comunidades AWS en Latinoamérica](/comunidades/) para buscar por país y tipo de grupo, y la [agenda de eventos](/eventos/) para encontrar otras actividades. Fechas, modalidades, temarios y requisitos pueden cambiar en las páginas de cada organizador.

Para comparar OpenSearch con bases de datos operativas como RDS, Aurora y DynamoDB, continúa con [¿Qué base de datos elegir en AWS?](/blog/aws-bases-de-datos-introduccion-basica/).

## Preguntas frecuentes

### ¿Amazon Elasticsearch Service sigue siendo el nombre del servicio de AWS?

No. AWS lo renombró Amazon OpenSearch Service en 2021. El servicio aún admite algunas versiones heredadas de Elasticsearch OSS, pero la matriz actual incluye motores y operaciones concretos. Revísala antes de migrar o crear una integración.

### ¿Puedo usar Elasticsearch con Amazon OpenSearch Service?

Depende de la versión y las funciones de tu aplicación. AWS ofrece compatibilidad con versiones OSS antiguas de Elasticsearch y API comunes, pero no afirma compatibilidad completa con las versiones actuales de Elastic. Si necesitas la distribución actual de Elastic, evalúa Elastic Cloud Hosted sobre AWS o la autogestión.

### ¿OpenSearch Serverless es siempre más barato que un dominio?

No. Serverless reduce la gestión de capacidad, pero las OCU y el almacenamiento retenido siguen teniendo cargos. Compara una carga representativa con la tarifa de la región que usarás; la página de precios es la referencia.
