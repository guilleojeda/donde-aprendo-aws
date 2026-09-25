---
title: "Conectar dispositivos IoT a AWS usando el SDK de C++"
description: "Aprende a conectar dispositivos IoT a AWS con el SDK de C++ para un desarrollo eficiente. Incluye configuración, autenticación y manejo de sombras de cosas."
publishedAt: "2024-05-10"
publishedTimestamp: "2024-05-10T02:52:14.698Z"
cover: "/assets/blog/066ea33361c58e79e3d5a983.jpg"
coverAlt: "Thumbnail for: Conectar dispositivos IoT a AWS usando el SDK de C++"
ogImage: "/assets/blog/066ea33361c58e79e3d5a983.jpg"
related:
  - title: "9 Mejores Prácticas de Seguridad para IaC en AWS"
    url: "https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/"
    image: "/assets/blog/0b84e7609d9a01cdc2449b30.jpg"
    imageAlt: ""
  - title: "Servicios de AWS para Inteligencia Artificial"
    url: "https://dondeaprendoaws.com/blog/servicios-de-aws-para-inteligencia-artificial/"
    image: "/assets/blog/54201ee89ce3b648eb0ec011.jpg"
    imageAlt: ""
  - title: "Aprender AWS gratis: Recursos y Comunidad"
    url: "https://dondeaprendoaws.com/blog/aprender-aws-gratis-recursos-y-comunidad/"
    image: "/assets/blog/c7227ae982494a7ce1620070.jpg"
    imageAlt: ""
---

