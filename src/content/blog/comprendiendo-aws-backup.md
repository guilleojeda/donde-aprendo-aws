---
title: "Comprendiendo AWS Backup"
description: "Descubre cómo utilizar AWS Backup para proteger tus datos en la nube de forma automatizada y eficiente. Aprende sobre sus funciones clave y cómo optimizar su uso."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:55:54.461Z"
cover: "/assets/blog/25448721c535fa1737e8eeba.jpg"
coverAlt: "Thumbnail for: Comprendiendo AWS Backup"
ogImage: "/assets/blog/25448721c535fa1737e8eeba.jpg"
related:
  - title: "¿Qué es AWS Lambda? Preguntas y Respuestas"
    url: "https://dondeaprendoaws.com/blog/que-es-aws-lambda-preguntas-y-respuestas/"
    image: "/assets/blog/70579f832030c8f349b01339.jpg"
    imageAlt: ""
  - title: "7 Estrategias para Reducir Costos en AWS Fargate"
    url: "https://dondeaprendoaws.com/blog/7-estrategias-para-reducir-costos-en-aws-fargate/"
    image: "/assets/blog/9d9e21deaf95138036c3d24d.jpg"
    imageAlt: ""
  - title: "AWS Fundamentos: Guía de Inicio Rápido"
    url: "https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/"
    image: "/assets/blog/945b48235c5e1f4c1d3cc3ae.jpg"
    imageAlt: ""
---

<p>AWS Backup es una herramienta esencial para asegurar tus datos en la nube, permitiéndote automatizar, organizar y proteger tus copias de seguridad de manera eficiente. Aquí están las claves que necesitas saber:</p>


<ul>
<li><strong>Automatización y simplicidad</strong>: Configura copias de seguridad automáticas para varios servicios AWS.</li>
<li><strong>Protección contra ransomware</strong>: Tus backups son inmutables y pueden almacenarse en locaciones separadas.</li>
<li><strong>Cumplimiento de normativas</strong>: Genera informes detallados para auditorías y cumplimiento normativo.</li>
<li><strong>Versatilidad</strong>: Funciona tanto para entornos en la nube como híbridos, integrándose con servicios como EC2, RDS, y más.</li>
</ul>


<p>Ya sea que estés comenzando o buscando optimizar tu estrategia de backup, AWS Backup ofrece una solución centralizada y coste-eficiente para proteger tus datos. Además, con políticas de retención personalizables y opciones de almacenamiento eficientes, puedes ajustar tus backups según tus necesidades específicas, garantizando seguridad y accesibilidad.</p>


<h3 id="cuenta-de-aws" tabindex="-1">Cuenta de AWS</h3>


<p>Primero, necesitas una cuenta de AWS. Si todavía no tienes una, es fácil crearla visitando <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">aws.amazon.com</a> y siguiendo los pasos para registrarte.</p>


<p>Cuando ya tengas tu cuenta, asegúrate de que todo esté listo para usar AWS Backup. Esto significa que debes tener acceso y permisos configurados correctamente.</p>


<h3 id="conocimiento-b%C3%A1sico-de-servicios-y-recursos-de-aws" tabindex="-1">Conocimiento básico de servicios y recursos de AWS</h3>


<p>Para que AWS Backup te sea realmente útil, es bueno saber un poco sobre los servicios de AWS que piensas respaldar, como:</p>


<ul>
<li>Amazon Elastic Compute Cloud (Amazon EC2)</li>
<li>Amazon Elastic Block Store (Amazon EBS)</li>
<li>Amazon Relational Database Service (Amazon RDS)</li>
<li>Amazon DynamoDB</li>
<li>Amazon Elastic File System (Amazon EFS)</li>
<li>Amazon FSx</li>
</ul>


<p>Comprender cómo funcionan estos servicios y qué recursos usan (como instancias EC2 o volúmenes EBS) te ayudará a configurar tus respaldos y restauraciones de forma efectiva.</p>


<p>AWS ofrece muchos recursos y guías para aprender sobre sus servicios. Antes de meterte de lleno en AWS Backup, puede ser útil revisar esta información.</p>


<p>En resumen, para usar AWS Backup de la mejor manera, necesitas tener una cuenta de AWS y conocer un poco sobre los servicios que quieres respaldar.</p>


<h2 id="primeros-pasos-con-aws-backup" tabindex="-1">Primeros pasos con AWS Backup</h2>


