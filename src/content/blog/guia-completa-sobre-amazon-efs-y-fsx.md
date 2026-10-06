---
title: "Amazon EFS vs FSx: cómo elegir almacenamiento de archivos en AWS"
description: "Compara Amazon EFS con las cuatro opciones de Amazon FSx, EBS y S3. Elige por protocolo, disponibilidad, rendimiento, costos y requisitos de montaje."
author: "guille-ojeda"
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T01:14:24.835Z"
modifiedTimestamp: "2026-10-06T15:38:25-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Cómo configurar AWS Transfer Family con Amazon EFS por SFTP"
    url: "https://dondeaprendoaws.com/blog/como-usar-aws-transfer-family-con-amazon-efs/"
  - title: "AWS Backup: cómo crear planes y probar restauraciones"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-aws-backup/"
  - title: "Cómo desplegar contenedores en AWS: elige entre ECS, EKS y Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/"
  - title: "Mejores prácticas para Amazon S3"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-s3/"

---

<p>Amazon EFS y Amazon FSx son almacenamiento de archivos administrado, pero la comparación termina ahí. EFS ofrece una interfaz NFS elástica para compartir carpetas, mientras que FSx reúne cuatro sistemas de archivos con protocolos, capacidades y modelos de disponibilidad diferentes. Elegir por la etiqueta «FSx» o por una cifra aislada de rendimiento suele llevar a una arquitectura equivocada.</p>

<p>La pregunta útil es: <strong>¿qué sistema operativo, protocolo, patrón de acceso y nivel de resiliencia necesita la aplicación?</strong> Esta guía responde primero esa pregunta y después muestra cómo montar un EFS existente en una instancia EC2 Linux.</p>

<h2 id="respuesta-rapida">Respuesta rápida: elige por el tipo de acceso</h2>

<p>Antes de comparar precios o throughput, identifica cómo leerá y escribirá los datos la carga:</p>

<figure class="table"><table>
<thead><tr><th>Necesidad principal</th><th>Opción que debes evaluar primero</th><th>Por qué</th></tr></thead>
<tbody>
<tr><td>Carpeta compartida para aplicaciones Linux, contenedores o varios clientes NFS</td><td><a href="https://aws.amazon.com/efs/" rel="noopener noreferrer" target="_blank">Amazon EFS</a></td><td>NFSv4 y almacenamiento elástico administrado; el modo de throughput se elige por el patrón de carga.</td></tr>
<tr><td>Aplicaciones Windows, recursos compartidos SMB o permisos con Active Directory</td><td><a href="https://docs.aws.amazon.com/fsx/latest/WindowsGuide/what-is.html" rel="noopener noreferrer" target="_blank">FSx para Windows File Server</a></td><td>Sistema de archivos Windows administrado y acceso SMB nativo.</td></tr>
<tr><td>Procesamiento paralelo de datos, HPC o entrenamiento que usa S3 como repositorio</td><td><a href="https://docs.aws.amazon.com/fsx/latest/LustreGuide/what-is.html" rel="noopener noreferrer" target="_blank">FSx para Lustre</a></td><td>Interfaz POSIX/Lustre, integración con S3 y opciones scratch o persistent.</td></tr>
<tr><td>Aplicaciones que ya usan ONTAP, NFS y SMB a la vez, iSCSI o funciones NetApp</td><td><a href="https://docs.aws.amazon.com/fsx/latest/ONTAPGuide/what-is-fsx-ontap.html" rel="noopener noreferrer" target="_blank">FSx para NetApp ONTAP</a></td><td>Ofrece NFS, SMB e iSCSI y conserva conceptos de ONTAP como volúmenes, snapshots y replicación.</td></tr>
<tr><td>Servidor NFS o ZFS que necesita snapshots, clones o compresión administrados</td><td><a href="https://docs.aws.amazon.com/fsx/latest/OpenZFSGuide/what-is-fsx.html" rel="noopener noreferrer" target="_blank">FSx para OpenZFS</a></td><td>Admite NFS desde Linux, Windows y macOS, con funciones de OpenZFS.</td></tr>
<tr><td>Volumen de bloques para una aplicación que corre en EC2</td><td><a href="https://aws.amazon.com/ebs/" rel="noopener noreferrer" target="_blank">Amazon EBS</a></td><td>La aplicación ve un dispositivo de bloques; no es una carpeta compartida general como EFS o FSx.</td></tr>
<tr><td>Objetos, datos de un data lake, contenido estático o archivo consultado mediante API</td><td><a href="https://aws.amazon.com/s3/" rel="noopener noreferrer" target="_blank">Amazon S3</a></td><td>Es almacenamiento de objetos. No requiere ni ofrece la misma semántica de un sistema de archivos NFS o SMB.</td></tr>
</tbody>
</table></figure>

