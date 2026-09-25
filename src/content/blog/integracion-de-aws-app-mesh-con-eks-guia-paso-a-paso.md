---
title: "Integración de AWS App Mesh con EKS: Guía paso a paso"
description: "Aprende a integrar AWS App Mesh con Amazon EKS para mejorar la comunicación entre microservicios, la disponibilidad y la seguridad de tus aplicaciones en la nube."
publishedAt: "2024-05-11"
publishedTimestamp: "2024-05-11T01:55:00.323Z"
cover: "/assets/blog/b6336599f042126db9b5d45c.png"
coverAlt: "Thumbnail for: Integración de AWS App Mesh con EKS: Guía paso a paso"
ogImage: "/assets/blog/b6336599f042126db9b5d45c.png"
related:
  - title: "10 Consejos de Redes para AWS Outposts"
    url: "https://dondeaprendoaws.com/blog/10-consejos-de-redes-para-aws-outposts/"
    image: "/assets/blog/d57b2c7f6d8d4785748ce1c5.png"
    imageAlt: ""
  - title: "Webinars y Eventos en AWS Marketplace"
    url: "https://dondeaprendoaws.com/blog/webinars-y-eventos-en-aws-marketplace/"
    image: "/assets/blog/8f2a908f4bdb73449da17e82.jpg"
    imageAlt: ""
  - title: "Mejores Prácticas Para Amazon EKS"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-eks/"
    image: "/assets/blog/5db43c07fa6733b870313471.jpg"
    imageAlt: ""
---

