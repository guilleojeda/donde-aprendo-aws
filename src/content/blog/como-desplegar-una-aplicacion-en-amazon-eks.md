---
title: "Cómo Desplegar una Aplicación en Amazon EKS"
description: "Aprende cómo desplegar una aplicación en Amazon EKS paso a paso. Descubre los conceptos básicos de Kubernetes y Amazon EKS, requisitos previos, creación de clúster EKS, despliegue de aplicaciones, gestión del tráfico, escalado y más."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:18:48.675Z"
cover: "/assets/blog/b0397a49b6dcdda375e046d4.jpg"
coverAlt: "Thumbnail for: Cómo Desplegar una Aplicación en Amazon EKS"
ogImage: "/assets/blog/b0397a49b6dcdda375e046d4.jpg"
related:
  - title: "Diferencias: Endpoint de interfaz vs. Endpoint de gateway"
    url: "https://dondeaprendoaws.com/blog/diferencias-endpoint-de-interfaz-vs-endpoint-de-gateway/"
    image: "/assets/blog/3565dcd644c1d6c694694985.jpg"
    imageAlt: ""
  - title: "Diferencias Entre SLA y SLO en AWS"
    url: "https://dondeaprendoaws.com/blog/diferencias-entre-sla-y-slo-en-aws/"
    image: "/assets/blog/8281401d50eb83da06a511af.jpg"
    imageAlt: ""
  - title: "Servicios de AWS para Frontend"
    url: "https://dondeaprendoaws.com/blog/servicios-de-aws-para-frontend/"
    image: "/assets/blog/31bdf1ca2f3b6c51213246c8.jpg"
    imageAlt: ""
---

