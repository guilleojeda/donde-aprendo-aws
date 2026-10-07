---
title: "Snapshots de Amazon EBS: crear, restaurar y automatizar respaldos"
description: "Aprende cómo funcionan los snapshots incrementales de Amazon EBS, qué consistencia ofrecen, cómo restaurarlos y cuándo usar AWS Backup o Data Lifecycle Manager."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T01:55:00.888Z"
modifiedTimestamp: "2026-10-07T10:00:50-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "AWS Backup: cómo crear planes y probar restauraciones"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-aws-backup/"
  - title: "Recuperación ante desastres en AWS: RTO, RPO y estrategias"
    url: "https://dondeaprendoaws.com/blog/estrategias-de-recuperacion-de-desastres-en-aws/"

---

<p>Un snapshot de Amazon EBS guarda el estado de un volumen en un momento concreto y permite crear otro volumen desde esa copia. El primer snapshot es completo; los siguientes guardan los bloques que cambiaron. AWS no respalda automáticamente los datos de EBS, así que debes definir una frecuencia, conservar copias y probar la restauración antes de depender de ellas.</p>

<p>Esta guía explica qué captura un snapshot, qué tipo de consistencia ofrece, cómo crear y restaurar uno, y cuándo conviene automatizar con Amazon Data Lifecycle Manager (DLM) o AWS Backup.</p>

<h2 id="que-guarda-un-snapshot-ebs">Qué guarda un snapshot de EBS</h2>

<p>Un snapshot es una copia puntual de los bloques escritos en un volumen. Amazon EBS conserva los datos en almacenamiento de Amazon S3 administrado por AWS, pero no puedes consultar esos snapshots desde la consola ni desde la API de S3; se administran con las herramientas de EBS. AWS replica el dato del snapshot entre las zonas de disponibilidad de su región. Para tener una copia en otra región, debes copiarla allí. La <a href="https://docs.aws.amazon.com/ebs/latest/userguide/ebs-snapshots.html" rel="noopener noreferrer" target="_blank">guía de snapshots de Amazon EBS</a> explica cómo se almacenan y administran.</p>

<p>Los snapshots de una misma historia de volumen son incrementales. El primero guarda los bloques que tienen datos; cada snapshot posterior guarda los bloques nuevos o modificados desde el anterior y comparte la referencia a los demás bloques. Cada punto de restauración contiene el estado completo del volumen en ese momento: no necesitas aplicar manualmente todos los snapshots anteriores para crear un volumen desde uno reciente. El espacio y el costo dependen de los datos almacenados en los bloques, no del tamaño provisionado del volumen.</p>

<p>Una copia no equivale a una política de respaldo. Define qué volúmenes proteger, cada cuánto tomar puntos de recuperación, cuánto tiempo guardarlos y cómo comprobar que puedes recuperar los datos que importan.</p>

<h2 id="consistencia-snapshot-ebs">Consistencia: un volumen, varios volúmenes y la aplicación</h2>

<p>Al crear un snapshot, EBS incluye los datos que ya se escribieron en el volumen. No incluye escrituras que todavía estén en caché en la aplicación o en el sistema operativo. Por eso, un snapshot tomado mientras una carga sigue activa no garantiza por sí solo que una base de datos o una aplicación haya completado todas sus transacciones de forma consistente.</p>

<ul>
<li><strong>Un volumen:</strong> para reducir el riesgo de una copia inconsistente, pausa las escrituras y vacía los búferes de la aplicación antes de crear el snapshot. Si no puedes hacerlo, AWS recomienda desmontar el volumen antes de tomar la copia. Para el volumen raíz de una instancia EC2, AWS recomienda detener la instancia antes de crear el snapshot.</li>
<li><strong>Varios volúmenes de una instancia:</strong> usa la operación de snapshots de varios volúmenes para crear un conjunto coordinado y consistente ante una caída (crash-consistent). Esto captura los volúmenes seleccionados al mismo tiempo, pero no pausa las transacciones de la aplicación.</li>
<li><strong>Consistencia de aplicación:</strong> usa el método de backup propio de la base de datos, pausa de manera segura las escrituras o configura scripts previos y posteriores que preparen y reanuden la aplicación. DLM admite este patrón con Systems Manager para los casos y sistemas operativos compatibles.</li>
</ul>

