---
title: "Cómo Usar AWS Transfer Family con Amazon EFS"
description: "Aprende a integrar AWS Transfer Family con Amazon EFS para una transferencia de archivos segura y escalable, siguiendo los pasos clave para su configuración y optimización."
publishedAt: "2024-05-05"
publishedTimestamp: "2024-05-05T05:44:31.414Z"
cover: "/assets/blog/4f1c44f2f3d79e3f40174550.jpg"
coverAlt: "Thumbnail for: Cómo Usar AWS Transfer Family con Amazon EFS"
ogImage: "/assets/blog/4f1c44f2f3d79e3f40174550.jpg"
related:
  - title: "5 Prácticas de Seguridad para Lambda Authorizers"
    url: "https://dondeaprendoaws.com/blog/5-practicas-de-seguridad-para-lambda-authorizers/"
    image: "/assets/blog/e838de22cc856de64a0d3bdc.jpg"
    imageAlt: ""
  - title: "AWS Community Day 2024: Calendario de Eventos"
    url: "https://dondeaprendoaws.com/blog/aws-community-day-2024-calendario-de-eventos/"
    image: "/assets/blog/8a72720666074692888beb45.png"
    imageAlt: ""
  - title: "Estrategias de Interoperabilidad Multi-Cloud con AWS"
    url: "https://dondeaprendoaws.com/blog/estrategias-de-interoperabilidad-multi-cloud-con-aws/"
    image: "/assets/blog/36e16d8c286c92c9ff8903fc.jpg"
    imageAlt: ""
---

<p><a href="https://aws.amazon.com/aws-transfer-family/" rel="noopener noreferrer" target="_blank">AWS Transfer Family</a> es un servicio de transferencia de archivos seguro y escalable que te permite transferir archivos hacia y desde sistemas de archivos de Amazon Elastic File System (EFS). Al integrar <a href="https://aws.amazon.com/aws-transfer-family/" rel="noopener noreferrer" target="_blank">AWS Transfer Family</a> con <a href="https://aws.amazon.com/efs/" rel="noopener noreferrer" target="_blank">Amazon EFS</a>, puedes acceder a tus archivos desde cualquier lugar, dispositivo y en cualquier momento, utilizando protocolos de transferencia como SFTP, FTPS y FTP.</p>


<p><strong>Ventajas Clave</strong></p>


<ul>
<li><strong>Acceso seguro a archivos:</strong> Accede a tus archivos de forma segura desde cualquier ubicación y dispositivo.</li>
<li><strong>Transferencia escalable:</strong> La escalabilidad automática garantiza que puedas manejar cambios en el tráfico de archivos.</li>
<li><strong>Control de acceso:</strong> Configura permisos y autenticación para controlar quién accede a tus archivos y desde dónde.</li>
</ul>


<p><strong>Pasos para la Integración</strong></p>


<ol>
<li>
<p>Prepara Amazon EFS para <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> Transfer Family:</p>
<ul>
<li>Crea un sistema de archivos EFS en la misma región que tu servidor Transfer Family</li>
<li>Configura políticas de IAM para permitir acceso al rol de IAM utilizado por Transfer Family</li>
<li>Crea usuarios y asigna permisos para acceder a EFS</li>
<li>Asegúrate de que la política del sistema de archivos no permita acceso público</li>
</ul>
</li>
<li>
<p>Habilita el acceso entre cuentas (si es necesario):</p>
<ul>
<li>Modifica la política del sistema de archivos para permitir acceso entre cuentas</li>
<li>Configura políticas de IAM para permitir acceso al rol de IAM de Transfer Family en la otra cuenta</li>
<li>Asegúrate de que la otra cuenta tenga permisos para acceder a EFS</li>
</ul>
</li>
<li>
<p>Transfiere archivos a Amazon EFS:</p>
<ul>
<li>Configura cuentas de usuario con los permisos necesarios</li>
<li>Administra claves (SSH o S3) para transferencia segura</li>
<li>Navega dentro de EFS y transfiere archivos utilizando la consola o CLI</li>
</ul>
</li>
<li>
<p>Protege las transferencias de archivos:</p>
<ul>
<li>Configura políticas de IAM adecuadas</li>
<li>Configura grupos de seguridad de VPC correctamente</li>
<li>Sigue las <a href="https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/">recomendaciones de seguridad de AWS</a></li>
</ul>
</li>
<li>
<p>Administra permisos de usuario:</p>
<ul>
<li>Crea roles de IAM</li>
<li>Asigna y revoca permisos según sea necesario</li>
</ul>
</li>
<li>
<p>Monitorea y optimiza el rendimiento:</p>
<ul>
<li>Utiliza <a href="https://aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">AWS CloudWatch</a> para monitorear la actividad</li>
<li>Ajusta la configuración de la instancia, tamaño de archivos y frecuencia de transferencia</li>
<li>Soluciona problemas revisando registros, verificando configuración y realizando pruebas de rendimiento</li>
</ul>
</li>
</ol>


