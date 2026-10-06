---
title: "Inteligencia artificial en AWS: qué servicio elegir y por dónde empezar"
description: "Distingue machine learning e IA generativa, compara los servicios de IA de AWS y elige una primera ruta con Amazon Bedrock, SageMaker AI o APIs especializadas."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:08:46.131Z"
modifiedTimestamp: "2026-10-06T17:34:19-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
review:
  date: "2026-10-06"
related:
  - title: "Qué es Amazon Bedrock y cómo usarlo: API, permisos y costos"
    url: "https://dondeaprendoaws.com/blog/como-utilizar-amazon-bedrock/"
  - title: "Cómo entrenar y desplegar un modelo en Amazon SageMaker AI"
    url: "https://dondeaprendoaws.com/blog/guia-para-implementar-machine-learning-con-amazon-sagemaker/"

---

Si buscas inteligencia artificial en AWS, empieza por definir qué resultado necesitas: extraer datos de una factura, transcribir audio, responder preguntas sobre documentos, clasificar imágenes o predecir un valor. AWS ofrece servicios especializados para algunas tareas y plataformas para crear aplicaciones generativas o desarrollar modelos propios. Elegir por el problema suele ser más útil que empezar por el nombre de un servicio.

Esta guía presenta esas rutas y un método sencillo para escoger una primera prueba. Si todavía te falta una vista general de la nube, puedes leer la [introducción a los servicios de AWS](/blog/introduccion-a-los-servicios-de-amazon-web-services/) antes de entrar en IA.

## IA, machine learning e IA generativa

La **inteligencia artificial (IA)** es el campo amplio. El **machine learning** o aprendizaje automático (ML) es una forma de IA en la que un modelo aprende patrones a partir de datos para producir predicciones o clasificaciones. La **IA generativa** usa modelos capaces de producir contenido nuevo, como texto, imágenes o audio, a partir de una instrucción y el contexto disponible.

Por ejemplo, un modelo de ML puede estimar la demanda del próximo mes a partir de ventas históricas. Un modelo generativo puede redactar un resumen de una política interna. Ninguno garantiza por sí mismo que el resultado sea correcto: hay que probarlo con ejemplos representativos y decidir qué errores son aceptables.

