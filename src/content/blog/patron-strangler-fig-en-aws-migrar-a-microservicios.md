---
title: "Patrón Strangler Fig en AWS: Migrar a Microservicios"
description: "Descubre cómo migrar de forma segura y gradual aplicaciones monolíticas a microservicios en AWS con el patrón Strangler Fig, minimizando riesgos y maximizando beneficios."
publishedAt: "2024-04-29"
publishedTimestamp: "2024-04-29T05:31:12.257Z"
cover: "/assets/blog/a4bd2fc033fb9605dec915d6.png"
coverAlt: "Thumbnail for: Patrón Strangler Fig en AWS: Migrar a Microservicios"
ogImage: "/assets/blog/a4bd2fc033fb9605dec915d6.png"
related:
  - title: "AWS OpsWorks: Automatiza Despliegues con Chef"
    url: "https://dondeaprendoaws.com/blog/aws-opsworks-automatiza-despliegues-con-chef/"
    image: "/assets/blog/6b2f0b16a8f28318691c2a8d.jpg"
    imageAlt: ""
  - title: "Cómo integrar los SDK de AWS en 7 pasos"
    url: "https://dondeaprendoaws.com/blog/como-integrar-los-sdk-de-aws-en-7-pasos/"
    image: "/assets/blog/056aaf4c9dbb90032443ee34.jpg"
    imageAlt: ""
  - title: "Clases de Almacenamiento de Amazon S3"
    url: "https://dondeaprendoaws.com/blog/clases-de-almacenamiento-de-amazon-s3/"
    image: "/assets/blog/783a6beb62602d5d128b9c75.jpg"
    imageAlt: ""
---

<p>de Forma Gradual y Segura</p>


<p>El patrón Strangler Fig es una estrategia efectiva para migrar aplicaciones monolíticas a microservicios en <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> de manera incremental, minimizando el riesgo y la interrupción del negocio. Este enfoque implica:</p>


<ul>
<li>Identificar componentes monolíticos para reemplazar por microservicios</li>
<li>Crear nuevos microservicios que gradualmente reemplacen los componentes monolíticos</li>
<li>Utilizar servicios de AWS como <a href="https://aws.amazon.com/es/api-gateway/" rel="noopener noreferrer" target="_blank">API Gateway</a> y <a href="https://en.wikipedia.org/wiki/AWS_Lambda" rel="noopener noreferrer" target="_blank">AWS Lambda</a> para facilitar la implementación</li>
</ul>


<p>Las ventajas clave del patrón Strangler Fig son:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Ventaja</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Migración incremental</td>
<td>Minimiza el riesgo y la interrupción, garantizando una transición suave y controlada</td>
</tr>
<tr>
<td>Servicios de AWS</td>
<td>Facilitan la implementación práctica del patrón, simplificando el proceso de migración</td>
</tr>
<tr>
<td>Planificación y comunicación</td>
<td>Son vitales para el éxito de la migración, involucrando a todas las partes interesadas</td>
</tr>
</tbody>
</table></figure>


<p>Al adoptar este enfoque, las organizaciones pueden modernizar sus aplicaciones legacy de manera segura y controlada, aprovechando al máximo los beneficios de la migración a microservicios en AWS.</p>


<h2 id="el-patr%C3%B3n-de-strangler-fig-explicado" tabindex="-1">El Patrón de Strangler Fig Explicado</h2>


<p>El patrón de Strangler Fig es una solución efectiva para migrar aplicaciones monolíticas a microservicios en AWS, inspirada en la naturaleza y su aplicación metafórica en el desarrollo de software.</p>


<h3 id="inspiraci%C3%B3n-en-la-naturaleza-para-el-patr%C3%B3n" tabindex="-1">Inspiración en la Naturaleza para el Patrón</h3>


<p>El patrón de Strangler Fig se inspira en la higuera estranguladora, un tipo de árbol que crece envolviendo a otro árbol, gradualmente estrangulándolo hasta que muere. De manera similar, el patrón de Strangler Fig permite reemplazar gradualmente los componentes monolíticos con microservicios, sin interrumpir el funcionamiento del sistema.</p>


<h3 id="migraci%C3%B3n-incremental-con-strangler-fig" tabindex="-1">Migración Incremental con Strangler Fig</h3>


