---
title: "Microservicios en AWS Utilizando AWS Lambda"
description: "Descubre cómo utilizar AWS Lambda para desarrollar eficientes microservicios en AWS, desde la configuración y el código hasta la integración, despliegue y monitoreo. Explora las ventajas y conceptos básicos de los microservicios y AWS Lambda."
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T00:50:24.052Z"
cover: "/assets/blog/7db368f44486be089c66ca22.jpg"
coverAlt: "Thumbnail for: Microservicios en AWS Utilizando AWS Lambda"
ogImage: "/assets/blog/7db368f44486be089c66ca22.jpg"
related:
  - title: "Estructuras multi-cuenta AWS para escalar"
    url: "https://dondeaprendoaws.com/blog/estructuras-multi-cuenta-aws-para-escalar/"
    image: "/assets/blog/0e9e4bdd57782b78da6d878e.jpg"
    imageAlt: ""
  - title: "CloudWatch y EventBridge: Integración"
    url: "https://dondeaprendoaws.com/blog/cloudwatch-y-eventbridge-integracion/"
    image: "/assets/blog/382dfac33d6132edaa6b8e63.jpg"
    imageAlt: ""
  - title: "Integrar Amazon Polly en 5 pasos: Texto a voz realista"
    url: "https://dondeaprendoaws.com/blog/integrar-amazon-polly-en-5-pasos-texto-a-voz-realista/"
    image: "/assets/blog/35cbdc26cad1c09b7dd2fc81.jpg"
    imageAlt: ""
---

<p>AWS Lambda es una poderosa herramienta que te permite ejecutar código sin preocuparte por los servidores, pagando solo por el tiempo de ejecución. Ideal para microservicios, ofrece escalabilidad, alta disponibilidad y un enfoque en la lógica de negocio. Este artículo explora cómo usar AWS Lambda para desarrollar microservicios eficientes, desde la configuración y el código hasta la integración, el despliegue y el monitoreo. Descubre cómo puedes beneficiarte de AWS Lambda en diferentes casos de uso, desde el procesamiento de datos hasta el backend de aplicaciones móviles.</p>


<ul>
<li><a href="https://aws.amazon.com/lambda/" rel="noopener noreferrer" target="_blank"><strong>AWS Lambda</strong></a>: Ejecuta código sin servidores, pagando solo por el tiempo activo.</li>
<li><strong>Microservicios</strong>: Aplicaciones pequeñas e independientes, fáciles de escalar.</li>
<li><strong>Ventajas</strong>: Escalabilidad automática, alta disponibilidad y pagos por uso.</li>
<li><strong>Desarrollo</strong>: Configuración sencilla, múltiples lenguajes de programación soportados.</li>
<li><strong>Integración y despliegue</strong>: Facilitado por herramientas como API Gateway y AWS CLI.</li>
<li><strong>Monitoreo</strong>: Utiliza CloudWatch para métricas y optimización.</li>
</ul>


<h3 id="definiciones" tabindex="-1">Definiciones</h3>


<ul>
<li><strong>Microservicio AWS</strong>: Partes de programas que funcionan de manera autónoma.</li>
<li><strong>Función Lambda en AWS</strong>: Código ejecutado en la nube sin servidor propio.</li>
<li><strong>Comunicación entre microservicios</strong>: Usualmente a través de API Gateway, SNS y SQS.</li>
<li><strong>Tipos de microservicios</strong>: Varían desde procesamiento de datos hasta seguridad de APIs.</li>
</ul>


<h3 id="ventajas-de-los-microservicios" tabindex="-1">Ventajas de los microservicios</h3>


<p>Los microservicios son como aplicaciones mini, independientes y que se pueden escalar fácilmente. Usando Lambda para tus microservicios trae varios beneficios:</p>


