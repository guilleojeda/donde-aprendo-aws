---
title: "Configuración de Service Discovery en Amazon ECS"
description: "Aprende a configurar el Service Discovery en Amazon ECS para mejorar la escalabilidad y flexibilidad de tus aplicaciones. Sigue los pasos detallados y las mejores prácticas para una implementación efectiva."
publishedAt: "2024-05-19"
publishedTimestamp: "2024-05-19T00:02:00.421Z"
cover: "/assets/blog/06c78ff6dbda05d66c1f63e8.jpg"
coverAlt: "Thumbnail for: Configuración de Service Discovery en Amazon ECS"
ogImage: "/assets/blog/06c78ff6dbda05d66c1f63e8.jpg"
related:
  - title: "Concurrencia Aprovisionada: Solución a Cold Starts en AWS Lambda"
    url: "https://dondeaprendoaws.com/blog/concurrencia-aprovisionada-solucion-a-cold-starts-en-aws-lambda/"
    image: "/assets/blog/4efa7f16e3c389136cc18ae2.png"
    imageAlt: ""
  - title: "AWS OpsWorks: Automatiza Despliegues con Chef"
    url: "https://dondeaprendoaws.com/blog/aws-opsworks-automatiza-despliegues-con-chef/"
    image: "/assets/blog/6b2f0b16a8f28318691c2a8d.jpg"
    imageAlt: ""
  - title: "Guía de UEBA para la Seguridad de AWS"
    url: "https://dondeaprendoaws.com/blog/guia-de-ueba-para-la-seguridad-de-aws/"
    image: "/assets/blog/77827c07de64ac355ca01278.jpg"
    imageAlt: ""
---

<p>El Service Discovery permite que los contenedores se comuniquen entre sí de manera eficiente en un entorno dinámico. Configurar este servicio en <a href="https://aws.amazon.com/ecs/" rel="noopener noreferrer" target="_blank">Amazon ECS</a> ofrece los siguientes beneficios:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Beneficio</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Escalabilidad</td>
<td>Los contenedores pueden encontrarse y comunicarse fácilmente, mejorando la disponibilidad y escalabilidad de las aplicaciones.</td>
</tr>
<tr>
<td>Flexibilidad</td>
<td>La integración con otros servicios de AWS, como <a href="https://aws.amazon.com/route53/" rel="noopener noreferrer" target="_blank">Route 53</a> y <a href="https://aws.amazon.com/cloud-map/" rel="noopener noreferrer" target="_blank">AWS Cloud Map</a>, simplifica la configuración y el mantenimiento.</td>
</tr>
</tbody>
</table></figure>


<p>Para configurar el Service Discovery en Amazon ECS, sigue estos pasos:</p>


<ol>
<li>
<p>Crea los recursos de Service Discovery en AWS Cloud Map.</p>
</li>
<li>
<p>Crea un clúster de Amazon ECS.</p>
</li>
<li>
<p>Registra la definición de tarea con modo de red "awsvpc".</p>
</li>
<li>
<p>Crea un servicio de ECS integrado con el Service Discovery.</p>
</li>
<li>
<p>Prueba el Service Discovery consultando los registros DNS.</p>
</li>
</ol>


<p>Algunas mejores prácticas incluyen:</p>


<ul>
<li>
<p>Configurar correctamente los registros DNS y las verificaciones de estado.</p>
</li>
<li>
<p>Utilizar AWS Cloud Map para definir atributos personalizados y realizar un seguimiento del estado de los servicios.</p>
</li>
<li>
<p>Implementar monitoreo y registro para detectar problemas de servicio.</p>
</li>
</ul>


<p>En resumen, configurar el Service Discovery en Amazon ECS es un proceso sencillo que te permite desarrollar aplicaciones escalables y seguras, sin preocuparte por la complejidad de la configuración de red.</p>


<h2 id="related-video-from-youtube" tabindex="-1">Related video from YouTube</h2>


<iframe allowfullscreen="" loading="lazy" src="https://www.youtube.com/embed/wNpHte0Wc1E" title="Video de YouTube"></iframe>
<h2 id="requisitos-previos" tabindex="-1">Requisitos previos</h2>


<p>Antes de comenzar a configurar el servicio de discovery en Amazon ECS, asegúrese de cumplir con los siguientes requisitos.</p>


<h3 id="instalar-y-configurar-aws-cli" tabindex="-1">Instalar y configurar <a href="https://aws.amazon.com/cli/" rel="noopener noreferrer" target="_blank">AWS CLI</a></h3>