<p>Para conectar dispositivos IoT a <a href="https://aws.amazon.com/">AWS</a> utilizando el SDK de C++, sigue estos pasos:</p>
<ol><li><p><strong>Configura tu entorno de desarrollo C++</strong></p><ul><li>Instala un compilador de C++ compatible (<a href="https://gcc.gnu.org/">GCC</a>, <a href="https://clang.llvm.org/">Clang</a>, etc.)</li><li>Configura un IDE (<a href="https://visualstudio.microsoft.com/">Visual Studio</a>, <a href="https://www.eclipse.org/">Eclipse</a>, etc.)</li><li>Instala las bibliotecas y dependencias necesarias</li></ul></li><li><p><strong>Crea una cuenta de AWS y configura <a href="https://docs.aws.amazon.com/iot/latest/developerguide/what-is-aws-iot.html">AWS IoT Core</a></strong></p><ul><li>Crea una cuenta de AWS si aún no tienes una</li><li>Configura AWS IoT Core para permitir la conexión de dispositivos IoT</li></ul></li><li><p><strong>Descarga e instala el SDK de C++ de AWS IoT Device</strong></p><ul><li>Clona el repositorio de <a href="https://github.com/">GitHub</a> del SDK</li><li>Sigue las instrucciones de instalación y compilación</li></ul></li><li><p><strong>Configura el SDK con tus credenciales de AWS</strong></p><ul><li>Proporciona la información de tu cuenta de AWS (clave de acceso, clave secreta)</li><li>Configura la conexión <a href="https://en.wikipedia.org/wiki/MQTT">MQTT</a> (dirección del servidor, puerto)</li></ul></li><li><p><strong>Crea un cliente MQTT usando el SDK</strong></p><ul><li>Inicializa una instancia de la clase <code>MqttClient</code></li><li>Configura la conexión de red y la autenticación</li></ul></li><li><p><strong>Gestiona temas MQTT y publica/suscribe mensajes</strong></p><ul><li>Suscríbete a temas MQTT relevantes</li><li>Publica datos en AWS IoT utilizando el método <code>Publish</code></li></ul></li><li><p><strong>Utiliza sombras de cosas para administrar el estado del dispositivo</strong></p><ul><li>Recupera, actualiza y elimina sombras de cosas</li><li>Maneja eventos de sombra de cosa</li></ul></li><li><p><strong>Crea y monitorea trabajos de AWS IoT</strong></p><ul><li>Crea trabajos utilizando la API de AWS IoT Core</li><li>Responde a la ejecución de trabajos en el SDK</li></ul></li></ol>
<table><thead><tr><th>Característica Clave</th><th>Descripción</th></tr></thead><tbody><tr><td>Conexión segura</td><td>Autenticación, autorización y cifrado de datos</td></tr><tr><td>Sombras de cosas</td><td>Mantener y sincronizar el estado del dispositivo</td></tr><tr><td>Trabajos de AWS IoT</td><td>Realizar tareas como actualizaciones y acciones personalizadas</td></tr></tbody></table>
<p>Sigue explorando la documentación del SDK y los ejemplos de código para aprovechar al máximo sus características avanzadas.</p>
<h2 id="related-video-from-youtube">Related video from YouTube</h2>
<div><iframe allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" height="315" loading="lazy" src="https://www.youtube.com/embed/YcY68BJddmg" title="Video de YouTube" width="560"></iframe></div>
<h2 id="configuraci%C3%B3n-para-la-conexi%C3%B3n-del-dispositivo">Configuración para la conexión del dispositivo</h2>
<p>Para conectar dispositivos IoT a AWS utilizando el SDK de C++, es necesario realizar algunas preparaciones previas. A continuación, se presentan los pasos necesarios para establecer la conexión.</p>
<h3 id="crear-una-cuenta-de-aws">Crear una cuenta de <a href="https://aws.amazon.com/">AWS</a></h3>
<p><img alt="AWS" src="/assets/blog/2ebe3cf8e7ae57e98d3af846.jpg"/></p>
<p>Antes de empezar, debes crear una cuenta de AWS si no la tienes ya. Para hacerlo, sigue estos pasos:</p>
<p>1. <strong>Crear una cuenta de AWS</strong>:</p>
<ul><li>Ve a la página de inicio de AWS y haz clic en "Crear una cuenta de AWS".</li><li>Selecciona el tipo de cuenta que deseas crear (individual o empresarial).</li><li>Proporciona la información requerida, como tu nombre, dirección de correo electrónico y contraseña.</li><li>Verifica tu cuenta mediante el enlace de confirmación que se te envía por correo electrónico.</li></ul>
<h3 id="configurar-el-entorno-de-desarrollo-de-c%2B%2B">Configurar el entorno de desarrollo de C++</h3>
<p>Para desarrollar aplicaciones con el SDK de C++ de AWS IoT Device, debes tener un entorno de desarrollo de C++ configurado. Asegúrate de tener instaladas las herramientas y software necesarias, como:</p>
<ul><li>Un compilador de C++ compatible (como GCC o Clang).</li><li>Un entorno de desarrollo integrado (IDE) como Visual Studio o Eclipse.</li><li>Las bibliotecas y dependencias necesarias para el SDK de C++ de AWS IoT Device.</li></ul>
<h3 id="entender-mqtt-y-aws-iot-core">Entender <a href="https://en.wikipedia.org/wiki/MQTT">MQTT</a> y <a href="https://docs.aws.amazon.com/iot/latest/developerguide/what-is-aws-iot.html">AWS IoT Core</a></h3>
<p><img alt="MQTT" src="/assets/blog/f6c0ceacae77dcc2ccf9cb28.jpg"/></p>
<p>El protocolo MQTT (Message Queuing Telemetry Transport) es un protocolo de mensajería ligero que se utiliza para la comunicación entre dispositivos IoT y AWS IoT Core. AWS IoT Core es un servicio de AWS que permite a los dispositivos IoT conectarse y enviar datos a la nube.</p>
<p>Es importante entender cómo funciona MQTT y cómo se utiliza en AWS IoT Core para establecer la conexión entre tus dispositivos IoT y AWS.</p>
<table><thead><tr><th>Concepto</th><th>Descripción</th></tr></thead><tbody><tr><td>MQTT</td><td>Protocolo de mensajería ligero para la comunicación entre dispositivos IoT y AWS IoT Core.</td></tr><tr><td>AWS IoT Core</td><td>Servicio de AWS que permite a los dispositivos IoT conectarse y enviar datos a la nube.</td></tr></tbody></table>
<h2 id="instalaci%C3%B3n-y-configuraci%C3%B3n-del-sdk-de-c%2B%2B">Instalación y configuración del SDK de C++</h2>
<p>Para utilizar el SDK de C++ de AWS IoT Device, es necesario descargar e instalar el SDK y configurarlo para que se conecte con AWS IoT Core.</p>
<h3 id="descarga-e-instalaci%C3%B3n-del-sdk">Descarga e instalación del SDK</h3>
<p>Para descargar el SDK, clona el repositorio de GitHub de AWS IoT Device SDK para C++. Luego, crea una carpeta llamada <code>build</code> para contener los archivos de compilación y cambia a esa carpeta.</p>
<p>Ejecuta <code>cmake../.</code> para construir el SDK con la CLI. El comando descargará automáticamente las bibliotecas de terceros necesarias y generará un archivo Makefile. Luego, escribe <code>make &lt;nombre del objetivo&gt;</code> para construir el objetivo deseado.</p>
<h3 id="configuraci%C3%B3n-del-sdk">Configuración del SDK</h3>
<p>Una vez instalado el SDK, debes configurarlo para que se conecte con AWS IoT Core. Para hacerlo, debes proporcionar la información de la cuenta de AWS y la configuración de la conexión MQTT.</p>
<h4 id="informaci%C3%B3n-de-la-cuenta-de-aws">Información de la cuenta de AWS</h4>
<ul><li>Crea un archivo de configuración que contenga la información de la cuenta de AWS, como la clave de acceso y la clave secreta.</li></ul>
<h4 id="configuraci%C3%B3n-de-la-conexi%C3%B3n-mqtt">Configuración de la conexión MQTT</h4>
<ul><li>Proporciona la dirección del servidor MQTT y el puerto de conexión.</li></ul>
<p>Asegúrate de que el SDK esté configurado correctamente para que se conecte con AWS IoT Core. Puedes hacer esto verificando la documentación del SDK y los ejemplos de código proporcionados.</p>
<h2 id="conectar-a-aws-iot-con-el-sdk">Conectar a AWS IoT con el SDK</h2>
<p>Conectar a AWS IoT con el SDK de C++ implica varios pasos importantes para establecer una conexión segura y confiable. A continuación, se presentan los pasos para crear un cliente MQTT utilizando el SDK y conectarlo a AWS IoT Core.</p>
<h3 id="crear-un-cliente-mqtt">Crear un cliente MQTT</h3>
<p>Para crear un cliente MQTT, debes inicializar una instancia de la clase <code>MqttClient</code> del SDK de C++. Puedes hacer esto proporcionando una instancia de la clase <code>NetworkConnection</code> que configure la conexión de red y la autenticación con AWS IoT.</p>
<pre><code>std::shared_ptr&lt;NetworkConnection&gt; p_network_connection = &lt;Crear instancia&gt;;
std::shared_ptr&lt;MqttClient&gt; p_client = MqttClient::Create(p_network_connection, std::chrono::milliseconds(30000));
</code></pre>
<h3 id="gestionar-temas-mqtt-y-mensajes">Gestionar temas MQTT y mensajes</h3>
<p>Una vez creado el cliente MQTT, debes suscribirte a los temas MQTT relevantes para recibir mensajes de AWS IoT. Puedes hacer esto utilizando el método <code>Subscribe</code> del cliente MQTT.</p>
<table><thead><tr><th>Paso</th><th>Descripción</th></tr></thead><tbody><tr><td>1</td><td>Crear una instancia de la clase <code>Utf8String</code> con el nombre del tema MQTT.</td></tr><tr><td>2</td><td>Crear un objeto <code>Subscription</code> con el tema MQTT, la calidad de servicio (QoS) y un manejador de suscripciones.</td></tr><tr><td>3</td><td>Agregar el objeto <code>Subscription</code> a un vector de suscripciones.</td></tr><tr><td>4</td><td>Llamar al método <code>Subscribe</code> del cliente MQTT con el vector de suscripciones.</td></tr></tbody></table>
<h3 id="publicar-datos-en-aws-iot">Publicar datos en AWS IoT</h3>
<p>Para publicar datos en AWS IoT, debes utilizar el método <code>Publish</code> del cliente MQTT. Puedes proporcionar el tema MQTT, el mensaje y la calidad de servicio (QoS) deseada.</p>
<table><thead><tr><th>Paso</th><th>Descripción</th></tr></thead><tbody><tr><td>1</td><td>Crear una instancia de la clase <code>Utf8String</code> con el nombre del tema MQTT.</td></tr><tr><td>2</td><td>Llamar al método <code>Publish</code> del cliente MQTT con el tema MQTT, el mensaje y la calidad de servicio (QoS) deseada.</td></tr></tbody></table>
<p>Recuerda que debes configurar correctamente el SDK y proporcionar la información de la cuenta de AWS y la configuración de la conexión MQTT para establecer una conexión segura y confiable con AWS IoT Core.</p>
<h2 id="utilizar-sombras-de-cosas">Utilizar sombras de cosas</h2>
<p>Las sombras de cosas son una característica clave de AWS IoT que permite a los dispositivos IoT mantener un estado en la nube. Esto permite a los dispositivos IoT sincronizar su estado con la nube y recibir actualizaciones en tiempo real. En este artículo, exploraremos cómo utilizar las sombras de cosas con el SDK de C++ para administrar el estado de los dispositivos IoT.</p>
<h3 id="administrar-el-estado-de-la-sombra-de-cosa">Administrar el estado de la sombra de cosa</h3>
<p>Para administrar el estado de una sombra de cosa, debes utilizar la API de sombra de cosa proporcionada por el SDK de C++. Puedes recuperar el estado actual de una sombra de cosa utilizando el método <code>GetThingShadow</code> del cliente MQTT.</p>
<table><thead><tr><th>Método</th><th>Descripción</th></tr></thead><tbody><tr><td><code>GetThingShadow</code></td><td>Recupera el estado actual de una sombra de cosa.</td></tr><tr><td><code>UpdateThingShadow</code></td><td>Actualiza el estado de una sombra de cosa.</td></tr><tr><td><code>DeleteThingShadow</code></td><td>Elimina una sombra de cosa.</td></tr></tbody></table>
<h3 id="actualizar-el-estado-de-la-sombra-de-cosa">Actualizar el estado de la sombra de cosa</h3>
<p>Puedes actualizar el estado de una sombra de cosa utilizando el método <code>UpdateThingShadow</code> del cliente MQTT.</p>
<pre><code>std::string new_shadow_state = "{\"temperature\": 25.0}";
p_client-&gt;UpdateThingShadow(thing_name, new_shadow_state);
</code></pre>
<h3 id="eliminar-sombras-de-cosas">Eliminar sombras de cosas</h3>
<p>Para eliminar una sombra de cosa, debes utilizar el método <code>DeleteThingShadow</code> del cliente MQTT. Es importante tener en cuenta que eliminar una sombra de cosa también elimina todos los datos asociados con ella.</p>
<pre><code>p_client-&gt;DeleteThingShadow(thing_name);
</code></pre>
<h3 id="manejar-eventos-de-sombra-de-cosa">Manejar eventos de sombra de cosa</h3>
<p>Puedes establecer callbacks para manejar eventos de sombra de cosa, como cambios en el estado de la sombra de cosa. Para hacer esto, debes proporcionar un objeto <code>ThingShadowCallback</code> al método <code>SetThingShadowCallback</code> del cliente MQTT.</p>
<pre><code>class MyThingShadowCallback : public ThingShadowCallback {
public:
    void OnThingShadowUpdated(const std::string&amp; thing_name, const std::string&amp; shadow_state) override {
        // Manejar el evento de actualización de la sombra de cosa
    }
};