<p>Si estás buscando cómo desplegar una aplicación en Amazon EKS, has llegado al lugar indicado. Este artículo te guiará paso a paso para que logres poner en marcha tu aplicación usando Kubernetes en la nube de Amazon. Aquí encontrarás todo lo que necesitas saber, desde los conceptos básicos de Kubernetes y Amazon EKS, hasta cómo crear un clúster de EKS y desplegar tu aplicación. A continuación, te resumo los puntos clave:</p>
<ul><li><strong>Amazon EKS</strong> te permite manejar aplicaciones en contenedores de manera eficiente.</li><li><a href="https://aws.amazon.com/es/kubernetes/"><strong>Kubernetes</strong></a> facilita la organización y escalabilidad de tus aplicaciones.</li><li>Necesitarás una cuenta de AWS, AWS CLI, <a href="https://kubernetes.io/docs/tasks/tools/install-kubectl/">kubectl</a>, y <a href="https://eksctl.io/">eksctl</a> para empezar.</li><li><strong>Crear un clúster de EKS</strong> es el primer paso práctico.</li><li><strong>Desplegar tu aplicación</strong> implica definir archivos de configuración y aplicarlos en el clúster.</li><li><strong>Gestionar el tráfico</strong> y <strong>escalar</strong> tu aplicación son aspectos avanzados que puedes explorar.</li></ul>
<p>Este guía está diseñada para ser directa y fácil de seguir, asegurando que puedas tener tu aplicación corriendo en Amazon EKS sin complicaciones.</p>
<h3 id="%C2%BFpor-qu%C3%A9-usar-amazon-eks%3F">¿Por qué usar <a href="https://images-na.ssl-images-amazon.com/images/g/01/lwa/dev/docs/website-developer-guide._tth_.pdf">Amazon</a> EKS?</h3>
<p>Usar Amazon EKS tiene sus ventajas:</p>
<ul><li><strong>F</strong>á<strong>cil de agrandar o achicar</strong>: Si tu aplicación necesita atender a más o menos usuarios, EKS te lo pone fácil.</li><li><strong>Siempre disponible</strong>: Trabaja para que tu aplicación casi nunca esté fuera de línea.</li><li><strong>Funciona bien con Amazon</strong>: Te permite usar otros servicios de Amazon que pueden hacer tu vida más fácil.</li><li><strong>Amazon te ayuda</strong>: Se encargan de las actualizaciones y de mantener todo funcionando bien.</li><li><strong>Hecho para contenedores</strong>: Es perfecto si tu aplicación usa contenedores para funcionar de manera más eficiente.</li></ul>
<p>En pocas palabras, EKS te ayuda a que tu aplicación funcione en Kubernetes de manera sencilla, eficiente y con el apoyo de Amazon.</p>
<h2 id="conceptos-b%C3%A1sicos-de-kubernetes-y-amazon-eks">Conceptos básicos de <a href="https://ifgeekthen.everis.com/es/kubernetes">Kubernetes</a> y <a href="https://aws.amazon.com/eks/">Amazon EKS</a></h2>
<p><img alt="Kubernetes" src="/assets/blog/24e751b0e63097b51e12a224.jpg"/></p>
<p>Kubernetes es como un sistema que ayuda a que las aplicaciones hechas de contenedores (como los creados con Docker) funcionen bien, crezcan cuando más gente las usa y se mantengan organizadas sin que tú tengas que hacer mucho. Amazon Elastic Kubernetes Service (EKS) es un servicio que ofrece Amazon para que usar Kubernetes sea más fácil y esté todo en la nube.</p>
<p>Veamos algunos conceptos importantes para entender cómo funciona todo esto:</p>
<h3 id="cl%C3%BAster">Clúster</h3>
<p>Un clúster de Kubernetes es como un equipo de computadoras (nodos) que trabajan juntas para mantener tus aplicaciones corriendo. Este equipo se encarga de todo el trabajo pesado, desde hacer que las aplicaciones estén disponibles hasta asegurarse de que funcionen bien.</p>
<p>En EKS, Amazon se ocupa de la parte más complicada, como asegurarse de que el sistema de Kubernetes esté siempre listo y funcionando.</p>
<h3 id="nodos">Nodos</h3>
<p>Los nodos son como las computadoras individuales en este equipo, donde realmente se ejecutan tus aplicaciones en contenedores Docker. Son los que hacen el trabajo día a día.</p>
<p>Con EKS, puedes elegir si quieres que Amazon se encargue de estos nodos por ti o si prefieres manejarlos tú mismo.</p>
<h3 id="pods">Pods</h3>
<p>Un pod es como un paquete pequeño que contiene uno o más contenedores Docker que deben trabajar juntos. Se ejecutan en los nodos y cada uno tiene su propia dirección IP y recursos.</p>
<p>Los pods ayudan a que los contenedores no tengan problemas entre ellos, manteniéndolos organizados y funcionando bien juntos.</p>
<h3 id="servicios">Servicios</h3>
<p>Un servicio es una forma de decirle a Kubernetes cómo quieres que las personas o sistemas externos se comuniquen con tus aplicaciones en los pods. Es como darle una dirección fija a tus aplicaciones, así no importa dónde estén realmente ejecutándose, siempre se pueden encontrar.</p>
<p>Esto hace más fácil el trabajo de conectar diferentes partes de tu aplicación o permitir que los usuarios accedan a ella desde cualquier lugar.</p>
<h2 id="requisitos-previos">Requisitos previos</h2>
<h3 id="cuenta-de-aws">Cuenta de AWS</h3>
<p>Antes de empezar a desplegar tu aplicación en Amazon EKS, necesitas tener una cuenta en AWS. Si no tienes una, puedes crear una cuenta gratis que te permite usar ciertos servicios de AWS sin costo durante el primer año.</p>
<h3 id="aws-cli"><a href="https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html">AWS CLI</a></h3>
<p><img alt="AWS CLI" src="/assets/blog/6c19e0dd3c1cd485566e0d8d.jpg"/></p>
<p>La AWS CLI es una herramienta que te permite hablar con los servicios de AWS usando la terminal de tu computadora. Es importante tenerla instalada y lista con tus datos de acceso a AWS.</p>
<h3 id="kubectl"><a href="https://kubernetes.io/docs/tasks/tools/install-kubectl/">kubectl</a></h3>
<p><img alt="kubectl" src="/assets/blog/d8ddb5305e6f91903b343c2c.jpg"/></p>
<p>kubectl es una herramienta esencial para trabajar con clústers de Kubernetes. Te ayuda a lanzar aplicaciones, revisar cómo van, ver registros de actividad, entre otras cosas. Debes tener kubectl instalada y configurada para que pueda comunicarse con tu clúster de EKS.</p>
<h3 id="eksctl"><a href="https://eksctl.io/">eksctl</a></h3>
<p><img alt="eksctl" src="/assets/blog/cde11b7c19ca616e625405fa.jpg"/></p>
<p>eksctl es una herramienta creada por AWS que hace mucho más fácil crear y manejar clústers de EKS. Si vas a desplegar tu aplicación pero aún no tienes un clúster, te recomendamos usar eksctl para armar uno con un comando sencillo.</p>
<h2 id="paso-1---preparar-aws-cli-y-eksctl">Paso 1 - Preparar <a href="https://docs.aws.amazon.com/cli/latest/userguide/installing.html">AWS CLI</a> y eksctl</h2>
<p><img alt="AWS CLI" src="/assets/blog/a78e890bb8564194e0ff5561.jpg"/></p>
<h3 id="configurar-aws-cli">Configurar AWS CLI</h3>
<p>Para empezar con AWS CLI, haz lo siguiente:</p>
<ul><li>Si no tienes AWS CLI en tu computadora, instálalo. Puedes encontrar cómo hacerlo en la <a href="https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html">página oficial de instrucciones</a>.</li><li>Cuando lo tengas, abre la terminal y escribe <code>aws configure</code>. Te pedirá algunos datos:</li><li>Tu ID de clave de acceso de AWS (algo así como un nombre de usuario)</li><li>Tu clave secreta de acceso (como una contraseña)</li><li>La región de AWS que vas a usar (por ejemplo, us-east-1)</li><li>El formato en que quieres que AWS te muestre la información (puede ser json, texto o tabla)</li><li>Para asegurarte de que todo está bien configurado, prueba con el comando <code>aws sts get-caller-identity</code>. Si ves información sobre tu cuenta de AWS, significa que todo está correcto.</li></ul>
<p>Con estos pasos, ya podrás usar AWS CLI para manejar los servicios de AWS desde tu computadora.</p>
<h3 id="instalar-eksctl">Instalar eksctl</h3>
<p>Para instalar eksctl:</p>
<ul><li>Ve a la <a href="https://github.com/weaveworks/eksctl/releases">página donde están las versiones de eksctl</a> y descarga la que corresponda a tu sistema operativo.</li><li>Saca el archivo que descargaste en una carpeta que tu computadora reconozca para ejecutar programas.</li><li>Para verificar que se instaló bien, escribe <code>eksctl version</code> en la terminal.</li></ul>
<p>Listo, con eksctl instalado y AWS CLI listo, puedes empezar a trabajar en desplegar tu aplicación en Amazon EKS.</p>
<h2 id="paso-2---crear-un-cl%C3%BAster-eks">Paso 2 - Crear un clúster EKS</h2>
<p>Para crear un clúster en Amazon EKS, vamos a seguir unos pasos sencillos con la ayuda de una herramienta llamada eksctl:</p>
<h3 id="definir-configuraci%C3%B3n-del-cl%C3%BAster">Definir configuración del clúster</h3>
<p>Primero, vamos a decidir cómo queremos que sea nuestro clúster EKS. Esto incluye cosas como:</p>
<ul><li>Qué versión de Kubernetes queremos usar (es buena idea usar la más reciente)</li><li>Qué tipo y tamaño de máquinas (instancias EC2) queremos para los nodos</li><li>Cuántos nodos queremos en total</li><li>En qué región y zonas de AWS queremos que esté</li></ul>
<p>Por ejemplo:</p>
<pre><code>eksctl create cluster \
  --version 1.21 \
  --node-type t3.medium \
  --nodes 3 \
  --region us-east-1 \
  --zones us-east-1a,us-east-1b