<p><figure><img alt="AWS CLI" src="/assets/blog/3a33dcbe8916c12642381294.jpg"/></figure></p>


<ul>
<li>
<p><strong>Instalación</strong>: Asegúrese de tener la última versión de AWS CLI instalada.</p>
</li>
<li>
<p><strong>Configuración</strong>: Configure AWS CLI con los permisos adecuados y la región de AWS correcta.</p>
</li>
</ul>


<h3 id="cuenta-de-aws-y-permisos" tabindex="-1">Cuenta de AWS y permisos</h3>


<ul>
<li><strong>Permisos</strong>: Verifique que el usuario de AWS tenga los permisos necesarios, como la política de IAM <code class="inline-code">AmazonECS_FullAccess</code>.</li>
</ul>


<h3 id="configurar-vpc-y-grupos-de-seguridad" tabindex="-1">Configurar VPC y grupos de seguridad</h3>


<ul>
<li>
<p><strong>VPC</strong>: Asegúrese de tener al menos un VPC creado.</p>
</li>
<li>
<p><strong>Grupos de seguridad</strong>: Configure los grupos de seguridad para permitir el tráfico entre los contenedores.</p>
</li>
</ul>


<p>Cumplir con estos requisitos previos es clave para una configuración exitosa del servicio de discovery.</p>


<h2 id="configuraci%C3%B3n-paso-a-paso-de-service-discovery" tabindex="-1">Configuración paso a paso de Service Discovery</h2>


<p>Para configurar el servicio de discovery en Amazon ECS, siga estos pasos.</p>


<h3 id="paso-1%3A-crear-recursos-de-service-discovery" tabindex="-1">Paso 1: Crear recursos de Service Discovery</h3>


<p>Primero, cree un namespace de servicio de discovery privado en una VPC especificada y configure un servicio de discovery. Use el siguiente comando de AWS CLI:</p>


<pre><code>aws servicediscovery create-private-dns-namespace \
      --name tutorial \
      --vpc vpc-abcd1234
</code></pre>


<p>Luego, utilice el ID de operación devuelto para verificar que el namespace se haya creado correctamente.</p>


<h3 id="paso-2%3A-crear-un-cl%C3%BAster-de-amazon-ecs" tabindex="-1">Paso 2: Crear un clúster de <a href="https://aws.amazon.com/ecs/" rel="noopener noreferrer" target="_blank">Amazon ECS</a></h3>


<p><figure><img alt="Amazon ECS" src="/assets/blog/9a1eaadb0b70caa95e1f48e9.jpg"/></figure></p>


<p>A continuación, establezca un clúster de Amazon ECS para hospedar sus servicios. Vaya a la consola de Amazon ECS y seleccione "Crear clúster". Siga las instrucciones para configurar el clúster con las opciones deseadas.</p>


<h3 id="paso-3%3A-registrar-la-definici%C3%B3n-de-tarea" tabindex="-1">Paso 3: Registrar la definición de tarea</h3>


<p>Defina y registre una definición de tarea que utilice el modo de red "awsvpc". Cree un archivo de definición de tarea en formato JSON o YAML y use el siguiente comando de AWS CLI:</p>


<pre><code>aws ecs register-task-definition --cli-input-json file://task-definition.json
</code></pre>


<h3 id="paso-4%3A-crear-un-servicio-de-ecs-con-service-discovery" tabindex="-1">Paso 4: Crear un servicio de ECS con Service Discovery</h3>


<p>Cree un servicio de ECS que se integre con el namespace de servicio de discovery y el servicio de discovery. Use el siguiente comando de AWS CLI:</p>


<pre><code>aws ecs create-service --cluster tutorial --service-name myapplication \
      --task-definition tutorial-task-def --desired-count 1 \
      --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxxxx],securityGroups=[sg-xxxxxxx]}"
</code></pre>


<h3 id="paso-5%3A-probar-service-discovery" tabindex="-1">Paso 5: Probar Service Discovery</h3>


<p>Finalmente, pruebe la configuración del servicio de discovery mediante la consulta de registros DNS y la realización de solicitudes HTTP desde dentro de la VPC. Use el siguiente comando de AWS CLI:</p>


<pre><code>dig +short myapplication.tutorial
</code></pre>


<p>Debería ver la dirección IP del contenedor que se está ejecutando en el servicio de ECS.</p>




<h2 id="mejores-pr%C3%A1cticas-para-service-discovery" tabindex="-1">Mejores prácticas para Service Discovery</h2>


