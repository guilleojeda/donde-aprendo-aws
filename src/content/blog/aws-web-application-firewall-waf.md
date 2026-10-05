---
title: "AWS WAF: qué es, cómo funciona y cómo configurarlo"
description: "Guía de AWS WAF v2: Web ACL, ámbitos CloudFront y regionales, API Gateway REST, reglas administradas, falsos positivos, límites de inspección, registros y costos."
author: "guille-ojeda"
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T01:28:49.211Z"
modifiedTimestamp: "2026-10-05T23:42:46Z"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"
  - title: "Mejores prácticas de seguridad en AWS: checklist y cómo verificarlas"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/"
  - title: "AWS X-Ray: trazas, diagnóstico y OpenTelemetry"
    url: "https://dondeaprendoaws.com/blog/aws-x-ray-herramientas-de-depuracion-y-rastreo-distribuido/"
---

AWS WAF v2 (Web Application Firewall) inspecciona solicitudes HTTP(S) que llegan a un recurso de AWS protegido y aplica reglas para permitirlas, bloquearlas, contarlas o pedir una comprobación al cliente. La configuración vive en una **Web ACL** —la documentación y la consola nuevas también la llaman *protection pack (web ACL)*— que se asocia con recursos compatibles, como una distribución de CloudFront, un Application Load Balancer (ALB) o una API Gateway REST API.

La primera decisión es el **alcance**: CloudFront usa el ámbito global de CloudFront y se configura desde **us-east-1**; una Web ACL regional debe estar en la misma Región que el recurso protegido. API Gateway admite la asociación directa documentada con una **REST API**, no con una HTTP API. Después hay que probar las reglas con tráfico representativo: una regla administrada puede detectar una solicitud válida como sospechosa y cortar una operación real.

AWS WAF añade una capa para filtrar solicitudes web, pero no corrige vulnerabilidades de la aplicación ni sustituye autenticación, autorización, validación de entradas, parches o defensas contra DDoS de otras capas. La [guía oficial de AWS WAF](https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html) describe sus recursos y funciones.

## Qué es una Web ACL y qué hace AWS WAF

