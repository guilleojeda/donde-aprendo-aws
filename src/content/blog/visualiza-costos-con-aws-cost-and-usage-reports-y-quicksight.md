---
title: Cómo visualizar costos de AWS con CUR 2.0, Athena y QuickSight
description: Conecta AWS Data Exports CUR 2.0 con Athena y QuickSight para consultar costos por servicio, crear un dashboard y resolver problemas de datos o permisos.
author: guille-ojeda
publishedAt: '2025-09-04'
publishedTimestamp: '2025-09-04T02:52:29.834000+00:00'
cover: /assets/blog/editorial-datos-ia.png
coverAlt: Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja.
ogImage: /assets/blog/editorial-datos-ia.png
related:
- title: 'Cómo usar AWS Cost Explorer: filtros y costos que no aparecen'
  url: https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/
- title: 'Cómo reducir costos en AWS: 10 estrategias para optimizar tu factura'
  url: https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/
modifiedTimestamp: '2026-10-07T10:03:05-03:00'
review:
  date: '2026-10-07'
---


Si necesitas investigar una variación en la factura, **AWS Cost Explorer** suele ser suficiente. Si necesitas revisar líneas de uso, cruzar cuentas, recursos o etiquetas y construir vistas propias, puedes exportar los datos detallados de **AWS Data Exports (CUR 2.0)**, consultarlos con **Amazon Athena** y visualizarlos en **Quick Sight**, la experiencia de inteligencia de negocios de Amazon Quick Suite.

Esta guía sigue ese segundo recorrido con un ejemplo de costos diarios por cuenta, servicio y tipo de partida. El resultado es un dashboard de análisis; no reemplaza la factura ni promete costos en tiempo real.

