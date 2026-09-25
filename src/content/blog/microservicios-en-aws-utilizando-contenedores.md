---
title: "Microservicios en AWS Utilizando Contenedores"
description: "Descubre cómo desplegar aplicaciones de manera eficiente, flexible y escalable con microservicios en AWS utilizando contenedores. Aprende sobre ECS, EKS, Fargate y más."
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T00:23:23.974Z"
cover: "/assets/blog/bf2d7e4c78ec347430ffd844.jpg"
coverAlt: "Thumbnail for: Microservicios en AWS Utilizando Contenedores"
ogImage: "/assets/blog/bf2d7e4c78ec347430ffd844.jpg"
related:
  - title: "Control Plane vs Data Plane en AWS App Mesh"
    url: "https://dondeaprendoaws.com/blog/control-plane-vs-data-plane-en-aws-app-mesh/"
    image: "/assets/blog/97233420c8e51dbede977f2c.jpg"
    imageAlt: ""
  - title: "Mejores Prácticas Para Amazon ECS"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ecs/"
    image: "/assets/blog/826c9a11a84720138c6c6ed3.jpg"
    imageAlt: ""
  - title: "AWS Seguridad: Mejores Prácticas"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/"
    image: "/assets/blog/58bea5d60c133d57e4a0bdbf.jpg"
    imageAlt: ""
---

<p>En este artículo, te guiamos por el fascinante mundo de los <a href="https://d1.awsstatic.com/whitepapers/microservices-on-aws.pdf" rel="noopener noreferrer" target="_blank"><strong>microservicios en AWS</strong></a> <strong>utilizando contenedores</strong>. Descubrirás cómo desplegar aplicaciones de manera eficiente, flexible y escalable. Aprenderás sobre:</p>


<ul>
<li><strong>La definición y ventajas de los microservicios</strong>.</li>
<li><strong>Por qué los contenedores son esenciales en este enfoque</strong>.</li>
<li><strong>Herramientas de AWS</strong> como ECS, EKS, y Fargate para manejar contenedores.</li>
<li><strong>Pasos para configurar tu entorno en AWS</strong>, crear un repositorio ECR, y desplegar tus microservicios.</li>
<li><strong>Configuración y despliegue en EKS</strong>.</li>
<li><strong>Cómo Fargate simplifica el manejo de contenedores</strong>.</li>
<li><strong>Tácticas para validar y monitorear tus implementaciones</strong> con CloudWatch.</li>
</ul>


<p>Utilizaremos un lenguaje directo y claro para que puedas entender cómo montar tu arquitectura de microservicios en AWS, aprovechando las ventajas de los contenedores para lograr aplicaciones más robustas, escalables y fáciles de mantener.</p>


<h3 id="%C2%BFpor-qu%C3%A9-utilizar-contenedores%3F" tabindex="-1">¿Por qué utilizar contenedores?</h3>


<p>Los contenedores son como cajas que guardan todo lo que un microservicio necesita para funcionar, como el código y las herramientas. Esto hace que sea fácil mover y arrancar el microservicio en cualquier lugar, ya sea en tu computadora o en la nube.</p>


<p><a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> tiene herramientas muy útiles para manejar estas cajas, o contenedores, a gran escala:</p>


<ul>
<li><a href="https://aws.amazon.com/ecs/" rel="noopener noreferrer" target="_blank">Amazon Elastic Container Service (ECS)</a>: Ayuda a organizar y controlar muchos contenedores juntos.</li>
<li><a href="https://aws.amazon.com/eks/" rel="noopener noreferrer" target="_blank">Amazon Elastic Kubernetes Service (EKS)</a>: Es para manejar grupos de contenedores usando algo llamado Kubernetes.</li>
<li><a href="https://aws.amazon.com/fargate/" rel="noopener noreferrer" target="_blank">AWS Fargate</a>: Te permite correr contenedores sin tener que preocuparte por los servidores donde se ejecutan.</li>
</ul>


