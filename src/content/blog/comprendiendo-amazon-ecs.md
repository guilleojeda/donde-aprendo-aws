---
title: "Amazon ECS: qué es y cómo ejecutar tu primera tarea"
description: "Entiende cómo funcionan Amazon ECS, los clústeres, las definiciones de tareas y los servicios; compara Fargate con EC2 y sigue un ejemplo mínimo."
author: "guille-ojeda"
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T23:14:06.199Z"
modifiedTimestamp: "2026-10-06T09:52:18-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cómo reducir costos en AWS Fargate con ECS: guía práctica"
    url: "https://dondeaprendoaws.com/blog/7-estrategias-para-reducir-costos-en-aws-fargate/"

---

<p><strong>Amazon ECS (Elastic Container Service)</strong> es el servicio de AWS que orquesta contenedores: toma una definición de tarea y los ejecuta como tareas puntuales o como un servicio que mantiene una cantidad deseada de réplicas. ECS coordina dónde se ejecuta cada tarea; tú eliges la capacidad de cómputo, como AWS Fargate o instancias de Amazon EC2. AWS también ofrece ECS Managed Instances, donde administra las instancias EC2 usadas por las tareas.</p>

<p>La diferencia clave: Docker crea y ejecuta imágenes; Amazon ECR guarda imágenes; ECS las programa y las mantiene en ejecución; Fargate proporciona capacidad de cómputo sin que administres servidores. <a href="https://docs.aws.amazon.com/es_es/AmazonECS/latest/developerguide/Welcome.html" target="_blank" rel="noopener noreferrer">La guía de Amazon ECS</a> describe estos componentes y opciones.</p>

<h2>Cómo se relacionan clústeres, tareas y servicios</h2>

<table>
  <thead>
    <tr><th>Concepto</th><th>Qué significa</th><th>Cuándo lo usas</th></tr>
  </thead>
  <tbody>
    <tr><td>Imagen y contenedor</td><td>La imagen empaqueta la aplicación y sus dependencias; el contenedor es una instancia en ejecución de esa imagen.</td><td>Construyes una imagen con Docker o eliges una existente; puedes guardarla en Amazon ECR.</td></tr>
    <tr><td>Definición de tarea</td><td>Un archivo JSON que declara los contenedores, imágenes, CPU y memoria, red, registros y roles de IAM.</td><td>Defines una vez cómo debe ejecutarse la aplicación. Cada registro crea una revisión numerada.</td></tr>
    <tr><td>Clúster</td><td>Un ámbito lógico de ECS que agrupa tareas y servicios y permite asignarles capacidad de cómputo.</td><td>Organizas cargas de trabajo; un clúster puede usar Fargate, EC2 o proveedores de capacidad compatibles.</td></tr>
    <tr><td>Tarea</td><td>Una ejecución de la definición. Puede terminar al completar un trabajo, como un proceso por lotes.</td><td>Ejecutas una tarea puntual o la usas como unidad de trabajo de un servicio.</td></tr>
    <tr><td>Servicio</td><td>Un controlador que mantiene el número deseado de tareas y puede reemplazar las que se detienen o se detectan en mal estado.</td><td>Mantienes activa una aplicación de larga duración. Puedes agregar un balanceador de carga.</td></tr>
  </tbody>
</table>

<p>Una tarea no equivale a un servicio: al iniciar una tarea puntual, ECS no la vuelve a crear cuando termina. Un servicio sí intenta mantener su recuento deseado. Para que una aplicación tolere fallos de infraestructura o una zona de disponibilidad, hacen falta varias tareas y una configuración distribuida; una sola tarea no garantiza alta disponibilidad.</p>

<h2>Amazon ECS en Fargate o en EC2</h2>

<p>ECS es el orquestador en ambas opciones. Fargate y EC2 indican dónde corre la tarea:</p>

<table>
  <thead>
    <tr><th>Opción</th><th>Qué administras</th><th>Cuándo puede convenir</th></tr>
  </thead>
  <tbody>
    <tr><td>ECS con Fargate</td><td>Defines CPU, memoria y red por tarea; AWS administra los servidores subyacentes.</td><td>Para aprender ECS o ejecutar servicios sin mantener instancias, sistemas operativos y capacidad de clúster.</td></tr>
    <tr><td>ECS con EC2</td><td>Además de ECS, eliges, actualizas y escalas las instancias que aportan capacidad al clúster.</td><td>Cuando necesitas controlar el tipo de instancia, el sistema operativo o cómo se comparte capacidad entre tareas.</td></tr>
  </tbody>