<h3 id="creaci%C3%B3n-de-una-cuenta-y-suscripci%C3%B3n-al-servicio" tabindex="-1">Creación de una cuenta y suscripción al servicio</h3>


<p>Para empezar con AWS Backup, lo primero es tener una cuenta de AWS. Si no tienes una, puedes crearla gratis en <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">aws.amazon.com</a>.</p>


<p>Una vez que tengas tu cuenta, puedes activar AWS Backup así:</p>


<ul>
<li>Entra a la consola de AWS con tu cuenta.</li>
<li>Busca "Backup" en el menú de Servicios y selecciónalo.</li>
<li>En la página de AWS Backup, elige "Get started".</li>
<li>Activa AWS Backup seleccionando "Enable".</li>
<li>Escoge qué servicios de AWS quieres que AWS Backup cuide por ti. Algunas opciones son EC2, EBS, RDS, DynamoDB y EFS.</li>
<li>Confirma tu elección para terminar.</li>
</ul>


<p>Ahora tienes AWS Backup listo para usar.</p>


<h3 id="configuraci%C3%B3n-de-una-copia-de-seguridad-bajo-demanda" tabindex="-1">Configuración de una copia de seguridad bajo demanda</h3>


<p>Para hacer una copia de seguridad cuando tú quieras, sigue estos pasos:</p>


<ul>
<li>Ve a "Backup plans" en AWS Backup.</li>
<li>Elige "Create backup plan".</li>
<li>Ponle un nombre y elige "On demand only".</li>
<li>Decide qué recursos quieres respaldar, como una instancia EC2 o un volumen EBS.</li>
<li>Confirma tu elección.</li>
</ul>


<p>Ahora, cuando necesites hacer una copia de seguridad manual, simplemente ve a "Backups" y selecciona "Create backup".</p>


<h3 id="programaci%C3%B3n-de-copias-de-seguridad-autom%C3%A1ticas" tabindex="-1">Programación de copias de seguridad automáticas</h3>


<p>Si prefieres que AWS Backup haga copias de seguridad automáticamente, haz lo siguiente:</p>


<ul>
<li>Crea un plan de copias de seguridad como antes.</li>
<li>Esta vez, escoge "Scheduled" en lugar de "On demand only".</li>
<li>Decide con qué frecuencia quieres las copias de seguridad, como diario o semanal.</li>
<li>Selecciona los recursos a respaldar.</li>
<li>Guarda tu plan.</li>
</ul>


<p>Con esto, AWS Backup hará copias de seguridad de tus recursos automáticamente según tu programación.</p>


<p>También puedes activar copias de seguridad automáticas para Amazon EFS al crear un sistema de archivos, lo que te da respaldos automáticos diarios desde el principio.</p>


<h2 id="caracter%C3%ADsticas-clave-de-aws-backup" tabindex="-1">Características clave de AWS Backup</h2>


<h3 id="centralizaci%C3%B3n-y-automatizaci%C3%B3n" tabindex="-1">Centralización y automatización</h3>


<p>AWS Backup te permite manejar todas tus copias de seguridad desde un solo lugar. Esto significa que puedes:</p>


<ul>
<li>Crear reglas para tus copias de seguridad, como cuándo y cada cuánto tiempo se hacen.</li>
<li>Aplicar estas reglas a tus datos en AWS, haciendo que las copias se realicen automáticamente.</li>
<li>Ver y controlar todas tus copias de seguridad desde un único lugar.</li>
</ul>


<p>Gracias a estas funciones, AWS Backup hace mucho más fácil proteger tus datos sin tener que hacerlo todo manualmente.</p>


<h3 id="protecci%C3%B3n-contra-ransomware" tabindex="-1">Protección contra ransomware</h3>


<p>AWS Backup te ayuda a proteger tus datos de ataques de ransomware de varias maneras:</p>


<ul>
<li><strong>Guarda las copias de seguridad separadas de tus datos originales:</strong> Esto significa que si un ataque de ransomware afecta tus datos, tus copias de seguridad están a salvo en otro lugar.</li>
<li><strong>Copia de seguridad inmutable:</strong> Puedes configurar tus copias de seguridad para que nadie pueda cambiarlas ni borrarlas, ni siquiera si tienen permiso.</li>
<li><strong>Copias en diferentes lugares:</strong> AWS Backup puede hacer copias de tus datos en otras regiones o cuentas de AWS, lo que ayuda a proteger contra ataques que afectan solo una ubicación.</li>
</ul>


