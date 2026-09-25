---
title: "Principios de Zero Trust en AWS: Componentes Clave"
description: "Descubre cómo implementar Zero Trust en AWS, protegiendo identidades, redes y datos con medidas efectivas y herramientas clave."
publishedAt: "2024-10-26"
publishedTimestamp: "2024-10-26T19:07:21.543Z"
cover: "/assets/blog/3bded967f6dd68d809d0a807.webp"
coverAlt: "Thumbnail for: Principios de Zero Trust en AWS: Componentes Clave"
ogImage: "/assets/blog/3bded967f6dd68d809d0a807.webp"
related:
  - title: "Guía de AWS Wavelength: Zonas y Despliegue"
    url: "https://dondeaprendoaws.com/blog/guia-de-aws-wavelength-zonas-y-despliegue/"
    image: "/assets/blog/e73412d95c38ad88b6dc619a.jpg"
    imageAlt: ""
  - title: "10 Laboratorios Prácticos de AWS para Principiantes"
    url: "https://dondeaprendoaws.com/blog/10-laboratorios-practicos-de-aws-para-principiantes/"
    image: "/assets/blog/e9f2fc671d3e9516f2345bb7.png"
    imageAlt: ""
  - title: "9 Mejores Prácticas de Seguridad para IaC en AWS"
    url: "https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/"
    image: "/assets/blog/0b84e7609d9a01cdc2449b30.jpg"
    imageAlt: ""
---

<p>Zero Trust en <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> significa una cosa: verificar todo, siempre, sin excepciones.</p>


<p>Aquí está todo lo que necesitas saber:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Qué Hace</th>
<th>Herramienta AWS</th>
</tr>
</thead>
<tbody>
<tr>
<td>Identidad</td>
<td>Verifica cada usuario</td>
<td>IAM + MFA</td>
</tr>
<tr>
<td>Red</td>
<td>Controla cada conexión</td>
<td>Security Groups + VPC</td>
</tr>
<tr>
<td>Datos</td>
<td>Cifra toda información</td>
<td>KMS + S3</td>
</tr>
<tr>
<td>Monitoreo</td>
<td>Ve cada actividad</td>
<td>GuardDuty + CloudTrail</td>
</tr>
</tbody>
</table></figure>


<p><strong>¿Por qué importa?</strong> Los números son claros:</p>


<ul>
<li>Un ataque puede costar +$4M</li>
<li>8 de 10 ataques usan credenciales robadas</li>
<li>60% de empresas usarán Zero Trust para 2025</li>
</ul>


<p><strong>La regla es simple:</strong> No confíes en nadie. Ni dentro ni fuera de tu red.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Seguridad Tradicional</th>
<th>Zero Trust</th>
</tr>
</thead>
<tbody>
<tr>
<td>Confía en usuarios internos</td>
<td>No confía en nadie</td>
</tr>
<tr>
<td>Verifica una vez</td>
<td>Verifica siempre</td>
</tr>
<tr>
<td>Protege el perímetro</td>
<td>Protege cada punto</td>
</tr>
<tr>
<td>Da acceso amplio</td>
<td>Da acceso mínimo</td>
</tr>
</tbody>
</table></figure>


<p>Este artículo te muestra paso a paso cómo implementar Zero Trust en AWS, desde la configuración básica hasta el monitoreo avanzado.</p>


<h2 class="sb" id="related-video-from-youtube" tabindex="-1">Related video from YouTube</h2>


<iframe allowfullscreen="" loading="lazy" src="https://www.youtube-nocookie.com/embed/1p5G1-4s1r0" title="Video de YouTube"></iframe>
<h2 class="sb" id="%C2%BFqu%C3%A9-es-zero-trust%3F" tabindex="-1">¿Qué es Zero Trust?</h2>


<p>Zero Trust es un modelo de seguridad con una regla básica: no confiar en nadie. Ni dentro ni fuera de la red.</p>


<p>John Kindervag lo creó en <a href="https://www.forrester.com/" rel="noopener noreferrer" target="_blank">Forrester Research</a> en 2010. Desde entonces, ha transformado la seguridad digital.</p>


<p>Veamos la diferencia:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Seguridad Antigua</th>
<th>Zero Trust</th>
</tr>
</thead>
<tbody>
<tr>
<td>Confía en usuarios internos</td>
<td>No confía en nadie</td>
</tr>
<tr>
<td>Verifica solo al inicio</td>
<td>Verifica todo, siempre</td>
</tr>
<tr>
<td>Protege el borde</td>
<td>Protege cada elemento</td>
</tr>
<tr>
<td>Da mucho acceso</td>
<td>Da acceso limitado</td>
</tr>
</tbody>
</table></figure>


<p>Zero Trust se basa en <strong>3 ideas clave</strong>:</p>


<ul>
<li><strong>Todo se verifica</strong>: Cada acción necesita aprobación</li>
<li><strong>Menos es más</strong>: Solo das los permisos necesarios</li>
<li><strong>Todo separado</strong>: Cada recurso tiene su propia protección</li>
</ul>


<p>Los datos hablan: <a href="https://www.gartner.com/en" rel="noopener noreferrer" target="_blank">Gartner</a> dice que el 60% de empresas usarán Zero Trust para 2025. ¿Por qué? Simple: 8 de cada 10 ataques usan credenciales robadas.</p>


<blockquote>
<p>"Zero Trust sigue las pautas NIST: verifica siempre, todo el tiempo, para todo." - CrowdStrike</p>
</blockquote>


<p>En AWS funciona así:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Parte</th>
<th>Cómo se hace</th>
</tr>
</thead>
<tbody>
<tr>
<td>Quién eres</td>
<td>AWS IAM + MFA</td>
</tr>
<tr>
<td>Qué puedes hacer</td>
<td>Roles específicos</td>
</tr>
<tr>
<td>Dónde lo haces</td>
<td>VPCs separadas</td>
</tr>
<tr>
<td>Quién vigila</td>
<td>CloudTrail + GuardDuty</td>
</tr>
</tbody>
</table></figure>


<p>Un ejemplo: En 2014, <a href="https://www.ebay.com/" rel="noopener noreferrer" target="_blank">eBay</a> perdió datos de 145 millones de usuarios. Los atacantes solo necesitaron 3 cuentas de empleados. Zero Trust con MFA lo habría parado.</p>


<blockquote>
<p>"La mejor defensa combina controles de identidad y red." - AWS Security Blog</p>
</blockquote>


<p>AWS verifica cada petición API por separado, sin importar su origen. Es Zero Trust en acción.</p>


<h2 class="sb" id="configuraci%C3%B3n-de-identidad-y-acceso-en-aws" tabindex="-1">Configuración de Identidad y Acceso en <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a></h2>


<p><figure><img alt="AWS" src="/assets/blog/2ebe3cf8e7ae57e98d3af846.jpg"/></figure></p>