<ul>
<li><strong>Escalabilidad automática</strong>: Lambda ajusta automáticamente cuántas funciones necesitas según la demanda. No tienes que configurar nada.</li>
<li><strong>Alta disponibilidad</strong>: Lambda asegura que tus funciones estén disponibles en diferentes zonas para que siempre estén accesibles.</li>
<li><strong>Pagos por uso</strong>: Solo pagas por el tiempo que tus funciones están corriendo. Si no se usan, no pagas nada.</li>
<li><strong>Agilidad</strong>: Es fácil hacer cambios en tus servicios de manera independiente, lo que hace que el desarrollo sea más rápido.</li>
<li><strong>Enfoque en la lógica</strong>: Con Lambda y microservicios, puedes concentrarte en la lógica de tu negocio sin distraerte con la infraestructura.</li>
</ul>


<h2 id="conceptos-b%C3%A1sicos" tabindex="-1">Conceptos básicos</h2>


<p>Se explican de manera sencilla algunos términos importantes sobre microservicios y AWS Lambda.</p>


<h3 id="%C2%BFqu%C3%A9-son-los-microservicios%3F" tabindex="-1">¿Qué son los microservicios?</h3>


<p>Los microservicios son como piezas pequeñas y autónomas de un rompecabezas que trabajan juntas para hacer funcionar una aplicación. Cada pieza:</p>


<ul>
<li>Se encarga de una tarea específica.</li>
<li>Funciona de manera independiente, lo que significa que si una pieza falla, las demás pueden seguir trabajando.</li>
<li>Puede crecer o reducirse según lo necesite la aplicación, sin afectar a las demás.</li>
<li>Se comunica con las otras piezas a través de líneas claras y directas, conocidas como APIs.</li>
</ul>


<p>Esta manera de organizar las cosas hace que sea más fácil gestionar y actualizar las aplicaciones.</p>


<h3 id="caracter%C3%ADsticas-de-aws-lambda" tabindex="-1">Características de <a href="https://aws.amazon.com/lambda/" rel="noopener noreferrer" target="_blank">AWS Lambda</a></h3>


<p><figure><img alt="AWS Lambda" src="/assets/blog/c0eb5d69184d1120b29c2a25.jpg"/></figure></p>


<p>AWS Lambda es una herramienta que te permite correr código sin preocuparte por los servidores. Es como tener un equipo de robots que se encargan de todo el trabajo pesado, permitiéndote enfocarte solo en lo que quieres que haga tu código. Lo mejor de todo es que solo pagas por el tiempo que estos robots están trabajando para ti. Aquí algunas de sus características:</p>


<ul>
<li><strong>Sin servidores</strong>: Olvídate de tener que lidiar con computadoras y cables. AWS Lambda se encarga de todo eso.</li>
<li><strong>Se adapta solo</strong>: Si de repente mucha gente usa tu aplicación, AWS Lambda automáticamente usa más 'robots' para que todo siga funcionando bien.</li>
<li><strong>Siempre disponible</strong>: Funciona en diferentes lugares al mismo tiempo, así que siempre está listo cuando lo necesitas.</li>
<li><strong>Se recupera de errores</strong>: Si algo sale mal, automáticamente lo intenta de nuevo.</li>
<li><strong>Pagas por uso</strong>: Si tus 'robots' no están trabajando, no pagas por ellos.</li>
<li><strong>Trabaja bien con otros</strong>: Puedes hacer que AWS Lambda reaccione a eventos de otros servicios de AWS.</li>
</ul>


<p>Estas características hacen que AWS Lambda sea una opción genial para crear microservicios que son fáciles de manejar y no requieren que te preocupes por la infraestructura.</p>


<h2 id="dise%C3%B1o-de-la-arquitectura" tabindex="-1">Diseño de la arquitectura</h2>


<h3 id="definici%C3%B3n-de-servicios" tabindex="-1">Definición de servicios</h3>


<p>Para crear microservicios usando AWS Lambda, es clave separar bien las tareas y cómo se comunican los servicios entre sí. Aquí van algunos consejos:</p>


