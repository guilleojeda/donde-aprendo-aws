---
title: "Servicios de AWS para principiantes: para qué sirve cada uno"
description: "Conoce qué servicios de AWS usar para cómputo, archivos, bases de datos y redes. Incluye un ejemplo de aplicación, costos básicos y recursos en español."
author: "guille-ojeda"
publishedAt: "2024-01-23"
publishedTimestamp: "2024-01-23T15:42:44.638Z"
modifiedTimestamp: "2026-10-06T17:34:19-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "AWS Free Tier: planes, créditos, límites y cargos"
    url: "https://dondeaprendoaws.com/blog/aws-free-tier-guia-para-principiantes-2024/"
  - title: "Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
---

Si estás buscando **qué servicios de AWS aprender primero** o **para qué sirve cada servicio de Amazon Web Services**, empieza por una idea sencilla: cada servicio resuelve una tarea concreta. No necesitas memorizar el catálogo. Elige una aplicación pequeña, identifica lo que debe hacer y aprende solo las piezas que la resuelven.

AWS es la plataforma de nube de Amazon. En vez de comprar y mantener toda la infraestructura, puedes combinar servicios de computación, almacenamiento, bases de datos, redes y otras áreas. Esta guía presenta los más útiles para orientarte y muestra cómo podrían trabajar juntos.

## Servicios de AWS comunes y para qué sirven

### Computación

