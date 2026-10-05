---
title: "Checklist: servicios AWS esenciales para el examen SAA-C03"
description: "Qué servicios de AWS estudiar para SAA-C03 y cómo elegirlos según seguridad, resiliencia, rendimiento, datos, redes y costos."
author: "guille-ojeda"
publishedAt: "2025-04-03"
publishedTimestamp: "2025-04-03T01:53:13.640000+00:00"
modifiedTimestamp: "2026-10-05T20:34:07-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-certificacion.png"
coverAlt: "Tres tarjetas de estudio con apuntes y hitos sobre un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-certificacion.png"
related: []

---

<p><strong>¿Qué servicios de AWS estudiar para SAA-C03?</strong> La respuesta depende de los requisitos del escenario. El examen AWS Certified Solutions Architect – Associate evalúa si puedes elegir y combinar servicios para diseñar una solución segura, resiliente, de buen rendimiento y con costos adecuados. Esta checklist organiza los servicios por las decisiones que debes poder justificar, en lugar de presentar una lista para memorizar.</p>

<p>La <a href="https://docs.aws.amazon.com/es_es/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html" target="_blank" rel="noopener noreferrer">guía oficial vigente de SAA-C03</a> es la referencia para confirmar objetivos y servicios dentro del alcance. Vuelve a consultarla antes de estudiar o reservar: AWS puede actualizar sus guías y exámenes.</p>

<h2>Qué debes saber del examen SAA-C03</h2>

<p>AWS identifica actualmente el examen como SAA-C03. Su guía organiza el contenido puntuado en cuatro dominios:</p>

<ul>
<li><strong>Diseñar arquitecturas seguras: 30 %.</strong></li>
<li><strong>Diseñar arquitecturas resilientes: 26 %.</strong></li>
<li><strong>Diseñar arquitecturas de alto rendimiento: 24 %.</strong></li>
<li><strong>Diseñar arquitecturas con optimización de costos: 20 %.</strong></li>
</ul>

<p>La <a href="https://aws.amazon.com/es/certification/certified-solutions-architect-associate/" target="_blank" rel="noopener noreferrer">página oficial del examen</a> indica una duración de 130 minutos, 65 preguntas de opción múltiple o respuesta múltiple y disponibilidad en español (Latinoamérica) y español (España), además de otros idiomas. La guía aclara que 50 preguntas afectan la puntuación y que otras 15 no se califican; estas últimas no se identifican durante el examen. AWS informa el resultado en una escala de 100 a 1.000, con 720 como puntuación mínima para aprobar.</p>

<p>Los porcentajes corresponden al contenido puntuado; no son una meta independiente para cada dominio. El resultado se determina sobre el examen completo. La guía también distingue los servicios dentro y fuera del alcance, así que una lista breve nunca sustituye el temario oficial.</p>

<h2>Antes de elegir un servicio, extrae los requisitos</h2>

<p>Al leer una pregunta de arquitectura, anota primero qué debe lograr la solución y qué restricciones no puede incumplir:</p>

<ol>
<li><strong>Disponibilidad y recuperación:</strong> ¿qué fallos debe tolerar? ¿Qué tiempo de recuperación (RTO) y pérdida de datos aceptable (RPO) se describen?</li>
<li><strong>Tráfico y rendimiento:</strong> ¿la carga es estable o variable? ¿Importan más la latencia, el rendimiento de lectura, las escrituras o la entrega global de contenido?</li>
<li><strong>Datos y consultas:</strong> ¿se necesita almacenamiento de objetos, bloques o archivos? ¿El modelo requiere relaciones y consultas flexibles, o accesos previsibles por clave?</li>
<li><strong>Seguridad:</strong> ¿quién necesita acceso, desde dónde y a qué datos? ¿La aplicación debe ser pública, privada o híbrida?</li>
<li><strong>Operación y costo:</strong> ¿se pide reducir administración, pagar por demanda, conservar datos por un plazo o minimizar transferencias?</li>
</ol>

<p>Luego descarta las opciones que incumplen un requisito y compara las restantes por complejidad operativa, rendimiento, recuperación y costo total. Un servicio popular no es automáticamente la mejor respuesta.</p>

<h2>Checklist de servicios AWS por dominio</h2>

<h3>1. Arquitecturas seguras (30 %)</h3>

