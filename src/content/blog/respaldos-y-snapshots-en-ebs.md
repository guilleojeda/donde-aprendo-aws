---
title: "Respaldos y Snapshots en EBS"
description: "Descubre los fundamentos y mejores prácticas para crear y manejar snapshots en Amazon EBS. Aprende cómo automatizar el proceso, asegurar tus datos con cifrado y recuperar información importante."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T01:55:00.888Z"
cover: "/assets/blog/898bfede65963403cc64e267.jpg"
coverAlt: "Thumbnail for: Respaldos y Snapshots en EBS"
ogImage: "/assets/blog/898bfede65963403cc64e267.jpg"
related:
  - title: "7 Estrategias para Mitigar Cold Starts en AWS Lambda"
    url: "https://dondeaprendoaws.com/blog/7-estrategias-para-mitigar-cold-starts-en-aws-lambda/"
    image: "/assets/blog/c936f3eb45382355f87b0707.jpg"
    imageAlt: ""
  - title: "10 Consejos de Redes para AWS Outposts"
    url: "https://dondeaprendoaws.com/blog/10-consejos-de-redes-para-aws-outposts/"
    image: "/assets/blog/d57b2c7f6d8d4785748ce1c5.png"
    imageAlt: ""
  - title: "Tipos de Instancia en Amazon RDS y Amazon Aurora"
    url: "https://dondeaprendoaws.com/blog/tipos-de-instancia-en-amazon-rds-y-amazon-aurora/"
    image: "/assets/blog/aa03147d445ee06a398e3780.jpg"
    imageAlt: ""
---

<p>En esta guía, descubrirás los fundamentos y mejores prácticas para crear y manejar <em>snapshots</em> en Amazon EBS, asegurando la seguridad y disponibilidad de tus datos en la nube. Aquí te presento un resumen de lo más importante:</p>


<ul>
<li><strong>Snapshots de EBS</strong>: Son 'fotos' de tus datos en un momento específico, almacenadas de manera segura y eficiente.</li>
<li><strong>Creación y Gestión de Snapshots</strong>: Aprenderás a crearlos manualmente o automáticamente con herramientas como Amazon Data Lifecycle Manager, así como a gestionarlos para optimizar el espacio y costos.</li>
<li><strong>Recuperación de Datos</strong>: Te mostraré cómo recuperar tus datos fácilmente desde un snapshot.</li>
<li><strong>Seguridad y Cifrado</strong>: Tus datos están protegidos con cifrado AES-256, y la gestión de claves se simplifica con AWS KMS.</li>
<li><strong>Casos de Uso</strong>: Desde copias de seguridad hasta recuperación ante desastres, los snapshots son fundamentales para la estrategia de datos en AWS.</li>
</ul>


<p>Te guiaré paso a paso para que puedas aprovechar al máximo los snapshots de EBS, manteniendo tus datos seguros y accesibles cuando los necesites.</p>


<h3 id="%C2%BFqu%C3%A9-es-amazon-ebs%3F" tabindex="-1">¿Qué es Amazon EBS?</h3>


<p>Amazon EBS (Amazon Elastic Block Store) es como un disco duro en la nube para las instancias EC2. Piénsalo como un lugar donde puedes guardar todo lo que tu aplicación necesita, pero en internet.</p>


<p>Lo importante de Amazon EBS es:</p>


<ul>
<li><strong>Rápido</strong> - Los volúmenes EBS trabajan rápido para que tus aplicaciones corran sin problemas.</li>
<li><strong>Confiable</strong> - Se hace una copia de tus datos automáticamente en un área específica para que no los pierdas si algo falla.</li>
<li><strong>A tu medida</strong> - Puedes escoger diferentes tipos de volúmenes según lo que necesites, ya sea para bases de datos, aplicaciones importantes o para guardar mucha información.</li>
</ul>


<p>En pocas palabras, EBS te da un espacio seguro y rápido en la nube para tus datos.</p>


<h3 id="%C2%BFqu%C3%A9-son-los-snapshots%3F" tabindex="-1">¿Qué son los Snapshots?</h3>


<p>Los snapshots de EBS son como fotos que capturan cómo están tus datos en un momento específico. Estas fotos se guardan en Amazon S3 y solo se toman de los datos que han cambiado desde la última vez, lo que ayuda a ahorrar espacio y dinero.</p>


