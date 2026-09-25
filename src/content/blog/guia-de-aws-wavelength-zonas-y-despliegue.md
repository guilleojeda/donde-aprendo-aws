---
title: "Guía de AWS Wavelength: Zonas y Despliegue"
description: "Descubre todo sobre AWS Wavelength, desde su arquitectura hasta su despliegue y seguridad. Aprende cómo reducir la latencia y mejorar el rendimiento de tus aplicaciones en este servicio de infraestructura de AWS."
publishedAt: "2024-05-19"
publishedTimestamp: "2024-05-19T00:55:00.331Z"
cover: "/assets/blog/e73412d95c38ad88b6dc619a.jpg"
coverAlt: "Thumbnail for: Guía de AWS Wavelength: Zonas y Despliegue"
ogImage: "/assets/blog/e73412d95c38ad88b6dc619a.jpg"
related:
  - title: "AWS DeepLens: Introducción al Aprendizaje Profundo"
    url: "https://dondeaprendoaws.com/blog/aws-deeplens-introduccion-al-aprendizaje-profundo/"
    image: "/assets/blog/711eae34c71ed3b53e765f69.jpg"
    imageAlt: ""
  - title: "Desarrollando Aplicaciones con AWS Lambda"
    url: "https://dondeaprendoaws.com/blog/desarrollando-aplicaciones-con-aws-lambda/"
    image: "/assets/blog/699efcfd9fc0a59df5186b93.png"
    imageAlt: ""
  - title: "AWS bases de datos: introducción básica"
    url: "https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/"
    image: "/assets/blog/7dd6e4771015e24de4a4bc0d.jpg"
    imageAlt: ""
---

<p><a href="https://aws.amazon.com/wavelength/" rel="noopener noreferrer" target="_blank">AWS Wavelength</a> es un servicio de infraestructura que permite a los desarrolladores crear aplicaciones con latencia ultra baja para dispositivos móviles y usuarios finales. Despliega recursos de computación y <a href="https://dondeaprendoaws.com/blog/clases-de-almacenamiento-de-amazon-s3/">almacenamiento de AWS</a> en la periferia de las redes 5G de los proveedores de telecomunicaciones, reduciendo la latencia y mejorando la experiencia del usuario.</p>


<h2 id="related-video-from-youtube" tabindex="-1">Related video from YouTube</h2>


<iframe allowfullscreen="" loading="lazy" src="https://www.youtube.com/embed/KZX5FcsDfUQ" title="Video de YouTube"></iframe>
<h2 id="%C2%BFqu%C3%A9-es-aws-wavelength%3F" tabindex="-1">¿Qué es <a href="https://aws.amazon.com/wavelength/" rel="noopener noreferrer" target="_blank">AWS Wavelength</a>?</h2>


<p><figure><img alt="AWS Wavelength" src="/assets/blog/b5ed01b40bb6923a76c3d3c5.jpg"/></figure></p>


<p>AWS Wavelength permite a los desarrolladores ejecutar aplicaciones en la periferia de la red 5G, lo que reduce la latencia y mejora el rendimiento de aplicaciones que requieren baja latencia o resiliencia en el borde, como:</p>


<ul>
<li>
<p>Transmisión de video en vivo</p>
</li>
<li>
<p>Juegos en línea</p>
</li>
<li>
<p>Realidad aumentada</p>
</li>
<li>
<p>IoT</p>
</li>
<li>
<p>Producción de medios en vivo</p>
</li>
<li>
<p>Automatización industrial</p>
</li>
</ul>


<h2 id="principales-caracter%C3%ADsticas" tabindex="-1">Principales Características</h2>


