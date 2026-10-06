---
title: "AWS VPC Traffic Mirroring: configuración, filtros y límites"
description: "Aprende qué ENIs admite Traffic Mirroring, cómo elegir un destino y revisar VXLAN, TLS, MTU, pérdida de paquetes y costos en AWS."
author: "guille-ojeda"
publishedAt: "2024-10-28"
publishedTimestamp: "2024-10-28T03:11:03.66Z"
modifiedTimestamp: "2026-10-06T15:59:00-03:00"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Amazon VPC: subredes, rutas, NAT y seguridad en AWS"
    url: "https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/"
  - title: "UEBA en AWS: GuardDuty, CloudTrail y análisis del comportamiento"
    url: "https://dondeaprendoaws.com/blog/guia-de-ueba-para-la-seguridad-de-aws/"
  - title: "Costos de red en AWS: 10 estrategias para reducir la factura"
    url: "https://dondeaprendoaws.com/blog/10-estrategias-para-optimizar-costos-de-red-en-aws/"
---

AWS VPC Traffic Mirroring copia de forma selectiva paquetes que entran o salen por una interfaz de red elástica (ENI) y los envía a un sistema de análisis. Sirve para investigar problemas de red o dar a una herramienta de inspección una copia del tráfico. La función aplica filtros y encapsula los paquetes en VXLAN; por sí sola no los analiza, no genera alertas y no bloquea conexiones.

Antes de activarla, confirma tres cosas: que la ENI de origen sea compatible, que exista una ruta hasta el destino y que el volumen y el tipo de datos que vas a copiar sean aceptables. Traffic Mirroring consume ancho de banda, puede perder paquetes bajo carga y tiene cargos por uso.

## Traffic Mirroring o VPC Flow Logs

Elige la herramienta según la pregunta que quieres responder:

| Necesidad | Opción | Qué entrega |
| --- | --- | --- |
| Saber qué direcciones IP se comunicaron con una interfaz, con qué protocolo y puerto, y si el flujo fue aceptado o rechazado | [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html) | Registros con metadatos de flujos IP; no incluyen el contenido de los paquetes. |
| Inspeccionar paquetes que coinciden con reglas elegidas | VPC Traffic Mirroring | Copias de paquetes enviadas a una ENI, un Network Load Balancer o un Gateway Load Balancer endpoint. Se necesita una herramienta que los procese. |