<h3 id="registros-dns-y-verificaciones-de-estado" tabindex="-1">Registros DNS y verificaciones de estado</h3>


<p>Configurar correctamente los registros DNS y las verificaciones de estado es clave para el buen funcionamiento del servicio de discovery. Use los tipos de registros DNS adecuados (como registros A o SRV) y configure las verificaciones de estado para asegurarse de que solo se devuelvan instancias de servicio saludables. Esto garantiza que los clientes se conecten a instancias disponibles y eviten errores de conexión.</p>


<h3 id="uso-de-aws-cloud-map" tabindex="-1">Uso de <a href="https://aws.amazon.com/cloud-map/" rel="noopener noreferrer" target="_blank">AWS Cloud Map</a></h3>


<p><figure><img alt="AWS Cloud Map" src="/assets/blog/12e08920fedb01ff2d28fa4b.jpg"/></figure></p>


<p>AWS Cloud Map es una herramienta útil para mejorar la configuración de service discovery. Permite definir atributos personalizados para los servicios y realizar un seguimiento del estado de los mismos. También ofrece funciones de monitoreo y registro adicionales que pueden ayudar a identificar problemas de servicio y mejorar la experiencia del usuario.</p>


<h3 id="monitoreo-y-registro" tabindex="-1">Monitoreo y registro</h3>


<p>El monitoreo y registro de la configuración de service discovery es fundamental para mantener un entorno saludable. Configure el monitoreo y registro adecuados para detectar problemas de servicio y realizar un seguimiento del rendimiento. Esto le permitirá identificar y solucionar problemas rápidamente, reduciendo el tiempo de inactividad y mejorando la experiencia del usuario.</p>


<h2 id="troubleshooting-common-issues" tabindex="-1">Troubleshooting Common Issues</h2>


<h3 id="mensajes-de-error-y-soluciones" tabindex="-1">Mensajes de error y soluciones</h3>


<p>Durante la configuración de Service Discovery, pueden surgir errores que detengan el proceso. Aquí hay algunos errores comunes y sus soluciones:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Error</th>
<th>Solución</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Error de DNS</strong></td>
<td>Verifique que los registros DNS estén configurados correctamente y que el namespace de Service Discovery sea accesible desde su VPC.</td>
</tr>
<tr>
<td><strong>Error de permisos IAM</strong></td>
<td>Asegúrese de que ECS tenga los permisos necesarios para registrar y deregistrar instancias con Service Discovery.</td>
</tr>
<tr>
<td><strong>Error de salud</strong></td>
<td>Verifique que la aplicación esté devolviendo una respuesta exitosa en el punto de verificación de salud y ajuste la configuración según sea necesario.</td>
</tr>
</tbody>
</table></figure>


<h3 id="depuraci%C3%B3n-de-dns-y-red" tabindex="-1">Depuración de DNS y red</h3>


<p>Para solucionar problemas de DNS y conectividad de red relacionados con Service Discovery, siga estos pasos:</p>


<p>1. <strong>Verificar registros DNS</strong></p>


<p>Asegúrese de que los registros DNS estén configurados correctamente y que el namespace de Service Discovery sea accesible desde su VPC.</p>


<p>2. <strong>Usar herramientas de depuración</strong></p>


<p>Utilice herramientas como <code class="inline-code">dig</code> o <code class="inline-code">nslookup</code> para verificar la resolución de nombres de dominio.</p>


<p>3. <strong>Verificar instancias de servicio</strong></p>


<p>Asegúrese de que las instancias de servicio estén configuradas correctamente y disponibles en la red.</p>


<p>4. <strong>Utilizar registros DNS SRV</strong></p>


<p>Registre cada tarea de servicio con registros DNS SRV y asegúrese de que el registro SRV especifique una combinación de nombre y puerto de contenedor en la definición de tarea.</p>


<p>Recuerde que la depuración de problemas de DNS y red puede ser compleja y requiere paciencia. Siguiendo estos pasos, debería poder identificar y solucionar problemas comunes durante la configuración de Service Discovery.</p>


<h2 id="conclusion" tabindex="-1">Conclusion</h2>


<h3 id="puntos-clave" tabindex="-1">Puntos clave</h3>


<p>En este artículo, hemos visto cómo configurar el servicio de descubrimiento en Amazon ECS. Hablamos de los beneficios, como la escalabilidad y la alta disponibilidad. También compartimos consejos y mejores prácticas para una implementación efectiva.</p>


