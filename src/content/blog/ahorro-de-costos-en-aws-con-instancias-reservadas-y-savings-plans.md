---
title: "Instancias Reservadas o Savings Plans en AWS: diferencias y riesgos"
description: "Compara las Instancias Reservadas de EC2 y los Savings Plans de cómputo, SageMaker y bases de datos: compromisos, alcance, descuentos y riesgo de subutilización."
author: "guille-ojeda"
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T14:42:01.539Z"
modifiedTimestamp: "2026-10-05T00:15:07-03:00"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Cómo usar AWS Cost Explorer: filtros y costos que no aparecen"
    url: "https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/"
  - title: "Cómo reducir costos en AWS: 10 estrategias para optimizar tu factura"
    url: "https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/"

---

Una **Instancia Reservada (RI) de EC2** da un descuento cuando el uso coincide con los atributos de la reserva. Según su alcance, una RI zonal también reserva capacidad en una zona de disponibilidad; una RI regional da descuento en la región, pero no reserva capacidad. Un **Savings Plan** aplica tarifas reducidas al uso elegible a cambio de un compromiso de gasto por hora. No reserva capacidad y su alcance depende del tipo de plan.

La decisión empieza por dos preguntas: ¿necesitas garantizar capacidad de EC2 en una zona?, ¿qué parte de tu uso elegible se mantendrá estable durante el plazo? Si el uso cambia, se migra o se apaga, un compromiso que no llegue a aplicarse puede seguir cobrándose. Ningún porcentaje “hasta” garantiza el ahorro de una cuenta concreta. Antes de evaluar descuentos, conviene revisar gasto evitable, recursos ociosos y tamaño; la guía [Cómo reducir costos en AWS: 10 estrategias para optimizar tu factura](/blog/10-estrategias-de-optimizacion-de-costos-en-aws/) ordena ese diagnóstico.

## Comparación rápida

| Criterio | RI de Amazon EC2 | Savings Plans |
| --- | --- | --- |
| Compromiso | Atributos de EC2; uno o tres años. | Gasto elegible en USD por hora; uno o tres años (Database, uno). |
| Capacidad | La zonal reserva una zona; la regional solo da descuento. | No reserva capacidad; la reserva de capacidad de EC2 es independiente. |
| Flexibilidad | Depende del alcance y la clase Standard o Convertible. | Depende del tipo: cómputo amplio, familia/región EC2 u otro uso elegible. |
| Pago | Total, parcial o sin adelanto. | Las tres opciones, salvo Database: sin adelanto. |

