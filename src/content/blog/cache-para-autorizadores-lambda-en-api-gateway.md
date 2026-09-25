---
title: "Caché para Autorizadores Lambda en API Gateway"
description: "Aprende cómo implementar caché en autorizadores Lambda de API Gateway para mejorar rendimiento, reducir costos y minimizar invocaciones innecesarias."
publishedAt: "2024-11-28"
publishedTimestamp: "2024-11-28T00:05:44.586Z"
cover: "/assets/blog/88ec1a2d5d2521db3a61ab5a.jpg"
coverAlt: "Thumbnail for: Caché para Autorizadores Lambda en API Gateway"
ogImage: "/assets/blog/88ec1a2d5d2521db3a61ab5a.jpg"
related:
  - title: "Mejores prácticas para nombres en AWS Organizations"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-nombres-en-aws-organizations/"
    image: "/assets/blog/bfdfed56910493c9a698fb14.jpg"
    imageAlt: ""
  - title: "AWS Organizations: Estructuras de cuentas y nombres"
    url: "https://dondeaprendoaws.com/blog/aws-organizations-estructuras-de-cuentas-y-nombres/"
    image: "/assets/blog/0bc804415b6cb6339123371f.jpg"
    imageAlt: ""
  - title: "Cómo Desarrollar Aplicaciones de Inteligencia Artificial en AWS"
    url: "https://dondeaprendoaws.com/blog/como-desarrollar-aplicaciones-de-inteligencia-artificial-en-aws/"
    image: "/assets/blog/ac5297dc259dcbbe8d397c9d.jpg"
    imageAlt: ""
---

