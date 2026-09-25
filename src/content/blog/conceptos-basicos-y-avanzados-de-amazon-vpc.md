---
title: "Conceptos Básicos y Avanzados de Amazon VPC"
description: "Descubre los conceptos básicos y avanzados de Amazon VPC, cómo configurar tu red en la nube de AWS, y estrategias de seguridad y ahorro de costos. Aprende todo sobre Amazon VPC en esta guía detallada."
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T14:04:18.731Z"
cover: "/assets/blog/12c27432a1ba20e5bffcb7b0.jpg"
coverAlt: "Thumbnail for: Conceptos Básicos y Avanzados de Amazon VPC"
ogImage: "/assets/blog/12c27432a1ba20e5bffcb7b0.jpg"
related:
  - title: "10 Repositorios de GitHub para Machine Learning en AWS"
    url: "https://dondeaprendoaws.com/blog/10-repositorios-de-github-para-machine-learning-en-aws/"
    image: "/assets/blog/0e7089d339cd0d6e09ee83cd.webp"
    imageAlt: ""
  - title: "7 Estrategias de Serverless para Startups: Optimiza Costos"
    url: "https://dondeaprendoaws.com/blog/7-estrategias-de-serverless-para-startups-optimiza-costos/"
    image: "/assets/blog/d85eb8d10d11d152a0198dea.jpg"
    imageAlt: ""
  - title: "Base de Datos Global con Amazon DynamoDB"
    url: "https://dondeaprendoaws.com/blog/base-de-datos-global-con-amazon-dynamodb/"
    image: "/assets/blog/b74e56b41e26732c7dfc378e.png"
    imageAlt: ""
---

<p>Amazon VPC (Nube Privada Virtual de Amazon) te ofrece un control total sobre tu espacio de red en la nube de AWS, permitiéndote gestionar quién accede a tus aplicaciones y cómo se comunican. Desde la creación de subredes y gateways hasta la implementación de medidas de seguridad avanzadas, Amazon VPC asegura que tus datos y aplicaciones estén aislados y protegidos. Aquí te explicamos cómo puedes sacar el máximo provecho de Amazon VPC, cubriendo desde los fundamentos hasta consejos avanzados y estrategias de ahorro de costos:</p>


<ul>
<li><strong>Conceptos Básicos</strong>: Aprende qué es Amazon VPC, sus características principales y cómo configurar tu primera VPC.</li>
<li><strong>Gestión Avanzada</strong>: Descubre cómo crear arquitecturas de red complejas, utilizar peering VPC y conexiones VPN para expandir y proteger tu red.</li>
<li><strong>Seguridad</strong>: Explora las herramientas de seguridad como Grupos de Seguridad y ACLs para proteger tus servicios en la VPC.</li>
<li><strong>Optimización de Costos</strong>: Consejos para gestionar los costos asociados a Amazon VPC, aprovechando recursos y herramientas para ahorrar.</li>
<li><strong>Recursos y Soporte</strong>: Dónde encontrar documentación adicional, aprendizaje y soporte para tus proyectos en Amazon VPC.</li>
</ul>


<p>Amazon VPC es esencial para quienes buscan aislar sus recursos en AWS, ofreciendo flexibilidad, seguridad y control sobre tu infraestructura en la nube. Ya sea que estés comenzando o buscando expandir tus conocimientos, esta guía te ayudará a entender y aplicar las mejores prácticas de Amazon VPC.</p>


<h2 id="%C2%BFqu%C3%A9-es-amazon-vpc%3F" tabindex="-1">¿Qué es Amazon VPC?</h2>


<p>Amazon Virtual Private Cloud (Amazon VPC) es un servicio de AWS que te permite tener tu propio espacio privado en la nube de AWS. Es como contar con tu centro de datos virtual privado dentro de la nube pública de AWS.</p>


<p>Con Amazon VPC puedes:</p>


<ul>
<li>Iniciar recursos como EC2 en una red que tú mismo defines y controlas</li>
<li>Tener el control total sobre tu espacio en la nube, incluyendo la elección de rangos de IP, creación de subredes, y configuración de cómo se mueven los datos</li>
<li>Conectar tu VPC de manera segura con tu red local o con Internet</li>
</ul>


<p>En pocas palabras, Amazon VPC te da el poder de aislar tus recursos y aplicaciones en AWS de la manera que necesites.</p>


