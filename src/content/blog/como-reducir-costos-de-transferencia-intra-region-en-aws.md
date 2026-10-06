---
title: "Cómo reducir costos de transferencia intra-región en AWS"
description: "Identifica cargos de transferencia entre zonas de disponibilidad y compara cambios de red, NAT Gateway y VPC endpoints sin perder de vista resiliencia y costos de servicio."
author: "guille-ojeda"
publishedAt: "2025-09-11"
publishedTimestamp: "2025-09-11T07:03:09.648000+00:00"
modifiedTimestamp: "2026-10-06T10:14:29-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related: []
---

Para reducir los **costos de transferencia intra-región en AWS**, primero descubre qué servicio registra el cargo y qué flujo entre zonas o recursos lo provoca. “Intra-región” no significa una tarifa única: el precio depende del servicio, los extremos, la dirección y la ruta. Una dirección IP privada o un VPC endpoint puede cambiar el recorrido, pero por sí solo no elimina todo cargo de transferencia ni el procesamiento de NAT o PrivateLink.

## 1. Separa el cargo de la ruta que mueve los bytes

Un costo que aparece en la factura bajo un servicio puede corresponder a transferencia o a procesamiento de red. También pueden sumarse cargos por hora de recursos que mantienen la ruta disponible. Antes de cambiar subredes o apagar recursos, dibuja el flujo y registra:

- Servicio y recurso de origen y destino, cuenta, región y zona de disponibilidad.
- Volumen y dirección del tráfico, frecuencia y horas en que ocurre.
- Cada salto intermedio: balanceador, NAT Gateway, VPC endpoint, Transit Gateway u otra conexión.
- Los requisitos que deben seguir cumpliéndose: redundancia, latencia, seguridad y recuperación ante fallas.