</table>

<p>Fargate no aumenta tareas por sí solo. El servicio mantiene el número que configures; para ajustarlo automáticamente debes configurar el escalado de servicios. Con EC2 también debes tener capacidad suficiente en las instancias para ubicar las tareas. ECS Managed Instances es otra opción: AWS aprovisiona, actualiza y escala las instancias EC2, con un cargo de administración adicional. <a href="https://docs.aws.amazon.com/es_es/AmazonECS/latest/developerguide/ecs_services.html" target="_blank" rel="noopener noreferrer">La guía de servicios de ECS</a> explica el recuento deseado, el escalado y el balanceo de carga.</p>

<p>Amazon EKS es el servicio administrado de AWS para Kubernetes. ECS usa el modelo propio de tareas y servicios de AWS; elige EKS cuando necesitas Kubernetes y sus herramientas o APIs. Fargate puede proporcionar capacidad para ECS y EKS.</p>

<h2>Qué necesitas antes de ejecutar una tarea</h2>

<ul>
  <li>Una cuenta de AWS y una identidad con permisos para crear recursos de ECS y usar la VPC elegida. Evita credenciales de acceso con permisos amplios; usa el método de inicio de sesión aprobado para tu cuenta.</li>
  <li>Una definición de tarea compatible con la capacidad elegida. Para Fargate, declara el modo de red <code>awsvpc</code> y valores compatibles de CPU y memoria.</li>
  <li>Una VPC, subred y grupo de seguridad. Fargate asigna una interfaz de red a cada tarea. Para descargar una imagen pública desde una subred pública, esa interfaz necesita una IP pública y una ruta de salida a Internet; en una subred privada necesitas NAT o los endpoints de VPC que correspondan.</li>
  <li>Un rol de ejecución para acciones del agente de ECS, como descargar una imagen privada de ECR, enviar logs a CloudWatch Logs o leer secretos. Un rol de tarea es para los permisos que necesita el código dentro del contenedor, por ejemplo, leer una tabla de DynamoDB.</li>
</ul>

<p>Fargate no exige dos subredes públicas. La red depende de cómo quieras recibir y enviar tráfico. Para una aplicación web de producción, lo habitual es mantener las tareas en subredes privadas y exponer un Application Load Balancer en subredes públicas. Para un ejercicio, también puedes usar una tarea con IP pública y limitar el grupo de seguridad al puerto de la aplicación y a tu IP de origen; no abras SSH (puerto 22) para este ejemplo. <a href="https://docs.aws.amazon.com/es_es/AmazonECS/latest/developerguide/fargate-tasks-services.html" target="_blank" rel="noopener noreferrer">AWS detalla la red que requieren las tareas Fargate</a>.</p>

<h2>Ejemplo mínimo: un servicio web en Fargate</h2>

<p>Antes de ejecutar los comandos, prepara una subred pública con ruta a Internet y un grupo de seguridad que permita TCP 80 solo desde tu dirección de prueba. El servicio mantendrá una tarea Fargate con una IP pública; Fargate factura desde que empieza la descarga de la imagen y la IP pública puede generar cargos adicionales. Este ejemplo crea recursos cuando ejecutas los comandos; no los ejecutes si no quieres aprovisionarlos.</p>

<p>El ejemplo registra una definición basada en la imagen pública de Apache HTTP Server que AWS usa en su tutorial de Fargate. El servicio mantendrá una tarea que escucha en el puerto 80. Primero guarda este JSON como <code>ecs-intro.json</code>:</p>

<pre><code class="language-json">{
  "family": "ecs-intro",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "web",
      "image": "public.ecr.aws/docker/library/httpd:latest",
      "essential": true,
      "portMappings": [
        { "containerPort": 80, "protocol": "tcp" }
      ]
    }
  ]
}</code></pre>

<p>Con el perfil de AWS CLI ya configurado y una subred pública con ruta a Internet, registra el clúster y la definición:</p>

<pre><code class="language-bash">aws ecs create-cluster --cluster-name ecs-intro
aws ecs register-task-definition --cli-input-json file://ecs-intro.json</code></pre>

