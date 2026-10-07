---
title: "Servicios de IA en AWS: Bedrock, SageMaker AI y APIs"
description: "Elige un servicio de inteligencia artificial en AWS según tu tarea: Bedrock, SageMaker AI, Textract, voz y visión. Ejemplo Python, costos y recursos en español."
author: "guille-ojeda"
publishedAt: "2024-03-08"
publishedTimestamp: "2024-03-08T13:14:38.36Z"
modifiedTimestamp: "2026-10-07T09:41:54-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
review:
  date: "2026-10-07"
related:
  - title: "Qué es Amazon Bedrock y cómo usarlo: API, permisos y costos"
    url: "https://dondeaprendoaws.com/blog/como-utilizar-amazon-bedrock/"
  - title: "Cómo entrenar y desplegar un modelo en Amazon SageMaker AI"
    url: "https://dondeaprendoaws.com/blog/guia-para-implementar-machine-learning-con-amazon-sagemaker/"
---

**Elige Amazon Bedrock si quieres generar contenido o construir una aplicación con modelos fundacionales; Amazon SageMaker AI si necesitas entrenar y desplegar un modelo propio; y una API especializada si tu tarea es extraer texto, transcribir audio, sintetizar voz o analizar imágenes.** La decisión empieza por la entrada que tienes y la salida que necesitas, no por el servicio más conocido.

Por ejemplo: para leer las líneas de una factura escaneada, empieza por Textract. Para redactar un resumen de esa factura, evalúa un modelo de Bedrock. Para predecir demanda con tu historial de ventas, considera un flujo de machine learning con SageMaker AI. Las tres tareas pueden formar parte de una misma aplicación, pero requieren datos, pruebas y presupuestos distintos.

## Qué servicio de inteligencia artificial elegir

| Necesitas… | Servicio inicial | Entrada → salida |
| --- | --- | --- |
| Resumir, conversar o generar contenido | **Amazon Bedrock** | Mensajes y otras modalidades admitidas por el modelo → contenido generado |
| Entrenar o alojar un modelo de ML propio | **Amazon SageMaker AI** | Datos y código/algoritmo → modelo; nuevas entradas → predicciones |
| Leer documentos y extraer su estructura | **Amazon Textract** | Imagen o documento compatible → texto, ubicación, tablas o campos según la API |
| Detectar objetos o moderar imágenes | **Amazon Rekognition** | Imagen → etiquetas y puntuaciones de confianza |
| Convertir audio en texto | **Amazon Transcribe** | Archivo de audio o flujo en tiempo real → transcripción |
| Convertir texto en voz | **Amazon Polly** | Texto y voz elegida → audio sintetizado |
| Extraer entidades o analizar sentimiento | **Amazon Comprehend** | Texto → entidades, frases o categorías de sentimiento |
| Traducir contenido | **Amazon Translate** | Texto/documento e idiomas → traducción |
| Guiar una conversación con intenciones y datos requeridos | **Amazon Lex V2** | Voz o texto → intención, campos y respuesta del diálogo |

Las APIs especializadas ya cuentan con modelos para sus tareas básicas. No necesitas reunir un conjunto de entrenamiento para probarlas. Algunas ofrecen personalización adicional, que sí requiere datos y configuración. Una llamada tampoco entrena automáticamente un modelo exclusivo para tu aplicación.

## Amazon Bedrock o SageMaker AI: dónde está la diferencia

### Bedrock para aplicaciones generativas

[Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html) ofrece inferencia administrada: envías una solicitud y AWS opera la infraestructura que ejecuta el modelo. Encaja en asistentes, resúmenes, generación de texto y otras modalidades disponibles en su catálogo. No necesitas desplegar un servidor de inferencia para una primera llamada.

El modelo determina las entradas, salidas, idioma, APIs compatibles, región y precio. Consulta las [fichas actuales de modelos](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html) antes de copiar un identificador de un tutorial. Un modelo que admite texto no necesariamente admite imágenes, audio o todas las funciones de conversación.

Si quieres responder con documentos propios, puedes recuperar fragmentos relevantes y agregarlos al contexto del modelo: eso es **RAG**, generación aumentada por recuperación. [Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-how-retrieval.html) ofrece capacidades para ese flujo. No es lo mismo que entrenar el modelo y tampoco garantiza que la respuesta sea correcta: debes comprobar la recuperación, las fuentes y cuándo conviene abstenerse.