<p><a href="https://aws.amazon.com/app-mesh/">AWS App Mesh</a> es una malla de servicios que simplifica la comunicación entre microservicios en aplicaciones nativas de la nube. Esta guía detallada te mostrará cómo integrar App Mesh con <a href="https://aws.amazon.com/eks/">Amazon EKS</a> para crear aplicaciones escalables, seguras y fáciles de mantener en un entorno de contenedores.</p>
<h2 id="related-video-from-youtube">Related video from YouTube</h2>
<div><iframe allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" height="315" loading="lazy" src="https://www.youtube.com/embed/LEK5M2aDqN0" title="Video de YouTube" width="560"></iframe></div>
<h2 id="beneficios-clave">Beneficios Clave</h2>
<ul><li><strong>Comunicación simplificada</strong>: App Mesh facilita la comunicación entre microservicios, reduciendo la complejidad y mejorando la escalabilidad.</li><li><strong>Mayor disponibilidad</strong>: Monitorea el rendimiento y la disponibilidad de tus aplicaciones, permitiéndote identificar y solucionar problemas rápidamente.</li><li><strong>Seguridad reforzada</strong>: Proporciona una capa adicional de seguridad para proteger tus datos y aplicaciones.</li></ul>
<h2 id="pasos-principales">Pasos Principales</h2>
<ol><li><strong>Configurar permisos de IAM</strong>: Crea un rol de servicio vinculado a App Mesh y asigna los permisos necesarios.</li><li><strong>Instalar componentes de App Mesh</strong>: Instala el controlador de App Mesh, las definiciones de recursos personalizados (CRDs) y otros componentes en tu clúster de EKS.</li><li><strong>Crear y configurar el servicio de App Mesh</strong>: Crea la malla de servicio, nodos virtuales, routers y servicios para tus aplicaciones.</li><li><strong>Implementar aplicaciones con App Mesh</strong>: Despliega tus aplicaciones en el clúster de EKS utilizando App Mesh.</li><li><strong>Probar la integración</strong>: Verifica que tus aplicaciones funcionen correctamente con App Mesh.</li><li><strong>Monitorear recursos de App Mesh</strong>: Utiliza herramientas como <a href="https://prometheus.io/">Prometheus</a>, <a href="https://grafana.com/">Grafana</a> y <a href="https://aws.amazon.com/xray/">AWS X-Ray</a> para monitorear el rendimiento y la disponibilidad de tus servicios.</li><li><strong>Limpiar el entorno de prueba</strong>: Elimina los recursos de prueba para evitar conflictos futuros.</li></ol>
<p>Sigue esta guía paso a paso para aprovechar al máximo la <a href="https://dondeaprendoaws.com/blog/comprendiendo-kubernetes-y-amazon-eks/">integración de AWS App Mesh con EKS</a> y crear aplicaciones nativas de la nube escalables, seguras y de alto rendimiento.</p>
<h2 id="requisitos-para-la-configuraci%C3%B3n-de-app-mesh-y-eks">Requisitos para la configuración de App Mesh y EKS</h2>
<p>Antes de comenzar la integración, asegúrese de cumplir con los siguientes requisitos:</p>
<h3 id="cuenta-y-cl%C3%BAster-de-eks">Cuenta y clúster de EKS</h3>
<ul><li>Una cuenta de AWS</li><li>Un clúster de EKS configurado</li></ul>
<h3 id="herramientas-necesarias">Herramientas necesarias</h3>
<ul><li>La CLI de AWS configurada (versión 1.18.82 o superior)</li><li>kubectl instalado (versión 1.13 o superior)</li><li>jq instalado</li><li>aws-iam-authenticator instalado (requerido para <a href="https://eksctl.io/">eksctl</a>)</li><li><a href="https://helm.sh/">helm</a> instalado (versión 3.0 o superior)</li><li>eksctl instalado (versión 0.21.0 o superior)</li></ul>
<h3 id="regi%C3%B3n-de-aws">Región de AWS</h3>
<p>Asegúrese de operar en la región <code>us-west-2</code> para este walkthrough.</p>
<pre><code>export AWS_DEFAULT_REGION=us-west-2
</code></pre>
<p>Es importante cumplir con estos requisitos previos para garantizar una configuración exitosa de App Mesh con EKS.</p>
<h2 id="paso-1%3A-configuraci%C3%B3n-de-permisos-de-iam-para-app-mesh">Paso 1: Configuración de permisos de IAM para App Mesh</h2>
<p>Para configurar correctamente App Mesh con EKS, es necesario configurar los permisos de IAM adecuados. En este paso, crearemos un rol de servicio vinculado a App Mesh y asignaremos los permisos necesarios para que el clúster de EKS pueda interactuar con App Mesh.</p>
<p>Primero, debemos crear un rol de servicio vinculado a App Mesh. Puede hacerlo mediante la consola de IAM o utilizando la CLI de AWS. Si ha creado un mesh después del 5 de junio de 2019, App Mesh habrá creado el rol de servicio vinculado automáticamente. Sin embargo, si ha eliminado este rol y necesita crearlo nuevamente, puede seguir los mismos pasos para recrear el rol en su cuenta.</p>
<h3 id="crear-un-rol-de-servicio-vinculado-a-app-mesh">Crear un rol de servicio vinculado a App Mesh</h3>
<p>Puede crear un rol de servicio vinculado a App Mesh utilizando la CLI de AWS con el siguiente comando:</p>
<pre><code>aws iam create-service-linked-role --aws-service-name appmesh.amazonaws.com
</code></pre>
<h3 id="asignar-permisos-al-rol-de-servicio-vinculado">Asignar permisos al rol de servicio vinculado</h3>
<p>Una vez que haya creado el rol de servicio vinculado, debemos asignar los permisos necesarios para que el clúster de EKS pueda interactuar con App Mesh. Para hacerlo, agregaremos la política <code>AWSAppMeshFullAccess</code> al rol de servicio vinculado.</p>
<p>Puede asignar los permisos utilizando el siguiente comando:</p>
<pre><code>aws iam attach-role-policy --role-name &lt;role-name&gt; --policy-arn arn:aws:iam::aws:policy/AWSAppMeshFullAccess
</code></pre>
<p>Donde <code>&lt;role-name&gt;</code> es el nombre del rol de servicio vinculado que creó anteriormente.</p>
<p>Una vez que haya configurado los permisos de IAM adecuados, estará listo para instalar los componentes de App Mesh en su clúster de EKS.</p>
<h2 id="paso-2%3A-instalar-componentes-de-app-mesh">Paso 2: Instalar componentes de App Mesh</h2>
<p>Para instalar los componentes de App Mesh, seguimos los pasos descritos en la documentación oficial de AWS. Primero, debemos instalar el controlador de App Mesh para Kubernetes y las definiciones de recursos personalizados (CRDs) necesarias en nuestro clúster.</p>
<h3 id="componentes-de-app-mesh">Componentes de App Mesh</h3>
<p>Los componentes de App Mesh que se instalarán son:</p>
<table><thead><tr><th>Componente</th><th>Descripción</th></tr></thead><tbody><tr><td>Controlador de CRD</td><td>Se encarga de administrar las definiciones de recursos personalizados en nuestro clúster.</td></tr><tr><td>Controlador de admisión</td><td>Se encarga de admitir y rechazar solicitudes de entrada y salida en nuestro clúster.</td></tr><tr><td>Servicio de telemetría</td><td>Se encarga de recopilar y enviar métricas y registros de nuestro clúster.</td></tr><tr><td>Operador de entrega progresiva</td><td>Se encarga de implementar y administrar la entrega progresiva de aplicaciones en nuestro clúster.</td></tr></tbody></table>
<p>Para instalar los componentes de App Mesh, podemos ejecutar el siguiente comando:</p>
<pre><code>eksctl create iamserviceaccount --cluster &lt;cluster-name&gt; --namespace appmesh-system --name appmesh-controller --attach-policy-arn arn:aws:iam::aws:policy/AWSAppMeshFullAccess --override-existing-serviceaccounts --approve
</code></pre>
<p>Donde <code>&lt;cluster-name&gt;</code> es el nombre de nuestro clúster de EKS.</p>
<p>Una vez que hayamos instalado los componentes de App Mesh, podemos proceder a configurar el servicio de App Mesh para nuestro clúster de EKS.</p>
<h2 id="paso-3%3A-crear-y-configurar-el-servicio-de-app-mesh">Paso 3: Crear y configurar el servicio de App Mesh</h2>
<p>Ahora que hemos instalado los componentes de App Mesh, podemos crear y configurar el servicio de App Mesh para nuestro clúster de EKS. Para hacer esto, utilizaremos la CLI de AWS para crear la malla de servicio de App Mesh, junto con los nodos virtuales, routers y servicios necesarios para nuestras aplicaciones.</p>
<h3 id="crear-la-malla-de-servicio-de-app-mesh">Crear la malla de servicio de App Mesh</h3>
<p>Primero, creamos la malla de servicio de App Mesh con el siguiente comando:</p>
<pre><code>aws appmesh create-mesh --mesh-name my-mesh
</code></pre>
<p>Donde <code>my-mesh</code> es el nombre de nuestra malla de servicio de App Mesh.</p>
<h3 id="crear-nodos-virtuales%2C-routers-y-servicios">Crear nodos virtuales, routers y servicios</h3>
<p>A continuación, creamos un nodo virtual, un router virtual y un servicio con los siguientes comandos:</p>
<pre><code>aws appmesh create-virtual-node --mesh-name my-mesh --virtual-node-name my-node
aws appmesh create-virtual-router --mesh-name my-mesh --virtual-router-name my-router
aws appmesh create-service --mesh-name my-mesh --service-name my-service
</code></pre>
<p>Donde <code>my-node</code> es el nombre de nuestro nodo virtual, <code>my-router</code> es el nombre de nuestro router virtual y <code>my-service</code> es el nombre de nuestro servicio.</p>
<h3 id="configurar-la-ruta-del-tr%C3%A1fico">Configurar la ruta del tráfico</h3>
<p>Una vez que hemos creado todos los componentes de App Mesh, podemos proceder a configurar la ruta del tráfico para nuestro servicio.</p>
<p><strong>Recapitulación de los pasos</strong></p>
<table><thead><tr><th>Paso</th><th>Descripción</th></tr></thead><tbody><tr><td>1</td><td>Crear la malla de servicio de App Mesh</td></tr><tr><td>2</td><td>Crear nodos virtuales, routers y servicios</td></tr><tr><td>3</td><td>Configurar la ruta del tráfico</td></tr></tbody></table>
<p>Una vez que hayamos completado estos pasos, estaremos listos para implementar nuestras aplicaciones en nuestro clúster de EKS con App Mesh.</p>
<h2 id="paso-4%3A-implementar-aplicaciones-con-app-mesh">Paso 4: Implementar aplicaciones con App Mesh</h2>
<p>Ahora que hemos configurado el servicio de App Mesh, podemos implementar nuestras aplicaciones en nuestro clúster de EKS. Para hacer esto, debemos crear un archivo de configuración de Kubernetes que defina nuestros servicios y deployments.</p>
<h3 id="crear-un-archivo-de-configuraci%C3%B3n-de-kubernetes">Crear un archivo de configuración de <a href="https://en.wikipedia.org/wiki/Kubernetes">Kubernetes</a></h3>
<p><img alt="Kubernetes" src="/assets/blog/95f75593dcc7bc43413e1d9b.jpg"/></p>
<p>Primero, creamos un archivo de configuración de Kubernetes que defina nuestros servicios y deployments. Por ejemplo, podemos crear un archivo <code>deployment.yaml</code> con el siguiente contenido:</p>
<pre><code>apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-app
        image: my-app:latest
        ports:
        - containerPort: 80
