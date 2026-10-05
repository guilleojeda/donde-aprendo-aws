---
title: "Machine learning en agricultura: 8 casos de uso y servicios de AWS"
description: "Conoce ocho aplicaciones de ML en agricultura, qué datos requieren, cómo evaluar sus modelos y qué servicios de AWS pueden apoyar cada etapa."
author: "guille-ojeda"
publishedAt: "2024-05-09"
publishedTimestamp: "2024-05-09T04:29:13.731Z"
modifiedTimestamp: "2026-10-04T21:26:34-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Guía para implementar machine learning con Amazon SageMaker"
    url: "https://dondeaprendoaws.com/blog/guia-para-implementar-machine-learning-con-amazon-sagemaker/"

---

El machine learning (ML) puede ayudar a estimar rendimientos, anticipar condiciones locales y detectar patrones en imágenes o sensores. Para que esas predicciones sirvan en una operación agrícola hacen falta datos observados en campo, resultados medibles y pruebas que representen otras parcelas y temporadas. AWS ofrece servicios para almacenar y preparar esos datos, entrenar modelos y entregar predicciones; no aporta por defecto un modelo agronómico listo ni garantiza ahorros o mayor precisión.

Los ocho casos de abajo son ideas de proyecto, no resultados prometidos. En la sección de ejemplos documentados separo tres historias de clientes publicadas por AWS.