<p>La <a href="https://docs.aws.amazon.com/ebs/latest/userguide/ebs-creating-snapshot.html" rel="noopener noreferrer" target="_blank">guía de creación de snapshots de EBS</a> describe las escrituras que se capturan y sus recomendaciones para pausar cargas. Para un conjunto coordinado, consulta <a href="https://docs.aws.amazon.com/cli/latest/reference/ec2/create-snapshots.html" rel="noopener noreferrer" target="_blank">la operación create-snapshots</a>; para respaldos de aplicación con scripts, revisa <a href="https://docs.aws.amazon.com/ebs/latest/userguide/automate-app-consistent-backups.html" rel="noopener noreferrer" target="_blank">la guía de consistencia de aplicación con DLM</a>.</p>

<h2 id="crear-y-restaurar-snapshot-ebs">Crear, comprobar y restaurar un snapshot</h2>

<p>Este ejemplo parte de un volumen de prueba que ya existe en us-east-1. Sustituye los identificadores de ejemplo por los de tus recursos y usa la región del volumen de origen. Elige una cuenta y un volumen no productivos antes de ejecutar operaciones que crean recursos.</p>

<h3 id="comandos-de-solo-lectura">Primero, inspeccionar sin cambiar recursos</h3>

<p>Estos comandos consultan el volumen y los snapshots existentes. Son de solo lectura:</p>

<pre><code>aws ec2 describe-volumes --region us-east-1 --volume-ids vol-REEMPLAZAR
aws ec2 describe-snapshots \
  --region us-east-1 \
  --owner-ids self \
  --filters Name=volume-id,Values=vol-REEMPLAZAR</code></pre>

<h3 id="crear-un-snapshot">Crear el snapshot</h3>

<p>El siguiente comando crea un snapshot manual del volumen y devuelve su ID. La creación es asíncrona: el estado empieza como <code>pending</code> y pasa a <code>completed</code> cuando termina. Crear y conservar el snapshot puede generar cargos de almacenamiento.</p>

<pre><code>aws ec2 create-snapshot \
  --region us-east-1 \
  --volume-id vol-REEMPLAZAR \
  --description "pre-cambio" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Name,Value=pre-cambio}]'</code></pre>

<p>Antes de crear un volumen desde la copia, espera a que el snapshot llegue a <code>completed</code>. El waiter consulta el estado cada 15 segundos; no crea ni modifica recursos. Después puedes comprobar el estado con el comando de solo lectura:</p>

<pre><code>aws ec2 wait snapshot-completed \
  --region us-east-1 \
  --snapshot-ids snap-REEMPLAZAR
aws ec2 describe-snapshots --region us-east-1 --snapshot-ids snap-REEMPLAZAR</code></pre>

<h3 id="restaurar-el-snapshot-en-un-volumen-nuevo">Restaurar en un volumen nuevo</h3>

<p>Para probar la copia, crea un volumen desde el snapshot. El ejemplo especifica tipo gp3 y deja que EBS use el tamaño de la copia; selecciona el tipo y el rendimiento que necesita tu carga. Esta operación crea otro volumen y genera cargos mientras exista.</p>

<pre><code>aws ec2 create-volume \
  --region us-east-1 \
  --availability-zone us-east-1a \
  --snapshot-id snap-REEMPLAZAR \
  --volume-type gp3</code></pre>

<p>El volumen restaurado queda en la zona de disponibilidad indicada. Para adjuntarlo a una instancia EC2, ambos recursos deben estar en la misma zona. Luego revisa el sistema de archivos y los datos desde una instancia de prueba; no formatees el volumen restaurado. Un volumen creado desde un snapshot puede tener latencia en las primeras lecturas mientras EBS inicializa sus bloques. Si necesitas rendimiento completo desde el inicio, evalúa <a href="https://docs.aws.amazon.com/ebs/latest/userguide/ebs-fast-snapshot-restore.html" rel="noopener noreferrer" target="_blank">Fast Snapshot Restore</a> o una <a href="https://docs.aws.amazon.com/ebs/latest/userguide/initalize-volume.html" rel="noopener noreferrer" target="_blank">tasa provisionada de inicialización</a>, y considera sus cargos y disponibilidad por zona.</p>