<p>IAM es tu centro de control de <a href="https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/">seguridad en AWS</a>. Vamos a ver cómo configurarlo de manera simple y efectiva.</p>


<h3 id="primeros-pasos-con-aws-iam" tabindex="-1">Primeros Pasos con AWS IAM</h3>


<p>IAM te permite controlar el acceso a AWS. Es como un portero que decide quién entra y qué puede hacer:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Elemento</th>
<th>¿Para qué sirve?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Usuario IAM</td>
<td>Es tu identidad personal en AWS</td>
</tr>
<tr>
<td>Grupo IAM</td>
<td>Junta usuarios con permisos similares</td>
</tr>
<tr>
<td>Rol IAM</td>
<td>Da permisos temporales a servicios</td>
</tr>
<tr>
<td>Política</td>
<td>Define qué puede hacer cada quien</td>
</tr>
</tbody>
</table></figure>


<h3 id="configuraci%C3%B3n-de-single-sign-on" tabindex="-1">Configuración de Single Sign-On</h3>


<p>SSO hace tu vida más fácil cuando manejas varias <a href="https://dondeaprendoaws.com/blog/aws-gratis-para-educadores-y-estudiantes/">cuentas AWS</a>:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Ventaja</th>
<th>¿Qué te da?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Un solo login</td>
<td>Entras a todo desde un lugar</td>
</tr>
<tr>
<td>Sin múltiples passwords</td>
<td>Más seguridad, menos dolores de cabeza</td>
</tr>
<tr>
<td>Control preciso</td>
<td>Decides quién hace qué en cada app</td>
</tr>
</tbody>
</table></figure>


<h3 id="a%C3%B1adiendo-autenticaci%C3%B3n-multi-factor" tabindex="-1">Añadiendo Autenticación Multi-Factor</h3>


<p>MFA no es opcional - es NECESARIO. AWS te da estas opciones:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo</th>
<th>¿Cómo funciona?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Llave física</td>
<td>Conectas una llave USB</td>
</tr>
<tr>
<td>App en celular</td>
<td>Usas Google Authenticator</td>
</tr>
<tr>
<td>Token físico</td>
<td>Dispositivo que genera códigos</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"AWS ya no permite MFA por SMS. Mejor usa otro método" - AWS Security Blog</p>
</blockquote>


<h3 id="uso-de-roles-aws" tabindex="-1">Uso de Roles AWS</h3>


<p>Los roles son mejores que las claves fijas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>¿Qué hacer?</th>
<th>¿Por qué?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Usar roles temporales</td>
<td>Menos riesgo si alguien los roba</td>
</tr>
<tr>
<td>Dar permisos justos</td>
<td>Solo lo que cada uno necesita</td>
</tr>
<tr>
<td>Dejar que AWS rote claves</td>
<td>No más gestión manual</td>
</tr>
</tbody>
</table></figure>


<h3 id="conexi%C3%B3n-con-sistemas-externos" tabindex="-1">Conexión con Sistemas Externos</h3>


<p>AWS se conecta con otros sistemas así:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Método</th>
<th>¿Cuándo usarlo?</th>
</tr>
</thead>
<tbody>
<tr>
<td>SAML 2.0</td>
<td>Para Active Directory</td>
</tr>
<tr>
<td>OAuth/OIDC</td>
<td>Para apps web nuevas</td>
</tr>
<tr>
<td>AWS SSO</td>
<td>Para gestión central</td>
</tr>
</tbody>
</table></figure>


<p><strong>Lo que NO debes olvidar:</strong></p>


<ul>
<li>La cuenta root es solo para emergencias</li>
<li>MFA en TODAS las cuentas</li>
<li>Revisa permisos cada 3 meses</li>
<li>Servicios usan roles, no usuarios</li>
<li>Da solo los permisos necesarios</li>
</ul>


<blockquote>
<p>"Empieza con cero permisos. Añade solo lo que hace falta" - StrongDM Security Team</p>
</blockquote>


<p>Visita <a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a> para más guías de IAM en español.</p>


<h2 class="sb" id="configuraci%C3%B3n-de-seguridad-de-red" tabindex="-1">Configuración de Seguridad de Red</h2>


<p>AWS ofrece varias herramientas para proteger tu red. Aquí está lo que necesitas saber:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Nivel</th>
<th>¿Qué hace?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Grupos de Seguridad</td>
<td>Instancia</td>
<td>Filtra tráfico entrante/saliente</td>
</tr>
<tr>
<td>NACL</td>
<td>Subred</td>
<td>Control de acceso adicional</td>
</tr>
<tr>
<td>VPC</td>
<td>Red</td>
<td>Separa recursos</td>
</tr>
<tr>
<td>PrivateLink</td>
<td>Servicios</td>
<td>Conecta VPCs de forma privada</td>
</tr>
</tbody>
</table></figure>


<h3 id="grupos-de-seguridad-vs-nacl" tabindex="-1">Grupos de Seguridad vs NACL</h3>


<p>Los Grupos de Seguridad y NACL son diferentes. Así funcionan:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Grupos de Seguridad</th>
<th>NACL</th>
</tr>
</thead>
<tbody>
<tr>
<td>Reglas</td>
<td>Solo "permitir"</td>
<td>"Permitir" y "denegar"</td>
</tr>
<tr>
<td>Estado</td>
<td>Con estado</td>
<td>Sin estado</td>
</tr>
<tr>
<td>Alcance</td>
<td>Una instancia</td>
<td>Una subred</td>
</tr>
<tr>
<td>Evaluación</td>
<td>Todas juntas</td>
<td>Por número</td>
</tr>
<tr>
<td>Por defecto</td>
<td>Bloquea todo</td>
<td>Bloquea todo</td>
</tr>
</tbody>
</table></figure>


<p><strong>¿Cómo configurar Grupos de Seguridad?</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Hacer</th>
<th>¿Por qué?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Abrir solo puertos necesarios</td>
<td>Menos riesgo</td>
</tr>
<tr>
<td>Usar IPs específicas</td>
<td>Control de acceso</td>
</tr>
<tr>
<td>No usar 0.0.0.0/0</td>
<td>Evitar acceso global</td>
</tr>
<tr>
<td>Revisar cada mes</td>
<td>Mantener seguridad</td>
</tr>
</tbody>
</table></figure>


<h3 id="capas-de-protecci%C3%B3n" tabindex="-1">Capas de Protección</h3>


<p>AWS usa un modelo de defensa en capas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Capa</th>
<th>Herramientas</th>
</tr>
</thead>
<tbody>
<tr>
<td>Borde</td>
<td>WAF, Shield</td>
</tr>
<tr>
<td>Red</td>
<td>VPC, NACL</td>
</tr>
<tr>
<td>Instancia</td>
<td>Grupos de Seguridad</td>
</tr>
<tr>
<td>App</td>
<td>IAM, KMS</td>
</tr>
</tbody>
</table></figure>


