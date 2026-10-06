---
title: "Amazon GuardDuty: listas de inteligencia de amenazas"
description: "Integra indicadores propios con listas de entidades de GuardDuty, conoce sus límites y convierte los hallazgos en una ruta de investigación y respuesta."
author: "guille-ojeda"
publishedAt: "2024-04-30"
publishedTimestamp: "2024-04-30T06:43:18.648Z"
modifiedTimestamp: "2026-10-06T17:33:52-03:00"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "UEBA en AWS: GuardDuty, CloudTrail y análisis del comportamiento"
    url: "https://dondeaprendoaws.com/blog/guia-de-ueba-para-la-seguridad-de-aws/"
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"
  - title: "Cómo integrar AWS con un SIEM: fuentes, rutas y pruebas"
    url: "https://dondeaprendoaws.com/blog/integracion-siem-aws-7-consejos-practicos-2024/"

---

Amazon GuardDuty ya combina [feeds de inteligencia de amenazas administrados por AWS y modelos de aprendizaje automático](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html) para detectar actividad sospechosa en cada Región donde está habilitado. Para sumar tus propios indicadores de compromiso, crea una **lista de entidades de amenaza** con un objeto en Amazon S3 y actívala en GuardDuty. Cuando la actividad que analiza el servicio coincide con un indicador, puede generar un hallazgo. La lista no bloquea el tráfico.

Elige una lista de amenazas para indicadores maliciosos. Una lista de confianza hace lo contrario: evita hallazgos asociados con sus indicadores. Esta diferencia, el alcance regional y el tipo de fuente que registra la actividad determinan si una lista sirve para tu caso. La [documentación de listas de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_upload-lists.html) describe ambos tipos y sus límites.

## Qué analiza GuardDuty antes de añadir indicadores propios

Al habilitar GuardDuty, el servicio empieza a analizar fuentes fundamentales como los eventos de administración de AWS CloudTrail, los registros de flujo de Amazon VPC y las consultas DNS de Route 53 Resolver. Las protecciones centradas en recursos, como S3, EKS, Lambda, RDS y Runtime Monitoring, amplían la cobertura según el plan habilitado. Consulta [cómo empezar con GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_settingup.html) y [sus planes de protección](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html) para elegir según los recursos que necesitas observar.

