---
title: "Diferencias: Endpoint de interfaz vs. Endpoint de gateway"
description: "Compara los endpoints de interfaz y gateway en AWS para determinar cuál se adapta mejor a tus necesidades de conectividad y rendimiento."
publishedAt: "2025-02-20"
publishedTimestamp: "2025-02-20T00:10:01.732Z"
cover: "/assets/blog/3565dcd644c1d6c694694985.jpg"
coverAlt: "Thumbnail for: Diferencias: Endpoint de interfaz vs. Endpoint de gateway"
ogImage: "/assets/blog/3565dcd644c1d6c694694985.jpg"
related:
  - title: "Guía para Crear APIs Serverless con AWS Lambda y API Gateway"
    url: "https://dondeaprendoaws.com/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/"
    image: "/assets/blog/919d108a9faabfb32e4a011d.jpg"
    imageAlt: ""
  - title: "AWS HealthScribe: IA Generativa para Diagnósticos Médicos"
    url: "https://dondeaprendoaws.com/blog/aws-healthscribe-ia-generativa-para-diagnosticos-medicos/"
    image: "/assets/blog/cac2ef4bd724a0e8247e5e35.jpg"
    imageAlt: ""
  - title: "Amazon DynamoDB: Guía Básica"
    url: "https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/"
    image: "/assets/blog/a45735d6d45d12223256fbc4.png"
    imageAlt: ""
---

<p>Los <strong>VPC Endpoints</strong> en AWS permiten conexiones privadas y seguras entre tu VPC y <a href="https://dondeaprendoaws.com/blog/introduccion-a-los-servicios-de-amazon-web-services/">servicios de AWS</a>. Los más comunes son los <strong>endpoints de interfaz</strong> y los <strong>endpoints de gateway</strong>. Aquí tienes un resumen rápido:</p>


<h3 id="endpoints-de-interfaz" tabindex="-1">Endpoints de Interfaz</h3>


<ul>
<li><strong>Servicios soportados:</strong> Varios servicios de AWS (SQS, SNS, <a href="https://docs.aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">CloudWatch</a>, etc.).</li>
<li><strong>Conexión:</strong> Usan ENIs (interfaces de red elásticas) con IPs privadas y <a href="https://docs.aws.amazon.com/vpc/latest/privatelink/what-is-privatelink.html" rel="noopener noreferrer" target="_blank">AWS PrivateLink</a>.</li>
<li><strong>Costo:</strong> $0.01/hora por AZ + cargos por datos procesados.</li>
<li><strong>Rendimiento:</strong> Hasta 10 Gbps por ENI, con ráfagas de hasta 40 Gbps.</li>
<li><strong>Seguridad:</strong> Configurables con grupos de seguridad.</li>
</ul>


<h3 id="endpoints-de-gateway" tabindex="-1">Endpoints de Gateway</h3>


<ul>
<li><strong>Servicios soportados:</strong> Solo Amazon S3 y <a href="https://docs.aws.amazon.com/dynamodb/" rel="noopener noreferrer" target="_blank">DynamoDB</a>.</li>
<li><strong>Conexión:</strong> Configuración directa en tablas de enrutamiento.</li>
<li><strong>Costo:</strong> Completamente gratuitos.</li>
<li><strong>Rendimiento:</strong> Ilimitado.</li>
<li><strong>Simplicidad:</strong> Más fáciles de configurar y mantener.</li>
</ul>


<h3 id="comparacion-rapida" tabindex="-1">Comparación Rápida</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>Endpoint de Interfaz</th>
<th>Endpoint de Gateway</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Servicios Soportados</strong></td>
<td>Varios servicios de AWS</td>
<td>Solo S3 y DynamoDB</td>
</tr>
<tr>
<td><strong>Costo</strong></td>
<td>$0.01/hora/AZ + datos procesados</td>
<td>Gratuito</td>
</tr>
<tr>
<td><strong>Rendimiento</strong></td>
<td>10 Gbps (hasta 40 Gbps en ráfaga)</td>
<td>Sin límite</td>
</tr>
<tr>
<td><strong>Conexión</strong></td>
<td>ENIs con IPs privadas</td>
<td>Tablas de enrutamiento</td>
</tr>
<tr>
<td><strong>Control de acceso</strong></td>
<td>Grupos de seguridad</td>
<td>Políticas de endpoint</td>
</tr>
</tbody>
</table></figure>