<p>Con estas herramientas, AWS te ayuda a usar microservicios en contenedores de manera fácil, sin tener que pensar en los detalles técnicos de cómo se hacen las cosas por debajo.</p>


<h2 id="preparaci%C3%B3n-del-entorno-en-aws" tabindex="-1">Preparación del entorno en AWS</h2>


<h3 id="configuraci%C3%B3n-de-aws-cli" tabindex="-1">Configuración de AWS CLI</h3>


<p>Para usar los servicios de AWS con la línea de comandos, primero necesitamos instalar y configurar AWS Command Line Interface (CLI). Aquí te explico cómo hacerlo de manera sencilla:</p>


<ul>
<li>Instala AWS CLI siguiendo las <a href="https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" rel="noopener noreferrer" target="_blank">instrucciones oficiales</a> para tu sistema operativo.</li>
<li>Configura AWS CLI tecleando <code class="inline-code">aws configure</code> en la línea de comandos. Te pedirá:</li>
<li><strong>AWS Access Key ID</strong>: Es tu llave de acceso a AWS.</li>
<li><strong>AWS Secret Access Key</strong>: Es tu llave secreta de AWS.</li>
<li><strong>Default region name</strong>: La región de AWS que usarás por defecto, como <code class="inline-code">us-east-1</code>.</li>
<li><strong>Default output format</strong>: El formato en que quieres ver los resultados, puede ser <code class="inline-code">json</code>, <code class="inline-code">yaml</code>, etc.</li>
</ul>


<p>Con estos pasos, podrás usar comandos de AWS CLI para manejar tus servicios en AWS.</p>


<h3 id="creaci%C3%B3n-de-un-repositorio-ecr" tabindex="-1">Creación de un repositorio ECR</h3>


<p>Para guardar y manejar las imágenes de <a href="https://www.docker.com/" rel="noopener noreferrer" target="_blank">Docker</a> de nuestros microservicios, usaremos Elastic Container Registry (ECR). Aquí te muestro cómo crear un repositorio:</p>


<ul>
<li>Entra a la consola de AWS y busca el servicio ECR.</li>
<li>Haz clic en "Create repository".</li>
<li>Ponle un nombre al repositorio y haz clic en "Create repository".</li>
</ul>


<p>Listo, ahora tienes un repositorio de Docker donde puedes guardar las imágenes de tus microservicios. Más adelante, te enseñaré cómo subir las imágenes de tus microservicios a este repositorio.</p>


<h2 id="despliegue-de-microservicios-con-ecs" tabindex="-1">Despliegue de microservicios con ECS</h2>


<p>Vamos a ver cómo poner en marcha tus microservicios usando Elastic Container Service (ECS) de una manera fácil.</p>


<h3 id="creaci%C3%B3n-del-cluster-de-ecs" tabindex="-1">Creación del cluster de ECS</h3>


<p>Primero, necesitas crear un espacio donde tus contenedores puedan correr, eso es un cluster de ECS.</p>


<ul>
<li>Entra a la consola de ECS y elige "Crear Cluster".</li>
<li>Selecciona "EC2 Linux + Networking". Esto prepara un lugar que usa instancias EC2 Linux para correr.</li>
<li>Cuando configures tu cluster:</li>
<li>Dale un nombre, como "microservices-cluster".</li>
<li>Elige el tipo de instancia EC2 que necesitas, por ejemplo, t2.micro, que tiene 1 vCPU y 1GB de RAM.</li>
<li>Deja las otras opciones como están.</li>
<li>Crea el cluster. Esto puede tardar un poco mientras se prepara todo.</li>
</ul>


<p>Ahora tienes un cluster listo para tus microservicios.</p>


<h3 id="definici%C3%B3n-de-tareas" tabindex="-1">Definición de tareas</h3>


<p>Ahora, vamos a decirle a ECS cómo son tus microservicios, esto se hace con las tareas. Piensa en las tareas como las instrucciones para cada microservicio.</p>


<p>Para cada microservicio:</p>


