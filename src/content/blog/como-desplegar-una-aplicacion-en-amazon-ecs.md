---
title: "Cómo Desplegar una Aplicación en Amazon ECS"
description: "Aprende cómo desplegar una aplicación en Amazon ECS paso a paso, desde la configuración inicial hasta la administración y escalado. Descubre cómo configurar AWS CLI y tus credenciales, crear un clúster en ECS, definir tareas con imágenes Docker, verificar el funcionamiento de tu aplicación y más."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T23:04:00.573Z"
cover: "/assets/blog/d73cb60565a00d466c3768e1.jpg"
coverAlt: "Thumbnail for: Cómo Desplegar una Aplicación en Amazon ECS"
ogImage: "/assets/blog/d73cb60565a00d466c3768e1.jpg"
related:
  - title: "Checklist: Servicios AWS Esenciales para SAA-C03"
    url: "https://dondeaprendoaws.com/blog/checklist-servicios-aws-esenciales-para-saa-c03/"
    image: "/assets/blog/eadb9eb1eb9dfe22a3da22e2.jpg"
    imageAlt: ""
  - title: "Guía de Eventos AWS Educate 2024"
    url: "https://dondeaprendoaws.com/blog/guia-de-eventos-aws-educate-2024/"
    image: "/assets/blog/835302183289e4165c02383b.jpg"
    imageAlt: ""
  - title: "Aprender AWS gratis: Recursos y Comunidad"
    url: "https://dondeaprendoaws.com/blog/aprender-aws-gratis-recursos-y-comunidad/"
    image: "/assets/blog/c7227ae982494a7ce1620070.jpg"
    imageAlt: ""
---

<p>Desplegar una aplicación en Amazon ECS es más fácil de lo que piensas y aquí te mostramos cómo hacerlo paso a paso. Desde la configuración inicial hasta la administración y escalado, te guiaremos en cada etapa para que puedas lanzar tu aplicación con éxito en Amazon ECS usando Fargate, sin preocuparte por los servidores. Aprenderás a:</p>


<ul>
<li>Configurar AWS CLI y tus credenciales.</li>
<li>Crear un clúster en ECS y preparar una instancia EC2.</li>
<li>Definir y configurar tu tarea con una imagen Docker.</li>
<li>Ajustar y desplegar tu servicio en el clúster.</li>
<li>Verificar que tu aplicación esté funcionando correctamente.</li>
<li>Monitorear el rendimiento y escalar recursos según sea necesario.</li>
</ul>


<p>Además, resolveremos dudas comunes sobre cómo desplegar aplicaciones en AWS, qué es ECS, los servicios disponibles para ejecutar aplicaciones en contenedores, y qué es Amazon Fargate. Este es un recorrido completo para que empieces a utilizar Amazon ECS y Fargate, simplificando el manejo de contenedores y permitiéndote enfocarte más en el desarrollo de tu aplicación.</p>


<h3 id="conocimientos-b%C3%A1sicos-de-aws" tabindex="-1">Conocimientos Básicos de AWS</h3>


<ul>
<li>Es importante que tengas una idea de cómo funciona AWS. Cosas como VPCs, subnets, grupos de seguridad, roles de IAM, son esenciales para que tus <a href="https://kubernetes.io/docs/concepts/containers/" rel="noopener noreferrer" target="_blank">contenedores</a> corran sin problemas en ECS.</li>
<li>También deberías saber lo básico sobre contenedores y Docker, como crear <a href="https://kubernetes.io/docs/concepts/containers/images/" rel="noopener noreferrer" target="_blank">imágenes</a> de Docker y entender qué son los Dockerfiles.</li>
<li>Sería bueno que le dieras una leída a la documentación de Amazon ECS para que sepas de qué va antes de empezar.</li>
</ul>


<h3 id="cli-de-aws-instalada-y-configurada" tabindex="-1">CLI de AWS Instalada y Configurada</h3>


<ul>
<li>Necesitas tener la CLI de AWS (una herramienta para manejar AWS desde la línea de comandos) instalada en tu computadora. Esto te va a permitir controlar tus recursos de AWS sin tener que usar la interfaz web.</li>
<li>Asegúrate de configurar tus credenciales de AWS en la CLI. Esto es como darle las llaves de tu cuenta de AWS a la CLI para que pueda hacer cosas en tu nombre.</li>
</ul>