<p><strong>¿Cuál elegir?</strong> Usa endpoints de interfaz si necesitas conectarte a múltiples servicios AWS con mayor control de seguridad. Opta por endpoints de gateway si solo necesitas <a href="https://dondeaprendoaws.com/blog/amazon-dynamodb-la-base-de-datos-nosql-de-aws/">acceso a S3 o DynamoDB</a> y buscas reducir costos.</p>


<p>Continúa leyendo para más detalles sobre cuándo y cómo usar cada tipo de endpoint.</p>


<h2 class="sb h2-sbb-cls" id="tipos-de-vpc-endpoints" tabindex="-1">Tipos de VPC Endpoints</h2>


<p>Los VPC Endpoints se dividen en dos categorías principales, cada una diseñada para necesidades específicas de conectividad y casos de uso. Aquí te explicamos cómo funcionan y sus características clave.</p>


<h3 id="endpoints-de-interfaz-1" tabindex="-1">Endpoints de Interfaz</h3>


<p>Estos endpoints actúan como interfaces de red elásticas (ENIs) con direcciones IP privadas dentro de tu VPC. Utilizan AWS PrivateLink para establecer conexiones privadas con diversos servicios de AWS.</p>


<p>Son ideales para conexiones críticas dentro de la VPC, ya que ofrecen configuraciones de seguridad flexibles mediante grupos de seguridad. Esto los hace perfectos para escenarios que requieren conexiones seguras con múltiples servicios de AWS.</p>


<h3 id="endpoints-de-gateway-1" tabindex="-1">Endpoints de Gateway</h3>


<p>Los Endpoints de Gateway funcionan de manera distinta. En lugar de usar interfaces de red, se integran como entradas en las tablas de enrutamiento de tu VPC, redirigiendo tráfico exclusivamente hacia Amazon S3 y DynamoDB.</p>


<p>No tienen límites de rendimiento, ya que el tráfico se enruta directamente sin intermediarios. Además, son completamente gratuitos, lo que los convierte en una opción atractiva para organizaciones que solo necesitan acceso a S3 o DynamoDB.</p>


<p>A continuación, una tabla comparativa de sus características principales:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>Endpoint de Interfaz</th>
<th>Endpoint de Gateway</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Servicios Soportados</strong></td>
<td>Varios servicios de AWS</td>
<td>Solo S3 y DynamoDB</td>
</tr>
<tr>
<td><strong>Rendimiento</strong></td>
<td>10 Gbps (ráfagas hasta 40 Gbps)</td>
<td>Sin límite</td>
</tr>
<tr>
<td><strong>Costo</strong></td>
<td>$0,01/hora/AZ + datos procesados</td>
<td>Gratuito</td>
</tr>
<tr>
<td><strong>Método de Conexión</strong></td>
<td>ENIs con IPs privadas</td>
<td>Entradas en tabla de rutas</td>
</tr>
<tr>
<td><strong>Control de Acceso</strong></td>
<td>Grupos de seguridad</td>
<td>Políticas de endpoint</td>
</tr>
</tbody>
</table></figure>


<h2 class="sb h2-sbb-cls" id="interface-vs-gateway-endpoints-principales-diferencias" tabindex="-1">Interface vs Gateway Endpoints: Principales Diferencias</h2>


<h3 id="comparacion-de-caracteristicas" tabindex="-1">Comparación de Características</h3>


<p>Los endpoints de interfaz funcionan con AWS PrivateLink y ENIs, mientras que los endpoints de gateway ajustan las tablas de rutas para S3 y DynamoDB.</p>


