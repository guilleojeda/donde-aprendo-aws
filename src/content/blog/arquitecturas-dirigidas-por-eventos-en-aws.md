---
title: "Arquitecturas Dirigidas por Eventos en AWS"
description: "Descubre cómo implementar arquitecturas dirigidas por eventos en AWS para crear sistemas flexibles y escalables. Aprende sobre los beneficios, componentes y mejores prácticas en este completo artículo."
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T00:59:24.459Z"
cover: "/assets/blog/1a0df738c1ab9c313bf60144.jpg"
coverAlt: "Thumbnail for: Arquitecturas Dirigidas por Eventos en AWS"
ogImage: "/assets/blog/1a0df738c1ab9c313bf60144.jpg"
related:
  - title: "Automatización de cumplimiento con AWS Config"
    url: "https://dondeaprendoaws.com/blog/automatizacion-de-cumplimiento-con-aws-config/"
    image: "/assets/blog/887b167cb63dec6854e043dc.jpg"
    imageAlt: ""
  - title: "Guía de Eventos AWS Educate 2024"
    url: "https://dondeaprendoaws.com/blog/guia-de-eventos-aws-educate-2024/"
    image: "/assets/blog/835302183289e4165c02383b.jpg"
    imageAlt: ""
  - title: "AWS IoT Edge Simulator: Casos de Uso Reales"
    url: "https://dondeaprendoaws.com/blog/aws-iot-edge-simulator-casos-de-uso-reales/"
    image: "/assets/blog/7854091f527530189ba482f0.png"
    imageAlt: ""
---

<p>Imagina construir aplicaciones flexibles y capaces de crecer rápidamente utilizando AWS. Las arquitecturas dirigidas por eventos (EDA) hacen esto posible, permitiendo que los componentes de tu sistema se comuniquen mediante eventos. Esto facilita la escalabilidad, el procesamiento asíncrono y una rápida adaptación a cambios. Aquí tienes lo esencial que necesitas saber sobre EDA en AWS:</p>


<ul>
<li><strong>Desacoplamiento de componentes:</strong> Permite que los servicios funcionen independientemente.</li>
<li><strong>Escalabilidad:</strong> Fácilmente añade más componentes según sea necesario.</li>
<li><strong>Resiliencia:</strong> Los fallos en un componente no afectan al sistema completo.</li>
<li><strong>Eficiencia de costos:</strong> Paga solo por los recursos que utilizas.</li>
</ul>


<p><strong>Servicios clave de AWS para EDA:</strong></p>


<ul>
<li><strong>Amazon EventBridge:</strong> Gestiona el flujo de eventos entre aplicaciones.</li>
<li><strong>Amazon SNS:</strong> Permite la comunicación mediante la publicación y suscripción de mensajes.</li>
<li><strong>Amazon SQS:</strong> Ofrece colas de mensajes para almacenar y transferir mensajes.</li>
</ul>


<p>Con estas herramientas, puedes diseñar sistemas que no solo son robustos y escalables, sino también eficientes en costos y fáciles de mantener.</p>


<h3 id="%C2%BFqu%C3%A9-es-una-arquitectura-dirigida-por-eventos-(eda)%3F" tabindex="-1">¿Qué es una arquitectura dirigida por eventos (EDA)?</h3>


<p>Imagina un sistema donde las partes se comunican solo cuando algo importante sucede, como cuando recibes un mensaje en tu teléfono. Eso es, en esencia, una arquitectura dirigida por eventos. Aquí, las partes de una aplicación se pasan notas (eventos) cuando algo cambia o necesita atención.</p>


<p>Los puntos clave de este sistema son:</p>


<ul>
<li><strong>Desacoplamiento de componentes:</strong> Las partes trabajan por su cuenta, sin necesidad de saber exactamente qué hacen las demás.</li>
<li><strong>Comunicación mediante eventos:</strong> Las partes no hablan directamente, solo se envían eventos para comunicarse.</li>
<li><strong>Escalabilidad:</strong> Puedes añadir más partes (productores o consumidores de eventos) según sea necesario, sin complicaciones.</li>
</ul>