<p><strong>Lo que debes saber:</strong></p>


<ul>
<li>Grupos de Seguridad permiten salida por defecto</li>
<li>NACL necesitan reglas para entrada y salida</li>
<li>PrivateLink mantiene servicios privados</li>
<li>Usa varias capas de protección</li>
</ul>


<h3 id="vpcs-y-micro-segmentaci%C3%B3n" tabindex="-1">VPCs y Micro-segmentación</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Paso</th>
<th>Resultado</th>
</tr>
</thead>
<tbody>
<tr>
<td>Separar ambientes</td>
<td>Dev, QA, Prod independientes</td>
</tr>
<tr>
<td>Dividir funciones</td>
<td>Web, App, DB separadas</td>
</tr>
<tr>
<td>Controlar conexiones</td>
<td>Solo lo necesario</td>
</tr>
<tr>
<td>Ver tráfico</td>
<td>Detectar problemas</td>
</tr>
</tbody>
</table></figure>


<p><strong>Para implementar:</strong></p>


<ul>
<li>Documenta reglas</li>
<li>Revisa logs</li>
<li>Automatiza reglas</li>
<li>Lista recursos</li>
</ul>


<p>No confíes solo en la ubicación de red para la seguridad. Zero Trust requiere más controles.</p>


<h2 class="sb" id="seguridad-y-cifrado-de-datos" tabindex="-1">Seguridad y Cifrado de Datos</h2>


<p>El <a href="https://dondeaprendoaws.com/blog/cifrado-de-datos-con-aws-kms-guia-practica/">cifrado en AWS</a> funciona en dos niveles: cuando los datos viajan y cuando están guardados.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Estado</th>
<th>¿Qué es?</th>
<th>Herramientas</th>
</tr>
</thead>
<tbody>
<tr>
<td>En tránsito</td>
<td>Datos moviéndose</td>
<td>TLS, SSL, VPN</td>
</tr>
<tr>
<td>En reposo</td>
<td>Datos guardados</td>
<td>KMS, Secrets Manager</td>
</tr>
</tbody>
</table></figure>


<h3 id="aws-kms%3A-lo-b%C3%A1sico" tabindex="-1">AWS KMS: Lo Básico</h3>


<p>KMS te da 3 opciones para manejar tus claves:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo</th>
<th>¿Para qué sirve?</th>
<th>¿Quién controla?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Tus claves</td>
<td>Todo lo que quieras</td>
<td>Tú</td>
</tr>
<tr>
<td>Claves AWS</td>
<td>Servicios AWS específicos</td>
<td>AWS y tú</td>
</tr>
<tr>
<td>Claves internas AWS</td>
<td>Servicios base</td>
<td>Solo AWS</td>
</tr>
</tbody>
</table></figure>


<p>Para usar KMS bien:</p>


<ul>
<li>Cambia tus claves cada 3 meses</li>
<li>Define permisos por clave</li>
<li>Activa los logs</li>
<li>Protege S3 y DynamoDB</li>
</ul>


<h3 id="secrets-manager%3A-guarda-tus-secretos" tabindex="-1">Secrets Manager: Guarda Tus Secretos</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Secreto</th>
<th>¿Se actualiza solo?</th>
</tr>
</thead>
<tbody>
<tr>
<td>RDS</td>
<td>Sí</td>
</tr>
<tr>
<td>DocumentDB</td>
<td>Sí</td>
</tr>
<tr>
<td>Redshift</td>
<td>Sí</td>
</tr>
<tr>
<td>APIs</td>
<td>Como tú quieras</td>
</tr>
</tbody>
</table></figure>


<p>Lo que debes hacer:</p>


<ul>
<li>Saca las contraseñas de tu código</li>
<li>Pon 7+ días para recuperar</li>
<li>Usa AES-256</li>
<li>Conéctalo con CI/CD</li>
</ul>


<h3 id="encryptioncontext%3A-m%C3%A1s-control" tabindex="-1">EncryptionContext: Más Control</h3>


<figure class="table"><table>
<thead>
<tr>
<th>¿Qué te da?</th>
<th>¿Por qué importa?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Autenticación</td>
<td>Evita cambios no autorizados</td>
</tr>
<tr>
<td>Registro</td>
<td>Ve quién usa qué</td>
</tr>
<tr>
<td>Autorización</td>
<td>Controla accesos</td>
</tr>
</tbody>
</table></figure>


<p>Incluye siempre:</p>


<ul>
<li>URI del recurso</li>
<li>Ruta del archivo</li>
<li>Datos de tabla</li>
<li>ID único</li>
</ul>


<h3 id="organiza-tus-datos" tabindex="-1">Organiza Tus Datos</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo</th>
<th>¿Qué hacer?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Ultra secreto</td>
<td>Cifrar todo, acceso mínimo</td>
</tr>
<tr>
<td>Secreto</td>
<td>Cifrar guardado, registrar uso</td>
</tr>
<tr>
<td>Interno</td>
<td>Cifrar si quieres, control por rol</td>
</tr>
<tr>
<td>Público</td>
<td>Sin reglas extra</td>
</tr>
</tbody>
</table></figure>


<p>Para empezar:</p>


<ul>
<li>Divide por importancia</li>
<li>Pon reglas por grupo</li>
<li>Controla quién accede</li>
<li>Mira cómo se usan</li>
</ul>


<p>No basta con muros. En Zero Trust, cada dato necesita su propia protección.</p>


<h2 class="sb" id="herramientas-de-monitoreo-de-seguridad" tabindex="-1">Herramientas de Monitoreo de Seguridad</h2>


<p>AWS tiene 3 herramientas clave para ver lo que pasa en tu cuenta:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>¿Qué hace?</th>
<th>Rol en Zero Trust</th>
</tr>
</thead>
<tbody>
<tr>
<td>CloudWatch</td>
<td>Monitorea y alerta</td>
<td>Ve actividades raras</td>
</tr>
<tr>
<td>GuardDuty</td>
<td>Busca amenazas sin instalar nada</td>
<td>Encuentra patrones malos</td>
</tr>
<tr>
<td>Security Hub</td>
<td>Junta todo en un solo lugar</td>
<td>Agrupa problemas de seguridad</td>
</tr>
</tbody>
</table></figure>


<h3 id="cloudwatch%3A-tu-panel-de-control" tabindex="-1">CloudWatch: Tu Panel de Control</h3>


<p>CloudWatch es como tener cámaras de seguridad en tu cuenta AWS. Ve TODO:</p>


<ul>
<li>Lo que hacen tus servicios</li>
<li>Cómo funcionan tus apps</li>
<li>Quién hace qué en tu cuenta</li>
<li>Si algo va mal</li>
</ul>


<h3 id="guardduty%3A-tu-detective-digital" tabindex="-1">GuardDuty: Tu Detective Digital</h3>