<p>La <a href="https://docs.aws.amazon.com/decision-guides/latest/decision-guides/choosing-aws-storage-service.html" rel="noopener noreferrer" target="_blank">guía de decisión de almacenamiento de AWS</a> separa bloque, archivo y objeto. Esa separación evita intentar resolver con EFS una necesidad de objetos en S3, o montar EBS cuando varios hosts necesitan compartir la misma carpeta.</p>

<h2 id="que-son-efs-y-fsx">Qué son Amazon EFS y Amazon FSx</h2>

<p><a href="https://aws.amazon.com/efs/when-to-choose-efs/" rel="noopener noreferrer" target="_blank">Amazon EFS</a> es un sistema de archivos administrado que expone una interfaz NFS para clientes compatibles. El almacenamiento puede crecer o reducirse con los archivos que guardas y borras; eso no significa que todos los modos de rendimiento o todas las cuotas se ajusten solos.</p>

<p><a href="https://docs.aws.amazon.com/fsx/" rel="noopener noreferrer" target="_blank">Amazon FSx</a> es una familia, no un único sistema de archivos. AWS ofrece FSx para Windows File Server, FSx para Lustre, FSx para NetApp ONTAP y FSx para OpenZFS. Cada producto tiene protocolos, opciones de almacenamiento, capacidad, throughput, IOPS, disponibilidad y precios propios.</p>

<h2 id="amazon-efs">Amazon EFS: NFS compartido y elástico</h2>

<h3 id="regional-one-zone">Regional y One Zone: no son el mismo nivel de resiliencia</h3>

<figure class="table"><table>
<thead><tr><th>Tipo de sistema EFS</th><th>Distribución de los datos</th><th>Red y decisión</th></tr></thead>
<tbody>
<tr><td><strong>Regional</strong></td><td>Datos y metadatos redundantes en varias zonas de disponibilidad de la región.</td><td>Puedes crear un mount target por zona desde la que accederás. Es la opción recomendada cuando necesitas la mayor disponibilidad y durabilidad regional.</td></tr>
<tr><td><strong>One Zone</strong></td><td>Datos y metadatos redundantes dentro de una sola zona de disponibilidad.</td><td>Solo admite un mount target en esa zona. Puede encajar cuando la carga tolera perder disponibilidad o datos ante una pérdida de la zona y buscas un modelo de menor alcance.</td></tr>
</tbody>
</table></figure>

<p>Un cliente puede acceder a un EFS Regional desde distintas zonas usando el mount target local de cada una. Para One Zone, AWS permite montar desde otra zona indicando la zona o el DNS del mount target, pero la ubicación del cliente afecta la latencia y puede generar transferencia entre zonas. Para una carga de contenedores o una función que usa One Zone, planifica que se ejecute en la misma zona del sistema de archivos.</p>

