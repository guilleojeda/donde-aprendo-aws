---
title: "AWS Web Application Firewall (WAF)"
description: "Protege tus aplicaciones web en AWS con AWS Web Application Firewall (WAF) y descubre cómo integrarlo con otros servicios de AWS. Aprende sobre sus componentes, casos de uso y mejores prácticas."
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T01:28:49.211Z"
cover: "/assets/blog/f5ae0710f3fb74786f37f833.png"
coverAlt: "Thumbnail for: AWS Web Application Firewall (WAF)"
ogImage: "/assets/blog/f5ae0710f3fb74786f37f833.png"
related:
  - title: "10 Métricas Clave de DevOps en AWS"
    url: "https://dondeaprendoaws.com/blog/10-metricas-clave-de-devops-en-aws/"
    image: "/assets/blog/98aff2370ca15f9967751abc.png"
    imageAlt: ""
  - title: "Microservicios en AWS Utilizando Contenedores"
    url: "https://dondeaprendoaws.com/blog/microservicios-en-aws-utilizando-contenedores/"
    image: "/assets/blog/bf2d7e4c78ec347430ffd844.jpg"
    imageAlt: ""
  - title: "Recursos en Español para Certificacion AWS Cloud Practitioner"
    url: "https://dondeaprendoaws.com/blog/recursos-en-espanol-para-certificacion-aws-cloud-practitioner/"
    image: "/assets/blog/8d4ecab3b218a57acfd77f30.jpg"
    imageAlt: ""
---

<p>Si buscas proteger tus aplicaciones web en AWS de ataques y bots maliciosos, AWS WAF es tu solución. Este firewall de aplicaciones web te permite controlar el acceso a tus aplicaciones mediante reglas personalizables, ofreciendo protección contra ataques comunes como inyecciones SQL y XSS. Además, se integra perfectamente con otros servicios de AWS, como CloudFront y API Gateway, para brindarte una seguridad completa. Aquí te doy un resumen de lo más importante:</p>


<ul>
<li><strong>Controla el acceso a tus aplicaciones</strong>: Decide qué tráfico permitir o bloquear.</li>
<li><strong>Protección actualizada</strong>: Reglas gestionadas por AWS contra las últimas amenazas.</li>
<li><strong>Integración con servicios AWS</strong>: Trabaja junto a CloudFront, API Gateway, entre otros.</li>
<li><strong>Seguridad escalable</strong>: Maneja grandes volúmenes de tráfico sin comprometer el rendimiento.</li>
</ul>


<p>AWS WAF es una herramienta clave para mantener tus aplicaciones web seguras, permitiéndote personalizar reglas específicas para tu tráfico esperado, minimizar falsos positivos y revisar métricas regularmente para ajustes necesarios. Implementarlo correctamente puede significar una gran diferencia en la seguridad y disponibilidad de tus aplicaciones web en AWS.</p>


<h2 id="%C2%BFqu%C3%A9-es-aws-waf%3F" tabindex="-1">¿Qué es AWS WAF?</h2>


<p>AWS WAF (Web Application Firewall) es una herramienta de seguridad diseñada para proteger tus aplicaciones web y APIs de ataques y bots malintencionados que pueden hacer que tu página no funcione correctamente, ponga en riesgo tu seguridad o use demasiados recursos.</p>


<p>Esta herramienta te permite decidir qué tráfico puede acceder a tus aplicaciones mediante reglas de seguridad. Esto es útil para manejar el tráfico de bots y detener ataques comunes antes de que afecten tu página.</p>


<h3 id="caracter%C3%ADsticas-clave" tabindex="-1">Características clave</h3>


<ul>
<li>Defensa contra ataques como inyecciones SQL y XSS, que son formas comunes de intentar dañar tu página.</li>
<li>Reglas ajustables para proteger tu página según tus necesidades específicas.</li>
<li>Capacidad para filtrar quién puede acceder a tu página basándose en varios factores como la dirección IP o el tipo de solicitud.</li>
<li>Fácil de usar con otros servicios de AWS como CloudFront y API Gateway.</li>
<li>Opción de crear tus propias reglas para luchar contra nuevos ataques.</li>
</ul>


<h3 id="beneficios" tabindex="-1">Beneficios</h3>