<p>Al seguir estos pasos, podrás disfrutar de una solución de transferencia de archivos segura y escalable en AWS.</p>


<h2 id="entendiendo-los-servicios" tabindex="-1">Entendiendo los Servicios</h2>


<p>AWS Transfer Family y Amazon EFS son dos servicios de AWS que trabajan juntos para proporcionar una forma segura y escalable de transferir archivos hacia y desde la nube de AWS.</p>


<h3 id="aws-transfer-family" tabindex="-1"><a href="https://aws.amazon.com/aws-transfer-family/" rel="noopener noreferrer" target="_blank">AWS Transfer Family</a></h3>


<p><figure><img alt="AWS Transfer Family" src="/assets/blog/4363d981328a6d95941b5cf7.jpg"/></figure></p>


<p>AWS Transfer Family es un servicio de transferencia de archivos administrado por AWS que te permite transferir archivos hacia y desde sistemas de archivos de Amazon Elastic File System (EFS) de manera segura y escalable. Este servicio admite protocolos de transferencia de archivos como SFTP, FTPS y FTP.</p>


<h3 id="amazon-efs" tabindex="-1"><a href="https://aws.amazon.com/efs/" rel="noopener noreferrer" target="_blank">Amazon EFS</a></h3>


<p><figure><img alt="Amazon EFS" src="/assets/blog/25b270cd75b8a38a5d145043.jpg"/></figure></p>


<p>Amazon EFS es un sistema de archivos elástico y escalable que te permite almacenar y administrar archivos en la nube de AWS. Este servicio ofrece una forma segura y confiable de almacenar y recuperar archivos.</p>


<h3 id="c%C3%B3mo-funcionan-juntos" tabindex="-1">Cómo funcionan juntos</h3>


<p>Al combinar AWS Transfer Family con Amazon EFS, puedes crear una solución de transferencia de archivos segura y escalable que te permite acceder a tus archivos desde cualquier lugar y dispositivo.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS Transfer Family</td>
<td>Transferencia de archivos segura y escalable</td>
</tr>
<tr>
<td>Amazon EFS</td>
<td>Almacenamiento y gestión de archivos en la nube</td>
</tr>
</tbody>
</table></figure>


<p>En las siguientes secciones, exploraremos los pasos para configurar y utilizar AWS Transfer Family con Amazon EFS.</p>


<h2 id="requisitos-para-la-integraci%C3%B3n" tabindex="-1">Requisitos para la Integración</h2>


<p>Para integrar AWS Transfer Family con Amazon EFS, es necesario cumplir con ciertos requisitos previos. A continuación, se presentan los requisitos fundamentales para la integración exitosa de estos servicios.</p>


<h3 id="requisitos-previos" tabindex="-1">Requisitos previos</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Requisito</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Región de AWS</td>
<td>El servidor de Transfer Family y su sistema de archivos de Amazon EFS deben estar ubicados en la misma región de AWS.</td>
</tr>
<tr>
<td>Políticas de IAM</td>
<td>Es necesario configurar políticas de IAM para permitir el acceso al rol de IAM utilizado por Transfer Family.</td>
</tr>
<tr>
<td>Acceso entre cuentas</td>
<td>Si el servidor de Transfer Family es propiedad de una cuenta diferente, es necesario habilitar el acceso entre cuentas.</td>
</tr>
<tr>
<td>Política del sistema de archivos</td>
<td>Asegúrese de que la política del sistema de archivos no permita el acceso público.</td>
</tr>
<tr>
<td>Configuración del acceso entre cuentas</td>
<td>Modifique la política del sistema de archivos para permitir el acceso entre cuentas.</td>
</tr>
</tbody>
</table></figure>