<ul>
<li>
<p><strong>Zonas de Wavelength</strong>: Despliegues de <a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">infraestructura de AWS</a> en centros de datos de proveedores de telecomunicaciones en la red 5G.</p>
</li>
<li>
<p><strong>Baja Latencia</strong>: El tráfico de la aplicación llega a los servidores sin salir de la red del proveedor, reduciendo la latencia.</p>
</li>
<li>
<p><a href="https://dondeaprendoaws.com/blog/introduccion-a-los-servicios-de-amazon-web-services/"><strong>Integración con Servicios de AWS</strong></a>: Se puede integrar con servicios como <a href="https://aws.amazon.com/ec2/" rel="noopener noreferrer" target="_blank">Amazon EC2</a>, <a href="https://aws.amazon.com/s3/" rel="noopener noreferrer" target="_blank">Amazon S3</a>, <a href="https://aws.amazon.com/dynamodb/" rel="noopener noreferrer" target="_blank">Amazon DynamoDB</a>, <a href="https://aws.amazon.com/lambda/" rel="noopener noreferrer" target="_blank">AWS Lambda</a>, <a href="https://aws.amazon.com/eks/" rel="noopener noreferrer" target="_blank">Amazon EKS</a>, <a href="https://aws.amazon.com/ecs/" rel="noopener noreferrer" target="_blank">Amazon ECS</a> y <a href="https://aws.amazon.com/sagemaker/" rel="noopener noreferrer" target="_blank">Amazon SageMaker</a>.</p>
</li>
<li>
<p><strong>Alta Disponibilidad y Tolerancia a Fallos</strong>: Se pueden desplegar recursos en múltiples zonas de Wavelength, implementar failover y enrutamiento DNS, y monitorear los recursos.</p>
</li>
<li>
<p><strong>Seguridad</strong>: Se puede configurar la seguridad de la red, la gestión de acceso, la encriptación de datos y cumplir con estándares de seguridad como <a href="https://en.wikipedia.org/wiki/Health_Insurance_Portability_and_Accountability_Act" rel="noopener noreferrer" target="_blank">HIPAA</a>, <a href="https://en.wikipedia.org/wiki/ISO/IEC_27001" rel="noopener noreferrer" target="_blank">ISO</a> y <a href="https://en.wikipedia.org/wiki/Payment_Card_Industry_Data_Security_Standard" rel="noopener noreferrer" target="_blank">PCI DSS</a>.</p>
</li>
</ul>


<h2 id="pasos-clave-para-usar-aws-wavelength" tabindex="-1">Pasos Clave para Usar AWS Wavelength</h2>


<ol>
<li>
<p>Configurar la cuenta de AWS y habilitar las zonas de Wavelength en la región deseada.</p>
</li>
<li>
<p>Crear subredes en las zonas de Wavelength y asociarlas con una VPC.</p>
</li>
<li>
<p>Lanzar instancias de EC2 en las zonas de Wavelength y asociar direcciones IP de carrier.</p>
</li>
<li>
<p>Configurar balanceadores de carga (ALB y NLB) para distribuir el tráfico.</p>
</li>
<li>
<p>Integrar con otros servicios de AWS según sea necesario (EKS, ECS, Lambda, SageMaker, CloudFront).</p>
</li>
<li>
<p>Implementar estrategias de alta disponibilidad, tolerancia a fallos, seguridad y optimización de costos.</p>
</li>
</ol>


<p>AWS Wavelength permite a los desarrolladores aprovechar la computación en el borde y crear aplicaciones con latencia ultra baja para dispositivos móviles y usuarios finales.</p>


<h2 id="%C2%BFqu%C3%A9-es-aws-wavelength%3F-1" tabindex="-1">¿Qué es AWS Wavelength?</h2>


<p>AWS Wavelength es un servicio de infraestructura de AWS que permite a los desarrolladores crear aplicaciones con latencia muy baja para dispositivos móviles y usuarios finales. Despliega servicios de computación y almacenamiento de AWS en la periferia de las redes 5G de los proveedores de servicios de comunicaciones (CSP). Esto permite que el tráfico de la aplicación llegue a los servidores en zonas de Wavelength sin salir de la red del proveedor, reduciendo la latencia y mejorando la experiencia del usuario.</p>


<p>La computación en la periferia es clave para aplicaciones que necesitan una respuesta rápida y baja latencia, como la transmisión de video en vivo, el juego en línea y la realidad aumentada. AWS Wavelength permite a los desarrolladores usar la computación en la periferia sin tener que gestionar la infraestructura subyacente.</p>


<p>Con AWS Wavelength, los desarrolladores pueden crear aplicaciones que se ejecutan en la periferia de la red 5G, lo que reduce la latencia y mejora la experiencia del usuario. Esto es especialmente importante para aplicaciones que requieren una respuesta rápida y baja latencia, como la transmisión de video en vivo, el juego en línea y la realidad aumentada.</p>


<h2 id="getting-started-with-wavelength-zones" tabindex="-1">Getting Started with Wavelength Zones</h2>


<p>Para empezar a usar AWS Wavelength, es importante configurar tu cuenta de AWS y habilitar las zonas de Wavelength en la región deseada.</p>