<ul>
<li>Aumenta la seguridad de tus aplicaciones web y APIs contra bots y varios ataques.</li>
<li>Mejora el rendimiento al evitar tráfico no deseado antes de que llegue a tu servidor.</li>
<li>Ayuda a ahorrar en costos al reducir el tráfico innecesario.</li>
<li>Apoya el cumplimiento de normas de seguridad para tus aplicaciones.</li>
<li>Mantiene a tus usuarios contentos al asegurar que tu aplicación esté segura.</li>
</ul>


<h2 id="componentes-centrales-de-aws-waf" tabindex="-1">Componentes centrales de AWS WAF</h2>


<p>AWS WAF tiene unos componentes principales que ayudan a mantener tus aplicaciones web seguras:</p>


<h3 id="web-acls" tabindex="-1">Web ACLs</h3>


<p>Las Web ACLs son como listas de reglas que usas para proteger tus aplicaciones en AWS. Creas una lista, le agregas reglas que dicen qué hacer con ciertas visitas a tu web, y decides si esas visitas se permiten o se bloquean. Piensa en esto como en hacer una lista de invitados para una fiesta, donde decides quién entra y quién no.</p>


<p>Una Web ACL es básicamente una herramienta de AWS WAF.</p>


<h3 id="reglas" tabindex="-1">Reglas</h3>


<p>Las reglas son instrucciones que revisan las visitas a tu página y deciden qué hacer con ellas. Si una visita cumple con los criterios de una regla, puedes bloquearla, permitirla, contarla o incluso ponerle un desafío, como un CAPTCHA. Es como tener un portero que verifica si los visitantes cumplen con ciertas condiciones para entrar.</p>


<p>Una regla no es una herramienta por sí misma en AWS WAF. Solo existe cuando la pones en una Web ACL o en un grupo de reglas.</p>


<h3 id="grupos-de-reglas" tabindex="-1">Grupos de reglas</h3>


<p>Puedes crear tus propias reglas o usar grupos de reglas que ya vienen hechos, algunos por AWS y otros por vendedores en AWS Marketplace. Es como tener un kit de herramientas para proteger tu página, con la opción de personalizarlo o usar uno pre-hecho.</p>


<p>Un grupo de reglas sí es una herramienta de AWS WAF.</p>


<h2 id="casos-de-uso-comunes" tabindex="-1">Casos de uso comunes</h2>


<p>Algunos ejemplos de cómo AWS WAF puede ser útil:</p>


<h3 id="filtrado-de-tr%C3%A1fico-web" tabindex="-1">Filtrado de tráfico web</h3>


<p>Con AWS WAF, puedes crear reglas para controlar quién puede entrar a tus aplicaciones y APIs. Esto incluye:</p>


<ul>
<li><strong>Dirección IP de origen</strong>: Puedes decidir bloquear o permitir ciertos rangos de IP. Esto es útil si quieres evitar visitas sospechosas o si solo quieres que gente de tu oficina acceda.</li>
<li><strong>Encabezados de solicitud</strong>: Puedes filtrar visitas basándote en detalles como el tipo de navegador que usan.</li>
<li><strong>Cuerpo de la solicitud</strong>: Puedes buscar palabras o patrones específicos en el contenido que la gente envía.</li>
<li><strong>URIs</strong>: Puedes decidir qué páginas de tu sitio permites o bloqueas.</li>
</ul>


<p>Esto te da un control detallado sobre el tráfico a tus aplicaciones.</p>


<h3 id="prevenci%C3%B3n-de-fraude" tabindex="-1">Prevención de fraude</h3>


<p>AWS WAF te ayuda a evitar el fraude al monitorear las páginas de acceso como las de inicio de sesión, registro y recuperación de contraseñas. Puedes detectar y bloquear intentos de acceso no autorizados.</p>


<p>Puedes configurar reglas para identificar comportamientos raros, como muchos intentos fallidos de acceso desde una misma IP, lo que ayuda a prevenir ataques.</p>


<h3 id="administraci%C3%B3n-con-apis" tabindex="-1">Administración con APIs</h3>


<p>AWS WAF te permite usar APIs para manejar tus Web ACLs y reglas automáticamente. Esto es útil para:</p>


