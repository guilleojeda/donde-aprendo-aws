---
title: "Base de Datos Global con Amazon DynamoDB"
description: "Descubre cómo aprovechar las tablas globales de Amazon DynamoDB para tener una base de datos rápida, escalable y segura en todo el mundo. Configuración, replicación, seguridad y procesamiento en tiempo real."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T02:19:41.967Z"
cover: "/assets/blog/b74e56b41e26732c7dfc378e.png"
coverAlt: "Thumbnail for: Base de Datos Global con Amazon DynamoDB"
ogImage: "/assets/blog/b74e56b41e26732c7dfc378e.png"
related:
  - title: "¿Qué son los endpoints de VPC en AWS?"
    url: "https://dondeaprendoaws.com/blog/que-son-los-endpoints-de-vpc-en-aws/"
    image: "/assets/blog/784749ef7570c8a485edf97b.jpg"
    imageAlt: ""
  - title: "10 Estrategias de Optimización de Costos en AWS"
    url: "https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/"
    image: "/assets/blog/74f152c85b46e1ac5ea004f9.jpg"
    imageAlt: ""
  - title: "¿Cómo Escala DynamoDB? Modos On Demand y Provisioned"
    url: "https://dondeaprendoaws.com/blog/como-escala-dynamodb-modos-on-demand-y-provisioned/"
    image: "/assets/blog/ce62e0cc8508d5055bba53b4.png"
    imageAlt: ""
---

<p>Si buscas hacer que tu aplicación funcione rápidamente alrededor del mundo, las tablas globales de Amazon DynamoDB son tu solución. Aquí te explicamos de forma sencilla cómo aprovecharlas:</p>


<ul>
<li><strong>Rápido para usuarios en cualquier lugar:</strong> Replicando datos cerca de donde viven tus usuarios.</li>
<li><strong>Disponibilidad constante:</strong> Tus datos están seguros incluso si una región falla.</li>
<li><strong>Escala global sin preocupaciones:</strong> Atiende a usuarios en todo el mundo fácilmente.</li>
<li><strong>Seguridad mejorada:</strong> Datos protegidos en múltiples ubicaciones.</li>
<li><strong>Fácil gestión:</strong> DynamoDB maneja la replicación por ti.</li>
</ul>


<p>Antes de comenzar, asegúrate de tener una cuenta de AWS y permisos adecuados. Luego, selecciona las regiones para replicar tus datos, configura la capacidad de lectura/escritura y aprovecha las herramientas de AWS para la seguridad y el procesamiento de datos en tiempo real. La replicación es rápida y te ofrece consistencia eventual, asegurando que todos vean los mismos datos casi al instante.</p>


<p>Las tablas globales son ideales para aplicaciones móviles, juegos en línea y proyectos de IoT que operan a nivel mundial. Y aunque usar tablas globales no tiene un costo extra específico, se te cobrará por el uso de capacidad y almacenamiento en cada región. Para aquellos que necesitan una base de datos rápida, escalable y confiable a nivel global, DynamoDB es la opción.</p>


<h3 id="ventajas-de-las-tablas-globales" tabindex="-1">Ventajas de las tablas globales</h3>


<p>Usar las tablas globales tiene varios beneficios:</p>


<ul>
<li><strong>Más rápido para tus usuarios:</strong> Como los datos están cerca de ellos, la aplicación responde más rápido.</li>
<li><strong>Siempre disponible:</strong> Si una región tiene problemas, tus datos están seguros en otras regiones.</li>
<li><strong>Crecimiento sin límites:</strong> Puedes tener usuarios en cualquier parte del mundo sin preocuparte.</li>
<li><strong>Más seguro:</strong> Tus datos están más protegidos al estar en varios lugares.</li>
<li><strong>Fácil de manejar:</strong> No tienes que romperte la cabeza pensando en cómo copiar tus datos; DynamoDB lo hace por ti.</li>
</ul>


<p>Para aplicaciones que se usan en todo el mundo y necesitan ser rápidas y confiables, las tablas globales son una excelente opción.</p>


<h2 id="configuraci%C3%B3n-de-tablas-globales" tabindex="-1">Configuración de tablas globales</h2>


<h3 id="requisitos-previos" tabindex="-1">Requisitos previos</h3>


<p>Antes de empezar con una tabla global en DynamoDB, necesitas tener listo lo siguiente:</p>


<ul>
<li>Una cuenta de AWS y acceso a la CLI de AWS.</li>
<li>Permisos en IAM para poder crear y manejar tablas en DynamoDB.</li>
<li>Activar la opción de tablas globales en la consola de DynamoDB.</li>
<li>Ya debes tener una tabla en DynamoDB o crear una para hacerla global.</li>
</ul>


