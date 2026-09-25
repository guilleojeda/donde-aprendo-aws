---
title: "AWS SAM CLI: Pruebas y Desarrollo Local"
description: "Aprende a desarrollar y probar aplicaciones serverless localmente con AWS SAM CLI, simulando servicios como Lambda y API Gateway."
publishedAt: "2024-11-27"
publishedTimestamp: "2024-11-27T00:08:23.504Z"
cover: "/assets/blog/fa48e5370fe3d3489c8fb4d5.jpg"
coverAlt: "Thumbnail for: AWS SAM CLI: Pruebas y Desarrollo Local"
ogImage: "/assets/blog/fa48e5370fe3d3489c8fb4d5.jpg"
related:
  - title: "Cómo Utilizar Amazon Bedrock"
    url: "https://dondeaprendoaws.com/blog/como-utilizar-amazon-bedrock/"
    image: "/assets/blog/40a012e9c33f0668e83afad8.png"
    imageAlt: ""
  - title: "Cómo crear Infraestructura como Código en AWS con AWS CloudFormation"
    url: "https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/"
    image: "/assets/blog/7b36649641ff19d02f4e3551.jpg"
    imageAlt: ""
  - title: "AWS Seguridad: Mejores Prácticas"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/"
    image: "/assets/blog/58bea5d60c133d57e4a0bdbf.jpg"
    imageAlt: ""
---

<p><a href="https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli.html">AWS SAM CLI</a> te permite desarrollar y probar <a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">aplicaciones serverless</a> directamente en tu computadora, simulando servicios de AWS como Lambda y API Gateway sin necesidad de subir tu código a la nube. Esto ahorra tiempo y dinero, y facilita la detección de errores. Aquí tienes lo esencial para empezar:</p>
<p><strong>¿Qué puedes hacer con AWS SAM CLI?</strong></p>
<ul><li>Probar funciones Lambda localmente con <code>sam local invoke</code>.</li><li>Simular APIs con <code>sam local start-api</code>.</li><li>Crear eventos de prueba con <code>sam local generate-event</code>.</li><li>Depurar tu código paso a paso con herramientas como <a href="https://code.visualstudio.com/">VS Code</a>.</li></ul>
<p><strong>Herramientas necesarias:</strong></p>
<ol><li><strong><a href="https://docs.aws.amazon.com/cli/">AWS CLI</a></strong>: Para interactuar con AWS desde la terminal.</li><li><strong>AWS SAM CLI</strong>: Para trabajar con aplicaciones serverless.</li><li><strong>Docker</strong>: Para simular el entorno de Lambda localmente.</li></ol>
<p><strong>Pasos básicos:</strong></p>
<ol><li>Instala las herramientas necesarias.</li><li>Configura tus <a href="https://dondeaprendoaws.com/blog/aws-curso-certificado-guia-basica/">credenciales de AWS</a>.</li><li>Crea tu primer proyecto con <code>sam init</code>.</li><li>Prueba y depura tu aplicación localmente antes de desplegarla.</li></ol>
<p>Con AWS SAM CLI, puedes desarrollar aplicaciones serverless de manera más rápida y económica, asegurándote de que funcionen correctamente antes de subirlas a la nube. ¡Empieza hoy!</p>
<h2 id="video-relacionado-de-youtube">Video relacionado de YouTube</h2>
<div><iframe allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" height="315" loading="lazy" src="https://www.youtube-nocookie.com/embed/Z_GAa9WToMM" title="Video de YouTube" width="560"></iframe></div>
<h2 id="preparando-tu-entorno-local">Preparando tu Entorno Local</h2>
<p>¿Listo para crear aplicaciones serverless con AWS SAM CLI? Empecemos configurando tu espacio de trabajo local.</p>
<h3 id="instalando-aws-sam-cli-y-herramientas-requeridas">Instalando <a href="https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli.html">AWS SAM CLI</a> y Herramientas Requeridas</h3>
<p><img alt="AWS SAM CLI" src="/assets/blog/9ae244d7bf0fd9827aedbb22.jpg"/></p>
<p>Necesitas tres herramientas básicas para empezar:</p>
<p><strong>AWS CLI</strong>: Es tu puente directo con AWS desde la terminal. Instálalo siguiendo la <a href="https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html">guía de instalación</a>.</p>
<p><strong>AWS SAM CLI</strong>: Esta herramienta te permite trabajar con aplicaciones serverless. Sigue la <a href="https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html">guía de instalación</a> y comprueba que funciona con:</p>
<pre><code>sam --version
</code></pre>
<p><strong>Docker</strong>: Te permite simular Lambda en tu computadora. Bájalo desde <a href="https://www.docker.com/products/docker-desktop">Docker Desktop</a>.</p>
<h3 id="configurando-credenciales-de-aws-y-creando-proyectos-sam">Configurando Credenciales de AWS y Creando Proyectos SAM</h3>
<p>Primero, configura tus <a href="https://dondeaprendoaws.com/blog/seguridad-en-la-nube-aws-estrategias-clave/">credenciales AWS</a>. El <a href="https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html">Manual de AWS CLI</a> te guía paso a paso.</p>
<p>Para crear tu primer proyecto, ejecuta:</p>
<pre><code>sam init
</code></pre>
<p>Este comando te crea todo lo que necesitas:</p>
<ul><li>Un archivo template.yaml para tu configuración</li><li>Una función Lambda lista para usar</li><li>Tests básicos y dependencias</li></ul>
<blockquote><p><strong>Pro tip</strong>: Si trabajas con Python, elige una plantilla que ya incluya <code>boto3</code>. Te ahorrará tiempo después.</p></blockquote>
<h3 id="comprendiendo-la-plantilla-sam">Comprendiendo la Plantilla SAM</h3>
<p>La plantilla SAM es el corazón de tu aplicación serverless. Aquí tienes un ejemplo básico:</p>
<pre><code>Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: app.lambda_handler
      Runtime: python3.9
      CodeUri: ./src
      Policies:
        - AWSLambdaBasicExecutionRole