<h3 id="componentes-de-una-eda" tabindex="-1">Componentes de una EDA</h3>


<p>Los ingredientes principales de este sistema son:</p>


<ul>
<li><strong>Productores de eventos:</strong> Son los que avisan cuando algo pasa, como un sensor que detecta movimiento.</li>
<li><strong>Consumidores de eventos:</strong> Son los que reciben el aviso y actúan en consecuencia, como una app que te manda una notificación.</li>
<li><strong>Brokers de eventos:</strong> Son como los carteros que llevan los eventos del productor al consumidor. Ejemplos incluyen Amazon SQS y Amazon Kinesis.</li>
</ul>


<h3 id="beneficios-de-eda" tabindex="-1">Beneficios de EDA</h3>


<p>Algunas ventajas de usar este sistema son:</p>


<ul>
<li>
<p>Puedes hacer crecer el sistema fácilmente, solo añadiendo más partes donde sea necesario.</p>
</li>
<li>
<p>Es más resistente a problemas, ya que si una parte falla, no afecta directamente a las demás.</p>
</li>
<li>
<p>Facilita el trabajo de desarrollo, ya que puedes enfocarte en una parte a la vez.</p>
</li>
<li>
<p>Ayuda a ahorrar, especialmente si usas servicios que cobran por uso, como AWS Lambda.</p>
</li>
</ul>


<p>Este enfoque te ayuda a crear sistemas que son fáciles de expandir, resistentes y no muy caros de mantener usando AWS.</p>


<h2 id="implementando-eda-en-aws" tabindex="-1">Implementando EDA en AWS</h2>


<h3 id="configuraci%C3%B3n-inicial" tabindex="-1">Configuración inicial</h3>


<p>Para empezar con una arquitectura dirigida por eventos en AWS, es bueno seguir estos pasos básicos:</p>


<ul>
<li>Asegúrate de que los servicios de AWS puedan hablar entre sí configurando roles y políticas de IAM. Esto es como darles permiso para compartir información.</li>
<li>Crea una red privada virtual (VPC) para poner ahí todos tus componentes. Esta red tendrá áreas públicas y privadas.</li>
<li>Establece reglas de seguridad para que los servicios puedan intercambiar datos sin problemas. Por ejemplo, que Amazon EventBridge pueda enviar información a Lambda.</li>
<li>Prepara un espacio en S3 para guardar registros y otros datos importantes. No olvides ajustar los permisos para controlar quién puede ver o usar esos datos.</li>
</ul>


<h3 id="patrones-comunes-de-eda" tabindex="-1">Patrones comunes de EDA</h3>


<p>Algunos diseños que mucha gente usa en EDA son:</p>


<ul>
<li><strong>Publicación/Suscripción</strong>: Aquí, quien crea el evento lo manda a un lugar común y los interesados en ese tipo de eventos se conectan para recibirlos. Amazon SNS es un ejemplo.</li>
<li><strong>Event Sourcing</strong>: Se guarda un registro de todos los eventos en un orden específico. Esto ayuda a entender cómo ha cambiado la información con el tiempo.</li>
<li><strong>Cadena de Responsabilidad</strong>: Es como pasar el evento de mano en mano, donde cada servicio hace algo con él si es necesario, o lo pasa al siguiente.</li>
</ul>


<h3 id="casos-de-uso" tabindex="-1">Casos de uso</h3>


<p>EDA es útil para muchas cosas, como:</p>


<ul>
<li><strong>Procesamiento de pedidos</strong>: Cuando alguien hace un pedido, se pueden crear eventos para diferentes áreas como inventario o envíos, y cada una maneja su parte.</li>
<li><strong>CI/CD</strong>: Los cambios en el código pueden iniciar automáticamente procesos para revisar y desplegar ese código.</li>
<li><strong>Analytics</strong>: Analizar cómo la gente usa una aplicación a partir de los eventos que genera.</li>
<li><strong>IoT</strong>: Los dispositivos conectados envían datos constantemente que se pueden usar para monitoreo o alertas.</li>
</ul>


