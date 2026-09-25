---
title: "¿Qué son los endpoints de VPC en AWS?"
description: "Los endpoints de VPC en AWS ofrecen conexiones seguras y privadas a servicios, optimizando costos y mejorando el rendimiento sin usar Internet público."
publishedAt: "2025-02-17"
publishedTimestamp: "2025-02-17T00:17:36.99Z"
cover: "/assets/blog/784749ef7570c8a485edf97b.jpg"
coverAlt: "Thumbnail for: ¿Qué son los endpoints de VPC en AWS?"
ogImage: "/assets/blog/784749ef7570c8a485edf97b.jpg"
related:
  - title: "Visualiza Costos con AWS Cost and Usage Reports y QuickSight"
    url: "https://dondeaprendoaws.com/blog/visualiza-costos-con-aws-cost-and-usage-reports-y-quicksight/"
    image: "/assets/blog/bcf6fecd181e12cedeeed88a.jpg"
    imageAlt: ""
  - title: "Arquitecturas de Alta Disponibilidad en AWS"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/"
    image: "/assets/blog/1b184fe1242c3e7fb970e984.jpg"
    imageAlt: ""
  - title: "Tipos y Tamaños de Instancias RDS: Guía Completa"
    url: "https://dondeaprendoaws.com/blog/tipos-y-tamanos-de-instancias-rds-guia-completa/"
    image: "/assets/blog/ad2ff3daa90f3b8701cd3eb8.png"
    imageAlt: ""
---

<p><strong>Los endpoints de VPC en <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> permiten conexiones privadas y seguras entre tus VPCs y servicios de <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> sin usar Internet pública.</strong> Existen dos tipos principales:</p>


<ul>
<li><strong>Interface Endpoints</strong>: Basados en <a href="https://docs.aws.amazon.com/vpc/latest/privatelink/what-is-privatelink.html" rel="noopener noreferrer" target="_blank">AWS PrivateLink</a>, funcionan con ENIs (Elastic Network Interfaces) y son compatibles con <a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">más de 69 servicios AWS</a>. Tienen costo ($0.01/hora y $0.01/GB procesado) y permiten control granular mediante grupos de seguridad y acceso desde redes on-premises.</li>
<li><strong>Gateway Endpoints</strong>: Gratuitos, operan mediante tablas de enrutamiento y solo soportan <a href="https://docs.aws.amazon.com/s3/" rel="noopener noreferrer" target="_blank">Amazon S3</a> y <a href="https://docs.aws.amazon.com/dynamodb/" rel="noopener noreferrer" target="_blank">DynamoDB</a>. No requieren configuración adicional ni interfaces de red.</li>
</ul>


<h3 id="comparacion-rapida" tabindex="-1">Comparación rápida:</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>Interface Endpoints</th>
<th>Gateway Endpoints</th>
</tr>
</thead>
<tbody>
<tr>
<td>Servicios soportados</td>
<td>Más de 69</td>
<td>Solo S3 y DynamoDB</td>
</tr>
<tr>
<td>Costo</td>
<td>De pago</td>
<td>Gratuito</td>
</tr>
<tr>
<td>Acceso on-premises</td>
<td>Sí</td>
<td>No</td>
</tr>
<tr>
<td>Tecnología base</td>
<td>AWS PrivateLink con ENIs</td>
<td>Enrutamiento VPC</td>
</tr>
<tr>
<td>Grupos de seguridad</td>
<td>Requeridos</td>
<td>No aplica</td>
</tr>
<tr>
<td>Configuración DNS</td>
<td>Opcional</td>
<td>Automática</td>
</tr>
</tbody>
</table></figure>


<p><strong>¿Cuándo usarlos?</strong></p>


<ul>
<li>Elige Interface Endpoints para varios servicios o acceso híbrido.</li>
<li>Usa Gateway Endpoints para S3/DynamoDB con bajo costo y alta eficiencia.</li>
</ul>


<p>Estos endpoints mejoran la seguridad, reducen costos y optimizan el rendimiento en la red de AWS.</p>


<h2 class="sb" id="2-tipos-de-vpc-endpoints" tabindex="-1">2 Tipos de VPC Endpoints</h2>


<p>AWS ofrece dos tipos principales de VPC Endpoints, cada uno diseñado para diferentes necesidades y escenarios. A continuación, te explicamos en detalle cómo funcionan y cuándo utilizarlos.</p>


<h3 id="interface-endpoints" tabindex="-1">Interface Endpoints</h3>


