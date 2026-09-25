---
title: "Utilizando Lambda Layers en Múltiples Funciones Lambda"
description: "Aprende a utilizar Lambda Layers en AWS Lambda para reutilizar código, reducir tamaños de paquetes y gestionar actualizaciones de manera eficiente. Descubre cómo crear, configurar y usar Lambda Layers con ejemplos prácticos."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T02:24:39.563Z"
cover: "/assets/blog/ab65afd218440c66bc564a0a.jpg"
coverAlt: "Thumbnail for: Utilizando Lambda Layers en Múltiples Funciones Lambda"
ogImage: "/assets/blog/ab65afd218440c66bc564a0a.jpg"
related:
  - title: "Mejores Prácticas de Machine Learning en AWS"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-de-machine-learning-en-aws/"
    image: "/assets/blog/93b405bec4b3d8ac5255f4ed.png"
    imageAlt: ""
  - title: "Ingeniería de Caos en AWS con Fault Injection Simulator"
    url: "https://dondeaprendoaws.com/blog/ingenieria-de-caos-en-aws-con-fault-injection-simulator/"
    image: "/assets/blog/0a0b1cf017845abee5cf215d.png"
    imageAlt: ""
  - title: "Desarrollando Aplicaciones con AWS Lambda"
    url: "https://dondeaprendoaws.com/blog/desarrollando-aplicaciones-con-aws-lambda/"
    image: "/assets/blog/699efcfd9fc0a59df5186b93.png"
    imageAlt: ""
---

<p>Si estás buscando optimizar tus proyectos en AWS Lambda, utilizar Lambda Layers es una estrategia clave que te permite compartir código, bibliotecas y otros recursos entre múltiples funciones Lambda. Te ayudarán a:</p>


<ul>
<li><strong>Reutilizar código</strong> fácilmente entre funciones, evitando duplicaciones.</li>
<li><strong>Reducir los tamaños de los paquetes</strong> de tus funciones, lo que acelera las cargas y la ejecución.</li>
<li>Gestionar de manera <strong>centralizada las actualizaciones</strong>, aplicando cambios a múltiples funciones con una sola actualización de la Layer.</li>
<li>Mejorar la <strong>eficiencia en el desarrollo</strong> al permitirte enfocarte en la lógica de negocio en lugar de en la gestión de dependencias.</li>
</ul>


<p>Este artículo te guiará paso a paso sobre cómo crear, configurar y utilizar Lambda Layers para hacer tus proyectos más manejables, rápidos y organizados, con ejemplos prácticos tanto para la interfaz de AWS como para la línea de comandos.</p>


<h2 id="beneficios-de-utilizar-lambda-layers" tabindex="-1">Beneficios de Utilizar Lambda Layers</h2>


<p>Las Lambda Layers te ayudan de varias maneras importantes cuando trabajas con aplicaciones que no necesitan un servidor fijo:</p>


<h3 id="reutilizaci%C3%B3n-de-c%C3%B3digo" tabindex="-1">Reutilización de Código</h3>


<p>Piensa en Lambda Layers como un lugar donde puedes guardar código que varias funciones Lambda podrían necesitar. Así, en vez de copiar y pegar el mismo código en todas partes, simplemente lo pones en una capa y lo usas desde ahí. Esto hace que programar sea más rápido y reduce los errores.</p>


<h3 id="reducci%C3%B3n-de-tama%C3%B1os-de-paquetes" tabindex="-1">Reducción de Tamaños de Paquetes</h3>


<p>Al poner cosas como librerías que no cambian mucho en una Lambda Layer, haces que los paquetes de tus funciones Lambda sean más pequeños. Esto significa que se suben y empiezan a trabajar más rápido, lo cual es genial.</p>


<h3 id="gesti%C3%B3n-centralizada" tabindex="-1">Gestión Centralizada</h3>


<p>Si actualizas algo en una Lambda Layer, todas las funciones Lambda que la usan se actualizan automáticamente. Esto te ahorra mucho tiempo porque no tienes que ir una por una haciendo cambios.</p>


<h3 id="eficiencia-en-el-desarrollo" tabindex="-1">Eficiencia en el Desarrollo</h3>


