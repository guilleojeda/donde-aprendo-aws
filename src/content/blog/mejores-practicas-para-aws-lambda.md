---
title: "Mejores Prácticas Para AWS Lambda"
description: "Consejos clave para optimizar y asegurar tus aplicaciones sin servidor con AWS Lambda. Aprende a simplificar tu código, configurar cuidadosamente y monitorear tu función para un rendimiento óptimo."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:26:48.732Z"
cover: "/assets/blog/020c3be0259dc50cecb2155a.png"
coverAlt: "Thumbnail for: Mejores Prácticas Para AWS Lambda"
ogImage: "/assets/blog/020c3be0259dc50cecb2155a.png"
related:
  - title: "7 Estrategias para Mitigar Cold Starts en AWS Lambda"
    url: "https://dondeaprendoaws.com/blog/7-estrategias-para-mitigar-cold-starts-en-aws-lambda/"
    image: "/assets/blog/c936f3eb45382355f87b0707.jpg"
    imageAlt: ""
  - title: "Utilizando Lambda Layers en Múltiples Funciones Lambda"
    url: "https://dondeaprendoaws.com/blog/utilizando-lambda-layers-en-multiples-funciones-lambda/"
    image: "/assets/blog/ab65afd218440c66bc564a0a.jpg"
    imageAlt: ""
  - title: "Ingeniería de Caos en AWS con Fault Injection Simulator"
    url: "https://dondeaprendoaws.com/blog/ingenieria-de-caos-en-aws-con-fault-injection-simulator/"
    image: "/assets/blog/0a0b1cf017845abee5cf215d.png"
    imageAlt: ""
---

<p>Para lograr el máximo rendimiento y seguridad en tus aplicaciones sin servidor con AWS Lambda, sigue estas estrategias clave:</p>


<ul>
<li><strong>Simplifica tu código</strong>: Separa la lógica principal de tu función Lambda del controlador para facilitar las pruebas y el mantenimiento.</li>
<li><strong>Optimiza el uso de recursos</strong>: Reutiliza conexiones y entornos de ejecución y minimiza el tamaño del paquete de tu función.</li>
<li><strong>Configura cuidadosamente</strong>: Elige la cantidad de memoria adecuada y usa AWS Lambda Power Tuning para un rendimiento óptimo.</li>
<li><strong>Monitorea y asegura tu función</strong>: Implementa métricas y alarmas con CloudWatch y asegura tu aplicación desde el diseño, utilizando AWS Security Hub para revisiones de seguridad.</li>
<li><strong>Mejora el rendimiento con SnapStart</strong>: Asegúrate de restablecer las conexiones de red y precargar clases importantes para reducir la latencia.</li>
</ul>


<p>AWS Lambda es ideal para aplicaciones que requieren alta adaptabilidad y eficiencia sin la carga de manejar servidores. Soporta varios lenguajes de programación como Java, Go, PowerShell, Node.js, C#, Python, y Ruby, ofreciendo flexibilidad para tus proyectos. Emplea estas mejores prácticas para aprovechar al máximo las capacidades de AWS Lambda, mejorando la seguridad, rendimiento y eficiencia de tus aplicaciones.</p>


<h2 id="c%C3%B3mo-mejorar-tus-funciones-lambda" tabindex="-1">Cómo Mejorar Tus Funciones Lambda</h2>


<p>Consejos para hacer tu código de función Lambda más eficiente y fácil de manejar.</p>


<h3 id="separar-el-controlador-de-lambda-de-la-l%C3%B3gica-del-n%C3%BAcleo" tabindex="-1">Separar el controlador de Lambda de la lógica del núcleo</h3>


<p>Hacer esto hace más fácil probar y mantener tu código. Si pones la parte principal de tu función Lambda en un lugar separado, puedes probarla sin tener que usar todo el controlador. También te permite usar la misma parte principal en diferentes funciones Lambda, lo que hace todo más ordenado.</p>


<p>Por ejemplo:</p>