<h3 id="cuenta-de-aws" tabindex="-1">Cuenta de AWS</h3>


<ul>
<li>Si todavía no tienes una, crea una cuenta en AWS. ECS tiene una opción gratuita para que puedas probar cómo funciona sin gastar dinero.</li>
<li>Lo ideal es que uses una cuenta solo para tus pruebas. Así no te preocupas de que algo de lo que estés probando interfiera con otros proyectos.</li>
</ul>


<h3 id="resumen" tabindex="-1">Resumen</h3>


<p>En pocas palabras, asegúrate de conocer un poco sobre AWS y cómo funcionan los contenedores, tener la CLI de AWS lista en tu computadora, y tener una cuenta de AWS para tus pruebas. Esto te pondrá en buen camino para empezar a jugar con la idea de lanzar aplicaciones en contenedores usando Amazon ECS.</p>


<h2 id="paso-1%3A-configuraci%C3%B3n-inicial-de-ecs" tabindex="-1">Paso 1: Configuración Inicial de ECS</h2>


<h3 id="1.1-crear-clave-de-credencial-de-usuario" tabindex="-1">1.1 Crear clave de credencial de usuario</h3>


<p>Para usar la AWS CLI, primero necesitamos unas claves especiales. Aquí te cuento cómo conseguirlas:</p>


<ul>
<li>Entra a la consola de AWS y busca IAM (Identity and Access Management).</li>
<li>Elige "Usuarios" y después "Agregar usuario".</li>
<li>Escribe un nombre para el usuario y marca la opción de "Acceso programático". Esto es para que se creen unas claves especiales.</li>
<li>En la pantalla que sigue, verás tu clave de acceso y tu clave secreta. Guarda estos datos bien porque son importantes y no los podrás ver de nuevo.</li>
</ul>


<h3 id="1.2-configurar-aws-cli" tabindex="-1">1.2 Configurar AWS CLI</h3>


<p>Ahora que tenemos nuestras claves, vamos a configurar la CLI. Simplemente escribe esto en tu terminal:</p>


<pre><code>aws configure
</code></pre>


<p>Te pedirá que ingreses:</p>


<ul>
<li><strong>AWS Access Key ID</strong>: La clave de acceso de 20 caracteres</li>
<li><strong>AWS Secret Access Key</strong>: La clave secreta de 40 caracteres</li>
<li><strong>Default region name</strong>: Elige la región de AWS que prefieras, como us-east-1</li>
<li><strong>Default output format</strong>: escribe json</li>
</ul>


<p>Con esto, ya estás listo para usar la AWS CLI y manejar tus recursos en AWS. Para asegurarte de que todo está bien configurado, prueba con:</p>


<pre><code>aws sts get-caller-identity
</code></pre>


<p>Este comando te mostrará información sobre tu cuenta de AWS.</p>


<h2 id="paso-2%3A-crear-y-configurar-un-cl%C3%BAster-ecs" tabindex="-1">Paso 2: Crear y Configurar un Clúster ECS</h2>


<h3 id="2.1-crear-cl%C3%BAster-ecs" tabindex="-1">2.1 Crear clúster ECS</h3>


<p>Para empezar con tu clúster ECS, haz lo siguiente:</p>


<ul>
<li>Entra a la consola de AWS y busca la sección de ECS.</li>
<li>Selecciona "Crear clúster".</li>
<li>Escoge la opción "EC2 Linux + Networking" y dale a "Siguiente".</li>
<li>Ponle un nombre a tu clúster para identificarlo fácilmente.</li>
<li>Deja la cantidad de instancias en 1 para iniciar.</li>
<li>En "Redes", elige una VPC y subnets que ya tengas, o crea unas nuevas solo para este clúster.</li>
<li>Dale clic a "Crear".</li>
</ul>


<p>Con estos pasos, tu clúster estará listo para manejar tareas y servicios con imágenes Docker.</p>


<h3 id="2.2-configurar-instancia-ec2" tabindex="-1">2.2 Configurar instancia EC2</h3>


<p>Ahora, vamos a preparar la instancia EC2 que tu clúster va a usar:</p>


