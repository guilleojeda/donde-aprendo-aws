---
title: "Amazon CloudFront: Comprendiendo el CDN de AWS"
description: "Amazon CloudFront es un servicio de CDN de AWS que ayuda a acelerar y asegurar la entrega de contenido en todo el mundo. Descubre sus características, integraciones con otros servicios de AWS y opciones de seguridad."
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T23:58:11.718Z"
cover: "/assets/blog/63a303953815b71e5babcb84.jpg"
coverAlt: "Thumbnail for: Amazon CloudFront: Comprendiendo el CDN de AWS"
ogImage: "/assets/blog/63a303953815b71e5babcb84.jpg"
related:
  - title: "5 Prácticas de Seguridad para Lambda Authorizers"
    url: "https://dondeaprendoaws.com/blog/5-practicas-de-seguridad-para-lambda-authorizers/"
    image: "/assets/blog/e838de22cc856de64a0d3bdc.jpg"
    imageAlt: ""
  - title: "AWS HealthScribe: IA Generativa para Diagnósticos Médicos"
    url: "https://dondeaprendoaws.com/blog/aws-healthscribe-ia-generativa-para-diagnosticos-medicos/"
    image: "/assets/blog/cac2ef4bd724a0e8247e5e35.jpg"
    imageAlt: ""
  - title: "Recursos en Español para Certificacion AWS Cloud Practitioner"
    url: "https://dondeaprendoaws.com/blog/recursos-en-espanol-para-certificacion-aws-cloud-practitioner/"
    image: "/assets/blog/8d4ecab3b218a57acfd77f30.jpg"
    imageAlt: ""
---

<p>Amazon CloudFront es un servicio de CDN (Red de Entrega de Contenido) de AWS diseñado para hacer que tu sitio web o aplicación funcione más rápido y de manera segura, entregando contenido a usuarios de todo el mundo con menor latencia. Aquí te presento una visión general simplificada de lo que necesitas saber sobre CloudFront:</p>


<ul>
<li><strong>Rápido y Seguro</strong>: Utiliza una red global de servidores para entregar contenido rápidamente y cifrado SSL/TLS para la seguridad.</li>
<li><strong>Escalable</strong>: Se ajusta automáticamente según la demanda.</li>
<li><strong>Integración con AWS</strong>: Funciona bien con otros servicios de AWS como S3 y EC2.</li>
<li><strong>Protección contra DDoS</strong>: Incluye AWS Shield para defensa contra ataques DDoS.</li>
<li><strong>Costos Flexibles</strong>: Solo pagas por lo que usas, con descuentos por volumen disponibles.</li>
<li><strong>Análisis y Monitoreo</strong>: Ofrece herramientas para ver cómo está funcionando tu distribución en tiempo real.</li>
</ul>


<p>Este servicio es ideal tanto para sitios web y aplicaciones que buscan mejorar su velocidad de carga como para aquellos que necesitan distribuir contenido multimedia globalmente. Además, ofrece opciones detalladas para la seguridad y el análisis del tráfico, lo que te permite mantener tu sitio o app protegido y optimizado.</p>


<h2 id="el-cdn-de-aws%3A-amazon-cloudfront" tabindex="-1">El <a href="https://es.wikipedia.org/wiki/red_de_distribuci%c3%b3n_de_contenidos" rel="noopener noreferrer" target="_blank">CDN</a> de AWS: Amazon <a href="https://docs.aws.amazon.com/es_es/amazoncloudfront/latest/developerguide/introduction.html" rel="noopener noreferrer" target="_blank">CloudFront</a></h2>


<p><figure><img alt="CDN" src="/assets/blog/3c8675a752b0da560475f634.jpg"/></figure></p>


<p>Entre las empresas que ofrecen estos servicios, AWS tiene uno llamado Amazon CloudFront. Este es especial porque AWS tiene muchos lugares alrededor del mundo donde pueden guardar y enviar contenido, lo que significa que pueden hacer que las cosas lleguen muy rápido a cualquier lugar. CloudFront trabaja muy bien con otros servicios de AWS, como almacenamiento y procesamiento, haciendo que sea súper fácil para las personas que ya usan AWS hacer sus aplicaciones y páginas web más rápidas y seguras.</p>


