---
title: "AWS Lambda y API Gateway: Guía Básica"
description: "Aprende a integrar AWS Lambda y API Gateway para crear aplicaciones serverless escalables y eficientes, con una guía paso a paso."
publishedAt: "2024-11-28"
publishedTimestamp: "2024-11-28T01:29:24.642Z"
cover: "/assets/blog/2aa39fe7ff55b6a37888515e.jpg"
coverAlt: "Thumbnail for: AWS Lambda y API Gateway: Guía Básica"
ogImage: "/assets/blog/2aa39fe7ff55b6a37888515e.jpg"
related:
  - title: "Estructuras multi-cuenta AWS para escalar"
    url: "https://dondeaprendoaws.com/blog/estructuras-multi-cuenta-aws-para-escalar/"
    image: "/assets/blog/0e9e4bdd57782b78da6d878e.jpg"
    imageAlt: ""
  - title: "7 Estrategias para Mitigar Cold Starts en AWS Lambda"
    url: "https://dondeaprendoaws.com/blog/7-estrategias-para-mitigar-cold-starts-en-aws-lambda/"
    image: "/assets/blog/c936f3eb45382355f87b0707.jpg"
    imageAlt: ""
  - title: "Introducción a la Inteligencia Artificial en AWS"
    url: "https://dondeaprendoaws.com/blog/introduccion-a-la-inteligencia-artificial-en-aws/"
    image: "/assets/blog/740fd46916e44bd2c61ce62c.png"
    imageAlt: ""
---

