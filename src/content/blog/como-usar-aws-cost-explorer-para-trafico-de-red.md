---
title: "Cómo analizar los costos de tráfico de red en AWS Cost Explorer"
description: "Filtra cargos de red por tipo de uso, servicio y región en Cost Explorer. Aprende cuándo pasar a Data Exports o VPC Flow Logs para encontrar el origen."
author: "guille-ojeda"
publishedAt: "2025-01-02"
publishedTimestamp: "2025-01-02T00:17:31.789Z"
modifiedTimestamp: "2026-10-06T10:14:29-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related: []
---

AWS Cost Explorer sirve para responder **cuánto se facturó y bajo qué tipo de uso**, por ejemplo, transferencia entre zonas de disponibilidad o salida a Internet. No muestra cada conexión, dirección IP, aplicación de origen ni destino. Es una herramienta de análisis de costos, no telemetría de red.

Para investigar un aumento, empieza por el tipo de uso, usa el servicio y la región para ubicar cómo se registró el cargo, y luego confirma qué tráfico lo produjo con los datos de facturación detallados o los registros de red adecuados.

## Antes de abrir el informe

La primera vez, habilita Cost Explorer desde **Billing and Cost Management → Cost Explorer**. AWS prepara los datos del mes actual y hasta los 13 meses anteriores; el mes actual suele aparecer en unas 24 horas y el historial puede tardar algunos días más. Después, los datos se actualizan al menos cada 24 horas, aunque la facturación de origen puede llegar con demora. Por eso, un pico de hoy todavía puede no aparecer. [AWS explica la habilitación y la disponibilidad de los datos](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-enable.html).