<h2 id="%C2%BFqu%C3%A9-es-amazon-cloudfront%3F" tabindex="-1">¿Qué es Amazon CloudFront?</h2>


<p>Amazon CloudFront es un servicio de AWS que ayuda a que el contenido de internet llegue a ti más rápido y de manera segura. Funciona usando muchos servidores ubicados en diferentes partes del mundo.</p>


<h3 id="definici%C3%B3n" tabindex="-1">Definición</h3>


<p>CloudFront es básicamente un montón de servidores alrededor del mundo que ayudan a que las cosas que quieres ver o usar en internet te lleguen más rápido. Guarda copias del contenido cerca de donde estás, así no tiene que viajar tanto por internet, y esto hace que todo sea más rápido y seguro.</p>


<p>Algunas cosas importantes sobre CloudFront:</p>


<ul>
<li>Tiene más de 200 lugares en el mundo donde guarda el contenido.</li>
<li>Funciona muy bien con otros servicios de AWS, como almacenamiento y procesamiento.</li>
<li>Puede manejar tanto páginas web como videos y aplicaciones.</li>
<li>Se ajusta automáticamente para atender a muchos usuarios al mismo tiempo.</li>
<li>Usa tecnologías de seguridad como HTTPS para mantener el contenido seguro.</li>
</ul>


<h3 id="funcionamiento" tabindex="-1">Funcionamiento</h3>


<p>Cuando pides algo en internet, CloudFront busca la copia más cercana de ese contenido y te la envía. Si no tiene una copia cerca, la busca en el lugar original, la guarda para la próxima vez y luego te la envía. Esto ayuda a que las cosas carguen más rápido y reduce la presión sobre el sitio original.</p>


<h3 id="evoluci%C3%B3n" tabindex="-1">Evolución</h3>


<p>Amazon CloudFront empezó en 2008 y al principio solo podía manejar contenido simple. Con el tiempo, ha añadido más funciones como manejar páginas web completas y videos, e incluso proteger contra ataques de internet. Ahora es uno de los servicios más grandes y confiables para hacer que el internet funcione más rápido y de manera segura.</p>


<h2 id="caracter%C3%ADsticas-principales" tabindex="-1">Características Principales</h2>


<p>CloudFront tiene unas cosas geniales que lo hacen sobresalir de otros servicios parecidos y una opción muy buena para compartir contenido en internet.</p>


<h3 id="rendimiento" tabindex="-1">Rendimiento</h3>


<p>CloudFront es súper rápido para entregar todo tipo de cosas en internet, como páginas web, aplicaciones y más. Esto es por:</p>


<ul>
<li><strong>Su red global de servidores</strong> que están en muchos lugares para que todo llegue rápido.</li>
<li>La <strong>capacidad de crecer automáticamente</strong> cuando hay mucha gente usando el servicio, así no se pone lento.</li>
<li>Opciones de <strong>optimización de caché</strong> para que el contenido se entregue de la mejor manera posible.</li>
</ul>


<h3 id="seguridad" tabindex="-1">Seguridad</h3>


<p>CloudFront se toma la seguridad muy en serio con:</p>


<ul>
<li><strong>Cifrado SSL/TLS</strong> para que los datos estén seguros mientras viajan por internet.</li>
<li><strong>Protección DDoS con AWS Shield</strong> para defenderse de ataques malos.</li>
<li><strong>Restricción de acceso</strong> para que solo la gente que tú quieres pueda ver tu contenido.</li>
</ul>


<h3 id="escalabilidad" tabindex="-1">Escalabilidad</h3>


<p>Otra cosa muy buena de CloudFront es que puede crecer con tu negocio. Esto significa que puede:</p>


<ul>
<li>Ajustarse automáticamente para manejar mucha gente sin problemas.</li>
<li>Conectarse fácil con otros servicios de AWS para mejorar aún más.</li>
<li>Manejar muchísimos datos rápidamente en todo el mundo.</li>
</ul>


<p>En pocas palabras, CloudFront es genial porque es rápido, seguro y puede crecer contigo. Estas cosas hacen que sea una excelente opción para usar como CDN.</p>


<h2 id="configuraci%C3%B3n-de-cloudfront" tabindex="-1">Configuración de CloudFront</h2>