<p><strong>¿Quieres crear aplicaciones sin servidores de manera eficiente?</strong> <a href="https://aws.amazon.com/lambda/">AWS Lambda</a> y <a href="https://aws.amazon.com/api-gateway/">API Gateway</a> son la combinación perfecta para lograrlo. Lambda te permite ejecutar código sin preocuparte por servidores, mientras que <a href="https://aws.amazon.com/api-gateway/">API Gateway</a> gestiona tus APIs, asegurando tráfico, seguridad y monitoreo.</p>
<h3 id="puntos-clave%3A">Puntos clave:</h3>
<ul><li><strong>AWS Lambda</strong>: Ejecuta tu código sin servidores y escala automáticamente según la demanda.</li><li><strong>API Gateway</strong>: Actúa como punto de entrada para tus APIs, con funciones como autenticación, caché y monitoreo.</li><li><strong>Ventajas</strong>:<ul><li>Modelo de costos basado en uso.</li><li>Menor mantenimiento de infraestructura.</li><li>Escalabilidad para manejar miles de solicitudes.</li></ul></li></ul>
<h3 id="comparaci%C3%B3n-r%C3%A1pida%3A">Comparación rápida:</h3>
<table><thead><tr><th>Aspecto</th><th>Lambda</th><th>API Gateway</th></tr></thead><tbody><tr><td>Función principal</td><td>Ejecutar código sin servidores</td><td>Gestionar y exponer APIs</td></tr><tr><td>Escalabilidad</td><td>Automática</td><td>Manejo de tráfico y caché</td></tr><tr><td>Casos de uso</td><td>Procesamiento de datos, microservicios</td><td>APIs REST y HTTP</td></tr></tbody></table>
<p><strong>¿Cómo empezar?</strong> Crea una función Lambda, configúrala con permisos IAM y conéctala a API Gateway para desplegar tu API. Sigue leyendo para aprender los pasos detallados de configuración, pruebas y despliegue.</p>
<h2 id="video-relacionado-de-youtube">Video relacionado de YouTube</h2>
<div><iframe allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" height="315" loading="lazy" src="https://www.youtube-nocookie.com/embed/rdyMHi0WqpI" title="Video de YouTube" width="560"></iframe></div>
<h2 id="c%C3%B3mo-configurar-aws-lambda">Cómo Configurar <a href="https://aws.amazon.com/lambda/">AWS Lambda</a></h2>
<p><img alt="AWS Lambda" src="/assets/blog/c0eb5d69184d1120b29c2a25.jpg"/></p>
<p>Configurar AWS Lambda para trabajar con API Gateway requiere prestar atención a varios pasos clave. Aquí te explicamos cómo hacerlo de manera clara y sencilla.</p>
<h3 id="creando-una-funci%C3%B3n-lambda">Creando una Función Lambda</h3>
<p>AWS Lambda admite lenguajes como Node.js, Python, Java, Go y Ruby. Elige el que prefieras para tu proyecto. Para crear una función Lambda:</p>
<ul><li>Accede a la <a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">consola de AWS</a>.</li><li>Haz clic en <strong>'Crear función'</strong>.</li><li>Selecciona un tiempo de ejecución (runtime) y asigna un nombre a tu función.</li></ul>
<p>Una vez creada, necesitarás comprender cómo los manejadores de eventos procesan las solicitudes.</p>
<h3 id="c%C3%B3mo-funcionan-los-manejadores-de-eventos-lambda">Cómo Funcionan los Manejadores de Eventos Lambda</h3>
<p>El manejador es el núcleo de tu función Lambda. Define cómo se procesan las solicitudes entrantes. Aquí tienes un ejemplo básico:</p>
<pre><code>exports.handler = async (event, context) =&gt; {
    // Lógica de tu función
    return {
        statusCode: 200,
        body: JSON.stringify({ mensaje: "Hola desde Lambda" })
    };
};
</code></pre>
<p>En este ejemplo:</p>
<ul><li><strong><code>event</code></strong>: Contiene los datos de la solicitud entrante.</li><li><strong><code>context</code></strong>: Proporciona información sobre el entorno de ejecución.</li></ul>
<h3 id="configurando-roles-y-permisos-iam">Configurando Roles y Permisos IAM</h3>
<p>Los roles IAM son esenciales para que Lambda interactúe de manera segura con otros servicios de AWS. Asegúrate de configurar un rol con permisos mínimos para garantizar la seguridad. Los permisos más comunes incluyen:</p>
<ul><li><strong>AWSLambdaBasicExecutionRole</strong>: Para registrar logs en <a href="https://aws.amazon.com/cloudwatch/">CloudWatch</a>.</li><li><strong>AWSLambdaRole</strong>: Para permisos adicionales según los servicios que necesites.</li></ul>
<p>Pasos para configurar los permisos:</p>
<ul><li>Crea un nuevo rol IAM desde la consola.</li><li>Selecciona <strong>"Lambda"</strong> como servicio.</li><li>Adjunta las políticas necesarias.</li><li>Asigna el rol a tu función Lambda.</li></ul>
<p>Con estos pasos, tu función Lambda estará lista para integrarse con otros servicios de AWS.</p>
<h2 id="conectando-aws-lambda-con-api-gateway">Conectando AWS Lambda con <a href="https://aws.amazon.com/api-gateway/">API Gateway</a></h2>
<p><img alt="API Gateway" src="/assets/blog/ad213751f1e388f278f0d764.jpg"/></p>
<p>La <a href="https://dondeaprendoaws.com/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/">conexión entre Lambda y API Gateway</a> es clave para desarrollar APIs serverless. Aquí te explicamos cómo hacerlo de manera clara y efectiva.</p>
<h3 id="pasos-para-crear-un-api-gateway">Pasos para Crear un API Gateway</h3>
<p>Para conectar Lambda con API Gateway, lo primero es decidir entre <strong>REST API</strong> o <strong>HTTP API</strong>. REST API ofrece más funcionalidades avanzadas, mientras que HTTP API es más sencilla y económica.</p>
<h3 id="creaci%C3%B3n-del-api">Creación del API</h3>
<p>Entra a la consola de AWS y dirígete a API Gateway. Haz clic en "Crear API" y selecciona el tipo que prefieras. Si estás empezando, HTTP API puede ser una buena opción por su facilidad de uso.</p>
<h3 id="configuraci%C3%B3n-inicial">Configuración inicial</h3>
<p>Asigna un nombre descriptivo a tu API y define configuraciones básicas, como habilitar <strong>CORS</strong> (Cross-Origin Resource Sharing). Esto es esencial para que tu API sea accesible desde diferentes dominios, algo común en aplicaciones web.</p>
<p>Con esta configuración lista, el siguiente paso es establecer cómo API Gateway interactuará con tu función Lambda.</p>
<h3 id="configurando-la-integraci%C3%B3n">Configurando la Integración</h3>
<p>1. <strong>Permisos necesarios</strong></p>
<p>API Gateway necesita permisos específicos para invocar tu función Lambda. A continuación, un ejemplo de política que puedes usar:</p>
<pre><code>{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "lambda:InvokeFunction",
            "Resource": "arn:aws:lambda:region:account-id:function:function-name"
        }
    ]
}
</code></pre>
<p>2. <strong>Proxy vs. No-Proxy</strong></p>
<table><thead><tr><th>Característica</th><th>Proxy</th><th>No-Proxy</th></tr></thead><tbody><tr><td>Configuración</td><td>Simple y rápida</td><td>Más detallada</td></tr><tr><td>Control</td><td>Limitado</td><td>Total</td></tr><tr><td>Formato de respuesta</td><td>Predefinido</td><td>Personalizable</td></tr><tr><td>Uso recomendado</td><td>Prototipos y APIs simples</td><td>APIs complejas</td></tr></tbody></table>
<p>3. <strong>Vinculación de recursos</strong></p>
<p>Crea los recursos necesarios en tu API, como <code>/usuarios</code> o <code>/productos</code>. Luego, configura los métodos HTTP (GET, POST, etc.) y vincúlalos a las funciones Lambda que procesarán las solicitudes.</p>
<p>4. <strong>Pruebas de integración</strong></p>
<p>Usa la herramienta de pruebas de API Gateway para verificar que la integración funcione correctamente. Una vez validado, puedes desplegar tu API para que sea accesible públicamente.</p>
<blockquote><p>"La integración proxy suele ser la mejor opción para la mayoría de los proyectos", señala la <a href="https://dondeaprendoaws.com/blog/aws-curso-certificado-guia-basica/">documentación oficial de AWS</a>.</p></blockquote>
<p>Por último, no olvides crear una etapa de despliegue, como "prod" o "dev", para que tu API esté disponible para los usuarios. Esto se realiza fácilmente desde API Gateway.</p>
<h2 id="testing-and-deploying-your-api">Testing and Deploying Your API</h2>
<h3 id="probando-la-api">Probando la API</h3>
<p>Probar tu API es un paso clave antes de lanzarla al público. La consola de AWS incluye herramientas que simplifican este proceso. Para pruebas más completas, puedes usar opciones como:</p>
<ul><li><strong>Consola de AWS</strong>: Ideal para validaciones rápidas.</li><li><strong><a href="https://www.postman.com/">Postman</a></strong>: Perfecto para pruebas detalladas y automatización.</li><li><strong>curl</strong>: Útil para integraciones con scripts.</li></ul>
<p>Durante las pruebas, asegúrate de revisar aspectos como la transmisión de datos, manejo de errores, tiempos de respuesta y formatos de entrada/salida. Esto ayuda a garantizar que la API funcione correctamente antes de su lanzamiento.</p>
<h3 id="desplegando-la-api">Desplegando la API</h3>
<p>Las etapas son entornos separados que te permiten manejar diferentes versiones de tu API, como desarrollo, pruebas o producción. Los entornos más comunes incluyen:</p>
<ul><li><strong>dev</strong>: Usado para desarrollo y pruebas internas.</li><li><strong>staging</strong>: Diseñado para pruebas de integración.</li><li><strong>prod</strong>: El entorno en el que opera tu API en producción.</li></ul>
<p>Para desplegar tu API, ve a la sección 'Stages' en API Gateway, crea una etapa (como dev, staging o prod), configura las variables necesarias y procede con el despliegue.</p>
<p>Usa <strong>CloudWatch</strong> para monitorear el rendimiento de tu API. Esta herramienta te ayuda a identificar problemas y mejorar el rendimiento en producción. Con CloudWatch, puedes rastrear métricas, configurar alertas y analizar patrones de uso.</p>
<p>Además, lleva un registro de las versiones desplegadas y documenta los cambios realizados en cada una. Esto facilita la resolución de problemas y la gestión de futuras actualizaciones.</p>
<h2 id="soluci%C3%B3n-de-problemas-y-consejos">Solución de Problemas y Consejos</h2>
<h3 id="corrigiendo-errores-comunes">Corrigiendo Errores Comunes</h3>
<p>Al trabajar con Lambda y API Gateway, algunos desafíos habituales suelen estar relacionados con permisos y configuraciones. Aquí tienes una lista de los errores más comunes y cómo solucionarlos:</p>
<table><thead><tr><th>Error</th><th>Causa</th><th>Solución</th></tr></thead><tbody><tr><td>Error 403</td><td>Permisos IAM insuficientes</td><td>Asegúrate de que el rol IAM de Lambda tenga permisos <code>execute-api:Invoke</code>.</td></tr><tr><td>Timeout</td><td>Configuración de tiempo de espera incorrecta</td><td>Ajusta el tiempo de espera en Lambda (máximo 29 segundos para API Gateway).</td></tr><tr><td>Error 502</td><td>Formato de respuesta incorrecto</td><td>Verifica que Lambda devuelva un JSON válido con <code>statusCode</code> y <code>body</code>.</td></tr></tbody></table>
<p>Resolver estos problemas iniciales te ayudará a tener una integración más estable. Una vez superados, puedes centrarte en mejorar el rendimiento y la seguridad.</p>
<h3 id="herramientas-de-monitoreo">Herramientas de Monitoreo</h3>
<p>El monitoreo y los registros son clave para mantener una integración eficiente. <strong>CloudWatch</strong> te permite rastrear métricas importantes, mientras que <strong><a href="https://aws.amazon.com/xray/">X-Ray</a></strong> es ideal para analizar trazas distribuidas. Además, los logs de errores te ayudan a identificar patrones y solucionar problemas rápidamente. Estas herramientas no solo facilitan el mantenimiento, sino que también mejoran el rendimiento general de tu aplicación.</p>
<h3 id="consejos-para-mejorar-la-integraci%C3%B3n">Consejos para Mejorar la Integración</h3>
<p><strong>Rendimiento:</strong></p>
<ul><li>Ajusta la memoria de Lambda según la carga; aumentar la memoria puede mejorar la velocidad y, a veces, reducir costos.</li><li>Activa el caché en API Gateway para disminuir las llamadas innecesarias a Lambda.</li><li>Usa variables de entorno en Lambda para manejar configuraciones que puedan variar entre entornos.</li></ul>
<p><strong>Seguridad:</strong></p>
<ul><li>Habilita SSL/TLS para proteger los datos en tránsito.</li><li>Configura planes de uso y claves de API para gestionar y limitar el acceso.</li><li>Establece límites de velocidad para evitar abusos y proteger tus recursos.</li></ul>
<h3 id="recursos-adicionales-en-d%C3%B3nde-aprendo-aws">Recursos Adicionales en <a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a></h3>
<p><img alt="Dónde Aprendo AWS" src="/assets/blog/0b106b2a88b767bcf792b81e.jpg"/></p>
<p>Si quieres profundizar más, el blog <strong>Dónde Aprendo AWS</strong> ofrece guías prácticas y ejemplos detallados que complementan los temas tratados aquí. Es un excelente recurso en español para la comunidad interesada en AWS.</p>
<h2 id="conclusi%C3%B3n-y-pr%C3%B3ximos-pasos">Conclusión y Próximos Pasos</h2>
<h3 id="puntos-clave-a-tener-en-cuenta">Puntos Clave a Tener en Cuenta</h3>
<p>La combinación de AWS Lambda con API Gateway permite crear APIs sin servidor que sean escalables y eficientes. Para aprovechar al máximo estas herramientas, es crucial entender las opciones de integración disponibles.</p>
<table><thead><tr><th>Aspecto</th><th>Integración Proxy</th><th>Integración No Proxy</th></tr></thead><tbody><tr><td>Configuración</td><td>Automática y rápida</td><td>Manual y detallada</td></tr><tr><td>Control</td><td>Limitado</td><td>Amplio</td></tr><tr><td>Casos de Uso</td><td>Proyectos simples o MVPs</td><td>APIs complejas y personalizadas</td></tr><tr><td>Mantenimiento</td><td>Básico</td><td>Requiere mayor atención</td></tr></tbody></table>
<p>Con este conocimiento, puedes pasar a explorar conceptos más avanzados para mejorar tus habilidades en AWS.</p>
<h3 id="conceptos-avanzados-para-ampliar-tus-conocimientos">Conceptos Avanzados para Ampliar Tus Conocimientos</h3>
<p>Una vez que tengas una base sólida, es hora de profundizar en aspectos más complejos que pueden llevar tus aplicaciones serverless al siguiente nivel.</p>
<p><strong>Seguridad y Autenticación:</strong></p>
<ul><li>Configurar autorizadores personalizados para mayor control.</li><li>Implementar estándares como OAuth y SAML.</li></ul>
<p><strong>Optimización y Monitoreo:</strong></p>
<ul><li>Usar caché en API Gateway para mejorar el rendimiento.</li><li>Analizar métricas con herramientas como AWS X-Ray.</li><li>Configurar alertas personalizadas en CloudWatch para un monitoreo más efectivo.</li></ul>
<p>Además de estas áreas, también es importante pensar en cómo escalar y estructurar adecuadamente tu arquitectura.</p>
<p><strong>Arquitectura y Escalabilidad:</strong></p>
<ul><li>Conectar otros servicios de AWS como <a href="https://aws.amazon.com/dynamodb/">DynamoDB</a> y S3.</li><li>Diseñar patrones de microservicios para mayor flexibilidad.</li><li>Implementar estrategias para versionado y despliegue eficiente.</li></ul>
<p>Recursos como Dónde Aprendo AWS ofrecen guías detalladas sobre temas como autorizadores personalizados y estrategias de despliegue, que pueden complementar tu aprendizaje en estas áreas avanzadas.</p>
<h2 id="preguntas-frecuentes">Preguntas Frecuentes</h2>
<p>En esta sección, aclaramos algunas dudas comunes sobre cómo integrar Lambda con API Gateway de manera eficiente.</p>
<h3 id="%C2%BFqu%C3%A9-debe-devolver-lambda-a-api-gateway%3F">¿Qué debe devolver Lambda a API Gateway?</h3>
<p>Para que API Gateway pueda interpretar las respuestas de Lambda correctamente, la función debe devolver un objeto JSON que incluya un código de estado HTTP, cabeceras (como <em>Content-Type</em>) y un cuerpo en formato JSON. Si el formato no es correcto o ocurre un error, API Gateway generará un error 502 (<em>Internal server error</em>). Si API Gateway rechaza la solicitud de invocación, se devolverá un error 500.</p>
<table><thead><tr><th>Componente</th><th>Descripción</th><th>Ejemplo</th></tr></thead><tbody><tr><td>Código de estado</td><td>Código HTTP de respuesta</td><td>200 para éxito</td></tr><tr><td>Headers</td><td>Cabeceras de respuesta</td><td><em>Content-Type</em>, CORS</td></tr><tr><td>Body</td><td>Cuerpo de la respuesta</td><td>Datos en formato JSON</td></tr></tbody></table>
<h3 id="%C2%BFc%C3%B3mo-implementar-correctamente-una-funci%C3%B3n-lambda-para-api-gateway%3F">¿Cómo implementar correctamente una función Lambda para API Gateway?</h3>
<p>Ahora que sabes qué debe devolver Lambda, veamos cómo estructurar una función que funcione bien con API Gateway.</p>
<p><strong>Formato de la respuesta</strong>: La función debe devolver una respuesta con esta estructura:</p>
<pre><code>{
    "statusCode": 200,
    "headers": {
        "Content-Type": "application/json"
    },
    "body": JSON.stringify({
        "mensaje": "Operación exitosa"
    })
}
</code></pre>
<p><strong>Manejo de errores</strong>: Es importante implementar un sistema de manejo de excepciones que permita devolver códigos de estado HTTP adecuados. Esto ayuda a mejorar la experiencia del usuario y facilita la depuración durante el desarrollo:</p>
<ul><li><strong>400</strong> para errores del cliente (por ejemplo, datos de entrada inválidos).</li><li><strong>500</strong> para errores del servidor.</li><li>Mensajes de error claros y detallados en el cuerpo de la respuesta.</li></ul>
<blockquote><p>"La clave para una integración exitosa entre Lambda y API Gateway es asegurar que la función maneje correctamente tanto los casos de éxito como los de error, devolviendo siempre respuestas en el formato esperado por API Gateway" - Documentación oficial de AWS</p></blockquote>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/desarrollando-aplicaciones-con-aws-lambda/">Desarrollando Aplicaciones con AWS Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/microservicios-en-aws-utilizando-aws-lambda/">Microservicios en AWS Utilizando AWS Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/">Guía para Crear APIs Serverless con AWS Lambda y API Gateway</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-sam-guia-basica-para-aplicaciones-serverless/">AWS SAM: Guía Básica para Aplicaciones Serverless</a></li></ul>