<p>Usar Lambda Layers hace que sea más fácil y rápido desarrollar aplicaciones sin servidor. Puedes aprovechar el código que ya existe para crear cosas nuevas más rápidamente.</p>


<h2 id="creando-una-lambda-layer" tabindex="-1">Creando una Lambda Layer</h2>


<p>Para hacer una Lambda Layer, solo sigue estos pasos sencillos:</p>


<ul>
<li><strong>Elige el entorno de ejecución</strong></li>
</ul>


<p>Primero, decide qué lenguaje de programación vas a usar y su versión. Por ejemplo, si tu código es en Python, podrías elegir <code class="inline-code">python3.8</code>.</p>


<ul>
<li><strong>Empaqueta tu código y lo que necesite</strong></li>
</ul>


<p>Después, necesitas poner tu código y todo lo que necesite (como librerías) en un archivo ZIP. Si estás compartiendo un módulo de Python que hiciste, pon ese módulo y las librerías que usa en el ZIP.</p>


<p>Asegúrate de que en el ZIP solo estén los archivos necesarios y nada más, para que Lambda pueda usarlos sin problemas.</p>


<ul>
<li><strong>Sube el ZIP</strong></li>
</ul>


<p>Ahora, sube ese archivo ZIP a un lugar donde Lambda pueda encontrarlo, como un bucket de S3.</p>


<ul>
<li><strong>Crea la Lambda Layer</strong></li>
</ul>


<p>Con la ayuda de la consola de AWS, la línea de comandos o CloudFormation, crea la Lambda Layer. Aquí le dices dónde está tu código en S3.</p>


<ul>
<li><strong>Configura quién puede usarla</strong></li>
</ul>


<p>No te olvides de definir quién puede usar tu Layer. Esto lo haces con permisos, para que solo las funciones Lambda que tú quieras puedan acceder a ella.</p>


<ul>
<li><strong>Úsala en tus funciones Lambda</strong></li>
</ul>


<p>Por último, ve a tus funciones Lambda y añade la Layer que acabas de crear. Así, podrán usar todo lo que pusiste en ella.</p>


<h3 id="cosas-a-tener-en-cuenta" tabindex="-1">Cosas a tener en cuenta</h3>


<p>Cuando hagas una Layer, recuerda que:</p>


<ul>
<li>No puede ser más grande de 250 MB cuando se descomprime</li>
<li>Puedes poner hasta 5 Layers en una función Lambda</li>
<li>Lambda guarda estas Layers en una carpeta llamada <code class="inline-code">/opt</code></li>
</ul>


<p>Siguiendo estos pasos, podrás compartir código entre tus funciones Lambda de manera fácil.</p>


<h2 id="utilizando-una-lambda-layer-en-funciones-lambda" tabindex="-1">Utilizando una Lambda Layer en Funciones Lambda</h2>


<p><figure><img alt="Funciones" src="/assets/blog/1d9673b0b83dd7505c5ebee4.jpg"/></figure></p>


<h3 id="vinculando-una-layer-mediante-la-consola-de-aws" tabindex="-1">Vinculando una Layer mediante la Consola de AWS</h3>


<p>Para agregar una Lambda Layer a una de tus funciones Lambda usando la página web de AWS, sigue estos pasos sencillos:</p>


<ul>
<li>Entra a la página de AWS y busca la sección de Lambda.</li>
<li>Elige la función Lambda a la que quieres añadir la Layer.</li>
<li>Busca la pestaña que dice "Configuración" y baja hasta encontrar "Layers".</li>
<li>Haz clic en "Agregar una capa".</li>
<li>Ahora, elige "Especificar un ARN" y pega el ARN de la Layer que quieres usar. Dale clic a "Verificar".</li>
<li>Después de verificar el ARN, solo tienes que hacer clic en "Agregar" y ya estará vinculada a tu función.</li>
</ul>


<p>También puedes buscar la Layer por su nombre en vez de pegar el ARN. Solo recuerda elegir la versión correcta que quieres usar.</p>


<h3 id="vinculando-una-layer-mediante-aws-cli" tabindex="-1">Vinculando una Layer mediante AWS CLI</h3>