<p>GuardDuty mira 3 cosas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Mira</th>
<th>Para encontrar</th>
</tr>
</thead>
<tbody>
<tr>
<td>Lo que pasa en tu cuenta</td>
<td>Acciones sospechosas</td>
</tr>
<tr>
<td>El tráfico de red</td>
<td>Conexiones raras</td>
</tr>
<tr>
<td>Búsquedas DNS</td>
<td>Sitios maliciosos</td>
</tr>
</tbody>
</table></figure>


<p>Para que GuardDuty funcione MEJOR:</p>


<ul>
<li>Configura alertas por SNS</li>
<li>Usa Lambda para responder automáticamente</li>
<li>Conéctalo con Security Hub</li>
<li>Mira los hallazgos cada día</li>
</ul>


<h3 id="security-hub%3A-todo-en-un-vistazo" tabindex="-1">Security Hub: Todo en Un Vistazo</h3>


<p>Security Hub ordena los problemas así:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Nivel</th>
<th>Significa</th>
</tr>
</thead>
<tbody>
<tr>
<td>CRÍTICO</td>
<td>¡Actúa YA!</td>
</tr>
<tr>
<td>ALTO</td>
<td>Actúa hoy</td>
</tr>
<tr>
<td>MEDIO</td>
<td>Míralo esta semana</td>
</tr>
<tr>
<td>BAJO</td>
<td>Cuando puedas</td>
</tr>
<tr>
<td>INFORMATIVO</td>
<td>Bueno saberlo</td>
</tr>
</tbody>
</table></figure>


<p>Para sacarle más jugo:</p>


<ul>
<li>Prende AWS Config en todas partes</li>
<li>Di cuándo atender cada tipo de problema</li>
<li>Automatiza respuestas con EventBridge</li>
<li>Junta todo en una cuenta principal</li>
</ul>


<h3 id="c%C3%B3mo-trabajan-juntas" tabindex="-1">Cómo Trabajan Juntas</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Una</th>
<th>Más otra</th>
<th>Te da</th>
</tr>
</thead>
<tbody>
<tr>
<td>GuardDuty</td>
<td>Security Hub</td>
<td>Todo en un lugar</td>
</tr>
<tr>
<td>CloudWatch</td>
<td>Lambda</td>
<td>Respuestas automáticas</td>
</tr>
<tr>
<td>Security Hub</td>
<td>SNS</td>
<td>Te avisa al momento</td>
</tr>
<tr>
<td>CloudTrail</td>
<td>GuardDuty</td>
<td>Ve más a fondo</td>
</tr>
</tbody>
</table></figure>


<p>En Zero Trust, estas herramientas son tus ojos y oídos. No solo ven problemas - te ayudan a resolverlos RÁPIDO.</p>


<h2 class="sb" id="gesti%C3%B3n-de-permisos" tabindex="-1">Gestión de Permisos</h2>


<p>Los permisos en AWS son la base de Zero Trust. Veamos cómo implementarlos correctamente.</p>


<h3 id="pol%C3%ADticas-iam-b%C3%A1sicas" tabindex="-1">Políticas IAM Básicas</h3>


<p>AWS ofrece 4 tipos principales de políticas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo</th>
<th>Uso</th>
<th>Caso Práctico</th>
</tr>
</thead>
<tbody>
<tr>
<td>Usuario</td>
<td>Permisos individuales</td>
<td>Acceso S3 específico</td>
</tr>
<tr>
<td>Grupo</td>
<td>Permisos compartidos</td>
<td>Equipo de desarrollo</td>
</tr>
<tr>
<td>Rol</td>
<td>Acceso por tiempo</td>
<td>Entre servicios AWS</td>
</tr>
<tr>
<td>Recurso</td>
<td>Control de servicios</td>
<td>Restricción de bucket</td>
</tr>
</tbody>
</table></figure>


<h3 id="permisos-m%C3%ADnimos" tabindex="-1">Permisos Mínimos</h3>


<p>¿Cómo dar <strong>solo</strong> los permisos necesarios?</p>


<p>Aquí está un ejemplo de política S3 minimalista:</p>