<p>La implementación del patrón de Strangler Fig en AWS implica un proceso de migración incremental, en el que se identifican los componentes monolíticos que se deben reemplazar y se crean nuevos microservicios que los reemplazan gradualmente. Este enfoque permite reducir los riesgos asociados con la migración y garantizar la continuidad del negocio.</p>


<h4 id="proceso-de-migraci%C3%B3n" tabindex="-1">Proceso de Migración</h4>


<p>El proceso de migración se puede dividir en tres pasos clave:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1. Transformar</td>
<td>Identificar los límites y limitaciones del componente monolítico</td>
</tr>
<tr>
<td>2. Coexistir</td>
<td>Crear un wrapper autour del monolito para permitir la coexistencia con el nuevo microservicio</td>
</tr>
<tr>
<td>3. Eliminar</td>
<td>Eliminar el componente monolítico una vez que el microservicio ha sido completamente probado y validado</td>
</tr>
</tbody>
</table></figure>


<p>Este enfoque incremental permite una migración segura y controlada, minimizando los riesgos y garantizando la continuidad del negocio.</p>


<h2 id="implementaci%C3%B3n-del-patr%C3%B3n-strangler-fig-en-aws" tabindex="-1">Implementación del Patrón Strangler Fig en <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a></h2>


<p><figure><img alt="AWS" src="/assets/blog/2ebe3cf8e7ae57e98d3af846.jpg"/></figure></p>


<p>Para implementar el patrón de Strangler Fig en AWS, es fundamental utilizar una variedad de servicios de AWS que faciliten el proceso de migración. A continuación, se presentan los servicios clave y cómo se utilizan en el proceso de migración.</p>


<h3 id="servicios-de-aws-para-la-migraci%C3%B3n-de-strangler-fig" tabindex="-1">Servicios de AWS para la Migración de Strangler Fig</h3>


<p>AWS ofrece una variedad de servicios que pueden ayudar a facilitar la migración de aplicaciones monolíticas a microservicios. Algunos de los servicios clave incluyen:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>API Gateway</strong></td>
<td>Actúa como una capa de proxy entre la aplicación monolítica y los microservicios, permitiendo la ruta de las solicitudes a los microservicios correspondientes.</td>
</tr>
<tr>
<td><strong>AWS Lambda</strong></td>
<td>Permite ejecutar código sin servidor, lo que facilita la creación de microservicios que pueden ser escalados y administrados de manera independiente.</td>
</tr>
<tr>
<td><strong><a href="https://aws.amazon.com/blogs/aws/new-aws-migration-hub-refactor-spaces-helps-to-incrementally-refactor-your-applications/" rel="noopener noreferrer" target="_blank">AWS Migration Hub Refactor Spaces</a></strong></td>
<td>Proporciona una infraestructura de refactorización que ayuda a crear y configurar la infraestructura necesaria para la migración, incluyendo la creación de políticas de IAM y la configuración de API Gateway.</td>
</tr>
</tbody>
</table></figure>


<h3 id="pruebas-y-monitoreo-durante-la-migraci%C3%B3n" tabindex="-1">Pruebas y Monitoreo durante la Migración</h3>


<p>Es fundamental realizar pruebas exhaustivas y monitorear en tiempo real durante la implementación del patrón de Strangler Fig para garantizar la integridad y el rendimiento del sistema. Esto puede incluir:</p>


<ul>
<li><strong>Pruebas de carga y estrés</strong>: para evaluar el rendimiento del sistema bajo diferentes cargas y condiciones.</li>
<li><strong>Monitoreo de logs y métricas</strong>: para identificar problemas potenciales y optimizar el rendimiento del sistema.</li>
<li><strong>Pruebas de seguridad</strong>: para garantizar que el sistema sea seguro y protegido contra ataques y vulnerabilidades.</li>
</ul>


<p>Al implementar el patrón de Strangler Fig en AWS, es importante recordar que la migración es un proceso incremental que requiere planificación y ejecución cuidadosas. Sin embargo, con la ayuda de los servicios de AWS y una estrategia de migración bien planeada, es posible lograr una migración exitosa y minimizar los riesgos asociados con la migración.</p>


<h2 id="ventajas-y-desventajas-del-patr%C3%B3n-strangler-fig" tabindex="-1">Ventajas y Desventajas del Patrón Strangler Fig</h2>