<pre><code>exports.handler = function(event, context, callback) {
  var result = miFuncion(event);
  callback(null, result);
}

function miFuncion(event) {
  // aquí va la parte principal
}
</code></pre>


<h3 id="reutilizar-el-entorno-de-ejecuci%C3%B3n-para-mejorar-el-rendimiento" tabindex="-1">Reutilizar el entorno de ejecución para mejorar el rendimiento</h3>


<p>Esto ayuda a evitar el tiempo extra que toma iniciar un nuevo contenedor cada vez que alguien usa tu función. Configura tu función Lambda para que mantenga abiertas las conexiones y recursos entre usos, en vez de cerrar todo después de cada uso. Esto hace que todo funcione más rápido porque no tiene que empezar de cero cada vez.</p>


<p>Pero, cuidado de no guardar información de un uso para otro, para no mezclar datos de diferentes usuarios.</p>


<h3 id="utilizar-variables-de-entorno-para-pasar-par%C3%A1metros" tabindex="-1">Utilizar variables de entorno para pasar parámetros</h3>


<p>Es mejor no poner información fija directamente en el código. Usa variables de entorno para esto. Así, si necesitas cambiar algo, puedes hacerlo fácilmente sin tener que actualizar toda la función.</p>


<h3 id="minimizar-el-tama%C3%B1o-del-paquete-y-evitar-c%C3%B3digo-recursivo" tabindex="-1">Minimizar el tamaño del paquete y evitar código recursivo</h3>


<p>Esto ayuda a que tu función inicie más rápido y cueste menos de ejecutar.</p>


<ul>
<li>Trata de usar solo las dependencias y bibliotecas que realmente necesitas. Esto hace que todo sea más rápido y más barato.</li>
<li>Evita usar código que se llama a sí mismo de manera que no puedas controlar. Esto puede terminar costando mucho.</li>
</ul>


<h2 id="configuraci%C3%B3n-de-la-funci%C3%B3n" tabindex="-1">Configuración de la Función</h2>


<p>Aquí te damos unos consejos para que tu función Lambda funcione mejor y te cueste menos.</p>


<h3 id="elegir-la-configuraci%C3%B3n-de-memoria-%C3%B3ptima" tabindex="-1">Elegir la configuración de memoria óptima</h3>


<p>Es clave probar cómo va tu función Lambda para ver cómo balancear bien el costo y cómo funciona. Si le das más memoria, también va a tener más capacidad de procesamiento. Usa CloudWatch para ver cuánta memoria usa y si necesitas ajustarla.</p>


<p>Te sugerimos probar <a href="https://github.com/alexcasalboni/aws-lambda-power-tuning" rel="noopener noreferrer" target="_blank">AWS Lambda Power Tuning</a>, una herramienta gratis que te ayuda a encontrar la mejor configuración de memoria para tus funciones. También, si tu función necesita mucho poder de procesamiento, considera usar bibliotecas que aprovechen Advanced Vector Extensions 2 (AVX2).</p>


<h3 id="utilizar-aws-lambda-power-tuning" tabindex="-1">Utilizar AWS Lambda Power Tuning</h3>


<p><a href="https://github.com/alexcasalboni/aws-lambda-power-tuning" rel="noopener noreferrer" target="_blank">AWS Lambda Power Tuning</a> es una herramienta gratis que te ayuda a encontrar la mejor manera de configurar los recursos para tu función Lambda, según lo que necesitas hacer. Hace pruebas con diferentes configuraciones y te dice cuál es la mejor combinación de memoria y capacidad de procesamiento para tu caso.</p>


<p>Es buena idea usar esta herramienta cuando estás ajustando tu función Lambda para asegurarte de que estás usando la configuración más eficiente.</p>


<h3 id="usar-los-permisos-m%C3%A1s-restrictivos-posibles" tabindex="-1">Usar los permisos más restrictivos posibles</h3>


<p>Cuando configures los permisos para tu función Lambda, es importante dar solo los permisos que realmente necesita para acceder a los recursos que usa. Esto hace que tu función sea más segura.</p>


