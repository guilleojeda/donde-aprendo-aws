---
title: "Facturación de AWS: cómo leer la factura y controlar el gasto"
description: "Consulta la factura de AWS, investiga aumentos con Cost Explorer y configura alertas con Budgets. Conoce los tiempos de actualización y cuándo usar CUR 2.0."
author: "guille-ojeda"
publishedAt: "2024-10-26"
publishedTimestamp: "2024-10-26T18:40:19.127Z"
modifiedTimestamp: "2026-10-06T15:51:02-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Cómo usar AWS Cost Explorer: filtros y costos que no aparecen"
    url: "https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/"
  - title: "Cómo reducir costos en AWS: 10 estrategias para optimizar tu factura"
    url: "https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/"
  - title: "AWS Organizations: cómo administrar varias cuentas"
    url: "https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/"

---

Para consultar una factura de AWS, abre **Billing and Cost Management → Bills** y elige el período. El mes en curso muestra cargos estimados; un período cerrado con factura emitida confirma el importe facturado. Si quieres investigar un aumento o anticipar otro, usa la herramienta adecuada al paso: estimar antes de desplegar, encontrar qué cambió, recibir alertas, detectar anomalías o exportar el detalle.

## Qué herramienta usar

| Necesitas… | Abre… | Ten en cuenta… |
| --- | --- | --- |
| Revisar cargos estimados del mes o una factura emitida | **Billing and Cost Management → Bills** | La factura del período cerrado es el importe de referencia; los cargos del mes en curso son estimaciones. |
| Encontrar qué servicio, cuenta, región o tipo de uso explica un cambio | **Cost Explorer** | Analiza tendencias y previsiones. Los datos no son en tiempo real y pueden diferir de la factura. |
| Avisar cuando el gasto real o previsto se acerque a un umbral | **AWS Budgets** | Los avisos dependen de datos de facturación que se actualizan al menos una vez al día. Un presupuesto no limita por sí solo el gasto. |
| Recibir avisos sobre un patrón de gasto inusual | **AWS Cost Anomaly Detection** | Complementa los presupuestos; detectar un cambio puede tardar hasta 24 horas. |
| Consultar cargos y uso con más detalle o hacer análisis repetibles | **Data Exports → CUR 2.0** | Envía exportaciones periódicas a Amazon S3. Requiere definir el conjunto de datos y, si hace falta, preparar consultas. |
| Estimar una carga antes de desplegarla | **AWS Pricing Calculator** | Calcula con los supuestos que ingresas; la estimación no es una factura ni incluye impuestos. |

