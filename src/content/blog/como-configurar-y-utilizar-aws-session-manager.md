---
title: "Como Configurar y Utilizar AWS Session Manager"
description: "Descubre cómo configurar y utilizar AWS Session Manager para mejorar la seguridad y eficiencia en el acceso a tus servidores EC2. Aprende sobre sus características, beneficios y mejores prácticas."
publishedAt: "2024-03-18"
publishedTimestamp: "2024-03-18T23:43:17.278Z"
cover: "/assets/blog/037793a796bc8f08a1cce7d0.png"
coverAlt: "Thumbnail for: Como Configurar y Utilizar AWS Session Manager"
ogImage: "/assets/blog/037793a796bc8f08a1cce7d0.png"
related:
  - title: "Configurar AWS para Comunicación en Equipo: 7 Pasos"
    url: "https://dondeaprendoaws.com/blog/configurar-aws-para-comunicacion-en-equipo-7-pasos/"
    image: "/assets/blog/f92b3e352f4a3a9565a17d1a.jpg"
    imageAlt: ""
  - title: "Guía de AWS Wavelength: Zonas y Despliegue"
    url: "https://dondeaprendoaws.com/blog/guia-de-aws-wavelength-zonas-y-despliegue/"
    image: "/assets/blog/e73412d95c38ad88b6dc619a.jpg"
    imageAlt: ""
  - title: "Introducción a la Inteligencia Artificial en AWS"
    url: "https://dondeaprendoaws.com/blog/introduccion-a-la-inteligencia-artificial-en-aws/"
    image: "/assets/blog/740fd46916e44bd2c61ce62c.png"
    imageAlt: ""
---

<p>AWS Session Manager es una herramienta poderosa dentro de AWS Systems Manager que simplifica la forma en que te conectas y gestionas tus servidores EC2 y otros dispositivos, sin la necesidad de SSH o claves. Aquí te muestro cómo configurarlo y usarlo para mejorar la seguridad y eficiencia en el acceso a tus sistemas:</p>


<ul>
<li><strong>Simplifica el acceso a servidores</strong>: Sin necesidad de SSH o claves.</li>
<li><strong>Mejora la seguridad</strong>: A través de AWS IAM, cifrado y registro detallado de sesiones.</li>
<li><strong>Fácil de configurar y usar</strong>: Con pasos claros para la configuración inicial y conexión posterior.</li>
<li><strong>Versátil</strong>: Soporta Linux y Windows, y permite comandos interactivos y reenvío de puertos.</li>
</ul>


<p>Para empezar, asegúrate de tener una cuenta de AWS, permisos de IAM adecuados, y el SSM Agent instalado en tus instancias EC2. Luego, sigue los pasos detallados para la creación de roles de IAM, asociación de roles a instancias, y verificación de la configuración de VPC. Finalmente, explora las distintas formas de conexión, ya sea a través de la consola de AWS, AWS CLI, o incluso programando sesiones automáticas.</p>


<p>¿Listo para mejorar la gestión de tus servidores con AWS Session Manager? Comencemos.</p>


<h3 id="caracter%C3%ADsticas-principales" tabindex="-1">Características Principales</h3>


<p>AWS Session Manager tiene varias características importantes:</p>


<ul>
<li>Funciona tanto para servidores Linux como Windows</li>
<li>Puedes acceder usando la consola de AWS, la línea de comandos o SDKs</li>
<li>Controla quién accede usando AWS Identity and Access Management (IAM)</li>
<li>Tus datos están seguros porque todo se cifra</li>
<li>Se integra con AWS PrivateLink</li>
<li>Puedes ver y auditar quién accedió a qué servidor</li>
<li>Permite ejecutar comandos de manera interactiva</li>
<li>Puedes hacer Port Forwarding</li>
</ul>


<h3 id="beneficios" tabindex="-1">Beneficios</h3>


<p>Usar AWS Session Manager tiene muchas ventajas:</p>