<p>La arquitectura influye directamente en sus capacidades:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>Endpoint de Interfaz</th>
<th>Endpoint de Gateway</th>
</tr>
</thead>
<tbody>
<tr>
<td>Arquitectura</td>
<td>ENIs con IPs privadas</td>
<td>Entradas en tabla de rutas</td>
</tr>
<tr>
<td>Rendimiento Base</td>
<td>10 Gbps por ENI</td>
<td>Sin límite</td>
</tr>
<tr>
<td>Capacidad de Ráfaga</td>
<td>Hasta 40 Gbps</td>
<td>No aplica</td>
</tr>
<tr>
<td><a href="https://dondeaprendoaws.com/blog/estrategias-de-interoperabilidad-multi-cloud-con-aws/">Compatibilidad Multi-VPC</a></td>
<td>Sí</td>
<td>No</td>
</tr>
<tr>
<td>Método de Conexión</td>
<td>AWS PrivateLink</td>
<td>Enrutamiento directo</td>
</tr>
</tbody>
</table></figure>


<p>Estos detalles técnicos son clave para decidir cuál utilizar en cada caso.</p>


<h3 id="cuando-usar-cada-tipo" tabindex="-1">Cuándo Usar Cada Tipo</h3>


<p>Con base en estas diferencias, aquí tienes las situaciones ideales para cada opción:</p>


<p><strong>Endpoints de Interfaz:</strong></p>


<ul>
<li>Son útiles si necesitas una conexión privada y segura con múltiples servicios de AWS (no solo S3 o DynamoDB).</li>
<li>Ideales para entornos híbridos que demanden conectividad centralizada.</li>
<li>Recomendados cuando la escalabilidad y la alta disponibilidad son prioridades.</li>
</ul>


<p><strong>Endpoints de Gateway:</strong></p>


<ul>
<li>Funcionan mejor si solo necesitas acceso a S3 o DynamoDB.</li>
<li>Ayudan a reducir costos, ya que no tienen tarifa adicional.</li>
<li>Ofrecen un rendimiento sin límites, ideal para cargas intensivas.</li>
<li>Más sencillos de configurar gracias a su enfoque basado en rutas.</li>
</ul>


<h3 id="ventajas-y-desventajas" tabindex="-1">Ventajas y Desventajas</h3>


<p>Para tomar una decisión informada, considera los puntos a favor y en contra de cada opción:</p>


<p><strong>Endpoints de Interfaz:</strong></p>


<ul>
<li><strong>Ventajas</strong>: Soporte para más servicios, mayor seguridad con IPs privadas, y capacidad de centralizar conexiones.</li>
<li><strong>Desventajas</strong>: Costos adicionales ($0.01 por hora/AZ más cargos por transferencia) y límites en el rendimiento base.</li>
</ul>


<p><strong>Endpoints de Gateway:</strong></p>


<ul>
<li><strong>Ventajas</strong>: Sin costos adicionales, rendimiento ilimitado y configuración sencilla.</li>
<li><strong>Desventajas</strong>: Solo compatibles con S3 y DynamoDB, no facilitan la centralización entre múltiples VPCs.</li>
</ul>


<blockquote>
<p>"Los expertos sugieren evaluar factores como la compatibilidad de servicios, las necesidades de seguridad, la escalabilidad requerida y los costos asociados para elegir el endpoint adecuado."</p>
</blockquote>


<p>Selecciona el endpoint que mejor se ajuste a tus necesidades de arquitectura, presupuesto y servicios.</p>


<h2 class="sb h2-sbb-cls" id="como-seleccionar-el-endpoint-adecuado" tabindex="-1">Cómo Seleccionar el Endpoint Adecuado</h2>


<p>Es importante analizar aspectos clave como servicios, rendimiento, seguridad y costos para tomar una decisión informada sobre el endpoint que mejor se ajuste a tus necesidades.</p>