</code></pre>
<p>¿Qué hace cada parte? Es simple:</p>
<ul><li><strong>Resources</strong>: Define qué servicios AWS vas a usar</li><li><strong>Functions</strong>: Configura tus funciones Lambda (runtime, handler, etc.)</li></ul>
<p>¿Quieres aprender más? La <a href="https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-specification-template-anatomy.html">documentación oficial</a> tiene todos los detalles.</p>
<p>Para recursos en español, visita <a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a>. Encontrarás guías y ejemplos que complementan lo que acabamos de ver.</p>
<h2 id="usando-aws-sam-cli-para-pruebas-locales">Usando AWS SAM CLI para Pruebas Locales</h2>
<p>AWS SAM CLI te ayuda a probar tus aplicaciones serverless en tu computadora antes de subirlas a AWS. Es como tener un mini AWS en tu máquina local - ahorras dinero y tiempo en el desarrollo.</p>
<h3 id="probando-funciones-lambda-localmente">Probando Funciones Lambda Localmente</h3>
<p>¿Quieres probar tus funciones Lambda sin subirlas a AWS? El comando <code>sam local invoke</code> es tu mejor amigo. Así puedes ejecutar y verificar tus funciones:</p>
<pre><code>sam local invoke "HelloWorldFunction" -e events/event.json --debug
</code></pre>
<p>Este comando ejecuta tu función con datos de prueba que tú defines. Si algo sale mal, puedes revisar paso a paso qué está pasando.</p>
<h3 id="simulando-endpoints-de-api-gateway">Simulando Endpoints de API Gateway</h3>
<p>Para probar tus APIs, ejecuta <code>sam local start-api</code>. Esto crea un servidor en tu computadora en <code>http://localhost:3000</code>. Puedes probarlo con herramientas como <code>curl</code>:</p>
<pre><code>curl http://localhost:3000/hello
</code></pre>
<p>Es como tener tu propia versión de API Gateway en tu máquina. Haces cambios, pruebas, y ves los resultados al instante.</p>
<h3 id="probando-aplicaciones-orientadas-a-eventos">Probando Aplicaciones Orientadas a Eventos</h3>
<p>¿Tu app responde a eventos de S3, DynamoDB o SNS? El comando <code>sam local generate-event</code> crea eventos de prueba que parecen reales:</p>
<pre><code>sam local generate-event s3 put --bucket mi-bucket --key mi-archivo
</code></pre>
<p>Es como simular que alguien subió un archivo a S3, pero todo sucede en tu computadora.</p>
<h3 id="tips-para-mejores-pruebas-locales">Tips para Mejores Pruebas Locales</h3>
<ul><li>Usa <code>--env-vars</code> para simular la configuración que tendrás en AWS</li><li>Prueba funciones conectadas entre sí con <code>sam local start-lambda</code></li><li>Crea eventos de prueba que se parezcan a lo que pasará en el mundo real</li></ul>
<blockquote><p>"La depuración local paso a paso reduce el ciclo de retroalimentación al permitirte encontrar y solucionar problemas que podrías enfrentar en la nube" [1].</p></blockquote>
<p>Con estas herramientas, puedes asegurarte de que todo funcione bien antes de subir tu app a AWS.</p>
<h2 id="tips-y-funciones-avanzadas-para-pruebas-locales">Tips y Funciones Avanzadas para Pruebas Locales</h2>
<h3 id="trabajando-con-runtimes-personalizados">Trabajando con Runtimes Personalizados</h3>
<p>¿Necesitas usar Rust, PHP u otros lenguajes que <a href="https://dondeaprendoaws.com/blog/desarrollando-aplicaciones-con-aws-lambda/">AWS Lambda</a> no soporta por defecto? Los runtimes personalizados son la solución. Así es como puedes configurarlos en tu archivo <code>template.yaml</code>:</p>
<pre><code>Resources:
  MiFuncion:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: nodejs14.x
      Handler: index.handler
      CodeUri: .