<p>En pocas palabras, EDA ayuda a que los sistemas trabajen juntos de manera más eficiente, permitiendo que crezcan y se adapten fácilmente.</p>


<h2 id="mejores-pr%C3%A1cticas-para-eda-en-aws" tabindex="-1">Mejores prácticas para EDA en AWS</h2>


<h3 id="estrategias-de-dise%C3%B1o" tabindex="-1">Estrategias de diseño</h3>


<p>Al crear una arquitectura dirigida por eventos en AWS, es bueno tener en cuenta estas recomendaciones:</p>


<ul>
<li><strong>Mantén los componentes separados</strong>. Cada parte debe funcionar por su cuenta, usando eventos para comunicarse. Esto hace más fácil aumentar o mejorar el sistema.</li>
<li><strong>Define bien los eventos</strong>. Los eventos deben llevar solo la información necesaria para que quienes los reciban puedan actuar. Ni más, ni menos.</li>
<li><strong>Prepárate para los fallos</strong>. Piensa en cómo manejar eventos que no se procesen bien, como intentar de nuevo o guardarlos para después. SQS y EventBridge son útiles aquí.</li>
<li><strong>Idempotencia</strong>. Esto significa que si un evento se procesa más de una vez, no debería causar problemas. Es una manera de evitar resultados inesperados.</li>
<li><strong>Piensa en la seguridad desde el principio</strong>. Usa control de acceso, cifra tus datos, y considera usar redes privadas virtuales.</li>
</ul>


<h3 id="optimizaci%C3%B3n-de-costos" tabindex="-1">Optimización de costos</h3>


<p>Aquí van algunas ideas para no gastar de más:</p>


<ul>
<li>
<p>Aprovecha SQS, SNS y Kinesis que ajustan su capacidad automáticamente. Así no pagas por más de lo que necesitas.</p>
</li>
<li>
<p>Guarda eventos que no necesitas de inmediato en S3 Infrequent Access, que es más barato. Luego, muévelos a Standard cuando los vayas a usar.</p>
</li>
<li>
<p>Prefiere usar Lambda en lugar de servidores que estén encendidos todo el tiempo. Con Lambda, pagas solo por lo que usas.</p>
</li>
<li>
<p>Revisa y ajusta lo que pagas por capacidad que realmente usas. No gastes en lo que no necesitas.</p>
</li>
<li>
<p>Considera si DynamoDB On-Demand te sale más a cuenta que tener una capacidad fija.</p>
</li>
</ul>


<h3 id="monitoreo-y-logs" tabindex="-1">Monitoreo y logs</h3>


<p>Es importante mantener un ojo en cómo va todo para solucionar rápido cualquier problema.</p>


<ul>
<li>
<p>Guarda los registros (logs) de todos los componentes en un lugar común como un bucket S3. CloudWatch puede ayudar con esto.</p>
</li>
<li>
<p>Activa alertas en CloudWatch para cosas importantes como errores o retrasos.</p>
</li>
<li>
<p>Usa AWS X-Ray para seguir la pista de los eventos a través del sistema.</p>
</li>
<li>
<p>CloudWatch Dashboards es bueno para tener una vista general del estado de tu sistema.</p>
</li>
<li>
<p>Para un monitoreo más detallado, puedes usar servicios como Managed Prometheus y Managed Grafana.</p>
</li>
</ul>


<h2 id="servicios-de-aws-para-implementar-eda" tabindex="-1">Servicios de AWS para implementar EDA</h2>


<p>Vamos a hablar de algunos servicios de AWS que te ayudan a poner en marcha arquitecturas dirigidas por eventos de manera sencilla:</p>


<h3 id="amazon-eventbridge" tabindex="-1"><a href="https://aws.amazon.com/eventbridge/" rel="noopener noreferrer" target="_blank">Amazon EventBridge</a></h3>