<ul>
<li>Cada microservicio debe enfocarse en hacer una cosa específica. Por ejemplo, uno que maneje las contraseñas, otro que procese pagos, otro que envíe correos, etc.</li>
<li>Intenta que los servicios funcionen por su cuenta lo más posible. Cuando necesiten comunicarse, que sea a través de reglas claras.</li>
<li>Usa un sistema basado en eventos. Por ejemplo, si se realiza un pago, que esto active automáticamente un aviso para que el servicio de envíos prepare el paquete.</li>
<li>Cada servicio debe manejar sus propios datos y no depender de los datos de otros servicios.</li>
<li>Es fundamental poner límites claros entre servicios para que cada uno pueda crecer y cambiar sin problemas.</li>
</ul>


<h3 id="uso-de-api-gateway" tabindex="-1">Uso de API Gateway</h3>


<p>API Gateway es una herramienta de AWS que te ayuda a mostrar tus microservicios al mundo de manera segura y con control.</p>


<ul>
<li>Te permite crear una conexión entre solicitudes HTTP y tus funciones Lambda.</li>
<li>Ofrece opciones de seguridad como verificar quién está accediendo a tu servicio.</li>
<li>Te ayuda a ver cómo están funcionando tus servicios y a manejarlos mejor.</li>
<li>Hace más fácil publicar tus servicios en diferentes ambientes.</li>
<li>Puedes ajustar fácilmente cuánto tráfico manejar sin problemas.</li>
</ul>


<p>En pocas palabras, API Gateway es esencial para que tus microservicios hechos con Lambda sean accesibles de forma segura y puedan manejar muchos usuarios a la vez.</p>


<h2 id="desarrollo-de-funciones-lambda" tabindex="-1">Desarrollo de funciones Lambda</h2>


<h3 id="configuraci%C3%B3n-y-opciones" tabindex="-1">Configuración y opciones</h3>


<p>Para empezar a usar una función Lambda, primero tienes que elegir con qué lenguaje de programación te sientes más cómodo, como Node.js, Python, Java o C#.</p>


<p>Luego, necesitas ajustar algunos detalles importantes:</p>


<ul>
<li><strong>Tiempo de ejecución</strong>: es el máximo de tiempo que tu función puede estar activa antes de que Lambda la pare.</li>
<li><strong>Memoria</strong>: es cuánta memoria le das a tu función. A más memoria, puede que tu código corra más rápido.</li>
<li><strong>Permisos</strong>: esto define a qué otros servicios de AWS puede acceder tu función. Es clave para mantener todo seguro.</li>
<li><strong>Gestión de eventos</strong>: aquí decides qué eventos harán que tu función se active, como clics, cambios en bases de datos como Amazon DynamoDB, o cualquier otra cosa.</li>
</ul>


<p>Es mejor comenzar con lo mínimo necesario en estos ajustes y luego cambiarlos según lo que necesites. Así, puedes controlar mejor cuánto gastas en AWS Lambda.</p>


<h3 id="c%C3%B3digo-y-pruebas" tabindex="-1">Código y pruebas</h3>


<p>Ahora que tienes todo listo, es momento de escribir el código. Aquí van algunos consejos:</p>


<ul>
<li>Idempotencia: asegúrate de que, al correr tu función varias veces con la misma entrada, el resultado sea siempre el mismo.</li>
<li>Sin estado: evita usar variables que afecten otras ejecuciones de tu función.</li>
<li>Atomicidad: cada vez que tu función se ejecute, debe completar una tarea específica.</li>
<li>Control de errores: ten planes para cuando las cosas no salgan como esperas.</li>
</ul>


<p>Después de escribir tu código, tienes que probarlo:</p>


<ul>
<li>Pruebas unitarias: estas pruebas ayudan a verificar que cada parte de tu código funciona correctamente.</li>
<li>Pruebas de integración: con estas pruebas, ves cómo tu función trabaja junto con otros servicios.</li>
<li>Observabilidad: mantén un ojo en las métricas y registros para entender cómo está funcionando tu función.</li>
</ul>


