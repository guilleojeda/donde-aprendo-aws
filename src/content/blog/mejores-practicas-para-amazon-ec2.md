---
title: "Mejores prácticas para Amazon EC2: seguridad, disponibilidad y costos"
description: "Guía práctica para proteger instancias EC2, respaldar EBS, revisar métricas y controlar costos con ejemplos y recursos AWS en español."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:37:49.478Z"
modifiedTimestamp: "2026-10-06T17:37:38-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related: []
---

Las mejores prácticas para Amazon EC2 empiezan por reducir accesos innecesarios, mantener el sistema operativo actualizado, proteger y probar la recuperación de los datos y medir la aplicación antes de cambiar su capacidad. La familia de instancias, la arquitectura y el modelo de compra dependen de lo que ejecutas y de las mediciones de esa aplicación.

Para una revisión inicial, comprueba estos puntos:

- **Identidades:** usa roles de IAM para las aplicaciones y concede solo los permisos que necesitan.
- **Red:** abre únicamente los puertos requeridos; evita administrar instancias desde SSH o RDP expuestos a todo Internet.
- **Mantenimiento:** aplica actualizaciones del sistema y de la aplicación, y revisa las vulnerabilidades detectadas.
- **Datos:** cifra los volúmenes EBS y programa respaldos con una retención definida; verifica que puedas restaurarlos.
- **Observabilidad:** combina las métricas de la instancia con métricas y registros de la aplicación.
- **Disponibilidad:** cuando la carga lo requiera, distribuye instancias entre zonas y configura comprobaciones de salud.
- **Costos:** revisa cómputo, volúmenes, instantáneas, direcciones IPv4 públicas y transferencia; ajusta capacidad según el uso real.

## Limita el acceso a las instancias

Las personas y las aplicaciones que se ejecutan en EC2 necesitan identidades distintas. Para una aplicación que llama a otros servicios de AWS, adjunta un rol de IAM a la instancia y limita sus permisos. No guardes claves de acceso permanentes dentro del código, de una imagen de máquina o de un archivo de configuración. AWS recomienda usar roles y credenciales temporales para las aplicaciones en EC2. Para las personas, utiliza identidades federadas y roles según el acceso que necesiten.

Define también cómo administrar el sistema operativo. [AWS Systems Manager Session Manager](/blog/como-configurar-y-utilizar-aws-session-manager/) permite abrir una sesión con permisos de IAM sin habilitar SSH entrante; requiere que la instancia esté administrada por Systems Manager y tenga conectividad hacia sus endpoints.

Para una aplicación web, un esquema habitual es permitir HTTPS desde Internet al balanceador de carga y permitir en el grupo de seguridad de la instancia solo el tráfico del grupo del balanceador hacia el puerto de la aplicación. Reserva el acceso administrativo para una vía controlada. Si necesitas SSH o RDP por una condición técnica, limita el origen a una red de administración específica y revisa la regla después del cambio.

Los grupos de seguridad mantienen el estado de las conexiones: las respuestas al tráfico permitido se autorizan automáticamente. También hay una limitación importante: **los grupos de seguridad no filtran el acceso al servicio de metadatos de la instancia**. Por eso, restringir puertos de red no reemplaza la configuración de IMDS. Revisa las [reglas de grupos de seguridad de VPC](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html) junto con las opciones de metadatos.

Cada subred usa una tabla de rutas que dirige el tráfico según el destino y la ruta aplicable. Si la instancia no puede alcanzar un servicio, comprueba qué tabla está asociada a la subred y revisa sus rutas, reglas de seguridad, direcciones, DNS y conectividad de extremo a extremo. La [guía de Amazon VPC sobre subredes, rutas, NAT y seguridad](/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/) desarrolla ese diagnóstico.

## Mantén el sistema y limita el acceso a metadatos

Aplica parches del sistema operativo y de las aplicaciones de forma regular. En flotas, automatiza la actualización y usa imágenes mantenidas para que las nuevas instancias no nazcan con software desactualizado. Amazon Inspector puede detectar vulnerabilidades de software y exposición de red no deseada; los hallazgos necesitan una corrección, no se reparan por activar el análisis. La [guía de buenas prácticas de EC2 de AWS](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-best-practices.html) incluye controles de acceso, reglas de seguridad, parches e Inspector.