</code></pre>
<p>Este archivo define un deployment llamado <code>my-app</code> que ejecuta tres réplicas del contenedor <code>my-app:latest</code> y expone el puerto 80.</p>
<h3 id="aplicar-la-configuraci%C3%B3n-de-kubernetes">Aplicar la configuración de Kubernetes</h3>
<p>Una vez que hemos creado el archivo de configuración de Kubernetes, podemos aplicar la configuración a nuestro clúster de EKS utilizando el comando <code>kubectl apply</code>:</p>
<pre><code>kubectl apply -f deployment.yaml
</code></pre>
<p>Este comando aplica la configuración definida en el archivo <code>deployment.yaml</code> a nuestro clúster de EKS.</p>
<h3 id="configurar-el-proxy-de-app-mesh">Configurar el proxy de App Mesh</h3>
<p>Finalmente, debemos configurar el proxy de App Mesh para que nuestros servicios se comuniquen entre sí. Para hacer esto, podemos crear un archivo de configuración de App Mesh que defina la ruta del tráfico para nuestro servicio. Por ejemplo, podemos crear un archivo <code>appmesh.yaml</code> con el siguiente contenido:</p>
<pre><code>apiVersion: appmesh.k8s.aws/v1beta2
kind: VirtualService
metadata:
  name: my-app
