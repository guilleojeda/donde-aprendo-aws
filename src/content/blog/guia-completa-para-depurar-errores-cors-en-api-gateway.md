---
title: "Guía completa para depurar errores CORS en API Gateway"
description: "Aprende a configurar y depurar errores CORS en API Gateway para garantizar el acceso seguro y eficiente a tus APIs."
publishedAt: "2025-05-26"
publishedTimestamp: "2025-05-26T19:44:19.872000+00:00"
cover: "/assets/blog/8cdc1f9432243e263d1de431.jpg"
coverAlt: "Thumbnail for: Guía completa para depurar errores CORS en API Gateway"
ogImage: "/assets/blog/8cdc1f9432243e263d1de431.jpg"
indexOrder: 7
related:
  - title: "Introducción a la Inteligencia Artificial en AWS"
    url: "https://dondeaprendoaws.com/blog/introduccion-a-la-inteligencia-artificial-en-aws/"
    image: "/assets/blog/740fd46916e44bd2c61ce62c.png"
    imageAlt: "Thumbnail for: Introducción a la Inteligencia Artificial en AWS"
  - title: "Amazon DynamoDB: Guía Básica"
    url: "https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/"
    image: "/assets/blog/a45735d6d45d12223256fbc4.png"
    imageAlt: "Thumbnail for: Amazon DynamoDB: Guía Básica"
  - title: "Desarrollando Aplicaciones con AWS Lambda"
    url: "https://dondeaprendoaws.com/blog/desarrollando-aplicaciones-con-aws-lambda/"
    image: "/assets/blog/699efcfd9fc0a59df5186b93.png"
    imageAlt: "Thumbnail for: Desarrollando Aplicaciones con AWS Lambda"
---