Si es tu primera vez con el servicio, puedes ver [Ciberseguridad en menos de 90 segundos: conoce Amazon GuardDuty](https://www.youtube.com/watch?v=9OGOoBZRoXE) o leer la [introducción de AWS Women Colombia](https://awswomencolombia.com/100diasdeaws-dia-23-amazon-guardduty), publicada como parte de una serie en 2023. Usa la documentación actual para comprobar nombres y disponibilidad de funciones. Para un ejemplo corto de Runtime Monitoring en contenedores, consulta [esta demostración de GuardDuty](https://www.youtube.com/watch?v=9JHyitu5jWQ).

GuardDuty es un servicio **regional**. Habilítalo y configura sus listas en cada Región que quieras vigilar; AWS recomienda cubrir todas las Regiones compatibles, incluso las que no usas a diario. Una cuenta administradora de GuardDuty puede gestionar listas para las cuentas miembro de una organización. Si todavía estás decidiendo qué servicio cubre cada riesgo, consulta [la comparación de servicios de seguridad de AWS](/blog/aws-seguridad-servicios-esenciales/).

## Lista de amenazas, lista de confianza y listas de IP heredadas

| Tipo de lista | Efecto en GuardDuty | Indicadores admitidos |
| --- | --- | --- |
| Lista de entidades de amenaza | Puede generar hallazgos cuando GuardDuty observa actividad relacionada con un indicador listado. | Direcciones IPv4, dominios y hashes SHA-256 de archivos. Los hashes solo se admiten en listas de amenazas. |
| Lista de entidades de confianza | Evita que GuardDuty genere hallazgos por actividad asociada con esos indicadores. | Direcciones IPv4 y dominios; no admite hashes. |
| Lista heredada de IP (`ThreatIntelSet` o `IPSet`) | Personaliza hallazgos de actividad relacionada con direcciones IP. | Direcciones IPv4; no incluye dominios ni hashes. |

AWS recomienda las listas de entidades para nuevos casos. Las listas heredadas de IP no se aplican a los hallazgos basados en consultas DNS de Route 53 Resolver; las listas de entidades sí pueden aplicarse a hallazgos de CloudTrail, VPC Flow Logs y DNS. Los indicadores de IP o dominio solo se aplican a destinos públicamente enrutables; **GuardDuty no admite direcciones IPv6 como indicadores IP en estas listas.**

La condición de enrutamiento público se aplica a los indicadores de IP y dominio; no describe los hashes de archivo. AWS documenta hashes SHA-256 en listas de entidades de amenaza y también documenta IoCs de hash como una señal del motor de análisis de malware. Esa es una ruta de análisis de archivos, no de tráfico de red: por ejemplo, Malware Protection for EC2 analiza volúmenes EBS asociados a instancias EC2 y cargas de contenedores en EC2, mientras Malware Protection for S3 analiza objetos nuevos en buckets seleccionados. No asumas que GuardDuty analiza todo archivo de toda carga de trabajo por el solo hecho de agregar un hash; confirma el plan, los recursos cubiertos y los cargos de cada modalidad en la documentación de [análisis de malware](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-malware-detection-scan-engine.html), [Malware Protection for EC2](https://docs.aws.amazon.com/guardduty/latest/ug/malware-protection.html) y [Malware Protection for S3](https://docs.aws.amazon.com/guardduty/latest/ug/gdu-malware-protection-s3.html).

Una lista de confianza tampoco es una regla de firewall: su efecto es suprimir hallazgos, no permitir ni bloquear conexiones. Si la misma IP o dominio aparece en una lista de amenazas y en una de confianza, prevalece la de confianza y GuardDuty no genera el hallazgo asociado. Esto puede quitar ruido de fuentes verificadas, pero no garantiza menos falsos positivos; una lista obsoleta o demasiado amplia también puede ocultar actividad que merece investigación.

## Cómo cargar una lista de inteligencia de amenazas

El formato de texto más simple usa un indicador por línea. Este ejemplo usa valores reservados para documentación; no son indicadores de amenaza para una cuenta real:

```text
192.0.2.1
192.0.2.0/24
example.com
```

Las listas de entidades también admiten hashes SHA-256 en listas de amenazas. Revisa los [formatos admitidos](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_upload-lists.html) antes de preparar un archivo STIX u otro formato. Una fuente comercial o comunitaria no se conecta automáticamente a GuardDuty por nombrarla: comprueba sus permisos de uso y convierte el feed a un formato admitido antes de publicarlo en S3.

El recorrido práctico es:

1. **Habilita GuardDuty en la cuenta y Región objetivo.** Para administrar una organización, usa la cuenta administradora de GuardDuty y verifica qué cuentas miembro están habilitadas.
2. **Decide qué quieres detectar.** Una lista de amenazas añade indicadores maliciosos a la detección. Una lista de confianza suprime hallazgos de fuentes revisadas; no la uses como una allowlist de red.
3. **Prepara el archivo y súbelo a S3.** El rol IAM que usas para crear la lista debe tener `s3:GetObject` sobre el objeto. Confirma también la ubicación y el propietario del bucket; sigue los [requisitos previos y permisos](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-lists-prerequisites.html) de AWS.
4. **Crea y activa la lista en GuardDuty.** En la consola, abre **GuardDuty → Lists → Entity lists → Add list**, elige una lista de amenazas o de confianza, y activa la lista añadida desde **Action → Activate**. Comprueba que el estado sea `Active`; un archivo subido a S3 no queda aplicado solo por existir.
5. **Automatiza las actualizaciones si mantienes un feed externo.** Un proceso propio puede obtener datos de una fuente autorizada, filtrar y normalizar indicadores, escribir el objeto S3 y volver a activar la lista. GuardDuty no actualiza por sí mismo un feed del proveedor: después de cambiar el objeto hay que activar la lista otra vez.
6. **Repite la configuración en las Regiones necesarias.** Si usas varias cuentas, confirma que la lista la mantiene la cuenta administradora y que las cuentas miembro reciben la cobertura esperada.

Después de activarla, GuardDuty estima que el cambio suele tardar hasta 15 minutos en completarse; en algunos casos puede demorar hasta 40. Comprueba el estado antes de concluir que un indicador no coincide. La [guía para añadir y activar una lista](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-lists-create-activate.html) incluye los pasos de consola y las condiciones del objeto S3.

### Límites que afectan el diseño del feed

- Por cuenta y Región puedes activar hasta **seis listas de amenaza en total** —sumando listas de entidades y listas de IP heredadas—, además de **una lista de entidades de confianza**.
- Cada lista de entidades admite hasta **1.000 indicadores** y el archivo puede ocupar hasta **35 MB**. Las cuotas son distintas para las listas heredadas de IP.
- GuardDuty solo usa una lista cuando su estado es `Active`. Después de cambiar el objeto S3, vuelve a activarla.
- Solo se aceptan direcciones IPv4. Los dominios y las direcciones IP deben corresponder a destinos públicamente enrutables para que estas listas apliquen.
- Una lista heredada de IP no aporta indicadores de dominio ni de hash y no afecta a los hallazgos DNS de Route 53 Resolver.

Consulta las [cuotas actuales de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_limits.html) si el feed supera esos límites. No intentes compensar una lista demasiado grande dividiéndola sin revisar el máximo de listas por cuenta y Región.

## De un indicador coincidente a un hallazgo investigable

Supón que una carga de trabajo consulta un dominio que incluiste en una lista de entidades de amenaza. Si la actividad entra en la cobertura de GuardDuty, el hallazgo puede indicar el dominio, el recurso involucrado, la cuenta, la Región y el nombre de la lista. Usa esos datos para confirmar qué ocurrió; que un indicador aparezca en un feed no determina por sí solo si hubo un compromiso.

Para cada hallazgo:

1. Revisa el JSON completo, su tipo, hora, cuenta, Región, recurso y los detalles de la actividad. La sección de [detalles de los hallazgos](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings-summary.html) explica los campos y, cuando aplica, muestra el nombre de la lista que coincidió.
2. Contrasta el indicador con el contexto de la carga de trabajo y la vigencia de la fuente. Si investigas actividad de identidad o llamadas API, correlaciona el evento con CloudTrail y los detalles de la sesión. Para anomalías de identidad, sigue con [UEBA en AWS: GuardDuty, CloudTrail y análisis del comportamiento](/blog/guia-de-ueba-para-la-seguridad-de-aws/).
3. Decide la contención según el recurso afectado y tu procedimiento de incidentes. GuardDuty detecta y reporta; la corrección del recurso la ejecuta tu equipo o una acción que diseñaste aparte.
4. Si necesitas notificar o enrutar hallazgos, crea una regla de EventBridge y asígnale un destino como SNS, Lambda o una cola. GuardDuty publica hallazgos en EventBridge casi en tiempo real, pero la regla, el destino y sus permisos deben configurarse. Para la ingesta en un SIEM, continúa con [Cómo integrar AWS con un SIEM: fuentes, rutas y pruebas](/blog/integracion-siem-aws-7-consejos-practicos-2024/); también puedes ver la grabación del AWS User Group CreaTicas sobre [Amazon GuardDuty integrado con SIEM](https://www.youtube.com/watch?v=CQUICC2h0Oc).

Este patrón selecciona eventos de hallazgos de GuardDuty; el patrón por sí solo no crea una notificación ni ejecuta una respuesta:

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"]
}
```

Antes de automatizar una acción que aísla una instancia, modifica permisos o corta una conexión, valida el filtro con hallazgos de prueba y dirige primero el evento a un destino de observación. Confirma cuenta, Región, recurso, permisos y un procedimiento de recuperación antes de habilitar la acción. La guía de AWS sobre [procesamiento de hallazgos con EventBridge](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_findings_eventbridge.html) muestra cómo configurar reglas y destinos.

Los hallazgos de muestra de GuardDuty tienen valores de ejemplo y sirven para revisar la consola, filtros y eventos de EventBridge; **no comprueban que tu feed real coincida con un indicador**. Valida el recorrido de una lista únicamente con indicadores y recursos controlados en un entorno de prueba. No generes tráfico hacia infraestructura maliciosa para probar una integración. Para profundizar en la investigación de hallazgos que GuardDuty correlaciona como secuencia de ataque, consulta el [runbook de triaje para un hallazgo crítico](https://builder.aws.com/content/3J68JRbkTcnENVoKrtfk44wFHBD/secuencias-de-ataque-en-amazon-guard-duty-un-runbook-de-triaje-para-el-hallazgo-critical-que-correlaciona-el-resto) publicado en AWS Builder Center.

Si un aviso esperado no llega al destino, comprueba el estado `Active` de la lista y la Región del detector, el permiso `s3:GetObject` del rol que la crea, la política de la clave KMS si el objeto usa SSE-KMS, la compatibilidad del indicador y la regla y permisos de EventBridge. Revisa también listas de confianza y [reglas de supresión](https://docs.aws.amazon.com/guardduty/latest/ug/findings_suppression-rule.html): los hallazgos suprimidos se archivan y no se envían a EventBridge.

## Costos y cobertura por Región

GuardDuty no debe asumirse gratuito de forma permanente. AWS ofrece un período de prueba de 30 días en cada Región para la mayoría de sus planes, pero algunas protecciones tienen condiciones distintas. Después del período aplican cargos según las fuentes de datos procesadas y los planes habilitados. Antes de ampliar cobertura, estima el uso por cuenta y Región con los [precios de GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-pricing.html) y sus métricas de consumo; las listas de indicadores no sustituyen esa revisión.

## Recursos y comunidades AWS en español

Para ver ejemplos del trabajo posterior a la detección, el [29.º Meetup de AWS User Group Panamá](https://www.youtube.com/watch?v=B0ns55LItRs) incluye una charla sobre detectar y responder a ataques con GuardDuty. La comunidad de [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/) comparte sesiones de respuesta a incidentes; entre ellas, la grabación [“Nadie apretó un botón”](https://www.youtube.com/watch?v=kiz4Ls7YRm0), sobre respuesta automatizada con servicios de AWS. Son recursos para estudiar diseños y decisiones, no instrucciones para desplegar sin revisar permisos, costos y efectos sobre recursos.

Si quieres conversar o seguir actividades de seguridad AWS en español, consulta [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/), [AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/) y [AWS User Group Security Colombia](https://www.meetup.com/aws-user-group-security-colombia/). En Ecuador, el [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/) publica actividades sobre seguridad cloud. Para una comunidad AWS general que también reúne a quienes están empezando, consulta [AWS User Group Panamá](https://www.meetup.com/AWS-User-Group-Panama/). El [anuncio público de AWS Security User Group Paraguay](https://es.linkedin.com/posts/aws-security-user-group-paraguay_aws-cloudsecurity-paraguay-activity-7500886396916731905-Xgar) enlaza la invitación a su comunidad y adelanta encuentros sobre respuesta a incidentes. Cada grupo organiza su propia agenda; comprueba el idioma, la modalidad y las condiciones de inscripción antes de participar.

Al 6 de octubre de 2026, el grupo de Ecuador anuncia la sesión virtual [“Compliance as Code en AWS: de la política a la acción automática”](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) para el 20 de octubre, de 19:00 a 20:00 (UTC−5). También anuncia [“AWS & Cloud Native Security Night”](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/) para el 23 de octubre, de 17:00 a 20:00 (UTC−5), en Guayaquil; la ficha consultada indica entrada gratuita y cupos limitados. En Panamá, AWS User Group Panamá marca el [Community Day Security & Data Edition](https://www.meetup.com/aws-user-group-panama/events/316732293/) para el 14 de noviembre; la ficha aún muestra “Save the Date” y no especifica el lugar. Revisa las páginas de los organizadores antes de registrarte o planificar un viaje porque los datos pueden cambiar.

## Preguntas frecuentes

### ¿Puedo conectar cualquier feed de inteligencia de amenazas directamente?

No basta con indicar el nombre de un proveedor. GuardDuty trabaja con las listas que le configuras; publica los indicadores admitidos en un objeto S3 con los permisos requeridos, activa la lista y vuelve a activarla tras actualizar el objeto. El proceso que obtiene, transforma y mantiene el feed externo corre por tu cuenta o la de tu proveedor.

### ¿Una lista de amenazas bloquea una IP maliciosa?

No. Hace que GuardDuty genere hallazgos cuando detecta actividad relacionada con indicadores incluidos y dentro del alcance de la lista. Para bloquear o aislar recursos necesitas un control de red o un flujo de respuesta separado.

### ¿GuardDuty permite crear cualquier regla de detección personalizada?

Las **Custom Detection Rules** son distintas de las listas de indicadores. GuardDuty ofrece una biblioteca de reglas predefinidas para detectar actividad que no esperas en determinadas cuentas; en modo *dry run* evalúa la regla y publica métricas sin crear hallazgos. No es lo mismo que cargar indicadores propios, ni un editor libre para escribir cualquier detección. Consulta la [documentación de Custom Detection Rules](https://docs.aws.amazon.com/guardduty/latest/ug/custom-detection-rules.html).

### ¿GuardDuty reemplaza un escáner de vulnerabilidades?

No. GuardDuty detecta actividad que puede indicar una amenaza. Para evaluar vulnerabilidades, revisa la cobertura de Amazon Inspector y los demás controles que correspondan a tu entorno.
