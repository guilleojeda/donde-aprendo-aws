---
title: "Endpoints de VPC en AWS: gateway, interfaz y PrivateLink"
description: "Qué es un endpoint de VPC, cuándo elegir gateway o interfaz y cómo revisar DNS, permisos, timeouts y costos al conectar servicios de AWS."
author: "guille-ojeda"
publishedAt: "2025-02-17"
publishedTimestamp: "2025-02-17T00:17:36.99Z"
modifiedTimestamp: "2026-10-06T23:36:27-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Amazon VPC: subredes, rutas, NAT y seguridad en AWS"
    url: "https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/"
  - title: "Costos de red en AWS: 10 estrategias para reducir la factura"
    url: "https://dondeaprendoaws.com/blog/10-estrategias-para-optimizar-costos-de-red-en-aws/"
  - title: "AWS Lambda: qué es, cómo funciona y cuándo usarlo"
    url: "https://dondeaprendoaws.com/blog/que-es-aws-lambda-preguntas-y-respuestas/"
---

**Un endpoint de VPC permite conectar recursos de tu VPC con un servicio o recurso compatible mediante un camino privado.** Para ese destino puedes prescindir de un Internet Gateway, NAT o una IP pública. Por ejemplo, una aplicación en subredes privadas puede leer un objeto de S3 o enviar mensajes a SQS sin necesitar salida a Internet para esas llamadas. [AWS explica esta conectividad en la introducción a PrivateLink](https://docs.aws.amazon.com/vpc/latest/privatelink/what-is-privatelink.html).

Para empezar, distingue dos opciones: **gateway endpoint**, que incorpora rutas hacia S3 o DynamoDB y no tiene cargo adicional por endpoint, e **interface endpoint**, que crea interfaces de red con IP privadas y usa AWS PrivateLink. Elegir depende del servicio y de dónde están sus clientes. Crear el endpoint tampoco concede permisos IAM ni garantiza que tu aplicación lo use.

Si todavía estás ubicando subredes, tablas de rutas y NAT, lee primero [Amazon VPC: subredes, rutas, NAT y seguridad](/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/). Para acompañar ese repaso, las grabaciones [AWS VPC 100](https://www.youtube.com/watch?v=7yq_7Dw4Qs8) de AWS Girls e [Introducción a AWS VPC](https://www.youtube.com/watch?v=Qrt_xVVk5u0) del AWS User Group Ecuador ofrecen material en español.

## Gateway vs. interface endpoint: cuál elegir

AZ significa zona de disponibilidad. Los Security Groups controlan tráfico de las interfaces; las listas de control de acceso de red (NACL) se aplican a las subredes.

| Pregunta | Gateway endpoint | Interface endpoint |
| --- | --- | --- |
| ¿A qué conecta? | S3 y DynamoDB | Servicios compatibles con PrivateLink: servicios AWS, de terceros o propios |
| ¿Cómo llega el tráfico? | Una ruta cuyo destino es la lista de prefijos del servicio apunta al endpoint | El cliente se conecta a las IP privadas de las interfaces del endpoint |
| ¿Qué configuras? | VPC, tablas de rutas y política del endpoint | VPC, subredes/AZ, Security Groups, DNS y política cuando el servicio la admite |
| ¿Tiene Security Group propio? | No; siguen aplicando los controles de la carga y su subred | Sí, asociado a sus interfaces |
| ¿Puede usarlo una red local u otra VPC? | No puede extenderse por VPN, Direct Connect, peering o Transit Gateway | Puede ser accesible con conectividad privada, rutas, DNS y controles adecuados |
| ¿Cuánto cuesta el endpoint? | Sin cargo adicional por endpoint | Horas por endpoint y AZ, más datos procesados y cargos aplicables |

La [guía de gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html) y la [guía de creación de interface endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html) detallan la configuración. Tanto S3 como DynamoDB ofrecen las dos alternativas. Para llamadas desde la misma VPC y región, gateway suele ser el punto de partida por su alcance y costo; para clientes que necesitan llegar desde otra red, considera interfaz.

AWS reconoce además tres tipos: **Gateway Load Balancer**, para llevar tráfico a dispositivos virtuales como firewalls; **Resource**, para acceder a recursos compartidos sin exigir un balanceador; y **Service network**, para acceder a servicios y recursos de una red de Amazon VPC Lattice. Los cuatro tipos distintos de gateway usan PrivateLink. Esta guía se concentra en gateway e interfaz porque resuelven la comparación habitual para consumir servicios AWS. [Consulta la lista completa de tipos](https://docs.aws.amazon.com/vpc/latest/privatelink/concepts.html).

## Ejemplo 1: una aplicación privada que lee S3

Imagina una instancia EC2 en una subred privada y un bucket de propósito general en la misma región. La aplicación usa el SDK de S3. Para darle un camino por gateway endpoint:

1. Seleccionas el servicio S3 de esa región, por ejemplo `com.amazonaws.us-east-1.s3`.
2. Asocias el endpoint con la tabla que realmente usa la subred de EC2. AWS incorpora la ruta de la lista de prefijos de S3 hacia el endpoint.
3. Revisas la salida permitida por el Security Group de EC2 y las reglas de la NACL, incluida la respuesta.
4. Verificas que el rol, la política del bucket y la política del endpoint permitan la lectura requerida.

La aplicación sigue resolviendo el nombre regional de S3. **Ver una IP pública de S3 en DNS no demuestra que el tráfico esté pasando por Internet**: en gateway endpoints, la ruta determina el camino. Una ruta al prefijo regional del servicio puede prevalecer sobre la ruta por defecto al NAT. En interfaz, en cambio, el nombre puede resolver a las IP privadas del endpoint.

El gateway endpoint debe estar en la región del bucket y no puede aprovecharse desde otra VPC a través de peering o Transit Gateway. Al asociar o cambiar rutas, las conexiones TCP existentes pueden interrumpirse; comprueba la reconexión de la aplicación. Estas condiciones están en la [documentación de gateway endpoints para S3](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html). Para una tabla DynamoDB, el patrón de rutas es equivalente y debes comprobar la región de la tabla y sus permisos en la [guía de DynamoDB](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-ddb.html).

Si quieres examinar un ejemplo con infraestructura como código, el repositorio de Pablo González Robles [EC2 privada con VPC Endpoints y Systems Manager](https://github.com/pangoro24/aws-privatelink-private-instance-ssm) reúne plantillas de CloudFormation y alternativas de S3 gateway e interfaz. Úsalo para comparar componentes y políticas antes de adaptarlo: despliega recursos facturables y requiere revisar permisos, parámetros y limpieza.

## Ejemplo 2: enviar mensajes a SQS con un interface endpoint

Supón ahora que esa aplicación envía mensajes a una cola de SQS en `us-east-1`. Puedes crear el interface endpoint `com.amazonaws.us-east-1.sqs`, elegir subredes y asociar un Security Group que permita HTTPS entrante desde las cargas autorizadas. El rol de la aplicación sigue necesitando `sqs:SendMessage` sobre la cola correspondiente. [La documentación de SQS describe el uso de PrivateLink y sus políticas](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-internetwork-traffic-privacy.html).

AWS crea una interfaz del endpoint por subred seleccionada; puedes elegir una subred por AZ. Para una carga que necesita tolerar una falla zonal, considera interfaces en al menos dos AZ y comprueba el comportamiento del cliente ante errores. La cantidad de AZ también influye en el costo. Revisa primero la [disponibilidad y el nombre exacto del servicio](https://docs.aws.amazon.com/vpc/latest/privatelink/aws-services-privatelink-support.html): un endpoint para una API no habilita automáticamente todas las APIs o dependencias de ese servicio.

### Qué cambia al activar DNS privado

Con DNS privado habilitado y los atributos `enableDnsSupport` y `enableDnsHostnames` activos, el nombre regional habitual del servicio resuelve dentro de la VPC a las IP privadas del endpoint. Esto permite que un SDK que usa ese nombre aproveche el nuevo camino sin cambiar su configuración. Confirma qué nombre utiliza tu aplicación: un endpoint personalizado, FIPS o dual-stack puede tener requisitos propios.

Desde una red local necesitas conectividad privada hacia las interfaces y resolver los nombres correctamente. Puedes usar VPN o Direct Connect y, cuando corresponde, Route 53 Resolver para integrar DNS. La zona privada administrada del endpoint no se propaga automáticamente a todas las otras redes. [AWS explica DNS y acceso desde otras redes](https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html).

Si centralizas endpoints en una VPC, planifica por separado cómo llegan los clientes y cómo resuelven DNS. AWS RAM tiene funciones para compartir recursos y redes de servicios de PrivateLink, pero no convierte un gateway endpoint en un endpoint compartido para otras VPC.

## ¿Un endpoint reemplaza NAT o la salida a Internet?

Reemplaza el camino de los **destinos compatibles que hayas configurado**. Un gateway endpoint de S3 permite leer S3; no permite descargar paquetes de cualquier repositorio externo. Un interface endpoint de SQS permite llamar SQS; no da acceso a una API de pagos en Internet.

En una función Lambda conectada a tu VPC, esas diferencias explican muchos timeouts. Por ejemplo, si el código consulta RDS privado, lee S3 y llama una API externa por IPv4, necesitas el acceso privado a RDS, un camino a S3 y salida IPv4 para la API externa. S3 puede ir por gateway endpoint; la llamada externa puede requerir NAT. **Poner Lambda en una subred pública no le asigna una IP pública ni le da salida a Internet.** Consulta la [guía de acceso a Internet de Lambda conectada a VPC](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html).

La conexión de Lambda a tu VPC controla el acceso del código a los recursos de red. No obliga a que sus invocaciones entren por un endpoint. Del mismo modo, crear un endpoint para la API de Lambda no configura los caminos salientes de una función hacia S3, SQS u otros destinos. [La guía de configuración VPC de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html) permite distinguir ambas cosas. Para separar invocación, ejecución y permisos, continúa con [qué es AWS Lambda y cómo funciona](/blog/que-es-aws-lambda-preguntas-y-respuestas/).

## Red y permisos: por qué puede aparecer AccessDenied

Un endpoint privado aporta conectividad; la autorización depende de las políticas aplicables. El Security Group del interface endpoint controla quién puede establecer conexiones hacia sus interfaces. La política del endpoint, si el servicio la admite, restringe qué principales, acciones y recursos pueden usarse por ese camino. Las políticas IAM y las políticas del recurso también siguen vigentes. [AWS aclara que una endpoint policy no sustituye esas políticas](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-access.html).

Por ejemplo, para leer `s3://mi-bucket/reportes/ventas.csv`, revisa el permiso `s3:GetObject` del rol, la política del bucket y la política del endpoint; si el objeto usa cifrado SSE-KMS, revisa también los [permisos de la clave KMS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html). Un endpoint existente y disponible no prueba que la operación esté autorizada.

Una política del endpoint tampoco impide por sí sola usar otro camino público. Para exigir que un bucket se acceda desde un endpoint concreto puedes usar condiciones como `aws:SourceVpce` en su política. Diseña esa restricción contemplando accesos de consola y servicios: una denegación para solicitudes que no pasan por el endpoint puede bloquearlos. La [guía de políticas de bucket para VPC endpoints](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies-vpc-endpoint.html) muestra ese efecto.

## Diagnóstico: timeouts, DNS y llamadas rechazadas

Empieza por una llamada concreta: origen, servicio, nombre DNS, región, operación y mensaje de error. Este orden ayuda a separar problemas:

1. **Endpoint y destino.** Comprueba el tipo, servicio, estado y región; confirma que la aplicación llama al destino cubierto.
2. **DNS y rutas.** Para interfaz, consulta DNS desde el entorno de la carga y compáralo con las interfaces del endpoint. Para gateway, revisa la tabla asociada a la subred y la ruta del prefijo del servicio.
3. **Conexión.** Ante un timeout, revisa SG, NACL y rutas de ida y retorno. En interfaces para APIs HTTPS, verifica TCP 443 entrante al endpoint y salida desde la carga. Un interface endpoint no responde a `ping`; esa prueba no determina si funciona.
4. **Autorización.** Ante `AccessDenied`, identifica el principal real y revisa IAM, endpoint policy y política del recurso, además de las denegaciones aplicables. Aumentar el timeout no corrige permisos.

La [guía de interface endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html) especifica los requisitos de red y la limitación de ICMP. Puedes consultar la configuración con este comando de lectura; sustituye región e ID por los de tu entorno:

```bash
aws ec2 describe-vpc-endpoints \
  --region us-east-1 \
  --vpc-endpoint-ids vpce-0123456789abcdef0 \
  --query 'VpcEndpoints[].{Type:VpcEndpointType,State:State,Service:ServiceName,PrivateDNS:PrivateDnsEnabled,Subnets:SubnetIds,Routes:RouteTableIds,Groups:Groups,DNS:DnsEntries}' \
  --output json
```

La [referencia de `describe-vpc-endpoints`](https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-vpc-endpoints.html) describe sus campos. Ver `available` confirma el estado del recurso, pero debes probar la operación desde la carga con sus credenciales. Para examinar conectividad desde una VPC, Diana Alfaro explica [cómo crear un VPC Environment en CloudShell](https://blog.alfalfita.cloud/crear-un-vpc-environment-en-aws-cloudshell); comprueba región, subred y SG al reproducirlo.

## Costos: qué puedes ahorrar y qué sigue cobrándose

Los gateway endpoints de S3 y DynamoDB no tienen cargo adicional por endpoint. Si un flujo deja de atravesar NAT, puedes evitar su procesamiento NAT. Las horas del NAT continúan mientras ese gateway siga aprovisionado para otros destinos, y los cargos de S3, DynamoDB y transferencia aplicables siguen existiendo.

En interfaces, calcula **horas por endpoint y AZ + GB procesados**, y agrega los cargos aplicables de otros servicios o transferencias del diseño. Cinco endpoints en dos AZ generan diez combinaciones endpoint-AZ facturables por hora; no es lo mismo que un único endpoint. El volumen de tráfico y la región determinan el total. Usa los [precios actuales de PrivateLink](https://aws.amazon.com/privatelink/pricing/) y de [Amazon VPC](https://aws.amazon.com/vpc/pricing/), y amplía el análisis con [Costos de red en AWS: 10 estrategias para reducir la factura](/blog/10-estrategias-para-optimizar-costos-de-red-en-aws/).

Tampoco asumas que un endpoint reduce siempre la latencia. Evalúa la ruta, la distribución por AZ y el comportamiento del servicio con una carga representativa. La razón para elegirlo puede ser controlar la conectividad privada aunque la alternativa cueste menos.

## Recursos y comunidades para seguir aprendiendo

Puedes continuar según la pregunta que te haya quedado. Estas recomendaciones enlazan al material original:

- **Practicar rutas y controles:** [AWS VPC Clase Práctica](https://www.youtube.com/watch?v=GIYD2k0dia4) y [AWS VPC 200](https://www.youtube.com/watch?v=pF7cr3z1WTk), de AWS Girls, acompañan el repaso con grabaciones sobre VPC. El taller [Esencial en AWS: construir una VPC desde cero](https://www.nerdearla.com/nerdflix/TRKkGYHQumQ/) de Pablo Inchausti tiene un [repositorio de apoyo](https://github.com/Pabloin/Nerdearla-2022-AWS-Workshop). Es material de 2022: revisa plantillas, precios y limpieza antes de desplegarlo.
- **Repasar fundamentos con otras explicaciones:** [Amazon VPC 101](https://www.youtube.com/watch?v=KaekJTQUH7o), de AWS Women Colombia; [la sesión VPC del Cloud Practitioner Challenge](https://www.youtube.com/watch?v=P53OftYxmtI), de Buenos Aires; y [AWS Redes 101](https://www.youtube.com/watch?v=y9ExCJSfZCs), de Panamá, permiten volver sobre los conceptos previos a elegir un endpoint.
- **Comparar formas de conectar redes y servicios:** [VPC e interconexiones de VPC](https://www.youtube.com/watch?v=Mcffd13mkPc) y [Diseña tu red en la nube](https://www.youtube.com/watch?v=v4AG4qwEQg0), de Guatemala, ofrecen contexto de redes. Su charla [DEJA DE HACER PEERING](https://www.youtube.com/watch?v=nFOCbh-wcLA) aborda PrivateLink y VPC Lattice; úsala para comparar casos de uso, no como una prohibición general del peering.
- **Explorar diseños más amplios:** [Construyendo tu arquitectura de networking](https://www.youtube.com/watch?v=fIU0VUOdWaI), [Simplificando redes con Transit Gateway](https://www.youtube.com/watch?v=FSA-Io7oakg) y [Amazon VPC Lattice](https://www.youtube.com/watch?v=vwAda02OH18), de AWS Women Colombia, ayudan a situar endpoints dentro de decisiones de conectividad. [Construyendo tu VPC con Claudia](https://www.youtube.com/watch?v=Ha-uhfObpl4), del AWS User Group Perú, suma otra conversación sobre el diseño de VPC.

Las grabaciones son complementos de aprendizaje; contrasta configuraciones, servicios disponibles y precios con la documentación actual. Puedes seguir los canales de [AWS Girls](https://www.youtube.com/@awsgirls7886), [AWS Women Colombia](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw), [AWS User Group Guatemala](https://www.youtube.com/@awsugguatemala) y [AWS UG Buenos Aires](https://www.youtube.com/@awsugbsas) para encontrar sus otras sesiones.

Para conversar sobre una duda de red, [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) centra su espacio en conectividad, DNS y redes AWS. Las comunidades generales también son útiles: [AWS User Group Perú](https://awsugperu.cloud/) publica actividades y grupos de estudio; [AWS Guatemala](https://www.meetup.com/aws-guatemala/) invita a compartir casos de uso; y [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) reúne a personas que aprenden y comparten experiencias. [AWS Women Colombia](https://www.meetup.com/aws-women-colombia-user-group/) y [AWS Girls Perú](https://www.meetup.com/aws-girls-peru/) promueven la participación de mujeres y dan la bienvenida a otros participantes. Consulta las condiciones de cada actividad en su ficha.

En la revisión del **6 de octubre de 2026**, la agenda incluía [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/), del AWS Student Builder Group de la Universidad Distrital de Bogotá: sesión virtual el **21 de octubre de 2026, de 18:00 a 20:00, hora de Colombia (UTC−5)**, con registro previo y cupos limitados. Sirve para reforzar subredes y rutas; la ficha no promete un taller específico de endpoints. Confirma disponibilidad y horario al registrarte. Para otras fechas o países, consulta [comunidades](/comunidades/) y [eventos](/eventos/).

## Preguntas frecuentes

### ¿VPC endpoint y AWS PrivateLink son lo mismo?

El endpoint es el recurso que configuras para acceder al destino. PrivateLink es la tecnología que sostiene los endpoints de interfaz, Gateway Load Balancer, recursos y redes de servicios. Los gateway endpoints para S3 y DynamoDB usan rutas y no PrivateLink.

### ¿Puedo acceder a S3 desde mi oficina usando un gateway endpoint?

No. Un gateway endpoint no se extiende a clientes de VPN o Direct Connect. Para acceso privado mediante endpoint desde esa red, considera un interface endpoint y configura conectividad, permisos y DNS. Si combinas ambos tipos para S3, revisa [la opción de DNS privado solo para el Resolver entrante](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html), que permite separar el camino de clientes locales y de la VPC.

### ¿Los endpoints funcionan entre regiones?

Los gateway endpoints son regionales. PrivateLink sí permite interface endpoints hacia servicios habilitados en otra región, con permisos y condiciones específicos; para servicios AWS debes usar DNS regional y revisar las regiones y AZ admitidas. Consulta la [lista de servicios AWS habilitados para acceso entre regiones](https://docs.aws.amazon.com/vpc/latest/privatelink/aws-services-cross-region-privatelink-support.html). Ese acceso puede sumar transferencia entre regiones y no proporciona failover automático entre regiones.

### ¿Crear un endpoint vuelve privado mi bucket o mi cola?

No cambia por sí solo toda la política de acceso del recurso. Debes mantener sus controles de autorización y, si necesitas exigir un camino concreto, establecer las condiciones admitidas por el servicio. Comprueba tanto el acceso autorizado como el rechazo esperado antes de imponer una restricción.