<h3 id="caracter%C3%ADsticas-principales" tabindex="-1">Características Principales</h3>


<p>Las características más importantes de Amazon VPC incluyen:</p>


<ul>
<li><strong>Aislamiento</strong>: Tu VPC está separada del resto de la nube de AWS, lo que significa que solo tú tienes acceso a lo que hay dentro.</li>
<li><strong>Rangos de IP flexibles</strong>: Puedes escoger los rangos de direcciones IP para tus recursos.</li>
<li><strong>Subredes</strong>: Puedes dividir tu VPC en partes más pequeñas para organizar y proteger mejor tus recursos.</li>
<li><strong>Internet Gateways</strong>: Estos te permiten conectar tu VPC con Internet de forma segura.</li>
<li><strong>Tablas de rutas</strong>: Son las que controlan cómo se mueve el tráfico de datos dentro y fuera de tus subredes.</li>
<li><strong>Grupos de seguridad</strong>: Funcionan como un firewall para controlar el acceso a tus recursos.</li>
<li><strong>Network ACLs</strong>: Son otra capa de seguridad que actúa a nivel de subred.</li>
<li><strong>Peering VPC</strong>: Te permite conectar dos VPCs de manera privada y segura.</li>
</ul>


<h2 id="componentes-b%C3%A1sicos-de-amazon-vpc" tabindex="-1">Componentes Básicos de Amazon VPC</h2>


<h3 id="internet-gateway" tabindex="-1">Internet Gateway</h3>


<p>Un Internet Gateway es lo que permite que las instancias en tu VPC hablen con Internet. Es como una puerta de enlace para datos que entran y salen.</p>


<p>Solo puedes tener un Internet Gateway por VPC y es opcional.</p>


<h3 id="virtual-private-gateway" tabindex="-1">Virtual Private Gateway</h3>


<p>Este componente te permite conectar tu VPC con tu red local a través de una VPN, extendiendo tu red de manera segura hasta la nube.</p>


<p>Se utiliza para permitir el tráfico privado entre tu VPC y tu oficina o datacenter.</p>


<h3 id="subredes-(subnet)" tabindex="-1">Subredes (Subnet)</h3>


<p>Las subredes son como pequeñas secciones dentro de tu VPC que te ayudan a organizar y aislar tus recursos. Puedes tener subredes públicas y privadas, por ejemplo.</p>


<p>Cada subred está en una zona de disponibilidad y tiene su propio bloque de IPs.</p>


<h3 id="tablas-de-rutas-(route-tables)" tabindex="-1">Tablas de Rutas (Route Tables)</h3>


<p>Estas tablas controlan cómo se dirige el tráfico desde y hacia las subredes. Por defecto, cada subred se conecta a una tabla de rutas principal, pero puedes personalizar esto.</p>


<h3 id="grupos-de-seguridad-(security-groups)" tabindex="-1">Grupos de Seguridad (Security Groups)</h3>


<p>Los grupos de seguridad son como un firewall para tus instancias, controlando quién puede enviar datos hacia y desde ellas. Puedes usar el mismo grupo para varios recursos.</p>


<h3 id="listas-de-control-de-acceso-de-red-(network-acls)" tabindex="-1">Listas de Control de Acceso de Red (Network ACLs)</h3>


<p>Las Network ACLs son similares a los grupos de seguridad pero funcionan a nivel de subred. Ofrecen una capa adicional de seguridad y permiten reglas más detalladas.</p>


<h2 id="configuraci%C3%B3n-y-gesti%C3%B3n-de-vpc" tabindex="-1">Configuración y Gestión de VPC</h2>


<h3 id="creaci%C3%B3n-de-un-amazon-vpc" tabindex="-1">Creación de un Amazon VPC</h3>


<p>Para empezar con tu Amazon VPC, solo sigue estos pasos simples en la consola de AWS:</p>


<ul>
<li>Entra a tu cuenta de AWS y busca la consola de VPC.</li>
<li>Dale clic a "Launch VPC Wizard" para que te ayude a configurarlo paso a paso.</li>
<li>Escoge un conjunto de direcciones IP privadas para tu VPC usando el formato CIDR (algo así como 10.0.0.0/16).</li>
<li>Si quieres, puedes ponerle etiquetas a tu VPC para tenerlo todo más organizado.</li>
<li>Selecciona una región y zonas de disponibilidad donde quieras que esté tu VPC.</li>
<li>Revisa todo y dale a "Create VPC" para terminar.</li>
</ul>