<p>Lo que debes saber:</p>


<ul>
<li><strong>Incrementales</strong> - Solo se guarda lo nuevo o lo que ha cambiado, haciendo que ocupen menos espacio.</li>
<li><strong>Recuperación rápida</strong> - Puedes usar estas fotos para traer de vuelta tus datos rápidamente si los pierdes.</li>
<li><strong>Seguros</strong> - Tus datos están bien guardados en Amazon S3 y puedes acceder a ellos desde diferentes lugares si es necesario.</li>
</ul>


<p>En resumen, los snapshots son una manera eficiente de mantener seguros tus datos, permitiéndote recuperarlos fácilmente si algo sucede.</p>


<h2 id="creaci%C3%B3n-de-snapshots" tabindex="-1">Creación de Snapshots</h2>


<p>Para hacer un snapshot de tus datos en Amazon EBS, aquí te mostramos cómo hacerlo paso a paso, ya sea usando la web de AWS, la línea de comandos (CLI) o la API:</p>


<h3 id="utilizando-la-consola-de-aws" tabindex="-1">Utilizando la consola de AWS</h3>


<ul>
<li>Entra a la web de AWS y ve a la sección de EC2.</li>
<li>En el menú de la izquierda, bajo "ELASTIC BLOCK STORE", elige "Volumes".</li>
<li>Escoge el volumen del que quieres hacer el snapshot.</li>
<li>Clic en "Actions" y luego en "Take snapshot".</li>
<li>Ponle un nombre y, si quieres, una descripción al snapshot.</li>
<li>Clic en "Take Snapshot".</li>
</ul>


<p>El proceso de crear el snapshot empezará y verás que su estado es "pending". Cuando termine, cambiará a "completed".</p>


<h3 id="utilizando-aws-cli" tabindex="-1">Utilizando AWS CLI</h3>


<p>Si prefieres usar la línea de comandos, puedes escribir:</p>


<pre><code>aws ec2 create-snapshot --volume-id vol-01234567890abcedf --description "Mi snapshot del volumen"
</code></pre>


<p>Aquí:</p>


<ul>
<li><code class="inline-code">--volume-id</code> es el ID del volumen EBS del que quieres hacer el snapshot.</li>
<li><code class="inline-code">--description</code> es una descripción opcional para tu snapshot.</li>
</ul>


<h3 id="utilizando-aws-api" tabindex="-1">Utilizando AWS API</h3>


<p>Para los que usan la API de AWS, pueden enviar una solicitud <code class="inline-code">CreateSnapshot</code> con el ID del volumen como parámetro.</p>


<p>Cosas importantes a recordar:</p>


<ul>
<li>Es buena idea hacer snapshots regularmente para tener copias de seguridad actualizadas.</li>
<li>Los snapshots ocupan menos espacio porque solo guardan los cambios.</li>
<li>Puedes usarlos para recuperar datos o mover volúmenes entre diferentes lugares.</li>
<li>Siempre prueba que puedes restaurar tus datos desde un snapshot.</li>
</ul>


<p>Hacer snapshots, ya sea a mano o automáticamente con herramientas como Amazon Data Lifecycle Manager, es fundamental para cuidar tus datos en Amazon EBS.</p>


<h2 id="gesti%C3%B3n-de-snapshots" tabindex="-1">Gestión de Snapshots</h2>


<p>Una vez que tienes tus snapshots, es clave saber cómo cuidarlos para que tus datos estén siempre seguros.</p>


<h3 id="visualizaci%C3%B3n-de-snapshots" tabindex="-1">Visualización de Snapshots</h3>


<p>Para checar tus snapshots existentes, puedes usar la consola de AWS, la CLI o la API:</p>


<p><strong>Consola</strong>:</p>


<ul>
<li>Ve a la sección de EC2 en la consola de AWS.</li>
<li>En el menú de la izquierda, en "ELASTIC BLOCK STORE", elige "Snapshots".</li>
<li>Aquí verás una lista con todos tus snapshots.</li>
<li>Al seleccionar uno, podrás ver detalles como:</li>
<li>ID del snapshot</li>
<li>Fecha en que se creó</li>
<li>Estado (completado, en proceso, etc)</li>
<li>De qué volumen se tomó</li>
<li>Descripción</li>
<li>Etiquetas</li>
<li>Otros datos importantes</li>
</ul>


