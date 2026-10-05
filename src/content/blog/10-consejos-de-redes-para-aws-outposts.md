---
title: "Redes en AWS Outposts: service link, BGP y gateway local"
description: "Entiende cómo se conectan los racks y servidores de AWS Outposts, qué tráfico usa el service link o la red local y cómo planificar y diagnosticar cada ruta."
author: "guille-ojeda"
publishedAt: "2024-05-14"
publishedTimestamp: "2024-05-14T05:11:03.706Z"
modifiedTimestamp: "2026-10-04T21:26:34-03:00"
cover: "/assets/blog/d57b2c7f6d8d4785748ce1c5.png"
coverAlt: "Árbol estilizado que brota de un dispositivo con raíces de circuitos"
ogImage: "/assets/blog/d57b2c7f6d8d4785748ce1c5.png"
related:
  - title: "Conceptos Básicos y Avanzados de Amazon VPC"
    url: "https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/"
    image: "/assets/blog/12c27432a1ba20e5bffcb7b0.jpg"
    imageAlt: "Diagrama de una nube y nodos conectados sobre una superficie reflectante"
---

La red de AWS Outposts depende primero del **factor de forma**. En un rack, el *service link* comunica el Outpost con su región de AWS y un **gateway local** conecta las subredes del Outpost con la red del sitio. En un servidor, el *service link* también llega a la región, pero la conexión con la LAN se hace mediante una **interfaz de red local (LNI)**. Son rutas y controles diferentes; por eso, no hay una configuración única que sirva para todos los Outposts.