La grabación [VPC e interconexiones de VPC](https://www.youtube.com/watch?v=Mcffd13mkPc), del AWS User Group Guatemala, repasa conceptos útiles para dibujar esos recorridos y reconocer las conexiones entre redes.

Esa vista evita una optimización engañosa: eliminar un cargo entre AZ puede añadir horas de NAT, datos procesados por un endpoint o una dependencia zonal que antes no existía.

## 2. Localiza cargos y flujos con herramientas distintas

**Para investigar el costo**, abre Cost Explorer y acota el período, la región, la cuenta y el servicio. Prueba los grupos por tipo de uso y zona de disponibilidad; AWS señala que los costos de transferencia se incluyen en el servicio asociado, no siempre en una fila genérica de “Data Transfer”. Los datos de costos no son telemetría en tiempo real. Esta guía interna explica el análisis paso a paso: [cómo usar AWS Cost Explorer para tráfico de red](/blog/como-usar-aws-cost-explorer-para-trafico-de-red/).

Si necesitas más detalle financiero, crea una exportación **Cost and Usage Report 2.0 (CUR 2.0)** en [AWS Data Exports](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create.html). Sus líneas de uso ayudan a comparar producto, tipo de uso, operación, cuenta y otros campos disponibles; el nivel de recurso depende de la línea y de los datos que la incluyen. La documentación de AWS indica que CUR 2.0 es la opción recomendada para recibir datos detallados de costo y uso.

La sesión [The Cloud Forge: conectividad y FinOps, el arte de crear valor en la nube](https://www.youtube.com/watch?v=k3uIrKU50ak), del AWS User Group Medellín, relaciona decisiones de conectividad con su análisis de costos.

**Para investigar quién se comunica con quién**, habilita VPC Flow Logs con los campos apropiados —por ejemplo, direcciones, interfaz, zona, bytes y acción— en las VPC, subredes o interfaces de interés. Los logs describen flujos IP agregados durante intervalos; no indican cuánto cobró AWS por ese flujo. Son de mejor esfuerzo, no capturan todo el tráfico y pueden tener cargos de entrega o consulta en CloudWatch Logs, S3 y Athena. Consulta [campos y formato de VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-log-records.html) y sus [limitaciones](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs-limitations.html).

Relaciona los logs con el costo por tipo de uso y período, pero no intentes convertir cada registro de bytes en una línea exacta de factura. Las unidades, los extremos facturables y los servicios intermedios pueden diferir.

## 3. Comprueba el alcance de una tarifa entre AZ

Para dos instancias EC2 en distintas AZ de una misma región, la página de precios de EC2 en US East (Ohio) publica USD 0,01/GB de entrada y salida para ciertas transferencias. Si la instancia A envía 100 GB a la instancia B durante el mes, el ejemplo suma 100 × USD 0,01 de salida y 100 × USD 0,01 de entrada: USD 2 en total, antes de cualquier otro cargo aplicable. Limita esta cifra a esa combinación y región: otros servicios y rutas pueden tener condiciones distintas. Confirma el precio vigente y los tipos de uso de tu cuenta en la [página de precios de EC2](https://aws.amazon.com/ec2/pricing/on-demand/) y en la factura.

Mantener una comunicación dentro de la misma AZ puede evitar ciertos cargos para algunos pares de recursos, pero no es una recomendación para concentrar toda la producción en una sola zona. Multi-AZ puede ser parte del requisito de disponibilidad. Antes de cambiarlo, compara el costo de tráfico con la reducción de resiliencia y el comportamiento esperado durante una falla zonal.

## 4. Compara NAT Gateway y VPC endpoints por ruta

Un NAT Gateway cobra por hora y por GB procesado; también pueden aplicar cargos estándar de transferencia según la ruta. Distingue sus dos modos antes de comparar:

- **Zonal:** cada gateway pertenece a una AZ. Si recursos de varias AZ comparten un gateway zonal, el tráfico hacia otra zona puede sumar cargos entre AZ y una falla en la zona del gateway puede quitarles salida. Un gateway zonal por AZ con rutas hacia el gateway local puede mantener afinidad zonal, pero agrega horas de gateway.
- **Regional:** un único recurso se expande entre AZ según la presencia de cargas y busca mantener afinidad zonal. Se cobra por hora en cada AZ cubierta, por GB procesado y por la transferencia estándar aplicable. La expansión a una AZ nueva puede tardar hasta 60 minutos; mientras tanto, parte del tráfico puede procesarse desde una AZ existente. Comprueba cobertura, modo y ruta en la [guía de Regional NAT Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html) y calcula su costo por las tarifas de [Amazon VPC](https://aws.amazon.com/vpc/pricing/).

Para gateways zonales, concentrar el tráfico puede ahorrar horas de NAT y añadir cruces entre zonas; desplegar uno por zona puede reducir esos cruces y sumar horas. Regional NAT Gateway es otra alternativa con afinidad zonal y cobro por AZ cubierta. Compara el gasto completo, las rutas y el comportamiento ante una falla para el volumen real. Para observar el tráfico de un NAT regional por zona, CloudWatch combina las dimensiones `NatGatewayId` y `AvailabilityZone`.

Para llegar a **S3 o DynamoDB desde una VPC**, un gateway endpoint no tiene cargos adicionales por hora ni por procesamiento de datos. Si el tráfico hoy pasa por NAT, puede evitar el cargo por GB procesado por NAT para ese flujo. El gateway endpoint no borra horas de NAT que necesites para otros destinos ni convierte todas las transferencias del servicio en gratuitas. Revisa [cómo funcionan los gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html) y las [tarifas de Amazon VPC](https://aws.amazon.com/vpc/pricing/).

Un **interface endpoint de AWS PrivateLink** puede dar acceso privado a muchos otros servicios, pero cobra por hora en cada zona donde se aprovisiona y por GB procesado. Para elegir, suma esas unidades y posibles cruces entre AZ; compáralas con NAT, las tarifas estándar que correspondan y el alcance que necesitas. La guía de [acceso a servicios de AWS mediante PrivateLink](https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html) describe el endpoint y sus cargos.

Una IP privada tampoco anula la transferencia entre zonas. Puede evitar una ruta por una dirección IPv4 pública u otro camino externo; el precio de la transferencia dentro de la región sigue dependiendo de los extremos y del servicio. Por eso, revisa la ruta real y las líneas de uso en vez de clasificar una conexión solo por ser “privada”.

Para repasar los conceptos de direccionamiento y rutas, consulta la grabación [Networking en AWS con Claudia: direcciones IP](https://www.youtube.com/watch?v=Ws2419VBjk4), de AWS Women Colombia User Group.

## 5. Reduce el volumen solo donde exista un cargo por volumen

Agrupa lecturas pequeñas cuando la aplicación lo permita, elimina campos y consultas repetidas, aplica caché donde la frescura de los datos lo admita y comprime formatos que se reduzcan bien. Estos cambios pueden bajar GB en flujos facturados por volumen, pero no quitan cargos por hora de NAT o endpoints, ni cargos por solicitud. Mide también CPU, latencia y consistencia antes de conservar la optimización.

CloudFront puede servir contenido reutilizable desde caché y reducir accesos repetidos al origen para usuarios distribuidos. No es una herramienta automática para evitar transferencias entre AZ: compara solicitudes, aciertos de caché, origen, región de los usuarios y precios antes de introducirlo. Para más opciones de redes y sus costos, consulta [costos de red en AWS: 10 estrategias para reducir la factura](/blog/10-estrategias-para-optimizar-costos-de-red-en-aws/).

## 6. Verifica el cambio sin degradar disponibilidad

Antes de mover recursos o cambiar rutas, guarda una referencia del costo por tipo de uso, GB, latencia, errores y disponibilidad para el mismo período. Estima el costo completo de la alternativa con [AWS Pricing Calculator](https://calculator.aws/): incluye horas y GB de NAT, endpoint por zona, transferencias entre zonas, balanceadores y los otros servicios del camino.

Implementa primero en una parte limitada y reversible. Confirma que cada subnet usa la tabla de rutas esperada, que la resolución DNS dirige al endpoint previsto y que Security Groups y políticas permiten solo el tráfico necesario. Luego compara períodos con volúmenes parecidos y espera a que se actualicen los datos de facturación. Revisa también latencia, errores y failover; un menor cargo no compensa una ruta que rompe una zona de disponibilidad o expone un servicio.

## Recursos en español y comunidad

- El [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) reúne a personas interesadas en conectividad híbrida, enrutamiento y diseño de redes en AWS.
- Si buscas una sesión introductoria en línea, [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) está anunciada para el 21 de octubre de 2026, de 18:00 a 20:00 (hora de Colombia). Confirma horario, acceso y disponibilidad en la página de registro.

La secuencia más fiable es localizar el tipo de uso que subió, identificar los bytes y saltos que podrían explicarlo, cotizar una alternativa con sus cargos completos y probarla sin sacrificar los requisitos de la aplicación.