<p>Ya con tu VPC listo, puedes añadirle cosas como subredes, tablas de rutas e Internet Gateways, dependiendo de lo que necesites.</p>


<h3 id="configuraci%C3%B3n-de-subredes" tabindex="-1">Configuración de Subredes</h3>


<p>Piensa en las subredes como pequeñas áreas dentro de tu VPC donde puedes poner tus recursos. Hay dos tipos principales:</p>


<ul>
<li><strong>Subredes públicas</strong>: estas tienen conexión a Internet. Aquí van tus recursos que necesitan hablar con el mundo exterior.</li>
<li><strong>Subredes privadas</strong>: estas no se conectan directamente a Internet. Son para cosas que quieres mantener más resguardadas.</li>
</ul>


<p><strong>Ideas para configurar tus subredes:</strong></p>


<ul>
<li>Usa una combinación de subredes públicas y privadas en cada zona de disponibilidad.</li>
<li>Asegúrate de que los rangos de IPs de tus subredes no se pisen entre sí.</li>
<li>Asigna cada subred a una tabla de rutas; las públicas van con la principal y las privadas con unas personalizadas.</li>
<li>Para que tus subredes privadas puedan acceder a Internet de forma limitada, pon NAT Gateways en las públicas.</li>
<li>Planea tener suficientes direcciones IP para el crecimiento que esperas.</li>
</ul>


<h3 id="implementaci%C3%B3n-de-gateways-y-rutas" tabindex="-1">Implementación de Gateways y Rutas</h3>


<p>Estos componentes te ayudan a manejar cómo se mueve el tráfico en tu VPC:</p>


<p><strong>Internet Gateways</strong></p>


<p>Son como la puerta de tu VPC al mundo de Internet. Se conectan a tu VPC y se añaden a tu tabla de rutas principal.</p>


<p><strong>NAT Gateways</strong></p>


<p>Permiten que tus subredes privadas accedan a Internet sin estar expuestas directamente. Se colocan en una subred pública.</p>


<p><strong>Virtual Private Gateways</strong></p>


<p>Son para conectar tu VPC con tu red local usando una VPN, extendiendo tu red de forma segura.</p>


<p><strong>Tablas de Rutas</strong></p>


<p>Controlan el tráfico en tu VPC. Cada subred se asocia a una tabla que decide por dónde va su tráfico.</p>


<h2 id="seguridad-en-amazon-vpc" tabindex="-1">Seguridad en Amazon VPC</h2>


<p>Para mantener tus cosas seguras en tu VPC, usa:</p>


<h3 id="grupos-de-seguridad" tabindex="-1"><strong>Grupos de Seguridad</strong></h3>


<p>Son como un firewall para tus instancias, decidiendo qué tráfico puede entrar y salir. Puedes usar el mismo grupo para varias instancias.</p>


<h3 id="network-acls" tabindex="-1"><strong>Network ACLs</strong></h3>


<p>Protegen a nivel de subred, con reglas específicas para el tráfico permitido.</p>


<h3 id="consejos-de-seguridad" tabindex="-1"><strong>Consejos de Seguridad</strong></h3>


<ul>
<li>Limita los puertos y direcciones IP en los grupos de seguridad.</li>
<li>Mantén todo actualizado con los últimos parches de seguridad.</li>
<li>Usa CloudTrail y VPC Flow Logs para llevar un registro y monitorear lo que pasa.</li>
<li>Realiza pruebas de seguridad regularmente.</li>
<li>Asigna roles de IAM con lo mínimo necesario en permisos.</li>
</ul>


<p>Con una buena planificación de tus subredes, rutas, gateways y medidas de seguridad, puedes tener un Amazon VPC que se ajuste perfectamente a tus necesidades y sea seguro.</p>


<h2 id="casos-de-uso-avanzados-de-amazon-vpc" tabindex="-1">Casos de Uso Avanzados de Amazon VPC</h2>


<h3 id="arquitecturas-de-red-complejas" tabindex="-1">Arquitecturas de Red Complejas</h3>


<p>Amazon VPC te permite crear redes complejas para necesidades específicas:</p>


<h4 id="dmz" tabindex="-1">DMZ</h4>