<p>Enfrentar errores CORS (Cross-Origin Resource Sharing) en <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" rel="nofollow noopener noreferrer" target="_blank">API Gateway</a> puede ser frustrante, pero con una configuración adecuada y herramientas de diagnóstico, es posible resolverlos rápidamente. Aquí tienes un resumen de los puntos clave para abordar este problema:</p>
<ul>
<li><strong>¿Qué es CORS?</strong>: Es una medida de seguridad que restringe solicitudes entre diferentes dominios. Si no se configuran correctamente las cabeceras HTTP necesarias, el navegador bloqueará el acceso.</li>
<li><strong>Errores comunes</strong>: Falta de cabeceras como <code class="inline-code">Access-Control-Allow-Origin</code>, problemas con solicitudes preflight (método <code class="inline-code">OPTIONS</code>), cabeceras personalizadas no autorizadas o configuraciones incorrectas al usar credenciales.</li>
<li><strong>Soluciones básicas</strong>:
<ul>
<li>Configura CORS desde la consola de <a href="https://aws.amazon.com/" rel="nofollow noopener noreferrer" target="_blank">AWS</a> o mediante código.</li>
<li>Asegúrate de incluir cabeceras esenciales como <code class="inline-code">Access-Control-Allow-Origin</code>, <code class="inline-code">Access-Control-Allow-Methods</code> y <code class="inline-code">Access-Control-Allow-Headers</code>.</li>
<li>Si usas <a href="https://docs.aws.amazon.com/lambda/" rel="nofollow noopener noreferrer" target="_blank">Lambda</a>, devuelve las cabeceras CORS necesarias en cada respuesta.</li>
</ul>
</li>
<li><strong>Errores avanzados</strong>:
<ul>
<li>Problemas con autenticación (ej. <a href="https://docs.aws.amazon.com/cognito/" rel="nofollow noopener noreferrer" target="_blank">AWS Cognito</a>) requieren personalizar las respuestas de error en API Gateway.</li>
<li>Manejo de múltiples dominios mediante listas blancas dinámicas.</li>
<li>Mejorar rendimiento almacenando en caché las solicitudes preflight con <code class="inline-code">Access-Control-Max-Age</code>.</li>
</ul>
</li>
</ul>
<p><strong>Tabla rápida de cabeceras CORS esenciales</strong>:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Cabecera</th>
<th>Descripción</th>
<th>Ejemplos</th>
</tr>
</thead>
<tbody>
<tr>
<td><code class="inline-code">Access-Control-Allow-Origin</code></td>
<td>Orígenes permitidos</td>
<td><code class="inline-code">https://miapp.com</code>, <code class="inline-code">*</code></td>
</tr>
<tr>
<td><code class="inline-code">Access-Control-Allow-Methods</code></td>
<td>Métodos HTTP permitidos</td>
<td><code class="inline-code">GET</code>, <code class="inline-code">POST</code>, <code class="inline-code">DELETE</code>, <code class="inline-code">OPTIONS</code></td>
</tr>
<tr>
<td><code class="inline-code">Access-Control-Allow-Headers</code></td>
<td>Cabeceras permitidas en la solicitud</td>
<td><code class="inline-code">Content-Type</code>, <code class="inline-code">Authorization</code></td>
</tr>
<tr>
<td><code class="inline-code">Access-Control-Allow-Credentials</code></td>
<td>Permite incluir cookies o credenciales</td>
<td><code class="inline-code">true</code></td>
</tr>
<tr>
<td><code class="inline-code">Access-Control-Max-Age</code></td>
<td>Tiempo de caché para solicitudes preflight</td>
<td><code class="inline-code">300</code> (en segundos)</td>
</tr>
</tbody>
</table></figure>
<p><strong>Consejo práctico</strong>: Usa herramientas como <strong><a href="https://curl.se/" rel="nofollow noopener noreferrer" target="_blank">cURL</a></strong> o <strong><a href="https://www.postman.com/" rel="nofollow noopener noreferrer" target="_blank">Postman</a></strong> para probar las cabeceras y verifica los registros en <a href="https://docs.aws.amazon.com/cloudwatch/" rel="nofollow noopener noreferrer" target="_blank">CloudWatch</a> para identificar problemas. Configura correctamente el método <code class="inline-code">OPTIONS</code> y redespliega la API después de cualquier cambio.</p>
<p>Con estos pasos, puedes garantizar que tus APIs sean accesibles y seguras, evitando errores CORS que afecten la experiencia del usuario.</p>
<h2 class="sb h2-sbb-cls" id="configuracion-basica-de-cors-en-api-gateway" tabindex="-1">Configuración básica de CORS en <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" rel="nofollow noopener noreferrer" target="_blank">API Gateway</a></h2>
<p><figure><img alt="API Gateway" src="/assets/blog/976fe388db43394992df0fcb.jpg" style="width:100%;border-radius:16px;"></figure></p>
<p>Configurar correctamente CORS en API Gateway es clave para evitar problemas y asegurar que tus aplicaciones funcionen sin errores relacionados con el intercambio de recursos entre orígenes.</p>
<h3 id="habilitar-cors-desde-la-consola-de-aws" tabindex="-1">Habilitar CORS desde la consola de <a href="https://aws.amazon.com/" rel="nofollow noopener noreferrer" target="_blank">AWS</a></h3>
<p><figure><img alt="AWS" src="/assets/blog/19e0e8e3df9378d0687726b9.jpg" style="width:100%;border-radius:16px;"></figure></p>
<p>La <a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">consola de administración de AWS</a> facilita la configuración de CORS en APIs REST, siendo una opción ideal si prefieres trabajar con una interfaz gráfica.</p>
<p>Para comenzar, accede a la consola de API Gateway, selecciona tu API y ve a la sección <strong>Resources</strong>. Allí, elige el recurso donde deseas habilitar CORS y haz clic en <strong>Enable CORS</strong>.</p>
<p>Al hacerlo, se abrirá un cuadro de configuración que te permitirá personalizar aspectos clave. Selecciona los métodos para los que deseas habilitar CORS, asegurándote de incluir el método <code class="inline-code">OPTIONS</code>, ya que es obligatorio. Una vez configurado, guarda los cambios y despliega la API.</p>
<p>En el campo <strong>Access-Control-Allow-Headers</strong>, ingresa las cabeceras necesarias que el cliente debe enviar. Un ejemplo común que ofrece la consola es:<br>
<code class="inline-code">'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'</code>.</p>
<p>Para <strong>Access-Control-Allow-Origin</strong>, puedes optar por <code class="inline-code">'*'</code> si deseas permitir solicitudes desde cualquier origen, o especificar un origen concreto, como <code class="inline-code">https://www.example.com</code>.</p>
<p>Es importante tener en cuenta que habilitar CORS para un recurso no lo activa automáticamente para sus recursos secundarios. Si otros recursos necesitan CORS, deberás configurarlos individualmente.</p>
<p>Cuando habilitas CORS desde la consola, API Gateway crea automáticamente un método <code class="inline-code">OPTIONS</code> y añade la cabecera <code class="inline-code">Access-Control-Allow-Origin</code> a las respuestas de integración de los métodos existentes.</p>
<h3 id="configurar-cors-con-codigo" tabindex="-1">Configurar CORS con código</h3>
<p>Si necesitas automatizar la configuración de CORS, puedes hacerlo mediante código. Este enfoque es útil para mantener consistencia entre diferentes entornos de desarrollo y despliegue.</p>
<p>Para <strong>APIs HTTP</strong>, puedes usar <a href="https://docs.aws.amazon.com/cli/" rel="nofollow noopener noreferrer" target="_blank">AWS CLI</a> con el siguiente comando:</p>
<pre><code class="language-bash">aws apigatewayv2 update-api --api-id api-id --cors-configuration AllowOrigins="https://www.example.com"
</code></pre>
<p>Este comando permite solicitudes CORS desde <code class="inline-code">https://www.example.com</code>. Una ventaja de las APIs HTTP es que API Gateway responde automáticamente a las solicitudes preflight <code class="inline-code">OPTIONS</code>, incluso si no has configurado una ruta específica para este método.</p>
<p>Para que las cabeceras CORS funcionen correctamente, las solicitudes deben incluir una cabecera <code class="inline-code">origin</code> y, en el caso de solicitudes preflight <code class="inline-code">OPTIONS</code>, una cabecera <code class="inline-code">Access-Control-Request-Method</code>.</p>
<h3 id="cabeceras-esenciales-de-cors" tabindex="-1">Cabeceras esenciales de CORS</h3>
<p>Entender las cabeceras CORS es crucial para configurar correctamente tu API y resolver posibles problemas. Estas son algunas de las más importantes:</p>
<ul>
<li><strong><code class="inline-code">Access-Control-Allow-Origin</code></strong>: Indica los orígenes permitidos para acceder al recurso. Ejemplos comunes incluyen <code class="inline-code">https://www.example.com</code>, <code class="inline-code">*</code> (todos los orígenes) o <code class="inline-code">https://*</code> (cualquier dominio que comience con <code class="inline-code">https://</code>).</li>
<li><strong><code class="inline-code">Access-Control-Allow-Methods</code></strong>: Define los métodos HTTP permitidos, como <code class="inline-code">GET</code>, <code class="inline-code">POST</code>, <code class="inline-code">DELETE</code> o <code class="inline-code">*</code> para permitir todos los métodos.</li>
<li><strong><code class="inline-code">Access-Control-Allow-Headers</code></strong>: Especifica las cabeceras permitidas en la solicitud real.</li>
</ul>
<figure class="table"><table>
<thead>
<tr>
<th>Cabecera CORS</th>
<th>Descripción</th>
<th>Valores de ejemplo</th>
</tr>
</thead>
<tbody>
<tr>
<td><code class="inline-code">Access-Control-Allow-Origin</code></td>
<td>Orígenes autorizados</td>
<td><code class="inline-code">https://www.example.com</code>, <code class="inline-code">*</code>, <code class="inline-code">https://*</code></td>
</tr>
<tr>
<td><code class="inline-code">Access-Control-Allow-Methods</code></td>
<td>Métodos HTTP permitidos</td>
<td><code class="inline-code">GET</code>, <code class="inline-code">POST</code>, <code class="inline-code">DELETE</code>, <code class="inline-code">*</code></td>
</tr>
<tr>
<td><code class="inline-code">Access-Control-Allow-Headers</code></td>
<td>Cabeceras permitidas</td>
<td><code class="inline-code">Authorization</code>, <code class="inline-code">*</code>, <code class="inline-code">Content-Type,X-Amz-Date...</code></td>
</tr>
<tr>
<td><code class="inline-code">Access-Control-Allow-Credentials</code></td>
<td>Permite incluir credenciales (cookies, etc.)</td>
<td><code class="inline-code">true</code></td>
</tr>
<tr>
<td><code class="inline-code">Access-Control-Max-Age</code></td>
<td>Tiempo de caché para solicitudes preflight</td>
<td><code class="inline-code">300</code></td>
</tr>
</tbody>
</table></figure>
<p>Si utilizas integraciones proxy con Lambda, tu función backend debe devolver las cabeceras CORS necesarias. Aquí tienes un ejemplo básico:</p>
<pre><code class="language-javascript">export const handler = async (event) =&gt; {
    const response = {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Origin": "https://www.example.com",
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
        },
        body: JSON.stringify('Hello from Lambda!'),
    };
    return response;
};
</code></pre>
<p>La cabecera <strong><code class="inline-code">Access-Control-Allow-Credentials</code></strong> indica si el navegador debe incluir cookies o cabeceras de autorización (<code class="inline-code">true</code>). Por otro lado, <strong><code class="inline-code">Access-Control-Max-Age</code></strong> define el tiempo en segundos que una solicitud preflight puede almacenarse en caché, siendo <code class="inline-code">300</code> un valor común.</p>
<h2 class="sb h2-sbb-cls" id="solucionar-errores-comunes-de-cors" tabindex="-1">Solucionar errores comunes de CORS</h2>
<p>Con la configuración básica lista, aquí tienes soluciones para abordar algunos de los errores más frecuentes relacionados con CORS en API Gateway. Estos pasos te ayudarán a identificar y resolver problemas específicos.</p>
<h3 id="problemas-con-solicitudes-preflight" tabindex="-1">Problemas con solicitudes preflight</h3>
<p>Las solicitudes preflight son una parte clave de CORS. Estas verifican los permisos antes de la solicitud principal, enviando automáticamente una petición OPTIONS cuando se usan cabeceras personalizadas o métodos como PUT o DELETE.</p>
<p>Uno de los errores más comunes ocurre cuando el método OPTIONS no está configurado correctamente o no existe. Si estás trabajando con integraciones proxy en Lambda, recuerda que tu función debe incluir las cabeceras CORS explícitamente, ya que habilitarlas desde la consola no las añade automáticamente.</p>
<p>Errores como 401 o 403 en solicitudes preflight suelen indicar que necesitas ajustar las "Gateway Responses". Por ejemplo, desactiva el requisito de clave API para el método OPTIONS en CloudFormation para evitar errores 403, ya que estas solicitudes no deberían incluir la cabecera <code class="inline-code">x-api-key</code>.</p>
<p>Para configurar correctamente el método OPTIONS, puedes crear una integración mock en API Gateway. Asegúrate de incluir las siguientes cabeceras en la respuesta 200:</p>
<pre><code class="language-javascript">{
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
    "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PUT,POST,PATCH",
    "Access-Control-Allow-Origin": "*"
}
</code></pre>
<p>A continuación, revisemos cómo las cabeceras personalizadas pueden generar problemas similares.</p>
<h3 id="problemas-con-cabeceras-personalizadas" tabindex="-1">Problemas con cabeceras personalizadas</h3>
<p>Las cabeceras personalizadas, como los tokens de autenticación (por ejemplo, JWT), pueden causar errores CORS si el servidor no las incluye en la lista de cabeceras permitidas. Los navegadores clasifican estas cabeceras como "no simples" y exigen una autorización explícita.</p>
<p>Para evitar estos errores, asegúrate de que tanto la respuesta principal como la respuesta OPTIONS incluyan las cabeceras CORS necesarias. Si estás usando integraciones proxy, tu función Lambda debe devolver estas cabeceras en cada respuesta:</p>
<pre><code class="language-python">def lambda_handler(event, context):
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Auth-Token',
            'Access-Control-Allow-Origin': 'https://tudominio.com',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
            'Access-Control-Allow-Credentials': 'true'
        },
        'body': json.dumps('Respuesta del Lambda')
    }
