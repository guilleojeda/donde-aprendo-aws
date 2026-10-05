---
title: "Arquitectura multi-región en AWS: cuándo conviene"
description: "Compara Multi-AZ y Multi-Region, define RTO y RPO, y evalúa replicación, failover, failback y costos antes de desplegar en varias regiones de AWS."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T00:52:38.092Z"
modifiedTimestamp: "2026-10-05T00:26:22-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/bafde793116d5b5e38a659da.jpg"
coverAlt: "Globo terráqueo con líneas de conexión y nubes alrededor"
ogImage: "/assets/blog/bafde793116d5b5e38a659da.jpg"
related:
  - title: "Alta disponibilidad en AWS: arquitectura Multi-AZ para una app web"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/"
    image: "/assets/blog/1b184fe1242c3e7fb970e984.jpg"
    imageAlt: "Varias nubes y círculos con un ojo conectados sobre un mapa esquemático"
---

Una arquitectura multi-región en AWS tiene sentido cuando una aplicación debe recuperarse de una interrupción regional, sus objetivos de recuperación no se alcanzan en una sola región o necesita atender usuarios desde varias ubicaciones. Si el riesgo que quieres cubrir es la falla de una zona de disponibilidad, una arquitectura Multi-AZ puede ser suficiente y más simple de operar.

