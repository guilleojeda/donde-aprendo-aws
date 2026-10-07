---
title: "Seguridad y control de costos en AWS: evita gastos inesperados"
description: "Protege tu cuenta y controla gastos con IAM, AWS Budgets y Cost Anomaly Detection. Conoce sus límites, cómo investigar alertas y qué revisar al limpiar recursos."
author: "guille-ojeda"
publishedAt: "2024-05-11"
publishedTimestamp: "2024-05-11T04:46:00.274Z"
modifiedTimestamp: "2026-10-07T09:41:54-03:00"
review:
  date: "2026-10-07"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"
  - title: "Cómo usar AWS Cost Explorer: filtros y costos que no aparecen"
    url: "https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/"
---

Para controlar costos y seguridad en AWS, **protege las credenciales, limita qué se puede desplegar, configura alertas y elimina los recursos que ya no necesitas**. AWS Budgets te avisa cuando el costo registrado o previsto alcanza un umbral; Cost Anomaly Detection busca patrones de gasto inusuales; Cost Explorer ayuda a encontrar la causa. Cada herramienta resuelve una parte del problema.

**Un presupuesto convencional de AWS Budgets no es un tope de facturación.** Sus datos llegan con demora y una alerta no detiene recursos. Hay acciones de presupuesto y, en una experiencia nueva disponible para ciertos clientes, límites de gasto por proyecto. Conviene conocer exactamente qué hacen antes de confiarles el control de una cuenta.

Esta guía sirve para una cuenta de aprendizaje o un equipo que necesita ordenar sus controles. En producción, cualquier apagado o restricción de permisos debe considerar la disponibilidad, la recuperación y quién responderá al aviso.

## Qué herramienta usar para cada necesidad

| Necesidad | Herramienta y alcance |
| --- | --- |
| Restringir acceso y creación de recursos | IAM; en organizaciones, SCP para cuentas miembro. |
| Avisar al alcanzar un importe | AWS Budgets, con umbrales reales o previstos. |
| Detectar un patrón de gasto inusual | Cost Anomaly Detection, con datos de facturación. |
| Explicar un aumento | Cost Explorer y la página Bills. |
| Investigar actividad de la cuenta | CloudTrail; GuardDuty aporta detección de amenazas. |
| Estimar antes de desplegar | AWS Pricing Calculator; la estimación depende de tus supuestos. |

Un aumento de costos puede deberse a tráfico legítimo, un error de configuración o credenciales comprometidas. Una alerta financiera señala dónde investigar; no demuestra por sí sola un incidente de seguridad.

## 1. Protege la cuenta antes de crear recursos

Empieza por el acceso, porque un presupuesto no impide que alguien use credenciales robadas.

- **Reserva el usuario raíz para tareas que lo requieren.** Protege su acceso con MFA, preferiblemente una passkey o llave de seguridad, y no crees claves de acceso para root. Mantén recuperables el correo y los mecanismos de acceso. Sigue las [recomendaciones oficiales para el usuario raíz](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html).
- **Usa credenciales temporales.** Para personas, prioriza federación o IAM Identity Center; para aplicaciones, roles IAM. Evita incrustar claves permanentes en código, imágenes de contenedor o repositorios.
- **Concede solo los permisos necesarios.** Separa la administración de cuenta del trabajo cotidiano. Revisa usuarios, roles, claves y permisos sin uso; IAM Access Analyzer puede ayudar a validar políticas y revisar accesos públicos o entre cuentas. La [guía de buenas prácticas de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) desarrolla estas medidas.

Tener MFA en la consola **no vuelve segura una clave permanente expuesta**. El acceso por API necesita los controles correspondientes; AWS explica cómo [exigir MFA para operaciones API](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html). Preferir credenciales temporales reduce la necesidad de distribuir secretos de larga duración.

