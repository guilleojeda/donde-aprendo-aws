---
title: "Cómo configurar Service Discovery en Amazon ECS con AWS Cloud Map"
description: "Configura nombres DNS privados para servicios de Amazon ECS con AWS Cloud Map. Revisa registros A, AAAA y SRV, TTL, salud y límites."
author: "guille-ojeda"
publishedAt: "2024-05-19"
publishedTimestamp: "2024-05-19T00:02:00.421Z"
modifiedTimestamp: "2026-10-06T14:04:22-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Amazon ECS: qué es y cómo ejecutar tu primera tarea"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-amazon-ecs/"
  - title: "Amazon VPC: subredes, rutas, NAT y seguridad en AWS"
    url: "https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/"
---

Service Discovery de Amazon ECS permite que una aplicación encuentre otras tareas por nombre DNS aunque sus direcciones IP cambien al escalar o desplegar. ECS registra las tareas de un servicio en AWS Cloud Map y Route 53 publica los registros DNS. Por ejemplo, una aplicación cliente puede conectarse a <code>orders.apps.internal</code> sin guardar las IP de las tareas en su configuración.

El DNS solo resuelve el nombre. El cliente abre la conexión directamente a la IP privada de una tarea; Service Discovery no transporta el tráfico, no abre puertos en los grupos de seguridad ni sustituye una capa de balanceo. La [guía de Service Discovery de Amazon ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html) explica esta integración.

## Service Discovery, Service Connect o un balanceador

Elige según quién debe encontrar el servicio y cómo quieres encaminar las solicitudes.

| Opción | Resuelve | Úsala cuando |
| --- | --- | --- |
| ECS Service Discovery con Cloud Map | Nombres DNS y direcciones privadas de las tareas | Tus clientes pueden usar DNS normal y conectarse directamente al puerto del servicio. |
| Amazon ECS Service Connect | Nombres cortos y puertos mediante un proxy administrado en las tareas | Quieres administrar la comunicación entre servicios de ECS y observar su tráfico desde la configuración de ECS. |
| Application Load Balancer (ALB) | Un punto de entrada HTTP o HTTPS delante de varios destinos | Necesitas entrada desde fuera, enrutamiento por host o ruta, comprobaciones del balanceador o distribución de tráfico en la capa HTTP. |

Service Discovery puede convivir con un balanceador, pero sus registros apuntan a las tareas, no al ALB. Para comparar las alternativas, consulta la [guía de AWS para conectar servicios ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/interconnecting-services.html) y la documentación de [Amazon ECS Service Connect](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect.html).