Tener recursos en dos regiones no garantiza por sí solo continuidad, baja latencia, cero pérdida de datos ni cumplimiento normativo. Debes duplicar y probar la aplicación, definir cómo se replican sus datos y decidir qué hacer con el tráfico y las escrituras durante una interrupción. La guía de [AWS sobre resiliencia en una sola región](https://docs.aws.amazon.com/prescriptive-guidance/latest/aws-multi-region-fundamentals/single-region-resilience.html) recomienda evaluar primero si una región con varias zonas puede cubrir las necesidades de la carga.

## Multi-AZ y multi-región resuelven fallas distintas

Una **zona de disponibilidad** (AZ) es una ubicación aislada dentro de una región. Una arquitectura **Multi-AZ** distribuye componentes en varias zonas de esa misma región para mantener la carga ante una falla de zona. Una arquitectura **multi-región** despliega componentes en regiones geográficamente separadas para poder atender o recuperar la carga si una región queda afectada.

| Diseño | Alcance de la falla | Cuándo evaluarlo |
| --- | --- | --- |
| Multi-AZ, una región | Falla de una AZ o de componentes dentro de la región | Cuando el objetivo es mantener el servicio ante una falla zonal. Revisa si el servicio administrado necesita habilitar una opción Multi-AZ. |
| Multi-región | Interrupción regional, necesidad de recuperación en otra región o una carga distribuida geográficamente | Cuando los objetivos de continuidad, ubicación de datos o experiencia de usuarios justifican duplicar infraestructura y operar más de una región. |

AWS advierte que Multi-Region requiere componentes y datos separados en cada región. Las dependencias entre regiones pueden debilitar la resiliencia: si la aplicación de una región necesita una base de datos o servicio que solo está en otra, esa dependencia puede convertirse en un punto de falla. Consulta las recomendaciones de [despliegue en varias ubicaciones del pilar de fiabilidad](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html). Para una explicación más detallada del alcance zonal, sigue con nuestra guía de [alta disponibilidad en AWS](https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/). También puedes abrir la grabación titulada [Diseñando arquitecturas resilientes en AWS](https://www.youtube.com/watch?v=sEr65Cgskkc), publicada por AWS UG Ecuador.

## Cuándo justificar una segunda región

Antes de escoger regiones o servicios, responde estas preguntas con las personas responsables del negocio y de los datos:

1. **¿Qué interrupción debe tolerar la carga?** Si el objetivo cubre una AZ, empieza por Multi-AZ y respaldos probados. Si también cubre la pérdida o indisponibilidad de una región, evalúa recuperación entre regiones.
2. **¿Cuánto tiempo puede estar caída y cuántos datos se pueden perder?** Define el objetivo de tiempo de recuperación (**RTO**) y el objetivo de punto de recuperación (**RPO**) para cada carga. El RTO es el máximo tiempo aceptable hasta recuperar el servicio. El RPO expresa la pérdida de datos aceptable como un intervalo: por ejemplo, un RPO de cinco minutos significa que el punto recuperable no debería quedar más de cinco minutos antes del incidente.
3. **¿Hay una necesidad geográfica que no resuelve una CDN?** Acercar cómputo a usuarios puede ayudar con solicitudes dinámicas, pero para contenido cacheable [CloudFront puede servir respuestas que ya están en caché desde ubicaciones de borde](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ConfiguringCaching.html) sin duplicar toda la aplicación.
4. **¿Dónde pueden residir y procesarse los datos?** Una región cercana no demuestra cumplimiento por sí sola. Revisa las reglas aplicables y el comportamiento de replicación de cada servicio; una réplica en otra región puede cruzar límites de residencia que tu organización debe respetar.
5. **¿Están disponibles los servicios y capacidades necesarios?** Comprueba la [disponibilidad regional de servicios de AWS](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/) y las restricciones de cada servicio antes de diseñar la réplica.

Si ninguna de estas respuestas exige más de una región, no agregues una segunda solo por usar una arquitectura que parece más resistente. Una solución multi-región incompleta o dependiente de componentes remotos puede ser menos fiable que una solución Multi-AZ bien probada.

## Elige el patrón de recuperación a partir de RTO y RPO

Los cuatro patrones de recuperación regional difieren en cuánto permanece desplegado y encendido en la región secundaria. Como referencia para un stack completo de aplicación y base de datos, AWS Prescriptive Guidance describe objetivos típicos desde horas para backup y restore hasta minutos para warm standby. Son referencias de diseño, no resultados garantizados por elegir un nombre de patrón: mide tu carga y prueba que cumple el objetivo acordado.

| Estrategia | Qué mantiene la región secundaria | Perfil orientativo y costo relativo |
| --- | --- | --- |
| **Backup y restauración** (pasivo) | Respaldos y los datos necesarios para reconstruir el entorno. La infraestructura se crea y los datos se restauran al recuperarse. | Puede ajustarse a RPO y RTO de horas; suele ser la opción de menor costo continuo, con una recuperación más lenta. |
| **Pilot light** (pasivo) | Componentes centrales y replicación de datos activos; se encienden o amplían otros recursos al declarar una recuperación. | AWS usa decenas de minutos como referencia para RPO y RTO. Requiere que las tareas de activación, cuotas y despliegue estén listas. |
| **Warm standby** (pasivo) | Una copia funcional y de menor capacidad que ya puede atender tráfico. Se amplía durante la recuperación. | La guía usa minutos como referencia de RPO y RTO. Cuesta más que pilot light y puede requerir escalar capacidad antes de soportar toda la carga. |
| **Multi-site activo/activo** | Las regiones desplegadas atienden tráfico al mismo tiempo. | Puede acercarse a RTO y RPO cero con decisiones compatibles de datos y capacidad, pero es el patrón más costoso y complejo. La replicación asíncrona, los conflictos o la corrupción de datos aún pueden requerir recuperación desde respaldos. |

La comparación y esos rangos aparecen en la guía de AWS sobre [cómo definir una estrategia de recuperación](https://docs.aws.amazon.com/prescriptive-guidance/latest/strategy-database-disaster-recovery/defining.html) y en sus [opciones de recuperación ante desastres](https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html). La tabla de AWS se refiere al stack completo, no solo a la base de datos. En cualquier patrón, ensaya el procedimiento y mide el RTO y el RPO reales; un respaldo que nunca se restauró o una región secundaria sin capacidad suficiente no prueban recuperación. Para repasar estos conceptos en español, escucha [Semana 8 — RTO/RPO y recuperación de desastres](https://www.youtube.com/watch?v=bEEnOxwfdk8), del [canal de Axel Echevarría Piérola](https://www.youtube.com/@axlpierola).

Si eliges **backup y restauración**, puedes inspeccionar el [demo de AWS Backup entre cuentas y regiones](https://github.com/pangoro24/aws-backup-cross-account--cross-region-solution), con plantillas para S3 y DynamoDB. Su README requiere cuentas en AWS Organizations, habilitar la copia entre cuentas, preparar el vault de destino y permisos de KMS, y usar perfiles de AWS CLI para las cuentas y regiones. Comprueba los [requisitos oficiales de copias cross-account](https://docs.aws.amazon.com/aws-backup/latest/devguide/create-cross-account-backup.html) y [cifrado](https://docs.aws.amazon.com/aws-backup/latest/devguide/encryption.html) para los tipos de recursos que uses. El repositorio es una demostración que debes revisar y probar antes de adaptarla; no es un diseño listo para producción.

**Activo/pasivo** significa que una región atiende la carga y la otra queda preparada para asumirla al activar la recuperación. En warm standby, la copia secundaria ya funciona con capacidad reducida, pero el tráfico de producción se cambia hacia ella durante el failover. **Activo/activo** significa que más de una región atiende tráfico; si todas también aceptan escrituras, el diseño debe resolver lecturas obsoletas, escrituras simultáneas, reintentos y conflictos. En la práctica, el patrón puede variar por componente: una aplicación puede recibir tráfico en varias regiones y conservar una sola región escritora para una base de datos.

## La replicación y la consistencia dependen del servicio

No hay una modalidad de replicación única para todos los datos de una aplicación. Examina el modo, el retraso observable, la dirección de escritura, las restricciones y el proceso de promoción de cada servicio.

| Servicio | Qué significa para el diseño |
| --- | --- |
| **DynamoDB Global Tables MREC** | Replica de forma eventual. La réplica puede ir retrasada; AWS indica que el RPO sigue el retraso, que suele ser de segundos y depende de las regiones y la carga. Si el mismo elemento cambia casi al mismo tiempo en dos regiones, puede haber un conflicto que MREC resuelve con *last writer wins*. |
| **DynamoDB Global Tables MRSC** | Ofrece consistencia fuerte entre regiones compatibles y RPO cero para la tabla, con más latencia de escritura y de lecturas fuertemente consistentes que MREC. Tiene conjuntos de regiones y limitaciones de funciones propias; confirma que la combinación sirve para tu carga. Esa propiedad de la tabla no promete por sí sola cero interrupción ni RPO cero para todos los componentes de la aplicación. |
| **Amazon Aurora Global Database** | Replica cambios entre regiones de forma asíncrona. AWS describe para la base global un RPO típico medido en segundos y un RTO del orden de minutos. Un failover no planificado puede perder escrituras que todavía no llegaron a la secundaria; un *switchover* planificado entre clústeres sanos sincroniza antes del cambio y puede tener RPO cero a nivel de base de datos. |
| **Amazon S3 Cross-Region Replication** | Copia objetos según las reglas configuradas y lo hace de forma asíncrona. El tiempo depende, entre otras cosas, del par de regiones y del tamaño del objeto; revisa el estado de replicación y cualquier necesidad de control de tiempo. No asumas que un objeto ya está disponible en el destino al terminar una escritura en el origen. |

Consulta los detalles de [consistencia, conflictos y modos de DynamoDB Global Tables](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_HowItWorks.html), [failover y switchover de Aurora Global Database](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database-disaster-recovery.html) y [replicación de objetos en S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html). La replicación en vivo de S3 es asíncrona y alcanza los objetos nuevos y actualizados después de configurar la regla; para objetos existentes se necesita una tarea de S3 Batch Replication. Estos ejemplos describen comportamientos de servicios concretos; no se pueden extender a todas las bases de datos o a todos los recursos de AWS. También debes respaldar los datos: la replicación puede propagar una eliminación o corrupción, por lo que no sustituye una estrategia de backup y restauración.

## Enrutamiento: detectar una falla no recupera la aplicación

**Amazon Route 53** puede responder consultas DNS con políticas de failover, latencia o ubicación geográfica. Con health checks configurados, puede dejar de incluir en la respuesta los registros que considera no sanos. Revisa las [políticas de enrutamiento de Route 53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html) y los [valores de failover y TTL](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-values-failover.html): el cambio de respuesta no borra el caché de resolvers, y el TTL determina cuánto pueden conservar algunos clientes la respuesta anterior. Prueba cómo responde tu propia aplicación y sus clientes.

**AWS Global Accelerator** ofrece direcciones IP estáticas de entrada y, para un acelerador estándar, enruta conexiones nuevas a endpoints sanos según proximidad y estado. Puede servir cuando necesitas una entrada estable o controlar la distribución entre endpoints regionales. La detección depende de las verificaciones configuradas; las conexiones ya establecidas no se trasladan a otro endpoint. Consulta [cómo funciona Global Accelerator](https://docs.aws.amazon.com/global-accelerator/latest/dg/introduction-how-it-works.html) y [cómo responde ante endpoints no sanos](https://docs.aws.amazon.com/global-accelerator/latest/dg/about-endpoints-endpoint-weights.unhealthy-endpoints.html).

Route 53 y Global Accelerator controlan el tráfico; no promueven una base de datos, no reconstruyen recursos y no resuelven conflictos de escritura. Verifica que la región secundaria tenga capacidad, permisos, configuración de red y dependencias necesarias, y que las comprobaciones de salud midan si la aplicación realmente puede atender solicitudes. No asumas que el cambio de tráfico será instantáneo.

Para continuar en español con DNS y distribución de contenido, puedes elegir entre [Introducción a Amazon Route 53](https://www.youtube.com/watch?v=HHqBoZHNz5I), del [canal de AWS User Group Ecuador](https://www.youtube.com/channel/UCgzEFlDd-KR0BL5rlOVY7KQ); [La Amenaza del Nivel 100: Amazon Route 53](https://www.youtube.com/watch?v=xJ2bN4x8z8g), del [canal de AWS Women Colombia](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw); y [AWS Cloud Practitioner Challenge, sesión 6: CloudFront + Route 53](https://www.youtube.com/watch?v=sbsoXDa0G-A), del [canal de AWS User Group Buenos Aires](https://www.youtube.com/@awsugbsas). La primera ofrece una introducción a Route 53; la sesión del Challenge reúne DNS y CDN en el contexto de Cloud Practitioner. Contrasta las instrucciones de configuración con la documentación oficial.

## Planifica el failover y el failback

Un **failover** cambia la carga a una región de recuperación ante una interrupción no planificada. El runbook debe especificar quién decide, qué señales activan el cambio, cómo se comprueba el estado de los datos, cuándo se promueve la base y en qué momento se modifica el tráfico. Automatizar solo el DNS puede dirigir usuarios a una copia que todavía no puede procesar escrituras.

Un **failback** devuelve la carga a la región original o establece una nueva región principal después de recuperarse. Trátalo como un cambio planificado: primero confirma qué escrituras ocurrieron durante la interrupción, vuelve a sincronizar los datos en la dirección correcta, verifica la salud de ambos lados y ejecuta el *switchover* y el cambio de tráfico con un procedimiento probado. Para Aurora Global Database, AWS documenta la reincorporación de la región recuperada y el cambio planificado de rol en su guía de [recuperación regional](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database-disaster-recovery.html).

Haz ejercicios controlados antes de depender del plan. Mide el tiempo hasta que la aplicación vuelve a aceptar operaciones, comprueba el punto de recuperación de los datos y registra qué pasos exigieron intervención. AWS recomienda probar periódicamente la estrategia de recuperación para tener confianza en que puede ejecutarse.

### Ejemplo de ejercicio con objetivos hipotéticos

Supón que el responsable de una carga fija, solo para este ejemplo, un RTO de 30 minutos y un RPO de 5 minutos. En un entorno de prueba, simula una interrupción de la región principal según el procedimiento aprobado y registra: cuándo empezó la interrupción, cuándo se detectó, cuándo se decidió el failover, cuándo la región de recuperación aceptó lecturas y escrituras válidas, y cuánto tardó el tráfico de clientes en llegar allí. Comprueba qué operaciones confirmadas en la región original se recuperaron y mide cuánto queda atrás el último punto recuperable respecto del inicio del incidente. Si el servicio vuelve más de 30 minutos después del inicio de la interrupción o el punto recuperable queda más de 5 minutos atrás, ese patrón no cumple los objetivos del ejemplo. Después de restablecer la región original, mide por separado la sincronización de vuelta y el failback planificado. Estos números son metas hipotéticas para mostrar cómo evaluar una prueba, no valores recomendados por AWS.

## Calcula el costo total, no solo el cómputo

Una segunda región puede sumar cómputo, bases de datos o almacenamiento en espera, réplicas, solicitudes de replicación, transferencia entre regiones, balanceo y pruebas. Activo/activo suele pagar por capacidad de producción en más de una región; pilot light mantiene menos cómputo encendido, aunque cuesta tiempo y automatización activarlo. El costo concreto depende de los servicios y regiones. Por ejemplo, AWS indica que los cargos de transferencia interregional de S3 varían según las regiones elegidas en su guía de [requisitos y costos de replicación](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-requirements.html). Para AWS Backup, considera además almacenamiento, copias entre regiones, restauraciones y pruebas de restauración; consulta el detalle de [medición y facturación de AWS Backup](https://docs.aws.amazon.com/aws-backup/latest/devguide/metering-and-billing.html).

Compara alternativas contra el RTO y RPO requeridos, estima los recursos de la región de recuperación y prueba si alcanzan durante una falla. Si para cumplir el objetivo dependes de ampliar capacidad al momento del incidente, verifica de antemano cuotas y pasos de escalado. Una CDN puede reducir solicitudes que llegan al origen para objetos cacheables, pero no elimina el costo o el diseño de replicar datos de aplicación.

## Recursos y comunidades para continuar

Para contrastar las decisiones con otras personas, puedes compartir tu diagrama de fallas y tus objetivos de RTO/RPO en un grupo de usuarios. El [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) publica sus encuentros y espacios de comunidad. También puedes continuar desde las charlas enlazadas con [AWS User Group Ecuador](https://www.awsugecuador.com/), cuyo sitio reúne la comunidad y sus actividades. El [directorio oficial de AWS User Groups](https://builder.aws.com/community/user-groups) permite buscar otros grupos y eventos locales o virtuales.

Si estás en Ciudad de México, el [AWSpectrum Architecture Arena](https://www.meetup.com/aws-user-group-awspectrum/events/316830690/) está anunciado para el 26 de octubre de 2026, de 16:00 a 18:30, presencial en FARO Cosmos. La descripción propone diseñar y defender una arquitectura; no anuncia una sesión específica de multi-región. Revisa el registro para confirmar disponibilidad y condiciones.
