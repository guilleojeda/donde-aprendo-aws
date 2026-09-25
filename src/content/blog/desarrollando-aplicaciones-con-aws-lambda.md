---
title: "Desarrollando Aplicaciones con AWS Lambda"
description: "AWS Lambda es una herramienta poderosa para desarrollar aplicaciones escalables sin preocuparse por la infraestructura. Aprende sobre AWS Lambda, ventajas, casos de uso, desarrollo, despliegue, integración con otros servicios de AWS y optimización."
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T14:09:19.83Z"
cover: "/assets/blog/699efcfd9fc0a59df5186b93.png"
coverAlt: "Thumbnail for: Desarrollando Aplicaciones con AWS Lambda"
ogImage: "/assets/blog/699efcfd9fc0a59df5186b93.png"
related:
  - title: "AWS IoT Edge Simulator: Casos de Uso Reales"
    url: "https://dondeaprendoaws.com/blog/aws-iot-edge-simulator-casos-de-uso-reales/"
    image: "/assets/blog/7854091f527530189ba482f0.png"
    imageAlt: ""
  - title: "AWS Fundamentos: Guía de Inicio Rápido"
    url: "https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/"
    image: "/assets/blog/945b48235c5e1f4c1d3cc3ae.jpg"
    imageAlt: ""
  - title: "AWS curso certificado: preguntas frecuentes"
    url: "https://dondeaprendoaws.com/blog/aws-curso-certificado-preguntas-frecuentes/"
    image: "/assets/blog/39294214939c4754eb0b11e2.png"
    imageAlt: ""
---

<p>AWS Lambda es una potente herramienta que te permite crear aplicaciones escalables sin preocuparte por la infraestructura. Aquí te damos un resumen de lo que aprenderás en este artículo:</p>


<ul>
<li><strong>AWS Lambda</strong>: Un servicio que ejecuta tu código sin que tengas que gestionar servidores, pagando solo por el tiempo de ejecución.</li>
<li><strong>Ventajas</strong>: No necesitas manejar servidores, se ajusta automáticamente a tus necesidades, está siempre disponible, pagas por uso y se integra fácilmente con otros servicios de AWS.</li>
<li><strong>Casos de uso</strong>: Ideal para manejar datos en tiempo real, backend para aplicaciones móviles o web, análisis de registros, notificaciones y más.</li>
<li><strong>Desarrollo</strong>: Te guiaremos en la creación de tu entorno de desarrollo, desde la instalación de Node.js y AWS CLI hasta el uso de herramientas como SAM para pruebas locales.</li>
<li><strong>Creación de una función Lambda</strong>: Paso a paso para crear tu primera función, manejo de eventos y recursos, e integración con otros servicios de AWS como S3, DynamoDB y API Gateway.</li>
<li><strong>Despliegue y administración</strong>: Cómo utilizar AWS SAM y CloudFormation para desplegar y gestionar tus aplicaciones, incluyendo consejos para optimizar el rendimiento y reducir costos.</li>
<li><strong>Ejemplo práctico</strong>: Desarrollaremos una aplicación completa para manejar tareas, utilizando un frontend en React, backend en Lambda, almacenamiento en DynamoDB y autenticación con Cognito.</li>
</ul>


<p>Sigue leyendo para descubrir cómo aprovechar al máximo AWS Lambda y crear aplicaciones eficientes y escalables sin preocuparte por la infraestructura.</p>


<h3 id="funcionamiento" tabindex="-1">Funcionamiento</h3>


<ul>
<li>Subes tu código a Lambda y decides qué eventos lo harán correr.</li>
<li>Si ocurre uno de esos eventos, Lambda pone en marcha tu código usando contenedores temporales que provee AWS.</li>
<li>Lo mejor es que solo pagas por el tiempo que tu código está activo y en uso.</li>
</ul>


<h3 id="ventajas" tabindex="-1">Ventajas</h3>


<ul>
<li><strong>No hay que manejar servidores:</strong> Olvídate de configurar o mantener servidores.</li>
<li><strong>Se ajusta solo:</strong> Lambda aumenta o reduce su capacidad según lo que necesite tu aplicación, sin que tengas que hacer nada.</li>
<li><strong>Siempre disponible:</strong> Tu código está listo para correr en diferentes lugares al mismo tiempo, lo que significa menos problemas.</li>
<li><strong>Pagas por uso:</strong> Solo te cobran por el tiempo que tu código está corriendo.</li>
<li><strong>Funciona bien con otros servicios:</strong> Se puede conectar fácilmente con otros servicios de AWS como DynamoDB, S3, API Gateway, y más.</li>
</ul>