<p>Al cumplir con estos requisitos, podrá integrar con éxito AWS Transfer Family con Amazon EFS y disfrutar de una transferencia de archivos segura y escalable.</p>


<h2 id="configuraci%C3%B3n-de-la-integraci%C3%B3n" tabindex="-1">Configuración de la Integración</h2>


<p>Para configurar la integración de AWS Transfer Family con Amazon EFS, es necesario completar varios pasos importantes. A continuación, se presentan los pasos detallados para configurar la integración exitosa de estos servicios.</p>


<h3 id="preparaci%C3%B3n-de-amazon-efs-para-aws-transfer-family" tabindex="-1">Preparación de Amazon EFS para <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> Transfer Family</h3>


<p><figure><img alt="AWS" src="/assets/blog/2ebe3cf8e7ae57e98d3af846.jpg"/></figure></p>


<p>Antes de comenzar a configurar la integración, asegúrese de que su sistema de archivos de Amazon EFS esté listo para utilizarlo con AWS Transfer Family. Para hacer esto, siga los siguientes pasos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Cree un sistema de archivos de Amazon EFS en la misma región de AWS que su servidor de Transfer Family.</td>
</tr>
<tr>
<td>2</td>
<td>Configure las políticas de IAM para permitir el acceso al rol de IAM utilizado por Transfer Family.</td>
</tr>
<tr>
<td>3</td>
<td>Cree usuarios y asigne permisos adecuados para acceder al sistema de archivos de Amazon EFS.</td>
</tr>
<tr>
<td>4</td>
<td>Asegúrese de que la política del sistema de archivos no permita el acceso público.</td>
</tr>
</tbody>
</table></figure>


<h3 id="habilitaci%C3%B3n-del-acceso-entre-cuentas" tabindex="-1">Habilitación del Acceso entre Cuentas</h3>


<p>Si su servidor de Transfer Family y su sistema de archivos de Amazon EFS se encuentran en cuentas de AWS diferentes, es necesario habilitar el acceso entre cuentas. Para hacer esto, siga los siguientes pasos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Modifique la política del sistema de archivos para permitir el acceso entre cuentas.</td>
</tr>
<tr>
<td>2</td>
<td>Configure las políticas de IAM para permitir el acceso al rol de IAM utilizado por Transfer Family en la cuenta diferente.</td>
</tr>
<tr>
<td>3</td>
<td>Asegúrese de que la cuenta diferente tenga permisos adecuados para acceder al sistema de archivos de Amazon EFS.</td>
</tr>
</tbody>
</table></figure>


<p>Al completar estos pasos, podrá configurar con éxito la integración de AWS Transfer Family con Amazon EFS y disfrutar de una transferencia de archivos segura y escalable.</p>


<h2 id="transferir-archivos-a-amazon-efs" tabindex="-1">Transferir Archivos a Amazon EFS</h2>


<p>Transferir archivos a Amazon EFS utilizando AWS Transfer Family es un proceso sencillo que implica configurar cuentas de usuario, administrar claves y navegar dentro de EFS. En esta sección, te guiamos a través de los pasos para transferir archivos a Amazon EFS.</p>


<h3 id="configuraci%C3%B3n-de-cuentas-de-usuario" tabindex="-1">Configuración de Cuentas de Usuario</h3>


<p>Para transferir archivos a Amazon EFS, debes configurar cuentas de usuario con los permisos necesarios. Puedes crear usuarios y asignarles roles utilizando AWS Identity and Access Management (IAM). Asegúrate de que los usuarios tengan los permisos necesarios para acceder al sistema de archivos de Amazon EFS.</p>


<h3 id="administraci%C3%B3n-de-claves" tabindex="-1">Administración de Claves</h3>


<p>Para transferir archivos a Amazon EFS, debes administrar claves para la transferencia de archivos segura. Puedes utilizar claves SSH o claves de bucket de Amazon S3 para autenticar con el sistema de archivos de Amazon EFS. Asegúrate de que las claves estén configuradas correctamente y se roten regularmente para mantener la seguridad.</p>