<p>Los Interface Endpoints, basados en AWS PrivateLink, permiten conectar <a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">servicios AWS</a> a través de interfaces de red elásticas (ENIs) con direcciones IP privadas. Este enfoque asegura que el tráfico nunca se exponga a Internet. Algunas de sus características son:</p>


<ul>
<li><strong>Compatibilidad con más de 69 servicios AWS.</strong></li>
<li><strong>Acceso desde redes on-premises</strong> mediante Direct Connect o VPN <a href="https://keepcoding.io/blog/que-es-vpc-endpoint-aws/" rel="noopener noreferrer" target="_blank"><sup>[1]</sup></a>.</li>
<li><strong>Control de acceso granular</strong> mediante grupos de seguridad.</li>
<li><strong>Modelo de costos:</strong> $0.01 por hora y $0.01 por GB de datos procesados <a href="https://opentextbc.ca/writingforsuccess/chapter/chapter-7-sources-choosing-the-right-ones/" rel="noopener noreferrer" target="_blank"><sup>[5]</sup></a>.</li>
</ul>


<h3 id="gateway-endpoints" tabindex="-1">Gateway Endpoints</h3>


<p>Los Gateway Endpoints funcionan como entradas en las tablas de enrutamiento de la VPC, dirigiendo el tráfico de manera directa a servicios específicos de AWS. Sus características incluyen:</p>


<ul>
<li>Soporte exclusivo para <strong>Amazon S3 y DynamoDB</strong> <a href="https://keepcoding.io/blog/que-es-vpc-endpoint-aws/" rel="noopener noreferrer" target="_blank"><sup>[1]</sup></a><a href="https://tutorialsdojo.com/vpc-interface-endpoint-vs-gateway-endpoint-in-aws/" rel="noopener noreferrer" target="_blank"><sup>[2]</sup></a>.</li>
<li><strong>Sin costo adicional</strong> <a href="https://tutorialsdojo.com/vpc-interface-endpoint-vs-gateway-endpoint-in-aws/" rel="noopener noreferrer" target="_blank"><sup>[2]</sup></a>.</li>
<li><strong>Sin necesidad de interfaces de red adicionales.</strong></li>
<li><strong>Mejor rendimiento y menor latencia</strong> para S3 y DynamoDB dentro de la VPC <a href="https://tutorialsdojo.com/vpc-interface-endpoint-vs-gateway-endpoint-in-aws/" rel="noopener noreferrer" target="_blank"><sup>[2]</sup></a>.</li>
<li><strong>Acceso limitado</strong> únicamente desde dentro de la VPC <a href="https://keepcoding.io/blog/que-es-vpc-endpoint-aws/" rel="noopener noreferrer" target="_blank"><sup>[1]</sup></a>.</li>
</ul>


<h3 id="interface-vs-gateway-endpoints" tabindex="-1">Interface vs Gateway Endpoints</h3>


<p>A la hora de elegir entre estos dos tipos de endpoints, es importante considerar sus diferencias clave:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>Interface Endpoints</th>
<th>Gateway Endpoints</th>
</tr>
</thead>
<tbody>
<tr>
<td>Tecnología base</td>
<td>AWS PrivateLink con ENIs</td>
<td>Enrutamiento VPC</td>
</tr>
<tr>
<td>Servicios soportados</td>
<td>Más de 69 servicios AWS</td>
<td>Solo S3 y DynamoDB</td>
</tr>
<tr>
<td>Costo</td>
<td>De pago</td>
<td>Gratuito</td>
</tr>
<tr>
<td>Acceso on-premises</td>
<td>Sí</td>
<td>No</td>
</tr>
<tr>
<td>Alta disponibilidad</td>
<td>Por zona de disponibilidad</td>
<td>Inherente a la VPC</td>
</tr>
<tr>
<td>Grupos de seguridad</td>
<td>Requeridos</td>
<td>No aplica</td>
</tr>
<tr>
<td>Configuración DNS</td>
<td>Requiere configuración</td>
<td>Automática</td>
</tr>
<tr>
<td>Rendimiento</td>
<td>Latencia adicional por ENI</td>
<td>Latencia mínima</td>
</tr>
</tbody>
</table></figure>


<p><strong>¿Cuándo usar Interface Endpoints?</strong></p>


<ul>
<li>Si necesitas acceso a varios <a href="https://dondeaprendoaws.com/blog/introduccion-a-los-servicios-de-amazon-web-services/">servicios de AWS</a>.</li>
<li>Si deseas conectarte desde redes on-premises.</li>
<li>Si buscas implementar controles de seguridad detallados.</li>
</ul>


<p><strong>¿Cuándo usar Gateway Endpoints?</strong></p>