<p>Para comenzar a usar CloudFront y hacer que tu sitio web o aplicación funcione más rápido, hay algunos pasos que debes seguir:</p>


<h3 id="crear-un-certificado-ssl" tabindex="-1">Crear un certificado SSL</h3>


<p>Primero, es buena idea tener un certificado SSL para que tu sitio sea seguro (HTTPS). Puedes conseguir uno gratis con ACM (AWS Certificate Manager) o usar uno que ya tengas. Esto incluye:</p>


<ul>
<li>Elegir el nombre de tu sitio (como mi-sitio.com).</li>
<li>Confirmar que realmente posees ese dominio.</li>
<li>Guardar el certificado para usarlo más adelante.</li>
</ul>


<h3 id="configurar-una-distribuci%C3%B3n" tabindex="-1">Configurar una distribución</h3>


<p>Luego, en la consola de CloudFront, selecciona <strong>Crear Distribución</strong>. Aquí debes poner:</p>


<ul>
<li>El <strong>origen</strong>, o de dónde CloudFront va a tomar los archivos (como S3, EC2, etc).</li>
<li>Cómo quieres que se maneje la <strong>caché</strong> para decidir cuánto tiempo se guardan los archivos.</li>
<li>Ajustes de <strong>seguridad</strong> como el uso de HTTPS.</li>
<li><strong>Detalles del dominio</strong> (como mi-sitio.com).</li>
<li>Si quieres, <strong>bloqueos por país</strong> para no permitir acceso desde ciertos lugares.</li>
</ul>


<p>Después de revisar todo, crea la distribución. Esto puede tardar un poco en estar listo a nivel global.</p>


<h3 id="soluci%C3%B3n-de-problemas-comunes" tabindex="-1">Solución de problemas comunes</h3>


<p>Si te encuentras con problemas, aquí tienes algunas soluciones:</p>


<ul>
<li><strong>Error 403 Forbidden</strong>: Asegúrate de que los archivos en el origen estén accesibles para todos.</li>
<li><strong>El contenido no se actualiza</strong>: Borra la caché de CloudFront si hiciste cambios en el origen.</li>
<li><strong>El sitio no carga</strong>: Checa el estado de tu distribución y los registros para encontrar el problema.</li>
</ul>


<p>Siguiendo estos pasos, podrás configurar CloudFront para que tu contenido llegue más rápido a tus usuarios.</p>


<h2 id="integraci%C3%B3n-con-servicios-de-aws" tabindex="-1">Integración con servicios de AWS</h2>


<p>CloudFront trabaja muy bien con otros servicios de AWS, haciendo que sea más fácil usar lo que ya tienes para compartir contenido rápido y de forma segura.</p>


<h3 id="integraci%C3%B3n-con-s3" tabindex="-1">Integración con S3</h3>


<p>S3 es como un enorme armario en la nube donde puedes guardar todo tipo de cosas. Para que CloudFront use lo que tienes en S3, solo tienes que decirle que use tu "armario" S3 cuando creas una distribución. CloudFront se encargará de llevar el contenido de S3 a sus servidores alrededor del mundo para que la gente lo reciba rápido y sin demoras.</p>


<p>Esto es genial para sitios que no cambian mucho, como páginas con información fija, o para compartir archivos grandes como fotos, videos o aplicaciones.</p>


<h3 id="integraci%C3%B3n-con-ec2" tabindex="-1">Integración con EC2</h3>


<p>EC2 te permite tener tu propia computadora en la nube de AWS que puedes cambiar a tu gusto. Puedes usar estas computadoras virtuales como origen en CloudFront, lo que es útil para contenido que cambia a menudo, como las respuestas de una página web dinámica o una aplicación.</p>


<p>Como este tipo de contenido se actualiza mucho, necesitas ajustar cómo CloudFront guarda temporalmente este contenido para asegurarte de que todo funcione bien.</p>


<h3 id="integraci%C3%B3n-con-lambda%40edge" tabindex="-1">Integración con Lambda@Edge</h3>


<p>Lambda@Edge te permite hacer magia en los servidores de CloudFront, permitiéndote cambiar el contenido en el camino. Esto significa que puedes:</p>