<p>Si prefieres usar la línea de comandos de AWS para agregar una Lambda Layer a una función, aquí te dejo cómo hacerlo:</p>


<h3 id="obtener-arn-de-una-lambda-layer" tabindex="-1">Obtener ARN de una Lambda Layer</h3>


<pre><code>aws lambda list-layers --query 'Layers[?Name==mylayer].LatestMatchingVersion.LayerVersionArn'
</code></pre>


<h3 id="actualizar-configuraci%C3%B3n-de-la-funci%C3%B3n-para-usar-la-layer" tabindex="-1">Actualizar configuración de la función para usar la Layer</h3>


<pre><code>aws lambda update-function-configuration --function-name my-function--layers arn:aws:lambda:us-east-1:123456789012:layer:my-layer:1
</code></pre>


<p>Cambia los nombres de la función y la capa por los que estés usando. Así, estarás agregando la última versión de la Layer a tu función.</p>


<h3 id="accediendo-contenido-de-la-layer-desde-el-c%C3%B3digo" tabindex="-1">Accediendo Contenido de la Layer desde el Código</h3>


<p>Una vez que agregas una Layer a tu función Lambda, todo lo que contiene se pone automáticamente en una carpeta llamada <code class="inline-code">/opt</code> en donde corre tu función.</p>


<p>Por ejemplo, si en tu Layer hay una carpeta llamada <code class="inline-code">/python</code>, puedes usar los módulos Python que estén ahí así:</p>


<pre><code class="language-python">import sys
sys.path.insert(0, "/opt/python")
import my_module
</code></pre>


<p>Igualmente, si tienes archivos de configuración o cualquier otro recurso en tu Layer, puedes acceder a ellos de la misma manera. Esto te permite compartir y reutilizar código, librerías y más entre varias funciones Lambda.</p>


<h2 id="utilizando-una-lambda-layer-en-m%C3%BAltiples-funciones" tabindex="-1">Utilizando una Lambda Layer en Múltiples Funciones</h2>


<p>Compartir código entre varias funciones de AWS Lambda usando layers puede hacer tu vida mucho más fácil. Ayuda a evitar repetir el mismo código, hace que tus funciones funcionen más rápido y hace más sencillo arreglar o cambiar cosas. Aquí te dejo algunos consejos para usar layers de la mejor manera:</p>


<h3 id="1.-identifica-el-c%C3%B3digo-com%C3%BAn" tabindex="-1">1. Identifica el código común</h3>


<p>Mira bien tus funciones para ver qué código o herramientas usas más de una vez. Esto puede ser desde pedazos de código que haces tú hasta herramientas que otros han hecho. Eso es lo que deberías poner en una layer.</p>


<h3 id="2.-crea-una-layer-para-varias-cosas" tabindex="-1">2. Crea una layer para varias cosas</h3>


<p>Es mejor tener una layer que sirva para varias cosas en lugar de muchas layers para cosas muy específicas. Así, puedes añadir más código a la misma layer cuando lo necesites.</p>


<h3 id="3.-sigue-reglas-de-buen-c%C3%B3digo" tabindex="-1">3. Sigue reglas de buen código</h3>


<p>El código en tu layer debe ser fácil de entender y usar. Esto significa que debe ser claro, manejar errores de manera inteligente, tener pruebas y explicaciones de cómo se usa.</p>


<h3 id="4.-piensa-en-c%C3%B3mo-manejar-cambios" tabindex="-1">4. Piensa en cómo manejar cambios</h3>


<p>Decide cómo vas a actualizar tu layer cuando necesites hacer cambios. Puedes usar números de versión o tener una para usar y otra para probar cambios. Esto te ayudará a evitar problemas.</p>


<h3 id="5.-actualiza-tus-funciones" tabindex="-1">5. Actualiza tus funciones</h3>


<p>No te olvides de actualizar tus funciones para usar lo nuevo que pongas en la layer.</p>


<p>Siguiendo estos consejos, podrás sacarle más provecho a las layers y hacer que trabajar con Lambda sea más fácil.</p>