<h3 id="navegaci%C3%B3n-dentro-de-efs" tabindex="-1">Navegación dentro de EFS</h3>


<p>Una vez que hayas configurado cuentas de usuario y administrado claves, puedes navegar dentro de EFS para transferir archivos. Puedes utilizar la consola de AWS Transfer Family o la CLI de AWS para navegar dentro de EFS y transferir archivos. Asegúrate de tener los permisos necesarios para acceder a los archivos y carpetas dentro de EFS.</p>


<p>A continuación, te mostramos un ejemplo de cómo transferir archivos a Amazon EFS utilizando la CLI de AWS:</p>


<pre><code class="language-bash">aws transfer upload --bucket my-efs-bucket --key my-file.txt --region us-east-1
</code></pre>


<p>Este comando carga un archivo llamado <code class="inline-code">my-file.txt</code> en el bucket <code class="inline-code">my-efs-bucket</code> en la región <code class="inline-code">us-east-1</code>.</p>


<p>Al seguir estos pasos, podrás transferir archivos a Amazon EFS utilizando AWS Transfer Family. Recuerda asegurarte de la seguridad y cumplir con las prácticas recomendadas de AWS al transferir archivos a Amazon EFS.</p>


<h2 id="protecci%C3%B3n-de-transferencias-de-archivos" tabindex="-1">Protección de Transferencias de Archivos</h2>


<p>La seguridad es fundamental al transferir archivos entre AWS Transfer Family y Amazon EFS. En esta sección, exploraremos formas de proteger la transferencia de archivos, incluyendo políticas de IAM, grupos de seguridad de VPC y recomendaciones de seguridad de AWS.</p>


<h3 id="pol%C3%ADticas-de-iam" tabindex="-1">Políticas de IAM</h3>


<p>Para proteger la transferencia de archivos, es fundamental configurar políticas de IAM adecuadas. Esto incluye definir roles y permisos para los usuarios y servicios que acceden a Amazon EFS. Asegúrate de que las políticas de IAM estén configuradas correctamente para evitar acceso no autorizado a tus archivos y carpetas.</p>


<h3 id="grupos-de-seguridad-de-vpc" tabindex="-1">Grupos de Seguridad de VPC</h3>


<p>Los grupos de seguridad de VPC también juegan un papel importante en la seguridad de la transferencia de archivos. Asegúrate de que los grupos de seguridad estén configurados correctamente para permitir el tráfico de red entre AWS Transfer Family y Amazon EFS.</p>


<h3 id="recomendaciones-de-seguridad-de-aws" tabindex="-1">Recomendaciones de Seguridad de AWS</h3>


<p>AWS proporciona varias recomendaciones de seguridad para proteger la transferencia de archivos. Asegúrate de seguir estas recomendaciones:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Recomendación</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Autenticación y autorización adecuadas</td>
<td>Utiliza autenticación y autorización adecuadas para acceder a Amazon EFS.</td>
</tr>
<tr>
<td>Protocolos de transferencia de archivos seguros</td>
<td>Utiliza protocolos de transferencia de archivos seguros, como SFTP y FTPS.</td>
</tr>
<tr>
<td>Configuración de permisos y roles de IAM</td>
<td>Configura correctamente los permisos y roles de IAM.</td>
</tr>
<tr>
<td>Monitoreo y auditoría</td>
<td>Monitorea y audita las actividades de transferencia de archivos.</td>
</tr>
</tbody>
</table></figure>


<p>Al seguir estas recomendaciones y configurar políticas de IAM y grupos de seguridad de VPC adecuados, podrás proteger la <a href="https://dondeaprendoaws.com/blog/guia-completa-sobre-amazon-efs-y-fsx/">transferencia de archivos entre AWS Transfer Family y Amazon EFS</a>.</p>


<h2 id="administraci%C3%B3n-de-permisos-de-usuario" tabindex="-1">Administración de permisos de usuario</h2>


<p>La gestión de permisos de usuario es fundamental para controlar quién tiene acceso a los archivos y carpetas en Amazon EFS. En esta sección, exploraremos cómo administrar permisos de usuario en AWS Transfer Family.</p>


<h3 id="crear-roles-de-iam" tabindex="-1">Crear roles de IAM</h3>


<p>Para administrar permisos de usuario, debes crear roles de IAM que definan los permisos y accesos para los usuarios y servicios que acceden a Amazon EFS.</p>