<ul>
<li><strong>Identidades y permisos:</strong> distingue el acceso de personas del acceso de aplicaciones. Practica roles de IAM, políticas de identidad y de recursos, credenciales temporales con AWS STS y acceso federado. Aplica privilegio mínimo y MFA; para varias cuentas, evalúa cuándo conviene AWS IAM Identity Center.</li>
<li><strong>Red y exposición:</strong> decide qué componentes necesitan una dirección pública y cuáles deben permanecer en subredes privadas. Revisa tablas de rutas, grupos de seguridad, listas de control de acceso y puntos de conexión de servicio según el flujo de tráfico requerido.</li>
<li><strong>Datos y credenciales:</strong> identifica qué debe cifrarse en reposo y en tránsito, quién puede usar la clave y dónde guardar secretos de aplicación. AWS KMS, AWS Certificate Manager y AWS Secrets Manager cubren necesidades distintas; el requisito determina cuál aplica.</li>
<li><strong>Protección de aplicaciones:</strong> relaciona AWS WAF con reglas para solicitudes web y AWS Shield con protección frente a ataques DDoS. Inclúyelos si el escenario describe esas amenazas o controles de borde; no agregues capas sin un requisito.</li>
</ul>

<p>Para profundizar en la protección de datos, la <a href="https://dondeaprendoaws.com/blog/cifrado-de-datos-con-aws-kms-guia-practica/">guía de cifrado con AWS KMS</a> explica las claves de datos, SSE-KMS en S3 y los permisos que necesita cada operación.</p>

<h3>2. Arquitecturas resilientes (26 %)</h3>

<ul>
<li><strong>Escala y desacoplamiento:</strong> combina balanceadores y escalado de cómputo para cargas que varían. Si una tarea puede procesarse después de responder al usuario, una cola como Amazon SQS puede aislar los componentes y absorber picos. Para publicar eventos a varios consumidores, compara mensajería pub/sub con una cola de trabajo.</li>
<li><strong>Fallo de una zona:</strong> ubica componentes replicables en varias Zonas de disponibilidad y elimina puntos únicos de fallo. Un balanceador, cómputo distribuido y una base de datos con configuración Multi-AZ resuelven partes diferentes de la disponibilidad.</li>
<li><strong>Base de datos:</strong> no confundas alta disponibilidad, escalado de lectura y recuperación. En una implementación Multi-AZ DB instance de Amazon RDS, el standby cubre la conmutación por error y no atiende lecturas; un Multi-AZ DB cluster tiene dos instancias de lectura que también pueden servir consultas. Las réplicas de lectura son otra opción para cargas de lectura. Las copias de seguridad responden a una necesidad distinta: recuperar datos. Comprueba la topología descrita en la pregunta y compárala con la <a href="https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html" target="_blank" rel="noopener noreferrer">documentación vigente de RDS Multi-AZ</a>.</li>
<li><strong>Fallo regional:</strong> compara copia de seguridad y restauración, pilot light, warm standby o active/active según RTO, RPO y presupuesto. Route 53 puede apoyar el enrutamiento de conmutación por error, pero no reemplaza la réplica de datos ni un plan de recuperación.</li>
<li><strong>Almacenamiento durable:</strong> diferencia durabilidad, disponibilidad y recuperación. Para S3, considera versionado, políticas de ciclo de vida y replicación solo cuando respondan a una necesidad concreta de protección o acceso.</li>
</ul>

<h3>3. Arquitecturas de alto rendimiento (24 %)</h3>

<ul>
<li><strong>Cómputo:</strong> elige Amazon EC2 cuando necesitas controlar el sistema operativo, la instancia o procesos de larga duración; AWS Lambda para funciones disparadas por eventos y cargas compatibles con su modelo; y contenedores con Amazon ECS, Amazon EKS o AWS Fargate cuando el escenario justifica empaquetar y orquestar aplicaciones. Compara capacidad de control, escala y trabajo operativo.</li>
<li><strong>Almacenamiento:</strong> relaciona el patrón de acceso con el tipo de almacenamiento. Amazon S3 guarda objetos; Amazon EBS proporciona volúmenes de bloques para cargas que necesitan ese tipo de dispositivo; Amazon EFS ofrece un sistema de archivos compartido. Después compara capacidad, latencia, rendimiento, disponibilidad y costo de recuperación.</li>
<li><strong>Base de datos:</strong> contrasta una base relacional como Amazon RDS o Aurora con Amazon DynamoDB para accesos y modelos de datos diferentes. Una réplica de lectura, DynamoDB, ElastiCache o un proxy pueden ayudar en escenarios particulares; primero identifica el cuello de botella y el patrón de consultas.</li>
<li><strong>Red y entrega:</strong> Amazon CloudFront puede acercar contenido cacheable a usuarios distribuidos. Route 53 resuelve nombres y aplica políticas de enrutamiento. Evalúa latencia, origen, caché, disponibilidad y cargos de transferencia.</li>
</ul>