<h2 id="consideraciones-y-pr%C3%A1cticas-recomendadas" tabindex="-1">Consideraciones y Prácticas Recomendadas</h2>


<h3 id="control-de-versiones" tabindex="-1">Control de Versiones</h3>


<p>Es clave manejar bien las versiones de tus Lambda Layers. Cada vez que actualizas una Layer, se crea una nueva versión. Al usar Layers en tus funciones Lambda, es mejor vincular a una versión específica en lugar de siempre usar la última. Esto te da control sobre los cambios y evita problemas en tus funciones que ya están corriendo.</p>


<p>Antes de cambiar la versión de una Layer en una función Lambda, prueba bien los cambios en ambientes de prueba. Cuando estés seguro de que todo funciona bien, puedes aplicar los cambios en tus funciones que el público usa.</p>


<h3 id="actualizaci%C3%B3n-de-funciones-lambda" tabindex="-1">Actualización de Funciones Lambda</h3>


<p>Cuando publicas una nueva versión de una Layer, las funciones Lambda que la usan no se actualizan solas. Necesitas actualizar estas funciones manualmente para que usen la nueva versión de la Layer.</p>


<p>Planifica cómo vas a actualizar tus funciones cuando saques nuevas versiones de tus Layers. Esto es especialmente importante para las funciones que mucha gente usa. Puedes hacer la actualización poco a poco para reducir los riesgos.</p>


<h3 id="seguridad-y-permisos" tabindex="-1">Seguridad y Permisos</h3>


<p>Asegúrate de dar solo los permisos necesarios a tus Lambda Layers. Esto ayuda a mantener tus funciones seguras.</p>


<p>Si otras cuentas de AWS necesitan usar una Layer que hiciste, es mejor dar permisos específicos a esas cuentas en lugar de hacer la Layer pública. Así controlas quién puede usar tu Layer.</p>


<h2 id="ventajas-y-desventajas-de-lambda-layers" tabindex="-1">Ventajas y Desventajas de Lambda Layers</h2>


<h3 id="ventajas" tabindex="-1">Ventajas</h3>


<p>Las Lambda Layers ofrecen varias ventajas importantes:</p>


<ul>
<li><strong>Reutilización de código</strong>: Te permiten guardar código común, bibliotecas y otros recursos en un lugar separado para compartir entre varias funciones Lambda. Esto evita que tengas que copiar el mismo código una y otra vez.</li>
<li><strong>Reducción de tamaños de despliegue</strong>: Al mover las dependencias a una capa, el tamaño del paquete que necesitas desplegar para cada función se hace más pequeño. Esto hace que todo funcione más rápido, especialmente cuando inicias una función por primera vez.</li>
<li><strong>Eficiencia en el desarrollo</strong>: Hace más fácil manejar las dependencias y las actualizaciones, ya que puedes hacer cambios en una sola Layer en vez de en cada función Lambda por separado.</li>
<li><strong>Gestión centralizada de dependencias</strong>: Todas las funciones que usan una Layer tendrán las mismas versiones de las dependencias, lo que ayuda a evitar problemas de inconsistencia.</li>
</ul>


<h3 id="desventajas" tabindex="-1">Desventajas</h3>


<p>Sin embargo, Lambda Layers también tiene algunas desventajas:</p>


<ul>
<li>Puede ser un poco complicado al principio tener que manejar capas adicionales.</li>
<li>Necesitas estar atento a las versiones tanto de las Layers como de las funciones Lambda que las usan. Es necesario actualizar las funciones manualmente para usar las nuevas versiones de las Layers.</li>
<li>Hay límites en cuanto al tamaño de las Layers (250 MB después de descomprimir) y cuántas Layers puedes usar por función (5).</li>
<li>No puedes usar una Layer para compartir estado entre funciones.</li>
</ul>


<p>En resumen, las Lambda Layers te ayudan a reutilizar código, ser más eficiente y manejar mejor las dependencias, pero también traen un poco de trabajo extra en cuanto a la gestión de versiones y actualizaciones.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>Las Lambda Layers de AWS son súper útiles cuando desarrollas aplicaciones que no necesitan un servidor propio:</p>


<h3 id="compartir-c%C3%B3digo-y-recursos" tabindex="-1">Compartir código y recursos</h3>