<ul>
<li>Si solo necesitas acceso a S3 o DynamoDB.</li>
<li>Si prefieres una solución sin costos adicionales.</li>
<li>Si el rendimiento dentro de la VPC es tu prioridad.</li>
</ul>


<p>Estas diferencias te ayudarán a seleccionar el endpoint adecuado para tus necesidades. En las próximas secciones, profundizaremos en cómo implementar estas opciones de manera segura y eficiente.</p>


<h2 class="sb" id="operaciones-de-vpc-endpoint" tabindex="-1">Operaciones de VPC Endpoint</h2>


<p>Después de elegir el tipo de endpoint adecuado, es importante comprender cómo funcionan en la práctica.</p>


<h3 id="trafico-en-red-privada" tabindex="-1">Tráfico en Red Privada</h3>


<p>Los VPC Endpoints aseguran operaciones seguras mediante dos enfoques principales:</p>


<p>La resolución DNS depende del tipo de endpoint:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Endpoint</th>
<th>DNS</th>
<th>Detalles de Funcionamiento</th>
</tr>
</thead>
<tbody>
<tr>
<td>Interface</td>
<td>DNS Privado</td>
<td>Resuelve a direcciones IP privadas de ENIs en subredes específicas</td>
</tr>
<tr>
<td>Gateway</td>
<td>Actualización Automática</td>
<td>Configura rutas directas en tablas de enrutamiento</td>
</tr>
</tbody>
</table></figure>


<p>Este flujo privado refuerza la seguridad descrita anteriormente en las <a href="https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/">ventajas de los VPC Endpoints</a>.</p>


<h3 id="caracteristicas-de-alta-disponibilidad" tabindex="-1">Características de Alta Disponibilidad</h3>


<p>AWS asegura alta disponibilidad mediante redundancia en múltiples zonas de disponibilidad (multi-AZ), failover automático, balanceo de carga integrado y escalado horizontal sin restricciones predefinidas de ancho de banda <a href="https://docs.aws.amazon.com/whitepapers/latest/aws-privatelink/what-are-vpc-endpoints.html" rel="noopener noreferrer" target="_blank"><sup>[3]</sup></a>.</p>


<p><strong>Escalabilidad Horizontal</strong></p>


<ul>
<li>Escalado automático basado en la carga.</li>
<li>Sin límites predefinidos de ancho de banda.</li>
<li>Rendimiento constante incluso bajo alta demanda <a href="https://docs.aws.amazon.com/whitepapers/latest/aws-privatelink/what-are-vpc-endpoints.html" rel="noopener noreferrer" target="_blank"><sup>[3]</sup></a>.</li>
</ul>


<p>Estas capacidades son clave para garantizar operaciones continuas, lo cual es fundamental en los escenarios que se analizarán más adelante.</p>


<h3 id="pasos-para-configuracion" tabindex="-1">Pasos para Configuración</h3>


<ul>
<li>
<strong>Configuración Inicial</strong>
<ul>
<li>Para Interface Endpoints:
<ul>
<li>Elegir subredes para las ENIs.</li>
<li>Configurar grupos de seguridad.</li>
<li>Configuración opcional de DNS.</li>
</ul>
</li>
<li>Para Gateway Endpoints:
<ul>
<li>Actualización automática de las tablas de enrutamiento.</li>
</ul>
</li>
</ul>
</li>
<li>
<strong>Monitoreo</strong>
<ul>
<li>Usar registros de flujo VPC.</li>
<li>Supervisar métricas en <a href="https://docs.aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">CloudWatch</a>.</li>
<li>Realizar revisiones regulares de las políticas configuradas.</li>
</ul>
</li>
</ul>


<h2 class="sb" id="casos-de-uso-comunes-de-vpc-endpoints" tabindex="-1">Casos de Uso Comunes de VPC Endpoints</h2>


<p>Los VPC Endpoints ofrecen soluciones prácticas para diversas necesidades empresariales en AWS. Aquí exploramos los escenarios donde su implementación resulta más útil.</p>


<h3 id="requisitos-de-seguridad" tabindex="-1">Requisitos de Seguridad</h3>


<p>Los VPC Endpoints permiten un control detallado sobre el acceso, utilizando herramientas como:</p>


<ul>
<li><strong>Políticas de Endpoint</strong>: Restringen el acceso según usuarios de IAM y direcciones IP específicas.</li>
<li><strong>Grupos de Seguridad</strong>: Gestionan el tráfico a nivel de red para mayor control.</li>
<li><strong>Registros <a href="https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html" rel="noopener noreferrer" target="_blank">CloudTrail</a></strong>: Proveen auditoría completa de las llamadas API realizadas.</li>
</ul>