<p>Luego crea el servicio, reemplazando los identificadores de ejemplo por una subred y un grupo de seguridad de tu VPC:</p>

<pre><code class="language-bash">aws ecs create-service \
  --cluster ecs-intro \
  --service-name web \
  --task-definition ecs-intro \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-REEMPLAZAR],securityGroups=[sg-REEMPLAZAR],assignPublicIp=ENABLED}"</code></pre>

<p>Al indicar solo la familia <code>ecs-intro</code>, ECS usa su revisión activa más reciente. Si necesitas fijar una revisión concreta, utiliza la que devolvió <code>register-task-definition</code>; consulta los <a href="https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service_definition_parameters.html" target="_blank" rel="noopener noreferrer">parámetros de definición de servicios</a>.</p>

<p>En la consola de ECS, comprueba que el servicio alcance su estado estable y que la tarea esté <code>RUNNING</code>. Revisa los detalles de red de la tarea para encontrar su IP pública y abre esa dirección en el navegador.</p>

<p>El ejemplo sirve para entender el ciclo básico, no para publicar una aplicación real: usa una sola tarea, no crea un balanceador HTTPS y deja la tarea funcionando. Al terminar, reduce el servicio a cero y comprueba que no queden tareas en ejecución ni pendientes:</p>

<pre><code class="language-bash">aws ecs update-service \
  --cluster ecs-intro \
  --service web \
  --desired-count 0

aws ecs describe-services \
  --cluster ecs-intro \
  --services web \
  --query "services[0].{deseadas:desiredCount,activas:runningCount,pendientes:pendingCount}"

aws ecs list-tasks \
  --cluster ecs-intro \
  --service-name web \
  --desired-status STOPPED</code></pre>

<p>Confirma que <code>activas</code> y <code>pendientes</code> sean cero. La última consulta muestra las tareas detenidas recientes del servicio. Luego, elimina el servicio y el clúster si ya no los necesitas; revisa también los recursos de red, balanceadores, logs y registros de imágenes que hayas creado.</p>

<p>Para desplegar tu propia aplicación, construye y prueba su imagen, súbela a Amazon ECR y reemplaza la imagen pública del ejemplo por la ruta del repositorio. Si el contenedor lee o escribe en otro servicio AWS, asocia un rol de tarea con permisos mínimos para esos recursos. El rol de ejecución y el rol de tarea resuelven necesidades distintas, como explica la <a href="https://docs.aws.amazon.com/es_es/AmazonECS/latest/developerguide/security-iam-roles.html" target="_blank" rel="noopener noreferrer">guía de roles de IAM para ECS</a>.</p>

<h2>Comprobaciones de salud y errores frecuentes</h2>

<p>Una comprobación de salud del contenedor ejecuta un comando dentro de la imagen. Debes declarar ese comando en la definición de tarea para que ECS lo supervise; no basta con que exista una comprobación en la imagen Docker. Un balanceador puede tener además su propia comprobación HTTP o HTTPS hacia el puerto y la ruta de la aplicación. Si ECS reemplaza tareas repetidamente, compara ambas comprobaciones, el puerto del contenedor y las reglas del grupo de seguridad. Consulta <a href="https://docs.aws.amazon.com/es_es/AmazonECS/latest/developerguide/healthcheck.html" target="_blank" rel="noopener noreferrer">cómo determina ECS la salud de una tarea</a>.</p>

<ul>
  <li><strong>La tarea no arranca o queda pendiente:</strong> revisa los eventos del servicio y la razón de detención. En EC2, confirma que las instancias tengan CPU y memoria disponibles; en cualquier modalidad, verifica la subred, el grupo de seguridad y la capacidad seleccionada.</li>
  <li><strong>No puede descargar la imagen:</strong> confirma el nombre y la etiqueta de la imagen, los permisos del rol de ejecución si está en un repositorio privado y la ruta de salida a ECR o al registro elegido.</li>
  <li><strong>El contenedor inicia y luego se detiene:</strong> revisa el código de salida, el comando de inicio y los logs de CloudWatch si configuraste el driver de logs.</li>
  <li><strong>La tarea está activa, pero no recibe tráfico:</strong> compara el puerto y la ruta del balanceador con los de la aplicación, y comprueba que el grupo de seguridad permita tráfico desde el balanceador.</li>
</ul>

