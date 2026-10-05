---
title: "Amazon Forecast: algoritmos, métricas y acceso actual"
description: "Amazon Forecast ya no acepta clientes nuevos. Para cuentas existentes: AutoPredictor, algoritmos, métricas, backtesting temporal, límites y costos."
author: "guille-ojeda"
publishedAt: "2024-05-12"
publishedTimestamp: "2024-05-12T03:31:14.299Z"
modifiedTimestamp: "2026-10-05T00:15:07-03:00"
cover: "/assets/blog/e98930171342594138891bef.jpg"
coverAlt: "Diagrama circular con un indicador central y pequeños gráficos alrededor"
ogImage: "/assets/blog/e98930171342594138891bef.jpg"
related:
  - title: "10 repositorios de GitHub para aprender Machine Learning en AWS"
    url: "https://dondeaprendoaws.com/blog/10-repositorios-de-github-para-machine-learning-en-aws/"
    image: "/assets/blog/0e7089d339cd0d6e09ee83cd.webp"
    imageAlt: ""
---

Amazon Forecast **ya no acepta clientes nuevos**: AWS cerró el acceso el 29 de julio de 2024. Sus documentos actuales indican que los clientes existentes pueden continuar usando el servicio. Si tu cuenta ya lo tenía habilitado, la opción predeterminada y preferida para crear predictores es **AutoPredictor**; si estás empezando con AWS, puedes aprender pronósticos y validar modelos con datos locales, pero este artículo no te habilita Forecast ni promete una migración automática. Para situar los conceptos, puedes empezar con la grabación [Machine Learning de Cero a Hero](https://www.youtube.com/watch?v=0kia26HQxs0), del AWS User Group Buenos Aires. [AWS explica el cierre y sus recursos de transición](https://aws.amazon.com/blogs/machine-learning/transition-your-amazon-forecast-usage-to-amazon-sagemaker-canvas/) y la [API actual de AutoPredictor conserva el aviso de acceso](https://docs.aws.amazon.com/forecast/latest/dg/API_CreateAutoPredictor.html).

El anuncio de AWS también dice que continuará con mejoras de seguridad, disponibilidad y rendimiento, aunque no planea añadir funciones nuevas a Forecast. Por eso conviene distinguir lo que sigue vigente para cuentas habilitadas de lo que puede practicar alguien desde cero.

## AutoPredictor y el predictor heredado

AWS recomienda **AutoPredictor** para crear un predictor. Aplica una combinación de algoritmos a cada serie temporal. AWS indica que, en general, estos predictores obtienen más precisión que los predictores heredados con AutoML o selección manual; es una comparación general, no una garantía para tus datos. [La guía de entrenamiento explica la diferencia y cómo actualizar un predictor](https://docs.aws.amazon.com/forecast/latest/dg/howitworks-predictor.html).

La operación heredada [CreatePredictor](https://docs.aws.amazon.com/forecast/latest/dg/API_CreatePredictor.html) funciona de dos formas: AutoML elige un algoritmo para todo el conjunto, o eliges manualmente un solo algoritmo para todas las series. El catálogo técnico de AWS documenta seis algoritmos para esa selección manual:

| Algoritmo | Perfil descrito por AWS |
| --- | --- |
| CNN-QR | Red convolucional; se orienta a conjuntos con muchas series. |
| DeepAR+ | Red recurrente para conjuntos con muchas series relacionadas. |
| Prophet | Modelo aditivo útil con estacionalidad marcada y varias temporadas históricas. |
| NPTS | Pronosticador probabilístico de referencia para series escasas o intermitentes; incluye variantes estacionales. |
| ARIMA | Método estadístico pensado especialmente para conjuntos sencillos con menos de 100 series. |
| ETS | Suavizado exponencial para conjuntos sencillos y patrones estacionales. |

Estas descripciones resumen la [documentación de algoritmos de Forecast](https://docs.aws.amazon.com/forecast/latest/dg/aws-forecast-choosing-recipes.html). No son una comparación universal de precisión ni significan que debas escoger uno al crear un AutoPredictor.

Si ya tienes un predictor heredado, AWS documenta una **actualización explícita** a AutoPredictor. La actualización conserva la configuración pertinente y crea otro predictor con un ARN distinto; el predictor original sigue activo para que compares sus métricas. No es una conversión automática ni una migración a otro servicio.

## Datos y validación: evita mirar el futuro

Forecast necesita un grupo de datos con una serie temporal objetivo: identificador de elemento, fecha y valor que quieres pronosticar, según el dominio y esquema elegidos. Puedes sumar series relacionadas y metadatos de elementos; la guía de [conjuntos de datos](https://docs.aws.amazon.com/forecast/latest/dg/howitworks-datasets-groups.html) describe los formatos y campos requeridos. Los archivos se importan desde Amazon S3 y se necesita un rol que permita a Forecast acceder a esos datos.

La serie relacionada puede incluir datos históricos o valores futuros **que realmente conozcas cuando emites el pronóstico**, por ejemplo, precios o promociones ya planificadas. No uses como dato futuro el resultado observado después de la fecha de predicción. AWS permite series relacionadas que se extienden hasta el horizonte, pero prohíbe incluir en ellas el valor objetivo; también documenta qué algoritmos heredados aceptan cada tipo de variable en [series temporales relacionadas](https://docs.aws.amazon.com/forecast/latest/dg/related-time-series-datasets.html). Para oír una introducción en español al manejo de estos datos, consulta la grabación [Bases de datos de series temporales](https://www.youtube.com/watch?v=3gB8dIGAJRI), de Charlas Técnicas de AWS.

Para medir el desempeño, respeta el orden temporal. Forecast hace backtesting: entrena con el pasado y compara el pronóstico con un tramo posterior. En la sección de predictores heredados, AWS documenta una ventana de prueba del mismo largo que el horizonte por defecto y permite configurar de una a cinco ventanas. Esa guía no debe trasladarse sin más a AutoPredictor: la [API actual de CreateAutoPredictor](https://docs.aws.amazon.com/forecast/latest/dg/API_CreateAutoPredictor.html) no documenta el parámetro heredado EvaluationParameters. Más ventanas históricas ayudan a comparar estabilidad, pero no corrigen una fuga creada al preparar variables con información futura. Para una práctica propia, [TimeSeriesSplit de scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html) genera cortes en orden temporal y permite dejar un intervalo de separación cuando el caso lo necesita. Si buscas un ejemplo en español, el repositorio [Modelos fundacionales para series de tiempo](https://github.com/sebassaras02/AWS_Community_Day_Ecuador_2026) muestra una demo de Chronos 2 con datos meteorológicos de Cuenca. [Chronos](https://github.com/amazon-science/chronos-forecasting) es un proyecto de modelos de series temporales de Amazon, separado de Forecast: revisa el README, las dependencias y los directorios de infraestructura antes de ejecutar el demo; no convierte ni migra predictores.

Antes de comparar modelos:

- Ordena las filas por fecha e identificador; verifica frecuencia, duplicados, faltantes y unidades.
- Separa entrenamiento y prueba por fecha, con un horizonte parecido al de la decisión real. No mezcles fechas al azar.
- Ajusta imputaciones, escalas y transformaciones usando solo el tramo de entrenamiento.
- Incluye una variable futura únicamente si habría estado disponible en la fecha de emisión.
- Compara con una referencia sencilla, como el último valor o el valor de la temporada anterior, en las mismas fechas y horizonte.

Una división temporal reduce el riesgo de entrenar con datos posteriores a la prueba, pero no evita por sí sola otras fugas. Por ejemplo, calcular una media móvil con valores que incluyen fechas futuras antes de dividir los datos sigue contaminando la evaluación.

## Qué métrica responde a tu decisión

La [documentación de precisión de AWS](https://docs.aws.amazon.com/forecast/latest/dg/metrics.html) define las métricas y sus fórmulas. En general, un valor menor es mejor, pero cada métrica responde a una pregunta distinta. Forecast calcula RMSE, WAPE, MAPE y MASE con el pronóstico medio; el error cuantílico ponderado se calcula para cada cuantil solicitado.

| Métrica | Cuándo sirve y qué tener en cuenta |
| --- | --- |
| **wQL** (pérdida cuantílica ponderada) | Evalúa un cuantil y penaliza de forma distinta quedarse corto o pasarse. P90 asigna más peso a subestimar que a sobreestimar. |
| **Average wQL** | Promedia los wQL de los cuantiles seleccionados. Compara resultados con el mismo conjunto de cuantiles. |
| **WAPE** (error porcentual absoluto ponderado) | Resume el error absoluto respecto del total observado; las series de mayor volumen pesan más. Si el total observado se aproxima a cero, Forecast devuelve el error absoluto sin ponderar. |
| **RMSE** (raíz del error cuadrático medio) | Conserva la unidad de la variable y penaliza con fuerza los errores grandes. |
| **MAPE** (error porcentual absoluto medio) | Expresa el error como porcentaje punto a punto. Su fórmula divide por el valor observado; no es adecuada cuando hay ceros o valores cercanos a cero. |
| **MASE** (error absoluto escalado) | Escala el error frente a una referencia estacional; el período de escala depende de la frecuencia. Es útil al comparar series de escalas distintas. |

Forecast genera P10, P50 y P90 de forma predeterminada. P10 es un valor que el observado debería quedar por debajo alrededor del 10 % de las veces; P90, alrededor del 90 %. El rango P10–P90 representa cuantiles nominales del 80 %, no una cobertura garantizada: comprueba cuántos valores reales quedaron dentro del rango en las ventanas de backtest. El [catálogo de tipos de pronóstico](https://docs.aws.amazon.com/forecast/latest/dg/metrics.html) permite consultar los cuantiles admitidos y la opción de pronóstico medio.

No existe una métrica que sea “la precisión” para todos los usos. Si el faltante de inventario cuesta más que el excedente, evalúa cuantiles altos; si una desviación extrema es especialmente cara, observa RMSE; si necesitas comparar series pequeñas y grandes, revisa MASE y también los resultados por serie. Elige la métrica de optimización según el costo de error que importa, y confirma que el modelo supera una referencia sencilla en los mismos backtests.

### Cálculo pequeño en Python

Este ejemplo usa solo la biblioteca estándar y una serie de valores positivos. Sirve para comprobar RMSE y WAPE; no muestra cómo entrenar un modelo.

    from math import sqrt

    reales = [10, 12, 14, 16]
    pronostico = [9, 13, 12, 18]

    rmse = sqrt(sum((y - p) ** 2 for y, p in zip(reales, pronostico)) / len(reales))
    wape = 100 * sum(abs(y - p) for y, p in zip(reales, pronostico)) / sum(reales)

    print(f"RMSE: {rmse:.2f}; WAPE: {wape:.2f}%")

El resultado es RMSE 1,58 y WAPE 11,54 %. WAPE puede resultar indefinido cuando el total observado es cero o casi cero; MAPE también pierde sentido en puntos cuyo valor observado es cero.

## Requisitos, límites y costos

Para crear un predictor necesitas una cuenta con acceso vigente a Forecast, un grupo de datos con frecuencia e intervalo definidos, un horizonte de predicción y datos legibles desde S3. Los datos relacionados no se agregan a otra frecuencia, así que su granularidad debe coincidir con la del pronóstico. Confirma los detalles en la [guía de importación](https://docs.aws.amazon.com/forecast/latest/dg/howitworks-datasets-groups.html) antes de estructurar archivos para una cuenta existente.

Los límites de horizonte dependen de la operación. Para un **AutoPredictor nuevo**, la API fija el máximo en el menor valor entre 500 pasos y un cuarto de la longitud de la serie objetivo; para volver a entrenar un AutoPredictor, el límite es el menor entre 500 y un tercio de esa longitud. Las reglas de la API heredada son distintas. El máximo de cinco ventanas corresponde a la cuota de CreatePredictor; no lo des por hecho para AutoPredictor, cuya API no documenta el parámetro heredado para configurarlas. Consulta las [cuotas y límites por API y Región](https://docs.aws.amazon.com/forecast/latest/dg/limits.html) y la referencia de [CreateAutoPredictor](https://docs.aws.amazon.com/forecast/latest/dg/API_CreateAutoPredictor.html) para tu operación concreta.

AWS factura cuatro componentes: datos importados, horas de infraestructura de entrenamiento, puntos de pronóstico y explicaciones. Al 5 de octubre de 2026, la página de [precios de Forecast](https://aws.amazon.com/forecast/pricing/) muestra 0,088 USD por GB importado y 0,24 USD por hora de infraestructura. El número de puntos se calcula por serie temporal × fechas futuras × cuantiles; las tarifas por volumen cambian por nivel y las explicaciones tienen un cargo aparte. El entrenamiento puede consumir más horas facturables que el tiempo que ves en el reloj, porque AWS ejecuta instancias en paralelo. Consulta el precio vigente y sus niveles completos antes de estimar un trabajo.

Como referencia, el ejemplo publicado por AWS calcula **101,16 USD** para importar 5 GB, usar tres horas de entrenamiento y generar 50.000 puntos de pronóstico con un cuantil y un paso futuro. Ese ejemplo muestra que el volumen de pronósticos puede pesar más que la importación, y no incluye otros servicios que pudiera usar tu flujo. AWS también anuncia, durante los dos primeros meses, hasta 100.000 puntos de pronóstico y 10 horas de entrenamiento al mes, además de 10 GB de almacenamiento; esa capa gratuita no abre Forecast a clientes nuevos.

## Comunidades y recursos para continuar

Para conversar y practicar, [AWS UG Machine Learning Latam](https://www.meetup.com/es-es/aws-ug-machine-learning-latam/) publica su actividad en Meetup; revisa las fechas y condiciones del próximo encuentro. [AWS re:Post en español](https://repost.aws/es) permite buscar y publicar preguntas técnicas en español con la comunidad de AWS; las respuestas dependen de la comunidad y no equivalen a soporte garantizado. También puedes buscar grupos en el directorio de [comunidades AWS](/comunidades/), revisar la [agenda de eventos](/eventos/) y explorar los [canales y creadores](/creadores/).

Si necesitas evaluar una opción administrada de AWS para un caso que usaba Forecast, AWS documenta recursos para pasar a SageMaker Canvas. Esa guía transforma el conjunto de datos de Forecast a otro formato y describe un flujo distinto; lee sus [pasos de transición y requisitos](https://aws.amazon.com/blogs/machine-learning/transition-your-amazon-forecast-usage-to-amazon-sagemaker-canvas/). No es una migración automática ni una equivalencia de API. Comprueba acceso, Región, datos y costos del flujo que vayas a evaluar.

## Preguntas frecuentes

### ¿Puedo empezar a usar Amazon Forecast con una cuenta nueva?

No. AWS cerró el acceso a nuevos clientes el 29 de julio de 2024. Los clientes existentes pueden continuar usando Forecast, según la [nota de AWS](https://aws.amazon.com/blogs/machine-learning/transition-your-amazon-forecast-usage-to-amazon-sagemaker-canvas/).

### ¿Debo crear un AutoPredictor o conservar un predictor heredado?

Para crear predictores, AWS recomienda AutoPredictor. Los predictores heredados continúan disponibles para clientes con acceso, y AWS ofrece una operación explícita para actualizar uno a AutoPredictor y comparar resultados. No asumas que esa actualización migra datos, integraciones o aplicaciones.

### ¿Qué métrica de precisión debo elegir?

Depende de qué error tiene costo en tu caso. wQL permite dar más peso a quedarse corto o pasarse al evaluar un cuantil; RMSE destaca errores grandes; MASE escala frente a una referencia estacional. Compara con el mismo horizonte y las mismas ventanas de backtest.

### ¿El rango P10–P90 garantiza que el valor real estará dentro?

No. Es un rango construido con dos cuantiles. Mide su cobertura empírica en los backtests y segmentos donde usarás el pronóstico antes de tratarlo como un intervalo fiable.