<p><figure><img alt="Amazon EventBridge" src="/assets/blog/dcba27902d45cd07a719ed13.jpg"/></figure></p>


<p>Amazon EventBridge es como un sistema de correo para eventos, que te permite enviar y recibir información de eventos en tiempo real entre diferentes aplicaciones y servicios de AWS. Puedes crear tus propios canales de eventos, especificar reglas para dirigir estos eventos a donde necesites, y conectar fácilmente distintas partes de tus aplicaciones.</p>


<p>Aspectos importantes de EventBridge:</p>


<ul>
<li>Se conecta con más de 90 servicios de AWS, permitiéndote usarlos como puntos de inicio o de llegada para los eventos.</li>
<li>Puede enviar eventos en tiempo real a servicios como Lambda, SQS, SNS.</li>
<li>Permite filtrar eventos para que solo lleguen los que realmente interesan.</li>
<li>Puedes cambiar la información de los eventos antes de pasarlos a otro servicio.</li>
<li>Ofrece un registro de eventos para que puedas revisar y arreglar problemas fácilmente.</li>
</ul>


<p>EventBridge es genial para separar partes de tu aplicación y hacer sistemas que se pueden ajustar y crecer fácilmente.</p>


<h3 id="amazon-sns" tabindex="-1"><a href="https://aws.amazon.com/sns/" rel="noopener noreferrer" target="_blank">Amazon SNS</a></h3>


<p><figure><img alt="Amazon SNS" src="/assets/blog/8201b20ff4631e566e1d41df.jpg"/></figure></p>


<p>Amazon Simple Notification Service (SNS) es como un tablón de anuncios para tus aplicaciones y servicios, donde puedes publicar mensajes que otros componentes pueden recibir.</p>


<p>Lo que hace especial a SNS:</p>


<ul>
<li>Puede mandar mensajes directamente a dispositivos móviles.</li>
<li>Se integra con Lambda para que puedas correr código automáticamente cuando lleguen mensajes.</li>
<li>Te permite filtrar los mensajes para que solo recibas los que te interesan.</li>
<li>Puede guardar mensajes en SQS para que los manejes cuando puedas.</li>
<li>Si un mensaje no llega a su destino, lo intentará enviar de nuevo automáticamente.</li>
</ul>


<p>SNS te ayuda a mantener comunicadas las diferentes partes de tus sistemas sin que estén directamente conectadas.</p>


<h3 id="amazon-sqs" tabindex="-1"><a href="https://aws.amazon.com/sqs/" rel="noopener noreferrer" target="_blank">Amazon SQS</a></h3>


<p><figure><img alt="Amazon SQS" src="/assets/blog/b0789df1f55a01d05145a3f4.jpg"/></figure></p>


<p>Amazon Simple Queue Service (SQS) es como una fila en el banco para tus mensajes. Permite que las partes de tu aplicación se comuniquen dejando y recogiendo mensajes en una cola.</p>


<p>Cosas clave sobre SQS:</p>


<ul>
<li>Borra los mensajes automáticamente una vez que se han procesado.</li>
<li>Ajusta su tamaño automáticamente para manejar más o menos mensajes.</li>
<li>Los mensajes pueden quedarse en la cola hasta por 14 días.</li>
<li>Tiene reglas para manejar mensajes que no se procesan a la primera.</li>
<li>Mantiene tus mensajes seguros mientras esperan ser procesados.</li>
</ul>


<p>SQS es una herramienta útil para asegurarte de que los mensajes lleguen a donde deben, incluso cuando las cosas están ocupadas, manteniendo tus aplicaciones trabajando suavemente.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>Usar arquitecturas dirigidas por eventos en AWS es una buena idea para crear sistemas que pueden crecer y cambiar fácilmente sin romperse. Aquí van algunos consejos para hacerlo bien:</p>


<p><strong>Define bien los eventos</strong></p>


