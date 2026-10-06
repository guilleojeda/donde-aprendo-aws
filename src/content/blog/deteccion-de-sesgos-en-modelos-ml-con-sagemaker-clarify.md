---
title: "SageMaker Clarify para detectar sesgos en modelos de machine learning"
description: "Guía de métricas antes y después del entrenamiento, ejemplo del SDK para clientes existentes, costos y alternativas para proyectos nuevos."
author: "guille-ojeda"
publishedAt: "2024-05-17"
publishedTimestamp: "2024-05-17T01:45:54.229Z"
modifiedTimestamp: "2026-10-06T13:57:53-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Machine learning en AWS: cómo empezar y qué servicio elegir"
    url: "https://dondeaprendoaws.com/blog/10-preguntas-frecuentes-sobre-machine-learning-en-aws/"
---

Amazon SageMaker Clarify calcula métricas para examinar posibles disparidades en los datos y en las predicciones de un modelo. También puede generar explicaciones de predicciones mediante atribuciones de características. El análisis ayuda a hacer preguntas concretas sobre un modelo; por sí solo no determina si una decisión es justa.

> **Disponibilidad revisada el 6 de octubre de 2026:** AWS informa que SageMaker Clarify ya no admite clientes nuevos. Quienes ya son clientes de Clarify pueden seguir usando el servicio con normalidad; AWS no planea añadir funciones nuevas. Si estás empezando un flujo de trabajo que todavía no tiene acceso a Clarify, este ejemplo del SDK no habilita el servicio para tu cuenta.

Para un proyecto nuevo, AWS propone calcular sus métricas estandarizadas con código propio, por ejemplo con pandas y scikit-learn, y usar la biblioteca SHAP directamente para atribuciones de características. AWS también publica arquitecturas de referencia para integrar estas comprobaciones en un flujo de monitoreo. Es un camino que el equipo implementa y opera; no es el mismo servicio administrado ni una sustitución automática de cada capacidad de Clarify. Revisa la [guía oficial sobre el cambio de disponibilidad y sus reemplazos](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-availability-change.html).

## Qué analiza Clarify y en qué etapa

Clarify trabaja con dos entradas distintas según la pregunta:

| Análisis | Qué necesita | Qué ayuda a observar |
| --- | --- | --- |
| Antes de entrenar | Datos con una etiqueta objetivo y un atributo o grupo para comparar | Si los grupos tienen distinta representación o proporción de resultados positivos en los datos |
| Después de entrenar | Datos con etiquetas reales y predicciones de un modelo entrenado | Si las tasas de predicción o algunos errores del modelo difieren entre los grupos |
| Explicabilidad | Un modelo y ejemplos para analizar | Qué características contribuyen a una predicción; estas atribuciones no son una medida de equidad |

En la documentación de Clarify, una **faceta** es una columna o característica usada para formar los grupos de comparación. La **etiqueta** es el resultado observado. En una clasificación binaria, quien analiza define qué valor cuenta como resultado positivo para el caso; esa elección debe tener sentido en el dominio del problema.

Algunas métricas que aparecen en estos análisis son:

- **CI (Class Imbalance):** compara la cantidad de observaciones entre las dos facetas elegidas. No mide la distribución de etiquetas positivas y negativas por sí sola.
- **DPL (Difference in Proportions of Labels):** compara la proporción observada de resultados positivos entre facetas antes del entrenamiento.
- **DPPL (Difference in Positive Proportions in Predicted Labels):** compara la proporción de predicciones positivas entre facetas después del entrenamiento.
- **DI (Disparate Impact) y AD (Accuracy Difference):** describen, respectivamente, una razón entre tasas de resultados positivos predichos y una diferencia de exactitud entre facetas.

Para las métricas de diferencia como DPL, DPPL y AD, cero representa igualdad en la proporción o exactitud que mide cada una. Para DI, que es una razón, la paridad corresponde a 1. En CI, cero describe cantidades iguales de observaciones entre las facetas, no igualdad de resultados.