<p>Consulta <a href="https://docs.aws.amazon.com/efs/latest/ug/features.html" rel="noopener noreferrer" target="_blank">las características y tipos de EFS</a> y <a href="https://docs.aws.amazon.com/efs/latest/ug/accessing-fs.html" rel="noopener noreferrer" target="_blank">la documentación de mount targets</a> antes de elegir. «Multi-AZ» no es una propiedad que puedas atribuir a todos los productos FSx ni el nombre comercial de EFS: aquí la distinción correcta es Regional frente a One Zone.</p>

<h3 id="clases-y-throughput-efs">Clases de almacenamiento, rendimiento y throughput</h3>

<p>EFS combina una clase de sistema de archivos con clases de almacenamiento y un modo de throughput:</p>

<figure class="table"><table>
<thead><tr><th>Elemento</th><th>Opciones actuales</th><th>Qué debes comprobar</th></tr></thead>
<tbody>
<tr><td>Clases de almacenamiento</td><td>Standard, Infrequent Access (IA) y Archive.</td><td>Standard es para datos activos; IA para datos accedidos pocas veces por trimestre; Archive para datos accedidos pocas veces por año. Las clases frías tienen latencias y cargos de acceso distintos.</td></tr>
<tr><td>Throughput</td><td>Elastic, Provisioned y Bursting.</td><td>Elastic sigue la actividad y cobra el throughput usado; Provisioned separa la capacidad de throughput del tamaño almacenado; Bursting depende de los datos en Standard y de los créditos. Los máximos dependen de la región.</td></tr>
<tr><td>Modo de rendimiento</td><td>General Purpose y Max I/O.</td><td>General Purpose tiene menor latencia y AWS lo recomienda para todos los sistemas. Max I/O es una opción anterior, con más latencia; no está disponible para One Zone ni para Elastic throughput.</td></tr>
</tbody>
</table></figure>

<p>Las políticas de <a href="https://docs.aws.amazon.com/efs/latest/ug/lifecycle-management-efs.html" rel="noopener noreferrer" target="_blank">Lifecycle Management</a> mueven archivos entre clases según el acceso. EFS Archive está soportado en sistemas Regional con Elastic throughput; no lo trates como una clase universal disponible para cualquier combinación.</p>

<p>La palabra «elástico» tampoco equivale a «sin límites»: EFS tiene cuotas de conexiones, throughput, operaciones y mount targets. Revisa las <a href="https://docs.aws.amazon.com/efs/latest/ug/limits.html" rel="noopener noreferrer" target="_blank">cuotas de EFS</a> para la región y los clientes que realmente usarás.</p>

<h2 id="familia-fsx">Amazon FSx: cuatro sistemas de archivos distintos</h2>

<p>En FSx, el nombre del sistema importa más que la marca de la familia. Estas son las diferencias que cambian la decisión:</p>

<h3 id="fsx-windows">FSx para Windows File Server</h3>
<p>Usa un sistema de archivos Windows administrado y el protocolo SMB 2.0 a 3.1.1. Es la opción natural para recursos compartidos de Windows, aplicaciones empresariales que esperan SMB, permisos de archivos y carpetas con Active Directory o una migración de un servidor Windows. AWS también documenta <a href="https://docs.aws.amazon.com/fsx/latest/WindowsGuide/supported-fsx-clients.html" rel="noopener noreferrer" target="_blank">clientes Linux compatibles</a> que acceden al recurso por SMB; el protocolo y la autenticación siguen siendo los de Windows. Al crear el sistema eliges capacidad, tipo de almacenamiento, IOPS SSD cuando corresponda y throughput.</p>
<p>Windows File Server ofrece despliegues <strong>Single-AZ</strong> y <strong>Multi-AZ</strong>. Multi-AZ usa un clúster de servidores en dos zonas, replica los datos de forma síncrona entre ellas y puede conmutar al servidor en espera. Single-AZ concentra el sistema en una zona y tiene un modelo de recuperación y disponibilidad diferente. Lee <a href="https://docs.aws.amazon.com/fsx/latest/WindowsGuide/high-availability-multiAZ.html" rel="noopener noreferrer" target="_blank">la comparación oficial de Windows Single-AZ y Multi-AZ</a> antes de usar estos nombres en un diseño.</p>

