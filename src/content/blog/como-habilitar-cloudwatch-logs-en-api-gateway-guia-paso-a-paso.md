---
title: "Cómo Habilitar CloudWatch Logs en API Gateway: Guía Paso a Paso"
description: "Aprende cómo configurar CloudWatch Logs en API Gateway para monitorear y optimizar tus APIs. Sigue esta guía paso a paso desde la creación de roles IAM hasta el análisis de registros."
publishedAt: "2024-04-29"
publishedTimestamp: "2024-04-29T07:48:00.212Z"
cover: "/assets/blog/f256f4a211663872e566e67f.jpg"
coverAlt: "Thumbnail for: Cómo Habilitar CloudWatch Logs en API Gateway: Guía Paso a Paso"
ogImage: "/assets/blog/f256f4a211663872e566e67f.jpg"
related:
  - title: "Seguridad y Control de Costos en AWS: Guía 2024"
    url: "https://dondeaprendoaws.com/blog/seguridad-y-control-de-costos-en-aws-guia-2024/"
    image: "/assets/blog/fa1b6e3bfee7c71b39327fcd.jpg"
    imageAlt: ""
  - title: "Mejores Prácticas Para Amazon ECS"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ecs/"
    image: "/assets/blog/826c9a11a84720138c6c6ed3.jpg"
    imageAlt: ""
  - title: "AWS Seguridad: Fundamentos Esenciales"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
    image: "/assets/blog/15bc5fcf943d474b0b00277c.jpg"
    imageAlt: ""
---

<p>Configurar <a href="https://aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">CloudWatch</a> Logs para <a href="https://aws.amazon.com/api-gateway/" rel="noopener noreferrer" target="_blank">API Gateway</a> es crucial para monitorear y depurar APIs REST y WebSocket. Esta guía te enseña cómo habilitar CloudWatch Logs, desde crear un rol de IAM hasta configurar formatos de registro de acceso.</p>


<p><strong>Beneficios Clave:</strong></p>


<ul>
<li>Monitoreo en tiempo real de solicitudes y respuestas</li>
<li>Herramientas de análisis avanzadas para examinar registros</li>
<li>Identificar oportunidades para mejorar el rendimiento</li>
</ul>


<p><strong>Pasos Principales:</strong></p>


<ol>
<li>
<p><strong>Crear un Rol de IAM</strong></p>
<ul>
<li>Crear un rol de IAM con permisos para escribir registros en CloudWatch</li>
<li>Asociar el rol con tu API Gateway</li>
</ul>
</li>
<li>
<p><strong>Habilitar Registro de Ejecución</strong></p>
<ul>
<li>Configurar el nivel de registro de ejecución para tus etapas de API</li>
</ul>
</li>
<li>
<p><strong>Configurar Formatos de Registro de Acceso</strong></p>
<ul>
<li>Seleccionar el formato de registro de acceso deseado para tus etapas</li>
</ul>
</li>
<li>
<p><strong>Probar la Integración</strong></p>
<ul>
<li>Enviar solicitudes de prueba a tu API</li>
<li>Ver registros en la consola de CloudWatch</li>
</ul>
</li>
<li>
<p><strong>Utilizar CloudWatch Insights</strong></p>
<ul>
<li>Crear consultas para analizar registros</li>
<li>Identificar patrones y optimizar el rendimiento de tu API</li>
</ul>
</li>
</ol>


<p>Al habilitar CloudWatch Logs, puedes monitorear, depurar y optimizar tus APIs de manera efectiva. Sigue esta guía paso a paso para una configuración sencilla.</p>


<h2 id="preparaci%C3%B3n-para-la-registro-de-cloudwatch" tabindex="-1">Preparación para la registro de <a href="https://aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">CloudWatch</a></h2>


<p><figure><img alt="CloudWatch" src="/assets/blog/af6613064a74b982792aeda9.jpg"/></figure></p>


<p>Antes de configurar CloudWatch Logs para su API Gateway, es importante verificar que su API esté correctamente configurada y que tenga los permisos de IAM necesarios.</p>