<h3 id="configuraci%C3%B3n-de-la-cuenta-de-aws" tabindex="-1">Configuración de la Cuenta de AWS</h3>


<p>Antes de usar AWS Wavelength, asegúrate de tener una cuenta de AWS activa y configurada correctamente. Esto incluye:</p>


<ul>
<li>
<p>Crear una cuenta de AWS si no la tienes</p>
</li>
<li>
<p>Configurar la información de facturación y pago</p>
</li>
<li>
<p>Habilitar los servicios de AWS necesarios, como Amazon EC2 y Amazon VPC</p>
</li>
</ul>


<h3 id="habilitar-zonas-de-wavelength" tabindex="-1">Habilitar Zonas de Wavelength</h3>


<p>Para habilitar las zonas de Wavelength, sigue estos pasos:</p>


<ol>
<li>
<p>Inicia sesión en la consola de AWS Management</p>
</li>
<li>
<p>Selecciona la región donde deseas habilitar las zonas de Wavelength</p>
</li>
<li>
<p>Ve a la sección de "Zonas" y selecciona "Wavelength Zones"</p>
</li>
<li>
<p>Selecciona la zona de Wavelength que deseas habilitar y sigue las instrucciones para completar el proceso</p>
</li>
</ol>


<h3 id="disponibilidad-y-l%C3%ADmites-de-las-zonas" tabindex="-1">Disponibilidad y Límites de las Zonas</h3>


<p>Es importante conocer la disponibilidad y los límites de las zonas de Wavelength en diferentes regiones. AWS Wavelength está disponible en varias regiones, pero no en todas. Además, hay límites en cuanto al número de zonas que se pueden habilitar y los recursos asignados a cada zona.</p>


<p>Consulta la documentación de AWS Wavelength para más información sobre la disponibilidad y los límites en diferentes regiones.</p>


<h2 id="wavelength-zone-architecture" tabindex="-1">Wavelength Zone Architecture</h2>


<p>La arquitectura de la zona de Wavelength se basa en la infraestructura y los componentes que permiten la entrega de aplicaciones con latencia ultra baja a dispositivos móviles y usuarios finales. A continuación, se describen los componentes clave de una zona de Wavelength, la conectividad con las regiones de AWS y las consideraciones de red.</p>


<h3 id="componentes-de-infraestructura" tabindex="-1">Componentes de Infraestructura</h3>


<p>Una zona de Wavelength incluye varios componentes clave que trabajan juntos para proporcionar una infraestructura de aplicación segura y escalable. Estos componentes son:</p>


<ul>
<li>
<p><strong>Amazon VPC</strong>: una red virtual privada que se extiende a una zona de Wavelength, permitiendo la comunicación segura entre los recursos de la zona y las regiones de AWS.</p>
</li>
<li>
<p><strong>Subredes</strong>: se crean en la zona de Wavelength y se asocian con la VPC, permitiendo la segmentación de la red y la aplicación de políticas de seguridad.</p>
</li>
<li>
<p><strong>Puertas de enlace de carrier</strong>: proporcionan conectividad entre la zona de Wavelength y la red del proveedor de servicios de telecomunicaciones.</p>
</li>
<li>
<p><strong>Direcciones IP de carrier</strong>: se asignan a las instancias de EC2 y otros recursos en la zona de Wavelength, permitiendo la comunicación con la red del proveedor de servicios de telecomunicaciones.</p>
</li>
</ul>


<h3 id="conectividad-con-regiones-de-aws" tabindex="-1">Conectividad con Regiones de AWS</h3>


<p>Las zonas de Wavelength se conectan a las regiones de AWS a través de una conexión de red segura y escalable. Esta conexión permite la transferencia de datos entre la zona de Wavelength y las regiones de AWS, facilitando la <a href="https://dondeaprendoaws.com/blog/servicios-de-aws-para-inteligencia-artificial/">integración con otros servicios de AWS</a> y el uso de recursos compartidos.</p>


<p>La conectividad se logra mediante una combinación de tecnologías de red, incluyendo VPN, Direct Connect y peering. Esto garantiza una conexión segura y escalable que cumple con los requisitos de latencia y ancho de banda de las aplicaciones.</p>


<h3 id="configuraci%C3%B3n-de-red" tabindex="-1">Configuración de Red</h3>