<p><strong>CLI</strong>:</p>


<p>Para obtener información sobre tus snapshots con la línea de comandos, usa:</p>


<pre><code>aws ec2 describe-snapshots --snapshot-id snap-01234567890abcdef
</code></pre>


<p><strong>API</strong>:</p>


<p>Con la API, la orden es <code class="inline-code">DescribeSnapshots</code> y solo tienes que poner el ID del snapshot que te interesa.</p>


<h3 id="copiar-snapshots" tabindex="-1">Copiar Snapshots</h3>


<p>Si necesitas mover un snapshot a otra región, quizás para tener copias en diferentes lugares, sigue estos pasos:</p>


<p><strong>Consola</strong>:</p>


<ul>
<li>Escoge el snapshot que quieres copiar.</li>
<li>Haz clic en "Actions" y después en "Copy".</li>
<li>Elige a dónde lo quieres mandar.</li>
<li>Si quieres, cambia el nombre y la descripción.</li>
<li>Haz clic en "Copy snapshot".</li>
</ul>


<p><strong>CLI</strong>:</p>


<pre><code>aws ec2 copy-snapshot --source-region us-east-1 --source-snapshot-id snap-01234567890abcdef --description "Copia de snapshot a Ohio"
</code></pre>


<p><strong>API</strong>:</p>


<p>La orden aquí es <code class="inline-code">CopySnapshot</code>, asegúrate de especificar el ID del snapshot y a qué región lo quieres enviar.</p>


<h3 id="compartir-snapshots" tabindex="-1">Compartir Snapshots</h3>


<p>Si quieres compartir un snapshot con otra cuenta de AWS, aquí te decimos cómo:</p>


<p><strong>Consola</strong>:</p>


<ul>
<li>Elige el snapshot que quieres compartir.</li>
<li>Haz clic en "Actions", luego en "Modify Permissions".</li>
<li>Puedes hacerlo público o escribir el ID de la cuenta con la que quieres compartir.</li>
<li>Guarda los cambios.</li>
</ul>


<p><strong>CLI</strong>:</p>


<pre><code>aws ec2 modify-snapshot-attribute --snapshot-id snap-01234567890abcdef --attribute createVolumePermission --operation-type add --user-ids 123456789012
</code></pre>


<p><strong>API</strong>:</p>


<p>La orden es <code class="inline-code">ModifySnapshotAttribute</code>. Solo tienes que dar el ID del snapshot y la cuenta con la que lo quieres compartir.</p>


<h3 id="eliminar-snapshots" tabindex="-1">Eliminar Snapshots</h3>


<p>Si tienes snapshots que ya no necesitas, así los puedes borrar:</p>


<p><strong>Consola</strong>:</p>


<ul>
<li>Selecciona los snapshots que quieres eliminar.</li>
<li>Haz clic en "Actions" y luego en "Delete".</li>
<li>Confirma tu decisión.</li>
</ul>


<p><strong>CLI</strong>:</p>


<pre><code>aws ec2 delete-snapshot --snapshot-id snap-01234567890abcdef
</code></pre>


<p><strong>API</strong>:</p>


<p>La orden es <code class="inline-code">DeleteSnapshot</code>, usa el ID del snapshot que quieres eliminar.</p>


<p>Antes de borrar algo, recuerda:</p>


<ul>
<li>Una vez eliminado, no podrás recuperar esos datos.</li>
<li>Si creaste un AMI o un volumen desde ese snapshot, primero tienes que eliminar esos recursos.</li>
</ul>


<p>Siempre es buena idea asegurarte de que puedes restaurar datos desde un snapshot antes de deshacerte de los antiguos.</p>


<h2 id="automatizaci%C3%B3n-de-snapshots" tabindex="-1">Automatización de Snapshots</h2>


<p>Usar AWS Data Lifecycle Manager (DLM) te ayuda a manejar automáticamente la creación, guardado y borrado de snapshots de EBS. Esto significa que puedes hacer que todo el proceso de cuidado de tus snapshots se maneje solo, siguiendo reglas que tú defines.</p>