La guía siguiente explica qué hace cada ruta, qué papel cumple BGP y qué revisar antes de instalar o al diagnosticar una interrupción. Para valores de puertos, cableado y capacidad, confirma siempre el modelo y la generación en la guía de [requisitos de racks](https://docs.aws.amazon.com/outposts/latest/userguide/outposts-requirements.html) o en la guía de [conectividad local de servidores](https://docs.aws.amazon.com/outposts/latest/server-userguide/local-server.html).

## 1. Distingue racks de servidores

### En un Outposts rack

- AWS provisiona el *service link*, que usa túneles VPN cifrados. En el sitio, la ruta usa VLAN y BGP entre los dispositivos de red de Outposts y los equipos locales.
- El **gateway local (LGW)** conecta las subredes del Outpost con la red local mediante una VLAN, VIF, BGP y tablas de rutas.
- Hay sesiones eBGP separadas para las rutas del *service link* y del LGW. La cantidad de dispositivos y la topología física dependen de la generación.
- AWS requiere LACP dinámico para los grupos de agregación de enlaces; LACP agrega enlaces, pero por sí solo no brinda alta disponibilidad.

### En un Outposts server

- El cliente configura el *service link* desde el servidor hasta la región elegida. El servidor inicia un túnel VPN cifrado.
- La **interfaz de red local (LNI)** conecta una interfaz adicional de la instancia directamente con una red física de capa 2. No hay un LGW de Outposts para esta función.
- La LNI no crea una sesión BGP de Outposts. La instancia y la red local se configuran según el diseño del sitio.
- Los puertos físicos no son redundantes. Los dos cables separan tráfico del *service link* y de la LNI; AWS aclara que esa separación no ofrece redundancia.

Consulta [cómo se conecta un rack de primera generación](https://docs.aws.amazon.com/outposts/latest/userguide/local-rack.html), [los requisitos de red de racks de segunda generación](https://docs.aws.amazon.com/outposts/latest/network-userguide/outposts-rack2ndgen-requirements.html) y [cómo se conecta un servidor](https://docs.aws.amazon.com/outposts/latest/server-userguide/local-server.html) antes de trasladar una recomendación de un factor de forma al otro. Las velocidades, cantidades de puertos y requisitos físicos dependen del modelo y la generación.

## 2. Qué hace el service link

El *service link* es una conexión lógica cifrada entre el Outpost y su región principal. Lleva tráfico de administración —como monitoreo y actualizaciones— y tráfico entre el Outpost y las VPC asociadas, incluido tráfico de datos de clientes. No es una ruta genérica para llegar a la LAN local.

En los racks, la VLAN y la VIF del *service link* establecen conectividad y BGP con los equipos de red del sitio; después, el túnel VPN llega a la región. En servidores, el cliente configura el enlace siguiendo la guía del equipo. El transporte del rack puede ser por Internet o Direct Connect; también existe una opción de conectividad privada del *service link* mediante VIF privada o de tránsito de Direct Connect. **Los servidores no admiten conectividad privada por VPC para su service link**: requieren conectividad hacia los endpoints regionales, DNS público para el registro y las reglas de firewall documentadas para servidores.

La elección entre conectividad pública y privada, y el camino WAN que la sostiene, depende de la arquitectura y de la política de red de cada sitio. Revisa las opciones de [conectividad regional](https://docs.aws.amazon.com/outposts/latest/server-userguide/region-connectivity.html) y, para racks, las [opciones privadas del service link](https://docs.aws.amazon.com/outposts/latest/userguide/private-connectivity.html). No deduzcas el camino de una aplicación solo porque el *service link* esté operativo: comprueba la tabla de rutas y el destino de ese tráfico.

Para comparar patrones WAN hacia AWS, la charla de AWS User Group Perú [“AWS en Directo: Optimizar caminos hacia AWS con Fortinet SD-WAN”](https://www.youtube.com/watch?v=RZDwe8ra9qI) trata el diseño de conectividad SD-WAN. La grabación de Nerdearla [“Networking for dummies: Conectando Azure y AWS”](https://www.nerdearla.com/nerdflix/y_1S-f_9vc4/) recorre VPN, gateways, IPsec y DNS privado; es una sesión de 2024 sobre redes híbridas generales. Ninguna reemplaza los requisitos específicos de Outposts.

## 3. BGP, VIF, gateway local y LNI

En un rack, las VIF son interfaces lógicas de los dispositivos de red de Outposts. La VIF del *service link* corresponde a la ruta de conectividad con la región; la VIF del gateway local corresponde a la ruta hacia la red local. En ambos caminos se establece BGP con el equipo local según la topología. **Estas VIF de Outposts no son lo mismo que una VIF de Direct Connect**: Direct Connect puede ser parte del transporte hacia la región, pero es otro recurso y cumple otra función.

Para que una carga del rack llegue a la LAN, deben coincidir varias piezas: la ruta de la subred de Outposts puede apuntar al LGW; la tabla de rutas del LGW se asocia con la VPC y con un grupo de VIF; y BGP anuncia a la red local los prefijos correspondientes. En el modo predeterminado de *Direct VPC routing*, el LGW usa las IP privadas de las instancias. La alternativa *customer-owned IP* (CoIP) usa un rango propio y NAT en el LGW; puede servir en topologías con CIDR superpuestos. Son modos excluyentes. La [guía de tablas de rutas del gateway local](https://docs.aws.amazon.com/outposts/latest/userguide/routing.html) describe sus diferencias; la decisión depende de los rangos y las reglas de direccionamiento que ya tenga tu organización.

En los servidores, la ENI conecta la instancia a la VPC y la LNI la conecta a la LAN física. La LNI opera en capa 2: **no aplica grupos de seguridad, ACL de red, tablas de rutas de VPC ni VPC Flow Logs**. Configura el sistema operativo y los controles de la red local para ese camino. Si el puerto del switch es trunk, la instancia debe etiquetar las VLAN; además, el puerto puede necesitar aceptar varias direcciones MAC, una por instancia. Lee las [consideraciones de LNI](https://docs.aws.amazon.com/outposts/latest/server-userguide/local-network-interface.html) antes de usarla.

Si necesitas repasar subredes, rutas, CIDR, peering y gateways de VPC, continúa con esta [guía de Amazon VPC](/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/). Sus conceptos sirven de base, pero las rutas de Outposts descritas aquí siguen las guías específicas del factor de forma.

Para practicar esos fundamentos con grabaciones de comunidades, puedes seguir [AWS VPC 100](https://www.youtube.com/watch?v=7yq_7Dw4Qs8), [AWS VPC 200](https://www.youtube.com/watch?v=pF7cr3z1WTk) y [AWS VPC Clase Práctica](https://www.youtube.com/watch?v=GIYD2k0dia4), del canal AWS Girls Perú; [Networking Sesion 2: VPC Peering/Subnetting](https://www.youtube.com/watch?v=yb7gdjhZsc8), de AWS Girls Argentina; y [VPC e Interconexiones de VPC](https://www.youtube.com/watch?v=Mcffd13mkPc), una grabación de un grupo de estudio de AWS User Group Guatemala orientado a Solutions Architect. Son recursos sobre VPC y conectividad, no configuraciones de Outposts.

Si el diseño conecta varias cuentas, la presentación de AWS User Group Perú [“AWS Transit Gateway en estrategias de multi cuentas”](https://www.youtube.com/watch?v=W4jdwSYDz4k) sirve para repasar ese patrón. Es una grabación de 2020: úsala para conceptos y contrasta los procedimientos con la documentación actual.

## 4. Planifica el service link con los límites documentados

AWS publica requisitos distintos para racks y servidores. Como referencia, ambas guías piden **MTU de 1500 bytes entre el Outpost y los endpoints del service link**. Por el encapsulamiento, el tráfico entre una instancia de Outposts y otra de la región tiene una MTU de 1300 bytes. Comprueba el camino completo y no confundas la MTU del transporte con la MTU de ese tráfico entre instancias.

Para el *service link*, la documentación actual especifica hasta **175 ms de latencia de ida y vuelta**. La guía de racks pide conectividad redundante de al menos **500 Mbps por rack de cómputo**; la guía de servidores pide al menos **500 Mbps de conectividad redundante** y limita a 500 Mbps la utilización máxima por servidor. El ancho de banda necesario puede ser mayor según la cantidad de equipos, las AMI que deban descargarse, la elasticidad de las aplicaciones y el tráfico hacia la región. Usa la cifra de la guía que corresponda a tu equipo y valida el dimensionamiento para tus cargas.

Para un rack, la hoja de preparación de red indica VLAN, direccionamiento punto a punto, ASN y prefijos BGP; también documenta las reglas de firewall y los destinos para el *service link*. En la conectividad pública, el Outpost inicia las conexiones y puede usarse NAT o PAT. Para un servidor, sigue su guía de registro: requiere DNS público y conectividad a los endpoints regionales; la documentación indica TCP 443, UDP 443 y UDP 53. No copies reglas de racks a servidores ni al revés: aplica los valores y puertos de la [lista de requisitos del rack](https://docs.aws.amazon.com/outposts/latest/userguide/outposts-requirements.html) o de la [conexión local del servidor](https://docs.aws.amazon.com/outposts/latest/server-userguide/local-server.html), según corresponda.

Antes de instalar, deja claros estos puntos con los equipos de red y aplicaciones:

1. **Qué forma de Outposts y generación se instalará**, y qué guía de cableado, uplinks y puertos corresponde.
2. **Qué tráfico debe llegar a la región y cuál debe quedarse en la LAN local**, incluidas dependencias de DNS, servicios regionales y salidas a Internet.
3. **Qué rangos y rutas se anunciarán** por cada sesión BGP en un rack, y si el direccionamiento del sitio requiere evaluar Direct VPC routing o CoIP.
4. **Qué falla puede tolerar cada camino**: caída de un puerto, dispositivo, proveedor WAN o service link. LACP agrega enlaces; por sí solo no crea redundancia de extremo a extremo.
5. **Cómo se verificará la ruta**: estado de BGP, acceso a los endpoints, MTU, latencia de ida y vuelta y ancho de banda disponible.

Para revisar direccionamiento IP, AWS Women Colombia publicó [“Networking en AWS con Claudia (Capítulo 2): direcciones IP”](https://www.youtube.com/watch?v=Ws2419VBjk4). Úsalo como material de base para CIDR y planificación de direcciones; la topología concreta de Outposts sigue dependiendo del factor de forma y de la red existente.

No existe un diseño universal de BGP, CIDR, VLAN o rutas. Parte del diagrama de red, de los prefijos que ya usa la empresa, de la política de seguridad y de las dependencias locales y regionales; luego valida los parámetros exactos con la guía de instalación correspondiente.

## 5. Qué ocurre si se interrumpe el service link

La pérdida del *service link* no equivale a apagar todo el Outpost, pero tampoco garantiza que todas las aplicaciones sigan funcionando. Mientras dura una interrupción, las operaciones quedan limitadas a la actividad local. AWS indica que las instancias EC2, los volúmenes EBS y el gateway local del rack continúan funcionando y se pueden alcanzar desde la red local. En servidores, las instancias, el almacenamiento local y el tráfico LNI también pueden continuar accesibles localmente. Las aplicaciones que dependen de recursos de la región sí pueden verse afectadas.

La disponibilidad de APIs se degrada: acciones como lanzar, iniciar, detener o terminar instancias pueden no funcionar durante el corte. Las métricas y los logs de instancias pueden almacenarse localmente hasta siete días y enviarse a la región cuando vuelve la conexión; una interrupción más larga puede causar pérdida de esos datos. Para servidores, AWS también advierte que el tráfico que usa la LNI no se ve afectado por el mantenimiento del *service link*. Consulta el detalle de [eventos de conectividad en racks](https://docs.aws.amazon.com/outposts/latest/userguide/outpost-maintenance.html) y [servidores](https://docs.aws.amazon.com/outposts/latest/server-userguide/outpost-maintenance.html), y prueba las dependencias locales y regionales antes de producción.

## 6. Diagnostica la ruta afectada, paso a paso

Primero acota el síntoma: ¿fallan las llamadas a servicios de la región, la comunicación con la LAN local, o ambas? Compara una instancia del Outpost con un destino local y otro regional. Esto ayuda a separar el *service link* de la ruta de aplicación por LGW o LNI.

### Si tienes un rack

1. Comprueba el estado del *service link* y de los enlaces físicos. Si BGP está caído, revisa cableado, estado del puerto y alcance del IP del peer. Si BGP está activo pero el enlace regional sigue caído, revisa las rutas de la VRF del *service link*, DNS, firewall, NAT/PAT y llegada a los endpoints de la región.
2. Si falla la ruta local, inspecciona por separado la VIF y la sesión BGP del *service link* y las del LGW. Después verifica la ruta de la subred de Outposts, la asociación VPC/VIF group en la tabla del LGW y los prefijos que se anuncian en BGP. Confirma si el diseño usa Direct VPC routing o CoIP y que el equipo local tenga rutas de retorno.
3. Usa las métricas de CloudWatch para correlacionar estado del enlace, VIF y BGP. La consola muestra `VifConnectionStatus` y `VifBgpSessionState` para VIF; `LagStatus` sirve para el estado del LAG. Si se pierde toda la conectividad del Outpost, la telemetría puede dejar de publicarse y aparecer un hueco en los gráficos.
4. Sigue la [lista oficial para diagnosticar un service link caído](https://docs.aws.amazon.com/outposts/latest/userguide/network-troubleshoot.html). Para observar sesiones de LGW, consulta [monitorización de conectividad del gateway local](https://docs.aws.amazon.com/outposts/latest/userguide/monitor-lgw-connectivity.html).

### Si tienes un servidor

1. Confirma primero el *service link*: dirección IP estable, resolución DNS pública, ruta hacia los endpoints regionales y las reglas de firewall requeridas. CloudWatch publica `ConnectedStatus` para indicar el estado de la conexión.
2. Si el fallo afecta solo a la LAN local, revisa la LNI en el sistema operativo, su configuración de IP/VLAN, la VLAN del puerto del switch y las políticas de port security para múltiples MAC. La LNI no pasa por las tablas de rutas de la VPC ni sus Flow Logs, así que verifica esa ruta desde el host y los equipos de red locales.
3. Usa la [guía oficial de diagnóstico de red para servidores](https://docs.aws.amazon.com/outposts/latest/server-userguide/network-troubleshoot.html) y la página de [métricas de CloudWatch para servidores](https://docs.aws.amazon.com/outposts/latest/server-userguide/outposts-cloudwatch-metrics.html).

CloudTrail ayuda a revisar cambios de configuración y llamadas a la API; no muestra paquetes ni reemplaza las pruebas de ruta. En racks, VPC Flow Logs pueden aportar evidencia del tráfico que atraviesa interfaces y subredes de VPC. La documentación de [monitorización de racks](https://docs.aws.amazon.com/outposts/latest/userguide/monitor-outposts.html) resume qué aporta cada herramienta.

## Preguntas frecuentes sobre redes en AWS Outposts

### ¿El service link conecta las instancias con mi red local?

No es la ruta local de propósito general. En un rack, esa función corresponde al gateway local. En un servidor, corresponde a la LNI. El *service link* comunica el Outpost con su región y también lleva tráfico entre el Outpost y las VPC asociadas.

### ¿BGP decide las rutas de las aplicaciones?

En los racks, BGP intercambia rutas entre cada dispositivo de red de Outposts y los equipos locales para las rutas del *service link* y del LGW. La ruta de una carga también depende de la tabla de rutas de su subred, la tabla del LGW y las rutas de retorno de la red local. En servidores, la LNI es una interfaz de capa 2 y no establece BGP de Outposts con la LAN.

### ¿Qué debería seguir funcionando durante un corte regional?

Las instancias y los caminos locales pueden seguir activos, pero las operaciones que dependen de la región o de APIs de administración pueden interrumpirse. Prueba cada dependencia de la aplicación; no tomes la continuidad local como garantía de disponibilidad de servicios regionales.

## Comunidades para seguir conversando

Para compartir un diagrama o plantear dudas sobre redes AWS, puedes explorar [AWS User Group Perú](https://awsugperu.cloud/), [AWS User Group Panamá](https://www.meetup.com/aws-user-group-panama/), [AWS User Group Medellín](https://www.meetup.com/awsugmed/) y los grupos de [Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) y [Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/). Son comunidades generales de AWS, no grupos dedicados exclusivamente a Outposts. Medellín publica además un canal de Slack en su página de Meetup. La [agenda de eventos de Dónde Aprendo AWS](https://dondeaprendoaws.com/eventos/) reúne actividades vigentes y enlaza a las páginas de inscripción de sus organizadores; revisa allí la fecha, modalidad y condiciones actuales.