<ul>
<li>Ve a "Definiciones de Tareas" en la consola de ECS.</li>
<li>Elige "Crear nueva Definición de Tarea".</li>
<li>Selecciona "EC2" en "Compatibilidad".</li>
<li>Nombra tu tarea, como "servicio-de-usuarios:1".</li>
<li>En los detalles del contenedor:</li>
<li>Usa la imagen de <a href="https://www.docker.com/" rel="noopener noreferrer" target="_blank">Docker</a> que hiciste para este microservicio.</li>
<li>Asigna 256 de memoria y CPU.</li>
<li>Conecta el puerto 3000 del contenedor con el puerto 0 del host.</li>
<li>Guarda tu definición de tarea.</li>
<li>Haz esto para cada microservicio que quieras correr.</li>
</ul>


<p>Así, cada microservicio tiene sus propias instrucciones y recursos asignados.</p>


<h3 id="creaci%C3%B3n-de-un-servicio-en-ecs" tabindex="-1">Creación de un servicio en ECS</h3>


<p>Finalmente, vamos a crear un servicio en ECS para cada microservicio. Los servicios nos ayudan a manejar cómo y cuándo se corren las tareas.</p>


<p>Para cada microservicio:</p>


<ul>
<li>Ve a la sección "Clusters" de ECS y selecciona tu cluster.</li>
<li>En "Servicios", elige "Crear".</li>
<li>Selecciona "EC2" como tipo de lanzamiento.</li>
<li>Usa la definición de tarea que hiciste para este microservicio.</li>
<li>Nombra tu servicio, como "servicio-de-usuarios".</li>
<li>Por ahora, deja que solo corra una tarea.</li>
<li>En la configuración de red, asegúrate de que el descubrimiento de servicio esté desactivado.</li>
<li>Crea el servicio.</li>
<li>Repite estos pasos para cada microservicio.</li>
</ul>


<p>Con esto, tus servicios están listos y puedes ver cómo se ejecutan tus microservicios en el cluster. También puedes ajustar cuántas tareas quieres que corran por servicio.</p>


<h2 id="implementaci%C3%B3n-con-eks" tabindex="-1">Implementación con EKS</h2>


<h3 id="configuraci%C3%B3n-del-cluster-de-eks" tabindex="-1">Configuración del cluster de EKS</h3>


<p>Para configurar un cluster de EKS, podemos usar tanto la consola de AWS como la línea de comandos de AWS.</p>


<h4 id="con-la-consola" tabindex="-1">Con la consola</h4>


<ul>
<li>Ve a la consola de EKS.</li>
<li>Haz clic en "Crear cluster".</li>
<li>Escoge un nombre para tu cluster y selecciona la versión de Kubernetes que prefieras.</li>
<li>En "Redes", selecciona las subredes y grupos de seguridad para tu cluster.</li>
<li>En "Computación", elige el tipo y cantidad de nodos (instancias EC2) para el cluster.</li>
<li>Haz clic en "Crear" para empezar a crear el cluster.</li>
</ul>


<p>Este proceso puede tardar un poco. Cuando termine, tu cluster estará listo para usar.</p>


<h4 id="con-aws-cli" tabindex="-1">Con AWS CLI</h4>


<p>También puedes crear un cluster con este comando:</p>


<pre><code>aws eks create-cluster --name mi-cluster  \
   --role-arn mi-rol-arn \
   --resources-vpc-config subnetIds=subnet-1234abcd,subnet-abcd1234
</code></pre>


<p>Donde:</p>


<ul>
<li><code class="inline-code">mi-cluster</code> es el nombre que le darás al cluster.</li>
<li><code class="inline-code">mi-rol-arn</code> es el ARN de un rol de IAM con permisos para usar EKS.</li>
<li>Se especifican las subredes para los nodos del cluster.</li>
</ul>


<p>Después de crear el cluster, puedes manejarlo con <code class="inline-code">kubectl</code>, que es una herramienta para Kubernetes.</p>


<h3 id="despliegue-en-eks" tabindex="-1">Despliegue en EKS</h3>


<p>Para poner en marcha tus microservicios en EKS:</p>


