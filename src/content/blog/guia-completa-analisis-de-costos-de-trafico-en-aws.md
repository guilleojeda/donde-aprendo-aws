---
title: "Cómo analizar los costos de transferencia de datos en AWS"
description: "Identifica cargos de transferencia en Cost Explorer y CUR 2.0, reconstruye la ruta y compara NAT y endpoints sin perder disponibilidad."
author: "guille-ojeda"
publishedAt: "2024-12-30"
publishedTimestamp: "2024-12-30T12:06:07.312Z"
modifiedTimestamp: "2026-10-06T16:00:55-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Cómo usar AWS Cost Explorer: filtros y costos que no aparecen"
    url: "https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/"
  - title: "Cómo reducir costos de transferencia intra-región en AWS"
    url: "https://dondeaprendoaws.com/blog/como-reducir-costos-de-transferencia-intra-region-en-aws/"
---

Para analizar los **costos de transferencia de datos en AWS**, identifica primero qué línea de uso aumentó y después reconstruye la ruta que recorrieron esos datos. No hay una tarifa única por “tráfico”: el cargo depende del servicio, las regiones de origen y destino, la dirección, el volumen y los componentes intermedios. Un NAT Gateway, un endpoint de interfaz o un Transit Gateway también pueden cobrar por procesar datos o por hora, además de los cargos de transferencia que correspondan.

Empieza en **AWS Cost Explorer**, profundiza en las líneas de uso de **AWS Data Exports / Cost and Usage Report 2.0 (CUR 2.0)** cuando haga falta y usa telemetría de red para entender los flujos. Compara el costo total de cada alternativa junto con latencia, seguridad y disponibilidad; reducir una línea de la factura no justifica perder redundancia.

## 1. Dibuja el recorrido de los datos

Antes de cambiar una arquitectura, anota los elementos necesarios para entender cada flujo:

- Servicio, cuenta, región y zona de disponibilidad de origen y destino.
- Dirección del tráfico y volumen transferido durante el período analizado.
- Saltos de red: balanceadores, NAT Gateway, VPC endpoints, Transit Gateway, Internet Gateway, CloudFront o Direct Connect.
- Requisitos que el sistema debe conservar, como disponibilidad multi-AZ, latencia, seguridad, recuperación y residencia de datos.