La [guía de Bedrock con Python](/blog/como-utilizar-amazon-bedrock/) explica una primera llamada con Converse, sus permisos y errores. Para pasar a una aplicación con documentos, Hazel Sáenz muestra [una API con Strands, Lambda y Knowledge Bases](https://dev.to/aws-espanol/chatea-con-tu-propia-data-guia-practica-con-strands-y-amazon-bedrock-222b). Ese proyecto requiere Python 3.12, Docker, AWS CLI y CDK; despliega recursos que pueden generar cargos.

### SageMaker AI para construir y servir tus modelos

[Amazon SageMaker AI](https://docs.aws.amazon.com/sagemaker/latest/dg/whatis.html) permite desarrollar, entrenar y desplegar modelos con algoritmos y frameworks propios o disponibles en el servicio. Encaja cuando necesitas controlar el conjunto de entrenamiento, las características, el algoritmo o el entorno que sirve las predicciones. Puede trabajar con modelos predictivos y fundacionales.

El resultado de un entrenamiento es un artefacto de modelo. Para usarlo después, eliges una modalidad de inferencia, como un endpoint interactivo o un trabajo por lotes. Tu equipo sigue siendo responsable de preparar datos representativos, separar entrenamiento y evaluación, medir errores y mantener el modelo.

Desde diciembre de 2024, el servicio de ML se llama **SageMaker AI**; el nombre **Amazon SageMaker** también identifica una plataforma más amplia de datos, analítica e IA. Los tutoriales antiguos pueden usar el nombre anterior.

La [guía para entrenar y desplegar con SageMaker AI](/blog/guia-para-implementar-machine-learning-con-amazon-sagemaker/) recorre un ejemplo tabular y su limpieza. Como complemento conceptual, puedes ver [Machine Learning para developers con SageMaker](https://www.youtube.com/watch?v=4IAJOSCwWOo), del AWS User Group Perú, o [Redes neuronales con TensorFlow en SageMaker](https://www.youtube.com/watch?v=yzAd3XLWjLU), del AWS User Group Paraguay. Son grabaciones históricas: confirma versiones del SDK y contenedores antes de ejecutar el código.

**Bedrock también ofrece personalización de ciertos modelos.** “Usar mis datos” no obliga por sí solo a elegir SageMaker AI. Decide si necesitas proporcionar contexto durante la inferencia, personalizar un modelo compatible o controlar un entrenamiento y despliegue propios.

## APIs para documentos, imágenes, voz y texto

**Textract y Rekognition resuelven problemas diferentes.** [Textract](https://docs.aws.amazon.com/textract/latest/dg/what-is.html) extrae texto de documentos; sus operaciones de análisis pueden devolver formularios, tablas o información de recibos. [Rekognition](https://docs.aws.amazon.com/rekognition/latest/dg/what-is.html) analiza contenido visual, por ejemplo objetos y categorías de moderación. Para procesar campos de una factura, prueba Textract; para clasificar fotos de un catálogo, prueba Rekognition.

**Transcribe y Polly trabajan en direcciones opuestas.** [Transcribe](https://docs.aws.amazon.com/transcribe/latest/dg/what-is.html) convierte audio en texto, desde archivos en S3 o streaming. [Polly](https://docs.aws.amazon.com/polly/latest/dg/what-is.html) sintetiza audio a partir de texto. Revisa el idioma y las funciones de Transcribe, y la combinación de voz, motor y región de Polly. La charla de Ricardo Castillo sobre [accesibilidad con Transcribe, Polly y Amplify](https://www.nerdearla.com/nerdflix/6pfuHVNqJgU/) muestra esta integración en JavaScript; es material de Nerdearla Chile 2023.

**Comprehend y Translate producen resultados especializados.** [Comprehend](https://docs.aws.amazon.com/comprehend/latest/dg/what-is.html) identifica entidades, frases clave y sentimiento en texto; verifica qué idiomas admite cada función. [Translate](https://docs.aws.amazon.com/translate/latest/dg/what-is.html) traduce contenido. Puedes comparar una API especializada con un modelo generativo si ambos cubren tu tarea, usando las mismas entradas y una evaluación del resultado que realmente importa.

Para un bot que debe recoger datos como fecha, destino o número de pedido, [Lex V2](https://docs.aws.amazon.com/lexv2/latest/dg/what-is.html) permite configurar intenciones, campos —*slots*— y flujo de diálogo. Una conversación abierta basada en documentos puede encajar mejor en una aplicación de Bedrock; ambos pueden integrarse cuando el flujo lo requiere.

Si buscas recomendaciones de productos basadas en interacciones, [Amazon Personalize](https://docs.aws.amazon.com/personalize/latest/dg/what-is-personalize.html) es otra opción específica. Necesita datos de interacción y recursos de entrenamiento/recomendación: no funciona como una API de texto a la que enviar un prompt.

Elizabeth Fuentes reúne [ejemplos de APIs de IA con subtítulos, documentos y voz](https://dev.to/aws-espanol/todas-las-cosas-que-comprehend-rekognition-textract-polly-transcribe-y-otros-pueden-hacer-2kl6). El artículo es de 2023; úsalo para estudiar las integraciones y aplica las restricciones actuales siguientes.

### Servicios y funciones que un tutorial antiguo puede recomendar mal

- **AWS DeepLens está retirado.** Terminó su servicio en enero de 2024; no es una opción para iniciar un proyecto. Figura en el [inventario de ciclo de vida de AWS](https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html).
- **Amazon Forecast no admite clientes nuevos** desde julio de 2024. La [documentación de Forecast](https://docs.aws.amazon.com/forecast/latest/dg/doc-history.html) conserva instrucciones para clientes existentes; para un proyecto nuevo de predicción, evalúa un modelo y un flujo vigentes.
- **Comprehend sigue disponible**, pero [topic modeling, event detection y prompt safety classification](https://docs.aws.amazon.com/comprehend/latest/dg/comprehend-availability-change.html) ya no admiten clientes nuevos. Esto no afecta a sus otras funciones.
- **Rekognition sigue disponible**, pero [Streaming Video y Bulk Image Analysis](https://docs.aws.amazon.com/rekognition/latest/dg/rekognition-availability-changes.html) ya no admiten clientes nuevos. Esa restricción no equivale a retirar todas las APIs de imágenes o video almacenado.

Las dos restricciones de funciones rigen desde el 30 de abril de 2026. AWS indica que conservan acceso las cuentas que hayan usado esas funciones en los últimos 12 meses. Comprueba la situación de la cuenta concreta antes de diseñar una solución sobre ellas.

## Ejemplo: extraer líneas de una imagen con Textract y Python

Para una primera prueba, prepara una imagen **PNG o JPEG pequeña, de menos de 1 MB**, con texto impreso legible y sin datos sensibles. Instala Boto3 con `python3 -m pip install boto3` y configura credenciales temporales con una identidad que permita `textract:DetectDocumentText`. La [cadena de credenciales de Boto3](https://docs.aws.amazon.com/boto3/latest/guide/credentials.html) puede usar el perfil de tu entorno o el rol de ejecución de una carga de AWS; no pongas claves en el código.

Guarda el archivo como `documento.png` y ejecuta:

```python
from pathlib import Path
import boto3

client = boto3.client("textract", region_name="us-east-1")
response = client.detect_document_text(
    Document={"Bytes": Path("documento.png").read_bytes()}
)

for block in response["Blocks"]:
    if block["BlockType"] == "LINE":
        print(block["Text"], round(block["Confidence"], 1))
```

La entrada son los bytes de la imagen. La salida es una lista de bloques; el ejemplo imprime el texto y la confianza de cada línea. Esa confianza es una puntuación del servicio, no una garantía de que el importe, nombre o número sea correcto. La [referencia de Boto3](https://docs.aws.amazon.com/boto3/latest/reference/services/textract/client/detect_document_text.html) documenta la solicitud y la respuesta. Ejecutar la llamada puede generar cargos.

`DetectDocumentText` no devuelve por sí solo una tabla de campos de factura. Para formularios o tablas revisa `AnalyzeDocument`; para facturas y recibos, `AnalyzeExpense`. Los PDF de varias páginas requieren un flujo asíncrono. Según los [límites de Textract](https://docs.aws.amazon.com/textract/latest/dg/limits-document.html), el texto impreso en español está admitido, pero el reconocimiento manuscrito y las Queries tienen restricciones de idioma: no asumas que todas las funciones trabajan igual en español.

Para practicar el procesamiento de la respuesta sin llamar a AWS, el [taller OCR de comprobantes ecuatorianos](https://github.com/jossuema/textract-ec) incluye un modo offline con respuestas grabadas. Su modo online sí usa tu cuenta y los servicios de AWS; sus reglas fiscales ilustran ese caso y debes adaptarlas al documento y país que proceses.

## Qué comprobar antes de integrar un servicio

1. **Disponibilidad y contrato de entrada.** Confirma región, operación, formato, tamaño e idioma. En Bedrock, revisa también modelo y API. Los [perfiles de inferencia entre regiones](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html) pueden dirigir solicitudes fuera de la región de origen; valida la ruta si necesitas residencia de datos.
2. **Permisos y acceso al modelo.** Usa roles o credenciales temporales con las acciones necesarias. En Bedrock, muchos modelos se habilitan con los permisos apropiados de Marketplace, pero algunos tienen requisitos adicionales de cuenta o proveedor. La [guía de acceso](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) explica suscripciones y el formulario inicial de Anthropic; un permiso de invocación no resuelve todos esos requisitos.
3. **Privacidad y retención.** Revisa qué datos envías, qué almacena tu aplicación y quién puede leer los logs. No apliques una garantía común a todos los servicios: las [políticas de exclusión de uso para mejora de servicios de IA](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai-opt-out.html) cubren servicios específicos. En Bedrock, consulta la [retención según modelo y configuración regional](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html): ciertos modelos requieren retención o revisión por AWS, y una política incompatible puede bloquear la solicitud.
4. **Calidad en tu tarea.** Prueba documentos borrosos, variantes del idioma y casos donde el resultado deba quedar pendiente de revisión. En IA generativa, mide también invenciones, fuentes y respuestas incompletas. En extracción, valida campos críticos con reglas del negocio. Los controles de contenido no sustituyen estas comprobaciones.
5. **Errores y volumen.** Distingue permisos, entrada inválida y límites de capacidad. No reintentes indefinidamente un fallo permanente. Para Bedrock, la [guía de Daniel Castillo sobre aumentos de cuota](https://dcastillogi.com/blog/como-solicitar-aumentos-de-cuota-para-amazon-bedrock-y-que-te-los-aprueben) ayuda a reunir datos de uso; una solicitud no garantiza aprobación ni un plazo de respuesta.

## Cómo comparar costos sin una tarifa engañosa

Compara **el costo por resultado aceptable**, contando errores, repeticiones y revisión humana. Un precio bajo por llamada puede resultar caro si necesitas varias llamadas o corregir muchas salidas.

- **Bedrock:** el modelo y la modalidad determinan la tarifa. En generación de texto suelen cobrarse tokens de entrada y salida; caché y otras capacidades pueden añadir unidades distintas. Cuenta el historial de conversación y el contexto recuperado, y revisa los [precios actuales de Bedrock](https://aws.amazon.com/bedrock/pricing/).
- **SageMaker AI:** estima preparación, entrenamiento e inferencia. Un endpoint en tiempo real puede generar cargos entre solicitudes; cerrar un notebook en el navegador no necesariamente detiene su cómputo. Consulta los [precios de SageMaker AI](https://aws.amazon.com/sagemaker/ai/pricing/) y elimina los recursos de prueba al terminar.
- **APIs especializadas:** la unidad depende de la operación: páginas, imágenes, audio o texto procesado. En Textract, OCR simple y análisis de formularios tienen tarifas distintas; revisa la [API que vas a usar](https://aws.amazon.com/textract/pricing/). Incluye S3, logs y el cómputo de integración cuando correspondan.

El [análisis de inteligencia frente a costo de Daniel Castillo](https://dcastillogi.com/blog/bedrock-inteligencia-vs-costo), con corte al 24 de septiembre de 2026, ayuda a seleccionar modelos para comparar. Combina precios de `us-east-1` con un benchmark externo: no predice la calidad de tu aplicación.

Prepara [permisos, alertas y limpieza](/blog/seguridad-y-control-de-costos-en-aws-guia-2024/) y revisa el gasto con [Cost Explorer](/blog/analisis-de-costos-de-aws-con-cost-explorer/). Una alerta no constituye un tope general que detenga cargos. Que el material de un curso sea accesible sin pago tampoco vuelve gratuitas las llamadas de AWS.

## Cuándo entran Strands Agents y Bedrock AgentCore

Solo necesitas un agente cuando el flujo requiere que un modelo elija o coordine herramientas y pasos. Para OCR, traducción o un resumen aislado, empieza con la API directa.

**Strands Agents** es un SDK abierto que ejecutas dentro de tu aplicación para construir agentes; **Bedrock AgentCore** ofrece servicios administrados para desplegarlos y operarlos, como Runtime, Memory y Gateway. AgentCore admite distintos frameworks y modelos; sus componentes pueden usarse por separado. Consulta la [descripción oficial de AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html) y el [proyecto Strands](https://github.com/strands-agents/sdk-python).

Para avanzar, el [curso de Ricardo Ceci](https://github.com/ricardoceci/curso-strands-agentcore-2026) reúne notebooks de agentes, herramientas, memoria y coordinación. Requiere Python 3.11+ y acceso a Bedrock para su primer laboratorio; algunos ejercicios usan claves externas. Puedes acompañarlo con su [primera clase](https://www.youtube.com/watch?v=-nVtB6ly0wc) y la [sesión sobre despliegue con AgentCore](https://www.youtube.com/watch?v=XsYM9A3JKNg). El [curso de Píldoras de Programación](https://github.com/pildorasdeprogramacion/curso-strands-agents) construye un asistente de academia por módulos y contempla proveedores alternativos, incluido Ollama local. Revisa el índice publicado y los requisitos de cada módulo antes de empezar.

## Aprender IA en AWS con las comunidades

Elige un recurso según el siguiente paso que necesitas practicar:

- **Bedrock:** [Amazon Bedrock L200 de AWS Women Colombia](https://www.youtube.com/watch?v=btZ3kTe4FlM) sirve como sesión temática para ampliar los conceptos. El [sitio de AWS Women Colombia](https://awswomencolombia.com/) reúne más lecturas y enlaces de eventos, y su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw) contiene grabaciones.
- **Comparar resultados:** [Crear un chatbot y evaluar diferentes LLMs con Bedrock](https://www.youtube.com/watch?v=zsJh5FzEj60), de AWS Girls Chile, permite estudiar esa decisión. Sigue sus [canales comunitarios](https://linktr.ee/awsgirlschile) para consultar otras sesiones.
- **Controles de contenido:** [IA responsable con Bedrock Guardrails](https://www.youtube.com/watch?v=lPENMJd0Nbc), con Verónica Rivera en RoxsFest, trata ese tema. Comprueba disponibilidad y precios actuales antes de reproducir una configuración.
- **APIs especializadas:** [Explorando Amazon Comprehend](https://www.youtube.com/watch?v=8Cy9sGYCW78), de CreaTicas, y el [Rekognition Immersion Day](https://www.youtube.com/watch?v=pt5dJaeFIAE), de AWS User Group Medellín, ofrecen dos recorridos distintos. Contrasta las funciones mostradas con los avisos de disponibilidad de esta guía.
- **Aprender acompañado:** [AWS UG Machine Learning Latam](https://www.meetup.com/aws-ug-machine-learning-latam/) difunde ML en Latinoamérica y publica encuentros de ML e IA generativa. El [portal de AWS User Group Perú](https://awsugperu.cloud/) reúne comunidades locales, actividades y recursos generales de AWS. También puedes buscar un grupo cercano en el [directorio de comunidades](/comunidades/).

Al revisar la agenda el 7 de octubre de 2026, estaban anunciados estos encuentros:

- [Introducción a la IA con AWS Cloud, de AWS User Group Piura](https://www.meetup.com/aws-user-group-piura/events/316380557/): **17 de octubre de 2026, de 09:00 a 13:00, hora de Perú (UTC−5)**, presencial en el Colegio de Ingenieros del Perú, CD Piura.
- [SegurAWS Américas: aplicaciones con Bedrock Guardrails](https://www.meetup.com/aws-user-group-panama/events/316730779/): **19 de noviembre de 2026, de 15:00 a 16:30, hora de Panamá (UTC−5)**, en línea, publicado por AWS User Group Panamá.

Consulta registro, cupos y requisitos en las fichas; no asumas que incluyen una cuenta de AWS o uso gratuito. Si la fecha ya pasó o cambió, continúa con la [agenda de eventos AWS](/eventos/). Las grabaciones y repositorios son recursos de aprendizaje: sus autores no garantizan compatibilidad permanente con las versiones y condiciones de AWS.