<h3 id="fsx-lustre">FSx para Lustre</h3>
<p>Lustre ofrece una interfaz de archivos POSIX para Linux y está orientado a cargas paralelas como HPC, entrenamiento y preparación de datos. Puede vincularse con S3 para importar o exportar conjuntos de datos. Sus opciones actuales incluyen despliegues <strong>scratch</strong> y <strong>persistent</strong>, junto con clases SSD, Intelligent-Tiering y HDD según la opción y la región.</p>
<p>Scratch sirve para procesamiento temporal: sus datos no se replican y no persisten si falla un servidor de archivos. Persistent está destinado a almacenamiento más duradero; el modelo de replicación depende de la clase elegida. No conviertas «FSx para Lustre» en una promesa de Multi-AZ genérica: revisa <a href="https://docs.aws.amazon.com/fsx/latest/LustreGuide/using-fsx-lustre.html" rel="noopener noreferrer" target="_blank">las opciones de despliegue y clases de Lustre</a> para la región concreta.</p>

<h3 id="fsx-ontap">FSx para NetApp ONTAP</h3>
<p>ONTAP es adecuado cuando necesitas compatibilidad con un entorno NetApp o una combinación de protocolos. Sus volúmenes pueden exponerse por NFS, SMB o iSCSI, y admite acceso multiprotocolo a un mismo volumen cuando el diseño de permisos lo contempla. También ofrece capacidades de ONTAP como snapshots y replicación, dentro de los límites del servicio administrado.</p>
<p>FSx para ONTAP tiene despliegues Single-AZ y Multi-AZ. Single-AZ puede incluir pares de alta disponibilidad dentro de una sola zona, pero no equivale a replicar los datos en otra zona. Multi-AZ coloca los servidores en dos zonas y replica de forma síncrona. Las generaciones Single-AZ 1/2 y Multi-AZ 1/2 son opciones concretas del producto; no las generalices a toda la familia FSx. Consulta <a href="https://docs.aws.amazon.com/fsx/latest/ONTAPGuide/high-availability-AZ.html" rel="noopener noreferrer" target="_blank">la guía de disponibilidad de ONTAP</a>.</p>

<h3 id="fsx-openzfs">FSx para OpenZFS</h3>
<p>OpenZFS expone NFSv3, v4.0, v4.1 y v4.2 a clientes Linux, Windows y macOS, y aporta snapshots casi instantáneos, clones, compresión y volúmenes administrados. Es una buena transición para un servidor NFS o ZFS que necesita esas funciones sin administrar el hardware.</p>
<p>Este producto distingue Multi-AZ (HA), Single-AZ (HA) y Single-AZ (no HA). Multi-AZ replica en dos zonas; Single-AZ (HA) mantiene servidores en espera dentro de una zona; Single-AZ (no HA) tiene un modelo de recuperación distinto. Las clases SSD e Intelligent-Tiering tampoco están disponibles con todas las combinaciones. Comprueba la <a href="https://docs.aws.amazon.com/fsx/latest/OpenZFSGuide/availability-durability.html" rel="noopener noreferrer" target="_blank">matriz de disponibilidad y durabilidad de OpenZFS</a>.</p>