<h3 id="limpiar-la-prueba">Limpiar los recursos de prueba</h3>

<p>Cuando termines de validar, desmonta el sistema de archivos. Si adjuntaste el volumen restaurado, sepáralo de la instancia y espera a que su estado sea <code>available</code>:</p>

<pre><code>aws ec2 detach-volume \
  --region us-east-1 \
  --volume-id vol-RESTAURADO \
  --instance-id i-REEMPLAZAR</code></pre>

<p>Luego elimina únicamente los recursos de prueba que ya no necesites. Primero se borra el volumen creado para restaurar y después el snapshot manual, si no debe conservarse:</p>

<pre><code>aws ec2 delete-volume --region us-east-1 --volume-id vol-RESTAURADO
aws ec2 delete-snapshot --region us-east-1 --snapshot-id snap-PRUEBA</code></pre>

<p>Estos comandos de eliminación son destructivos. No los uses para borrar el volumen de origen ni una copia que tu política de respaldo deba conservar. Si configuraste reglas de Recycle Bin, el snapshot eliminado puede seguir retenido y generar cargos durante el plazo de retención. Los snapshots gestionados por AWS Backup se eliminan desde AWS Backup, no con <code>delete-snapshot</code> en EC2. Consulta las condiciones de <a href="https://docs.aws.amazon.com/ebs/latest/userguide/ebs-deleting-snapshot.html" rel="noopener noreferrer" target="_blank">eliminación de snapshots</a> antes de limpiar datos reales.</p>

<h2 id="copiar-snapshot-ebs-otra-region">Copiar un snapshot a otra región y cifrarlo</h2>

<p>Los snapshots se crean en la región del volumen. Para preparar una recuperación ante una falla regional, espera a que el snapshot esté completo y luego crea una copia en la región de destino. La copia es un recurso separado; no mueve ni elimina el original.</p>

<p>Un snapshot de un volumen cifrado hereda el estado de cifrado y la clave KMS del volumen. No se puede quitar el cifrado de un snapshot cifrado. Para cifrar un snapshot que originalmente no lo estaba o volver a cifrar una copia, usa <code>copy-snapshot</code> y una clave KMS válida en la región de destino. Por ejemplo:</p>

<pre><code>aws ec2 copy-snapshot \
  --source-region us-east-1 \
  --source-snapshot-id snap-REEMPLAZAR \
  --region us-west-2 \
  --description "copia-dr" \
  --encrypted \
  --kms-key-id alias/ebs-backup</code></pre>

<p>El comando crea un snapshot en us-west-2 y supone que <code>alias/ebs-backup</code> existe allí y que tu identidad tiene los permisos necesarios para usar esa clave. La copia puede añadir cargos por transferencia y por almacenar los datos en el destino. Las copias sucesivas pueden ser incrementales si ya existe una copia reciente en el destino, sigue disponible, no está archivada y mantiene la misma clave KMS; cambiar la clave puede hacer que una copia sea completa. Revisa la <a href="https://docs.aws.amazon.com/ebs/latest/userguide/ebs-copy-snapshot.html" rel="noopener noreferrer" target="_blank">documentación de copia y cifrado de snapshots</a>, incluidos los requisitos de KMS, antes de configurar una política entre regiones.</p>

<p>Una copia regional ayuda a conservar un punto de recuperación fuera de la región de origen, pero no prueba que una aplicación pueda arrancar allí. Define los objetivos de tiempo y pérdida de datos, y ensaya el proceso completo. La guía de <a href="https://dondeaprendoaws.com/blog/estrategias-de-recuperacion-de-desastres-en-aws/">recuperación ante desastres en AWS</a> amplía esa decisión con RTO, RPO y estrategias de recuperación.</p>

<h2 id="automatizar-respaldos-ebs">Automatizar: Amazon Data Lifecycle Manager o AWS Backup</h2>

<p>Para evitar copias manuales sin una retención definida, elige la herramienta según el alcance de tu política:</p>

