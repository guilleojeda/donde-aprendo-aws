---
title: "Machine Learning en AWS: cómo empezar y qué servicio elegir"
description: "Aprende a empezar con machine learning en AWS: compara SageMaker AI, Bedrock y servicios de IA preentrenados, evalúa un modelo y revisa costos y límites."
author: "guille-ojeda"
publishedAt: "2024-05-13"
publishedTimestamp: "2024-05-13T06:23:36.093Z"
modifiedTimestamp: "2026-10-04T21:44:34-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related: []
---

Para empezar con machine learning en AWS, define primero qué decisión quieres mejorar y qué resultado podrás medir. Después elige entre entrenar o personalizar un modelo con tus datos, llamar a un modelo fundacional ya preparado o usar una API de IA para una tarea común. No hace falta desplegar un endpoint para aprender: una prueba pequeña con datos de ejemplo y una evaluación separada suele ser un primer paso más útil.

## Qué servicio de machine learning elegir en AWS

Los nombres actuales pueden confundir. **Amazon SageMaker** es la plataforma amplia de AWS para datos, analítica e inteligencia artificial. **Amazon SageMaker AI** es el servicio para desarrollar, entrenar, personalizar y desplegar modelos de IA y machine learning. La documentación más antigua suele llamarlo simplemente Amazon SageMaker. La [guía vigente de AWS para elegir entre SageMaker AI y Bedrock](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/bedrock-or-sagemaker.html) detalla esa diferencia y las situaciones en que conviene combinar ambos.

### SageMaker AI para modelos propios

Si necesitas crear un modelo predictivo o clasificador adaptado a tus datos, evalúa **Amazon SageMaker AI**. Permite preparar datos, experimentar, entrenar y desplegar modelos. Puedes usar modelos y flujos disponibles o controlar más del proceso; entrenar un modelo base desde cero no es un requisito para cada proyecto.

### Bedrock para aplicaciones generativas

Si necesitas crear una aplicación generativa con un modelo fundacional, evalúa **Amazon Bedrock**. Da acceso por API a modelos preentrenados para generar o interpretar contenido. Algunos modelos admiten personalización, pero Bedrock no es un entorno genérico para entrenar cualquier modelo tabular.

### APIs de IA para tareas preparadas

Para resolver una tarea conocida, como extraer datos de un documento o analizar una imagen, evalúa una **API de IA de AWS**. Servicios como Amazon Textract y Amazon Rekognition exponen capacidades preparadas para casos concretos. Confirma que la tarea y las condiciones de uso cubran tu necesidad antes de enviar datos.