<h3 id="matriz-de-decision" tabindex="-1">Matriz de Decisión</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Factor de Decisión</th>
<th>Usa Endpoint de Interfaz si…</th>
<th>Usa Endpoint de Gateway si…</th>
</tr>
</thead>
<tbody>
<tr>
<td>Servicios AWS</td>
<td>Necesitas acceder a varios servicios (como SQS, SNS, CloudWatch)</td>
<td>Solo necesitas S3 o DynamoDB</td>
</tr>
<tr>
<td>Presupuesto</td>
<td>Puedes asumir el costo adicional ($0.01/hora/AZ)</td>
<td>Prefieres mantener los costos bajos</td>
</tr>
<tr>
<td>Rendimiento</td>
<td>10 Gbps por ENI (hasta 40 Gbps en ráfaga) es suficiente</td>
<td>Requieres rendimiento sin limitaciones</td>
</tr>
</tbody>
</table></figure>


<h3 id="preguntas-clave-para-evaluar" tabindex="-1">Preguntas Clave para Evaluar</h3>


<p><strong>Rendimiento</strong></p>


<ul>
<li>¿Qué volumen de tráfico esperas manejar?</li>
<li>¿Necesitas un rendimiento constante o ilimitado?</li>
</ul>


<p><strong>Seguridad</strong></p>


<ul>
<li>¿Requieres políticas detalladas a nivel de ENI?</li>
<li>¿El control basado en rutas es suficiente para tu caso?</li>
</ul>


<p><strong>Costos</strong></p>


<ul>
<li>¿Tu presupuesto cubre los cargos del endpoint de interfaz?</li>
<li>¿Es esencial reducir costos al máximo?</li>
</ul>


<h3 id="casos-de-uso" tabindex="-1">Casos de Uso</h3>


<p><strong>Aplicaciones de Alto Rendimiento</strong><br/>
Si trabajas con grandes volúmenes en S3, el endpoint de gateway es ideal por su ancho de banda ilimitado y costo cero.</p>


<p><strong>Entornos Empresariales</strong><br/>
Para empresas que necesitan acceso a múltiples servicios de AWS con políticas estrictas, los endpoints de interfaz ofrecen mayor control y flexibilidad.</p>


<h3 id="otros-factores-a-considerar" tabindex="-1">Otros Factores a Considerar</h3>


<p>Además de los puntos anteriores, ten en cuenta lo siguiente:</p>


<ul>
<li><strong>Escalabilidad:</strong> Los endpoints de interfaz requieren planificación de ENIs, mientras que los gateway se ajustan automáticamente.</li>
<li><strong>Mantenimiento:</strong> Los endpoints de gateway son más fáciles de gestionar porque no dependen de ENIs.</li>
<li><strong>Compatibilidad:</strong> Asegúrate de que los servicios que necesitas estén disponibles en tu región.</li>
</ul>


<p>Tu decisión debe alinearse con los objetivos de tu infraestructura, las demandas de rendimiento y las limitaciones de presupuesto. Recuerda que puedes combinar ambos tipos de endpoints en la misma VPC para optimizar diferentes casos de uso.</p>




<h2 class="sb h2-sbb-cls" id="conclusion" tabindex="-1">Conclusión</h2>


<p>Elegir entre endpoints de interfaz y gateway en AWS VPC afecta directamente la arquitectura, el rendimiento y los costos de tu infraestructura en la nube. Aquí te dejamos un resumen clave:</p>


<p>Los <strong>endpoints de interfaz</strong> funcionan con una amplia gama de servicios de AWS y ofrecen un rendimiento de hasta 10 Gbps por ENI, con capacidad de ráfaga de hasta 40 Gbps. Además, su integración con AWS PrivateLink mejora la seguridad de las conexiones privadas entre servicios.</p>


<p>Por otro lado, los <strong>endpoints de gateway</strong> destacan por su simplicidad y eficiencia. Ofrecen rendimiento ilimitado y no tienen costos asociados, lo que los hace ideales para manejar cargas intensivas en S3 y DynamoDB.</p>


<p>Para tomar una decisión informada, ten en cuenta lo siguiente:</p>