<ul>
<li>Cambiar páginas web sobre la marcha.</li>
<li>Modificar cómo se manejan las cookies y los encabezados.</li>
<li>Crear contenido especial según de dónde sea la persona que lo pide.</li>
<li>Controlar quién puede ver ciertos contenidos usando tokens de seguridad.</li>
</ul>


<p>Usar Lambda@Edge es una manera increíble de hacer que CloudFront haga exactamente lo que necesitas, sin tener que manejar equipos complicados por tu cuenta.</p>


<p>En pocas palabras, al usar CloudFront con otros servicios de AWS, puedes armar soluciones completas para compartir tu contenido de manera eficaz, segura y personalizada.</p>


<h2 id="casos-de-uso-de-amazon-cloudfront" tabindex="-1">Casos de uso de Amazon CloudFront</h2>


<h3 id="sitios-web-y-aplicaciones-web" tabindex="-1">Sitios web y aplicaciones web</h3>


<p>Usar CloudFront es una buena idea para que tu sitio web o aplicación funcione más rápido. Esto es porque el contenido se manda desde lugares que están cerca de quien lo está usando, lo que hace que todo cargue más rápido y la experiencia sea mejor.</p>


<p>Algunos ejemplos incluyen:</p>


<ul>
<li>Hacer que sitios web simples que guardas en S3 carguen más rápido</li>
<li>Mejorar cómo se ven las páginas para gente de diferentes partes del mundo</li>
<li>Usar CloudFront para enviar cosas como CSS, JS e imágenes en vez de hacerlo directamente desde el origen</li>
<li>Manejar mucho tráfico cuando hay eventos especiales o lanzamientos</li>
</ul>


<p>También puedes poner reglas especiales para manejar mejor el contenido que cambia seguido.</p>


<h3 id="difusi%C3%B3n-de-medios" tabindex="-1">Difusión de medios</h3>


<p>CloudFront es muy útil para enviar contenido multimedia, como videos o música, especialmente cuando quieres que llegue rápido y sin retrasos.</p>


<p>Lo que puedes hacer con esto incluye:</p>


<ul>
<li>Enviar video con poca espera usando HTTP/2</li>
<li>Usar MediaConvert para preparar videos</li>
<li>Trabajar con formatos de video como HLS o MPEG-DASH</li>
<li>Ver cómo va tu streaming en tiempo real</li>
<li>Mantener todo seguro con cifrado y firmas en los enlaces.</li>
</ul>


<p>Es perfecto para servicios de video, música o radio que se usan en muchos lugares.</p>


<h3 id="apis-y-aplicaciones-m%C3%B3viles" tabindex="-1">APIs y aplicaciones móviles</h3>


<p>CloudFront también ayuda a que las APIs que hacen funcionar aplicaciones web o móviles sean más rápidas.</p>


<p>Ventajas:</p>


<ul>
<li>Disminuir la espera en llamadas API desde aplicaciones móviles</li>
<li>Manejar bien momentos de mucho uso</li>
<li>Guardar respuestas de las APIs para usarlas después sin tener que pedirlas de nuevo</li>
<li>Hacer más fácil poner seguridad en las APIs</li>
</ul>


<p>También sirve para enviar actualizaciones o arreglos a apps y juegos en celulares.</p>




<h2 id="seguridad-en-amazon-cloudfront" tabindex="-1">Seguridad en Amazon CloudFront</h2>


<p>CloudFront te ayuda a mantener seguro tu contenido y tus aplicaciones.</p>


<h3 id="protecci%C3%B3n-contra-ddos" tabindex="-1">Protección contra DDoS</h3>


<p>AWS Shield es un escudo que CloudFront usa para protegerte de ataques DDoS, que son intentos de hacer que tu sitio no esté disponible inundándolo con mucho tráfico. Esto viene sin costo extra.</p>


<p>Si necesitas más protección, puedes pagar por Shield Advanced que ofrece aún más seguridad.</p>


<h3 id="cifrado-ssl%2Ftls" tabindex="-1">Cifrado SSL/TLS</h3>


<p>Cuando la información viaja desde CloudFront hasta los usuarios, se cifra. Esto significa que está protegida y nadie más puede leerla. Puedes usar certificados SSL gratuitos de ACM o los tuyos propios para que tu sitio use HTTPS, que es más seguro.</p>