<ul>
<li>Crear reglas automáticamente basadas en IPs o patrones identificados por otros sistemas de seguridad.</li>
<li>Actualizar muchas reglas de una vez si aparecen nuevas amenazas.</li>
<li>Integrar la configuración de seguridad en tus procesos de despliegue automáticos.</li>
</ul>


<p>Así, puedes mantener tus defensas de AWS WAF actualizadas y adecuadas a tus necesidades.</p>


<h2 id="integraci%C3%B3n-con-otros-servicios" tabindex="-1">Integración con otros servicios</h2>


<p>AWS WAF trabaja junto a otros servicios de AWS para mejorar la seguridad:</p>


<h3 id="cloudfront" tabindex="-1"><a href="https://aws.amazon.com/es/cloudfront/" rel="noopener noreferrer" target="_blank">CloudFront</a></h3>


<p><figure><img alt="CloudFront" src="/assets/blog/a0c1460dcd2de2a74c2abb39.jpg"/></figure></p>


<p>Es una manera de distribuir contenido en la web.</p>


<p>Usar AWS WAF con CloudFront ayuda a proteger tu contenido. Al conectar una Web ACL de AWS WAF con CloudFront, las reglas que has establecido en AWS WAF se aplican al tráfico que pasa por allí. Así, puedes detener solicitudes dañinas antes de que lleguen a tus servidores.</p>


<p>Beneficios de esta combinación incluyen:</p>


<ul>
<li>Defensa contra ataques masivos, conocidos como DDoS, absorbiendo mucho tráfico en los puntos de acceso de CloudFront.</li>
<li>La capacidad de ajustar las reglas de seguridad según el país o región.</li>
<li>Menos demora al rechazar solicitudes no deseadas cerca de donde están los usuarios.</li>
</ul>


<h3 id="api-gateway" tabindex="-1"><a href="https://aws.amazon.com/es/api-gateway/" rel="noopener noreferrer" target="_blank">API Gateway</a></h3>


<p><figure><img alt="API Gateway" src="/assets/blog/1d1422fb141d525a7f7c259a.jpg"/></figure></p>


<p>Para crear, publicar y manejar APIs.</p>


<p>AWS WAF puede ayudar a proteger tus APIs en API Gateway. Las reglas que estableces se usan cuando alguien accede a tus APIs.</p>


<p>Esto ayuda a:</p>


<ul>
<li>Controlar quién puede hacer qué en tus APIs basándose en su IP o cómo se autentican.</li>
<li>Parar intentos de adivinar tus contraseñas de API por fuerza bruta.</li>
<li>Vigilar y gestionar cómo aplicaciones de terceros usan tus APIs.</li>
</ul>


<p>Como con CloudFront, esto ayuda a proteger tus sistemas y hace que tus APIs funcionen mejor.</p>


<h3 id="application-load-balancer" tabindex="-1"><a href="https://aws.amazon.com/es/elasticloadbalancing/" rel="noopener noreferrer" target="_blank">Application Load Balancer</a></h3>


<p><figure><img alt="Application Load Balancer" src="/assets/blog/254f3b4ab30cc71cc179f2b5.jpg"/></figure></p>


<p>Para equilibrar la carga de tus aplicaciones.</p>


<p>Puedes poner AWS WAF delante de tus balanceadores de carga para revisar el tráfico antes de que llegue a tus servidores.</p>


<p>Esto es útil si tienes tus servidores en EC2 o en tus propias instalaciones y buscas una protección extra.</p>


<p>Los beneficios son:</p>


<ul>
<li>Menos carga en tus servidores al filtrar solicitudes que no son válidas.</li>
<li>Poder usar diferentes reglas de seguridad para diferentes grupos de servidores.</li>
<li>Es fácil de añadir sin tener que cambiar tu aplicación actual.</li>
</ul>


<p>De esta manera, AWS WAF se convierte en una barrera muy efectiva para proteger tus aplicaciones.</p>




<h2 id="mejores-pr%C3%A1cticas" tabindex="-1">Mejores prácticas</h2>


<p>Al seguir estas recomendaciones, podrás usar AWS WAF de manera más eficiente:</p>


<h3 id="minimizar-falsos-positivos" tabindex="-1">Minimizar falsos positivos</h3>