</code></pre>
<p>En integraciones proxy, es imprescindible que las cabeceras CORS se configuren directamente en el backend. Cada error puede requerir ajustes específicos según su naturaleza.</p>
<h3 id="problemas-de-protocolo-y-dominio" tabindex="-1">Problemas de protocolo y dominio</h3>
<p>Los errores relacionados con protocolo y dominio suelen deberse a una falta de coincidencia exacta en la cabecera <code class="inline-code">Access-Control-Allow-Origin</code>. Esto incluye detalles como el protocolo (<code class="inline-code">http://</code> frente a <code class="inline-code">https://</code>) y el puerto.</p>
<p>Para evitar problemas, verifica siempre el entorno en el que estás trabajando. Por ejemplo, usa <code class="inline-code">"http://localhost:3000"</code> para desarrollo y <code class="inline-code">"https://tudominio.com"</code> para producción. Ten en cuenta que utilizar <code class="inline-code">"*"</code> no es válido si tu aplicación envía credenciales, ya que los navegadores lo bloquean por razones de seguridad.</p>
<p>En el caso de APIs privadas REST, los errores CORS pueden deberse a URLs de invocación incorrectas o problemas de enrutamiento hacia el endpoint VPC. Si estás utilizando credenciales como cookies o cabeceras de autorización, asegúrate de configurar la cabecera <code class="inline-code">Access-Control-Allow-Credentials</code>.</p>
<p>Finalmente, para APIs HTTP, recuerda que si configuras CORS directamente en API Gateway, este ignorará las cabeceras CORS del backend. Asegúrate de redesplegar tu API después de realizar cambios para que estos se reflejen correctamente en producción.</p>
<h2 class="sb h2-sbb-cls" id="escenarios-avanzados-de-cors" tabindex="-1">Escenarios avanzados de CORS</h2>
<p>Una vez que tienes los conceptos básicos bajo control, es hora de adentrarse en los escenarios avanzados de CORS. Estas configuraciones te permiten ajustar el comportamiento de CORS para manejar autenticación, múltiples dominios y mejorar el rendimiento, adaptándolo a las necesidades específicas de tus aplicaciones.</p>
<h3 id="cors-con-autenticacion-de-cognito" tabindex="-1">CORS con autenticación de Cognito</h3>
<p>Cuando trabajas con AWS Cognito, integrar CORS puede complicarse, especialmente si las solicitudes incluyen credenciales. Un problema frecuente ocurre cuando <strong>API Gateway</strong> responde con errores de autenticación o autorización antes de que la solicitud llegue a Lambda, omitiendo las cabeceras CORS necesarias.</p>
<blockquote>
<p>"Cuando API Gateway responde a un error de autenticación o autorización antes de pasar la solicitud a Lambda, no incluye las cabeceras CORS. Esto hace que el navegador piense que es un error CORS, aunque en realidad sea un error de autenticación/autorización." - Sedat Salman, Expert </p>
</blockquote>
<p>Para resolver este problema, personaliza las respuestas de error en API Gateway, añadiendo las cabeceras <code class="inline-code">Access-Control-Allow-Origin</code> y <code class="inline-code">Access-Control-Allow-Credentials</code>. Esto asegura que el navegador reciba la información adecuada, incluso si la autenticación falla.</p>
<p>Si usas credenciales como tokens de autorización, es fundamental especificar un dominio concreto en la cabecera <code class="inline-code">Access-Control-Allow-Origin</code>. Por ejemplo, utiliza <code class="inline-code">"https://tuapp.com"</code> en lugar de <code class="inline-code">"*"</code> al enviar solicitudes con credenciales.</p>
<p>En el caso de APIs HTTP con autorización habilitada en la ruta <code class="inline-code">$default</code>, añade una ruta <code class="inline-code">OPTIONS /{proxy+}</code> que no requiera autorización. Así, las solicitudes preflight se procesarán sin problemas.</p>
<p>En escenarios más complejos, podrías necesitar configuraciones dinámicas para manejar múltiples dominios.</p>
<h3 id="configuracion-para-multiples-origenes" tabindex="-1">Configuración para múltiples orígenes</h3>
<p>Cuando gestionas varios dominios con CORS, no puedes simplemente usar <code class="inline-code">"*"</code> si trabajas con credenciales. En su lugar, configura dinámicamente la cabecera <code class="inline-code">Access-Control-Allow-Origin</code> según el origen de la solicitud.</p>
<p>En integraciones proxy con Lambda, una solución común es implementar una lista blanca de dominios permitidos. Aquí tienes un ejemplo práctico:</p>
<pre><code class="language-python">def lambda_handler(event, context):
    allowed_origins = [
        'https://app.tudominio.com',
        'https://admin.tudominio.com',
        'https://staging.tudominio.com'
    ]

    origin = event.get('headers', {}).get('origin', '')

    cors_origin = origin if origin in allowed_origins else allowed_origins[0]

    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': cors_origin,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        'body': json.dumps('Respuesta exitosa')
    }