<p>Puedes hacer una zona de seguridad (DMZ) con:</p>


<ul>
<li>Subredes públicas que actúan como una barrera entre Internet y tu red interna.</li>
<li>Servidores web en las subredes públicas.</li>
<li>Limitar el acceso desde Internet con grupos de seguridad y ACLs.</li>
<li>Bases de datos y aplicaciones internas en subredes privadas, protegidas del acceso directo desde Internet.</li>
</ul>


<p>Esto ayuda a proteger tus aplicaciones más importantes.</p>


<h4 id="arquitectura-hub-and-spoke" tabindex="-1">Arquitectura Hub-and-Spoke</h4>


<p>Para conectar varias redes VPC, puedes usar una estructura central (Hub) y varias conexiones (Spokes):</p>


<ul>
<li>Una VPC central (Hub) conecta todas las demás VPC (Spokes).</li>
<li>Los Spokes se comunican entre sí pasando por el Hub.</li>
<li>Esto es útil para compartir recursos centrales entre diferentes VPC.</li>
</ul>


<h3 id="vpc-peering-y-conexiones-vpn" tabindex="-1">VPC Peering y Conexiones VPN</h3>


<p>Para conectar redes con Amazon VPC, tienes dos opciones principales:</p>


<h4 id="peering-vpc" tabindex="-1">Peering VPC</h4>


<p>El peering VPC conecta dos VPC de manera privada, permitiendo compartir datos y aplicaciones entre ellas sin exponer tus recursos a Internet.</p>


<h4 id="vpn-site-to-site-y-client-vpn" tabindex="-1">VPN Site-to-Site y Client VPN</h4>


<p>Las VPNs conectan tu red local con un VPC de forma segura:</p>


<ul>
<li>La VPN Site-to-Site conecta toda tu red local con un VPC.</li>
<li>La Client VPN permite a usuarios individuales conectarse al VPC desde cualquier lugar.</li>
</ul>


<p>Ambas usan túneles seguros para proteger tus datos.</p>


<h3 id="uso-de-transit-gateways" tabindex="-1">Uso de Transit Gateways</h3>


<p>Un Transit Gateway conecta varias VPC y redes locales, simplificando la gestión de tus conexiones:</p>


<ul>
<li>Centraliza el enrutamiento entre todas tus redes.</li>
<li>Facilita la conexión entre VPC y VPNs.</li>
<li>Permite manejar fácilmente muchas conexiones.</li>
</ul>


<p>Es ideal para redes grandes y complejas.</p>


<h2 id="precios-de-amazon-vpc-y-c%C3%B3mo-ahorrar" tabindex="-1">Precios de Amazon VPC y Cómo Ahorrar</h2>


<h3 id="estructura-de-precios-de-amazon-vpc" tabindex="-1">Estructura de <a href="https://aws.amazon.com/vpc/pricing/" rel="noopener noreferrer" target="_blank">Precios de Amazon VPC</a></h3>


<p><figure><img alt="Precios de Amazon VPC" src="/assets/blog/df5ea41cbda10a5d6427d181.jpg"/></figure></p>


<p>Cuando usas Amazon VPC, hay algunas cosas que pueden costarte dinero, pero te vamos a explicar cómo se manejan esos costos:</p>


<ul>
<li><strong>Uso de VPC</strong>: Usar VPC en sí no te cuesta. Solo pagas por lo que pongas dentro, como servidores o almacenamiento.</li>
<li><strong>Direcciones IP elásticas</strong>: Si tienes direcciones IP que no cambian (elásticas), te cobran por tenerlas.</li>
<li><strong>NAT Gateways</strong>: Si usas NAT Gateways para que tus servicios internos accedan a Internet, hay un costo por los datos que manejan y por el tiempo que están activos.</li>
<li><strong>Peering VPC</strong>: Conectar dos VPCs directamente no cuesta, pero si pasan datos entre ellas, sí hay un costo.</li>
<li><strong>Endpoints de la VPC</strong>: Si creas puntos finales de VPC para conectar servicios de AWS directamente, hay un pequeño costo.</li>
<li><strong>VPN</strong>: Las conexiones VPN, tanto para sitios como para usuarios (AWS Client VPN), tienen un costo por el tiempo conectado y por los datos que pasan.</li>
<li><strong>Transit Gateway</strong>: Si usas esto para conectar muchas redes, se cobra por el uso y los datos.</li>
</ul>