<ul>
<li><strong>Requisitos de servicio</strong>: Los endpoints de interfaz son útiles para múltiples servicios de AWS, mientras que los de gateway están limitados a S3 y DynamoDB.</li>
<li><strong>Rendimiento</strong>: Los endpoints de gateway no tienen límites, mientras que los de interfaz tienen restricciones específicas por ENI.</li>
<li><strong>Costos</strong>: Los endpoints de gateway son gratuitos, mientras que los de interfaz generan costos por hora y por zona de disponibilidad.</li>
</ul>


<p>Ambos tipos de endpoints pueden usarse en la misma VPC, lo que permite equilibrar rendimiento y costos. Una estrategia común es aprovechar los endpoints de gateway para cargas intensivas en S3 y DynamoDB, y complementar con endpoints de interfaz para otros servicios cuando sea necesario.</p>


<p>Este enfoque combinado es cada vez más popular en arquitecturas en la nube, ya que permite aprovechar las ventajas de ambas opciones mientras se mantiene un control sobre los costos. Consulta los recursos adicionales y las preguntas frecuentes para seguir explorando este tema.</p>


<h2 class="sb h2-sbb-cls" id="recursos-de-aprendizaje" tabindex="-1">Recursos de Aprendizaje</h2>


<p>Si estás buscando información para comparar y elegir endpoints, aquí tienes algunos recursos clave:</p>


<h3 id="documentacion-oficial-de-aws" tabindex="-1">Documentación Oficial de AWS</h3>


<p>AWS ofrece una variedad de materiales útiles, como:</p>


<ul>
<li>Información actualizada sobre configuración y administración.</li>
<li>Guías técnicas detalladas sobre AWS PrivateLink.</li>
<li>Detalles sobre precios y facturación.</li>
<li>Documentación técnica siempre al día.</li>
</ul>


<h3 id="recursos-en-espanol" tabindex="-1">Recursos en Español</h3>