</code></pre>
<p>Este enfoque permite gestionar de forma segura los entornos de desarrollo, staging y producción. Siempre valida el origen contra tu lista blanca para evitar posibles vulnerabilidades.</p>
<p>Con los orígenes y la autenticación configurados, el siguiente paso es optimizar el rendimiento de las solicitudes CORS.</p>
<h3 id="mejorar-el-rendimiento-de-cors" tabindex="-1">Mejorar el rendimiento de CORS</h3>
<p>El rendimiento de CORS puede mejorarse significativamente almacenando en caché las respuestas preflight. Esto se logra mediante la cabecera <code class="inline-code">Access-Control-Max-Age</code>, que define cuánto tiempo (en segundos) el navegador puede almacenar en caché la respuesta CORS, reduciendo así las solicitudes OPTIONS.</p>
<blockquote>
<p>"El <a href="https://dondeaprendoaws.com/blog/guia-de-amazon-elasticache-almacenamiento-en-cache-en-memoria/">almacenamiento en caché</a> de respuestas preflight CORS es una forma simple pero efectiva de mejorar el rendimiento de aplicaciones que dependen de solicitudes de origen cruzado." - Parth Patel </p>
</blockquote>
<p>Los navegadores tienen límites para este valor: <strong>Chromium</strong> lo restringe a 7.200 segundos (2 horas), mientras que <strong>Firefox</strong> permite hasta 86.400 segundos (24 horas). Configura este parámetro según las necesidades de tu aplicación:</p>
<pre><code class="language-javascript">{
    "Access-Control-Allow-Origin": "https://tudominio.com",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "7200"
}
</code></pre>
<p>Para aplicaciones con alto tráfico, configura tu CDN para cachear las respuestas OPTIONS utilizando cabeceras como <code class="inline-code">Cache-Control: public, max-age=86400</code> y <code class="inline-code">Vary: origin</code>. Esto reduce la carga sobre API Gateway y mejora los tiempos de respuesta para los usuarios.</p>
<p>Combinando estas optimizaciones con las capacidades de caché nativas de API Gateway, puedes maximizar el rendimiento de aplicaciones que dependen de solicitudes AJAX o arquitecturas SPA (Single Page Applications). Esto no solo mejora la experiencia del usuario, sino que también reduce la carga en tus servicios backend.</p>
<h2 class="sb h2-sbb-cls" id="depurar-cors-con-herramientas-y-registros" tabindex="-1">Depurar CORS con herramientas y registros</h2>
<p>Cuando los errores CORS persisten a pesar de haber configurado todo correctamente, es hora de recurrir a herramientas específicas para identificar el problema. Una vez solucionadas las incidencias más comunes, es clave usar herramientas y revisar los registros para confirmar que todo funciona como debería.</p>
<h3 id="probar-con-curl-y-postman" tabindex="-1">Probar con <a href="https://curl.se/" rel="nofollow noopener noreferrer" target="_blank">cURL</a> y <a href="https://www.postman.com/" rel="nofollow noopener noreferrer" target="_blank">Postman</a></h3>
<p><figure><img alt="cURL" src="/assets/blog/b87f30c420ffdb9a48909f77.jpg" style="width:100%;border-radius:16px;"></figure></p>
<p><strong>cURL</strong> es una herramienta ideal para verificar el comportamiento de CORS porque no aplica las restricciones que imponen los navegadores, lo que permite inspeccionar directamente las cabeceras de respuesta.</p>
<p>Por ejemplo, para probar una solicitud preflight OPTIONS, puedes usar este comando:</p>
<pre><code class="language-bash">curl -X OPTIONS \
  -H "Origin: https://tudominio.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v https://tu-api-gateway.execute-api.eu-west-1.amazonaws.com/prod/endpoint
