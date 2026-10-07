---
title: "Amazon Personalize en tiempo real: requisitos, API y cuándo conviene usarlo"
description: "Aprende cómo usar Amazon Personalize para recomendar y ordenar productos en tiempo real, qué datos y recetas necesitas, cuánto cuesta y cuándo elegir otro enfoque."
author: "guille-ojeda"
publishedAt: "2024-04-29"
publishedTimestamp: "2024-04-29T09:45:01.725Z"
modifiedTimestamp: "2026-10-06T23:58:58-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Machine learning en AWS: cómo empezar y qué servicio elegir"
    url: "https://dondeaprendoaws.com/blog/10-preguntas-frecuentes-sobre-machine-learning-en-aws/"
  - title: "API Gateway HTTP API o REST API: cómo elegir para Lambda"
    url: "https://dondeaprendoaws.com/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/"
  - title: "Cómo usar AWS Cost Explorer: filtros y costos que no aparecen"
    url: "https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/"
---

[Amazon Personalize](https://docs.aws.amazon.com/personalize/latest/dg/) en tiempo real sirve para responder una pregunta concreta de tu aplicación: **¿qué artículos debería mostrarle ahora a esta persona?** El servicio entrena modelos con interacciones de usuarios y un catálogo de productos, videos u otros elementos; después tu backend pide recomendaciones por API y registra nuevos eventos para algunas recetas compatibles.

Conviene evaluarlo cuando ya tienes suficientes interacciones propias, un catálogo identificable y una acción medible —como abrir una ficha, reproducir un video o comprar—. No sustituye la búsqueda, un sistema de reglas de negocio ni una plataforma de campañas. Tampoco vuelve a entrenar un modelo por cada clic: “en tiempo real” describe la respuesta de inferencia y, si la receta lo permite, la adaptación a interacciones recientes. Si aún estás comparando servicios y enfoques de ML en AWS, puedes empezar por esta [guía para elegir un servicio de machine learning](https://dondeaprendoaws.com/blog/10-preguntas-frecuentes-sobre-machine-learning-en-aws/).

## Qué devuelve Amazon Personalize y qué no

Amazon Personalize ofrece tres resultados que suelen confundirse:

| Necesidad | Recurso o API | Qué obtienes |
| --- | --- | --- |
| Recomendar elementos para una persona | `GetRecommendations` | Una lista de productos, videos u otros elementos ordenados por relevancia estimada. |
| Ordenar candidatos que ya encontró tu aplicación | `GetPersonalizedRanking` | Los mismos elementos de entrada reordenados para una persona. El servicio no busca candidatos fuera de esa lista. |
| Crear grupos de personas con interés probable en un elemento o atributo | Recetas de tipo `USER_SEGMENTATION` y un trabajo por lotes | Segmentos exportados a Amazon S3 para que otro proceso los use. No es una segmentación en vivo por solicitud. |

La API de recomendaciones devuelve una predicción, no una garantía de compra, clic o mejora de conversión. Si tu aplicación necesita una restricción obligatoria —por ejemplo, excluir artículos sin stock, ya comprados o no visibles en una región— aplícala con los filtros de Amazon Personalize cuando correspondan y valida la regla también en tu sistema de catálogo.

La [guía de recetas y casos de uso](https://docs.aws.amazon.com/personalize/latest/dg/use-cases-and-recipes.html) describe qué tarea resuelve cada receta y API. Para segmentos, Personalize requiere una receta de tipo `USER_SEGMENTATION` y un [trabajo por lotes](https://docs.aws.amazon.com/personalize/latest/dg/getting-user-segments.html) que lee entradas desde S3 y escribe resultados allí.

## Cómo elegir entre un recomendador de dominio y una solución personalizada

Si tu producto es comercio electrónico o video bajo demanda, empieza revisando los recomendadores de dominio `ECOMMERCE` y `VIDEO_ON_DEMAND`. Seleccionas un caso preconfigurado, como recomendaciones para ti, elementos populares o productos relacionados, y Personalize administra el ciclo de vida del modelo. La API de tiempo real recibe el ARN del recomendador.

Para otros catálogos o una tarea que necesite más control, crea un grupo de datos personalizado y elige una receta. `User-Personalization-v2` es una opción para recomendar elementos según el historial de una persona; `Personalized-Ranking-v2` ordena una lista de candidatos. Las recetas de segmentación tienen otro flujo y generan resultados por lotes. Los grupos de dominio también permiten crear recursos personalizados si un caso preconfigurado no alcanza.

Una diferencia operativa útil: los recomendadores de dominio se consultan en tiempo real y se reentrenan automáticamente cada siete días; algunos casos de uso actualizan los modelos cada dos horas para incorporar elementos nuevos a la exploración. En recursos personalizados, una campaña publica una versión entrenada para inferencia en tiempo real. Las soluciones personalizadas nuevas usan entrenamiento automático por defecto; puedes cambiar esa configuración o crear versiones manualmente. Revisa el calendario y los datos que usa cada receta antes de diseñar la frescura que necesita tu producto. AWS detalla estas diferencias en [casos de uso de dominio](https://docs.aws.amazon.com/personalize/latest/dg/domain-use-cases.html), [recomendadores de dominio](https://docs.aws.amazon.com/personalize/latest/dg/creating-recommenders.html) y [actualización de datos](https://docs.aws.amazon.com/personalize/latest/dg/updating-datasets.html).

## Los datos que necesitas antes de entrenar

Para recomendaciones de elementos, el conjunto obligatorio es el de interacciones. Cada fila relaciona un `USER_ID`, un `ITEM_ID` y un `TIMESTAMP` en segundos Unix. Registra tipos de evento que representen acciones distintas —por ejemplo `view`, `click` y `purchase`—; los recomendadores de dominio requieren `EVENT_TYPE`, mientras que en recetas personalizadas puede ser opcional. Los valores deben coincidir con el esquema y con el caso de uso elegido.

AWS establece un mínimo de **1.000 interacciones** y **25 usuarios con al menos dos interacciones cada uno** para entrenar. Como referencia de calidad, recomienda partir de **50.000 interacciones y 1.000 usuarios con dos o más interacciones**. Esa recomendación no es un requisito de creación ni una promesa de calidad: la cobertura del catálogo, los eventos correctos y la utilidad del resultado también importan. Revisa los datos en busca de IDs que no coincidan entre tablas, marcas de tiempo incorrectas, duplicados y columnas opcionales incompletas. La [guía de preparación de interacciones](https://docs.aws.amazon.com/personalize/latest/dg/interactions-datasets.html) explica los límites y requisitos por caso.

Para ver el flujo aplicado a un catálogo de anime, la serie de [AWS Español sobre un recomendador de anime](https://aws.amazon.com/es/blogs/aws-spanish/como-crear-un-modelo-de-recomendacion-basado-en-machine-learning/) comienza con datasets e interacciones y continúa con el despliegue, una API y una aplicación web. Se publicó en 2023 y algunos pasos técnicos y permisos de los ejemplos son antiguos; úsala para seguir la estructura del proyecto y contrasta la implementación con la documentación actual.

Los conjuntos `Items` y `Users` son opcionales para varias recetas, pero pueden aportar atributos como categoría, precio o tipo de membresía cuando la receta los admite. No envíes datos solo porque estén disponibles: conserva únicamente los campos necesarios, usa identificadores internos en lugar de nombres o correos, limita los permisos de la aplicación y define cuánto tiempo guardas eventos. AWS cifra los datos de Personalize en tránsito y en reposo; la configuración de datos y el cumplimiento de tus obligaciones siguen siendo responsabilidad de tu equipo. Si recibes una solicitud de eliminación, Personalize permite borrar interacciones y metadatos de un usuario con un trabajo de eliminación, que puede tardar hasta un día y no borra copias que guardaste fuera del servicio. Consulta [protección de datos](https://docs.aws.amazon.com/personalize/latest/dg/data-protection.html), [cifrado](https://docs.aws.amazon.com/personalize/latest/dg/data-encryption.html) y [eliminación de usuarios](https://docs.aws.amazon.com/personalize/latest/dg/delete-records.html).

### ¿Qué pasa con una persona nueva o anónima?

Sin historial, la personalización individual tiene poco contexto. Personalize puede recurrir a patrones tempranos de otros usuarios o a elementos populares, según la receta. En recetas compatibles puedes registrar actividad anónima con un `sessionId` y usar ese ID para pedir recomendaciones antes de que la persona inicie sesión. Algunos casos admiten datos contextuales o atributos de usuario que ayudan a reducir el arranque en frío, pero debes comprobarlo para la receta concreta; no reemplazan el historial ni garantizan recomendaciones precisas.

La documentación de AWS explica [cómo influye el dato nuevo en las recomendaciones](https://docs.aws.amazon.com/personalize/latest/dg/how-new-data-influences-recommendations.html) y [cómo registrar eventos anónimos](https://docs.aws.amazon.com/personalize/latest/dg/recording-events.html).

## Ejemplo seguro con Boto3 desde un backend

En una tienda, el backend puede pedir recomendaciones para la persona autenticada y registrar después una interacción. El siguiente ejemplo usa nombres de recursos de muestra: reemplázalos por los ARN, el rastreador y la región de tu solución. Ejecuta el código con un rol de IAM de Lambda o de tu servidor; **no pongas credenciales de AWS en el navegador o la aplicación móvil**. Configura `click` como tipo de evento admitido por tu esquema y crea antes una campaña activa para una receta compatible. Si vas a exponer esta llamada desde una web, revisa cómo elegir [API Gateway HTTP API o REST API para Lambda](https://dondeaprendoaws.com/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/).

```python
import boto3
from datetime import datetime, timezone
from uuid import uuid4

personalize_runtime = boto3.client("personalize-runtime", region_name="REGION")
personalize_events = boto3.client("personalize-events", region_name="REGION")


def recomendar(user_id, campaign_arn):
    response = personalize_runtime.get_recommendations(
        campaignArn=campaign_arn,
        userId=user_id,
        numResults=10,
    )
    return {
        "recommendation_id": response.get("recommendationId"),
        "item_ids": [item["itemId"] for item in response.get("itemList", [])],
    }


def registrar_click(user_id, session_id, tracking_id, item_id, recommendation_id):
    personalize_events.put_events(
        trackingId=tracking_id,
        userId=user_id,
        sessionId=session_id,
        eventList=[{
            "eventId": str(uuid4()),
            "eventType": "click",
            "itemId": item_id,
            "recommendationId": recommendation_id,
            "sentAt": datetime.now(timezone.utc),
        }],
    )
```

`GetRecommendations` devuelve IDs de elementos; tu aplicación los relaciona con nombres, precios, disponibilidad y enlaces de compra desde su catálogo. Conserva el `recommendationId` de la respuesta junto con los elementos mostrados y envíalo en el evento cuando quieras atribuir un clic o una compra a una recomendación, como describe la guía de [métricas y atribución de eventos](https://docs.aws.amazon.com/personalize/latest/dg/event-metrics.html). `PutEvents` necesita el `trackingId` de un rastreador activo creado para el grupo de datos y un `sessionId` para la visita. Para algunas recetas compatibles, los eventos sobre elementos ya presentes en el último entrenamiento pueden influir en las recomendaciones en segundos. Un elemento nuevo en el catálogo puede necesitar una actualización del modelo antes de aparecer; consulta [qué datos nuevos se usan antes del siguiente entrenamiento](https://docs.aws.amazon.com/personalize/latest/dg/how-new-data-influences-recommendations.html). La referencia de [Boto3 `PutEvents`](https://docs.aws.amazon.com/boto3/latest/reference/services/personalize-events/client/put_events.html) documenta los nombres y tipos de parámetros, y la guía de [rastreador de eventos](https://docs.aws.amazon.com/personalize/latest/dg/event-get-tracker.html) explica cómo obtener el `trackingId`. Para una función Lambda, AWS indica que `personalize:PutEvents` requiere `Resource: "*"`; mantén el resto de permisos limitado a lo necesario.

### Cuándo usar `GetPersonalizedRanking`

Si una búsqueda propia ya produjo candidatos —por ejemplo, 50 productos que cumplen filtros de precio y stock— puedes pedir a una receta de tipo `PERSONALIZED_RANKING` que los ordene para una persona. La solicitud debe incluir los IDs de esos candidatos y el usuario; solo devuelve elementos de esa lista.

```python
response = personalize_runtime.get_personalized_ranking(
    campaignArn="CAMPAIGN_ARN",
    userId="USER_ID",
    inputList=["ITEM_ID_1", "ITEM_ID_2", "ITEM_ID_3"],
)
items_ordenados = [item["itemId"] for item in response["personalizedRanking"]]
```

`GetPersonalizedRanking` acepta IDs que no aparecieron en el entrenamiento, pero AWS los coloca al final de la respuesta: no reciben una posición personalizada. Para que el orden sea útil, pasa candidatos que el modelo haya visto. Consulta la [referencia de la operación](https://docs.aws.amazon.com/personalize/latest/dg/API_RS_GetPersonalizedRanking.html) y el ejemplo de [ranking personalizado con SDKs](https://docs.aws.amazon.com/personalize/latest/dg/get-personalized-rankings-sdk.html). No uses esta operación como sinónimo de `GetRecommendations`: una recomienda candidatos y la otra reordena candidatos que ya tienes.

## Qué significa “en tiempo real” y qué debes medir

Separa cuatro etapas:

1. **Entrenar:** Personalize analiza interacciones históricas y produce una versión de solución. Una actualización automática o manual vuelve a entrenar según el recurso configurado.
2. **Publicar:** para recomendaciones personalizadas en tiempo real con recursos personalizados, una campaña sirve una versión activa. Un recomendador de dominio tiene un recurso administrado equivalente para su caso de uso.
3. **Inferir:** tu backend llama a `GetRecommendations` o `GetPersonalizedRanking` cuando necesita una respuesta para la pantalla actual.
4. **Registrar:** el backend envía a `PutEvents` la interacción real. Solo las recetas y casos de uso compatibles ajustan recomendaciones con esos eventos recientes; eso no equivale a volver a entrenar el modelo con cada clic.

Personalize puede mostrar métricas **offline** al crear un recomendador, como precisión y cobertura. Esas métricas no demuestran el impacto en ventas o retención. Las métricas **online** se calculan con la interacción real de tus usuarios y tu producto debe registrarlas. Compara la experiencia actual con la nueva mediante una asignación controlada de grupos, define antes una métrica principal y métricas de control como latencia, errores, margen o cancelaciones, y conserva datos de exposición para saber qué vio cada grupo. No des por hecho que una recomendación aumentará conversiones: el resultado se mide en tu tráfico y tu contexto. AWS distingue [métricas offline y online](https://docs.aws.amazon.com/personalize/latest/dg/evaluating-recommenders.html) y explica cómo [medir el impacto de las recomendaciones](https://docs.aws.amazon.com/personalize/latest/dg/measuring-recommendation-impact.html) y [diseñar una prueba A/B](https://docs.aws.amazon.com/personalize/latest/dg/ab-testing-recommendations.html). Personalize también puede publicar métricas de eventos en CloudWatch mediante atribuciones configuradas; esa opción puede generar cargos mensuales de CloudWatch por métrica, así que revisa [sus requisitos y costos](https://docs.aws.amazon.com/personalize/latest/dg/metric-attribution-requirements.html).

CloudWatch Evidently ya no está disponible: AWS [anunció el fin de soporte para octubre de 2025](https://aws.amazon.com/blogs/mt/support-for-amazon-cloudwatch-evidently-ending-soon/). AWS AppConfig permite asignar grupos de control y tratamiento, pero su documentación aclara que el servicio no analiza los resultados de negocio; conecta las asignaciones con tu sistema de analítica y define allí la métrica, el período y los criterios de decisión. Consulta [AWS AppConfig experimentation](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-experimentation.html) y [cómo recoge los datos](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-experimentation-about-data-collection.html).

## Costos: comprueba el diseño y el precio actual

El costo depende del tipo de recurso y la receta. Entre los componentes a estimar están la ingestión de datos, el entrenamiento y las solicitudes de inferencia. En los recomendadores de dominio se cobra por horas de recomendador según los usuarios procesados y pueden aplicarse cargos adicionales por recomendaciones o metadatos. Para campañas personalizadas hay un mínimo de capacidad provisionada —1 solicitud por segundo de forma predeterminada en la documentación de precios consultada—; si no tienes tráfico suficiente, ese mínimo puede pesar más que las solicitudes reales. Las recetas v2 también mantienen ese mínimo de solicitudes; sus tarifas y la unidad de cobro del entrenamiento son distintas, basadas en datos, interacciones de entrenamiento y solicitudes.

Antes de activar el servicio, estima tráfico por hora, cantidad de recursos activos, frecuencia de entrenamiento y tamaño de datos. Prueba con la capacidad mínima, revisa las métricas y detén o elimina los recursos que ya no utilices. Los precios y las condiciones pueden cambiar; usa la [página vigente de precios de Amazon Personalize](https://aws.amazon.com/personalize/pricing/) y la [calculadora de AWS](https://calculator.aws/) antes de desplegar. Si necesitas comparar lo estimado con cargos reales, consulta [cómo analizar los costos de AWS con Cost Explorer](https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/). No supongas que una cuota gratuita cubre campañas activas o costos de los demás servicios de tu arquitectura.

## ¿Sirve para campañas y pruebas de interfaz?

Personalize puede producir recomendaciones por usuario o segmentos para que otra parte de tu aplicación o plataforma de marketing ejecute una campaña. No envía por sí mismo email o notificaciones. Además, no diseñes una integración nueva de engagement con Amazon Pinpoint: AWS dejó de aceptar nuevos clientes en mayo de 2025 y finalizará su soporte el 30 de octubre de 2026. Los clientes actuales pueden seguir usando sus funciones de engagement hasta esa fecha; AWS recomienda migrarlas a soluciones de Amazon Connect. Las API de SMS, voz, push, OTP y validación de teléfonos continúan bajo AWS End User Messaging. Lee el [aviso oficial de fin de soporte de Pinpoint](https://docs.aws.amazon.com/pinpoint/latest/userguide/migrate.html).

## Seguir aprendiendo y participar en la comunidad

- **Documentación y tutoriales:** empieza por el [flujo de trabajo de Amazon Personalize](https://docs.aws.amazon.com/personalize/latest/dg/personalize-workflow.html), consulta la [guía de recetas](https://docs.aws.amazon.com/personalize/latest/dg/working-with-predefined-recipes.html) y revisa [los ejemplos de Boto3](https://docs.aws.amazon.com/boto3/latest/reference/services/personalize-runtime/client/get_recommendations.html).
- **Un recorrido comunitario en español:** la [serie “Recomendador de anime” de AWS Español](https://dev.to/aws-espanol/como-crear-un-modelo-de-recomendacion-basado-en-machine-learning-2a8p) recorre desde los datos hasta una API, una web y la medición. Es de 2023 y contiene recetas y permisos antiguos; úsala para seguir la idea de un proyecto completo y confirma cada instrucción de implementación con la documentación vigente de AWS.
- **Videos de AWS Girls Chile con Elizabeth Fuentes:** [“AWS Recomendador de anime con Amazon” (2021)](https://www.youtube.com/watch?v=tXQBwDd1u8A) está descrito como un laboratorio breve, paso a paso, para recomendar anime según los gustos; la descripción no especifica la API o receta. [“Recomendaciones personalizadas de Anime con Elizabeth Fuentes” (2023)](https://www.youtube.com/watch?v=NWDLhthoxYw) se presenta como una transmisión sobre crear un modelo de recomendaciones con machine learning y enlaza el artículo de AWS Español mencionado arriba. Son grabaciones comunitarias para conocer el proyecto; consulta la documentación vigente antes de implementar.
- **Novedades técnicas:** sigue el [blog de machine learning de AWS](https://aws.amazon.com/blogs/machine-learning/) para leer lanzamientos y patrones sobre servicios de ML. El contenido está principalmente en inglés.
- **Comunidades:** explora [comunidades AWS de Latinoamérica](/comunidades/) y busca grupos por país y formato. Si te interesa el tema, el [AWS UG Machine Learning Latam](https://www.meetup.com/aws-ug-machine-learning-latam/) reúne personas interesadas en ML; revisa su página para confirmar actividad y encuentros. Para aprender AWS en español puedes empezar por el [AWS User Group Buenos Aires en YouTube](https://www.youtube.com/@awsugbsas); sus temas son de AWS en general, no una serie específica sobre Personalize.
- **Eventos y talleres:** consulta la [agenda de eventos AWS](/eventos/) para ver sesiones de comunidades, sus fechas, modalidad y registro vigentes. La agenda cambia, así que confirma esos detalles en cada evento antes de participar.

## Preguntas frecuentes

### ¿Amazon Personalize vuelve a entrenar el modelo con cada evento?

No. `PutEvents` registra actividad. Las recetas compatibles pueden usar en segundos interacciones recientes de elementos que estaban presentes en el último entrenamiento. El entrenamiento completo ocurre según la configuración del recurso. También hay actualizaciones automáticas para determinados recursos y casos de uso; no todas las recetas tratan los datos nuevos de la misma forma.

### ¿Puedo usarlo sin historial de usuarios?

Puedes empezar a registrar sesiones anónimas y ofrecer un resultado inicial basado en patrones tempranos de otros usuarios o popularidad, según la receta. La personalización mejora cuando acumulas interacciones útiles. El mínimo técnico de entrenamiento no garantiza que la salida sea relevante para tu negocio.

### ¿Qué diferencia hay entre recomendar y segmentar?

`GetRecommendations` entrega elementos para una persona. Las recetas de tipo `USER_SEGMENTATION` generan, por lotes, segmentos de usuarios que probablemente interactúen con un elemento o sus atributos; exporta esos grupos mediante un trabajo de S3. Son resultados y tiempos de respuesta distintos.

### ¿Amazon Personalize garantiza un aumento de conversión?

No. Las métricas offline sirven para comparar aspectos del modelo, mientras que clics, ventas, retención y otros resultados se miden en la aplicación. Define una prueba online con control, exposición registrada y métricas antes de sacar conclusiones.
