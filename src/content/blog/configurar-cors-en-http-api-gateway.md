---
title: "Configurar CORS en HTTP API Gateway"
description: "Aprende a configurar CORS en API Gateway de AWS para asegurar el acceso a tu API desde diferentes dominios de manera eficiente."
publishedAt: "2025-03-10"
publishedTimestamp: "2025-03-10T05:50:46.65Z"
cover: "/assets/blog/b7ca17278c2b7e43c95dfeec.jpg"
coverAlt: "Thumbnail for: Configurar CORS en HTTP API Gateway"
ogImage: "/assets/blog/b7ca17278c2b7e43c95dfeec.jpg"
related:
  - title: "AWS Lambda y API Gateway: Guía Básica"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/"
    image: "/assets/blog/2aa39fe7ff55b6a37888515e.jpg"
    imageAlt: ""
  - title: "AWS OpsWorks: Automatiza Despliegues con Chef"
    url: "https://dondeaprendoaws.com/blog/aws-opsworks-automatiza-despliegues-con-chef/"
    image: "/assets/blog/6b2f0b16a8f28318691c2a8d.jpg"
    imageAlt: ""
  - title: "AWS Seguridad: Mejores Prácticas"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/"
    image: "/assets/blog/58bea5d60c133d57e4a0bdbf.jpg"
    imageAlt: ""
---

<p><strong>¿Quieres que tu API sea accesible desde diferentes dominios de forma segura? Configurar CORS (Cross-Origin Resource Sharing) es clave para lograrlo.</strong></p>


<p>Esta guía rápida te explica cómo configurar CORS en un HTTP <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" rel="noopener noreferrer" target="_blank">API Gateway</a> de <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> en pocos pasos:</p>


