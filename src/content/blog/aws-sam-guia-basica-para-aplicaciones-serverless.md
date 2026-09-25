---
title: "AWS SAM: Guía Básica para Aplicaciones Serverless"
description: "Aprende a crear aplicaciones serverless de forma sencilla en AWS utilizando AWS SAM, un framework que facilita el desarrollo y despliegue."
publishedAt: "2024-11-27"
publishedTimestamp: "2024-11-27T02:20:00.277Z"
cover: "/assets/blog/7007833ab0e2d90f4deb11ec.jpg"
coverAlt: "Thumbnail for: AWS SAM: Guía Básica para Aplicaciones Serverless"
ogImage: "/assets/blog/7007833ab0e2d90f4deb11ec.jpg"
related:
  - title: "¿Qué es AWS Lambda? Preguntas y Respuestas"
    url: "https://dondeaprendoaws.com/blog/que-es-aws-lambda-preguntas-y-respuestas/"
    image: "/assets/blog/70579f832030c8f349b01339.jpg"
    imageAlt: ""
  - title: "Estrategias de Correlación de Eventos AWS"
    url: "https://dondeaprendoaws.com/blog/estrategias-de-correlacion-de-eventos-aws/"
    image: "/assets/blog/b5250ebc33b6dd3702e864e4.jpg"
    imageAlt: ""
  - title: "Seguridad y Control de Costos en AWS: Guía 2024"
    url: "https://dondeaprendoaws.com/blog/seguridad-y-control-de-costos-en-aws-guia-2024/"
    image: "/assets/blog/fa1b6e3bfee7c71b39327fcd.jpg"
    imageAlt: ""
---

<p><a href="https://docs.aws.amazon.com/serverless-application-model/">AWS SAM</a> te permite crear <a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">aplicaciones serverless</a> de forma sencilla en AWS. Con este framework, puedes definir funciones Lambda, APIs, <a href="https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/">bases de datos</a> y más usando plantillas YAML o JSON. Además, el SAM CLI facilita el desarrollo, pruebas locales y despliegues automáticos. Aquí tienes lo esencial:</p>
<ul><li><strong>¿Qué es AWS SAM?</strong> Un framework para manejar <a href="https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/">infraestructura como código</a> mediante plantillas simples basadas en <a href="https://docs.aws.amazon.com/cloudformation/">CloudFormation</a>.</li><li><strong>Ventajas principales:</strong><ul><li>Menos configuración manual gracias a una sintaxis clara.</li><li>Pruebas locales con comandos como <code>sam local invoke</code>.</li><li>Despliegues guiados y automatizados con <code>sam deploy --guided</code>.</li></ul></li><li><strong>Herramientas clave:</strong> SAM CLI para desarrollo y pruebas, <a href="https://docs.aws.amazon.com/xray/">AWS X-Ray</a> para depuración, y <a href="https://aws.amazon.com/blogs/compute/accelerating-serverless-development-with-aws-sam-accelerate/">SAM Accelerate</a> para ciclos rápidos de desarrollo.</li></ul>
<p>Si buscas crear aplicaciones serverless sin complicaciones, AWS SAM es una opción ideal. ¡Empieza con <code>sam init</code> y simplifica tu flujo de trabajo!</p>
<h2 id="video-relacionado-de-youtube">Video relacionado de YouTube</h2>
<div><iframe allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" height="315" loading="lazy" src="https://www.youtube-nocookie.com/embed/Z_GAa9WToMM" title="Video de YouTube" width="560"></iframe></div>
<h2 id="core-features-of-aws-sam">Core Features of <a href="https://docs.aws.amazon.com/serverless-application-model/">AWS SAM</a></h2>
<p><img alt="AWS SAM" src="/assets/blog/1b5c4329688ca8a82954a737.jpg"/></p>
<h3 id="understanding-sam-templates">Understanding SAM Templates</h3>
<p>Las plantillas SAM hacen más fácil definir <a href="https://dondeaprendoaws.com/blog/recursos-compartidos-en-arquitecturas-serverless-multi-tenant/">recursos serverless</a> y mantener tu infraestructura bajo control. Están escritas en YAML y te permiten describir recursos como funciones Lambda, <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html">API Gateway</a> y tablas <a href="https://docs.aws.amazon.com/dynamodb/">DynamoDB</a> sin complicaciones.</p>
<p>Mira este ejemplo básico de una plantilla SAM:</p>
<pre><code>AWSTemplateFormatVersion: '2010-09-09'
Transform: 'AWS::Serverless-2016-10-31'

Resources:
  MiFuncion:
    Type: 'AWS::Serverless::Function'
    Properties:
      Handler: index.handler
      Runtime: nodejs14.x
      CodeUri: .