<p>La mayoría de lo que gastas en VPC viene de los servicios que usas dentro, como servidores o bases de datos.</p>


<h3 id="estrategias-para-la-optimizaci%C3%B3n-de-costos" tabindex="-1">Estrategias para la Optimización de Costos</h3>


<p>Aquí van algunos consejos para no gastar de más:</p>


<ul>
<li>Prefiere usar servidores EC2 spot y reservados si puedes, son más baratos.</li>
<li>No olvides la capa gratuita de AWS, que te da algunas cosas sin costo.</li>
<li>Ajusta bien cuánto recurso usas, ni de más ni de menos, para no gastar de más.</li>
<li>Usa grupos de auto-escalado para que tus recursos se ajusten solos según necesites.</li>
<li>Si no estás usando algo, considera apagarlo o ponerlo en pausa.</li>
<li>Revisa cómo estás usando tus recursos y busca dónde puedes mejorar.</li>
<li>Los puntos finales de VPC pueden ahorrarte dinero en transferencia de datos.</li>
<li>Si vas para largo, mira si te conviene una red híbrida con Direct Connect, puede ser más económico a largo plazo.</li>
</ul>


<p>Planear bien desde el principio puede ayudarte a ahorrar en el futuro.</p>




<h2 id="recursos-adicionales-sobre-amazon-vpc" tabindex="-1">Recursos Adicionales sobre Amazon VPC</h2>


<h3 id="documentaci%C3%B3n-y-recursos-de-aprendizaje" tabindex="-1">Documentación y Recursos de Aprendizaje</h3>


<p>Si quieres aprender más sobre Amazon VPC, hay muchos lugares donde puedes encontrar información:</p>


<ul>
<li><strong>Documentación oficial</strong>: En la <a href="https://docs.aws.amazon.com/vpc/index.html" rel="noopener noreferrer" target="_blank">página de Amazon VPC</a> encontrarás guías, ejemplos y todo lo que necesitas saber.</li>
<li><strong>Páginas de producto</strong>: La <a href="https://aws.amazon.com/es/vpc/" rel="noopener noreferrer" target="_blank">página de Amazon VPC</a> te muestra lo básico y te da ideas de cómo usarlo.</li>
<li><strong>FAQs</strong>: Si tienes preguntas, las <a href="https://aws.amazon.com/es/vpc/faqs/" rel="noopener noreferrer" target="_blank">preguntas frecuentes de Amazon VPC</a> probablemente tienen las respuestas.</li>
<li><strong>Videos</strong>: En YouTube hay <a href="https://www.youtube.com/results?search_query=amazon+vpc+espa%C3%B1ol" rel="noopener noreferrer" target="_blank">videos sobre Amazon VPC</a> que pueden ayudarte a entender mejor.</li>
<li><strong>Whitepapers</strong>: Si buscas información más profunda, los <a href="https://aws.amazon.com/es/whitepapers/?whitepapers-main.sort-by=item.additionalFields.sortDate&amp;whitepapers-main.sort-order=desc&amp;awsf.whitepapers-content-type=*all&amp;awsf.whitepapers-tech-category=tech-category%23networking" rel="noopener noreferrer" target="_blank">whitepapers de AWS</a> son muy útiles.</li>
</ul>


<p>Estos recursos son buenos tanto si estás empezando como si ya sabes bastante de Amazon VPC.</p>


<h3 id="comunidad-y-soporte" tabindex="-1">Comunidad y Soporte</h3>


<p>Si aún tienes dudas o problemas con Amazon VPC, aquí tienes algunas opciones:</p>


<ul>
<li>En los <strong>foros de AWS</strong> hay una sección de <a href="https://forums.aws.amazon.com/forum.jspa?forumID=87" rel="noopener noreferrer" target="_blank">redes</a> donde puedes hacer preguntas.</li>
<li>También puedes mandar un <strong>correo</strong> a <a href="mailto:support-es@amazon.com" rel="noopener noreferrer" target="_blank">support-es@amazon.com</a>.</li>
<li>Si pagas por soporte, puedes hablar <strong>por teléfono</strong> o chat con expertos de AWS.</li>
<li>En Twitter, @AWSEspanol te ayuda con tus preguntas sobre AWS.</li>
</ul>


