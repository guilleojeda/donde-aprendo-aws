---
title: "Mejores prácticas de machine learning en AWS: evaluación y MLOps"
description: "Evalúa modelos y organiza MLOps en AWS con SageMaker AI: evita fuga de datos, compara referencias, registra versiones y controla operación y costos."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:46:53.199Z"
modifiedTimestamp: "2026-10-06T17:50:38-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Cómo entrenar y desplegar un modelo en Amazon SageMaker AI"
    url: "https://dondeaprendoaws.com/blog/guia-para-implementar-machine-learning-con-amazon-sagemaker/"
  - title: "Mejores prácticas de DevOps en AWS: CI/CD, IaC y despliegues seguros"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/"
---

Las mejores prácticas de machine learning en AWS empiezan por medir si un modelo ayuda a tomar una decisión y continúan con un flujo que otra persona pueda repetir y revisar. Para un modelo predictivo, separa los datos antes de transformarlos, compara contra una regla o proceso actual, conserva una prueba final independiente y define qué tiene que ocurrir antes de desplegar.

Amazon SageMaker AI ofrece componentes para preparar datos, entrenar y evaluar modelos, orquestar pasos con Pipelines y registrar versiones en Model Registry. Esas herramientas ayudan a operar el ciclo de vida; no eligen la métrica correcta para tu negocio ni convierten por sí solas un cambio de datos en una razón para volver a entrenar.

## SageMaker AI, SageMaker y Bedrock