<p>El patrón de Strangler Fig es una estrategia efectiva para migrar aplicaciones monolíticas a microservicios en AWS. Sin embargo, es importante considerar los pros y contras de este enfoque antes de implementarlo.</p>


<h3 id="tabla-de-ventajas-y-desventajas-del-patr%C3%B3n-strangler-fig" tabindex="-1">Tabla de Ventajas y Desventajas del Patrón Strangler Fig</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Ventajas</th>
<th>Desventajas</th>
</tr>
</thead>
<tbody>
<tr>
<td>Reduce el riesgo de interrupción del negocio</td>
<td>Aumenta la complejidad del sistema durante la transición</td>
</tr>
<tr>
<td>Permite agregar nuevas características durante la migración</td>
<td>Punto de fallo único en la capa de proxy</td>
</tr>
<tr>
<td>Minimiza el tiempo de inactividad</td>
<td>Puede requerir cambios significativos en el código base monolítico</td>
</tr>
<tr>
<td>Mejora la flexibilidad y escalabilidad</td>
<td>Requiere una planificación y ejecución cuidadosas</td>
</tr>
<tr>
<td>Permite la coexistencia de la aplicación monolítica y los microservicios</td>
<td>Puede ser necesario reescribir parte del código existente</td>
</tr>
<tr>
<td>Reduce los costos de mantenimiento a largo plazo</td>
<td>Requiere una inversión inicial en herramientas y recursos</td>
</tr>
</tbody>
</table></figure>


<p>Es importante tener en cuenta que cada organización es única y que los pros y contras del patrón de Strangler Fig pueden variar según las necesidades y objetivos específicos de cada empresa. Al evaluar los pros y contras, es fundamental considerar los beneficios a largo plazo y los costos asociados con la implementación de este patrón.</p>


<h2 id="mejores-pr%C3%A1cticas-para-una-migraci%C3%B3n-exitosa" tabindex="-1">Mejores Prácticas para una Migración Exitosa</h2>


<h3 id="planificaci%C3%B3n-y-hoja-de-ruta-para-la-migraci%C3%B3n" tabindex="-1">Planificación y Hoja de Ruta para la Migración</h3>


<p>Para asegurar una migración exitosa, es fundamental planificar cuidadosamente cada paso del proceso. A continuación, se presentan algunas mejores prácticas para considerar:</p>


<p>1. <strong>Definir objetivos claros</strong>: Establezca objetivos claros y medibles para la migración, alineados con las necesidades comerciales y técnicas de la organización.</p>


<p>2. <strong>Evaluar el estado actual</strong>: Realice un análisis exhaustivo del monolito existente, incluyendo su arquitectura, dependencias, código base y flujos de datos.</p>


<p>3. <strong>Priorizar los servicios</strong>: Priorice los servicios que serán migrados a microservicios basándose en criterios como criticidad para el negocio, acoplamiento con otros componentes y facilidad de separación.</p>


<p>4. <strong>Crear una hoja de ruta</strong>: Desarrolle una hoja de ruta detallada que defina las fases de la migración, los plazos y los recursos necesarios.</p>


<p>5. <strong>Establecer métricas y KPIs</strong>: Defina métricas y KPIs para monitorear el progreso de la migración y medir su éxito.</p>


<h3 id="comunicaci%C3%B3n-y-gesti%C3%B3n-del-cambio" tabindex="-1">Comunicación y Gestión del Cambio</h3>


<p>La migración a microservicios implica cambios significativos en la forma de trabajar y en la cultura organizacional. Es crucial involucrar a todas las partes interesadas y comunicar de manera efectiva para garantizar una transición fluida.</p>


<p>1. <strong>Involucrar a todas las partes interesadas</strong>: Involucre a todos los equipos y líderes empresariales en el proceso de migración para asegurar una transición suave.</p>


<p>2. <strong>Comunicar de manera efectiva</strong>: Establezca un plan de comunicación claro y consistente para mantener informados a todos los involucrados sobre los objetivos, el progreso y los desafíos de la migración.</p>


<p>3. <strong>Capacitar y apoyar a los equipos</strong>: Proporcione capacitación y recursos adecuados a los equipos para garantizar una transición suave y minimizar la resistencia al cambio.</p>


<p>4. <strong>Fomentar la colaboración</strong>: Promueva un enfoque de equipo y fomente la comunicación abierta y la resolución conjunta de problemas.</p>