Para entrar a la consola, tu usuario o rol necesita acceso de Billing y los permisos de Cost Explorer correspondientes. En una organización, el administrador puede limitar el acceso de las cuentas miembro; estas normalmente solo ven sus propios costos. Para consultar la API del ejemplo más abajo se necesita, como mínimo, permiso para `ce:GetCostAndUsage`. [Consulta las reglas de acceso de Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-access.html) y [los permisos de Billing and Cost Management](https://docs.aws.amazon.com/cost-management/latest/userguide/control-access-billing.html).

Si es tu primera vez con Cost Explorer, mira la [sesión de AWS User Group Medellín sobre monitoreo y gestión de recursos](https://www.youtube.com/watch?v=2cGwdSTdUqQ). Repasa Amazon CloudWatch, CloudTrail, AWS Budgets y Cost Explorer; el [canal de AWS User Group Medellín](https://www.youtube.com/@awsugmed) publica más contenido en español.

## Encuentra cargos de transferencia en Cost Explorer

1. En Cost Explorer, abre **Cost and Usage** (en algunas cuentas aparece dentro de **Explore**). Elige un período cerrado para comparar datos completos; selecciona granularidad diaria para investigar cuándo creció el costo o mensual para revisar una tendencia.
2. En **Group by**, elige **Usage type** para ver los medidores que aparecen en tu factura. Busca los que describen transferencia, como salida a Internet, comunicación entre zonas o transferencia entre regiones. Los nombres y grupos disponibles dependen de los servicios y regiones que usó la cuenta.
3. Cambia **Group by** a **Service**, **Region**, **Availability Zone** o **Linked account** para ubicar dónde quedó registrado el gasto. También puedes aplicar esos valores como filtros. El servicio ayuda a localizar el cargo en AWS; la región o la zona indican su dimensión de facturación, pero no identifican por sí solas los dos extremos de una conexión.
4. Si aparece **Usage type group**, úsalo para revisar una categoría agrupada, como transferencia de EC2. Esos grupos solo están disponibles para algunos servicios y reúnen tipos de uso relacionados; no existe un único filtro universal que incluya toda transferencia de datos de todas las cuentas.
5. Descarga el CSV de la tabla si necesitas conservar la comparación o revisar varias filas juntas. Cost Explorer incluye los cargos de transferencia dentro de los servicios asociados, como EC2 o S3; no necesariamente los muestra como una línea separada llamada “Data Transfer”. [La guía de filtros describe los tipos de uso y sus grupos](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-filtering.html), y [la guía de tablas explica cómo aparecen los cargos de transferencia](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-table.html).

En la práctica, lee estas dimensiones como respuestas a preguntas diferentes:

- **Service:** ¿en qué servicio se registró el cargo?
- **Region, Availability Zone y Linked account:** ¿en qué región, zona o cuenta aparece?
- **Usage type:** ¿qué unidad o actividad midió AWS para calcular ese cargo?
- **Usage type group:** ¿qué grupo de medidores relacionados quiero revisar?

Una etiqueta de asignación de costos puede ayudar a separar proyectos o equipos, si ya está activa y se aplica al cargo. No reemplaza el tipo de uso y no atribuye automáticamente un flujo de red a una instancia o aplicación.

### Cómo leer un tipo de uso

Los nombres concretos dependen del servicio, la región y la ruta del tráfico. Como ejemplo, AWS documenta `USE2-DataTransfer-Regional-Bytes` para transferencia entre zonas de disponibilidad de la región us-east-2. La región incluida en ese nombre forma parte del **tipo de uso**; el filtro **Region** es otra dimensión. No copies un nombre de otra cuenta sin comprobar qué valores aparecen en la tuya.

Tampoco sumes **UsageQuantity** de tipos distintos sin separar sus unidades: un resultado puede combinar GB, horas y otras medidas. Para encontrar qué aumentó, compara costos. Si necesitas comparar cantidades, filtra por un tipo de uso o grupo con la misma unidad antes de sumarlas. La API de Cost Explorer advierte expresamente sobre esta mezcla de unidades. [AWS detalla los tipos de uso de transferencia intra-región, entre regiones y hacia Internet](https://docs.aws.amazon.com/cur/latest/userguide/cur-data-transfers-charges.html).

## Consulta un tipo de uso con la API

Usa este ejemplo si tienes AWS CLI v2 configurada con un perfil de solo lectura que puede consultar Cost Explorer. Guarda este filtro en un archivo local llamado `filtro.json`:

```json
{
  "Dimensions": {
    "Key": "USAGE_TYPE",
    "Values": ["USE2-DataTransfer-Regional-Bytes"]
  }
}
```

Luego consulta un mes ya cerrado y agrupa el costo por servicio y tipo de uso:

```bash
aws ce get-cost-and-usage \
  --profile PERFIL_LECTURA \
  --region us-east-1 \
  --time-period Start=2026-08-01,End=2026-09-01 \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --filter file://filtro.json \
  --group-by Type=DIMENSION,Key=SERVICE Type=DIMENSION,Key=USAGE_TYPE
```

Reemplaza `PERFIL_LECTURA`, las fechas y el tipo de uso por los valores de tu cuenta. En el ejemplo, el inicio es inclusivo y el fin exclusivo: incluye del 1 al 31 de agosto de 2026. El filtro usa un tipo de uso de muestra para us-east-2; si ese tipo no aparece en tu período, la consulta puede devolver valores vacíos.

La consulta devuelve `UnblendedCost` como ejemplo. Si tu equipo informa costos amortizados o netos, cambia la métrica y mantén el mismo criterio en las comparaciones.

Cost Explorer expone esta API en `https://ce.us-east-1.amazonaws.com`, aunque los cargos consultados sean de otras regiones. La consola no cobra por usar los informes de Cost Explorer; cada solicitud paginada a la API cuesta actualmente **US$ 0,01 por página**. La CLI puede pedir más de una página para completar un resultado. [Consulta `GetCostAndUsage` para ver los campos, los grupos y la regla de fechas](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_GetCostAndUsage.html), y [el endpoint e IAM de la API](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-api.html). AWS puede actualizar sus precios; confirma el cargo vigente antes de automatizar consultas.

## Separa las dos partes del costo de NAT Gateway

Antes de interpretar un cargo, confirma si el NAT Gateway es **zonal** o **regional**:

- Un gateway zonal opera en una zona de disponibilidad y genera un cargo por cada hora que está disponible. Si tienes un NAT Gateway en tres zonas, cada uno genera su propio cargo horario.
- Un gateway regional es un recurso que puede abarcar varias zonas, pero su cargo horario se calcula **por cada zona activa**. Por ejemplo, si admite tres zonas durante una hora, se facturan tres NAT Gateway-hours; el total horario baja cuando deja de tener una zona activa.

En ambos modos se cobra el procesamiento por GB. Además, se aplican los cargos de transferencia estándar que correspondan a la ruta: por ejemplo, la salida a Internet puede tener su propio cargo, y una ruta entre el workload y un NAT zonal en otra zona puede generar transferencia entre zonas. No tomes los GB procesados por NAT como el total de GB facturados o como garantía de un cargo de egreso. Cost Explorer ofrece grupos como **EC2: NAT Gateway - Running Hours** y **EC2: NAT Gateway - Data Processed**; agrupa después por **Usage type** y confirma que las filas cubran el modo y las zonas activos de tu cuenta. AWS publica [el desglose actualizado de precios, incluidas las horas de un NAT regional por zona](https://aws.amazon.com/vpc/pricing/) y [la descripción de los grupos de uso de Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-filtering.html).

Con ese desglose confirmado, puedes comparar cambios como mantener un NAT zonal cerca de sus workloads o usar endpoints para tráfico hacia servicios de AWS compatibles. Valida el costo completo y las necesidades de disponibilidad antes de cambiar rutas: ni una alternativa ni el cambio de modo garantizan un ahorro para todas las arquitecturas.

Si el cargo principal es transferencia intra-región, continúa con la [guía para investigar y reducir costos de transferencia entre zonas de disponibilidad](https://dondeaprendoaws.com/blog/como-reducir-costos-de-transferencia-intra-region-en-aws/). Si el servicio que destaca es API Gateway, revisa la [guía para optimizar su transferencia de datos](https://dondeaprendoaws.com/blog/como-optimizar-la-transferencia-de-datos-en-api-gateway/); su análisis se centra en esa parte de la factura.

## Cuándo pasar de costos a tráfico real

Cost Explorer es un buen primer paso para detectar un servicio o tipo de uso que cambió. Si necesitas desgloses de facturación más completos, crea una exportación **CUR 2.0 en AWS Data Exports**: entrega filas de costo y uso por producto, tipo de uso y operación, con granularidad por hora, día o mes. Al habilitar el detalle por recurso, agrega la columna `line_item_resource_id`; ese campo queda vacío en tipos de uso como transferencias de datos y solicitudes de API. En el CUR clásico se llama `lineItem/ResourceId`. Por eso, el informe detallado tampoco garantiza que puedas atribuir cada GB a una instancia. Consulta la [tabla y opciones de CUR 2.0](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2.html) y los [campos de sus líneas de uso](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2-line-item.html).

Cuando la pregunta es **qué interfaces, IP, puertos o flujos generaron tráfico**, usa **VPC Flow Logs** para la VPC, subred o interfaz relevante. Sus registros describen tráfico IP y pueden publicarse en CloudWatch Logs, S3 o Firehose; no son una medición de facturación y no llegan en tiempo real. AWS también documenta límites sobre el tráfico que capturan. La publicación de esos registros genera cargos de ingestión y archivo en el destino, así que revisa el volumen y el precio antes de habilitarlos. [Consulta qué capturan los Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html), [sus tiempos de entrega](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs-basics.html) y [sus límites](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs-limitations.html).

Para un NAT Gateway, las métricas de CloudWatch pueden mostrar bytes agregados que entran y salen. Un gateway zonal se consulta por `NatGatewayId`; uno regional, por `NatGatewayId` y `AvailabilityZone`. Ayudan a validar volumen por zona y modo, pero no reemplazan el costo facturado ni identifican por sí solas cada aplicación. [AWS lista las métricas de NAT Gateway y sus dimensiones](https://docs.aws.amazon.com/vpc/latest/userguide/metrics-dimensions-nat-gateway.html).

## Comprobaciones si el resultado sorprende

- **No aparece el último día:** espera a que lleguen los datos de facturación; Cost Explorer no se actualiza como un registro de paquetes en vivo.
- **No encuentras “Data Transfer” como servicio:** agrupa por **Usage type** y revisa los servicios asociados; AWS puede integrar esos cargos en EC2, S3 u otro servicio.
- **El costo no coincide con los GB de un log:** Cost Explorer muestra importes facturados por medidor. Flow Logs y métricas describen tráfico con otro nivel de agregación y alcance.
- **No puedes ver otras cuentas de la organización:** pide al administrador que confirme el acceso de Billing y los permisos de Cost Explorer para tu cuenta o rol.
- **El total de una consulta de uso parece absurdo:** confirma la unidad de cada tipo de uso. No sumes horas con GB.

## Para seguir aprendiendo y conversar

Para contrastar un hallazgo con el diseño de red, puedes conversar en el [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/). Su temario incluye conectividad híbrida y entre cuentas, VPC Flow Logs y observabilidad de redes.

Para ampliar la mirada financiera, escucha el episodio [FinOps: cómo ahorrar en la nube](https://podcast.marcia.dev/932377/episodes/16129768-5-18-finops-o-como-ahorrar-en-la-nube), que aborda responsabilidades compartidas, métricas y decisiones de costo. Para conectar esa conversación con redes AWS, mira [The Cloud Forge: Conectividad y FinOps, el arte de crear valor en la nube](https://www.youtube.com/watch?v=k3uIrKU50ak). También puedes ver la sesión [FinOps en acción: Optimización real de costos en la nube](https://www.youtube.com/watch?v=UphnnilH09A), organizada por AWS User Group CreaTicas junto con AWS User Group San José, y seguir las actividades de [CreaTicas AWS User Group en Costa Rica](https://www.meetup.com/chiapa-uk-aws-users-meetup-group/).