Para repasar estos conceptos en español, la comunidad AWS Tech Girls ofrece el artículo [Fundamentos de IA y ML: conceptos y terminología](https://builder.aws.com/content/3HCJ3JtjZgLleslkiGnlFwI6MU6/fundamentos-de-ia-y-ml-conceptos-y-terminologa) y una [sesión grabada con el mismo temario](https://awsgirls.tech/sesiones/fundamentos-de-ia-y-ml). Explican cómo se relacionan IA, ML y deep learning, además de nociones como entrenamiento, inferencia y sobreajuste. Forman parte de una serie comunitaria sobre AWS Certified AI Practitioner; son material de aprendizaje, no una promesa de aprobar una certificación.

## Qué servicio de IA de AWS conviene explorar

Esta lista es un punto de partida, no un catálogo completo. AWS mantiene una [lista vigente de servicios y herramientas de IA](https://aws.amazon.com/es/ai/services/); comprueba en la documentación que una función, modelo y región sean compatibles con tu caso.

- **Transcribir voz a texto:** [Amazon Transcribe](https://docs.aws.amazon.com/transcribe/latest/dg/what-is.html) convierte audio grabado o en tiempo real a texto. Comprueba los idiomas, el tipo de audio y las opciones que admite tu flujo.
- **Extraer campos de una factura o un recibo:** [Amazon Textract](https://docs.aws.amazon.com/textract/latest/dg/invoices-receipts.html) ofrece AnalyzeExpense para detectar campos y partidas en esos documentos. Revisa una muestra de resultados: reconocer un campo no valida que el dato o la operación comercial sean correctos.
- **Detectar objetos o conceptos generales en imágenes:** [Amazon Rekognition](https://docs.aws.amazon.com/rekognition/latest/dg/labels-detect-labels-image.html) puede devolver etiquetas y propiedades de imagen. Para etiquetas propias, [Rekognition Custom Labels](https://docs.aws.amazon.com/rekognition/latest/customlabels-dg/) permite entrenar un modelo con imágenes etiquetadas y medirlo con un conjunto de prueba.
- **Crear una aplicación que genere respuestas, resúmenes o contenido:** [Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html) permite integrar modelos fundacionales y ofrece capacidades como bases de conocimiento. Compara modelos, operaciones, región, datos de entrada y precio; las respuestas pueden contener errores.
- **Entrenar, personalizar y desplegar un modelo para un problema propio:** [Amazon SageMaker AI](https://aws.amazon.com/es/sagemaker/ai/) reúne herramientas para preparar datos, entrenar, evaluar y desplegar modelos. Es una ruta para casos que requieren más control sobre el modelo y el flujo de ML.

Como material de nivel intermedio, la grabación de AWS Women Colombia [SageMaker: Transformando el Aprendizaje Automático en AWS](https://www.youtube.com/watch?v=ojbVlWU7IqI) (22 de agosto de 2024) presenta el desarrollo, entrenamiento e implementación de modelos con SageMaker. Úsala para ampliar el contexto; los nombres y pasos pueden haber cambiado, así que consulta la documentación de SageMaker AI antes de reproducir instrucciones.

Para modelos generativos, una [base de conocimiento de Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html) puede recuperar información de fuentes conectadas para aportar contexto a la respuesta. La recuperación ayuda a trabajar con documentos autorizados, pero no garantiza una respuesta correcta ni reemplaza la revisión de las fuentes.

Si quieres profundizar en los límites antes de diseñar, la sesión grabada [IA generativa: capacidades, limitaciones e infraestructura en AWS](https://awsgirls.tech/sesiones/capacidades-limitaciones-e-infraestructura) de AWS Tech Girls trata alucinaciones, respuestas no deterministas y criterios para seleccionar modelos. Forma parte de una serie comunitaria para aprender conceptos de AI Practitioner.

Si tu caso de uso requiere un agente que coordine herramientas, el repositorio en español [Agentes con Strands: primeros pasos y laboratorios](https://github.com/ricardoceci/curso-strands-agentcore-2026) incluye cuadernos ejecutables de Python que empiezan con Bedrock y luego avanzan a herramientas externas y memoria. El primer laboratorio requiere Python 3.11 o posterior y acceso a Bedrock; otros ejercicios necesitan claves de servicios externos. Es una ruta técnica para profundizar, no un requisito para probar una aplicación generativa sencilla.

## Bedrock, SageMaker AI o un servicio especializado

La pregunta no es cuál servicio es mejor en general, sino cuál se ajusta al trabajo:

- **Usa un servicio especializado** cuando la tarea coincide con una capacidad concreta, como transcribir audio o extraer campos de recibos. No hace falta entrenar un modelo propio solo para probar una función que ya existe.
- **Evalúa Amazon Bedrock** cuando la aplicación debe generar o resumir texto, responder en lenguaje natural o trabajar con modelos fundacionales. Aún debes elegir y probar un modelo, controlar qué información envías y validar las respuestas.
- **Evalúa SageMaker AI** cuando necesitas desarrollar o adaptar un modelo de ML con tus datos y gestionar su entrenamiento, evaluación y despliegue. No todo proyecto necesita empezar desde cero, pero sí conviene tener datos adecuados y una forma de medir si el modelo funciona.
- **Combina servicios** cuando cada uno resuelve una parte distinta. Por ejemplo, Textract puede extraer datos de un documento y una aplicación puede usar Bedrock para redactar una explicación basada en una política autorizada. Cada paso necesita su propia validación.

AWS mantiene una [guía de decisión entre Amazon Bedrock y SageMaker AI](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/bedrock-or-sagemaker.html) con criterios más detallados. Para pasar de la comparación a una primera llamada con permisos, región y costos, sigue la [guía de Amazon Bedrock con el SDK de AWS](/blog/como-utilizar-amazon-bedrock/). Si tu ruta requiere un modelo predictivo propio, consulta la [guía para entrenar y evaluar un modelo en SageMaker AI](/blog/guia-para-implementar-machine-learning-con-amazon-sagemaker/).

## Un ejemplo para empezar sin construir de más

Supón que un equipo recibe facturas y quiere recuperar proveedor, fecha, total y conceptos:

1. Define los campos que necesita el proceso y qué errores requieren una revisión manual.
2. Prueba Amazon Textract con documentos que tengas autorización para usar y verifica los resultados contra los valores revisados por una persona.
3. Si después necesitas explicar un resultado usando una política interna, evalúa una aplicación generativa con Bedrock y las fuentes de información adecuadas. Conserva las referencias usadas y revisa cualquier respuesta que pueda afectar un pago.
4. Compara el resultado con el proceso actual: calidad de extracción, tiempo de revisión y costo por documento.

Si la necesidad fuera predecir ventas, en cambio, definirías el resultado, prepararías datos históricos representativos y compararías el modelo con una referencia sencilla antes de automatizar decisiones. Ese problema puede llevarte a SageMaker AI; un chatbot no lo resuelve por el hecho de generar respuestas convincentes.

## Antes de probar: datos, evaluación y costo

Antes de enviar datos a un servicio, confirma que tienes autorización para usarlos y revisa los permisos, la región y las condiciones de manejo que aplican. No pegues información confidencial en una consola o demostración sin verificar primero las políticas de tu organización.

Prueba con ejemplos que representen entradas normales y casos difíciles. Compara las salidas con una respuesta revisada y registra dónde falla el sistema. Para una respuesta generativa, verifica tanto el texto como las fuentes que la aplicación presenta. Para una predicción, mide el error que importa al proceso, no solo una cifra promedio.

Las pruebas de inferencia, almacenamiento y cómputo pueden generar cargos, según el servicio y la forma de uso. Consulta los [precios de Amazon Bedrock](https://aws.amazon.com/bedrock/pricing/), [SageMaker AI](https://aws.amazon.com/sagemaker/ai/pricing/) o del servicio especializado que elijas antes de ejecutar una prueba. Revisa también la disponibilidad regional y elimina los recursos de cómputo que ya no necesites.

## Recursos, comunidades y eventos para continuar

También puedes aprender con otras personas:

- En Córdoba, el perfil de [AWS AI User Group Argentina](https://www.meetup.com/aws-ai-user-group-argentina/) describe encuentros presenciales y en línea sobre IA aplicada al desarrollo de software e infraestructura. Consulta su agenda para confirmar próximas actividades.
- [AI AWS UG Chile](https://www.meetup.com/es-es/ai-aws-ug-chile/) se enfoca en IA y machine learning en AWS; su perfil publica las próximas reuniones y las instrucciones de registro.
- [AWS User Group Perú](https://awsugperu.cloud/) reúne grupos locales, actividades, grupos de estudio y recursos para seguir aprendiendo cloud e IA.
- La [guía de comunidades AWS](/comunidades/) permite explorar grupos por ubicación y temas. La [agenda de eventos AWS](/eventos/) muestra opciones en línea, presenciales e híbridas, con fechas e inscripción.

Al revisar esa agenda el 6 de octubre de 2026, figuraba el [Meetup presencial “Introducción a la IA con AWS Cloud” de AWS User Group Piura y GDG Piura](https://www.meetup.com/aws-user-group-piura/events/316380557/), el sábado 17 de octubre de 9:00 a 13:00, en Piura (UTC−5). El programa anuncia fundamentos, demostraciones de Bedrock, Textract y Rekognition, y un asistente sobre documentos; la ficha indica que no requiere experiencia y anuncia registro gratuito mediante [GDG Piura](https://gdg.community.dev/events/details/google-gdg-piura-presents-introduccion-a-la-ia-con-aws-cloud/). Confirma cupos y detalles con los organizadores antes de asistir.