<h3 id="contenido-privado" tabindex="-1">Contenido privado</h3>


<p>Para que solo ciertas personas puedan ver tu contenido, CloudFront ofrece varias opciones:</p>


<ul>
<li><strong>Firmas de URL</strong> o <strong>cookies firmadas</strong> aseguran que solo quienes tú quieras puedan acceder.</li>
<li><strong>Listas de control de acceso (ACLs)</strong> permiten decidir qué direcciones IP pueden ver tu contenido.</li>
<li>Usar <strong>AWS WAF</strong> te da más control para crear reglas específicas de quién puede acceder.</li>
</ul>


<p>También puedes combinar CloudFront con la <strong>autenticación de usuarios</strong> de AWS para un control más detallado.</p>


<p>En resumen, CloudFront te da muchas herramientas para mantener seguro tu sitio web o aplicación, desde protección contra ataques hasta formas de controlar quién puede ver tu contenido.</p>


<h2 id="an%C3%A1lisis-y-monitoreo" tabindex="-1">Análisis y monitoreo</h2>


<p>CloudFront te da herramientas para ver cómo están funcionando tus distribuciones y para encontrar problemas rápido.</p>


<h3 id="m%C3%A9tricas-en-tiempo-real" tabindex="-1">Métricas en tiempo real</h3>


<p>Con Amazon CloudWatch, puedes ver información actual sobre cómo está funcionando CloudFront, como:</p>


<ul>
<li>Cuántas peticiones se hacen por segundo</li>
<li>Qué porcentaje de esas peticiones dan error</li>
<li>Cuánto tardan en responder</li>
<li>Cuánto ancho de banda se está usando</li>
</ul>


<p>Esto te ayuda a ver si hay mucho tráfico de repente o si hay errores que están afectando cómo funciona todo.</p>


<h3 id="alarmas-y-notificaciones" tabindex="-1">Alarmas y notificaciones</h3>


<p>CloudWatch también te permite poner alarmas que te avisan si algo pasa, como si el porcentaje de errores sube mucho. Si algo así pasa, puedes recibir un mensaje para actuar rápido.</p>


<h3 id="registros-y-an%C3%A1lisis" tabindex="-1">Registros y análisis</h3>


<p>CloudFront guarda información detallada de cada petición que recibe. Puedes enviar esta información a servicios como:</p>


<ul>
<li><strong>Amazon S3</strong>: para guardar esta información</li>
<li><strong>Athena</strong>: para hacer preguntas y analizar la información usando SQL</li>
<li><strong>Elasticsearch</strong>: para buscar y analizar la información en tiempo real</li>
</ul>


<p>Con estos servicios, puedes entender mejor cómo la gente usa tu sitio, encontrar problemas y más.</p>


<p>En resumen, CloudFront te ofrece maneras de mantener un ojo en cómo funciona, para asegurarte de que todo marche bien.</p>


<h2 id="costo-y-precios-de-amazon-cloudfront" tabindex="-1">Costo y Precios de Amazon CloudFront</h2>


<h3 id="planes-y-costos" tabindex="-1">Planes y costos</h3>


<p>CloudFront te cobra solo por lo que usas, sin tarifas fijas cada mes. Lo que pagas depende principalmente de:</p>


<ul>
<li><strong>Transferencia de datos de salida</strong>: Esto es lo que se cobra por cada GB que se envía desde CloudFront a los usuarios. El costo varía según la región.</li>
<li><strong>Solicitudes atendidas</strong>: También hay un pequeño costo por cada solicitud que CloudFront gestiona, ya sea un error o una solicitud exitosa.</li>
</ul>


<p>Puede haber costos extra por usar ciertas funciones como Lambda@Edge o certificados SSL. Pero, en general, tus gastos dependerán del tráfico de tu aplicación.</p>


<p>Si usas mucho CloudFront, hay <strong>descuentos por volumen</strong>. Esto significa que, si te comprometes a usar un cierto nivel de servicio, te pueden cobrar menos.</p>


<h3 id="optimizaci%C3%B3n-de-costos" tabindex="-1">Optimización de costos</h3>


<p>Aquí van algunos consejos para gastar menos en CloudFront:</p>