<ul>
<li>Prepara los archivos de configuración de Kubernetes para tus aplicaciones.</li>
<li>Crea una imagen Docker para cada microservicio y súbela a ECR.</li>
<li>Conecta <code class="inline-code">kubectl</code> con tu cluster de EKS.</li>
<li>Usa los archivos de configuración para crear lo necesario en Kubernetes.</li>
</ul>


<pre><code>kubectl apply -f deployment.yml -f service.yml
</code></pre>


<ul>
<li>Comprueba que todo se haya creado bien.</li>
</ul>


<pre><code>kubectl get pods
kubectl get services
</code></pre>


<ul>
<li>Si necesitas, puedes revisar los registros o hacer pruebas en los pods.</li>
</ul>


<p>Así, tus microservicios estarán funcionando en EKS, aprovechando las ventajas de Kubernetes para la gestión, red, descubrimiento de servicios, escalado y disponibilidad.</p>




<h2 id="uso-de-fargate" tabindex="-1">Uso de Fargate</h2>


<h3 id="ventajas-de-fargate" tabindex="-1">Ventajas de Fargate</h3>


<p>Fargate es un servicio de AWS que te permite correr contenedores sin tener que manejar servidores. Esto es genial porque:</p>


<ul>
<li><strong>Es fácil</strong>: No necesitas configurar ni mantener servidores. Fargate lo hace por ti.</li>
<li><strong>Es rápido</strong>: Puedes poner en marcha tus aplicaciones rápido, sin esperar que se preparen los servidores.</li>
<li><strong>Ahorras dinero</strong>: Solo pagas por el tiempo que tus contenedores están funcionando. Si no los usas, no pagas.</li>
<li><strong>Es confiable</strong>: Si algo falla en el servidor donde corre tu contenedor, Fargate lo arranca en otro servidor automáticamente.</li>
</ul>


<p>En pocas palabras, Fargate te quita la carga de lidiar con servidores para que te enfoques en mejorar tus aplicaciones.</p>


<h3 id="implementaci%C3%B3n-con-fargate" tabindex="-1">Implementación con Fargate</h3>


<p>Para usar Fargate con tus microservicios, sigue estos pasos:</p>


<ul>
<li><strong>Crea un cluster en ECS o EKS</strong>: Esto es como crear un área de trabajo para tus aplicaciones.</li>
<li><strong>Detalla tus tareas o pods</strong>: Aquí decides cómo quieres que sea cada contenedor, como qué imagen de Docker usar y qué recursos necesita.</li>
<li><strong>Haz un servicio en el cluster</strong>: Esto define cómo quieres que corran tus contenedores, por ejemplo, cuántos quieres que estén activos.</li>
<li><strong>Prepara una VPC y seguridad</strong>: Esto es para que tus contenedores puedan comunicarse de manera segura.</li>
<li><strong>Guarda tus imágenes en ECR</strong>: Aquí pones las imágenes de Docker que tus contenedores van a usar.</li>
</ul>


<p>Con estos pasos, puedes actualizar tus microservicios fácilmente cambiando la imagen en ECR, sin tocar la infraestructura.</p>


<p>Fargate funciona tanto con ECS como con EKS. Puedes elegir el que más te convenga, pero en ambos casos, Fargate te facilita mucho el trabajo.</p>


<h2 id="validaci%C3%B3n-y-monitoreo" tabindex="-1">Validación y monitoreo</h2>


<h3 id="validaci%C3%B3n-de-la-implementaci%C3%B3n" tabindex="-1">Validación de la implementación</h3>


<p>Después de que hayas puesto en marcha tus microservicios en AWS, es clave asegurarte de que todo está funcionando bien antes de hacerlos públicos. Aquí van unos consejos:</p>