<h2 id="elegir-efs-fsx">Cómo decidir entre EFS y cada opción de FSx</h2>
<ol>
<li><strong>Empieza por el cliente.</strong> Si la aplicación espera una ruta NFS y corre en Linux, EFS es el punto de partida. Si espera una ruta SMB, permisos de Windows o Active Directory, comienza con FSx para Windows.</li>
<li><strong>Comprueba si existe una dependencia del sistema de archivos.</strong> Una aplicación que ya usa snapshots, clones o compresión de ZFS se beneficia de OpenZFS; una que depende de ONTAP, multiprotocolo o iSCSI debe evaluar ONTAP.</li>
<li><strong>Separa datos temporales de datos persistentes.</strong> En Lustre, scratch y persistent responden a necesidades distintas. Un scratch no debe ser la única copia de un dato que necesitas conservar.</li>
<li><strong>Define el fallo que debes soportar.</strong> EFS Regional, EFS One Zone, FSx Windows Multi-AZ, ONTAP Multi-AZ y OpenZFS Multi-AZ tienen modelos diferentes. Escribe el RPO, el RTO y la pérdida de zona que tolera la carga antes de elegir.</li>
<li><strong>Mide el patrón de acceso.</strong> Cuenta lectura, escritura, tamaño de archivos, metadatos, clientes simultáneos y latencia. Un benchmark de otra región, clase o despliegue no prueba tu caso.</li>
<li><strong>Estima la factura completa.</strong> Incluye almacenamiento, throughput, IOPS, backups, solicitudes o acceso a clases frías y transferencia entre zonas o regiones.</li>
</ol>

<h2 id="efs-fsx-ebs-s3">EFS, FSx, EBS y S3: la diferencia que evita errores</h2>
<ul>
<li><strong>Archivo:</strong> EFS y FSx presentan carpetas y semántica de archivos a varios clientes. El protocolo y las funciones del sistema determinan la compatibilidad.</li>
<li><strong>Bloque:</strong> EBS se conecta a EC2 como un volumen de bloques que el sistema operativo debe formatear y montar. Es apropiado para una aplicación que necesita su propio dispositivo; no reemplaza una carpeta compartida entre hosts.</li>
<li><strong>Objeto:</strong> S3 se consulta con API y claves de objeto. Puede ser la fuente duradera de datos para Lustre, pero no es automáticamente un sistema de archivos POSIX.</li>
</ul>
<p>Si la aplicación puede usar una API de objetos, S3 suele ser una decisión distinta y no un sustituto directo de EFS. Si necesita abrir archivos con rutas, bloqueo y permisos del sistema operativo, compara EFS y FSx según el protocolo y el sistema que espera.</p>

<h2 id="montar-efs-ec2-linux">Ejemplo comprobable: montar EFS en EC2 Linux</h2>
<p>Este ejemplo parte de un sistema de archivos EFS existente y muestra el flujo y los puntos que debes verificar. Usa valores ficticios: sustituye <code>fs-EXAMPLE</code> por un sistema de archivos que puedas probar sin afectar datos de producción.</p>

<h3 id="requisitos-montaje">Requisitos antes de ejecutar comandos</h3>
<ul>
<li>Una instancia EC2 Linux compatible y un sistema EFS en la misma región.</li>
<li>Un mount target de EFS en una zona accesible por la instancia. Para EFS Regional, crea uno por cada zona desde la que accederás; para One Zone, debe estar en la única zona del sistema.</li>
<li>Un grupo de seguridad de la instancia con salida TCP 2049 hacia el grupo de seguridad de los mount targets, y una regla de entrada TCP 2049 en los mount targets cuyo origen sea el grupo de la instancia.</li>
<li>El paquete <code>amazon-efs-utils</code> instalado según la distribución. AWS recomienda el mount helper; EFS no admite montarse desde una instancia EC2 Windows.</li>
<li>Red y DNS que permitan a la instancia llegar al mount target. El helper con <code>tls</code> cifra el tránsito entre el cliente y EFS. El montaje básico sin <code>iam</code> solo funcionará si la política del sistema permite ese acceso. Con <code>iam</code>, el helper identifica al cliente mediante su rol y EFS evalúa las políticas de identidad y del sistema de archivos para autorizar el acceso; no es obligatorio otorgar el mismo permiso en ambas. En ambos casos, los permisos POSIX del sistema de archivos siguen aplicando. Consulta <a href="https://docs.aws.amazon.com/efs/latest/ug/iam-access-control-nfs-efs.html">cómo EFS autoriza a los clientes NFS</a>.</li>
</ul>
<p>La regla de TCP 2049 no se abre a Internet: limita el origen al grupo de seguridad de los clientes. La documentación de AWS resume estas reglas en <a href="https://docs.aws.amazon.com/efs/latest/ug/network-access.html" rel="noopener noreferrer" target="_blank">acceso de red con grupos de seguridad</a>.</p>

