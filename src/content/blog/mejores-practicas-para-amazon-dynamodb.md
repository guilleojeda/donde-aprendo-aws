---
title: "Mejores Prácticas Para Amazon DynamoDB"
description: "Consejos y mejores prácticas para utilizar Amazon DynamoDB de manera eficiente y segura. Aprende sobre diseño de tablas, ajuste de capacidad, seguridad, índices secundarios y operaciones de lectura/escritura."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T04:08:02.203Z"
cover: "/assets/blog/4cce0f893747a12210fe7416.jpg"
coverAlt: "Thumbnail for: Mejores Prácticas Para Amazon DynamoDB"
ogImage: "/assets/blog/4cce0f893747a12210fe7416.jpg"
related:
  - title: "Visualiza Costos con AWS Cost and Usage Reports y QuickSight"
    url: "https://dondeaprendoaws.com/blog/visualiza-costos-con-aws-cost-and-usage-reports-y-quicksight/"
    image: "/assets/blog/bcf6fecd181e12cedeeed88a.jpg"
    imageAlt: ""
  - title: "Mejores Prácticas Para Amazon S3"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-s3/"
    image: "/assets/blog/7dc90730b1402ed9efe1a10b.jpg"
    imageAlt: ""
  - title: "Desarrollo en la nube: fundamentos esenciales"
    url: "https://dondeaprendoaws.com/blog/desarrollo-en-la-nube-fundamentos-esenciales/"
    image: "/assets/blog/9257652addf07f39008f550d.jpg"
    imageAlt: ""
---