<h3 id="selecci%C3%B3n-de-regiones-de-r%C3%A9plica" tabindex="-1">Selección de regiones de réplica</h3>


<p>Cuando elijas dónde replicar tus datos, ten en cuenta:</p>


<ul>
<li>Escoger mínimo dos regiones en diferentes partes del mundo para más seguridad.</li>
<li>Comenzar con pocas regiones y añadir más si es necesario.</li>
<li>Elegir regiones cerca de tus usuarios para que la aplicación sea más rápida para ellos.</li>
</ul>


<h3 id="asignaci%C3%B3n-de-capacidad-de-lectura%2Fescritura" tabindex="-1">Asignación de capacidad de lectura/escritura</h3>


<p>Para que tu tabla global funcione bien, asegúrate de tener suficiente capacidad de lectura y escritura en cada región:</p>


<ul>
<li>Revisa cómo se están usando las tablas en cada región y ajusta la capacidad como veas necesario.</li>
<li>Piensa en tener capacidad extra reservada en lugares clave.</li>
<li>Usa alarmas para saber si necesitas más capacidad.</li>
</ul>


<p>La capacidad que pongas en la región principal se va a compartir con las réplicas, pero después puedes ajustarla individualmente.</p>


<h2 id="replicaci%C3%B3n-y-consistencia-de-datos" tabindex="-1">Replicación y consistencia de datos</h2>


<h3 id="mecanismo-de-replicaci%C3%B3n" tabindex="-1">Mecanismo de replicación</h3>


<p>Amazon DynamoDB usa un método especial para asegurarse de que cuando cambias algo en una tabla global, ese cambio se ve en todas partes del mundo. Imagina que tienes amigos en diferentes ciudades y cada vez que compras algo nuevo, les envías una foto. DynamoDB hace algo parecido con tus datos, pero mucho más rápido.</p>


<p>Aquí te explicamos cómo lo hace:</p>


<ul>
<li><strong>Sincronización incremental:</strong> Piensa en esto como actualizar solo lo que ha cambiado. Si solo cambias una parte de tus datos, DynamoDB solo envía esos pequeños cambios a otras regiones, no toda la base de datos. Esto ahorra mucho tiempo y uso de internet.</li>
<li><strong>Resolución de conflictos:</strong> A veces, dos lugares pueden hacer cambios al mismo tiempo. DynamoDB decide automáticamente cuál cambio es el más reciente y lo mantiene.</li>
<li><strong>Reintentos automáticos:</strong> Si por alguna razón, la actualización no llega a una región, DynamoDB lo intenta de nuevo hasta que todo esté sincronizado.</li>
</ul>


<h3 id="consistencia-eventual" tabindex="-1">Consistencia eventual</h3>


<p>Con las tablas globales de DynamoDB, los cambios que haces no se ven inmediatamente en todas partes, pero casi. Esto se llama consistencia eventual. Significa que:</p>


<ul>
<li>Los cambios se mueven rápido entre regiones, usualmente en menos de un segundo.</li>
<li>Con el tiempo, todos los lugares tendrán la misma información.</li>
<li>Puede que por un momentito, algunos lugares vean una versión antigua de los datos, pero esto se arregla rápido.</li>
</ul>


<p>Este tipo de consistencia funciona bien para muchas aplicaciones porque asegura que tus datos están en todas partes sin sacrificar velocidad.</p>


<h2 id="seguridad-y-encriptaci%C3%B3n-de-datos" tabindex="-1">Seguridad y encriptación de datos</h2>


<h3 id="aws-kms" tabindex="-1">AWS KMS</h3>


<p>AWS Key Management Service (KMS) es una herramienta que ayuda a mantener tus datos seguros cuando se copian entre diferentes lugares usando las tablas globales de DynamoDB. Con KMS, puedes crear una llave de seguridad única para cada copia de tus datos. Esto significa que solo las personas o aplicaciones con permiso pueden ver o usar esos datos.</p>


<p>Al usar KMS con tus tablas globales, la copia de datos entre regiones es segura porque todo se cifra, es decir, se convierte en un código que solo se puede entender con la llave correcta. No tienes que preocuparte por manejar estas llaves tú mismo; AWS lo hace por ti.</p>


<h3 id="permisos-y-pol%C3%ADticas" tabindex="-1">Permisos y políticas</h3>


<p>Es crucial controlar quién puede hacer qué con tus llaves de cifrado y datos. Aquí hay algunas cosas que puedes hacer para mantener todo seguro:</p>