Para entender usuarios, roles y permisos, mira la [introducción breve a IAM de Marcia Villalba](https://www.youtube.com/watch?v=t51vW-BDwF0); para profundizar, escucha su [episodio sobre cómo asegurar una cuenta AWS con IAM](https://www.youtube.com/watch?v=E3Kv9CS3Qts). La [sesión grabada de AWS Perú Security Day sobre IAM Access Analyzer](https://www.youtube.com/watch?v=JS_UBVMEQ4g) aborda la revisión de permisos. Contrasta los procedimientos de las grabaciones con la documentación vigente.

## 2. Define dónde y cómo puedes gastar

Antes de desplegar, anota el servicio, la Región, el tamaño, cuánto tiempo quedará activo y qué otros componentes necesita. Incluye almacenamiento, transferencia, NAT Gateway, balanceadores y registros cuando correspondan. Usa la [calculadora de precios de AWS](https://calculator.aws/) para estimar esos componentes; no tomes el resultado como una factura garantizada. El video [¿Cuánto te va a costar tu arquitectura en AWS?](https://www.youtube.com/watch?v=Ki0drG2WLm4), de Marcia Villalba, acompaña este ejercicio.

Para una práctica, usa un entorno separado de producción y permisos acordes al ejercicio. Decide de antemano qué recursos vas a borrar, quién lo hará y cuándo. En un equipo, asigna un responsable del costo y distingue desarrollo, pruebas y producción.

Las etiquetas como `Project`, `Environment` y `Owner` ayudan a atribuir el gasto, pero **crear una etiqueta no basta para verla en Cost Explorer**: debes activarla como etiqueta de asignación de costos en Billing. Consulta los [requisitos oficiales de etiquetas de costos](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html). El artículo de Kevin Lupera sobre [etiquetado para optimizar costos](https://dev.to/aws-builders/aws-cost-optimization-por-que-las-tags-son-tu-mejor-aliado-1h8j) muestra una convención y un ejemplo con CDK; sus nombres de etiquetas son una propuesta, no una obligación de AWS.

### IAM, SCP y cuotas: restricciones de uso

Una política puede impedir determinadas acciones de aprovisionamiento o limitar configuraciones admitidas. Define esos controles según lo que necesitas permitir, y prueba también que funcionen el mantenimiento y la eliminación de recursos.

En AWS Organizations, las [políticas de control de servicios o SCP](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html) delimitan permisos de cuentas miembro: no conceden acceso y no restringen a los usuarios o roles de la cuenta de administración. Un `Deny` que bloquea la creación de nuevos recursos no elimina los existentes ni deja de cobrar su uso.

[Service Quotas](https://docs.aws.amazon.com/servicequotas/latest/userguide/intro.html) muestra límites de recursos u operaciones y permite solicitar aumentos de cuotas ajustables. **Las cuotas no son límites en dólares.** Una sola instancia, una base de datos o un volumen pueden seguir acumulando cargos dentro de la cuota. Tampoco supongas que puedes reducir cualquier cuota desde la consola; revisa las opciones del servicio concreto.

## 3. Configura AWS Budgets y comprueba el aviso

Necesitas un rol con acceso a facturación y permisos para administrar presupuestos. En **Billing and Cost Management → Budgets**, crea un presupuesto de costos mensual y recurrente. La [guía oficial de creación de presupuestos](https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html) detalla el flujo.

1. **Elige un importe de referencia y el alcance.** Para observar una cuenta completa, evita filtros que oculten servicios. Si necesitas un presupuesto por proyecto, revisa cuentas, etiquetas y conceptos incluidos: créditos, impuestos, soporte y compromisos pueden cambiar la cifra seguida.
2. **Añade alertas de costo real.** Como ejemplo, un presupuesto de USD 50 con umbrales de 50 %, 80 % y 100 % compara el costo registrado con USD 25, USD 40 y USD 50. Son números ilustrativos, no importes que AWS garantice respetar.
3. **Añade una alerta prevista si tienes historial.** Los pronósticos de Budgets requieren aproximadamente cinco semanas de datos de uso. En una cuenta nueva, empieza por el gasto real. Las [buenas prácticas de Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html) explican ese requisito y el comportamiento de los avisos.
4. **Verifica los destinatarios.** Los correos nuevos deben quedar verificados y activos en la cuenta que los añadió. Si usas SNS, confirma sus suscripciones y permisos de publicación; es un flujo distinto. Consulta la [verificación de destinatarios de Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-email-recipients.html).
5. **Asigna una respuesta.** Define quién revisará el aviso y qué podrá cambiar. Un correo sin responsable no corrige el desvío.

AWS actualiza la información de Budgets hasta tres veces al día, normalmente con intervalos de **8 a 12 horas**. También existe demora entre usar un recurso y registrar su facturación: puedes superar el umbral antes de recibir el aviso. La [documentación de frecuencia y demoras de Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html) lo advierte expresamente.

Para probar la condición sin crear consumo adicional, usa un presupuesto temporal **sin acciones**, con un umbral menor que cargos ya visibles, y espera la siguiente evaluación. Revisa el aviso y elimina el presupuesto de prueba. Si no hay cargos registrados, no generes gasto solo para comprobarlo. La guía de [configuración y prueba de alertas de AWS Budgets](/blog/automatizar-alertas-de-costos-aws-en-5-pasos/) incluye correo, SNS, Slack y diagnóstico de problemas. También puedes seguir la [demostración grabada de creación de presupuestos de Marcia Villalba](https://www.youtube.com/watch?v=FlEg0oGamB0).

### Qué pueden hacer las acciones de presupuesto

Las [acciones de AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html) pueden aplicar una política IAM, aplicar una SCP o detener instancias EC2 o RDS específicas mediante Systems Manager. Se configuran para ejecución automática o con aprobación manual y necesitan un rol de ejecución autorizado.

**No ofrecen una acción genérica para terminar todos los recursos de la cuenta.** La definición de acciones de Systems Manager admite [`STOP_EC2_INSTANCES` y `STOP_RDS_INSTANCES`](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-budgets-budgetsaction-ssmactiondefinition.html). Una acción sobre una instancia RDS tampoco equivale a detener cualquier clúster Aurora.

Prueba primero en recursos de desarrollo y confirma el resultado. Auto Scaling puede reemplazar o reiniciar una instancia EC2 detenida; además, detener cómputo no elimina el almacenamiento asociado. Restringir nuevos despliegues y detener recursos elegidos son controles diferentes. Ninguno convierte las acciones convencionales en un tope absoluto de facturación.

### Si tu cuenta ofrece un límite de gasto por proyecto

AWS está habilitando una experiencia de **spend limits en AWS Settings** para un número limitado de clientes. Requiere un plan Paid y se aplica por proyecto, al costo antes de impuestos y sin descontar créditos. Al llegar al límite, AWS pausa el proyecto y detiene sus recursos; esto puede interrumpir tu aplicación.

No lo confundas con configurar una alerta en un presupuesto común. Comprueba que tu cuenta tenga la función y entiende su alcance antes de usarla. Para reactivar un proyecto debes aumentar el límite; algunos recursos necesitan reinicio manual. **Tras 90 días sin actuar sobre un proyecto pausado, AWS elimina permanentemente sus datos.** Consulta las [condiciones actuales de límites de gasto en AWS Settings](https://docs.aws.amazon.com/accounts/latest/reference/create-spend-limit.html).

## 4. Añade Cost Anomaly Detection sin tratarlo como una alarma inmediata

AWS Cost Anomaly Detection compara patrones de gasto y señala desviaciones. Revisa qué monitor cubre tu cuenta, servicios o agrupación, configura una suscripción de alertas y un umbral de impacto que tu responsable pueda investigar.

Tiene límites que importan para una cuenta de aprendizaje:

- Usa datos de Cost Explorer con una demora de hasta 24 horas; ejecuta el análisis aproximadamente tres veces al día después de procesar la facturación.
- Un monitor nuevo puede tardar 24 horas en empezar a detectar anomalías. Un servicio nuevo necesita diez días de historial de uso.
- No supervisa productos de terceros de AWS Marketplace, salvo modelos fundacionales de terceros en Amazon Bedrock. Para otros cargos de Marketplace, usa presupuestos con el alcance adecuado.

La [guía oficial de Cost Anomaly Detection](https://docs.aws.amazon.com/cost-management/latest/userguide/manage-ad.html) documenta estos límites y permite investigar contribuyentes por servicio, cuenta, Región y tipo de uso. **Detectar una anomalía no detiene recursos ni prueba que haya un atacante.** Combina esa señal con tus alertas de presupuesto y la investigación operativa.

## 5. Investiga una alerta antes de elegir la corrección

1. **Acota el gasto.** En Bills y Cost Explorer, revisa el período y la cuenta; agrupa por servicio. Filtra el servicio que aumentó y examina tipo de uso, Región o cuenta vinculada. La guía de [filtros y diagnóstico en Cost Explorer](/blog/analisis-de-costos-de-aws-con-cost-explorer/) explica por qué un costo puede no aparecer todavía.
2. **Comprueba qué cambió.** Busca despliegues, aumento de tráfico, tareas repetidas, recursos encendidos o almacenamiento creciente. Cost Explorer explica el gasto agregado; no mide por sí solo si un recurso está ocioso.
3. **Revisa la actividad si el uso no tiene explicación.** El historial de CloudTrail conserva 90 días de eventos de administración por Región. No incluye eventos de datos ni es un inventario de recursos sin uso. Descarga lo relevante y confirma la cobertura del registro que necesitarás conservar. AWS describe los [límites del historial de CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html).
4. **Si hay indicios de acceso no autorizado, contiene el acceso y preserva evidencia.** [Desactiva las claves comprometidas](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) y revisa sesiones y permisos derivados; borrar el secreto del repositorio no revoca su acceso. Las sesiones temporales requieren los [controles de revocación correspondientes a su identidad](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_control-access_disable-perms.html). Contacta a AWS Support para investigar cargos o un posible compromiso; no asumas que habrá un reembolso.
5. **Confirma la corrección.** Revisa el estado real de los recursos y vuelve a consultar la facturación cuando se actualice. Distingue el consumo ya ocurrido de nuevos cargos posteriores.

[GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html) puede aportar hallazgos de amenazas, como posibles credenciales comprometidas o minería no autorizada. Revisa cobertura, cuentas, Regiones y precio antes de habilitarlo; sus hallazgos necesitan respuesta. Para estudiar esa operación, tienes la [presentación de Gerardo Castro sobre detección y respuesta con GuardDuty](https://speakerdeck.com/gerardokaztro/como-detectar-y-responder-amenazas-con-aws-guardduty) y la [grabación de CreaTicas sobre integración de GuardDuty con un SIEM](https://www.youtube.com/watch?v=CQUICC2h0Oc).

Si administras varias cuentas, el [caso de auditoría de claves antiguas de Road to CloudSec LATAM](https://roadtocloudsec.la/posts/encontre-access-key-2018-activa-produccion-python-boto3) y su [repositorio iam-audit](https://github.com/gerardokaztro/iam-audit) ofrecen un ejemplo de revisión con roles y credenciales temporales. El proyecto requiere permisos y roles en las cuentas auditadas; evalúa el código y el modo de ejecución antes de incorporarlo. Una herramienta comunitaria no sustituye la revisión de cobertura.

## 6. Limpia recursos y verifica los cargos que persisten

Cerrar la consola, borrar una aplicación local o detener una instancia no elimina todo lo desplegado. Revisa **todas las Regiones usadas** y también servicios globales, suscripciones y compromisos. La [lista oficial de causas de cargos inesperados](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/checklistforunwantedcharges.html) ayuda a ordenar la revisión.

| Recurso | Qué comprobar al terminar |
| --- | --- |
| EC2 | Instancias, volúmenes EBS conservados, snapshots e IPs elásticas. |
| RDS | Instancias, almacenamiento, backups y snapshots retenidos. |
| Redes | NAT Gateways, balanceadores y endpoints que sigan provisionados. |
| Datos y registros | Objetos y versiones de S3, backups y retención de logs. |
| Compras | Suscripciones, dominios y compromisos de RI o Savings Plans. |

Dos casos frecuentes:

- **EC2 detenida:** no cobra cómputo de la instancia en estado `stopped`, pero EBS y direcciones IP elásticas pueden seguir generando cargos. Terminarla tampoco elimina los volúmenes configurados para conservarse. Consulta el [ciclo de vida y facturación de EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html).
- **RDS detenida:** conserva almacenamiento y backups facturables y se inicia automáticamente después de siete días consecutivos. Detenerla es temporal; revisa las [condiciones de parada de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html).

Antes de borrar datos o backups, confirma qué debes conservar y cómo restaurarlos. Si usaste infraestructura como código, verifica el resultado de la eliminación: una política de retención o un fallo puede dejar recursos fuera de la limpieza prevista.

Optimiza tamaño y uso antes de comprar compromisos. Las RI y los Savings Plans pueden seguir cobrándose aunque tu carga desaparezca; compara [compromisos, cobertura y riesgos de Instancias Reservadas y Savings Plans](/blog/ahorro-de-costos-en-aws-con-instancias-reservadas-y-savings-plans/). El artículo de Diana Alfaro sobre [gestión práctica de costos y desperdicio en AWS](https://blog.alfalfita.cloud/from-waste-to-efficiency-enfoques-practicos-para-la-gestion-de-costos-en-aws) propone apagado de entornos de desarrollo, ajuste de tamaño y asignación de responsables.

## Preguntas frecuentes

### ¿AWS Budgets garantiza que no voy a superar mi presupuesto?

Un presupuesto convencional con alertas, no. Puede avisarte después de superar el umbral. Las acciones requieren configuración y tienen alcance limitado. Si tu cuenta ofrece spend limits por proyecto, lee sus condiciones e impacto de pausa por separado.

### ¿Por qué no llega la alerta?

Comprueba el período, alcance, umbral, costo ya registrado y estado de los destinatarios. Si es prevista, puede faltar historial. Si usa SNS, revisa permisos y confirmación de suscripciones. Espera la evaluación de Budgets; no uses la ausencia de un correo como prueba de que no estás gastando.

### ¿Cost Anomaly Detection reemplaza a GuardDuty?

No. Detecta desvíos financieros en datos de facturación; GuardDuty busca señales de amenazas en sus fuentes cubiertas. Un patrón de gasto normal tampoco demuestra que una cuenta esté segura.

### ¿El Free Tier evita cargos inesperados?

Depende del plan, fecha de creación, ofertas, créditos y uso. Revisa las [condiciones actuales del AWS Free Tier y los posibles cargos](/blog/aws-free-tier-guia-para-principiantes-2024/) antes de practicar. No apliques automáticamente las condiciones de una cuenta antigua a una nueva.

## Sigue aprendiendo y lleva tus preguntas a la comunidad

Para ampliar el tema financiero, tienes la [grabación de Marcia Villalba sobre facturación en AWS](https://www.youtube.com/watch?v=8eLAumsarls), la [sesión de CreaTicas sobre FinOps y optimización de costos](https://www.youtube.com/watch?v=UphnnilH09A) y el [episodio de Charlas Técnicas sobre FinOps y ahorro en la nube](https://www.youtube.com/watch?v=3XJEQebQEYU). Son grabaciones, no próximos eventos ni promesas de ahorro; comprueba precios, ofertas y pantallas actuales en AWS.

Para conversar sobre permisos, auditoría y respuesta a incidentes, consulta los grupos de seguridad de [Argentina](https://www.meetup.com/aws-security-usergroup-argentina/), [Colombia](https://www.meetup.com/aws-user-group-security-colombia/), [Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/) y [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/). El [canal de grabaciones de Security LatAm](https://www.youtube.com/@AWSSecurityLATAM) permite continuar después de los encuentros.

Para dudas generales sobre una cuenta de aprendizaje o costos de una arquitectura, revisa [AWS User Group Medellín](https://www.meetup.com/awsugmed/), [CreaTicas](https://www.meetup.com/chiapa-uk-aws-users-meetup-group/), [AWS Women Colombia](https://awswomencolombia.com/) y [AWS User Group Ciudad de México](https://awsugcdmx.com/). Consulta la agenda, modalidad y condiciones de cada actividad; pertenecer al grupo no garantiza una sesión de soporte individual.

**Actividades anunciadas al revisar el artículo el 7 de octubre de 2026:** [DevSecOps con agentes de IA de Security LatAm](https://www.meetup.com/awssecuritylatam/events/316875555/), el 15 de octubre de 16:00 a 17:00 (UTC−5), y [Compliance as Code de Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/), el 20 de octubre de 19:00 a 20:00 (UTC−5). Ambas figuran como online; la segunda anuncia cupos limitados. Confirma inscripción y disponibilidad en sus páginas. Cuando esas fechas hayan pasado, busca otra actividad en la [agenda de eventos online](/eventos/online/) o una comunidad en el [directorio de grupos AWS](/comunidades/).

Al compartir una duda, lleva el servicio, Región, tipo de uso y cambio observado, con datos sensibles ocultos. Esa información permite discutir una corrección concreta sin publicar credenciales ni información privada de la cuenta.