<ul>
<li>Te permiten juntar código, librerías y otras cosas para compartir entre varias funciones Lambda.</li>
<li>Esto ayuda a que no tengas que copiar y pegar las mismas cosas una y otra vez.</li>
</ul>


<h3 id="mejorar-eficiencia" tabindex="-1">Mejorar eficiencia</h3>


<ul>
<li>Al poner las dependencias aparte, las funciones individuales ocupan menos espacio.</li>
<li>Esto hace que todo se inicie, se suba y se ejecute más rápido.</li>
</ul>


<h3 id="simplificar-mantenimiento" tabindex="-1">Simplificar mantenimiento</h3>


<ul>
<li>Si actualizas algo en una Layer, todas las funciones que la usan se actualizan solas.</li>
<li>Así no tienes que ir una por una haciendo cambios.</li>
</ul>


<h3 id="control-de-dependencias" tabindex="-1">Control de dependencias</h3>


<ul>
<li>Todas las funciones usan la misma versión de lo que está en la Layer.</li>
<li>Esto evita problemas porque todo está igual.</li>
</ul>


<h3 id="desarrollo-%C3%A1gil" tabindex="-1">Desarrollo ágil</h3>


<ul>
<li>Permite hacer cambios y probar cosas nuevas más rápido porque es más fácil manejar las dependencias.</li>
<li>También te ayuda a usar entornos de ejecución a tu medida.</li>
</ul>


<p>En pocas palabras, si usas bien las Layers, puedes hacer que el desarrollo de tus aplicaciones en AWS Lambda sea más rápido y sencillo. Solo asegúrate de entender bien cómo manejar las versiones y actualizaciones.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas Relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-es-una-lambda-layer%3F" tabindex="-1">¿Qué es una Lambda Layer?</h3>


<p>Una Lambda Layer es básicamente un paquete de código o datos, como un archivo .zip, que contiene cosas como librerías o configuraciones. Se usa para compartir este contenido entre varias funciones Lambda sin tener que duplicarlo.</p>


<h3 id="%C2%BFc%C3%B3mo-se-utiliza-lambda%3F" tabindex="-1">¿Cómo se utiliza Lambda?</h3>


<p>Las funciones Lambda se usan para tareas como:</p>


<ul>
<li>Responder a eventos, como clics o cambios en datos.</li>
<li>Procesar información al instante.</li>
<li>Conectar diferentes servicios de AWS entre sí.</li>
</ul>


<p>Lo bueno es que Lambda corre tu código solo cuando lo necesitas y no tienes que preocuparte por los servidores. Pagas solo por el tiempo que tu código está corriendo.</p>


<h3 id="%C2%BFqu%C3%A9-conjunto-de-par%C3%A1metros-podemos-usar-en-aws-lambda%3F" tabindex="-1">¿Qué conjunto de parámetros podemos usar en AWS Lambda?</h3>


<p>AWS Lambda soporta varios lenguajes de programación como Java, Go, Node.js, Python, entre otros. También puedes ajustar cosas como:</p>


<ul>
<li>La cantidad de memoria que usa tu función.</li>
<li>Cuánto tiempo puede correr.</li>
<li>Variables de entorno y más.</li>
</ul>


<p>Puedes agregar Capas para incluir código o librerías extras que tu función necesita.</p>


<h3 id="%C2%BFc%C3%B3mo-funciona-una-funci%C3%B3n-lambda%3F" tabindex="-1">¿Cómo funciona una función Lambda?</h3>


<p>Una función Lambda se activa cuando pasa algo que la dispara, como una solicitud de web o un cambio en una base de datos.</p>


<p>AWS Lambda entonces corre tu función, procesa lo que tenga que hacer y termina. La próxima vez que algo active tu función, se corre de nuevo desde cero. Esto significa que no tienes que manejar servidores ni pagar por tiempo que no estás usando.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">Introducción a Serverless en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-aws-lambda/">Mejores Prácticas Para AWS Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">AWS Fundamentos: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/comprendiendo-aws-step-functions/">Comprendiendo AWS Step Functions</a></li>
</ul>
</p>