En la documentación actual, **Amazon SageMaker AI** es el servicio enfocado en desarrollar, entrenar y desplegar modelos de IA y machine learning. **Amazon SageMaker** es el nombre más amplio de la plataforma de datos, analítica e IA, que incluye Amazon SageMaker Unified Studio y permite acceder a SageMaker AI. En guías anteriores, el servicio de ML suele aparecer simplemente como “SageMaker”. [AWS explica los nombres actuales](https://docs.aws.amazon.com/next-generation-sagemaker/latest/userguide/what-is-sagemaker.html).

Para predecir una categoría, un riesgo o una cantidad a partir de datos propios, SageMaker AI puede servir para desarrollar y operar el modelo. **Amazon Bedrock** se orienta a aplicaciones generativas basadas en modelos fundacionales, como generación de texto o respuestas apoyadas en documentos recuperados (RAG). Hay capacidades que se superponen, pero los objetivos son distintos; revisa la [guía de decisión entre Bedrock y SageMaker AI](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/bedrock-or-sagemaker.html) según cuánto control y personalización necesites.

## Define cómo vas a evaluar el resultado

Antes de elegir un algoritmo o un tipo de instancia, escribe qué predice el modelo, cuándo se tomaría esa predicción y qué decisión podría cambiar. Comprueba que la etiqueta objetivo sea confiable y que cada característica exista en el momento de predecir. Una columna creada después de la decisión —por ejemplo, el resultado confirmado que se intenta anticipar— filtraría la respuesta al modelo.

Elige una **referencia sencilla** para poder juzgar si ML aporta valor: puede ser una regla existente, una predicción constante o un modelo simple. Define de antemano qué errores importan más. En una clasificación con pocas observaciones positivas, la exactitud global puede verse alta aunque el modelo no encuentre suficientes positivos; compara métricas apropiadas, como precisión y recall, y revisa los errores por clase. Para regresión, considera métricas como MAE o RMSE. La elección depende del problema; ningún promedio demuestra por sí solo que el flujo de trabajo haya mejorado.

Por ejemplo, en 1.000 casos con 10 positivos, predecir siempre «negativo» logra un 99 % de exactitud y detecta cero de los positivos. La [precisión](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.precision_score.html) indica qué proporción de los positivos predichos es correcta; el [recall](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.recall_score.html), qué proporción de los positivos reales detectas. En ese ejemplo, el recall es cero. Decide qué errores puedes tolerar antes de elegir una métrica o un umbral.

Si usas un umbral para convertir una puntuación en una decisión, selecciónalo con los datos de validación. No ajustes ese umbral ni el modelo con el conjunto de prueba que usarás para informar el resultado final.

## Separa los datos antes de procesarlos

Divide los registros en entrenamiento, validación y prueba **antes** de ajustar transformaciones. Completar valores faltantes, normalizar números, seleccionar características o codificar categorías puede revelar información del conjunto reservado si calculas sus parámetros usando todos los datos.

- **Entrenamiento:** aprende los parámetros del modelo y de las transformaciones.
- **Validación:** permite comparar modelos, ajustar hiperparámetros y elegir umbrales durante el desarrollo.
- **Prueba:** queda apartada hasta que hayas tomado esas decisiones; úsala para una evaluación final independiente.

Mantén juntas las filas de una misma persona, cuenta, dispositivo o sesión cuando estén relacionadas. Si el modelo se usará para predecir el futuro, separa por tiempo para que registros posteriores no ayuden a predecir los anteriores. Una división aleatoria solo representa bien el uso real cuando los registros son suficientemente independientes y esa mezcla coincide con el problema. La [guía de scikit-learn sobre fuga de datos](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage) explica por qué las transformaciones deben aprenderse con entrenamiento y aplicarse después a validación y prueba.

## Repite el flujo con SageMaker Pipelines

**MLOps** es organizar cómo se preparan los datos, se entrenan y revisan los modelos, y luego se publican y observan en uso, con prácticas de desarrollo y operación de software. Así puedes repetir el flujo, revisar sus versiones y decidir cuáles promover. Un notebook es útil para explorar datos y comprobar una hipótesis. Cuando necesites repetir el trabajo, compartirlo o aplicar criterios consistentes antes de registrar un modelo, convierte los pasos pertinentes en un flujo versionado.

**Amazon SageMaker Pipelines** permite conectar pasos de procesamiento, entrenamiento, evaluación y registro de modelos. Puedes añadir un paso `Condition` y ubicar el registro en la rama que se ejecuta solo si se cumple una métrica de evaluación; así, la condición puede impedir que un candidato que no cumple el criterio llegue al registro. La condición forma parte de la pipeline que diseñes: no todas las pipelines la incluyen ni el registro depende de ella por defecto. La [descripción oficial de Pipelines](https://docs.aws.amazon.com/sagemaker/latest/dg/pipelines-overview.html) muestra este patrón.

Para poder explicar y reproducir una ejecución, registra al menos:

- la versión o ubicación inmutable del conjunto de datos y las reglas de preparación;
- el código y las dependencias del entrenamiento, junto con el contenedor o entorno utilizado;
- los parámetros, las métricas de evaluación y la ubicación del artefacto generado;
- la identidad de la ejecución y la decisión que habilita o rechaza su promoción.

Una pipeline automatiza los pasos que diseñaste. No determina si una etiqueta tiene sentido, si tu umbral es aceptable ni si una nueva versión debe llegar a producción.

### Acota los permisos de cada ejecución

Los trabajos de SageMaker AI usan un rol de ejecución para acceder a datos y artefactos de otros servicios, como Amazon S3. Concede al rol los permisos que requiere el flujo y acótalos a las ubicaciones de entrada y salida del proyecto; la [guía oficial de roles de ejecución](https://docs.aws.amazon.com/sagemaker/latest/dg/sagemaker-roles.html) muestra cómo se usan esos permisos.

### Registra y aprueba cada versión

Amazon SageMaker Model Registry organiza modelos en grupos y versiones, y puede asociarles métricas, metadatos y linaje. Registra cada candidato que cumpla tus criterios con el resultado de evaluación y deja visible cuál versión está desplegada. La [guía de Model Registry](https://docs.aws.amazon.com/sagemaker/latest/dg/model-registry.html) describe ese ciclo.

Define quién o qué puede aprobar una versión y cuáles son las condiciones. SageMaker AI permite que el estado **Approved** inicie una implementación cuando la cuenta tenga configurada la integración de CI/CD correspondiente; ese cambio no crea por sí solo un pipeline de despliegue. Puedes conservar aprobación manual o automatizarla si el criterio está definido y comprobado. Consulta [cómo funciona la aprobación de versiones](https://docs.aws.amazon.com/sagemaker/latest/dg/model-registry-approve.html).

Para llevar esta promoción desde el repositorio hasta pruebas, infraestructura y reversión, consulta [Mejores prácticas de DevOps en AWS: CI/CD, IaC y despliegues seguros](/blog/mejores-practicas-aws-para-devops/).

### Charlas sobre MLOps y arquitectura

Las grabaciones pueden aportar perspectivas de equipos que operan modelos, aunque sus herramientas y consolas ya no coincidan con las actuales:

- [MLOps en AWS con Jenny Vega, ML Engineer en Rappi](https://www.youtube.com/watch?v=1G2CC7TRZYU) es una charla de 2020 publicada en el [canal del AWS User Group Perú](https://www.youtube.com/@AWSUserGroupPeru). Úsala como perspectiva de una profesional de ML, no como procedimiento actual de consola.
- [13 patrones de arquitectura en MLOps, con Jenny Lucía](https://www.youtube.com/watch?v=nV12mB7GjZ0) es otra grabación de la conferencia del AWS User Group Perú, publicada en 2021. El canal comunitario reúne esta y otras sesiones; contrasta cualquier detalle de servicios con la documentación vigente.
- [Complete: AWS Meetup #47 AWS ML Day con SageMaker, MLOps y Primeros pasos con AWS IoT](https://www.youtube.com/watch?v=NVEbOgBTNSk) es una grabación comunitaria del AWS User Group Perú. Dura casi cuatro horas y su ficha no muestra capítulos; puede servir como archivo amplio para explorar esos temas, no como guía paso a paso.

Si prefieres explorar una jornada con varios temas, la grabación [AWS Meetup #47: AWS ML Day con SageMaker, MLOps e IoT](https://www.youtube.com/watch?v=NVEbOgBTNSk), del mismo grupo, es un archivo de 2020 de unas tres horas y cuarenta minutos. Elige los bloques relacionados con tu objetivo; es un archivo comunitario para seguir aprendiendo, y sus demostraciones deben contrastarse con los servicios actuales.

## Despliega según el uso y verifica la aplicación

Elige inferencia por la forma de uso: un trabajo por lotes sirve cuando los datos llegan en archivos y no se necesita una respuesta interactiva; un endpoint sirve cuando una aplicación envía solicitudes y espera predicciones. Mide latencia, errores y volumen con solicitudes representativas, y comprueba que la aplicación interprete correctamente la respuesta del modelo. La [comparación de opciones de despliegue de SageMaker AI](https://docs.aws.amazon.com/sagemaker/latest/dg/deploy-model-options.html) detalla alternativas y compatibilidad.

Promueve la versión registrada que pasó tus criterios. Si una implementación falla, los registros y métricas técnicos ayudan a diagnosticar la integración; no demuestran que el modelo sea útil. Conserva la versión anterior y un procedimiento conocido de reversión si tu proceso requiere recuperar el comportamiento previo.

## Observa señales técnicas y calidad del modelo por separado

En producción, observa si el servicio responde como esperas y si las predicciones conservan valor. CloudWatch ofrece métricas de endpoints de SageMaker AI para solicitudes, errores y latencia; puedes sumar métricas propias del negocio. Consulta las [métricas de SageMaker AI en CloudWatch](https://docs.aws.amazon.com/sagemaker/latest/dg/monitoring-cloudwatch.html).

Una variación en la distribución de los datos es una señal para investigar, no una medida directa de que la calidad del modelo haya bajado. Para medir rendimiento real necesitas etiquetas de los casos predichos y comparar las predicciones con esas etiquetas. Si las etiquetas llegan tarde, registra la correspondencia entre cada predicción y su resultado real; evalúa métricas y segmentos pertinentes cuando los datos lo permitan. Reentrena solo después de entender el cambio y confirmar que los datos y criterios nuevos representan el problema actual.

Para una perspectiva histórica sobre fallas al llevar modelos a producción, escucha [Resolviendo problemas con Machine Learning en producción](https://www.youtube.com/watch?v=lbNaNNbTsNc), un episodio de 2021 de Charlas Técnicas de AWS publicado en el [canal de Marcia](https://www.youtube.com/@marcia_). La descripción organiza el episodio en capítulos sobre combinar modelos, problemas con datos de inferencia, calidad de datos en el tiempo y herramientas de AWS. También enlaza una [lista de reproducción de episodios sobre Machine Learning](https://www.youtube.com/playlist?list=PLQh2jfOGN_IgJe01v7J0OZdvc8603pctS). Es contenido de un canal independiente, útil para pensar en fallas y prácticas; los nombres de servicios que menciona pueden haber cambiado.

**Dos funciones mencionadas en guías antiguas tienen un límite importante hoy:** Amazon SageMaker Model Monitor y SageMaker Clarify ya no están abiertos a nuevos clientes, y AWS indica que no planea incorporarles funciones nuevas; los clientes existentes pueden seguir usándolos. Model Monitor incluye comprobaciones de calidad de datos y modelo, sesgo y atribución de características, con límites según formato y tipo de endpoint. Clarify cubre análisis de sesgo y explicabilidad, entre otras funciones. Verifica la disponibilidad y los límites antes de basar un proyecto nuevo en ellos: consulta los avisos oficiales de [Model Monitor](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-availability-change.html) y [Clarify](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-availability-change.html).

Para proyectos nuevos, AWS documenta patrones de monitoreo con soluciones abiertas basadas en SageMaker AI MLflow y Evidently, además de CloudWatch y QuickSight según el caso. Estas soluciones se despliegan y personalizan en tu cuenta: el equipo sigue definiendo umbrales, permisos, disponibilidad de etiquetas, alertas y quién responde. La evaluación de Amazon Bedrock está orientada a modelos fundacionales y **no reemplaza** el análisis de sesgo o explicabilidad de un modelo predictivo tabular. Los [patrones de reemplazo de Model Monitor](https://docs.aws.amazon.com/sagemaker/latest/dg/model-monitor-availability-change.html) y la [guía de reemplazo de Clarify](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-availability-change.html) explican las opciones actuales.

## Revisa costos en cada etapa

El costo depende de la región, los recursos y el tiempo de uso. Incluye el entorno de desarrollo, los trabajos de procesamiento y entrenamiento, los experimentos de ajuste, el almacenamiento de datos y artefactos y la modalidad de inferencia. Un notebook o entorno de desarrollo puede consumir cómputo mientras sigue activo; los endpoints que mantienen capacidad y los trabajos periódicos de monitoreo también pueden seguir generando cargos aunque no haya solicitudes.

Antes de ejecutar, define el tamaño y tiempo máximos del experimento, mide una configuración representativa y consulta los [precios de SageMaker AI](https://aws.amazon.com/sagemaker/ai/pricing/). SageMaker permite limitar el tiempo máximo de un trabajo de entrenamiento con [`MaxRuntimeInSeconds`](https://docs.aws.amazon.com/sagemaker/latest/APIReference/API_StoppingCondition.html), que ayuda a acotar su duración; no limita el costo de otros recursos relacionados. Al terminar una prueba, elimina el endpoint de prueba que ya no necesites y revisa si quedan configuraciones de endpoint, modelos, trabajos de monitoreo, aplicaciones de desarrollo o datos en S3 que también deban limpiarse. Eliminar un endpoint libera sus recursos desplegados, pero no borra necesariamente los demás recursos del flujo; consulta la guía de [eliminación de endpoints y recursos](https://docs.aws.amazon.com/sagemaker/latest/dg/realtime-endpoints-delete-resources.html) antes de borrar artefactos que puedan seguir en uso.

## Recursos y comunidades para seguir

- El grupo [AWS UG Machine Learning Latam en Meetup](https://www.meetup.com/aws-ug-machine-learning-latam/) comparte actividades de machine learning para la comunidad latinoamericana. Revisa el temario y la modalidad de cada encuentro; la página también reúne eventos pasados.
- El portal de [AWS User Group Perú](https://awsugperu.cloud/) publica agenda, workshops, grupos de estudio y recursos generales de AWS. Aunque no se limita a machine learning, puede servir para encontrar compañeros y sesiones técnicas; su [canal de YouTube](https://www.youtube.com/@AWSUserGroupPeru) conserva charlas comunitarias de MLOps y machine learning.
- Para explorar otros meetups y talleres, consulta la [agenda de eventos de AWS en Latinoamérica](/eventos/). Confirma fechas, registro, lugar o modalidad en la página del organizador.

Si quieres recorrer un ejemplo supervisado con preparación, separación de datos, entrenamiento y despliegue, sigue la [guía para entrenar y desplegar un modelo en SageMaker AI](/blog/guia-para-implementar-machine-learning-con-amazon-sagemaker/). Contrasta los pasos concretos con la documentación de la versión y Región que vayas a utilizar.