<ul>
<li>Es más seguro porque no tienes que abrir puertos SSH al mundo</li>
<li>Puedes llevar un registro de quién accede a tus servidores, lo cual es genial para auditorías</li>
<li>Te ayuda a cumplir con regulaciones de seguridad</li>
<li>Te ahorra tiempo en manejar claves y sistemas de acceso</li>
<li>Facilita conectarte a tus servidores rápidamente, incluso si no tienen una IP pública</li>
</ul>


<h2 id="requisitos-previos-para-session-manager" tabindex="-1">Requisitos Previos Para Session Manager</h2>


<p>Para empezar a usar AWS Session Manager, hay algunas cosas que necesitas tener listas primero:</p>


<h3 id="cuenta-de-aws" tabindex="-1">Cuenta de AWS</h3>


<p>Necesitas una cuenta en AWS. Esta cuenta te dará acceso a los servicios de EC2 y Systems Manager.</p>


<h3 id="permisos-de-iam" tabindex="-1">Permisos de IAM</h3>


<p>Es importante que el usuario de AWS que va a usar Session Manager tenga los permisos necesarios. Esto incluye permisos para trabajar con EC2, Systems Manager y, si lo necesitas, también con S3 y CloudWatch Logs.</p>


<h3 id="instalar-aws-cli-(opcional)" tabindex="-1">Instalar AWS CLI (opcional)</h3>


<p>Si quieres manejar Session Manager desde la línea de comandos, debes tener AWS CLI instalado en tu computadora.</p>


<h3 id="habilitar-ssm-agent" tabindex="-1">Habilitar SSM Agent</h3>


<p>Para que Session Manager pueda conectarse a tus instancias EC2, estas deben tener el agente de SSM activo. Este agente ya viene instalado en muchas de las imágenes de máquina (AMIs) que ofrece AWS.</p>


<h2 id="configuraci%C3%B3n-de-aws-session-manager" tabindex="-1">Configuración de AWS Session Manager</h2>


<h3 id="1.-crear-rol-de-iam" tabindex="-1">1. Crear Rol de IAM</h3>


<p>Para usar Session Manager, primero necesitas crear un rol de IAM con los permisos básicos. Este rol necesita la política <code class="inline-code">AmazonSSMManagedInstanceCore</code> para que SSM pueda hablar con tus instancias.</p>


<p>Para crear el rol:</p>


<ul>
<li>Entra a la consola de IAM</li>
<li>Haz clic en "Roles" y después en "Crear rol"</li>
<li>Elige "EC2" como el tipo de entidad confiable</li>
<li>Busca y selecciona la política <code class="inline-code">AmazonSSMManagedInstanceCore</code></li>
<li>Ponle un nombre al rol, como "SSM-Role", y créalo</li>
</ul>


<h3 id="2.-instalar-ssm-agent" tabindex="-1">2. Instalar SSM Agent</h3>


<p>El SSM Agent es necesario para que SSM y las instancias EC2 puedan comunicarse.</p>


<p>Para instalarlo:</p>


<ul>
<li>Checa si ya está instalado con <code class="inline-code">sudo systemctl status amazon-ssm-agent</code> en tu instancia</li>
<li>Si no está, actualiza tu máquina e instala el agente de SSM</li>
<li>Reinicia el agente con <code class="inline-code">sudo systemctl restart amazon-ssm-agent</code></li>
</ul>


<p>También puedes usar AMIs que ya tienen el agente instalado.</p>


<h3 id="3.-asociar-rol-de-iam-a-instancias" tabindex="-1">3. Asociar Rol de IAM a Instancias</h3>


<p>Ahora, tienes que vincular el rol de IAM que hiciste con las instancias que quieres manejar con Session Manager.</p>


<p>Para hacerlo:</p>


<ul>
<li>Ve a la consola de EC2 y elige tus instancias</li>
<li>Haz clic derecho, ve a "Seguridad", luego "Modificar rol de IAM"</li>
<li>Elige el rol de SSM que creaste</li>
<li>Guarda los cambios</li>
</ul>


<h3 id="4.-verificar-configuraci%C3%B3n-de-vpc" tabindex="-1">4. Verificar Configuración de VPC</h3>