<ul>
<li>Asegúrate de que solo DynamoDB pueda usar tus llaves de cifrado.</li>
<li>No dejes que nadie fuera de los servicios permitidos comparta tus llaves.</li>
<li>Cambia tus llaves de seguridad de vez en cuando para mayor seguridad.</li>
<li>Estate atento a cualquier intento de acceso a tus llaves y cómo se usan.</li>
</ul>


<p>Si configuras todo bien, puedes estar tranquilo sabiendo que tus datos en las tablas globales de DynamoDB están protegidos con la seguridad que ofrece KMS.</p>




<h2 id="procesamiento-de-datos-en-tiempo-real" tabindex="-1">Procesamiento de datos en tiempo real</h2>


<h3 id="dynamodb-streams" tabindex="-1"><a href="https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html" rel="noopener noreferrer" target="_blank">DynamoDB Streams</a></h3>


<p><figure><img alt="DynamoDB Streams" src="/assets/blog/d7e196337fcc9364e3d78c97.jpg"/></figure></p>


<p>DynamoDB Streams te ayuda a ver los cambios en tu base de datos, como cuando se añaden, actualizan o eliminan datos. Esto es muy útil porque, si tu base de datos está en varios lugares del mundo, puedes asegurarte de que todos los cambios se reflejen en todas partes.</p>


<p>Esto es bueno para:</p>


<ul>
<li>Asegurar que todos los lugares tengan la misma información</li>
<li>Usar los cambios en los datos para análisis o reportes</li>
<li>Crear versiones actualizadas de tus datos basadas en esos cambios</li>
</ul>


<h3 id="aws-lambda" tabindex="-1"><a href="https://aws.amazon.com/lambda/" rel="noopener noreferrer" target="_blank">AWS Lambda</a></h3>


<p><figure><img alt="AWS Lambda" src="/assets/blog/c0eb5d69184d1120b29c2a25.jpg"/></figure></p>


<p>Con AWS Lambda, puedes hacer que ciertas acciones sucedan automáticamente cuando hay cambios en tu base de datos. Esto significa que puedes:</p>


<ul>
<li>Manejar datos actualizados al momento, sin necesidad de otros servidores</li>
<li>Hacer cosas específicas con esos datos, como transformarlos, enviar alertas o actualizar información</li>
<li>Conectar fácilmente con otros servicios de AWS cuando hay cambios</li>
</ul>


<p>Ejemplos de lo que puedes hacer:</p>


<ul>
<li>Sumar datos en el momento que cambian</li>
<li>Mandar eventos a Amazon EventBridge para más acciones</li>
<li>Enviar notificaciones por mensajes de texto o correo sobre cambios importantes</li>
<li>Asegurar que una versión actualizada de tus datos o una vista especial siempre esté al día</li>
</ul>


<p>Usando Lambda, puedes crear aplicaciones que no necesitan servidores y que reaccionan a los cambios en tus datos globales de DynamoDB.</p>


<h2 id="casos-de-uso-y-ejemplos" tabindex="-1">Casos de uso y ejemplos</h2>


<p>Veamos cómo las tablas globales de DynamoDB pueden ayudar en diferentes tipos de aplicaciones que se usan en todo el mundo:</p>


<h3 id="apps-m%C3%B3viles" tabindex="-1">Apps móviles</h3>


<p>Si tienes una app que usan personas de diferentes partes del mundo, las tablas globales pueden hacer que la app funcione más rápido para todos. Por ejemplo:</p>


<ul>
<li>Una app de mensajes puede guardar los chats y contactos de los usuarios en lugares cerca de ellos. Así, cuando abren la app, todo carga rápido porque los datos vienen del lugar más cercano.</li>
<li>En una app de juegos donde los jugadores compiten por tener las mejores puntuaciones, puedes guardar esas puntuaciones en diferentes lugares. De esta manera, todos pueden ver las clasificaciones en tiempo real, sin importar dónde estén.</li>
</ul>


<h3 id="juegos-online" tabindex="-1">Juegos online</h3>


<p>Los juegos en línea que mucha gente juega juntos pueden usar DynamoDB para:</p>


<ul>
<li>Asegurarse de que todos los jugadores vean el juego igual, sincronizando la información del juego entre diferentes lugares.</li>
<li>Guardar el progreso y los logros de los jugadores en todos lados, para que no pierdan su información si cambian de región.</li>
</ul>


<h3 id="iot-global" tabindex="-1">IoT global</h3>


<p>Para proyectos de IoT (cosas conectadas a internet) que recogen datos de sensores en muchos lugares, las tablas globales son útiles para:</p>