<p>Hacer pruebas te ayuda a asegurarte de que tu función hace lo que debe antes de lanzarla al mundo.</p>


<h2 id="integraci%C3%B3n-y-despliegue" tabindex="-1">Integración y despliegue</h2>


<h3 id="integraci%C3%B3n-con-otros-servicios" tabindex="-1">Integración con otros servicios</h3>


<p>Las funciones Lambda se llevan bien con otros servicios de AWS, como bases de datos, almacenamiento y colas de mensajes. Esto te permite armar aplicaciones completas sin servidores.</p>


<p>Aquí tienes algunos ejemplos de cómo puedes hacer estas combinaciones:</p>


<ul>
<li><strong>Bases de datos</strong> como Amazon DynamoDB o <a href="https://aws.amazon.com/rds/aurora/serverless/" rel="noopener noreferrer" target="_blank">Amazon Aurora Serverless</a>. Puedes hacer que tus funciones Lambda lean o escriban datos aquí cuando algo suceda.</li>
<li><strong>Almacenamiento</strong> en Amazon S3. Una función Lambda puede empezar a trabajar cuando subes un archivo a S3.</li>
<li><strong>Colas de mensajes</strong> como Amazon SQS o Amazon SNS. Estas pueden mandar mensajes a tus funciones Lambda para que los procesen.</li>
<li><strong>Amazon API Gateway</strong> te ayuda a crear APIs usando funciones Lambda para el trabajo pesado por detrás.</li>
<li><strong>Amazon Cognito</strong> te permite añadir inicio de sesión a tus aplicaciones sin servidores.</li>
</ul>


<p>Conectar estos servicios con Lambda es sencillo desde la consola de AWS, solo tienes que configurarlos para que envíen eventos que activen tus funciones.</p>


<h3 id="despliegue-continuo" tabindex="-1">Despliegue continuo</h3>


<p>Para no complicarte, lo mejor es hacer que el despliegue de tus funciones Lambda sea automático. Esto te ayuda a evitar errores y a ahorrar tiempo. Aquí van algunas herramientas que puedes usar:</p>


<ul>
<li><strong>AWS CLI</strong>: es una herramienta de línea de comandos para subir tus funciones nuevas o actualizaciones.</li>
<li><strong>Modelo de aplicaciones sin servidor (SAM)</strong>: te permite subir toda tu aplicación sin servidores con un solo comando.</li>
<li><strong>CodePipeline</strong>: esta herramienta sigue los cambios en tu código, corre pruebas y luego sube tu aplicación a Lambda.</li>
<li><strong>CodeDeploy</strong>: ayuda a actualizar tus funciones Lambda ya existentes. Puedes elegir cómo y cuándo hacer los cambios, como poco a poco o todo de una vez.</li>
</ul>


<p>Una manera común de hacer esto es con CodePipeline, que revisa tu código, hace pruebas y luego usa CodeDeploy para actualizar tus funciones en Lambda. Esto hace que subir cambios sea rápido y seguro, y si algo sale mal, puedes volver atrás fácilmente.</p>




<h2 id="monitoreo-y-optimizaci%C3%B3n" tabindex="-1">Monitoreo y optimización</h2>


<p>Cómo mantener un ojo en tus microservicios y hacer que funcionen mejor.</p>


<h3 id="m%C3%A9tricas-con-cloudwatch" tabindex="-1">Métricas con CloudWatch</h3>


<p>CloudWatch es una herramienta de AWS que te ayuda a ver cómo están funcionando tus funciones Lambda. Aquí algunas cosas importantes que puedes revisar:</p>


