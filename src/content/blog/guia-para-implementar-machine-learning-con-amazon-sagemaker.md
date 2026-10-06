---
title: "Cómo entrenar y desplegar un modelo en Amazon SageMaker AI"
description: "Guía práctica de machine learning supervisado en SageMaker AI: prepara datos, evita fuga entre train, validation y test, evalúa el modelo y elige cómo servirlo."
author: "guille-ojeda"
publishedAt: "2025-03-06"
publishedTimestamp: "2025-03-06T03:07:26.337Z"
modifiedTimestamp: "2026-10-06T15:59:00-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Machine learning en AWS: cómo empezar y qué servicio elegir"
    url: "https://dondeaprendoaws.com/blog/10-preguntas-frecuentes-sobre-machine-learning-en-aws/"
  - title: "SageMaker Clarify para detectar sesgos en modelos de machine learning"
    url: "https://dondeaprendoaws.com/blog/deteccion-de-sesgos-en-modelos-ml-con-sagemaker-clarify/"
---

Entrenar un modelo con Amazon SageMaker AI implica más que iniciar un trabajo de cómputo. Primero hay que definir qué se quiere predecir, preparar datos representativos y reservar una evaluación que no influya en el entrenamiento. Después se elige cómo convertir el artefacto entrenado en predicciones útiles y se eliminan los recursos de prueba que puedan seguir generando cargos.

Esta guía recorre ese proceso con un ejemplo de clasificación supervisada sobre datos tabulares. Como referencia práctica usa el tutorial oficial de AWS con XGBoost. El formato de entrada, las métricas y las opciones compatibles dependen del algoritmo y de su versión; el ejemplo no convierte esas decisiones en reglas universales.

## SageMaker AI y SageMaker Unified Studio son cosas distintas

**Amazon SageMaker AI** es el servicio de AWS para desarrollar, entrenar y desplegar modelos de machine learning e inteligencia artificial. **Amazon SageMaker Unified Studio** es un entorno integrado que reúne herramientas de datos, analítica, IA y machine learning, e incluye acceso a capacidades de SageMaker AI. El nombre amplio de la plataforma es Amazon SageMaker.