<h3 id="casos-de-uso" tabindex="-1">Casos de uso</h3>


<p>AWS Lambda es perfecto para:</p>


<ul>
<li>Manejar datos que se actualizan constantemente</li>
<li>Hacer funcionar las partes traseras de aplicaciones móviles o de internet</li>
<li>Organizar y analizar registros o métricas</li>
<li>Enviar mensajes o avisos</li>
<li>Preparar y mover datos (ETL)</li>
<li>Hacer tareas administrativas de forma automática</li>
</ul>


<p>En pocas palabras, Lambda te ayuda a crear aplicaciones que pueden crecer y cambiar fácilmente, sin que te preocupes por los detalles técnicos de los servidores.</p>


<h2 id="preparaci%C3%B3n-del-entorno-de-desarrollo" tabindex="-1">Preparación del Entorno de Desarrollo</h2>


<p>Antes de meternos de lleno en el desarrollo de aplicaciones usando AWS Lambda, necesitamos asegurarnos de tener todo listo. Aquí te explicamos paso a paso lo que tienes que hacer:</p>


<h3 id="creaci%C3%B3n-de-una-cuenta-aws" tabindex="-1">Creación de una cuenta AWS</h3>


<ul>
<li>Primero que nada, si no tienes una cuenta de AWS, necesitas crear una. Es gratis y te da acceso a muchos servicios, incluido Lambda, por 12 meses sin costo.</li>
<li>Después de tener tu cuenta, puedes entrar a la consola de AWS para ver y manejar tus servicios.</li>
</ul>


<h3 id="instalaci%C3%B3n-de-node.js" tabindex="-1">Instalación de Node.js</h3>


<ul>
<li>Necesitas tener Node.js en tu computadora. Lo puedes descargar de <a href="https://nodejs.org/es/" rel="noopener noreferrer" target="_blank">nodejs.org</a>. Con Node.js, podrás correr código JavaScript localmente.</li>
<li>Al instalar Node.js, también obtendrás npm, que es una herramienta para instalar otras herramientas y librerías que necesites.</li>
</ul>


<h3 id="instalaci%C3%B3n-de-aws-cli" tabindex="-1">Instalación de AWS CLI</h3>


<p>La AWS Command Line Interface (CLI) te permite manejar tus servicios de AWS directamente desde la terminal:</p>


<ul>
<li>Para instalarla, sigue las instrucciones en la <a href="https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html" rel="noopener noreferrer" target="_blank">documentación oficial</a>.</li>
<li>Cuando esté instalada, necesitas <a href="https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html" rel="noopener noreferrer" target="_blank">configurarla</a> con tus credenciales. Esto te permitirá interactuar con tu cuenta de AWS desde la terminal.</li>
</ul>


<h3 id="otras-herramientas-%C3%BAtiles" tabindex="-1">Otras herramientas útiles</h3>


<p>Hay otras herramientas que pueden hacerte la vida más fácil cuando trabajas con Lambda:</p>


<ul>
<li>Un editor de código como <a href="https://code.visualstudio.com/" rel="noopener noreferrer" target="_blank">Visual Studio Code</a> es muy útil para escribir y editar tus funciones Lambda.</li>
<li>El <a href="https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html" rel="noopener noreferrer" target="_blank">plugin SAM</a> de AWS te ayuda a probar tus funciones localmente antes de subirlas.</li>
<li>AWS Cloud9 es un entorno de desarrollo integrado (IDE) en la nube que ya viene con soporte para Lambda.</li>
</ul>


<p>Con estas herramientas listas, ya estás preparado para empezar a crear y probar tus propias funciones Lambda.</p>


<h2 id="creaci%C3%B3n-de-tu-primera-funci%C3%B3n-lambda" tabindex="-1">Creación de tu Primera Función Lambda</h2>


<p>Para empezar con una función Lambda en AWS, solo sigue estos pasos sencillos:</p>