<p>Revisa bien qué recursos necesita tu función y limita los permisos solo a eso. También es buena idea revisar de vez en cuando los permisos para quitar los que ya no se usan. Entre más limitados sean los permisos, más segura será tu función.</p>


<h2 id="m%C3%A9tricas%2C-monitoreo-y-alarmas" tabindex="-1">Métricas, Monitoreo y Alarmas</h2>


<p>Es muy importante mantener un ojo en cómo van las cosas con tus funciones Lambda para asegurarte de que todo funcione bien y para encontrar problemas antes de que se hagan grandes.</p>


<h3 id="utilizar-m%C3%A9tricas-de-lambda-y-cloudwatch-alarms" tabindex="-1">Utilizar métricas de Lambda y CloudWatch Alarms</h3>


<p>Las métricas de Lambda junto con las alarmas de CloudWatch te ayudan a ver cómo están tus funciones Lambda y te avisan si algo no va bien.</p>


<ul>
<li>La métrica <code class="inline-code">Duration</code> te dice cuánto tiempo toman tus funciones en hacer su trabajo. Si ves que están tardando mucho, puedes poner una alarma para saberlo.</li>
<li>Con la métrica <code class="inline-code">Errors</code>, puedes ver cuántas veces tus funciones no funcionan como deben. Si de repente hay muchos errores, puedes recibir una alerta.</li>
<li>También es buena idea ver cuántas veces se llaman tus funciones, cuánta memoria usan y cosas así.</li>
</ul>


<p>Esto te ayuda a encontrar problemas rápidamente y a mantener tus funciones corriendo suavemente.</p>


<h3 id="implementar-librer%C3%ADas-de-logs-para-una-mejor-detecci%C3%B3n-de-errores" tabindex="-1">Implementar librerías de logs para una mejor detección de errores</h3>


<p>Usar librerías de logs, como <a href="https://logging.apache.org/log4j/2.x/" rel="noopener noreferrer" target="_blank">log4j</a>, te permite mandar información sobre lo que pasa en tus funciones a CloudWatch Logs. Esto hace más fácil encontrar y solucionar problemas.</p>


<p>Algunos consejos:</p>


<ul>
<li>Escribe en los logs información sobre lo que entra y sale de tus funciones.</li>
<li>Usa diferentes niveles de importancia en tus logs, como DEBUG, INFO, WARN, ERROR.</li>
<li>Asegúrate de registrar los errores y los detalles de por qué pasaron.</li>
<li>No olvides añadir información extra que te pueda ayudar a entender mejor el problema, como identificadores únicos de las ejecuciones.</li>
</ul>


<p>Con toda esta información en un solo lugar, puedes buscar y analizar fácilmente lo que pasó si algo no funciona bien. Esto te da una buena idea de cómo están funcionando tus funciones y te ayuda a solucionar problemas más rápidamente.</p>




<h2 id="seguridad-en-aws-lambda" tabindex="-1">Seguridad en AWS Lambda</h2>


<h3 id="monitorear-lambda-con-aws-security-hub" tabindex="-1">Monitorear Lambda con AWS Security Hub</h3>


<p>AWS Security Hub te ayuda a mantener tus funciones Lambda seguras al revisar si todo está configurado correctamente según las normas de seguridad importantes como PCI DSS e ISO. Te permite:</p>


<ul>
<li>Verificar que la configuración de tus Lambda cumpla con estándares de seguridad.</li>
<li>Detectar si has dado más permisos de los necesarios, o si tienes variables de entorno que no están protegidas.</li>
<li>Juntar todas las alertas de seguridad en un solo lugar para que no se te pase nada.</li>
<li>Conectar con otras herramientas como Amazon CloudWatch para tener una mejor idea de lo que está pasando.</li>
</ul>


<p>Es una buena idea activar Security Hub para que estés siempre al tanto de la seguridad de tus funciones Lambda y puedas actuar rápido si algo no va bien.</p>