La [presentación oficial de AWS](https://aws.amazon.com/blogs/aws/introducing-the-next-generation-of-amazon-sagemaker-the-center-for-all-your-data-analytics-and-ai/) explica el cambio de nombres. En documentación y tutoriales anteriores todavía aparecen “Amazon SageMaker” y “SageMaker Studio”; comprueba si un paso describe el servicio de ML o una experiencia de desarrollo anterior. Para elegir entre SageMaker AI, Amazon Bedrock y las API de IA preparadas para tareas concretas, consulta también esta [guía para elegir un servicio de machine learning en AWS](/blog/10-preguntas-frecuentes-sobre-machine-learning-en-aws/). Bedrock se orienta a aplicaciones generativas con modelos fundacionales; este recorrido trata un modelo predictivo supervisado.

## Antes de entrenar

Necesitas un conjunto de datos que puedas usar, una cuenta y región de AWS donde estén disponibles los recursos que requiere el tutorial, acceso a Amazon S3 y un rol de ejecución de SageMaker AI.

El rol de ejecución permite que SageMaker AI lea los datos y escriba los artefactos del modelo en los recursos autorizados. La identidad que lanza el trabajo también necesita permisos para iniciar las operaciones y pasar ese rol. Acota el acceso de S3 a los buckets y prefijos del proyecto, y evita guardar credenciales permanentes en notebooks. AWS describe [cómo funcionan los roles de ejecución y sus permisos](https://docs.aws.amazon.com/sagemaker/latest/dg/sagemaker-roles.html); la política administrada <code>AmazonSageMakerFullAccess</code> puede ser más amplia de lo que necesita un flujo concreto.

Revisa el precio de tu región antes de iniciar un notebook, un trabajo de entrenamiento o un endpoint. El cómputo de entrenamiento se factura mientras corre; una aplicación de notebook puede seguir usando cómputo aunque cierres la pestaña; un endpoint en tiempo real puede seguir activo entre solicitudes. Almacenar datos y artefactos en S3 también puede generar cargos. No hay una exención general de costos por usar SageMaker AI: consulta los [precios de SageMaker AI](https://aws.amazon.com/sagemaker/ai/pricing/) y las condiciones vigentes de tu cuenta.

## Flujo práctico: de los datos a las predicciones

### 1. Define el resultado que el modelo debe predecir

Empieza con una pregunta que puedas convertir en una etiqueta clara. En una clasificación binaria, la etiqueta puede indicar sí/no; en una clasificación multiclase, puede representar una categoría. Comprueba que las etiquetas sean suficientemente confiables y que las columnas usadas como entrada estén disponibles en el momento de hacer una predicción.

El tutorial de AWS usa el conjunto público Adult Census y XGBoost para ilustrar una clasificación tabular. Es un laboratorio técnico, no una decisión automática sobre cómo etiquetar o tratar casos reales.

Si primero quieres repasar los conceptos, la grabación de 2021 [“Introducción a Machine Learning y algoritmos”](https://www.youtube.com/watch?v=ej21aS52Nak), de Charlas Técnicas de AWS, presenta problemas de ML y tipos de algoritmos. Úsala como introducción conceptual, no como procedimiento actual de consola o SDK.

### 2. Separa entrenamiento, validación y prueba

Divide los registros antes de calcular estadísticas, completar valores faltantes, codificar categorías, normalizar variables o seleccionar características. Así, información del conjunto reservado no influye en el modelo.

- **Entrenamiento:** se usa para ajustar el modelo y aprender las transformaciones.
- **Validación:** se usa durante el desarrollo para comparar modelos y elegir hiperparámetros o un umbral de clasificación.
- **Prueba (test):** se mantiene aparte hasta que ya elegiste el modelo y sus parámetros. Se usa para una evaluación final sobre ejemplos que el modelo no vio.

Aplica las transformaciones aprendidas con entrenamiento a validación y prueba, sin volver a ajustarlas con esos conjuntos. No uses la prueba para seleccionar características, ajustar el modelo ni elegir el umbral: al hacerlo, deja de ser una evaluación independiente. Excluye también campos que solo se conocen después del resultado, porque revelarían la respuesta al modelo. La [guía de scikit-learn sobre fuga de datos](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage) explica por qué también hay que ajustar la imputación, normalización y selección de características solo con entrenamiento.

El tipo de división depende de cómo llegarán los datos reales. Una división aleatoria puede servir cuando los registros son independientes y representativos; en predicciones futuras, separa por tiempo. Si hay varias filas de la misma persona, cuenta, dispositivo o sesión, mantenlas en un solo conjunto para que copias relacionadas no aparezcan a la vez en entrenamiento y prueba. La [práctica guiada de AWS](https://docs.aws.amazon.com/sagemaker/latest/dg/ex1-preprocess-data.html) demuestra cómo preparar train, validation y test; sus proporciones son un ejemplo, no una regla para todos los proyectos.

Para explorar datos antes de entrenar, puedes complementar esta etapa con la grabación de 2021 [“Análisis de datos para Machine Learning”](https://www.youtube.com/watch?v=62s0OxI8SZw) de Charlas Técnicas de AWS y la sesión de 2022 [“Introducción con Python a la visualización de datos en SageMaker”](https://www.youtube.com/watch?v=lTdINoj14w4) de AWS Girls Chile, que presenta Matplotlib y Seaborn. Son sesiones comunitarias; consulta la documentación vigente para los pasos de cada herramienta.

### 3. Guarda los datos en S3 con el formato que espera el algoritmo

Organiza entradas y resultados bajo prefijos propios del proyecto. Por ejemplo, conserva rutas separadas para <code>train</code>, <code>validation</code>, <code>test</code>, artefactos del modelo y predicciones. El trabajo de entrenamiento suele recibir los conjuntos de entrenamiento y validación; mantén el de prueba fuera de esos canales hasta la evaluación final.

No conviertas todo a Parquet por defecto. El contrato depende del algoritmo, la versión del contenedor y la modalidad de entrada. El XGBoost integrado de SageMaker AI admite CSV, LibSVM, Parquet y RecordIO-Protobuf; para su entrada CSV de entrenamiento, AWS especifica que no haya encabezado y que la etiqueta esté en la primera columna. Para inferencia se envían las características sin la etiqueta, en el orden esperado por el modelo. Otros algoritmos tienen otros formatos y reglas. Consulta la tabla vigente de [formatos de entrada de XGBoost](https://docs.aws.amazon.com/sagemaker/latest/dg/xgboost-how-to-use.html) o la página del [algoritmo que elegiste](https://docs.aws.amazon.com/sagemaker/latest/dg/algos.html).

Si tu problema es de lenguaje natural, la grabación de 2021 [“Pie & AI Lima: primeros pasos con NLP en AWS usando BlazingText sobre SageMaker”](https://www.youtube.com/watch?v=cXH2XSXxa08) muestra otra ruta. Es un ejemplo específico de NLP y BlazingText, no un formato universal para datos tabulares; compara sus entradas con la documentación actual antes de adaptar el flujo.

### 4. Inicia un trabajo de entrenamiento y conserva su resultado

Para un primer modelo tabular, puedes seguir el tutorial oficial de AWS con el algoritmo integrado XGBoost. En SageMaker AI, un trabajo de entrenamiento usa datos, hiperparámetros y capacidad de cómputo; SageMaker provisiona los recursos para ejecutar el contenedor y guarda el artefacto resultante en S3.

La guía oficial actual usa **SageMaker Python SDK v3**, con clases como <code>ModelTrainer</code> e <code>InputData</code>; su ruta de despliegue usa <code>ModelBuilder</code>. Muchos tutoriales anteriores usan el patrón de SDK v2 con <code>Estimator</code>, <code>Model</code> y <code>Predictor</code>. La versión 3 tiene cambios incompatibles con la 2, como explica la [documentación oficial de SageMaker Python SDK v3](https://sagemaker.readthedocs.io/en/v3docs/). Boto3 es otra interfaz: ofrece acceso de bajo nivel a las API de AWS y no es una versión alternativa de SageMaker Python SDK. Sigue un tutorial completo de una sola interfaz, consulta su versión de paquete y fija esa versión al reproducirlo; no mezcles fragmentos de distintas generaciones.

Puedes seguir los pasos de AWS en este orden: [preparar el conjunto de datos](https://docs.aws.amazon.com/sagemaker/latest/dg/ex1-preprocess-data.html), [entrenar con XGBoost](https://docs.aws.amazon.com/sagemaker/latest/dg/ex1-train-model.html), [desplegar el modelo](https://docs.aws.amazon.com/sagemaker/latest/dg/ex1-model-deployment.html) y [evaluar sus predicciones](https://docs.aws.amazon.com/sagemaker/latest/dg/ex1-test-model.html). La guía de entrenamiento indica los requisitos de su SDK y muestra cómo enviar entrenamiento y validación al trabajo. Antes de copiar una versión de contenedor o tipo de instancia, revisa la compatibilidad y disponibilidad en tu región.

Como complemento, puedes ver la sesión de 2021 [“Machine Learning para developers con Amazon SageMaker”](https://www.youtube.com/watch?v=4IAJOSCwWOo) del AWS User Group Perú o leer el resumen comunitario [“SageMaker - Transformando el Aprendizaje Automático en AWS”](https://vicenteguzman.com/aws/2024-08-27-sagemaker-ml-aws/), basado en una charla. Sirven para ampliar el contexto de la herramienta; verifica cualquier paso concreto con las guías actuales enlazadas arriba.

Si tu caso requiere una red neuronal y no un modelo tabular como XGBoost, el AWS User Group Paraguay publicó en 2024 la sesión [“Redes Neuronales con TensorFlow en SageMaker”](https://www.youtube.com/watch?v=yzAd3XLWjLU) en su [canal de YouTube](https://www.youtube.com/channel/UC7_OxjDgMxfy3Id5oGyKqLg). Es otra ruta técnica, con requisitos de datos y cómputo distintos; confirma las versiones del framework y contenedor antes de ejecutar un ejemplo.

### 5. Evalúa con el conjunto de prueba y una métrica que represente el problema

Después de elegir el modelo con validación, genera predicciones para el conjunto de prueba y compáralas con las etiquetas reales. La evaluación estima cómo podría responder el modelo ante casos nuevos; no garantiza que vaya a mejorar el proceso donde se use. Compara el resultado con una referencia sencilla, como una regla existente o el flujo actual.

Para clasificación, una matriz de confusión ayuda a ver los tipos de acierto y error. **Precisión** responde qué proporción de los casos marcados como positivos realmente lo era; **recall** indica qué proporción de los positivos reales encontró el modelo. **F1** combina ambas. La exactitud global puede ocultar un mal resultado cuando una clase es mucho menos frecuente que otra. Elige la métrica y el umbral en función del impacto de falsos positivos y falsos negativos, y fija el umbral usando validación antes de medirlo en prueba.

**No ajustes el umbral con el conjunto de prueba.** La página de evaluación del tutorial de AWS muestra cómo explorar distintos cortes, pero su ejemplo calcula ese corte sobre los propios datos de prueba. Para conservar una evaluación independiente, elige el umbral con validación y usa prueba solo para medir el resultado final.

Antes de ejecutar esa receta, corrige otros dos detalles del ejemplo oficial: la función declara `endpoint_name` pero la llamada de ejemplo no lo pasa; además, `array.tostring()` produce bytes numéricos, no texto CSV, aunque la solicitud declara `text/csv`. El despliegue actual documenta `Endpoint.get(...)`, `Endpoint.invoke(...)` y el atributo `endpoint.endpoint_name`. Para las filas de prueba, usa un cuerpo CSV UTF-8 sin encabezado, etiqueta ni índice. Este fragmento continúa el notebook del tutorial: `test` es el conjunto preparado y `endpoint` es el resultado del despliegue. Antes de ejecutarlo, define `umbral_validacion` con el valor que elegiste usando validación:

```python
import csv
import io
from sagemaker.core.resources import Endpoint

def predict_features(features, endpoint_name, rows=1000):
    if rows < 1:
        raise ValueError("rows debe ser mayor que cero")

    endpoint = Endpoint.get(endpoint_name=endpoint_name)
    predictions = []
    for start in range(0, len(features), rows):
        batch = features[start:start + rows]
        buffer = io.StringIO(newline="")
        csv.writer(buffer).writerows(batch)
        body = buffer.getvalue().encode("utf-8")

        response = endpoint.invoke(body=body, content_type="text/csv")
        output = response.body.read().decode("utf-8")
        batch_predictions = [
            float(value)
            for line in output.splitlines()
            for value in line.split(",")
            if value.strip()
        ]
        if len(batch_predictions) != len(batch):
            raise ValueError("La respuesta no contiene una predicción por fila")
        predictions.extend(batch_predictions)
    return predictions

# En este conjunto de ejemplo, la etiqueta ocupa la primera columna.
X_test = test.iloc[:, 1:].to_numpy()
y_test = test.iloc[:, 0].to_numpy()
predictions = predict_features(X_test, endpoint.endpoint_name)
# umbral_validacion se eligió antes con validation, según el costo de los errores.
y_pred = [int(score >= umbral_validacion) for score in predictions]
```

El ayudante recibe una matriz que ya contiene solo las características, conserva el orden de las filas al dividirlas en lotes y lee la respuesta de texto como valores numéricos. `rows` controla el tamaño de cada solicitud; redúcelo si las entradas o los límites del endpoint requieren lotes menores. Si el endpoint está en otra sesión, pasa el nombre que guardaste al desplegarlo; no dependas de la variable local `endpoint`.

Revisa resultados por segmentos relevantes y autorizados si un promedio podría esconder diferencias importantes. Si necesitas profundizar en disparidades o explicaciones, esta guía propia sobre [SageMaker Clarify y la evaluación de sesgos](/blog/deteccion-de-sesgos-en-modelos-ml-con-sagemaker-clarify/) documenta qué puede medir la herramienta y su disponibilidad actual. AWS indica en la [documentación de explicabilidad](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-model-explainability.html) que Clarify no está abierto a clientes nuevos.

### 6. Elige cómo servir las predicciones

No existe una modalidad que sea mejor para todos los modelos. Decide según cuándo se necesitan las respuestas, cuánto tarda cada solicitud, el tamaño de entrada, el patrón de tráfico y las funciones compatibles con el contenedor.

| Modalidad | Cuándo encaja | Qué tener en cuenta |
| --- | --- | --- |
| **Real-time** | La aplicación espera una respuesta interactiva por solicitud. | Mantiene un endpoint disponible; mide la latencia y el costo con la carga y configuración reales. No hay una latencia fija garantizada para todos los modelos. |
| **Serverless Inference** | El tráfico es intermitente o impredecible. | AWS administra la capacidad y cobra según el cómputo usado; hay límites de tamaño y compatibilidad que pueden descartar esta opción para ciertos modelos. |
| **Asynchronous Inference** | Puedes encolar una solicitud y esperar el resultado; las entradas son grandes o tardan más. | Recibe solicitudes y devuelve resultados de forma asíncrona, normalmente usando S3; puede escalar a cero si así se configura. |
| **Batch Transform** | Los datos ya están en S3 y necesitas generar predicciones para un lote, no responder a una aplicación interactiva. | Ejecuta un trabajo para procesar los objetos y guardar resultados en S3; no mantiene un endpoint interactivo. |

Consulta la [comparación oficial de opciones y funciones compatibles](https://docs.aws.amazon.com/sagemaker/latest/dg/model-deploy-feature-matrix.html) y sus límites actuales antes de elegir. Para una evaluación inicial sobre un archivo de prueba disponible en S3, Batch Transform evita mantener un endpoint interactivo solo para ese lote. Si la aplicación requiere llamadas individuales, compara real-time, serverless y asynchronous con solicitudes representativas y valida también los errores, la concurrencia y los tiempos de espera.

Cuando pases del primer endpoint a automatizar entrenamiento y despliegue, estas grabaciones pueden ampliar el tema:

- [MLOps en AWS con Jenny Vega, ML Engineer en Rappi](https://www.youtube.com/watch?v=1G2CC7TRZYU), del AWS User Group Perú (2020), trata MLOps desde la experiencia de una profesional de ML.
- [Patrones de arquitectura en MLOps](https://www.youtube.com/watch?v=nV12mB7GjZ0), del mismo grupo (2021), aborda decisiones de arquitectura para ese flujo.
- [AWS ML Day con SageMaker, MLOps y primeros pasos con AWS IoT](https://www.youtube.com/watch?v=NVEbOgBTNSk), de AWS User Group Perú (2020), reúne esos temas en una jornada más amplia.
- [28vo Meetup de AWS User Group Panamá](https://www.youtube.com/watch?v=xE5vGh_wdjA) (2021) combina una charla de ciencia de datos y ML con otra sobre DevOps en AWS.
- [Resolviendo problemas con Machine Learning en producción](https://www.youtube.com/watch?v=lbNaNNbTsNc), de Charlas Técnicas de AWS (2021), aporta una perspectiva sobre problemas de operación.

Son grabaciones históricas: contrasta sus detalles de servicio y versiones con la documentación vigente.

### 7. Elimina lo que ya no necesitas

Cuando termine la prueba, elimina primero el endpoint para detener el cómputo que lo mantiene activo. Después, revisa y elimina su configuración y el recurso de modelo si tampoco se reutilizarán. Borrar el modelo de SageMaker AI no borra sus artefactos de S3; conserva o elimina esos archivos de forma deliberada. Si usaste una aplicación o instancia de notebook, detenla y elimínala cuando hayas guardado lo necesario. Comprueba también los objetos de S3 y los logs retenidos, teniendo cuidado de no borrar datos compartidos.

La [guía oficial de limpieza](https://docs.aws.amazon.com/sagemaker/latest/dg/realtime-endpoints-delete-resources.html) enumera qué elimina cada acción. Los trabajos completados, sus metadatos y los artefactos almacenados no desaparecen todos al borrar un endpoint.

## Tutoriales, comunidades y eventos para seguir aprendiendo

- El [AWS User Group Perú](https://awsugperu.cloud/) es una comunidad general de AWS con agenda y recursos; también puedes consultar su [canal de YouTube](https://www.youtube.com/@AWSUserGroupPeru) para más sesiones.
- El [AWS UG Machine Learning Latam](https://www.meetup.com/aws-ug-machine-learning-latam/) es un espacio comunitario orientado a difundir machine learning en Latinoamérica. Consulta el tema y formato de cada encuentro: algunas actividades combinan ML e IA generativa.
- Para buscar encuentros AWS recientes en distintos países y modalidades, revisa la [agenda de eventos AWS en Latinoamérica](/eventos/). Las fechas, el registro y el temario los confirma cada comunidad organizadora.

Las grabaciones y eventos dependen de sus organizadores y pueden cambiar. Contrasta cualquier instrucción de consola, SDK o servicio con la documentación actual de AWS antes de ejecutarla.