<ul>
<li>Entra a la consola de AWS y busca la sección de Lambda.</li>
<li>Dale clic a "Crear función".</li>
<li>Ponle un nombre a tu función y elige "Autor desde cero".</li>
<li>Elige el lenguaje de programación que prefieras (como Node.js o Python).</li>
<li>Sube el código de tu función directamente o mediante un archivo .zip.</li>
<li>Decide cuánto tiempo puede correr tu función (de 1 segundo a 15 minutos).</li>
<li>Escoge cuánta memoria necesita tu función (128MB hasta 3008MB).</li>
<li>Decide cómo se va a activar tu función Lambda (por eventos, peticiones HTTP, etc.).</li>
<li>Al dar clic en "Crear función", tu primera función Lambda estará lista.</li>
</ul>


<h3 id="c%C3%B3mo-maneja-lambda-los-eventos-y-recursos" tabindex="-1">Cómo maneja Lambda los eventos y recursos</h3>


<p>Tu función Lambda se queda esperando hasta que algo la active, como si estuviera dormida. Esto puede ser:</p>


<ul>
<li>Una petición HTTP a través de Amazon API Gateway</li>
<li>Un archivo nuevo en un bucket de Amazon S3</li>
<li>Una fila nueva en una tabla de Amazon DynamoDB</li>
<li>Un mensaje en una cola de Amazon SQS</li>
<li>Y muchos más</li>
</ul>


<p>Lambda se ocupa de preparar todo para que tu función corra solo cuando sea necesario. Le da a tu función lo que necesita (memoria, CPU) y la ejecuta con la información del evento.</p>


<p>Después de que tu función hace su trabajo, Lambda se deshace de los recursos y espera al siguiente evento. Solo pagas por el tiempo que tu función estuvo activa, lo que ayuda a ahorrar.</p>


<p>Además, Lambda ajusta automáticamente los recursos si de repente tu función necesita más por más peticiones o trabajo. Esto significa que puedes tener muchas funciones listas sin pagar de más, solo pagas cuando realmente se usan.</p>


<p>En pocas palabras, Lambda hace que no tengas que preocuparte por la parte técnica de los servidores. Te permite concentrarte en el código y en cómo mejorar tus aplicaciones.</p>


<h2 id="integraci%C3%B3n-con-otros-servicios-de-aws" tabindex="-1">Integración con Otros Servicios de AWS</h2>


<p>AWS Lambda funciona muy bien con otros servicios de AWS como Amazon S3, Amazon DynamoDB y Amazon API Gateway. Esto te permite armar aplicaciones más completas sin necesidad de preocuparte por los servidores.</p>


<h3 id="integraci%C3%B3n-con-amazon-s3" tabindex="-1">Integración con Amazon S3</h3>


<p>Imagina que cada vez que subes una foto a un espacio de almacenamiento en la nube (un bucket de S3), automáticamente se redimensiona o se le pone una marca de agua. Con AWS Lambda, puedes hacer que esto pase automáticamente. Solo subes la foto y Lambda se encarga del resto, procesando la imagen y guardando los cambios donde tú quieras.</p>


<h3 id="integraci%C3%B3n-con-amazon-dynamodb" tabindex="-1">Integración con Amazon DynamoDB</h3>


<p>Amazon DynamoDB es una base de datos que no requiere servidores. Puedes hacer que cada vez que alguien añada información a la base de datos (como un nuevo pedido), Lambda se active y realice acciones como enviar un correo de confirmación o actualizar otra base de datos. Esto te ayuda a automatizar tareas sin complicaciones.</p>


<h3 id="integraci%C3%B3n-con-amazon-api-gateway" tabindex="-1">Integración con Amazon API Gateway</h3>


<p>Con Amazon API Gateway, puedes hacer que tus funciones Lambda respondan a solicitudes web, como cuando alguien visita una página de tu aplicación. Por ejemplo, podrías tener diferentes funciones para manejar usuarios, productos o pedidos, cada una activada por diferentes partes de tu aplicación web. Esto significa que puedes construir la parte de atrás de tu aplicación (el backend) usando solo Lambda y API Gateway, lo que la hace fácil de escalar y mantener.</p>


<p>En resumen, AWS Lambda te permite conectar y automatizar tareas entre diferentes servicios de AWS, haciendo que el desarrollo de aplicaciones sea más sencillo y sin preocupaciones por la infraestructura.</p>




<h2 id="administraci%C3%B3n-y-despliegue-con-aws-sam-y-cloudformation" tabindex="-1">Administración y Despliegue con AWS SAM y CloudFormation</h2>