MyThingShadowCallback callback;
p_client-&gt;SetThingShadowCallback(&amp;callback);
</code></pre>
<p>Recuerda que debes configurar correctamente el SDK y proporcionar la información de la cuenta de AWS y la configuración de la conexión MQTT para utilizar las sombras de cosas de manera efectiva.</p>
<h2 id="trabajos-de-aws-iot">Trabajos de AWS IoT</h2>
<p>Los trabajos de AWS IoT permiten a los dispositivos IoT realizar tareas como actualizaciones y acciones personalizadas. En este artículo, exploraremos cómo utilizar el SDK de C++ para crear y administrar trabajos en AWS IoT.</p>
<h3 id="crear-y-monitorear-trabajos">Crear y monitorear trabajos</h3>
<p>Para crear un trabajo en AWS IoT, debes utilizar la API de AWS IoT Core. Primero, debes crear un documento de trabajo que contenga la información del trabajo, como el ID del trabajo y la URL del documento del trabajo. Luego, puedes utilizar el comando <code>aws iot create-job</code> para crear el trabajo.</p>
<table><thead><tr><th>Comando</th><th>Descripción</th></tr></thead><tbody><tr><td><code>aws iot create-job</code></td><td>Crea un trabajo en AWS IoT.</td></tr></tbody></table>
<p>Ejemplo de comando:</p>
<pre><code>aws iot create-job \
  --job-id hello-world-job-1 \
  --document-source "job_document_url" \
  --targets "thing_arn" \
  --target-selection SNAPSHOT