<ul>
<li>Ve a la sección de EC2 en la consola de AWS.</li>
<li>Encuentra la instancia que ECS creó por ti. Debería tener el nombre de tu clúster.</li>
<li>Selecciona "Configurar detalles de la instancia".</li>
<li>Escoge una plantilla Linux, como Amazon Linux 2.</li>
<li>Selecciona un tipo de instancia, como t2.micro para empezar.</li>
<li>Asegúrate de que la interfaz de red esté en la misma VPC y subnet que tu clúster.</li>
<li>Guarda los cambios.</li>
</ul>


<p>Para conectarte por SSH a tu instancia EC2, necesitas un par de claves. Aquí te explicamos cómo:</p>


<ul>
<li>En EC2, ve a "Pares de claves".</li>
<li>Clic en "Crear par de claves".</li>
<li>Dale un nombre y descarga el archivo .pem con las claves.</li>
<li>Selecciona tu instancia EC2 y en "Acciones", ve a "Configuración de la instancia" &gt; "Adjuntar/Reemplazar rol IAM".</li>
<li>Usa el rol EC2 que ECS ya tiene listo. Esto le da los permisos que necesita.</li>
<li>Finalmente, en "Grupos de seguridad", permite SSH desde tu IP.</li>
</ul>


<p>Siguiendo estos pasos, podrás conectarte y manejar tu instancia EC2 sin problemas.</p>


<h2 id="paso-3%3A-definici%C3%B3n-de-tareas" tabindex="-1">Paso 3: Definición de Tareas</h2>


<h3 id="3.1-crear-definici%C3%B3n-de-tarea" tabindex="-1">3.1 Crear definición de tarea</h3>


<p>Para que tus contenedores Docker funcionen en tu clúster de ECS, primero necesitas decirle a ECS qué imagen de Docker quieres usar y cómo debe configurarla. Es como darle una receta de cocina.</p>


<ul>
<li>Ve a la consola de ECS y busca "Definiciones de tareas".</li>
<li>Haz clic en "Crear nueva definición de tarea".</li>
<li>Escoge si vas a usar Fargate o EC2 y qué tipo de plataforma.</li>
<li>Cuando llegues a la parte de contenedores, selecciona "Agregar contenedor".</li>
<li>Pon el nombre de la imagen de Docker que vas a usar, como <code class="inline-code">nginx</code>.</li>
<li>Decide cuánta CPU y memoria va a necesitar.</li>
<li>En "Opciones avanzadas", busca la parte de "Puertos".</li>
<li>Añade un mapeo de puertos para conectar el puerto de la imagen Docker (normalmente 80 para Nginx) con el puerto de tu instancia EC2, por ejemplo <code class="inline-code">80</code>.</li>
</ul>


<p>Con estos pasos, ya tienes una definición de tarea lista. No olvides ponerle un nombre que te ayude a recordar para qué es.</p>


<h3 id="3.2-configurar-contenedor-docker" tabindex="-1">3.2 Configurar contenedor Docker</h3>


<p>Cuando estés configurando tu contenedor en la definición de tarea, hay cosas clave que debes ajustar:</p>


<ul>
<li><strong>Puertos</strong>: Conecta el puerto de tu imagen Docker con un puerto en tu instancia EC2 para que la gente pueda acceder a tu aplicación.</li>
<li><strong>CPU/Memoria</strong>: Asigna la cantidad correcta de CPU y RAM que tu aplicación necesita. Si ves que necesitas ajustar esto más adelante, puedes hacerlo sin problema.</li>
<li><strong>Volúmenes de datos</strong>: Si tu aplicación necesita guardar datos de manera permanente, asegúrate de añadir volúmenes para ello.</li>
<li><strong>Variables de entorno</strong>: Si tu aplicación necesita ciertas variables para funcionar, aquí es donde las defines.</li>
</ul>


<p>Configurando bien estos aspectos, tu contenedor debería correr sin problemas en las instancias EC2 de tu clúster de ECS.</p>


<h2 id="paso-4%3A-configurar-y-desplegar-el-servicio" tabindex="-1">Paso 4: Configurar y Desplegar el Servicio</h2>


<h3 id="4.1-configurar-par%C3%A1metros-del-servicio" tabindex="-1">4.1 Configurar parámetros del servicio</h3>


<p>Para poner a punto los detalles de tu servicio en Amazon ECS, aquí tienes unos pasos claros:</p>