<ul>
<li><strong>Invocaciones</strong>: cuántas veces se usa tu función. Esto te dice cuánto se está utilizando.</li>
<li><strong>Tiempos de ejecución</strong>: cuánto tarda tu función en hacer su trabajo. Esto te ayuda a ver si hay algo que está demorando mucho.</li>
<li><strong>Errores</strong>: cuántos errores están ocurriendo. Esto te permite saber si hay problemas que arreglar.</li>
<li><strong>Consumo de memoria</strong>: cuánta memoria está usando tu función. Si está usando mucha, quizás necesitas darle más.</li>
</ul>


<p>Puedes armar un panel en CloudWatch para tener toda esta información junta y poner alertas si algo no va como debería.</p>


<h3 id="escalabilidad-autom%C3%A1tica" tabindex="-1">Escalabilidad automática</h3>


<p>Una cosa buena de AWS Lambda es que puede aumentar sus recursos automáticamente cuando hay más trabajo. Hay dos maneras de hacer esto:</p>


<ul>
<li><strong>Escalado basado en métricas</strong>: Esto ajusta tus funciones según cosas como cuántas veces se usan por segundo. Es bueno cuando sabes que va a haber más trabajo en ciertos momentos.</li>
<li><strong>Escalado basado en eventos</strong>: Esto aumenta los recursos cuando pasan cosas específicas, como cuando se sube un archivo nuevo a Amazon S3. Es útil para situaciones que no puedes prever.</li>
</ul>


<p>Esto te ahorra tener que ajustar cosas manualmente y solo pagas por lo extra que uses cuando lo necesites.</p>


<p>También puedes hacer que tus funciones funcionen mejor ajustando cosas como cuánta memoria usan, cuánto tiempo pueden correr, cómo manejan los errores y usando versiones diferentes de tus funciones. Esto hace que tus funciones sean más rápidas y fiables.</p>


<h2 id="manejo-de-errores" tabindex="-1">Manejo de errores</h2>


<h3 id="registro-y-seguimiento" tabindex="-1">Registro y seguimiento</h3>


<p>Es clave que hagas que AWS Lambda mande información detallada de cada vez que se usa una función a CloudWatch Logs. Esto te permite:</p>


<ul>
<li>Ver todos los detalles cuando algo sale mal, para entender mejor por qué pasó.</li>
<li>Buscar en la información guardada para ver si hay patrones. Por ejemplo, si los errores pasan más en ciertos momentos o con ciertas entradas.</li>
<li>Poner alarmas en CloudWatch para que te avisen si hay errores o si algo pasa de ciertos límites.</li>
</ul>


<p>Algunos consejos útiles son:</p>


<ul>
<li>Usar diferentes lugares en CloudWatch Logs para diferentes tipos de eventos. Por ejemplo, uno para cuando todo va bien y otro para cuando hay errores.</li>
<li>Asegurarte de incluir en la información guardada detalles importantes como el evento que inició todo, parámetros, etc. Esto ayuda si necesitas volver a ver qué pasó.</li>
<li>Siempre anotar eventos importantes como cuando empieza y termina la función.</li>
</ul>


<h3 id="reintentos-y-colas" tabindex="-1">Reintentos y colas</h3>


<p>Hay dos formas principales para lidiar con errores que no duran mucho:</p>


<p><strong>1. Reintentos automáticos</strong></p>


<p>Puedes hacer que Lambda intente de nuevo automáticamente si hay errores como que se tardó mucho, hubo un problema de red, etc. Esto es bueno para cuando el problema es temporal.</p>


<p>Algunos consejos son:</p>


<ul>
<li>Usar una manera de intentar de nuevo que aumenta el tiempo poco a poco. Por ejemplo, primero después de 1 segundo, luego 10 segundos, 30 segundos y así.</li>
<li>Poner un límite de cuántas veces se intenta antes de decidir hacer otra cosa.</li>
</ul>


<p><strong>2. Encolar evento fallido</strong></p>


<p>Si después de varios intentos sigue sin funcionar, puede ser mejor mandar el evento a una cola como SQS o SNS para verlo después.</p>


