---
title: "AWS DeepLens: fin de soporte y alternativas actuales"
description: "AWS DeepLens cerró en 2024. Qué dejó de funcionar para sus usuarios y qué opciones actuales sirven para aprender visión artificial e inferencia local."
author: "guille-ojeda"
publishedAt: "2024-05-04"
publishedTimestamp: "2024-05-04T13:44:53.053Z"
modifiedTimestamp: "2026-10-05T12:59:21-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "AWS gratis para estudiantes y docentes: cursos y laboratorios"
    url: "https://dondeaprendoaws.com/blog/aws-gratis-para-educadores-y-estudiantes/"

---

<p>AWS DeepLens fue una cámara programable para practicar visión artificial y ejecutar inferencias junto al dispositivo. AWS cerró el servicio el <strong>31 de enero de 2024</strong>: ya no es posible administrar DeepLens desde la consola ni usar sus proyectos como muestran los tutoriales antiguos. AWS la incluye entre los servicios retirados por completo en su <a href="https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html" rel="noopener noreferrer" target="_blank">lista oficial de cierres</a>.</p>

<p>Esta guía explica qué cambió para quienes ya tienen una cámara DeepLens y qué caminos actuales sirven para aprender clasificación de imágenes, detección de objetos o inferencia local en el borde.</p>

<h2>Qué era AWS DeepLens</h2>

<p>DeepLens combinaba una cámara con cómputo local y un servicio de AWS para crear proyectos de visión artificial. El modelo procesaba imágenes en el dispositivo; el código podía usar los resultados localmente o enviarlos a otros servicios de AWS. La propuesta era probar el ciclo de captura, inferencia y respuesta sin diseñar desde cero todo el dispositivo.</p>

<p>Ese flujo sigue siendo una buena forma de pensar un proyecto: una cámara produce fotogramas, un modelo identifica patrones y la aplicación decide qué hacer. Lo que terminó fue el producto DeepLens y su administración desde AWS, no el aprendizaje de visión artificial ni la posibilidad de ejecutar modelos en equipos compatibles.</p>

<h2>Qué cambió cuando DeepLens cerró</h2>

<ul>
  <li><strong>La consola y la administración de DeepLens dejaron de estar disponibles.</strong> AWS anunció que, desde el cierre, no se podían administrar dispositivos ni acceder a proyectos creados con el servicio. La <a href="https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html" rel="noopener noreferrer" target="_blank">lista de servicios en cierre total</a> confirma que AWS DeepLens terminó su soporte el 31 de enero de 2024.</li>
  <li><strong>Las instrucciones de registro y despliegue dejaron de ser aplicables.</strong> No sigas un tutorial que te pida registrar una cámara, crear un proyecto DeepLens en la consola o publicar una función para desplegarla por ese mecanismo.</li>
  <li><strong>Revisa los recursos de las cuentas que usaste.</strong> El cierre del servicio no confirma que esas cuentas y regiones hayan quedado limpias. Comprueba si todavía necesitas buckets de S3, funciones Lambda, objetos de AWS IoT o roles de IAM relacionados; verifica sus dependencias antes de borrarlos. El almacenamiento o los recursos activos pueden generar cargos.</li>
  <li><strong>El equipo no recupera soporte por seguir encendido.</strong> AWS retiró DeepLens por completo, así que el servicio ya no está disponible ni recibe soporte, como muestra la <a href="https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html" rel="noopener noreferrer" target="_blank">lista oficial de cierres</a>. Si el dispositivo todavía ejecuta código local, eso no implica soporte vigente para hardware o software. No dependas de él para una aplicación nueva.</li>
</ul>

<p>El cierre también afecta proyectos anteriores: si necesitas un modelo, código o conjunto de datos, búscalo en tus copias locales, repositorios y buckets que aún existan. No cuentes con poder recuperarlo desde la consola de DeepLens.</p>

<h2>Qué usar para aprender visión artificial hoy</h2>

<p>No hay un reemplazo uno a uno para DeepLens. Elige la ruta según lo que quieras entender y dónde deba ejecutarse la inferencia:</p>

