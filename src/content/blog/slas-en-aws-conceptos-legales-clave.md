---
title: "SLA de AWS: disponibilidad, créditos y cómo reclamarlos"
description: "Entiende los SLA de EC2, RDS y S3, sus exclusiones y plazos. Calcula un crédito con un ejemplo y distingue el compromiso de AWS del uptime de tu aplicación."
author: "guille-ojeda"
publishedAt: "2025-01-16"
publishedTimestamp: "2025-01-16T00:20:32.257Z"
modifiedTimestamp: "2026-10-07T09:41:54-03:00"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
review:
  date: "2026-10-07"
  note: "Revisión editorial de términos oficiales, cálculos y recursos."
related:
  - title: "Seguridad y control de costos en AWS: evita gastos inesperados"
    url: "https://dondeaprendoaws.com/blog/seguridad-y-control-de-costos-en-aws-guia-2024/"
  - title: "Cómo crear SLOs en AWS con CloudWatch Application Signals"
    url: "https://dondeaprendoaws.com/blog/como-monitorear-slos-con-amazon-cloudwatch/"
  - title: "Instancias RDS y Aurora: cómo elegir clase, familia y tamaño"
    url: "https://dondeaprendoaws.com/blog/tipos-de-instancia-en-amazon-rds-y-amazon-aurora/"
---

**Un SLA de AWS establece un compromiso de servicio, cómo se mide y cuándo puedes solicitar un crédito si se incumple.** El porcentaje depende del servicio y de la configuración: no existe un único “SLA de AWS” aplicable a toda tu aplicación. Una caída tampoco genera, por sí sola, un reembolso automático.