</code></pre>
<p>Con esto le estamos diciendo que queremos un clúster con:</p>
<ul><li>Kubernetes versión 1.21</li><li>Nodos tipo t3.medium (que tienen 2 vCPU y 4GB de RAM)</li><li>Un total de 3 nodos</li><li>Que esté en la región us-east-1 de AWS y en las zonas us-east-1a y us-east-1b</li></ul>
<h3 id="lanzar-cl%C3%BAster-eks">Lanzar clúster EKS</h3>
<p>Una vez que sabemos cómo queremos nuestro clúster, usamos eksctl para crearlo:</p>
<pre><code>eksctl create cluster -f cluster.yaml
</code></pre>
<p>Aquí, <code>cluster.yaml</code> es un archivo donde escribimos los detalles que decidimos antes.</p>
<p>Usando este comando, eksctl automáticamente se encarga de:</p>
<ul><li>Crear el clúster</li><li>Preparar las máquinas EC2</li><li>Ajustar la red y la seguridad</li><li>Instalar lo necesario</li></ul>
<p>En unos minutos, nuestro clúster estará listo.</p>
<h3 id="verificar-creaci%C3%B3n-del-cl%C3%BAster">Verificar creación del clúster</h3>
<p>Para asegurarnos de que nuestro clúster está funcionando, podemos usar:</p>
<pre><code>kubectl get nodes
</code></pre>
<p>Esto nos muestra los nodos que están funcionando y en qué estado están. Deberíamos ver los nodos que pedimos, listos para trabajar.</p>
<p>También podemos ver más detalles del clúster con:</p>
<pre><code>kubectl cluster-info
</code></pre>
<p>Con estos comandos podemos confirmar que nuestro clúster de EKS está preparado para nuestras aplicaciones.</p>
<h2 id="paso-3---c%C3%B3mo-desplegar-tu-aplicaci%C3%B3n-de-ejemplo">Paso 3 - Cómo Desplegar tu Aplicación de Ejemplo</h2>
<h3 id="definir-los-archivos-de-configuraci%C3%B3n">Definir los archivos de configuración</h3>
<p>Para poner tu aplicación a funcionar en nuestro clúster de EKS, necesitamos preparar unos archivos en formato YAML. Estos archivos son como las instrucciones que le dicen a Kubernetes qué hacer, cómo arrancar tu aplicación y cómo hacerla accesible.</p>
<p>Hablando de manera simple, necesitarás dos tipos de archivos:</p>
<ul><li>Uno para decir cómo debe correr tu aplicación, cuántas copias quieres que haya y qué recursos necesita. Esto se llama un archivo de implementación.</li><li>Otro para decir cómo la gente puede acceder a tu aplicación desde fuera. Esto se llama un archivo de <a href="https://kubernetes.io/docs/concepts/services-networking/service/">servicio</a>.</li></ul>
<p>Aquí te dejo un ejemplo de cómo se ve un archivo de implementación para Nginx:</p>
<pre><code>apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.14.2
        ports:
        - containerPort: 80