<h3 id="comandos-montaje">Montar y comprobar</h3>
<pre><code># Ejecutar en la instancia EC2 Linux
sudo mkdir -p /mnt/efs
sudo mount -t efs -o tls fs-EXAMPLE /mnt/efs

# Comprueba el montaje; el tipo esperado es nfs4
mountpoint /mnt/efs
findmnt -no FSTYPE /mnt/efs
TEST_FILE=$(sudo mktemp /mnt/efs/aws-efs-demo.XXXXXX)
printf 'prueba-efs\n' | sudo tee "$TEST_FILE" &gt; /dev/null
sudo cat "$TEST_FILE"
</code></pre>
<p>La primera comprobación confirma que el punto está montado; la segunda muestra el tipo de sistema de archivos, normalmente <code>nfs4</code>; la escritura y lectura comprueban que el cliente puede usar el sistema de archivos. Para montar automáticamente después de un reinicio, añade una entrada con <code>_netdev</code> a <code>/etc/fstab</code> y valida con <code>sudo mount -a</code> antes de reiniciar:</p>
<pre><code>fs-EXAMPLE:/ /mnt/efs efs _netdev,tls,nofail 0 0</code></pre>
<p>El helper usa NFS por debajo y EFS admite NFSv4.0 y NFSv4.1. Si necesitas montar con el cliente NFS estándar, sigue la <a href="https://docs.aws.amazon.com/efs/latest/ug/mounting-fs.html" rel="noopener noreferrer" target="_blank">guía oficial de montaje</a> y conserva la verificación de red y de la versión NFS.</p>

<h3 id="limpiar-montaje">Limpiar una prueba</h3>
<p>En la misma sesión, elimina solo el archivo temporal que guardaste en <code>TEST_FILE</code> y desmonta antes de retirar el sistema. Si añadiste la entrada a <code>/etc/fstab</code> para una prueba temporal, retírala para que no intente montar un recurso eliminado:</p>
<pre><code>sudo rm -- "$TEST_FILE"
sudo umount /mnt/efs
</code></pre>
<p>Si el EFS era temporal, conserva primero cualquier dato que necesites. La consola puede eliminar el sistema y sus mount targets; con la CLI debes eliminar antes todos los mount targets y access points asociados. La eliminación es destructiva y no se puede deshacer: sigue <a href="https://docs.aws.amazon.com/efs/latest/ug/delete-efs-fs.html" rel="noopener noreferrer" target="_blank">la guía de eliminación de EFS</a> y comprueba que ningún cliente o servicio lo usa.</p>