<p>La configuración de red en una zona de Wavelength implica la creación de una VPC, subredes, puertas de enlace de carrier y direcciones IP de carrier. A continuación, se presentan los pasos generales para configurar la red en una zona de Wavelength:</p>


<p>1. <strong>Crear una VPC</strong> en la región de AWS correspondiente.</p>


<p>2. <strong>Crear subredes</strong> en la zona de Wavelength y asociarlas con la VPC.</p>


<p>3. <strong>Configurar las puertas de enlace de carrier</strong> y asignar direcciones IP de carrier a las instancias de EC2 y otros recursos.</p>


<p>4. <strong>Configurar las tablas de rutas y las políticas de seguridad</strong> para garantizar la comunicación segura entre la zona de Wavelength y las regiones de AWS.</p>


<p>Es importante seguir las <a href="https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/">mejores prácticas de seguridad y red</a> para garantizar la integridad y confidencialidad de los datos en la zona de Wavelength.</p>


<h2 id="deploying-resources-in-wavelength-zones" tabindex="-1">Deploying Resources in Wavelength Zones</h2>


<p>La implementación de recursos en zonas de Wavelength implica varios pasos clave para garantizar una configuración segura y escalable. A continuación, se presentan los pasos para crear y configurar subredes, lanzar instancias de EC2 y asociar direcciones IP de carrier.</p>


<h3 id="creating-subnets" tabindex="-1">Creating Subnets</h3>


<p>La creación de subredes en zonas de Wavelength es un paso crucial para la implementación de recursos. Para crear una subnet, siga los siguientes pasos:</p>


<ol>
<li>
<p>Inicie sesión en la consola de AWS Management y seleccione la región correspondiente.</p>
</li>
<li>
<p>Vaya a la sección de VPC y seleccione "Subredes" en el menú lateral.</p>
</li>
<li>
<p>Haga clic en "Crear subnet" y seleccione la zona de Wavelength correspondiente.</p>
</li>
<li>
<p>Asigne una dirección IP de carrier a la subnet y configure las opciones de seguridad según sea necesario.</p>
</li>
<li>
<p>Haga clic en "Crear subnet" para completar el proceso.</p>
</li>
</ol>


<h3 id="launching-ec2-instances" tabindex="-1">Launching EC2 Instances</h3>


<p>Para lanzar instancias de EC2 en zonas de Wavelength, siga los siguientes pasos:</p>


<ol>
<li>
<p>Inicie sesión en la consola de AWS Management y seleccione la región correspondiente.</p>
</li>
<li>
<p>Vaya a la sección de EC2 y seleccione "Instancias" en el menú lateral.</p>
</li>
<li>
<p>Haga clic en "Lanzar instancia" y seleccione la imagen de máquina virtual correspondiente.</p>
</li>
<li>
<p>Seleccione la zona de Wavelength correspondiente y configure las opciones de seguridad según sea necesario.</p>
</li>
<li>
<p>Haga clic en "Lanzar instancia" para completar el proceso.</p>
</li>
</ol>


<h3 id="associating-carrier-ip-addresses" tabindex="-1">Associating Carrier IP Addresses</h3>


<p>Para asociar direcciones IP de carrier a instancias de EC2, siga los siguientes pasos:</p>


<ol>
<li>
<p>Inicie sesión en la consola de AWS Management y seleccione la región correspondiente.</p>
</li>
<li>
<p>Vaya a la sección de EC2 y seleccione "Instancias" en el menú lateral.</p>
</li>
<li>
<p>Seleccione la instancia de EC2 correspondiente y haga clic en "Acciones" y luego en "Asociar dirección IP de carrier".</p>
</li>
<li>
<p>Seleccione la dirección IP de carrier correspondiente y configure las opciones de seguridad según sea necesario.</p>
</li>
<li>
<p>Haga clic en "Asociar" para completar el proceso.</p>
</li>
</ol>


<h3 id="load-balancing-options" tabindex="-1">Load Balancing Options</h3>


<p>Las opciones de balanceo de carga en zonas de Wavelength incluyen Application Load Balancers (ALB) y Network Load Balancers (NLB). Los ALB se utilizan para balancear la carga de aplicaciones web y móviles, mientras que los NLB se utilizan para balancear la carga de aplicaciones que requieren una latencia ultra baja.</p>


<p>Para configurar un ALB, siga los siguientes pasos:</p>