<h3 id="verificar-la-implementaci%C3%B3n-de-su-api" tabindex="-1">Verificar la implementación de su API</h3>


<p>Asegúrese de que su API esté correctamente desplegada y haya sido invocada al menos una vez. Esto es esencial para que los registros se generen correctamente. Verifique que su API esté configurada correctamente y que no haya errores de despliegue.</p>


<h3 id="configuraci%C3%B3n-de-permisos-de-iam-para-la-registro" tabindex="-1">Configuración de permisos de IAM para la registro</h3>


<p>Para que API Gateway pueda escribir registros en CloudWatch, es necesario asignar los permisos de IAM adecuados. Cree un rol de IAM que tenga los permisos necesarios para escribir registros en CloudWatch. Luego, asocie este rol con su API Gateway.</p>


<p><strong>Crear un rol de IAM para la registro de CloudWatch</strong></p>


<p>1. Inicie sesión en la consola de AWS y vaya a la página de IAM.</p>


<p>2. Haga clic en "Roles" en el panel de navegación y luego haga clic en "Crear rol".</p>


<p>3. Seleccione "API Gateway" como el servicio que utilizará el rol.</p>


<p>4. Asigne los permisos necesarios para escribir registros en CloudWatch.</p>


<p>5. Guarde el rol y anote el ARN del rol.</p>


<p><strong>Asociar el rol de IAM con su API Gateway</strong></p>


<p>1. Vaya a la página de API Gateway, seleccione su API y luego vaya a la pestaña "Settings".</p>


<p>2. En la sección "CloudWatch log role ARN", ingrese el ARN del rol de IAM que creó.</p>


<p>Con estos pasos, estará listo para configurar CloudWatch Logs para su API Gateway. En la próxima sección, exploraremos cómo habilitar la registro de ejecución y acceso para su API.</p>


<h2 id="habilitar-cloudwatch-logs-en-api-gateway" tabindex="-1">Habilitar CloudWatch Logs en <a href="https://aws.amazon.com/api-gateway/" rel="noopener noreferrer" target="_blank">API Gateway</a></h2>


<p><figure><img alt="API Gateway" src="/assets/blog/ad213751f1e388f278f0d764.jpg"/></figure></p>


<h3 id="crear-un-rol-de-iam-para-registro" tabindex="-1">Crear un Rol de IAM para Registro</h3>


<p>Para habilitar CloudWatch Logs en API Gateway, debes crear un rol de IAM que tenga los permisos necesarios para escribir registros en CloudWatch. Sigue estos pasos para crear un rol de IAM para registro:</p>


<p>1. Inicia sesión en la consola de AWS y ve a la página de IAM. 2. Haz clic en "Roles" en el panel de navegación y luego haz clic en "Crear rol". 3. Selecciona "API Gateway" como el servicio que utilizará el rol. 4. Asigna los permisos necesarios para escribir registros en CloudWatch. Puedes hacer esto agregando la política de IAM "AmazonAPIGatewayPushToCloudWatchLogs" al rol. 5. Guarda el rol y anota el ARN del rol.</p>


<h3 id="asociar-el-rol-de-iam-con-api-gateway" tabindex="-1">Asociar el Rol de IAM con API Gateway</h3>


<p>Una vez que hayas creado el rol de IAM, debes asociarlo con tu API Gateway. Sigue estos pasos para asociar el rol de IAM con API Gateway:</p>


<p>1. Ve a la página de API Gateway, selecciona tu API y luego ve a la pestaña "Settings". 2. En la sección "CloudWatch log role ARN", ingresa el ARN del rol de IAM que creaste. 3. Guarda los cambios.</p>


<h3 id="habilitar-registro-de-ejecuci%C3%B3n-para-etapas-de-api" tabindex="-1">Habilitar Registro de Ejecución para Etapas de API</h3>


