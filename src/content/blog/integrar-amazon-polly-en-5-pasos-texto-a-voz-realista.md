---
title: "Integrar Amazon Polly en 5 pasos: Texto a voz realista"
description: "Aprende a integrar Amazon Polly en tus aplicaciones en 5 pasos y aprovecha la síntesis de voz realista para mejorar la experiencia de usuario."
publishedAt: "2024-05-13"
publishedTimestamp: "2024-05-13T05:08:34.138Z"
cover: "/assets/blog/35cbdc26cad1c09b7dd2fc81.jpg"
coverAlt: "Thumbnail for: Integrar Amazon Polly en 5 pasos: Texto a voz realista"
ogImage: "/assets/blog/35cbdc26cad1c09b7dd2fc81.jpg"
related:
  - title: "Correlación de Eventos con Step Functions y CloudWatch"
    url: "https://dondeaprendoaws.com/blog/correlacion-de-eventos-con-step-functions-y-cloudwatch/"
    image: "/assets/blog/1ddc83af1d16737de7b3fdb8.jpg"
    imageAlt: ""
  - title: "9 Mejores Prácticas de Seguridad para IaC en AWS"
    url: "https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/"
    image: "/assets/blog/0b84e7609d9a01cdc2449b30.jpg"
    imageAlt: ""
  - title: "Clases de Almacenamiento de Amazon S3"
    url: "https://dondeaprendoaws.com/blog/clases-de-almacenamiento-de-amazon-s3/"
    image: "/assets/blog/783a6beb62602d5d128b9c75.jpg"
    imageAlt: ""
---