<h3 id="creaci%C3%B3n-de-una-pol%C3%ADtica-de-snapshots-automatizados" tabindex="-1">Creación de una política de snapshots automatizados</h3>


<p>Si quieres que tus snapshots se hagan solos, sigue estos pasos:</p>


<ul>
<li>Ve a la consola de DLM en AWS.</li>
<li>Elige "Create lifecycle policy".</li>
<li>Selecciona "Snapshots management – EBS snapshots" y dale a "Next".</li>
<li>Dale un nombre a tu política y si quieres, una descripción.</li>
<li>Decide cada cuánto quieres que se hagan los snapshots (puede ser todos los días, cada semana, etc.)</li>
<li>Elige cuántos snapshots quieres guardar antes de borrar los más viejos.</li>
<li>Escoge qué volúmenes EBS van a seguir esta regla.</li>
<li>Revisa todo y si estás de acuerdo, haz clic en "Create policy".</li>
</ul>


<p>Con estos pasos, DLM se encargará de hacer y borrar snapshots por ti, siguiendo las reglas que pusiste.</p>


<h3 id="ventajas" tabindex="-1">Ventajas</h3>


<p>Hacer esto tiene sus buenos puntos:</p>


<ul>
<li>Te ahorra tener que hacerlo a mano y reduce los errores que podríamos cometer.</li>
<li>Puedes ajustar cómo y cuándo se hacen y borran los snapshots.</li>
<li>Ayuda a que cumplas con las reglas de seguridad de datos.</li>
<li>Ayuda a controlar los costos, ya que borra los snapshots viejos automáticamente.</li>
</ul>


<h3 id="consideraciones" tabindex="-1">Consideraciones</h3>


<p>Pero hay cosas que debes tener en cuenta:</p>


<ul>
<li>Necesitas permisos especiales en IAM.</li>
<li>Esto no significa que ya tienes todo resuelto para proteger tus datos en caso de un desastre.</li>
<li>Es importante que revises que todo funcione como debe.</li>
</ul>


<p>En pocas palabras, AWS Data Lifecycle Manager te permite automatizar el cuidado de tus snapshots de EBS de manera fácil y según tus necesidades, lo que te ayuda a trabajar mejor, cumplir con las reglas de seguridad y controlar tus gastos.</p>


<h2 id="recuperaci%C3%B3n-de-datos-desde-snapshots" tabindex="-1">Recuperación de Datos desde Snapshots</h2>


<p>Si necesitas traer de vuelta tus datos de un snapshot de EBS, sigue estos pasos sencillos:</p>


<ul>
<li><strong>Crea un nuevo volumen de EBS usando el snapshot</strong>. Esto se puede hacer de diferentes maneras:</li>
<li><strong>Consola</strong>: Elige el snapshot, dale clic en "Actions" y después en "Create Volume".</li>
<li><strong>CLI</strong>: Utiliza el comando <code class="inline-code">create-volume</code> y no te olvides de poner el ID del snapshot.</li>
<li><strong>API</strong>: Aquí debes usar <code class="inline-code">CreateVolume</code> y dar el ID del snapshot.</li>
<li><strong>Adjunta este nuevo volumen a una instancia EC2</strong>. Esto te permitirá usar los datos del snapshot.</li>
<li>En la consola, busca "Volumes", elige el volumen que acabas de crear, dale clic en "Actions" y luego en "Attach Volume".</li>
<li>Con la CLI y la API, también hay formas de pegar este volumen a una instancia.</li>
<li><strong>Accede y usa los datos</strong>. Una vez que el volumen está adjunto, puedes mover los archivos que necesites del snapshot a la instancia EC2. O si prefieres, puedes simplemente cambiar un volumen viejo por este nuevo que viene del snapshot.</li>
</ul>


<p><strong>Cosas que debes recordar</strong>:</p>


<ul>
<li>Al crear un volumen desde un snapshot, los datos se van cargando poco a poco. Esto significa que al principio, acceder a los datos puede ser lento hasta que todo se cargue completamente desde S3.</li>
<li>Es una buena idea hacer que el volumen se cargue por completo antes de usarlo, para evitar esperas al acceder a los datos por primera vez. Puedes usar herramientas como <code class="inline-code">dd</code> o <code class="inline-code">fio</code> para esto.</li>
<li>Siempre prueba cómo recuperar tus datos desde un snapshot antes de que realmente lo necesites, para asegurarte de que todo funcione bien.</li>
</ul>