<p>Estas herramientas te dan más seguridad de que podrás recuperar tus datos rápidamente si algo malo pasa.</p>


<h3 id="cumplimiento-de-la-protecci%C3%B3n-de-datos" tabindex="-1">Cumplimiento de la protección de datos</h3>


<p>AWS Backup tiene una herramienta llamada AWS Backup Audit Manager que te ayuda a:</p>


<ul>
<li><strong>Revisar automáticamente tus copias de seguridad:</strong> Puedes chequear que tus copias de seguridad cumplen con las reglas y normas que necesitas seguir.</li>
<li><strong>Informes detallados:</strong> Genera reportes sobre cómo estás protegiendo tus datos, lo que te puede ayudar a mostrar que estás siguiendo las normas.</li>
<li><strong>Verificar en tiempo real:</strong> Puedes ver información actual sobre tus copias de seguridad para asegurarte de que todo está como debe estar.</li>
</ul>


<p>Con estas características, AWS Backup te facilita mucho demostrar que estás protegiendo bien tus datos, algo muy útil cuando tienes que pasar por auditorías o cumplir con regulaciones.</p>


<h2 id="beneficios-de-aws-backup" tabindex="-1">Beneficios de AWS Backup</h2>


<p>AWS Backup te ofrece varias ventajas importantes que hacen más fácil proteger tus datos en AWS y te ayudan a estar preparado en caso de algún problema grande, como un desastre:</p>


<ul>
<li><strong>Protección de datos fácil y en un solo lugar</strong>: Con AWS Backup, puedes controlar las copias de seguridad de tus cosas importantes de AWS desde un solo sitio. Además, te permite programar automáticamente estas copias de seguridad, para que no tengas que hacerlo a mano cada vez.</li>
<li><strong>Ahorro de dinero</strong>: Al tener todo en un solo lugar y hacer las cosas automáticamente, AWS Backup te ayuda a ahorrar porque no necesitas soluciones complicadas y caras. También ayuda a usar el espacio de almacenamiento de manera más eficiente, lo que también ahorra dinero.</li>
<li><strong>Cumplir con las reglas</strong>: AWS Backup te da informes y datos que te pueden ayudar a mostrar que estás siguiendo las reglas necesarias para proteger tus datos.</li>
<li><strong>Estar listo para cualquier problema</strong>: Puedes hacer copias de tus datos en diferentes lugares y cuentas para estar más seguro en caso de que algo malo pase en un solo lugar.</li>
<li><strong>Protección contra ataques de ransomware</strong>: Tener copias de seguridad que no se pueden cambiar y que están separadas de tus datos originales te ayuda a protegerte contra ataques y a recuperar tus datos más fácilmente.</li>
<li><strong>Funciona con muchos servicios de AWS y también con sistemas fuera de la nube</strong>: AWS Backup funciona bien con cosas como EC2, RDS, DynamoDB y también con VMware que tienes fuera de la nube.</li>
</ul>


<p>En resumen, AWS Backup te ayuda a proteger tus datos de manera sencilla, te ahorra dinero, te ayuda a cumplir con las reglas y a estar preparado para problemas grandes, trabajando bien tanto con cosas en la nube como fuera de ella.</p>


<h2 id="casos-de-uso-de-aws-backup" tabindex="-1">Casos de uso de AWS Backup</h2>


<h3 id="respaldo-nativo-en-la-nube" tabindex="-1">Respaldo nativo en la nube</h3>


<p>AWS Backup te permite hacer copias de seguridad automáticas de cosas como tus instancias de Amazon EC2, volúmenes de Amazon EBS, bases de datos de Amazon RDS, tablas de Amazon DynamoDB, sistemas de archivos de Amazon EFS y recursos de Amazon FSx. Esto significa que puedes programar copias de seguridad automáticas para estos servicios sin tener que preocuparte por manejar software o equipos extra.</p>


<p>Algunas ventajas de usar AWS Backup para esto son:</p>


<ul>
<li><strong>Automatización</strong>: Configura copias de seguridad automáticas sin tener que hacerlo manualmente.</li>
<li><strong>Eficiencia</strong>: Usa copias de seguridad incrementales para ahorrar espacio y tiempo.</li>
<li><strong>Escalabilidad</strong>: Fácilmente respalda cientos de recursos.</li>
<li><strong>Centralización</strong>: Maneja todas tus copias de seguridad desde un solo lugar.</li>
<li><strong>Análisis</strong>: Obtén detalles sobre tus trabajos de copia de seguridad.</li>
<li><strong>Cumplimiento</strong>: Te ayuda a seguir las reglas que aplican a tus datos.</li>
</ul>