Configura las instancias para requerir **IMDSv2** cuando tus aplicaciones y agentes sean compatibles. Antes de imponerlo en una flota existente, identifica quién consulta el servicio de metadatos y prueba los cambios: AWS advierte que los componentes que aún usan IMDSv1 pueden dejar de funcionar. En contenedores, revisa además el límite de saltos de la respuesta. Consulta cómo [configurar IMDSv2 para nuevas instancias](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-IMDS-new-instances.html) y cómo inspeccionar las instancias existentes. Para revisar otros controles de una cuenta AWS y cómo verificarlos, consulta el [checklist de seguridad de AWS](/blog/aws-seguridad-mejores-practicas/).

El artículo de Terry Quispe [IMDSv1 vs. IMDSv2 en EC2: riesgos y migración](https://dev.to/terry_cloud/imdsv1-vs-imdsv2-en-ec2-ssrf-metricas-riesgos-y-una-migracion-segura-4j62) muestra cómo investigar llamadas antiguas a metadatos antes de exigir IMDSv2. Su laboratorio crea una VPC, una instancia pública y una aplicación vulnerable intencionalmente; tiene costos y requiere aislar y eliminar los recursos al terminar. Revisa el código, la [documentación vigente de IMDSv2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-IMDS-new-instances.html) y el costo regional antes de ejecutar cualquier laboratorio.

## Protege EBS y comprueba las copias de seguridad

Un volumen EBS puede conservar datos después de detener una instancia, pero su comportamiento al **terminarla** depende de `DeleteOnTermination`. Comprueba ese ajuste antes de retirar una instancia y revisa los volúmenes que queden separados: siguen ocupando almacenamiento y pueden generar cargos.

AWS no crea automáticamente copias de seguridad de los datos de un volumen EBS. Programa instantáneas con una política de Amazon Data Lifecycle Manager o AWS Backup, define cuánto tiempo conservarlas y prueba una restauración. Una instantánea es incremental; eliminar una de ellas no siempre reduce el almacenamiento facturado porque otras pueden depender de los mismos bloques.

Las instantáneas EBS se guardan en almacenamiento de S3 administrado por AWS, pero no puedes abrirlas desde la consola ni la API de S3. Adminístralas desde EBS; activar versionado en un bucket propio no protege esas instantáneas. AWS describe este límite y las opciones de [instantáneas EBS](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-snapshots.html).

Activa el cifrado de los volúmenes que contienen datos y conserva el control de las claves según tus requisitos. El cifrado EBS también se aplica a las instantáneas derivadas y a los volúmenes restaurados, y está disponible con todos los tipos de instancia EC2. Para comparar rendimiento, mide tu carga y revisa el tipo de volumen, sus límites y el tipo de instancia. Consulta la [guía de cifrado de EBS](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-encryption.html).

## Observa la aplicación, no solo la instancia

EC2 publica métricas como CPU, red, almacenamiento y comprobaciones de estado en CloudWatch. Las métricas básicas de la instancia no incluyen por sí solas datos del sistema operativo como uso de memoria o espacio libre del disco; para reunirlos, instala y configura el [agente de CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html). Añade también registros y métricas de la aplicación, como errores, latencia y solicitudes atendidas.

Un caso frecuente: la CPU parece normal, pero la aplicación deja de responder por falta de memoria. Una alarma de CPU no detectará por sí sola ese problema. Configura la métrica de memoria con el agente y compárala con los registros de la aplicación. Para otra explicación en español, Camilo Cabrales muestra cómo [usar Systems Manager y CloudWatch Agent para medir memoria en EC2](https://dev.to/cecamilo/como-configurar-el-agente-de-cloudwatch-con-systems-manager-para-monitorear-la-memoria-de-una-instancia-ec2-3ib7). El artículo es de 2022: úsalo como ejemplo del concepto y confirma los pasos vigentes en la documentación de AWS.

## Elige capacidad y disponibilidad con mediciones

El tipo de instancia determina combinaciones de CPU, memoria, almacenamiento y red. Empieza por los requisitos de la aplicación y del software —incluida la arquitectura de procesador compatible— y compara tipos con una prueba representativa. La documentación de AWS recomienda medir con la carga propia; la disponibilidad de cada tipo y sus especificaciones dependen de la región. Consulta la guía actual de [tipos de instancia EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-types.html) antes de decidir.

Si una falla de instancia o zona no debe interrumpir el servicio, diseña la aplicación para operar con instancias en varias zonas de disponibilidad. Para una carga web compatible, un grupo de Auto Scaling distribuido entre zonas y un balanceador con comprobaciones de salud pueden reemplazar instancias no saludables y dirigir solicitudes a destinos sanos. Esto exige revisar la capacidad, las comprobaciones de salud y el comportamiento de la aplicación; crear el grupo por sí solo no demuestra que el servicio pueda recuperarse. AWS explica cómo [Auto Scaling aporta tolerancia a fallos y distribuye instancias](https://docs.aws.amazon.com/autoscaling/ec2/userguide/auto-scaling-benefits.html).

Las instancias Spot usan capacidad sobrante y pueden interrumpirse. Son una opción para procesos que toleran interrupciones, guardan puntos de control y pueden reanudarse. EC2 emite un aviso de interrupción con dos minutos de antelación cuando está disponible, pero las notificaciones se entregan con el mejor esfuerzo: no dependas de ese margen para guardar datos ni completar una operación. Diseña el trabajo para recuperarse aunque la instancia deje de estar disponible y revisa las [prácticas recomendadas para EC2 Spot](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-best-practices.html) y el detalle de los [avisos de interrupción](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-instance-termination-notices.html).

## Controla el costo completo de EC2

La factura puede incluir más que el tiempo de cómputo: volúmenes EBS, instantáneas, direcciones IPv4 públicas, transferencia de datos y componentes de red como NAT Gateway. Detener una instancia evita el cargo por su uso mientras está detenida, pero no elimina el cargo de almacenamiento EBS. Una dirección IP elástica asociada u otros recursos de red también pueden seguir generando cargos. Revisa los recursos relacionados antes de considerar que la instancia dejó de costar. La [guía del ciclo de vida de EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html) y los [precios de Amazon VPC](https://aws.amazon.com/vpc/pricing/) detallan estos cargos.

Para optimizar sin adivinar:

1. Etiqueta las instancias y volúmenes por aplicación, ambiente y responsable para identificar su propósito.
2. Usa Cost Explorer para filtrar por servicio, región y tipo de uso; la [documentación de filtros](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-filtering.html) y la guía [Cómo usar Cost Explorer](/blog/analisis-de-costos-de-aws-con-cost-explorer/) ayudan a desglosar los cargos. La transferencia puede quedar agrupada con el servicio al que se asocia.
3. Mide la carga antes de cambiar familias o tamaños. Si una instancia está ociosa, revisa si puedes reducirla, programar su horario o reemplazarla por una arquitectura que se ajuste mejor al patrón de demanda.
4. Evalúa Spot solo para trabajo tolerante a interrupciones. Considera un compromiso de Reserved Instance o Savings Plan después de entender qué uso seguirá estable y por cuánto tiempo.

Una RI regional descuenta uso elegible en la región, pero no reserva capacidad; una RI zonal también reserva capacidad para atributos concretos en una zona. Un Savings Plan es un compromiso de gasto elegible, no una reserva de capacidad. Evalúa cada opción con el patrón de uso y el plazo que realmente esperas. Para comparar alcance, plazo y riesgo de subutilización, consulta [RI de EC2 y Savings Plans: diferencias y riesgos](/blog/ahorro-de-costos-en-aws-con-instancias-reservadas-y-savings-plans/), la [diferencia oficial entre RI zonales y regionales](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/reserved-instances-scope.html) y la [comparación de AWS con Capacity Reservations y Savings Plans](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-capacity-reservations.html).

El episodio de 2020 [Muchísimos tips para optimizar costos en AWS EC2](https://www.youtube.com/watch?v=94etXBFDDh8) de *Charlas Técnicas* recorre análisis de gastos, selección y tamaño de instancias, horarios, Savings Plans y Spot. Úsalo como contexto histórico; revisa precios y condiciones actuales en las fuentes de AWS.

## Recursos técnicos en español

Si recién empiezas, [#100díasdeAWS: Día 1, EC2](https://awswomencolombia.com/100diasdeaws-dia-1-ec2) de AWS Women Colombia ofrece una introducción breve al servicio. Es una publicación de 2023: sirve para repasar qué es EC2, pero sus datos sobre precios, ofertas gratuitas y descuentos no describen las condiciones actuales. Confírmalas en las páginas de AWS enlazadas arriba. El AWS User Group Buenos Aires también tiene una [sesión de Cloud Practitioner sobre EC2](https://www.youtube.com/watch?v=bXtb3YViJLA), útil para repasar fundamentos. Para una grabación de nivel intermedio, AWS Girls Perú publica [AWS EC2 nivel 200](https://www.youtube.com/watch?v=436Wz9uQMhA); confirma configuraciones y recomendaciones vigentes en la documentación de AWS.

Para profundizar en almacenamiento y monitoreo, el AWS User Group Buenos Aires publicó la grabación del [Cloud Practitioner Challenge sobre EBS, EFS, S3 y monitoreo](https://www.youtube.com/watch?v=GqYKhnqDDeI). Como complemento para cargas de machine learning, AWS Women Colombia explica en [Hardware de AWS e instancias EC2 para ML/AI](https://www.youtube.com/watch?v=-lrX_9Li8ik) factores como sistema operativo, recursos, almacenamiento, seguridad y automatización; el video se publicó en 2025, así que confirma familias y disponibilidad regional con la guía actual de tipos EC2.

Para estudiar operación y acceso, AWS Women Colombia tiene sesiones sobre [IAM y EC2](https://www.youtube.com/watch?v=rFppvIDrNoA), [Amazon EC2 para SysOps](https://www.youtube.com/watch?v=CscFLki_DyE) y [Systems Manager](https://www.youtube.com/watch?v=0sRNTZwaWvc). La sesión de AWS User Group Guatemala sobre [automatización de tareas de seguridad con Systems Manager Documents](https://www.youtube.com/watch?v=fFcoFODfNXo) complementa ese tema; las demostraciones no sustituyen los requisitos actuales de IAM, red y agente. Para una introducción breve a la activación de Amazon Inspector, consulta el video de Sheyla Leacock [Ciberseguridad en menos de 90 segundos](https://www.youtube.com/watch?v=ulMDyiJUM80) y confirma cobertura y condiciones en la documentación de AWS.

## Comunidades y un evento para seguir aprendiendo

Para conversar con otras personas que trabajan con AWS, puedes empezar por el [AWS User Group Perú](https://awsugperu.cloud/), que reúne grupos locales, talleres y espacios de estudio; el [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) o el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) en Argentina; el [AWS User Group Chile](https://awsugchile.com/), que organiza charlas y talleres; el [AWS User Group Ecuador](https://www.awsugecuador.com/), con meetups y retos de certificación; o [AWS Women Colombia](https://awswomencolombia.com/), que comparte encuentros y material en español. Si buscas temas concretos, el [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) se centra en redes y conectividad, y el [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/) en seguridad. El [directorio de comunidades AWS en Latinoamérica](/comunidades/) permite buscar otros grupos por país.

Al revisar la agenda el **6 de octubre de 2026**, estaba anunciada la sesión virtual [EC2 vs Lambda](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/), organizada por AWS User Group Tlaxcala FireflyCloud para el **16 de octubre de 2026, de 16:00 a 17:00 (UTC−6)**. La convocatoria propone comparar ambas opciones y sus costos. Confirma la inscripción, el horario y la disponibilidad en Meetup; consulta también la [agenda de eventos de México](/eventos/mexico/) para encontrar otras actividades.

## Preguntas frecuentes sobre Amazon EC2

### ¿Detener una instancia EC2 elimina todos sus cargos?

No. Cuando una instancia respaldada por EBS está detenida, no genera cargos por cómputo mientras permanece en ese estado, pero sus volúmenes EBS siguen ocupando almacenamiento. Comprueba también las direcciones y servicios de red asociados.

### ¿Las instantáneas EBS se administran como archivos de S3?

No. AWS las conserva en almacenamiento de S3 administrado por EBS, pero se gestionan desde EBS y no se consultan con la consola ni la API de S3. Define retención y prueba la restauración con las herramientas de EBS, Data Lifecycle Manager o AWS Backup.

### ¿Qué hago si CloudWatch muestra poca CPU, pero la aplicación está lenta?

Revisa memoria y disco del sistema operativo, registros, latencia y errores de la aplicación. Para publicar memoria o espacio libre en CloudWatch, configura el agente; esas métricas no aparecen automáticamente con las métricas básicas de EC2.