<h3 id="asignar-permisos" tabindex="-1">Asignar permisos</h3>


<p>Una vez que hayas creado un rol de IAM, debes asignar permisos a los usuarios o servicios que necesitan acceder a Amazon EFS.</p>


<h3 id="revocar-permisos" tabindex="-1">Revocar permisos</h3>


<p>Es importante revocar los permisos cuando ya no sean necesarios.</p>


<h3 id="ejemplo-de-pol%C3%ADtica-de-iam" tabindex="-1">Ejemplo de política de IAM</h3>


<p>A continuación, se muestra un ejemplo de política de IAM que concede permisos de lectura y escritura a un rol de IAM:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Permiso</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td><code class="inline-code">elasticfilesystem:ClientMount</code></td>
<td>Permite montar el sistema de archivos de Amazon EFS</td>
</tr>
<tr>
<td><code class="inline-code">elasticfilesystem:ClientWrite</code></td>
<td>Permite escribir en el sistema de archivos de Amazon EFS</td>
</tr>
</tbody>
</table></figure>


<p>Este ejemplo de política de IAM concede permisos de lectura y escritura al rol de IAM en la carpeta raíz del sistema de archivos de Amazon EFS.</p>


<p>Al seguir estos pasos, podrás administrar permisos de usuario en AWS Transfer Family y controlar quién tiene acceso a los archivos y carpetas en Amazon EFS.</p>


<h2 id="monitoreo-y-optimizaci%C3%B3n-del-rendimiento" tabindex="-1">Monitoreo y Optimización del Rendimiento</h2>


<p>Para garantizar el rendimiento óptimo de AWS Transfer Family y Amazon EFS, es fundamental monitorear y optimizar su configuración y uso. En esta sección, exploraremos algunas mejores prácticas para monitorear y optimizar el rendimiento de su integración.</p>


<h3 id="monitoreo-de-actividad-con-aws-cloudwatch" tabindex="-1">Monitoreo de Actividad con <a href="https://aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">AWS CloudWatch</a></h3>


<p><figure><img alt="AWS CloudWatch" src="/assets/blog/af6613064a74b982792aeda9.jpg"/></figure></p>


<p>AWS CloudWatch es un servicio de monitoreo y registro de AWS que le permite recopilar y analizar métricas y registros de su aplicación. Puede utilizar CloudWatch para monitorear la actividad de AWS Transfer Family y Amazon EFS, lo que le permite identificar problemas de rendimiento y tomar medidas para optimizar su configuración.</p>


<h3 id="optimizaci%C3%B3n-del-rendimiento" tabindex="-1">Optimización del Rendimiento</h3>


<p>Para optimizar el rendimiento de AWS Transfer Family y Amazon EFS, es importante considerar varios factores, como la configuración de la instancia, el tamaño del archivo y la frecuencia de transferencia. A continuación, se presentan algunas sugerencias para optimizar el rendimiento:</p>


<figure class="table"><table>
<thead>
<tr>
<th><strong>Sugerencia</strong></th>
<th><strong>Descripción</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>Ajuste de la configuración de la instancia</td>
<td>Asegúrese de que la instancia de AWS Transfer Family tenga suficientes recursos (como CPU y memoria) para manejar el tráfico de archivos.</td>
</tr>
<tr>
<td>Uso de archivos pequeños</td>
<td>Divide los archivos grandes en archivos más pequeños para reducir el tiempo de transferencia y mejorar el rendimiento.</td>
</tr>
<tr>
<td>Programación de transferencias</td>
<td>Programe las transferencias durante períodos de baja actividad para reducir la carga en la instancia y mejorar el rendimiento.</td>
</tr>
</tbody>
</table></figure>


<h3 id="soluci%C3%B3n-de-problemas" tabindex="-1">Solución de Problemas</h3>


<p>En caso de problemas de rendimiento, es importante identificar la causa raíz del problema y tomar medidas para solucionarlo. A continuación, se presentan algunos pasos para solucionar problemas de rendimiento:</p>


