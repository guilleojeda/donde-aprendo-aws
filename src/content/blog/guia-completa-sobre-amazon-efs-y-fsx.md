---
title: "Guía Completa sobre Amazon EFS y FSX"
description: "Una guía completa sobre Amazon EFS y FSX, comparando características, casos de uso y cómo implementar y administrar estos servicios de almacenamiento en la nube de AWS."
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T01:14:24.835Z"
cover: "/assets/blog/9018003cbe19f3288dffc90d.jpg"
coverAlt: "Thumbnail for: Guía Completa sobre Amazon EFS y FSX"
ogImage: "/assets/blog/9018003cbe19f3288dffc90d.jpg"
related:
  - title: "Checklist: Servicios AWS Esenciales para SAA-C03"
    url: "https://dondeaprendoaws.com/blog/checklist-servicios-aws-esenciales-para-saa-c03/"
    image: "/assets/blog/eadb9eb1eb9dfe22a3da22e2.jpg"
    imageAlt: ""
  - title: "AWS Lambda: Costo vs. Rendimiento"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/"
    image: "/assets/blog/e7d2b8371eaa07e84e5400f5.jpg"
    imageAlt: ""
  - title: "Nube AWS: Guía de Inicio Rápido"
    url: "https://dondeaprendoaws.com/blog/nube-aws-guia-de-inicio-rapido/"
    image: "/assets/blog/c182a819b0d8523e5365c545.jpg"
    imageAlt: ""
---

<p>Si estás explorando opciones de almacenamiento en la nube de AWS y te preguntas entre <strong>Amazon EFS</strong> y <strong>Amazon FSx</strong>, este resumen es para ti. Ambos servicios te permiten guardar archivos en la nube, pero están diseñados para necesidades diferentes. Aquí te doy un vistazo rápido a lo que necesitas saber:</p>


<ul>
<li><strong>Amazon EFS</strong> es ideal para aplicaciones escalables que requieren compartir archivos entre múltiples instancias. Se ajusta automáticamente en tamaño y rendimiento.</li>
<li><a href="https://aws.amazon.com/es/fsx/windows/" rel="noopener noreferrer" target="_blank"><strong>Amazon FSx</strong></a> ofrece soluciones de almacenamiento más especializadas, incluyendo opciones para Windows File Server, Lustre, NetApp ONTAP y OpenZFS, cada una diseñada para casos de uso específicos como alto rendimiento o compatibilidad con sistemas operativos.</li>
</ul>


<h3 id="comparaci%C3%B3n-r%C3%A1pida" tabindex="-1">Comparación rápida</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>EFS</th>
<th>FSx para Windows</th>
<th>FSx para Lustre</th>
</tr>
</thead>
<tbody>
<tr>
<td>Escalabilidad</td>
<td>Automática</td>
<td>Configurable</td>
<td>Configurable</td>
</tr>
<tr>
<td>Rendimiento</td>
<td>Ajustable</td>
<td>Alto por defecto</td>
<td>Muy alto para datos grandes</td>
</tr>
<tr>
<td>Protocolos compatibles</td>
<td>NFSv4.1</td>
<td>SMB, NTFS</td>
<td>NFSv3, POSIX</td>
</tr>
<tr>
<td>Sistemas operativos soportados</td>
<td>Linux</td>
<td>Windows Server</td>
<td>Linux</td>
</tr>
<tr>
<td>Casos de uso comunes</td>
<td>Aplicaciones contenerizadas, Big Data</td>
<td>Archivos de Windows, ASP.NET</td>
<td>Inteligencia artificial, análisis de grandes datos</td>
</tr>
</tbody>
</table></figure>


<p>Ya sea que busques flexibilidad y escalabilidad con <strong>EFS</strong> o necesites un rendimiento especializado y opciones para Windows o Linux con <strong>FSx</strong>, AWS tiene una solución para tus necesidades de almacenamiento en la nube.</p>


<h3 id="caracter%C3%ADsticas-principales" tabindex="-1">Características principales</h3>


<p>Amazon EFS te da un lugar en la nube donde puedes guardar tus archivos y no te tienes que preocupar por quedarte sin espacio. Aquí tienes lo más importante:</p>


