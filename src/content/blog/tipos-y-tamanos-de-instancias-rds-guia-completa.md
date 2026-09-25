---
title: "Tipos y Tamaños de Instancias RDS: Guía Completa"
description: "Descubre todo lo que necesitas saber sobre los tipos y tamaños de instancias RDS en esta guía completa. Aprende sobre Amazon RDS, características clave, opciones de almacenamiento, comparación con Aurora y más."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T00:25:35.456Z"
cover: "/assets/blog/ad2ff3daa90f3b8701cd3eb8.png"
coverAlt: "Thumbnail for: Tipos y Tamaños de Instancias RDS: Guía Completa"
ogImage: "/assets/blog/ad2ff3daa90f3b8701cd3eb8.png"
related:
  - title: "Detección de Sesgos en Modelos ML con SageMaker Clarify"
    url: "https://dondeaprendoaws.com/blog/deteccion-de-sesgos-en-modelos-ml-con-sagemaker-clarify/"
    image: "/assets/blog/055e62c5fbddebf94a936e62.jpg"
    imageAlt: ""
  - title: "Cifrado de datos con AWS KMS: Guía práctica"
    url: "https://dondeaprendoaws.com/blog/cifrado-de-datos-con-aws-kms-guia-practica/"
    image: "/assets/blog/8879f0457d281038d09e5222.png"
    imageAlt: ""
  - title: "Cómo Utilizar ElasticSearch en AWS"
    url: "https://dondeaprendoaws.com/blog/como-utilizar-elasticsearch-en-aws/"
    image: "/assets/blog/17fe006845acd8b3930b23c8.jpg"
    imageAlt: ""
---

