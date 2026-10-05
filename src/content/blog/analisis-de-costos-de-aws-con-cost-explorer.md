---
title: "Cómo usar AWS Cost Explorer: filtros y costos que no aparecen"
description: "Aprende a usar AWS Cost Explorer: filtros, costos sin amortizar y amortizados, permisos y pasos para investigar gastos que todavía no aparecen."
author: "guille-ojeda"
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T23:32:10.366Z"
modifiedTimestamp: "2026-10-05T00:04:02-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related: []
---

AWS Cost Explorer sirve para entender **qué servicio, cuenta o tipo de uso explica un cambio en tus costos**. Para empezar, abre un informe mensual, elige **Unblended costs** y agrupa por **Service**. Si un servicio subió, filtra por ese servicio y agrupa por **Usage type**; después prueba **Region** o **Linked account** para acotar la causa.

Cost Explorer analiza los datos de facturación y uso: no muestra cargos en tiempo real ni reemplaza las alertas de presupuesto.

![Cost Explorer](/assets/blog/61560601aa30cbebf1b2815d.jpg)

## Antes de abrir Cost Explorer por primera vez

La interfaz de Cost Explorer no tiene cargo, según la [guía de AWS](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html). La API sí: cada solicitud paginada a la vista principal cuesta **USD 0,01**; las solicitudes a vistas de facturación personalizadas se cobran por cada fuente de datos. Si vas a automatizar consultas, revisa la [página oficial de precios](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/) y cuenta cada llamada, incluidas las páginas siguientes de una respuesta.

La primera vez que abres Cost Explorer, AWS lo habilita para la cuenta y [no permite deshabilitarlo después](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html). También configura AWS Cost Anomaly Detection con un monitor de servicios de AWS y una suscripción a un resumen diario. Es una función separada de Cost Explorer; consulta [qué se activa y cómo administrar Cost Anomaly Detection](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-enable.html) antes de habilitarlo en una cuenta de una organización.

Según la [guía de habilitación de AWS](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-enable.html), la preparación inicial del mes actual demora alrededor de 24 horas y los meses históricos pueden tardar unos días más. Por defecto, prepara el mes actual y los 13 meses anteriores; la disponibilidad también depende de la historia de tu cuenta. Para ampliar el historial mensual hasta 38 meses, existe una [opción de datos de varios años](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-configuring-data.html) en las preferencias de Cost Management. El panel suele reflejar el uso hasta el día anterior; AWS actualiza los datos al menos una vez cada 24 horas, aunque la llegada desde los sistemas de facturación puede demorar más, como explica la [guía sobre los datos del panel](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-exploring-data.html).