AWS reúne estas funciones en la [consola de Billing and Cost Management](https://console.aws.amazon.com/costmanagement/). La página **Bills** ayuda a revisar los cargos estimados del período actual y las facturas ya emitidas. Usa la factura del período cerrado para confirmar el importe facturado; utiliza Cost Explorer para investigar cómo se distribuyó el gasto. La [guía de Billing](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/view-billing-dashboard.html) explica qué muestra la consola y por qué su resumen puede diferir de Bills.

Antes de crear una carga nueva, puedes usar la [AWS Pricing Calculator](https://calculator.aws/) para modelar servicios y uso previsto. El resultado es una estimación, no una factura; el costo real depende del uso y AWS indica que el cálculo no incluye impuestos. La calculadora pública usa tarifas On-Demand; la versión dentro de Billing también permite modelar descuentos y compromisos. Revisa la [documentación vigente de Pricing Calculator](https://docs.aws.amazon.com/cost-management/latest/userguide/pricing-calculator.html) para elegir la experiencia adecuada. El [canal de AWS Women Colombia](https://www.youtube.com/@awswomencolombia) publica una grabación titulada [AWS Pricing Calculator paso a paso](https://www.youtube.com/watch?v=e_oVCKBMnkA). Para seguir aprendiendo, consulta también el [archivo de charlas y actividades de la comunidad](https://awswomencolombia.com/page/eventos) o sus [encuentros en Meetup](https://www.meetup.com/aws-women-colombia-user-group/); verifica en la guía oficial las condiciones actuales de la calculadora.

## Cómo investigar un aumento en la factura

1. **Elige el período y la cuenta correctos.** En **Bills**, selecciona el mes y revisa los servicios y cargos. Si usas varias cuentas, confirma si estás mirando la cuenta de administración o una cuenta miembro. La facturación consolidada puede reunir cargos de toda la organización en la factura pagada por la cuenta de administración.

2. **Busca el cambio en Cost Explorer.** Abre un intervalo equivalente al que quieres comparar y agrupa primero por **Service**. Filtra el servicio que aumentó y vuelve a agrupar por **Usage type**; si corresponde, prueba **Region** o **Linked account**. Así reduces la búsqueda a una parte del consumo. Para armar y leer estas vistas, continúa con [la guía de filtros y análisis de AWS Cost Explorer](https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/).

3. **Comprueba qué línea de uso originó el importe.** Revisa el período, servicio, tipo de uso, región y cuenta. Cost Explorer puede mostrar costos agrupados de otra manera que **Bills**; también influyen descuentos, créditos, devoluciones, impuestos, redondeos y el momento de actualización. Una diferencia entre dos paneles no demuestra por sí sola que exista un cargo duplicado.

4. **Pasa a CUR 2.0 si necesitas más detalle.** En **Data Exports**, crea una [exportación estándar de Cost and Usage Report 2.0 (CUR 2.0)](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create.html) y elige las columnas que vas a analizar. AWS la entrega en Amazon S3; puedes consultarla con herramientas como Amazon Athena o integrarla con otros flujos de análisis. Incluye los ID de recursos o etiquetas solo cuando necesites esos campos y tengas habilitada su recopilación.

5. **Actúa según la causa.** Si el aumento viene de un recurso que ya no se necesita, comprueba su dueño y dependencias antes de detenerlo o borrarlo. Si responde a una carga legítima, revisa alternativas de dimensionamiento o compra con quienes operan el servicio. Para pasar del diagnóstico a medidas de ahorro, consulta [10 estrategias para reducir costos en AWS](https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/). Diana Alfaro también comparte [From Waste to Efficiency: Enfoques Prácticos para la Gestión de Costos en AWS](https://blog.alfalfita.cloud/from-waste-to-efficiency-enfoques-practicos-para-la-gestion-de-costos-en-aws), con ejemplos generales como retirar recursos ociosos, programar entornos no productivos y asignar responsabilidades. La página indica que se actualizó el 16 de enero de 2025; úsala como lectura de enfoque y verifica las instrucciones de cada servicio en la documentación vigente.

### Cuándo aparecen los datos

Cost Explorer muestra el uso procesado hasta el día anterior y refresca sus datos al menos cada 24 horas. La preparación inicial puede tardar alrededor de un día, y la llegada de datos desde los sistemas de facturación puede demorar más, como explica la [guía de datos de Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-exploring-data.html). AWS Budgets también actualiza al menos una vez al día. Por eso, una alerta puede llegar después de que se produjo el consumo: no uses ninguna de estas vistas como medidor de gasto en tiempo real.

Cost Anomaly Detection analiza los datos de Cost Explorer y ejecuta la detección aproximadamente tres veces al día. Puede tardar hasta 24 horas en identificar un uso inusual; un monitor recién creado necesita tiempo para empezar y, para un servicio nuevo, AWS requiere diez días de datos históricos. Además, el detector no cubre la mayoría de los cargos de terceros de AWS Marketplace. Para vigilar el gasto total, incluido Marketplace, crea también un presupuesto y revisa sus filtros. AWS detalla el [alcance y el retraso de Cost Anomaly Detection](https://docs.aws.amazon.com/cost-management/latest/userguide/manage-ad.html).

La primera entrega de una exportación de Data Exports puede tardar hasta 24 horas; después, el archivo de CUR 2.0 se refresca al menos una vez al día durante el período abierto. AWS puede actualizar la exportación del período anterior durante las dos primeras semanas después de su cierre, según la [documentación de entrega y actualización](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-export-delivery.html). Si cambiaste la configuración de un informe y necesitas recuperar datos anteriores, consulta la opción de [solicitar un backfill de Cost and Usage Reports](https://docs.aws.amazon.com/cur/latest/userguide/troubleshooting-cur.html); hay casos que no se pueden reconstruir, como datos anteriores a la creación de la cuenta o a ciertos cambios de organización.

Las cifras del mes en curso son estimaciones y pueden cambiar. Billing y Cost Explorer se refrescan con cadencias distintas y agrupan algunos cargos de forma diferente; la factura emitida es la referencia para el importe facturado. AWS explica estas [diferencias entre Billing y Cost Explorer](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/differences-billing-data-cost-explorer-data.html).

## Presupuestos y alertas: avisar no es poner un tope

En **AWS Budgets**, crea un presupuesto de costos con el período que tenga sentido para tu trabajo y agrega alertas sobre costos **reales** y **pronosticados**. Puedes enviarlas a correos electrónicos o a un tema de Amazon SNS. Escoge umbrales que te den tiempo para investigar antes de que termine el período; la alerta sigue dependiendo del ritmo de actualización de los datos.

Un presupuesto **no detiene automáticamente la facturación cuando se alcanza el importe configurado**. AWS permite adjuntar acciones de presupuesto, por ejemplo aplicar una política a identidades o una política de control de servicios, o dirigir acciones a instancias EC2 o RDS seleccionadas. Son controles separados que hay que configurar y probar; no bloquean cualquier tipo de cargo ni sustituyen la revisión del impacto operativo. Consulta [cómo funcionan las alertas de AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html) y [qué acciones se pueden asociar a un presupuesto](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html).

Cost Anomaly Detection sirve para otra pregunta: «¿hay un patrón de gasto que se sale de lo habitual?». Configura los monitores y las notificaciones para los servicios, cuentas o categorías relevantes. Úsalo como una señal para investigar, junto a un presupuesto que vigile un límite elegido por ti, no como una promesa de detección inmediata.

## Qué cambia con una factura consolidada

AWS Organizations permite consolidar la facturación de varias cuentas. En el modelo habitual, la cuenta de administración recibe y paga la factura del conjunto, mientras los datos de costo permiten distinguir las cuentas miembro. Si una organización incluye cuentas asociadas a distintas entidades de venta de AWS (*seller of record*), AWS puede emitir una factura por entidad. Esto simplifica el pago y la revisión conjunta, pero no decide por sí solo cómo diseñar, gobernar o administrar las cuentas; para esa parte, sigue con [la guía para administrar varias cuentas con AWS Organizations](https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/).

Al consolidar el uso, la organización puede compartir descuentos por volumen, beneficios de Reserved Instances y Savings Plans. **No es un descuento automático garantizado para cada cuenta:** depende de que el uso y el compromiso sean elegibles y de las preferencias de uso compartido configuradas por la organización. La cuenta de administración controla esas preferencias. Revisa las [condiciones de facturación consolidada](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/consolidated-billing.html) y el [uso compartido de descuentos de Reserved Instances y Savings Plans](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/ri-turn-off.html) antes de atribuir el ahorro a un equipo o proyecto.

## AWS Free Tier: importa cuándo se creó la cuenta

El programa cambió el **15 de julio de 2025**. La fecha de creación de la cuenta determina qué condiciones aplican; no hay una única oferta que describa todas las cuentas.

| Cuenta creada… | Qué programa aplica | Qué revisar antes de lanzar recursos |
| --- | --- | --- |
| Antes del 15 de julio de 2025 | El programa legado, con ofertas de prueba corta, ofertas de 12 meses y ofertas siempre gratuitas según el servicio. | Los límites son específicos de cada oferta. Si se exceden, puede aplicar el precio estándar de pago por uso. |
| El 15 de julio de 2025 o después y elegible como nuevo cliente | La cuenta puede iniciar en el Free o Paid account plan. El nuevo programa ofrece USD 100 de créditos iniciales y permite ganar hasta USD 100 más al completar actividades elegibles. | El Free account plan termina al agotarse los créditos o al cumplirse seis meses, lo que ocurra primero; si no se actualiza, AWS cierra la cuenta y conserva los datos durante 90 días. Los créditos vencen a los 12 meses de crear la cuenta. En Paid, el uso que exceda los créditos o no sea elegible se cobra a las tarifas estándar. |

Si una cuenta elegible usa el nuevo **Free account plan**, crear o unirse a una organización de AWS actualiza ese plan a **Paid** automáticamente. Al crearla o unirse, los créditos Free Tier vencen de inmediato y la cuenta deja de ser elegible para ganar más créditos. AWS documenta esta condición al [crear una organización desde una cuenta gratuita](https://docs.aws.amazon.com/singlesignon/latest/userguide/enable-identity-center.html) y al [unir una cuenta a una organización](https://aws.amazon.com/free/free-tier-faqs/). No extrapoles esta condición a las cuentas del programa legado. Antes de crear una cuenta para practicar, unirte a una organización o desplegar un servicio, verifica el plan, los créditos, la fecha de vencimiento y los límites aplicables en la consola y en la [guía vigente de AWS Free Tier](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html). Las condiciones se consultaron el **6 de octubre de 2026**.

## Dar acceso a facturación con IAM

Por defecto, usuarios y roles de IAM no acceden a ciertas páginas de Billing and Cost Management, aunque una política IAM les conceda acciones de facturación. Para habilitar esas páginas, el usuario root de la cuenta puede activar **IAM user and role access to Billing information** en la configuración de la cuenta; después, asigna a cada persona o rol solo los permisos que necesita.

En Organizations, las cuentas miembro creadas desde la organización ya tienen este acceso activado por defecto; revisa el estado y actívalo si hace falta en otras cuentas. La opción cubre páginas específicas de la consola, como Bills y Budgets: no habilita automáticamente todos los permisos de Cost Explorer, Cost Anomaly Detection ni sus API. No distribuyas credenciales root para la revisión diaria de costos. Sigue la guía oficial para [habilitar acceso IAM a las páginas de facturación](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/control-access-billing.html), que enumera las páginas controladas por esta opción.

## Seguir aprendiendo con la comunidad

El [directorio de comunidades AWS en Latinoamérica](/comunidades/) permite buscar grupos locales para preguntar cómo otros equipos investigan cargos y organizan sus revisiones. Revisa la actividad y las condiciones de cada grupo antes de sumarte.

Si te interesa escuchar otras experiencias sobre gestión de costos, AWS User Group CreaTicas publicó la grabación [FinOps en acción — Optimización real de costos en la nube](https://www.youtube.com/watch?v=UphnnilH09A). La descripción la presenta como una sesión conjunta sobre FinOps con AWS User Group San José. Puedes seguir el [canal de CreaTicas](https://www.youtube.com/channel/UCLt3Cav92Ej0t_m3mliLGCQ) y su [grupo en Meetup](https://www.meetup.com/chiapa-uk-aws-users-meetup-group/) para encontrar otras sesiones; consulta las fuentes oficiales para los pasos técnicos actuales.

Al momento de revisar esta guía, AWS SBG at the National Autonomous University of Mexico anunció la sesión online **[#CertOps: Clase #9 — Manejo de Cuentas, Facturación y Soporte](https://www.meetup.com/aws-sbg-at-national-autonomous-univ-of-mexico-central-campus/events/316827297/)** para el 17 de octubre de 2026, de 12:00 a 14:00, hora de Ciudad de México. La ficha no especifica si es gratuita ni sus requisitos; consulta la inscripción para confirmar el acceso y la disponibilidad. También puedes visitar el [perfil de la comunidad organizadora](https://www.meetup.com/aws-sbg-at-national-autonomous-univ-of-mexico-central-campus/) o [ver la agenda de eventos AWS](/eventos/) para encontrar otras sesiones.
