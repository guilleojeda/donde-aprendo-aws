---
title: "Gestionando Múltiples Cuentas de AWS con AWS Organizations"
description: "Descubre cómo gestionar múltiples cuentas de AWS de manera eficiente con AWS Organizations. Aprende a unificar cuentas, implementar políticas de seguridad, optimizar costos, cumplir con regulaciones y expandir sin complicaciones."
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T23:44:11.481Z"
cover: "/assets/blog/f49b26fc90f711fa88bba709.jpg"
coverAlt: "Thumbnail for: Gestionando Múltiples Cuentas de AWS con AWS Organizations"
ogImage: "/assets/blog/f49b26fc90f711fa88bba709.jpg"
related:
  - title: "Automatización de cumplimiento con AWS Config"
    url: "https://dondeaprendoaws.com/blog/automatizacion-de-cumplimiento-con-aws-config/"
    image: "/assets/blog/887b167cb63dec6854e043dc.jpg"
    imageAlt: ""
  - title: "Automatizar Alertas de Costos AWS en 5 Pasos"
    url: "https://dondeaprendoaws.com/blog/automatizar-alertas-de-costos-aws-en-5-pasos/"
    image: "/assets/blog/cd540f6b1441905ad2c6859c.webp"
    imageAlt: ""
  - title: "Integrar Amazon Polly en 5 pasos: Texto a voz realista"
    url: "https://dondeaprendoaws.com/blog/integrar-amazon-polly-en-5-pasos-texto-a-voz-realista/"
    image: "/assets/blog/35cbdc26cad1c09b7dd2fc81.jpg"
    imageAlt: ""
---