<p>Una vez que hayas asociado el rol de IAM con API Gateway, puedes habilitar el registro de ejecución para tus etapas de API. Sigue estos pasos para habilitar el registro de ejecución:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Ve a la página de API Gateway, selecciona tu API y luego ve a la pestaña "Stages".</td>
</tr>
<tr>
<td>2</td>
<td>Selecciona la etapa de API para la que deseas habilitar el registro de ejecución.</td>
</tr>
<tr>
<td>3</td>
<td>En la sección "Logs and tracing", selecciona el nivel de registro de ejecución deseado.</td>
</tr>
<tr>
<td>4</td>
<td>Guarda los cambios.</td>
</tr>
</tbody>
</table></figure>


<h3 id="configurar-formatos-de-registro-de-acceso" tabindex="-1">Configurar Formatos de Registro de Acceso</h3>


<p>Finalmente, puedes configurar los formatos de registro de acceso para tus API. Sigue estos pasos para configurar los formatos de registro de acceso:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Ve a la página de API Gateway, selecciona tu API y luego ve a la pestaña "Stages".</td>
</tr>
<tr>
<td>2</td>
<td>Selecciona la etapa de API para la que deseas configurar los formatos de registro de acceso.</td>
</tr>
<tr>
<td>3</td>
<td>En la sección "Logs and tracing", selecciona el formato de registro de acceso deseado.</td>
</tr>
<tr>
<td>4</td>
<td>Guarda los cambios.</td>
</tr>
</tbody>
</table></figure>


<p>Con estos pasos, habrás habilitado CloudWatch Logs para tu API Gateway y podrás ver los registros de ejecución y acceso en la consola de CloudWatch.</p>


<h2 id="probar-la-integraci%C3%B3n-de-registros-de-cloudwatch" tabindex="-1">Probar la Integración de Registros de CloudWatch</h2>


<p>Después de configurar la integración de registros de CloudWatch, es importante probar que funcione correctamente.</p>


<h3 id="enviar-solicitudes-de-prueba-a-su-api" tabindex="-1">Enviar Solicitudes de Prueba a Su API</h3>


<p>Para probar la integración de registros de CloudWatch, debe enviar solicitudes de prueba a su API. Puede utilizar herramientas como <a href="https://www.postman.com/" rel="noopener noreferrer" target="_blank">Postman</a> o <a href="https://curl.se/" rel="noopener noreferrer" target="_blank">cURL</a> para enviar solicitudes a su API. Asegúrese de incluir headers y parámetros relevantes en su solicitud.</p>


<p>Una vez que haya enviado la solicitud, espere unos minutos para que los registros se generen en CloudWatch. Luego, vaya a la consola de CloudWatch y busque los registros de su API. Debe ver los registros de ejecución y acceso en la consola de CloudWatch.</p>


<h3 id="ver-registros-en-la-consola-de-cloudwatch" tabindex="-1">Ver Registros en la Consola de CloudWatch</h3>


<p>Para ver los registros en la consola de CloudWatch, siga estos pasos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Acción</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Inicie sesión en la consola de AWS y vaya a la página de CloudWatch.</td>
</tr>
<tr>
<td>2</td>
<td>Selecciona "Logs" en el panel de navegación.</td>
</tr>
<tr>
<td>3</td>
<td>Selecciona el grupo de registros que desea ver.</td>
</tr>
<tr>
<td>4</td>
<td>Selecciona el flujo de registros que desea ver.</td>
</tr>
<tr>
<td>5</td>
<td>Analice los registros para asegurarse de que se estén generando correctamente.</td>
</tr>
</tbody>
</table></figure>


<p>Recuerde que los registros de CloudWatch pueden tardar unos minutos en aparecer en la consola. Asegúrese de esperar lo suficiente antes de buscar los registros.</p>


<p>Con estos pasos, podrá probar la integración de registros de CloudWatch y asegurarse de que se estén generando correctamente.</p>


<h2 id="solucionar-problemas-de-registro" tabindex="-1">Solucionar Problemas de Registro</h2>


<p>Presenta problemas de registro comunes y sus soluciones, asegurando un proceso de configuración suave.</p>