<p>Para sacar el máximo provecho a Amazon DynamoDB y hacer que tus aplicaciones sean más rápidas y seguras, sigue estas recomendaciones clave:</p>
<ul><li><strong>Diseño de tablas</strong>: Opta por una clave principal adecuada, considera claves de ordenamiento y usa claves compuestas para relaciones de uno a muchos.</li><li><strong>Ajuste de capacidad de lectura/escritura</strong>: Comienza con el modo automático y ajusta según sea necesario.</li><li><strong>Seguridad</strong>: Cifra tus datos, utiliza IAM para control de acceso y protege los datos a nivel de ítem si es necesario.</li><li><strong>Índices secundarios</strong>: Elige entre índices globales o locales y usa proyecciones para ahorrar costos.</li><li><strong>Consultas y escaneos eficientes</strong>: Optimiza cómo y cuánta información recuperas.</li></ul>
<p>DynamoDB es una base de datos NoSQL ideal para aplicaciones que requieren altas velocidades de lectura/escritura y escalabilidad. La clave principal identifica de manera única cada elemento en una tabla. Para crear una tabla, sigue pasos específicos que incluyen configurar claves de Amazon EC2 y usar Amazon EMR para gestionar los datos.</p>
<p>Estas prácticas te ayudarán a diseñar, operar y mantener tus bases de datos DynamoDB de manera más eficiente y segura, asegurando un rendimiento óptimo de tus aplicaciones.</p>
<h3 id="tablas-y-elementos">Tablas y elementos</h3>
<p>Las tablas en DynamoDB son como grandes contenedores para tus datos. Cada dato o elemento tiene una clave única que lo identifica, y puede tener muchos detalles o atributos.</p>
<p>Imagina que tienes una tabla para usuarios. Cada usuario (elemento) podría tener detalles como su ID, nombre, correo electrónico, y cuándo se registró. El ID sería la clave única.</p>
<p>Puedes agregar, cambiar, borrar y buscar elementos en DynamoDB fácilmente. El sistema se ajusta solo para manejar muchísimas solicitudes al mismo tiempo.</p>
<h3 id="claves-primarias-y-secundarias">Claves primarias y secundarias</h3>
<p>La <strong>clave primaria</strong> es como el DNI de cada elemento; es única. Puede ser simple (una sola parte) o compuesta (dos partes).</p>
<p>Las <strong>claves secundarias</strong> te ayudan a buscar datos de otra manera. Hay dos tipos: globales (copian toda la tabla) y locales (solo una parte de los datos).</p>
<p>Por ejemplo, si tienes una tabla de pedidos, la clave primaria sería el ID del pedido. Si creas un índice secundario global basado en el estado del pedido, podrías encontrar todos los pedidos pendientes rápidamente.</p>
<p>Entender las claves primarias y secundarias es clave (valga la redundancia) para hacer aplicaciones que funcionen bien y rápido con DynamoDB. Te permiten organizar y acceder a tus datos de la mejor manera.</p>
<h2 id="dise%C3%B1o-de-tablas">Diseño de tablas</h2>
<p>Cuando se trata de hacer que DynamoDB funcione bien, cómo armas tus tablas es súper importante. Piensa en cómo vas a usar tus datos: qué información necesitas sacar y cómo vas a actualizarla. Esto te ayudará a decidir cómo armar tu esquema.</p>
<h3 id="patrones-de-acceso">Patrones de acceso</h3>
<p>Primero, piensa en cómo vas a buscar tus datos. Esto te ayuda a decidir:</p>
<ul><li>La clave principal</li><li>Si necesitas claves secundarias</li><li>Qué índices secundarios podrían ser útiles</li></ul>
<p>Si vas a buscar datos usando varios atributos, considera usar una clave compuesta o añadir índices secundarios.</p>
<h3 id="claves-de-partici%C3%B3n">Claves de partición</h3>
<p>La clave de partición es como el repartidor de tus datos en DynamoDB. Quieres que esta clave:</p>
<ul><li>Tenga un montón de valores diferentes (alta cardinalidad)</li><li>No cambie mucho con el tiempo</li></ul>
<p>Esto asegura que tus datos se repartan bien y evita cuellos de botella.</p>
<p>Ideas para una buena clave de partición:</p>
<ul><li>Un ID único generado al azar</li><li>Combinar atributos (por ejemplo, ID del usuario + fecha)</li><li>Escoger un atributo que naturalmente tenga muchos valores distintos</li></ul>
<h3 id="claves-de-ordenamiento">Claves de ordenamiento</h3>
<p>Las claves de ordenamiento ayudan a organizar tus datos dentro de una misma partición. Son útiles cuando necesitas:</p>
<ul><li>Sacar un grupo específico de datos de una partición</li><li>Hacer búsquedas que van por páginas</li></ul>
<p>Consejos:</p>
<ul><li>Usa un atributo que tenga muchos valores distintos</li><li>Trata de no crear zonas donde todos los datos se acumulen y causen lentitud</li></ul>
<h2 id="%C3%ADndices-secundarios">Índices secundarios</h2>
<p>Los índices secundarios en DynamoDB son una forma de mirar tus datos desde diferentes ángulos sin tener que copiarlos. Existen dos tipos principales:</p>
<h3 id="%C3%ADndices-globales-(gsi)">Índices globales (GSI)</h3>
<p>Los GSI te permiten ver toda tu tabla de una manera nueva. Están compuestos por:</p>
<ul><li><strong>Clave de partición</strong>: Es lo que divide tus datos en diferentes secciones.</li><li><strong>Clave de ordenamiento</strong> <em>(opcional)</em>: Ayuda a ordenar los datos dentro de esas secciones.</li><li><strong>Proyección</strong>: Decide qué información del elemento original se va a copiar.</li></ul>
<p>Los GSI son útiles cuando:</p>
<ul><li>Quieres buscar datos con una clave principal diferente. Por ejemplo, encontrar pedidos por la fecha en vez de por el ID.</li><li>Necesitas ordenar los elementos de otra manera. Como organizar productos por su precio.</li></ul>
<p>Recuerda que los GSI usan más recursos porque se tienen que actualizar con cada cambio en los elementos.</p>
<h3 id="%C3%ADndices-locales-(lsi)">Índices locales (LSI)</h3>
<p>Los LSI solo trabajan con una parte de los datos en cada sección. Lo que debes saber:</p>
<ul><li>Solo se usan dentro de una sección.</li><li>No consumen recursos extra para escribir.</li><li>Tienen las mismas opciones de proyección que los GSI.</li></ul>
<p>Los LSI son buenos cuando:</p>
<ul><li>Solo necesitas una forma diferente de ordenar los datos y no vale la pena un GSI completo.</li><li>Deseas ahorrar costos indexando menos información.</li></ul>
<p>Limitaciones:</p>
<ul><li>No puedes hacer búsquedas con la clave de un LSI, solo ordenar datos en una búsqueda.</li><li>No es posible paginar resultados basándose en un LSI.</li></ul>
<p>En resumen, los GSI te dan más flexibilidad para consultar datos a cambio de usar más recursos. Los LSI te ayudan a ordenar datos dentro de una sección sin gastar extra. Escoge el mejor para lo que necesitas.</p>
<h2 id="operaciones-de-lectura-y-escritura">Operaciones de lectura y escritura</h2>
<h3 id="unidades-de-capacidad-de-throughput">Unidades de capacidad de throughput</h3>
<p>Para que DynamoDB funcione bien, es clave darle la cantidad correcta de recursos para manejar la información que entra y sale. Aquí van algunos consejos:</p>
<ul><li>Al principio, usa el modo que ajusta los recursos automáticamente según lo que necesites. Así no gastas de más.</li><li>Después de ver cómo se comporta tu tráfico, puedes elegir una cantidad fija de recursos para ahorrar dinero.</li><li>Activa el ajuste automático de recursos para que se adapte a los cambios en la demanda.</li><li>Usa CloudWatch para ver cómo vas de recursos y ajusta según necesites.</li></ul>
<h3 id="particiones-y-paginaci%C3%B3n">Particiones y paginación</h3>
<p>Para hacer búsquedas rápidas, piensa bien en tu clave de partición y usa la paginación:</p>
<ul><li>Escoge una clave de partición que reparta bien la carga.</li><li>Usa paginación en tus búsquedas para no sobrecargar el sistema. Puedes pedir los resultados por partes.</li><li>Mantén los tamaños de página razonables para que todo sea más rápido (entre 100 y 1000 elementos es un buen rango).</li></ul>
<h3 id="lecturas-y-escrituras-fuertemente-consistentes">Lecturas y escrituras fuertemente consistentes</h3>
<p>Normalmente, DynamoDB espera un poco para actualizar todos los lugares donde guarda tus datos, lo que lo hace más rápido. Pero si necesitas que los cambios se vean al instante:</p>
<ul><li>Puedes pedir que las lecturas sean inmediatamente consistentes con un ajuste especial.</li><li>Para escribir datos, hay una opción que asegura que varias operaciones se hagan todas juntas.</li><li>Si usas estas opciones, mira bien tus recursos para asegurarte de que tienes suficientes.</li></ul>
<h2 id="seguridad%2C-control-de-acceso-y-encriptaci%C3%B3n">Seguridad, control de acceso y encriptación</h2>
<h3 id="autenticaci%C3%B3n-y-autorizaci%C3%B3n-con-iam">Autenticación y autorización con IAM</h3>
<p>Para controlar quién puede hacer qué en DynamoDB, es buena idea usar políticas de IAM. Esto te permite:</p>
<ul><li>Dar permisos específicos a usuarios, grupos o roles para que accedan solo a lo que necesitan.</li><li>Poner condiciones en las políticas para más seguridad, como limitar el acceso a ciertas tablas.</li><li>Quitar permisos fácilmente sin afectar todo el sistema.</li></ul>
<p>Algunos consejos útiles son:</p>
<ul><li>Prefiere usar roles para aplicaciones en vez de claves fijas. Esto hace más fácil cambiar las credenciales.</li><li>Aplica la regla de dar el menor acceso posible. Solo da los permisos que realmente se necesiten.</li><li>Usa CloudTrail para revisar el uso de IAM y detectar cosas raras.</li></ul>
<h3 id="encriptaci%C3%B3n-en-reposo-con-kms">Encriptación en reposo con KMS</h3>
<p>Es recomendable activar la encriptación en reposo para proteger tus datos en DynamoDB usando AWS Key Management Service (KMS). Esto ayuda a mantener tus datos seguros si alguien intenta acceder sin permiso.</p>
<p>Cómo manejar las claves de encriptación:</p>
<ul><li>Claves gestionadas por AWS: Son fáciles de usar y AWS se encarga de ellas.</li><li>Claves gestionadas por el cliente: Tú controlas cómo y cuándo se usan. Te da más control.</li><li>CloudHSM: Para necesidades específicas de seguridad, con hardware dedicado.</li></ul>
<p>DynamoDB automáticamente se encarga de encriptar y desencriptar tus datos con estas configuraciones.</p>
<h3 id="encriptaci%C3%B3n-en-tr%C3%A1nsito-con-ssl%2Ftls">Encriptación en tránsito con SSL/TLS</h3>
<p>DynamoDB usa SSL/TLS para proteger tus datos cuando se mueven por la red. Esto evita que alguien los intercepte o cambie.</p>
<p>Esta protección se aplica automáticamente a todas las conexiones con DynamoDB, así que no tienes que hacer nada extra para tenerla.</p>
<h2 id="optimizaci%C3%B3n-del-rendimiento-de-dynamodb">Optimización del rendimiento de DynamoDB</h2>
<h3 id="particionamiento-efectivo">Particionamiento efectivo</h3>
<p>Para que DynamoDB funcione rápido, es importante organizar bien tus datos. Aquí van algunos consejos:</p>
<ul><li>Escoge una clave de partición que tenga muchos valores diferentes. Esto ayuda a que los datos se repartan bien y el sistema funcione sin atascos. Por ejemplo, un número aleatorio es mejor que una fecha.</li><li>Si un atributo no tiene suficientes valores únicos, combina varios para crear la clave de partición.</li><li>Evita que una sola partición tenga demasiada actividad, ya que puede ralentizar el sistema.</li><li>Las claves de rango te permiten ordenar los datos dentro de una partición y hacer búsquedas más rápidas.</li></ul>
<h3 id="%C3%ADndices-secundarios-1">Índices secundarios</h3>
<p>Los índices secundarios te ayudan a buscar datos de otras formas sin afectar la búsqueda principal:</p>
<ul><li>Los índices globales (GSI) son útiles cuando quieres buscar con una clave diferente. Por ejemplo, buscar pedidos por fecha en vez de por ID.</li><li>Los índices locales (LSI) son buenos para ordenar los datos de otra manera dentro de una misma partición.</li><li>Ajusta los índices para que solo copien los datos que necesitas. Esto ayuda a ahorrar recursos.</li></ul>
<h3 id="paginaci%C3%B3n%2C-b%C3%BAsquedas-en-paralelo-y-streams">Paginación, Búsquedas en Paralelo y Streams</h3>
<p>Hay otras maneras de hacer que DynamoDB sea más rápido:</p>
<ul><li>La paginación te permite manejar grandes cantidades de datos por partes.</li><li>Las búsquedas en paralelo permiten leer datos de muchas particiones al mismo tiempo, lo que acelera el proceso.</li><li>DynamoDB Streams captura cambios en tus datos para que puedas trabajar con ellos más tarde sin afectar el rendimiento general.</li></ul>
<h2 id="monitoreo-y-m%C3%A9tricas">Monitoreo y métricas</h2>
<p>El monitoreo y las métricas son fundamentales para mantener tus aplicaciones corriendo bien en DynamoDB. Aquí te mostramos cómo puedes usar algunas herramientas para mantener un ojo en cómo se usan los recursos y encontrar problemas antes de que se agranden.</p>
<h3 id="m%C3%A9tricas-en-cloudwatch">Métricas en CloudWatch</h3>
<p>CloudWatch es una herramienta de AWS que te ayuda a ver cómo va todo. Con ella puedes:</p>
<ul><li>Observar en tiempo real cuánto estás leyendo y escribiendo en tus tablas, y cuánto te está costando.</li><li>Poner alarmas para que te avisen si algo pasa de un límite que tú decides.</li><li>Crear tableros con la información que más te interesa para tenerla siempre a la vista.</li></ul>
<p>Algunas cosas importantes que deberías mirar en DynamoDB son:</p>
<ul><li><code>ConsumedReadCapacityUnits</code> y <code>ConsumedWriteCapacityUnits</code>: te muestran si necesitas más o menos capacidad.</li><li><code>ReadThrottleEvents</code> y <code>WriteThrottleEvents</code>: si estas cifras son altas, significa que estás pidiendo más de lo que DynamoDB puede darte y algunas solicitudes se están deteniendo.</li></ul>
<h3 id="reportes-en-consola-de-dynamodb">Reportes en consola de DynamoDB</h3>
<p>La consola de DynamoDB tiene una parte de reportes que te da información como:</p>
<ul><li>Cuánto estás usando de lectura y escritura con el tiempo.</li><li>Cómo se reparten tus datos.</li><li>Cuánto trabajas con DynamoDB cada hora.</li><li>Cómo van tus solicitudes.</li></ul>
<p>Es bueno que revises estos reportes a menudo para ver:</p>
<ul><li>Si hay partes de tus datos que están causando problemas.</li><li>Si estás pagando por más capacidad de la que usas, para poder ajustar y ahorrar.</li><li>Cómo cambia el uso de tus recursos para poder planear mejor.</li></ul>
<p>Esta información te ayudará a hacer cambios y mantener tus aplicaciones funcionando de manera óptima.</p>
<h2 id="conclusi%C3%B3n">Conclusión</h2>
<p>DynamoDB es una base de datos que se adapta a lo que necesitas, es rápida y puede manejar mucha información. Para aprovecharla al máximo, es importante seguir algunos consejos básicos.</p>
<p>Aquí tienes un resumen de lo más importante:</p>
<ul><li>Escoge bien la <strong>clave de partición</strong> para que tus datos se repartan de manera uniforme. Si es necesario, combina varios atributos.</li><li>Las <strong>claves de ordenamiento</strong> te ayudan a buscar datos más rápido dentro de una misma área. Úsalas cuando te convenga.</li><li>Los <strong>índices secundarios (globales y locales)</strong> te permiten buscar tus datos de diferentes maneras. Ajusta lo que copian para usar menos recursos.</li><li>Comienza con ajustes de <strong>capacidad que se pueden cambiar</strong> según lo que necesites y revisa cómo va todo para ajustar la capacidad.</li><li><strong>Cifra</strong> tus datos importantes tanto cuando están guardados como cuando se mueven. Usa IAM para un control más detallado de quién puede hacer qué.</li><li><strong>Vigila</strong> cómo van las cosas con las herramientas de CloudWatch y los informes en la consola de DynamoDB para identificar y solucionar problemas a tiempo.</li></ul>
<p>Siguiendo estos consejos, podrás crear aplicaciones eficientes, seguras y que puedan crecer con DynamoDB.</p>
<h2 id="preguntas-relacionadas">Preguntas Relacionadas</h2>
<h3 id="%C2%BFqu%C3%A9-tipo-de-base-de-datos-es-amazon-dynamodb%3F">¿Qué tipo de base de datos es Amazon DynamoDB?</h3>
<p>Amazon DynamoDB es una base de datos NoSQL. Esto significa que guarda datos de una manera que no sigue el formato tradicional de filas y columnas. Es muy buena para aplicaciones que necesitan trabajar muy rápido y con mucha información.</p>
<h3 id="%C2%BFcu%C3%A1ndo-usar-dynamodb%3F">¿Cuándo usar DynamoDB?</h3>
<p>DynamoDB es ideal para aplicaciones que necesitan leer y escribir datos muy rápido y que pueden crecer mucho sin problemas. Funciona muy bien para proyectos que tienen usuarios en diferentes partes del mundo.</p>
<h3 id="%C2%BFqu%C3%A9-es-una-clave-principal-en-amazon-dynamodb%3F">¿Qué es una clave principal en Amazon DynamoDB?</h3>
<p>La clave principal en DynamoDB es lo que identifica de manera única cada elemento en una tabla. Puede ser una clave simple, que usa un solo atributo, o una clave compuesta, que usa dos atributos. Esto es como decir que cada elemento tiene su propia etiqueta única.</p>
<h2 id="related-posts">Related posts</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-s3/">Mejores Prácticas Para Amazon S3</a></li><li><a href="https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/">Amazon DynamoDB: Guía Básica</a></li><li><a href="https://dondeaprendoaws.com/blog/amazon-dynamodb-la-base-de-datos-nosql-de-aws/">Amazon DynamoDB: La Base de Datos NoSQL de AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ec2/">Mejores Prácticas Para Amazon EC2</a></li></ul>