<p>AWS Serverless Application Model (SAM) y AWS CloudFormation son dos herramientas que te ayudan a manejar y poner en marcha aplicaciones que no necesitan servidores, como las que usan AWS Lambda.</p>


<h3 id="introducci%C3%B3n-a-aws-sam" tabindex="-1">Introducción a AWS SAM</h3>


<p>Piensa en AWS SAM como una ayuda extra para AWS CloudFormation, que te permite describir de manera sencilla cómo quieres que sea tu aplicación sin servidores. Con SAM, puedes decirle a AWS cómo quieres que funcionen tus Lambda, cómo se activan y qué otros servicios necesitan, todo esto usando un lenguaje fácil de entender en archivos YAML o JSON.</p>


<p>Lo bueno de SAM es que:</p>


<ul>
<li>Te facilita mucho el trabajo al crear aplicaciones sin servidores.</li>
<li>Puedes probar tus Lambda en tu propia computadora.</li>
<li>Ayuda a que tus aplicaciones se actualicen solas con AWS CodeDeploy.</li>
<li>Funciona bien con herramientas de CI/CD como AWS CodePipeline.</li>
</ul>


<p>En pocas palabras, SAM te quita complicaciones y te deja concentrarte en tu código.</p>


<h3 id="introducci%C3%B3n-a-aws-cloudformation" tabindex="-1">Introducción a AWS CloudFormation</h3>


<p>AWS CloudFormation te permite decirle a AWS todo lo que necesita tu aplicación, como funciones Lambda, bases de datos y espacios de almacenamiento, usando archivos en formato JSON o YAML. Esto se llama "plantillas".</p>


<p>Cuando usas una plantilla de CloudFormation, AWS crea automáticamente todo lo que le pediste. Esto es genial porque:</p>


<ul>
<li>Puedes manejar tu infraestructura como si fuera código, lo que significa que puedes hacer cambios fácilmente.</li>
<li>Hacer cambios es tan simple como actualizar tus plantillas.</li>
<li>Tus despliegues son automáticos y seguros.</li>
<li>Puedes usarlo para diferentes ambientes, como desarrollo, pruebas y producción.</li>
<li>Se integra fácil con procesos de CI/CD.</li>
</ul>


<p>En resumen, CloudFormation es una manera excelente de manejar la infraestructura de tus aplicaciones sin servidores.</p>


<h3 id="desplegando-una-aplicaci%C3%B3n-lambda-con-aws-sam" tabindex="-1">Desplegando una aplicación Lambda con AWS SAM</h3>


<p>Para poner en marcha una aplicación Lambda usando SAM, solo sigue estos pasos:</p>


<ul>
<li>Escribe cómo quieres que sea tu aplicación en un archivo YAML usando SAM.</li>
<li>Usa el comando <code class="inline-code">sam package</code> para preparar tu aplicación.</li>
<li>Finalmente, usa <code class="inline-code">sam deploy</code> para lanzar tu aplicación en AWS.</li>
</ul>


<p>Un ejemplo de cómo podría verse una plantilla SAM es:</p>


<pre><code class="language-yaml">AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Plantilla SAM sencilla
Resources:
  MiFuncion:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: mi_funcion/
      Handler: app.lambda_handler
      Runtime: python3.7
      Events:
        MiEvento:
          Type: Api
          Properties:
            Path: /funcion
            Method: get
</code></pre>


<p>Con solo usar <code class="inline-code">sam deploy</code>, esta plantilla creará una función Lambda y la conectará a una dirección web para que la puedas usar.</p>


<h3 id="optimizaciones-y-consejos" tabindex="-1">Optimizaciones y Consejos</h3>


<p>Aquí van algunos consejos para que tus aplicaciones sin servidores sean mejores:</p>


<ul>
<li>Usa SAM para lo básico y CloudFormation cuando necesites más control.</li>
<li>Guarda tus plantillas en un lugar seguro como Git.</li>
<li>Prueba tus funciones en tu computadora antes de subirlas.</li>
<li>Automatiza tus despliegues usando herramientas como CodePipeline.</li>
<li>Mantén un ojo en CloudWatch Logs para ver cómo va todo.</li>
<li>Comparte código entre funciones usando AWS::Serverless::LayerVersion.</li>
</ul>