<h3 id="aplicar-las-mejores-pr%C3%A1cticas-de-seguridad-desde-el-dise%C3%B1o" tabindex="-1">Aplicar las mejores prácticas de seguridad desde el diseño</h3>


<p>Cuando creas una función Lambda, es muy importante pensar en la seguridad desde el principio:</p>


<ul>
<li><strong>Protege la información delicada</strong> en variables de entorno y en los datos que entran, usando AWS KMS. Esto ayuda a mantener segura información como contraseñas.</li>
<li><strong>Revisa todos los datos que entran</strong> antes de procesarlos para evitar que te metan código malo.</li>
<li><strong>Da solo los permisos necesarios</strong> a tu función usando políticas de IAM. Así, si alguien intenta hacer algo que no debe, no podrá.</li>
<li><strong>Guarda un registro</strong> de lo que hace tu función para poder revisarlo después.</li>
<li><strong>Usa ambientes separados</strong> para probar y desarrollar, lejos del ambiente de producción.</li>
</ul>


<p>También es muy útil hacer pruebas de seguridad con expertos de vez en cuando para encontrar y arreglar problemas antes de que alguien más los encuentre.</p>


<p>Si sigues estos consejos desde el comienzo, tus aplicaciones serverless estarán mucho más seguras.</p>


<h2 id="optimizaci%C3%B3n-de-rendimiento" tabindex="-1">Optimización de Rendimiento</h2>


<h3 id="restablecer-siempre-las-conexiones-de-red-con-lambda-snapstart" tabindex="-1">Restablecer siempre las conexiones de red con Lambda SnapStart</h3>


<p>Cuando una función Lambda se vuelve a activar desde una instantánea con SnapStart, no podemos estar seguros de cómo están las conexiones de red. Es clave asegurarse de que estas conexiones se restablezcan cada vez que la función se active de nuevo:</p>


<ul>
<li>Usa el método <code class="inline-code">onStartup</code> en tu controlador para restablecer conexiones cada vez que la función se active.</li>
<li>Evita usar el nombre del host para reconocer el entorno de ejecución. Mejor, crea un ID único en el controlador.</li>
<li>No conectes a puertos fijos, ya que esto puede causar errores al reconectar.</li>
<li>Intenta no usar la caché DNS de Java, porque puede provocar problemas de conexión.</li>
</ul>


<p>Si sigues estos consejos, podrás evitar problemas de conexión y asegurar que tu función Lambda funcione correctamente después de reactivarse desde una instantánea.</p>


<h3 id="precargar-clases-que-contribuyen-a-la-latencia-de-inicio" tabindex="-1">Precargar clases que contribuyen a la latencia de inicio</h3>


<p>Para que Lambda con SnapStart funcione mejor, es buena idea cargar de antemano las clases que hacen que la función tarde en iniciar. Esto se puede hacer de dos maneras:</p>


<ul>
<li><strong>Durante la inicialización:</strong> Carga las clases importantes directamente cuando estás preparando todo, no en el controlador. Esto ayuda a eliminar la espera que se produce al cargar estas clases cuando se necesita la función.</li>
<li><strong>Con invocaciones ficticias</strong>: Si cargar durante la inicialización no es posible, puedes simular llamadas al controlador para que estas clases se carguen antes de que llegue una llamada real.</li>
</ul>


<p>Por ejemplo, en una función que usa Spring Boot, podrías añadir este código al controlador para hacer una llamada ficticia a <code class="inline-code">/pets</code> al preparar todo:</p>


<pre><code class="language-java">handler.proxy(new AwsProxyRequest().withHttpMethod("GET").withPath("/pets"), new TestContext());
</code></pre>


<p>Esto mejora el rendimiento porque las clases importantes ya estarán listas cuando se necesiten, reduciendo el tiempo que tarda en iniciar la función.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>Cuando usas AWS Lambda para hacer aplicaciones sin servidor, es super importante seguir algunos consejos para que todo funcione de maravilla. Aquí te dejamos lo más importante que debes recordar:</p>