<p>Esto permite:</p>


<ul>
<li>Que la función se desocupe para poder atender nuevos eventos.</li>
<li>Intentar de nuevo el evento fallido más tarde, quizás cuando el problema temporal ya se solucionó.</li>
<li>Ver y arreglar el evento con calma si es necesario.</li>
</ul>


<p>Tener una cola de mensajes te da más control y te permite ver mejor qué pasa con los eventos que no funcionaron.</p>


<h2 id="casos-de-uso" tabindex="-1">Casos de uso</h2>


<p>AWS Lambda es muy útil para crear aplicaciones que pueden crecer y adaptarse fácilmente sin que te preocupes por los servidores. Veamos algunos ejemplos de cómo se usa:</p>


<h3 id="procesamiento-de-im%C3%A1genes-y-video" tabindex="-1">Procesamiento de imágenes y video</h3>


<p>Empresas grandes como Netflix usan Lambda para trabajar con un montón de imágenes y videos todos los días. Esto incluye:</p>


<ul>
<li><strong>Transcodificación de video</strong>: Cambiar videos a diferentes formatos rápidamente sin gastar mucho.</li>
<li><strong>Análisis de imágenes</strong>: Identificar cosas en imágenes, como objetos o personas, usando tecnología de reconocimiento.</li>
<li><strong>Miniaturas</strong>: Crear imágenes pequeñas de vista previa automáticamente.</li>
</ul>


<h3 id="procesamiento-de-datos" tabindex="-1">Procesamiento de datos</h3>


<p>Lambda es perfecto para organizar y analizar mucha información. Algunos usos son:</p>


<ul>
<li><strong>ETL en AWS Glue</strong>: Tomar datos de diferentes lugares, cambiarlos si es necesario, y guardarlos donde los necesites.</li>
<li><strong>Preparación de datos para ML (Machine Learning)</strong>: Limpiar y organizar datos para que se puedan usar para entrenar sistemas inteligentes.</li>
</ul>


<h3 id="backend-de-aplicaciones-m%C3%B3viles" tabindex="-1">Backend de aplicaciones móviles</h3>


<p>Empresas que hacen apps para celulares, como Mapbox, también usan Lambda para:</p>


<ul>
<li>Manejar muchos usuarios sin problemas.</li>
<li>Añadir nuevas cosas a las apps rápidamente.</li>
<li>Pagar solo por lo que usan de recursos.</li>
</ul>


<h3 id="webhooks-y-notificaciones" tabindex="-1">Webhooks y notificaciones</h3>


<p>Con Lambda, puedes hacer que tu aplicación reaccione a eventos de internet y mande mensajes automáticos:</p>


<ul>
<li><strong>Webhooks</strong>: Hacer algo automáticamente cuando tu sistema recibe una señal de otro sistema.</li>
<li><strong>Notificaciones push</strong>: Enviar mensajes a celulares cuando pase algo interesante.</li>
</ul>


<h3 id="microservicios-y-apis" tabindex="-1">Microservicios y APIs</h3>


<p>Lambda es genial para crear partes pequeñas de una aplicación que pueden trabajar por su cuenta:</p>


<ul>
<li>Divide tu aplicación en partes más manejables.</li>
<li>Usa Amazon API Gateway para conectar esas partes de manera segura.</li>
<li>Lambda crece con tu aplicación, así que no tienes que preocuparte si de repente tienes muchos usuarios.</li>
</ul>


<p>Estos ejemplos muestran cómo AWS Lambda ayuda a hacer aplicaciones más flexibles y económicas, desde empresas pequeñas hasta grandes.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>AWS Lambda es una herramienta que te permite crear pequeños servicios, llamados microservicios, sin tener que preocuparte por cosas complejas como servidores. Esto significa que puedes enfocarte en mejorar tu aplicación sin tener que gastar mucho dinero o tiempo en mantener la infraestructura.</p>


