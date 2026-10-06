---
title: "Cómo escala DynamoDB y cuándo elegir cada modo de capacidad"
description: "Compara la capacidad bajo demanda y aprovisionada de DynamoDB: RCU y WCU, cálculos, autoescalado, warm throughput, índices y throttling."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T02:56:43.716Z"
modifiedTimestamp: "2026-10-06T11:23:43-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Amazon DynamoDB: qué es, cómo funciona y cuándo usarlo"
    url: "https://dondeaprendoaws.com/blog/amazon-dynamodb-la-base-de-datos-nosql-de-aws/"
  - title: "Amazon DynamoDB para principiantes: claves y consultas"
    url: "https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/"
---

DynamoDB escala las lecturas y escrituras de dos maneras: con **capacidad bajo demanda** (*on-demand*), ajusta automáticamente el throughput según el tráfico; con **capacidad aprovisionada** (*provisioned*), configuras unidades de capacidad y puedes ajustarlas manualmente o con autoescalado. El modo cambia cómo administras y pagas ese throughput, pero no corrige una clave de partición que concentra todas las solicitudes ni elimina las cuotas del servicio.

Como punto de partida, evalúa **on-demand** cuando la carga es nueva o difícil de prever. Evalúa **provisioned** cuando puedes estimar un patrón estable y quieres controlar la capacidad configurada. Ambos modos ofrecen la misma latencia de milisegundos de un dígito, SLA y seguridad documentados por AWS; la diferencia está en la administración y la facturación del throughput, no en una promesa de velocidad de un modo sobre el otro. [AWS compara los modos de capacidad](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html) y describe sus [características de on-demand](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/on-demand-capacity-mode.html) y [provisioned](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html).

| Modo | Qué configuras | Cómo se factura el throughput | Cuándo evaluarlo |
| --- | --- | --- | --- |
| Bajo demanda (*on-demand*) | No defines RCU/WCU iniciales. Puedes fijar un máximo opcional para la tabla o un índice. | Por las unidades de lectura y escritura que consumen las solicitudes. | Tráfico nuevo, variable o difícil de estimar; también cuando prefieres evitar el ajuste manual. |
| Aprovisionado (*provisioned*) | Defines RCU y WCU para la tabla y cada índice secundario global (GSI). Puedes ajustar esos valores a mano o con autoescalado. | Por la capacidad configurada durante el tiempo que permanece asignada, aunque no se consuma por completo. | Carga estable o estimable, cuando medirla y ajustar capacidad resulta conveniente. |