<h3>Reconocer objetos o escenas habituales</h3>
<p><a href="https://docs.aws.amazon.com/rekognition/latest/dg/labels-detect-labels-image.html" rel="noopener noreferrer" target="_blank">Amazon Rekognition, operación DetectLabels</a> recibe una imagen y devuelve etiquetas mediante una API administrada. Sirve para explorar análisis de imágenes; no ejecuta tu modelo localmente en una cámara.</p>

<h3>Clasificar o localizar objetos propios</h3>
<p><a href="https://docs.aws.amazon.com/rekognition/latest/customlabels-dg/what-is.html" rel="noopener noreferrer" target="_blank">Amazon Rekognition Custom Labels</a> permite entrenar un modelo con imágenes etiquetadas para categorías de tu caso. Revisa los requisitos del conjunto de datos y la modalidad de inferencia antes de empezar.</p>

<h3>Entrenar un modelo con control sobre el flujo de ML</h3>
<p>Los <a href="https://docs.aws.amazon.com/sagemaker/latest/dg/algorithms-vision.html" rel="noopener noreferrer" target="_blank">algoritmos de visión de Amazon SageMaker AI</a> ofrecen opciones para clasificación, detección y segmentación. Entrenamiento, almacenamiento e inferencia en AWS pueden tener cargos.</p>

<h3>Ejecutar inferencia cerca de la cámara</h3>
<p>Los <a href="https://docs.aws.amazon.com/greengrass/v2/developerguide/perform-machine-learning-inference.html" rel="noopener noreferrer" target="_blank">componentes de machine learning de AWS IoT Greengrass V2</a> permiten desplegar código, runtime y modelos a un dispositivo compatible. Esta ruta puede servir si necesitas inferencia local sin una llamada por imagen a la nube. Debes elegir y configurar tu propio equipo; no es una cámara lista para usar como lo era DeepLens.</p>

<p>Greengrass V2 ofrece componentes de ejemplo con TensorFlow Lite para clasificación de imágenes y detección de objetos, además de componentes que puedes adaptar a tus modelos. Antes de elegir una placa o una cámara, consulta la <a href="https://docs.aws.amazon.com/greengrass/v2/developerguide/machine-learning-components.html" rel="noopener noreferrer" target="_blank">lista de componentes y plataformas compatibles</a>. La compatibilidad depende del sistema operativo, la arquitectura y los requisitos del modelo; no presupongas que un dispositivo mencionado en un tutorial antiguo sigue siendo una opción soportada.</p>

<p>Una ruta práctica es empezar con imágenes de prueba y distinguir dos tareas: <strong>clasificación</strong> asigna una o más categorías a una imagen; <strong>detección</strong> identifica objetos y su ubicación dentro de la imagen. Luego, compara el resultado con etiquetas revisadas por una persona. Si tu objetivo es un caso específico, reúne imágenes representativas y reserva algunas que no usarás durante el entrenamiento para comprobar cómo responde el modelo ante ejemplos nuevos.</p>

<p>Antes de ejecutar trabajos de entrenamiento o procesar imágenes en AWS, revisa los <a href="https://aws.amazon.com/sagemaker/ai/pricing/" rel="noopener noreferrer" target="_blank">precios de SageMaker AI</a> y los <a href="https://aws.amazon.com/rekognition/pricing/" rel="noopener noreferrer" target="_blank">precios de Rekognition</a> para la región y el uso que planeas. Por ejemplo, Rekognition cobra el análisis de imágenes por uso. Borra al terminar los recursos de prueba que ya no necesites.</p>

<p>Si todavía no tienes una cámara y quieres empezar a practicar AWS sin comprar hardware, nuestra <a href="/blog/aws-gratis-para-educadores-y-estudiantes/">guía de cursos y laboratorios para estudiantes y docentes</a> explica AWS Educate y otras opciones de formación. Esos laboratorios ayudan a aprender servicios de AWS, pero no simulan una cámara ni sustituyen una prueba de inferencia local.</p>

<h2>Evita alternativas que también quedaron obsoletas</h2>