Para interpretar un incidente necesitas cinco datos: el recurso cubierto, la definición de indisponibilidad, el período de medición, el tramo de crédito y los requisitos de reclamación. Empieza por el [índice oficial de SLA de AWS](https://aws.amazon.com/legal/service-level-agreements/) y abre el acuerdo del servicio concreto. Los ejemplos de esta guía usan los términos consultados el 7 de octubre de 2026; vuelve a comprobarlos al preparar una reclamación.

## SLA, SLO y SLI: qué mide cada uno

- **SLA, acuerdo de nivel de servicio:** compromiso con condiciones y un remedio contractual si no se cumple. Los acuerdos de EC2, RDS y S3 definen créditos sujetos a elegibilidad y validación; el compromiso se expresa como esfuerzos comercialmente razonables para alcanzar el nivel publicado.
- **SLO, objetivo de nivel de servicio:** meta que defines para operar un sistema, por ejemplo, que el 99,9 % de las solicitudes válidas de compra termine correctamente durante un mes.
- **SLI, indicador de nivel de servicio:** medición que permite evaluar esa meta; en el ejemplo, compras correctas divididas por solicitudes válidas de compra.

La [documentación de SLO de CloudWatch Application Signals](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-ServiceLevelObjectives.html) explica cómo relacionar indicadores, objetivos y períodos. Tu definición de “compra correcta” debe reflejar la experiencia del usuario: recibir una respuesta HTTP no siempre significa que una compra se haya completado. La [guía de SLA, SLO, SLI y presupuesto de error](/blog/diferencias-entre-sla-y-slo-en-aws/) desarrolla esa diferencia con ejemplos por tiempo y por solicitudes.

Una instancia puede conservar conectividad externa mientras tu aplicación devuelve errores por un despliegue defectuoso. En ese caso, tu SLO puede incumplirse sin que haya indisponibilidad de EC2 según su SLA. También puede fallar un componente y continuar el servicio al usuario gracias a la redundancia. **El SLA del proveedor y el uptime de tu producto responden preguntas distintas.**

## Qué porcentajes aplican a EC2, RDS y S3

Esta comparación reúne configuraciones ilustrativas, no todos los servicios ni todas las variantes de AWS. Los límites exactos de cada tramo importan: “menos de 99,9 %” excluye el valor 99,9 %.

| Servicio y alcance | Umbral mensual | Qué observar |
| --- | --- | --- |
| EC2, compromiso regional | 99,99 % | Todas tus instancias en ejecución distribuidas en dos o más AZ de una misma región pierden simultáneamente conectividad externa. |
| EC2, una instancia | 99,5 % | Esa instancia pierde conectividad externa. |
| RDS, instancia o clúster Multi-AZ cubierto | 99,95 % | Todas las solicitudes de conexión al recurso en ejecución fallan durante un intervalo de un minuto. |
| RDS, instancia individual cubierta | 99,5 % | La misma definición de conexiones fallidas, aplicada a la instancia. |
| S3 Standard, ejemplo del primer grupo de clases | 99,9 % | Tasa de errores por tipo de solicitud, calculada en intervalos de cinco minutos. |
| S3 Intelligent-Tiering, ejemplo del segundo grupo | 99,0 % | La misma medición, con otro umbral y otros tramos. |

En **EC2 regional** no basta con tener dos instancias: deben estar distribuidas concurrentemente entre las AZ requeridas. El acuerdo contempla una excepción para regiones con una sola AZ: despliegue en al menos dos regiones. Tampoco cuenta como caída regional que una sola instancia pierda conectividad si las demás siguen conectadas. Consulta las definiciones y el alcance en el [SLA de Amazon Compute](https://aws.amazon.com/compute/sla/).

En **RDS**, el acuerdo cubre instancias de PostgreSQL, MySQL, MariaDB, SQL Server, Oracle y Db2 con la opción de despliegue correspondiente; los clústeres Multi-AZ cubiertos son de MySQL o PostgreSQL. Si el recurso solo funcionó parte del mes, el acuerdo considera disponible el período en que no estaba en ejecución. [RDS tiene su propio SLA](https://aws.amazon.com/rds/sla/) y [Aurora tiene otro](https://aws.amazon.com/rds/aurora/sla/): no traslades automáticamente estos porcentajes a Aurora. Para elegir recursos, consulta la [guía de instancias de RDS y Aurora](https://dondeaprendoaws.com/blog/tipos-de-instancia-en-amazon-rds-y-amazon-aurora/).

En **S3**, el primer grupo también incluye Express One Zone, Glacier Flexible Retrieval, Glacier Deep Archive y las solicitudes no especificadas en el segundo grupo. El segundo incluye Standard-IA, One Zone-IA y Glacier Instant Retrieval, además de Intelligent-Tiering. La base del crédito corresponde a la clase afectada en la región; para Express One Zone, a la AZ afectada. La lista y la fórmula están en el [SLA de Amazon S3](https://aws.amazon.com/s3/sla/).

### Tramos de crédito

Los porcentajes siguientes se aplican a los cargos elegibles, no a toda tu factura de AWS ni al valor de las ventas perdidas.

| Acuerdo | Disponibilidad medida → crédito |
| --- | --- |
| EC2 regional | 99,0 % ≤ resultado < 99,99 % → 10 %; 95,0 % ≤ resultado < 99,0 % → 30 %; resultado < 95,0 % → 100 %. |
| EC2 por instancia | 99,0 % ≤ resultado < 99,5 % → 10 %; 95,0 % ≤ resultado < 99,0 % → 30 %; resultado < 95,0 % → 100 %. |
| RDS Multi-AZ | 99,0 % ≤ resultado < 99,95 % → 10 %; 95,0 % ≤ resultado < 99,0 % → 25 %; resultado < 95,0 % → 100 %. |
| RDS por instancia | 99,0 % ≤ resultado < 99,5 % → 10 %; 95,0 % ≤ resultado < 99,0 % → 25 %; resultado < 95,0 % → 100 %. |
| S3, primer grupo | 99,0 % ≤ resultado < 99,9 % → 10 %; 95,0 % ≤ resultado < 99,0 % → 25 %; resultado < 95,0 % → 100 %. |
| S3, segundo grupo | 98,0 % ≤ resultado < 99,0 % → 10 %; 95,0 % ≤ resultado < 98,0 % → 25 %; resultado < 95,0 % → 100 %. |

Fuentes de los tramos: [EC2](https://aws.amazon.com/compute/sla/), [RDS](https://aws.amazon.com/rds/sla/) y [S3](https://aws.amazon.com/s3/sla/).

## Cómo calcular la disponibilidad sin confundir las fórmulas

Para una estimación de disponibilidad **por tiempo**, puedes usar:

**Disponibilidad (%) = 100 × (1 − tiempo indisponible / tiempo total).**

Un mes de 30 días tiene 43.200 minutos. En ese período, un objetivo de 99,9 % deja 43,2 minutos fuera del objetivo; 99,95 %, 21,6 minutos; y 99,99 %, 4,32 minutos. Son equivalencias matemáticas para planificar, no una autorización para interrumpir el servicio ni una prueba de crédito.

EC2 calcula el porcentaje a partir de minutos que cumplen su definición de indisponibilidad. RDS usa intervalos de un minuto que cumplen la suya. En **S3**, debes calcular la tasa de errores `InternalError` o `ServiceUnavailable` por tipo de solicitud y clase en cada intervalo de cinco minutos; el porcentaje mensual es 100 % menos el promedio de esas tasas. Un intervalo sin solicitudes tiene tasa de error cero. Por eso dividir los minutos de caída de una web por los minutos del mes no reproduce el SLA de S3. [Definiciones de S3](https://aws.amazon.com/s3/sla/).

### Ejemplo completo: crédito de RDS Multi-AZ

Supón este escenario ilustrativo:

- Una **instancia RDS PostgreSQL con la opción Multi-AZ**, en ejecución durante todo un ciclo mensual de 30 días.
- **60 intervalos de un minuto** en los que fallan todas las solicitudes de conexión al recurso; el resto del ciclo cumple la medición.
- Ninguno de esos intervalos proviene de una causa excluida.
- Pagaste **500 USD de cargos por esa instancia** en la región afectada durante ese ciclo. Esa es la base elegible del ejemplo.

El cálculo es:

1. Intervalos totales: `30 × 24 × 60 = 43.200`.
2. Disponibilidad: `100 × (1 − 60 / 43.200) = 99,861111… %`.
3. El resultado está entre 99,0 % inclusive y 99,95 % exclusivo: **tramo del 10 %**.
4. Crédito calculado: `500 USD × 0,10 = 50 USD`.

Es un cálculo coherente con la [fórmula y los tramos del SLA de RDS](https://aws.amazon.com/rds/sla/), **condicionado a que AWS valide los hechos y la elegibilidad**. No afirma que cualquier hora de caída de tu aplicación produzca ese crédito. Si algunas conexiones funcionaron, el recurso estuvo detenido o la causa está excluida, debes revisar las premisas antes de contar esos intervalos.

La configuración también cambia el resultado: con los mismos 60 minutos, una instancia RDS individual tendría 99,861111… %, por encima de su umbral de 99,5 %. No entraría en un tramo de crédito por ese porcentaje.

## Qué puede dejar un incidente fuera del SLA

EC2 y S3 excluyen, entre otras causas, problemas fuera del control razonable de AWS, conectividad de Internet más allá del límite del servicio, acciones u omisiones del cliente, su software o equipos, y suspensiones conformes al acuerdo. Un firewall mal configurado o un error de tu aplicación no se convierte en fallo cubierto solo porque el recurso esté alojado en AWS. [Exclusiones de EC2](https://aws.amazon.com/compute/sla/) y [de S3](https://aws.amazon.com/s3/sla/).

RDS agrega exclusiones específicas: limitaciones de clases Micro o similares, incumplimiento de pautas operativas, sobrecarga, problemas del motor que causen fallos repetidos y recuperaciones largas por capacidad de I/O insuficiente, entre otras. Revisa la lista completa del [SLA de RDS](https://aws.amazon.com/rds/sla/) antes de atribuir el incidente al servicio.

Los SLA seleccionados establecen créditos como remedio exclusivo salvo que el acuerdo aplicable disponga otra cosa. Leer un SLA tampoco acredita cumplimiento regulatorio ni define el compromiso que tu empresa ofrece a sus clientes: eso debe evaluarse en el contrato correspondiente.

## Cómo solicitar el crédito y qué evidencia guardar

En los tres acuerdos seleccionados, AWS debe recibir la solicitud **antes de finalizar el segundo ciclo de facturación posterior al incidente**. Si el incidente ocurrió en septiembre y tus ciclos son meses calendario, el límite sería el cierre de noviembre. Comprueba tus ciclos reales y registra el plazo al abrir el incidente.

El procedimiento es [abrir un caso en AWS Support Center](https://console.aws.amazon.com/support/home). Prepara lo siguiente y usa el asunto indicado en el SLA del servicio:

- **EC2:** fechas y horas, región, IDs de recursos y logs. Para una reclamación por instancia, incluye también la AZ y los datos necesarios para validar la falta de conectividad. Selecciona el asunto de reclamación regional o por instancia que publica el [acuerdo de Compute](https://aws.amazon.com/compute/sla/).
- **RDS:** fechas y horas, IDs de DB y regiones, más logs de solicitudes que demuestren los errores. Para el ejemplo Multi-AZ, usa `Amazon RDS SLA Credit Request – Multi-AZ Claim`; para una instancia individual, el [acuerdo de RDS](https://aws.amazon.com/rds/sla/) indica su otro asunto.
- **S3:** asunto `SLA Credit Request`, ciclo y región, fechas y horas de los incidentes con tasa de errores distinta de cero, y logs de las solicitudes. Conserva el tipo de solicitud, clase de almacenamiento y códigos de error para reproducir la medición del [acuerdo de S3](https://aws.amazon.com/s3/sla/).

Indica la zona horaria, conserva la configuración del despliegue durante el incidente y elimina datos confidenciales de los logs; los acuerdos piden quitarlos o sustituirlos con asteriscos. No envíes secretos ni datos personales para probar una caída. Un gráfico del uptime de tu web puede ayudar al diagnóstico, pero no reemplaza los registros exigidos para el recurso cubierto.

Los [eventos de AWS Health](https://docs.aws.amazon.com/health/latest/ug/what-is-aws-health.html) aportan contexto sobre servicios y recursos afectados. Para distinguir métricas, trazas y registros, puedes leer [Observabilidad en la nube de AWS, de Sheyla Leacock](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m). Es una introducción en español de 2024; su video complementario está en inglés. Ninguno de estos recursos sustituye la evidencia que pide el SLA.

### Crédito no equivale a devolución de dinero

EC2, RDS y S3 aplican los créditos a pagos futuros del mismo servicio. AWS puede, a su discreción, abonarlos a la tarjeta utilizada, pero esos acuerdos no dan derecho a un reembolso u otro pago. Exigen que el importe del crédito sea **mayor que 1 USD** y no permiten transferirlo a otra cuenta. Tampoco puedes acumular reclamaciones regionales y por instancia de EC2 para una misma instancia, ni las dos modalidades de RDS. Consulta las secciones de créditos en [EC2](https://aws.amazon.com/compute/sla/), [RDS](https://aws.amazon.com/rds/sla/) y [S3](https://aws.amazon.com/s3/sla/).

El plazo de emisión también merece lectura: EC2 y S3 indican un ciclo de facturación después del mes de confirmación; RDS indica un ciclo después del mes de la solicitud, si la reclamación se confirma. Una solicitud incompleta puede quedar descalificada.

EC2 tiene además una regla distinta: AWS no cobra una instancia individual que esté indisponible durante más de seis minutos de una hora de reloj. Ese ajuste es automático según su SLA; **no convierte en automáticos los créditos mensuales**. La base del crédito de EC2 excluye pagos únicos, como anticipos de Reserved Instances. [Créditos y regla horaria de EC2](https://aws.amazon.com/compute/sla/).

## Diseñar disponibilidad y aprender con la comunidad

Antes de prometer disponibilidad a tus usuarios, define qué operación debe funcionar, cómo la medirás y qué dependencia puede impedirla. Después prueba la recuperación, el comportamiento del cliente durante un failover y la capacidad restante si pierdes un componente. La guía [REL11-BP07 de AWS Well-Architected, en español](https://docs.aws.amazon.com/es_es/wellarchitected/latest/framework/rel_withstand_component_failures_service_level_agreements.html) conecta esos objetivos con arquitectura, observabilidad y operación. Si quieres convertirlos en mediciones y alertas, continúa con [Cómo crear SLOs con CloudWatch Application Signals](/blog/como-monitorear-slos-con-amazon-cloudwatch/).

Para trabajar cada parte tienes recursos con enfoques diferentes:

- **Comprender la redundancia de la base de datos:** [Alta disponibilidad con RDS Multi-AZ, de John Bulla](https://dev.to/aws-espanol/alta-disponibilidad-con-aws-rds-multi-az-750) explica instancias en espera y clústeres con lectores mediante diagramas. Es una lectura de 2023; verifica las opciones vigentes en la documentación, especialmente sus referencias históricas a Free Tier.
- **Repasar conceptos para estudiar arquitectura:** la grabación [Alta disponibilidad, de AWS User Group Guatemala](https://www.youtube.com/watch?v=ADckkt37kjg) pertenece a su grupo de estudio de Solutions Architect. Puedes continuar en el [canal de la comunidad](https://www.youtube.com/@awsugguatemala) y consultar encuentros en [AWS Guatemala](https://www.meetup.com/aws-guatemala/).
- **Explorar el diseño resiliente:** la charla [Diseñando arquitecturas resilientes en AWS](https://www.youtube.com/watch?v=sEr65Cgskkc) está publicada por AWS User Group Ecuador. Su [sitio comunitario](https://www.awsugecuador.com/) enlaza meetups y talleres para compartir experiencias de proyectos y operación.
- **Ver una implementación de infraestructura:** [Creando infra para una app con alta disponibilidad en AWS](https://www.youtube.com/watch?v=ikLx0i2aexY), de México in Tech, ofrece otra entrada desde una aplicación concreta. Usa las grabaciones como material de estudio y contrasta comandos y opciones con la documentación actual antes de aplicarlos.
- **Revisar el marco completo:** [La Amenaza del Nivel 100: AWS Well-Architected Framework](https://www.youtube.com/watch?v=9LjRkS80ihI), de AWS Women Colombia, complementa la lectura del pilar de fiabilidad. Su [canal de YouTube](https://www.youtube.com/@awswomencolombia) reúne las sesiones de la comunidad.

También necesitas presupuestar redundancia, monitoreo y pruebas: la [guía de seguridad y control de costos en AWS](https://dondeaprendoaws.com/blog/seguridad-y-control-de-costos-en-aws-guia-2024/) sirve para preparar ese seguimiento. Un posible crédito no financia por adelantado tu continuidad.

Las comunidades son útiles para contrastar diseños y aprender de incidentes reales, aunque su actividad abarque muchos temas de AWS. Lleva un diagrama sin información sensible y preguntas concretas, como “¿qué ocurre con las conexiones de mi aplicación durante el failover?”. Para encontrar un grupo cercano o una sesión online, consulta el [directorio de comunidades](/comunidades/) y la [agenda de eventos](/eventos/); revisa fecha, modalidad y registro en el destino del organizador.

## Preguntas frecuentes

### ¿Puedo prometer el mismo 99,99 % del SLA de EC2 a mis clientes?

Necesitas justificar tu propio compromiso con el sistema completo: código, base de datos, red, dependencias, operación y recuperación. El compromiso regional de EC2 exige una configuración y una definición de caída concretas; copiar el porcentaje no demuestra que tu aplicación lo alcance.

### ¿S3 ofrece 99,99 % de SLA o de disponibilidad de diseño?

Para S3 Standard, AWS publica **99,99 % de disponibilidad de diseño y 99,9 % de SLA**. Son cifras diferentes. Tampoco confundas disponibilidad con durabilidad: conservar un objeto y poder acceder a él en un momento determinado son propiedades distintas. [Características de las clases de S3](https://aws.amazon.com/s3/storage-classes/).

### ¿Una caída corta ya habilita un crédito?

Depende del porcentaje mensual, del alcance y de las exclusiones. En el ejemplo, 60 minutos cruzan el umbral Multi-AZ de RDS, pero no el de una instancia individual. Un incidente visible para el usuario puede incluso quedar fuera de la definición contractual del servicio.

### ¿El crédito cubre las ventas perdidas durante la caída?

Los créditos descritos se calculan sobre cargos elegibles del servicio afectado. No se calculan sobre ingresos perdidos ni sobre toda la factura de AWS. Cualquier otro remedio depende del acuerdo aplicable, no de una estimación de uptime.

### ¿Una alarma de CloudWatch solicita el crédito por mí?

Una alarma ayuda a detectar un problema. Para los créditos mensuales de EC2, RDS y S3, los términos requieren una reclamación con evidencia y plazo. La regla automática de no cobro por determinadas horas de EC2 es un mecanismo separado.