<h3 id="ahorro-en-costos-de-red" tabindex="-1">Ahorro en Costos de Red</h3>


<p>Sustituir los NAT Gateways por Gateway Endpoints puede reducir gastos al evitar cargos de procesamiento de datos. Entre los beneficios se incluyen:</p>


<ul>
<li><strong>Eliminación de costos por hora</strong> asociados al uso de NAT Gateways.</li>
<li><strong>Evitar cargos adicionales</strong> por procesamiento de datos.</li>
<li><strong>Sin costo adicional</strong> por el <a href="https://cloudiostrategy.com/endpoint-proxy-con-api-gateway/" rel="noopener noreferrer" target="_blank">uso de Gateway Endpoints</a>.</li>
</ul>


<h3 id="configuracion-de-redes-hibridas" tabindex="-1">Configuración de Redes Híbridas</h3>


<p>Los VPC Endpoints también son clave para arquitecturas híbridas, especialmente cuando se integran con <a href="https://docs.aws.amazon.com/directconnect/" rel="noopener noreferrer" target="_blank">AWS Direct Connect</a>. Esto permite:</p>


<ul>
<li><strong>Acceso privado</strong> a servicios de AWS desde la red local.</li>
<li><strong>Mejor rendimiento</strong> gracias a una latencia más baja.</li>
<li><strong>Consistencia en el throughput</strong>, ideal para servicios como S3 y DynamoDB.</li>
</ul>


<p>Para implementar redes híbridas de forma efectiva, es necesario:</p>


<ul>
<li>Configurar una <em>Interfaz Virtual Privada (VIF)</em> para Direct Connect.</li>
<li>Implementar Interface Endpoints para los servicios que se requieran <a href="https://keepcoding.io/blog/que-es-vpc-endpoint-aws/" rel="noopener noreferrer" target="_blank"><sup>[1]</sup></a><a href="https://docs.aws.amazon.com/govcloud-us/latest/UserGuide/using-govcloud-vpc-endpoints.html" rel="noopener noreferrer" target="_blank"><sup>[4]</sup></a>.</li>
</ul>


<p>La integración con Direct Connect mejora el rendimiento de servicios críticos, como S3, mientras asegura una conexión privada y segura <a href="https://keepcoding.io/blog/que-es-vpc-endpoint-aws/" rel="noopener noreferrer" target="_blank"><sup>[1]</sup></a><a href="https://docs.aws.amazon.com/whitepapers/latest/aws-privatelink/what-are-vpc-endpoints.html" rel="noopener noreferrer" target="_blank"><sup>[3]</sup></a>. Esta configuración es especialmente útil para empresas que necesitan acceso privado a AWS desde su infraestructura local, combinando seguridad y eficiencia.</p>




<h2 class="sb" id="pautas-de-implementacion" tabindex="-1">Pautas de Implementación</h2>


<h3 id="configuracion-multi-vpc" tabindex="-1">Configuración Multi-VPC</h3>


<p>Puedes configurar endpoints en varias VPCs utilizando <strong><a href="https://docs.aws.amazon.com/ram/latest/userguide/what-is.html" rel="noopener noreferrer" target="_blank">AWS Resource Access Manager</a> (RAM)</strong> para compartirlos entre cuentas. En arquitecturas más complejas:</p>


<ul>
<li>El VPC central (hub) aloja los endpoints que serán compartidos.</li>
<li>Los VPCs secundarios (spokes) se conectan al hub a través de <strong><a href="https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html" rel="noopener noreferrer" target="_blank">AWS Transit Gateway</a></strong>.</li>
<li>Las tablas de enrutamiento se configuran para dirigir el tráfico hacia los endpoints compartidos.</li>
</ul>


<h3 id="control-de-acceso" tabindex="-1">Control de Acceso</h3>


<p>La seguridad de los VPC Endpoints se gestiona mediante diferentes niveles de control, como se detalla en la siguiente tabla:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Política</th>
<th>Uso Principal</th>
<th>Ventaja</th>
</tr>
</thead>
<tbody>
<tr>
<td>Políticas de Endpoint</td>
<td>Control de acciones específicas</td>
<td>Permite restricciones detalladas por principal y recurso</td>
</tr>
<tr>
<td>Políticas basadas en recursos</td>
<td>Control a nivel de servicio</td>
<td>Gestiona el acceso específico para cada endpoint</td>
</tr>
<tr>
<td>Políticas basadas en identidad</td>
<td>Control administrativo</td>
<td>Facilita la gestión de creación y modificación</td>
</tr>
</tbody>
</table></figure>