<p>Empieza por los eventos del servicio; luego abre la tarea detenida y revisa su código de salida y mensaje de error. Los motivos como <code>CannotPullContainerError</code> o <code>ResourceInitializationError</code> ayudan a acotar si el problema está en la imagen, los permisos o el acceso de red. <a href="https://docs.aws.amazon.com/es_es/AmazonECS/latest/developerguide/stopped-task-error-codes.html" target="_blank" rel="noopener noreferrer">La referencia oficial de errores de tareas detenidas</a> reúne los códigos y su diagnóstico.</p>

<h2>Cuánto cuesta Amazon ECS</h2>

<p>El costo depende de la capacidad y de los demás recursos que utilice tu aplicación. Para Fargate, AWS cobra por CPU y memoria solicitadas desde que empieza la descarga de la imagen hasta que se detiene la tarea; para Linux hay un mínimo de un minuto. En EC2 pagas las instancias, volúmenes y otros recursos que mantengas. La orquestación de ECS no tiene un cargo separado para las modalidades comunes de Fargate y EC2, pero ECS Managed Instances sí añade una tarifa de administración. Un balanceador, NAT Gateway, almacenamiento, logs, IP pública y transferencia de datos también pueden generar cargos. Las tarifas varían según región y configuración: <a href="https://aws.amazon.com/ecs/pricing/" target="_blank" rel="noopener noreferrer">consulta los precios actuales de Amazon ECS</a> antes de desplegar.</p>

<p>Para una tarea que forma parte de un proceso con varios pasos, AWS Step Functions puede iniciar una tarea ECS y esperar a que termine. La <a href="https://docs.aws.amazon.com/step-functions/latest/dg/connect-ecs.html" target="_blank" rel="noopener noreferrer">integración oficial de Step Functions con ECS</a> muestra ese patrón; como siguiente lectura, consulta <a href="https://dondeaprendoaws.com/blog/comprendiendo-aws-step-functions/">AWS Step Functions: qué es y cómo elegir Standard o Express</a>.</p>

<h2>Recursos en español y comunidades para seguir aprendiendo</h2>

<p>Para familiarizarte con ECS a través de grabaciones de comunidades AWS, puedes empezar por <a href="https://www.youtube.com/watch?v=vZk7uVwFMQA" target="_blank" rel="noopener noreferrer">“Containers en AWS: Construyendo el ecosistema de contenedores en ECS”</a>, publicada por AWS User Group Ecuador. Para ver un caso de aplicación, <a href="https://www.youtube.com/watch?v=Ivtza36jJxA" target="_blank" rel="noopener noreferrer">“Amazon ECS con Flask, Fargate y DynamoDB”</a> es una grabación de Rossana Suárez sobre ese despliegue.</p>

<p>Si ya conoces lo básico, el repositorio <a href="https://github.com/roxsross/roxs-aws-ecs-demo" target="_blank" rel="noopener noreferrer">Demo ECS Fargate con Flask y DynamoDB</a> incluye una aplicación de ejemplo con Terraform y una opción local con Docker Compose. El laboratorio <a href="https://github.com/roxsross/aws-ecs-canary-in-action" target="_blank" rel="noopener noreferrer">ECS Canary in Action</a> aborda despliegues canary y reversión en ECS; tiene una modalidad local con Docker y otra que aprovisiona en AWS un balanceador, recursos de ECS, ECR, DynamoDB, CloudWatch y roles de IAM. La modalidad local no usa una cuenta AWS; si ejecutas la modalidad en AWS, revisa los cargos y destruye los recursos al finalizar.</p>

<p>También puedes aprender con otras personas y consultar agendas actualizadas. <a href="https://www.awsugecuador.com/" target="_blank" rel="noopener noreferrer">AWS User Group Ecuador</a> organiza meetups y talleres sobre varios temas de AWS; publica sus próximas fechas en Meetup. <a href="https://awswomencolombia.com/page/eventos" target="_blank" rel="noopener noreferrer">AWS Women Colombia</a> comparte grabaciones de su comunidad y enlaza sus encuentros próximos. Si estudias en Córdoba, revisa la agenda del <a href="https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/" target="_blank" rel="noopener noreferrer">AWS Student Builder Group de la UTN</a>. Los temas, fechas, modalidad, cupos y condiciones de inscripción dependen de cada actividad: consulta la ficha vigente antes de planificar.</p>