<p>Usar estas herramientas juntas te ayudará a crear aplicaciones Lambda que son fuertes, pueden crecer fácilmente y son simples de manejar.</p>


<h2 id="optimizaci%C3%B3n-y-mejores-pr%C3%A1cticas" tabindex="-1">Optimización y Mejores Prácticas</h2>


<p>Para que tus aplicaciones serverless en AWS Lambda funcionen mejor y gasten menos, te recomendamos seguir estos consejos:</p>


<h3 id="optimizaci%C3%B3n-del-rendimiento" tabindex="-1">Optimización del rendimiento</h3>


<ul>
<li><strong>Haz tus funciones pequeñas</strong>: Trata de que cada función haga una sola cosa y que sea lo más sencilla posible. Así, correrán más rápido.</li>
<li><strong>Elige bien los recursos</strong>: Empieza con poca memoria y tiempo de ejecución, y luego ajusta según lo que necesites. Esto ayuda a no gastar de más.</li>
<li><strong>Comparte código con capas</strong>: Si varias funciones usan el mismo código, mejor compártelo usando capas. Esto ahorra espacio y tiempo.</li>
<li><strong>Guarda datos fuera de Lambda</strong>: Usa otros servicios como DynamoDB o S3 para guardar información, en lugar de hacerlo dentro de las funciones. Esto hace que todo sea más rápido.</li>
</ul>


<h3 id="reducci%C3%B3n-de-costos" tabindex="-1">Reducción de costos</h3>


<ul>
<li><strong>Evita que se ejecuten de más</strong>: Asegúrate de que tus funciones solo se activen cuando sea realmente necesario.</li>
<li><strong>Vigila cómo van las cosas</strong>: Activa CloudWatch para ver cómo se comportan tus funciones. Si algo no va bien, te avisará.</li>
<li><strong>Usa aprovisionamiento en frío si puedes</strong>: Si no te importa que las cosas tarden un poco en empezar, esta opción puede ayudarte a gastar menos.</li>
</ul>


<h3 id="mantenimiento-y-actualizaciones" tabindex="-1">Mantenimiento y actualizaciones</h3>


<ul>
<li><strong>Prueba antes de subir cambios</strong>: Usa herramientas como SAM para probar tus funciones en tu computadora. Así, evitarás problemas cuando las subas a AWS.</li>
<li><strong>Automatiza las subidas</strong>: Con herramientas de CI/CD como CodePipeline, puedes hacer que los cambios se suban solos después de probarlos.</li>
<li><strong>Usa diferentes entornos</strong>: Ten un lugar para probar, otro para desarrollar y otro para la versión final. Así, puedes arreglar errores antes de que afecten a tus usuarios.</li>
<li><strong>Escribe lo que pasa</strong>: Con CloudWatch Logs puedes ver todo lo que hacen tus funciones. Esto es muy útil para entender y arreglar problemas.</li>
</ul>


<p>Siguiendo estos pasos, podrás hacer que tus aplicaciones en AWS Lambda sean más eficientes, gasten menos y sean más fáciles de mantener.</p>


<h2 id="ejemplo-pr%C3%A1ctico%3A-desarrollando-una-aplicaci%C3%B3n-completa-con-aws-lambda" tabindex="-1">Ejemplo Práctico: Desarrollando una Aplicación Completa con AWS Lambda</h2>


<p>En esta parte, te mostraremos cómo crear una aplicación completa sin servidores usando AWS Lambda y otros servicios de AWS.</p>


<h3 id="descripci%C3%B3n-de-la-aplicaci%C3%B3n" tabindex="-1">Descripción de la Aplicación</h3>


<p>Vamos a hacer una aplicación sencilla para manejar tareas. Esta aplicación permitirá a los usuarios ver sus tareas, añadir nuevas y eliminar las que ya no necesiten. Usaremos:</p>


<ul>
<li>Un frontend con React para la parte visual.</li>
<li>Lambda y API Gateway para el backend.</li>
<li>DynamoDB para guardar las tareas.</li>
<li>Cognito para que los usuarios puedan entrar a su cuenta.</li>
<li>CloudFormation para poner todo en marcha de manera automática.</li>
</ul>


<h3 id="preparaci%C3%B3n-del-entorno" tabindex="-1">Preparación del Entorno</h3>


<p>Antes de empezar, necesitamos preparar nuestro espacio de trabajo con lo siguiente:</p>