<ul>
<li>Primero, decide si vas a usar EC2 o Fargate. Aquí, vamos con EC2.</li>
<li>Luego, piensa en cuántas copias de tu aplicación quieres que corran al mismo tiempo. Empezar con una está bien.</li>
<li>Si tu aplicación va a recibir visitas por Internet, probablemente necesites un balanceador de carga. Esto ayuda a distribuir las visitas para que no se sature.</li>
<li>Por último, aunque no es necesario de inmediato, piensa en Auto Scaling. Esto ajusta automáticamente el número de copias de tu aplicación según cuánta gente la esté usando.</li>
</ul>


<h3 id="4.2-desplegar-el-servicio" tabindex="-1">4.2 Desplegar el servicio</h3>


<p>Ahora que ya configuraste todo, es hora de lanzar tu servicio:</p>


<ul>
<li>Asegúrate de que la definición de tareas que hiciste antes es la que quieres usar.</li>
<li>Escoge el clúster de ECS donde quieres que corra tu servicio.</li>
<li>Dale a "Siguiente".</li>
<li>En la pantalla de revisión, chequea que todo esté como lo quieres.</li>
<li>Haz clic en "Crear servicio".</li>
<li>Espera un poco mientras tu servicio se pone en marcha. Esto puede tardar unos minutos.</li>
<li>Cuando el servicio esté listo, tu aplicación debería estar disponible para usar, ya sea a través del balanceador de carga o usando la dirección IP de tu instancia EC2.</li>
</ul>


<p>Siguiendo estos pasos, habrás logrado desplegar tu servicio en Amazon ECS con EC2. Ahora, tu aplicación debe estar funcionando y lista para recibir visitas.</p>




<h2 id="paso-5%3A-verificaci%C3%B3n-y-pruebas" tabindex="-1">Paso 5: Verificación y Pruebas</h2>


<h3 id="5.1-comprobar-la-instancia-ec2" tabindex="-1">5.1 Comprobar la Instancia EC2</h3>


<p>Para asegurarte de que tu aplicación funciona bien en la instancia EC2, haz lo siguiente:</p>


<ul>
<li>Ve a la consola de EC2 y encuentra la instancia que usas para tu clúster ECS.</li>
<li>Toma la dirección IP pública (IPv4) de esa instancia.</li>
<li>Escribe esa IP en tu navegador para ver tu aplicación. Por ejemplo, si usas Nginx, deberías ver su página de inicio.</li>
</ul>


<p>Si no puedes ver tu aplicación, puede ser que el grupo de seguridad no esté configurado para dejar pasar el tráfico. Para arreglarlo:</p>


<ul>
<li>En la consola de EC2, busca el grupo de seguridad de tu instancia.</li>
<li>Ve a la sección de reglas de entrada.</li>
<li>Añade una regla nueva que permita:</li>
<li>Tipo: HTTP</li>
<li>Protocolo: TCP</li>
<li>Puerto: 80</li>
<li>Origen: 0.0.0.0/0 (esto significa que cualquiera puede acceder)</li>
</ul>


<p>Con estos pasos, deberías poder entrar a tu aplicación sin problemas usando la dirección IP.</p>


<h3 id="5.2-probar-el-funcionamiento" tabindex="-1">5.2 Probar el Funcionamiento</h3>


<p>Con tu aplicación ya en línea, prueba estas cosas para ver que todo marcha bien:</p>


<ul>
<li>Navega por las diferentes páginas o secciones de tu aplicación web. Si tienes una API, prueba algunos de sus servicios.</li>
<li>Si tu aplicación guarda información entre visitas, asegúrate de que esta función trabaje correctamente.</li>
<li>Intenta simular usuarios reales usando herramientas como ab o jmeter para ver cómo responde tu aplicación.</li>
<li>Revisa los registros en CloudWatch para identificar posibles errores o problemas.</li>
<li>Configura alarmas en CloudWatch para monitorear aspectos importantes como el uso de CPU, la memoria, o si hay errores.</li>
</ul>


<p>Haciendo estas pruebas, podrás confirmar que tu aplicación está lista para ser usada por otras personas.</p>