<h3>4. Arquitecturas con optimización de costos (20 %)</h3>

<ul>
<li><strong>Cómputo:</strong> contrasta demanda constante y variable. Compara precios bajo demanda con Savings Plans o instancias reservadas para uso previsible; considera Spot para trabajos que toleran interrupciones. La tarifa más baja no sirve si contradice disponibilidad o continuidad.</li>
<li><strong>Almacenamiento:</strong> estima frecuencia y tiempo de recuperación, retención, solicitudes, tamaño mínimo facturable y transferencia. Una clase de archivo barata por GB puede ser más cara para datos que deben recuperarse con frecuencia. La <a href="https://dondeaprendoaws.com/blog/clases-de-almacenamiento-de-amazon-s3/">comparación de clases de almacenamiento de S3</a> desarrolla esas condiciones y las diferencias entre acceso inmediato y restauración.</li>
<li><strong>Red:</strong> revisa el costo de transferir datos entre zonas y regiones, salir a Internet o pasar por NAT. Un diseño redundante puede aumentar la factura; compara ese gasto con la disponibilidad y latencia que pide el escenario.</li>
<li><strong>Visibilidad:</strong> usa AWS Pricing Calculator para estimar una arquitectura antes de desplegarla. Si practicas en una cuenta real, consulta los precios vigentes por servicio y región y revisa el consumo mientras trabajas.</li>
</ul>

<h2>Ejemplo: aplicación web con picos de demanda</h2>

<p>Supón que una aplicación recibe tráfico variable, debe seguir disponible ante el fallo de una Zona de disponibilidad, guarda transacciones relacionales y permite descargar archivos. Los usuarios están en distintas regiones, pero no se ha pedido continuidad inmediata ante la caída de una región completa.</p>

<ul>
<li>Distribuye el acceso mediante un balanceador y escala la capa de aplicación entre zonas. EC2 con Auto Scaling puede encajar si la aplicación necesita ese control; compara con contenedores o funciones si su forma de ejecución permite reducir trabajo operativo.</li>
<li>Usa una implementación Multi-AZ de RDS para la disponibilidad de la base de datos y mantén copias de seguridad para recuperación. Si además necesitas capacidad de lectura, compara réplicas de lectura con un Multi-AZ DB cluster, cuyas instancias lectoras también pueden atender consultas; la pregunta y la documentación del motor determinan la opción.</li>
<li>Guarda archivos como objetos en S3. Añade CloudFront si el contenido se beneficia de caché y entrega global.</li>
<li>Si generar los archivos puede ocurrir en segundo plano, desacopla esa tarea con SQS. Si debe completarse antes de responder, la cola no satisface ese requisito por sí sola.</li>
<li>Restringe el acceso a la base de datos, asigna roles a las aplicaciones y cifra los datos según sus requisitos. Evalúa recuperación multirregional solo si los RTO y RPO exigen cubrir la pérdida de una región; hacerlo aumenta la complejidad y el costo.</li>
</ul>

<p>Este diseño es un punto de partida para ese escenario, no una plantilla universal. Si cambian las consultas, la latencia, la retención o el tiempo de recuperación, también puede cambiar la combinación de servicios.</p>

<h2>Cómo practicar para SAA-C03</h2>

<ol>
<li>Lee los dominios y las tareas de la guía oficial; marca servicios dentro del alcance relacionados con los temas que no puedas explicar.</li>
<li>Resuelve preguntas de práctica oficiales y escribe el requisito decisivo de cada respuesta. Explica por qué las otras alternativas no cumplen el escenario.</li>
<li>Dibuja una arquitectura pequeña y recorre un fallo: una zona no responde, una instancia se detiene, una lectura aumenta o una clave no permite acceder al dato.</li>
<li>Compara cada decisión con sus implicaciones de costo, operación, seguridad y recuperación. Repite los temas débiles con documentación del servicio.</li>
</ol>