<p>Convierte fácilmente texto en voz realista con <a href="https://aws.amazon.com/polly/">Amazon Polly</a>, un servicio de síntesis de voz con tecnología de aprendizaje automático avanzada. Sigue estos 5 sencillos pasos:</p>
<ol><li><strong>Configura Amazon Polly</strong>: Crea una cuenta de <a href="https://aws.amazon.com/">AWS</a> y selecciona la voz y el idioma deseados.</li><li><strong>Prepara el texto</strong>: Formatea el texto de entrada utilizando etiquetas <a href="https://en.wikipedia.org/wiki/Speech_Synthesis_Markup_Language">SSML</a> para personalizar la pronunciación, el volumen, el tono y la velocidad del habla.</li><li><strong>Convierte texto a voz</strong>: Utiliza la API SynthesizeSpeech para convertir el texto en una secuencia de audio.</li><li><strong>Almacena y utiliza la salida de voz</strong>: Guarda el audio generado en formatos como MP3 o PCM, e intégralo en tus aplicaciones web, móviles o de otro tipo.</li><li><strong>Integra Amazon Polly</strong>: Aprovecha las capacidades de texto a voz de Amazon Polly utilizando los <a href="https://dondeaprendoaws.com/blog/como-integrar-los-sdk-de-aws-en-7-pasos/">SDKs de AWS</a> disponibles para varios lenguajes de programación.</li></ol>
<table><thead><tr><th>Ventajas</th><th>Casos de uso</th></tr></thead><tbody><tr><td>Voces realistas y naturales</td><td>Aplicaciones de aprendizaje electrónico</td></tr><tr><td>Amplia gama de idiomas</td><td>Asistentes virtuales y chatbots</td></tr><tr><td>Escalable y rentable</td><td>Aplicaciones de accesibilidad</td></tr><tr><td>Personalizable con etiquetas SSML</td><td>Sistemas de respuesta de voz interactiva (IVR)</td></tr><tr><td></td><td>Contenido multimedia</td></tr></tbody></table>
<p>Integra Amazon Polly en tus aplicaciones y aprovecha las voces realistas y naturales para mejorar la experiencia del usuario.</p>
<h2 id="related-video-from-youtube">Related video from YouTube</h2>
<div><iframe allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" height="315" loading="lazy" src="https://www.youtube.com/embed/XUd5M_mQaA0" title="Video de YouTube" width="560"></iframe></div>
<h2 id="paso-1%3A-configuraci%C3%B3n-de-amazon-polly">Paso 1: Configuración de <a href="https://aws.amazon.com/polly/">Amazon Polly</a></h2>
<p><img alt="Amazon Polly" src="/assets/blog/8ae6ca4b881d2aa981fb8a8e.jpg"/></p>
<p>Para empezar a utilizar Amazon Polly, debes configurar el servicio correctamente. En este paso, crearemos una cuenta de AWS y configuraremos Amazon Polly para que esté listo para su uso.</p>
<h3 id="crear-una-cuenta-de-aws">Crear una cuenta de <a href="https://aws.amazon.com/">AWS</a></h3>
<p><img alt="AWS" src="/assets/blog/2ebe3cf8e7ae57e98d3af846.jpg"/></p>
<p>Antes de utilizar Amazon Polly, debes tener una cuenta de AWS. Si ya tienes una cuenta de AWS, puedes saltar este paso. De lo contrario, sigue estos pasos:</p>
<p>1. <strong>Crear una cuenta de AWS</strong></p>
<ul><li>Visita la página de inicio de AWS y haz clic en "Crear una cuenta de AWS".</li><li>Ingresa tu información de contacto y crea una contraseña segura.</li><li>Verifica tu cuenta a través de un correo electrónico o una llamada telefónica.</li></ul>
<h3 id="seleccionar-voz-y-lenguaje">Seleccionar voz y lenguaje</h3>
<p>Amazon Polly ofrece una variedad de voces y lenguajes para que puedas personalizar la experiencia de voz de tus usuarios. Para seleccionar la voz y el lenguaje adecuados para tu proyecto, sigue estos pasos:</p>
<table><thead><tr><th>Paso</th><th>Acción</th></tr></thead><tbody><tr><td>1</td><td>Inicia sesión en la consola de AWS y navega hasta la página de Amazon Polly.</td></tr><tr><td>2</td><td>Haz clic en "Crear un proyecto de voz" y selecciona el lenguaje y la voz que deseas utilizar.</td></tr><tr><td>3</td><td>Selecciona la voz que mejor se adapte a tus necesidades.</td></tr></tbody></table>
<p>Una vez que hayas seleccionado la voz y el lenguaje, puedes empezar a utilizar Amazon Polly para convertir texto en voz. En el siguiente paso, exploraremos cómo preparar el texto para la conversión.</p>
<h2 id="paso-2%3A-preparar-el-texto-para-la-conversi%C3%B3n">Paso 2: Preparar el texto para la conversión</h2>
<p>Para convertir texto en voz con Amazon Polly, es importante preparar el texto de manera adecuada. En este paso, exploraremos las mejores prácticas para formatear el texto y utilizar las etiquetas de lenguaje de marcado de síntesis de voz (SSML) para personalizar la salida de voz.</p>
<h3 id="formato-de-entrada-de-texto">Formato de entrada de texto</h3>
<p>Antes de convertir el texto en voz, debes asegurarte de que el texto esté en un formato adecuado. Amazon Polly admite texto plano y texto con etiquetas SSML. El texto plano es el formato más común y se utiliza para la mayoría de las conversiones de texto a voz. Sin embargo, si deseas personalizar la salida de voz con pausas, énfasis o modulación del tono de voz, debes utilizar etiquetas SSML.</p>
<p>Asegúrate de que el texto esté bien formateado y no contenga caracteres especiales o símbolos que puedan afectar la conversión. También es importante asegurarte de que el texto no supere los límites de caracteres establecidos por Amazon Polly.</p>
<h3 id="uso-de-etiquetas-ssml">Uso de etiquetas <a href="https://en.wikipedia.org/wiki/Speech_Synthesis_Markup_Language">SSML</a></h3>
<p><img alt="SSML" src="/assets/blog/66b8bf147b69ff107e997ca6.jpg"/></p>
<p>Las etiquetas SSML te permiten personalizar la salida de voz con Amazon Polly. Puedes utilizar etiquetas SSML para agregar pausas, énfasis o modulación del tono de voz. A continuación, te mostramos algunos ejemplos de etiquetas SSML que puedes utilizar:</p>
<table><thead><tr><th>Etiqueta SSML</th><th>Descripción</th></tr></thead><tbody><tr><td><code>&lt;break time="1s"&gt;</code></td><td>Agrega una pausa de 1 segundo</td></tr><tr><td><code>&lt;emphasis level="strong"&gt;</code></td><td>Enfatiza una palabra o frase</td></tr><tr><td><code>&lt;prosody rate="slow"&gt;</code></td><td>Modula el tono de voz para que sea más lento</td></tr></tbody></table>
<p>Recuerda que las etiquetas SSML deben estar bien formateadas y deben seguir las reglas de sintaxis de SSML. Puedes encontrar más información sobre las etiquetas SSML admitidas por Amazon Polly en la documentación de Amazon Polly.</p>
<p>Una vez que hayas preparado el texto, puedes proceder a convertirlo en voz con Amazon Polly. En el próximo paso, exploraremos cómo utilizar la API de Amazon Polly para convertir texto en voz.</p>
<h2 id="paso-3%3A-convertir-texto-a-voz">Paso 3: Convertir texto a voz</h2>
<h3 id="utilizar-la-api-synthesizespeech">Utilizar la API SynthesizeSpeech</h3>
<p>Para convertir texto en voz con Amazon Polly, debes utilizar la API SynthesizeSpeech. A continuación, te mostramos un ejemplo de cómo utilizar esta API en Python utilizando el SDK de AWS (<a href="https://boto3.amazonaws.com/v1/documentation/api/latest/index.html">Boto3</a>):</p>
<pre><code>import boto3