<figure class="table"><table>
<thead>
<tr>
<th><strong>Paso</strong></th>
<th><strong>Descripción</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>Revisión de los registros</td>
<td>Revisé los registros de AWS CloudWatch para identificar patrones de actividad anómalos o errores que puedan indicar problemas de rendimiento.</td>
</tr>
<tr>
<td>Verificación de la configuración</td>
<td>Verifique que la configuración de la instancia y la configuración de AWS Transfer Family estén correctas y optimizadas para el rendimiento.</td>
</tr>
<tr>
<td>Pruebas de rendimiento</td>
<td>Realice pruebas de rendimiento para identificar problemas de rendimiento y evaluar el impacto de las optimizaciones en el rendimiento.</td>
</tr>
</tbody>
</table></figure>


<p>Siguiendo estos consejos, podrá monitorear y optimizar el rendimiento de AWS Transfer Family y Amazon EFS, lo que le permitirá mejorar la eficiencia y la productividad de su integración.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>En resumen, la integración de AWS Transfer Family con Amazon EFS ofrece una solución segura y escalable para la transferencia de archivos. Al combinar las características de AWS Transfer Family con la capacidad de almacenamiento elástico de Amazon EFS, puede simplificar y acelerar la migración de workflows de transferencia de archivos a AWS.</p>


<h3 id="ventajas-de-la-integraci%C3%B3n" tabindex="-1">Ventajas de la Integración</h3>


<p>La integración de AWS Transfer Family con Amazon EFS ofrece varias ventajas, incluyendo:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Ventaja</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Acceso seguro a archivos</td>
<td>Acceda a sus archivos de manera segura y eficiente, independientemente de su ubicación o dispositivo.</td>
</tr>
<tr>
<td>Escalabilidad automática</td>
<td>La escalabilidad automática de AWS Transfer Family garantiza que su aplicación pueda manejar cambios en el tráfico de archivos.</td>
</tr>
<tr>
<td>Control de acceso</td>
<td>Configure permisos de acceso y autenticación para controlar quién tiene acceso a sus archivos y desde dónde se acceden.</td>
</tr>
</tbody>
</table></figure>


<p>En este artículo, hemos explorado los pasos para configurar y utilizar AWS Transfer Family con Amazon EFS. Esperamos que esta guía haya sido útil para usted y que pueda aprovechar las ventajas de la integración de AWS Transfer Family con Amazon EFS en su propio entorno.</p>


<h2 id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="%C2%BFc%C3%B3mo-configuro-mi-servidor-de-aws-transfer-family-para-utilizar-un-bucket-de-amazon-s3-que-est%C3%A1-en-otra-cuenta-de-aws%3F" tabindex="-1">¿Cómo configuro mi servidor de AWS Transfer Family para utilizar un bucket de <a href="https://aws.amazon.com/s3/" rel="noopener noreferrer" target="_blank">Amazon S3</a> que está en otra cuenta de AWS?</h3>


<p><figure><img alt="Amazon S3" src="/assets/blog/250ef651f0bfcd5f38dda8c1.jpg"/></figure></p>


<p>Para configurar su servidor de AWS Transfer Family para utilizar un bucket de Amazon S3 que está en otra cuenta de AWS, siga estos pasos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Cree un rol de AWS Identity and Access Management (IAM) en la cuenta A con acceso al bucket.</td>
</tr>
<tr>
<td>2</td>
<td>Actualice la política del bucket para conceder acceso entre cuentas al rol de IAM en la cuenta B.</td>
</tr>
<tr>
<td>3</td>
<td>Cree un usuario del servidor de Transfer Family configurado con el rol de IAM en la cuenta A.</td>
</tr>
</tbody>
</table></figure>


<h3 id="%C2%BFes-seguro-aws-transfer-family%3F" tabindex="-1">¿Es seguro AWS Transfer Family?</h3>


<p>La seguridad es una prioridad en AWS. Como cliente de AWS, usted se beneficia de una arquitectura de centro de datos y red que se construyó para satisfacer los requisitos de seguridad más estrictos. La seguridad es una responsabilidad compartida entre AWS y usted.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ecs/">Mejores Prácticas Para Amazon ECS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/comprendiendo-aws-backup/">Comprendiendo AWS Backup</a></li><li><a href="https://dondeaprendoaws.com/blog/guia-completa-sobre-amazon-efs-y-fsx/">Guía Completa sobre Amazon EFS y FSX</a></li>
</ul>
</p>
