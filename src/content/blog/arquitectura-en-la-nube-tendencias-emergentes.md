---
title: "Arquitectura AWS: cómo elegir diseño y servicios"
description: "Aprende a diseñar una arquitectura en AWS según disponibilidad, latencia, datos, carga y operación. Compara Lambda, contenedores y multi-región."
author: "guille-ojeda"
publishedAt: "2024-01-27"
publishedTimestamp: "2024-01-27T23:50:47.33Z"
modifiedTimestamp: "2026-10-05T00:29:42-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Alta disponibilidad en AWS: arquitectura Multi-AZ para una app web"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/"
  - title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
  - title: "Arquitectura multi-región en AWS: cuándo conviene"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/"
  - title: "AWS Config: reglas de cumplimiento y remediación segura"
    url: "https://dondeaprendoaws.com/blog/automatizacion-de-cumplimiento-con-aws-config/"

---

<p>Para diseñar una arquitectura en AWS, empieza por lo que el sistema debe hacer y las condiciones con las que debe cumplir. A partir de ahí, compara opciones de cómputo, datos, integración y recuperación. No hay un patrón que sea el mejor para todas las cargas: el <a href="https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html">AWS Well-Architected Framework</a> ayuda a sopesar las decisiones. Sus <a href="https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html">seis pilares</a> son excelencia operativa, seguridad, confiabilidad, eficiencia del rendimiento, optimización de costos y sostenibilidad.</p>

<p>Para conocer esos pilares en formato de charla, puedes seguir <a href="https://www.youtube.com/watch?v=9LjRkS80ihI">La Amenaza del Nivel 100: AWS Well-Architected Framework</a>, del canal <a href="https://www.youtube.com/@awswomencolombia">AWS Women Colombia</a>.</p>

<h2 id="definir-requisitos-de-arquitectura">Define los requisitos antes de elegir servicios</h2>

<p>Escribe qué resultado espera el usuario y cómo sabrás que funciona. Esa breve lista evita empezar por el servicio de moda y te ayuda a explicar por qué una opción encaja mejor que otra.</p>

<table>
<thead>
<tr>
<th>Pregunta</th>
<th>Qué cambia en el diseño</th>
</tr>
</thead>
<tbody>
<tr>
<td>¿Qué parte debe responder en el momento y qué puede procesarse después?</td>
<td>Separa el camino que espera el usuario de los trabajos que pueden ejecutarse en segundo plano.</td>
</tr>
<tr>
<td>¿Cuánto tiempo puede estar fuera el sistema y cuántos datos se podrían perder?</td>
<td>Define el tiempo máximo para restaurar el servicio (RTO) y cuánto tiempo de datos desde el último punto de recuperación se puede perder (RPO), antes de decidir redundancia, copias y recuperación ante desastres. La <a href="https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_for_recovery_objective_defined_recovery.html">guía de confiabilidad de AWS explica estos objetivos</a>.</td>
</tr>
<tr>
<td>¿Cuándo y desde dónde llega la carga?</td>
<td>Un flujo irregular o con picos puede justificar colas y escalado automático; usuarios lejanos pueden cambiar la ubicación de cómputo o contenido.</td>
</tr>
<tr>
<td>¿Qué datos maneja y dónde pueden almacenarse?</td>
<td>La residencia, sensibilidad, consistencia y retención de los datos limitan las regiones y los servicios posibles.</td>
</tr>
<tr>
<td>¿Quién operará la solución y qué sabe mantener el equipo?</td>
<td>Compara el tiempo de operación que requiere cada alternativa con la experiencia y guardias disponibles.</td>
</tr>
<tr>
<td>¿Qué límites de seguridad, cumplimiento y presupuesto hay?</td>
<td>Incluye identidad, permisos, cifrado, auditoría y seguimiento de consumo desde el diseño.</td>
</tr>
</tbody>
</table>

<p>El contexto importa: AWS describe el Well-Architected Framework como una forma de entender ventajas y desventajas de las decisiones, no como una receta única. Sus pilares permiten hacer explícitos los compromisos, por ejemplo, cuánto esfuerzo operativo o gasto adicional se acepta para cumplir un objetivo de recuperación.</p>

<h2 id="red-y-comunidad">Diseña la red con el contexto de uso</h2>