<ul>
<li><strong>Amazon Data Lifecycle Manager (DLM)</strong> permite programar snapshots y AMIs respaldadas por EBS, definir retención y borrar los puntos que la política ya no necesita. Es una opción directa si tu política se concentra en EBS/EC2. DLM solo administra los snapshots y AMIs creados por sus propias políticas; no adopta snapshots manuales ni los de AWS Backup. El servicio no tiene costo adicional, pero sí pagas el almacenamiento, las copias entre regiones y otras opciones facturables que habilites.</li>
<li><strong>AWS Backup</strong> centraliza planes, bóvedas y operaciones de copia/restauración para EBS y otros recursos compatibles. Conviene evaluar este servicio cuando necesitas reglas comunes para varios tipos de datos, controles de bóveda o administración central de copias entre cuentas y regiones. Cuando proteges una instancia EC2, AWS Backup crea por defecto un conjunto de snapshots consistente ante una caída (crash-consistent) con sus volúmenes EBS adjuntos. No des por hecha esa coordinación en trabajos separados para volúmenes individuales; tampoco equivale a consistencia de aplicación. Consulta la <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/multi-volume-crash-consistent.html" rel="noopener noreferrer" target="_blank">documentación de backups crash-consistent de varios volúmenes</a> y verifica las funciones disponibles para tu recurso y región.</li>
</ul>

<p>Las dos herramientas gestionan sus propios puntos de recuperación. Evita programar dos políticas sobre el mismo volumen sin una razón clara: puedes crear copias repetidas y aumentar el almacenamiento. Si eliges AWS Backup para EBS, elimina los puntos desde su bóveda y su ciclo de vida. Para seguir el flujo de planes, permisos y pruebas de restauración, consulta <a href="https://dondeaprendoaws.com/blog/comprendiendo-aws-backup/">la guía de AWS Backup</a>. Revisa las páginas oficiales de <a href="https://docs.aws.amazon.com/ebs/latest/userguide/snapshot-lifecycle.html" rel="noopener noreferrer" target="_blank">automatización de respaldos con DLM</a> y <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/working-with-supported-services.html" rel="noopener noreferrer" target="_blank">integración de AWS Backup con EBS</a>.</p>

<h2 id="retencion-borrado-archivo-y-costos">Retención, eliminación, archivo y costos</h2>

<p>Define la retención según el tiempo durante el que necesites recuperar estados anteriores y las reglas de tu organización. Como los snapshots comparten bloques, borrar un punto antiguo no rompe los posteriores: cada snapshot puede crear por sí mismo un volumen con el estado capturado. Al eliminar uno, EBS borra los bloques exclusivos de ese punto; los bloques que todavía usa otro snapshot se conservan y siguen contándose en el almacenamiento. Por eso, borrar un snapshot no siempre reduce la factura de inmediato.</p>

<p>Para copias que se consultan rara vez, el nivel <strong>Amazon EBS Snapshots Archive</strong> puede ser una alternativa de largo plazo. Archivar convierte el snapshot incremental en un snapshot completo y lo cobra con la tarifa del nivel de archivo. El almacenamiento archivado tiene un período mínimo de 90 días; recuperar el dato implica restaurarlo al nivel estándar y puede tardar más y generar un cargo de recuperación. Compáralo con conservar el snapshot estándar y revisa los <a href="https://docs.aws.amazon.com/ebs/latest/userguide/snapshot-archive-pricing.html" rel="noopener noreferrer" target="_blank">precios y condiciones del archivo de snapshots</a> antes de elegirlo.</p>

<p>El costo total puede incluir almacenamiento incremental, snapshots copiados a otra región, el volumen restaurado mientras exista, Fast Snapshot Restore, inicialización provisionada y almacenamiento de archivo o su recuperación. Los importes varían por región y uso; consulta los <a href="https://aws.amazon.com/ebs/pricing/" rel="noopener noreferrer" target="_blank">precios actuales de Amazon EBS</a> y, para puntos gestionados por AWS Backup, los <a href="https://aws.amazon.com/backup/pricing/" rel="noopener noreferrer" target="_blank">precios de AWS Backup</a>. Anota las etiquetas de costo y revisa la factura después de activar una política de retención.</p>