<h2 id="precios-rendimiento-backups">Precios, rendimiento y copias: qué comparar</h2>
<h3 id="precios">Precios</h3>
<p>EFS factura según el tipo de sistema, clases de almacenamiento, throughput, actividad de acceso o tiering, backups y transferencia. Elastic throughput escala con el tráfico, mientras que Provisioned cobra una capacidad de throughput configurada; el precio depende de la región. Las conexiones a un mount target de otra zona pueden añadir transferencia.</p>
<p>FSx no tiene un precio único: Windows, Lustre, ONTAP y OpenZFS cobran combinaciones diferentes de capacidad o datos almacenados, throughput, IOPS, backups y transferencia. En algunos productos eliges capacidad aprovisionada; en otros existen clases elásticas. Usa la <a href="https://aws.amazon.com/efs/pricing/" rel="noopener noreferrer" target="_blank">página de precios de EFS</a>, la <a href="https://aws.amazon.com/fsx/pricing/" rel="noopener noreferrer" target="_blank">página de precios de FSx</a> y la calculadora para la región y el despliegue exactos. No extrapoles una tarifa de FSx para Windows a Lustre, ONTAP u OpenZFS.</p>
<h3 id="rendimiento">Rendimiento</h3>
<p>Selecciona el throughput y la clase a partir de métricas reales: tamaño de archivos, lecturas, escrituras, metadatos, clientes y latencia. Los máximos publicados por AWS cambian por región, modo, cliente y generación del producto. Las cifras de la documentación son límites o diseños de referencia, no una garantía para todas las cargas.</p>
<h3 id="backups">Backups y recuperación</h3>
<p>EFS se integra con AWS Backup. AWS documenta backups automáticos para los sistemas One Zone y permite restaurar un backup a una zona operativa o a otra región; revisa la política de backup y prueba una restauración para el caso Regional que uses. FSx ofrece backups nativos y, según el producto y la región, integración con AWS Backup. El backup no reemplaza una prueba: verifica que los permisos, rutas, clientes y datos que la aplicación necesita vuelvan a funcionar.</p>
<p>Para diseñar la política, consulta <a href="https://docs.aws.amazon.com/efs/latest/ug/awsbackup.html" rel="noopener noreferrer" target="_blank">backups de EFS</a> y la <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/backup-feature-availability.html" rel="noopener noreferrer" target="_blank">matriz de compatibilidad de AWS Backup</a>. Los recursos temporales de una prueba también generan cargos si permanecen activos.</p>

<h2 id="recursos-comunidad">Recursos y comunidad en español</h2>
<p>Estas grabaciones complementan la documentación oficial con ejemplos y lenguaje en español:</p>
<ul>
<li><a href="https://www.youtube.com/watch?v=GqYKhnqDDeI" rel="noopener noreferrer" target="_blank"><strong>AWS UG Buenos Aires: EBS, EFS, S3 y monitoreo</strong></a> compara almacenamiento de bloques, archivos y objetos. Es una buena introducción antes de decidir entre EBS, EFS y S3; el contenido es una grabación, no una referencia de precios actuales.</li>
<li><a href="https://www.youtube.com/watch?v=-ZK2SwC0n1Q" rel="noopener noreferrer" target="_blank"><strong>Conociendo más de discos compartidos: AWS EFS, AWS FSx y AWS Backup</strong></a>, de AWS Girls Perú, conecta los servicios con datos compartidos y copias. Contrasta sus ejemplos con la documentación vigente de cada producto.</li>
<li><a href="https://www.youtube.com/watch?v=J8OrxPPeSPs" rel="noopener noreferrer" target="_blank"><strong>Grupo de estudio: EFS para AWS Solutions Architect Associate</strong></a>, del AWS User Group Guatemala, ayuda a practicar la decisión de EFS en escenarios de certificación; no sustituye las cuotas y opciones actuales.</li>
<li><a href="https://www.youtube.com/watch?v=urfLdkPLuPc" rel="noopener noreferrer" target="_blank"><strong>Introducción al almacenamiento en AWS</strong></a>, de Marcia Villalba — Desplegando Cloud, sirve para repasar las categorías antes de profundizar en EFS o FSx.</li>
<li><a href="https://www.youtube.com/watch?v=t3WW-dcnGEk" rel="noopener noreferrer" target="_blank"><strong>Practitioner, Una Nueva Esperanza: Amazon EBS y Amazon EFS</strong></a>, de AWS Women Colombia, ayuda a fijar la diferencia entre bloques y archivos antes de elegir EFS. Puedes continuar en su <a href="https://awswomencolombia.com/" rel="noopener noreferrer" target="_blank">sitio de comunidad</a> y <a href="https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw" rel="noopener noreferrer" target="_blank">canal de YouTube</a>.</li>
</ul>
<p>Para ampliar dudas o encontrar charlas, puedes seguir el <a href="https://www.youtube.com/@awsugbsas" rel="noopener noreferrer" target="_blank">canal de AWS User Group Buenos Aires</a> y su <a href="https://www.meetup.com/aws-user-group-buenos-aires/" rel="noopener noreferrer" target="_blank">grupo de Meetup</a>; consultar el <a href="https://awsgirlsperu.com/" rel="noopener noreferrer" target="_blank">sitio de AWS Girls Perú</a> y su <a href="https://www.meetup.com/aws-girls-peru/" rel="noopener noreferrer" target="_blank">Meetup</a>; o participar en el <a href="https://www.meetup.com/aws-guatemala/" rel="noopener noreferrer" target="_blank">AWS User Group Guatemala</a> y su <a href="https://www.youtube.com/@awsugguatemala" rel="noopener noreferrer" target="_blank">canal de YouTube</a>. Son espacios para preguntar y seguir sesiones; confirma siempre fecha, modalidad y condiciones de cada actividad.</p>
<p>Para continuar con una aplicación concreta, revisa <a href="https://dondeaprendoaws.com/blog/como-usar-aws-transfer-family-con-amazon-efs/">Cómo configurar AWS Transfer Family con Amazon EFS por SFTP</a>. Si tu decisión es de contenedores, consulta <a href="https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/">Cómo desplegar contenedores en AWS</a> y valida por separado el volumen y el controlador que usará tu plataforma. La <a href="/eventos/">agenda de eventos AWS</a> permite buscar talleres y charlas de comunidades; confirma fecha, modalidad y disponibilidad en la ficha antes de asistir.</p>