</code></pre>
<p>Y así se ve un archivo de servicio:</p>
<pre><code>apiVersion: v1
kind: Service
metadata:
  name: nginx-service
spec:
  selector:
    app: nginx
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
</code></pre>
<p>Con estos archivos, básicamente estamos poniendo a correr Nginx en nuestro clúster, con 3 copias y abriendo el puerto 80 para que se pueda acceder.</p>
<h3 id="aplicar-los-archivos-en-el-cl%C3%BAster">Aplicar los archivos en el clúster</h3>
<p>Una vez que tienes tus archivos listos, es momento de ponerlos a trabajar. Para esto, usamos un comando que se llama <code>kubectl apply</code>:</p>
<pre><code>kubectl apply -f nginx-deployment.yaml
kubectl apply -f nginx-service.yaml
</code></pre>
<p>Esto le dice a Kubernetes que tome los archivos y cree todo lo que le pedimos: las copias de la aplicación, cómo acceder a ella, etc.</p>
<h3 id="chequear-que-todo-est%C3%A9-funcionando">Chequear que todo esté funcionando</h3>
<p>Para estar seguros de que todo va bien, podemos usar unos comandos para ver cómo están corriendo las cosas:</p>
<pre><code>kubectl get pods
kubectl get services
kubectl logs &lt;nombre_del_pod&gt;
curl http://&lt;endpoint_del_clúster&gt;
</code></pre>
<p>Con esto, podemos ver si nuestra aplicación está corriendo, si el servicio está disponible, qué dicen los registros de la aplicación y probar si podemos acceder a ella desde el navegador.</p>
<p>También podemos usar AWS CLI para revisar que todo esté configurado como debe en la nube.</p>
<p>Así nos aseguramos de que nuestra aplicación está lista y funcionando para los usuarios.</p>
<h2 id="pasos-siguientes">Pasos siguientes</h2>
<p>Aquí encontrarás más información sobre cómo sacarle más provecho a Amazon EKS con temas un poco más avanzados.</p>
<h3 id="escalado-autom%C3%A1tico">Escalado automático</h3>
<p>El <a href="https://docs.aws.amazon.com/es_es/eks/latest/userguide/cluster-autoscaler.html">escalado automático</a> es una manera de hacer que tu clúster de EKS se ajuste solo, según cuánto se necesite. Imagina que puedes hacer que tu clúster crezca o se encoja automáticamente si ve que tus aplicaciones necesitan más o menos recursos. Esto ayuda a que tu aplicación siempre funcione bien, sin gastar de más en recursos que no se están usando.</p>
<h3 id="ci%2Fcd">CI/CD</h3>
<p>EKS también se puede conectar con sistemas de CI/CD, que son herramientas para automatizar los pasos de construir, probar y desplegar tu aplicación. Esto significa que cada vez que cambies algo en tu código, se puede configurar para que automáticamente se cree una nueva versión de tu aplicación, se pruebe y luego se ponga a funcionar en el clúster. Esto hace que mantener y actualizar tu aplicación sea más rápido y menos propenso a errores.</p>
<h2 id="limpieza">Limpieza</h2>
<h3 id="eliminar-cl%C3%BAster">Eliminar clúster</h3>
<p>Para quitar el clúster EKS que armamos, usamos otra vez eksctl:</p>
<pre><code>eksctl delete cluster --name mi-cluster
</code></pre>
<p>Este comando hace que eksctl elimine todo lo que se creó para el clúster, como:</p>
<ul><li>Los servidores EC2</li><li>Las protecciones de seguridad</li><li>Las áreas de red</li><li>El clúster EKS en sí</li></ul>
<p>Así nos aseguramos de no tener gastos extra por un clúster que ya no vamos a usar.</p>
<h3 id="verificar-eliminaci%C3%B3n">Verificar eliminación</h3>
<p>Luego de borrar el clúster, podemos chequear que realmente se haya ido con algunos comandos:</p>
<pre><code>aws eks list-clusters
aws ec2 describe-instances
</code></pre>
<p>El primero debería mostrar que el clúster ya no está en EKS. El segundo no debería mostrar nada si los servidores EC2 asociados fueron eliminados correctamente.</p>
<p>También podemos intentar:</p>
<pre><code>eksctl get cluster --region &lt;region&gt;
</code></pre>
<p>Para confirmar en la región específica que nuestro clúster ya no aparece.</p>
<p>Con estos pasos, podemos estar tranquilos de que el clúster se eliminó por completo y que no habrá más cargos en nuestra cuenta de AWS por esos recursos.</p>
<h2 id="conclusi%C3%B3n">Conclusión</h2>
<h3 id="recapitulaci%C3%B3n">Recapitulación</h3>
<ul><li>Aprendimos lo básico sobre Kubernetes y <a href="https://aws.amazon.com/eks/">Amazon EKS</a>, como qué son los clústeres, nodos, pods y servicios.</li><li>Preparamos las herramientas que necesitamos: AWS CLI, kubectl y eksctl.</li><li>Creamos un clúster de EKS con la ayuda de eksctl.</li><li>Pusimos a correr una aplicación de ejemplo usando archivos YAML.</li><li>Chequeamos que la aplicación estuviera trabajando correctamente.</li><li>Borramos el clúster de EKS que habíamos creado.</li></ul>
<h3 id="pr%C3%B3ximos-pasos">Próximos pasos</h3>
<p>Aquí hay algunas ideas de lo que puedes hacer después:</p>
<ul><li>Aprender a conectar tu proyecto con herramientas de CI/CD para que los despliegues se hagan solos.</li><li>Activar el escalado automático para que tu aplicación se ajuste sola según la demanda.</li><li>Mover aplicaciones que ya tienes a Amazon EKS.</li><li>Buscar cómo hacer que tu proyecto cueste menos y funcione mejor.</li><li>Añadir formas de ver qué está pasando con tu aplicación y solucionar problemas.</li><li>Asegurarte de que solo las personas correctas puedan acceder a tu proyecto.</li></ul>
<p>Con lo que vimos hoy, ya tienes un buen punto de partida para empezar a usar Kubernetes con Amazon EKS.</p>
<h2 id="preguntas-relacionadas">Preguntas relacionadas</h2>
<h3 id="%C2%BFc%C3%B3mo-desplegar-una-aplicaci%C3%B3n-en-aws%3F">¿Cómo desplegar una aplicación en AWS?</h3>
<p>Para desplegar una aplicación que usa contenedores en AWS, puedes seguir estos pasos básicos:</p>
<ul><li>Elige la imagen de Docker que quieras usar, como puede ser Nginx o Node.js.</li><li>Sube esa imagen a un lugar donde se guardan imágenes de contenedores, como Amazon ECR.</li><li>Crea un archivo llamado Dockerfile donde defines cómo debe correr tu aplicación.</li><li>Usa un servicio de AWS como Amazon ECS, Amazon EKS o AWS Fargate para ejecutar tu aplicación.</li><li>Para manejar mejor el tráfico que llega a tu aplicación, puedes usar un balanceador de carga como Application Load Balancer.</li><li>Si necesitas que tu aplicación crezca o se reduzca según la demanda, configura servicios de auto-scaling.</li><li>Para mantener todo bajo control, usa CloudWatch para ver los logs y métricas de tu aplicación.</li></ul>
<h3 id="%C2%BFqu%C3%A9-es-amazon-eks%3F">¿Qué es Amazon EKS?</h3>
<p>Amazon EKS es un servicio que te permite usar Kubernetes, una herramienta para manejar aplicaciones en contenedores, de manera fácil en AWS. Con EKS, puedes hacer que tus aplicaciones sean más fiables y escalables sin tener que preocuparte por los detalles técnicos de Kubernetes.</p>
<h3 id="%C2%BFqu%C3%A9-servicio-se-utiliza-para-ejecutar-aplicaciones-en-contenedores-en-aws%3F">¿Qué servicio se utiliza para ejecutar aplicaciones en contenedores en AWS?</h3>
<p>Para correr aplicaciones en contenedores en AWS, el servicio principal es Amazon Elastic Container Service (Amazon ECS). ECS te ayuda a manejar tus contenedores, permitiéndote iniciar, detener y escalarlos fácilmente. AWS Fargate es otra opción que permite correr contenedores sin tener que gestionar servidores.</p>
<h3 id="%C2%BFqu%C3%A9-es-ingress-en-aws%3F">¿Qué es Ingress en AWS?</h3>
<p>Ingress es una manera de hacer que las aplicaciones que corren en Kubernetes estén disponibles en internet de forma segura y eficiente. AWS tiene una herramienta llamada AWS Load Balancer Controller que ayuda a manejar los balanceadores de carga para el tráfico de Ingress, asegurando que tu aplicación sea fiable y pueda manejar bien el tráfico.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/opciones-para-desplegar-contenedores-en-aws-ecs-y-eks/">Opciones para Desplegar Contenedores en AWS: ECS y EKS</a></li><li><a href="https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/">Cómo Desplegar Contenedores en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-eks/">Mejores Prácticas Para Amazon EKS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ecs/">Mejores Prácticas Para Amazon ECS</a></li></ul>