<ul>
<li><strong>¿Qué es CORS?</strong>: Es un mecanismo de seguridad que permite que un frontend (por ejemplo, <code class="inline-code">https://miapp.com</code>) acceda a una API en otro dominio (<code class="inline-code">https://api.miapp.com</code>).</li>
<li><strong>HTTP API vs REST API</strong>: La configuración de CORS en HTTP API es más sencilla y económica que en REST API.</li>
<li><strong>Pasos básicos</strong>:
<ol>
<li>Accede a la consola de API Gateway.</li>
<li>Selecciona tu HTTP API.</li>
<li>Configura los parámetros de CORS: orígenes, métodos, cabeceras y más.</li>
</ol>
</li>
<li><strong><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores prácticas</a></strong>:
<ul>
<li>Restringe los orígenes permitidos.</li>
<li>Especifica solo los métodos y cabeceras necesarios.</li>
<li>Activa credenciales solo si es imprescindible.</li>
</ul>
</li>
</ul>


<h3 id="comparativa-rapida-http-api-vs-rest-api" tabindex="-1">Comparativa rápida: HTTP API vs REST API</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>HTTP API</th>
<th>REST API</th>
</tr>
</thead>
<tbody>
<tr>
<td>Configuración de CORS</td>
<td>Automática y sencilla</td>
<td>Manual y compleja</td>
</tr>
<tr>
<td>Rendimiento</td>
<td>Menor latencia</td>
<td>Más funcionalidades</td>
</tr>
<tr>
<td>Coste</td>
<td>Más económico</td>
<td>Más alto</td>
</tr>
</tbody>
</table></figure>


<p><strong>¿Problemas con CORS?</strong> Revisa los errores más comunes y cómo solucionarlos en las herramientas del navegador.</p>


<p>Con esta guía, podrás configurar CORS de forma segura y eficiente. ¡Sigue leyendo para aprender más!</p>


<h2 class="sb h2-sbb-cls" id="configuracion-de-cors-en-http-api-gateway" tabindex="-1">Configuración de CORS en HTTP <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" rel="noopener noreferrer" target="_blank">API Gateway</a></h2>


<p><figure><img alt="API Gateway" src="/assets/blog/3bd76b02d8cc943a4861866d.jpg"/></figure></p>


<h3 id="como-acceder-a-la-configuracion-de-cors" tabindex="-1">Cómo acceder a la configuración de CORS</h3>


<p>Para ajustar CORS en una HTTP API de API Gateway, primero debes ingresar a la <a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">consola de AWS</a> y localizar tu API. Una vez dentro, sigue estos pasos para encontrar la sección de configuración:</p>


<ol>
<li>Ve a la consola de API Gateway.</li>
<li>Selecciona tu HTTP API en la lista.</li>
<li>En el menú de navegación izquierdo, haz clic en <strong>CORS</strong>.</li>
<li>En la sección principal, selecciona <strong>Configurar</strong>.</li>
</ol>


<p>A continuación, revisa las opciones disponibles para personalizar la configuración.</p>


<h3 id="parametros-de-configuracion-de-cors" tabindex="-1">Parámetros de configuración de CORS</h3>


<p>En HTTP API Gateway, puedes personalizar varios parámetros de CORS según tus necesidades. Aquí tienes una tabla con ejemplos comunes:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Parámetro</th>
<th>Descripción</th>
<th>Ejemplo</th>
</tr>
</thead>
<tbody>
<tr>
<td>Access-Control-Allow-Origins</td>
<td>Especifica los orígenes permitidos</td>
<td>https://miapp.es</td>
</tr>
<tr>
<td>Access-Control-Allow-Methods</td>
<td>Métodos HTTP autorizados</td>
<td>GET, POST, PUT, DELETE, OPTIONS</td>
</tr>
<tr>
<td>Access-Control-Allow-Headers</td>
<td>Cabeceras permitidas en las solicitudes</td>
<td>Authorization, Content-Type, X-Amz-Date, X-Api-Key, X-Amz-Security-Token</td>
</tr>
<tr>
<td>Access-Control-Expose-Headers</td>
<td>Cabeceras visibles para el cliente</td>
<td>x-amz-date, x-api-id</td>
</tr>
<tr>
<td>Access-Control-Max-Age</td>
<td>Tiempo en segundos para cachear preflight</td>
<td>300 segundos</td>
</tr>
</tbody>
</table></figure>


<p>Ahora veamos cómo aplicar esta configuración en un caso práctico.</p>


<h3 id="ejemplo-basico-de-configuracion-de-cors" tabindex="-1">Ejemplo básico de configuración de CORS</h3>


<p>Con los pasos anteriores, puedes implementar una configuración básica ajustando los siguientes parámetros:</p>


<ul>
<li>
<strong>Orígenes permitidos</strong><br/>
Agrega el dominio de tu aplicación: <code class="inline-code">https://miapp.es</code>
</li>
<li>
<strong>Métodos HTTP autorizados</strong><br/>
Incluye métodos como: <code class="inline-code">GET, POST, PUT, DELETE, OPTIONS</code>
</li>
<li>
<strong>Cabeceras permitidas</strong><br/>
Especifica cabeceras como: <code class="inline-code">Authorization, Content-Type, X-Amz-Date, X-Api-Key, X-Amz-Security-Token</code>
</li>
</ul>


<p>Antes de llevar esta configuración a producción, realiza una prueba en tu navegador. Asegúrate de que la respuesta incluya las cabeceras CORS esperadas. Esto garantizará que las solicitudes desde tu dominio funcionen correctamente.</p>


<h2 class="sb h2-sbb-cls" id="configuracion-personalizada-de-cors" tabindex="-1">Configuración personalizada de CORS</h2>


<p>Tras haber configurado CORS de manera básica, es momento de ajustar las opciones para que se adapten mejor a las necesidades específicas de tu entorno.</p>


<h3 id="restriccion-de-origenes-permitidos" tabindex="-1">Restricción de orígenes permitidos</h3>


<p>Definir con precisión los orígenes autorizados es clave. En lugar de usar el comodín <code class="inline-code">*</code>, que permite acceso desde cualquier origen, es mejor especificar los dominios permitidos.</p>


<p>Por ejemplo, puedes configurar los orígenes así:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Entorno</th>
<th>Origen permitido</th>
</tr>
</thead>
<tbody>
<tr>
<td>Desarrollo</td>
<td>https://dev.miapp.es</td>
</tr>
<tr>
<td>Pruebas</td>
<td>https://staging.miapp.es</td>
</tr>
<tr>
<td>Producción</td>
<td>https://miapp.es</td>
</tr>
</tbody>
</table></figure>


<p>Incluye siempre el protocolo y, si es necesario, el subdominio. Una vez definidos los orígenes, ajusta los métodos y las cabeceras permitidas para aumentar la seguridad.</p>


<h3 id="definicion-de-metodos-y-cabeceras" tabindex="-1">Definición de métodos y cabeceras</h3>


<p>Además de limitar los orígenes, es importante especificar los métodos y cabeceras que estará permitido usar. Solo habilita lo necesario para tu aplicación.</p>


<p>Si tu API realiza operaciones CRUD básicas, una configuración típica sería:</p>


<pre><code class="language-json">{
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Amz-Date"
}
</code></pre>


<h3 id="manejo-de-credenciales" tabindex="-1">Manejo de credenciales</h3>


<p>El manejo de credenciales en solicitudes cross-origin es esencial si necesitas trabajar con cookies o encabezados de autorización. Para habilitarlo, sigue estos pasos:</p>


<ol>
<li>
Configura en el API Gateway lo siguiente:
<pre><code class="language-json">{
    "Access-Control-Allow-Credentials": "true"
}
</code></pre>
</li>
<li>
En el cliente, agrega <code class="inline-code">credentials: 'include'</code> en tus solicitudes fetch:
<pre><code class="language-javascript">fetch('https://api.miapp.es/recurso', {
    credentials: 'include'
});
</code></pre>
</li>
</ol>


<p><strong>Importante</strong>: Cuando habilites credenciales, asegúrate de especificar cada origen permitido de forma explícita.</p>


<p>Permitir el uso de credenciales hace que la seguridad de tu API sea más exigente. Por eso, es recomendable implementar medidas adicionales, como el uso de tokens CSRF y una validación estricta de sesiones, especialmente si estás trabajando con cookies o credenciales de autenticación.</p>




<h2 class="sb h2-sbb-cls" id="testing-cors-settings" tabindex="-1">Testing CORS Settings</h2>


<h3 id="metodos-de-prueba-cors" tabindex="-1">Métodos de prueba CORS</h3>


<p>Puedes comprobar tu configuración CORS utilizando las herramientas de desarrollo del navegador o realizando solicitudes de prueba.</p>


<p>Aquí tienes un ejemplo para probar desde el frontend:</p>


<pre><code class="language-javascript">async function probarCORS() {
    try {
        const respuesta = await fetch('https://tu-api.execute-api.eu-west-1.amazonaws.com/test', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('Código de respuesta:', respuesta.status);
    } catch (error) {
        console.error('Error CORS:', error);
    }
}
</code></pre>


<p>Si la solicitud no funciona, consulta la siguiente sección para identificar y corregir errores.</p>


<h3 id="solucion-de-errores-cors" tabindex="-1">Solución de errores CORS</h3>


<p>Aquí tienes una tabla con los problemas más comunes y cómo resolverlos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Error</th>
<th>Causa</th>
<th>Solución</th>
</tr>
</thead>
<tbody>
<tr>
<td>Origin not allowed</td>
<td>El origen no está en la lista permitida</td>
<td>Añade el origen en <code class="inline-code">Access-Control-Allow-Origin</code></td>
</tr>
<tr>
<td>Method not allowed</td>
<td>Método HTTP no configurado</td>
<td>Incluye el método en <code class="inline-code">Access-Control-Allow-Methods</code></td>
</tr>
<tr>
<td>Headers not allowed</td>
<td>Cabeceras no autorizadas</td>
<td>Agrega las cabeceras en <code class="inline-code">Access-Control-Allow-Headers</code></td>
</tr>
</tbody>
</table></figure>


<p>Para diagnosticar, revisa la respuesta OPTIONS de tu API:</p>


<ol>
<li>Abre las herramientas de desarrollo del navegador.</li>
<li>Ve a la pestaña <strong>Network</strong> o <strong>Red</strong>.</li>
<li>Busca la solicitud preliminar OPTIONS.</li>
<li>Comprueba las cabeceras CORS en la respuesta.</li>
</ol>


<p>Las herramientas del navegador pueden ser de gran ayuda para entender mejor los problemas.</p>


<h3 id="herramientas-del-navegador-para-cors" tabindex="-1">Herramientas del navegador para CORS</h3>


<p><a href="https://developer.chrome.com/docs/devtools" rel="noopener noreferrer" target="_blank">Chrome DevTools</a> incluye funciones útiles para depurar problemas relacionados con CORS:</p>


<ul>
<li>
<strong>Panel de Console y Network</strong><br/>
Muestra mensajes detallados sobre errores CORS. También permite revisar las solicitudes OPTIONS y las cabeceras como:
<ul>
<li><code class="inline-code">Access-Control-Allow-Origin</code></li>
<li><code class="inline-code">Access-Control-Allow-Methods</code></li>
<li><code class="inline-code">Access-Control-Allow-Headers</code></li>
</ul>
</li>
<li>
<strong>Panel de Application</strong><br/>
Ideal para analizar cookies y credenciales cuando trabajas con <code class="inline-code">Access-Control-Allow-Credentials</code>.
</li>
</ul>


<p>Si usas <a href="https://www.mozilla.org/en-US/firefox/developer/" rel="noopener noreferrer" target="_blank">Firefox Developer Edition</a>, también encontrarás herramientas para simular diferentes orígenes y analizar el comportamiento de tu API.</p>


<h2 class="sb h2-sbb-cls" id="consejos-de-seguridad-y-rendimiento" tabindex="-1">Consejos de seguridad y rendimiento</h2>


<p>Con la configuración básica y personalizada de CORS ya en marcha, aquí tienes algunos consejos para reforzar la seguridad y mejorar el rendimiento de tu API.</p>


<h3 id="directrices-para-una-configuracion-cors-segura" tabindex="-1">Directrices para una configuración CORS segura</h3>


<p>Una configuración adecuada de CORS ayuda a proteger tu API HTTP. Ten en cuenta estos puntos clave:</p>


<ul>
<li><strong>Define orígenes específicos</strong>: Evita el uso de comodines innecesarios para limitar la exposición.</li>
<li><strong>Usa HTTPS siempre</strong>: Garantiza que el tráfico esté cifrado para prevenir ataques como el man-in-the-middle.</li>
<li><strong>Aplica el principio de permisos mínimos</strong>: Permite solo los métodos y cabeceras estrictamente necesarios.</li>
</ul>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Configuración segura</th>
<th>Configuración no recomendada</th>
</tr>
</thead>
<tbody>
<tr>
<td>Orígenes</td>
<td>https://miapp.es</td>
<td>*</td>
</tr>
<tr>
<td>Métodos</td>
<td>GET, POST específicos</td>
<td>Todos los métodos</td>
</tr>
<tr>
<td>Credenciales</td>
<td>false por defecto</td>
<td>true sin restricciones</td>
</tr>
</tbody>
</table></figure>


<p>Estos pasos complementan los ejemplos básicos de configuración que ya hemos visto.</p>


<h3 id="como-cors-afecta-el-rendimiento" tabindex="-1">Cómo CORS afecta el rendimiento</h3>


<p>La implementación de CORS puede influir en el rendimiento de tu API. Algunos factores a considerar:</p>


<ul>
<li><strong>Solicitudes OPTIONS</strong>: Configura <code class="inline-code">Access-Control-Max-Age</code> para almacenar en caché las respuestas OPTIONS y reducir la latencia.</li>
<li><strong>Validación de orígenes</strong>: Validar múltiples orígenes puede aumentar el tiempo de respuesta.</li>
<li><strong>Cabeceras adicionales</strong>: Cada cabecera extra incrementa el tamaño de la respuesta, afectando el rendimiento.</li>
</ul>


<p>Para mejorar el rendimiento, puedes usar una configuración como esta:</p>


<pre><code class="language-javascript">{
    "cors": {
        "allowOrigins": ["https://miapp.es"],
        "allowMethods": ["GET", "POST"],
        "maxAge": 300,
        "allowCredentials": false
    }
}
</code></pre>


<h3 id="cuando-usar-comodines" tabindex="-1">¿Cuándo usar comodines?</h3>


<p>El uso de comodines (*), aunque tentador, debe limitarse a APIs públicas o entornos de desarrollo. En producción, es mejor mantener una lista específica de orígenes permitidos:</p>


<pre><code class="language-javascript">{
    "allowOrigins": [
        "https://app.miempresa.es",
        "https://admin.miempresa.es",
        "https://dev.miempresa.es"
    ]
}
</code></pre>


<p>Busca un equilibrio entre flexibilidad en el desarrollo y seguridad en producción. Prueba siempre estos ajustes en el navegador para asegurarte de que funcionan como esperas, tal y como se explicó en la sección de testing.</p>


<h2 class="sb h2-sbb-cls" id="proximos-pasos" tabindex="-1">Próximos pasos</h2>


<p>Después de configurar y probar CORS, es importante planificar las siguientes acciones para mantener un buen rendimiento y garantizar la seguridad a largo plazo.</p>


<h3 id="revision-de-puntos-clave" tabindex="-1">Revisión de puntos clave</h3>


<p>Para implementar CORS de manera efectiva, ten en cuenta lo siguiente:</p>


<ul>
<li><strong>Configuración inicial y avanzada</strong>: Comienza con una configuración básica para pruebas y utiliza configuraciones más específicas en producción, limitando los orígenes permitidos.</li>
<li><strong>Seguridad y optimización</strong>: Asegúrate de usar HTTPS, valida todas las entradas y aplica métodos sólidos de autenticación y autorización. Además, mejora el rendimiento con técnicas como caché y compresión.</li>
</ul>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Herramienta recomendada</th>
<th>Función principal</th>
</tr>
</thead>
<tbody>
<tr>
<td>Monitorización</td>
<td><a href="https://docs.aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">CloudWatch</a></td>
<td>Seguimiento de métricas y registros</td>
</tr>
<tr>
<td>Trazabilidad</td>
<td><a href="https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html" rel="noopener noreferrer" target="_blank">X-Ray</a></td>
<td>Análisis de latencia y detección de errores</td>
</tr>
<tr>
<td>Auditoría</td>
<td><a href="https://docs.aws.amazon.com/cloudtrail/" rel="noopener noreferrer" target="_blank">CloudTrail</a></td>
<td>Registro de actividades en la API</td>
</tr>
</tbody>
</table></figure>


<p>Con estos puntos claros, puedes consultar más recursos para ampliar tus conocimientos sobre la configuración de CORS.</p>


<h3 id="recursos-adicionales" tabindex="-1">Recursos adicionales</h3>


<p>Si quieres aprender más sobre la configuración de CORS y cómo mejorar la seguridad en AWS, aquí tienes algunos recursos en español:</p>


<ul>
<li><strong><a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a></strong> (https://dondeaprendoaws.com): Un portal especializado con artículos y tutoriales en español sobre AWS, incluyendo guías detalladas sobre cómo proteger tu infraestructura en la nube.</li>
<li><strong>Estrategia de seguridad</strong>: El artículo <em>"Estrategia de seguridad en la nube de AWS, ¿Por dónde empezar?"</em> ofrece una excelente introducción para implementar medidas de seguridad eficaces.</li>
</ul>


<p>No olvides revisar periódicamente tu configuración y actualizar las medidas de seguridad utilizando herramientas como CloudWatch, X-Ray y CloudTrail.</p>


<h2>Publicaciones de blog relacionadas</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/como-habilitar-cloudwatch-logs-en-api-gateway-guia-paso-a-paso/">Cómo Habilitar CloudWatch Logs en API Gateway: Guía Paso a Paso</a></li><li><a href="https://dondeaprendoaws.com/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/">Guía para Crear APIs Serverless con AWS Lambda y API Gateway</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/">AWS Lambda y API Gateway: Guía Básica</a></li><li><a href="https://dondeaprendoaws.com/blog/5-practicas-de-seguridad-para-lambda-authorizers/">5 Prácticas de Seguridad para Lambda Authorizers</a></li></ul>