<h2 id="paso-6%3A-administraci%C3%B3n-y-escalado-de-tu-aplicaci%C3%B3n-en-ecs" tabindex="-1">Paso 6: Administración y Escalado de tu Aplicación en ECS</h2>


<h3 id="monitoreo-de-recursos" tabindex="-1">Monitoreo de recursos</h3>


<p>Es clave que revisemos con frecuencia cómo están trabajando nuestros recursos en el clúster de ECS para asegurarnos de que todo va bien. Aquí algunas cosas a tener en cuenta:</p>


<ul>
<li>Chequear el uso de CPU y memoria en las instancias EC2. Si se están quedando cortas, podría afectar cómo corren los contenedores.</li>
<li>Verificar que los servicios y tareas en ECS estén funcionando como esperamos. Es importante tener siempre el número de tareas activas que necesitamos.</li>
<li>Observar cómo están trabajando los contenedores, por ejemplo, cuántas solicitudes reciben por segundo o si están tardando mucho en responder.</li>
<li>Revisar los registros de los contenedores en CloudWatch para buscar errores o advertencias.</li>
</ul>


<p>Podemos crear paneles en CloudWatch con las métricas más importantes para tener todo a la vista. También es buena idea poner alarmas que nos avisen si algo no está bien, como demasiados errores o un aumento inesperado en el uso de recursos.</p>


<h3 id="escalado-vertical-y-horizontal" tabindex="-1">Escalado vertical y horizontal</h3>


<p>Si llega más tráfico, tal vez necesitemos más recursos. Podemos hacerlo de dos maneras:</p>


<p><strong>Vertical</strong>: hacemos más grandes las instancias EC2 para que tengan más potencia.</p>


<p><strong>Horizontal</strong>: agregamos más tareas e instancias EC2 para repartir el trabajo.</p>


<p>Para escalar horizontalmente en ECS, simplemente aumentamos el número de tareas en la configuración del servicio. ECS se encarga de agregar más instancias EC2 si hace falta. También podemos configurar reglas de Auto Scaling para que esto se ajuste automáticamente.</p>


<p>Para el escalado vertical, cambiamos a un tipo de instancia EC2 más grande.</p>


<p>Lo mejor es ir viendo cómo va el rendimiento y ajustar los recursos poco a poco. Un buen indicador es el uso de CPU, tratando de que no pase del 60-70% bajo carga máxima.</p>


<h3 id="actualizaciones-y-despliegues" tabindex="-1">Actualizaciones y despliegues</h3>


<p>También tenemos que saber cómo actualizar nuestra aplicación sin interrupciones. Algunas formas de hacerlo son:</p>


<ul>
<li>Despliegue Blue/Green: mantenemos 2 versiones en producción y vamos cambiando el tráfico entre ellas.</li>
<li>Despliegue Canary: lanzamos la nueva versión solo a un pequeño grupo de usuarios primero. Si todo sale bien, seguimos con todos.</li>
<li>Actualizaciones progresivas: actualizamos algunas tareas primero y vamos avanzando poco a poco.</li>
</ul>


<p>Es crucial tener un plan para volver atrás si algo sale mal con una actualización. ECS nos permite regresar a la versión anterior de una tarea fácilmente.</p>


<p>Con un buen manejo de monitoreo, escalado y actualizaciones, podemos mantener nuestra aplicación en ECS funcionando de maravilla.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>En esta guía, te mostramos cómo poner en marcha una aplicación web usando Amazon ECS y Fargate, paso a paso. Aquí lo que aprendimos:</p>


<ul>
<li>Cómo empezar configurando la AWS CLI y tus credenciales.</li>
<li>Cómo crear un clúster en ECS con una instancia EC2.</li>
<li>Cómo decirle a ECS qué imagen Docker queremos usar mediante una definición de tarea.</li>
<li>Cómo ajustar los detalles de nuestro servicio, como cuánta memoria o CPU necesita.</li>
<li>Cómo hacer que nuestro servicio empiece a funcionar en el clúster.</li>
<li>Cómo comprobar que todo está funcionando bien y hacer pruebas.</li>
<li>Cómo mantener un ojo en cómo va todo, cómo hacer que nuestra aplicación pueda manejar más visitas y cómo actualizarla.</li>
</ul>


<p>Estos pasos básicos te ayudarán a lanzar aplicaciones en contenedores, sin que te tengas que romper la cabeza con la infraestructura que está por debajo.</p>


