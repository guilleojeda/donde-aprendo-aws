---
title: "Desarrollo en AWS: fundamentos para construir aplicaciones"
description: "Aprende a desarrollar en AWS con un proyecto pequeño: elige servicios, gestiona estado y credenciales, prueba, despliega, observa y controla costos."
author: "guille-ojeda"
publishedAt: "2024-01-25"
publishedTimestamp: "2024-01-25T03:23:03.64Z"
modifiedTimestamp: "2026-10-06T13:58:52-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Fundamentos de AWS para principiantes: servicios, IAM y regiones"
    url: "https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/"
  - title: "Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
  - title: "Alertas de costos en AWS: configura AWS Budgets"
    url: "https://dondeaprendoaws.com/blog/automatizar-alertas-de-costos-aws-en-5-pasos/"
---

Desarrollar en AWS significa conectar tu código con servicios de cómputo, almacenamiento, bases de datos, redes e identidad. AWS puede operar parte de esa infraestructura; tú sigues definiendo cómo funciona tu aplicación, quién puede usarla, qué datos conserva y cómo sabrás si falla.

Para aprender, no necesitas empezar con decenas de servicios ni adoptar microservicios, contenedores o Kubernetes. Un proyecto pequeño de principio a fin enseña más: qué servicio resuelve cada tarea, cómo proteger el acceso, dónde guardar el estado y cómo probar y observar lo que despliegas.

## Qué significa desarrollar en AWS

Las etiquetas clásicas IaaS, PaaS y SaaS describen cuánto administra el proveedor: infraestructura básica, una plataforma para ejecutar código o una aplicación lista para usar. En AWS te resultará más práctico comparar cuánto control necesitas y cuánto trabajo operativo estás dispuesto a asumir.

| Necesidad | Opción que puedes evaluar | Qué sigues decidiendo |
| --- | --- | --- |
| Controlar el sistema operativo y ejecutar procesos propios | Amazon EC2 | Parches del sistema operativo, capacidad, red, aplicación y recuperación |
| Atender solicitudes o eventos sin administrar servidores | AWS Lambda junto con servicios como API Gateway | Código, permisos, configuración, tratamiento de errores y almacenamiento persistente |
| Guardar datos | Amazon DynamoDB para acceso de clave-valor y documentos; Amazon RDS para una base relacional | Modelo de datos, consultas, permisos, retención y requisitos de recuperación |

Si quieres comparar más alternativas de cómputo, consulta la [guía de decisión de AWS para elegir un servicio de cómputo](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/choosing-aws-compute-service.html), que reúne criterios para elegir entre servicios según el trabajo que ejecutará tu aplicación.

Estos servicios no son opciones intercambiables: elige según las consultas que necesita tu aplicación, cuánto control requiere el proceso y qué operación puedes mantener. Lambda no elimina el trabajo de desarrollo, y una base de datos administrada no decide por ti quién puede leer los datos.

AWS y quien desarrolla también comparten responsabilidades. AWS protege la infraestructura que opera. Según el servicio, tú puedes tener que configurar la red y actualizar el sistema operativo, además de cuidar el código, los datos y los permisos. Con EC2 administras más componentes que con S3 o DynamoDB; en servicios abstractos sigues controlando los datos y quién accede a ellos. Consulta el [modelo de responsabilidad compartida de AWS](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/shared-responsibility.html) y el [ejercicio con una aplicación pequeña](https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/).