<h3 id="protecci%C3%B3n-de-datos-h%C3%ADbridos" tabindex="-1">Protección de datos híbridos</h3>


<p>AWS Backup también te ayuda a manejar la protección de datos en entornos mixtos, donde tienes cosas tanto en la nube como en tu lugar de trabajo. Al usar AWS Backup con herramientas como AWS Storage Gateway o VMware Cloud on AWS, puedes hacer copias de seguridad de servidores físicos, máquinas virtuales y sistemas de almacenamiento local.</p>


<p>Los beneficios incluyen:</p>


<ul>
<li><strong>Visibilidad unificada</strong>: Ve todas tus copias de seguridad, tanto en la nube como en tu lugar de trabajo, en un solo lugar.</li>
<li><strong>Políticas consistentes</strong>: Aplica las mismas reglas de copias de seguridad a todos tus datos, sin importar dónde estén.</li>
<li><strong>Administración centralizada</strong>: Desde la consola de AWS, maneja, analiza y mejora todas tus copias de seguridad.</li>
<li><strong>Eficiencia de costos</strong>: Ahorra dinero al usar una sola solución para proteger todos tus datos.</li>
</ul>




<h2 id="pol%C3%ADticas-de-protecci%C3%B3n-de-datos-centralizadas-en-aws" tabindex="-1">Políticas de protección de datos centralizadas en AWS</h2>


<p>AWS Backup te ayuda a crear y manejar reglas unificadas para cuidar tus datos en AWS. Esto significa que puedes decidir cómo y cuándo hacer copias de seguridad, y cómo estas se guardan o eliminan, todo desde un solo lugar.</p>


<h3 id="administraci%C3%B3n-centralizada-de-pol%C3%ADticas" tabindex="-1">Administración centralizada de políticas</h3>


<ul>
<li>Con la consola de AWS Backup, puedes crear reglas o políticas de copia de seguridad que aplicarás a tus datos en AWS.</li>
<li>Estas reglas pueden incluir:</li>
<li>Qué tan seguido quieres hacer las copias (diario, semanal, etc.)</li>
<li>Cuánto tiempo quieres guardar estas copias antes de que se borren automáticamente</li>
<li>Si quieres mover las copias a un almacenamiento más barato después de un tiempo</li>
<li>Puedes usar estas reglas en diferentes cuentas y lugares donde tengas datos en AWS.</li>
</ul>


<h3 id="asignaci%C3%B3n-de-recursos" tabindex="-1">Asignación de recursos</h3>


<ul>
<li>Puedes decirle a AWS Backup qué datos proteger usando etiquetas. Por ejemplo, si etiquetas tus bases de datos RDS con <code class="inline-code">respaldo: diario</code>, se harán copias de seguridad todos los días según tus reglas.</li>
<li>Esto hace fácil proteger muchos datos sin mucho esfuerzo.</li>
</ul>


<h3 id="cumplimiento-y-gobierno" tabindex="-1">Cumplimiento y gobierno</h3>


<ul>
<li>AWS Backup te permite controlar quién puede ver o cambiar tus copias de seguridad.</li>
<li>Incluso puedes bloquear las copias para que nadie, ni siquiera los que normalmente podrían, haga cambios.</li>
<li>Esto es útil para seguir reglas importantes y mantener tus datos seguros.</li>
</ul>


<h3 id="retenci%C3%B3n-y-archivado" tabindex="-1">Retención y archivado</h3>


<ul>
<li>Puedes decidir cuánto tiempo quieres guardar las copias de seguridad y luego borrarlas automáticamente.</li>
<li>También puedes mover copias viejas a un lugar que cueste menos mantener.</li>
<li>Esto ayuda a usar el espacio de manera inteligente y a ahorrar dinero.</li>
</ul>


<p>En pocas palabras, AWS Backup te permite crear reglas claras para cuidar tus datos en AWS, asegurándote de que todo esté seguro, se guarde el tiempo necesario y no gastes de más.</p>


<h2 id="gesti%C3%B3n-del-ciclo-de-vida-de-tus-backups" tabindex="-1">Gestión del ciclo de vida de tus backups</h2>


<h3 id="pol%C3%ADticas-de-retenci%C3%B3n" tabindex="-1">Políticas de retención</h3>


<p>Con AWS Backup, puedes decidir cuánto tiempo quieres guardar tus copias de seguridad antes de que se borren solas. Esto puede variar:</p>