</code></pre>
<p>¿Qué hace especiales a las plantillas SAM? Te dejan conectar recursos entre sí - por ejemplo, puedes vincular una función Lambda con API Gateway en pocos pasos. Y con funciones como <code>!Ref</code> o <code>!Sub</code>, personalizar tus recursos es pan comido.</p>
<h3 id="using-the-sam-cli">Using the SAM CLI</h3>
<p>El SAM CLI es tu mejor amigo cuando desarrollas apps serverless. Es una herramienta que hace el trabajo pesado por ti, con comandos que son fáciles de recordar:</p>
<ul><li><strong><code>sam init</code></strong>: Te arma un proyecto listo para usar</li><li><strong><code>sam build</code></strong>: Prepara todo para el despliegue</li><li><strong><code>sam deploy</code></strong>: Sube tu app a AWS</li><li><strong><code>sam local start-api</code></strong>: Prueba API Gateway en tu máquina</li><li><strong><code>sam local invoke</code></strong>: Ejecuta funciones Lambda localmente</li></ul>
<p>¿Quieres desplegar tu app? Es tan simple como escribir:</p>
<pre><code>sam deploy --guided
</code></pre>
<p>Este comando te guía paso a paso, preguntándote lo básico como el nombre del stack y dónde quieres desplegarlo.</p>
<p><strong>Lo mejor del CLI es que puedes probar todo localmente.</strong> Encuentra errores antes de gastar dinero en AWS. Y si usas SAM Accelerate, tus ciclos de desarrollo serán aún más rápidos.</p>
<p>¿Trabajas con CI/CD? El CLI se lleva bien con <a href="https://www.jenkins.io/">Jenkins</a> y <a href="https://docs.github.com/actions">GitHub Actions</a>, así que puedes automatizar todo el proceso.</p>
<h2 id="c%C3%B3mo-construir-una-aplicaci%C3%B3n-serverless-con-aws-sam">Cómo Construir una Aplicación Serverless con AWS SAM</h2>
<h3 id="iniciar-un-nuevo-proyecto">Iniciar un Nuevo Proyecto</h3>
<p>Empezar con AWS SAM es más fácil de lo que piensas. Todo comienza con el comando <code>sam init</code>, que te ayuda a configurar tu proyecto paso a paso. Es como tener un asistente personal que te guía en la creación de tu <a href="https://www.andmore.dev/es/blog/build-serverless-api-with-no-lambda/">aplicación serverless</a>.</p>
<p>¿Qué necesitas decidir? Tres cosas básicas:</p>
<ul><li>El lenguaje de programación (Node.js, Python, Java o Go)</li><li>Cómo empaquetar tu app (ZIP para proyectos pequeños o Docker para los más complejos)</li><li>Una plantilla base que se ajuste a lo que quieres crear</li></ul>
<p>¿Quieres ver lo fácil que es? Aquí tienes un ejemplo para crear un proyecto con Node.js 14.x:</p>
<pre><code>sam init --runtime nodejs14.x --package-type Zip --name mi-app-serverless
</code></pre>
<p>¡Y listo! SAM crea toda la estructura del proyecto por ti, incluyendo el archivo <code>template.yaml</code> y las carpetas que necesitas.</p>
<h3 id="compilar-y-empaquetar-la-aplicaci%C3%B3n">Compilar y Empaquetar la Aplicación</h3>
<p>Cuando tengas tu código listo, es hora de prepararlo para AWS. Es tan simple como ejecutar:</p>
<pre><code>sam build
</code></pre>
<p>Este comando hace todo el trabajo pesado: compila tu código, maneja las dependencias y prepara cada función Lambda por separado. <strong>No tienes que preocuparte por nada</strong> - SAM se encarga de todo.</p>
<h3 id="desplegar-tu-aplicaci%C3%B3n">Desplegar tu Aplicación</h3>
<p>El momento de la verdad: poner tu aplicación en la nube. SAM hace que esto sea pan comido con:</p>
<pre><code>sam deploy --guided
</code></pre>
<p>Este comando te hará algunas preguntas (como dónde quieres desplegar tu app y cómo quieres llamarla) y luego se encarga de todo el proceso de despliegue en AWS.</p>
<table><thead><tr><th>Fase</th><th>Comando</th><th>¿Qué hace?</th></tr></thead><tbody><tr><td>Inicio</td><td><code>sam init</code></td><td>Crea tu proyecto desde cero</td></tr><tr><td>Preparación</td><td><code>sam build</code></td><td>Empaqueta todo para AWS</td></tr><tr><td>Lanzamiento</td><td><code>sam deploy --guided</code></td><td>Pone tu app en la nube</td></tr></tbody></table>
<p>Y así de simple es construir una aplicación serverless con AWS SAM. No necesitas ser un experto en la nube - SAM hace que todo el proceso sea directo y manejable. Ahora puedes concentrarte en escribir código genial mientras SAM se encarga de la infraestructura.</p>
<h2 id="tips-para-usar-aws-sam-de-forma-efectiva">Tips para Usar AWS SAM de Forma Efectiva</h2>
<h3 id="organiza-tu-c%C3%B3digo">Organiza tu Código</h3>
<p>¿Cómo manejas funciones Lambda complejas? La clave está en dividirlas en tareas específicas. Imagina una tienda online: en lugar de tener una función gigante, separa el procesamiento de pagos y la gestión de inventarios. Así, cuando algo falla, sabrás exactamente dónde buscar.</p>
<p>El secreto está en mantener el orden: pon tu infraestructura en las plantillas SAM y tu código en carpetas separadas. Es como tener una cocina bien organizada - los ingredientes (código) van en la alacena, y las recetas (plantillas) en su propio libro.</p>
<p>Los nombres de tus recursos son como las etiquetas en esa cocina. Usa prefijos claros:</p>
<ul><li><code>dev-</code> para recursos de desarrollo</li><li><code>prod-</code> para producción</li><li><code>ecommerce-</code> para identificar la aplicación</li></ul>
<p>Por ejemplo: <code>ecommerce-orders-table</code> o <code>ecommerce-payment-function</code>. Cuando todo tiene su nombre claro, es más fácil encontrar lo que buscas.</p>
<h3 id="herramientas-para-pruebas-y-depuraci%C3%B3n">Herramientas para Pruebas y Depuración</h3>
<p>Para construir aplicaciones serverless sólidas, necesitas las herramientas correctas. Es como tener un buen juego de herramientas para reparar tu casa - cada una tiene su propósito específico.</p>
<p><strong><code>sam local</code></strong> es tu banco de pruebas personal. Prueba tus funciones Lambda en tu computadora antes de lanzarlas al mundo real. Es como hacer un ensayo general antes del gran estreno.</p>
<p><strong>AWS X-Ray</strong> es tu detective privado. Te muestra dónde está el problema: ¿es tu función la que tarda mucho o es ese servicio externo que está respondiendo lento?</p>
<p><strong><a href="https://docs.aws.amazon.com/cloudwatch/">CloudWatch</a></strong> es tu sistema de alarma. Te avisa cuando algo no va bien, como cuando tu función Lambda empieza a comportarse de forma extraña.</p>
<p><strong>SAM Accelerate</strong> es tu atajo inteligente. ¿Por qué esperar minutos para ver un cambio cuando puedes verlo casi al instante?</p>
<p>¿Buscas más información en español? El blog <a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a> tiene guías y ejemplos prácticos creados por la comunidad hispanohablante de AWS.</p>
<h2 id="conclusiones-y-siguientes-pasos">Conclusiones y Siguientes Pasos</h2>
<h3 id="puntos-principales">Puntos Principales</h3>
<p>AWS SAM hace más simple crear aplicaciones serverless usando código para definir tu infraestructura. Los desarrolladores pueden centrarse en escribir código que aporte valor al negocio, en lugar de perder tiempo configurando recursos manualmente. Con el <strong>SAM CLI</strong>, puedes probar tu código localmente y desplegarlo más rápido, lo que ayuda a detectar problemas antes de que lleguen a producción.</p>
<p>Una gran ventaja de AWS SAM es que funciona perfectamente con sistemas CI/CD, lo que te permite desplegar código de forma segura y repetible. Y si necesitas hacer algo más específico, AWS SAM es lo bastante flexible para manejar recursos personalizados y arquitecturas más complejas.</p>
<h3 id="recursos-para-seguir-aprendiendo">Recursos para Seguir Aprendiendo</h3>
<p>¿Quieres saber más sobre AWS SAM? Aquí tienes los mejores recursos para continuar tu aprendizaje:</p>
<ul><li>La <strong>Documentación oficial de AWS SAM</strong> tiene todo lo que necesitas para empezar, desde guías básicas hasta consejos avanzados</li><li>En la <strong><a href="https://dondeaprendoaws.com/blog/aprender-aws-gratis-recursos-y-comunidad/">Comunidad AWS</a></strong> encontrarás videos útiles y ejemplos reales. El repositorio de GitHub de AWS SAM está lleno de proyectos que puedes estudiar o mejorar</li><li>El blog <strong><a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a></strong> ofrece contenido en español sobre AWS SAM y desarrollo serverless, perfecto si prefieres aprender en tu idioma</li></ul>
<p>Con estos recursos podrás dominar AWS SAM y crear mejores aplicaciones serverless.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/desarrollando-aplicaciones-con-aws-lambda/">Desarrollando Aplicaciones con AWS Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">Introducción a Serverless en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-sam-cli-pruebas-y-desarrollo-local/">AWS SAM CLI: Pruebas y Desarrollo Local</a></li></ul>