</code></pre>
<p>El modificador <code class="inline-code">-v</code> muestra las cabeceras de respuesta, permitiéndote comprobar que <code class="inline-code">Access-Control-Allow-Origin</code>, <code class="inline-code">Access-Control-Allow-Methods</code> y <code class="inline-code">Access-Control-Allow-Headers</code> están configuradas correctamente.</p>
<p>Si prefieres una interfaz gráfica, <strong>Postman</strong> es una excelente alternativa. Después de ejecutar una solicitud, revisa la sección "Headers" en la respuesta para confirmar que las cabeceras CORS tienen los valores esperados.</p>
<p>Si las cabeceras son correctas en cURL pero el navegador sigue mostrando errores, es probable que el problema esté en la configuración del cliente web y no en API Gateway. Una vez validadas las cabeceras con estas herramientas, el siguiente paso es examinar los registros de CloudWatch.</p>
<h3 id="verificar-registros-de-cloudwatch" tabindex="-1">Verificar registros de <a href="https://docs.aws.amazon.com/cloudwatch/" rel="nofollow noopener noreferrer" target="_blank">CloudWatch</a></h3>
<p><figure><img alt="CloudWatch" src="/assets/blog/0d479063011838954144ce4c.jpg" style="width:100%;border-radius:16px;"></figure></p>
<p><strong>CloudWatch Logs</strong> es una herramienta poderosa para entender qué está ocurriendo dentro de API Gateway. Para obtener información completa, habilita el nivel de registro INFO, que captura todos los eventos durante el procesamiento de solicitudes.</p>
<blockquote>
<p>"Te animo a habilitar el registro INFO para API Gateway y verificar qué sucede exactamente. Examina los registros para identificar la causa exacta." - Lukas Liesis </p>
</blockquote>
<p>En los registros, presta atención a estos puntos clave para identificar problemas relacionados con CORS:</p>
<ul>
<li><strong>Cabeceras de respuesta incorrectas</strong>: Confirma que <code class="inline-code">Access-Control-Allow-Origin</code> esté presente y contenga los valores esperados. Si está ausente o tiene valores no válidos, como <code class="inline-code">null</code> o dominios no autorizados, ese podría ser el origen del problema.</li>
<li><strong>Errores en solicitudes OPTIONS</strong>: Los errores en las solicitudes preflight suelen aparecer como códigos 4xx o 5xx. Busca mensajes como "Method not allowed" o "Invalid CORS configuration".</li>
<li><strong>Problemas en respuestas de Lambda</strong>: Si usas una integración proxy con Lambda, verifica que las respuestas incluyan las cabeceras necesarias para CORS. Los registros te mostrarán si falta alguna cabecera crítica.</li>
</ul>
<p>Un caso interesante es el de un usuario que tuvo problemas al usar cabeceras personalizadas en sus solicitudes de API Gateway. Vitor Castellani, experto en AWS, recomendó <a href="https://dondeaprendoaws.com/blog/como-habilitar-cloudwatch-logs-en-api-gateway-guia-paso-a-paso/">habilitar CORS en API Gateway</a>, asegurarse de que Lambda devolviera las cabeceras necesarias y configurar correctamente las respuestas preflight OPTIONS. Tras aplicar estos cambios y redesplegar la API, el problema se resolvió, como quedó reflejado en los registros de CloudWatch.</p>
<p>Si los registros no aportan suficiente información, puedes profundizar utilizando AWS X-Ray.</p>
<h3 id="usar-aws-x-ray-para-trazado" tabindex="-1">Usar <a href="https://docs.aws.amazon.com/xray/" rel="nofollow noopener noreferrer" target="_blank">AWS X-Ray</a> para trazado</h3>
<p><figure><img alt="AWS X-Ray" src="/assets/blog/64ddc9c79bd0be9775409ce9.jpg" style="width:100%;border-radius:16px;"></figure></p>
<p>Con <strong>AWS X-Ray</strong>, puedes trazar el recorrido completo de una solicitud, lo que resulta útil para identificar dónde se generan los errores en entornos distribuidos. Para evitar problemas con CORS, incluye <code class="inline-code">X-Amzn-Trace-Id</code> en la cabecera <code class="inline-code">Access-Control-Allow-Headers</code>:</p>
<pre><code class="language-javascript">"Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amzn-Trace-Id"
</code></pre>
<p>Una vez configurado, X-Ray te permitirá visualizar trazos y segmentos de las solicitudes en las consolas de X-Ray y CloudWatch, ofreciéndote una visión detallada del flujo de datos.</p>
<p>Es importante señalar que las APIs HTTP de API Gateway no son compatibles con X-Ray. Además, asegúrate de probar cualquier cambio relacionado con las cabeceras de trazado en un entorno de pruebas antes de implementarlo en producción.</p>
<h2 class="sb h2-sbb-cls" id="conclusion" tabindex="-1">Conclusión</h2>
<p>Configurar y solucionar problemas relacionados con CORS en API Gateway requiere una combinación de configuraciones precisas y herramientas de diagnóstico adecuadas. El éxito depende de aplicar estas configuraciones de manera consistente: si usas integración proxy con Lambda, asegúrate de que la función devuelva las cabeceras CORS necesarias. En caso de integraciones no proxy, configura manualmente las respuestas en API Gateway. Además, no olvides redesplegar la API después de realizar cambios para que las modificaciones se apliquen correctamente.</p>
<p>Es fundamental ser meticuloso en la implementación. Un error común es no alinear las cabeceras devueltas por Lambda con las configuradas en el recurso; ambas deben coincidir <strong>exactamente</strong>. Para evitar problemas, especifica el origen permitido o gestiona múltiples orígenes inspeccionando la cabecera <code class="inline-code">origin</code> y verificando si está en tu lista de orígenes aprobados.</p>
<p>Si estás utilizando autorizadores personalizados, recuerda configurar las respuestas predeterminadas (Gateway Responses) para errores "Default 4XX" e incluir las cabeceras CORS. Esto es crucial, ya que API Gateway podría devolver errores 401 o 403 antes de llegar a tu servidor. Para las APIs HTTP que usen una ruta <code class="inline-code">$default</code> con un autorizador, añade una ruta <code class="inline-code">OPTIONS /{proxy+}</code> que no requiera autorización.</p>
<p>Una configuración adecuada de CORS no solo abarca aspectos técnicos, sino también consideraciones de rendimiento y seguridad. Para mejorar el rendimiento, configura respuestas predeterminadas en los autorizadores y habilita el almacenamiento en caché de las solicitudes preflight. Usa cabeceras como <code class="inline-code">Access-Control-Max-Age</code> junto con <code class="inline-code">Cache-Control: public, max-age=86400</code> y <code class="inline-code">Vary: origin</code> para aprovechar el caché en la CDN. Además, implementa monitoreo en tiempo real para capturar información clave sobre las solicitudes y respuestas.</p>
<p>Finalmente, revisa periódicamente los registros para asegurarte de que todo funciona como se espera, y utiliza herramientas como cURL y Postman para verificar que las cabeceras CORS se devuelvan correctamente. Siguiendo estos pasos, podrás mantener una API robusta, libre de errores CORS, y garantizar el correcto funcionamiento de tus aplicaciones en cualquier entorno.</p>
<h2 class="sb h2-sbb-cls" id="faqs" tabindex="-1">FAQs</h2>
<h3 data-faq-q="" id="como-puedo-configurar-correctamente-las-cabeceras-cors-en-api-gateway" tabindex="-1">¿Cómo puedo configurar correctamente las cabeceras CORS en API Gateway?</h3>
<h2 class="sb h2-sbb-cls" id="como-configurar-las-cabeceras-cors-en-api-gateway" tabindex="-1">Cómo configurar las cabeceras <strong>CORS</strong> en API Gateway</h2>
<p>Configurar las cabeceras <strong>CORS</strong> en API Gateway puede parecer complicado, pero siguiendo unos pasos básicos puedes hacerlo de manera eficaz:</p>
<ul>
<li><strong>Acceso a la consola</strong>: Ingresa a la consola de API Gateway y selecciona la API que quieres configurar.</li>
<li><strong>Selecciona el recurso</strong>: Dirígete a la sección de recursos y elige el recurso específico que necesita soporte para <strong>CORS</strong>.</li>
<li><strong>Habilita CORS</strong>: Define los orígenes permitidos, los métodos HTTP y las cabeceras que tu API aceptará.</li>
<li><strong>Configura el backend</strong>: Asegúrate de que tu backend incluya cabeceras como <code class="inline-code">Access-Control-Allow-Origin</code> y <code class="inline-code">Access-Control-Allow-Headers</code>.</li>
<li><strong>Pruebas finales</strong>: Realiza pruebas para confirmar que todo funciona correctamente y que no hay errores relacionados con <strong>CORS</strong>.</li>
</ul>
<p>Si ajustas tanto las configuraciones en API Gateway como las respuestas del backend, podrás evitar los problemas más comunes relacionados con <strong>CORS</strong> en tus aplicaciones.</p>
<h3 data-faq-q="" id="que-herramientas-puedo-usar-para-identificar-y-resolver-errores-cors-en-mi-api" tabindex="-1">¿Qué herramientas puedo usar para identificar y resolver errores CORS en mi API?</h3>
<h2 class="sb h2-sbb-cls" id="como-identificar-y-solucionar-errores-cors-en-tu-api" tabindex="-1">Cómo identificar y solucionar errores CORS en tu API</h2>
<p>Resolver problemas de CORS en tu API puede ser más sencillo si utilizas las herramientas adecuadas. Aquí tienes algunas opciones que te serán de gran ayuda:</p>
<ul>
<li>
<strong>Herramientas de desarrollo del navegador</strong>: Estas herramientas, integradas en navegadores como Chrome o Firefox, te permiten inspeccionar solicitudes y respuestas HTTP. Puedes verificar los encabezados y detectar errores relacionados con CORS directamente desde el navegador.
</li>
<li>
<strong>Postman</strong>: Esta plataforma te permite probar tu API enviando solicitudes personalizadas. Es perfecta para revisar configuraciones específicas de CORS y simular diferentes escenarios.
</li>
<li>
<strong>AWS CloudWatch</strong>: Si usas API Gateway en AWS, CloudWatch es indispensable para monitorear registros. Te ayuda a localizar problemas de configuración que puedan estar afectando las políticas de CORS.
</li>
</ul>
<p>Con estas herramientas, podrás identificar los errores con mayor precisión y aplicar las soluciones necesarias de forma más eficiente.</p>
<h3 data-faq-q="" id="como-configuro-cors-en-api-gateway-para-admitir-multiples-dominios-con-credenciales" tabindex="-1">¿Cómo configuro CORS en API Gateway para admitir múltiples dominios con credenciales?</h3>
<h2 class="sb h2-sbb-cls" id="configurar-cors-en-api-gateway-para-multiples-dominios-con-credenciales" tabindex="-1">Configurar CORS en API Gateway para múltiples dominios con credenciales</h2>
<p>Cuando configures CORS en API Gateway y necesites permitir múltiples dominios con credenciales, es importante ser específico con los orígenes autorizados y habilitar el uso de credenciales de manera adecuada.</p>
<p>En el encabezado <code class="inline-code">Access-Control-Allow-Origin</code>, debes incluir <strong>solo los dominios específicos</strong> que planeas autorizar. Esto es crucial porque <strong>no puedes usar un comodín (<code class="inline-code">*</code>)</strong> si estás trabajando con credenciales.</p>
<p>También es necesario activar el encabezado <code class="inline-code">Access-Control-Allow-Credentials</code> y establecerlo en <code class="inline-code">true</code>. Este paso permite que el navegador envíe cookies o credenciales junto con las solicitudes CORS. Asegúrate de declarar cada dominio de forma explícita en la configuración, ya que esto evitará errores y garantizará que las solicitudes se procesen correctamente.</p>
<h2>Related posts</h2><ul><li><a href="https://dondeaprendoaws.com/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/">Guía para Crear APIs Serverless con AWS Lambda y API Gateway</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/">AWS Lambda y API Gateway: Guía Básica</a></li><li><a href="https://dondeaprendoaws.com/blog/5-practicas-de-seguridad-para-lambda-authorizers/">5 Prácticas de Seguridad para Lambda Authorizers</a></li><li><a href="https://dondeaprendoaws.com/blog/configurar-cors-en-http-api-gateway/">Configurar CORS en HTTP API Gateway</a></li></ul>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"¿Cómo puedo configurar correctamente las cabeceras CORS en API Gateway?","acceptedAnswer":{"@type":"Answer","text":"<h2 id=\"como-configurar-las-cabeceras-cors-en-api-gateway\" tabindex=\"-1\" class=\"sb h2-sbb-cls\">Cómo configurar las cabeceras <strong>CORS</strong> en API Gateway</h2> <p>Configurar las cabeceras <strong>CORS</strong> en API Gateway puede parecer complicado, pero siguiendo unos pasos básicos puedes hacerlo de manera eficaz:</p> <ul> <li><strong>Acceso a la consola</strong>: Ingresa a la consola de API Gateway y selecciona la API que quieres configurar.</li> <li><strong>Selecciona el recurso</strong>: Dirígete a la sección de recursos y elige el recurso específico que necesita soporte para <strong>CORS</strong>.</li> <li><strong>Habilita CORS</strong>: Define los orígenes permitidos, los métodos HTTP y las cabeceras que tu API aceptará.</li> <li><strong>Configura el backend</strong>: Asegúrate de que tu backend incluya cabeceras como <code>Access-Control-Allow-Origin</code> y <code>Access-Control-Allow-Headers</code>.</li> <li><strong>Pruebas finales</strong>: Realiza pruebas para confirmar que todo funciona correctamente y que no hay errores relacionados con <strong>CORS</strong>.</li> </ul> <p>Si ajustas tanto las configuraciones en API Gateway como las respuestas del backend, podrás evitar los problemas más comunes relacionados con <strong>CORS</strong> en tus aplicaciones.</p>"}},{"@type":"Question","name":"¿Qué herramientas puedo usar para identificar y resolver errores CORS en mi API?","acceptedAnswer":{"@type":"Answer","text":"<h2 id=\"como-identificar-y-solucionar-errores-cors-en-tu-api\" tabindex=\"-1\" class=\"sb h2-sbb-cls\">Cómo identificar y solucionar errores CORS en tu API</h2> <p>Resolver problemas de CORS en tu API puede ser más sencillo si utilizas las herramientas adecuadas. Aquí tienes algunas opciones que te serán de gran ayuda:</p> <ul> <li> <strong>Herramientas de desarrollo del navegador</strong>: Estas herramientas, integradas en navegadores como Chrome o Firefox, te permiten inspeccionar solicitudes y respuestas HTTP. Puedes verificar los encabezados y detectar errores relacionados con CORS directamente desde el navegador. </li> <li> <strong>Postman</strong>: Esta plataforma te permite probar tu API enviando solicitudes personalizadas. Es perfecta para revisar configuraciones específicas de CORS y simular diferentes escenarios. </li> <li> <strong>AWS CloudWatch</strong>: Si usas API Gateway en AWS, CloudWatch es indispensable para monitorear registros. Te ayuda a localizar problemas de configuración que puedan estar afectando las políticas de CORS. </li> </ul> <p>Con estas herramientas, podrás identificar los errores con mayor precisión y aplicar las soluciones necesarias de forma más eficiente.</p>"}},{"@type":"Question","name":"¿Cómo configuro CORS en API Gateway para admitir múltiples dominios con credenciales?","acceptedAnswer":{"@type":"Answer","text":"<h2 id=\"configurar-cors-en-api-gateway-para-multiples-dominios-con-credenciales\" tabindex=\"-1\" class=\"sb h2-sbb-cls\">Configurar CORS en API Gateway para múltiples dominios con credenciales</h2> <p>Cuando configures CORS en API Gateway y necesites permitir múltiples dominios con credenciales, es importante ser específico con los orígenes autorizados y habilitar el uso de credenciales de manera adecuada.</p> <p>En el encabezado <code>Access-Control-Allow-Origin</code>, debes incluir <strong>solo los dominios específicos</strong> que planeas autorizar. Esto es crucial porque <strong>no puedes usar un comodín (<code>*</code>)</strong> si estás trabajando con credenciales.</p> <p>También es necesario activar el encabezado <code>Access-Control-Allow-Credentials</code> y establecerlo en <code>true</code>. Este paso permite que el navegador envíe cookies o credenciales junto con las solicitudes CORS. Asegúrate de declarar cada dominio de forma explícita en la configuración, ya que esto evitará errores y garantizará que las solicitudes se procesen correctamente.</p>"}}]}</script>
