---
title: "Checklist: Servicios AWS Esenciales para SAA-C03"
description: "Prepárate para el examen SAA-C03 de AWS con una guía completa sobre servicios, arquitecturas y estrategias de estudio efectivas."
publishedAt: "2025-04-03"
publishedTimestamp: "2025-04-03T01:53:13.640000+00:00"
cover: "/assets/blog/eadb9eb1eb9dfe22a3da22e2.jpg"
coverAlt: "Thumbnail for: Checklist: Servicios AWS Esenciales para SAA-C03"
ogImage: "/assets/blog/eadb9eb1eb9dfe22a3da22e2.jpg"
indexOrder: 11
related:
  - title: "Concurrencia Aprovisionada: Solución a Cold Starts en AWS Lambda"
    url: "https://dondeaprendoaws.com/blog/concurrencia-aprovisionada-solucion-a-cold-starts-en-aws-lambda/"
    image: "/assets/blog/4efa7f16e3c389136cc18ae2.png"
    imageAlt: "Thumbnail for: Concurrencia Aprovisionada: Solución a Cold Starts en AWS Lambda"
  - title: "Guía de Amazon ElastiCache: Almacenamiento en Caché en Memoria"
    url: "https://dondeaprendoaws.com/blog/guia-de-amazon-elasticache-almacenamiento-en-cache-en-memoria/"
    image: "/assets/blog/ddce4c2f6e4102cbcd2b90ad.png"
    imageAlt: "Thumbnail for: Guía de Amazon ElastiCache: Almacenamiento en Caché en Memoria"
  - title: "Comprendiendo Kubernetes y Amazon EKS"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-kubernetes-y-amazon-eks/"
    image: "/assets/blog/066e0f22ea88769f71d0c039.png"
    imageAlt: "Thumbnail for: Comprendiendo Kubernetes y Amazon EKS"
---