<p>Con Lambda, puedes dividir tu aplicación en partes pequeñas que funcionan de manera independiente. Esto hace que sea más fácil y rápido hacer cambios o añadir nuevas funciones. Además, Lambda se encarga automáticamente de ajustar los recursos necesarios según cuánta gente esté usando tu servicio, lo que ayuda a controlar los costos.</p>


<p>Lambda trabaja muy bien con otros servicios de AWS, lo que te permite crear aplicaciones completas y poderosas para diferentes necesidades, como procesar datos, manejar imágenes, o soportar aplicaciones móviles.</p>


<p>Aquí tienes algunos consejos para sacarle el mayor provecho a Lambda:</p>


<ul>
<li>Asegúrate de que cada microservicio haga una sola cosa y la haga bien.</li>
<li>Usa eventos para que los servicios se comuniquen entre sí sin necesidad de estar conectados todo el tiempo.</li>
<li>No te olvides de llevar un registro de lo que pasa en tus servicios, para poder solucionar problemas rápidamente.</li>
<li>Busca formas de hacer que tus servicios trabajen mejor y gasten menos.</li>
</ul>


<p>En pocas palabras, AWS Lambda te ayuda a crear aplicaciones que son fáciles de manejar, rápidas de mejorar y no cuestan mucho mantener. Esto significa que puedes concentrarte en hacer tu aplicación mejor en lugar de preocuparte por la infraestructura.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas Relacionadas</h2>


<h4 id="%C2%BFqu%C3%A9-es-un-microservicio-aws%3F" tabindex="-1">¿Qué es un Microservicio AWS?</h4>


<p>Los <a href="https://d1.awsstatic.com/whitepapers/microservices-on-aws.pdf" rel="noopener noreferrer" target="_blank">microservicios en AWS</a> son pequeñas partes de programas que funcionan por su cuenta usando AWS Lambda. Cada uno hace una tarea específica y habla con otros servicios usando algo parecido a un sistema de mensajería. Esto te permite mejorar o arreglar partes de tu programa sin tener que tocar el resto.</p>


<h4 id="%C2%BFqu%C3%A9-es-una-funci%C3%B3n-lambda-en-aws%3F" tabindex="-1">¿Qué es una función lambda en AWS?</h4>


<p>Una función Lambda en AWS es un código que se ejecuta en internet sin necesidad de tener un servidor propio. Solo pagas por el tiempo que tu código está activo. Esto es muy práctico para los microservicios.</p>


<h4 id="%C2%BFc%C3%B3mo-se-comunican-entre-s%C3%AD-los-microservicios%3F" tabindex="-1">¿Cómo se comunican entre sí los microservicios?</h4>


<p>Los microservicios en AWS generalmente usan API Gateway para hablar entre ellos de manera segura. También pueden enviar y recibir mensajes de manera asíncrona usando SNS y SQS.</p>


<h4 id="%C2%BFqu%C3%A9-tipos-de-microservicios-existen%3F" tabindex="-1">¿Qué tipos de microservicios existen?</h4>


<p>Hay varios tipos de microservicios, como:</p>


<ul>
<li>Procesamiento de datos</li>
<li>Cambio de formato de videos y fotos</li>
<li>Enviar avisos</li>
<li>Trabajar con información específica del negocio</li>
<li>Interactuar con bases de datos</li>
<li>Hacer análisis y usar Inteligencia Artificial</li>
<li>Cuidar las APIs y la seguridad</li>
</ul>


<p>Cada uno de estos microservicios se centra en hacer bien una cosa.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/optimizacion-de-costos-de-aws-lambda/">Optimización de Costos de AWS Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">Introducción a Serverless en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/microservicios-en-aws-utilizando-contenedores/">Microservicios en AWS Utilizando Contenedores</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-aws-lambda/">Mejores Prácticas Para AWS Lambda</a></li>
</ul>
</p>
