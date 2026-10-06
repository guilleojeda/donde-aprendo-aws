---
title: "Amazon VPC: subredes, rutas, NAT y seguridad en AWS"
description: "Qué es Amazon VPC, cómo funcionan subredes, rutas, IGW, NAT y endpoints, y cómo diagnosticar tráfico con Security Groups y NACL."
author: "guille-ojeda"
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T14:04:18.731Z"
modifiedTimestamp: "2026-10-06T14:04:22-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Cómo desplegar una aplicación en Amazon EKS con kubectl"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-una-aplicacion-en-amazon-eks/"
  - title: "Cómo configurar Service Discovery en Amazon ECS con AWS Cloud Map"
    url: "https://dondeaprendoaws.com/blog/configuracion-de-service-discovery-en-amazon-ecs/"
---

Amazon Virtual Private Cloud (Amazon VPC) es una red virtual lógicamente aislada que defines en una región de AWS. En ella organizas rangos IP, subredes, rutas y controles de tráfico para los recursos que necesitan comunicarse. “Nube privada virtual” es el nombre del servicio: no significa que tengas hardware físico exclusivo ni que una VPC sea segura por defecto. El aislamiento es lógico y el acceso depende de cómo configures la red y cada recurso. [La guía de Amazon VPC](https://docs.aws.amazon.com/vpc/latest/userguide/) explica sus componentes y límites.

Una VPC abarca las zonas de disponibilidad de su región. Cada subred, en cambio, pertenece a una sola zona. Esa diferencia permite separar funciones de red y distribuir una aplicación entre zonas para tolerar fallas. Antes de crear subredes, elige rangos CIDR que no se superpongan con las redes locales u otras VPC que vayas a conectar.

## Un ejemplo: balanceador público, aplicación privada y base de datos aislada

Imagina una VPC con el rango IPv4 <code>10.40.0.0/16</code>. La tabla muestra un ejemplo en dos zonas; los bloques <code>/24</code> son ilustrativos, no una recomendación de tamaño para todas las cargas.

| Subred | Zona | CIDR de ejemplo | Ruta IPv4 a Internet | Uso |
| --- | --- | --- | --- | --- |
| pública-a / pública-b | a / b | <code>10.40.0.0/24</code> y <code>10.40.1.0/24</code> | <code>0.0.0.0/0 → IGW</code> | Balanceador público |
| aplicación-a / aplicación-b | a / b | <code>10.40.10.0/24</code> y <code>10.40.11.0/24</code> | Si hace falta salida IPv4, <code>0.0.0.0/0 → NAT</code> | Instancias o tareas de aplicación |
| datos-a / datos-b | a / b | <code>10.40.20.0/24</code> y <code>10.40.21.0/24</code> | Sin ruta por defecto a Internet | Base de datos; solo acepta el tráfico requerido desde la aplicación |

Las subredes públicas tienen una ruta hacia un Internet Gateway (IGW). Eso las hace públicas según la definición de AWS, pero no asigna automáticamente una IP pública a cada instancia ni abre sus puertos. Las subredes privadas no tienen una ruta directa al IGW. Una subred aislada no tiene una ruta por defecto hacia otras redes; puede tener excepciones controladas, como un endpoint para un servicio compatible. [AWS describe estos tipos de subred](https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html).

Si quieres acompañar el ejemplo con una explicación audiovisual, puedes ver [AWS VPC 100](https://www.youtube.com/watch?v=7yq_7Dw4Qs8), del canal comunitario AWS Girls. Amazon EKS también usa subredes y grupos de seguridad de la VPC para conectar nodos y el plano de control; la [guía introductoria de Amazon EKS](/blog/comprendiendo-kubernetes-y-amazon-eks/) amplía cómo influyen en la conectividad y las actualizaciones de un clúster.

## Cómo deciden las rutas a dónde va el tráfico

Cada subred se asocia con una tabla de rutas; si no le asignas una de forma explícita, usa la tabla principal de la VPC. Una ruta relaciona un destino con un objetivo. La VPC incluye una ruta local para que sus propios rangos se comuniquen; otras rutas dirigen el tráfico, por ejemplo, a un IGW, un NAT Gateway, una VPN o un endpoint. Si coinciden varias rutas, se aplica la más específica. [La referencia de tablas de rutas](https://docs.aws.amazon.com/vpc/latest/userguide/RouteTables.html) explica las asociaciones y los objetivos.

Una tabla de una subred pública podría incluir:

<pre><code>10.40.0.0/16  → local
0.0.0.0/0     → igw-…</code></pre>

Una subred privada que necesite salida IPv4 a Internet podría incluir:

<pre><code>10.40.0.0/16  → local
0.0.0.0/0     → nat-…</code></pre>

La segunda configuración envía el tráfico IPv4 con destino a Internet al NAT Gateway. Este debe poder continuar la ruta hacia Internet. La ruta no reemplaza las reglas de seguridad: SG, NACL, direcciones asignadas, DNS y el servicio que recibe la conexión siguen importando.

### IGW: la ruta entre la VPC e Internet

Un Internet Gateway se adjunta a la VPC y puede ser el objetivo de una ruta para tráfico IPv4 o IPv6. Para que una instancia reciba conexiones por IPv4 desde Internet, además de la ruta al IGW necesita una IPv4 pública asociada a su interfaz de red, reglas que permitan el protocolo y puerto, y una aplicación escuchando en ese puerto. El IGW hace la traducción entre la IPv4 pública y la dirección privada de la instancia. Una ruta <code>0.0.0.0/0 → IGW</code>, por sí sola, no basta. [AWS detalla los requisitos de acceso mediante un IGW](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html).

IPv6 tiene un comportamiento distinto. Las direcciones IPv6 públicas son globales; para comunicar una instancia con Internet, la VPC y la subred deben tener un CIDR IPv6, la instancia debe recibir una dirección de ese rango y la tabla debe tener la ruta adecuada. Los grupos de seguridad y la NACL todavía pueden bloquear el tráfico. Para permitir solo conexiones salientes IPv6 se puede dirigir <code>::/0</code> a un egress-only Internet Gateway, que impide que Internet inicie conexiones hacia las instancias. [La guía de IPv6 en VPC](https://docs.aws.amazon.com/vpc/latest/userguide/egress-only-internet-gateway.html) describe esta opción.

### NAT Gateway: salida IPv4 desde subredes privadas

Un NAT Gateway público permite que recursos sin una IPv4 pública inicien conexiones IPv4 hacia Internet y reciban las respuestas de esas conexiones. No habilita conexiones entrantes iniciadas desde Internet hacia esos recursos. En el diseño zonal tradicional, se crea en una subred pública y esa subred tiene una ruta al IGW.

AWS ofrece NAT Gateways **zonales** y **regionales**. Un gateway zonal opera en una zona; si eliges esa modalidad y necesitas resiliencia entre zonas, AWS recomienda un NAT Gateway por zona y que las subredes privadas usen el NAT de su propia zona. Así evitas depender de una zona para toda la salida y reduces el tráfico entre zonas. Un NAT Gateway regional se expande a las zonas donde detecta interfaces de red de cargas de la VPC; no se coloca en una subred pública y usa una tabla de rutas propia. Su costo por hora depende de las zonas que cubra, además del procesamiento de datos y la transferencia aplicable. Revisa las diferencias de [NAT Gateway zonal y regional](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html) y su [precio vigente](https://aws.amazon.com/vpc/pricing/) antes de elegir.

Un NAT Gateway también puede traducir tráfico IPv6 a IPv4 (NAT64) cuando se combina con DNS64 y las rutas correspondientes. Para tráfico IPv6 saliente hacia Internet sin aceptar conexiones nuevas entrantes, usa el egress-only Internet Gateway; NAT64 resuelve otro caso: que una carga IPv6-only acceda a un destino IPv4-only. [AWS explica DNS64 y NAT64](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-nat64-dns64.html).

### VPC endpoints: acceso privado a servicios compatibles

Un VPC endpoint permite acceder desde la VPC a determinados servicios de AWS sin usar la ruta pública de Internet. Un gateway endpoint para S3 o DynamoDB se incorpora a las tablas de rutas asociadas y no tiene un cargo adicional por el endpoint. Los interface endpoints usan interfaces de red con direcciones privadas y AWS PrivateLink; pueden requerir DNS privado y un grupo de seguridad que permita el tráfico esperado. Su precio incluye horas de uso y procesamiento de datos. No todos los servicios ofrecen el mismo tipo de endpoint ni tienen las mismas condiciones. Consulta los [tipos de endpoint](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints.html), la guía de [gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html) y el [precio de AWS PrivateLink](https://aws.amazon.com/privatelink/pricing/).

## Security Groups y NACL cumplen funciones distintas

Ambos controlan tráfico, pero se aplican en puntos diferentes y procesan las respuestas de manera distinta.

| Control | Dónde se aplica | Reglas | Respuestas |
| --- | --- | --- | --- |
| Security Group (SG) | A las interfaces de red de los recursos | Permite tráfico; no tiene reglas de denegación ni un orden por número | Es stateful: si permite una conexión, su respuesta queda permitida automáticamente |
| Network ACL (NACL) | A una subred | Permite o deniega; evalúa reglas numeradas desde el número más bajo y aplica la primera que coincide | Es stateless: debes permitir por separado el tráfico de ida y el de respuesta |

Usa los SG como control principal del acceso a una carga: por ejemplo, permitir HTTPS al balanceador y permitir en la base de datos solo el puerto necesario desde el SG de la aplicación. Una NACL puede añadir una restricción común para la subred, pero al ser stateless puede bloquear respuestas si no contempla los puertos de retorno. Un SG solo permite, mientras que una NACL puede denegar. No asumas que todos los SG asociados a una interfaz tienen prioridad entre sí; sus reglas permitidas se combinan. [AWS compara Security Groups y NACL](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html).

## Diagnóstico: una instancia privada no puede descargar actualizaciones

Supón que una instancia EC2 en la subred de aplicación no puede conectarse por IPv4 a un repositorio externo. Revisa la ruta de extremo a extremo, en este orden:

1. **Subred y tabla asociada.** Confirma la zona, el CIDR y qué tabla usa esa subred. Si no aparece una asociación explícita, comprueba la asociación marcada como principal.
2. **Ruta y NAT.** La tabla de la aplicación necesita una ruta válida <code>0.0.0.0/0 → NAT</code>. Comprueba que el objetivo exista y esté disponible. Para un NAT zonal, revisa también que su subred tenga ruta al IGW. Para un NAT regional, revisa su estado y su tabla de rutas propia.
3. **Reglas de seguridad.** El SG de la instancia debe permitir la salida requerida. La NACL debe permitir la ida y el retorno, incluidos los puertos efímeros que use la respuesta. Verifica las reglas IPv4; las reglas IPv6 son independientes.
4. **DNS y servicio de destino.** Si el nombre no resuelve, revisa DNS y los atributos de resolución de la VPC. Si resuelve pero la conexión no se establece, verifica el puerto, la aplicación de destino y la ruta.
5. **Evidencia de red.** VPC Flow Logs pueden mostrar metadatos de flujos aceptados o rechazados, pero no el contenido de los paquetes. Un rechazo orienta la investigación; compáralo con las reglas de SG y NACL. Reachability Analyzer modela la configuración de una ruta entre dos recursos; no envía paquetes ni reemplaza una prueba real, y AWS cobra por análisis. [Consulta su alcance](https://docs.aws.amazon.com/vpc/latest/reachability/what-is-reachability-analyzer.html) y los [cargos actuales de Amazon VPC](https://aws.amazon.com/vpc/pricing/).

Estos comandos de AWS CLI permiten inspeccionar subredes, asociaciones, reglas y direcciones de una instancia. Sustituye los IDs de ejemplo por los de tu cuenta. Son consultas <code>describe</code>: no crean ni cambian recursos.

<pre><code class="language-bash">AWS_REGION="us-east-1"
VPC_ID="vpc-..."
SUBNET_ID="subnet-..."
INSTANCE_ID="i-..."

aws ec2 describe-subnets \
  --region "$AWS_REGION" \
  --subnet-ids "$SUBNET_ID" \
  --query 'Subnets[].{VpcId:VpcId,AZ:AvailabilityZone,CIDR:CidrBlock,AutoPublicIPv4:MapPublicIpOnLaunch}' \
  --output table

aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[].Instances[].{State:State.Name,Subnet:SubnetId,PrivateIp:PrivateIpAddress,PublicIp:PublicIpAddress,SecurityGroups:SecurityGroups[].GroupId}' \
  --output json

aws ec2 describe-route-tables \
  --region "$AWS_REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query '
    RouteTables[].{
      RouteTableId:RouteTableId,
      Associations:Associations[].{Main:Main,SubnetId:SubnetId},
      Routes:Routes[].{
        IPv4:DestinationCidrBlock,
        IPv6:DestinationIpv6CidrBlock,
        GatewayId:GatewayId,
        NatGatewayId:NatGatewayId,
        VpcEndpointId:VpcEndpointId,
        State:State
      }
    }' \
  --output json

SG_ID="sg-..." # Usa un grupo devuelto por describe-instances
aws ec2 describe-security-groups \
  --region "$AWS_REGION" \
  --group-ids "$SG_ID" \
  --query '
    SecurityGroups[].{
      Inbound:IpPermissions,
      Outbound:IpPermissionsEgress
    }' \
  --output json

aws ec2 describe-network-acls \
  --region "$AWS_REGION" \
  --filters "Name=association.subnet-id,Values=$SUBNET_ID" \
  --query '
    NetworkAcls[].{
      NetworkAclId:NetworkAclId,
      Entries:Entries[].{
        Rule:RuleNumber,
        Egress:Egress,
        Action:RuleAction,
        Protocol:Protocol,
        IPv4:CidrBlock,
        IPv6:Ipv6CidrBlock,
        Ports:PortRange
      }
    }' \
  --output json</code></pre>

Si la llamada falla, primero confirma región e IDs. En la salida de las tablas, busca la asociación explícita con la subred; si no la hay, usa la tabla que muestre <code>Main: true</code>. Luego comprueba qué ruta coincide con el destino y si su estado está activo. Para una conexión hacia Internet desde una subred privada, ver una ruta al NAT no demuestra que el camino completo funcione: revisa también el NAT, su siguiente salto, las reglas y DNS.

Si prefieres otra voz para repasar los conceptos, la [introducción a AWS VPC del AWS User Group Ecuador](https://www.youtube.com/watch?v=Qrt_xVVk5u0) y [Amazon VPC 101 de AWS Women Colombia](https://www.youtube.com/watch?v=KaekJTQUH7o) ofrecen explicaciones de la comunidad. Para acompañar el diagnóstico con un ejercicio en video, consulta [AWS VPC Clase Práctica de AWS Girls](https://www.youtube.com/watch?v=GIYD2k0dia4). Son materiales para aprender y comparar enfoques; contrasta los pasos de consola y los precios con la documentación vigente.

## Costos de Amazon VPC

AWS no cobra por usar la VPC base ni por el Internet Gateway, pero eso no significa que una arquitectura con VPC sea gratuita. Pueden cobrarse las instancias y otros servicios desplegados, las IPv4 públicas, la transferencia, las horas y los datos procesados por NAT Gateways, los interface endpoints y los análisis de conectividad. Los gateway endpoints de S3 y DynamoDB no tienen un cargo adicional por endpoint, pero el servicio y otras transferencias pueden tener cargos. Los precios dependen del servicio, la región, el modo y el uso; confirma el total en la [página de precios de Amazon VPC](https://aws.amazon.com/vpc/pricing/) antes de crear recursos.

## Recursos y comunidad

Para una práctica guiada en español, el taller [Esencial en AWS: Construir una VPC desde cero](https://www.nerdearla.com/nerdflix/TRKkGYHQumQ/) recorre tablas de rutas, SG, NACL, NAT y una aplicación con base de datos. Es una grabación de 2022: contrasta sus pasos y precios con la documentación actual antes de desplegar el laboratorio. El [repositorio del taller de Nerdearla](https://github.com/Pabloin/Nerdearla-2022-AWS-Workshop) reúne la presentación, archivos de apoyo y una plantilla CloudFormation del ejercicio. Puedes comparar su diseño con las rutas y controles de esta guía; antes de aplicar infraestructura de ese material de 2022, revisa compatibilidad, recursos facturables y limpieza. Para un repaso posterior, puedes ver [AWS VPC 200](https://www.youtube.com/watch?v=pF7cr3z1WTk), también del canal comunitario AWS Girls.

Si tus dudas pasan de una VPC a redes híbridas o múltiples cuentas, el [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) organiza su espacio alrededor de conectividad, enrutamiento multi-cuenta, DNS y observabilidad de red. Para una comunidad general con actividades y grupos de estudio, consulta el [AWS User Group Perú](https://awsugperu.cloud/). La [página de comunidades AWS](/comunidades/) reúne más grupos por país.

Al revisar el catálogo el 6 de octubre de 2026, encontramos dos actividades próximas. El AWS Student Builder Group de la Universidad Distrital ofrece la sesión online [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) el **21 de octubre de 2026, de 18:00 a 20:00, según la hora indicada en Meetup**. La ficha indica registro previo y cupos limitados. Si estás en Paraguay, el [AWS Community Day Paraguay](https://www.awscommunitydayparaguay.com/register) será presencial el **17 de octubre de 2026, de 08:00 a 18:00**, en el SNPP de San Lorenzo; la entrada es gratuita y el cupo es limitado. Los talleres también tienen cupos limitados, se reservan durante la acreditación y pueden tener requisitos propios. Confirma inscripción, horario y condiciones en cada ficha antes de asistir. La [agenda de eventos AWS](/eventos/) ayuda a encontrar otras actividades.