<p><strong>¿Te estás preparando para el examen <a href="https://aws.amazon.com/" rel="nofollow noopener noreferrer" target="_blank">AWS</a> Solutions Architect Associate (SAA-C03)? Aquí tienes todo lo que necesitas saber, rápido y claro:</strong></p>
<ul>
<li><strong>Duración del examen:</strong> 130 minutos</li>
<li><strong>Formato:</strong> 65 preguntas de opción múltiple</li>
<li><strong>Idiomas disponibles:</strong> Inglés, japonés, coreano y chino simplificado</li>
<li><strong>Costo:</strong> 150 USD</li>
<li><strong>Puntuación mínima para aprobar:</strong> 720/1000</li>
<li><strong>Validez:</strong> 3 años</li>
</ul>
<h3 id="areas-clave-del-examen" tabindex="-1">Áreas clave del examen:</h3>
<ol>
<li><strong>Arquitecturas seguras:</strong> 30%</li>
<li><strong>Arquitecturas resilientes:</strong> 26%</li>
<li><strong>Arquitecturas de alto rendimiento:</strong> 24%</li>
<li><strong>Arquitecturas rentables:</strong> 20%</li>
</ol>
<h3 id="servicios-clave-de-aws-que-debes-dominar" tabindex="-1">Servicios clave de <a href="https://aws.amazon.com/" rel="nofollow noopener noreferrer" target="_blank">AWS</a> que debes dominar:</h3>
<p><figure><img alt="AWS" src="/assets/blog/c1f03087271c7d779f3bad96.jpg" style="width:100%;border-radius:16px;"></figure></p>
<ul>
<li><strong>Compute:</strong> EC2, Lambda, Elastic Load Balancing</li>
<li><strong>Storage:</strong> S3, EBS, EFS</li>
<li><strong>Networking:</strong> VPC, Route 53, CloudFront</li>
<li><strong>Databases:</strong> RDS, DynamoDB, ElastiCache</li>
<li><strong>Security:</strong> IAM, KMS, Shield/WAF</li>
</ul>
<h3 id="principios-esenciales-del-aws-well-architected-framework" tabindex="-1">Principios esenciales del AWS Well-Architected Framework:</h3>
<ul>
<li><strong>Seguridad:</strong> Protección de datos e infraestructura.</li>
<li><strong>Fiabilidad:</strong> Alta disponibilidad y recuperación ante fallos.</li>
<li><strong>Optimización de costes:</strong> Uso eficiente de recursos.</li>
<li><strong>Rendimiento:</strong> Escalabilidad y selección adecuada de servicios.</li>
<li><strong>Excelencia operativa:</strong> Automatización y supervisión constante.</li>
</ul>
<p><strong>Consejo práctico:</strong> Usa el <a href="https://dondeaprendoaws.com/blog/aws-free-tier-guia-para-principiantes-2024/">Free Tier de AWS</a> para practicar con servicios clave como EC2, S3 y Lambda. Complementa con simulacros de examen y consulta la documentación oficial de AWS.</p>
<p>¡Prepárate con estrategia y enfócate en los servicios y conceptos más importantes para aprobar con éxito!</p>
<h2 class="sb h2-sbb-cls" id="servicios-de-aws-para-saa-c03" tabindex="-1">Servicios de AWS para SAA-C03</h2>
<p>Para el examen SAA-C03, es clave conocer en detalle ciertos <a href="https://dondeaprendoaws.com/blog/introduccion-a-los-servicios-de-amazon-web-services/">servicios de AWS</a> organizados por categoría. Estos servicios forman la base para diseñar arquitecturas seguras y bien integradas. Aquí te presentamos una descripción de las categorías y sus servicios más relevantes.</p>
<h3 id="compute" tabindex="-1">Compute</h3>
<p>Los servicios de computación son el pilar de muchas arquitecturas:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Características principales</th>
<th>Enfoque del examen</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://docs.aws.amazon.com/ec2/" rel="nofollow noopener noreferrer" target="_blank">Amazon EC2</a></td>
<td>Variedad de tipos de instancias, Auto Scaling, Spot Instances</td>
<td>Selección de instancias, estrategias de escalado, optimización de costes</td>
</tr>
<tr>
<td><a href="https://docs.aws.amazon.com/lambda/" rel="nofollow noopener noreferrer" target="_blank">AWS Lambda</a></td>
<td>Ejecución sin servidor, activación por eventos, límites de tiempo</td>
<td><a href="https://dondeaprendoaws.com/blog/microservicios-en-aws-utilizando-aws-lambda/">Casos de uso serverless</a>, integración con otros servicios, patrones arquitectónicos</td>
</tr>
<tr>
<td>Elastic Load Balancing</td>
<td>Tipos ALB, NLB y CLB</td>
<td>Enrutamiento, configuración de health checks, SSL/TLS</td>
</tr>
</tbody>
</table></figure>
<h3 id="storage" tabindex="-1">Storage</h3>
<p>El almacenamiento es esencial para gestionar datos de forma eficiente:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Casos de uso</th>
<th>Detalles clave</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://docs.aws.amazon.com/s3/" rel="nofollow noopener noreferrer" target="_blank">Amazon S3</a></td>
<td>Almacenamiento de objetos, hosting web estático, backup</td>
<td>Clases de almacenamiento, políticas de ciclo de vida, versionado</td>
</tr>
<tr>
<td>Amazon EBS</td>
<td>Volúmenes persistentes para <a href="https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/">bases de datos</a> y aplicaciones</td>
<td>Tipos de volúmenes, IOPS provisionado, snapshots</td>
</tr>
<tr>
<td><a href="https://dondeaprendoaws.com/blog/guia-completa-sobre-amazon-efs-y-fsx/">Amazon EFS</a></td>
<td>Sistemas de archivos compartidos, soporte para cargas Linux</td>
<td>Modos de rendimiento, clases de almacenamiento, soporte multi-AZ</td>
</tr>
</tbody>
</table></figure>
<h3 id="networking" tabindex="-1">Networking</h3>
<p>La conectividad es esencial para integrar servicios y aplicaciones:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Funcionalidad</th>
<th>Puntos clave</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/">Amazon VPC</a></td>
<td>Redes privadas virtuales, subredes, gateways</td>
<td>Diseño de CIDR, diferencias entre Security Groups y NACLs, conectividad híbrida</td>
</tr>
<tr>
<td>Route 53</td>
<td>DNS, políticas de enrutamiento, health checks</td>
<td>Tipos de registros, estrategias de failover, enrutamiento por latencia y geolocalización</td>
</tr>
<tr>
<td>CloudFront</td>
<td>CDN global, SSL/TLS, integración con WAF</td>
<td>Configuración de origen, caché, seguridad de contenido</td>
</tr>
</tbody>
</table></figure>
<h3 id="databases" tabindex="-1">Databases</h3>
<p>Las bases de datos son esenciales para manejar datos estructurados y no estructurados:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Tipo</th>
<th>Características principales</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://docs.aws.amazon.com/rds/" rel="nofollow noopener noreferrer" target="_blank">Amazon RDS</a></td>
<td>Relacional</td>
<td>Multi-AZ, replicas de lectura, backups automáticos</td>
</tr>
<tr>
<td>DynamoDB</td>
<td>NoSQL</td>
<td>Consistencia eventual o fuerte, autoescalado, tablas globales</td>
</tr>
<tr>
<td>ElastiCache</td>
<td>En memoria</td>
<td>Redis/Memcached, patrones de caché, persistencia de datos</td>
</tr>
</tbody>
</table></figure>
<h3 id="security" tabindex="-1">Security</h3>
<p>La seguridad está presente en todas las capas de la arquitectura:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Función</th>
<th>Aspectos destacados</th>
</tr>
</thead>
<tbody>
<tr>
<td>IAM</td>
<td>Control de acceso</td>
<td>Roles, políticas, MFA, federación</td>
</tr>
<tr>
<td>KMS</td>
<td>Gestión de claves</td>
<td>Rotación de claves, CMKs, integración con servicios</td>
</tr>
<tr>
<td>Shield/WAF</td>
<td>Protección contra DDoS y amenazas web</td>
<td>Reglas personalizadas, protección de aplicaciones, monitorización activa</td>
</tr>
</tbody>
</table></figure>
<p>Dominar estos servicios implica comprender sus características, limitaciones y los escenarios en los que son más efectivos para crear soluciones confiables y protegidas.</p>
<h2 class="sb h2-sbb-cls" id="aws-well-architected-framework" tabindex="-1">AWS Well-Architected Framework</h2>
<p>El AWS Well-Architected Framework juega un papel importante en el examen SAA-C03, ya que establece prácticas recomendadas para construir <a href="https://dondeaprendoaws.com/blog/arquitectura-en-la-nube-tendencias-emergentes/">arquitecturas en la nube</a>. Esta sección complementa los conocimientos sobre servicios clave, destacando cómo se integran bajo principios arquitectónicos sólidos.</p>
<h3 id="pilares-del-framework" tabindex="-1">Pilares del Framework</h3>
<p>El framework está estructurado en cinco pilares fundamentales que todo arquitecto de soluciones debe conocer a fondo:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Pilar</th>
<th>Objetivo principal</th>
<th>Aspectos clave para SAA-C03</th>
</tr>
</thead>
<tbody>
<tr>
<td>Excelencia Operativa</td>
<td>Ejecutar y supervisar sistemas de forma eficaz</td>
<td>Automatización, observabilidad, gestión de eventos</td>
</tr>
<tr>
<td>Seguridad</td>
<td>Proteger datos e infraestructura</td>
<td>Encriptación, gestión de identidades, control de acceso</td>
</tr>
<tr>
<td>Fiabilidad</td>
<td>Asegurar la continuidad del servicio</td>
<td>Alta disponibilidad, <a href="https://dondeaprendoaws.com/blog/estrategias-de-recuperacion-de-desastres-en-aws/">recuperación ante desastres</a>, tolerancia a fallos</td>
</tr>
<tr>
<td>Eficiencia del Rendimiento</td>
<td>Usar recursos computacionales de manera óptima</td>
<td>Selección de servicios, escalabilidad, monitorización</td>
</tr>
<tr>
<td>Optimización de Costes</td>
<td>Maximizar el valor empresarial</td>
<td>Dimensionamiento adecuado, modelos de precios, análisis de costes</td>
</tr>
</tbody>
</table></figure>
<p>A continuación, se explica cómo los pilares se relacionan con los servicios de AWS:</p>
<p><strong>Excelencia Operativa</strong>:</p>
<ul>
<li><a href="https://docs.aws.amazon.com/cloudwatch/" rel="nofollow noopener noreferrer" target="_blank">AWS CloudWatch</a> para supervisar métricas y logs.</li>
<li><a href="https://docs.aws.amazon.com/systems-manager/" rel="nofollow noopener noreferrer" target="_blank">AWS Systems Manager</a> para automatizar tareas administrativas.</li>
<li><a href="https://docs.aws.amazon.com/cloudformation/" rel="nofollow noopener noreferrer" target="_blank">AWS CloudFormation</a> para administrar la infraestructura como código.</li>
</ul>
<p><strong>Seguridad</strong>:</p>
<ul>
<li>Uso de IAM con privilegios mínimos.</li>
<li>Cifrado de datos con AWS KMS.</li>
<li>Protección de aplicaciones web mediante <a href="https://dondeaprendoaws.com/blog/aws-web-application-firewall-waf/">AWS WAF</a>.</li>
</ul>
<p><strong>Fiabilidad</strong>:</p>
<ul>
<li>Implementación de arquitecturas multi-AZ.</li>
<li>Uso de Auto Scaling para manejar cambios en la demanda.</li>
<li>Realización de copias de seguridad automatizadas.</li>
</ul>
<p><strong>Eficiencia del Rendimiento</strong>:</p>
<ul>
<li>Selección adecuada de <a href="https://dondeaprendoaws.com/blog/tipos-y-tamanos-de-instancias-ec2-guia-completa/">instancias EC2</a> según las necesidades.</li>
<li>Distribución de contenido con CloudFront.</li>
<li>Uso de ElastiCache para almacenar datos en caché.</li>
</ul>
<p><strong>Optimización de Costes</strong>:</p>
<ul>
<li>Uso de instancias reservadas y Spot para reducir costes.</li>
<li>Configuración de políticas de ciclo de vida en S3.</li>
<li>Monitorización de gastos con <a href="https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/">AWS Cost Explorer</a>.</li>
</ul>
<p>Estos pilares trabajan juntos para garantizar que las arquitecturas sean sólidas. Por ejemplo, una estrategia de optimización de costes debe equilibrarse con las necesidades de rendimiento y fiabilidad.</p>
<p>Comprender y aplicar el Well-Architected Framework te permitirá diseñar soluciones que equilibren rendimiento, costes, seguridad y fiabilidad de manera efectiva.</p>
<h2 class="sb h2-sbb-cls" id="guia-de-estudio" tabindex="-1">Guía de Estudio</h2>
<h3 id="laboratorios-practicos" tabindex="-1">Laboratorios Prácticos</h3>
<p>Aprovecha el Free Tier de AWS durante 12 meses para trabajar con servicios clave. Aquí tienes un resumen de los servicios más útiles para tus prácticas:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Límites Free Tier</th>
<th>Casos de Uso Recomendados</th>
</tr>
</thead>
<tbody>
<tr>
<td>EC2</td>
<td>750 horas/mes</td>
<td>Configuración de alta disponibilidad, balanceo de carga</td>
</tr>
<tr>
<td>S3</td>
<td>5 GB almacenamiento</td>
<td>Políticas de ciclo de vida, versionado</td>
</tr>
<tr>
<td>RDS</td>
<td>750 horas/mes</td>
<td>Configuración de réplicas de lectura, backups</td>
</tr>
<tr>
<td>Lambda</td>
<td>1 millón de solicitudes/mes</td>
<td><a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">Arquitecturas serverless</a>, integraciones</td>
</tr>
</tbody>
</table></figure>
<h3 id="pruebas-de-practica" tabindex="-1">Pruebas de Práctica</h3>
<p>Las pruebas de práctica son clave para entender el formato y nivel del examen SAA-C03. Aquí tienes algunos consejos para sacarles el máximo partido:</p>
<ul>
<li>Realiza al menos tres exámenes completos.</li>
<li>Revisa las respuestas incorrectas para identificar áreas de mejora.</li>
<li>Cronometra tus pruebas para acostumbrarte al tiempo real del examen (130 minutos).</li>
<li>Trabaja en escenarios integrados para aplicar los conceptos.</li>
</ul>
<p>Refuerza tus conocimientos con la documentación y guías oficiales de AWS.</p>
<h3 id="materiales-de-estudio" tabindex="-1">Materiales de Estudio</h3>
<p>La documentación oficial de AWS es tu mejor aliada para prepararte. Estos son los recursos más útiles:</p>
<ul>
<li><strong><a href="https://dondeaprendoaws.com/blog/5-whitepapers-de-aws-para-aprobar-examenes/">AWS Whitepapers</a></strong>: Enfócate en los relacionados con arquitectura y seguridad.</li>
<li><strong>Guías de Usuario</strong>: Consulta documentación detallada de cada servicio.</li>
<li><strong>AWS Well-Architected Framework</strong>: Aprende los principios y <a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">mejores prácticas</a>.</li>
<li><strong>AWS Architecture Center</strong>: Revisa patrones de diseño y ejemplos prácticos.</li>
</ul>
<h3 id="recursos-en-espanol" tabindex="-1">Recursos en Español</h3>
<p>Para complementar tu preparación, utiliza recursos de la comunidad hispanohablante como los de <a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a>, que explican conceptos en español y ofrecen guías prácticas:</p>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">Artículos sobre servicios específicos de AWS</a>.</li>
<li>Explicaciones claras de conceptos avanzados.</li>
<li>Instrucciones paso a paso para configuraciones comunes.</li>
<li>Referencias a otros <a href="https://dondeaprendoaws.com/blog/recursos-en-espanol-para-certificacion-aws-cloud-practitioner/">recursos en español</a> de la comunidad AWS.</li>
</ul>
<p>Combina estos recursos con práctica constante y la documentación oficial. El examen se enfoca en la aplicación de conocimientos, no solo en la teoría.</p>
<h2 class="sb h2-sbb-cls" id="resumen" tabindex="-1">Resumen</h2>
<h3 id="puntos-clave" tabindex="-1">Puntos Clave</h3>
<p>El examen SAA-C03 exige un conocimiento sólido de los servicios más importantes de AWS. Aquí tienes los aspectos esenciales que debes tener en mente:</p>
<ul>
<li><strong>Servicios Principales</strong>: Dedica tiempo a estudiar servicios como EC2, S3, RDS y Lambda, que son claves para el examen.</li>
<li><strong>Arquitectura</strong>: Aprende los principios del AWS Well-Architected Framework y los patrones de diseño más comunes.</li>
<li><strong>Práctica en Laboratorios</strong>: Aprovecha el Free Tier de AWS para trabajar en entornos reales.</li>
<li><strong>Documentación Oficial</strong>: Consulta whitepapers y guías proporcionadas por AWS.</li>
</ul>
<p>Con estos puntos claros, sigue una estrategia organizada para optimizar tu preparación.</p>
<h3 id="proximos-pasos" tabindex="-1">Próximos Pasos</h3>
<ol>
<li>
<strong>Examen Diagnóstico</strong>
Haz una prueba de práctica para identificar tus puntos débiles y enfocarte en ellos.
</li>
<li>
<strong>Organiza tu Estudio</strong>
Diseña un calendario que combine teoría, ejercicios prácticos y simulacros de examen.
</li>
<li>
<strong>Recopila Recursos</strong>
Asegúrate de tener todo lo necesario para tu preparación:
<ul>
<li>Configura tu cuenta de AWS para realizar laboratorios.</li>
<li>Descarga guías y documentación relevante.</li>
<li>Lee artículos en español de Dónde Aprendo AWS.</li>
<li>Programa simulacros de examen para medir tu progreso.</li>
</ul>
</li>
</ol>
<p>Sigue estos pasos y estarás mejor preparado para afrontar el examen SAA-C03.</p>
<h2>Related posts</h2><ul><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-los-servicios-de-amazon-web-services/">Introducción a los servicios de Amazon Web Services</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/guia-de-estudio-aws-certified-cloud-practitioner-clf-c02/">Guía de Estudio AWS Certified Cloud Practitioner CLF-C02</a></li><li><a href="https://dondeaprendoaws.com/blog/checklist-para-automatizar-cumplimiento-en-aws/">Checklist para automatizar cumplimiento en AWS</a></li></ul>