---
title: "Endpoint de interfaz vs. gateway en AWS: diferencias y cómo elegir"
description: "Compara los endpoints de interfaz y gateway de Amazon VPC: servicios compatibles, ENI y rutas, DNS, seguridad, alcance y costos."
author: "guille-ojeda"
publishedAt: "2025-02-20"
publishedTimestamp: "2025-02-20T00:10:01.732Z"
modifiedTimestamp: "2026-10-06T13:57:53-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Amazon DynamoDB para principiantes: claves y consultas"
    url: "https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/"
---

En este artículo, **endpoint** significa un endpoint de Amazon VPC, el recurso de red que permite llegar a servicios compatibles de AWS desde una VPC. No se refiere a la URL de una API de Amazon API Gateway.

La decisión rápida es esta: usa un **gateway endpoint** para llegar desde las subredes de una VPC a Amazon S3 o DynamoDB de la misma región, sin un cargo adicional por el endpoint. Elige un **endpoint de interfaz** cuando el servicio necesita AWS PrivateLink, cuando no existe un gateway endpoint para ese servicio o cuando una arquitectura compatible necesita llegar desde otra red, por ejemplo una red local conectada a la VPC. El endpoint de interfaz usa direcciones IP privadas y tiene cargos por hora y por datos procesados.

| Criterio | Endpoint de interfaz (*interface*) | Gateway endpoint |
| --- | --- | --- |
| Cómo funciona | Crea una interfaz de red elástica (ENI) con una IP privada en cada subred seleccionada. El tráfico llega a esa ENI usando DNS. | Agrega a las tablas de rutas seleccionadas una ruta hacia una lista de prefijos administrada por AWS para el servicio. |
| Servicios | Muchos servicios AWS compatibles con PrivateLink, además de servicios privados de otras cuentas o proveedores. La disponibilidad depende del servicio y la región. | Amazon S3 y DynamoDB. |
| Alcance | Puede servir a clientes de la VPC y, si la arquitectura y el servicio lo permiten, a redes conectadas. | Solo a recursos dentro de la VPC que usen una tabla de rutas asociada al endpoint. No se extiende a través de peering, Transit Gateway, VPN ni Direct Connect. |
| DNS y rutas | Ofrece nombres DNS regionales y zonales. Puedes habilitar DNS privado para que el nombre habitual del servicio resuelva a las IP privadas de las ENI. | El endpoint dirige las IP del servicio, identificadas por la lista de prefijos, desde las tablas de rutas asociadas. No crea una ENI ni reemplaza el nombre DNS del servicio. |
| Controles de red | El grupo de seguridad asociado a las ENI regula el tráfico de red hacia ellas. | No tiene un grupo de seguridad propio; se aplican las reglas de los recursos cliente y de sus subredes. |
| Cargo del endpoint | Se cobra por las horas de cada zona de disponibilidad donde está desplegado y por los datos procesados. | No tiene un cargo adicional por el endpoint. El servicio y otros cargos aplicables siguen sujetos a sus precios. |