Una Web ACL reúne reglas y un resultado predeterminado para el tráfico que no coincide con una regla que ya haya terminado la evaluación. Puedes asociarla con uno o varios recursos compatibles. Cada regla compara partes de la solicitud —por ejemplo, la IP de origen, la ruta, una cabecera, parámetros o parte del cuerpo— y aplica la acción que configuraste. Para una introducción práctica, el AWS User Group Ecuador tiene la sesión [“Protegiendo tus aplicaciones web con AWS WAF”](https://www.youtube.com/watch?v=ropgqUGWhro); contrasta los pasos de una grabación con la documentación actual.

Las reglas pueden ser tuyas o venir en grupos administrados por AWS o por vendedores de AWS Marketplace. Por ejemplo, el grupo base Core rule set (AWSManagedRulesCommonRuleSet) incluye reglas para patrones comunes de XSS; el grupo administrado SQL database (AWSManagedRulesSQLiRuleSet) busca patrones asociados con inyección SQL. Revisa las reglas de la versión que agregas: ningún grupo garantiza cubrir todas las variantes de ataque ni corrige un endpoint vulnerable. Consulta la lista de [grupos base de AWS](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html) y [grupos administrados según el caso de uso](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-use-case.html).

WAF solo inspecciona el tráfico que atraviesa el recurso al que asociaste la Web ACL. Si un origen todavía puede recibir solicitudes directas que no pasan por CloudFront, una regla conectada únicamente a CloudFront no filtra esa ruta alternativa.

## Elige el ámbito y comprueba el servicio antes de crear la Web ACL

AWS WAF tiene dos ámbitos principales. Elige el que corresponde al recurso; el ámbito determina dónde se guarda la Web ACL y qué recursos puede proteger.

**Global (CLOUDFRONT).** Se usa para una distribución de Amazon CloudFront. La Web ACL y los recursos de WAF relacionados se configuran en **us-east-1** (N. Virginia), aunque los orígenes estén en otras Regiones.

**Regional (REGIONAL).** Se usa para Application Load Balancer, API Gateway REST API, AWS AppSync, Amazon Cognito, App Runner, Verified Access y AgentCore Gateway. La Web ACL debe estar en la misma Región que el recurso protegido.

Las aplicaciones de AWS Amplify también admiten AWS WAF; la referencia de la API especifica el ámbito **CLOUDFRONT** para ellas. El episodio de Desplegando Cloud sobre la [integración de AWS WAF con Amplify Hosting](https://www.youtube.com/watch?v=hpBiGK0u07E) presenta un ejemplo de esa opción; es una grabación, no una referencia de configuración vigente. Consulta la lista actual de [recursos que puedes proteger](https://docs.aws.amazon.com/waf/latest/developerguide/how-aws-waf-works-resources.html) y la referencia de [creación de Web ACL](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-creating.html) antes de elegir una Región.

La asociación directa de API Gateway está documentada para **REST API** y se realiza en una etapa de la API con una Web ACL regional de la misma Región. AWS WAF no lista la HTTP API entre los tipos con asociación directa. Para ver una arquitectura de sitio estático que combina Vue.js, S3, CloudFront y WAF, revisa la [grabación del meetup de AWS User Group Panamá](https://www.youtube.com/watch?v=Y6PScTDqAsU); sirve como caso de CloudFront, no como guía para asociar WAF a una HTTP API. Si una arquitectura coloca una distribución de CloudFront delante de una HTTP API, puedes asociar WAF a CloudFront para revisar las solicitudes que pasan por esa distribución; comprueba también que los clientes no puedan saltarse esa capa y llamar al origen por otra ruta. AWS explica la asociación en [proteger REST API de API Gateway con AWS WAF](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-aws-waf.html).

## Cómo decide WAF el resultado de una solicitud

En una Web ACL puedes ordenar reglas con una prioridad numérica: AWS WAF evalúa primero el número más bajo. Las acciones de seguridad más comunes son:

- **Allow** acepta la solicitud y termina la evaluación.
- **Block** rechaza la solicitud y termina la evaluación.
- **Count** registra la coincidencia y continúa con las reglas siguientes. Sirve para observar el posible efecto antes de bloquear.
- **Challenge** y **CAPTCHA** comprueban el estado del token del cliente. Si es válido, WAF continúa como con Count; si falta, no es válido o expiró, detiene la evaluación y bloquea esa solicitud.

Si ninguna regla termina la evaluación, AWS WAF usa la acción predeterminada de la Web ACL. Por eso un **Allow** con un número de prioridad menor puede impedir que reglas posteriores se evalúen; revisa el orden cuando interpretes métricas. Las reglas **Challenge** y **CAPTCHA** están pensadas para clientes de navegador en HTTPS y pueden generar cargos adicionales. La guía actual de [acciones de reglas](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-action.html) detalla su comportamiento; CloudFront también ofrece una acción **Monetize** separada, para casos de cobro por acceso a contenido.

## Un comienzo prudente desde la consola

Un ejemplo de consola para evaluar reglas sobre un sitio detrás de CloudFront podría seguir estos pasos:

1. En AWS WAF, abre **Resources & protection packs (web ACLs)** y elige **Add protection pack (web ACL)**. Para una distribución de CloudFront, selecciona ese tipo de recurso y el ámbito **Global (CloudFront)**; AWS fija la Región en **us-east-1**.
2. Selecciona el recurso correcto y agrega solo reglas que correspondan a los riesgos y rutas de tu aplicación. Si agregas un grupo administrado, revisa su proveedor, versión, reglas y condiciones de uso.
3. En un entorno de prueba, ejecuta solicitudes legítimas representativas y casos de prueba. Configura las reglas que evalúas en **Count** para observar sus coincidencias sin que esas reglas bloqueen; otras reglas de la Web ACL todavía pueden decidir el resultado.
4. Revisa las métricas y, si habilitaste registros, identifica qué regla coincidió y con qué parte de la solicitud. Ajusta el alcance o una regla concreta si bloquea operaciones válidas.
5. Cuando el resultado sea aceptable, activa la acción que corresponda para producción y vuelve a observar el tráfico después del cambio.

Para un ALB en **us-west-2**, el mismo ejemplo usaría el ámbito **Regional** y esa Región, no **us-east-1**. La [guía de pruebas y ajuste de AWS WAF](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-testing.html) recomienda probar primero en staging o pruebas y luego observar reglas en modo **Count** con tráfico de producción antes de activarlas.

## Reglas administradas: prueba y ajusta los falsos positivos

Las reglas administradas reducen el trabajo de mantener patrones de detección, pero no conocen todas las entradas válidas de tu aplicación. Una regla de inyección puede coincidir, por ejemplo, con texto que tu producto permite en un formulario. Por eso no pases de añadir un grupo administrado a bloquear en producción sin observar coincidencias.

AWS permite anular la acción de reglas individuales de un grupo administrado y ponerlas en **Count** para probarlas. También puedes reducir el alcance del grupo con una condición *scope-down* o excluir una regla concreta cuando hayas confirmado la causa del falso positivo. Haz una excepción estrecha para el endpoint y el patrón legítimos; desactivar el grupo completo puede eliminar la protección que sí necesitabas. Comprueba las versiones y las notas del proveedor cuando actualices reglas. Consulta [cómo trabajar con grupos de reglas administrados](https://docs.aws.amazon.com/waf/latest/developerguide/waf-using-managed-rule-groups.html).

Mantén separados estos pasos: registra el patrón legítimo que causó la coincidencia, verifica la regla en **Count**, modifica solo el alcance necesario y vuelve a probar antes de bloquear. Si las solicitudes coincidentes se relacionan con datos personales, tokens o credenciales, limita también los datos que guardas en registros y muestras.

## Reglas basadas en tasa no son cuotas exactas

Una regla basada en tasa estima cuántas solicitudes coinciden durante una ventana y aplica la acción configurada cuando el tráfico supera el umbral. Puedes acotarla a rutas o agrupar solicitudes mediante claves como la IP, según la capacidad y la definición de la regla. Es útil para mitigar una frecuencia inusual de solicitudes, como intentos repetidos contra una ruta de acceso.

AWS WAF **no garantiza un límite exacto de solicitudes**. Estima la tasa dando más peso a solicitudes recientes, puede tardar en aplicar o retirar la mitigación y sus conteos pueden cambiar al modificar los ajustes. No la uses como contador preciso para cuotas comerciales, consumo facturable o límites por usuario que deban cumplirse exactamente. Si la preocupación son redes de bots y necesitas estudiar detección y bloqueo más allá de un umbral por tasa, [“BotBusters: AWS Unleashed for Ghost Hunting”](https://www.nerdearla.com/nerdflix/fg2IHEcRIgM/) presenta un caso avanzado que integra AWS WAF con Kestrel y OpenCTI. Para escuchar comentarios en español sobre el panel anti-bots de WAF, está el episodio de marzo de 2026 [“El Nuevo Panel Anti-Bots de AWS WAF”](https://desplegando.substack.com/p/el-nuevo-panel-anti-bots-de-aws-waf); es una grabación de novedades, así que comprueba el comportamiento vigente en la documentación oficial. Lee las [limitaciones de reglas basadas en tasa](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-caveats.html) antes de definir umbrales.

## Tamaño del cuerpo e inspección de solicitudes grandes

AWS WAF no siempre puede revisar el cuerpo completo de una solicitud. Los límites dependen del recurso:

- **Application Load Balancer y AWS AppSync:** WAF inspecciona los primeros 8 KB; el límite es fijo.
- **CloudFront, API Gateway, Amazon Cognito, App Runner, Verified Access y AgentCore Gateway:** el límite predeterminado es 16 KB. Puedes aumentarlo en incrementos de 16 KB, hasta 64 KB.

Aumentar el límite de inspección no cambia los umbrales de las reglas que ya agregaste. Por ejemplo, `SizeRestrictions_BODY` del Core rule set bloquea cuerpos mayores de 8 KB (8192 bytes) en la versión documentada, aunque CloudFront permita inspeccionar 16 KB o más. Si una carga legítima sigue bloqueada, identifica la regla exacta y prueba una excepción estrecha; consulta las [reglas y versiones del Core rule set](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html).

Para una solicitud que supera el límite, WAF inspecciona solo la parte disponible. Si finalmente la permite, el recurso protegido recibe la solicitud completa, incluidos los bytes que WAF no pudo inspeccionar. Configura el manejo de solicitudes grandes de cada regla que inspecciona el cuerpo:

- **Continue** evalúa con los bytes disponibles; no amplía lo que WAF puede ver.
- **Match** trata el componente grande como una coincidencia, sin comprobar el patrón. Con una acción **Block**, puede rechazar la solicitud por superar el límite.
- **No match** trata esa regla como no coincidente y WAF sigue evaluando las reglas posteriores.

Elige la opción según el tamaño legítimo de las solicitudes y el comportamiento esperado del recurso. Si tu aplicación recibe cargas grandes, no supongas que AWS WAF revisa todo el contenido: valida también el cuerpo en la aplicación y define explícitamente qué hacer con los bytes no inspeccionados. Revisa los [límites de inspección del cuerpo](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-setting-body-inspection-limit.html) y el [manejo de componentes de solicitud grandes](https://docs.aws.amazon.com/waf/latest/developerguide/waf-oversize-request-components.html). Para tráfico gRPC hacia CloudFront o un ALB, WAF omite las reglas de inspección del cuerpo; las demás reglas de la Web ACL siguen aplicándose.

## Métricas, registros, privacidad y costo

Las métricas de CloudWatch y las muestras de solicitudes ayudan a ver qué reglas coinciden. Si necesitas investigar una solicitud con más detalle, puedes enviar registros de tráfico WAF a CloudWatch Logs, Amazon S3 o Amazon Data Firehose. Los registros pueden contener rutas, parámetros, cabeceras y otros datos de solicitud; habilita los campos necesarios, conserva los datos el tiempo que requiera tu investigación y limita quién puede leerlos.

AWS WAF ofrece opciones de protección de datos para sustituir u ocultar algunos valores antes de que se usen en registros y otros resultados. La redacción configurada solo para los logs cubre campos concretos y no equivale a proteger todos los campos de una solicitud. Revisa la [protección de datos y registros de AWS WAF](https://docs.aws.amazon.com/waf/latest/developerguide/waf-data-protection-and-logging.html), en especial si las solicitudes contienen tokens, secretos o información personal.

El costo depende, entre otros factores, de las Web ACL, las reglas y los grupos añadidos, las solicitudes inspeccionadas, la capacidad utilizada y las funciones activadas. **Challenge**, **CAPTCHA**, ciertos grupos, la inspección de cuerpos por encima del límite base y el envío de logs pueden sumar cargos; el destino también puede cobrar entrega, ingestión y almacenamiento. Consulta los [destinos de registros de AWS WAF](https://docs.aws.amazon.com/waf/latest/developerguide/logging-destinations.html) y sus precios. Estima el diseño en la página de [precios de AWS WAF](https://aws.amazon.com/waf/pricing/) y los precios del destino de registros; no actives registro completo sin decidir qué preguntas necesitas responder.

## Preguntas frecuentes sobre AWS WAF

### ¿AWS WAF funciona con API Gateway HTTP API?

La asociación directa de AWS WAF que API Gateway documenta es para REST API. HTTP API no aparece como recurso con asociación directa. Si una distribución de CloudFront recibe el tráfico antes que tu HTTP API, puedes asociar una Web ACL a CloudFront para filtrar las solicitudes que atraviesan esa distribución.

### ¿AWS WAF detiene una solicitud antes de que llegue a la aplicación?

Cuando una regla **Block** coincide, AWS WAF detiene la solicitud antes de que el recurso protegido la procese. Si la acción permite que la solicitud continúe, entonces puedes investigar errores o latencia dentro de la aplicación. Una solicitud bloqueada no genera una traza de aplicación de AWS X-Ray; para diagnosticarla, consulta métricas, muestras o registros de AWS WAF. Para una solicitud permitida que falla o es lenta, la [guía de AWS X-Ray sobre rastreo distribuido](https://dondeaprendoaws.com/blog/aws-x-ray-herramientas-de-depuracion-y-rastreo-distribuido/) sirve como siguiente lectura.

### ¿AWS WAF es suficiente contra ataques DDoS?

AWS WAF filtra solicitudes HTTP(S) y ayuda a controlar amenazas de capa de aplicación. No es un sustituto de AWS Shield ni de una arquitectura que maneje otros tipos de tráfico y picos. Para distinguir ambos servicios, consulta la charla de AWS Women Colombia [“El Ataque del Nivel 200: AWS WAF y AWS Shield”](https://www.youtube.com/watch?v=Q8dyJiOcE7M) y la [guía de servicios de seguridad de AWS](https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/).

### ¿Qué reviso si una regla administrada bloquea tráfico válido?

Busca la regla coincidente en las métricas y registros, valida la solicitud afectada y cambia esa regla a **Count** para observarla si necesitas más evidencia. Después limita la excepción al endpoint o patrón legítimo y prueba otra vez antes de restablecer el bloqueo. La [lista de verificación de seguridad en AWS](https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/) ayuda a situar WAF dentro de los controles más amplios de una aplicación.

## Comunidades y canales para aprender AWS en español

Para seguir sesiones de seguridad y conversar con otras personas, puedes visitar el [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/) o el canal regional en español de [AWS Security Users Group LatAm](https://www.youtube.com/@AWSSecurityLATAM). También hay grupos generalistas: el [AWS User Group Ciudad de México](https://awsugcdmx.com/) reúne encuentros sobre varios temas de AWS, incluida seguridad.

Dos actividades anunciadas para octubre de 2026 amplían la conversación sobre seguridad, aunque no son talleres de AWS WAF: [“Cloud Security está más cerca de lo que crees: encuentra tu comunidad”](https://www.meetup.com/aws-user-group-security-colombia/events/316465008/) figura para el 8 de octubre de 2026 en el Centro de Convenciones de Buenos Aires, y [“Compliance as Code en AWS: de la política a la acción automática”](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) está anunciado como evento online para el 20 de octubre de 2026, a las 19:00 de Ecuador (UTC−5). Consulta las fichas de Meetup para confirmar horario, lugar, cupos y condiciones antes de planificar la asistencia; las agendas pueden cambiar. Para encuentros posteriores, consulta la [agenda de eventos AWS](/eventos/).