<ul>
<li><strong>Escalabilidad automática</strong>: Amazon EFS crece o se reduce automáticamente según cuánto guardes o borres, sin que tengas que hacer nada especial.</li>
<li><strong>Rendimiento ajustable</strong>: Puedes hacer que EFS trabaje más rápido según lo necesites, eligiendo cuánto quieres que maneje por cada GB de datos que guardes.</li>
<li><strong>Miles de conexiones simultáneas</strong>: EFS permite que muchas computadoras se conecten al mismo tiempo para leer y escribir archivos. Esto es genial para trabajos que requieren que muchas máquinas trabajen juntas.</li>
<li><strong>Crecimiento ilimitado</strong>: Con EFS puedes guardar todos los datos y archivos que quieras, y seguirá creciendo sin límites.</li>
</ul>


<h3 id="casos-de-uso-comunes" tabindex="-1">Casos de uso comunes</h3>


<p>Amazon EFS es útil para muchas cosas, como:</p>


<ul>
<li><strong>Aplicaciones contenerizadas</strong>: EFS es perfecto para aplicaciones que usan contenedores y se manejan con herramientas como Amazon ECS, Amazon EKS, y Kubernetes. Les da un lugar común para guardar datos.</li>
<li><strong>Procesamiento de big data</strong>: Para analizar grandes cantidades de datos, muchas veces se necesita que varias computadoras accedan a los mismos datos al mismo tiempo. EFS es ideal para esto.</li>
<li><strong>Medios y entretenimiento</strong>: Si trabajas con video, gráficos o cualquier cosa que requiera mucho rendimiento y espacio, EFS te puede ayudar gracias a su capacidad para manejar muchas conexiones y su gran escalabilidad.</li>
<li><strong>Copias de seguridad y recuperación</strong>: Puedes hacer copias de seguridad de tus datos en EFS de manera rápida y segura usando AWS Backup. También te permite recuperar archivos y carpetas específicos cuando lo necesites.</li>
</ul>


<h2 id="amazon-fsx%3A-almacenamiento-para-windows-y-linux-explicado-de-manera-sencilla" tabindex="-1"><a href="https://aws.amazon.com/es/fsx/windows/" rel="noopener noreferrer" target="_blank">Amazon FSx</a>: Almacenamiento para Windows y Linux explicado de manera sencilla</h2>


<p><figure><img alt="Amazon FSx" src="/assets/blog/f1273e97953b9613f0a27385.jpg"/></figure></p>


<p>FSx te ofrece dos opciones principales: FSx para Windows File Server y FSx para Lustre. Cada una está pensada para necesidades específicas.</p>


<h3 id="fsx-para-windows-file-server" tabindex="-1">FSx para Windows File Server</h3>


<p>Imagínate que necesitas un lugar especial para guardar y compartir archivos que solo funcionan en Windows, como documentos de Office o sitios web que usan ASP.NET. FSx para Windows File Server es perfecto para eso. Es como un disco duro en la nube que entiende y trabaja bien con todo lo que es de Windows.</p>


<p>Lo que lo hace especial:</p>


<ul>
<li>Entiende perfectamente el lenguaje de Windows (SMB y NTFS)</li>
<li>Puede trabajar con el sistema de identidades de Windows (Active Directory)</li>
<li>Hace copias de seguridad por ti y te permite recuperar tus archivos fácilmente</li>
<li>Puede enviar tus archivos a otras zonas de AWS para mantenerlos seguros</li>
<li>Usa grupos de seguridad que ayudan a que tus archivos estén a salvo y solo los vean quienes tú quieras</li>
</ul>


<p>Es muy útil para empresas que usan programas y archivos de Windows y quieren mantener todo organizado y seguro en la nube.</p>


<h3 id="fsx-para-lustre" tabindex="-1">FSx para Lustre</h3>


<p>Ahora, si lo tuyo es hacer cosas como entrenar modelos para inteligencia artificial, editar videos, analizar mucha información o hacer cálculos complejos, FSx para Lustre es tu mejor opción. Es súper rápido y puede manejar muchísima información al mismo tiempo.</p>


<p>Lo que lo hace brillar:</p>