Son funciones complementarias: Flow Logs no registra el tráfico que Traffic Mirroring envía al destino. Si el objetivo es investigar comportamientos de usuarios o entidades, eso requiere otras señales y análisis; [la guía de UEBA](https://dondeaprendoaws.com/blog/guia-de-ueba-para-la-seguridad-de-aws/) trata ese problema distinto.

Si necesitas otra ruta de detección y respuesta, la grabación comunitaria [Amazon GuardDuty integrado con SIEM](https://www.youtube.com/watch?v=CQUICC2h0Oc) muestra ese tipo de integración. Es un flujo distinto: no convierte GuardDuty en destino de Traffic Mirroring ni significa que analice los paquetes espejados.

## Origen, destino, filtro y sesión

Una sesión relaciona tres componentes: la ENI de origen, el filtro que selecciona paquetes y el destino que recibe la copia.

### Qué ENI puede ser el origen

El origen debe ser una ENI de tipo `interface`. En EC2, Traffic Mirroring solo funciona con tipos de instancia incluidos en la [lista vigente de tipos compatibles de AWS](https://docs.aws.amazon.com/vpc/latest/mirroring/traffic-mirroring-sessions.html). No es una función exclusiva de instancias Nitro: la lista oficial incluye familias Nitro y no Nitro, y cambia con el tiempo; comprueba el tipo concreto antes de diseñar la sesión.

AWS también documenta un caso acotado para servicios administrados: se pueden usar como origen únicamente las interfaces de red **administradas por el solicitante y creadas por Amazon RDS o Amazon ElastiCache**. Esto no significa que cualquier interfaz de esos servicios, ni las ENI de otros servicios administrados, sean elegibles. Consulta las [limitaciones de origen](https://docs.aws.amazon.com/vpc/latest/mirroring/traffic-mirroring-network-limitations.html) y valida la ENI concreta.

Para repasar redes VPC antes de revisar interfaces y subredes, puedes ver la clase intermedia [AWS VPC 200 de AWS Girls Perú](https://www.youtube.com/watch?v=pF7cr3z1WTk).

Si prefieres una sesión práctica sobre VPC, consulta [AWS VPC Clase Práctica, también de AWS Girls Perú](https://www.youtube.com/watch?v=GIYD2k0dia4).

### Qué destinos admite

| Destino | Cuándo conviene | Requisito destacado |
| --- | --- | --- |
| ENI de una instancia con el colector | Prueba acotada o un solo appliance | El software del destino debe poder decodificar VXLAN. |
| Network Load Balancer (NLB) | Distribuir copias entre appliances | Configura un listener UDP en el puerto 4789 y registra appliances que procesen VXLAN. |
| Gateway Load Balancer endpoint | Enviar copias a appliances detrás de un GWLB, incluso desde una VPC consumidora | Los appliances deben procesar la encapsulación GENEVE del GWLB y la VXLAN interior de Traffic Mirroring. |

AWS recomienda NLB o Gateway Load Balancer endpoint cuando se necesita alta disponibilidad. Con NLB o GWLB puede haber entrega fuera de orden; si la herramienta de análisis depende del orden de llegada, verifica que pueda manejarlo. Revisa los [tipos de destino y sus condiciones](https://docs.aws.amazon.com/vpc/latest/mirroring/traffic-mirroring-targets.html).

Para repasar el papel de estos balanceadores, AWS Women Colombia tiene lecturas en español sobre [Network Load Balancer](https://awswomencolombia.com/100diasdeaws-dia17-aws-network-load-balancer) y [Gateway Load Balancer](https://awswomencolombia.com/100diasdeaws-dia19-aws-gateway-load-balancer). Ambas se actualizaron en febrero de 2023 y explican conceptos generales; para configurar el listener y las encapsulaciones de Traffic Mirroring, usa la documentación actual de AWS enlazada arriba.

## Flujo de configuración

### 1. Elige la interfaz y acota el objetivo

Decide qué carga y qué parte de su tráfico necesitas observar. Comprueba el tipo de interfaz y la familia/tamaño de EC2 en la documentación vigente. Define una pregunta concreta —por ejemplo, revisar conexiones TCP entrantes a un servicio— para que el filtro no copie tráfico que no necesitas.

### 2. Diseña reglas de entrada y salida

Los filtros tienen reglas independientes para tráfico **inbound** y **outbound**, vistas desde la ENI de origen. Cada regla puede aceptar o rechazar paquetes para copiar según protocolo, puertos y CIDR. AWS evalúa primero el número de regla más bajo; la primera coincidencia decide si el paquete se copia. Si el filtro no tiene reglas, no se copia tráfico.

Por ejemplo, para observar conexiones HTTPS entrantes a una instancia, una regla inbound podría aceptar TCP al puerto de destino 443 desde los CIDR que te interesan. Añade una regla outbound si también necesitas copiar las respuestas del servidor; aceptar entrada no incluye automáticamente la salida. Las acciones `accept` y `reject` controlan qué copia Traffic Mirroring: no permiten ni bloquean el tráfico original de la aplicación. Consulta [cómo se evalúan los filtros](https://docs.aws.amazon.com/vpc/latest/mirroring/traffic-mirroring-filters.html).

### 3. Prepara el destino y la ruta

El origen y el destino pueden estar en la misma VPC o en VPC distintas conectadas dentro de la región mediante VPC Peering, Transit Gateway o un Gateway Load Balancer endpoint. También puede haber distintos propietarios de cuenta si se comparte y acepta el recurso correspondiente. La copia encapsulada sale usando la tabla de rutas de la VPC de origen: confirma que pueda llegar a la IP del destino o al endpoint elegido. [AWS detalla estas opciones de conectividad](https://docs.aws.amazon.com/vpc/latest/mirroring/traffic-mirroring-connection.html).

Si tu ruta usa peering, la grabación [VPC Peering y Subnetting de AWS Girls Argentina](https://www.youtube.com/watch?v=yb7gdjhZsc8) repasa esos fundamentos. Para una arquitectura basada en Transit Gateway, consulta también la sesión de AWS User Group Panamá sobre [arquitecturas avanzadas con Transit Gateway](https://www.youtube.com/watch?v=457Ew9ODaIY).

En un destino con ENI, permite tráfico entrante UDP/4789 en su grupo de seguridad desde las direcciones de las ENI de origen que correspondan. Revisa las NACL de las subredes por las que pasa el paquete: son stateless, por lo que evalúan entrada y salida por separado. Si se usa un NLB, debe existir el listener UDP/4789; con GWLB endpoint, comprueba que las rutas de las VPC consumidoras conduzcan al endpoint correcto.

Hay dos detalles sobre las reglas de origen que suelen confundir:

- Un paquete inbound que la regla inbound del grupo de seguridad o la NACL de la ENI de origen descarta no se espeja.
- El tráfico espejado outbound no queda sujeto a las reglas outbound del grupo de seguridad de la ENI de origen.

El grupo de seguridad del destino, las rutas y las NACL aún pueden impedir que la copia llegue. [Los requisitos de VXLAN, seguridad y ruta](https://docs.aws.amazon.com/vpc/latest/mirroring/traffic-mirroring-targets.html) están en la guía de AWS.

### 4. Crea la sesión y comprueba la llegada

En la consola de VPC, crea o selecciona un mirror target, crea el filtro y crea la sesión asociando ENI, filtro y destino. Mantén la sesión limitada a las interfaces y reglas necesarias.

Para un destino EC2 que recibe VXLAN directamente, una captura corta puede confirmar que llegan datagramas al puerto esperado:

```bash
sudo tcpdump -nn -i eth0 -c 20 'udp dst port 4789'
```

Cambia `eth0` por la interfaz real del appliance. La opción `-c 20` termina la captura después de recibir 20 paquetes; si no llega tráfico, seguirá esperando y puedes detenerla con `Ctrl+C`. El comando muestra cabeceras, no vuelca el contenido completo del paquete. Después, usa el decodificador VXLAN de tu herramienta para inspeccionar la copia. Si el destino está detrás de un balanceador, verifica la captura en el appliance receptor.

También consulta las métricas de EC2 `NetworkMirrorIn`, `NetworkMirrorOut`, `NetworkSkipMirrorIn` y `NetworkSkipMirrorOut`. Las métricas `NetworkSkipMirror*` cuentan bytes que cumplían el filtro pero no se copiaron porque el tráfico de producción tuvo prioridad. [La referencia de métricas de Traffic Mirroring](https://docs.aws.amazon.com/vpc/latest/mirroring/traffic-mirror-cloudwatch.html) explica qué mide cada una.

No uses Reachability Analyzer como prueba de entrega de Traffic Mirroring: AWS indica que no reporta conectividad debida a esta función. Sirve para modelar otros caminos de red, pero no confirma que estén llegando paquetes VXLAN. Para la sesión, combina la revisión de rutas y reglas con métricas y una captura acotada en el destino; consulta las [limitaciones de Reachability Analyzer](https://docs.aws.amazon.com/vpc/latest/reachability/how-reachability-analyzer-works.html).

## Límites de contenido, MTU y capacidad

Traffic Mirroring captura lo que ve la interfaz y no descifra TLS. Si una aplicación usa HTTPS, el appliance recibe el payload cifrado: la copia puede ayudar a analizar cabeceras, tamaños y patrones de comunicación, pero no revela el contenido HTTP en texto claro. Para inspeccionar contenido descifrado necesitas hacerlo en un punto autorizado donde termina TLS, fuera de Traffic Mirroring. TLS está diseñado para que los datos protegidos solo sean visibles para sus extremos ([RFC 8446](https://www.rfc-editor.org/rfc/rfc8446.html)). Trata igualmente la captura como dato sensible: limita los filtros, quién puede acceder al destino y cuánto tiempo se conserva la evidencia.

VXLAN añade cabeceras al paquete original. Para un destino EC2 independiente, si la copia encapsulada supera el MTU del destino, el paquete puede truncarse. AWS indica que el MTU de origen debe quedar 54 bytes por debajo del MTU del destino para tráfico IPv4 y 74 bytes por debajo para IPv6; documenta 8947 bytes como MTU máximo sin truncamiento. Con un Gateway Load Balancer endpoint, el MTU máximo del GWLB es 8500, por lo que el paquete original entregable sin truncar tiene un máximo de 8446 bytes en IPv4 o 8426 en IPv6. Confirma el MTU de origen, el del destino y el de los appliances antes de interpretar paquetes incompletos. Consulta las [limitaciones de MTU de AWS](https://docs.aws.amazon.com/vpc/latest/mirroring/traffic-mirroring-network-limitations.html).

La copia también cuenta contra el ancho de banda de la instancia de origen. En el ejemplo de AWS, una ENI que recibe 1 Gbps y envía 1 Gbps debe manejar 4 Gbps al incluir ambas copias espejadas. Si la instancia supera límites de ancho de banda o paquetes por segundo, AWS descarta primero tráfico espejado. Si la carga sigue superando los límites, también puede perderse tráfico de producción. El appliance debe tener capacidad para recibir, decodificar y analizar el volumen seleccionado; filtrar mejor ayuda a contenerlo, pero no elimina los límites del camino.

Traffic Mirroring no está disponible en subredes solo IPv6 y no copia ciertos tipos de tráfico, como ARP, DHCP, consultas al servicio de metadatos, NTP y activación de Windows. Revisa la lista completa en la [documentación de limitaciones](https://docs.aws.amazon.com/vpc/latest/mirroring/traffic-mirroring-network-limitations.html).

## Costos y limpieza

Traffic Mirroring **no es gratuito**. AWS cobra por hora por cada ENI que tiene una sesión de mirroring activa. La página de precios muestra un ejemplo de **USD 0,015 por sesión-hora en us-east-2**; comprueba la tarifa vigente de la región y cuenta, además, la transferencia de datos. Si el destino está detrás de un NLB o GWLB, pueden aplicarse cargos de procesamiento del balanceador. Consulta los [precios de Amazon VPC](https://aws.amazon.com/vpc/pricing/) antes de ampliar la captura. Para revisar cómo se asignan otros cargos de red a sus flujos, consulta [Costos de red en AWS: 10 estrategias para reducir la factura](https://dondeaprendoaws.com/blog/10-estrategias-para-optimizar-costos-de-red-en-aws/).

La facturación puede continuar aunque detengas o termines la instancia, o separes la ENI, mientras la sesión siga activa. Al terminar una prueba, elimina la sesión de mirroring; después elimina filtros y destinos que ya no uses. Reducir el alcance de la prueba y borrar sus sesiones evita dejar cargos activos por olvido.

## Recursos y comunidad en español

Para repasar las rutas, subredes, grupos de seguridad y NACL que determinan si la copia llega, consulta [Amazon VPC: subredes, rutas, NAT y seguridad en AWS](https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/). Si quieres construir los fundamentos con un ejemplo, el taller en español [Esencial en AWS: Construir una VPC desde cero](https://www.nerdearla.com/nerdflix/TRKkGYHQumQ/) recorre tablas de rutas, NACL, grupos de seguridad y NAT.

Para conversar o seguir aprendiendo, estas comunidades publican actividades y material relacionado:

- [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/): comunidad técnica sobre conectividad híbrida, Transit Gateway, GWLB, VPC Flow Logs y Traffic Mirroring.
- [AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/): encuentros y contenido de seguridad en AWS para personas hispanohablantes.
- [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/): grupo local para compartir experiencias y conocimientos sobre AWS.
- [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/) y su [canal de YouTube](https://www.youtube.com/@AWSSecurityLATAM): comunidad y grabaciones en español sobre seguridad cloud.

**Evento verificado el 6 de octubre de 2026:** el [AWS Student Builder Group de la Universidad Distrital organiza “Amazon VPC Essentials: Fundamentos de Networking”](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) el 21 de octubre, en línea, de 18:00 a 20:00 (hora de Colombia, UTC−5). La ficha indica cupos limitados y requiere registro previo; comprueba allí si quedan lugares y los detalles de acceso.

Para encontrar encuentros posteriores, consulta la [agenda de eventos de las comunidades AWS](/eventos/).