La grabación de [Facturación y precios en AWS del AWS User Group Medellín](https://www.youtube.com/watch?v=RcZp0ddljjs) permite acompañar esta explicación con una clase en español. Es una sesión de mayo de 2025: úsala para estudiar los modelos de precios y contrasta las condiciones actuales con AWS.

## Armar una vista para encontrar qué cambió

1. Abre la [consola de Billing and Cost Management](https://console.aws.amazon.com/costmanagement/) y elige **Cost Explorer**. Si es la primera vez, selecciona **Launch Cost Explorer** para habilitarlo.
2. Elige una vista de costos y uso, un intervalo con meses completos y una granularidad **Monthly**. Comparar meses completos evita tomar el mes en curso —que todavía se estima y se actualiza— como si fuera un período cerrado.
3. En **Group by**, elige **Service**. El gráfico y la tabla muestran cómo se reparte el total entre los servicios. Si buscas cambios de los últimos días, cambia la granularidad a **Daily**.
4. Si detectas una diferencia, filtra por el servicio que aumentó. Luego agrupa por **Usage type** para ver qué uso dentro del servicio cambió. Repite la consulta agrupando por **Region** o **Linked account** si necesitas otra dimensión.
5. Descarga la tabla como CSV si quieres comparar o conservar el resultado del informe. La tabla incluye el conjunto completo que representa la vista; el gráfico puede agrupar visualmente los valores menos frecuentes.

El nombre exacto de algunos controles puede variar con la experiencia de consola de tu cuenta. AWS explica las opciones vigentes para [filtrar costos](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-filtering.html), [agrupar y modificar el gráfico](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-modify.html) y [descargar los datos del informe](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-table.html).

### Qué hacen los filtros y “Group by”

Un **filtro** reduce los datos que entran en la vista; **Group by** separa esos datos en categorías. Por ejemplo, filtra por la categoría de EC2 que muestre tu cuenta y agrupa por `Usage type` para investigar el cambio. Los cargos de cómputo y otros cargos de EC2 pueden aparecer separados, por ejemplo en **EC2-Instances** y **EC2-Other**; no des por hecho que un solo filtro incluye todo el almacenamiento y la transferencia. También puedes filtrar por cuenta, región, tipo de cargo, operación, tipo de uso y etiqueta, entre otras dimensiones disponibles.

Si eliges varios valores dentro de un mismo filtro, Cost Explorer suma los valores seleccionados. Si combinas filtros de categorías distintas, busca los costos que cumplen las condiciones de ambos. Agrupar por una dimensión sirve para descubrir el desglose; después puedes cambiar el filtro o el agrupamiento para investigar otra parte del costo.

Una etiqueta solo aparece como dimensión de costos si se aplicó a los recursos compatibles y se activó como etiqueta de asignación de costos en Billing and Cost Management. En una organización, la gestión de etiquetas corresponde a la cuenta de administración. La activación puede tardar hasta 24 horas; revisa la [guía de etiquetas de asignación de costos de AWS](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html) si no encuentras una etiqueta.

## Unblended costs y amortized costs

La métrica cambia cómo se distribuyen los costos de compromisos como Reserved Instances y Savings Plans. Para seguir una cifra de facturación, revisa también la página **Bills**: Cost Explorer está pensado para analizar tendencias y su agrupación puede diferir de la factura.

| Métrica | Qué representa y cuándo usarla |
|---|---|
| **Unblended costs** | Costos registrados con las tarifas de uso correspondientes. Los pagos iniciales o recurrentes de un compromiso pueden aparecer cuando se cobran.<br><br>Para revisar cargos por uso y picos en el período en que se registró un pago. |
| **Amortized costs** | Distribuye los pagos iniciales y recurrentes de Reserved Instances o Savings Plans a lo largo del período del compromiso.<br><br>Para comparar el costo efectivo del uso entre períodos, sin concentrar todo el pago inicial en el mes de compra. |

No esperes que la vista amortizada coincida con el importe que pagas ese mes: es una forma de análisis por período. AWS describe la diferencia entre los [datos de facturación y los costos de Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/differences-billing-data-cost-explorer-data.html) y explica las [vistas de costos amortizados](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-exploring-data.html).

## Por qué todavía no aparecen los costos

Revisa estos puntos en orden:

- **Acabas de habilitar Cost Explorer.** El mes actual suele aparecer en alrededor de 24 horas; el historial tarda unos días más en prepararse. La [guía de habilitación](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-enable.html) detalla el proceso.
- **Esperas ver el uso de hoy.** El panel normalmente refleja el uso hasta el día anterior. Los datos dependen de los sistemas de facturación de cada servicio y algunos pueden tardar más de 24 horas; Cost Explorer no es un medidor en tiempo real.
- **La vista quedó demasiado acotada.** Confirma las fechas, la cuenta, el servicio y los filtros; quita filtros y vuelve a agrupar por **Service** para ver si los cargos aparecen en otra categoría.
- **No tienes permiso para ver facturación.** Para entrar a páginas de Billing and Cost Management, un administrador debe habilitar el acceso IAM a la consola y conceder a tu rol los permisos de Cost Explorer. En AWS Organizations, la cuenta de administración también puede restringir el acceso de cuentas miembro. Consulta la guía de AWS sobre [permisos de facturación](https://docs.aws.amazon.com/cost-management/latest/userguide/control-access-billing.html) y [acceso a Cost Explorer en una organización](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-access.html).
- **Buscas un recurso individual.** Cost Explorer agrega costos por servicio; los identificadores de recursos requieren habilitar datos por recurso para los servicios compatibles. En la vista diaria, esa función cubre los últimos 14 días y puede tardar hasta 48 horas en estar disponible. Consulta [los límites de los datos por recurso](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-resource-daily.html); para revisar datos más granulares, considera AWS Data Exports o Cost and Usage Reports.

Si el total de Cost Explorer no coincide con la factura, compara el mismo período y la misma cuenta. Las fechas de actualización, impuestos, créditos, reembolsos y la forma de agrupar servicios pueden explicar diferencias. Usa **Bills** para validar el importe facturado y [Cost Explorer para investigar tendencias](https://docs.aws.amazon.com/cost-management/latest/userguide/differences-billing-data-cost-explorer-data.html).

## Cost Explorer, pronósticos y AWS Budgets

Cost Explorer ayuda a **analizar qué pasó** y ofrece un pronóstico basado en el uso histórico. AWS describe ese pronóstico como una estimación con un intervalo de predicción del 80 %; puede no mostrarlo si todavía hay menos de un ciclo de facturación completo. Si agrupas la vista, quita **Group by** para volver a consultar el pronóstico. Lee la explicación oficial sobre [cómo interpretar el pronóstico](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-forecast.html) y no lo tomes como garantía del importe que llegará en la factura.

AWS Budgets sirve para **seguir un límite y recibir avisos** sobre costos reales o previstos. Sus datos se actualizan hasta tres veces al día; los ciclos suelen espaciarse entre 8 y 12 horas, y un aviso puede llegar después de que se haya generado uso adicional. Un presupuesto con notificaciones no detiene recursos por sí solo: las acciones requieren una configuración explícita. Para conocer esas opciones, consulta la guía de [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html).

| Necesidad | Herramienta |
| --- | --- |
| Desglosar un aumento por servicio, región, cuenta o tipo de uso | Cost Explorer |
| Recibir un aviso al alcanzar un umbral de costo | AWS Budgets |
| Detectar patrones de gasto inusuales | AWS Cost Anomaly Detection |
| Estimar el costo de una arquitectura antes de crearla | [AWS Pricing Calculator](https://calculator.aws/) |

La sesión de [Monitoreo y gestión de recursos de Medellín](https://www.youtube.com/watch?v=2cGwdSTdUqQ), también grabada en mayo de 2025, sitúa CloudWatch, CloudTrail, Budgets y Cost Explorer dentro del seguimiento de una cuenta. Puede ayudarte a elegir qué herramienta investigar ante una duda de operación o gasto.

## Seguir aprendiendo

Como ejemplo de análisis, el [repositorio AWS Cost Analysis & Remediation – Cost Explorer](https://github.com/JonasCC8/AWS-Cost-Analysis-Remediation-Cost-Explorer) propone revisar servicios, regiones y etiquetas antes de elegir una remediación. El contenido visible es un README y un diagrama, no una herramienta lista para ejecutar; tómalo como esquema de ideas y verifica el efecto de cada cambio antes de aplicarlo.

Si prefieres conversar y aprender con otras personas, el [AWS User Group Medellín](https://www.meetup.com/awsugmed/) presenta en Meetup su comunidad, encuentros y canales de participación. En Argentina, el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) recibe a personas interesadas en la nube; revisa cada página para ver las fechas actuales. También puedes explorar el [directorio de comunidades AWS](/comunidades/) y la [agenda de eventos en línea](/eventos/online/), que muestra fechas, horario del organizador y enlaces de inscripción.

Para octubre de 2026 están anunciadas las sesiones en línea [EC2 vs Lambda](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/), del AWS User Group Tlaxcala FireflyCloud, el **16 de octubre de 16:00 a 17:00, hora de Ciudad de México (UTC−6)**, y [Manejo de Cuentas, Facturación y Soporte](https://www.meetup.com/aws-sbg-at-national-autonomous-univ-of-mexico-central-campus/events/316827297/), del Student Builder Group de la UNAM, el **17 de octubre de 12:00 a 14:00 en la misma zona horaria**. Consulta el registro, requisitos y disponibilidad con cada organizador. Si esas fechas ya pasaron, usa la agenda para encontrar otra actividad.

Si Cost Explorer te señala cargos de transferencia, NAT Gateway o endpoints de VPC, sigue con [Costos de red en AWS: 10 estrategias para reducir la factura](/blog/10-estrategias-para-optimizar-costos-de-red-en-aws/), que explica cómo investigar esas líneas y evaluar cambios de arquitectura.