<ul>
<li>Es rapidísimo y puede manejar un montón de datos a la vez</li>
<li>Se lleva bien con S3, lo que significa que puedes guardar ahí lo que no te cabe</li>
<li>Si necesitas más espacio o velocidad, lo puedes ampliar fácilmente</li>
</ul>


<p>Por ejemplo, si estás trabajando en un proyecto grande de datos y necesitas que muchas computadoras trabajen juntas en lo mismo, FSx para Lustre hace que todo sea más fácil y rápido.</p>


<p>En resumen, FSx te da opciones para guardar tus archivos en la nube, ya sean de Windows o para proyectos grandes y rápidos. Te ayuda a mantener todo organizado, seguro y accesible.</p>


<h2 id="comparativa%3A-%C2%BFefs-o-fsx%3F" tabindex="-1">Comparativa: ¿EFS o FSx?</h2>


<p>Vamos a ver las diferencias principales entre EFS y FSx de una manera sencilla, para que puedas entender cuál te conviene más.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>EFS</th>
<th>FSx para Windows</th>
<th>FSx para Lustre</th>
</tr>
</thead>
<tbody>
<tr>
<td>Escalabilidad</td>
<td>Crece automáticamente</td>
<td>Se ajusta, pero tú decides cuánto</td>
<td>Se ajusta, pero tú decides cuánto</td>
</tr>
<tr>
<td>Rendimiento</td>
<td>Tú decides cuánto quieres que sea rápido</td>
<td>Ya viene rápido</td>
<td>Muy rápido para trabajos grandes</td>
</tr>
<tr>
<td>Protocolos compatibles</td>
<td>NFSv4.1</td>
<td>SMB, NTFS</td>
<td>NFSv3, POSIX</td>
</tr>
<tr>
<td>Sistemas operativos soportados</td>
<td>Linux</td>
<td>Windows Server</td>
<td>Linux</td>
</tr>
<tr>
<td>Casos de uso comunes</td>
<td>Todo tipo de trabajos</td>
<td>Para cosas de Windows</td>
<td>Para trabajos de datos grandes y rápidos</td>
</tr>
</tbody>
</table></figure>


<p><strong>Escalabilidad</strong></p>


<ul>
<li>EFS crece solo. Cuanto más guardes, más grande se hace.</li>
<li>FSx te deja elegir cuánto quieres que crezca.</li>
</ul>


<p><strong>Rendimiento</strong></p>


<ul>
<li>En EFS, tú decides cuánto quieres pagar para que sea más rápido.</li>
<li>FSx para Windows ya viene configurado para ser rápido.</li>
<li>FSx para Lustre es la opción para cuando necesitas mucha velocidad.</li>
</ul>


<p><strong>Protocolos y Sistemas Operativos</strong></p>


<ul>
<li>EFS usa NFSv4.1, que es común en Linux.</li>
<li>FSx para Windows usa SMB y NTFS, que son de Windows.</li>
<li>FSx para Lustre trabaja con NFSv3 y POSIX, también de Linux.</li>
</ul>


<p><strong>Casos de Uso</strong></p>


<ul>
<li>EFS es bueno para una variedad de trabajos, como aplicaciones que usan muchos datos o necesitan hacer copias de seguridad.</li>
<li>FSx para Windows es ideal para cuando trabajas con archivos de Windows o programas como ASP.NET.</li>
<li>FSx para Lustre es para cuando tienes trabajos de datos grandes que necesitan mucha velocidad, como inteligencia artificial o análisis de grandes cantidades de información.</li>
</ul>


<p>En pocas palabras, si necesitas un lugar flexible para guardar tus datos, EFS es una buena opción. Si trabajas mucho con Windows, FSx para Windows es lo tuyo. Y si lo tuyo son los trabajos de datos grandes y rápidos, entonces FSx para Lustre es tu mejor elección.</p>


<h2 id="implementaci%C3%B3n-y-administraci%C3%B3n" tabindex="-1">Implementación y administración</h2>


<h3 id="creando-un-sistema-de-archivos-efs" tabindex="-1">Creando un sistema de archivos EFS</h3>


<p>Para empezar con Amazon EFS, tienes dos caminos:</p>