<p>En resumen, con estos pasos de crear un volumen desde un snapshot, adjuntarlo a una instancia y mover los datos necesarios, puedes recuperar tus archivos de manera fácil y segura si algo pasa.</p>




<h2 id="seguridad-y-cifrado" tabindex="-1">Seguridad y Cifrado</h2>


<p>Mantener tus datos seguros es super importante cuando usas snapshots de EBS. Aquí te contamos cómo se hace para que tus datos estén protegidos.</p>


<h3 id="cifrado-nativo" tabindex="-1">Cifrado nativo</h3>


<p>Cuando haces un snapshot de EBS, este se protege automáticamente con un sistema de seguridad llamado cifrado AES-256. Esto quiere decir que tus datos están seguros tanto cuando los estás moviendo como cuando no los estás usando.</p>


<p>Este proceso de proteger tus datos es automático y no tienes que hacer nada extra.</p>


<h3 id="administraci%C3%B3n-de-claves" tabindex="-1">Administración de claves</h3>


<p>Para que el cifrado funcione, se usan unas llaves especiales a través de algo llamado AWS Key Management Service (AWS KMS). Cuando creas un volumen de EBS, se crea una llave nueva, a menos que decidas usar una que ya tengas.</p>


<p>Esto es genial porque significa que no tienes que preocuparte por cómo manejar estas llaves; AWS lo hace por ti.</p>


<h3 id="copias-cifradas" tabindex="-1">Copias cifradas</h3>


<p>Si creas un volumen de EBS a partir de un snapshot que ya estaba protegido, este nuevo volumen también estará protegido con la misma llave. Y si quieres, puedes cambiar la llave por una nueva cuando hagas una copia del snapshot.</p>


<h3 id="seguridad-adicional" tabindex="-1">Seguridad adicional</h3>


<p>Además del cifrado, hay otras cosas que puedes hacer para mantener tus snapshots seguros:</p>


<ul>
<li>Asegúrate de que solo las personas correctas puedan acceder a tus snapshots, usando algo llamado IAM.</li>
<li>Usa bloqueos de snapshots para prevenir que se borren por accidente.</li>
<li>Prueba de vez en cuando que puedes recuperar tus datos desde los snapshots sin problemas.</li>
</ul>


<p>En resumen, los snapshots de EBS vienen con una buena protección automática, pero siempre es buena idea agregar un poco más de seguridad por tu cuenta.</p>


<h2 id="casos-de-uso-de-snapshots" tabindex="-1">Casos de Uso de Snapshots</h2>


<p>Los snapshots en EBS son super útiles en varias situaciones típicas:</p>


<h3 id="copias-de-seguridad" tabindex="-1">Copias de Seguridad</h3>


<p>Los snapshots son una manera fácil y segura de guardar una copia de tus datos en los volúmenes de EBS. Al hacer snapshots con frecuencia, puedes estar tranquilo de tener un respaldo por si algo sale mal.</p>


<p>Algunos ejemplos prácticos:</p>


<ul>
<li>Hacer un snapshot manual antes de cambios grandes, para poder volver atrás si algo no sale bien.</li>
<li>Programar snapshots automáticos con Amazon Data Lifecycle Manager para seguir las políticas de copias de seguridad.</li>
<li>Usar snapshots con otras herramientas de respaldo para proteger tus instancias EC2.</li>
</ul>


<h3 id="recuperaci%C3%B3n-ante-desastres" tabindex="-1">Recuperación ante Desastres</h3>


<p>Los snapshots te ayudan a mover tus datos entre diferentes áreas de AWS, lo cual es clave para recuperarte de desastres. Puedes:</p>


<ul>
<li>Hacer snapshots en tu área principal y copiarlos a otras áreas para tener una copia.</li>
<li>Mover datos de tu oficina a AWS usando snapshots en volúmenes EBS.</li>
<li>Aprovechar la opción de "Restauración rápida de instantáneas" para volver a tener tus datos rápidamente.</li>
</ul>