spec:
  aws:
    appMesh:
      meshName: my-mesh
  virtualRouter:
    name: my-router
</code></pre>
<p>Este archivo define un VirtualService llamado <code>my-app</code> que se comunica con el router virtual <code>my-router</code> en la malla de servicio <code>my-mesh</code>.</p>
<h3 id="conclusi%C3%B3n">Conclusión</h3>
<p>En este paso, hemos implementado nuestras aplicaciones en nuestro clúster de EKS utilizando App Mesh. Hemos creado un archivo de configuración de Kubernetes que define nuestros servicios y deployments, y hemos configurado el proxy de App Mesh para que nuestros servicios se comuniquen entre sí. En el próximo paso, probaremos nuestra aplicación para asegurarnos de que funcione correctamente.</p>
<h2 id="paso-5%3A-probar-la-aplicaci%C3%B3n-integrada">Paso 5: Probar la Aplicación Integrada</h2>
<p>Ahora que hemos configurado y desplegado nuestras aplicaciones con App Mesh, es hora de probar la integración para asegurarnos de que funcione correctamente. Para hacer esto, podemos utilizar la aplicación de ejemplo de color y un pod de curler del repositorio de aws-app-mesh-examples.</p>
<p>Primero, debemos clonar el repositorio de aws-app-mesh-examples y cambiar a la carpeta correspondiente:</p>
<pre><code>git clone https://github.com/aws/aws-app-mesh-examples.git
cd aws-app-mesh-examples/examples/colorapp
</code></pre>
<p>A continuación, podemos desplegar la aplicación de ejemplo de color utilizando el comando <code>kubectl apply</code>:</p>
<pre><code>kubectl apply -f colorapp.yaml
</code></pre>
<p>Una vez que la aplicación esté desplegada, podemos probar la integración utilizando un pod de curler. Primero, debemos crear un archivo de configuración de Kubernetes para el pod de curler:</p>
<pre><code>apiVersion: v1
kind: Pod
metadata:
  name: curler
spec:
  containers:
  - name: curler
    image: curlimages/curl:7.73.0
    command: ["/bin/sh", "-c"]
    args:
    - while true; do
        curl -s http://colorapp:8080/color;
        sleep 1;
      done
