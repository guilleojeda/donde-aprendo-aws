---
title: "Costos de red en AWS: 10 estrategias para reducir la factura"
description: "Aprende a identificar cargos por transferencia, NAT Gateway y endpoints de VPC en AWS. Compara AZ, regiones, CloudFront y redes híbridas con ejemplos claros."
author: "guille-ojeda"
publishedAt: "2024-10-28"
publishedTimestamp: "2024-10-28T02:48:30.386Z"
modifiedTimestamp: "2026-10-04T21:26:34-03:00"
cover: "/assets/blog/732b4db41baecb1699e72d80.webp"
coverAlt: "Monitor con gráficos sobre un escritorio junto a una planta y una taza"
ogImage: "/assets/blog/732b4db41baecb1699e72d80.webp"
related:
  - title: "Cómo reducir costos en AWS: 10 estrategias para optimizar tu factura"
    url: "https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/"
    image: "/assets/blog/74f152c85b46e1ac5ea004f9.jpg"
    imageAlt: ""
---

Una factura de red alta puede venir de transferencias entre zonas o regiones, salida a Internet, NAT Gateway o servicios de conectividad. El primer paso es ubicar el flujo y la línea de uso que generan el cargo; después, comparar un cambio que reduzca datos o elimine un salto facturable sin comprometer disponibilidad, seguridad ni latencia.