</code></pre>
<p>Si el comando es exitoso, devuelve un resultado como este:</p>
<p><code>{ "jobArn": "arn:aws:iot:us-west-2:57EXAMPLE833:job/hello-world-job-1", "jobId": "hello-world-job-1"}</code></p>
<p>Una vez creado el trabajo, puedes monitorear su estado utilizando la API de AWS IoT Core.</p>
<h3 id="responder-a-la-ejecuci%C3%B3n-de-un-trabajo">Responder a la ejecución de un trabajo</h3>
<p>Para responder a la ejecución de un trabajo, debes establecer un callback en el SDK de C++. Esto te permite recibir notificaciones cuando se ejecuta un trabajo y realizar acciones personalizadas en respuesta.</p>
<pre><code>class MyJobCallback : public JobCallback {
public:
    void OnJobExecution(const std::string&amp; jobId, const std::string&amp; jobStatus) override {
        // Manejar la ejecución del trabajo
    }
};

MyJobCallback callback;
p_client-&gt;SetJobCallback(&amp;callback);
</code></pre>
<p>Recuerda que debes configurar correctamente el SDK y proporcionar la información de la cuenta de AWS y la configuración de la conexión MQTT para utilizar los trabajos de AWS IoT de manera efectiva.</p>
<h2 id="uso-avanzado-del-sdk">Uso avanzado del SDK</h2>
<p>El SDK de C++ para AWS IoT Device ofrece varias características avanzadas que permiten a los desarrolladores crear soluciones IoT más complejas y escalables. En esta sección, exploraremos algunas de las formas en que puedes aprovechar al máximo el SDK para crear aplicaciones IoT más robustas y seguras.</p>
<h3 id="integraci%C3%B3n-con-otros-servicios-de-aws">Integración con otros servicios de AWS</h3>
<p>Puedes integrar el SDK de C++ para AWS IoT Device con otros servicios de AWS para crear soluciones IoT más completas. Por ejemplo, puedes utilizar <a href="https://en.wikipedia.org/wiki/AWS_Lambda">AWS Lambda</a> para procesar y analizar datos IoT en tiempo real, o <a href="https://en.wikipedia.org/wiki/Amazon_S3">AWS S3</a> para almacenar y procesar grandes cantidades de datos.</p>
<table><thead><tr><th>Servicio de AWS</th><th>Descripción</th></tr></thead><tbody><tr><td>AWS Lambda</td><td>Procesar y analizar datos IoT en tiempo real</td></tr><tr><td>AWS S3</td><td>Almacenar y procesar grandes cantidades de datos</td></tr></tbody></table>
<h3 id="seguridad-de-las-comunicaciones-de-dispositivos-iot">Seguridad de las comunicaciones de dispositivos IoT</h3>
<p>La seguridad es un aspecto crítico en cualquier aplicación IoT. El SDK de C++ para AWS IoT Device proporciona varias características de seguridad para proteger las comunicaciones entre los dispositivos IoT y AWS IoT Core.</p>
<table><thead><tr><th>Característica de seguridad</th><th>Descripción</th></tr></thead><tbody><tr><td>Autenticación y autorización basadas en certificados</td><td>Garantizar que solo los dispositivos autorizados puedan conectarse a AWS IoT Core</td></tr><tr><td>Cifrado de datos</td><td>Proteger los datos en tránsito</td></tr></tbody></table>
<h3 id="soluci%C3%B3n-de-problemas-y-manejo-de-errores">Solución de problemas y manejo de errores</h3>
<p>A pesar de que el SDK de C++ para AWS IoT Device es muy robusto, es posible que encuentres errores o problemas al utilizarlo. En este caso, es importante saber cómo diagnosticar y resolver problemas comunes.</p>
<table><thead><tr><th>Herramienta o técnica</th><th>Descripción</th></tr></thead><tbody><tr><td>Registros de depuración</td><td>Ayudar a diagnosticar problemas de conectividad y autenticación</td></tr><tr><td>Excepciones personalizadas</td><td>Proporcionar información detallada sobre los errores que ocurren</td></tr><tr><td>Herramientas de terceros</td><td>Ayudar a diagnosticar problemas de conectividad y autenticación</td></tr></tbody></table>
<h2 id="conclusi%C3%B3n-y-aprendizaje-adicional">Conclusión y aprendizaje adicional</h2>
<p>En este artículo, hemos explorado los pasos para conectar dispositivos IoT a AWS utilizando el SDK de C++. Desde la configuración del entorno de desarrollo hasta la publicación de datos en AWS IoT, hemos cubierto los conceptos clave y las características avanzadas del SDK.</p>
<h3 id="siguientes-pasos">Siguientes pasos</h3>
<p>Ahora que has completado esta guía, estás listo para empezar a construir tus propias aplicaciones IoT con AWS y el SDK de C++. Recuerda que la documentación del SDK es una excelente fuente de información para profundizar en los conceptos y características presentadas en este artículo.</p>
<h3 id="recursos-adicionales">Recursos adicionales</h3>
<p>Para seguir aprendiendo, te recomendamos explorar los siguientes recursos:</p>
<table><thead><tr><th>Recurso</th><th>Descripción</th></tr></thead><tbody><tr><td>Documentación del SDK de C++ para AWS IoT Device</td><td>Información detallada sobre el SDK y sus características</td></tr><tr><td>Sitio web de AWS IoT</td><td>Más información sobre los servicios y características de AWS IoT</td></tr><tr><td>Ejemplos de código y proyectos de muestra en GitHub</td><td>Inspiración y aprendizaje de otros desarrolladores</td></tr></tbody></table>
<p>Continúa explorando el mundo de IoT y AWS, y no dudes en compartir tus experiencias y conocimientos con la comunidad de desarrolladores. ¡Buena suerte en tus proyectos IoT!</p>
<h2 id="preguntas-frecuentes">Preguntas frecuentes</h2>
<h3 id="%C2%BFc%C3%B3mo-utilizar-el-sdk-de-dispositivo-iot-de-aws%3F">¿Cómo utilizar el SDK de dispositivo IoT de AWS?</h3>
<p>Para utilizar el <a href="https://dondeaprendoaws.com/blog/7-errores-comunes-con-aws-iot-device-sdk-para-javascript/">SDK de dispositivo IoT de AWS</a>, sigue estos pasos:</p>
<ol><li>Instala el SDK de dispositivo IoT de AWS para C++.</li><li>Configura la aplicación de ejemplo según el dispositivo y la plataforma que estés utilizando.</li><li>Compila y ejecuta la aplicación de ejemplo.</li></ol>
<h3 id="%C2%BFc%C3%B3mo-compilar-el-sdk-en-aws%3F">¿Cómo compilar el SDK en AWS?</h3>
<p>Para compilar el SDK en AWS, sigue estos pasos:</p>
<table><thead><tr><th>Paso</th><th>Descripción</th></tr></thead><tbody><tr><td>1</td><td>Instala CMake (versión mínima 3.13) y las herramientas de compilación relevantes para tu plataforma.</td></tr><tr><td>2</td><td>En una ventana de comandos, navega a una carpeta donde desees almacenar el SDK.</td></tr><tr><td>3</td><td>Genera los archivos de compilación ejecutando <code>cmake.</code>.</td></tr><tr><td>4</td><td>Compila el SDK utilizando los archivos de compilación generados.</td></tr></tbody></table>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/7-errores-comunes-con-aws-iot-device-sdk-para-javascript/">7 Errores Comunes con AWS IoT Device SDK para JavaScript</a></li><li><a href="https://dondeaprendoaws.com/blog/como-integrar-los-sdk-de-aws-en-7-pasos/">Cómo integrar los SDK de AWS en 7 pasos</a></li><li><a href="https://dondeaprendoaws.com/blog/microservicios-en-aws-utilizando-aws-lambda/">Microservicios en AWS Utilizando AWS Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-la-inteligencia-artificial-en-aws/">Introducción a la Inteligencia Artificial en AWS</a></li></ul>