</code></pre>
<p>Luego, podemos desplegar el pod de curler utilizando el comando <code>kubectl apply</code>:</p>
<pre><code>kubectl apply -f curler.yaml
</code></pre>
<p>Una vez que el pod de curler esté desplegado, podemos verificar que la aplicación de ejemplo de color esté funcionando correctamente utilizando el comando <code>kubectl logs</code>:</p>
<pre><code>kubectl logs -f curler
</code></pre>
<p>Deberíamos ver una salida similar a la siguiente:</p>
<pre><code>Color es: azul
Color es: verde
Color es: rojo
</code></pre>
<p>Esto indica que la aplicación de ejemplo de color está funcionando correctamente y que el tráfico está siendo enrutado correctamente a través de App Mesh.</p>
<p><strong>Verificar el tráfico</strong></p>
<p>Para verificar que el tráfico esté siendo enrutado correctamente, podemos utilizar CloudWatch para observar el tráfico y verificar que la integración esté funcionando correctamente. Puede ver métricas como el número de solicitudes y la latencia promedio para cada servicio.</p>
<p><strong>Conclusión</strong></p>
<p>En este paso, hemos probado la integración de App Mesh con nuestra aplicación de ejemplo de color y hemos verificado que funcione correctamente. En el próximo paso, podemos monitorear los recursos de App Mesh para asegurarnos de que estén funcionando correctamente.</p>
<h2 id="paso-6%3A-monitorear-recursos-de-app-mesh">Paso 6: Monitorear Recursos de App Mesh</h2>
<p>Ahora que hemos desplegado nuestras aplicaciones con App Mesh, es hora de monitorear los recursos de App Mesh para asegurarnos de que estén funcionando correctamente. Para hacer esto, podemos utilizar herramientas como Prometheus, Grafana, <a href="https://www.jaegertracing.io/">Jaeger</a> y AWS X-Ray <a href="https://www.datadoghq.com/">Datadog</a> para instalar plugins de observabilidad y monitorear nuestros servicios de App Mesh.</p>
<h3 id="m%C3%A9tricas-y-registros">Métricas y Registros</h3>
<p>App Mesh proporciona métricas y registros detallados sobre el rendimiento y la disponibilidad de nuestros servicios. Podemos utilizar estas métricas y registros para identificar problemas de rendimiento, depurar errores y optimizar la configuración de nuestros servicios.</p>
<h3 id="integraci%C3%B3n-con-herramientas-de-observabilidad">Integración con Herramientas de Observabilidad</h3>
<p>App Mesh se integra con varias herramientas de observabilidad, como Prometheus, Grafana, Jaeger y AWS X-Ray Datadog. Estas herramientas nos permiten recopilar y analizar métricas y registros de nuestros servicios.</p>
<h3 id="monitoreo-de-tr%C3%A1fico">Monitoreo de Tráfico</h3>
<p>Podemos utilizar App Mesh para monitorear el tráfico entre nuestros servicios. Esto nos permite identificar problemas de rendimiento, depurar errores y optimizar la configuración de nuestros servicios.</p>
<h3 id="herramientas-de-observabilidad">Herramientas de Observabilidad</h3>
<table><thead><tr><th>Herramienta</th><th>Descripción</th></tr></thead><tbody><tr><td>Prometheus</td><td>Un sistema de monitoreo de código abierto que recopila métricas de nuestros servicios.</td></tr><tr><td>Grafana</td><td>Una plataforma de visualización de datos que nos permite crear paneles personalizados para monitorear nuestros servicios.</td></tr><tr><td>Jaeger</td><td>Un sistema de seguimiento distribuido que nos permite depurar errores y optimizar la configuración de nuestros servicios.</td></tr><tr><td>AWS X-Ray Datadog</td><td>Un servicio de monitoreo de rendimiento que nos permite recopilar y analizar métricas y registros de nuestros servicios.</td></tr></tbody></table>
<h3 id="conclusi%C3%B3n-1">Conclusión</h3>
<p>En este paso, hemos monitoreado los recursos de App Mesh para asegurarnos de que estén funcionando correctamente. En el próximo paso, podemos limpiar el entorno de prueba.</p>
<h2 id="paso-7%3A-limpiar-el-entorno-de-prueba">Paso 7: Limpiar el Entorno de Prueba</h2>
<p>Ahora que hemos terminado de monitorear los recursos de App Mesh, es hora de limpiar el entorno de prueba para asegurarnos de que no haya recursos innecesarios que afecten otros servicios.</p>
<h3 id="eliminar-la-aplicaci%C3%B3n-de-muestra">Eliminar la Aplicación de Muestra</h3>
<p>Para eliminar la aplicación de muestra, debemos ejecutar el siguiente comando:</p>
<pre><code>cd aws-app-mesh-examples/walkthroughs/howto-k8s-http-headers/kubectl delete -f _output/manifest.yaml
</code></pre>
<p>Este comando eliminará la aplicación de muestra y sus recursos asociados.</p>
<h3 id="eliminar-el-controlador-de-app-mesh">Eliminar el Controlador de App Mesh</h3>
<p>Para eliminar el controlador de App Mesh, debemos ejecutar el siguiente comando:</p>
<pre><code>helm delete appmesh-controller -n appmesh-system
</code></pre>
<p>Este comando eliminará el controlador de App Mesh y sus recursos asociados.</p>
<p>Al eliminar estos recursos, podemos asegurarnos de que nuestro entorno de prueba esté limpio y listo para nuevas configuraciones o pruebas. Recuerda que puedes recrear fácilmente estos recursos siguiendo los pasos de la guía.</p>
<p><strong>Recursos Eliminados</strong></p>
<table><thead><tr><th>Recurso</th><th>Comando de Eliminación</th></tr></thead><tbody><tr><td>Aplicación de Muestra</td><td><code>kubectl delete -f _output/manifest.yaml</code></td></tr><tr><td>Controlador de App Mesh</td><td><code>helm delete appmesh-controller -n appmesh-system</code></td></tr></tbody></table>
<p>Recuerda que es importante limpiar el entorno de prueba después de cada prueba para evitar conflictos con futuras configuraciones o pruebas.</p>
<h2 id="resumen">Resumen</h2>
<p>En resumen, la integración de AWS App Mesh con EKS ofrece una forma sencilla y escalable de administrar la comunicación entre microservicios en entornos de contenedores. Al seguir los pasos de esta guía, podrás configurar App Mesh para administrar el tráfico entre tus microservicios, monitorear el rendimiento y la disponibilidad, y garantizar la seguridad de tus aplicaciones.</p>
<h3 id="ventajas-de-la-integraci%C3%B3n">Ventajas de la Integración</h3>
<p>La integración de App Mesh con EKS ofrece varias ventajas, incluyendo:</p>
<table><thead><tr><th>Ventaja</th><th>Descripción</th></tr></thead><tbody><tr><td>Simplifica la comunicación</td><td>App Mesh simplifica la comunicación entre microservicios, lo que reduce la complejidad y mejora la escalabilidad.</td></tr><tr><td>Mejora la disponibilidad</td><td>App Mesh monitorea el rendimiento y la disponibilidad de tus aplicaciones, lo que te permite identificar y solucionar problemas rápidamente.</td></tr><tr><td>Garantiza la seguridad</td><td>App Mesh proporciona una capa adicional de seguridad para tus aplicaciones, lo que te permite proteger tus datos y aplicaciones de ataques malintencionados.</td></tr></tbody></table>
<p>Si deseas explorar más a fondo las características avanzadas de App Mesh, puedes comenzar a investigar sobre la configuración de rutas de tráfico, la implementación de políticas de seguridad y la integración con otros servicios de AWS. Recuerda que la práctica y la experimentación son clave para dominar las habilidades de integración de App Mesh con EKS.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/opciones-para-desplegar-contenedores-en-aws-ecs-y-eks/">Opciones para Desplegar Contenedores en AWS: ECS y EKS</a></li><li><a href="https://dondeaprendoaws.com/blog/como-desplegar-una-aplicacion-en-amazon-eks/">Cómo Desplegar una Aplicación en Amazon EKS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-eks/">Mejores Prácticas Para Amazon EKS</a></li><li><a href="https://dondeaprendoaws.com/blog/microservicios-en-aws-utilizando-contenedores/">Microservicios en AWS Utilizando Contenedores</a></li></ul>