<ul>
<li><strong>Usando la consola de AWS</strong>:</li>
<li>Primero, entra a la consola de AWS y busca Amazon EFS.</li>
<li>Luego, haz clic en "Crear sistema de archivos".</li>
<li>Escoge la VPC y las subredes que quieras usar.</li>
<li>Ajusta los grupos de seguridad de Amazon VPC.</li>
<li>Decide cómo quieres que sea el rendimiento.</li>
<li>Revisa todo y dale a "Crear".</li>
<li><strong>A través de CloudFormation</strong>:</li>
<li>Prepara una plantilla de CloudFormation con todos los detalles de EFS.</li>
<li>Asegúrate de incluir cosas como la VPC, subredes, seguridad y cómo quieres que sea el rendimiento.</li>
<li>Usa CloudFormation para poner en marcha tu sistema de archivos EFS.</li>
</ul>


<p>Recuerda que es clave seleccionar bien la VPC, las subredes y los grupos de seguridad para controlar quién puede acceder a EFS. También es bueno pensar en cuánto rendimiento necesitarás desde el principio.</p>


<h3 id="montando-un-sistema-de-archivos-efs" tabindex="-1">Montando un sistema de archivos EFS</h3>


<p>Después de crear tu sistema de archivos EFS, necesitas conectarlo a tus instancias EC2 para usarlo.</p>


<p><strong>Para instancias Linux</strong>:</p>


<ul>
<li>Necesitas instalar <code class="inline-code">nfs-utils</code>.</li>
<li>Luego, con el comando <code class="inline-code">mount</code>, conectas el sistema de archivos EFS poniendo el ID del sistema y dónde lo quieres montar.</li>
</ul>


<p><strong>Para instancias Windows</strong>:</p>


<ul>
<li>Instala el <a href="https://docs.aws.amazon.com/efs/latest/ug/using-amazon-efs-utils.html" rel="noopener noreferrer" target="_blank">Amazon EFS Utils</a>.</li>
<li>Conecta el sistema de archivos EFS como si fuera una unidad de red, usando el ID del sistema.</li>
</ul>


<p>Es una buena idea hacer que el sistema de archivos EFS se conecte automáticamente cada vez que arranques tus instancias EC2. En Linux, puedes editar el archivo <code class="inline-code">/etc/fstab</code> para hacerlo. En Windows, puedes mapear una unidad de red que se mantenga entre reinicios.</p>


<p>También puedes hacer que el proceso de montaje sea automático usando herramientas como CloudFormation o Terraform cuando estés configurando tus instancias.</p>




<h2 id="optimizaci%C3%B3n-de-costos-y-rendimiento" tabindex="-1">Optimización de costos y rendimiento</h2>


<p>Para que Amazon EFS y Amazon FSx te cuesten menos y funcionen mejor, aquí van unos consejos sencillos:</p>


<h3 id="escalado-autom%C3%A1tico" tabindex="-1">Escalado automático</h3>


<ul>
<li>En EFS, puedes hacer que se ajuste solo según cuánto lo uses. Así, si necesitas más espacio o menos, EFS se encarga por ti.</li>
<li>Con FSx, puedes hacer que se añadan más instancias automáticamente si ves que necesitas más capacidad.</li>
</ul>


<h3 id="ajustes-de-rendimiento" tabindex="-1">Ajustes de rendimiento</h3>


<ul>
<li>Para EFS, si tus necesidades cambian mucho, usa el modo "bursting". Es más barato que pagar por un rendimiento alto todo el tiempo.</li>
<li>Si usas FSx para Windows y necesitas más velocidad, elige una opción que ofrezca más IOPS.</li>
<li>Con FSx para Lustre, si tu trabajo es muy demandante, opta por SSD de alto rendimiento.</li>
</ul>


<h3 id="copias-de-seguridad-y-archivado" tabindex="-1">Copias de seguridad y archivado</h3>


<ul>
<li>Aprovecha que EFS y FSx se pueden conectar fácil con AWS Backup para hacer copias de seguridad sin gastar mucho.</li>
<li>Si tienes datos viejos, guárdalos en Amazon S3 Glacier. Es una forma de ahorrar en almacenamiento.</li>
</ul>


<h3 id="despliegues-multi-az" tabindex="-1">Despliegues Multi-AZ</h3>