<p>Session Manager necesita que ciertos puertos estén abiertos para funcionar bien:</p>


<ul>
<li>El puerto 443 debe estar abierto para el tráfico HTTPS de salida</li>
<li>Si usas endpoints de VPC, asegúrate de tener un endpoint de SSM</li>
</ul>


<p>Checa que los grupos de seguridad y NACLs de tus subnets permitan este tráfico.</p>


<h3 id="5.-configuraci%C3%B3n-avanzada-(opcional)" tabindex="-1">5. Configuración Avanzada (opcional)</h3>


<p>Algunas configuraciones extra que puedes hacer:</p>


<ul>
<li>Activar CloudWatch Logs para guardar registros de tus sesiones</li>
<li>Usar cifrado SSL o KMS para proteger el contenido de las sesiones</li>
<li>Configurar tiempos de espera para sesiones inactivas y la duración máxima de una sesión</li>
</ul>


<h2 id="conexi%C3%B3n-a-instancias-con-session-manager" tabindex="-1">Conexión a Instancias con Session Manager</h2>


<h3 id="desde-la-consola-de-aws" tabindex="-1">Desde la Consola de AWS</h3>


<p>Para conectarte a una instancia EC2 usando la consola de AWS, sigue estos pasos:</p>


<ul>
<li>Ve a la consola de EC2 y elige la instancia a la cual te quieres conectar.</li>
<li>Da clic en "Connect" (Conectar).</li>
<li>Selecciona "Session Manager" como tu método de conexión.</li>
<li>Haz clic en "Connect" (Conectar) nuevamente para empezar la sesión.</li>
</ul>


<p>Una vez que estés conectado, podrás escribir y ejecutar comandos directamente en la instancia desde tu navegador.</p>


<h3 id="desde-aws-cli" tabindex="-1">Desde AWS CLI</h3>


<p>Para <a href="https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html" rel="noopener noreferrer" target="_blank">iniciar una sesión</a> usando la línea de comandos, escribe el siguiente comando:</p>


<pre><code>aws ssm start-session --target &lt;instance-id&gt;
</code></pre>


<p>Esto abrirá una ventana de terminal en la que puedes escribir comandos para interactuar con tu instancia.</p>


<h3 id="reenv%C3%ADo-de-puertos" tabindex="-1">Reenvío de Puertos</h3>


<p>El reenvío de puertos te permite usar aplicaciones de tu instancia EC2 en tu propia computadora.</p>


<p>Para hacer esto:</p>


<ul>
<li>Indica el puerto de la aplicación remota con <code class="inline-code">--port</code>.</li>
<li>Usa <code class="inline-code">--local-port</code> para decidir a través de qué puerto en tu computadora quieres acceder.</li>
</ul>


<p>Por ejemplo:</p>


<pre><code>aws ssm start-session --target i-01234567890 --port 3389 --local-port 3389
</code></pre>


<p>Esto conectará el puerto 3389 de tu instancia al puerto 3389 de tu computadora, permitiéndote acceder a la aplicación.</p>


<h3 id="comandos-interactivos" tabindex="-1">Comandos Interactivos</h3>


<p>Para que SSM ejecute comandos automáticamente al iniciar una sesión, puedes:</p>


<ul>
<li>Crear un documento de SSM que ejecute el comando que quieras, como <code class="inline-code">ls -al</code>.</li>
<li>Al conectarte, usa <code class="inline-code">--document-name</code> para especificar ese documento.</li>
</ul>


<p>Así, cada vez que te conectes, verás automáticamente el resultado de <code class="inline-code">ls -al</code>.</p>


<h3 id="programar-sesiones" tabindex="-1">Programar Sesiones</h3>


<p>Si necesitas que las sesiones se inicien solas en un horario específico, puedes:</p>


<ul>
<li>Usar Automation de SSM para crear una tarea que ejecute <code class="inline-code">start-session</code>.</li>
<li>Programa esta tarea para que se ejecute cuando lo necesites.</li>
</ul>