<p>Amazon ECS hace más sencillo trabajar con contenedores en AWS, permitiéndote enfocarte más en tu código. Con la ayuda de servicios como Fargate, Elastic Load Balancing y Auto Scaling, puedes hacer que tus aplicaciones sean capaces de ajustarse a más visitas y ser más estables sin mucho esfuerzo.</p>


<p>ECS es una buena opción para cualquier tipo de proyecto en la nube, desde aplicaciones pequeñas hasta sistemas grandes de microservicios. Vale la pena considerarlo si estás pensando en modernizar cómo lanzas tus aplicaciones.</p>


<h2 id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="%C2%BFc%C3%B3mo-desplegar-una-aplicaci%C3%B3n-en-aws%3F" tabindex="-1">¿Cómo desplegar una aplicación en AWS?</h3>


<p>Para lanzar una aplicación que usa contenedores en AWS, sigue estos pasos básicos:</p>


<ul>
<li>Asegúrate de tener lista la imagen de Docker de tu aplicación.</li>
<li>Crea un clúster usando ECS o EKS para ejecutar tus contenedores.</li>
<li>Define una tarea en ECS con esa imagen de tu aplicación.</li>
<li>Configura un servicio en el clúster para mantener esa tarea en funcionamiento.</li>
<li>Si es necesario, usa un balanceador de carga para que tu servicio sea accesible desde Internet.</li>
</ul>


<p>Es clave también manejar bien los permisos y la configuración de la red, mantener un ojo en los recursos y estar listo para aumentar la capacidad o actualizar tu aplicación cuando haga falta.</p>


<h3 id="%C2%BFqu%C3%A9-es-ecs-amazon%3F" tabindex="-1">¿Qué es ECS Amazon?</h3>


<p>Amazon Elastic Container Service (ECS) es un servicio de AWS para ejecutar y manejar contenedores Docker en la nube. Te permite crear grupos de máquinas virtuales o usar Fargate para que no tengas que lidiar con la infraestructura. Después, puedes definir tareas y desplegar servicios que mantengan esas tareas activas en tu grupo. ECS trabaja bien con muchos otros servicios de AWS.</p>


<h3 id="%C2%BFqu%C3%A9-servicio-se-utiliza-para-ejecutar-aplicaciones-en-contenedores-en-aws%3F" tabindex="-1">¿Qué servicio se utiliza para ejecutar aplicaciones en <a href="https://kubernetes.io/docs/concepts/containers/" rel="noopener noreferrer" target="_blank">contenedores</a> en AWS?</h3>


<p><figure><img alt="contenedores" src="/assets/blog/b00e1f818f2c35dc864477db.jpg"/></figure></p>


<p>Los servicios principales de AWS para ejecutar aplicaciones en contenedores son:</p>


<ul>
<li><strong>Amazon ECS</strong>: Ideal para ejecutar contenedores Docker en instancias EC2 o con Fargate, donde no tienes que preocuparte por los servidores. Es fácil de usar.</li>
<li><strong>Amazon EKS</strong>: Usa Kubernetes para manejar contenedores a gran escala. Es más complejo pero muy potente.</li>
</ul>


<p>Ambos servicios son buenas opciones para contenerizar aplicaciones en AWS. La elección entre ellos depende de tus necesidades específicas.</p>


<h3 id="%C2%BFqu%C3%A9-es-amazon-fargate%3F" tabindex="-1">¿Qué es Amazon Fargate?</h3>


<p>Amazon Fargate es una manera de correr contenedores en AWS sin tener que manejar servidores. No necesitas pensar en las instancias EC2. Solo defines tus tareas y servicios en ECS o EKS, y Fargate asigna los recursos necesarios para que se ejecuten. Pagas únicamente por los recursos que usan tus contenedores. Es una opción excelente para aplicaciones en contenedores que buscan una solución sin servidores.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ecs/">Mejores Prácticas Para Amazon ECS</a></li><li><a href="https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/">Cómo Desplegar Contenedores en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/opciones-para-desplegar-contenedores-en-aws-ecs-y-eks/">Opciones para Desplegar Contenedores en AWS: ECS y EKS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-eks/">Mejores Prácticas Para Amazon EKS</a></li>
</ul>
</p>