<pre><code class="language-json">{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::example-bucket/*"
    }
  ]
}
</code></pre>


<h3 id="control-de-acceso" tabindex="-1">Control de Acceso</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Función</th>
<th>Uso</th>
</tr>
</thead>
<tbody>
<tr>
<td>IAM Access Analyzer</td>
<td>Define permisos mínimos</td>
<td>Creación de políticas</td>
</tr>
<tr>
<td>Session Manager</td>
<td>Conexión sin puertos</td>
<td>Acceso EC2</td>
</tr>
<tr>
<td>AWS Organizations</td>
<td>Gestión multi-cuenta</td>
<td>Empresas</td>
</tr>
</tbody>
</table></figure>


<h3 id="tipos-de-acceso" tabindex="-1">Tipos de Acceso</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Acceso</th>
<th>Ventajas</th>
<th>Desventajas</th>
</tr>
</thead>
<tbody>
<tr>
<td>Temporal</td>
<td>Mayor seguridad</td>
<td>Requiere renovación</td>
</tr>
<tr>
<td>Permanente</td>
<td>Simplicidad</td>
<td>Riesgo elevado</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"El principio de mínimos privilegios reduce la superficie de ataque y mejora la seguridad en AWS" - Ricardo Broering Philippi</p>
</blockquote>


<h3 id="medidas-de-seguridad" tabindex="-1">Medidas de Seguridad</h3>


<ul>
<li>MFA en TODAS las cuentas</li>
<li>Revisión mensual de permisos</li>
<li>Eliminación de accesos sin uso</li>
<li>Monitoreo de actividad inusual</li>
<li>Logs con StrongDM</li>
</ul>


<h3 id="acceso-de-emergencia" tabindex="-1">Acceso de Emergencia</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Caso</th>
<th>Acción</th>
<th>Autorización</th>
</tr>
</thead>
<tbody>
<tr>
<td>Servicio caído</td>
<td>Rol temporal</td>
<td>Líder técnico</td>
</tr>
<tr>
<td>Ataque</td>
<td>Bloqueo</td>
<td>Equipo seguridad</td>
</tr>
<tr>
<td>Mantenimiento</td>
<td>Acceso planificado</td>
<td>Jefe proyecto</td>
</tr>
</tbody>
</table></figure>


<p>Todo acceso debe tener:</p>


<ul>
<li>Límite de tiempo</li>
<li>Registro</li>
<li>Aprobación previa</li>
<li>MFA activo</li>
</ul>


<h2 class="sb" id="seguridad-de-dispositivos" tabindex="-1">Seguridad de Dispositivos</h2>


<p>AWS Systems Manager es tu centro de control para proteger dispositivos en Zero Trust. Así funciona:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Función</th>
<th>Beneficio</th>
</tr>
</thead>
<tbody>
<tr>
<td>Patch Management</td>
<td>Actualiza sistemas</td>
<td>Elimina vulnerabilidades</td>
</tr>
<tr>
<td>Configuration Compliance</td>
<td>Revisa ajustes</td>
<td>Encuentra problemas</td>
</tr>
<tr>
<td>Session Manager</td>
<td>Conecta sin riesgos</td>
<td>No expone puertos</td>
</tr>
<tr>
<td>State Manager</td>
<td>Mantiene configuraciones</td>
<td>Todo siempre igual</td>
</tr>
</tbody>
</table></figure>


<h3 id="monitoreo-y-cumplimiento" tabindex="-1">Monitoreo y Cumplimiento</h3>


<p>AWS te da herramientas para ver TODO lo que pasa:</p>


<ul>
<li>Config: Mira si tus recursos cumplen las reglas</li>
<li>Security Hub: Panel central de seguridad</li>
<li>GuardDuty: Detecta amenazas al instante</li>
<li>CloudTrail: Registra cada acción</li>
</ul>


<h3 id="protecci%C3%B3n-de-endpoints" tabindex="-1">Protección de Endpoints</h3>


<p>Los datos de 2022 son claros: el phishing y el robo de credenciales causan la mayoría de los problemas. Aquí está el plan:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Medida</th>
<th>Qué hace</th>
<th>Por qué importa</th>
</tr>
</thead>
<tbody>
<tr>
<td>Verificación</td>
<td>Chequea identidad + dispositivo</td>
<td>Cada vez que alguien entra</td>
</tr>
<tr>
<td>Micro-segmentación</td>
<td>Separa recursos</td>
<td>Limita daños posibles</td>
</tr>
<tr>
<td>VPN + Seguridad</td>
<td>Protege conexiones</td>
<td>No importa dónde estés</td>
</tr>
<tr>
<td>Monitoreo</td>
<td>Vigila dispositivos</td>
<td>Sabe si algo anda mal</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"Si gastas más en café que en seguridad, ¡serás hackeado!" - Richard Clarke</p>
</blockquote>


<h3 id="lo-b%C3%A1sico-que-necesitas" tabindex="-1">Lo Básico que Necesitas</h3>


<ul>
<li>Verifica CADA acceso</li>
<li>Mira la salud de dispositivos</li>
<li>Actualiza todo automáticamente</li>
<li>Guarda registros de todo</li>
<li>Bloquea lo que no cumple</li>
</ul>


<h3 id="cumplimiento" tabindex="-1">Cumplimiento</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Norma</th>
<th>Qué cubre</th>
<th>Cómo se verifica</th>
</tr>
</thead>
<tbody>
<tr>
<td>SOC</td>
<td>Controles internos</td>
<td>Auditor de fuera</td>
</tr>
<tr>
<td>PCI</td>
<td>Datos de tarjetas</td>
<td>Cada año</td>
</tr>
<tr>
<td>FedRAMP</td>
<td>Gobierno</td>
<td>Todo el tiempo</td>
</tr>
<tr>
<td>HIPAA</td>
<td>Datos médicos</td>
<td>Por periodos</td>
</tr>
</tbody>
</table></figure>


<p>Con esto, cada dispositivo pasa por filtros Zero Trust antes de tocar recursos AWS.</p>


<h2 class="sb" id="haciendo-las-aplicaciones-seguras" tabindex="-1">Haciendo las Aplicaciones Seguras</h2>


<p>AWS te da todo lo que necesitas para proteger tus apps. Así funciona:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>¿Qué hace?</th>
<th>Costo</th>
</tr>
</thead>
<tbody>
<tr>
<td>API Gateway</td>
<td>Bloquea accesos no permitidos</td>
<td>Por uso</td>
</tr>
<tr>
<td><a href="https://dondeaprendoaws.com/blog/aws-web-application-firewall-waf/">AWS WAF</a></td>
<td>Para contra ataques web</td>
<td>Por regla</td>
</tr>
<tr>
<td>Shield Standard</td>
<td>Protege de DDoS básicos</td>
<td>Gratis</td>
</tr>
<tr>
<td>Shield Advanced</td>
<td>DDoS nivel pro</td>
<td>$3,000/mes</td>
</tr>
</tbody>
</table></figure>


<h3 id="waf%3A-tu-primera-l%C3%ADnea-de-defensa" tabindex="-1">WAF: Tu Primera Línea de Defensa</h3>


<p>WAF es como un guardia de seguridad para tu app. Mira esto:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Ataque</th>
<th>Cómo te protege</th>
<th>Resultado</th>
</tr>
</thead>
<tbody>
<tr>
<td>Inyección SQL</td>
<td>Detecta código malicioso</td>
<td>Lo bloquea al instante</td>
</tr>
<tr>
<td>XSS</td>
<td>Encuentra scripts malos</td>
<td>Los detiene en seco</td>
</tr>
<tr>
<td>IPs malas</td>
<td>Identifica atacantes</td>
<td>Les cierra la puerta</td>
</tr>
<tr>
<td>Sobrecarga</td>
<td>Controla peticiones</td>
<td>Mantiene todo fluido</td>
</tr>
</tbody>
</table></figure>


<h3 id="capas-que-necesitas" tabindex="-1">Capas que Necesitas</h3>


<p>Piensa en la seguridad como una cebolla - tiene capas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Dónde</th>
<th>Con qué</th>
<th>Para qué</th>
</tr>
</thead>
<tbody>
<tr>
<td>Entrada</td>
<td>CloudFront + WAF</td>
<td>Filtrar amenazas</td>
</tr>
<tr>
<td>APIs</td>
<td>Gateway + IAM</td>
<td>Verificar accesos</td>
</tr>
<tr>
<td>App</td>
<td>Balanceador + WAF</td>
<td>Proteger tráfico</td>
</tr>
<tr>
<td>Datos</td>
<td>Security Groups</td>
<td>Controlar conexiones</td>
</tr>
</tbody>
</table></figure>


<h3 id="ve-todo%2C-responde-r%C3%A1pido" tabindex="-1">Ve Todo, Responde Rápido</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Necesitas</th>
<th>Usa</th>
<th>Te da</th>
</tr>
</thead>
<tbody>
<tr>
<td>Ver amenazas</td>
<td>GuardDuty</td>
<td>Alertas automáticas</td>
</tr>
<tr>
<td>Medir todo</td>
<td>CloudWatch</td>
<td>Datos en vivo</td>
</tr>
<tr>
<td>Actuar ya</td>
<td>Lambda</td>
<td>Respuesta inmediata</td>
</tr>
<tr>
<td>Guardar info</td>
<td>CloudTrail</td>
<td>Historial completo</td>
</tr>
</tbody>
</table></figure>


<h3 id="ponlo-en-marcha" tabindex="-1">Ponlo en Marcha</h3>


<p>1. <strong>WAF Primero</strong></p>


<p>Configura las reglas básicas y activa los logs. No te compliques al inicio.</p>


<p>2. <strong>Asegura tus APIs</strong></p>


<p>Usa IAM y OAuth 2.0. Cifra TODO lo sensible.</p>


<p>3. <strong>Shield a Tu Medida</strong></p>


<p>Standard para empezar. Advanced si manejas datos críticos.</p>


<h3 id="lo-b%C3%A1sico-que-no-puede-faltar" tabindex="-1">Lo Básico que No Puede Faltar</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Haz esto</th>
<th>¿Por qué?</th>
<th>Con qué</th>
</tr>
</thead>
<tbody>
<tr>
<td>Cifra datos guardados</td>
<td>Evita fugas</td>
<td>KMS</td>
</tr>
<tr>
<td>Cifra datos viajando</td>
<td>Protege en ruta</td>
<td>TLS 1.2+</td>
</tr>
<tr>
<td>Verifica usuarios</td>
<td>Control total</td>
<td>OAuth</td>
</tr>
<tr>
<td>Maneja permisos</td>
<td>Todo en orden</td>
<td>IAM</td>
</tr>
</tbody>
</table></figure>


<p>Recuerda: En AWS, nada confía en nada. Cada parte debe probar que es quien dice ser.</p>


<h2 class="sb" id="configurando-zero-trust" tabindex="-1">Configurando Zero Trust</h2>


<p>Implementar Zero Trust en AWS es más simple de lo que parece. Aquí está el proceso:</p>


<p>1. <strong>Mapeo del Entorno</strong></p>


<p>Primero necesitas ver qué pasa en tu infraestructura. AWS te da estas herramientas:</p>


<ul>
<li>CloudWatch muestra el tráfico y uso</li>
<li>CloudTrail registra cada acción en las APIs</li>
<li>GuardDuty detecta amenazas</li>
<li>Security Hub centraliza todo en un panel</li>
</ul>


<p>2. <strong>Control de Identidades</strong></p>


<p>La base de Zero Trust está en saber QUIÉN hace QUÉ:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Control</th>
<th>Acción</th>
<th>¿Por qué?</th>
</tr>
</thead>
<tbody>
<tr>
<td>MFA</td>
<td>Activar para todos</td>
<td>Sin excepciones</td>
</tr>
<tr>
<td>Roles IAM</td>
<td>Asignar por tarea</td>
<td>Mínimo acceso</td>
</tr>
<tr>
<td>Claves</td>
<td>Rotar cada 90 días</td>
<td>Evita fugas</td>
</tr>
<tr>
<td>SSO</td>
<td>Un solo login</td>
<td>Control central</td>
</tr>
</tbody>
</table></figure>


<p>3. <strong>Protección de Red</strong></p>


<p>Tu red es tu primera línea de defensa:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Elemento</th>
<th>Qué Hacer</th>
<th>Resultado</th>
</tr>
</thead>
<tbody>
<tr>
<td>VPCs</td>
<td>Separar ambientes</td>
<td>Aislar recursos</td>
</tr>
<tr>
<td>Security Groups</td>
<td>Limitar puertos</td>
<td>Bloquear accesos</td>
</tr>
<tr>
<td>Network ACLs</td>
<td>Filtrar por subnet</td>
<td>Control de tráfico</td>
</tr>
<tr>
<td>AWS Firewall</td>
<td>Reglas específicas</td>
<td>Protección extra</td>
</tr>
</tbody>
</table></figure>


<p>4. <strong>Seguridad de Datos</strong></p>


<p>Tus datos necesitan protección:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo</th>
<th>Herramienta</th>
<th>¿Para qué?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Almacenados</td>
<td>KMS</td>
<td>Cifrado en reposo</td>
</tr>
<tr>
<td>En movimiento</td>
<td>TLS 1.2+</td>
<td>Cifrado en tránsito</td>
</tr>
<tr>
<td>Respaldos</td>
<td>S3 cifrado</td>
<td>Copias seguras</td>
</tr>
<tr>
<td>Secretos</td>
<td>Secrets Manager</td>
<td>Gestión de claves</td>
</tr>
</tbody>
</table></figure>


<p>5. <strong>Automatización</strong></p>


<p>La seguridad manual NO FUNCIONA. Automatiza todo:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Qué</th>
<th>Con</th>
<th>Beneficio</th>
</tr>
</thead>
<tbody>
<tr>
<td>Escaneos</td>
<td>Inspector</td>
<td>Ver fallas</td>
</tr>
<tr>
<td>Alertas</td>
<td>CloudWatch</td>
<td>Respuesta rápida</td>
</tr>
<tr>
<td>Acciones</td>
<td>Lambda</td>
<td>Sin humanos</td>
</tr>
<tr>
<td>Cambios</td>
<td>Config</td>
<td>Todo registrado</td>
</tr>
</tbody>
</table></figure>


<h3 id="lo-b%C3%A1sico-para-empezar" tabindex="-1">Lo Básico para Empezar</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Hacer</th>
<th>No Hacer</th>
<th>¿Por qué?</th>
</tr>
</thead>
<tbody>
<tr>
<td>MFA siempre</td>
<td>Compartir accesos</td>
<td>Evita ataques</td>
</tr>
<tr>
<td>Rotar claves</td>
<td>Accesos totales</td>
<td>Menos riesgo</td>
</tr>
<tr>
<td>Cifrar datos</td>
<td>Puertos abiertos</td>
<td>Más seguridad</td>
</tr>
<tr>
<td>Ver logs</td>
<td>Ignorar avisos</td>
<td>Detectar todo</td>
</tr>
</tbody>
</table></figure>


<p>En Zero Trust, la desconfianza es tu mejor amiga. Cada acceso se verifica, cada conexión se prueba, cada usuario se autentica. Sin excepciones.</p>


<h2 class="sb" id="consejos-para-el-%C3%A9xito" tabindex="-1">Consejos para el Éxito</h2>


<p>La implementación de Zero Trust en AWS requiere un enfoque estructurado. Aquí están los elementos clave:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Área</th>
<th>Acción</th>
<th>Resultado</th>
</tr>
</thead>
<tbody>
<tr>
<td>Identidad</td>
<td>MFA en todas las cuentas</td>
<td>Bloqueo de accesos no permitidos</td>
</tr>
<tr>
<td>Datos</td>
<td><a href="https://dondeaprendoaws.com/blog/seguridad-en-la-nube-aws-estrategias-clave/">Cifrado con AWS KMS</a></td>
<td>Protección de información</td>
</tr>
<tr>
<td>Monitoreo</td>
<td>GuardDuty + CloudTrail</td>
<td>Detección de amenazas</td>
</tr>
<tr>
<td>Accesos</td>
<td>AWS SSO</td>
<td>Control de usuarios</td>
</tr>
<tr>
<td>Red</td>
<td>VPCs y Security Groups</td>
<td>Aislamiento de recursos</td>
</tr>
</tbody>
</table></figure>


<h3 id="acciones-diarias" tabindex="-1">Acciones Diarias</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Hacer</th>
<th>No Hacer</th>
<th>Resultado</th>
</tr>
</thead>
<tbody>
<tr>
<td>Revisar CloudTrail</td>
<td>Exponer puertos</td>
<td>Identificar problemas</td>
</tr>
<tr>
<td>Rotar claves</td>
<td>Compartir accesos</td>
<td>Prevenir brechas</td>
</tr>
<tr>
<td>Usar grupos IAM</td>
<td>Permisos individuales</td>
<td>Mejor control</td>
</tr>
<tr>
<td>Cifrar S3</td>
<td>Buckets abiertos</td>
<td>Datos seguros</td>
</tr>
<tr>
<td>Usar CloudWatch</td>
<td>Ignorar alertas</td>
<td>Acción inmediata</td>
</tr>
</tbody>
</table></figure>


<h3 id="elementos-base" tabindex="-1">Elementos Base</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Config</th>
<th>Propósito</th>
</tr>
</thead>
<tbody>
<tr>
<td>AMIs</td>
<td>Solo privadas</td>
<td>Sin exposición</td>
</tr>
<tr>
<td>VPCs</td>
<td>IPs específicas</td>
<td>Control de red</td>
</tr>
<tr>
<td>NACLs</td>
<td>Reglas limitadas</td>
<td>Más defensa</td>
</tr>
<tr>
<td>CloudTrail</td>
<td>S3 cifrado</td>
<td>Logs seguros</td>
</tr>
<tr>
<td>IAM</td>
<td>Mínimos permisos</td>
<td>Menos riesgo</td>
</tr>
</tbody>
</table></figure>


<h3 id="herramientas-aws" tabindex="-1">Herramientas AWS</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Función</th>
<th>Ventaja</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS Config</td>
<td>Reglas</td>
<td>Cumplimiento</td>
</tr>
<tr>
<td>Systems Manager</td>
<td>Gestión</td>
<td>Mantenimiento</td>
</tr>
<tr>
<td>Security Hub</td>
<td>Monitoreo</td>
<td>Vista global</td>
</tr>
<tr>
<td>AWS Shield</td>
<td>Anti-DDoS</td>
<td>Protección</td>
</tr>
<tr>
<td>AWS WAF</td>
<td>Filtros web</td>
<td>Seguridad web</td>
</tr>
</tbody>
</table></figure>


<p>Automatiza todo. No dependas de acciones manuales - deja que AWS verifique cada acceso.</p>


<blockquote>
<p>"Zero Trust es un proceso continuo, no un destino final" - CloudDefense.AI</p>
</blockquote>


<p>En Zero Trust: verifica cada acceso, prueba cada conexión, autentica cada usuario. Sin excepciones.</p>


<h2 class="sb" id="soluci%C3%B3n-de-problemas-comunes" tabindex="-1">Solución de Problemas Comunes</h2>


<figure class="table"><table>
<thead>
<tr>
<th>Problema</th>
<th>Solución</th>
<th>Herramienta AWS</th>
</tr>
</thead>
<tbody>
<tr>
<td>Acceso denegado por políticas</td>
<td>Revisar mensajes de error y ajustar permisos</td>
<td>IAM Access Analyzer</td>
</tr>
<tr>
<td>Errores en políticas IAM</td>
<td>Usar editor visual para reestructurar</td>
<td>IAM Visual Editor</td>
</tr>
<tr>
<td>Falta de monitoreo</td>
<td>Implementar detección de amenazas</td>
<td>GuardDuty + CloudTrail</td>
</tr>
<tr>
<td>Control de dispositivos</td>
<td>Verificar estado y cumplimiento</td>
<td>Systems Manager</td>
</tr>
<tr>
<td>Brechas de seguridad</td>
<td>Activar respuesta automática</td>
<td>Security Hub</td>
</tr>
</tbody>
</table></figure>


<p>¿Te has encontrado con problemas de acceso en AWS? No estás solo. Vamos a ver cómo solucionarlos.</p>


<h3 id="errores-en-pol%C3%ADticas%3A-lo-que-debes-saber" tabindex="-1">Errores en Políticas: Lo Que Debes Saber</h3>


<p>Los errores más comunes que vemos (y cómo arreglarlos):</p>


<figure class="table"><table>
<thead>
<tr>
<th>Error</th>
<th>Causa</th>
<th>Corrección</th>
</tr>
</thead>
<tbody>
<tr>
<td>Permisos <code class="inline-code">ec2:Describe*</code> no funcionan</td>
<td>Recurso específico definido</td>
<td>Usar <code class="inline-code">*</code> en Resource</td>
</tr>
<tr>
<td>S3 inaccesible</td>
<td>Faltan acciones S3</td>
<td>Añadir acciones específicas</td>
</tr>
<tr>
<td>Acceso denegado sin razón clara</td>
<td>No hay <code class="inline-code">Allow</code> explícito</td>
<td>Revisar SCPs y límites</td>
</tr>
<tr>
<td>Condiciones no funcionan</td>
<td>Errores en clave-valor</td>
<td>Comprobar sintaxis</td>
</tr>
</tbody>
</table></figure>


<h3 id="respuesta-a-incidentes%3A-plan-de-acci%C3%B3n" tabindex="-1">Respuesta a Incidentes: Plan de Acción</h3>


<p>Aquí está el plan paso a paso:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Fase</th>
<th>Acciones</th>
<th>Servicios AWS</th>
</tr>
</thead>
<tbody>
<tr>
<td>Preparación</td>
<td>Lista de activos + tipos de incidentes</td>
<td>AWS Config</td>
</tr>
<tr>
<td>Detección</td>
<td>Monitoreo y alertas 24/7</td>
<td>CloudWatch</td>
</tr>
<tr>
<td>Análisis</td>
<td>Revisión de logs</td>
<td>CloudTrail</td>
</tr>
<tr>
<td>Contención</td>
<td>Aislar red y bloquear</td>
<td>Security Groups</td>
</tr>
<tr>
<td>Recuperación</td>
<td>Restaurar backups</td>
<td>AWS Backup</td>
</tr>
</tbody>
</table></figure>


<p>¿Sabías que una brecha de datos puede costar $3M+? (Datos de IBM)</p>


<h3 id="automatizaci%C3%B3n%3A-tu-primera-l%C3%ADnea-de-defensa" tabindex="-1">Automatización: Tu Primera Línea de Defensa</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Evento</th>
<th>Respuesta</th>
<th>Resultado</th>
</tr>
</thead>
<tbody>
<tr>
<td>Acceso sospechoso</td>
<td>Bloqueo de cuenta</td>
<td>Frena ataques</td>
</tr>
<tr>
<td>Actividad rara en red</td>
<td>Aislamiento</td>
<td>Reduce riesgos</td>
</tr>
<tr>
<td>Cambios no autorizados</td>
<td>Reversión</td>
<td>Mantiene control</td>
</tr>
<tr>
<td>Malware detectado</td>
<td>Cuarentena</td>
<td>Para la amenaza</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"La automatización Zero Trust reduce alertas falsas y acelera la detección" - IBM Security</p>
</blockquote>


<p><strong>Para proteger tu infraestructura:</strong></p>


<ul>
<li>Systems Manager para control central</li>
<li>Shield contra DDoS</li>
<li>WAF para filtrar tráfico web</li>
<li>Logs cifrados en S3</li>
<li>Alertas en Security Hub</li>
</ul>


<h2 class="sb" id="puntos-clave-para-recordar" tabindex="-1">Puntos Clave para Recordar</h2>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Medida de Éxito</th>
<th>Herramienta AWS</th>
</tr>
</thead>
<tbody>
<tr>
<td>Identidad</td>
<td>% usuarios con MFA activo</td>
<td>IAM</td>
</tr>
<tr>
<td>Acceso</td>
<td>Reducción de permisos excesivos</td>
<td>IAM Access Analyzer</td>
</tr>
<tr>
<td>Red</td>
<td>Segmentos aislados</td>
<td>Security Groups</td>
</tr>
<tr>
<td>Datos</td>
<td>% datos cifrados</td>
<td>KMS</td>
</tr>
<tr>
<td>Monitoreo</td>
<td>Tiempo de respuesta a alertas</td>
<td>GuardDuty</td>
</tr>
</tbody>
</table></figure>


<p>Las proyecciones muestran que el mercado de Zero Trust pasará de $27.4B USD en 2022 a $60.7B USD en 2027.</p>


<p><strong>Controles Básicos</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Control</th>
<th>Objetivo</th>
<th>Herramienta</th>
</tr>
</thead>
<tbody>
<tr>
<td>Acceso</td>
<td>Mínimo privilegio</td>
<td>IAM Roles</td>
</tr>
<tr>
<td>Dispositivos</td>
<td>Estado y cumplimiento</td>
<td>Systems Manager</td>
</tr>
<tr>
<td>Red</td>
<td>Aislamiento</td>
<td>Security Groups</td>
</tr>
<tr>
<td>Datos</td>
<td>Cifrado</td>
<td>KMS + S3</td>
</tr>
</tbody>
</table></figure>


<p><strong>Monitoreo Diario</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Tarea</th>
<th>Frecuencia</th>
<th>Prioridad</th>
</tr>
</thead>
<tbody>
<tr>
<td>Revisar logs de acceso</td>
<td>Diaria</td>
<td>Alta</td>
</tr>
<tr>
<td>Verificar alertas</td>
<td>Cada 4 horas</td>
<td>Alta</td>
</tr>
<tr>
<td>Actualizar políticas</td>
<td>Semanal</td>
<td>Media</td>
</tr>
<tr>
<td>Auditar permisos</td>
<td>Mensual</td>
<td>Media</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"El modelo Zero Trust asume que cualquier usuario o dispositivo que solicite acceso podría ser un riesgo y verifica cada intento de acceso" - AWS Security</p>
</blockquote>


<p><strong>Implementación por Fases</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Fase</th>
<th>Acción</th>
<th>Servicio AWS</th>
</tr>
</thead>
<tbody>
<tr>
<td>1. Inventario</td>
<td>Clasificar datos y apps</td>
<td>AWS Config</td>
</tr>
<tr>
<td>2. Identidad</td>
<td>Configurar MFA</td>
<td>IAM</td>
</tr>
<tr>
<td>3. Red</td>
<td>Microsegmentación</td>
<td>VPC</td>
</tr>
<tr>
<td>4. Monitoreo</td>
<td>Activar alertas</td>
<td>CloudWatch</td>
</tr>
</tbody>
</table></figure>


<p><strong>Métricas de Éxito</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo</th>
<th>Métrica</th>
<th>Meta</th>
</tr>
</thead>
<tbody>
<tr>
<td>Estratégica</td>
<td>Reducción de incidentes</td>
<td>-40%</td>
</tr>
<tr>
<td>Operativa</td>
<td>Tiempo de detección</td>
<td>&lt; 1 hora</td>
</tr>
<tr>
<td>Táctica</td>
<td>Cobertura MFA</td>
<td>100%</td>
</tr>
</tbody>
</table></figure>


<p><strong>Monitoreo de Seguridad</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>¿Qué Revisar?</th>
<th>¿Cuándo?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Identidad</td>
<td>Intentos fallidos</td>
<td>Cada hora</td>
</tr>
<tr>
<td>Permisos</td>
<td>Uso inusual</td>
<td>Diario</td>
</tr>
<tr>
<td>Red</td>
<td>Tráfico anómalo</td>
<td>Tiempo real</td>
</tr>
<tr>
<td>Datos</td>
<td>Accesos no autorizados</td>
<td>Continuo</td>
</tr>
</tbody>
</table></figure>


<h2 class="sb" id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="%C2%BFqu%C3%A9-elementos-forman-parte-de-zero-trust%3F" tabindex="-1">¿Qué elementos forman parte de Zero Trust?</h3>


<p>La gestión de identidades y accesos es el núcleo de Zero Trust. No se trata solo de implementar herramientas - es un cambio en cómo pensamos sobre la seguridad.</p>


<p>Aquí están los componentes básicos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Función</th>
<th>Servicio AWS</th>
</tr>
</thead>
<tbody>
<tr>
<td>SSO</td>
<td>Un solo inicio de sesión para todo</td>
<td>AWS SSO</td>
</tr>
<tr>
<td>MFA</td>
<td>Doble verificación de identidad</td>
<td>AWS IAM MFA</td>
</tr>
<tr>
<td>Control de Identidades</td>
<td>Manejo de permisos</td>
<td>AWS IAM</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"Zero Trust va más allá de la seguridad basada en redes. Se centra en controles de identidad que ofrecen mejor protección que los métodos tradicionales." - AWS Security Blog</p>
</blockquote>


<p><strong>AWS lo implementa así:</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Capa de Seguridad</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS IoT Core</td>
<td>TLS + Autenticación en dos vías</td>
</tr>
<tr>
<td>Auto Scaling</td>
<td>Roles específicos por servicio</td>
</tr>
<tr>
<td>API Requests</td>
<td>Firma SigV4</td>
</tr>
</tbody>
</table></figure>


<p>Los números lo dicen todo: el mercado de Zero Trust pasará de $27.4B en 2022 a $60.7B en 2027. Las empresas están adoptando este modelo porque funciona.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/">AWS Seguridad: Fundamentos Esenciales</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">Seguridad en AWS: Servicios Esenciales</a></li><li><a href="https://dondeaprendoaws.com/blog/seguridad-en-la-nube-aws-estrategias-clave/">Seguridad en la nube AWS: Estrategias clave</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li>
</ul>
</p>