<p>Esto es útil para tareas de administración o mantenimiento que necesitas hacer regularmente.</p>


<h2 id="seguridad-y-cumplimiento" tabindex="-1">Seguridad y Cumplimiento</h2>


<h3 id="aws-identity-and-access-management-(iam)" tabindex="-1">AWS Identity and Access Management (IAM)</h3>


<p>Con Session Manager, puedes decidir quién puede hacer qué, gracias a las políticas de IAM. Esto te permite:</p>


<ul>
<li>Elegir quiénes pueden usar Session Manager</li>
<li>Determinar a qué computadoras pueden acceder (como tus servidores EC2)</li>
<li>Decidir si pueden ver, empezar o terminar sesiones</li>
<li>Limitar los puertos o comandos que pueden usar</li>
</ul>


<p>Esto te da un control muy específico sobre quién puede acceder a tus sistemas.</p>


<h3 id="integraci%C3%B3n-con-aws-kms" tabindex="-1">Integración con AWS KMS</h3>


<p>Session Manager también te permite usar cifrado para proteger los datos que se envían durante las sesiones, usando algo llamado AWS Key Management Service (KMS).</p>


<p>Al activar esta opción, la comunicación entre tu computadora y tus servidores se cifra, lo que añade una capa extra de seguridad.</p>


<h3 id="registro-en-cloudwatch-logs" tabindex="-1">Registro en CloudWatch Logs</h3>


<p>Una parte importante de mantener tus sistemas seguros es saber qué está pasando en ellos. Session Manager puede mandar un registro detallado de cada sesión a CloudWatch Logs. Esto incluye:</p>


<ul>
<li>El ID de la sesión</li>
<li>Quién empezó la sesión</li>
<li>A qué servidor se conectaron</li>
<li>Cuándo empezó y terminó la sesión</li>
<li>Qué comandos se usaron</li>
<li>Los resultados de esos comandos</li>
</ul>


<p>Es muy útil activar esta opción para poder revisar actividades pasadas y para cumplir con reglas de seguridad.</p>


<h3 id="cumplimiento-normativo" tabindex="-1">Cumplimiento Normativo</h3>


<p>Usar Session Manager te ayuda a cumplir con varias normas y reglas de seguridad importantes, como HIPAA, PCI DSS, FedRAMP y SOC. Esto significa que al usar Session Manager estás ayudando a que tus sistemas sean más seguros y estén en línea con lo que piden estas normas.</p>




<h2 id="soluci%C3%B3n-de-problemas" tabindex="-1">Solución de Problemas</h2>


<p>Cuando usas AWS Session Manager, a veces pueden surgir problemas. Aquí te explico cómo solucionar los más comunes:</p>


<h3 id="error-de-permisos-de-iam" tabindex="-1">Error de Permisos de IAM</h3>


<p>Si te sale un error que dice que no tienes permiso para usar Session Manager, significa que necesitas ajustar los permisos de IAM.</p>


<p>Qué puedes hacer:</p>


<ul>
<li>Asegúrate de que el usuario de IAM tenga el permiso <code class="inline-code">AmazonSSMManagedInstanceCore</code>. Este permiso permite hacer cosas básicas con SSM.</li>
<li>Puedes crear un permiso personalizado que incluya lo necesario para usar Session Manager, como <code class="inline-code">ssm:StartSession</code>, <code class="inline-code">ssm:TerminateSession</code>, etc., y dárselo al usuario.</li>
<li>Si estás usando un rol para una instancia de EC2, verifica que este rol tenga los permisos para usar Session Manager. Puedes agregar el permiso <code class="inline-code">AmazonSSMManagedInstanceCore</code> o uno personalizado.</li>
<li>Checa que no haya un permiso que esté bloqueando estos accesos. Los permisos de bloqueo son más fuertes que los de acceso.</li>
</ul>


<h3 id="ssm-agent-no-instalado" tabindex="-1">SSM Agent no Instalado</h3>


<p>Si te indica que SSM Agent no está en la instancia de EC2, necesitas instalar o activar el agente.</p>