<p>El <a href="https://aws.amazon.com/es/certification/certified-solutions-architect-associate/" target="_blank" rel="noopener noreferrer">plan oficial de preparación para SAA-C03</a> enlaza la guía del examen y preguntas de práctica, y propone actividades para actualizar conocimientos, practicar y evaluar la preparación. AWS menciona AWS Builder Labs, Cloud Quest y AWS Jam entre las opciones de práctica; comprueba disponibilidad y condiciones en Skill Builder.</p>

<p>También puedes repasar conceptos con grabaciones del grupo de estudio del <a href="https://www.youtube.com/@awsugguatemala" target="_blank" rel="noopener noreferrer">AWS User Group Guatemala</a>: <a href="https://www.youtube.com/watch?v=ADckkt37kjg" target="_blank" rel="noopener noreferrer">alta disponibilidad</a>, <a href="https://www.youtube.com/watch?v=1oec5NMTpf4" target="_blank" rel="noopener noreferrer">Amazon SQS y SNS</a> y <a href="https://www.youtube.com/watch?v=GSU5GeVHEo4" target="_blank" rel="noopener noreferrer">bases de datos relacionales</a>. Son sesiones grabadas sobre temas de arquitectura; sus fichas no especifican a qué versión del examen corresponden, así que contrasta cada explicación con la guía SAA-C03 actual.</p>

<p>El <a href="https://docs.aws.amazon.com/es_es/wellarchitected/latest/framework/the-pillars-of-the-framework.html" target="_blank" rel="noopener noreferrer">AWS Well-Architected Framework actual tiene seis pilares</a>: excelencia operativa, seguridad, fiabilidad, eficiencia del rendimiento, optimización de costos y sostenibilidad. El temario de SAA-C03 se organiza en cuatro dominios puntuados; son estructuras relacionadas, pero no intercambiables. Para elegir lecturas de arquitectura, consulta nuestra guía de <a href="https://dondeaprendoaws.com/blog/5-whitepapers-de-aws-para-aprobar-examenes/">whitepapers y guías de AWS para estudiar certificaciones</a>.</p>

<h2>Recursos en español y comunidades AWS</h2>

<p>El directorio de <a href="https://dondeaprendoaws.com/aprender/certificaciones/">recursos para estudiar certificaciones AWS</a> reúne materiales, sesiones y experiencias sobre distintos exámenes; revisa cada ficha para confirmar si trata SAA-C03. En <a href="https://dondeaprendoaws.com/aprender/videos/">videos y tutoriales</a> puedes buscar demostraciones de servicios, y el directorio de <a href="https://dondeaprendoaws.com/creadores/">canales, blogs y pódcast</a> ayuda a encontrar explicaciones en español. La antigüedad y el temario de cada recurso varían: compáralos con la guía vigente.</p>

<p>Para estudiar acompañado, explora <a href="https://dondeaprendoaws.com/comunidades/">comunidades AWS de Latinoamérica</a> y filtra por país o tipo de grupo. Por ejemplo, <a href="https://www.awsugecuador.com/" target="_blank" rel="noopener noreferrer">AWS User Group Ecuador</a> publica meetups, talleres y sesiones de estudio para certificaciones; consulta su Meetup para ver las fechas y el examen de cada actividad. <a href="https://awswomenincloudba.com.ar/" target="_blank" rel="noopener noreferrer">AWS Women in Cloud Buenos Aires</a> organiza formación, mentorías y grupos de estudio para certificaciones, en una comunidad orientada a mujeres. Para charlas de arquitectura y costos en México, revisa los temas y eventos de <a href="https://awsugmixtli.com/" target="_blank" rel="noopener noreferrer">AWS User Group Mixtli</a>.</p>

<p>Las agendas cambian. Consulta <a href="https://dondeaprendoaws.com/eventos/">los próximos eventos AWS</a> o filtra por modalidad en <a href="https://dondeaprendoaws.com/eventos/online/">eventos en línea</a>; confirma idioma, fecha, costo, requisitos y contenido con quien organiza antes de inscribirte. No todas las sesiones son específicas de SAA-C03.</p>

<p>Usa esta checklist para organizar el estudio, no como promesa de aprobación. La guía oficial define el alcance del examen; las preguntas de práctica, la documentación, los laboratorios y las comunidades sirven para comprobar que sabes justificar tus decisiones.</p>