<ul>
<li><strong>Mantén la parte principal de tu función Lambda separada</strong>. Esto hace que sea más fácil probarla y usarla en otros lugares.</li>
<li><strong>Haz que tu función reutilice conexiones y recursos</strong>. Esto hace que todo sea más rápido porque no tiene que empezar de cero cada vez.</li>
<li><strong>Piensa bien cuánta memoria necesita tu función</strong>. Usar herramientas como AWS Lambda Power Tuning te puede ayudar a encontrar el balance perfecto entre lo que gastas y cómo funciona.</li>
<li><strong>Estar al pendiente de cómo va todo con CloudWatch</strong>. Es clave para detectar problemas rápido y asegurarte de que tu función esté corriendo bien.</li>
<li><strong>Dale solo los permisos necesarios a tu función</strong>. Así es más segura y reduces riesgos si algo sale mal.</li>
<li><strong>No te saltes las pruebas</strong>. Checar bien todo, especialmente la seguridad y cómo se desempeña, es crucial.</li>
</ul>


<p>Siguiendo estos consejos desde el inicio, puedes crear funciones Lambda que son seguras, eficientes y fáciles de mantener. Esto significa que tus aplicaciones sin servidor van a correr mejor y vas a tener menos problemas más adelante.</p>


<p>Al enfocarte en estos puntos desde el diseño y la implementación, te aseguras de aprovechar al máximo Lambda y evitas complicaciones futuras.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas Relacionadas</h2>


<h3 id="%C2%BFcu%C3%A1ndo-usar-lambda%3F" tabindex="-1">¿Cuándo usar Lambda?</h3>


<p>AWS Lambda es ideal cuando necesitas que tu código se ejecute automáticamente en respuesta a ciertos eventos, como cambios en datos o acciones de usuarios, sin tener que preocuparte por los servidores. Es perfecto para:</p>


<ul>
<li>Manejar tareas que no son constantes y aparecen esporádicamente.</li>
<li>Responder a eventos de otros servicios de AWS como S3 o DynamoDB.</li>
<li>Desarrollar aplicaciones pequeñas sin servidor, conocidas como microsservicios.</li>
</ul>


<p>En resumen, si quieres que tu aplicación se adapte rápidamente a las necesidades sin tener que manejar servidores, Lambda es una buena opción.</p>


<h3 id="%C2%BFqu%C3%A9-lenguajes-soporta-aws-lambda%3F" tabindex="-1">¿Qué lenguajes soporta AWS Lambda?</h3>


<p>AWS Lambda permite usar varios lenguajes de programación, incluyendo:</p>


<ul>
<li>Java</li>
<li>Go</li>
<li>PowerShell</li>
<li>Node.js</li>
<li>C#</li>
<li>Python</li>
<li>Ruby</li>
</ul>


<p>Además, AWS Lambda te da la opción de usar otros lenguajes mediante una API especial, así que tienes bastante flexibilidad para programar tus funciones.</p>


<h3 id="%C2%BFqu%C3%A9-es-el-servicio-aws-lambda%3F" tabindex="-1">¿Qué es el servicio AWS Lambda?</h3>


<p>AWS Lambda es un servicio que te permite ejecutar código sin que tengas que preocuparte por los servidores. Solo pagas por el tiempo que tu código está corriendo. Esto es útil porque:</p>


<ul>
<li>Se encarga de todo lo que tiene que ver con servidores, como ajustar la cantidad de recursos necesarios o asegurarse de que tu código esté siempre disponible.</li>
<li>Permite que tu aplicación se ajuste automáticamente según lo que necesite, sin que tengas que hacer nada.</li>
</ul>


<p>En pocas palabras, AWS Lambda hace que sea mucho más fácil y económico correr aplicaciones que necesitan adaptarse rápidamente a diferentes situaciones.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">Introducción a Serverless en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/">AWS Lambda en Profundidad</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ec2/">Mejores Prácticas Para Amazon EC2</a></li>
</ul>
</p>