<p>Algunas páginas antiguas sobre DeepLens todavía recomiendan AWS Panorama. El servicio cerró por completo el <strong>20 de mayo de 2026</strong>; <strong>Amazon Lookout for Vision</strong> terminó su soporte el <strong>31 de octubre de 2025</strong>. AWS incluye a ambos en su <a href="https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html" rel="noopener noreferrer" target="_blank">lista oficial de cierres</a>. No los elijas como servicios nuevos para proyectos de visión.</p>

<h2>Recursos, comunidades y ayuda</h2>

<ul>
  <li><strong>Para una introducción a ML en AWS:</strong> la grabación de 2021 <a href="https://www.youtube.com/watch?v=4IAJOSCwWOo" rel="noopener noreferrer" target="_blank">“Machine Learning para developers con Amazon SageMaker”</a> es una charla del AWS User Group Peru. Úsala como material conceptual; la consola y los procedimientos pueden haber cambiado.</li>
  <li><strong>Para conectar dispositivos con AWS IoT:</strong> el AWS User Group Ecuador publicó en 2024 la charla <a href="https://www.youtube.com/watch?v=ilMHiOXCZns" rel="noopener noreferrer" target="_blank">“Introducción al IoT en AWS con IoT Core y el ESP8266”</a>. Trata la conexión de hardware a la nube; no es una guía para reactivar DeepLens.</li>
  <li><strong>Para ver un ejemplo de IoT más reciente:</strong> el artículo <a href="https://dev.to/alvarongg/como-arme-un-pit-wall-con-aws-iot-core-y-por-que-este-patron-sirve-para-cualquier-industria-4lo1" rel="noopener noreferrer" target="_blank">“Cómo armé un Pit Wall con AWS IoT Core”</a> explica una arquitectura de telemetría y enlaza su <a href="https://github.com/alvarongg/charlas-pub" rel="noopener noreferrer" target="_blank">código y materiales de la charla</a>. Es un complemento sobre datos de dispositivos, no sobre visión artificial.</li>
  <li><strong>Para conversar sobre ML en la región:</strong> consulta el <a href="https://www.meetup.com/aws-ug-machine-learning-latam/" rel="noopener noreferrer" target="_blank">AWS UG Machine Learning Latam</a>, un grupo de Meetup centrado en aprendizaje automático en Latinoamérica. Revisa su perfil para conocer sus próximas actividades.</li>
  <li><strong>Para encontrar grupos y eventos cerca de ti:</strong> el <a href="https://dondeaprendoaws.com/comunidades/" rel="noopener noreferrer" target="_blank">directorio de comunidades AWS</a> permite explorar grupos por país, tipo y tema. La <a href="https://dondeaprendoaws.com/eventos/" rel="noopener noreferrer" target="_blank">agenda de eventos AWS en Latinoamérica</a> muestra modalidad, fechas e inscripción; confirma los datos en la ficha del organizador.</li>
  <li><strong>Para una pregunta técnica de AWS:</strong> <a href="https://repost.aws/" rel="noopener noreferrer" target="_blank">AWS re:Post</a> reúne preguntas y respuestas de la comunidad sobre diseño, construcción y operación de servicios de AWS.</li>
</ul>

<h2>Preguntas frecuentes</h2>

<h3>¿Se puede registrar o configurar una cámara AWS DeepLens nueva?</h3>
<p>No. El servicio para registrar y administrar dispositivos y proyectos cerró el 31 de enero de 2024. Los pasos de consola que aparecen en tutoriales viejos ya no funcionan como un flujo actual.</p>

<h3>¿Cómo compruebo si quedaron recursos de mis proyectos DeepLens?</h3>
<p>Revisa los servicios y las regiones de las cuentas que utilizaste. No des por hecho que el cierre de DeepLens limpió esas cuentas: comprueba los buckets, funciones, objetos de IoT y roles relacionados, y sus dependencias. Antes de eliminar algo, confirma que no lo necesite otra aplicación.</p>

<h3>¿Qué necesito para hacer inferencia local ahora?</h3>
<p>Un dispositivo que cumpla los requisitos actuales de AWS IoT Greengrass y del runtime de tu modelo, además del código y los permisos para desplegar componentes. Comprueba esa compatibilidad antes de elegir hardware.</p>