<ol>
<li>
<p>Inicie sesión en la consola de AWS Management y seleccione la región correspondiente.</p>
</li>
<li>
<p>Vaya a la sección de EC2 y seleccione "Load Balancers" en el menú lateral.</p>
</li>
<li>
<p>Haga clic en "Crear load balancer" y seleccione "Application Load Balancer".</p>
</li>
<li>
<p>Configure las opciones de seguridad y seleccione la zona de Wavelength correspondiente.</p>
</li>
<li>
<p>Haga clic en "Crear load balancer" para completar el proceso.</p>
</li>
</ol>


<p>Es importante seguir las mejores prácticas de seguridad y red para garantizar la integridad y confidencialidad de los datos en la zona de Wavelength.</p>




<h2 id="integrating-with-other-aws-services" tabindex="-1">Integrating with Other AWS Services</h2>


<p>AWS Wavelength se conecta con otros servicios de AWS, permitiendo a los desarrolladores desplegar y gestionar aplicaciones en zonas de Wavelength. Esto facilita el acceso a servicios como Amazon EC2, Amazon S3 y Amazon DynamoDB a través de la red local, ideal para aplicaciones de baja latencia.</p>


<h3 id="aplicaciones-contenerizadas" tabindex="-1">Aplicaciones Contenerizadas</h3>


<p>Despliega aplicaciones contenerizadas usando Amazon EKS y Amazon ECS en zonas de Wavelength. Esto es útil para aplicaciones que necesitan una respuesta rápida.</p>


<h3 id="computaci%C3%B3n-sin-servidor" tabindex="-1">Computación Sin Servidor</h3>


<p>Usa AWS Lambda para computación sin servidor en zonas de Wavelength. Esto permite que las aplicaciones se escalen automáticamente y solo pagues por el tiempo de ejecución de la función.</p>


<h3 id="inferencia-de-aprendizaje-autom%C3%A1tico" tabindex="-1">Inferencia de Aprendizaje Automático</h3>


<p>Despliega modelos de aprendizaje automático con Amazon SageMaker en zonas de Wavelength. Esto es útil para aplicaciones que requieren inferencia en tiempo real.</p>


<h3 id="entrega-de-contenido" tabindex="-1">Entrega de Contenido</h3>


<p>Usa <a href="https://aws.amazon.com/cloudfront/" rel="noopener noreferrer" target="_blank">Amazon CloudFront</a> para la entrega de contenido en zonas de Wavelength. Esto permite entregar contenido de manera rápida y segura a los usuarios finales, sin importar su ubicación.</p>


<p>Al integrar AWS Wavelength con otros servicios de AWS, los desarrolladores pueden crear aplicaciones que se benefician de la baja latencia, la escalabilidad y la seguridad de la computación en el borde.</p>


<h2 id="alta-disponibilidad-y-tolerancia-a-fallos" tabindex="-1">Alta Disponibilidad y Tolerancia a Fallos</h2>


<p>La alta disponibilidad y la tolerancia a fallos son esenciales para las aplicaciones en zonas de Wavelength. Aquí te mostramos cómo implementarlas.</p>


<h3 id="despliegues-en-m%C3%BAltiples-zonas" tabindex="-1">Despliegues en Múltiples Zonas</h3>


<p>Para asegurar alta disponibilidad, despliega recursos en varias zonas de Wavelength. Esto garantiza que si una zona falla, los recursos en otras zonas seguirán funcionando.</p>


<h3 id="failover-y-enrutamiento-dns" tabindex="-1">Failover y Enrutamiento DNS</h3>


<p>Para la tolerancia a fallos, usa estrategias de failover y enrutamiento DNS. El enrutamiento DNS redirige el tráfico a una zona alternativa si la principal falla. Las técnicas de failover aseguran que los recursos se muevan automáticamente a una zona alternativa en caso de fallo.</p>


<h3 id="monitoreo-y-registro" tabindex="-1">Monitoreo y Registro</h3>