Cada métrica representa una definición distinta de equidad. Las métricas no necesariamente coinciden entre sí y no existe un umbral universal que convierta un resultado en una aprobación. Define qué comparación importa con especialistas del dominio y las personas afectadas, registra cómo elegiste las facetas y evalúa más de una medida cuando corresponda. La paridad en una métrica no prueba que el sistema sea justo, preciso para todas las personas ni conforme a una norma.

### Ejemplo sintético de DPL

Supón un conjunto sintético que contiene solo dos valores de `Group`, 0 y 1: 100 ejemplos con `Group=0`, 80 con `Target=1`; y 100 con `Group=1`, 60 con `Target=1`. En la notación oficial, `q_a` es la tasa positiva de la faceta `a`; aquí `q_a = 80/100 = 0.80` para `Group=0`. `q_d` es la tasa positiva de la faceta `d`; aquí `q_d = 60/100 = 0.60` para `Group=1`. La fórmula documentada es `DPL = q_a - q_d`, así que `DPL = 0.80 - 0.60 = +0.20`: una diferencia de 20 puntos porcentuales en las etiquetas positivas del conjunto.

Este cálculo describe esas etiquetas sintéticas; no determina si la diferencia es aceptable. Su dirección depende de cuál faceta se definió como `a` y cuál como `d`, y no hay un umbral universal de DPL para declarar que un modelo sea justo. La [definición oficial de DPL](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-data-bias-metric-true-label-imbalance.html) explica la convención de signo y sus límites.