<h3 id="migraciones" tabindex="-1">Migraciones</h3>


<p>Los snapshots sirven para:</p>


<ul>
<li>Pasar datos entre cuentas y áreas de AWS.</li>
<li>Crear AMIs de tus snapshots para iniciar instancias EC2 en otras cuentas o áreas.</li>
<li>Copiar snapshots que otra gente ha compartido o hecho públicos a tu cuenta.</li>
</ul>


<p>En pocas palabras, los snapshots de EBS son fundamentales para hacer copias de seguridad, recuperarte de problemas y mover tus datos en AWS. Tener un buen plan con snapshots es vital para cuidar tus datos en la nube.</p>


<h2 id="conclusiones" tabindex="-1">Conclusiones</h2>


<p>Mantener nuestros datos seguros usando snapshots en Amazon EBS es clave. Aquí te dejamos algunos consejos sencillos:</p>


<ul>
<li>Intenta hacer snapshots de manera regular. Puedes hacerlo a mano o usar herramientas como Amazon Data Lifecycle Manager para que se hagan solos. Esto te ayuda a tener siempre una copia reciente de tus datos.</li>
<li>Cada tanto, asegúrate de que puedes volver a poner tus datos como estaban usando esos snapshots. Así sabrás que puedes contar con ellos si algo pasa.</li>
<li>Activa el cifrado en tus snapshots y volúmenes de EBS para que tus datos estén protegidos. AWS se encarga de las llaves de cifrado, pero tú también puedes manejarlas si prefieres tener más control.</li>
<li>Si tienes snapshots muy importantes, cópialos a otras regiones de AWS. Así tienes respaldos en diferentes lugares, lo cual es muy útil si necesitas recuperarte de algún problema grande.</li>
<li>Piénsalo bien antes de borrar snapshots viejos. Asegúrate de que no necesitas nada de lo que están guardando.</li>
<li>Controla quién puede ver y usar tus snapshots ajustando los permisos. Solo las personas que tú decidas deben poder acceder a ellos.</li>
</ul>


<p>En pocas palabras, los snapshots de Amazon EBS son fundamentales para cuidar tus datos en la nube. Si configuras bien los snapshots automáticos, revisas que todo funcione, activas el cifrado y guardas copias en varios lugares, estarás preparado para cualquier imprevisto.</p>


<h2 id="%C2%BFqu%C3%A9-es-un-snapshot-en-aws%3F" tabindex="-1">¿Qué es un snapshot en AWS?</h2>


<p>Imagina que puedes tomar una foto de cómo están tus datos en un momento específico, eso es un snapshot en AWS. Estas 'fotos' guardan solo los cambios desde la última vez que tomaste una, así que no ocupan mucho espacio y ayudan a ahorrar.</p>


<p>Algunos puntos importantes:</p>


<ul>
<li>Te ayudan a recuperar tus datos si pierdes algo o si necesitas moverlos a otro lado.</li>
<li>Se guardan de manera segura en Amazon S3.</li>
<li>Puedes programarlos para que se hagan solos con herramientas como <a href="https://aws.amazon.com/backup/" rel="noopener noreferrer" target="_blank">AWS Backup</a>.</li>
<li>Todos están protegidos con un cifrado fuerte para que tus datos estén seguros.</li>
<li>También pueden ser útiles para aumentar el tamaño de tus espacios de almacenamiento en EBS.</li>
</ul>


<p>Es una buena idea hacer estos snapshots con frecuencia, ya sea a mano o de forma automática.</p>


<p>Antes de borrar los antiguos, asegúrate de que puedes usarlos para recuperar tus datos sin problemas. No olvides activar el cifrado y poner permisos para que solo la gente autorizada pueda verlos.</p>


<p>En resumen, los snapshots de EBS son una forma práctica de mantener seguros tus datos, recuperar cosas importantes rápidamente, mover información de un lugar a otro y proteger todo lo que tienes en la nube. Son una parte esencial de cualquier plan para cuidar tus datos.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/estrategias-de-recuperacion-de-desastres-en-aws/">Estrategias de Recuperación de Desastres en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">AWS Fundamentos: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">Mejores prácticas AWS para DevOps</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/">AWS Seguridad: Fundamentos Esenciales</a></li>
</ul>
</p>