<ul>
<li><strong>Retención a corto plazo</strong>: Guarda las copias por días o semanas. Esto es útil si necesitas recuperar datos por algún error reciente.</li>
<li><strong>Retención a largo plazo</strong>: Aquí guardas las copias por meses o años, lo cual es importante si tienes que seguir ciertas reglas legales.</li>
<li><strong>Eliminación por número de versiones</strong>: Esta opción borra las copias más viejas automáticamente cuando tienes muchas versiones. Es buena para controlar los costos.</li>
<li><strong>Archivado a largo plazo</strong>: Después de un tiempo, puedes pasar las copias a un almacenamiento más barato como S3 Glacier para guardarlas por mucho tiempo sin gastar tanto.</li>
</ul>


<p>Estas reglas se ponen en marcha automáticamente, así que no tienes que estar pendiente todo el tiempo.</p>


<h3 id="almacenamiento-y-recuperaci%C3%B3n-de-datos" tabindex="-1">Almacenamiento y recuperación de datos</h3>


<p>AWS Backup guarda tus copias de seguridad cifradas en Amazon S3 o Amazon EBS, dependiendo de lo que necesites:</p>


<ul>
<li><strong>S3</strong>: Ofrece mucha seguridad y siempre está disponible. Es fácil aumentar el almacenamiento y mover datos para reducir costos. Funciona bien con otros servicios de AWS.</li>
<li><strong>EBS</strong>: Es más rápido para recuperar datos, lo que es útil para bases de datos que se usan mucho. Pero, tienes que manejar cuánto espacio usas más de cerca.</li>
</ul>


<p>Para guardar dinero, puedes archivar tus backups en <strong>S3 Glacier</strong> o en <strong>S3 Glacier Deep Archive</strong> si buscas la opción más económica.</p>


<p>Cuando necesites tus datos de nuevo, con solo unos clics puedes traer de vuelta lo que guardaste en AWS Backup, ya sea por pérdida o daño de datos.</p>


<h2 id="medici%C3%B3n%2C-costos-y-facturaci%C3%B3n-de-aws-backup" tabindex="-1">Medición, costos y facturación de AWS Backup</h2>


<p>Cuando usas AWS Backup, hay diferentes cosas por las cuales te cobran, pero el sistema es bastante claro y te permite ajustar tus gastos según lo que necesitas. Aquí te explicamos los detalles importantes:</p>


<h3 id="componentes-de-precios" tabindex="-1">Componentes de precios</h3>


<p>Los costos vienen de diferentes partes:</p>


<ul>
<li><strong>Almacenamiento</strong>: esto se refiere al espacio que ocupan tus copias de seguridad en S3 o EBS. Depende de cuánto guardes y por cuánto tiempo.</li>
<li><strong>Solicitudes</strong>: son los pedidos que haces para crear, cambiar o borrar tus copias de seguridad.</li>
<li><strong>Transferencias de datos</strong>: esto es lo que se cobra por mover tus datos fuera de AWS cuando haces cosas como restaurar archivos.</li>
<li><strong>Restauraciones</strong>: es el proceso de recuperar tus datos desde las copias de seguridad.</li>
</ul>


<h3 id="optimizaci%C3%B3n-de-costos" tabindex="-1">Optimización de costos</h3>


<p>Hay varias maneras de ahorrar dinero:</p>


<ul>
<li>Prefiere hacer copias de seguridad incrementales en vez de completas.</li>
<li>Mueve las copias viejas a S3 Glacier para guardarlas más barato.</li>
<li>Establece reglas claras de cuánto tiempo guardar las copias y cuándo borrarlas automáticamente.</li>
<li>Usa las métricas para ver cómo estás utilizando el servicio y ajusta tus políticas de acuerdo a eso.</li>
</ul>


<h3 id="facturaci%C3%B3n" tabindex="-1">Facturación</h3>


<p>Los gastos de AWS Backup se muestran separadamente en tu factura de AWS bajo el nombre "Backup", lo que te ayuda a ver claramente cuánto estás gastando en este servicio.</p>


<p>En resumen, AWS Backup te da control sobre los costos de proteger tus datos en la nube. Siguiendo algunos consejos, puedes mantener tus gastos bajo control.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>AWS Backup es una herramienta que te facilita mucho el trabajo cuando se trata de proteger tus datos en la nube. Te permite hacer tus copias de seguridad de manera automática y organizarlas en un solo lugar, lo que te ahorra tiempo y esfuerzo.</p>