La comunidad también tiene recursos en español para ampliar el contexto. [Brenda Galicia presenta un ejemplo de IA responsable con SageMaker Clarify](https://dev.to/bardengalicia/ia-responsable-con-amazon-sagemaker-clarify-mhc), con detección de sesgos y explicabilidad. Esa publicación es de 2024: úsala como lectura complementaria y contrasta sus instrucciones de SDK y servicio con la documentación vigente antes de ejecutar el código. [AWS Girls Chile tiene una grabación sobre IA responsable con Clarify](https://www.youtube.com/watch?v=x_MHs9hLx0s) en su canal de charlas técnicas.

## Ejemplo: revisar etiquetas antes del entrenamiento

Este ejemplo solicita CI y DPL para un archivo tabular CSV. El archivo de entrada de ejemplo está en UTF-8 y no lleva fila de encabezado: sus columnas, en este orden, son `Target`, `Group`, `Age` e `Income`. El valor `1` representa el resultado positivo definido para el análisis. `Group=0` es la faceta seleccionada para esta comparación y `Group=1` la otra faceta; seleccionar un grupo no implica que deba recibir un resultado preferente.

El código sigue la API de SageMaker Python SDK **2.257.6**. Esa publicación requiere Python 3.9 o posterior. SageMaker Python SDK v2 está en una ruta de deprecación; consulta la referencia de tu entorno antes de cambiar de versión. Para reproducir exactamente este ejemplo, instala `sagemaker==2.257.6` y ejecútalo con credenciales de AWS desde una cuenta que ya tenga acceso a Clarify.

```python
from sagemaker import Session, clarify

session = Session()
role = "arn:aws:iam::123456789012:role/SageMakerExecutionRole"

processor = clarify.SageMakerClarifyProcessor(
    role=role,
    instance_count=1,
    instance_type="ml.c4.xlarge",
    sagemaker_session=session,
)

data_config = clarify.DataConfig(
    s3_data_input_path="s3://mi-bucket/datos/train.csv",
    s3_output_path="s3://mi-bucket/clarify/pre-training/",
    dataset_type="text/csv",
    headers=["Target", "Group", "Age", "Income"],
    label="Target",
)

bias_config = clarify.BiasConfig(
    label_values_or_threshold=[1],
    facet_name="Group",
    facet_values_or_threshold=[0],
)

processor.run_pre_training_bias(
    data_config=data_config,
    data_bias_config=bias_config,
    methods=["CI", "DPL"],
)
```

`DataConfig` indica el objeto o prefijo de S3 que contiene los datos, el formato, el orden y los nombres de columnas, la columna de etiqueta y el prefijo de salida. `BiasConfig` fija el resultado positivo y el valor de la faceta seleccionada para la comparación. La llamada correcta para este análisis previo al entrenamiento es `run_pre_training_bias`, que recibe `data_config` y `data_bias_config` como argumentos con nombre.

El rol de ejecución debe permitir al trabajo procesar datos y leer la ruta de entrada y escribir en la de salida de S3. La identidad que lanza el trabajo también debe poder crear el trabajo de procesamiento y pasar ese rol. Cambia el ARN y las rutas de ejemplo por recursos de tu cuenta; evita incluir datos sensibles o no autorizados.

La [referencia de SageMaker Python SDK v2.257.6](https://sagemaker.readthedocs.io/en/v2.257.6/api/training/processing.html) documenta `SageMakerClarifyProcessor`, `DataConfig`, `BiasConfig` y `run_pre_training_bias`. AWS también muestra el [flujo completo del trabajo de Clarify](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-processing-job-run.html). Ese flujo confirma los nombres de parámetros y que `methods=["CI", "DPL"]` solicita esas dos métricas.

## Cómo interpretar el informe

Cuando termina un trabajo, revisa `analysis.json` en el prefijo de salida de S3. El informe organiza los resultados por etapa, faceta y métrica. Conserva junto con el resultado qué conjunto de datos analizaste, cómo definiste el resultado positivo y cómo asignaste las facetas para poder interpretar la comparación más adelante.

Antes de pasar de una señal a una decisión, pregunta:

1. ¿La definición del resultado positivo refleja el objetivo real del proceso?
2. ¿Las etiquetas representan resultados confiables o registran decisiones históricas que también podrían ser injustas?
3. ¿El grupo comparado representa la pregunta que necesitas responder y hay suficientes observaciones en cada faceta?
4. ¿Una diferencia proviene del conjunto de datos, de las predicciones, de errores distintos o de una mezcla de causas?
5. ¿Qué cambio propones y cómo comprobarás que mejora el resultado sin empeorar errores importantes en otros grupos?

Clarify informa medidas; no cambia automáticamente etiquetas, pesos, muestras ni el algoritmo del modelo. La mitigación ocurre en el proceso de datos y entrenamiento que mantiene el equipo. Después de un cambio, repite las medidas relevantes y compara resultados con la misma definición y un conjunto de evaluación apropiado.

En la [documentación de métricas previas al entrenamiento](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-measure-data-bias.html) encontrarás las definiciones de CI y DPL. La [documentación de métricas posteriores al entrenamiento](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-measure-post-training-bias.html) explica DPPL, DI, AD y otras medidas. Para el formato de `analysis.json` y sus informes, consulta [los resultados de un trabajo de Clarify](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-processing-job-analysis-results.html).

## Costos y acceso

El ejemplo ejecuta un trabajo de SageMaker Processing en una instancia `ml.c4.xlarge`, como la que muestra la documentación de AWS para inicializar el procesador. Comprueba que el tipo de instancia esté disponible en tu región y revisa el precio regional antes de lanzarlo. SageMaker cobra por las instancias utilizadas mientras se ejecuta el trabajo; el almacenamiento de los archivos en S3 también tiene [sus cargos](https://aws.amazon.com/s3/pricing/). Un análisis posterior al entrenamiento necesita predicciones del modelo y puede crear un endpoint temporal para generarlas, lo que añade cómputo mientras está activo. La [página de precios de SageMaker AI](https://aws.amazon.com/sagemaker/ai/pricing/) permite revisar los cargos vigentes.

Si estás creando un flujo nuevo y Clarify no está disponible en tu cuenta, no sigas creando roles o trabajos para intentar habilitarlo. Comienza por la [guía de AWS para reemplazar sus capacidades](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-availability-change.html): elige las métricas publicadas que responden a tu pregunta, calcula sus fórmulas en código que tu equipo pueda revisar y versionar, y usa las arquitecturas de referencia que AWS enlaza si necesitas registrar y monitorear los resultados dentro de una canalización. Para explicabilidad con SHAP, la misma guía remite a la biblioteca SHAP. Las evaluaciones de Amazon Bedrock se dirigen a modelos fundacionales; AWS aclara que no reemplazan el análisis de sesgo de modelos predictivos tabulares.

## Solución de problemas

- **La consola o el trabajo no ofrece Clarify:** comprueba primero si tu cuenta ya tiene acceso al servicio. AWS no admite clientes nuevos.
- **El trabajo falla al leer o escribir en S3:** revisa la cuenta, región, URI, cifrado y permisos del rol de ejecución; confirma también que la identidad que lanza el trabajo pueda pasar ese rol.
- **El informe indica que no encuentra la faceta o la etiqueta:** verifica el orden de columnas, el formato declarado, el nombre exacto de `facet_name` y `label`, y los valores usados para definir el resultado positivo. Si el CSV incluye encabezado, configúralo como lo indica la [guía de formatos tabulares](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-processing-job-data-format-tabular.html).
- **No aparece una métrica o el trabajo termina con error:** revisa los registros de CloudWatch y la razón de salida del trabajo; confirma que el modelo y sus predicciones coincidan con el formato, las etiquetas y los tipos configurados. AWS enumera estos casos en la guía de [solución de problemas de trabajos Clarify](https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-processing-job-run-troubleshooting.html).

## Comunidades y próximas actividades

Si quieres conversar sobre implementaciones y seguir actividades comunitarias, estas páginas tienen enfoques distintos:

- [AWS AI User Group Argentina](https://www.meetup.com/aws-ai-user-group-argentina/), con base en Córdoba, organiza encuentros sobre inteligencia artificial en AWS y describe opciones presenciales con transmisión en línea y otras totalmente virtuales.
- [AWS UG Machine Learning Latam](https://www.meetup.com/aws-ug-machine-learning-latam/), con base en Lima y alcance regional, está dedicado a compartir conocimiento sobre machine learning; su agenda permite revisar próximos encuentros y actividades anteriores.
- [AI AWS User Group Chile](https://www.meetup.com/es-es/ai-aws-ug-chile/) cubre SageMaker, MLOps e IA responsable, además de ofrecer charlas, demostraciones y espacio para preguntas. Al revisar su agenda el 6 de octubre de 2026, figuraban dos encuentros generales de IA en Santiago:
  - El [Meetup #4: AI Perspectives, el 23 de octubre](https://luma.com/5k1h5kow) está anunciado para las 18:30–20:30 CLST, presencial en Providencia. La agenda y los speakers estaban pendientes. El registro oficial es por Luma, es obligatorio y está sujeto a disponibilidad; confirmar asistencia en Meetup no garantiza un lugar.
  - El [Meetup #5: Cloud AI Connect, el 29 de octubre](https://luma.com/ry4qpmho) está anunciado para las 18:30–20:30 CLST, presencial en Las Condes. La ficha anuncia charlas de Cloud e IA, con speakers y agenda completa pendientes; el registro oficial también es por Luma y confirmar asistencia en Meetup no garantiza un lugar.

  Ninguna de las dos fichas confirma una sesión sobre Clarify.
- [AWS User Group Artificial Intelligence Bolivia](https://www.meetup.com/aws-user-group-artificial-intelligence-bolivia/) reúne a personas interesadas en IA y machine learning en AWS, con charlas, talleres y actividades prácticas; consulta la agenda del grupo para conocer fechas y condiciones actuales.

El [canal de YouTube de AWS Girls Chile](https://www.youtube.com/@AWSGirlsChile) reúne sus charlas técnicas y grabaciones, incluida la sesión sobre Clarify enlazada arriba. También puedes consultar el [directorio de eventos AWS en Latinoamérica](https://dondeaprendoaws.com/eventos/) y filtrar por país o modalidad; cada organizador publica sus propias fechas e inscripción.

Para ampliar la elección de servicios y las consideraciones de costos, sigue con esta [guía para empezar con machine learning en AWS](https://dondeaprendoaws.com/blog/10-preguntas-frecuentes-sobre-machine-learning-en-aws/).