<p>5. <strong>Celebrar los logros</strong>: Reconozca y celebre los hitos alcanzados durante la migración para mantener la motivación y el compromiso de los equipos involucrados.</p>


<h2 id="conclusi%C3%B3n%3A-beneficios-de-la-migraci%C3%B3n-gradual" tabindex="-1">Conclusión: Beneficios de la Migración Gradual</h2>


<p>En resumen, la adopción del patrón Strangler Fig para la migración a microservicios en AWS ofrece varios beneficios clave. Estos beneficios incluyen:</p>


<h3 id="ventajas-de-la-migraci%C3%B3n-gradual" tabindex="-1">Ventajas de la Migración Gradual</h3>


<ul>
<li><strong>Migración incremental</strong>: minimiza el riesgo y la interrupción, lo que garantiza una transición suave y controlada.</li>
<li><strong>Servicios de AWS</strong>: facilitan la implementación práctica del patrón Strangler Fig, lo que simplifica el proceso de migración.</li>
<li><strong>Planificación y comunicación</strong>: son vitales para el éxito de la migración.</li>
</ul>


<p>Al adoptar este enfoque, las organizaciones pueden modernizar sus aplicaciones legacy de manera segura y controlada, minimizando el riesgo de interrupción y maximizando los beneficios de la migración a microservicios.</p>


<figure class="table"><table>
<thead>
<tr>
<th><strong>Ventajas</strong></th>
<th><strong>Descripción</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>Migración incremental</td>
<td>Minimiza el riesgo y la interrupción</td>
</tr>
<tr>
<td>Servicios de AWS</td>
<td>Facilitan la implementación práctica del patrón Strangler Fig</td>
</tr>
<tr>
<td>Planificación y comunicación</td>
<td>Son vitales para el éxito de la migración</td>
</tr>
</tbody>
</table></figure>


<p>En última instancia, la clave para una migración exitosa es adoptar un enfoque gradual y bien planificado, que permita a las organizaciones aprovechar al máximo los beneficios de la migración a microservicios en AWS.</p>


<h2 id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="%C2%BFc%C3%B3mo-se-implementa-el-patr%C3%B3n-strangler%3F" tabindex="-1">¿Cómo se implementa el patrón Strangler?</h3>


<p>Para implementar el patrón Strangler, siga estos pasos:</p>


<ol>
<li>Cree un microservicio de gestión de pedidos.</li>
<li>Configure la puerta de enlace de API para enrutar solicitudes de gestión de pedidos al microservicio.</li>
<li>Migre funcionalidades específicas de la aplicación monolítica al microservicio.</li>
<li>Repita los pasos 1-4 hasta que la aplicación monolítica esté completamente reemplazada.</li>
</ol>


<h3 id="%C2%BFqu%C3%A9-describe-mejor-el-patr%C3%B3n-de-la-higuera-estranguladora%3F" tabindex="-1">¿Qué describe mejor el patrón de la higuera estranguladora?</h3>


<p>Este patrón implica moverse a microservicios mediante la extracción gradual de características y la creación de una nueva aplicación alrededor del sistema existente. Las características en la aplicación monolítica se reemplazan gradualmente por microservicios, y los usuarios de la aplicación pueden utilizar las características migradas progresivamente.</p>


<h4 id="ventajas-del-patr%C3%B3n-strangler" tabindex="-1">Ventajas del patrón Strangler</h4>


<figure class="table"><table>
<thead>
<tr>
<th><strong>Ventaja</strong></th>
<th><strong>Descripción</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>Migración incremental</td>
<td>Minimiza el riesgo y la interrupción</td>
</tr>
<tr>
<td>Uso de servicios de AWS</td>
<td>Facilita la implementación práctica del patrón Strangler</td>
</tr>
<tr>
<td>Planificación y comunicación</td>
<td>Son vitales para el éxito de la migración</td>
</tr>
</tbody>
</table></figure>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/microservicios-en-aws-utilizando-contenedores/">Microservicios en AWS Utilizando Contenedores</a></li><li><a href="https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/">Arquitecturas Multi-Región en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/microservicios-en-aws-utilizando-aws-lambda/">Microservicios en AWS Utilizando AWS Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/">Arquitecturas Dirigidas por Eventos en AWS</a></li>
</ul>
</p>