<p>Asegúrate de aplicar el <strong>principio de mínimo privilegio</strong> en las políticas IAM. Esto incluye definir:</p>


<ul>
<li>Usuarios o roles que tendrán autorización.</li>
<li>Acciones específicas que se les permitirá realizar.</li>
<li>Recursos a los que podrán acceder.</li>
<li>Condiciones particulares que se deben cumplir.</li>
</ul>


<p>Estos controles son clave para reforzar la seguridad mencionada en la sección de Requisitos de Seguridad.</p>


<h3 id="limites-actuales" tabindex="-1">Límites Actuales</h3>


<p>Al implementar endpoints, ten en cuenta los siguientes factores:</p>


<ul>
<li><strong>Compatibilidad regional:</strong> No funcionan entre regiones diferentes.</li>
<li><strong>Límites de ancho de banda:</strong> Los Interface Endpoints tienen restricciones de capacidad.</li>
<li><strong>Cuotas:</strong> Existen límites en la cantidad de endpoints por región y por VPC.</li>
</ul>


<h2 class="sb" id="conclusion" tabindex="-1">Conclusión</h2>


<h3 id="puntos-clave" tabindex="-1">Puntos Clave</h3>


<p>Los VPC Endpoints permiten una <a href="https://dondeaprendoaws.com/blog/configurar-aws-para-comunicacion-en-equipo-7-pasos/">conexión privada a los servicios de AWS</a>, ofreciendo tres beneficios principales: <strong>mayor seguridad</strong> al evitar el uso de internet público, <strong>mejor rendimiento</strong> y <strong>ahorro en costos operativos</strong>. Al seguir las recomendaciones mencionadas anteriormente, es posible diseñar arquitecturas más seguras y eficientes.</p>


<h3 id="recursos-adicionales" tabindex="-1">Recursos Adicionales</h3>


<p>Si deseas profundizar en el tema de VPC Endpoints y otros servicios de AWS en español, visita <strong><a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a></strong> (https://dondeaprendoaws.com).</p>


<h2 class="sb" id="faqs" tabindex="-1">FAQs</h2>


<h3 id="que-es-amazon-vpc-endpoint" tabindex="-1">¿Qué es Amazon VPC Endpoint?</h3>


<p>Es un recurso virtual que permite la comunicación privada entre tu VPC y servicios de AWS sin necesidad de usar internet pública. Esto se explicó en detalle en la sección 'Conceptos básicos'.</p>


<h3 id="cual-es-la-diferencia-entre-un-endpoint-de-gateway-s3-y-un-endpoint-de-interfaz" tabindex="-1">¿Cuál es la diferencia entre un endpoint de gateway S3 y un endpoint de interfaz?</h3>


<ul>
<li><strong>Gateway Endpoints</strong>: Son gratuitos y se limitan a S3 y DynamoDB. Utilizan tablas de rutas para la comunicación.</li>
<li><strong>Interface Endpoints</strong>: Son de pago y compatibles con más de 69 servicios. Funcionan a través de ENIs usando PrivateLink.</li>
</ul>


<h3 id="cuales-son-las-ventajas-de-los-vpc-endpoints" tabindex="-1">¿Cuáles son las ventajas de los VPC endpoints?</h3>


<p>Ofrecen mejoras en seguridad, reducción de costos y un mejor rendimiento, como se describió en la sección 'Ventajas de los VPC Endpoints'.</p>


<h3 id="cuales-son-los-beneficios-especificos-de-los-vpc-endpoints" tabindex="-1">¿Cuáles son los beneficios específicos de los VPC endpoints?</h3>


<p>Son los mismos que los mencionados anteriormente: mayor seguridad, eficiencia en costos y mejor rendimiento.</p>


<h3 id="cual-es-la-diferencia-entre-gateway-e-interfaz" tabindex="-1">¿Cuál es la diferencia entre gateway e interfaz?</h3>


<p>Las diferencias principales incluyen los servicios compatibles, los costos y la forma en que se implementan técnicamente. Para más detalles, revisa la tabla comparativa en la sección 'Interface vs Gateway Endpoints'. Esta distinción es clave para decidir cuál usar en escenarios específicos, como se analizó en la sección 'Implementation Guidelines'.</p>


<h2>Publicaciones de blog relacionadas</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/">Conceptos Básicos y Avanzados de Amazon VPC</a></li><li><a href="https://dondeaprendoaws.com/blog/amazon-cloudfront-comprendiendo-el-cdn-de-aws/">Amazon CloudFront: Comprendiendo el CDN de AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/10-estrategias-para-optimizar-costos-de-red-en-aws/">10 Estrategias para Optimizar Costos de Red en AWS</a></li></ul>