<ul>
<li>Realiza pruebas para comprobar que todo funciona como debe. Esto te ayuda a encontrar problemas desde el principio.</li>
<li>Utiliza herramientas como <a href="https://www.getpostman.com/" rel="noopener noreferrer" target="_blank">Postman</a> para probar tus servicios y ver si responden correctamente.</li>
<li>Si usas una base de datos, verifica que se esté llenando bien con datos de prueba.</li>
<li>Haz pruebas de carga para ver cómo se comportan tus servicios cuando hay mucha demanda. Herramientas como Jmeter o Locust pueden ser de ayuda.</li>
<li>Revisa los registros de actividad para buscar errores que puedan indicar problemas.</li>
<li>Piensa en añadir pruebas de funcionamiento en tus servicios para saber rápido si algo no va bien.</li>
</ul>


<p>Hacer estas comprobaciones te dará la confianza de que tus microservicios van a funcionar sin problemas cuando estén en uso real.</p>


<h3 id="monitoreo-con-cloudwatch" tabindex="-1">Monitoreo con CloudWatch</h3>


<p>Amazon CloudWatch es una herramienta que te ayuda a mantener un ojo en cómo van tus aplicaciones en AWS. Con CloudWatch puedes:</p>


<ul>
<li>Recoger y ver datos importantes, como cuánto usan de CPU, memoria, errores, etc. Esto te ayuda a encontrar dónde pueden estar los problemas.</li>
<li>Poner alarmas que te avisan si algo sale de lo normal, lo que puede significar un problema.</li>
<li>Guardar registros de lo que pasa en tus aplicaciones para ayudarte a solucionar errores.</li>
<li>Crear paneles personalizados para ver cómo están tus servicios de un vistazo.</li>
</ul>


<p>Para empezar a monitorear tus microservicios:</p>


<ul>
<li>Instala el agente de CloudWatch en los lugares donde corren tus servicios.</li>
<li>Añade lo necesario para que se envíen datos y registros.</li>
<li>Elige qué datos específicos quieres seguir de cerca en cada servicio.</li>
</ul>


<p>Con esto, podrás identificar rápido si hay problemas de rendimiento y tomar medidas para mejorar tus microservicios en AWS.</p>


<h2 id="conclusiones" tabindex="-1">Conclusiones</h2>


<p>Pensar en microservicios y contenedores es como armar un rompecabezas para hacer aplicaciones que puedan crecer y cambiar fácilmente. Al dividir una aplicación en partes más pequeñas, puedes actualizar partes sin problemas y sin afectar todo lo demás.</p>


<p>AWS tiene varias herramientas útiles para trabajar con estos pedacitos de aplicaciones:</p>


<ul>
<li><strong>Amazon ECS</strong> te ayuda a manejar muchos contenedores juntos, haciéndolo simple de configurar y usar.</li>
<li><strong>Amazon EKS</strong> usa Kubernetes, que es más avanzado para organizar tus contenedores, especialmente si necesitas cosas especiales como redes mejoradas.</li>
<li><a href="https://aws.amazon.com/fargate/" rel="noopener noreferrer" target="_blank"><strong>AWS Fargate</strong></a> te permite correr contenedores sin preocuparte por los servidores donde se ejecutan, lo que hace las cosas mucho más sencillas.</li>
</ul>


<p>Una vez que tienes todo listo y funcionando, es importante asegurarte de que todo esté bien antes de mostrarlo al mundo. Usar <strong>CloudWatch</strong> puede ayudarte a ver cómo está funcionando cada servicio y si hay algún problema.</p>


<p>Trabajar con microservicios significa estar listo para hacer cambios rápido y tener un buen plan para actualizar y mejorar constantemente. AWS te ofrece muchas herramientas para hacer esto posible y construir sistemas fuertes y capaces de crecer.</p>


<p>Te animo a que explores más sobre cada servicio de AWS que mencionamos. Cada uno tiene características especiales que pueden ser muy útiles para tus proyectos en la nube.</p>


<p>¡Te deseo lo mejor en tu aventura con los microservicios!</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas Relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-son-los-contenedores-en-microservicios%3F" tabindex="-1">¿Qué son los contenedores en microservicios?</h3>


<p>Los contenedores son como cajas que llevan todo lo necesario para que un microservicio funcione, como el código y las herramientas. Esto hace que mover y correr el microservicio sea fácil en cualquier lugar.</p>