<p>El monitoreo y registro son cruciales para mantener la alta disponibilidad y la tolerancia a fallos. Utiliza herramientas como <a href="https://aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">Amazon CloudWatch</a>, <a href="https://aws.amazon.com/xray/" rel="noopener noreferrer" target="_blank">AWS X-Ray</a> y <a href="https://aws.amazon.com/cloudtrail/" rel="noopener noreferrer" target="_blank">AWS CloudTrail</a> para supervisar el estado de los recursos y detectar problemas.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Estrategia</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Despliegues en Múltiples Zonas</strong></td>
<td>Despliega recursos en varias zonas para asegurar que sigan funcionando si una zona falla.</td>
</tr>
<tr>
<td><strong>Failover y Enrutamiento DNS</strong></td>
<td>Redirige el tráfico a una zona alternativa y mueve recursos automáticamente en caso de fallo.</td>
</tr>
<tr>
<td><strong>Monitoreo y Registro</strong></td>
<td>Usa herramientas para supervisar y detectar problemas en los recursos.</td>
</tr>
</tbody>
</table></figure>


<p>En resumen, para asegurar la alta disponibilidad y la tolerancia a fallos en zonas de Wavelength, despliega recursos en múltiples zonas, implementa estrategias de failover y enrutamiento DNS, y utiliza herramientas de monitoreo y registro.</p>


<h2 id="consideraciones-de-seguridad" tabindex="-1">Consideraciones de Seguridad</h2>


<h3 id="seguridad-de-la-red" tabindex="-1">Seguridad de la Red</h3>


<p>La seguridad de la red es importante en AWS Wavelength. Debes configurar grupos de seguridad y listas de control de acceso a la red (NACLs) para controlar el tráfico. Los grupos de seguridad actúan como un firewall virtual y controlan el tráfico a nivel de instancia, mientras que las NACLs lo hacen a nivel de subred.</p>


<p>Para configurar la seguridad de la red:</p>


<ul>
<li>
<p>Crea grupos de seguridad y NACLs según tus necesidades.</p>
</li>
<li>
<p>Por ejemplo, un grupo de seguridad puede permitir tráfico de entrada en el puerto 80 para una aplicación web y otro grupo puede permitir tráfico de salida en el puerto 443 para una base de datos.</p>
</li>
</ul>


<h3 id="gesti%C3%B3n-de-acceso" tabindex="-1">Gestión de Acceso</h3>


<p>La gestión de acceso es clave para la seguridad en AWS Wavelength. Debes configurar roles y políticas de IAM para controlar quién tiene acceso a tus recursos y qué acciones pueden realizar.</p>


<p>Para configurar la gestión de acceso:</p>


<ul>
<li>
<p>Crea roles de IAM según tus necesidades.</p>
</li>
<li>
<p>Por ejemplo, un rol para un desarrollador puede permitir lanzar instancias EC2 y otro rol para un administrador puede permitir acceder a la consola de administración de AWS.</p>
</li>
</ul>


<h3 id="encriptaci%C3%B3n-de-datos-y-cumplimiento" tabindex="-1">Encriptación de Datos y Cumplimiento</h3>


<p>La encriptación de datos y el cumplimiento con los estándares de seguridad son importantes en AWS Wavelength. Asegúrate de que tus datos estén encriptados en tránsito y en reposo, y que cumplas con los estándares de seguridad relevantes, como HIPAA, ISO y PCI DSS.</p>


<p>Para cumplir con los estándares de seguridad:</p>


<ul>
<li>
<p>Configura la encriptación de datos en tus recursos, como instancias EC2 y bases de datos.</p>
</li>
<li>
<p>Implementa políticas de seguridad y procedimientos para garantizar el cumplimiento con los estándares de seguridad.</p>
</li>
</ul>


<figure class="table"><table>
<thead>
<tr>
<th>Estándar de seguridad</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>HIPAA</strong></td>
<td>Estándar de seguridad para la industria de la salud</td>
</tr>
<tr>
<td><strong>ISO</strong></td>
<td>Estándar de seguridad para la gestión de la seguridad de la información</td>
</tr>
<tr>
<td><strong>PCI DSS</strong></td>
<td>Estándar de seguridad para la industria de pagos con tarjeta de crédito</td>
</tr>
</tbody>
</table></figure>


<p>Para asegurar la seguridad en AWS Wavelength, configura la seguridad de la red, la gestión de acceso y la encriptación de datos, y cumple con los estándares de seguridad relevantes.</p>


<h2 id="cost-optimization" tabindex="-1">Cost Optimization</h2>


<p>La optimización de costos es importante al desplegar recursos en zonas de Wavelength. A continuación, se presentan los factores de costo involucrados y estrategias para optimizarlos.</p>


<h3 id="factores-de-costo" tabindex="-1">Factores de Costo</h3>