Si eliges desarrollar un modelo con SageMaker AI, puedes ampliar la explicación con la charla comunitaria [“Machine Learning para developers con Amazon SageMaker”, del AWS User Group Peru](https://www.youtube.com/watch?v=4IAJOSCwWOo). También puedes explorar el [canal del AWS User Group Peru](https://www.youtube.com/@AWSUserGroupPeru). Es una grabación; contrasta cualquier procedimiento de consola con la documentación actual.

Para explorar la elección de modelos fundacionales en Bedrock por costo y capacidad, [Daniel Castillo publica una comparación](https://dcastillogi.com/blog/bedrock-inteligencia-vs-costo) con precios on-demand de `us-east-1` y datos con corte al 24 de septiembre de 2026. Úsala como una referencia fechada: disponibilidad, precios y resultados cambian, así que revisa las tarifas y modelos vigentes antes de decidir.

Si aún estás aprendiendo regiones, IAM, almacenamiento y costos, puedes seguir esta [ruta práctica para aprender AWS desde cero](https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/). Esos fundamentos ayudan a entender dónde quedan los datos y qué permisos usa cada trabajo.

## Un ejemplo: clasificar tickets de soporte

Supón que un equipo quiere enviar cada ticket nuevo a una categoría como facturación, acceso o soporte técnico. Primero acuerda qué significa cada categoría y revisa si las etiquetas históricas son consistentes. Esas etiquetas son la respuesta que el modelo aprenderá a predecir; sin ellas, un clasificador supervisado no tiene una referencia fiable.

Antes de entrenar, separa registros para entrenamiento, validación y prueba. Entrena con el primer grupo, usa el segundo para tomar decisiones durante el desarrollo y reserva el de prueba para una evaluación final. Si los tickets cambian con el tiempo, separarlos por fecha ayuda a estimar el desempeño en tickets futuros. Mantén juntas las copias o partes de una misma conversación: repartirlas entre grupos puede hacer que la prueba parezca mejor de lo que será en uso real. AWS describe cómo preparar conjuntos separados en su guía de [transformación y división de datos](https://docs.aws.amazon.com/sagemaker/latest/dg/data-wrangler-transform.html).

Elimina de las entradas cualquier dato que revele la respuesta después de que el ticket ya fue resuelto, como la categoría corregida por el agente. Esa fuga de información enseña al modelo a usar pistas que no existirán cuando llegue un ticket nuevo. Usa solo campos disponibles en el momento de clasificar y protege la información personal según la política de tu organización.

Compara el modelo con una regla simple o con la forma de trabajo actual. Revisa los errores por categoría, no solo un promedio: enviar un ticket de acceso a facturación puede tener un costo distinto que confundir dos categorías similares. Para decidir si el resultado sirve, el equipo debe acordar qué errores acepta, cuáles requieren revisión humana y qué parte del flujo se automatizará.

Para ampliar la preparación de los datos, escucha [“Análisis de datos para Machine Learning”, episodio de Charlas Técnicas de AWS publicado en 2021](https://www.youtube.com/watch?v=62s0OxI8SZw). La grabación trata sobre calidad, transformación y formato de datos; algunas herramientas que menciona pueden haber cambiado, así que úsala para los conceptos y consulta la documentación actual para implementarlos.

## De los datos al modelo en producción

Un flujo manejable para un primer proyecto es:

1. **Define el objetivo.** Escribe qué decisión cambia, quién la usa y qué resultado observarás. Una métrica técnica aislada no demuestra que el proceso haya mejorado.
2. **Prepara datos representativos.** Revisa etiquetas, duplicados, valores ausentes y cambios entre grupos o períodos. Usa datos que estés autorizado a procesar.
3. **Establece una referencia.** Registra cómo funciona hoy la clasificación y acuerda métricas pertinentes. En un problema con categorías poco frecuentes, la exactitud global puede ocultar errores en esas categorías.
4. **Elige el camino más simple que responda al objetivo.** Prueba una API preparada si resuelve la tarea; prueba Bedrock si necesitas generación con un modelo fundacional; considera SageMaker AI si necesitas desarrollar o personalizar un modelo predictivo y controlar su ciclo de vida.
5. **Evalúa con datos que no participaron en el entrenamiento.** Analiza errores, grupos afectados y condiciones de uso. Si el modelo no supera una referencia útil para el equipo, vuelve a revisar datos y objetivo antes de desplegar.
6. **Despliega y observa el flujo real.** Mide latencia, errores, consumo y calidad cuando haya etiquetas disponibles. Cambios en los datos, en el proceso o en el significado de las etiquetas pueden reducir la utilidad del modelo; investiga la causa antes de reentrenar.

### Cómo elegir la modalidad de inferencia

Si entrenas un modelo propio con SageMaker AI, la modalidad de despliegue depende del tráfico, la latencia, el tamaño de los datos y las funciones compatibles con el modelo:

- **Real-time** mantiene un endpoint para solicitudes interactivas. Puede encajar con tráfico sostenido y requisitos de respuesta rápida; considera el costo de mantener cómputo disponible y valida los límites de la API y del modelo concreto.
- **Serverless Inference** administra la capacidad para tráfico intermitente y en modalidad bajo demanda no cobra por tiempo ocioso. Admite solicitudes de hasta 4 MB y hasta 60 segundos de procesamiento. Tiene restricciones de compatibilidad; por ejemplo, la guía lista GPUs y configuración de VPC entre las funciones no compatibles.
- **Asynchronous Inference** encola solicitudes grandes o de mayor duración y puede escalar a cero cuando no hay trabajo pendiente. Admite cargas de hasta 1 GB y un tiempo máximo de hasta 60 minutos por solicitud.
- **Batch Transform** procesa datos disponibles en Amazon S3 sin mantener un endpoint interactivo. Admite mini lotes de hasta 100 MB por invocación y hasta 60 minutos por invocación; el conjunto completo puede ser mucho mayor.

Consulta las [opciones y restricciones de inferencia de SageMaker AI](https://docs.aws.amazon.com/sagemaker/latest/dg/deploy-model-options.html) antes de elegir: los límites dependen de la modalidad, la solicitud, el contenedor y la configuración. La disponibilidad de funciones también cambia entre modalidades.

## Costos, permisos y problemas frecuentes

No supongas que una práctica será gratuita por usar AWS. El precio depende del servicio, la región, el tipo y duración del cómputo, el almacenamiento y las solicitudes. Los trabajos de entrenamiento consumen cómputo mientras se ejecutan; una aplicación de JupyterLab puede generar cargos aunque no hayas lanzado trabajos desde ella; y un endpoint real-time puede seguir activo entre solicitudes. Revisa la [página de precios de SageMaker AI](https://aws.amazon.com/sagemaker/ai/pricing/), el nivel gratuito aplicable a tu cuenta y los recursos que quedan después de una prueba. El nivel gratuito tiene condiciones y límites por servicio; no es una exención general de costos.

SageMaker AI utiliza roles de IAM para acceder a datos y recursos de AWS en nombre de una persona o trabajo. Concede solo los permisos que necesita el flujo —por ejemplo, leer una ubicación concreta de S3 y escribir artefactos donde corresponde— y evita credenciales permanentes dentro de notebooks. La [guía de roles de ejecución de SageMaker AI](https://docs.aws.amazon.com/sagemaker/latest/dg/sagemaker-roles.html) explica el mecanismo y sus permisos.

Cuando algo falla, separa estos diagnósticos:

- **Error de acceso o modelo:** confirma la región, el nombre y disponibilidad del modelo, la identidad que ejecuta la llamada y los permisos para el servicio y los datos.
- **Predicciones incorrectas:** revisa etiquetas, columnas, orden y transformaciones. La entrada de inferencia debe tener la misma preparación que los datos de entrenamiento.
- **Buen resultado en pruebas, malo en producción:** comprueba duplicados o fuga entre conjuntos, cambios de distribución, datos faltantes y diferencias entre los casos evaluados y los reales.
- **Latencia inesperada:** mide por separado el tiempo de inicialización, la preparación de datos y la respuesta del modelo. Un endpoint serverless puede experimentar cold starts; el tamaño del modelo, la carga y la modalidad también influyen.
- **Calidad que cae con el tiempo:** compara las entradas y las predicciones con una referencia y, cuando haya etiquetas reales, vuelve a medir la calidad por categoría. Un monitor automático requiere una configuración y una modalidad compatibles; no reemplaza esa evaluación.

La grabación [“Resolviendo problemas con Machine Learning en producción”, de Charlas Técnicas de AWS](https://www.youtube.com/watch?v=lbNaNNbTsNc), publicada en 2021, aporta otra conversación sobre ese tema. Revisa sus referencias a servicios con cautela: las herramientas disponibles han cambiado desde entonces.

## Cómo reconocer tutoriales antiguos de machine learning en AWS

Si encuentras una guía que incluye estos servicios, no la uses como una receta de despliegue actual. **AWS DeepLens cerró por completo el 31 de enero de 2024**; sus proyectos y acceso a la consola ya no están disponibles. **Amazon Forecast dejó de aceptar nuevos clientes**, aunque quienes ya lo usan pueden continuar con el servicio. Además, AWS informa que **Amazon SageMaker Model Monitor no está abierto a nuevos clientes**; los clientes existentes pueden seguir usándolo. Revisa las condiciones de estos servicios antes de seguir guías antiguas: [servicios de AWS en cierre completo](https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html), [disponibilidad de Amazon Forecast](https://docs.aws.amazon.com/forecast/latest/dg/what-is-forecast.html) y [documentación de SageMaker Model Monitor](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor.html).

## Recursos y comunidades para seguir aprendiendo

- Para descubrir más APIs de IA preparadas, consulta el [catálogo oficial de servicios de AWS](https://aws.amazon.com/ai/services/).
- Para compartir preguntas y experiencias generales de AWS desde Córdoba, visita el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/). Si estás en otra ciudad o país, explora el [directorio general de comunidades AWS](https://dondeaprendoaws.com/comunidades/) y revisa cada perfil para conocer su enfoque y participación. Para conversar sobre ML en la región, consulta el [AWS UG Machine Learning Latam](https://www.meetup.com/aws-ug-machine-learning-latam/).
- Si quieres elegir una formación o decidir si una certificación encaja con tu objetivo, sigue con esta [guía propia sobre AWS Training y Certification](https://dondeaprendoaws.com/blog/10-preguntas-frecuentes-sobre-aws-training-y-certification/). Allí puedes comparar esas rutas sin confundir una actividad de aprendizaje con un examen.
- Busca charlas, talleres y encuentros en la [agenda de eventos AWS de Latinoamérica](https://dondeaprendoaws.com/eventos/) o filtra la [agenda de Argentina](https://dondeaprendoaws.com/eventos/argentina/). Las fichas indican modalidad, fecha y datos de inscripción; compruébalos antes de organizarte.

## Preguntas frecuentes sobre machine learning en AWS

### ¿Amazon Bedrock sirve para entrenar cualquier modelo de machine learning?

No. Bedrock facilita el uso de modelos fundacionales para aplicaciones generativas y ofrece opciones de personalización para modelos compatibles. Para desarrollar un clasificador tabular o controlar un flujo de entrenamiento propio, SageMaker AI suele ser la opción más directa.

### ¿Amazon SageMaker AI es gratuito para practicar?

No hay una exención general de costos por usar AWS. Algunas cuentas pueden reunir los requisitos de ofertas con límites y condiciones; el cómputo y almacenamiento fuera de esos límites se facturan. Revisa los precios vigentes para tu cuenta, región y modalidad antes de crear recursos.

### ¿Qué significa que los datos tengan drift?

Que la distribución de los datos de entrada o la relación entre entradas y respuestas reales cambió respecto de lo que el modelo vio al desarrollarse. Una diferencia no obliga por sí sola a reentrenar: primero confirma qué cambió y si afectó el resultado que importa.