<p>Si estás buscando el tipo y tamaño de instancia RDS adecuado para tu proyecto, este artículo es para ti. Aquí encontrarás todo lo que necesitas saber sobre Amazon RDS, desde conceptos básicos hasta consejos para elegir la mejor opción para tu aplicación. Vamos a desglosarlo de manera simple:</p>
<ul><li><strong>Amazon RDS</strong> facilita el uso de bases de datos en la nube, manejando tareas complicadas por ti.</li><li>Las <strong>instancias RDS</strong> vienen en diferentes tipos y tamaños, adecuados para diversos usos, como desarrollo, pruebas y producción.</li><li>Hay dos grandes categorías: <strong>Uso General</strong> y <strong>Optimizadas para Memoria</strong>.</li><li>Las características clave incluyen <strong>Créditos CPU</strong>, <strong>Opciones de almacenamiento</strong>, y <strong>Redes mejoradas</strong>.</li><li>El <strong>almacenamiento en Amazon RDS</strong> ofrece varias opciones, como SSD de uso general y SSD de IOPS aprovisionadas.</li><li>Para elegir correctamente, considera aspectos como la <strong>CPU</strong>, <strong>memoria</strong>, <strong>almacenamiento</strong>, y <strong>rendimiento de red</strong> que tu proyecto requiere.</li><li><strong>RDS</strong> y <strong>Aurora</strong> se comparan en términos de infraestructura, escalabilidad, rendimiento y seguridad, siendo Aurora la opción más potente para proyectos que necesitan escalabilidad y alto rendimiento.</li></ul>
<p>Este resumen te da una visión clara de lo que necesitas considerar al seleccionar tu instancia RDS, garantizando que tu elección se alinee con los requisitos y objetivos de tu aplicación.</p>
<h3 id="definici%C3%B3n-de-una-instancia-rds">Definición de una instancia RDS</h3>
<p>Una instancia RDS es básicamente una base de datos que funciona en internet, en un espacio propio y seguro. Lo que la hace especial es:</p>
<ul><li><strong>Espacio propio y seguro</strong>: Cada instancia RDS funciona por su cuenta, lejos de otras, lo que la hace segura y confiable.</li><li><strong>Fácil de manejar</strong>: Con RDS, olvídate de las complicaciones de mantener tu base de datos al día. Amazon se encarga de las actualizaciones y de mantener todo funcionando bien.</li><li><strong>Siempre disponible</strong>: Puedes hacer que tu base de datos esté en varios lugares al mismo tiempo para que, si uno falla, el otro siga funcionando.</li><li><strong>Se ajusta a tus necesidades</strong>: Si necesitas más espacio o capacidad, es fácil hacer cambios para que tu base de datos crezca contigo.</li></ul>
<h3 id="ventajas-de-usar-rds">Ventajas de usar RDS</h3>
<p>Las razones principales para usar Amazon RDS en vez de manejar tu base de datos tú mismo son:</p>
<ul><li><strong>Es más fácil</strong>: RDS se encarga de las partes difíciles como hacer copias de seguridad y actualizar el sistema.</li><li><strong>Ahorras dinero</strong>: Pagas solo por lo que usas, lo que puede ayudarte a ahorrar.</li><li><strong>Siempre activo</strong>: Configurar que tu base de datos esté en varios lugares para más seguridad es fácil y no cuesta más.</li><li><strong>Flexible</strong>: Puedes hacer tu base de datos más grande o más pequeña según lo necesites, sin complicaciones.</li><li><strong>Seguro</strong>: RDS viene con muchas opciones de seguridad para proteger tu información.</li></ul>
<p>En pocas palabras, Amazon RDS te da un servicio de base de datos que se maneja solo, es seguro y siempre está disponible. Esto significa que puedes concentrarte más en tu trabajo y menos en los problemas técnicos.</p>
<h2 id="tipos-de-instancias-rds"><a href="https://aws.amazon.com/es/rds/instance-types/">Tipos de Instancias RDS</a></h2>
<p><img alt="Tipos de Instancias RDS" src="/assets/blog/91cafa14c4079de7a4e4d066.jpg"/></p>
<p>Amazon RDS te ofrece dos grandes grupos de instancias: las que son para uso general y las que están optimizadas para usar mucha memoria. Cada tipo se crea pensando en necesidades diferentes.</p>
<h3 id="uso-general">Uso General</h3>
<p>Las instancias de uso general tienen un equilibrio entre CPU, memoria y capacidad de procesamiento, lo que las hace adecuadas para la mayoría de las bases de datos. Si no tienes necesidades muy específicas, estas podrían ser una buena opción.</p>
<p>Aquí tienes algunos ejemplos:</p>
<ul><li><strong>T4g</strong>: Usan un tipo de procesador llamado Arm Graviton2, que ayuda a que el costo sea más bajo.</li><li><strong>T3</strong>: Aumentan su rendimiento automáticamente cuando es necesario.</li><li><strong>T2</strong>: Son económicas y ofrecen recursos básicos.</li><li><strong>M7g</strong>: Utilizan procesadores AMD EPYC de última generación.</li><li><strong>M6i</strong>: Vienen con los más recientes procesadores Intel Ice Lake.</li><li><strong>M6g</strong>: También usan el procesador Arm Graviton2.</li><li><strong>M5</strong>: Tienen un buen equilibrio de recursos con procesadores Intel Skylake.</li><li><strong>M5d</strong>: Además, incluyen un tipo de almacenamiento rápido llamado NVMe SSD.</li><li><strong>M4</strong>: Son una opción genérica con una buena relación calidad-precio.</li></ul>
<h3 id="optimizadas-para-memoria">Optimizadas para Memoria</h3>
<p>Estas instancias están pensadas para bases de datos que necesitan mucha memoria RAM. Veamos algunos ejemplos:</p>
<ul><li><strong>R7g</strong>: Son las más nuevas y usan procesadores AWS Graviton3, que ofrecen mucha más memoria.</li><li><strong>R6i</strong>: Basadas en los procesadores Intel Ice Lake de última generación, mejoran el rendimiento.</li><li><strong>R6g</strong>: Utilizan el procesador personalizado Arm Graviton2 de AWS.</li><li><strong>R5</strong>: Pueden tener hasta 768GiB de RAM y usan procesadores Intel Skylake.</li><li><strong>R5b</strong>: Son especiales para bases de datos que funcionan en memoria y son más baratas por la cantidad de RAM que ofrecen.</li><li><strong>R5d</strong>: Incluyen almacenamiento NVMe SSD de hasta 3,6TB.</li><li><strong>R4</strong>: Son de alto rendimiento para tareas que usan mucha memoria.</li><li><strong>X2iedn</strong>: Usan la nueva generación de procesadores Intel Ice Lake.</li><li><strong>X2idn</strong>: Son similares a las X2iedn, pero con menos memoria por cada vCPU.</li><li><strong>X2g</strong>: Con procesadores Graviton2, se enfocan en ofrecer alto rendimiento a bajo costo.</li><li><strong>X1e</strong>: Tienen mucha memoria a un precio accesible.</li><li><strong>X1</strong>: Son parecidas a las X1e, pero sin almacenamiento local.</li><li><strong>Z1d</strong>: Ofrecen la mayor frecuencia de procesador disponible, ideal para software que cobra por núcleo.</li></ul>
<h2 id="caracter%C3%ADsticas-de-las-instancias-rds">Características de las Instancias RDS</h2>
<p>Amazon RDS ofrece varias características adicionales para ayudar a implementar, administrar y escalar las cargas de trabajo de bases de datos.</p>
<h3 id="cr%C3%A9ditos-cpu-(t3%2C-t2)">Créditos CPU (T3, T2)</h3>
<p>Las instancias como T3 y T2 te permiten empezar con un nivel básico de capacidad de procesamiento y aumentarlo si es necesario. Si no están muy ocupadas, acumulan "créditos" que pueden usar cuando hay más trabajo. Esto significa que para muchas tareas no tendrás que pagar extra.</p>
<h3 id="opciones-de-almacenamiento">Opciones de almacenamiento</h3>
<p>RDS usa un sistema de almacenamiento llamado EBS. Hay tres tipos principales:</p>
<ul><li><strong>Uso general (SSD)</strong>: Es la opción estándar para la mayoría de las tareas.</li><li><strong>IOPS aprovisionadas (SSD)</strong>: Ideal para trabajos que necesitan mucho acceso a disco de manera constante.</li><li><strong>Magnéticos</strong>: Son más económicos pero ofrecen menos rendimiento.</li></ul>
<p>Aurora, por otro lado, usa un sistema de almacenamiento que se ajusta automáticamente según necesites más espacio.</p>
<h3 id="instancias-optimizadas-para-ebs">Instancias optimizadas para EBS</h3>
<p>Estas instancias aseguran una conexión directa y rápida entre RDS y el sistema de almacenamiento EBS, lo que es muy útil para trabajos que requieren mucha actividad de disco.</p>
<h3 id="redes-mejoradas">Redes mejoradas</h3>
<p>Proporcionan una conexión a internet más rápida y con menos retrasos. RDS activa esta opción automáticamente en los tipos de instancias que lo soportan.</p>
<h2 id="tipos-de-almacenamiento-en-amazon-rds">Tipos de Almacenamiento en Amazon RDS</h2>
<p>Amazon RDS te ofrece tres tipos principales de almacenamiento:</p>
<ul><li><strong>SSD de uso general (gp2 y gp3)</strong></li><li><strong>SSD de IOPS aprovisionadas (io1)</strong></li><li><strong>Magnético</strong></li></ul>
<p>Cada uno tiene sus propias ventajas, dependiendo de lo que necesitas para tu base de datos.</p>
<h3 id="ssd-de-uso-general-(gp2-vs-gp3)">SSD de uso general (gp2 vs gp3)</h3>
<p>Los SSD de uso general son una opción asequible y funcionan bien para la mayoría de las bases de datos. Hay dos tipos:</p>
<ul><li><strong>gp2</strong>: Ofrece un rendimiento básico de 3 IOPS por cada GB, hasta un máximo de 16000 IOPS por volumen. Es ideal para pruebas y desarrollo.</li><li><strong>gp3</strong>: Te permite elegir cuánto almacenamiento y velocidad quieres, con hasta 16000 IOPS y 1000 MB/s. Es más flexible y se ajusta a diferentes necesidades.</li></ul>
<p>Generalmente, el gp3 es mejor porque te da más control y un rendimiento más estable.</p>
<h3 id="factores-que-afectan-el-rendimiento">Factores que afectan el rendimiento</h3>
<p>Varios aspectos pueden influir en cómo de rápido y eficiente es tu almacenamiento en Amazon RDS:</p>
<ul><li><strong>Tipo de instancia</strong>: Las instancias más fuertes mejoran el rendimiento.</li><li><strong>Actividades del sistema</strong>: Acciones como restaurar datos o crear copias pueden bajar temporalmente el rendimiento.</li><li><strong>Carga de trabajo</strong>: Consultas o transacciones complejas piden más del almacenamiento.</li><li><strong>Tipo y tamaño de almacenamiento</strong>: Los SSD y el almacenamiento con IOPS aprovisionadas suelen ser más rápidos.</li></ul>
<p>Es clave observar cómo va el rendimiento para identificar y resolver problemas, ajustando los recursos según sea necesario.</p>
<h2 id="seleccionando-el-tama%C3%B1o-y-tipo-de-instancia-rds">Seleccionando el Tamaño y Tipo de Instancia RDS</h2>
<h3 id="especificaciones-recomendadas">Especificaciones recomendadas</h3>
<p>Cuando busques la instancia RDS perfecta, piensa en cuánta fuerza (CPU), memoria, espacio (almacenamiento) y velocidad de conexión (rendimiento de red) necesitas para tu proyecto. Aquí van unos consejos:</p>
<p><strong>Entornos de desarrollo</strong></p>
<p>Si estás trabajando en desarrollar y probar cosas nuevas, puedes usar instancias más pequeñas para ahorrar dinero:</p>
<ul><li><strong>CPU</strong>: 2-4 núcleos virtuales</li><li><strong>Memoria</strong>: 4-16 GiB</li><li><strong>Almacenamiento</strong>: SSD de uso general con 20-100 GB</li><li><strong>Rendimiento de red</strong>: Bajo, suficiente para que los desarrolladores accedan</li><li><strong>Ejemplos de tipos de instancias</strong>: t3.small, t3.medium, t3.large</li></ul>
<p><strong>Entornos de pruebas</strong></p>
<p>Para probar tus aplicaciones y simular usuarios reales, necesitarás algo más potente:</p>
<ul><li><strong>CPU</strong>: 4-8 núcleos virtuales</li><li><strong>Memoria</strong>: 16-64 GiB</li><li><strong>Almacenamiento</strong>: SSD de uso general con 100-500 GB</li><li><strong>Rendimiento de red</strong>: Moderado, para pruebas más realistas</li><li><strong>Ejemplos de tipos de instancias</strong>: m5.large, m5.xlarge, m5.2xlarge</li></ul>
<p><strong>Producción</strong></p>
<p>Cuando tu aplicación esté lista para el mundo real y esperes mucho tráfico, elige instancias fuertes:</p>
<ul><li><strong>CPU</strong>: 8+ núcleos virtuales</li><li><strong>Memoria</strong>: 32+ GiB</li><li><strong>Almacenamiento</strong>: SSD de IOPS aprovisionadas, con suficiente espacio</li><li><strong>Rendimiento de red</strong>: Alto, idealmente 10 Gigabit</li><li><strong>Ejemplos de tipos de instancias</strong>: m5.2xlarge, m5.4xlarge, r5.large, r5.xlarge</li></ul>
<p>Recuerda revisar cómo van tus recursos y cambiar el tamaño de tus instancias RDS si es necesario. Las instancias más grandes pueden manejar mejor los momentos de mucho trabajo.</p>
<h2 id="optimizaciones-para-rds-y-mejoras-recientes">Optimizaciones Para RDS y Mejoras Recientes</h2>
<h3 id="instancias-r6a-mejoradas-para-ebs">Instancias R6a mejoradas para EBS</h3>
<p>Las instancias R6a usan procesadores AMD EPYC de última generación y tecnología Nitro de AWS. Las últimas actualizaciones han hecho que estas instancias sean aún mejores, ofreciendo:</p>
<ul><li><strong>60% más de IOPS</strong> para la versión más grande (32xlarge)</li><li><strong>50% más de IOPS</strong> para los otros tamaños de R6a</li><li><strong>50% más de ancho de banda</strong> para conectar con EBS en versiones hasta 32xlarge</li></ul>
<p>Por ejemplo, ahora las versiones desde large hasta 4xlarge pueden llegar a <strong>10 Gbps</strong> de velocidad y <strong>40.000 IOPS</strong>. Esto significa que pueden trabajar más rápido y manejar más datos a la vez, ideal para tareas que necesitan mucho almacenamiento.</p>
<p>Lo mejor es que estas <a href="https://mariadb.com/kb/en/changes-improvements-in-mariadb-1011/">mejoras</a> no tienen costo adicional. Si ya tienes instancias R6a, solo necesitas pararlas y volverlas a iniciar para aprovechar estas ventajas.</p>
<h3 id="aurora-i%2Fo-optimized">Aurora I/O-Optimized</h3>
<p>Aurora I/O-Optimized es una opción para quienes usan Aurora y necesitan mucho manejo de datos (E/S). Esta configuración ofrece:</p>
<ul><li>Mejores costos para el rendimiento que ofrece</li><li>Precios más fáciles de entender</li><li>Posibilidad de ahorrar hasta un 40% si los gastos de manejo de datos son altos</li></ul>
<p>Con Aurora I/O-Optimized, solo pagas por el espacio y las instancias que usas, sin cargos extra por el manejo de datos. Esto hace más sencillo calcular cuánto vas a gastar.</p>
<p>Esta configuración es compatible con las nuevas instancias R7g, que usan procesadores Graviton3. Comparadas con las R6g, estas son hasta un 30% más rápidas y tienen una mejor relación costo-beneficio.</p>
<p>Cambiar entre la configuración estándar y I/O-Optimized es fácil y se hace desde la consola de AWS. Esta opción está disponible para Aurora MySQL y PostgreSQL en la mayoría de las regiones.</p>
<h2 id="comparaci%C3%B3n-amazon-rds-vs-aurora">Comparación Amazon RDS vs Aurora</h2>
<p>RDS y Aurora son dos formas de guardar y manejar datos en la nube con AWS. Aunque se parecen en algunas cosas, hay diferencias importantes entre ellos en cómo están hechos, cuánto pueden crecer, qué tan rápidos son y cómo protegen tus datos. Vamos a ver cómo se comparan:</p>
<h3 id="tabla-comparativa">Tabla comparativa</h3>
<table><thead><tr><th>Característica</th><th>RDS</th><th>Aurora</th></tr></thead><tbody><tr><td>Infraestructura</td><td>Usa sistemas de bases de datos conocidos como MySQL, PostgreSQL, Oracle, etc.</td><td>AWS lo hizo desde cero, es especial de ellos</td></tr><tr><td>Escalabilidad</td><td>Depende del equipo que uses</td><td>Puede crecer mucho sin problemas</td></tr><tr><td>Rendimiento</td><td>Está bien para la mayoría de usos</td><td>Es mucho mejor, puede ser hasta 5 veces más rápido que MySQL en RDS</td></tr><tr><td>Seguridad</td><td>Tus datos están protegidos</td><td>También protege tus datos</td></tr></tbody></table>
<p>Como ves, ambos protegen tus datos bien. Pero Aurora puede hacer más cosas a la vez y crecer más fácilmente.</p>
<p>RDS es bueno si ya estás usando esos sistemas de bases de datos y quieres seguir así. Pero si necesitas más poder y flexibilidad, Aurora podría ser mejor.</p>
<h3 id="diferencias-clave-entre-rds-y-aurora">Diferencias clave entre RDS y Aurora</h3>
<p>Ahora, hablemos más de lo que los hace diferentes:</p>
<p><strong>Infraestructura</strong></p>
<p>RDS usa sistemas de bases de datos que ya conocemos y los pone en la nube. Pero eso también significa que no puede crecer más allá de cierto punto.</p>
<p>Aurora es diferente porque AWS lo creó pensando en la nube, así que puede usar toda la potencia de la nube para crecer más.</p>
<p><strong>Escalabilidad</strong></p>
<p>Aurora gana aquí porque puede ajustarse y crecer según lo necesites, sin límites. RDS tiene un tope porque depende del equipo físico.</p>
<p><strong>Rendimiento</strong></p>
<p>Aurora trabaja más rápido porque usa tecnologías avanzadas, como guardar las búsquedas más comunes para no tener que hacerlas cada vez. Esto es ideal para aplicaciones que necesitan mucha potencia.</p>
<p><strong>Seguridad</strong></p>
<p>Los dos son seguros y protegen tus datos. RDS puede ser más familiar si ya usas esos sistemas de bases de datos.</p>
<h3 id="conclusi%C3%B3n">Conclusión</h3>
<p>Al final, si necesitas que tu sistema de datos crezca y sea muy rápido, Aurora es la mejor opción. Pero si prefieres seguir con lo que ya conoces y funciona para ti, RDS es una buena elección.</p>
<h2 id="conclusiones">Conclusiones</h2>
<p>Cuando necesitas decidir qué tipo y tamaño de instancia RDS es mejor para tu base de datos, piensa en lo siguiente:</p>
<ul><li><strong>Para qué vas a usar la base de datos</strong>: ¿Es para crear cosas nuevas, hacer pruebas o ya es para usar de verdad? Esto te ayudará a saber cuánto poder necesitas.</li><li><strong>Cuánto trabajo va a tener</strong>: Piensa en cuántas cosas tiene que hacer tu base de datos, como cuántas personas la van a usar y cuánto tráfico esperas. Esto te ayuda a elegir el tamaño adecuado.</li><li><strong>Qué tan rápido necesitas que sea</strong>: Dependiendo de si necesitas que tu base de datos sea muy rápida o maneje mucha información al mismo tiempo, esto puede influir en tu elección.</li><li><strong>Cuánto puedes gastar</strong>: Las opciones más grandes y con más funciones son más caras. Considera opciones más económicas si tienes un presupuesto limitado.</li><li><strong>Pensando en el futuro</strong>: Elige una opción que te permita crecer fácilmente sin tener que hacer muchos cambios si en el futuro necesitas más capacidad.</li><li><strong>Si necesitas que esté siempre disponible</strong>: Para evitar problemas si algo falla, piensa en usar opciones que tengan copias en diferentes lugares.</li><li><strong>Mantener tus datos seguros</strong>: Asegúrate de que tus datos estén protegidos, tanto cuando están guardados como cuando los estás usando.</li></ul>
<p>Es importante que revises cómo va todo regularmente, para que puedas ajustar las cosas según sea necesario. Si estás entre elegir RDS o Aurora, recuerda que Aurora puede manejar más carga de trabajo y crecer más fácilmente, pero RDS podría ser mejor si prefieres trabajar con sistemas de bases de datos más tradicionales.</p>
<h2 id="preguntas-relacionadas">Preguntas Relacionadas</h2>
<h3 id="%C2%BFqu%C3%A9-es-una-instancia-rds%3F">¿Qué es una instancia RDS?</h3>
<p>RDS es un servicio de AWS que hace más fácil usar bases de datos en la nube. AWS se ocupa de las tareas complicadas como hacer copias de seguridad, actualizar sistemas, aumentar el tamaño y hacer copias de tu base de datos. Esto significa que tú solo tienes que preocuparte por usar la base de datos.</p>
<p>Puedes tener una base de datos lista, como MySQL, PostgreSQL, Oracle, entre otros, en solo unos minutos y comenzar a trabajar con ella de inmediato.</p>
<h3 id="%C2%BFcu%C3%A1ntos-motores-distintos-de-base-de-datos-soporta-el-servicio-rds%3F">¿Cuántos motores distintos de base de datos soporta el servicio RDS?</h3>
<p><img alt="base de datos" src="/assets/blog/143aefb14576b5b371d54ef0.jpg"/></p>
<p>RDS funciona con varios sistemas de bases de datos:</p>
<ul><li>MySQL</li><li>PostgreSQL</li><li>Oracle</li><li>Microsoft SQL Server</li><li>MariaDB</li></ul>
<p>También, AWS tiene su propio sistema de base de datos llamado Amazon Aurora, que es compatible con MySQL.</p>
<h3 id="%C2%BFqu%C3%A9-es-rds-multi-az%3F">¿Qué es RDS Multi-AZ?</h3>
<p>RDS Multi-AZ te permite tener una copia de tu base de datos en otra área para que, si hay un problema en el área principal, RDS pueda cambiar a la copia rápidamente. Esto ayuda a que tu base de datos esté disponible todo el tiempo y sea más segura. RDS se encarga de hacer las copias automáticamente.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/">Bases de datos Relacionales en AWS con Amazon RDS y Amazon Aurora</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/">Bases de Datos en AWS: introducción básica</a></li><li><a href="https://dondeaprendoaws.com/blog/amazon-redshift-el-poder-del-data-warehousing-en-aws/">Amazon Redshift: El Poder del Data Warehousing en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li></ul>