<p>Con estos recursos y ayuda, puedes solucionar cualquier problema con Amazon VPC. Y si ya sabes mucho, puedes compartir tu conocimiento con otros.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>Amazon VPC es una herramienta que nos permite crear nuestras propias redes en la nube de AWS, dándonos mucho control y manteniendo nuestros datos seguros y separados de otros usuarios.</p>


<p>En esta guía, hemos visto lo básico y lo no tan básico sobre Amazon VPC:</p>


<ul>
<li><strong>Aislamiento y seguridad</strong>: Con Amazon VPC, podemos hacer que solo ciertas personas tengan acceso a nuestra red, manteniendo seguros nuestros datos.</li>
<li><strong>Cómo diseñar nuestra red</strong>: Podemos armar nuestra red de varias maneras, como tener una zona especial para visitantes (DMZ) o conectar varias redes entre sí.</li>
<li><strong>Conectar con otras redes</strong>: Amazon VPC nos permite conectar nuestra red en la nube con redes que tengamos en otros lugares, usando cosas como VPN o AWS Direct Connect.</li>
<li><strong>Administrar muchas conexiones fácilmente</strong>: Si tenemos varias redes, los transit gateways nos ayudan a manejarlas todas desde un solo lugar.</li>
<li><strong>Ahorrar dinero</strong>: Hay varias maneras de usar Amazon VPC sin gastar de más, aprovechando bien los recursos.</li>
</ul>


<p>Entender bien Amazon VPC es importante para usarlo de la mejor manera, haciendo que nuestras redes en la nube sean seguras, eficientes y fáciles de manejar.</p>


<p>Te recomiendo que le eches un vistazo a la <a href="https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html" rel="noopener noreferrer" target="_blank">Guía de usuario VPC</a> y a las <a href="https://aws.amazon.com/es/vpc/faqs/" rel="noopener noreferrer" target="_blank">Preguntas frecuentes AWS VPC</a> para aprender más. ¡Espero que esta guía te haya ayudado!</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas Relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-es-una-vpc-y-para-qu%C3%A9-se-usa%3F" tabindex="-1">¿Qué es una VPC y para qué se usa?</h3>


<p>Una VPC (Nube Privada Virtual) es un espacio seguro en la nube de AWS donde puedes poner tus servidores y datos. Te da control total sobre tu red, permitiéndote decidir quién puede acceder a qué, y cómo se conectan tus servicios.</p>


<p>Una VPC se usa para:</p>


<ul>
<li>Mantener datos importantes aislados y seguros.</li>
<li>Controlar mejor quién puede acceder a tus aplicaciones.</li>
<li>Conectar de manera segura tu oficina con la nube.</li>
</ul>


<h3 id="%C2%BFc%C3%B3mo-se-puede-ver-la-informaci%C3%B3n-del-tr%C3%A1fico-de-red-en-una-vpc%3F" tabindex="-1">¿Cómo se puede ver la información del tráfico de red en una VPC?</h3>


<p>Los VPC Flow Logs te permiten ver la información del tráfico de red que entra y sale de tus servidores en la VPC. Esto es útil para entender cómo se usan tus servicios y para solucionar problemas.</p>


<h3 id="%C2%BFqu%C3%A9-significan-las-siglas-vpc%3F" tabindex="-1">¿Qué significan las siglas VPC?</h3>


<p>VPC significa Nube Privada Virtual (Virtual Private Cloud). Es un servicio de AWS que te permite crear tu propia sección aislada en la nube, donde puedes controlar completamente tu red.</p>


<h3 id="%C2%BFqu%C3%A9-herramienta-ayuda-a-proteger-tus-servicios-en-una-vpc-a-nivel-de-subred%3F" tabindex="-1">¿Qué herramienta ayuda a proteger tus servicios en una VPC a nivel de subred?</h3>


<p>Las listas de control de acceso a la red (Network ACLs) te ayudan a controlar quién puede enviar y recibir datos a nivel de subred en tu VPC. Esto añade una capa extra de seguridad, protegiendo tus servicios.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/introduccion-a-los-servicios-de-amazon-web-services/">Introducción a los servicios de Amazon Web Services</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/nube-aws-guia-de-inicio-rapido/">Nube AWS: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">AWS Fundamentos: Guía de Inicio Rápido</a></li>
</ul>
</p>
