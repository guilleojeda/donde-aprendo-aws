---
title: "10 repositorios de GitHub para aprender Machine Learning en AWS"
description: "Elige ejemplos de SageMaker AI, fundamentos de ML, MLOps y Amazon Bedrock. Repositorios verificados, requisitos, costos y recursos en español."
author: "guille-ojeda"
publishedAt: "2024-10-27"
publishedTimestamp: "2024-10-27T03:07:38.015Z"
modifiedTimestamp: "2026-10-04T21:31:45-03:00"
review:
  date: "2026-10-04"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related: []
---

Si buscas **repositorios de GitHub para Machine Learning en AWS**, empieza por [Amazon SageMaker Examples](https://github.com/aws/amazon-sagemaker-examples) para entrenar y desplegar modelos, o por [MLOps: from idea to production](https://github.com/aws-samples/amazon-sagemaker-from-idea-to-production) si ya tienes un notebook y quieres convertirlo en un flujo reproducible. Si todavía te cuesta evaluar un modelo, comienza con los materiales de Machine Learning University antes de crear infraestructura.

Esta selección reúne diez repositorios con tareas distintas. Incluye fundamentos que puedes estudiar fuera de AWS, ejemplos de **Amazon SageMaker AI** y dos opciones de IA generativa con **Amazon Bedrock**. La lista te ayuda a elegir qué leer y practicar; la documentación de cada ejemplo determina sus versiones, permisos y recursos necesarios.

## Qué repositorio elegir según tu objetivo

| Quieres… | Repositorio | Punto de entrada |
| --- | --- | --- |
| Entender cómo evaluar modelos | MLU-Explain | Ensayos visuales publicados |
| Practicar con datos de tablas | MLU Accelerated Tabular Data | `MLU-MAIN.ipynb` y `notebooks/` |
| Aprender procesamiento de lenguaje natural | MLU Accelerated NLP | Notebooks de procesamiento de texto |
| Entrenar, desplegar y monitorear en AWS | Amazon SageMaker Examples | Carpeta de la capacidad que necesitas |
| Construir un flujo de MLOps | SageMaker: from idea to production | `00-start-here.ipynb` |
| Entender o adaptar llamadas en Python | SageMaker Python SDK | Ejemplos de la versión que uses |
| Depurar entrenamiento en tu máquina | SageMaker Local Mode | README del ejemplo y requisitos de Docker |
| Elegir un contenedor de ML | AWS Deep Learning Containers | Documentación de imágenes disponibles |
| Explorar RAG y modelos generativos | Amazon Bedrock Samples | `introduction-to-bedrock/` |
| Seguir un proyecto en español | Copiloto de Código, de Hazel Sáenz | README del primer episodio |

Los nombres de algunas carpetas y proyectos conservan “SageMaker”, aunque la documentación actual denomina al servicio de construcción, entrenamiento y despliegue **SageMaker AI**. Puedes consultar la [definición de SageMaker AI](https://docs.aws.amazon.com/sagemaker/latest/dg/whatis.html) para ubicarlo dentro de la oferta de AWS.

## Antes de ejecutar: entorno, permisos y costos

Para leer los repositorios no necesitas una cuenta AWS. Para ejecutar notebooks locales necesitarás Python, Jupyter y las dependencias del curso o ejemplo. Los ejemplos que llaman a SageMaker AI o Bedrock requieren una cuenta, credenciales autorizadas y servicios disponibles en la Región elegida. Un notebook local también puede iniciar trabajos en AWS: revisa cada celda antes de ejecutarla.

En SageMaker AI distingue **tu identidad de acceso** del **rol de ejecución que utiliza el servicio**. Ese rol debe poder acceder a los datos, imágenes y demás recursos del ejercicio; la [documentación de roles de ejecución](https://docs.aws.amazon.com/sagemaker/latest/dg/sagemaker-roles.html) explica su función. Si un taller solicita políticas amplias, revisa el alcance antes de usarlo en una cuenta compartida. Para Bedrock, comprueba además los [requisitos de acceso al modelo elegido](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).

**El código público no implica ejecución gratuita.** SageMaker AI puede cobrar por el entorno de trabajo, procesamiento, entrenamiento, inferencia y almacenamiento; Bedrock tiene precios que dependen del modelo y la modalidad de uso. Consulta los [precios de SageMaker AI](https://aws.amazon.com/sagemaker/ai/pricing/) y los [precios de Bedrock](https://aws.amazon.com/bedrock/pricing/) para tu experimento. Anota qué crearás y cómo lo borrarás antes de desplegar. Si todavía no manejas S3, IAM o una alerta de costos, los [laboratorios de AWS para principiantes](/blog/10-laboratorios-practicos-de-aws-para-principiantes/) te permiten practicar esas bases primero.

## 1. MLU-Explain: comprender el resultado antes de entrenar más

[MLU-Explain en GitHub](https://github.com/mlu-explain/mlu-explain.github.io) contiene el sitio de ensayos visuales de Machine Learning University, una iniciativa educativa de Amazon. Puedes abrir directamente [MLU-Explain](https://mlu-explain.github.io/) y explorar separación de datos de entrenamiento, validación y prueba, precision y recall, árboles de decisión, regresión y curvas ROC/AUC.

**Úsalo cuando:** obtienes una cifra de accuracy pero no sabes si responde a tu problema. Empieza por los conjuntos de datos y luego por precision/recall; intenta explicar qué errores tendría mayor importancia evitar en tu caso. Leer las visualizaciones publicadas no requiere desplegar recursos AWS.

Para acompañarlo con una explicación en español, Marcia Villalba tiene una [introducción a Machine Learning y sus algoritmos](https://www.youtube.com/watch?v=ej21aS52Nak). Es una grabación conceptual para situar los términos antes de abrir notebooks.

## 2. MLU Accelerated Tabular Data: practicar con tablas

El repositorio [aws-machine-learning-university-accelerated-tab](https://github.com/aws-samples/aws-machine-learning-university-accelerated-tab) reúne diapositivas, notebooks y datasets de un curso sobre datos tabulares: análisis exploratorio, evaluación, ingeniería de características y modelos como KNN, árboles y regresión. `MLU-MAIN.ipynb` organiza el material, y el README enlaza las clases grabadas.

**Úsalo cuando:** tus datos se parecen a una hoja de cálculo y quieres aprender a pasar de columnas a un modelo evaluable. Empieza con exploración y evaluación, antes de comparar algoritmos. Revisa `requirements.txt` y el entorno de cada notebook.

Los datos del curso tienen restricciones de uso específicas; **la licencia del código no concede automáticamente permiso para reutilizar esos datasets en un producto**. Lee los archivos de licencia correspondientes antes de copiar datos o diapositivas. Como apoyo en español, AWS Girls Chile ofrece la grabación [Introducción con Python en SageMaker: visualización de datos](https://www.youtube.com/watch?v=lTdINoj14w4).

## 3. MLU Accelerated NLP: aprender a trabajar con texto

[aws-machine-learning-university-accelerated-nlp](https://github.com/aws-samples/aws-machine-learning-university-accelerated-nlp) incluye clases, notebooks y datos para procesamiento de lenguaje natural. El recorrido pasa por procesamiento de texto, bag of words, modelos clásicos, embeddings y redes neuronales.

**Úsalo cuando:** quieres entender cómo representar texto y evaluar un clasificador, antes de elegir un modelo generativo. Empieza por el notebook de procesamiento de texto de la primera clase. Comprueba las dependencias y las condiciones de los datos, que también se distinguen de las licencias del código y las diapositivas.

Carlos Cortez explica el mapa de opciones en [Empezando con NLP en AWS desde cero](https://dev.to/aws-builders/empezando-con-nlp-en-aws-desde-cero-nlp-series-1-3nak), y su [episodio sobre Hugging Face y SageMaker](https://www.youtube.com/watch?v=4yJFcv1sASA) amplía ese contexto. Ambos son recursos de 2021: sirven para entender el recorrido, mientras que las versiones e instrucciones de ejecución deben contrastarse con la documentación actual.

## 4. Amazon SageMaker Examples: buscar una capacidad concreta

[aws/amazon-sagemaker-examples](https://github.com/aws/amazon-sagemaker-examples) es el repositorio oficial de ejemplos mantenido por el equipo de SageMaker. Organiza notebooks por preparación de datos, construcción y entrenamiento, despliegue y monitoreo, y ciclos completos de ML.

**Úsalo cuando:** ya sabes qué quieres probar, como entrenar un modelo o comparar opciones de inferencia. Abre la carpeta correspondiente y lee las instrucciones del notebook. Si necesitas una primera ejecución guiada, la [guía oficial con XGBoost](https://docs.aws.amazon.com/sagemaker/latest/dg/gs-console.html) recorre preparación, entrenamiento, despliegue, evaluación y limpieza.

Puedes descargar el repositorio desde una terminal con Git:

```bash
git clone --depth 1 https://github.com/aws/amazon-sagemaker-examples.git
cd amazon-sagemaker-examples
```

Estos comandos descargan archivos; ejecutar después un notebook puede crear recursos facturables. Para ubicar el flujo en español, mira [Machine Learning para developers con Amazon SageMaker](https://www.youtube.com/watch?v=4IAJOSCwWOo), del AWS User Group Perú. Si prefieres leer una presentación introductoria, Vicente G. Guzmán comparte [SageMaker: transformando el aprendizaje automático en AWS](https://vicenteguzman.com/aws/2024-08-27-sagemaker-ml-aws/), con material de su sesión para AWS Women Colombia.

## 5. From idea to production: avanzar de notebook a MLOps

[amazon-sagemaker-from-idea-to-production](https://github.com/aws-samples/amazon-sagemaker-from-idea-to-production) propone una secuencia de notebooks que incorpora procesamiento y entrenamiento gestionados, Pipelines, registro de modelos y otras capacidades de MLOps. El material parte de un experimento y añade automatización y operación progresivamente.

**Úsalo cuando:** ya entrenas un modelo y necesitas reproducir el trabajo y seguir lo que desplegaste. Lee primero los requisitos de la cuenta y Studio, ejecuta `00-start-here.ipynb` y sigue el orden indicado. El taller tiene un [notebook de limpieza](https://github.com/aws-samples/amazon-sagemaker-from-idea-to-production/blob/master/99-clean-up.ipynb); revísalo antes de crear el entorno.

Para escuchar experiencias en español, el AWS User Group Perú publicó [AWS ML Day con SageMaker, MLOps e IoT](https://www.youtube.com/watch?v=NVEbOgBTNSk), y Charlas Técnicas de AWS tiene un episodio sobre [problemas de Machine Learning en producción](https://www.youtube.com/watch?v=lbNaNNbTsNc). Son grabaciones para ampliar el contexto de operación, no instrucciones que debas aplicar a todos los proyectos.

## 6. SageMaker Python SDK: comprobar la versión de tus ejemplos

[aws/sagemaker-python-sdk](https://github.com/aws/sagemaker-python-sdk) contiene la biblioteca de Python para entrenar y desplegar modelos con SageMaker, además de documentación y ejemplos.

**Úsalo cuando:** necesitas entender una llamada del notebook, adaptar el flujo o resolver una incompatibilidad. Hay un cambio importante: **V3 no mantiene las interfaces V2 `Estimator`, `Model` y `Predictor`**. El repositorio presenta `ModelTrainer` para entrenamiento y `ModelBuilder` para despliegue, y conserva referencias a ejemplos V2.

Antes de instalar o actualizar `sagemaker`, identifica qué versión espera tu notebook. Si utiliza V2, sigue su entorno declarado; si quieres migrarlo, consulta la [guía oficial de migración de V2 a V3](https://github.com/aws/sagemaker-python-sdk/blob/master/migration.md). Actualizar todas las dependencias al último número disponible puede romper un ejemplo que antes tenía un entorno compatible.

## 7. SageMaker Local Mode: depurar con Docker

[amazon-sagemaker-local-mode](https://github.com/aws-samples/amazon-sagemaker-local-mode) reúne ejemplos de procesamiento, entrenamiento, depuración y ejecución de inferencia local mediante contenedores. Incluye casos con frameworks y contenedores propios.

**Úsalo cuando:** quieres detectar un error en el script o en el empaquetado antes de enviar otro trabajo gestionado. Necesitas Docker y los requisitos del ejemplo. Revisa si carga datos desde S3 o llama a AWS: “local” describe dónde se ejecuta parte del cómputo, pero no asegura que todo el flujo ocurra fuera de la nube.

También existe modo local dentro de Studio, con [requisitos específicos de acceso a Docker](https://docs.aws.amazon.com/sagemaker/latest/dg/studio-updated-local-get-started.html). En ese caso sigues utilizando un entorno de Studio que puede generar cargos. No adoptes una configuración de GPU o instancia únicamente porque aparece en una captura del README.

## 8. AWS Deep Learning Containers: elegir una imagen compatible

[aws/deep-learning-containers](https://github.com/aws/deep-learning-containers) reúne el proyecto y la documentación de imágenes Docker preconstruidas para cargas de IA y ML. La [referencia de imágenes disponibles](https://aws.github.io/deep-learning-containers/reference/available_images/) distingue frameworks, entrenamiento, inferencia y plataformas de ejecución.

**Úsalo cuando:** necesitas una imagen para tu framework y tu destino de despliegue. Elige desde la referencia actual; verifica versión, arquitectura y compatibilidad con CPU o GPU. Copiar una URI antigua de un artículo puede dejarte con una imagen distinta de la que necesitas.

El AWS Users Group Paraguay tiene una grabación sobre [redes neuronales con TensorFlow en SageMaker](https://www.youtube.com/watch?v=yzAd3XLWjLU) para ver un caso de uso. Sus versiones corresponden a la grabación: usa la tabla oficial para elegir la imagen de tu práctica.

## 9. Amazon Bedrock Samples: explorar IA generativa

[amazon-bedrock-samples](https://github.com/aws-samples/amazon-bedrock-samples) incluye introducción a Bedrock, ejemplos de agentes, embeddings, RAG —recuperar información para dar contexto al modelo—, evaluación y otros usos generativos.

**Úsalo cuando:** tu objetivo es construir una aplicación sobre un modelo generativo disponible en Bedrock. Empieza por `introduction-to-bedrock/` y luego elige una tarea. Revisa el README de esa carpeta, el acceso al modelo, la Región y sus costos; un ejemplo de RAG puede añadir almacenamiento y servicios de búsqueda.

Para continuar en español con agentes, el catálogo incluye [Surfeando la nube, el canal de Ricardo Ceci](https://www.youtube.com/@ricardoceci-dev), y su [clase introductoria de agentes en producción](https://www.youtube.com/watch?v=hGpJRxBMdfs). Comprueba en el canal los episodios disponibles y sus requisitos antes de seguir la serie.

## 10. Copiloto de Código: seguir un proyecto de la comunidad

[Copiloto-de-Codigo, de Hazel Sáenz](https://github.com/hsaenzG/Copiloto-de-Codigo), combina Strands Agents, Amazon Bedrock y Python para construir un agente que trabaja con repositorios de código. Cada episodio tiene su propia carpeta y guía.

**Úsalo cuando:** prefieres seguir cómo crece un mismo proyecto en español. Comienza por [El primer Copiloto](https://www.youtube.com/watch?v=sOdSN-Of5gE) y continúa con [Un copiloto que recuerda](https://www.youtube.com/watch?v=ZVgf1NWOCE4) para estudiar memoria de sesión. El README enlaza también el [canal de Hazel](https://www.youtube.com/@hazelsaenzG).

Al revisar este artículo, la serie sigue en curso y el repositorio distingue episodios publicados de próximos. No asumas que las capacidades previstas en su roadmap ya están implementadas. Lee los requisitos de cada episodio y usa un repositorio de práctica sin secretos para experimentar.

## Cómo convertir un ejemplo en aprendizaje útil

Elige una tarea y termina un ciclo pequeño: **datos → entrenamiento o llamada al modelo → evaluación → limpieza**. Conserva el nombre del notebook, el commit, las versiones y la Región para poder explicar qué ejecutaste. Después cambia una sola decisión —por ejemplo, una característica o un parámetro— y compara el resultado con el original.

Si trabajas con decisiones sobre personas, amplía la evaluación por grupos y estudia sus límites. Brenda Galicia comparte una introducción con notebook a [SageMaker Clarify e IA responsable](https://dev.to/bardengalicia/ia-responsable-con-amazon-sagemaker-clarify-mhc), y AWS Girls Chile ofrece una [sesión grabada sobre SageMaker Clarify](https://www.youtube.com/watch?v=x_MHs9hLx0s). Medir diferencias no demuestra por sí solo que un sistema sea justo: interpreta las métricas en el contexto del uso.

Al terminar, sigue la limpieza del ejemplo. Para el tutorial con Notebook Instances, la [guía oficial de limpieza](https://docs.aws.amazon.com/sagemaker/latest/dg/ex1-cleanup.html) incluye endpoint, configuración, modelo, notebook y datos. **Cerrar el navegador o parar el notebook no elimina un endpoint.** Si usaste Studio o un taller con más servicios, revisa también sus aplicaciones, almacenamiento y recursos adicionales según las instrucciones de ese proyecto.

## Comunidades y eventos para continuar

Lleva una pregunta concreta: qué notebook ejecutaste, qué versión utilizaste, qué esperabas y qué ocurrió. Comparte el mensaje de error sin credenciales ni datos privados. El catálogo tiene comunidades especializadas y grupos generales donde seguir aprendiendo:

- [AWS UG Machine Learning Latam](https://www.meetup.com/aws-ug-machine-learning-latam/), con base en Lima, se dedica a difundir ML en Latinoamérica y publica encuentros de ML e IA generativa.
- [AI AWS User Group Chile](https://www.meetup.com/es-es/ai-aws-ug-chile/) declara foco en SageMaker, Bedrock, RAG, MLOps e IA responsable, con charlas y demos para distintos niveles.
- [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) ofrece un espacio general de aprendizaje entre usuarios. Su [grabación Machine Learning de Cero a Hero](https://www.youtube.com/watch?v=0kia26HQxs0) permite conocer contenido del grupo antes de participar.
- [AWS User Group Panamá](https://www.meetup.com/aws-user-group-panama/) publica encuentros sobre AWS y tiene actividades relacionadas con agentes y Bedrock.

La [agenda de eventos del catálogo](/eventos/) permite buscar una actividad por país y modalidad. Como referencias publicadas al revisar esta guía el 4 de octubre de 2026, aparecen el [Workshop day de Bedrock, Strands y MCP de Panamá](https://www.meetup.com/aws-user-group-panama/events/316730635/), anunciado presencial para el 13 de octubre, y [SegurAWS Américas sobre Bedrock Guardrails](https://www.meetup.com/aws-ug-cardenas/events/316670420/), anunciado en línea para el 19 de noviembre. Revisa cada ficha para confirmar registro, horario, lugar o enlace de conexión y condiciones vigentes.

Para encontrar más explicaciones de la tarea que elegiste, visita [Aprender AWS](/aprender/) y el directorio de [creadores y canales](/creadores/). Puedes estudiar con recursos publicados en otro país; para participar en vivo, elige por tema, modalidad y horario.

## Preguntas frecuentes

### ¿Qué repositorio conviene si recién empiezo?

Si te falta base de ML, comienza por MLU-Explain y el curso de datos tabulares. Si ya manejas Python y entiendes entrenamiento y evaluación, elige un ejemplo pequeño de Amazon SageMaker Examples. No necesitas recorrer los diez repositorios en orden.

### ¿Puedo ejecutar los ejemplos gratis?

Leer GitHub y las explicaciones publicadas no crea recursos AWS. La ejecución local utiliza tu equipo; las llamadas a servicios, el entorno de Studio y los recursos desplegados pueden tener costos. Comprueba las condiciones de tu cuenta y el ejercicio concreto antes de empezar.

### ¿Estos repositorios están listos para producción?

Son materiales para aprender, explorar APIs o construir una base de trabajo. Antes de adoptar un ejemplo, comprueba su licencia, dependencias, permisos, evaluación con tus datos, costos y operación. Que pertenezca a una organización oficial no garantiza que funcione sin cambios en tu entorno.

### ¿SageMaker AI o Bedrock para mi primer proyecto?

Elige según la tarea. Los ejemplos de SageMaker AI sirven para estudiar construcción, entrenamiento, despliegue y operación de modelos. Los de Bedrock se enfocan en aplicaciones con modelos generativos y sus capacidades. Para empezar, define qué entrada recibirás y cómo comprobarás que la salida es útil; después elige el ejemplo que permita practicar eso.