<ul>
<li>Usar Multi-AZ hace que tus datos se guarden en diferentes lugares para más seguridad. Pero, si puedes permitirte pequeñas pausas, elige Single-AZ para ahorrar.</li>
</ul>


<h3 id="life-cycle-management" tabindex="-1">Life Cycle Management</h3>


<p>Pon reglas para:</p>


<ul>
<li>Mover datos viejos a lugares más baratos automáticamente.</li>
<li>Borrar datos que ya no uses después de cierto tiempo.</li>
</ul>


<p>Siguiendo estos consejos, puedes conseguir que EFS y FSx te den un buen rendimiento sin que te cuesten una fortuna.</p>


<h2 id="conclusi%C3%B3n" tabindex="-1">Conclusión</h2>


<p>Amazon EFS y Amazon FSx son dos servicios de AWS que te ayudan a guardar tus archivos en la nube, pero cada uno funciona de manera un poco diferente.</p>


<p><strong>Amazon EFS</strong> es muy flexible. Se agranda automáticamente cuando subes más cosas y permite que muchas computadoras accedan a los mismos archivos al mismo tiempo. Es perfecto para aplicaciones que necesitan compartir datos, como sitios web o proyectos de análisis de datos grandes.</p>


<p><strong>Amazon FSx</strong> está más especializado. Tiene versiones para archivos de Windows y para proyectos que necesitan procesar datos muy rápido, como inteligencia artificial. Es como tener un sistema de archivos que ya sabe trabajar bien con Windows o que puede manejar mucha información rápidamente.</p>


<p>Cuando estés decidiendo entre EFS y FSx, piensa en qué tanto necesitas que tu almacenamiento crezca automáticamente, qué tan rápido necesitas que sea, con qué sistemas operativos debe ser compatible y para qué lo vas a usar:</p>


<ul>
<li>EFS es genial si tienes muchos datos y necesitas que crezca sin preocuparte. Además, puedes ajustar cuánto quieres gastar en rendimiento.</li>
<li>FSx te da opciones especializadas. Si trabajas mucho con Windows, FSx para Windows es ideal. Si tu trabajo implica analizar muchos datos rápidamente, entonces FSx para Lustre es lo que necesitas.</li>
</ul>


<p>En resumen, si tu proyecto es bastante general y esperas que crezca mucho, EFS puede ser tu mejor opción. Si necesitas algo más específico para Windows o para análisis de datos de alto rendimiento, entonces FSx podría ser mejor para ti.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-es-amazon-fsx%3F" tabindex="-1">¿Qué es Amazon FSx?</h3>


<p>Amazon FSx es un servicio de AWS que te permite tener sistemas de archivos en la nube, tanto para Windows como para Linux. Es como tener un disco duro en internet que puedes usar para varias cosas:</p>


<ul>
<li>Es fácil de configurar.</li>
<li>Funciona rápido y bien.</li>
<li>Es seguro y puedes confiar en él.</li>
<li>Funciona con otros servicios de AWS.</li>
<li>Hay opciones para usarlo con Windows, Linux y otros sistemas.</li>
</ul>


<p>Es muy útil para cuando tienes aplicaciones en internet, sitios web o cualquier cosa que necesite que varios usuarios accedan a los mismos archivos.</p>


<h3 id="%C2%BFqu%C3%A9-es-fsx%3F" tabindex="-1">¿Qué es FSX?</h3>


<p>FSX se refiere a "Flight Simulator X", un juego de simulación de vuelo hecho por Microsoft. Lanzado en 2006, es la décima versión de la serie Flight Simulator.</p>


<p>Te permite volar aviones de manera virtual, con gráficos que se ven muy reales, un montón de aviones para elegir, ciudades y paisajes detallados, y el clima que cambia. Mucha gente lo considera uno de los mejores simuladores de vuelo disponibles para el público general.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ecs/">Mejores Prácticas Para Amazon ECS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-s3/">Mejores Prácticas Para Amazon S3</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">AWS Fundamentos: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/opciones-para-desplegar-contenedores-en-aws-ecs-y-eks/">Opciones para Desplegar Contenedores en AWS: ECS y EKS</a></li>
</ul>
</p>