<h2 id="recursos-y-comunidades">Recursos y comunidades para seguir aprendiendo</h2>

<p>El catálogo reúne grabaciones de comunidades en español sobre EBS y otros servicios de almacenamiento. Puedes abrir los videos directamente o <a href="/aprender/">explorar más recursos de aprendizaje en el catálogo</a>:</p>

<ul>
<li><a href="https://www.youtube.com/watch?v=rBawTUS0vLA" rel="noopener noreferrer" target="_blank">Grupo de Estudio - Certificación Solutions Architect - Amazon Elastic Block Store (EBS)</a>, de AWS User Group Guatemala.</li>
<li><a href="https://www.youtube.com/watch?v=2-um5JkAlc4" rel="noopener noreferrer" target="_blank">AWS Girls - EBS - Bianca Torres</a>, de AWS Girls Perú.</li>
<li><a href="https://www.youtube.com/watch?v=t3WW-dcnGEk" rel="noopener noreferrer" target="_blank">Practitioner, Una Nueva Esperanza: Amazon EBS y Amazon EFS</a>, de AWS Women Colombia.</li>
<li><a href="https://www.youtube.com/watch?v=GqYKhnqDDeI" rel="noopener noreferrer" target="_blank">AWS UG BS AS: AWS CLOUD PRACTITIONER CHALLENGE Sesión 5 "Storage (EBS, EFS, S3) + Monitoring/Log"</a>, de AWS User Group Buenos Aires.</li>
</ul>

<p>Un grupo no tiene que dedicarse a EBS para que puedas aprender con otras personas: las comunidades generales de AWS también sirven para conversar sobre backups, operación y recuperación. Si estás en Córdoba, consulta el <a href="https://www.meetup.com/aws-user-group-cordoba-argentina/" rel="noopener noreferrer" target="_blank">AWS User Group Córdoba</a>; para encontrar grupos en otros países, explora el <a href="/comunidades/">directorio de comunidades AWS</a>. Las sesiones y los temas cambian, así que revisa también la <a href="/eventos/">agenda de eventos AWS</a> para encontrar próximos encuentros y talleres.</p>

<h2 id="preguntas-frecuentes">Preguntas frecuentes sobre snapshots de EBS</h2>

<h3 id="cada-snapshot-ebs-es-una-copia-completa">¿Cada snapshot de EBS es una copia completa?</h3>
<p>Cada snapshot representa el estado completo del volumen y puede usarse para crear otro volumen. El almacenamiento se incrementa con los bloques nuevos o modificados que todavía no se guardaron en la cadena.</p>

<h3 id="puedo-borrar-snapshots-antiguos-ebs">¿Puedo borrar snapshots antiguos sin perder los nuevos?</h3>
<p>Sí. Los snapshots posteriores no requieren que conserves los antiguos para restaurarse. Sin embargo, los bloques que un snapshot posterior todavía referencia se conservan y pueden seguir generando cargos.</p>

<h3 id="un-snapshot-ebs-es-consistente-con-mi-base-de-datos">¿Un snapshot es consistente con mi base de datos?</h3>
<p>No necesariamente. EBS captura los bloques escritos, pero una aplicación puede tener datos pendientes en sus propios búferes. Usa el mecanismo de backup de la base de datos o pausa y prepara la aplicación antes del snapshot.</p>

<h3 id="el-snapshot-se-cifra-automaticamente">¿El snapshot se cifra automáticamente?</h3>
<p>Hereda el cifrado del volumen de origen. Si el volumen estaba cifrado, el snapshot también lo estará con la clave asociada; para cifrar una copia de un snapshot sin cifrar, crea una copia cifrada con una clave KMS permitida en su región de destino.</p>

<h3 id="dlm-o-aws-backup">¿Conviene usar DLM o AWS Backup?</h3>
<p>DLM administra políticas de snapshots EBS y AMIs EBS. AWS Backup ofrece planes y bóvedas centralizados para varios recursos compatibles. Elige según el alcance que necesitas proteger, la recuperación que vas a probar y los controles de retención requeridos.</p>