<p>Es importante ajustar las reglas para evitar bloquear usuarios legítimos. Aquí van algunos consejos:</p>


<ul>
<li>Empieza con reglas amplias y luego ve afinándolas. Por ejemplo, primero bloquea rangos grandes de IP y después ve excluyendo las IPs que sabes que son seguras.</li>
<li>Prueba las reglas en modo "cuenta" antes de decidir bloquear el tráfico, así puedes ver cómo afectan.</li>
<li>Usa páginas de error que los usuarios puedan ver si son bloqueados por error, para que puedan avisarte.</li>
<li>Revisa los registros para encontrar solicitudes legítimas que hayan sido bloqueadas y ajusta tus reglas según sea necesario.</li>
</ul>


<h3 id="probar-ante-varios-escenarios" tabindex="-1">Probar ante varios escenarios</h3>


<p>Es importante asegurarse de que tus reglas y Web ACLs funcionen bien en diferentes situaciones. Algunas sugerencias:</p>


<ul>
<li>Haz pruebas con varios tipos de solicitudes legítimas y ataques comunes.</li>
<li>Prueba cómo funcionan desde diferentes lugares y con distintos dispositivos.</li>
<li>Comprueba que tus reglas personalizadas están trabajando como deberían.</li>
<li>Asegúrate de que las reglas no estén causando mucha lentitud o problemas de rendimiento.</li>
</ul>


<h3 id="revisar-m%C3%A9tricas-con-regularidad" tabindex="-1">Revisar métricas con regularidad</h3>


<p>Es útil mirar las métricas de AWS WAF en CloudWatch para ver si hay algo raro y hacer ajustes. Por ejemplo:</p>


<ul>
<li>Observa las solicitudes que han sido bloqueadas por cada regla para ver si hay nuevos patrones de ataque.</li>
<li>Revisa las solicitudes que se han permitido para asegurarte de que no haya un aumento sospechoso.</li>
<li>Mira los tiempos de respuesta para confirmar que no hay problemas de rendimiento debido a reglas muy complejas.</li>
<li>Cambia los límites si ves que el tráfico normal de tu aplicación cambia.</li>
</ul>


<p>Al estar al tanto de las métricas, puedes mantener tu AWS WAF funcionando de la mejor manera posible.</p>


<h2 id="comenzando-con-aws-waf" tabindex="-1">Comenzando con AWS WAF</h2>


<p>Una guía simple para proteger tu aplicación web con AWS WAF:</p>


<h3 id="1.-crear-una-web-acl" tabindex="-1">1. Crear una Web ACL</h3>


<p>Primero, necesitas crear una Web ACL en AWS WAF. Esto es como hacer una lista de reglas que decides aplicar para proteger tu sitio. Puedes elegir reglas que AWS ya tiene preparadas, como protección contra problemas comunes de seguridad.</p>


<h2 id="ejemplo-de-c%C3%B3mo-crear-una-web-acl" tabindex="-1">Ejemplo de cómo crear una Web ACL</h2>


<ul>
<li>Nombre: WebACL-miapp</li>
<li>Región: us-east-1</li>
<li>Reglas:</li>
<li>Reglas básicas de OWASP</li>
<li>Reputación de IP de AWS</li>
</ul>


<h3 id="2.-asociar-la-web-acl-a-un-alb" tabindex="-1">2. Asociar la Web ACL a un ALB</h3>


<p>Después de crear la Web ACL, necesitas conectarla con tu equilibrador de carga (ALB). Esto hace que el tráfico hacia tu aplicación pase por las reglas que has establecido, ayudando a mantenerla segura.</p>


<h2 id="ejemplo" tabindex="-1">Ejemplo</h2>


<ul>
<li>Web ACL: WebACL-miapp</li>
<li>ALB: app-loadbalancer</li>
</ul>


<h3 id="3.-probar-y-monitorear" tabindex="-1">3. Probar y monitorear</h3>


<p>Ahora, es importante asegurarte de que todo esté funcionando bien. Puedes probar accediendo a tu aplicación normalmente y también intentando con tráfico que simule ataques. Además, es bueno revisar las estadísticas en CloudWatch para ver cuántas solicitudes se bloquean y cuántas pasan, para poder ajustar tus reglas si hace falta.</p>