<p>La latencia hacia usuarios, los enlaces con centros de datos y la segmentación del tráfico ayudan a decidir subredes, rutas y conexiones. La región más cercana no siempre es una elección válida si los datos deben permanecer en otra ubicación; evalúa ambas condiciones. Para seguir una charla de diseño de redes, mira <a href="https://www.youtube.com/watch?v=v4AG4qwEQg0">AWS Networking - Diseña tu red en la nube de forma eficiente</a>, del canal <a href="https://www.youtube.com/@awsugguatemala">AWS User Group Guatemala</a>. El <a href="https://www.meetup.com/aws-user-group-networking-colombia/">AWS User Group Networking Colombia</a> comparte encuentros técnicos sobre conectividad híbrida, redes entre cuentas y diseño de redes AWS. Para aprender los fundamentos de VPC, <a href="https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/">AWS Student Builder Group at Universidad Distrital</a> tendrá una sesión virtual el 21 de octubre, de 18:00 a 20:00 en horario de Colombia.</p>

<h2 id="elegir-computo-y-patrones">Elige el modelo de cómputo según la carga</h2>

<p>Una vez claros los requisitos, compara primero el modelo de ejecución. AWS mantiene <a href="https://docs.aws.amazon.com/decision-guides/latest/decision-guides/choosing-aws-compute-service.html">una guía para elegir cómputo</a>, una <a href="https://docs.aws.amazon.com/decision-guides/latest/decision-guides/choosing-aws-container-service.html">guía de servicios para contenedores</a> y otras <a href="https://docs.aws.amazon.com/decision-guides/latest/decision-guides/choosing-aws-serverless-service.html">guías para evaluar servicios serverless</a>; úsalas para contrastar tus requisitos y validar los límites actuales de cada servicio.</p>

<ul>
<li><strong>Lambda:</strong> evalúala para funciones activadas por eventos o solicitudes, especialmente cuando el trabajo puede ejecutarse en unidades acotadas y el volumen varía. Reduce tareas de gestión de servidores, pero tienes que diseñar los reintentos, límites de concurrencia, observabilidad y efectos duplicados.</li>
<li><strong>Contenedores con ECS y Fargate:</strong> pueden encajar cuando necesitas empaquetar una aplicación con sus dependencias, ejecutar un servicio de larga duración o conservar un entorno de ejecución propio sin administrar servidores EC2. Aun así, el equipo prepara imágenes, tareas, despliegues y monitoreo. Para practicar una estrategia de despliegue gradual, el repositorio <a href="https://github.com/roxsross/aws-ecs-canary-in-action">ECS Canary in Action</a> tiene un recorrido local con Docker Compose y una ruta separada que crea recursos en AWS con Terraform. En Córdoba, el encuentro <a href="https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/">AWS Gaming Lab: ECS, CI/CD y la magia de Terraform</a> será presencial en UTN Facultad Regional Córdoba el 10 de octubre, de 12:00 a 14:00.</li>
<li><strong>Contenedores con EKS:</strong> considera Kubernetes cuando sus APIs, herramientas o prácticas ya son una necesidad concreta del equipo. El plano de control administrado no elimina las decisiones sobre clústeres, red, seguridad y operación.</li>
<li><strong>EC2:</strong> conserva el control del sistema operativo y de la instancia. Puede ser adecuado para software heredado, agentes o configuraciones de host que no encajan en una opción más administrada; ese control también implica mantener y actualizar más componentes.</li>
</ul>

<p>No es obligatorio que toda una aplicación use el mismo modelo. Por ejemplo, una API podría tener un servicio de larga duración y enviar a Lambda las tareas de procesamiento que se activan por eventos. Combinar modelos puede ser más claro que forzar una única tecnología, siempre que cada frontera tenga una razón y alguien pueda operarla.</p>

<p>Para comparar dos modelos de cómputo con otros participantes, el <a href="https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/">16 de octubre habrá una sesión en línea «EC2 vs Lambda»</a> de AWS User Group Tlaxcala FireflyCloud, de 16:00 a 17:00 en horario de Ciudad de México.</p>

<h2 id="ejemplo-procesamiento-asincrono">Ejemplo: procesar imágenes sin bloquear la solicitud</h2>

<p>Imagina una aplicación que recibe imágenes y crea versiones reducidas. Si la persona que sube el archivo no necesita esperar el resultado, puedes separar la carga de archivos del procesamiento:</p>