# Crea un cliente de Polly
polly_client = boto3.client('polly')

response = polly_client.synthesize_speech(
    Text='Hola, este es un texto de muestra para ser sintetizado.',
    OutputFormat='mp3',
    VoiceId='Joanna'
)

# Guarda el audio en un archivo
with open('output.mp3', 'wb') as file:
    file.write(response['AudioStream'].read())
</code></pre>
<p>En este ejemplo, creamos un cliente de Polly utilizando Boto3. Luego, llamamos al método <code>synthesize_speech</code> y le pasamos los siguientes parámetros:</p>
<table><thead><tr><th>Parámetro</th><th>Descripción</th></tr></thead><tbody><tr><td><code>Text</code></td><td>El texto que queremos convertir en voz.</td></tr><tr><td><code>OutputFormat</code></td><td>El formato de audio deseado (en este caso, MP3).</td></tr><tr><td><code>VoiceId</code></td><td>El ID de la voz que queremos utilizar (en este caso, "Joanna").</td></tr></tbody></table>
<p>La respuesta de la API contiene una secuencia de audio que podemos guardar en un archivo utilizando la clave <code>AudioStream</code>.</p>
<h3 id="manejar-la-salida-de-audio">Manejar la salida de audio</h3>
<p>Después de llamar a la API SynthesizeSpeech, Amazon Polly devolverá una secuencia de audio en el formato especificado. Puedes manejar esta secuencia de audio de varias maneras:</p>
<ul><li><strong>Guardar en un archivo</strong>: Como se muestra en el ejemplo anterior, puedes guardar la secuencia de audio en un archivo utilizando un manejador de archivos. Esto te permite reproducir el audio más tarde o integrarlo en otras aplicaciones.</li><li><strong>Reproducir en tiempo real</strong>: En lugar de guardar el audio en un archivo, puedes reproducirlo en tiempo real. Por ejemplo, en una aplicación web, puedes utilizar la API de Web Audio para reproducir el audio directamente en el navegador.</li><li><strong>Transmitir a un servicio de terceros</strong>: Puedes transmitir la secuencia de audio a un servicio de terceros, como un servicio de transcripción de voz a texto o un servicio de análisis de audio.</li><li><strong>Integrar con otros servicios de AWS</strong>: Amazon Polly se puede integrar con otros servicios de AWS, como <a href="https://aws.amazon.com/s3/">Amazon S3</a> o <a href="https://aws.amazon.com/transcribe/">Amazon Transcribe</a>. Por ejemplo, puedes guardar el audio en un bucket de S3 o utilizar <a href="https://aws.amazon.com/transcribe/">Amazon Transcribe</a> para transcribir el audio a texto.</li></ul>
<p>Recuerda que Amazon Polly te cobrará por el texto que sintetices. Por lo tanto, es recomendable optimizar el uso del servicio y cachear el audio cuando sea posible para evitar costos innecesarios.</p>
<h2 id="paso-4%3A-almacenar-y-utilizar-la-salida-de-voz">Paso 4: Almacenar y utilizar la salida de voz</h2>
<p>Después de crear voz realista con Amazon Polly, es importante saber cómo guardarla para uso futuro o incrustarla en aplicaciones utilizando servicios de AWS como Amazon S3.</p>
<h3 id="guardar-la-salida-de-audio">Guardar la salida de audio</h3>
<p>Para guardar el audio generado por Amazon Polly, debes elegir el formato de archivo adecuado. Amazon Polly admite varios formatos de archivo, como MP3, Ogg Vorbis y PCM. Puedes seleccionar el formato que mejor se adapte a tus necesidades.</p>
<table><thead><tr><th>Formato de archivo</th><th>Descripción</th></tr></thead><tbody><tr><td>MP3</td><td>Ideal para aplicaciones web y móviles</td></tr><tr><td>Ogg Vorbis</td><td>Ideal para aplicaciones que requieren una alta calidad de audio</td></tr><tr><td>PCM</td><td>Ideal para dispositivos IoT y soluciones de telefonía</td></tr></tbody></table>
<p>Una vez que hayas seleccionado el formato de archivo, puedes guardar el audio en un bucket de Amazon S3 o en un archivo local. A continuación, te mostramos un ejemplo de cómo guardar el audio en un archivo MP3 utilizando Python y Boto3:</p>
<pre><code>import boto3