Si estás empezando con el tema, puedes repasar los conceptos en [Machine Learning de Cero a Hero](https://www.youtube.com/watch?v=0kia26HQxs0), grabación de AWS User Group Buenos Aires del 9 de mayo de 2024. Para ver un ejemplo de SageMaker dirigido a desarrolladores, el [AWS UG Peru Conference 16](https://www.youtube.com/watch?v=4IAJOSCwWOo) tiene una sesión del 24 de marzo de 2021; algunas pantallas y nombres de servicios pueden haber cambiado, así que usa la documentación actual para implementarlo.

## 8 casos de uso de machine learning en agricultura

### 1. Estimar el rendimiento por lote

Un modelo puede estimar toneladas por hectárea antes de la cosecha para apoyar la planificación de almacenamiento y transporte. Como entradas puede usar rendimientos medidos en ciclos anteriores, superficie, fechas de siembra y cosecha, variedad, manejo, suelo e historial meteorológico. Los registros deben usar unidades consistentes y corresponder al mismo lote que luego se mide.

Reserva temporadas o campos completos para la prueba. Compara el error absoluto medio (MAE) o la raíz del error cuadrático medio (RMSE) con una referencia sencilla, como el promedio histórico de la zona, y separa los resultados por cultivo y región. Un buen promedio general puede ocultar errores altos en una variedad o temporada concreta.

### 2. Pronosticar el microclima de una zona

Una predicción de temperatura, lluvia, humedad o viento a escala de lote puede servir para organizar recorridas y tareas. Se pueden combinar lecturas de estaciones cercanas, radares, pronósticos existentes y observaciones de sensores propios. La ubicación, la hora, la unidad y la calibración de cada sensor son parte del dato, no detalles secundarios.

Evalúa por fecha futura, compara cada horizonte con el pronóstico que ya se usa y mide los errores por variable y estación. Para lluvia, además del error numérico, comprueba si el modelo distingue de forma útil los eventos que importan para la operación. No infieras que un pronóstico más preciso en un conjunto de prueba producirá por sí solo más rendimiento.

### 3. Seguir la humedad del suelo y anticipar desvíos

Con sensores de humedad, lluvia, temperatura, tipo de suelo y etapa del cultivo se puede pronosticar cómo cambiará la humedad del suelo o marcar mediciones anómalas. El objetivo puede ser priorizar qué lotes revisar; la salida del modelo no debe presentarse como una instrucción universal de riego.

Valida el pronóstico con lecturas posteriores que no se usaron para entrenar. Mide el error por profundidad, tipo de suelo y ubicación, y revisa qué proporción de alertas resulta útil para la persona que recorre el campo. Si hay sensores nuevos o se mueven, vuelve a comprobar la calibración.

Para familiarizarte con la comunicación de sensores, la grabación de 2024 [Introducción al IoT en AWS con IoT Core y el ESP8266](https://www.youtube.com/watch?v=ilMHiOXCZns) muestra un ejemplo de hardware concreto. La publica AWS UG Ecuador; el [grupo](https://www.meetup.com/aws-ecuador/) comparte sus actividades actuales.

### 4. Priorizar la revisión de plagas o enfermedades en plantas

Un clasificador de imágenes puede ordenar fotos de hojas, frutos o trampas para que una persona experta revise primero las señales más probables. El conjunto de entrenamiento necesita etiquetas verificadas, además de cultivo, variedad, etapa de crecimiento, fecha y contexto de captura. Las imágenes de laboratorio suelen ser distintas a las fotos reales tomadas con polvo, sombras o teléfonos diferentes.

Mide precisión y sensibilidad (recall) por clase, con atención a los falsos negativos, y prueba en fotos de otros campos y temporadas. Presenta la salida como una señal para revisión: una clasificación de imagen no confirma un diagnóstico ni indica qué producto aplicar. Las recomendaciones de tratamiento quedan a cargo de especialistas y de las normas locales.

Como material técnico complementario, AWS User Group Paraguay publicó en mayo de 2024 una sesión sobre [redes neuronales con TensorFlow en SageMaker](https://www.youtube.com/watch?v=yzAd3XLWjLU). Es un ejemplo de modelado, no un modelo agrícola validado.

### 5. Analizar imágenes satelitales o de drones

Las series de imágenes pueden ayudar a clasificar coberturas, localizar cambios o señalar zonas que conviene inspeccionar. Para entrenar y evaluar hacen falta límites de parcelas, fechas y resolución conocidos, junto con observaciones de campo que sirvan como referencia. También hay que registrar nubes, sombras, sensor y derechos de uso de las imágenes.

Separa parcelas o regiones completas entre entrenamiento y prueba; dividir píxeles vecinos al azar puede hacer que la evaluación parezca mejor de lo que sería en un lugar nuevo. Según la tarea, mide precisión por clase, intersección sobre unión (IoU) o error en el área calculada. SageMaker geospatial aparece en documentación antigua, pero AWS informa que sus capacidades geoespaciales ya no están abiertas a nuevos clientes; más abajo detallo esa limitación.

### 6. Detectar condiciones fuera de rango en invernaderos

Las series de temperatura, humedad, luz, CO₂ y estado de equipos pueden alimentar un modelo que anticipe desvíos o detecte patrones distintos de los ciclos normales. Conviene incluir el sector, el cultivo y su etapa, porque los rangos y patrones cambian entre configuraciones.

Prueba el sistema en ciclos posteriores y mide falsas alarmas, eventos no detectados y tiempo de anticipación. Al principio, usa las alertas para que el equipo revise las condiciones. No conectes una predicción directamente al control de equipos sin validación técnica y salvaguardas propias del proceso.

### 7. Señalar cambios de actividad en ganado

Los registros de collares, identificadores, básculas o sensores ambientales pueden servir para encontrar cambios de actividad o patrones que ameriten observación. Para evaluar el modelo se necesitan registros revisados por personal con conocimiento del establecimiento, identificadores coherentes y datos de distintas estaciones y condiciones de alojamiento.

Comprueba alertas y omisiones en animales y períodos que no aparecieron durante el entrenamiento. El uso razonable es priorizar una observación humana: el modelo no ofrece diagnóstico veterinario ni tratamiento.

### 8. Pronosticar volúmenes para cosecha y logística

Un productor o cooperativa puede estimar el volumen que recibirá, almacenará o despachará combinando cosechas históricas, pedidos, inventario, calendario, estado de cultivos y demoras logísticas. El resultado puede ayudar a preparar capacidad; depende de que los datos de producción y pedidos representen la operación real.

Reserva períodos completos para probar el pronóstico y compáralo con el método actual. Además de MAE o un error porcentual adecuado al volumen, sigue las consecuencias operativas que importan —por ejemplo, faltantes o excedentes— antes de atribuir ahorros al modelo.

## Qué datos y pruebas necesita un proyecto de ML agrícola

Empieza definiendo la predicción concreta: qué valor o evento se estima, para qué parcela o unidad, con cuánta anticipación y qué decisión humana podría informar. Después verifica que exista una observación confiable del resultado real. Sin etiquetas o mediciones de referencia, no se puede saber si el modelo aprendió la señal que interesa.

Separa datos por tiempo y por unidad agrícola. Para imágenes, no repartas al azar fotos de una misma planta o parcela entre entrenamiento y prueba; para sensores, evita que registros casi idénticos del mismo ciclo aparezcan en ambos grupos. Una evaluación útil reserva otra temporada, lote o establecimiento y compara el modelo con una referencia que ya se utiliza.

Elige métricas según la tarea: MAE o RMSE para estimaciones numéricas; precisión, sensibilidad (recall) y falsos negativos para clasificación; y métricas por evento y horizonte para pronósticos. Revisa los resultados por cultivo, región, tipo de suelo y estación, no solo el promedio. En una prueba piloto, registra también si las personas usuarias pudieron actuar con la predicción y qué costos operativos aparecieron. Una métrica de modelo por sí sola no demuestra impacto en la cosecha.

## Qué servicios de AWS pueden apoyar el flujo

| Servicio | Para qué puede servir |
| --- | --- |
| [Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html) | Guardar imágenes, archivos geográficos, series de sensores, etiquetas y artefactos de modelos. |
| [AWS IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/what-is-aws-iot.html) | Conectar dispositivos compatibles y recibir sus mensajes, por ejemplo lecturas de sensores de campo. No entrena el modelo. |
| [AWS IoT Greengrass](https://docs.aws.amazon.com/greengrass/v2/developerguide/perform-machine-learning-inference.html) | Ejecutar inferencias localmente en dispositivos de campo con modelos entrenados en la nube, cuando la conectividad o la latencia lo requieran. |
| [AWS Glue](https://docs.aws.amazon.com/glue/latest/dg/components-key-concepts.html) | Catalogar metadatos y ejecutar transformaciones cuando hay que combinar o preparar fuentes; sus tablas describen los datos, no los almacenan. |
| [Amazon Athena](https://docs.aws.amazon.com/athena/latest/ug/what-is.html) | Consultar datos tabulares que ya estén en S3 para explorar su calidad y estructura. |
| [Amazon SageMaker AI](https://docs.aws.amazon.com/sagemaker/latest/dg/ex1-train-model.html) | Entrenar y probar modelos propios. Para entregar predicciones, permite usar una opción de inferencia según el patrón de uso; [Batch Transform](https://docs.aws.amazon.com/sagemaker/latest/dg/batch-transform.html) procesa lotes sin mantener un endpoint persistente. |

Estos servicios son piezas de una arquitectura, no una solución agrícola empaquetada. En particular, [las capacidades geoespaciales de SageMaker ya no están abiertas a nuevos clientes](https://docs.aws.amazon.com/sagemaker/latest/dg/geospatial.html); la documentación también las limita a Studio Classic y a la región de Oregon. Para un proyecto nuevo con imágenes satelitales, verifica las herramientas geoespaciales y las fuentes de imagen disponibles para tu región, y diseña el procesamiento como una integración propia antes de elegir servicios.

Como referencia conceptual, AWS publicó su [arquitectura Smart Farm](https://docs.aws.amazon.com/es_es/reference-architecture-diagrams/latest/smart-farm-on-aws/smart-farm-on-aws.html) en 2022. Incluye sensores, inferencia en el borde y análisis con servicios como S3, Glue, Athena y SageMaker AI; verifica cada servicio y su disponibilidad en la documentación actual antes de reutilizar el diseño.

Para repasar el flujo general de SageMaker, puedes leer la [guía de Vicente G. Guzmán](https://vicenteguzman.com/aws/2024-08-27-sagemaker-ml-aws/), publicada en agosto de 2024, y la [guía interna de implementación con SageMaker](/blog/guia-para-implementar-machine-learning-con-amazon-sagemaker/). Ambas sirven como orientación; para nombres, interfaces y opciones vigentes, consulta la documentación oficial enlazada en esta sección.

El modo de inferencia también depende de la operación: una predicción diaria para cientos de lotes puede procesarse como lote; una aplicación que necesita responder a cada solicitud puede requerir un endpoint. Mide latencia, volumen y costo con tus datos antes de mantener recursos activos.

## Ejemplos de agricultura documentados por AWS

AWS describe a [Sencrop](https://aws.amazon.com/solutions/case-studies/sencrop-case-study/) como una empresa que usa ML para crear pronósticos meteorológicos localizados. Su caso publicado menciona datos de radar, pronósticos y casi 40.000 sensores de campo; indica que procesa datos con Amazon EMR y los almacena en Amazon Aurora. Esto muestra una aplicación real de datos y ML, pero no prueba que la misma arquitectura o resultados sirvan para otra región o cultivo.

En la historia de [xFarm Technologies](https://aws.amazon.com/solutions/case-studies/aws-pioneers-project/xfarm/), AWS relata usos de IA para revisar fotos de cultivos, observar insectos y anticipar señales de enfermedad a partir de sensores y datos satelitales. La página no identifica los servicios específicos detrás de esos modelos, así que no atribuyo el caso a SageMaker ni a otro servicio concreto.

En un caso coescrito con [Aigen](https://aws.amazon.com/blogs/architecture/how-aigen-transformed-agricultural-robotics-for-sustainable-farming-with-amazon-sagemaker-ai/), AWS describe una plataforma de robots agrícolas con visión por computadora y modelos para dispositivos de campo. El flujo publicado usa AWS IoT Core y Amazon S3 para los datos, revisión humana de etiquetas y Amazon SageMaker AI para entrenar modelos. Es una arquitectura de ese cliente, no un resultado que se pueda esperar sin datos y evaluación propios.

## Recursos y comunidades para continuar

Para entender por qué la preparación y la calidad de datos condicionan el modelo, puedes escuchar [Análisis de datos para machine learning](https://www.youtube.com/watch?v=62s0OxI8SZw), una grabación de *Charlas Técnicas de AWS* publicada el 24 de mayo de 2021. Incluye referencias a herramientas de ese momento; consulta la documentación actual antes de seguir pasos de servicio o interfaz. El [AWS Meetup #47: ML Day con SageMaker, MLOps e IoT](https://www.youtube.com/watch?v=NVEbOgBTNSk) es una grabación de AWS User Group Peru del 28 de septiembre de 2020; puede servir para conceptos, pero no para copiar una configuración actual.

Para conversar sobre decisiones de ML e infraestructura, consulta [AWS UG Machine Learning Latam](https://www.meetup.com/aws-ug-machine-learning-latam/), con sede en Lima; el [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/), un grupo general de AWS; y [AWS User Group Peru](https://www.meetup.com/awsperu/), organizador de dos grabaciones de ML mencionadas arriba. Revisa sus páginas para conocer sus actividades y alcance actuales. También puedes buscar grupos de otros países en el [directorio de comunidades AWS](/comunidades/) y encuentros vigentes en la [Agenda de eventos](/eventos/).