El nombre también cambió: Amazon anunció que QuickSight evolucionaría a **Amazon Quick Suite** en 2025 y que su capacidad de inteligencia de negocios se llamaría **Quick Sight**. La consola, las API y algunos tutoriales todavía pueden mostrar «QuickSight». El procedimiento de CUR y Athena es el mismo; [AWS explica el cambio de marca y la continuidad de los dashboards](https://aws.amazon.com/blogs/business-intelligence/reimagine-business-intelligence-amazon-quicksight-evolves-to-amazon-quick-suite/).

## ¿Necesitas crear un dashboard propio?

AWS ofrece un **Cost and Usage Dashboard** listo para usar desde **Billing and Cost Management → Data Exports**. La opción requiere QuickSight Enterprise Edition según la [guía de configuración de AWS](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create-dashboard.html). Da vistas de resumen y evita mantener tablas de Athena o crawlers de Glue, pero no incluye vistas por recurso ni análisis de Reserved Instances y Savings Plans. La [comparación oficial](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-dashboard-info.html) ayuda a decidir si alcanza para tu caso.

Continúa con este tutorial cuando necesites controlar las columnas del conjunto de datos, revisar detalles de recursos, atribuir costos o diseñar indicadores propios. Para más dashboards prediseñados, el repositorio actual de [Cloud Intelligence Dashboards](https://github.com/aws-solutions-library-samples/cloud-intelligence-dashboards-framework) documenta CUDOS v5 y CUR 2.0; sigue sus requisitos y la versión de CUR indicada por el despliegue que elijas.

El almacenamiento en S3, las consultas de Athena y el plan y la capacidad de Quick pueden generar cargos. Athena puede cobrar por los datos consultados; Parquet, la compresión y los filtros de partición reducen lo que una consulta lee. Revisa los [precios de Athena](https://aws.amazon.com/athena/pricing/) y los [planes actuales de Amazon Quick](https://aws.amazon.com/quick/pricing/) antes de habilitar los servicios. No des por hecho que toda parte del flujo es gratuita.

## Requisitos y permisos

Necesitas una cuenta autorizada para consultar los datos de facturación que quieres analizar. Si usas AWS Organizations, confirma desde qué cuenta o vista de facturación vas a exportar y qué cuentas miembro están visibles.

En la práctica participan permisos distintos:

- **Billing and Cost Management:** crear o administrar la exportación de CUR 2.0.
- **Amazon S3:** permitir que la exportación entregue los archivos y que Athena lea el prefijo del informe. Athena también necesita un destino S3 para sus resultados de consulta.
- **AWS Glue y Athena:** crear el catálogo y la tabla, leer el esquema y ejecutar las consultas.
- **Quick Suite:** un administrador debe autorizar las conexiones a Athena y a los buckets S3 correspondientes. El autor del dashboard necesita acceso al conjunto de datos y al análisis.

La autorización de Quick distingue el bucket de los datos del bucket de resultados de Athena. Si alguno usa SSE-KMS, concede también los permisos de descifrado necesarios a los roles que acceden a esos objetos. La [guía de conexión de Quick con Athena](https://docs.aws.amazon.com/quick/latest/userguide/athena.html) describe la autorización y cómo validar la conexión.

## 1. Crea una exportación CUR 2.0 en Data Exports

Abre **Billing and Cost Management → Data Exports → Create** y elige una exportación estándar de **Cost and Usage Report 2.0 (CUR 2.0)** con su esquema nuevo. No uses las instrucciones de la página antigua de CUR como si fueran el mismo formato: CUR 2.0 conserva un esquema más estable y agrupa algunos atributos, mientras que CUR heredado puede tener columnas distintas. AWS detalla las diferencias en la [guía de migración de CUR a CUR 2.0](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-migrate.html).

Para este ejemplo, configura:

1. **Granularidad diaria.** Es suficiente para observar tendencias por día. Elige una granularidad más fina solo si tu pregunta requiere ese detalle; aumenta el volumen de filas que deberás consultar.
2. **Formato Parquet con compresión Snappy.** Es la combinación que AWS documenta para procesar CUR 2.0 con Athena.
3. **Overwrite existing data export file.** Cada actualización reemplaza los archivos de esa partición mensual. La exportación crea particiones nuevas al cambiar el período de facturación.
4. **Solo las columnas que vayas a usar.** Conserva, como mínimo, los campos del ejemplo SQL: `line_item_usage_start_date`, `line_item_usage_account_id`, `line_item_product_code`, `line_item_line_item_type`, `line_item_currency_code` y `line_item_unblended_cost`. Mantén los nombres del esquema CUR 2.0.

El detalle por recurso es opcional. Si lo necesitas, activa la configuración de recursos de CUR 2.0 y considera que el informe puede crecer; algunos cargos, como solicitudes o impuestos, no se asocian a un ID de recurso. Activa también en Billing las etiquetas de asignación de costos que planees analizar; no supongas que toda etiqueta está disponible automáticamente.

AWS refresca los datos de facturación al menos una vez al día. La primera entrega puede tardar hasta 24 horas, y puede haber ajustes al período anterior durante las primeras dos semanas después de su cierre. Por eso, los valores actuales pueden cambiar aunque la exportación ya exista. Consulta las [opciones de entrega y actualización](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-export-delivery.html).

## 2. Crea la tabla para Athena

Con la exportación en S3, crea la tabla y sus particiones con AWS Glue. Configura un crawler de Glue para que recorra el prefijo `data/` de esa exportación y registre el esquema y las particiones en el catálogo de Glue. AWS documenta el flujo de CUR 2.0 con Parquet y overwrite en su [guía de procesamiento de Data Exports](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-processing.html).

```text
s3://<bucket>/<prefijo>/<nombre-exportacion>/data/
```

CUR 2.0 organiza los archivos por período de facturación, con rutas como `BILLING_PERIOD=YYYY-MM`. No apuntes el crawler al bucket completo ni uses el archivo `Manifest.json` como tabla: el manifiesto es metadato de entrega, no el conjunto Parquet que consulta Athena.

Cuando termine el crawler, selecciona la base de datos y la tabla que creó en Glue y comprueba el esquema. Si eliges la integración de Athena al crear la exportación, AWS también deja un `crawler-cfn.yml`, un SQL para crear la tabla y un directorio de estado en S3; esos archivos son específicos de esa exportación.

## 3. Prueba una consulta CUR 2.0

Antes de conectar Quick, confirma en Athena que la tabla devuelve filas. El ejemplo muestra el filtro `2026-10`; reemplázalo por un `billing_period` que exista en el catálogo. Una exportación recién creada puede no contener meses anteriores, y el período actual puede recibir nuevas entregas.

```sql
SELECT
    CAST(line_item_usage_start_date AS date) AS dia_utc,
    line_item_usage_account_id AS cuenta,
    line_item_product_code AS servicio,
    line_item_line_item_type AS tipo_partida,
    line_item_currency_code AS moneda,
    SUM(line_item_unblended_cost) AS costo_unblended
FROM billing_db.cur2_table
WHERE billing_period = '2026-10'
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1, 6 DESC;
```

Los nombres de la consulta son los de CUR 2.0: `line_item_usage_start_date` es una marca de tiempo, `line_item_product_code` identifica el servicio y `line_item_unblended_cost` es numérico. `billing_period` es la partición mensual que crea la tabla. El ejemplo agrupa costos en la moneda de origen en vez de sumarlos a través de posibles divisas distintas. Para ver unidades de uso, consulta `line_item_usage_amount`, pero no sumes unidades de servicios diferentes como si fueran una sola medida: una hora de cómputo y un gigabyte no son comparables. El [diccionario CUR 2.0 de AWS](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2-line-item.html) enumera columnas y tipos.

La consulta deja visibles los tipos de partida porque no todo es uso de servicio: el informe puede contener tarifas, descuentos, créditos, reembolsos e impuestos. También limita la consulta a una partición. Si ejecutas Athena sobre muchas particiones, seleccionas columnas que no usas o dejas fuera `billing_period`, puede leer más datos y elevar el costo de la consulta.

## 4. Conecta Athena con Quick Sight y publica el dashboard

Desde **Amazon Quick → Data → Create → New dataset**, elige **Athena**, selecciona una fuente existente o crea una nueva y valida la conexión. En la pantalla de tabla, selecciona **Use custom SQL** y pega la consulta del paso anterior con el nombre real de la tabla. Así el dataset de Quick contiene los mismos campos con alias que muestra la consulta: `dia_utc`, `cuenta`, `servicio`, `tipo_partida`, `moneda` y `costo_unblended`. Comprueba las columnas con **Edit/preview data** antes de guardar. AWS documenta este flujo en [crear un conjunto de datos desde Athena](https://docs.aws.amazon.com/quick/latest/userguide/create-a-data-set-athena.html).

Esta ruta usa Custom SQL y SPICE opcional. Si la cuenta conecta Quick y Athena mediante *trusted identity propagation* con IAM Identity Center, AWS desactiva ambas funciones para ese origen; revisa las [limitaciones de esa modalidad](https://docs.aws.amazon.com/quick/latest/userguide/athena.html) y sigue el patrón de acceso de tu organización.

Para guardar el conjunto de datos, elige uno de estos modos:

- **Direct query:** Athena consulta los datos de origen al abrir el análisis o dashboard. Evita una copia almacenada en SPICE, pero cada lectura depende de Athena, de la latencia de la consulta y de los datos ya procesados por el crawler.
- **SPICE:** Quick carga y conserva una copia en memoria para responder rápido. Programa una actualización del conjunto de datos después de que Data Exports haya entregado la partición y Glue haya actualizado la tabla. Una actualización de CUR en S3 no actualiza por sí sola la copia en SPICE. Si quieres revisar otro período, cambia también el filtro de la consulta; refrescar SPICE vuelve a ejecutar la consulta guardada.

AWS explica cuándo se actualiza una consulta directa y cómo programar cargas de [SPICE](https://docs.aws.amazon.com/quick/latest/userguide/refreshing-data.html). En ambos casos, CUR no es una fuente en tiempo real: la actualización del dashboard depende de la entrega diaria y, con SPICE, también del horario de ingesta.

Antes de crear las vistas, puedes mirar [una grabación de AWS User Group Guatemala sobre su primer dashboard en QuickSight](https://www.youtube.com/watch?v=8d28fuUT3Oo), publicada en el [canal de YouTube del grupo](https://www.youtube.com/@awsugguatemala/streams). La sesión es de 2023, así que sirve para conceptos de visualización; los pasos y nombres de consola de esta guía siguen la documentación actual.

En todo gráfico o total, filtra una sola `moneda` o mantenla como dimensión/serie. La consulta agrupa por moneda, pero Quick puede volver a sumar filas de monedas distintas si el visual no conserva esa separación.

Empieza con cuatro vistas que respondan preguntas concretas:

1. **Tendencia diaria:** suma `costo_unblended` por `dia_utc` y moneda, o filtra a una moneda, para ver cambios dentro del período consultado.
2. **Costo por servicio:** barras por `servicio`, con opción para filtrar por `cuenta` y `moneda`.
3. **Tipo de partida:** tabla o barras por `tipo_partida`, manteniendo una moneda por serie o filtro, para distinguir uso de cargos, créditos y otros ajustes.
4. **Detalle de investigación:** tabla por `cuenta`, `servicio`, `dia_utc`, `tipo_partida` y `moneda`. Para añadir región, etiquetas o ID de recurso, activa y conserva esos campos en la exportación, agrégalos a la consulta y a su `GROUP BY`.

Usa el mismo período, filtro de cuentas, moneda y medida al comparar valores. Si el dashboard va a guiar decisiones, muestra junto al total qué medida de costo representa y cuándo se actualizó.

## Un costo no es lo mismo que otro

**Unblended cost** (`line_item_unblended_cost`) es la medida del ejemplo. Representa el costo por partida a la tarifa no combinada; no es automáticamente el total final de factura ni prorratea por tiempo las tarifas de compromisos. Mantén visibles créditos, reembolsos y tarifas cuando la pregunta requiera explicar el total.

**Amortized cost** distribuye en el período el costo inicial y recurrente de Reserved Instances y Savings Plans para comparar el costo efectivo de las cargas. CUR 2.0 expone campos separados como `reservation_effective_cost` y `savings_plan_savings_plan_effective_cost`; no se obtienen sumando esos campos a `line_item_unblended_cost`. AWS describe el cálculo y los tipos de partida en sus diccionarios de [Reserved Instances](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2-reservation.html) y [Savings Plans](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2-savings-plan.html).

**Net cost** refleja descuentos aplicables. Campos como `line_item_net_unblended_cost`, `reservation_net_effective_cost` y `savings_plan_net_savings_plan_effective_cost` solo se incluyen cuando corresponde un descuento al período de facturación. «Net» responde a descuentos; «amortized» responde al momento en que asignas tarifas de compromisos. El objetivo puede requerir net amortized, pero construir esa medida exige aplicar las reglas a cada tipo de partida. No combines net, unblended y amortized en un solo total. Para un ejemplo de esa lógica, revisa la [guía de AWS para net amortized cost](https://docs.aws.amazon.com/guidance/latest/cloud-intelligence-dashboards/net-amortized-cost.html) y valida las columnas disponibles en tu exportación.

Para conversar sobre cómo convertir mediciones en decisiones FinOps, mira [FinOps en acción: optimización real de costos en la nube](https://www.youtube.com/watch?v=UphnnilH09A), una grabación de AWS User Group CreaTicas. Ese contexto ayuda a decidir qué pregunta debe responder el dashboard; la definición de cada columna sigue dependiendo de la medida que elijas.

## Resolver problemas frecuentes

**Athena no devuelve filas.** Revisa que la entrega figure como exitosa en Data Exports, que el crawler lea el prefijo `data/` y que exista la partición `billing_period` elegida en la consulta. Una exportación recién creada puede tardar hasta 24 horas en entregar datos y no debes suponer que ya incluye meses anteriores a su creación. Si la consulta pide solo un mes, confirma que ese literal `YYYY-MM` exista en Glue y corresponda al período facturado.

**Aparecen filas duplicadas.** Comprueba que la exportación usa `Overwrite existing data export file` y que el crawler no recorre carpetas ajenas al prefijo de `data/`. Con `Create new`, cada ejecución se guarda en una ruta con marca de tiempo; tratar todas esas versiones como filas del mes actual duplica datos. Las actualizaciones con overwrite reemplazan los archivos de la misma partición mensual.

**Quick no encuentra la tabla o informa `Access denied`.** El usuario puede tener acceso a la consola y aun así faltarle autorización de Quick para Athena, Glue, el bucket del CUR, el bucket de resultados de Athena o la clave KMS. Autoriza el origen y los resultados que correspondan y valida la conexión desde el conjunto de datos de Athena.

**El dashboard queda atrasado.** En Direct Query confirma que el crawler terminó después de la última entrega. En SPICE, revisa el historial de ingestas y programa el refresh posterior al crawler. Recuerda que Data Exports refresca al menos una vez por día y puede actualizar el período anterior después del cierre; un dashboard correcto puede no coincidir con una factura todavía no finalizada.

## Aprende y conversa con comunidades AWS

Si quieres preguntar o seguir participando, consulta el [Meetup de AWS User Group Guatemala](https://www.meetup.com/aws-guatemala/) para sumarte a su comunidad y calendario, el espacio de [AWS User Group CreaTicas](https://www.linkedin.com/company/aws-user-group-creaticas/) para seguir sus charlas y actividades en Costa Rica, o la agenda de [AWS User Group Ecuador](https://www.awsugecuador.com/), que publica encuentros presenciales y en línea. Los temas y las fechas cambian; revisa el calendario del grupo antes de inscribirte.

## Siguientes pasos

Empieza con un período cerrado y una medida de costo bien definida. Compara el mismo período, moneda y conjunto de cuentas en Athena y Quick. Si Cost Explorer ya responde tu pregunta, consulta la [guía de filtros y costos que no aparecen](https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/); para actuar sobre un hallazgo, revisa las [estrategias para optimizar costos en AWS](https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/). Si el costo creció en EC2 o RDS, contrasta la demanda y las métricas antes de cambiar capacidad: [cómo elegir el tipo y tamaño de una instancia EC2](https://dondeaprendoaws.com/blog/tipos-y-tamanos-de-instancias-ec2-guia-completa/) y [cómo elegir una clase de instancia RDS](https://dondeaprendoaws.com/blog/tipos-y-tamanos-de-instancias-rds-guia-completa/) son siguientes pasos específicos. Si estás comparando compromisos para EC2, revisa [las diferencias y riesgos de Reserved Instances y Savings Plans](https://dondeaprendoaws.com/blog/ahorro-de-costos-en-aws-con-instancias-reservadas-y-savings-plans/) antes de atribuir el costo amortizado a un descuento esperado.