polly_client = boto3.client('polly')

response = polly_client.synthesize_speech(
    Text='Hola, este es un texto de muestra para ser sintetizado.',
    OutputFormat='mp3',
    VoiceId='Joanna'
)

with open('output.mp3', 'wb') as file:
    file.write(response['AudioStream'].read())
</code></pre>
<h3 id="incrustar-la-reproducci%C3%B3n-de-audio">Incrustar la reproducción de audio</h3>
<p>Una vez que hayas guardado el audio, puedes incrustarlo en una aplicación web o móvil utilizando un reproductor de audio compatible. Por ejemplo, puedes utilizar la etiqueta <code>&lt;audio&gt;</code> de HTML5 para reproducir el audio en una aplicación web. A continuación, te mostramos un ejemplo de cómo incrustar el audio en una aplicación web utilizando la etiqueta <code>&lt;audio&gt;</code>:</p>
<pre><code>&lt;audio controls&gt;
  &lt;source src="output.mp3" type="audio/mp3"&gt;
  Tu navegador no admite la etiqueta de audio.
&lt;/audio&gt;
</code></pre>
<p>Recuerda que debes asegurarte de que el reproductor de audio sea compatible con el formato de archivo que hayas seleccionado.</p>
<h2 id="paso-5%3A-integrar-amazon-polly">Paso 5: Integrar Amazon Polly</h2>
<h3 id="utilizar-sdks-de-aws">Utilizar SDKs de AWS</h3>
<p>Puedes integrar fácilmente Amazon Polly en tus aplicaciones utilizando los SDKs de AWS. Estos SDKs están disponibles para una variedad de lenguajes de programación, como Java, Python, Node.js,.NET, Ruby, Go, PHP y C++. Esto te permite aprovechar las capacidades de Amazon Polly directamente desde tu código.</p>
<p>Por ejemplo, con el SDK de Python para Boto3, puedes utilizar la función <code>synthesize_speech</code> para convertir texto en voz:</p>
<pre><code>import boto3