Si primero necesitas repasar cómo se organizan las subredes y las rutas en una VPC, mira la grabación [AWS VPC Clase Práctica](https://www.youtube.com/watch?v=GIYD2k0dia4). Esa base ayuda a entender por qué un gateway endpoint modifica tablas de rutas y un endpoint de interfaz crea ENI.

Como taller más completo, [Esencial en AWS: Construir una VPC desde cero](https://www.nerdearla.com/nerdflix/TRKkGYHQumQ/) recorre rutas, NACL, grupos de seguridad y una aplicación de ejemplo. Es una grabación de 2022: si replicas el despliegue, confirma los pasos y cargos actuales en AWS y elimina los recursos al terminar.

## Qué cambia entre interfaz y gateway

### Endpoint de interfaz: ENI, IP privada y AWS PrivateLink

Cada subred que seleccionas recibe una ENI administrada por AWS con una dirección IP privada. El tráfico se dirige a esa interfaz mediante nombres DNS regionales o zonales. Para conservar el nombre habitual de un servicio, puedes habilitar DNS privado; esto requiere que la VPC tenga habilitados los nombres de host y la resolución DNS. Revisa los [requisitos de DNS y las opciones de configuración del endpoint de interfaz](https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html).

Los endpoints de interfaz usan AWS PrivateLink. Sirven para muchos servicios AWS, pero no para todos: comprueba que el servicio y la región que necesitas aparezcan como compatibles. También se usan para acceder a servicios privados ofrecidos por otra cuenta. Según el servicio y la arquitectura, los clientes de una VPC conectada o de una red local pueden alcanzar las ENI mediante rutas, DNS y controles de red correctamente configurados.

La diferencia de alcance no significa que cualquier endpoint de interfaz admita cualquier origen o servicio. Por ejemplo, la conectividad entre regiones de AWS PrivateLink se limita a servicios habilitados para esa función; la lista oficial actual incluye Amazon S3. Puede implicar permisos adicionales y cargos de transferencia entre regiones. Consulta la [lista vigente de servicios con acceso entre regiones](https://docs.aws.amazon.com/vpc/latest/privatelink/aws-services-cross-region-privatelink-support.html) y la [página de precios de AWS PrivateLink](https://aws.amazon.com/privatelink/pricing/).

### Gateway endpoint: una ruta para S3 o DynamoDB

Al crear el endpoint, eliges las tablas de rutas que usarán las subredes cliente. AWS añade a cada tabla una ruta cuyo destino es una lista de prefijos del servicio y cuyo destino de red es el gateway endpoint. Las solicitudes que coinciden con esa ruta se encaminan por el endpoint; una subred cuya tabla no está asociada sigue otra ruta.

Un gateway endpoint no usa AWS PrivateLink ni tiene ENI con IP privada. En el caso de S3 y DynamoDB, los clientes usan el endpoint público del servicio, pero la ruta del endpoint mantiene el tráfico dentro de la red de AWS, sin requerir una ruta por internet o NAT. El [funcionamiento y las reglas de enrutamiento de los gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html) explican también qué ruta prevalece cuando hay rutas más específicas.

Los gateway endpoints son regionales: crea el endpoint en la región del servicio; para S3, la documentación pide que coincida con la región de los buckets. El tráfico a un servicio en otra región no coincide con la lista de prefijos regional del endpoint. Si necesitas conectividad entre regiones, verifica primero si existe un endpoint de interfaz compatible para ese servicio. AWS documenta estas [condiciones para S3](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html) y [DynamoDB](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-ddb.html).

## Cómo elegir según tu arquitectura

**Elige un gateway endpoint** cuando una carga dentro de la VPC necesita llamar a S3 o DynamoDB de la misma región y las subredes pueden usar las tablas de rutas asociadas. Es la opción habitual para evitar que esas solicitudes dependan de un NAT Gateway; el endpoint en sí no añade un cargo.

**Elige un endpoint de interfaz** si necesitas llegar a otro servicio compatible, a un servicio privado ofrecido por otra cuenta o a un servicio desde una red conectada cuando el endpoint de gateway no puede servir como camino. En esa decisión incluye el costo por zona de disponibilidad y por volumen de datos, además de cualquier cargo de transferencia entre regiones.

**Para S3 o DynamoDB puedes combinar ambos tipos** en una VPC. Por ejemplo, la documentación de DynamoDB describe mantener el gateway endpoint para las aplicaciones dentro de la VPC y usar un endpoint de interfaz para el acceso desde una red local. S3 también admite ambos tipos: si habilitas DNS privado para el endpoint de interfaz sin configurar la opción específica para Resolver, las solicitudes originadas en la VPC pueden usar el endpoint de interfaz con cargo en vez del gateway sin cargo. AWS documenta una configuración de DNS privado para dirigir las solicitudes de la VPC al gateway y las de la red local al endpoint de interfaz; sigue esos [requisitos de DNS para S3](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html) antes de combinar las rutas.

Para estudiar esta arquitectura como código, el repositorio [Acceso a instancias EC2 privadas con VPC Endpoints y Systems Manager](https://github.com/pangoro24/aws-privatelink-private-instance-ssm) incluye endpoints de interfaz para Systems Manager y opciones de gateway o interfaz para S3. Tómalo como referencia de diseño, no como un laboratorio listo para repetir: la plantilla de VPC supone tres zonas de disponibilidad, la plantilla de EC2 fija IDs de AMI que debes verificar en tu región y la plantilla de S3 interfaz no activa DNS privado.

El despliegue puede generar cargos por EC2, endpoints de interfaz y almacenamiento S3; el README no explica cómo limpiar. Antes de desplegar, valida región, AMI, subredes, DNS, costos y permisos para crear recursos VPC, EC2, IAM, endpoints y S3, y prepara la eliminación de todas las pilas. Vacía todas las versiones y los marcadores de eliminación del bucket antes de borrar su pila de CloudFormation. El ejemplo opcional para Windows pasa una contraseña como parámetro de Run Command; no lo reutilices para manejar credenciales.

No elijas por promesas generales de rendimiento como “ilimitado” ni por las cifras antiguas de Gbps por ENI. AWS actualmente indica que el tráfico a través de un endpoint puede alcanzar hasta 10 Gbps por zona de disponibilidad de forma predeterminada y escalar automáticamente hasta 100 Gbps; al distribuir la carga entre zonas, publica un máximo agregado equivalente al número de zonas por 100 Gbps. Esto describe la capacidad documentada del endpoint, no garantiza el rendimiento de una aplicación: el servicio, la carga y otras cuotas también importan. Consulta las [cuotas y consideraciones vigentes de VPC endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-limits-endpoints.html) y prueba con tu patrón de tráfico.

## Seguridad: conectividad privada no equivale a permiso

Un endpoint permite una ruta hacia el servicio; no concede por sí mismo permiso para ejecutar sus acciones. Cuando el servicio admite políticas de endpoint, estas restringen qué principales pueden usar el endpoint para acceder al servicio. No reemplazan las políticas de identidad ni las políticas del recurso, como una política de bucket de S3. Consulta cómo [controlar el acceso con políticas de endpoint](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-access.html).

En un endpoint de interfaz, el grupo de seguridad asociado a las ENI debe admitir el tráfico entrante esperado desde los clientes, como HTTPS por TCP 443 si esa es la interfaz del servicio. También revisa la salida del grupo de seguridad del cliente y las ACL de red de ambas subredes.

En un gateway endpoint, aplica las reglas de salida del grupo de seguridad del cliente al prefijo del servicio. Las ACL de red deben permitir el tráfico de ida y vuelta hacia las direcciones del servicio; a diferencia de un grupo de seguridad, una ACL no puede referenciar una lista de prefijos. Mantén además la política de endpoint, la política IAM y la política del recurso alineadas con el acceso que quieres permitir.

## Qué revisar cuando la conexión falla

Empieza por confirmar el tipo de endpoint, el servicio y la región. Para un gateway endpoint, revisa que la tabla de rutas de la subred cliente esté asociada al endpoint y que la ruta cubra el servicio regional esperado. Una ruta más específica puede enviar ese tráfico a otro destino. Comprueba también que la resolución DNS apunte a direcciones del servicio que coincidan con la lista de prefijos del endpoint; con DNS propio, AWS exige que configures la resolución del servicio correctamente.

Para un endpoint de interfaz, comprueba que exista una ENI en las subredes elegidas y que el cliente resuelva el nombre de servicio al endpoint esperado. Si usas DNS privado, confirma los atributos DNS de la VPC y que el servicio ofrezca esa opción. Un nombre mal resuelto puede llevar la solicitud por una ruta distinta a la que intentabas probar.

Si la solicitud expira, revisa primero las reglas de red: el grupo de seguridad de la ENI debe aceptar el puerto del servicio desde el cliente, y el grupo del cliente y las ACL deben permitir el recorrido de ida y vuelta. Para acceder desde una red conectada, comprueba además las rutas de ida y retorno y la resolución DNS desde esa red. Un endpoint de interfaz no responde a pruebas ICMP como ping; prueba la conexión con el protocolo y puerto que usa la aplicación.

Si la red conecta pero el servicio devuelve <code>AccessDenied</code>, revisa los permisos de identidad y la política del servicio o recurso; si el servicio admite políticas de endpoint, revisa también esa capa. Una política de endpoint más amplia no concede un permiso que IAM o la política del recurso deniegan.

## Costos: qué es gratis y qué no

El gateway endpoint no tiene un cargo adicional por hora ni por datos procesados. Esto no vuelve gratuitos S3 o DynamoDB: las solicitudes, el almacenamiento y los demás elementos de la factura siguen el modelo de precio del servicio. El ahorro potencial aparece si el tráfico elegible deja de recorrer un NAT Gateway facturado; el resultado depende de la ruta y del uso real.

Un endpoint de interfaz puede generar cargos por cada hora de despliegue en cada zona de disponibilidad seleccionada y por cada GB de datos procesados. Los precios dependen de la región y del volumen. Si se conecta a un servicio de otra región, también pueden aplicarse cargos de transferencia entre regiones. Para estimar la factura, consulta las [tarifas actuales de AWS PrivateLink](https://aws.amazon.com/privatelink/pricing/) y analiza los tipos de uso de red con esta guía de [AWS Cost Explorer para tráfico de red](https://dondeaprendoaws.com/blog/como-usar-aws-cost-explorer-para-trafico-de-red/).

## Recursos y comunidad en español

Para seguir otras sesiones de la comunidad, explora el [canal de AWS Girls](https://www.youtube.com/@awsgirls7886).

Si quieres conversar sobre diseño de redes, el [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) se enfoca en redes híbridas, conectividad entre cuentas y diseño de redes en AWS. Consulta su página para conocer los próximos encuentros y confirmar fecha y modalidad. También hay una sesión virtual de fundamentos, [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/), programada para el miércoles 21 de octubre de 2026, de 18:00 a 20:00 GMT-5. La organizan desde un AWS Student Builder Group en Bogotá; requiere registro previo y tiene cupos limitados. Confirma en Meetup que la inscripción siga abierta antes de participar.