<p>Recuerda que configurar el servicio de descubrimiento en Amazon ECS es un proceso sencillo que puede ahorrarte tiempo y esfuerzo a largo plazo. Al usar este servicio, puedes enfocarte en desarrollar aplicaciones escalables y seguras sin preocuparte por la complejidad de la configuración de la red.</p>


<h3 id="pr%C3%B3ximos-pasos" tabindex="-1">Próximos pasos</h3>


<p>Si quieres aprender más sobre Amazon ECS y el servicio de descubrimiento, te recomendamos estos recursos:</p>


<ul>
<li>
<p>Documentación oficial de Amazon ECS</p>
</li>
<li>
<p>Tutoriales y guías prácticas de AWS</p>
</li>
<li>
<p>Cursos en línea y recursos de capacitación de AWS</p>
</li>
</ul>


<p>La práctica y la experimentación son clave para dominar el servicio de descubrimiento en Amazon ECS. ¡No dudes en probar y explorar nuevas características y funcionalidades para mejorar tus habilidades y conocimientos!</p>


<h2 id="faqs" tabindex="-1">FAQs</h2>


<h3 id="%C2%BFc%C3%B3mo-configurar-el-servicio-de-descubrimiento-en-aws%3F" tabindex="-1">¿Cómo configurar el servicio de descubrimiento en AWS?</h3>


<p>Para configurar el servicio de descubrimiento en AWS, sigue estos pasos:</p>


<ol>
<li>
<p>Crea los recursos de Service Discovery en AWS Cloud Map. Sigue estos pasos para crear tu namespace de Service Discovery y servicio de Service Discovery.</p>
</li>
<li>
<p>Crea los recursos de Amazon ECS.</p>
</li>
<li>
<p>Verifica el Service Discovery en AWS Cloud Map.</p>
</li>
<li>
<p>Limpia.</p>
</li>
</ol>


<p>Para más detalles, consulta <a href="https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-service-discovery.html" rel="noopener noreferrer" target="_blank">Crear un servicio utilizando Service Discovery</a>.</p>


<h3 id="%C2%BFc%C3%B3mo-agregar-un-servicio-a-ecs%3F" tabindex="-1">¿Cómo agregar un servicio a ECS?</h3>


<p>Para agregar un servicio a ECS, sigue estos pasos:</p>


<ol>
<li>
<p>Abre la consola de AWS en <a href="https://console.aws.amazon.com/ecs/v2" rel="noopener noreferrer" target="_blank">https://console.aws.amazon.com/ecs/v2</a>.</p>
</li>
<li>
<p>En la página de navegación, selecciona Clusters.</p>
</li>
<li>
<p>En la página de Clusters, selecciona el cluster donde deseas crear el servicio.</p>
</li>
<li>
<p>En la pestaña Services, selecciona Create.</p>
</li>
</ol>


<p>Para más detalles, consulta <a href="https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-service.html" rel="noopener noreferrer" target="_blank">Crear un servicio (consola de Amazon ECS)</a>.</p>


<h3 id="%C2%BFc%C3%B3mo-crear-un-servicio-de-descubrimiento%3F" tabindex="-1">¿Cómo crear un servicio de descubrimiento?</h3>


<p>Para crear un servicio de descubrimiento, sigue estos pasos:</p>


<ol>
<li>
<p>Cumple con los requisitos previos. Antes de comenzar, asegúrate de que se cumplan los siguientes requisitos.</p>
</li>
<li>
<p>Crea los recursos de Service Discovery en AWS Cloud Map.</p>
</li>
<li>
<p>Crea los recursos de Amazon ECS.</p>
</li>
<li>
<p>Verifica el Service Discovery en AWS Cloud Map.</p>
</li>
<li>
<p>Limpia.</p>
</li>
</ol>


<p>Para más detalles, consulta <a href="https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-service-discovery.html" rel="noopener noreferrer" target="_blank">Crear un servicio utilizando Service Discovery</a>.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ecs/">Mejores Prácticas Para Amazon ECS</a></li><li><a href="https://dondeaprendoaws.com/blog/opciones-para-desplegar-contenedores-en-aws-ecs-y-eks/">Opciones para Desplegar Contenedores en AWS: ECS y EKS</a></li><li><a href="https://dondeaprendoaws.com/blog/comprendiendo-amazon-ecs/">Comprendiendo Amazon ECS</a></li><li><a href="https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/">Cómo Desplegar Contenedores en AWS</a></li>
</ul>
</p>