<p>El uso de caché en autorizadores Lambda de API Gateway permite reducir latencia, ahorrar costos y minimizar invocaciones innecesarias a Lambda. Aquí tienes los puntos clave para implementarlo correctamente:</p>
<ul><li><strong>Tipos de Autorizadores Lambda</strong>:<ul><li><strong>TOKEN</strong>: Usa el encabezado <code>Authorization</code> para validar tokens como JWT.</li><li><strong>REQUEST</strong>: Combina múltiples fuentes de identidad (headers, query strings, etc.) para autorizaciones más detalladas.</li></ul></li><li><strong>Claves de Caché</strong>:<ul><li>TOKEN: Basadas en el encabezado <code>Authorization</code>.</li><li>REQUEST: Personalizables con headers, query strings, variables de etapa o contexto.</li></ul></li><li><strong>Tiempo de Vida (TTL)</strong>:<ul><li>Predeterminado: 300 segundos.</li><li>Configurable hasta 3600 segundos. Un TTL más corto mejora seguridad; uno más largo optimiza rendimiento.</li></ul></li><li><strong><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores Prácticas</a></strong>:<ul><li>Usa políticas generales para reducir invocaciones.</li><li>Personaliza claves de caché con variables como <code>$context.resourcePath</code> o <code>$context.httpMethod</code>.</li><li>Monitorea el uso del caché con <a href="https://docs.aws.amazon.com/cloudwatch/">CloudWatch</a> y ajusta según métricas.</li></ul></li></ul>
<blockquote><p><strong>Ejemplo rápido</strong>: Configura el caché con un TTL de 3600s para endpoints con cambios poco frecuentes y utiliza <code>$context.httpMethod</code> para políticas específicas por método HTTP.</p></blockquote>
<p><strong>Ventaja clave</strong>: Una configuración adecuada del caché puede reducir la latencia hasta en un 70% en escenarios de alta concurrencia.</p>
<h2 id="video-relacionado-de-youtube">Video relacionado de YouTube</h2>
<div><iframe allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" height="315" loading="lazy" src="https://www.youtube-nocookie.com/embed/al5I9v5Y-kA" title="Video de YouTube" width="560"></iframe></div>
<h2 id="c%C3%B3mo-funciona-el-cach%C3%A9-para-autorizadores-lambda">Cómo Funciona el Caché para Autorizadores Lambda</h2>
<p>El caché en autorizadores Lambda ayuda a mejorar el rendimiento al minimizar invocaciones repetidas. Aquí veremos cómo configurar las claves de caché y otros aspectos clave para optimizar su uso.</p>
<h3 id="claves-de-cach%C3%A9%3A-lo-b%C3%A1sico">Claves de Caché: Lo Básico</h3>
<p>Las claves de caché dependen del tipo de autorizador que estés usando. En los autorizadores tipo <code>TOKEN</code>, la clave se genera a partir del valor del encabezado de autorización. Por otro lado, los autorizadores <code>REQUEST</code> permiten combinar diferentes fuentes de identidad para una identificación más precisa:</p>
<ul><li><strong>Encabezados</strong>: Ideal para tokens JWT y métodos de autenticación estándar.</li><li><strong>Query Strings</strong>: Útiles para claves de API y parámetros de autorización.</li><li><strong>Variables de Etapa</strong>: Permiten configuraciones específicas para cada entorno.</li><li><strong>Variables de Contexto</strong>: Ofrecen un control más detallado sobre el acceso.</li></ul>
<p>Elegir las fuentes de identidad adecuadas es clave para lograr un balance entre rendimiento y seguridad en el caché.</p>
<h3 id="expiraci%C3%B3n-del-cach%C3%A9-y-ttl">Expiración del Caché y TTL</h3>
<p>El tiempo de vida (TTL) del caché define cuánto tiempo una política permanece válida. Aquí hay algunos puntos importantes:</p>
<ul><li>TTL más corto mejora la seguridad, pero aumenta la carga en Lambda.</li><li>TTL más largo mejora el rendimiento, aunque puede usar políticas obsoletas.</li><li>Configurar el TTL en 0 desactiva el caché por completo.</li></ul>
<p>El TTL predeterminado es de 300 segundos, pero puedes configurarlo hasta un máximo de 3600 segundos.</p>
<h3 id="c%C3%B3mo-elegir-la-clave-de-cach%C3%A9-ideal">Cómo Elegir la Clave de Caché Ideal</h3>
<p>Seleccionar la clave de caché correcta es fundamental para equilibrar eficiencia y granularidad. Para autorizadores <code>REQUEST</code>, considera incluir variables de contexto específicas como:</p>
<table><thead><tr><th>Variable de Contexto</th><th>Beneficio</th></tr></thead><tbody><tr><td>httpMethod</td><td>Define políticas específicas por método HTTP.</td></tr><tr><td>resourcePath</td><td>Permite un control detallado por recurso.</td></tr><tr><td>accountId</td><td>Facilita la <a href="https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/">separación por cuenta de AWS</a>.</td></tr></tbody></table>
<blockquote><p>"La implementación efectiva del caché puede reducir la latencia hasta en un 70% en escenarios de alta concurrencia, siempre que las claves de caché estén correctamente configuradas."</p></blockquote>
<h2 id="mejores-pr%C3%A1cticas-para-usar-el-cach%C3%A9">Mejores Prácticas para Usar el Caché</h2>
<p>Implementar el caché en autorizadores Lambda de manera eficaz requiere un enfoque bien pensado. Aquí tienes algunas recomendaciones clave para mejorar el rendimiento y mantener la seguridad.</p>
<h3 id="creaci%C3%B3n-de-pol%C3%ADticas-de-autorizaci%C3%B3n-generales">Creación de Políticas de Autorización Generales</h3>
<p>Diseñar políticas que cubran varios recursos relacionados puede reducir las llamadas innecesarias a Lambda. Por ejemplo, agrupar recursos similares, definir permisos basados en roles y establecer niveles claros de acceso ayuda a aprovechar mejor el caché. Sin embargo, evita que las políticas sean demasiado específicas, ya que esto podría generar denegaciones no deseadas y aumentar las solicitudes a Lambda.</p>
<h3 id="uso-de-comodines-en-pol%C3%ADticas">Uso de Comodines en Políticas</h3>
<p>Los comodines son útiles para gestionar varios endpoints de API de forma sencilla. Por ejemplo, usar una política como <code>arn:aws:execute-api:${region}:${accountId}:${apiId}/${stage}/*/productos/*</code> otorga acceso a todos los métodos HTTP relacionados con la ruta 'productos'. Esto simplifica la configuración, especialmente en APIs con muchos endpoints, sin sacrificar la seguridad.</p>
<h3 id="variables-de-contexto-en-claves-de-cach%C3%A9">Variables de Contexto en Claves de Caché</h3>
<p>Personalizar las claves de caché con variables de contexto permite un control más detallado. Variables como <code>$context.httpMethod</code>, <code>$context.resourcePath</code> y <code>$context.identity.sourceIp</code> ayudan a crear claves específicas que regulan el acceso según el método HTTP, la ruta del recurso o la IP de origen. También puedes incluir variables de etapa o parámetros específicos, aunque esto podría disminuir la eficiencia del caché.</p>
<p>El desafío está en equilibrar la precisión de las políticas con la eficiencia del caché. Si las políticas son demasiado detalladas, aumentarás las llamadas a Lambda; si son demasiado generales, podrías poner en riesgo la seguridad.</p>
<p>Aplicando estas prácticas, es posible mantener un rendimiento alto y un control sólido sobre la seguridad y el acceso.&lt;/</p>
<h2 id="soluci%C3%B3n-de-problemas-y-mejora-del-cach%C3%A9">Solución de Problemas y Mejora del Caché</h2>
<p>Optimizar el caché y solucionar problemas comunes es clave para mantener un alto rendimiento y garantizar la seguridad de tus APIs.</p>
<h3 id="verificando-el-funcionamiento-del-cach%C3%A9">Verificando el Funcionamiento del Caché</h3>
<p>Para asegurarte de que el caché está funcionando correctamente, utiliza registros en tu autorizador Lambda y monitorea con CloudWatch. Agrega mensajes de registro a tu función Lambda, como este ejemplo:</p>
<pre><code>def lambda_handler(event, context):
    print(f"Autorización solicitada para: {event['methodArn']}")
    # Resto del código del autorizador
</code></pre>
<p>Con CloudWatch, puedes observar cuántas veces se invoca el autorizador Lambda. Si el caché está funcionando bien, notarás menos invocaciones, ya que API Gateway usará las políticas almacenadas. Si encuentras problemas, como políticas obsoletas, existen herramientas específicas para invalidar el caché.</p>
<h3 id="invalidando-pol%C3%ADticas-en-cach%C3%A9">Invalidando Políticas en Caché</h3>
<p>La API <code>FlushStageAuthorizersCache</code> es una herramienta útil para eliminar políticas almacenadas en caché. Esto afecta a todas las políticas guardadas para los usuarios en una etapa específica de la API. Es útil en situaciones como:</p>
<ul><li>Cuando actualizas la lógica de autorización en tu función Lambda.</li><li>Si identificas comportamientos inesperados en la autorización.</li></ul>
<p>Usa el siguiente comando en AWS CLI para ejecutar esta operación:</p>
<pre><code>aws apigateway flush-stage-authorizers-cache --rest-api-id abc123 --stage-name prod
</code></pre>
<h3 id="balance-entre-rendimiento-y-seguridad">Balance entre Rendimiento y Seguridad</h3>
<p>Una vez resueltos los problemas, configura el caché para equilibrar rendimiento y seguridad. Aquí tienes una tabla de referencia para el Tiempo de Vida (TTL) del caché:</p>
<table><thead><tr><th>TTL</th><th>Ventajas</th><th>Desventajas</th></tr></thead><tbody><tr><td>300s (5 min)</td><td>Más seguro</td><td>Costos más altos</td></tr><tr><td>3600s (1 hora)</td><td>Buen equilibrio</td><td>Actualizaciones más lentas</td></tr><tr><td>86400s (24 horas)</td><td>Mejor rendimiento</td><td>Riesgo de desactualización</td></tr></tbody></table>
<p>Para lograr un buen balance:</p>
<ul><li>Ajusta el TTL según la frecuencia de cambios en tus políticas.</li><li>Emplea variables de contexto para estrategias más específicas.</li><li>Monitorea las métricas de CloudWatch para realizar ajustes según sea necesario.</li></ul>
<blockquote><p>"El uso de variables de contexto en autorizadores REQUEST permite crear estrategias de caché más precisas, mejorando significativamente el balance entre rendimiento y seguridad" - Documentación de AWS API Gateway</p></blockquote>
<p>Utiliza variables como <code>$context.resourcePath</code> y <code>$context.httpMethod</code> en las claves de caché para lograr mayor precisión en tus configuraciones.</p>
<h2 id="conclusi%C3%B3n">Conclusión</h2>
<h3 id="resumen-de-puntos-clave">Resumen de Puntos Clave</h3>
<p>Configurar correctamente el caché en autorizadores Lambda para API Gateway puede mejorar notablemente el rendimiento de tus APIs. Al reducir la latencia y disminuir las llamadas innecesarias al autorizador Lambda, también puedes optimizar costos operativos.</p>
<p>Para lograrlo, es clave seleccionar las claves de caché adecuadas, especialmente en autorizadores de tipo <code>REQUEST</code>. Usar variables de contexto como <code>$context.resourcePath</code> y <code>$context.httpMethod</code> permite crear políticas de autorización más detalladas y específicas.</p>
<p>El tiempo de vida del caché (TTL) es otro aspecto importante. Con un valor predeterminado de 300 segundos y un máximo de 3600 segundos, ajustar el TTL según las necesidades de tu aplicación es esencial para equilibrar rendimiento y seguridad.</p>
<blockquote><p>"La implementación efectiva del caché en API Gateway puede reducir significativamente la latencia y mejorar la experiencia del usuario, mientras se mantiene un alto nivel de seguridad" - Documentación de AWS API Gateway</p></blockquote>
<h3 id="recursos-adicionales-de-aprendizaje">Recursos Adicionales de Aprendizaje</h3>
<p>Si quieres seguir aprendiendo sobre API Gateway y cómo aprovechar al máximo sus capacidades de caché, aquí tienes algunos recursos útiles:</p>
<ul><li><strong>Documentación oficial de AWS</strong>: Proporciona información técnica detallada y las últimas actualizaciones.</li><li><strong>Foros de AWS</strong>: Ideales para resolver dudas específicas y explorar casos de uso reales.</li><li><strong><a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a></strong>: Un blog en español con tutoriales prácticos y guías detalladas sobre API Gateway, Lambda y otros servicios de AWS.</li></ul>
<table><thead><tr><th>Recurso</th><th>Ventaja principal</th></tr></thead><tbody><tr><td>Documentación oficial de AWS</td><td>Información técnica y actualizaciones recientes</td></tr><tr><td>Foros de AWS</td><td>Resolución de problemas y casos prácticos</td></tr><tr><td><a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a></td><td>Guías en español y ejemplos orientados a práctica</td></tr></tbody></table>
<p>Aprovechar estos recursos te ayudará a perfeccionar tus habilidades en la gestión de caché para API Gateway y a optimizar tus autorizadores Lambda.</p>
<h2 id="preguntas-frecuentes">Preguntas Frecuentes</h2>
<p>Aquí respondemos algunas preguntas comunes sobre el uso de autorizadores Lambda y estrategias de caché en API Gateway.</p>
<h3 id="%C2%BFqu%C3%A9-es-el-cach%C3%A9-de-autorizaci%C3%B3n-en-aws-api-gateway%3F">¿Qué es el caché de autorización en <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html">AWS API Gateway</a>?</h3>
<p><img alt="AWS API Gateway" src="/assets/blog/65d2da97607b8af794ec576d.jpg"/></p>
<p>El caché de autorización en API Gateway verifica que las fuentes de identidad necesarias estén presentes en cada solicitud. Este sistema guarda políticas de autorización para solicitudes con fuentes de identidad completas, lo que disminuye la necesidad de llamar al autorizador Lambda en cada ocasión. Si el tiempo de vida del caché (TTL) expira, se genera una nueva política al invocar nuevamente al autorizador.</p>
<table><thead><tr><th>Comportamiento</th><th>Resultado</th></tr></thead><tbody><tr><td>Fuentes de identidad completas</td><td>Usa el caché para procesar la solicitud</td></tr><tr><td>TTL expirado</td><td>Llama nuevamente al autorizador</td></tr></tbody></table>
<p>El TTL indica cuánto tiempo se almacenan las políticas antes de que sea necesario regenerarlas.</p>
<h3 id="%C2%BFpor-qu%C3%A9-usar-un-autorizador-lambda%3F">¿Por qué usar un autorizador Lambda?</h3>
<p>Un autorizador Lambda es una función personalizada que valida las solicitudes antes de que accedan a una API. Es ideal cuando necesitas implementar reglas de autorización más avanzadas que las ofrecidas por las opciones estándar de API Gateway. Cuando un cliente envía una solicitud, el autorizador Lambda verifica la identidad del usuario y genera una política <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html">IAM</a> que define si se permite o deniega el acceso.</p>
<h3 id="%C2%BFc%C3%B3mo-habilito-el-cach%C3%A9-en-api-gateway%3F">¿Cómo habilito el caché en API Gateway?</h3>
<p>Para activar el caché, ingresa a la consola de API Gateway, selecciona 'Stages', elige una etapa, edita los detalles y habilita la opción 'Habilitar caché de API' en la sección de 'Cache settings'.</p>
<p>Si necesitas invalidar el caché manualmente, puedes hacerlo incluyendo el encabezado <code>Cache-Control: max-age=0</code> en tus solicitudes.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/optimizacion-de-costos-de-aws-lambda/">Optimización de Costos de AWS Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/">AWS Lambda: Costo vs. Rendimiento</a></li><li><a href="https://dondeaprendoaws.com/blog/estrategias-de-cache-rentables-para-apps-serverless/">Estrategias de Caché Rentables para Apps Serverless</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/">AWS Lambda y API Gateway: Guía Básica</a></li></ul>