<p>Ejemplo de métricas para revisar:</p>


<ul>
<li>Solicitudes bloqueadas por regla</li>
<li>Solicitudes permitidas</li>
<li>Tiempos de respuesta</li>
</ul>


<pre><code>
Siguiendo estos pasos, puedes configurar AWS WAF para que proteja tu aplicación web en AWS de manera efectiva.

</code></pre>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>AWS WAF es una herramienta muy útil para proteger aplicaciones web y APIs en AWS. Ofrece varias ventajas clave:</p>


<ul>
<li>Permite controlar qué tráfico puede acceder a tus aplicaciones mediante reglas personalizables. Esto ayuda a manejar bots y detener ataques comunes.</li>
<li>Viene con reglas administradas por AWS que se actualizan constantemente para defender contra las últimas amenazas. Esto ahorra mucho trabajo manual.</li>
<li>Se integra fácilmente con varios servicios como CloudFront, API Gateway y Application Load Balancer para una protección completa.</li>
<li>Proporciona métricas y logs detallados para monitorear el tráfico y ajustar configuraciones.</li>
<li>Es escalable para manejar grandes volúmenes de tráfico sin afectar el rendimiento.</li>
</ul>


<p>Para sacarle el máximo provecho a AWS WAF, es importante:</p>


<ul>
<li>Configurar reglas específicas para tu aplicación y tráfico esperado. Las reglas genéricas pueden no ser suficientes.</li>
<li>Probar con diferentes escenarios para minimizar falsos positivos.</li>
<li>Revisar métricas regularmente y ajustar según sea necesario.</li>
<li>Usar WAF junto con otras capas de seguridad para una estrategia de defensa en profundidad.</li>
</ul>


<p>Si se implementa correctamente, AWS WAF puede bloquear la gran mayoría de tráfico malicioso y bots, lo cual mejora mucho la seguridad y disponibilidad de aplicaciones web en AWS.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas relacionadas</h2>


<h3 id="%C2%BFes-aws-waf-un-firewall-de-aplicaciones-web%3F" tabindex="-1">¿Es AWS WAF un firewall de aplicaciones web?</h3>


<p>Sí, AWS WAF es un tipo de firewall diseñado específicamente para aplicaciones web. Su trabajo es revisar las solicitudes que se hacen a tu aplicación web y decidir cuáles permitir y cuáles bloquear, basándose en las reglas que hayas establecido.</p>


<h3 id="%C2%BFes-aws-waf-un-firewall-de-capa-7%3F" tabindex="-1">¿Es AWS WAF un firewall de Capa 7?</h3>


<p>Sí, AWS WAF funciona en la capa 7 del modelo OSI, que es la capa de aplicación. Esto significa que se enfoca en el tráfico HTTP(S) que va hacia y viene de tu aplicación web, ayudándote a protegerla contra ataques específicos que ocurren en esta capa.</p>


<h3 id="%C2%BFqu%C3%A9-es-waf-en-aplicaciones-web%3F" tabindex="-1">¿Qué es WAF en aplicaciones web?</h3>


<p>Un WAF, o firewall de aplicaciones web, es una herramienta que ayuda a mantener seguras las aplicaciones web. Lo hace filtrando y examinando el tráfico web para detectar y bloquear amenazas, como intentos de hackeo o ataques automáticos de bots, antes de que puedan hacer daño.</p>


<h3 id="%C2%BFcon-qu%C3%A9-servicios-de-aws-se-puede-usar-waf%3F" tabindex="-1">¿Con qué servicios de AWS se puede usar WAF?</h3>


<p>Puedes usar AWS WAF con varios servicios de AWS, incluyendo Amazon CloudFront, Application Load Balancer (ALB), Amazon API Gateway y AWS AppSync. Esto te permite proteger tus aplicaciones web y contenido en diferentes partes de tu infraestructura en AWS, desde tu red de distribución de contenido (CDN) hasta tus balanceadores de carga y APIs.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/">Arquitecturas de Alta Disponibilidad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/">Seguridad en AWS: Mejores Prácticas</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">Seguridad en AWS: Servicios Esenciales</a></li>
</ul>
</p>