Esta lista ayuda a distinguir, por ejemplo, una transferencia entre dos recursos de una región de los cargos por procesar esos bytes en un NAT Gateway. Para repasar conexiones entre redes, consulta la grabación [VPC e interconexiones de VPC](https://www.youtube.com/watch?v=Mcffd13mkPc), del AWS User Group Guatemala. Es material de la comunidad para estudiar topologías; consulta la documentación y los precios actuales antes de tomar una decisión.

## 2. Encuentra qué línea de uso cambió

### Empieza con Cost Explorer

En Cost Explorer, elige un período cerrado y agrupa los costos por **Service**. Si un servicio aumentó, filtra por ese servicio y prueba **Usage type**; después agrupa por **Region** o **Linked account** para acotar la investigación. Compara períodos con una duración y un patrón de uso semejantes. Una vista del mes en curso todavía puede cambiar.

Cost Explorer organiza costos y uso para investigar tendencias, pero no muestra cada paquete de red ni identifica por sí solo el flujo de una aplicación. AWS actualiza sus datos al menos una vez cada 24 horas y algunos cargos pueden tardar más en llegar desde los sistemas de facturación. La interfaz de Cost Explorer no tiene costo; cada solicitud paginada a su API cuesta USD 0,01, según la [guía oficial de Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html). La guía interna [AWS Cost Explorer: filtros y costos que no aparecen](/blog/analisis-de-costos-de-aws-con-cost-explorer/) amplía cómo interpretar filtros, permisos y diferencias con la factura.

### Profundiza con CUR 2.0

Cuando necesites revisar líneas de uso, descarga o exporta los datos de facturación. AWS recomienda [CUR 2.0 en Data Exports](https://docs.aws.amazon.com/cur/latest/userguide/) para obtener detalles de costos y uso. En ese esquema, `line_item_usage_type` ayuda a distinguir categorías de transferencia y `line_item_product_code` identifica el producto asociado. Por ejemplo, AWS documenta `USE2-DataTransfer-Regional-Bytes` para tráfico entre zonas de disponibilidad en US East (Ohio), y tipos de uso distintos para transferencia entre regiones y salida a Internet. El prefijo y el nombre dependen del caso; no los trates como una tarifa universal.

Para algunas líneas puedes habilitar detalle por recurso, pero los identificadores de recurso no están disponibles para todos los cargos. AWS indica que `line_item_resource_id` puede quedar vacío en líneas de transferencia de datos, como explica el [diccionario de columnas de CUR 2.0](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2-line-item.html). Por eso, CUR ayuda a confirmar qué uso se facturó, pero no siempre puede atribuir cada GB a una interfaz o conversación de la aplicación.

## 3. Separa transferencia, procesamiento y cargos por hora

La factura puede combinar varios componentes de la misma ruta. Revisa la página de precios de cada servicio y el detalle de uso de tu cuenta antes de extrapolar un ejemplo:

| Recorrido o componente | Cargos que conviene comprobar |
| --- | --- |
| Salida a Internet o entre regiones | El servicio que mide los datos, la región de origen, el destino, la dirección y los tramos de volumen. Las condiciones de entrada y salida pueden diferir. |
| Tráfico entre zonas de disponibilidad | Las reglas del servicio y los recursos que se comunican. Algunos pares en la misma AZ pueden no tener cargo de transferencia; no todas las rutas dentro de una región cuestan lo mismo. |
| NAT Gateway | Horas aprovisionadas, GB procesados por el NAT Gateway y cargos estándar de transferencia que apliquen a la ruta. |
| Gateway endpoint para S3 o DynamoDB | No tiene cargos adicionales por hora ni por procesamiento del endpoint. Comprueba que sea el tipo de endpoint y la ruta adecuados para el destino. |
| Interface endpoint de AWS PrivateLink | Horas por zona de disponibilidad y GB procesados; para acceso entre regiones también puede aplicar transferencia interregional. No es automáticamente más barato que NAT Gateway. |
| Transit Gateway | Horas de attachments, datos procesados y posibles cargos estándar de transferencia. |
| CloudFront | Transferencia desde ubicaciones de borde, solicitudes y funciones habilitadas. El resultado depende de la ubicación de los usuarios, el contenido cacheable y el tráfico que todavía llega al origen. |
| [Direct Connect](https://aws.amazon.com/directconnect/pricing/) | Horas y capacidad de los puertos, transferencia saliente según región de origen y ubicación de Direct Connect, y cargos del proveedor o de otros servicios de red que formen parte del recorrido. |

Un ejemplo muestra por qué conviene separar las partidas: si una instancia EC2 accede a S3 en la misma región pasando por NAT Gateway, puede no haber cargo estándar de transferencia entre EC2 y S3 bajo las condiciones del ejemplo de AWS, pero el NAT Gateway sigue cobrando por los GB que procesa y por sus horas aprovisionadas. Si el tráfico sale a Internet o cruza de zona, pueden sumarse otros cargos. Enrutar S3 mediante un gateway endpoint puede evitar el procesamiento de NAT para ese flujo, pero no elimina el cargo por hora del NAT Gateway si la arquitectura aún lo necesita para otros destinos.

El detalle oficial de cargos de [Amazon VPC](https://aws.amazon.com/vpc/pricing/) explica por separado las horas y el procesamiento de NAT Gateway. AWS documenta que los [gateway endpoints para S3 y DynamoDB](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html) no tienen cargo adicional. Atienden rutas desde su VPC hacia esos servicios en la misma región; no permiten acceso directo desde redes locales ni desde otra VPC. Las páginas de precios de [AWS PrivateLink](https://aws.amazon.com/privatelink/pricing/) y [Transit Gateway](https://aws.amazon.com/transit-gateway/pricing/) describen los cargos de endpoint y de red centralizada. Para comparar los tipos de uso de transferencia, consulta también la guía de [AWS Data Exports sobre cargos de transferencia](https://docs.aws.amazon.com/cur/latest/userguide/cur-data-transfers-charges.html).

## 4. Usa los logs para entender los flujos, no como una factura

**VPC Flow Logs** registra información sobre el tráfico IP que entra y sale de interfaces de red, subredes o VPC. Según el formato elegido, puedes comparar direcciones, interfaces, acción y bytes para entender qué sistemas se comunican y en qué dirección. Cruza ese análisis con las líneas de uso de Cost Explorer o CUR en el mismo período.

Un registro de flujo no es una unidad facturable y sus bytes no se convierten directamente en el monto de una línea de factura. Los logs describen tráfico agregado, pueden no contener todos los flujos y su publicación y almacenamiento pueden generar cargos de CloudWatch Logs, S3 o Data Firehose. Revisa las páginas de AWS sobre [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html) y sus [limitaciones](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs-limitations.html) antes de usarlos como fuente de diagnóstico.

## 5. Compara el costo total sin degradar el servicio

Para una alternativa, calcula el recorrido completo con [AWS Pricing Calculator](https://calculator.aws/): volumen por dirección, regiones, horas de NAT o endpoints, cargos de procesamiento y los demás componentes de red. La calculadora produce una estimación; confirma las condiciones en las páginas actuales de [precios de EC2](https://aws.amazon.com/ec2/pricing/on-demand/), VPC y los otros servicios implicados. El video [AWS Pricing Calculator paso a paso](https://www.youtube.com/watch?v=e_oVCKBMnkA), publicado por AWS Women Colombia User Group, sirve como apoyo para practicar la estimación.

Evalúa cada cambio con sus efectos operativos:

- **NAT Gateway por zona:** compartir un NAT Gateway zonal puede añadir tráfico entre AZ. Poner un NAT Gateway en cada AZ suma cargos por hora, pero puede reducir esos cruces y evitar que la salida de otras zonas dependa de la AZ del gateway. AWS también ofrece [Regional NAT Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html), cuyo costo horario depende de las AZ que cubre además de los GB procesados. Compara ambos modos según tráfico y requisito de continuidad; la guía de [NAT Gateway de AWS](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html) explica el efecto de disponibilidad. No concentres una carga multi-AZ en una sola zona solo para reducir la transferencia. Para un recorrido intra-región más detallado, sigue con [Cómo reducir costos de transferencia intra-región en AWS](/blog/como-reducir-costos-de-transferencia-intra-region-en-aws/).
- **Endpoints:** compara el costo de procesamiento de NAT con las horas y GB del endpoint de interfaz que reemplazaría parte de la ruta. Para S3 o DynamoDB desde una VPC, un gateway endpoint no tiene cargo adicional; esto no elimina el uso de NAT para otros destinos ni las tarifas propias del servicio.
- **CloudFront:** una caché puede reducir solicitudes repetidas al origen y mejorar la entrega a usuarios distribuidos, pero no garantiza una factura menor. Incluye transferencia al usuario, solicitudes, tasa de aciertos, características habilitadas y consumo que siga llegando al origen; consulta los [precios actuales de CloudFront](https://aws.amazon.com/cloudfront/pricing/).
- **Regiones:** acercar datos y cómputo puede reducir algunos flujos interregionales, pero también puede cambiar latencia, recuperación ante desastres, requisitos de residencia y disponibilidad. Compara esos requisitos antes de mover datos o centralizar cargas.
- **Direct Connect:** no es una reducción automática del costo por GB. Su modelo depende de puertos, volumen de salida, región de origen y ubicación de conexión; incluye también el proveedor y los servicios adicionales de la arquitectura.

Si pruebas una modificación, conserva una línea de base del volumen, costo, latencia, errores y disponibilidad. Cambia una variable a la vez y compara períodos equivalentes cuando los datos de facturación estén disponibles. Una reducción de cargos que empeora el objetivo de disponibilidad no es una optimización válida.

## 6. Usa Budgets para avisos, no como tope de gasto

AWS Budgets permite seguir costos reales o previstos y enviar notificaciones cuando se supera o se prevé superar un umbral. Sus datos se actualizan hasta tres veces al día, habitualmente con intervalos de 8 a 12 horas; además, puede haber una demora entre el uso y la notificación. Trata el presupuesto como una señal para investigar, no como un límite que impide incurrir en más cargos. Budgets también ofrece acciones opcionales, como aplicar una política de IAM, pero requieren configuración explícita y no se activan solo por crear un presupuesto. Consulta la guía vigente de [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html).

## Recursos, comunidades y eventos

Para conectar el diseño de red con su análisis financiero, la grabación [The Cloud Forge: conectividad y FinOps, el arte de crear valor en la nube](https://www.youtube.com/watch?v=k3uIrKU50ak) comparte una charla del AWS User Group Medellín. Si tu problema se concentra en conectividad híbrida o diseño de redes, puedes plantearlo en el [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/). En Argentina, el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) invita a personas interesadas en compartir experiencias y aprender sobre AWS.

Consulta el [directorio de comunidades AWS](/comunidades/) para encontrar otros grupos y la [agenda de eventos](/eventos/) para revisar fechas, modalidad y condiciones vigentes antes de inscribirte. Si compartes una consulta en una comunidad, acompáñala con un diagrama sin datos sensibles, el tipo de uso que cambió y los requisitos que tu arquitectura debe conservar.