</code></pre>
<p>Para que tu app funcione igual que en la nube, usa Docker durante la construcción:</p>
<pre><code>sam build --use-container
</code></pre>
<h3 id="depuraci%C3%B3n-con-aws-sam-cli">Depuración con AWS SAM CLI</h3>
<p>SAM CLI te permite examinar tu código como un cirujano: con precisión y detalle. Conecta tu depurador favorito (VS Code o <a href="https://www.jetbrains.com/pycharm/">PyCharm</a>) así:</p>
<pre><code>sam local start-api --debug-port 5858
</code></pre>
<p>¿Quieres probar tu API localmente? SAM simula API Gateway con un simple comando:</p>
<pre><code>sam local start-api --port 3000
</code></pre>
<blockquote><p>"La depuración local paso a paso reduce el ciclo de retroalimentación al permitirte encontrar y solucionar problemas que podrías enfrentar en la nube" [1]</p></blockquote>
<h3 id="mejorando-la-eficiencia-en-pruebas-locales">Mejorando la Eficiencia en Pruebas Locales</h3>
<p>Aquí hay algunos trucos para hacer tus pruebas más rápidas y efectivas:</p>
<ul><li><strong>Ahorra tiempo con contenedores</strong>: Usa el flag <code>--cached</code> para no descargar todo de nuevo:</li></ul>
<pre><code>sam build --use-container --cached
</code></pre>
<ul><li><strong>Mantén tus dependencias bajo control</strong>: Organiza y actualiza tus paquetes para que todo funcione igual en local y en la nube.</li></ul>
<p><strong>sam sync</strong> es tu mejor amigo para desarrollo rápido - actualiza tu código y plantillas al instante, sin necesidad de reconstruir todo el proyecto. Es como tener un asistente que automáticamente sincroniza tus cambios con el entorno local.</p>
<p>Para simular AWS en tu máquina, configura las variables de entorno correctamente. Esto te ayudará a detectar problemas antes de subir tu código a la nube.</p>
<h2 id="recursos-para-desarrolladores-de-habla-hispana">Recursos para Desarrolladores de Habla Hispana</h2>
<h3 id="introducci%C3%B3n-a-d%C3%B3nde-aprendo-aws">Introducción a <a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a></h3>
<p><img alt="Dónde Aprendo AWS" src="/assets/blog/0b106b2a88b767bcf792b81e.jpg"/></p>
<p>¿Buscas aprender AWS SAM CLI y <a href="https://www.andmore.dev/es/blog/build-serverless-api-with-no-lambda/">desarrollo serverless</a> en español? <strong><a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a></strong> es justo lo que necesitas.</p>
<p>Este blog se destaca por ofrecer contenido en español que te ayuda a dominar AWS paso a paso. ¿Qué lo hace especial? Tres cosas:</p>
<ul><li>Contenido que evoluciona contigo: desde tus primeros pasos hasta niveles más avanzados</li><li>Código real y práctico que puedes usar hoy mismo</li><li>Una comunidad activa de desarrolladores hispanohablantes compartiendo experiencias</li></ul>
<p>El mercado laboral en países de habla hispana pide cada vez más profesionales con conocimientos de AWS. Por eso, tener recursos en español no es solo conveniente - es necesario para entender y aplicar mejor los conceptos técnicos.</p>
<p><strong>¿Qué otros recursos tienes a tu alcance?</strong></p>
<p>La <a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">documentación oficial de AWS</a> en español es tu mejor aliada para profundizar en detalles técnicos. También puedes aprovechar los programas oficiales de capacitación y <a href="https://dondeaprendoaws.com/blog/certificacion-de-aws-preparacion-sin-costo/">certificación AWS</a> en español. Y no olvides los foros comunitarios - ahí encontrarás respuestas a problemas reales de otros desarrolladores hispanohablantes.</p>
<p><strong>Manos a la obra con AWS SAM CLI</strong></p>
<p>El blog te guía paso a paso para crear tu primera API local:</p>
<ul><li>Prepara tu entorno de desarrollo</li><li>Crea y despliega funciones Lambda</li><li>Configura y prueba API Gateway</li><li>Mejora y corrige errores en tu código</li></ul>
<p>Con estas herramientas y guías prácticas, dar tus primeros pasos con AWS SAM CLI y desarrollo serverless será mucho más sencillo.</p>
<h2 id="conclusi%C3%B3n%3A-comenzando-con-aws-sam-cli">Conclusión: Comenzando con AWS SAM CLI</h2>
<p>AWS SAM CLI te ayuda a crear y probar aplicaciones serverless en tu computadora antes de subirlas a la nube. En esta guía has aprendido lo básico para empezar a trabajar con esta herramienta.</p>
<p>Lo más importante que debes saber sobre AWS SAM CLI se divide en tres partes:</p>
<ul><li>Para empezar necesitas instalar AWS CLI y AWS SAM CLI, configurar tus credenciales y crear tu primer proyecto usando <code>sam init</code></li><li>Puedes probar tus funciones Lambda localmente antes de subirlas a AWS</li><li>Las herramientas de depuración y los runtimes personalizados te ayudan a trabajar más rápido</li></ul>
<p><strong>¿Qué hacer ahora?</strong></p>
<p>Empieza por lo básico: configura todo en tu computadora y crea una función Lambda sencilla. Cuando te sientas cómodo, prueba <code>sam build</code> para agilizar tu trabajo. Si necesitas más información en español, visita <a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a>.</p>
<p>AWS SAM CLI hace más fácil y económico el desarrollo serverless. Al probar todo localmente antes de subir los cambios, podrás detectar problemas temprano y crear mejores aplicaciones.</p>
<p><strong>La clave está en combinar dos cosas</strong>: pruebas locales completas y buenas prácticas cuando subas tus cambios a AWS. Así podrás construir aplicaciones que funcionen bien y crezcan sin problemas.</p>
<p>Ya tienes las herramientas - ¡es hora de empezar a crear!</p>
<h2 id="faqs">FAQs</h2>
<p>Te explicamos los puntos más importantes sobre AWS SAM CLI que debes conocer.</p>
<h3 id="%C2%BFse-puede-probar-aws-localmente%3F">¿Se puede probar AWS localmente?</h3>
<p>¡Sí! AWS SAM CLI te permite probar tus aplicaciones serverless en tu computadora antes de subirlas a AWS. Es como tener una <a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">mini-versión de AWS</a> en tu máquina - puedes simular servicios como Lambda y API Gateway sin gastar un centavo en la nube.</p>
<blockquote><p>"La depuración local reduce el ciclo de retroalimentación al permitirte encontrar y solucionar problemas que podrías enfrentar en la nube." [1]</p></blockquote>
<h3 id="%C2%BFc%C3%B3mo-usar-sam-localmente%3F">¿Cómo usar SAM localmente?</h3>
<p>Es más fácil de lo que parece. Solo necesitas dos comandos principales:</p>
<ul><li><code>sam local invoke</code>: Para probar funciones Lambda (es el equivalente a <code>aws lambda invoke</code>)</li><li><code>sam local start-api</code>: Para simular <a href="https://cloudiostrategy.com/endpoint-proxy-con-api-gateway/">endpoints de API Gateway</a></li></ul>
<p>Por ejemplo, así se ve en acción:</p>
<pre><code>sam local invoke HelloWorldFunction
sam local start-api
</code></pre>
<p><strong>Pro tip</strong>: No olvides ejecutar <code>sam build</code> antes de tus pruebas. Esto asegura que estés probando tu código más reciente.</p>
<p>¿Necesitas configurar variables de entorno específicas? Usa el flag <code>--env-vars</code> durante tus pruebas. Así puedes simular diferentes escenarios y condiciones de manera precisa.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/desarrollando-aplicaciones-con-aws-lambda/">Desarrollando Aplicaciones con AWS Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/">AWS Lambda en Profundidad</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">Introducción a Serverless en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/">Guía para Crear APIs Serverless con AWS Lambda y API Gateway</a></li></ul>