<p>Ventajas de usar contenedores:</p>


<ul>
<li>Son fáciles de manejar y hacer más grandes o pequeños.</li>
<li>Puedes poner en marcha versiones nuevas rápidamente.</li>
<li>Aseguran que el microservicio funcione igual en desarrollo, pruebas y producción.</li>
<li>Aprovechan mejor los recursos del servidor.</li>
</ul>


<p>Los contenedores hacen más sencillo trabajar con microservicios porque los empaquetan de manera que se pueden manejar fácilmente.</p>


<h3 id="%C2%BFqu%C3%A9-servicio-se-utiliza-para-ejecutar-aplicaciones-en-contenedores-en-aws%3F" tabindex="-1">¿Qué servicio se utiliza para ejecutar aplicaciones en contenedores en AWS?</h3>


<p>AWS tiene varios servicios para correr aplicaciones en contenedores:</p>


<ul>
<li><strong>Amazon ECS</strong>: Te permite correr contenedores Docker en un grupo de máquinas EC2. Es bueno para programar tareas de diferentes tipos.</li>
<li><strong>Amazon EKS</strong>: Es para usar Kubernetes, que ayuda a manejar los contenedores en un grupo de máquinas EC2.</li>
<li><strong>AWS Fargate</strong>: Con este servicio, puedes correr contenedores sin tener que preocuparte por las máquinas donde se ejecutan. Funciona con ECS y EKS.</li>
<li><a href="https://aws.amazon.com/lambda/" rel="noopener noreferrer" target="_blank"><strong>AWS Lambda</strong></a>: Permite correr código sin tener que manejar servidores y se puede usar para contenedores.</li>
</ul>


<p>Estos servicios hacen más fácil y automático el correr contenedores en AWS.</p>


<h3 id="%C2%BFqu%C3%A9-es-un-contenedor-de-aws%3F" tabindex="-1">¿Qué es un contenedor de AWS?</h3>


<p>Un contenedor de AWS es una forma de poner una aplicación o servicio y todo lo que necesita para funcionar (como código y herramientas) en un paquete que se puede mover y correr fácilmente en diferentes lugares.</p>


<p>Beneficios:</p>


<ul>
<li>Se pueden poner en marcha rápido y de manera confiable.</li>
<li>Se pueden hacer más grandes o pequeños según se necesite.</li>
<li>Están disponibles todo el tiempo.</li>
<li>Usan los recursos de manera eficiente.</li>
</ul>


<p>AWS tiene servicios como ECS, EKS y Fargate para ayudarte a manejar contenedores sin importar el tamaño de tu proyecto.</p>


<h3 id="%C2%BFqu%C3%A9-es-un-microservicio-aws%3F" tabindex="-1">¿Qué es un Microservicio AWS?</h3>


<p>Un microservicio AWS es una pequeña aplicación autónoma diseñada para hacer una tarea específica. Es parte de un estilo de construir aplicaciones donde cada parte trabaja de forma independiente.</p>


<p>Características:</p>


<ul>
<li>Trabaja por su cuenta con su propia lógica y datos.</li>
<li>Se puede hacer más grande o pequeño fácilmente.</li>
<li>Se puede actualizar sin afectar a otros.</li>
<li>Se comunica con otros microservicios usando API.</li>
<li>Es más sencillo de mantener y actualizar.</li>
</ul>


<p>AWS te ayuda a poner en marcha microservicios ofreciendo servicios como Lambda para correr código sin servidores, ECS para contenedores, y otras herramientas para bases de datos y redes.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ecs/">Mejores Prácticas Para Amazon ECS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-eks/">Mejores Prácticas Para Amazon EKS</a></li><li><a href="https://dondeaprendoaws.com/blog/opciones-para-desplegar-contenedores-en-aws-ecs-y-eks/">Opciones para Desplegar Contenedores en AWS: ECS y EKS</a></li><li><a href="https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/">Cómo Desplegar Contenedores en AWS</a></li>
</ul>
</p>