<p>Qué puedes hacer:</p>


<ul>
<li>Revisa si tu instancia tiene una AMI que ya viene con SSM Agent. Muchas AMIs nuevas ya lo incluyen.</li>
<li>Si no lo tiene, instala SSM Agent manualmente siguiendo las instrucciones para <a href="https://docs.aws.amazon.com/es_es/systems-manager/latest/userguide/sysman-manual-agent-install.html" rel="noopener noreferrer" target="_blank">Linux</a> o <a href="https://docs.aws.amazon.com/es_es/systems-manager/latest/userguide/sysman-install-win.html" rel="noopener noreferrer" target="_blank">Windows</a>.</li>
<li>Después de instalar, reinicia el servicio de SSM Agent con <code class="inline-code">sudo systemctl restart amazon-ssm-agent</code>.</li>
<li>También puedes usar el documento de SSM <code class="inline-code">AWS-UpdateSSMAgent</code> para instalar o actualizar el agente de forma automática.</li>
</ul>


<h3 id="problemas-de-conectividad" tabindex="-1">Problemas de Conectividad</h3>


<p>Si el agente está bien pero no logras conectarte, puede ser un problema de red.</p>


<p>Qué puedes hacer:</p>


<ul>
<li>Asegúrate de que el puerto 443 (HTTPS) esté abierto en el grupo de seguridad y las ACLs de la instancia.</li>
<li>Si usas un endpoint de VPC para SSM, verifica que la configuración de ruta sea la correcta.</li>
<li>Checa que la instancia pueda conectar con los endpoints de SSM en Internet, o con el endpoint de VPC si usas uno.</li>
<li>Si tienes un proxy, revisa que SSM Agent esté configurado correctamente para usarlo.</li>
</ul>


<h3 id="sesi%C3%B3n-expirada" tabindex="-1">Sesión Expirada</h3>


<p>Si tus sesiones se cierran muy rápido, puedes ajustar el tiempo antes de que expiren.</p>


<p>Qué puedes hacer:</p>


<ul>
<li>Usa el parámetro <code class="inline-code">SessionTimeout</code> cuando inicies una sesión para que dure más, solo para esa vez.</li>
<li>En los documentos de SSM que usas para iniciar sesiones, pon un tiempo de espera más largo con <code class="inline-code">timeoutSeconds</code>.</li>
<li>En las preferencias de Session Manager, aumenta el <code class="inline-code">SessionIdleTimeout</code> para que todas las sesiones duren más por defecto.</li>
</ul>


<h2 id="mejores-pr%C3%A1cticas" tabindex="-1">Mejores Prácticas</h2>


<p>Aquí tienes algunas recomendaciones para cuando uses AWS Session Manager:</p>


<h3 id="usar-pol%C3%ADticas-iam-detalladas" tabindex="-1">Usar Políticas IAM Detalladas</h3>


<p>Es bueno darle a cada persona solo los permisos que realmente necesita para hacer su trabajo. Así, por ejemplo, si alguien solo necesita ver información pero no cambiar nada, solo debería tener permiso para ver. Esto ayuda a mantener todo más seguro.</p>


<h3 id="cambiar-las-claves-regularmente" tabindex="-1">Cambiar las Claves Regularmente</h3>


<p>Es una buena idea cambiar las claves de acceso cada cierto tiempo, como cada tres meses. Esto ayuda a evitar problemas si alguien llega a conseguir una clave que no debería tener.</p>


<p>AWS puede ayudarte a cambiar estas claves automáticamente para que no se te olvide hacerlo.</p>


<h3 id="mantener-un-registro-con-cloudwatch" tabindex="-1">Mantener un Registro con CloudWatch</h3>


<p>Es muy útil activar una opción que guarda un registro de quién se conecta a tus sistemas y qué hace. Esto se puede hacer con algo llamado Amazon CloudWatch Logs. Te permite ver fácilmente qué pasó y cuándo, lo cual es muy útil si necesitas revisar algo o si hay un problema de seguridad.</p>