<p>Aquí te dejamos algunos puntos importantes sobre AWS Backup:</p>


<ul>
<li>Te permite <strong>organizar y automatizar</strong> tus copias de seguridad fácilmente, sin tener que hacerlo todo a mano.</li>
<li>Te ayuda a <strong>protegerte del ransomware</strong> guardando copias de seguridad que no se pueden modificar y que están separadas de tus datos originales.</li>
<li>Te ofrece <strong>informes de cumplimiento</strong> para demostrar que estás cuidando bien tus datos según las normas.</li>
<li>Te da la opción de hacer <strong>copias de seguridad entre regiones y cuentas</strong>, lo que aumenta tu protección ante problemas mayores.</li>
<li>Funciona bien con varios <strong>servicios de AWS y también en entornos híbridos</strong>.</li>
<li>Incluye maneras de <strong>ahorrar costos</strong>, como hacer copias de seguridad solo de los cambios y archivar datos antiguos.</li>
<li>Su manera de <strong>medir y cobrar</strong> es clara y fácil de entender.</li>
</ul>


<p>En pocas palabras, usar AWS Backup es una decisión inteligente para cualquier negocio o proyecto que use la nube. Te prepara para enfrentar imprevistos y cumplir con regulaciones importantes de manera más simple.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-es-aws-backup%3F" tabindex="-1">¿Qué es AWS Backup?</h3>


<p>AWS Backup es un servicio de AWS que te ayuda a guardar y organizar tus copias de seguridad en la nube de manera automática. Esto incluye hacer copias de cosas como tus máquinas virtuales, bases de datos y archivos. Además, AWS Backup te permite proteger tus copias con cifrado, guardarlas por mucho tiempo y recuperarlas rápidamente si algo sale mal.</p>


<h3 id="%C2%BFc%C3%B3mo-se-utiliza-un-backup%3F" tabindex="-1">¿Cómo se utiliza un backup?</h3>


<p>Un backup, o copia de seguridad, es como tener un respaldo de tus datos importantes en otro lugar seguro. Si pierdes tus datos originales por cualquier razón, como un error técnico o un virus, puedes recuperarlos desde esta copia de seguridad. Usos comunes incluyen:</p>


<ul>
<li>Guardar una copia de tus bases de datos importantes</li>
<li>Hacer una copia de seguridad de tus archivos antes de hacer cambios grandes</li>
<li>Protegerte contra virus y otros ataques maliciosos</li>
</ul>


<h3 id="%C2%BFqu%C3%A9-es-la-seguridad-aws%3F" tabindex="-1">¿Qué es la seguridad AWS?</h3>


<p>La seguridad de AWS se refiere a todas las herramientas y prácticas que AWS recomienda para mantener tus datos y aplicaciones seguros en la nube. Esto incluye:</p>


<ul>
<li>Cifrar tus datos importantes</li>
<li>Controlar quién puede acceder a tus datos</li>
<li>Protegerte contra ataques como los de denegación de servicio</li>
<li>Detectar problemas de seguridad</li>
<li>Asegurarte de cumplir con leyes importantes como HIPAA o <a href="https://aws.amazon.com/compliance/services-in-scope" rel="noopener noreferrer" target="_blank">PCI</a> DSS</li>
</ul>


<h3 id="%C2%BFqu%C3%A9-tipo-de-aws-storage-gateway-se-puede-utilizar-para-realizar-copias-de-seguridad-de-los-datos-con-el-software-de-copia-de-seguridad-m%C3%A1s-popular%3F" tabindex="-1">¿Qué tipo de AWS Storage Gateway se puede utilizar para realizar copias de seguridad de los datos con el software de copia de seguridad más popular?</h3>


<p>Para hacer copias de seguridad de tus datos locales con tu software de copias de seguridad habitual, puedes usar AWS Storage Gateway en su versión de "gateway de cintas". Esto te permite guardar tus backups en S3 como si estuvieran en una biblioteca de cintas virtual. Esto hace que guardar tus backups sea más simple y menos costoso comparado con usar cintas físicas.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-s3/">Mejores Prácticas Para Amazon S3</a></li><li><a href="https://dondeaprendoaws.com/blog/respaldos-y-snapshots-en-ebs/">Respaldos y Snapshots en EBS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/estrategias-de-recuperacion-de-desastres-en-aws/">Estrategias de Recuperación de Desastres en AWS</a></li>
</ul>
</p>