Las condiciones completas dependen del producto y de la tarifa vigente. La guía de [RI de EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-reserved-instances.html), sus [alcances regional y zonal](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/reserved-instances-scope.html), las [clases Standard y Convertible](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/reserved-instances-types.html) y los [tipos de Savings Plans](https://docs.aws.amazon.com/savingsplans/latest/userguide/plan-types.html) detallan los límites.

## Qué significa comprometerse

Una RI de EC2 no es una máquina virtual ni necesariamente una reserva de capacidad: es un beneficio de facturación para instancias en uso que coinciden con sus atributos. En una RI regional, el descuento puede aplicarse a instancias elegibles en cualquier zona de disponibilidad de la región. La flexibilidad de tamaño depende de atributos admitidos, como familia, plataforma y tenencia; no se debe asumir que toda RI regional admite cualquier tamaño. Una RI zonal se limita a la zona y configuración elegidas, y reserva capacidad allí para la cuenta propietaria.

Las clases **Standard** y **Convertible** describen cuánto se puede cambiar la reserva, no si hay capacidad. Una Standard no se puede intercambiar, aunque sí admite algunas modificaciones con restricciones. Una Convertible puede intercambiarse manualmente por otra Convertible con atributos distintos, bajo las condiciones de EC2. La compra no se puede cancelar; además, tanto la RI Standard como la Convertible se cobran por el plazo incluso si el uso no coincide. Algunas RI Standard que cumplen las reglas de AWS pueden venderse en el [Reserved Instance Marketplace](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ri-market-general.html); las Convertible no se venden allí. Una venta no es una cancelación ni un reembolso garantizado. Consulta las reglas de [modificación de RI](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ri-modifying.html) antes de asumir que un cambio será posible.

En un Savings Plan, el compromiso es un gasto por hora, no una reserva de instancia. AWS aplica su tarifa a uso elegible hasta cubrir ese compromiso; el uso elegible que lo supere se cobra a On-Demand. El compromiso no usado no se convierte en saldo para otro período. Salvo por una devolución limitada que AWS permite para ciertos planes —compromiso de hasta USD 100 por hora, dentro de los siete días posteriores a la compra y del mismo mes natural, sujeto al límite de devoluciones—, no se pueden cancelar durante el plazo. Revisa las [condiciones de devolución](https://docs.aws.amazon.com/savingsplans/latest/userguide/return-sp.html) antes de confiar en esa excepción. Para EC2, además, el uso ya cubierto por una RI no recibe otro descuento de Savings Plans.

### Ejemplo hipotético de subutilización

Supongamos que eliges un Savings Plan con un compromiso de **USD 1 por hora** y analizas un período hipotético de **730 horas**. El compromiso suma USD 730. Si durante cada hora solo se aplican USD 0,70 de uso elegible a tarifas del plan, la utilización es 70%: se aplican USD 511 y los USD 219 restantes corresponden a compromiso no aprovechado, pero siguen siendo parte del pago. Si el uso elegible supera USD 1 por hora, el excedente se factura a On-Demand. Son cifras ilustrativas, no una estimación de precios ni de ahorros.

El mismo riesgo de pagar sin uso coincidente existe con una RI, aunque allí el descuento depende de atributos de instancia y alcance. En ambos casos, una carga que se apaga, cambia de familia, se mueve de región o desaparece puede dejar parte del compromiso sin aplicación.

## Tipos de Savings Plans y servicios elegibles

AWS ofrece cuatro tipos de Savings Plans. No tienen el mismo alcance:

- **Compute Savings Plans**: cubren uso elegible de EC2, AWS Fargate y AWS Lambda. Para EC2, la tarifa puede seguir aplicándose al cambiar familia, tamaño, sistema operativo, tenencia o región.
- **EC2 Instance Savings Plans**: se limitan a una familia de instancias en una región elegida. Permiten variar tamaño, sistema operativo y tenencia dentro de ese alcance.
- **SageMaker AI Savings Plans**: aplican a uso elegible de instancias de machine learning en SageMaker AI. El alcance admite cambios de familia, tamaño, componente y región según las reglas del plan.
- **Database Savings Plans**: AWS los lanzó en diciembre de 2025. Cubren uso elegible en varios servicios de bases de datos, entre ellos Aurora, RDS y DynamoDB, y también otros como ElastiCache, DocumentDB y OpenSearch. El compromiso es por un año y la opción estándar es sin pago inicial. El gasto elegible puede cambiar entre servicios y regiones soportadas, pero AWS limita la cobertura por servicio y tipo de uso; su FAQ actual especifica generación 7 o posterior para instancias provisionadas elegibles y describe aparte ofertas serverless y de throughput para DynamoDB y Keyspaces. Revisa la [FAQ y matriz vigentes](https://aws.amazon.com/savingsplans/faqs/) antes de proyectar cobertura.

Database Savings Plans amplían la comparación: “Savings Plans” ya no significa solo descuentos de cómputo. En cambio, **DynamoDB Reserved Capacity** y un Database Savings Plan son ofertas distintas. AWS indica que no se combinan sobre la misma carga; se pueden aplicar a cargas diferentes si cada una cumple sus requisitos. También hay condiciones de elegibilidad por servicio: por ejemplo, para RDS for SQL Server, Database Savings Plans descuentan el precio de la instancia, mientras las licencias de Windows Server y SQL Server se cobran aparte. Consulta las tarifas de [Database Savings Plans](https://aws.amazon.com/savingsplans/database-pricing/) y los [precios de DynamoDB](https://aws.amazon.com/dynamodb/pricing/) para el modo de capacidad que uses. Si vas a evaluar el costo desde la capacidad de lectura y escritura, la guía [Amazon DynamoDB para principiantes: claves y consultas](/blog/amazon-dynamodb-guia-basica/) explica cómo difieren los modos bajo demanda y aprovisionado.

## Cómo leer los descuentos “hasta”

Los porcentajes publicados son máximos frente a precios On-Demand en configuraciones elegibles; no son un descuento fijo sobre toda la factura. Como referencia, AWS publica hasta 72% para RI Standard de EC2 y EC2 Instance Savings Plans, hasta 66% para RI Convertible y Compute Savings Plans, y hasta 64% para SageMaker AI Savings Plans. Database Savings Plans publica hasta 35%, pero ese máximo cambia por servicio y tipo de uso: AWS especifica hasta 35% para ciertos usos serverless, hasta 20% para instancias provisionadas y, para DynamoDB y Keyspaces, hasta 18% en throughput bajo demanda o hasta 12% en capacidad provisionada.

La tarifa real depende del producto, los atributos del uso, la región, el plazo y la opción de pago. Para comparar dos alternativas, calcula el precio para la misma carga, región, plazo y forma de pago, y revisa qué componentes quedan fuera. El porcentaje máximo no permite inferir cuánto bajará tu factura mensual.

## Cobertura, utilización y cuentas vinculadas

Cost Explorer ofrece informes de **cobertura** y **utilización** para RI y Savings Plans, pero sus unidades no son idénticas. En los informes de RI de EC2, AWS expresa cobertura y utilización en horas de instancia o unidades normalizadas; la utilización muestra qué parte de las horas compradas se usó. Para Savings Plans, la cobertura mide la proporción del costo elegible equivalente a On-Demand cubierta por el plan, mientras que la utilización indica qué parte del compromiso horario se aplicó. Una cobertura baja puede indicar que queda uso elegible facturado a On-Demand; una utilización baja puede indicar que el compromiso supera el uso que lo consume. Revisa ambas métricas con filtros y períodos que representen tu carga. AWS explica los [informes de RI](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-default-reports.html), [cobertura de Savings Plans](https://docs.aws.amazon.com/savingsplans/latest/userguide/ce-sp-cr-metrics.html) y [utilización de Savings Plans](https://docs.aws.amazon.com/savingsplans/latest/userguide/ce-sp-usingPR.html).

AWS Cost Explorer y Purchase Analyzer permiten analizar recomendaciones y escenarios de compra a partir del uso histórico. El análisis no pronostica migraciones, cambios de producto, estacionalidad ni cargas que todavía no existen. Complétalo con esos cambios esperados antes de tomar una decisión. Puedes empezar por el [análisis de Savings Plans](https://docs.aws.amazon.com/savingsplans/latest/userguide/sp-purchase-analysis.html) y por [Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html). Si necesitas revisar los informes históricos antes de ese análisis, consulta la [guía de Cost Explorer de este blog](/blog/analisis-de-costos-de-aws-con-cost-explorer/).

En una organización con facturación consolidada, los beneficios de RI y Savings Plans pueden compartirse entre cuentas vinculadas si la configuración de AWS Organizations y las preferencias de uso compartido lo permiten. El equipo que administra la factura puede restringirlos o agrupar cuentas para distribuir descuentos. Verifica esas preferencias y qué cuenta compra el compromiso: no supongas que el beneficio llegará a todas las cuentas. Las RIs zonales reservan capacidad solo para la cuenta propietaria, aunque el descuento de facturación pueda seguir las reglas de uso compartido. AWS detalla las [preferencias para compartir descuentos de RI y Savings Plans](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/ri-turn-off.html) y cómo se [aplican los descuentos de RI](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/apply_ri.html).

## Un orden para evaluar opciones

1. **Identifica el gasto elegible.** Separa EC2, Fargate, Lambda, SageMaker y bases de datos; dentro de EC2, distingue horas On-Demand de uso Spot o ya cubierto por RI. Revisa región, familia, sistema operativo, tenencia y modo de uso.
2. **Entiende el patrón de demanda.** Busca un nivel base que se mantenga, además de picos, ambientes temporales, horarios de apagado, migraciones y fechas de retiro. Etiquetar gastos por aplicación o equipo puede facilitar este análisis; el artículo en español de Kevin Lupera sobre [etiquetas para optimización de costos](https://dev.to/aws-builders/aws-cost-optimization-por-que-las-tags-son-tu-mejor-aliado-1h8j) es una lectura complementaria. Para escuchar otra voz y formato sobre FinOps, el episodio 5.18 de *Charlas Técnicas de AWS* se titula [“FinOps, o cómo ahorrar en la nube”](https://www.youtube.com/watch?v=3XJEQebQEYU), publicado por Marcia en Desplegando Cloud.
3. **Separa descuento de capacidad.** Si el requisito es asegurar disponibilidad de EC2 en una zona, una RI zonal o una On-Demand Capacity Reservation pueden ser relevantes por razones distintas. Una tarifa reducida no garantiza que AWS tenga capacidad disponible.
4. **Compara escenarios completos.** Contrasta los precios de RI y Savings Plans contra el uso elegible esperado, sus tarifas actuales, el compromiso total, pagos iniciales, uso fuera de cobertura y consecuencias de subutilización. No elijas solo por el porcentaje “hasta”.
5. **Sigue cobertura y utilización.** Después de cualquier decisión, monitorea si queda gasto elegible a On-Demand y si el compromiso se está consumiendo como esperabas. Las recomendaciones de AWS sirven como insumo basado en historial, no como garantía de ahorro futuro.

## Recursos de FinOps, comunidades y eventos

Para una conversación de comunidad sobre costos, el canal del **AWS User Group CreaTicas** publicó la grabación [“FinOps en acción — Optimización real de costos en la nube”](https://www.youtube.com/watch?v=UphnnilH09A). También puedes buscar grupos por país en el [directorio de comunidades AWS](/comunidades/) y revisar la [agenda de eventos](/eventos/). Al consultar esa agenda el 4 de octubre de 2026, figuraba el encuentro virtual [“EC2 vs Lambda”](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/), organizado por AWS User Group Tlaxcala para el 16 de octubre de 2026, de 16:00 a 17:00 UTC−06; su ficha describe una comparación de costos además de ventajas de ambas opciones. Confirma fecha, horario y disponibilidad de inscripción en Meetup porque esos datos pueden cambiar.

## Preguntas frecuentes

### ¿Una Instancia Reservada de EC2 siempre reserva capacidad?

No. Una RI regional ofrece descuento en una región, pero no reserva capacidad. Una RI zonal sí reserva capacidad en la zona de disponibilidad seleccionada, además de ofrecer el descuento correspondiente. La capacidad zonal queda para la cuenta propietaria.

### ¿Un Savings Plan garantiza capacidad o descuenta cualquier servicio de AWS?

No. Un Savings Plan no reserva capacidad y cubre solo usos admitidos por su tipo. Compute Savings Plans aplican a EC2, Fargate y Lambda; EC2 Instance Savings Plans a una familia de EC2 en una región; SageMaker AI Savings Plans a uso de ML elegible; Database Savings Plans a ciertos usos de bases de datos. Para capacidad de EC2, se evalúa por separado una On-Demand Capacity Reservation.

### ¿Qué pasa si uso menos de lo que comprometí?

El compromiso sigue cobrándose durante el plazo y la parte que no se aplicó queda subutilizada. Por eso una recomendación calculada sobre meses anteriores debe revisarse frente a cambios de demanda, migraciones, cierre de ambientes y vencimientos.

### ¿Savings Plans y RI pueden aplicarse a la misma carga?

En EC2, AWS aplica primero las RI y no aplica Savings Plans a uso ya cubierto por RI. Para bases de datos, un Database Savings Plan no se puede combinar con una RI de RDS ni con DynamoDB Reserved Capacity en la misma carga. Sí pueden cubrir cargas distintas si cada compromiso es elegible.