<p>Al desplegar recursos en zonas de Wavelength, considera los siguientes factores de costo:</p>


<ul>
<li>
<p><strong>Tipo de instancia</strong>: las instancias de EC2 en Wavelength Zones tienen un costo diferente al de las instancias en regiones de AWS.</p>
</li>
<li>
<p><strong>Almacenamiento</strong>: el costo del almacenamiento en Wavelength Zones es diferente al de las regiones de AWS.</p>
</li>
<li>
<p><strong>Transferencia de datos</strong>: la transferencia de datos entre Wavelength Zones y regiones de AWS incurre en costos adicionales.</p>
</li>
</ul>


<h3 id="estrategias-de-optimizaci%C3%B3n-de-costos" tabindex="-1">Estrategias de Optimización de Costos</h3>


<p>Para optimizar los costos en Wavelength Zones, se recomiendan las siguientes estrategias:</p>


<ul>
<li>
<p><strong>Seleccione instancias adecuadas</strong>: elija instancias que se ajusten a sus necesidades de recursos y presupuesto.</p>
</li>
<li>
<p><strong>Implemente escalado</strong>: configure su aplicación para escalar según sea necesario, lo que ayudará a reducir los costos.</p>
</li>
<li>
<p><strong>Utilice Instance Savings Plan</strong>: los planes de ahorro de instancias permiten ahorrar hasta un 72% en comparación con los precios de On-Demand.</p>
</li>
<li>
<p><strong>Monitoree y optimice su uso de recursos</strong>: utilice herramientas como <a href="https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/">AWS Cost Explorer</a> y AWS CloudWatch para monitorear y optimizar su uso de recursos.</p>
</li>
</ul>


<p>Al implementar estas estrategias, puede reducir significativamente los costos de desplegar recursos en zonas de Wavelength.</p>


<h2 id="best-practices-and-recommendations" tabindex="-1">Best Practices and Recommendations</h2>


<p>Para aprovechar al máximo las zonas de Wavelength, sigue estas prácticas y recomendaciones para la arquitectura de aplicaciones, la optimización del rendimiento y la observabilidad.</p>


<h3 id="application-architecture" tabindex="-1">Application Architecture</h3>


<p>Al diseñar aplicaciones para zonas de Wavelength, considera la latencia y el ancho de banda. Algunas recomendaciones son:</p>


<ul>
<li>
<p>Usa patrones de diseño que minimicen la latencia, como microservicios o arquitectura de eventos.</p>
</li>
<li>
<p>Ejecuta aplicaciones en la región más cercana a los usuarios finales.</p>
</li>
<li>
<p>Utiliza tecnologías de edge computing para reducir la latencia.</p>
</li>
</ul>


<h3 id="performance-optimization" tabindex="-1">Performance Optimization</h3>


<p>Para optimizar el rendimiento en zonas de Wavelength, ten en cuenta la configuración de la instancia, el almacenamiento y la transferencia de datos. Algunas recomendaciones son:</p>


<ul>
<li>
<p>Elige instancias que se ajusten a tus necesidades de recursos y presupuesto.</p>
</li>
<li>
<p>Implementa escalado para ajustar la capacidad según sea necesario.</p>
</li>
<li>
<p>Usa Instance Savings Plan para ahorrar hasta un 72% en comparación con los precios de On-Demand.</p>
</li>
<li>
<p>Monitorea y optimiza el uso de recursos con herramientas como AWS Cost Explorer y AWS CloudWatch.</p>
</li>
</ul>


<h3 id="monitoring-and-observability" tabindex="-1">Monitoring and Observability</h3>


<p>Para mantener la visibilidad en el rendimiento y la salud de las aplicaciones en zonas de Wavelength, implementa prácticas de monitoreo y observabilidad efectivas. Algunas recomendaciones son:</p>


<ul>
<li>
<p>Usa herramientas de monitoreo como AWS CloudWatch y AWS X-Ray para recopilar y analizar datos de rendimiento.</p>
</li>
<li>
<p>Implementa alertas y notificaciones para detectar problemas de rendimiento y errores.</p>
</li>
<li>
<p>Utiliza métricas y dashboards personalizados para visualizar el rendimiento y la salud de las aplicaciones.</p>
</li>
<li>
<p>Realiza pruebas y simulaciones para evaluar el rendimiento y la escalabilidad de las aplicaciones.</p>
</li>
</ul>