<p>Si manejas varias cuentas de AWS y buscas simplificar su administración, AWS Organizations es tu mejor aliado. Este servicio permite:</p>
<ul><li><strong>Unificar cuentas bajo una sola organización:</strong> Agrupa todas tus cuentas de AWS, facilitando su gestión centralizada.</li><li><strong>Implementar políticas de seguridad a nivel de organización:</strong> Asegura todas tus cuentas aplicando reglas uniformes.</li><li><strong>Optimizar costos con facturación consolidada:</strong> Recibe una única factura para todas tus cuentas y aprovecha descuentos por volumen.</li><li><strong>Cumplir con regulaciones fácilmente:</strong> Establece políticas que ayuden a todas tus cuentas a adherirse a las normativas relevantes.</li><li><strong>Expansión sin complicaciones:</strong> Añade nuevas cuentas o servicios rápidamente y sin problemas.</li></ul>
<p>Este artículo te guiará paso a paso en el proceso de configuración de AWS Organizations, desde la creación de tu organización hasta la implementación de <a href="https://aws.amazon.com/single-sign-on/">AWS Single Sign-On</a> (SSO) para un acceso simplificado. Además, te ofrecemos consejos para mantener tu infraestructura segura y eficiente. Si manejas múltiples cuentas de AWS, este artículo es esencial para ti.</p>
<h3 id="beneficios-de-aws-organizations">Beneficios de <a href="https://aws.amazon.com/organizations">AWS Organizations</a></h3>
<p><img alt="AWS Organizations" src="/assets/blog/0d49b4c62393ce0cdc6d2c3d.jpg"/></p>
<p>Los beneficios principales de usar AWS Organizations incluyen:</p>
<ul><li><strong>Administración centralizada</strong>: Te permite controlar todas tus cuentas desde un solo lugar. Esto hace que todo sea más sencillo y te ahorra tiempo.</li><li><strong>Mayor seguridad</strong>: Puedes poner reglas de seguridad que apliquen a todas las cuentas, manteniendo todo más seguro.</li><li><strong>Uso compartido de recursos</strong>: Te permite compartir ciertos recursos entre cuentas, lo que puede ahorrar dinero y esfuerzo.</li><li><strong>Facturación consolidada</strong>: Solo recibes una factura para todas las cuentas, lo que te da una mejor idea de tus gastos. Además, puedes acceder a descuentos por comprar en grande.</li><li><strong>Cumplimiento normativo</strong>: Te ayuda a mantener todas las cuentas siguiendo las mismas reglas, lo que facilita cumplir con las leyes y regulaciones.</li></ul>
<p>En resumen, AWS Organizations es una herramienta clave para manejar de manera eficiente tus cuentas de AWS cuando tienes varias.</p>
<h2 id="prerrequisitos">Prerrequisitos</h2>
<ul><li>Cuenta de AWS existente</li></ul>
<p>Para empezar con AWS Organizations, necesitas tener una cuenta de AWS. Esta cuenta será la principal y desde ella podrás controlar las demás cuentas que agregues.</p>
<p>Es importante que tengas acceso completo a esta cuenta, porque vas a necesitar poder hacer cambios y ajustes para configurar tu organización.</p>
<h2 id="paso-1%3A-crear-la-organizaci%C3%B3n">Paso 1: Crear la organización</h2>
<p>Para comenzar con AWS Organizations, lo primero es crear tu organización. Esto lo haces desde un lugar en la web de AWS llamado consola de administración de AWS Organizations.</p>
<h3 id="1.-ingresar-a-la-consola-de-aws-organizations">1. Ingresar a la consola de AWS Organizations</h3>
<ul><li>Entra a la <a href="https://console.aws.amazon.com/">consola de administración de AWS</a> usando tu cuenta de administrador.</li><li>Busca en la lista de Servicios y elige "Organizations".</li><li>Ahora estarás en la consola de administración de <a href="https://aws.amazon.com/organizations">AWS Organizations</a>.</li></ul>
<h3 id="2.-hacer-clic-en-%22create-organization%22">2. Hacer clic en "Create Organization"</h3>
<ul><li>En la pantalla principal de AWS Organizations, busca y pulsa el botón azul que dice "Create Organization".</li><li>Te aparecerá una ventana pidiéndote confirmar la acción.</li></ul>
<h3 id="3.-elegir-caracter%C3%ADsticas-(opcional)">3. Elegir características (opcional)</h3>
<ul><li>En esta ventana, puedes activar "Enable all features" si piensas usar políticas de control de servicio (SCPs) para una gestión más detallada.</li><li>Si no necesitas esto, puedes dejarlo sin activar para mantener las cosas simples.</li><li>Dale clic a "Create organization".</li></ul>
<h3 id="4.-revisar-y-confirmar">4. Revisar y confirmar</h3>
<ul><li>Antes de terminar, revisa que toda la información de tu nueva organización esté correcta.</li><li>Si todo está bien, confirma haciendo clic en "Confirm".</li></ul>
<p>Ahora que ya creaste la organización, puedes agregar cuentas de AWS que ya tengas o crear cuentas nuevas dentro de tu organización.</p>
<h2 id="paso-2%3A-agregar-cuentas-de-aws">Paso 2: Agregar cuentas de AWS</h2>
<p>Una vez que tienes tu organización lista, puedes añadir cuentas que ya existen o crear nuevas cuentas para incluirlas.</p>
<h3 id="invitar-cuenta-existente">Invitar cuenta existente</h3>
<p>Para agregar una cuenta que ya tienes a tu organización en AWS Organizations, sigue estos pasos sencillos:</p>
<ul><li>En la consola de AWS Organizations, busca la sección que dice "Cuentas" a la izquierda.</li><li>Dale clic en "Invitar cuenta".</li><li>Escribe el número de identificación o el alias de la cuenta que quieres agregar.</li><li>Revisa que todo esté correcto y presiona "Enviar invitación".</li><li>El dueño de la cuenta recibirá un correo con un enlace para unirse.</li><li>Cuando acepte la invitación, su cuenta se unirá a tu organización.</li></ul>
<h3 id="crear-cuenta-nueva">Crear cuenta nueva</h3>
<p>Si prefieres empezar con una cuenta nueva dentro de tu organización de AWS Organizations:</p>
<ul><li>Ve a "Cuentas" y selecciona "Agregar cuenta".</li><li>Ponle un nombre y un alias a esta cuenta nueva.</li><li>Elige dónde quieres que esté esta cuenta, seleccionando una unidad organizacional (OU).</li><li>Checa los permisos y ajustes de la cuenta.</li><li>Clic en "Crear cuenta".</li></ul>
<p>Tu nueva cuenta estará lista y se agregará de forma automática a tu organización con las opciones que elegiste.</p>
<h2 id="paso-3%3A-usar-aws-sso-para-simplificar-el-acceso-a-aws">Paso 3: Usar AWS SSO para Simplificar el Acceso a AWS</h2>
<h3 id="por-qu%C3%A9-es-bueno-usar-sso">Por qué es bueno usar SSO</h3>
<p>AWS Single Sign-On (SSO) te permite entrar a todas tus cuentas de AWS desde un solo lugar. Así, no necesitas recordar un montón de contraseñas diferentes para cada cuenta.</p>
<p>Algunos beneficios de usar SSO son:</p>
<ul><li>Solo necesitas recordar una contraseña para acceder a todo</li><li>Se acabó tener que manejar muchas contraseñas o claves</li><li>Puedes poner una capa extra de seguridad con la autenticación de dos factores de forma fácil</li><li>Es más sencillo darle a la gente los permisos que necesita sin complicaciones</li><li>Puedes ver fácilmente quién está accediendo a qué</li><li>Mejora la seguridad porque simplifica mucho la gestión</li></ul>
<p>En pocas palabras, AWS SSO te hace la vida más fácil cuando trabajas con varias cuentas de AWS.</p>
<h3 id="c%C3%B3mo-configurar-sso-en-aws">Cómo configurar SSO en AWS</h3>
<p>Para poner a funcionar SSO en tu organización de AWS, sigue estos pasos:</p>
<ul><li>Activa AWS SSO desde la consola. Esto crea un lugar central donde se manejan los accesos.</li><li>Escoge un proveedor de identidades. Puedes usar el que viene con AWS SSO, Active Directory, o cualquier otro que sea compatible con SAML 2.0.</li><li>Crea grupos y usuarios dentro de este sistema central. Usar grupos para dar permisos es una buena idea.</li><li>Conecta tus cuentas de AWS con este sistema usando AWS Organizations.</li><li>Define grupos de permisos según los roles y el acceso que quieras dar.</li><li>Asigna estos grupos de usuarios a los permisos sobre las cuentas que elijas. Esto define qué pueden hacer en cada cuenta.</li><li>Ahora, los usuarios pueden entrar una sola vez al portal de SSO y desde ahí acceder a todas las cuentas y recursos que les permitas.</li></ul>
<p>Configurar SSO toma un poco de tiempo al principio, pero después hace mucho más fácil y seguro el manejo de accesos en ambientes con múltiples cuentas.</p>
<h2 id="mejores-pr%C3%A1cticas-para-aws-organizations">Mejores prácticas para AWS Organizations</h2>
<p>Aquí tienes algunos consejos para sacarle el máximo partido a AWS Organizations y manejar tu infraestructura de manera segura y eficaz.</p>
<h3 id="usa-la-regla-del-m%C3%ADnimo-acceso-necesario">Usa la regla del mínimo acceso necesario</h3>
<p>Dale a los usuarios y a las cuentas solo los permisos que realmente necesitan.</p>
<ul><li>Solo permite acceso a lo que necesitan usar</li><li>Revisa de vez en cuando los permisos que has dado</li><li>Si ya no necesitan acceso a algo, quítaselo</li></ul>
<p>Haciendo esto, reduces los riesgos de seguridad y los daños que podrían ocurrir si hay un problema de seguridad.</p>
<h3 id="mant%C3%A9n-un-ojo-en-los-cambios">Mantén un ojo en los cambios</h3>
<p>Activa CloudTrail para llevar un registro de todo lo que se hace en tu organización.</p>
<ul><li>CloudTrail te ayuda a revisar qué acciones han hecho los usuarios o servicios</li><li>Es importante revisar estos registros a menudo para buscar cosas raras</li><li>Puedes conectar CloudTrail con otros servicios como CloudWatch para que te avisen si algo extraño pasa</li></ul>
<p>Es crucial saber qué cambios se están haciendo para poder mantener todo bajo control.</p>
<h3 id="haz-copias-de-seguridad-de-lo-m%C3%A1s-importante">Haz copias de seguridad de lo más importante</h3>
<p>Es buena idea hacer copias de seguridad de configuraciones importantes como las de red y las políticas de IAM.</p>
<ul><li>Las copias de seguridad te pueden salvar si algo se daña</li><li>Lo mejor es que estas copias se hagan solas, automáticamente</li><li>Checa que las copias estén bien de vez en cuando</li></ul>
<p>Tener una copia de seguridad reciente es clave para poder recuperarte rápido si pasa algo malo o si se cambia algo sin querer.</p>
<h2 id="conclusi%C3%B3n">Conclusión</h2>
<p>AWS Organizations es una herramienta muy útil cuando tienes que manejar varias cuentas de AWS. Aquí te dejamos lo más importante que te ofrece:</p>
<ul><li><strong>Manejo sencillo</strong>: Te permite controlar todas tus cuentas desde un solo lugar. Esto hace que organizar y supervisar sea mucho más fácil.</li><li><strong>Más seguridad</strong>: Puedes poner reglas de seguridad que valgan para todas tus cuentas. Esto ayuda a que todo esté más protegido.</li><li><strong>Ahorrar dinero</strong>: Al juntar las facturas y compartir recursos entre cuentas, puedes gastar menos.</li><li><strong>Seguir las reglas</strong>: Es más fácil asegurarte de que todas tus cuentas sigan las leyes y normas necesarias.</li><li><strong>Crecer sin problemas</strong>: Añadir nuevas cuentas o servicios es fácil, lo que te permite expandirte sin complicaciones.</li></ul>
<h3 id="lo-b%C3%A1sico-para-configurar-bien-aws-organizations">Lo básico para configurar bien AWS Organizations</h3>
<p>Para sacarle el máximo partido a AWS Organizations, recuerda hacer lo siguiente:</p>
<ul><li>Comienza creando tu organización y decide si necesitas todas las funciones que ofrece.</li><li>Invita a las cuentas que ya tienes o crea cuentas nuevas dentro de tu organización.</li><li>Organiza tus cuentas en grupos (o unidades organizativas) que tengan sentido para tu negocio.</li><li>Usa políticas de control de servicio (SCP) para establecer qué se puede y qué no se puede hacer en tus cuentas.</li><li>Configura <a href="https://aws.amazon.com/single-sign-on/">AWS Single Sign-On</a> (SSO) para hacer más fácil el acceso a las cuentas.</li></ul>
<p>Siguiendo estos consejos desde el principio, te será mucho más fácil manejar y expandir tu entorno de AWS con varias cuentas.</p>
<h2 id="preguntas-relacionadas">Preguntas relacionadas</h2>
<h4 id="%C2%BFqu%C3%A9-servicio-te-permite-juntar-y-manejar-varias-cuentas-de-aws-en-un-solo-lugar%3F">¿Qué servicio te permite juntar y manejar varias cuentas de AWS en un solo lugar?</h4>
<p>AWS Organizations es un servicio para manejar cuentas que te deja agrupar varias cuentas de AWS en una organización que tú controlas desde un centro. Esto hace más fácil manejar varias cuentas porque te permite poner reglas y controles de manera central.</p>
<h4 id="%C2%BFqu%C3%A9-servicio-de-aws-te-da-una-manera-r%C3%A1pida-y-autom%C3%A1tica-de-crear-y-manejar-cuentas-de-aws%3F">¿Qué servicio de AWS te da una manera rápida y automática de crear y manejar cuentas de AWS?</h4>
<p>AWS Control Tower te ofrece una manera rápida y automática de configurar y manejar cuentas de AWS siguiendo las mejores prácticas. Te permite crear entornos multi-cuenta estandarizados, conocidos como "Landing Zones", de forma sencilla.</p>
<h4 id="%C2%BFqu%C3%A9-es-una-cuenta-de-aws%3F">¿Qué es una cuenta de AWS?</h4>
<p>Una cuenta de AWS es una identidad con permiso para usar los servicios de AWS. Cada cuenta tiene su propia información de facturación y pago. AWS Organizations te permite crear y manejar varias cuentas de AWS desde un solo lugar central.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/nube-aws-guia-de-inicio-rapido/">Nube AWS: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores prácticas AWS para DevOps</a></li><li><a href="https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/">Análisis de Costos de AWS con Cost Explorer</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li></ul>