Para repasar identidad y almacenamiento antes de construir, puedes ver [“Sesión 1 - Overview, Identidad y Almacenamiento en AWS”, de Axel Echevarría](https://www.youtube.com/watch?v=0fkIP2K_xfE). Es una grabación de 2023: úsala para los conceptos y comprueba los pasos de consola en la documentación actual. Si prefieres una clase guiada, el curso [Fundamentos de AWS de Marcia Villalba](https://www.marcia.dev/courses/) figura como nivel principiante en Udemy; la página incluye cuenta, facturación y consola. Es de pago, así que revisa el precio y las condiciones vigentes antes de inscribirte.

## Empieza con una aplicación pequeña

Imagina una lista de lecturas que permite consultar y guardar títulos. Empieza con dos operaciones: listar lecturas y agregar una nueva. Antes de elegir servicios, define los datos que guardarás, quién puede modificarlos y qué respuesta debe recibir cada operación.

Una posible versión inicial usa API Gateway para recibir solicitudes web, Lambda para ejecutar la lógica y DynamoDB para conservar los registros:

<p><strong>Navegador → API Gateway → Lambda → DynamoDB</strong></p>

Es una opción para explorar solicitudes cortas y un modelo de datos sencillo. Si tu aplicación necesita procesos que permanecen activos, acceso al sistema operativo o una base relacional, compara EC2 o contenedores administrados y Amazon RDS. No elijas una arquitectura solo porque una tecnología sea popular.

Mantén la lógica de negocio pequeña y pruébala antes de desplegarla. Las pruebas unitarias pueden comprobar validaciones y reglas con datos de ejemplo, sin conectarse a AWS. Después agrega pruebas de integración para confirmar que los servicios y permisos funcionan como esperas.

Si quieres seguir un ejemplo de lógica y pruebas con un handler concreto, nuestra guía [AWS Lambda con Node.js: crea y prueba una función localmente](/blog/desarrollando-aplicaciones-con-aws-lambda/) recorre una función sencilla y muestra qué comprueban las pruebas locales y qué no.

## Estado, datos y secretos

Tu aplicación puede tener estado aunque una función de cómputo sea temporal. El estado del negocio —por ejemplo, la lista de lecturas— debe guardarse en un almacén persistente si debe seguir disponible después de terminar un proceso o una petición.

Esto importa con Lambda: los entornos de ejecución pueden reutilizarse, pero no debes depender de que una variable en memoria o un archivo temporal siga allí en la próxima invocación. Puedes aprovechar memoria o disco temporal como caché; guarda los datos permanentes en un servicio de almacenamiento. AWS explica este límite en sus recomendaciones para [diseñar aplicaciones con Lambda](https://docs.aws.amazon.com/lambda/latest/dg/concepts-application-design.html).

Separa también la configuración de los secretos. Un nombre de tabla o una región puede ser un parámetro de configuración; una contraseña de base de datos o un token privado es un secreto. No guardes claves permanentes en el repositorio, una imagen de contenedor ni el código que se descarga en el navegador. Para el acceso del código que se ejecuta en AWS, asigna un rol con los permisos necesarios. Los SDK pueden obtener credenciales temporales de ese rol; para desarrollar localmente, usa un método de inicio de sesión con credenciales temporales, como los que describe la guía de [autenticación de AWS SDKs y herramientas](https://docs.aws.amazon.com/sdkref/latest/guide/access.html). Si la aplicación necesita secretos, guárdalos en un servicio adecuado, como [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access.html), y limita quién puede leerlos.

Una clave temporal reduce el tiempo durante el que una credencial es válida; no vuelve seguros los permisos excesivos. Revisa qué acciones necesita cada persona, función o servicio y concédele solo esas acciones sobre los recursos que utiliza.

## Prueba y despliega por pasos

Prueba primero la lógica en tu computadora. Si desarrollas una aplicación serverless, AWS SAM permite invocar funciones y ejecutar una API local para acelerar ese ciclo. Las pruebas locales no comprueban por completo la configuración y los permisos reales en AWS; para eso necesitas una prueba de integración en un entorno controlado. La documentación de AWS explica [qué puedes probar con SAM y sus límites](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-test-and-debug.html).

También puedes practicar con una base local: en [🐳 De lo Local se Aprende: Desplegando tu Primera App con Docker y DynamoDB Local](https://blog.295devops.com/de-lo-local-se-aprende-desplegando-tu-primera-app-con-docker-y-dynamodb-local), Rossana Suárez construye una aplicación con Python y DynamoDB Local. El tutorial requiere Docker, pero ejecuta la base en tu computadora y no crea recursos en una cuenta AWS.

Cuando pases a AWS, describe la infraestructura con una herramienta como AWS SAM, CloudFormation, CDK o Terraform. Así puedes revisar cambios y repetir el despliegue con una configuración registrada junto al código. Antes de ejecutar una actualización, inspecciona qué recursos se agregarán, cambiarán o eliminarán. Un conjunto de cambios de CloudFormation ayuda a ver ese impacto, pero no garantiza que la actualización termine correctamente; consulta la [documentación sobre conjuntos de cambios](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html).

Despliega primero en un entorno de desarrollo, prueba una solicitud de punta a punta y deja preparado cómo volver a una versión que funcionaba. No necesitas montar CI/CD para tu primer ejercicio: empieza por entender y repetir el flujo de prueba, revisión y despliegue. Más adelante puedes automatizarlo.

Cuando quieras seguir una práctica paso a paso, [AWS Workshop Studio](https://catalog.workshops.aws/) reúne talleres con requisitos distintos. Algunos son a ritmo propio y usan tu cuenta AWS; en ciertos eventos facilitados se entrega un entorno preparado. Comprueba las instrucciones, el modo de acceso y los posibles cargos de cada taller antes de empezar.

## Observa la aplicación y revisa el costo

Después de desplegar, confirma dos cosas: que la aplicación respondió como esperabas y que tienes datos para investigar un error. Registra errores y solicitudes con un identificador de seguimiento. Revisa métricas como cantidad de solicitudes, latencia y errores; añade trazas si necesitas ver cómo una petición recorre varios servicios. CloudWatch ofrece métricas y registros para cargas en AWS; evita incluir contraseñas, tokens o datos personales en los logs. Si luego necesitas detectar patrones inusuales en mensajes de log, consulta nuestra guía de [detección de anomalías en CloudWatch Logs](/blog/deteccion-de-anomalias-con-cloudwatch-logs/); la detección señala cambios para investigar, no identifica por sí sola su causa.

El precio depende de los servicios y de su uso. Al estimarlo, considera cómputo, solicitudes, almacenamiento, transferencia de datos y registros, además de los cargos que pueden continuar mientras un recurso está creado. La [AWS Pricing Calculator](https://calculator.aws/) sirve para construir una estimación; comprueba sus supuestos y qué conceptos incluye. Puedes configurar [AWS Budgets para recibir avisos](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html), pero un presupuesto por sí solo no detiene el gasto ni pone un tope a la factura. Cuando termines un laboratorio, elimina lo que ya no necesites y revisa los recursos que puedan seguir generando cargos. Para profundizar, consulta la guía de [alertas de costos en AWS](/blog/automatizar-alertas-de-costos-aws-en-5-pasos/).

## Canales y publicaciones en español

- **Charlas y videos:** en el canal de [Cloud en Español](https://www.youtube.com/channel/UCjMLZUU8ep124ZZT-W2X4uA) puedes revisar grabaciones sobre temas de nube; comprueba la fecha y el contexto de cada video.
- **Novedades y recursos:** [Desplegando.cloud](https://desplegando.substack.com/) de Marcia Villalba comparte noticias de AWS y serverless, recursos y eventos en español. Puedes usarlo para encontrar asuntos que quieras investigar; no reemplaza una guía de implementación.

## Comunidades y eventos para preguntar y practicar

Un grupo de usuarios puede ayudarte a contrastar decisiones, compartir un error sin exponer datos sensibles y encontrar talleres o personas que practican. Busca por país en el [directorio de comunidades AWS en Latinoamérica](/comunidades/), que permite revisar AWS User Groups y grupos estudiantiles.

Si prefieres conversar en línea, la página de acceso a [Cloud en Español en Slack](https://www.launchpass.com/aws-spanish) indica que puedes unirte gratis; revisa las reglas y los canales disponibles al entrar.

- [AWS User Group Santa Cruz de la Sierra](https://www.meetup.com/user-group-santa-cruz/) recibe a estudiantes, profesionales y personas interesadas en AWS; organiza conversaciones sobre desarrollo, arquitectura, prácticas y servicios.
- [AWS User Group Paraguay](https://www.meetup.com/es-es/aws-ug-paraguay/) reúne a personas que comparten conocimientos y encuentros sobre AWS.
- El [AWS User Group Perú](https://awsugperu.cloud/) conecta grupos locales y publica talleres, Cloud Clubs universitarios y grupos de estudio.
- Si estudias, el [AWS Student Builder Group de la Universidad Panamericana en Ciudad de México](https://www.meetup.com/aws-sbg-at-pan-american-university-cdmx/) organiza actividades prácticas para estudiantes.
- [AWS Women Colombia](https://awswomencolombia.com/) comparte materiales y encuentros en español para aprender y conversar sobre AWS.

Estas actividades estaban anunciadas para octubre de 2026 al revisar la guía. Verifica la fecha, modalidad, cupo y requisitos en la ficha antes de registrarte:

- [Meetup Virtual AWS de Santa Cruz](https://www.meetup.com/user-group-santa-cruz/events/316621260/), el 7 de octubre a las 19:00 de Bolivia, se transmite en línea e incluye charlas sobre ECS y costos; la comunidad pide registrarse en Meetup.
- [Cloud Builders 04 de AWS Student Builder Group — Universidad Panamericana](https://www.meetup.com/aws-sbg-at-pan-american-university-cdmx/events/316387395/), el 8 de octubre de 17:00 a 19:00, hora de Ciudad de México, es híbrido y construye una API con Lambda, API Gateway y DynamoDB. La ficha indica entrada gratuita y 30 lugares; para el ejercicio pide computadora, conocimientos básicos de programación y una cuenta AWS. Antes de crear recursos, revisa los posibles cargos de la práctica.
- [AWS Community Day Guatemala 2026](https://www.meetup.com/aws-guatemala/events/315480383/) se anuncia para el 10 de octubre a las 08:00, hora de Guatemala, en modalidad presencial. La ficha dirige al registro por ProTicket.
- [EC2 vs Lambda](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/), el 16 de octubre a las 16:00, hora del centro de México, es una sesión en línea para comparar dos opciones de cómputo y sus costos.
- [AWS Community Day Paraguay 2026](https://www.awscommunitydayparaguay.com/register), el 17 de octubre de 08:00 a 18:00, en San Lorenzo, ofrece entrada gratuita por Eventbrite con cupo limitado; basta un correo válido para reservar. La ficha oficial dice que no necesitas computadora ni cuenta AWS para asistir; los talleres tienen cupos y requisitos propios.
- [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/), el 21 de octubre de 18:00 a 20:00, hora de Bogotá, es una sesión virtual sobre VPC, subredes y rutas. La ficha indica que requiere inscripción y tiene cupos limitados.

La [agenda de eventos AWS en Latinoamérica](/eventos/) muestra más actividades y enlaces de inscripción. Si una fecha ya pasó, vuelve a consultar la agenda para encontrar la próxima sesión.

Al pedir ayuda, describe el resultado que esperabas, lo que ocurrió y los servicios que participan. Elimina contraseñas, tokens, identificadores de cuenta y datos privados antes de compartir capturas o mensajes de error.

## Preguntas frecuentes

### ¿Necesito microservicios o Kubernetes para desarrollar en AWS?

No. Puedes empezar con una aplicación pequeña y un despliegue. Separa componentes cuando tengas una razón concreta, como ciclos de publicación o necesidades de escala diferentes. Microservicios y Kubernetes resuelven problemas de sistemas más complejos y también agregan trabajo operativo.

### ¿Tengo que crear recursos en AWS para aprender?

No para comenzar a entender el diseño, escribir lógica y probarla localmente. Para comprobar permisos, redes e integraciones reales tendrás que usar un entorno de AWS; revisa antes los requisitos, el costo potencial y cómo eliminar los recursos.

### ¿Qué debería aprender primero?

Construye una operación completa: recibe una solicitud, valida datos, guarda un registro y comprueba el resultado. En el proceso aprenderás cómputo, una base de datos, permisos de IAM, pruebas, despliegue, observabilidad y costos con una necesidad concreta para cada tema.