Si quieres practicar una estrategia de despliegue que sí usa un ALB, el laboratorio comunitario [ECS Canary in Action](https://github.com/roxsross/aws-ecs-canary-in-action) incluye un modo local y una opción con Terraform en AWS. Ese ejercicio trata los despliegues canary y el balanceo, no Cloud Map; su opción en AWS crea recursos como ECS, ALB, DynamoDB y alarmas de CloudWatch. Revisa sus instrucciones de limpieza antes de crear esa infraestructura.

Para conocer los fundamentos de ECS en formato charla, mira [Containers en AWS: Construyendo el ecosistema de contenedores en ECS](https://www.youtube.com/watch?v=vZk7uVwFMQA), una grabación de AWS User Group Ecuador de 2023. La charla aporta contexto sobre contenedores y ECS; no es una guía de Cloud Map.

## Antes de configurarlo

Este recorrido supone que ya tienes una VPC, un clúster, una definición de tarea y una aplicación funcionando en un servicio de ECS.

- Usa un namespace DNS privado de Cloud Map asociado a la VPC donde corren las tareas. AWS crea una zona alojada privada de Route 53 para el namespace.
- Habilita la resolución DNS de la VPC; para una zona privada, habilita <code>enableDnsSupport</code> y <code>enableDnsHostnames</code>. La [guía de atributos DNS de VPC](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns-updating.html) describe ambas opciones.
- Permite en los grupos de seguridad el puerto de aplicación desde los clientes que deben acceder al servicio. Resolver el nombre no concede acceso de red.
- Service Discovery admite los modos de red <code>awsvpc</code>, <code>bridge</code> y <code>host</code>; no admite <code>none</code>. Fargate requiere <code>awsvpc</code> y Service Discovery admite la plataforma 1.1.0 o posterior. Comprueba las [consideraciones y regiones admitidas por ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html).
- Declara una comprobación de estado del contenedor en la definición de tarea para que ECS pueda informar la salud de cada endpoint a Cloud Map. El estado de salud no detiene por sí solo la tarea. ECS no adopta automáticamente una comprobación que solo esté declarada dentro de la imagen; revisa cómo [ECS calcula la salud de una tarea](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/healthcheck.html).

Si necesitas repasar VPC, subredes y grupos de seguridad, consulta [Conceptos básicos y avanzados de Amazon VPC](/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/). Para entender clústeres, tareas y servicios antes de seguir, empieza por [Amazon ECS: qué es y cómo ejecutar tu primera tarea](/blog/comprendiendo-amazon-ecs/). Para ampliar los fundamentos de subredes y rutas, el encuentro virtual [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) está anunciado para el 21 de octubre de 2026; requiere registro y tiene cupos limitados.

## Elige el tipo de registro DNS

El modo de red determina qué datos ECS puede registrar:

| Modo de red | Registros admitidos | Qué recibe el cliente |
| --- | --- | --- |
| <code>awsvpc</code> | <code>A</code> o <code>SRV</code>; también <code>AAAA</code> con subredes dual-stack. En subredes solo IPv6 no se puede crear <code>A</code>. | <code>A</code> o <code>AAAA</code> devuelve una IP. <code>SRV</code> devuelve prioridad, peso, puerto y un nombre de destino que se resuelve con <code>A</code> o <code>AAAA</code>. |
| <code>bridge</code> o <code>host</code> | Solo <code>SRV</code> | <code>SRV</code> devuelve prioridad, peso, puerto y nombre de destino. La configuración de ECS debe indicar el nombre del contenedor y el puerto de contenedor de la definición de tarea. |

Para Fargate con <code>awsvpc</code> y un puerto fijo, <code>A</code> suele ser la elección directa. Elige <code>SRV</code> cuando el cliente necesita obtener también el puerto y el nombre del destino. Una respuesta <code>SRV</code> no incluye la IP literal: el cliente resuelve el nombre de destino por separado. Consulta la [configuración de DNS de AWS Cloud Map](https://docs.aws.amazon.com/cloud-map/latest/dg/services-route53.html) para ver sus campos.

## Configuración con AWS CLI

Los ejemplos suponen que ya tienes una VPC, un clúster ECS y una definición de tarea probada. Crean un namespace y un registro de Cloud Map y luego un servicio ECS nuevo llamado <code>orders</code>. Sustituye los IDs y la región por los de tu cuenta. Si <code>orders</code> ya existe en el clúster, no ejecutes el paso de creación para ese mismo servicio: usa la actualización de servicio que se muestra más abajo. El tutorial oficial de [creación, verificación y limpieza de Service Discovery en ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-service-discovery.html) muestra el flujo completo.

Antes de crear recursos, considera que Cloud Map cobra por registros y operaciones de descubrimiento; el namespace crea una zona privada de Route 53. Las tareas de Fargate y, si las necesitas, las puertas de enlace NAT y el tráfico de salida también pueden generar cargos. Revisa los [precios de AWS Cloud Map](https://aws.amazon.com/es/cloud-map/pricing/), [Route 53](https://aws.amazon.com/route53/pricing/), [Amazon ECS/Fargate](https://aws.amazon.com/ecs/pricing/) y [Amazon VPC](https://aws.amazon.com/vpc/pricing/) para tu región y uso.

### 1. Crea un namespace privado

<pre><code class="language-bash">aws servicediscovery create-private-dns-namespace \
  --name apps.internal \
  --vpc vpc-0123456789abcdef0 \
  --region us-east-1</code></pre>

La respuesta incluye un <code>OperationId</code>: la creación es asíncrona. Consulta <code>aws servicediscovery get-operation --operation-id &lt;operation-id&gt; --region us-east-1</code> hasta que <code>Status</code> sea <code>SUCCESS</code> y guarda el valor de <code>Targets.NAMESPACE</code>. Ese es el ID que usarás como namespace. Un namespace privado limita la resolución a las VPC asociadas y evita publicar los nombres internos en DNS público.

### 2. Crea el servicio DNS de Cloud Map

Este ejemplo registra direcciones IPv4 con política multivalue y TTL de 60 segundos:

<pre><code class="language-bash">aws servicediscovery create-service \
  --name orders \
  --dns-config "NamespaceId=ns-0123456789abcdef0,RoutingPolicy=MULTIVALUE,DnsRecords=[{Type=A,TTL=60}]" \
  --health-check-custom-config FailureThreshold=1 \
  --region us-east-1</code></pre>

Guarda <code>Service.Arn</code> de la respuesta para asociarlo al servicio de ECS. Si elegiste <code>SRV</code>, configura ese tipo de registro y los campos <code>containerName</code> y <code>containerPort</code> de la definición del servicio ECS. Para usar IPv6, elige <code>AAAA</code> o <code>A</code> y <code>AAAA</code> según el modo de red y las subredes.

El TTL define por cuánto tiempo los resolutores DNS pueden guardar una respuesta. El valor 60 es un ejemplo, no un valor obligatorio: un TTL menor permite que los cambios se reflejen antes, pero aumenta las consultas; un TTL mayor reduce consultas y puede dejar a los clientes usando una IP anterior durante más tiempo. Además, una aplicación puede mantener su propia caché DNS o conexiones abiertas, así que debe tolerar reintentos y reemplazos de tareas. Lee las [recomendaciones de AWS para TTL de DNS](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/best-practices-dns.html).

### 3. Asocia el registro al servicio ECS

En el objeto de creación del servicio ECS, agrega el ARN de Cloud Map en <code>serviceRegistries</code>. El ejemplo supone que la definición <code>orders:1</code> usa <code>awsvpc</code>, contiene el contenedor <code>orders</code> que escucha en el puerto <code>8080</code> y que la VPC, las subredes y el grupo de seguridad corresponden al namespace:

<pre><code class="language-json">{
  "cluster": "tutorial",
  "serviceName": "orders",
  "taskDefinition": "orders:1",
  "desiredCount": 2,
  "launchType": "FARGATE",
  "platformVersion": "LATEST",
  "serviceRegistries": [
    {
      "registryArn": "arn:aws:servicediscovery:us-east-1:123456789012:service/srv-0123456789abcdef0"
    }
  ],
  "networkConfiguration": {
    "awsvpcConfiguration": {
      "subnets": ["subnet-0123456789abcdef0"],
      "securityGroups": ["sg-0123456789abcdef0"],
      "assignPublicIp": "DISABLED"
    }
  }
}</code></pre>

Guarda el contenido como <code>ecs-service-discovery.json</code> y crea el servicio:

<pre><code class="language-bash">aws ecs create-service \
  --cli-input-json file://ecs-service-discovery.json \
  --region us-east-1</code></pre>

Para un servicio ECS existente con despliegues rolling, asocia el registro con <code>update-service</code>. Con el registro <code>A</code> de este ejemplo, la actualización queda así:

<pre><code class="language-bash">aws ecs update-service \
  --cluster tutorial \
  --service orders \
  --service-registries "registryArn=arn:aws:servicediscovery:us-east-1:123456789012:service/srv-0123456789abcdef0" \
  --region us-east-1</code></pre>

Cambiar <code>serviceRegistries</code> inicia un nuevo despliegue: ECS arranca tareas con la configuración nueva y luego detiene las anteriores. La actualización requiere el rol vinculado al servicio de ECS. Para <code>SRV</code> agrega <code>containerName</code> y <code>containerPort</code> cuando el modo de red sea <code>bridge</code> o <code>host</code>; con <code>awsvpc</code> y <code>SRV</code> puedes indicar ese par o el campo <code>port</code>. Revisa la documentación actual de [update-service](https://docs.aws.amazon.com/cli/latest/reference/ecs/update-service.html).

Configura el grupo de seguridad de las tareas para aceptar el puerto <code>8080</code> desde el grupo de seguridad de los clientes. No abras ese puerto a todo Internet para que funcione la resolución interna. El ejemplo deshabilita la IP pública; si ejecutas las tareas en subredes privadas, asegúrate de que tengan salida al registro de imágenes y a los servicios necesarios al iniciar contenedores o enviar logs. Puedes usar NAT o los endpoints correspondientes; por ejemplo, ECR y S3 para imágenes privadas en ECR y CloudWatch Logs si usas <code>awslogs</code>. Para otros registros, configura la salida que requieran. Consulta las [opciones de red para tareas Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html).

### 4. Comprueba DNS y conectividad

Ejecuta las consultas desde una tarea cliente o una instancia dentro de una VPC asociada al namespace:

<pre><code class="language-bash">dig +short A orders.apps.internal
dig +short AAAA orders.apps.internal
dig +short SRV orders.apps.internal</code></pre>

Consulta solo el tipo que configuraste. Con <code>A</code> espera una o más IP privadas. Con <code>SRV</code>, espera respuestas con prioridad, peso, puerto y nombre de destino; resuelve ese nombre con <code>dig +short A &lt;nombre-de-destino&gt;</code> (o <code>AAAA</code> en IPv6) para obtener la IP. Luego prueba el protocolo y puerto reales, por ejemplo:

<pre><code class="language-bash">curl --connect-timeout 2 http://orders.apps.internal:8080/health</code></pre>

Cambia <code>/health</code> por una ruta que exista en tu aplicación. Una respuesta DNS correcta prueba la resolución, pero no la conectividad ni la salud de la aplicación. También puedes revisar las instancias registradas con <code>aws servicediscovery list-instances --service-id &lt;service-id&gt; --region us-east-1</code> y consultar eventos, tareas y salud del servicio en ECS.

## Salud, límites y decisiones operativas

Las comprobaciones del contenedor informan la salud del endpoint a ECS, que actualiza el estado en Cloud Map; no detienen por sí solas la tarea. Al iniciar, las tareas y sus instancias de descubrimiento pueden figurar como no saludables hasta que la comprobación devuelve un resultado: ese estado no significa que la tarea se haya detenido ni que la instancia ya se haya desregistrado. Si falla la comprobación del contenedor, ECS retira el endpoint del enrutamiento DNS y desregistra la instancia de Cloud Map; el scheduler decide por separado cuándo detener o reemplazar la tarea. En un namespace privado no puedes configurar comprobaciones de Route 53 que sondeen tareas desde Internet. Para registros que siguen registrados pero están marcados como no saludables, Route 53 puede devolver hasta ocho si todos están no saludables y la política es multivalue; una respuesta DNS no garantiza que la aplicación acepte la conexión. La documentación de [Service Discovery en ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html) y de [salud de AWS Cloud Map](https://docs.aws.amazon.com/cloud-map/latest/dg/services-health-checks.html) explica los estados y las comprobaciones.

Ten en cuenta estos límites al diseñar los clientes:

- Un servicio de ECS configurado con Service Discovery admite hasta 1.000 tareas por servicio.
- Una respuesta <code>MULTIVALUE</code> devuelve hasta ocho registros saludables; una consulta DNS no es una lista completa de todas las réplicas ni un balanceador por solicitud.
- El servicio de ECS no puede registrarse en un namespace de Cloud Map compartido. Para cruzar clústeres o cuentas, revisa si Service Connect y los espacios de nombres compartidos cubren tu caso.
- Aunque crees un namespace público, ECS registra las direcciones privadas de las tareas. Para que clientes externos accedan a una aplicación, configura un punto de entrada apropiado, como un ALB.


Si creaste el servicio ECS nuevo del tutorial, reduce su capacidad a cero y elimina ese servicio; espera a que se detengan las tareas y desaparezcan sus instancias de Cloud Map. Después elimina el servicio Cloud Map y, cuando el namespace ya no tenga servicios, elimina el namespace. Si solo agregaste el registro a un servicio ECS que ya existía, no elimines ese servicio: restaura su configuración previa de <code>serviceRegistries</code>. Si antes no tenía registros, retíralos con <code>aws ecs update-service --cluster tutorial --service orders --service-registries &apos;[]&apos; --region us-east-1</code> y espera a que termine el despliegue antes de eliminar el servicio y el namespace Cloud Map creados solo para la prueba. Si el servicio ya tenía otra configuración de descubrimiento, consérvala y no elimines sus recursos. ECS administra el registro de sus tareas; los recursos Cloud Map que creaste quedan a tu cargo. Si creaste un clúster o una VPC solo para la prueba, elimínalos cuando ya no haya recursos que los usen. El [tutorial oficial de ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-service-discovery.html) detalla la limpieza; la referencia de [update-service](https://docs.aws.amazon.com/cli/latest/reference/ecs/update-service.html) confirma que una lista vacía retira <code>serviceRegistries</code> y activa un despliegue.

## Qué revisar si algo no funciona

| Síntoma | Revisa |
| --- | --- |
| <code>NXDOMAIN</code> o no hay respuestas | Nombre completo (<code>servicio.namespace</code>), ID y estado del namespace, nombre del servicio Cloud Map, instancias registradas y que la consulta salga de una VPC asociada con DNS habilitado. |
| Hay respuesta DNS, pero la conexión vence | Puerto del contenedor, regla de entrada del grupo de seguridad del servicio, rutas entre VPC y que la aplicación escuche en la interfaz de red correcta. |
| El nombre resuelve con un tipo, pero no con otro | Consulta el tipo que declaraste: <code>A</code>, <code>AAAA</code> o <code>SRV</code>. <code>AAAA</code> requiere IPv6 y <code>SRV</code> incluye el puerto. |
| Aparece una IP anterior después de un despliegue | TTL del registro, caché DNS de la aplicación, conexiones reutilizadas y tiempos de apagado de las tareas antiguas. |
| Una tarea defectuosa sigue apareciendo | Comprueba que la definición de tarea declare una health check y que ECS la reporte; inspecciona las instancias de Cloud Map y los eventos del servicio ECS. |

Para errores de permisos, revisa la identidad que crea los recursos y el rol vinculado al servicio de ECS, <code>AWSServiceRoleForECS</code>. ECS usa ese rol para administrar Cloud Map y Route 53; la aplicación no necesita permisos de Cloud Map para resolver nombres DNS. Consulta [cómo ECS usa sus roles vinculados a servicios](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using-service-linked-roles-for-clusters.html) y aplica permisos de mínimo privilegio al operador.

## Sigue practicando y comparte dudas

Estos materiales dan contexto de ECS y contenedores, aunque no configuran Cloud Map:

- El [Workshop de Amazon ECS](https://github.com/roxsross/workshop-ecs) presenta los pasos generales de despliegue en ECS y una alternativa local con Docker. Sirve para practicar el flujo básico antes de agregar descubrimiento DNS; revisa los requisitos y cargos antes de seguir la ruta en AWS.
- La grabación [Containers en AWS: Construyendo el ecosistema de contenedores en ECS](https://www.youtube.com/watch?v=vZk7uVwFMQA), publicada por AWS User Group Ecuador en 2023, aporta contexto sobre contenedores y ECS. [Del Container al Serverless: El Viaje de ECS y Fargate](https://www.youtube.com/watch?v=KsNBnuENO10), de abril de 2025, es una charla práctica del [canal de AWS User Group Guatemala](https://www.youtube.com/@awsugguatemala), que también reúne fundamentos, redes, seguridad y grupos de estudio. Usa estas grabaciones para aprender conceptos; consulta documentación actual para configurar servicios.
- El [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) sirve para conversar sobre DNS, conectividad híbrida y diseño de redes en AWS. En Argentina puedes conectar con otros profesionales en el [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/); en México, el [AWS User Group Ciudad de México](https://awsugcdmx.com/) organiza encuentros sobre contenedores, redes y otros temas de AWS.

Eventos anunciados al 6 de octubre de 2026:

- El [AWS Gaming Lab: ECS, CI/CD y la magia de Terraform](https://www.frc.utn.edu.ar/eventos/aws-gaming-lab-ecs-ci-cd-y-la-magia-de-terraform/) es presencial en Córdoba el 10 de octubre y gratuito con inscripción. La UTN-FRC indica que está destinado a estudiantes de Ingeniería en Sistemas de Información; revisa la [ficha oficial](https://www.frc.utn.edu.ar/eventos/aws-gaming-lab-ecs-ci-cd-y-la-magia-de-terraform/) y el [registro en Meetup](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/).
- El [Student Community Day Bolivia](https://studentcommunity.day/) se realiza en Cochabamba el 10 de octubre, con talleres, charlas de Cloud, dos streams virtuales y networking. La entrada es gratuita, el registro es obligatorio y los cupos limitados; se admite a cualquier persona interesada en tecnología. Consulta la [agenda y sus streams](https://studentcommunity.day/#agenda) y [registra tu asistencia](https://luma.com/r65j1ukn); para los laboratorios presenciales lleva notebook.
- El [AWS Community Day Guatemala 2026](https://www.awscommunitygt.com/) reúne charlas y networking el 10 de octubre en la Universidad Rafael Landívar. El [registro público](https://c.proticket.store/tickets/free/o/b88ac5c2-573b-438a-8587-12248067b887/e/e8fe1d69-4870-4d27-a63e-e499c819c7cd/s/350e165d-dc95-4e2b-9c97-1e90d63c6b97?category=2c1a98d1-c186-42e1-983d-f901df4e35f6&chart=ga) se anuncia sin costo; revisa la [agenda y los cupos](https://www.awscommunitygt.com/agenda/).
- El [AWS Community Day Paraguay 2026](https://www.awscommunitydayparaguay.com/) ofrece charlas, talleres prácticos y networking en español el 17 de octubre en San Lorenzo. La entrada es gratuita, con [registro](https://www.awscommunitydayparaguay.com/register) y cupos limitados; algunos labs requieren inscripción al acreditarse.
- El [AWS Student Community Day Chile](https://scdchile.cl/) es híbrido el 24 de octubre: tendrá laboratorios presenciales en Santiago y un track en línea para la región. El registro es gratuito y obligatorio; puedes inscribirte desde el [formulario](https://scdchile.cl/en/registro). La agenda incluye una charla introductoria sobre ECS frente a EKS.
- El [AWS Student Community Day CDMX](https://www.meetup.com/aws-sbg-at-national-polytechnic-institute-zacatenco-campus/events/316389437/) será presencial el 4 de noviembre en el IPN. Está dirigido a estudiantes e incluye talleres técnicos, hackathon, revisión de CV y networking; revisa el registro y los detalles vigentes del organizador.
- El [AWS Student Community Day Córdoba](https://www.meetup.com/aws-sbg-at-national-university-of-cordoba/events/316848908/) será presencial el 7 de noviembre en FaMAF-UNC. La comunidad anuncia entrada gratuita con cupos limitados y participación de estudiantes, profesionales, autodidactas y entusiastas; para el taller práctico se requiere notebook.
- El [AWS SBG Student Community Day Cuenca](https://discover.multiticketing.com/es/aws-student-builder-groups-ecuador/events/aws-sbg-student-community-day-cuenca-2026) se realizará el 14 de noviembre en la Universidad de Cuenca. Es una jornada de charlas, demostraciones y networking; el registro es gratuito, obligatorio y con cupos limitados.
- El [AWS Community Day Panamá — Security & Data Edition](https://www.meetup.com/aws-user-group-panama/events/316732293/) está anunciado para el 14 de noviembre y cubrirá seguridad y datos. Al revisar, el organizador aún no publicaba la sede ni el registro para asistentes; la ficha sí enlaza la convocatoria de speakers, abierta hasta el 10 de octubre.

Las fechas y condiciones de los eventos pueden cambiar; revisa la fuente antes de registrarte. Explora más [comunidades de AWS](/comunidades/) y [eventos de la comunidad](/eventos/) en el directorio.