<ul>
<li>Node.js y npm para el código del frontend y las funciones Lambda.</li>
<li>AWS CLI para manejar los servicios de AWS.</li>
<li>SAM CLI para probar las funciones Lambda en nuestra computadora.</li>
<li>Git para guardar versiones de nuestro código.</li>
<li>Un editor de código, como Visual Studio Code.</li>
</ul>


<h3 id="desarrollo-del-backend" tabindex="-1">Desarrollo del Backend</h3>


<p>Primero, vamos a armar el backend con funciones Lambda que harán cosas como:</p>


<ul>
<li><code class="inline-code">GetTasks</code>: Mostrar las tareas.</li>
<li><code class="inline-code">CreateTask</code>: Añadir una tarea nueva.</li>
<li><code class="inline-code">UpdateTask</code>: Cambiar una tarea.</li>
<li><code class="inline-code">DeleteTask</code>: Quitar una tarea.</li>
</ul>


<p>Cada función estará conectada a su propio enlace en API Gateway.</p>


<p>Probaremos estas funciones en nuestra máquina con SAM CLI antes de subirlas a AWS.</p>


<h3 id="desarrollo-del-frontend" tabindex="-1">Desarrollo del Frontend</h3>


<p>Para el frontend, haremos una aplicación con React. Esta tendrá pantallas para:</p>


<ul>
<li>Entrar a la cuenta (<code class="inline-code">Login</code>).</li>
<li>Ver las tareas (<code class="inline-code">TaskList</code>).</li>
<li>Añadir una tarea nueva (<code class="inline-code">NewTask</code>).</li>
</ul>


<p>El frontend usará las funciones Lambda a través de API Gateway para trabajar con las tareas.</p>


<h3 id="despliegue-automatizado" tabindex="-1">Despliegue Automatizado</h3>


<p>Para poner todo en línea de forma automática, usaremos CloudFormation. Esto nos permite describir cómo queremos que sea nuestra infraestructura (como las funciones Lambda, las tablas de DynamoDB, y más) con un archivo de texto. Luego, con solo un comando (<code class="inline-code">sam deploy</code>), AWS creará todo por nosotros.</p>


<h3 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h3>


<p>Así es como se crea una aplicación completa sin servidores, con un backend en AWS Lambda y un frontend en React. Hemos usado varias herramientas y servicios de AWS para hacer que todo funcione bien juntos. Al probar localmente y organizar bien nuestro código, hemos logrado hacer una aplicación que se puede escalar, es segura y fácil de mantener.</p>


<h2 id="conclusi%C3%B3n-1" tabindex="-1">Conclusión</h2>


<p>AWS Lambda es una herramienta genial para hacer aplicaciones sin tener que manejar servidores y sin gastar mucho. Aquí van algunas ideas importantes que hemos visto:</p>


<ul>
<li>Te permite correr código sin tener que preocuparte por cómo se hace por detrás. Solo pagas por el tiempo que tu código está funcionando.</li>
<li>Es muy útil para que tu aplicación pueda atender a más gente sin que tengas que hacer mucho, y además ayuda a gastar menos, ya que solo usa los recursos que necesita.</li>
<li>Funciona muy bien con otros servicios de AWS como DynamoDB, S3, API Gateway, entre otros. Esto te ayuda a crear aplicaciones completas sin mucho lío.</li>
<li>Herramientas como SAM (AWS Serverless Application Model) y CloudFormation te hacen la vida más fácil para organizar y poner en marcha tus aplicaciones sin servidores.</li>
<li>Si sigues recomendaciones como hacer funciones pequeñas, usar los recursos de manera inteligente y automatizar lo que puedas, tus aplicaciones pueden ser muy eficientes.</li>
</ul>


<p>Te animamos a que empieces a experimentar creando tus propias funciones Lambda. A medida que vayas practicando, podrás hacer aplicaciones sin servidores que sean fuertes, que se puedan agrandar fácilmente y que no gasten mucho.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">AWS Fundamentos: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/desarrollo-en-la-nube-fundamentos-esenciales/">Desarrollo en la nube: fundamentos esenciales</a></li><li><a href="https://dondeaprendoaws.com/blog/nube-aws-guia-de-inicio-rapido/">Nube AWS: Guía de Inicio Rápido</a></li>
</ul>
</p>