- **[Amazon EC2](https://docs.aws.amazon.com/es_es/AWSEC2/latest/UserGuide/):** una máquina virtual en la nube. Sirve para ejecutar aplicaciones cuando necesitas elegir y administrar el sistema operativo.
- **[AWS Lambda](https://docs.aws.amazon.com/es_es/lambda/latest/dg/welcome.html):** ejecuta código cuando ocurre un evento o llega una solicitud, sin que tengas que aprovisionar ni administrar los servidores subyacentes. La aplicación sigue necesitando permisos, configuración y supervisión.

### Almacenamiento y bases de datos

- **[Amazon S3](https://docs.aws.amazon.com/es_es/AmazonS3/latest/userguide/Welcome.html):** guarda archivos, imágenes y copias como objetos dentro de buckets. Un objeto no es lo mismo que un archivo en el disco de una máquina virtual ni que una fila de una base de datos.
- **[Amazon RDS](https://docs.aws.amazon.com/es_es/AmazonRDS/latest/UserGuide/):** servicio administrado para bases de datos relacionales que consultas con SQL. AWS gestiona parte de la infraestructura; tú sigues tomando decisiones sobre los datos y la configuración.
- **[Amazon DynamoDB](https://docs.aws.amazon.com/es_es/amazondynamodb/latest/developerguide/Introduction.html):** base de datos NoSQL administrada para modelos de clave-valor y documentos. Elige el diseño según cómo la aplicación leerá y escribirá los datos.

### Redes y API

- **[Amazon API Gateway](https://docs.aws.amazon.com/es_es/apigateway/latest/developerguide/welcome.html):** publica una API HTTP, recibe las solicitudes y las conecta con una función Lambda u otro sistema.
- **[Amazon VPC](https://docs.aws.amazon.com/es_es/vpc/latest/userguide/what-is-amazon-vpc.html):** define una red virtual aislada de manera lógica, con subredes, rutas y opciones de conectividad.

### Acceso y supervisión

- **[AWS Identity and Access Management (IAM)](https://docs.aws.amazon.com/es_es/IAM/latest/UserGuide/getting-started.html):** controla quién puede hacer qué mediante identidades, roles y políticas de permisos. Una aplicación suele recibir un rol con los permisos que necesita para trabajar.
- **[Amazon CloudWatch](https://docs.aws.amazon.com/es_es/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html):** reúne métricas y registros de recursos y aplicaciones para que puedas entender errores y vigilar cambios.

Estos servicios no son piezas intercambiables. EC2 ofrece una máquina virtual; S3 guarda objetos; RDS y DynamoDB son opciones distintas para persistir datos. La [descripción oficial de servicios por categoría](https://docs.aws.amazon.com/es_es/whitepapers/latest/aws-overview/amazon-web-services-cloud-platform.html) ayuda a explorar otras áreas cuando tengas una necesidad concreta.

Los servicios administrados reducen tareas de infraestructura, pero no eliminan tus responsabilidades sobre los datos, el código y los permisos. AWS explica que la división entre proveedor y cliente cambia según el servicio: con EC2, por ejemplo, debes administrar el sistema operativo invitado; con servicios como S3 y DynamoDB, AWS opera más capas, pero tú decides quién accede a tus datos. Lee el [modelo oficial de responsabilidad compartida](https://aws.amazon.com/es/compliance/shared-responsibility-model/).

## Un ejemplo: recibir una inscripción en una aplicación

Imagina una aplicación sencilla que recibe un formulario:

1. La persona envía sus datos a un endpoint HTTP publicado con API Gateway.
2. API Gateway entrega la solicitud a una función Lambda.
3. La función valida la información y la guarda en DynamoDB.
4. Configuras el rol de IAM de la función para permitir solo las operaciones que necesita sobre la tabla.
5. Con el envío de registros configurado, CloudWatch ayuda a revisar los registros y las métricas si la función falla.

Si la aplicación necesita un modelo relacional o ya depende de SQL, podrías estudiar RDS en vez de DynamoDB. Si necesita ejecutar un proceso que requiere controlar el sistema operativo, podrías evaluar EC2 en vez de Lambda. La elección depende de los requisitos de la aplicación; no existe un servicio que sea mejor para todos los casos.

También puedes aprender estas piezas por separado. Para profundizar en el estilo de ejecución de Lambda, sigue con esta [introducción a serverless en AWS](/blog/introduccion-a-serverless-en-aws/). Si tu interés está en la inteligencia artificial, esta [introducción a la IA en AWS](/blog/introduccion-a-la-inteligencia-artificial-en-aws/) distingue servicios según el tipo de problema que quieres resolver.

## Qué aprender primero

Usa un orden ligado a una aplicación, no a una lista de productos:

1. **Describe la tarea.** ¿Necesitas ejecutar código, guardar archivos, recibir una solicitud o consultar datos?
2. **Identifica quién accede y con qué permisos.** Lee los conceptos básicos de IAM antes de conceder permisos a una aplicación.
3. **Elige un servicio de datos según el uso.** Decide si necesitas archivos, una base relacional o un modelo NoSQL.
4. **Entiende las conexiones.** API Gateway, VPC y las reglas de acceso ayudan a controlar cómo se comunica cada parte.
5. **Observa el resultado.** Revisa registros, métricas y errores con CloudWatch.

No hace falta crear una cuenta ni desplegar recursos para aprender este mapa. Elige el formato que te ayude a seguir:

- **Documentación oficial:** la [descripción de AWS por categorías](https://docs.aws.amazon.com/es_es/whitepapers/latest/aws-overview/introduction.html) y la [guía de servicios](https://docs.aws.amazon.com/es_es/whitepapers/latest/aws-overview/amazon-web-services-cloud-platform.html) explican los conceptos y permiten profundizar en cada producto.
- **Cursos digitales:** [AWS Skill Builder](https://aws.amazon.com/es/training/digital/) ofrece cursos a tu ritmo, incluidos cursos gratuitos y experiencias que requieren suscripción.
- **Introducción en video:** la [sesión “Introducción a la Nube y AWS” de AWS User Group Medellín](https://www.youtube.com/watch?v=HhPGckLLDWY) es una grabación de abril de 2025 sobre conceptos de nube, modelos de servicio e infraestructura global. Úsala como repaso conceptual; confirma en la documentación los nombres, límites y pasos actuales.
- **Otra explicación de servicios:** [“Introducción a Amazon Web Services”, de AWS User Group Perú](https://www.youtube.com/watch?v=QtqjaSvh91Y) es una grabación introductoria publicada en 2020. Puede servir para escuchar otra explicación de los conceptos; por su antigüedad, no la uses para seguir instrucciones vigentes de consola o precios.
- **Panorama reciente:** [“Conoce el ecosistema de Amazon Web Services”, de AWS Girls Bolivia](https://www.youtube.com/watch?v=2BZ9-R0r2CA) se publicó en junio de 2026 y conversa sobre qué es AWS, qué es la nube y sus conceptos principales. Es una charla conceptual, no un paso a paso de implementación.
- **Primeros pasos en video:** [“Primeros pasos en AWS”, charla de Alexis Cuadrado en NERDflix](https://www.nerdearla.com/nerdflix/hhO6MOakJ-w/) (2023, en español) cubre la creación y seguridad inicial de una cuenta, los primeros despliegues y cómo evitar sorpresas en la factura. Antes de seguir acciones concretas, verifica la guía actual de AWS sobre cuentas, permisos y precios.
- **Curso guiado:** [“Fundamentos de AWS” de Marcia Villalba en Udemy](https://www.udemy.com/course/fundamentos-de-aws/) está en español, está dirigido a principiantes y dura 1 h 14 min según su ficha. No requiere conocimientos previos de AWS; el perfil técnico ayuda. Incluye seguridad de la cuenta, facturación, alertas y herramientas básicas. Revisa en Udemy el precio, acceso y condiciones vigentes.

Si prefieres aprender conversando, el [directorio de comunidades AWS](https://dondeaprendoaws.com/comunidades/) permite buscar grupos por país y tipo. Por ejemplo, el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) invita a personas interesadas en la nube sin exigir experiencia avanzada. El sitio del [AWS User Group Perú](https://awsugperu.cloud/) reúne su agenda, comunidades locales, grupos de estudio y recursos; revisa allí las condiciones de cada actividad.

Al revisar la agenda el 6 de octubre de 2026, Meetup anunciaba la sesión en línea [“Amazon VPC Essentials: Fundamentos de Networking”](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) para el miércoles 21 de octubre, de 18:00 a 20:00, hora de Colombia (GMT-5). El organizador la presenta para quienes empiezan o quieren fortalecer sus bases; indica cupos limitados y que el enlace para conectarse se muestra a las personas registradas. Confirma disponibilidad y detalles en la ficha. Si ya pasó la fecha, consulta la [agenda de próximos eventos AWS](/eventos/).

## Antes de probar servicios, revisa el costo

AWS no tiene una tarifa mensual única para todos sus servicios. La forma de cobro depende del servicio, la [Región](https://docs.aws.amazon.com/es_es/global-infrastructure/latest/regions/aws-regions-availability-zones.html) y el uso. Por ejemplo, EC2 factura el tiempo que una instancia bajo demanda permanece en ejecución; S3 puede cobrar por almacenamiento, solicitudes y transferencia de datos; y algunos componentes de red, como las direcciones IPv4 públicas, tienen precios propios. Las unidades y excepciones cambian según el producto, así que revisa la página de [precios de EC2](https://docs.aws.amazon.com/es_es/AWSEC2/latest/UserGuide/ec2-on-demand-instances.html), los [precios de S3](https://aws.amazon.com/es/s3/pricing/) y las condiciones de [Amazon VPC](https://docs.aws.amazon.com/es_es/vpc/latest/userguide/what-is-amazon-vpc.html) antes de crear recursos.

La [Calculadora de precios de AWS](https://calculator.aws/) sirve para estimar una carga de trabajo, pero la estimación no es una factura: el uso real puede cambiar el importe y podrían aplicarse impuestos, como explica la [documentación sobre las estimaciones](https://docs.aws.amazon.com/es_es/cost-management/latest/userguide/pricing-calculator.html). Un presupuesto de AWS puede avisarte cuando el gasto real o previsto supera un umbral; la información se actualiza periódicamente y las notificaciones pueden retrasarse. Para restringir recursos automáticamente hace falta configurar acciones del presupuesto, así que una alerta por sí sola no garantiza un límite de gasto. Consulta cómo [AWS Budgets sigue costos y uso](https://docs.aws.amazon.com/es_es/cost-management/latest/userguide/budgets-managing-costs.html).

Tampoco asumas que “nivel gratuito” significa que cualquier servicio será gratis. AWS ofrece distintos planes y créditos para cuentas nuevas; las condiciones dependen del plan, el saldo y la fecha de creación, y las cuentas existentes pueden conservar las condiciones anteriores. Para un cliente nuevo que elige el plan gratuito actual, el período termina al cumplirse seis meses o al agotarse los créditos, lo que ocurra primero, y el plan limita los servicios disponibles. Un plan de pago puede generar cargos por uso que supere los créditos o no esté cubierto por ellos. Revisa la [FAQ oficial del nivel gratuito de AWS](https://aws.amazon.com/es/free/free-tier-faqs/) y las condiciones del plan que corresponda a tu cuenta antes de crear recursos.

Con una tarea concreta, unos pocos servicios y una cuenta clara de costos y permisos, ya tienes una base para seguir aprendiendo AWS. Si estás armando tu plan desde cero, continúa con esta [ruta práctica en español para aprender AWS](/blog/aws-aprender-guia-inicial/).