<p>Los eventos son super importantes. Asegúrate de que cada evento tenga toda la información necesaria para que quien lo reciba sepa qué hacer. Piensa en los eventos como mensajes claros y directos.</p>


<p><strong>Que cada parte haga lo suyo</strong></p>


<p>Cada pieza de tu sistema debe trabajar sola, hablando con las demás solo a través de eventos. Esto hace que sea más fácil hacer cambios o arreglos sin problemas.</p>


<p><strong>Prepara todo desde el inicio</strong></p>


<p>Asegúrate de que todo esté listo para que las partes de tu sistema puedan comunicarse sin problemas. Esto incluye configurar la red, los permisos y la seguridad. Y no te olvides de activar los registros para poder seguir lo que pasa.</p>


<p><strong>Usa los servicios de AWS que mejor te convengan</strong></p>


<p>EventBridge, SNS y SQS son geniales para manejar eventos. AWS Lambda es perfecto para correr código sin preocuparte por servidores. Escoge lo que mejor se adapte a lo que necesitas.</p>


<p><strong>Mantén un ojo en cómo va todo</strong></p>


<p>Es clave que sepas cómo está funcionando tu sistema. Usa herramientas como CloudWatch y X-Ray para ver lo que pasa y para estar al tanto de cualquier problema.</p>


<p><strong>Ahorra dinero pagando solo por lo que usas</strong></p>


<p>Benefíciate de servicios que se ajustan automáticamente como Lambda y DynamoDB on-demand. Guarda eventos que no uses mucho en S3 Infrequent Access. Y siempre revisa tus gastos para no pagar de más.</p>


<p>Siguiendo estos consejos, podrás crear sistemas que pueden crecer y cambiar fácilmente usando AWS.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-es-la-arquitectura-basada-en-eventos%3F" tabindex="-1">¿Qué es la arquitectura basada en eventos?</h3>


<p>La arquitectura basada en eventos se trata de usar señales, o 'eventos', para que diferentes partes de un sistema se comuniquen. Es como si cada parte del sistema tuviera un buzón de correo para enviar y recibir mensajes. Esto es muy útil cuando tienes muchas partes trabajando juntas pero de manera independiente, como en sistemas que usan microservicios. Los eventos ayudan a que el sistema se adapte y crezca fácilmente.</p>


<h3 id="%C2%BFqu%C3%A9-es-arquitectura-en-aws%3F" tabindex="-1">¿Qué es arquitectura en AWS?</h3>


<p>La arquitectura en AWS se refiere a cómo organizas y construyes tus proyectos en la nube de AWS. Piensa en ello como el plan de construcción para una casa, pero para tus aplicaciones y datos en internet. Involucra elegir los servicios de AWS que necesitas, cómo van a interactuar, y cómo mantener todo funcionando de manera eficiente y segura.</p>


<h3 id="%C2%BFqu%C3%A9-es-eda-en-sistemas%3F" tabindex="-1">¿Qué es EDA en sistemas?</h3>


<p>EDA en sistemas significa usar eventos para que diferentes partes de un software se comuniquen entre sí. En lugar de que un pedazo de código llame directamente a otro, envía un mensaje o 'evento' que otro pedazo de código puede recoger y responder. Esto ayuda a que cada parte del sistema trabaje de forma independiente, facilitando cambios y mejoras sin afectar todo el sistema.</p>


<h3 id="%C2%BFqu%C3%A9-es-eda-en-ti%3F" tabindex="-1">¿Qué es EDA en TI?</h3>


<p>EDA en TI se refiere al Análisis Exploratorio de Datos. Es como hacer detective con tus datos, buscando pistas sobre cómo se comportan, si hay algo raro, o patrones interesantes. Esto se hace antes de empezar a usar algoritmos más complicados, para tener una buena idea de cómo son tus datos y qué esperar de ellos.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores prácticas AWS para DevOps</a></li><li><a href="https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/">Arquitecturas de Alta Disponibilidad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">Introducción a Serverless en AWS</a></li>
</ul>
</p>