<p><strong>Dónde Aprendo AWS</strong> (https://dondeaprendoaws.com) es una excelente opción en español, con contenido como:</p>


<ul>
<li>Guías paso a paso para implementaciones.</li>
<li>Ejemplos prácticos con fragmentos de código.</li>
<li>Tutoriales adaptados a distintos niveles de experiencia.</li>
<li>Recursos adicionales creados por la comunidad de AWS.</li>
</ul>


<h3 id="recursos-tecnicos-adicionales" tabindex="-1">Recursos Técnicos Adicionales</h3>


<p><strong><a href="https://tutorialsdojo.com/" rel="noopener noreferrer" target="_blank">Tutorials Dojo</a></strong> es otro recurso destacado que incluye:</p>


<ul>
<li>Ejercicios y laboratorios prácticos.</li>
<li>Comparaciones detalladas entre diferentes endpoints.</li>
<li>Casos de estudio basados en situaciones reales.</li>
<li>Guías específicas para implementar soluciones.</li>
</ul>


<p>Además, puedes complementar estos recursos con herramientas diseñadas para monitorear y gestionar tu infraestructura.</p>


<h3 id="herramientas-de-monitoreo-y-gestion" tabindex="-1">Herramientas de Monitoreo y Gestión</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Propósito</th>
</tr>
</thead>
<tbody>
<tr>
<td>CloudWatch</td>
<td>Supervisión de métricas clave</td>
</tr>
<tr>
<td>AWS CLI</td>
<td>Gestión a través de comandos</td>
</tr>
<tr>
<td>AWS Console</td>
<td>Administración visual</td>
</tr>
</tbody>
</table></figure>


<h3 id="recursos-de-seguridad" tabindex="-1">Recursos de Seguridad</h3>


<p>La documentación de AWS también cubre aspectos importantes de seguridad, como:</p>


<ul>
<li>Prácticas recomendadas para proteger tu infraestructura.</li>
<li>Guías detalladas sobre IAM.</li>
<li>Configuración de grupos de seguridad.</li>
<li>Métodos para proteger y cifrar datos.</li>
</ul>


<p>Estos materiales son fundamentales para optimizar tanto la implementación como la seguridad de tus endpoints en AWS.</p>


<h2 class="sb h2-sbb-cls" id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="cual-es-la-diferencia-entre-gateway-e-interfaz" tabindex="-1">¿Cuál es la diferencia entre gateway e interfaz?</h3>


<p>La diferencia principal está en su propósito y cómo funcionan. Los <strong>endpoints de interfaz</strong> usan ENIs con IP privadas para conectarse a varios servicios de AWS a través de AWS PrivateLink. Por otro lado, los <strong>endpoints de gateway</strong> están diseñados exclusivamente para S3 y DynamoDB, utilizando enrutamiento directo.</p>


<p><strong>Diferencias clave:</strong></p>


<ul>
<li><strong>Servicios soportados</strong>: Interfaz (varios servicios) vs. Gateway (solo S3 y DynamoDB).</li>
<li><strong>Conexión</strong>: Interfaz (ENIs) vs. Gateway (tablas de rutas).</li>
<li><strong>Costos</strong>: Interfaz (pago por uso) vs. Gateway (sin costo).</li>
</ul>


<p>Para más detalles, consulta la sección "Interface vs Gateway Endpoints: Principales Diferencias".</p>


<h3 id="cuando-debo-usar-cada-tipo-de-endpoint" tabindex="-1">¿Cuándo debo usar cada tipo de endpoint?</h3>


<p>La elección depende de tus necesidades específicas. Aquí algunas recomendaciones:</p>


<p><strong>Usa endpoint de interfaz si:</strong></p>


<ul>
<li>Necesitas conectarte a varios servicios AWS.</li>
<li>Requieres alta disponibilidad y escalabilidad.</li>
<li>Buscas mayor control de seguridad.</li>
</ul>


<p><strong>Usa endpoint de gateway si:</strong></p>


<ul>
<li>Solo necesitas acceso a S3 o DynamoDB.</li>
<li>Prefieres evitar costos adicionales.</li>
<li>Quieres una configuración más sencilla.</li>
</ul>


<p>Para ejemplos concretos, revisa la sección "Cómo Seleccionar el Endpoint Adecuado".</p>


<h3 id="que-consideraciones-de-seguridad-debo-tener-en-cuenta" tabindex="-1">¿Qué consideraciones de seguridad debo tener en cuenta?</h3>


<p>Ambos endpoints mantienen el tráfico dentro de la red de AWS. Los <strong>endpoints de interfaz</strong> permiten un control más detallado con grupos de seguridad y políticas específicas. En cambio, los <strong>endpoints de gateway</strong> son más simples, ya que no requieren IPs públicas.</p>


<h3 id="como-afectan-al-rendimiento-de-mi-aplicacion" tabindex="-1">¿Cómo afectan al rendimiento de mi aplicación?</h3>


<p>El rendimiento varía según el tipo de endpoint:</p>


<ul>
<li><strong>Interfaz</strong>: Velocidad de 10 Gbps por ENI, con ráfagas de hasta 40 Gbps.</li>
<li><strong>Gateway</strong>: Rendimiento ilimitado.</li>
</ul>


<h3 id="puedo-usar-ambos-tipos-de-endpoints-simultaneamente" tabindex="-1">¿Puedo usar ambos tipos de endpoints simultáneamente?</h3>


<p>Sí, puedes combinar ambos en la misma VPC para diferentes necesidades. Por ejemplo, usar un endpoint de gateway para acceder a S3 y endpoints de interfaz para otros servicios de AWS. Esto te permite aprovechar lo mejor de cada tipo según tus requerimientos.</p>


<h2>Publicaciones de blog relacionadas</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/">Conceptos Básicos y Avanzados de Amazon VPC</a></li><li><a href="https://dondeaprendoaws.com/blog/servicios-de-aws-para-frontend/">Servicios de AWS para Frontend</a></li><li><a href="https://dondeaprendoaws.com/blog/como-usar-aws-cost-explorer-para-trafico-de-red/">Cómo Usar AWS Cost Explorer para Tráfico de Red</a></li><li><a href="https://dondeaprendoaws.com/blog/diferencias-entre-sla-y-slo-en-aws/">Diferencias Entre SLA y SLO en AWS</a></li></ul>