polly = boto3.client('polly')

response = polly.synthesize_speech(
    Text='Hola, este es un texto de muestra para ser sintetizado.',
    OutputFormat='mp3',
    VoiceId='Joanna'
)

with open('output.mp3', 'wb') as file:
    file.write(response['AudioStream'].read())
</code></pre>
<p>Los SDKs de AWS simplifican la integración de Amazon Polly en tus aplicaciones, ya que manejan detalles como la autenticación, el envío de solicitudes y el manejo de respuestas.</p>
<h3 id="ejemplos-de-casos-de-uso">Ejemplos de casos de uso</h3>
<p>Amazon Polly se puede integrar en una variedad de aplicaciones y casos de uso, como:</p>
<table><thead><tr><th>Caso de uso</th><th>Descripción</th></tr></thead><tbody><tr><td><strong>Aplicaciones de aprendizaje electrónico</strong></td><td>Convierte contenido de texto en audio realista para mejorar la experiencia de aprendizaje.</td></tr><tr><td><strong>Asistentes virtuales y chatbots</strong></td><td>Utiliza las voces naturales de Amazon Polly para proporcionar respuestas de voz en tus asistentes virtuales o chatbots.</td></tr><tr><td><strong>Aplicaciones de accesibilidad</strong></td><td>Facilita el acceso a contenido digital para personas con discapacidades visuales o dificultades de lectura al convertir el texto en audio.</td></tr><tr><td><strong>Sistemas de respuesta de voz interactiva (IVR)</strong></td><td>Mejora la experiencia de los clientes en tus sistemas de IVR al utilizar voces realistas y naturales para los mensajes y menús de voz.</td></tr><tr><td><strong>Contenido multimedia</strong></td><td>Agrega narración de voz a tus videos, podcasts, presentaciones o cualquier otro contenido multimedia para mejorar la experiencia del usuario.</td></tr></tbody></table>
<p>Al integrar Amazon Polly en tus aplicaciones, puedes aprovechar las voces realistas y naturales para mejorar la interacción con los usuarios, facilitar el acceso al contenido y crear experiencias más atractivas y envolventes.</p>
<h2 id="conclusi%C3%B3n%3A-puntos-clave-y-mejores-pr%C3%A1cticas">Conclusión: Puntos clave y mejores prácticas</h2>
<h3 id="resumen-de-los-pasos">Resumen de los pasos</h3>
<p>1. <strong>Configurar Amazon Polly</strong></p>
<p>Crea una cuenta de AWS y selecciona la voz y el idioma adecuados para tu aplicación. Amazon Polly ofrece una variedad de voces realistas en múltiples idiomas.</p>
<p>2. <strong>Preparar el texto</strong></p>
<p>Prepara el texto que deseas convertir a voz. Puedes formatear la entrada de texto utilizando etiquetas SSML para personalizar la pronunciación, el volumen, el tono y la velocidad del habla.</p>
<p>3. <strong>Convertir texto a voz</strong></p>
<p>Utiliza la API SynthesizeSpeech de Amazon Polly para convertir el texto en una secuencia de audio. Puedes manejar la salida de audio según tus necesidades, como guardarla en un archivo o transmitirla en tiempo real.</p>
<p>4. <strong>Almacenar y utilizar la salida de voz</strong></p>
<p>Guarda la salida de audio generada por Amazon Polly en un formato adecuado, como MP3 o PCM. Luego, puedes reproducir el audio o integrarlo en tus aplicaciones web, móviles o de otro tipo.</p>
<p>5. <strong>Integrar Amazon Polly</strong></p>
<p>Integra Amazon Polly en tus aplicaciones utilizando los SDKs de AWS disponibles para varios lenguajes de programación. Esto te permitirá aprovechar las capacidades de texto a voz de Amazon Polly de manera sencilla y eficiente.</p>
<h3 id="consejos-y-consideraciones">Consejos y consideraciones</h3>
<table><thead><tr><th>Aspecto</th><th>Recomendaciones</th></tr></thead><tbody><tr><td><strong>Calidad de voz</strong></td><td>Prueba diferentes voces y estilos de habla para encontrar el más adecuado para tu caso de uso.</td></tr><tr><td><strong>Personalización</strong></td><td>Utiliza etiquetas SSML para personalizar la pronunciación, el volumen, el tono y la velocidad del habla según tus necesidades.</td></tr><tr><td><strong>Rendimiento y escalabilidad</strong></td><td>Amazon Polly es un servicio escalable que puede manejar grandes volúmenes de solicitudes de conversión de texto a voz. Prueba y optimiza tu aplicación para garantizar un buen rendimiento.</td></tr><tr><td><strong>Costos</strong></td><td>Amazon Polly utiliza un modelo de precios de pago por uso. Monitorea y optimiza el uso del servicio para controlar los costos.</td></tr><tr><td><strong>Cumplimiento y privacidad</strong></td><td>Asegúrate de cumplir con las regulaciones y políticas de privacidad aplicables al procesar y almacenar datos de texto y audio.</td></tr></tbody></table>
<p>Al seguir estos pasos y recomendaciones, podrás integrar Amazon Polly de manera efectiva en tus aplicaciones y aprovechar las voces realistas y naturales para mejorar la experiencia del usuario.</p>
<h2 id="preguntas-frecuentes">Preguntas frecuentes</h2>
<h3 id="%C2%BFamazon-polly-tiene-una-api%3F">¿Amazon Polly tiene una API?</h3>
<p>Sí, Amazon Polly ofrece varias operaciones de API que puedes integrar fácilmente en tus aplicaciones existentes. Para obtener una lista de las operaciones admitidas, consulta <a href="https://docs.aws.amazon.com/polly/latest/dg/API_Operations.html">Acciones</a>.</p>
<h3 id="%C2%BFqu%C3%A9-es-una-voz-de-formato-largo-en-amazon-polly%3F">¿Qué es una voz de formato largo en Amazon Polly?</h3>
<p>Las voces de formato largo de Amazon Polly se desarrollan con una tecnología de síntesis de voz avanzada. Estas voces están diseñadas para ser utilizadas en contenidos más largos, como artículos de noticias, materiales de capacitación o videos de marketing. Ofrecen una calidad de voz mejorada con una entonación y expresión más naturales.</p>
<table><thead><tr><th>Característica</th><th>Descripción</th></tr></thead><tbody><tr><td><strong>Calidad de voz</strong></td><td>Las voces de formato largo ofrecen una calidad de voz mejorada con una entonación y expresión más naturales.</td></tr><tr><td><strong>Uso</strong></td><td>Estas voces están diseñadas para ser utilizadas en contenidos más largos, como artículos de noticias, materiales de capacitación o videos de marketing.</td></tr></tbody></table>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/como-desarrollar-aplicaciones-de-inteligencia-artificial-en-aws/">Cómo Desarrollar Aplicaciones de Inteligencia Artificial en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/personalizacion-en-tiempo-real-con-aws-casos-de-uso/">Personalización en tiempo real con AWS: Casos de uso</a></li><li><a href="https://dondeaprendoaws.com/blog/servicios-de-aws-para-inteligencia-artificial/">Servicios de AWS para Inteligencia Artificial</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-la-inteligencia-artificial-en-aws/">Introducción a la Inteligencia Artificial en AWS</a></li></ul>