<pre><code>S3 de entrada
   ↓
SQS → Lambda → S3 de salida
         ↘ DynamoDB
           (estado opcional)</code></pre>

<p>La aplicación deja el archivo en S3 y confirma que recibió la solicitud. Una <a href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html">notificación de S3 puede enviar el evento a SQS</a>; un mapeo de origen de eventos permite que <a href="https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html">Lambda consuma mensajes de esa cola</a>, genere las imágenes y guarde el resultado. La interfaz puede mostrar que el trabajo está pendiente y consultar su estado.</p>

<p>Esta elección tiene condiciones concretas:</p>

<ul>
<li>Usa el procesamiento directo si la respuesta necesita incluir el resultado y el tiempo de trabajo cabe en el camino síncrono. Usa una cola cuando el usuario pueda recibir una confirmación antes de terminar el trabajo.</li>
<li>Los mensajes de una cola estándar pueden procesarse más de una vez. La guía de AWS para <a href="https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html">entrega al menos una vez en SQS</a> recomienda consumidores idempotentes para que un mensaje repetido no cause cambios o notificaciones duplicados.</li>
<li>Define qué hacer con fallos repetidos: reintentos y, si configuras la cola para ello, una <a href="https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html">cola de mensajes fallidos (DLQ)</a> que permita al equipo investigar trabajos atascados.</li>
<li>Separa los archivos originales de los resultados —por ejemplo, con buckets o prefijos distintos— para evitar que una función vuelva a activar el evento que ella misma genera; <a href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html">S3 documenta este riesgo de ciclos de notificación</a>.</li>
</ul>

<p>Si varias aplicaciones deben recibir y filtrar eventos, compara también EventBridge. La guía de AWS para <a href="https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/event-driven-architectures.html">arquitecturas orientadas a eventos</a> explica el papel de colas, temas y buses de eventos. La forma apropiada depende de si necesitas retener trabajo, enviar un evento a varios consumidores o dirigirlo según reglas. Para profundizar en patrones EDA, sigue <a href="https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/">Arquitecturas Dirigidas por Eventos en AWS</a> y la grabación <a href="https://www.youtube.com/watch?v=TkU1RS5Fw1o">Introducción a arquitecturas orientadas a eventos y Amazon EventBridge</a>, de <a href="https://www.youtube.com/@marcia_">Marcia en Desplegando Cloud</a>. El <a href="https://www.meetup.com/aws-user-group-serverless-colombia/">AWS User Group Serverless Colombia</a> también reúne encuentros sobre este espacio técnico. Allí habrá una sesión en línea sobre <a href="https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/">SQS y Lambda</a> el 20 de octubre, de 19:00 a 21:00 en horario de Colombia.</p>

<h2 id="disponibilidad-y-recuperacion">Ajusta la resiliencia a la recuperación requerida</h2>

<p>Decide primero qué interrupciones estás dispuesto a aceptar y cuánto tiempo puede tomar recuperar el servicio. Para una carga de producción, la <a href="https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html">guía de confiabilidad de AWS recomienda distribuir recursos entre al menos dos zonas de disponibilidad</a>. Revisa también cómo replica o recupera datos el servicio elegido: tener cómputo en más de una zona no basta si el estado que necesita la aplicación depende de una sola.</p>

<p>Una segunda región es útil cuando el objetivo de negocio exige recuperar la carga ante una interrupción regional y las reglas de residencia de datos lo permiten. También requiere duplicar y operar recursos, configurar replicación y ensayar la conmutación. Si varias zonas de una región cumplen los objetivos acordados, una arquitectura multi-región puede añadir complejidad y costo sin resolver una necesidad real. AWS recomienda decidir entre multi-AZ y multi-región a partir de requisitos de resiliencia y recuperación. Para ampliar la comparación, continúa con <a href="https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/">Arquitecturas de Alta Disponibilidad en AWS</a> y <a href="https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/">Arquitecturas Multi-Región en AWS</a>.</p>

<p>La replicación ayuda a mantener datos disponibles en otra ubicación; no sustituye las copias de seguridad. AWS recomienda <a href="https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_planning_for_recovery_disaster_recovery.html">respaldar incluso los datos replicados</a> y probar una restauración para cubrir borrados, cambios incorrectos u otros incidentes que también podrían propagarse a una réplica. Para contrastar el diseño con la comunidad, puedes ver <a href="https://www.youtube.com/watch?v=sEr65Cgskkc">Diseñando arquitecturas resilientes en AWS</a>, del canal <a href="https://www.youtube.com/@awsugecuador4610">AWS UG Ecuador</a>.</p>