<ul>
<li>Enviar datos de sensores a lugares cercanos para analizarlos rápido y sin retrasos.</li>
<li>Tener copias de seguridad de esos datos en varios lugares, por si hay problemas en una región.</li>
<li>Procesar mucha información de sensores usando servidores en diferentes partes del mundo.</li>
</ul>


<h2 id="preguntas-frecuentes" tabindex="-1">Preguntas frecuentes</h2>


<p>Aquí respondemos a algunas dudas comunes sobre cómo funciona la replicación de datos, la consistencia, el rendimiento y cómo configurar y usar tablas globales en DynamoDB.</p>


<h3 id="%C2%BFcu%C3%A1nto-tardan-en-replicarse-los-datos%3F" tabindex="-1">¿Cuánto tardan en replicarse los datos?</h3>


<p>Normalmente, los datos se replican entre regiones en menos de un segundo bajo condiciones normales. Si hay problemas de red o errores, puede haber retrasos, pero DynamoDB intentará nuevamente la replicación de forma automática.</p>


<h3 id="%C2%BFse-pueden-usar-tablas-globales-con-transacciones-acid%3F" tabindex="-1">¿Se pueden usar tablas globales con transacciones ACID?</h3>


<p>No, las transacciones ACID, que aseguran que las operaciones de base de datos se realicen de forma segura, solo están disponibles para tablas en una sola región. Aún no se pueden usar con tablas globales.</p>


<h3 id="%C2%BFc%C3%B3mo-afecta-esto-al-rendimiento-de-lectura-y-escritura%3F" tabindex="-1">¿Cómo afecta esto al rendimiento de lectura y escritura?</h3>


<p>Agregar réplicas en otras regiones no cambia el rendimiento de lectura/escritura en la región principal. Puedes ajustar la capacidad de lectura/escritura de manera independiente en cada región según lo necesites.</p>


<h3 id="%C2%BFnecesito-hacer-cambios-en-las-aplicaciones-que-usan-dynamodb%3F" tabindex="-1">¿Necesito hacer cambios en las aplicaciones que usan DynamoDB?</h3>


<p>No, las aplicaciones pueden seguir usando DynamoDB de la misma manera, sin cambios. La replicación es transparente para las aplicaciones.</p>


<h3 id="%C2%BFhay-costos-extra-por-usar-tablas-globales%3F" tabindex="-1">¿Hay costos extra por usar tablas globales?</h3>


<p>No hay costos adicionales solo por usar la funcionalidad de tablas globales. Se te cobrará según la capacidad y el uso de almacenamiento/rendimiento en cada región donde tengas una réplica.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-tipo-de-base-de-datos-es-amazon-dynamodb%3F" tabindex="-1">¿Qué tipo de base de datos es Amazon DynamoDB?</h3>


<p>Amazon DynamoDB es una base de datos NoSQL que se maneja sola y está hecha para que las aplicaciones funcionen muy rápido, sin importar cuánto crezcan.</p>


<h3 id="%C2%BFqu%C3%A9-empresas-utilizan-dynamodb%3F" tabindex="-1">¿Qué empresas utilizan DynamoDB?</h3>


<p>Empresas grandes y en crecimiento como Lyft, Airbnb, y Redfin, así como otras conocidas como Samsung, Toyota y Capital One, usan DynamoDB porque les permite manejar mucha información rápidamente.</p>


<h3 id="%C2%BFcu%C3%A1ndo-usar-dynamodb%3F" tabindex="-1">¿Cuándo usar DynamoDB?</h3>


<p>Usa Amazon DynamoDB cuando necesites que tu aplicación responda muy rápido a quien la use y pueda crecer mucho, incluso a nivel mundial.</p>


<h3 id="%C2%BFqu%C3%A9-es-una-clave-principal-en-amazon-dynamodb%3F" tabindex="-1">¿Qué es una clave principal en Amazon DynamoDB?</h3>


<p>En DynamoDB hay dos tipos de claves principales:</p>


<ul>
<li>Clave de partición: Es una clave simple que identifica de manera única cada elemento.</li>
<li>Clave de partición y clave de ordenación: Estas dos juntas permiten organizar mejor los datos y acceder a ellos de forma más eficiente.</li>
</ul>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/amazon-dynamodb-la-base-de-datos-nosql-de-aws/">Amazon DynamoDB: La Base de Datos NoSQL de AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/">Amazon DynamoDB: Guía Básica</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/">Bases de Datos en AWS: introducción básica</a></li><li><a href="https://dondeaprendoaws.com/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/">Bases de datos Relacionales en AWS con Amazon RDS y Amazon Aurora</a></li>
</ul>
</p>