<h3 id="corregir-errores-de-permiso" tabindex="-1">Corregir Errores de Permiso</h3>


<p>Discute cómo resolver errores de roles y políticas de IAM que pueden obstaculizar el registro.</p>


<p>Cuando configura registros de CloudWatch para API Gateway, errores de permiso pueden ocurrir si el rol de IAM no está configurado correctamente. Para solucionar esto, asegúrese de que el rol de IAM tenga los permisos necesarios para escribir registros en CloudWatch. Puede hacer esto adjuntando la política administrada <code class="inline-code">AmazonAPIGatewayPushToCloudWatchLogs</code> al rol de IAM. Esta política otorga los permisos necesarios para que API Gateway escriba registros en CloudWatch.</p>


<p>Además, asegúrese de que el rol de IAM esté activado para todas las regiones de AWS donde desee habilitar registros de CloudWatch. Puede hacer esto verificando la configuración del rol de IAM en la consola de AWS Management.</p>


<h3 id="corregir-errores-de-formato-de-registro" tabindex="-1">Corregir Errores de Formato de Registro</h3>


<p>Ofrece consejos sobre el uso correcto de variables de formato de registro y soluciona problemas relacionados con el formato.</p>


<p>Cuando configura formatos de registro en API Gateway, es esencial utilizar las variables correctas para capturar los datos de registro requeridos. Por ejemplo, si desea registrar el ID de solicitud, puede utilizar la variable <code class="inline-code">$context.requestId</code>. Asegúrese de verificar la documentación de API Gateway para la sintaxis y el uso correctos de variables de formato de registro.</p>


<p>Si encuentra problemas con formatos de registro, verifique los registros de API Gateway para errores y solucione según sea necesario. También puede probar sus formatos de registro utilizando la consola de API Gateway o una herramienta como Postman.</p>


<h3 id="abordar-la-falta-de-datos-de-registro" tabindex="-1">Abordar la Falta de Datos de Registro</h3>


<p>Explora las causas potenciales de la falta de registros y estrategias para asegurarse de que los registros se capturen completamente.</p>


<p>Si no ve registros en CloudWatch, puede haber varias razones para esto. Una causa común es que el rol de IAM no esté configurado correctamente o que el formato de registro sea incorrecto. Para abordar esto, revise la configuración del rol de IAM y los formatos de registro para asegurarse de que sean correctos.</p>


<p>Otra causa potencial es que la etapa de API Gateway no esté configurada correctamente para el registro. Asegúrese de que la etapa esté configurada para registrar solicitudes y respuestas, y que el formato de registro sea correcto.</p>


<p>Al solucionar estos problemas comunes, puede asegurarse de que sus registros de CloudWatch estén configurados correctamente y capturen los datos requeridos.</p>


<h2 id="utilizar-cloudwatch-insights-para-an%C3%A1lisis-de-registros" tabindex="-1">Utilizar CloudWatch Insights para Análisis de Registros</h2>


<p>Utilizar CloudWatch Insights es una forma efectiva de analizar los registros de su API y mejorar su rendimiento.</p>


<h3 id="crear-consultas-en-cloudwatch-insights" tabindex="-1">Crear Consultas en CloudWatch Insights</h3>


<p>Para crear consultas en CloudWatch Insights, siga estos pasos:</p>


<ol>
<li>Abra la consola de CloudWatch y seleccione <strong>Insights</strong> en el panel de navegación.</li>
<li>Seleccione el grupo de registros que desea analizar.</li>
<li>Especifique el período de tiempo que desea analizar.</li>
<li>Cree una consulta utilizando el lenguaje de consulta de CloudWatch Insights.</li>
<li>Ejecute la consulta y revise los resultados.</li>
</ol>


<p>Por ejemplo, puede crear una consulta para ver los 10 últimos errores 4xx en su API:</p>


<pre><code>fields @timestamp, status, ip, path, httpMethod| filter status&gt;=400 and status&lt;=499| sort @timestamp desc| limit 10
</code></pre>