No hay una tarifa única de “red”. AWS factura según el servicio, el origen, el destino, la dirección y la ruta. Algunas transferencias de entrada cuestan cero en casos concretos, pero eso no vuelve gratis todo el tráfico hacia AWS. Consulta los [precios de Amazon VPC](https://aws.amazon.com/vpc/pricing/) y los [precios de transferencia de EC2](https://aws.amazon.com/ec2/pricing/on-demand/) para la región y los servicios de tu arquitectura. Las cifras de este artículo son ejemplos para explicar el cálculo; no son una cotización.

Este artículo se concentra en diagnosticar los flujos y sus cargos. Para priorizar oportunidades financieras de toda la plataforma, consulta también [10 estrategias de optimización de costos en AWS](https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/).

## 1. Inventaría los flujos antes de tocar la arquitectura

Dibuja qué componente envía datos, a qué destino, en qué región y zona, por qué ruta y con qué volumen. Incluye direcciones, frecuencia, tamaños, horas de uso, latencia aceptable, requisitos de recuperación y si el tráfico debe permanecer privado. Anota por separado Internet, servicios de AWS, comunicación entre VPC y conexiones con redes locales.

En AWS Cost Explorer empieza por el costo y el uso agrupados por servicio, cuenta vinculada, región y tipo de uso. Para ver más detalle por línea, usa [AWS Data Exports](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create.html) o Cost and Usage Reports. Las etiquetas de asignación ayudan a separar equipos o aplicaciones cuando ya están aplicadas y activadas en Billing and Cost Management.

Usa [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-log-records.html) para investigar quién se comunica con quién y cuántos bytes registra el flujo. Los logs explican el tráfico; el informe de costos confirma los cargos. No son un medidor de factura por sí solos y su destino puede generar cargos de CloudWatch Logs o S3, así que define el alcance y la retención antes de habilitarlos en masa.

## 2. Separa salida a Internet, tráfico regional y tráfico entre regiones

Agrupa cada flujo por destino y dirección. La salida a Internet, las transferencias entre zonas, el tráfico entre regiones y las solicitudes a otros servicios de AWS pueden usar tarifas distintas. Un camino por NAT Gateway, Transit Gateway o un endpoint también puede sumar cargos del servicio que procesa el tráfico.

No supongas que mover una carga a otra región abarata la factura total porque allí un servicio tenga una tarifa menor. Compara cómputo, almacenamiento, transferencia, latencia para usuarios, disponibilidad de servicios, requisitos de residencia de datos y operación. La región con menor costo de salida puede resultar más cara si obliga a replicar datos o a moverlos hacia donde están los usuarios.

Para una estimación reproducible, configura la [calculadora de precios de AWS](https://calculator.aws/) con las regiones, cantidades, horas, rutas y servicios que realmente usarías. Evita comparar solo el precio por GB de un destino.

## 3. Reduce los bytes que tu aplicación necesita mover

Antes de cambiar la red, revisa si hace falta enviar cada byte. Según el caso, puedes comprimir respuestas, reutilizar resultados con caché, agrupar transferencias pequeñas, eliminar lecturas repetidas y reducir campos innecesarios en APIs y registros. En contenido estático, una política de caché adecuada puede evitar volver a pedir el mismo objeto al origen.

Mide el efecto sobre el volumen transferido, pero también sobre CPU, latencia, frescura de datos y almacenamiento. Una compresión que ahorra red puede aumentar cómputo; una caché con TTL inadecuado puede servir datos viejos. Conserva los controles de consistencia y privacidad de la aplicación.

## 4. Ajusta la ubicación en AZ y región sin sacrificar resiliencia

El tráfico entre Availability Zones puede facturarse en cada extremo para algunos servicios. Como ejemplo concreto, la página de EC2 muestra una tarifa de 0,01 USD/GB en cada dirección para datos que entran y salen entre instancias de distintas AZ de una misma región. Si una aplicación EC2 mueve 1.000 GB desde una zona a otra, esa categoría puede sumar 1.000 × 0,01 USD en el origen y 1.000 × 0,01 USD en el destino: 20 USD antes de otros cargos aplicables. Confirma la tarifa para tu servicio y región.

Si dos componentes generan muchas llamadas pequeñas, evalúa si mantenerlos en la misma AZ reduce tráfico facturable y latencia. Hazlo solo si el diseño sigue cumpliendo su objetivo de disponibilidad. Una arquitectura de producción distribuida en varias AZ puede pagar transferencias por la capacidad de soportar una falla zonal; quitar zonas para borrar ese cargo también elimina esa protección. Revisa además si balanceadores, replicación de datos o una ruta compartida cruzan AZ aunque las instancias estén cerca.

## 5. Calcula NAT Gateway por hora y por GB procesado

Un NAT Gateway genera al menos dos cargos separados: las horas que permanece disponible y cada GB que procesa. Además, pueden aplicar cargos estándar de transferencia por el destino y por cruzar AZ. La tarifa cambia por región y puede haber cargos adicionales de direcciones IPv4 públicas.

Como ejemplo, en US East (Ohio) la página de precios de VPC publica 0,045 USD por hora y 0,045 USD por GB procesado. Un NAT activo 730 horas y usado para procesar 500 GB representa:

- Horas: 730 × 0,045 USD = 32,85 USD.
- Procesamiento: 500 × 0,045 USD = 22,50 USD.
- Subtotal: 55,35 USD, antes de salida a Internet, tráfico entre AZ y otros cargos.

Si tienes un NAT Gateway por AZ, suma las horas de cada uno. Una ruta centralizada puede reducir gateways y cargos horarios, pero puede añadir transferencia entre AZ, concentrar el tráfico y crear otra dependencia zonal. Un gateway por AZ cuesta más horas, pero puede evitar esos saltos y mantener rutas locales. Si tu región lo ofrece, compara también Regional NAT Gateway: sus horas dependen de las AZ que cubre, además de los GB procesados y la transferencia estándar. Un NAT público requiere una Elastic IP; incluye también el [cargo horario de su dirección IPv4 pública](https://aws.amazon.com/vpc/pricing/). Compara las opciones con el mismo requisito de disponibilidad y volumen; no retires redundancia por una estimación aislada.

También puedes revisar si el flujo IPv6 necesita NAT. Un egress-only internet gateway no tiene cargo propio, pero el tráfico de EC2 que sale a Internet aún puede tener cargos de transferencia. Si una carga IPv6 necesita llegar a un destino que solo admite IPv4, DNS64/NAT64 puede volver a pasar por un NAT Gateway y sus cargos; revisa cómo funciona en la [guía de DNS64 y NAT64](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-nat64-dns64.html). IPv6 no vuelve gratis cualquier salida: comprueba protocolos, destinos, rutas y [precios vigentes](https://docs.aws.amazon.com/vpc/latest/userguide/egress-only-internet-gateway.html).

## 6. Elige entre un gateway endpoint, un interface endpoint y NAT por flujo

Para acceder a Amazon S3 o DynamoDB desde recursos de una VPC en la misma región, un gateway endpoint no tiene cargo adicional por hora ni por datos procesados. AWS gestiona una ruta en las tablas que asocies. Puede evitar que ese flujo pase por un NAT Gateway, pero no reemplaza el NAT que otras conexiones todavía necesiten. Revisa las [condiciones de los gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html): no sirven para dar acceso desde otra VPC, una red local o una región distinta.

Un interface endpoint de AWS PrivateLink permite acceso privado a muchos otros servicios y también puede servir para S3 o DynamoDB cuando el patrón de acceso lo exige. Tiene cargo por hora para cada zona donde está habilitado y cargo por GB procesado; consulta [AWS PrivateLink](https://aws.amazon.com/privatelink/pricing/) y la [página de precios de VPC](https://aws.amazon.com/vpc/pricing/) para las tarifas actuales.

No existe una regla como “hasta cuatro servicios usa endpoints y después usa NAT”. Compara el costo mensual completo:

- Interface endpoints: horas de cada endpoint en cada AZ y GB procesados.
- NAT Gateway: horas y GB procesados, más los cargos de transferencia que correspondan.
- Ambos: cargos de otros servicios que formen parte de la ruta, como Transit Gateway; comprueba por separado si aplica transferencia entre AZ y el valor operativo de la arquitectura.

Por ejemplo, si 500 GB que hoy van desde una instancia a S3 en la misma región cruzan un NAT en Ohio, un gateway endpoint puede evitar 500 × 0,045 USD = 22,50 USD de procesamiento NAT en ese ejemplo. El endpoint no elimina las horas del NAT si lo sigues usando para otros destinos. AWS no aplica cargos de transferencia EC2 a S3 por ese mismo tráfico de la misma región en el ejemplo de precios; confirma el tratamiento de la ruta y de los servicios que intervienen.

Si quieres seguir la configuración con una plantilla, [este repositorio de CloudFormation para EC2 privada y Systems Manager](https://github.com/pangoro24/aws-privatelink-private-instance-ssm) muestra un endpoint gateway para S3 y una alternativa interface. Es un ejemplo de arquitectura, no una comparación de precios: revisa cuántos endpoints y AZ despliega, el costo de EC2 y las tarifas actuales antes de adaptar el patrón.

## 7. Verifica rutas, DNS y alcance antes de esperar un ahorro

Crear un endpoint no garantiza que la aplicación lo use. Un gateway endpoint debe asociarse a las tablas de rutas que usan las subredes origen; la ruta del servicio se dirige a una lista de prefijos. Si una tabla no está asociada o el destino DNS/IP no coincide, el tráfico puede seguir por NAT o por otra salida.

Un interface endpoint crea interfaces de red en las subredes y AZ que elijas. Si necesitas alta disponibilidad zonal, ubícalo en las AZ requeridas por las cargas. Configura Security Groups, política del endpoint, resolución DNS privada, reglas de Route 53 Resolver y tablas de rutas según el diseño. Con DNS privado, los nombres regionales públicos del servicio pueden resolver a las IP privadas del endpoint; prueba la resolución desde cada subred y confirma el camino real.

Antes y después del cambio, confirma qué cuenta paga los endpoints centralizados, por qué red llega el tráfico desde otras VPC y si ese recorrido suma cargos de peering o Transit Gateway. Usa la [documentación de acceso a servicios con PrivateLink](https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html) y los [códigos de uso de VPC en los informes de facturación](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-billing-usage-reports.html) para reconocer horas y datos procesados.

Para ver otro caso de DNS y alcance privado, la guía de Diana Alfaro [crea una API Gateway REST privada con un interface endpoint y dominio personalizado](https://blog.alfalfita.cloud/como-crear-una-api-gateway-rest-privada-con-dominio-personalizado-en-aws) usando Terraform. Es un ejemplo de configuración, no una estimación de precios.

Para ver los componentes de una VPC en una práctica guiada, [AWS VPC Clase Práctica](https://www.youtube.com/watch?v=GIYD2k0dia4) recorre la configuración de una red. Úsala para seguir el recorrido; confirma las rutas y los precios con la documentación actual.

## 8. Evalúa CloudFront con el modelo de precio actual

CloudFront puede reducir solicitudes al origen y acercar contenido cacheable a los usuarios. El ahorro depende de qué se puede cachear, la proporción de aciertos de caché, la ubicación de los usuarios, el volumen de solicitudes y el costo del origen. Para contenido dinámico o poco reutilizado puede cambiar poco el volumen que llega a la aplicación.

AWS publica dos modelos: precios por uso y planes mensuales de tarifa fija. El primero factura según el tráfico y las solicitudes de las ubicaciones usadas, junto con las funciones adicionales que habilites. Los planes de tarifa fija agrupan CloudFront con servicios y límites de uso incluidos, como WAF, protección DDoS, DNS, logs y cómputo de edge, y no aplican cargos por excedente. Las asignaciones mensuales no son un límite duro: si el consumo supera ampliamente y de manera sostenida lo previsto para el plan, AWS puede ajustar cómo sirve el tráfico. Compara el costo total, el alcance y las políticas de cada plan en la [página actual de precios de CloudFront](https://aws.amazon.com/cloudfront/pricing/) y la [guía de los planes de tarifa fija](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html). No uses como referencia tablas antiguas de GB gratis o porcentajes fijos de ahorro.

Si el modelo te sirve, define TTL según la frescura del contenido, revisa la caché por tamaño de objeto y ubicación, y protege el origen para que el tráfico no pueda evitar CloudFront.

## 9. Usa VPN, Direct Connect o Transit Gateway cuando su función lo justifique

Para pocas VPC con rutas sencillas, una conexión directa o peering puede costar menos y ser suficiente. Transit Gateway facilita conectar muchas VPC, cuentas y redes híbridas con un punto de control común, pero cobra por attachments y por datos procesados; pueden sumarse transferencias estándar. El beneficio operativo puede justificarlo aunque el cargo unitario sea mayor. Revisa los [precios de Transit Gateway](https://aws.amazon.com/transit-gateway/pricing/) con el volumen que recorrería cada attachment.

AWS Site-to-Site VPN puede cubrir una conexión cifrada con una red local y tiene cargos por conexión activa y transferencia de datos. Si la VPN usa Transit Gateway, incluye también los cargos de ese servicio. Direct Connect puede ser útil cuando una organización necesita conectividad dedicada y predecible, pero compara horas y capacidad del puerto, transferencia saliente desde AWS, cargos del proveedor y redundancia. AWS ofrece precios fijos para conexiones dedicadas elegibles de 10 o 100 Gbps: eliminan el cargo por GB transferido desde AWS solo para las regiones incluidas en el nivel elegido y cobran una tarifa horaria fija. La disponibilidad y el precio dependen del trayecto, la capacidad y el nivel. No supongas que VPN o Direct Connect son más baratos por GB sin cotizar ambas arquitecturas. Consulta los [precios de VPN](https://aws.amazon.com/vpn/pricing/), los [precios por uso de Direct Connect](https://aws.amazon.com/directconnect/pricing/) y las [opciones actuales de tarifa fija](https://aws.amazon.com/directconnect/pricing/flat-rate/).

Para recorrer conceptos de interconexión, mira [VPC e interconexiones de VPC](https://www.youtube.com/watch?v=Mcffd13mkPc), una grabación del AWS User Group Guatemala. [La Amenaza del Nivel 100: construir una arquitectura de networking](https://www.youtube.com/watch?v=fIU0VUOdWaI), de AWS Women Colombia, suma la perspectiva de especialistas sobre diseño de redes y VPC Peering. Para conectar decisiones de conectividad con impacto financiero, [The Cloud Forge: conectividad y FinOps](https://www.youtube.com/watch?v=k3uIrKU50ak) presenta una conversación del AWS User Group Medellín.

## 10. Mide el cambio con datos comparables y una salida segura

Guarda una línea de base antes de editar rutas: período, tipo de uso, GB, costo, usuarios afectados y métricas de servicio. Cambia una sola variable por vez —por ejemplo, enrutar S3 por un gateway endpoint— y empieza con una parte reversible del entorno. Define de antemano límites de latencia, errores, disponibilidad y seguridad que obliguen a deshacer el cambio.

Compara un período con volumen y mezcla de tráfico semejantes. Revisa el costo completo de la arquitectura antes y después, no solo la línea de NAT: suma endpoints, cargos entre AZ, procesamiento de TGW, salida y servicios de observabilidad. Cuando cambie el volumen, usa también costos por GB, solicitud o usuario, y documenta descuentos y créditos por separado. Los datos de Cost Explorer se actualizan al menos una vez cada 24 horas y pueden demorarse más durante el ciclo actual, así que no tomes la consola como una lectura en tiempo real.

Para el detalle financiero usa [AWS Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html) o [Data Exports](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create.html); para identificar flujos usa VPC Flow Logs; y para vigilar desvíos configura [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html). Ten en cuenta que los logs tienen [cargos propios de CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/LogsBillingDetails.html) y de [Amazon S3](https://aws.amazon.com/s3/pricing/).

Para pensar la revisión como un proceso compartido entre tecnología y finanzas, escucha [FinOps, o cómo ahorrar en la nube](https://podcast.marcia.dev/932377/episodes/16129768-5-18-finops-o-como-ahorrar-en-la-nube), un episodio de Charlas Técnicas de AWS con Marcia Villalba y sus invitados sobre visibilidad, colaboración y equilibrio entre costo y resiliencia.

## Preguntas frecuentes

### ¿Los VPC endpoints son siempre más baratos que NAT Gateway?

No. Los gateway endpoints para S3 y DynamoDB no tienen cargo adicional, pero los interface endpoints cobran horas y datos procesados. NAT Gateway tiene horas, GB procesados y posibles cargos de transferencia. El destino, volumen, región, número de AZ y alcance de red determinan cuál conviene.

### ¿Pasar a IPv6 elimina el costo de NAT?

No de forma automática. Para destinos IPv6, un egress-only internet gateway no tiene cargo propio, pero pueden seguir aplicando cargos de transferencia. Si la carga IPv6 necesita comunicarse con un destino solo IPv4, puede usar DNS64/NAT64 y un NAT Gateway. Diseña la ruta según los destinos y los requisitos de seguridad.

### ¿CloudFront siempre reduce la factura?

No. Puede ser conveniente para contenido con buena reutilización y mucho volumen hacia usuarios distribuidos. Compara los dos modelos de precio actuales y suma solicitudes, origen, caché, funciones y seguridad; una tasa de caché baja puede limitar el ahorro.

### ¿Qué datos llevo a una revisión técnica?

Lleva un diagrama sencillo de la ruta, el costo agrupado por tipo de uso y región, GB por origen/destino y AZ, métricas de latencia y disponibilidad, y el requisito que no puedes sacrificar. No compartas credenciales ni datos de clientes.

## Comunidades y encuentros para seguir la conversación

Para debatir una ruta o aprender en comunidad, puedes empezar por el [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) si necesitas un espacio especializado en conectividad; el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) recibe a personas interesadas en la nube aunque estén empezando; y el [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) organiza encuentros para compartir y aprender sobre AWS. Si buscas una comunidad de mujeres en AWS con contenido y actividades, consulta [AWS Women Colombia](https://awswomencolombia.com/).

También puedes buscar otros grupos por país en el [directorio de comunidades AWS](/comunidades/?format=User+Group) y encontrar una charla, taller o encuentro actual en la [agenda de eventos AWS](/eventos/) o su [agenda en línea](/eventos/online/). Para pedir una segunda opinión útil, comparte el diagrama, los datos de uso agregados y el objetivo del cambio; así otras personas pueden cuestionar la estimación sin necesitar acceso a tu cuenta.

---