<ul>
<li>Ajusta bien cómo se guarda el contenido en caché para no tener que pedirlo al origen más de lo necesario.</li>
<li>Comprime los archivos (usando gzip, brotli) para que ocupen menos y así usar menos ancho de banda.</li>
<li>Usa redirecciones HTTP 301 para no tener contenido repetido.</li>
<li>Activa la compresión de archivos para que lo que se envía sea más pequeño.</li>
<li>Si tu aplicación lo permite, elige el nivel de CloudFront que está optimizado para S3, así ahorras en solicitudes.</li>
<li>Piensa en comprometerte a un uso mínimo para obtener descuentos.</li>
</ul>


<p>Siguiendo estos consejos podrás reducir lo que gastas en CloudFront.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>Amazon CloudFront es un servicio de AWS que ayuda a que tu sitio web o app funcione más rápido y llegue a gente de todo el mundo sin demoras. Es como tener una red de caminos rápidos que llevan lo que ofreces directo a las personas que lo quieren, sin importar dónde estén.</p>


<p>Aquí te dejamos algunos puntos importantes:</p>


<ul>
<li>CloudFront tiene muchísimos puntos alrededor del mundo, lo que significa que puede entregar tu contenido super rápido porque siempre hay un camino cerca de quien lo necesita.</li>
<li>Funciona muy bien con otros servicios de AWS, como el almacenamiento de S3 o las computadoras virtuales de EC2, lo que te permite armar sistemas complejos sin dolores de cabeza.</li>
<li>Viene con protecciones contra ataques malos en internet y te permite usar HTTPS para que la información viaje segura.</li>
<li>Te da información en tiempo real y detalles de cómo está funcionando todo, para que puedas ajustar lo que necesites.</li>
<li>Su forma de cobrar es flexible y justa, pagas por lo que usas y hay descuentos si usas mucho el servicio.</li>
</ul>


<p>En resumen, si necesitas que tu contenido llegue rápido y seguro a todas partes, CloudFront es una excelente opción. Es fácil de usar con otros servicios de AWS y te da todas las herramientas para mantener todo bajo control.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-hace-cloudfront-en-aws%3F" tabindex="-1">¿Qué hace CloudFront en AWS?</h3>


<p>CloudFront ayuda a que tu contenido llegue más rápido a las personas usando muchos centros de datos alrededor del mundo. Estos centros de datos guardan copias de tu contenido para que, cuando alguien lo quiera ver o usar, no tenga que viajar muy lejos en internet. Esto hace que las cosas carguen más rápido y de manera segura.</p>


<h3 id="%C2%BFqu%C3%A9-es-un-cdn-aws%3F" tabindex="-1">¿Qué es un CDN AWS?</h3>


<p>Un CDN de AWS, como CloudFront, es un grupo de servidores en diferentes partes del mundo que guardan cosas como imágenes o videos. Esto ayuda a que tu página web o aplicación funcione más rápido porque el contenido está más cerca de las personas que lo usan.</p>


<h3 id="%C2%BFqu%C3%A9-servicio-utiliza-aws-para-proporcionar-una-red-de-entrega-de-contenido-cdn-para-sus-clientes%3F" tabindex="-1">¿Qué servicio utiliza AWS para proporcionar una red de entrega de contenido CDN para sus clientes?</h3>


<p>AWS usa Amazon CloudFront para entregar contenido de manera rápida a las personas. CloudFront tiene muchos lugares alrededor del mundo que ayudan a que el contenido llegue más rápido a quien lo necesita, mejorando así la experiencia de los usuarios.</p>


<h3 id="%C2%BFqu%C3%A9-significa-la-palabra-cdn%3F" tabindex="-1">¿Qué significa la palabra CDN?</h3>


<p>CDN significa Red de Entrega de Contenido (Content Delivery Network). Es una manera de hacer que las páginas web y otras cosas en internet carguen más rápido. Funciona usando varios servidores alrededor del mundo para guardar y enviar contenido, haciendo que llegue más rápido a las personas que lo quieren ver o usar.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">AWS Fundamentos: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/nube-aws-guia-de-inicio-rapido/">Nube AWS: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-los-servicios-de-amazon-web-services/">Introducción a los servicios de Amazon Web Services</a></li>
</ul>
</p>