<h3 id="analizar-registros-para-optimizar-la-api" tabindex="-1">Analizar Registros para Optimizar la API</h3>


<p>Al analizar los registros en CloudWatch Insights, puede identificar patrones y tendencias que pueden ayudar a mejorar el rendimiento de su API. Por ejemplo, puede:</p>


<ul>
<li>Identificar los endpoints más lentos y optimizarlos para mejorar el rendimiento.</li>
<li>Detectar errores comunes y solucionarlos para reducir el número de errores.</li>
<li>Analizar los patrones de tráfico y ajustar la capacidad de su API para manejar picos de tráfico.</li>
</ul>


<p>Al utilizar CloudWatch Insights para analizar los registros, puede tomar decisiones informadas para mejorar el rendimiento y la escalabilidad de su API.</p>


<figure class="table"><table>
<thead>
<tr>
<th><strong>Ventajas de utilizar CloudWatch Insights</strong></th>
<th><strong>Descripción</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>Identificar patrones y tendencias</td>
<td>Analizar los registros para identificar patrones y tendencias que pueden ayudar a mejorar el rendimiento de su API.</td>
</tr>
<tr>
<td>Optimizar endpoints</td>
<td>Identificar los endpoints más lentos y optimizarlos para mejorar el rendimiento.</td>
</tr>
<tr>
<td>Reducir errores</td>
<td>Detectar errores comunes y solucionarlos para reducir el número de errores.</td>
</tr>
<tr>
<td>Ajustar la capacidad</td>
<td>Analizar los patrones de tráfico y ajustar la capacidad de su API para manejar picos de tráfico.</td>
</tr>
</tbody>
</table></figure>


<h2 id="conclusi%C3%B3n%3A-registros-de-cloudwatch-para-la-gesti%C3%B3n-de-api" tabindex="-1">Conclusión: Registros de CloudWatch para la Gestión de API</h2>


<p>En resumen, habilitar registros de CloudWatch en API Gateway es un paso crucial para mantener APIs de alta performance y seguridad. En esta guía, hemos cubierto los pasos detallados para configurar registros de CloudWatch, desde la creación de un rol de IAM hasta la configuración de formatos de registro de acceso. También hemos explorado las ventajas de utilizar CloudWatch Insights para analizar los registros y mejorar el rendimiento de la API.</p>


<h3 id="ventajas-de-utilizar-cloudwatch-logs" tabindex="-1">Ventajas de utilizar CloudWatch Logs</h3>


<figure class="table"><table>
<thead>
<tr>
<th><strong>Ventaja</strong></th>
<th><strong>Descripción</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>Identificar patrones y tendencias</td>
<td>Analizar los registros para identificar patrones y tendencias que pueden ayudar a mejorar el rendimiento de su API.</td>
</tr>
<tr>
<td>Optimizar endpoints</td>
<td>Identificar los endpoints más lentos y optimizarlos para mejorar el rendimiento.</td>
</tr>
<tr>
<td>Reducir errores</td>
<td>Detectar errores comunes y solucionarlos para reducir el número de errores.</td>
</tr>
<tr>
<td>Ajustar la capacidad</td>
<td>Analizar los patrones de tráfico y ajustar la capacidad de su API para manejar picos de tráfico.</td>
</tr>
</tbody>
</table></figure>


<p>Al habilitar registros de CloudWatch, puede identificar patrones y tendencias en los registros, optimizar los endpoints lentos, reducir errores y ajustar la capacidad de su API para manejar picos de tráfico. Siguiendo los pasos detallados en esta guía, puede asegurarse de que su API esté funcionando de manera óptima y segura.</p>


<h2 id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="%C2%BFc%C3%B3mo-obtengo-registros-de-aws-api-gateway%3F" tabindex="-1">¿Cómo obtengo registros de <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> API Gateway?</h3>


<p><figure><img alt="AWS" src="/assets/blog/2ebe3cf8e7ae57e98d3af846.jpg"/></figure></p>