<p>Si trabajas desde Argentina, el <a href="https://www.meetup.com/aws-user-group-cordoba-argentina/">AWS User Group Córdoba</a> presenta un espacio local para compartir experiencias sobre AWS y computación en la nube.</p>

<h2 id="tendencias-con-criterio">Tendencias que conviene evaluar con criterio</h2>

<ul>
<li><strong>Servicios administrados y serverless:</strong> delegan parte de la gestión de servidores y capacidad. Aportan valor cuando el equipo prioriza operar menos infraestructura y el modelo de ejecución cubre la carga. Evalúa también límites, reintentos, dependencia del proveedor y monitoreo.</li>
<li><strong>Procesamiento dirigido por eventos:</strong> permite que productores y consumidores avancen a ritmos distintos. Funciona bien cuando los pasos son asíncronos o independientes; exige manejar retrasos, duplicados, orden y diagnóstico distribuido.</li>
<li><strong>Contenedores y Kubernetes:</strong> estandarizan el empaquetado de aplicaciones. Kubernetes sirve cuando el equipo necesita ese ecosistema; adoptarlo por popularidad suma una plataforma que también hay que mantener.</li>
<li><strong>Infraestructura definida como código:</strong> ayuda a revisar y repetir cambios de infraestructura. En CloudFormation, por ejemplo, un <a href="https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html">conjunto de cambios (change set) muestra recursos que podrían agregarse, modificarse o reemplazarse</a> antes de ejecutarlo; no garantiza que la actualización vaya a completarse. Si también necesitas evaluar la configuración y el cumplimiento, continúa con <a href="https://dondeaprendoaws.com/blog/automatizacion-de-cumplimiento-con-aws-config/">Automatización de cumplimiento con AWS Config</a>. Para encontrar una conversación práctica de gobierno en AWS, consulta la ficha de <a href="https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/">Compliance as Code en AWS: de la política a la acción automática</a> y confirma allí la fecha y modalidad actuales.</li>
<li><strong>Diseños híbridos, de borde o multi-región:</strong> resuelven necesidades de latencia, residencia de datos o recuperación geográfica. Incorpóralos cuando los requisitos indiquen dónde debe procesarse o recuperarse la carga.</li>
</ul>

<p>Estas opciones no son objetivos por sí mismos. Para compararlas, registra el requisito que resuelven, la operación que agregan y cómo vas a comprobar el resultado.</p>

<h2 id="validar-la-decision">Valida la decisión antes de ampliarla</h2>

<ol>
<li>Escribe los requisitos que no se pueden negociar y los que sí admiten un compromiso.</li>
<li>Dibuja el flujo de solicitudes y datos, incluyendo fallos, reintentos, permisos y puntos de recuperación.</li>
<li>Compara dos diseños viables y anota por qué elegiste uno, qué asumiste y qué costo operativo aceptas.</li>
<li>Implementa una parte acotada en un entorno de prueba. Mide latencia y consumo con la carga esperada, y verifica qué pasa cuando una dependencia falla.</li>
<li>Ensaya restauración o conmutación según los objetivos de recuperación; compara el resultado medido con el RTO y RPO definidos.</li>
<li>Automatiza los cambios de infraestructura y revisa qué recursos se crearían, modificarían o eliminarían antes de aplicarlos.</li>
</ol>

<p>Vuelve a revisar la arquitectura cuando cambien el volumen, los datos, las reglas de residencia o el equipo que la opera. Un diagrama es útil si ayuda a comprobar esos supuestos; no reemplaza las pruebas del sistema en ejecución.</p>

<h2 id="ejercicio-de-arquitectura">Practica la arquitectura en comunidad</h2>

<p>Para poner a prueba el diseño con un reto compartido, el <a href="https://www.meetup.com/aws-user-group-awspectrum/events/316830690/">26 de octubre de 2026 habrá una AWSpectrum Architecture Arena</a> presencial en FARO Cosmos, Ciudad de México, de 16:00 a 18:30. Consulta la página del evento para ver inscripción y disponibilidad.</p>