<h2 id="conclusion-and-next-steps" tabindex="-1">Conclusion and Next Steps</h2>


<p>En este artículo, hemos cubierto los conceptos clave de AWS Wavelength, desde su arquitectura hasta su despliegue y seguridad. Hemos visto cómo las Wavelength Zones pueden reducir la latencia y mejorar el rendimiento de aplicaciones que requieren baja latencia o resiliencia en el borde.</p>


<h3 id="puntos-clave" tabindex="-1">Puntos Clave</h3>


<ul>
<li>
<p>AWS Wavelength permite a los desarrolladores crear aplicaciones con baja latencia para dispositivos móviles y usuarios finales.</p>
</li>
<li>
<p>Las Wavelength Zones son despliegues de infraestructura de AWS dentro de los centros de datos de los proveedores de servicios de telecomunicaciones en la red 5G.</p>
</li>
<li>
<p>Los desarrolladores pueden usar Wavelength Zones para reducir la latencia y mejorar el rendimiento de aplicaciones que requieren baja latencia o resiliencia en el borde.</p>
</li>
</ul>


<h3 id="recursos-adicionales" tabindex="-1">Recursos Adicionales</h3>


<ul>
<li>
<p>Para más información sobre AWS Wavelength, visita la <a href="https://docs.aws.amazon.com/wavelength/" rel="noopener noreferrer" target="_blank">documentación oficial de AWS</a>.</p>
</li>
<li>
<p>Consulta los recursos del <a href="https://aws.amazon.com/architecture/well-architected/" rel="noopener noreferrer" target="_blank">AWS Well-Architected Framework</a> para aprender sobre la arquitectura de aplicaciones seguras y escalables.</p>
</li>
<li>
<p>Explora los recursos de <a href="https://aws.amazon.com/training/" rel="noopener noreferrer" target="_blank">AWS Training and Certification</a> para obtener más información sobre capacitación y certificación en AWS.</p>
</li>
</ul>


<p>Esperamos que esta guía te haya sido útil. ¡Sigue aprendiendo sobre AWS Wavelength y cómo puede mejorar el rendimiento de tus aplicaciones!</p>


<h2 id="faqs" tabindex="-1">FAQs</h2>


<h3 id="%C2%BFqu%C3%A9-es-la-zona-de-longitud-de-onda-en-aws%3F" tabindex="-1">¿Qué es la zona de longitud de onda en AWS?</h3>


<p>Las zonas de longitud de onda son despliegues de infraestructura de AWS dentro de los centros de datos de los proveedores de servicios de telecomunicaciones en la red 5G. Esto permite que el tráfico de la aplicación llegue a los servidores sin salir de la red del proveedor de servicios móviles.</p>


<h3 id="%C2%BFc%C3%B3mo-utilizar-aws-wavelength%3F" tabindex="-1">¿Cómo utilizar AWS Wavelength?</h3>


<p>Para utilizar AWS Wavelength, sigue estos pasos:</p>


<ol>
<li>
<p>Configura y accede a tu cuenta de AWS.</p>
</li>
<li>
<p>Selecciona la región que admite tu zona de longitud de onda.</p>
</li>
<li>
<p>En la consola de Amazon EC2, selecciona "Zonas" en la configuración de la cuenta.</p>
</li>
</ol>


<h3 id="%C2%BFcu%C3%A1l-es-el-caso-de-uso-principal-para-aws-wavelength%3F" tabindex="-1">¿Cuál es el caso de uso principal para AWS Wavelength?</h3>


<p>AWS Wavelength se utiliza para soluciones de baja latencia en casos como IoT, producción de medios en vivo y automatización industrial.</p>


<h3 id="%C2%BFqu%C3%A9-es-la-zona-de-aws-wavelength%3F" tabindex="-1">¿Qué es la zona de AWS Wavelength?</h3>


<p>Las zonas de Wavelength son despliegues de infraestructura de AWS dentro de las redes 5G de los proveedores de servicios de telecomunicaciones. Esto permite que el tráfico de la aplicación desde dispositivos 5G llegue a los servidores sin salir de la red del proveedor de servicios móviles.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/">Arquitecturas de Alta Disponibilidad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/">Arquitecturas Multi-Región en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-wavelength-guia-de-escalabilidad-y-optimizacion/">AWS Wavelength: Guía de Escalabilidad y Optimización</a></li>
</ul>
</p>