<h2 id="conclusion">Conclusión</h2>
<p>Usa EFS cuando necesitas un sistema NFS compartido y elástico para clientes Linux, y decide primero entre Regional y One Zone. Usa FSx cuando necesitas las funciones y el protocolo de un sistema concreto: Windows File Server para SMB y Active Directory, Lustre para procesamiento paralelo, ONTAP para compatibilidad NetApp y multiprotocolo, u OpenZFS para NFS y capacidades de ZFS.</p>
<p>Compara el despliegue específico, las clases, el throughput, la resiliencia, los backups y la transferencia. Si lo que necesitas es un dispositivo de bloques para EC2 o una API de objetos, cambia de categoría y evalúa EBS o S3. La decisión correcta es la que coincide con la interfaz que la aplicación ya necesita y con el fallo que tu operación puede aceptar.</p>

<h2 id="preguntas-frecuentes">Preguntas frecuentes</h2>
<h3 id="efs-windows">¿Puedo montar EFS desde Windows?</h3>
<p>AWS no admite montar EFS desde instancias EC2 Windows. Para recursos compartidos SMB y aplicaciones Windows, evalúa FSx para Windows File Server.</p>
<h3 id="efs-nfs-2049">¿Qué puerto necesita EFS?</h3>
<p>El cliente debe poder conectarse al mount target por TCP 2049. Permite salida desde el grupo de la instancia y entrada en el grupo del mount target con el grupo de la instancia como origen; no abras el puerto a Internet.</p>
<h3 id="fsx-multiaz">¿FSx siempre es Multi-AZ?</h3>
<p>No. Windows File Server y ONTAP tienen opciones Single-AZ y Multi-AZ; OpenZFS distingue Multi-AZ (HA), Single-AZ (HA) y Single-AZ (no HA); Lustre usa opciones scratch y persistent con modelos de replicación propios. Comprueba el producto y la región concretos.</p>
<h3 id="borrar-efs">¿Qué debo borrar al terminar una prueba de EFS?</h3>
<p>Desmonta el sistema y elimina los archivos temporales. Si vas a borrar el recurso, confirma los datos, access points y clientes dependientes; con la CLI elimina antes mount targets y access points. La eliminación del sistema es irreversible.</p>