Ninguna fila garantiza el costo menor. El modo cambia la facturación del throughput; almacenamiento, índices, respaldos, clase de tabla, Región y replicación también influyen en el total. Compara la carga medida con los [precios actuales de DynamoDB](https://aws.amazon.com/dynamodb/pricing/) antes de comprometerte con una estimación.

## Qué significa escalar una tabla

Escalar es atender más operaciones por segundo y el tamaño de los datos que esas operaciones leen o escriben. La demanda no se expresa solo en “usuarios”: una lectura eventual, una lectura fuerte y una transacción consumen cantidades distintas; un elemento grande consume más unidades que uno pequeño.

En provisioned, las unidades de capacidad son **RCU** (lectura) y **WCU** (escritura). En on-demand, AWS mide las solicitudes en **RRU** (unidades de solicitud de lectura) y **WRU** (unidades de solicitud de escritura). El modo de capacidad cambia la forma de cobrar y administrar esa demanda; el tamaño, la frecuencia y el tipo de operación determinan cuántas unidades requiere.

AWS usa unidades binarias: 1 KB equivale a 1.024 bytes. Para una lectura individual de un elemento de hasta 4 KB, una lectura fuertemente consistente consume 1 unidad; una lectura eventualmente consistente, 0,5; y una lectura transaccional, 2. Para una escritura de hasta 1 KB, una escritura normal consume 1 unidad y una escritura transaccional, 2. Los tamaños se redondean hacia arriba en bloques de 4 KB para lecturas y de 1 KB para escrituras. [La referencia de AWS detalla el consumo por operación, incluidos `Query`, `Scan` y transacciones](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html).

Usa el tamaño que DynamoDB calcula para el elemento: incluye los nombres y valores de los atributos según las reglas del servicio, no solo el valor principal ni el JSON de la solicitud. [AWS explica cómo estimar el tamaño de los elementos](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/CapacityUnitCalculations.html).

Estos cálculos muestran una tasa sostenida para **la tabla base**. Un GSI tiene su propio consumo y capacidad; sus lecturas son eventualmente consistentes. Una consulta que lee varios elementos, un `Scan`, una transacción con varios elementos o una solicitud que actualiza índices necesita un cálculo acorde a esa operación, no una multiplicación automática del tamaño de un ítem.

### Ejemplo: lecturas individuales

Supongamos 120 lecturas individuales por segundo de elementos de 3,5 KB en la tabla base:

- Si la aplicación usa `GetItem` con lecturas fuertes, cada lectura redondea a 4 KB y consume 1 RCU. La tabla necesita **120 RCU** para esa tasa.
- Si usa `GetItem` con lecturas eventuales, cada lectura consume 0,5 RCU. La tabla necesita **60 RCU**.
- Si hace 120 operaciones `TransactGetItems` por segundo, cada una con una lectura de un elemento de 3,5 KB, consume 2 RCU por operación: **240 RCU**. `GetItem` no es una lectura transaccional.

El mismo principio aplica al cálculo en on-demand, aunque se factura por las unidades de solicitud efectivamente usadas. El ejemplo supone que cada solicitud recupera un único elemento y que el tráfico se distribuye entre las claves; no incluye capacidad de índices ni margen para picos.

### Ejemplo: escrituras y transacciones

Supongamos 75 escrituras por segundo de elementos de 1,6 KB en la tabla base:

- Una escritura normal redondea a 2 KB y consume 2 WCU: **75 × 2 = 150 WCU**.
- Si cada escritura es una acción de `TransactWriteItems`, consume 2 WCU por cada bloque de 1 KB: 4 WCU por elemento, o **75 × 4 = 300 WCU**.

Una condición que hace cancelar una transacción no vuelve gratuitas las unidades ya consumidas. Si la misma escritura actualiza un GSI, suma también la capacidad necesaria para la entrada que cambia en ese índice; se calcula por el tamaño de la entrada proyectada del índice, que puede diferir del elemento completo de la tabla.

Para ver DynamoDB dentro de un flujo de aplicación, el [meetup del AWS User Group Panamá sobre DynamoDB 101 y Step Functions](https://www.youtube.com/watch?v=5Dmamlu1f9I) muestra ambos servicios en sesiones de comunidad. Para practicar llamadas sin desplegar recursos en AWS, la [guía con Docker y DynamoDB Local](https://blog.295devops.com/de-lo-local-se-aprende-desplegando-tu-primera-app-con-docker-y-dynamodb-local) ofrece un ejercicio en español. Ese entorno sirve para practicar el modelo y las llamadas; no valida cuotas, particiones, throttling, latencia, IAM, replicación ni costos del servicio real.

## Capacidad bajo demanda: automática, con cuotas y límites

On-demand factura las unidades de solicitud utilizadas y ajusta el throughput automáticamente según la actividad. No tienes que calcular una capacidad inicial en RCU/WCU ni pagar throughput aprovisionado cuando la tabla no recibe solicitudes. Eso reduce la planificación inicial, aunque conviene vigilar el consumo para entender y controlar la factura.

Una tabla on-demand nueva tiene un *warm throughput* inicial documentado de **12.000 unidades de lectura y 4.000 de escritura por segundo**. La tabla puede atender de inmediato hasta el doble de su pico de tráfico anterior. Si necesita superar ese doble dentro de los 30 minutos desde el pico, AWS advierte que puede haber *throttling*: solicitudes limitadas o rechazadas cuando se supera el throughput disponible. Para un salto mayor, consulta la guía de [throughput cálido y escalado](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/warm-throughput-scenarios.html) y revisa el warm throughput actual de la tabla y sus índices.

Los valores disponibles por defecto y los que se ajustan con el uso no tienen costo adicional. Aumentar el warm throughput de forma proactiva sí tiene un cargo único regional y el valor no puede reducirse después. Evalúa ese precalentamiento frente al pico planificado antes de solicitarlo. [AWS explica el warm throughput y su costo](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/warm-throughput.html) y los detalla en su [página de precios](https://aws.amazon.com/dynamodb/pricing/). Estos valores describen el comportamiento documentado de throughput; no son una promesa de capacidad total para cualquier clave o cuenta.

Como material complementario, AWS Women Colombia publicó la charla [DynamoDB: The NoSQL DB, nivel 200](https://www.youtube.com/watch?v=TWFSdMqCFWo), una conversación técnica de comunidad sobre el servicio. Para los límites, sigue usando la documentación de AWS citada aquí.

También se aplican cuotas por tabla e índice. La cuota predeterminada publicada para on-demand es de **40.000 RRU y 40.000 WRU por tabla o GSI, por Región**; es ajustable mediante Service Quotas. En provisioned, los valores iniciales publicados son **40.000 RCU/WCU por tabla o GSI** y **80.000 RCU/WCU por cuenta y Región** para la suma de recursos aprovisionados. Consulta las [cuotas vigentes de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotas.html); los valores y las condiciones pueden cambiar.

Puedes configurar además un máximo opcional de lectura o escritura en on-demand para controlar uso y costo. Ese máximo es una referencia de mejor esfuerzo, no un techo exacto: DynamoDB puede superar el valor temporalmente cuando usa capacidad de ráfaga. Si necesitas acotar gasto, no trates el máximo como garantía de un corte instantáneo. Revisa las opciones de [throughput máximo en on-demand](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/on-demand-capacity-mode-max-throughput.html).

## Capacidad aprovisionada y autoescalado

En provisioned defines cuántas lecturas y escrituras por segundo puede atender cada tabla y GSI. DynamoDB cobra la capacidad configurada por hora, aunque el consumo real sea menor. Un pico por encima de esa capacidad puede producir throttling antes de que la aplicación consiga aumentar el valor.

El autoescalado permite establecer mínimos, máximos y una utilización objetivo para la tabla y sus índices. Application Auto Scaling observa métricas de CloudWatch y ajusta la capacidad cuando se cumplen sus umbrales. No responde instantáneamente: AWS indica que la alarma se activa tras dos minutos consecutivos sobre el objetivo y puede demorarse unos minutos; una vez iniciada, la actualización de capacidad también tarda minutos. Conserva margen para el tráfico esperado y no confíes en el autoescalado como única defensa ante un pico brusco. [AWS explica la configuración y el retraso de autoescalado](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html) y publica las [métricas de DynamoDB para CloudWatch](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/metrics-dimensions.html).

El *warm throughput* representa el nivel que el recurso puede atender de inmediato a partir de su configuración e historial. En una tabla provisioned, AWS permite elevar la capacidad configurada de inmediato hasta su throughput cálido; en una tabla on-demand nueva, el nivel inicial está documentado arriba. Al planificar una campaña, una importación o el lanzamiento de una función, revisa el valor del recurso y sus índices con anticipación. El throughput cálido no elimina el límite de una partición con tráfico concentrado.

## La distribución de claves puede limitar ambos modos

DynamoDB reparte datos y solicitudes según la clave de partición. Si muchas operaciones caen en el mismo valor, una partición puede saturarse aunque la tabla todavía tenga capacidad disponible. AWS diseña cada partición para hasta 3.000 unidades de lectura y 1.000 de escritura por segundo; los tamaños mayores consumen varias unidades por operación. La capacidad adaptativa ayuda en algunos patrones, pero no convierte una clave caliente en capacidad ilimitada. [Revisa las prácticas de diseño de claves de partición](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html).

Por ejemplo, 4.000 lecturas fuertes por segundo de elementos de 3 KB dirigidas a una sola partición consumen 4.000 unidades de lectura por segundo: cada operación ocupa un bloque de hasta 4 KB. Esa carga supera el diseño documentado de 3.000 unidades por partición, aunque la suma de la tabla permita 4.000 o más. La misma tasa con lecturas eventuales consumiría 2.000 unidades, pero igual debes comprobar que la actividad esté bien distribuida y no se concentre en una partición del índice.

Si aparece este patrón, aumentar la capacidad total puede no resolverlo. Revisa la cardinalidad y distribución de la clave, considera dividir escrituras con *write sharding* cuando el modelo lo permita y comprueba también las claves de cada GSI.

Para comparar modelos de acceso con ejemplos en español, el [AWS User Group Córdoba Meetup #18](https://www.youtube.com/watch?v=7Xk0MKt69Is) incluye una charla sobre datos en DynamoDB y OpenSearch. También puedes ver [DynamoDB 101: ¿Dónde está mi JOIN?](https://www.youtube.com/watch?v=kttKpUpyAH4), del AWS User Group Ecuador, que ayuda a entender cómo el modelo de consultas de DynamoDB difiere del relacional. Son perspectivas de comunidad sobre diseño; no fuentes para verificar cuotas o límites vigentes.

## Los GSI tienen capacidad y throttling propios

La tabla base y sus GSI comparten el mismo modo de facturación: no puedes elegir on-demand para la tabla y provisioned para uno de sus índices. Sí configuras capacidad RCU/WCU propia para cada GSI en provisioned, y puedes establecer máximos on-demand distintos para la tabla y cada GSI.

Un GSI mantiene otra vista de los elementos para habilitar un patrón de consulta distinto. Sus claves, atributos proyectados y volumen de lecturas y escrituras determinan su propio throughput. Al escribir en la tabla base, DynamoDB también actualiza los índices afectados. En provisioned, un GSI sin WCU suficiente puede limitar escrituras de la tabla; en on-demand, una cuota o un máximo del GSI puede causar throttling. [AWS describe el consumo y los límites de escritura de GSI](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html).

Para empezar con los conceptos del servicio, puedes consultar las grabaciones [La Amenaza del Nivel 100: Amazon DynamoDB](https://www.youtube.com/watch?v=9-HZPX8U5OY), de AWS Women Colombia, y [Introducción a AWS DynamoDB](https://www.youtube.com/watch?v=ybG2Qnucmts), de Charlas Técnicas de AWS. Las cuotas y el comportamiento de scaling cambian; contrasta cualquier número con la documentación oficial enlazada en esta guía.

Al estimar capacidad, anota por separado la tasa y tamaño de operaciones de la tabla y de cada índice. Si recibes throttling, consulta la lista `ThrottlingReasons` de la excepción. Cada entrada incluye `reason`, con el motivo, y `resource`, con el ARN de la tabla o índice afectado.

En CloudWatch, compara `ThrottledRequests` con métricas específicas del motivo: `ReadKeyRangeThroughputThrottleEvents`, `ReadProvisionedThroughputThrottleEvents`, `ReadAccountLimitThrottleEvents` o `ReadMaxOnDemandThroughputThrottleEvents`, y sus equivalentes de escritura. Incluye la dimensión del GSI cuando corresponda. AWS agrupa las causas en rango de clave/partición, capacidad provisioned, cuota o máximo on-demand; cada causa requiere una corrección distinta. La [guía de diagnóstico de throttling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/throttling-diagnosing-workflow.html) muestra ejemplos de excepciones y las métricas correspondientes.

## Cambiar de modo y tomar una decisión con métricas

Puedes cambiar una tabla de provisioned a on-demand hasta cuatro veces en una ventana móvil de 24 horas. De on-demand a provisioned puedes cambiar en cualquier momento. Un cambio puede tomar varios minutos; al regresar a provisioned, usa las métricas de consumo de lecturas y escrituras para definir una capacidad inicial, y deja margen para la variación real. [AWS describe las condiciones del cambio de modo](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-switching-capacity-modes.html).

Antes de elegir o cambiar, reúne estos datos:

1. Operaciones por segundo: lecturas, escrituras, transacciones y consultas.
2. Tamaño de los elementos y consistencia requerida para cada tipo de lectura.
3. Distribución de las claves, no solo el promedio total de la tabla.
4. Consumo y throttling de la tabla y de cada GSI durante períodos normales y picos.
5. Costo total estimado en la Región, incluidos almacenamiento, índices, respaldos y replicación.

On-demand puede ser un buen inicio cuando todavía no conoces el patrón de tráfico. Provisioned puede convenir cuando observas una carga estable, puedes definir los mínimos y máximos y la comparación de precios favorece esa operación. Revalida con datos: un patrón predecible no basta si sus claves se concentran o si los índices reciben una carga distinta.

## Preguntas frecuentes

### ¿On-demand evita cualquier throttling?

No. El modo elimina la gestión de capacidad aprovisionada, pero siguen aplicando el throughput cálido, cuotas por tabla e índice, máximos configurados y límites de partición. Un pico repentino o una clave caliente todavía puede provocar throttling.

### ¿Provisioned tiene menor latencia que on-demand?

AWS documenta la misma latencia de milisegundos de un dígito, SLA y seguridad para ambos modos. Elige por carga, operación y costo medido; el modo por sí solo no promete una respuesta más rápida.

### ¿Autoescalado significa que nunca falta capacidad?

No. El autoescalado necesita métricas y tiempo para cambiar los valores. Para picos conocidos, define capacidad y throughput cálido con anticipación, y revisa que la distribución de claves y los índices soporten la carga.

### ¿Por dónde sigo aprendiendo DynamoDB?

Para entender tablas, claves y consultas, consulta [Amazon DynamoDB: qué es, cómo funciona y cuándo usarlo](/blog/amazon-dynamodb-la-base-de-datos-nosql-de-aws/) y la [guía de claves y consultas para principiantes](/blog/amazon-dynamodb-guia-basica/). Para medir comportamiento de producción, usa primero la documentación oficial enlazada en cada sección y tus métricas de CloudWatch.

## Comunidades y eventos para seguir aprendiendo

Si quieres hacer preguntas o participar, el [directorio de comunidades AWS por país y tipo](/comunidades/) incluye grupos generales y estudiantiles. Puedes empezar por [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) o [AWS User Group Panamá](https://www.meetup.com/AWS-User-Group-Panama/), ambos espacios generales para aprender y compartir experiencias. [AWS Women Colombia](https://awswomencolombia.com/) publica encuentros y material en español; para conversaciones sobre arquitecturas serverless, está [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/).

La [agenda de eventos AWS](/eventos/) reúne actividades publicadas por comunidades. Confirma en cada ficha la fecha, modalidad e inscripción, porque cambian.