<p>Abre la consola de CloudWatch en <a href="https://console.aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">https://console.aws.amazon.com/cloudwatch/</a>. Si es necesario, cambia la región de AWS. En el panel de navegación, elige <strong>Logs</strong>, luego <strong>Log groups</strong>. Bajo la tabla <strong>Log Groups</strong>, elige un grupo de registros con el nombre <code class="inline-code">API-Gateway-Execution-Logs_{rest-api-id}/{stage-name}</code>.</p>


<h3 id="%C2%BFc%C3%B3mo-aseguro-que-la-registro-de-api-en-cloudwatch-est%C3%A9-habilitada%3F" tabindex="-1">¿Cómo aseguro que la registro de API en CloudWatch esté habilitada?</h3>


<p>Crea una API y despliégala en una etapa. Elige <strong>Logs/Tracing</strong> en el editor de etapas. Elige <strong>Habilitar registros de CloudWatch</strong> en <strong>Configuración de CloudWatch</strong>. Seleccione <strong>Guardar cambios</strong>.</p>


<h3 id="%C2%BFtiene-registros-api-gateway%3F" tabindex="-1">¿Tiene registros API Gateway?</h3>


<p>En el panel de navegación, elige <strong>Logs</strong>, luego <strong>Log groups</strong>. Bajo la tabla <strong>Log Groups</strong>, elige un grupo de registros con el nombre <code class="inline-code">API-Gateway-Execution-Logs_{rest-api-id}/{stage-name}</code>. Bajo la tabla <strong>Log Streams</strong>, elige un flujo de registros. Puedes utilizar la marca de tiempo para ayudar a ubicar el flujo de registros de tu interés.</p>


<h3 id="%C2%BFc%C3%B3mo-activo-registros-de-cloudwatch-para-solucionar-problemas-de-mi-api-gateway-rest-api-o-websocket-api%3F" tabindex="-1">¿Cómo activo registros de CloudWatch para solucionar problemas de mi API Gateway REST API o WebSocket API?</h3>


<p>Inicia sesión en la consola de API Gateway en <a href="https://console.aws.amazon.com/apigateway/" rel="noopener noreferrer" target="_blank">https://console.aws.amazon.com/apigateway/</a>. En el panel de navegación principal, elige <strong>Configuración</strong>, luego <strong>Editar</strong> bajo <strong>Registro</strong>. Para <strong>ARN de rol de CloudWatch</strong>, ingresa un ARN de un rol de IAM con permisos apropiados.</p>


<figure class="table"><table>
<thead>
<tr>
<th><strong>Preguntas</strong></th>
<th><strong>Respuestas</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>¿Cómo obtengo registros de AWS API Gateway?</td>
<td>Abre la consola de CloudWatch y elige un grupo de registros con el nombre <code class="inline-code">API-Gateway-Execution-Logs_{rest-api-id}/{stage-name}</code>.</td>
</tr>
<tr>
<td>¿Cómo aseguro que la registro de API en CloudWatch esté habilitada?</td>
<td>Crea una API, despliégala en una etapa y habilita registros de CloudWatch en la configuración de CloudWatch.</td>
</tr>
<tr>
<td>¿Tiene registros API Gateway?</td>
<td>Elige un grupo de registros con el nombre <code class="inline-code">API-Gateway-Execution-Logs_{rest-api-id}/{stage-name}</code> y selecciona un flujo de registros.</td>
</tr>
<tr>
<td>¿Cómo activo registros de CloudWatch para solucionar problemas de mi API Gateway REST API o WebSocket API?</td>
<td>Inicia sesión en la consola de API Gateway, elige <strong>Configuración</strong>, luego <strong>Editar</strong> bajo <strong>Registro</strong> y ingresa un ARN de un rol de IAM con permisos apropiados.</td>
</tr>
</tbody>
</table></figure>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">Mejores Prácticas de Observabilidad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/observabilidad-en-aws-con-amazon-x-ray/">Observabilidad en AWS con Amazon X-Ray</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li>
</ul>
</p>