<h3 id="cifrar-las-sesiones" tabindex="-1">Cifrar las Sesiones</h3>


<p>Aunque AWS Session Manager ya protege tus datos cuando los envías, puedes hacerlo aún más seguro usando un servicio llamado AWS KMS. Esto es especialmente importante si trabajas con información muy delicada. Esto añade una protección extra para asegurarte de que tus datos estén seguros mientras los envías.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<h3 id="puntos-clave" tabindex="-1">Puntos Clave</h3>


<ul>
<li>AWS Session Manager te permite entrar a tus servidores de manera segura y fácil.</li>
<li>Es una alternativa a métodos más complicados como usar bastiones o SSH.</li>
<li>Te ayuda a tener todo bajo control, revisar quién entra a tus sistemas y mantener todo seguro.</li>
<li>Permite dar acceso cuando se necesita sin tener que dar claves que no cambian.</li>
<li>Ayuda a que todo esté más seguro y cumpla con las reglas de seguridad.</li>
</ul>


<p>AWS Session Manager es una herramienta práctica para manejar servidores EC2 y otros dispositivos de forma segura. Al no necesitar SSH, claves, ni bastiones, hace mucho más fácil el acceso a tus sistemas, a la vez que aumenta la seguridad.</p>


<p>Lo bueno es que con AWS Session Manager puedes controlar quién entra a tus sistemas gracias a las políticas de IAM. Esto significa que puedes dar acceso solo por un rato, en vez de dar claves fijas.</p>


<p>También, puedes llevar un registro de todo lo que pasa, quién entra y qué hace, guardando esta información en CloudWatch Logs para verla después.</p>


<p>Además, el uso de cifrado SSL y la opción de activar AWS KMS ponen una capa extra de seguridad sobre la información que se comparte en las sesiones.</p>


<p>En pocas palabras, AWS Session Manager es una forma excelente de entrar a tus servidores EC2 y otros sistemas de manera sencilla pero muy segura. Usarlo puede mejorar mucho cómo cuidas la seguridad en tu organización.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas Relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-es-session-manager-de-aws%3F" tabindex="-1">¿Qué es Session Manager de AWS?</h3>


<p>AWS Session Manager es una herramienta de AWS Systems Manager que te ayuda a manejar tus servidores o instancias EC2 de forma segura. Te permite conectarte a tus servidores para ejecutar comandos o revisar aplicaciones sin tener que lidiar con temas de seguridad como abrir puertos o manejar muchas contraseñas. Es una manera práctica y segura de acceder a tus servidores.</p>


<h3 id="%C2%BFc%C3%B3mo-iniciar-sesi%C3%B3n-en-aws-cli%3F" tabindex="-1">¿Cómo iniciar sesión en AWS CLI?</h3>


<p>Para usar AWS CLI (una herramienta que te permite controlar AWS desde la línea de comandos), sigue estos pasos:</p>


<ul>
<li>Primero, asegúrate de tener AWS CLI instalado en tu computadora.</li>
<li>Abre la terminal y escribe <code class="inline-code">aws configure</code>. Esto te permitirá ingresar tus credenciales, como tu ID de acceso y clave secreta, y también seleccionar tu región.</li>
<li>Después de configurar tus credenciales, puedes empezar a usar comandos de AWS CLI escribiendo <code class="inline-code">aws</code> seguido del servicio y el comando que quieras usar. Por ejemplo, <code class="inline-code">aws ssm start-session</code> para iniciar una sesión con AWS Session Manager.</li>
<li>Si necesitas usar diferentes cuentas o configuraciones, puedes crear perfiles adicionales con <code class="inline-code">aws configure --profile nombre_del_perfil</code> y cambiar entre ellos según necesites.</li>
</ul>


<p>Con estos pasos, puedes manejar tus servicios de AWS directamente desde la línea de comandos de una manera más eficiente.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ec2/">Mejores Prácticas Para Amazon EC2</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">Seguridad en AWS: Servicios Esenciales</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">AWS Fundamentos: Guía de Inicio Rápido</a></li>
</ul>
</p>
