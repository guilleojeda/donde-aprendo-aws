---
title: "5 casos de startups en AWS: arquitectura y lecciones prácticas"
description: "Aprende de Epistemix, CreditVidya, STIGMA, Ramp y Ava Labs: decisiones de SaaS, datos, IA y contenedores, con fuentes y recursos en español."
author: "guille-ojeda"
publishedAt: "2024-05-13"
publishedTimestamp: "2024-05-13T02:42:31.872Z"
modifiedTimestamp: "2026-10-04T21:31:45-03:00"
review:
  date: "2026-10-04"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related: []
---

**Epistemix, CreditVidya, STIGMA, Ramp y Ava Labs ofrecen cinco casos para aprender cómo una startup puede usar AWS.** Cada uno responde a una pregunta distinta: cómo incorporar clientes a un SaaS, organizar datos para machine learning, introducir IA con revisión humana, ejecutar contenedores sin administrar sus servidores y crear infraestructura bajo demanda.

Son casos históricos publicados entre 2021 y 2023, con una experiencia técnica de CreditVidya que abarca 2017–2020. Describen las decisiones de ese momento; no certifican la arquitectura actual de las empresas ni que sigan en etapa de startup. Tampoco demuestran que AWS haya causado su éxito comercial. Lo útil es entender el problema, la decisión y la evidencia antes de llevar una idea a tu proyecto.

| Caso | Qué está documentado | Qué puedes estudiar |
| --- | --- | --- |
| Epistemix | Trabajo con AWS SaaS Factory para mejorar la incorporación de usuarios | Cómo entregar un producto SaaS a clientes externos |
| CreditVidya | Plataforma Medhas de AI/ML en AWS y un data lake descrito por su responsable técnico | Separar almacenamiento, transformación y consulta |
| STIGMA | Mensajes generados con IA y revisados por personas antes de publicarse | Dónde colocar la revisión humana |
| Ramp | ALB, ECS con Fargate, Aurora y ElastiCache | Qué trabajo operativo delegan los servicios administrados |
| Ava Labs | Uso de EC2 e instancias aprovisionadas dinámicamente para nodos y redes | Automatizar la creación de entornos |

## 1. Epistemix: un SaaS necesita algo más que capacidad de cómputo

Epistemix desarrolló una plataforma de simulaciones basadas en agentes y poblaciones sintéticas. Su desafío era ponerla en manos de científicos de datos externos: el software funcionaba, pero la experiencia de uso necesitaba mejorar. En el [caso publicado por AWS en diciembre de 2022](https://startups.aws.com/learn/saas-founder-series-epistemix-on-how-software-simulations-can-create-more-empathetic-decision-making), John Cordier explica que AWS SaaS Factory ayudó a mejorar la incorporación de usuarios al producto.

El resultado descrito es cualitativo. La fuente no ofrece una medición de latencia, ahorro o crecimiento atribuible a esa mejora, ni identifica EC2 o Lambda como componentes de la solución.

**Lección para tu proyecto:** dibuja el recorrido desde el registro hasta el primer resultado útil. Anota qué necesita una persona nueva, qué pasos dependen de soporte y cómo comprobarías que el recorrido mejora. Es una propuesta de práctica, no una reconstrucción de la arquitectura de Epistemix.

Para profundizar en SaaS, la [SaaS Lens de AWS Well-Architected](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/saas-lens.html) ofrece una revisión específica de aplicaciones con varios clientes. Para una conversación en español sobre la etapa inicial del negocio, mira [«De Cero a Startup, superando curvas con AWS», en Charlas Técnicas](https://www.youtube.com/watch?v=cWFiPg0SAA0). Uno examina diseño; el otro aporta contexto de emprendimiento.

## 2. CreditVidya: aprender ML también exige aprender a organizar datos

El [ebook de AWS sobre machine learning en servicios financieros, de 2021](https://d1.awsstatic.com/psc-digital/2021/gc-400/mining-insights-fsi-/AWS_Mining_Intelligent_Insights_with_Machine_Learning_Financial_Services_eBook.pdf) describe Medhas, la plataforma de CreditVidya, que utilizaba datos de pagos, comportamiento financiero y dispositivos para evaluar solicitudes de crédito. El caso aparece en la página 6.

Una fuente técnica más detallada es [el relato de Nilesh Bhosale, publicado en marzo de 2023](https://medium.com/@nileshxbhosale/9-things-you-need-to-know-about-building-datalake-b180832b21f), basado en su trabajo al frente del equipo de ingeniería de datos entre 2017 y 2020. Describe S3 como almacenamiento, Glue y EMR para transformaciones con Spark, Athena para consultas y Lambda para coordinar eventos. Reporta una ingesta superior a 100 GB diarios de datos sin comprimir; esa cifra corresponde a su experiencia histórica.

**Lección para tu proyecto:** sigue el camino de un dato desde su llegada hasta la consulta que lo utiliza. Guardarlo no basta: necesitas entender su esquema, calidad y permisos. Practica con datos ficticios y un conjunto pequeño antes de intentar reproducir una plataforma financiera.

La [guía de Carlos Fernando Chicata sobre patrones de calidad de datos en AWS](https://builder.aws.com/content/38FHhvbpTgp8u2kbHBCHumOR1tK/es-implementando-patrones-de-calidad-de-datos-en-aws-una-guia-tecnica-general) ayuda a decidir cómo validar datos y qué hacer con los que no pasan los controles. Es una continuación de ingeniería de datos, no un curso para construir un modelo de riesgo crediticio.

Si tu siguiente objetivo es entrenar y evaluar un modelo, la [selección de repositorios para aprender ML en AWS](/blog/10-repositorios-de-github-para-machine-learning-en-aws/) distingue fundamentos, ejemplos de SageMaker AI y MLOps. Elige por esa tarea y revisa sus requisitos; conocer la arquitectura de un data lake no prueba la calidad de un modelo.

## 3. STIGMA: la revisión humana forma parte de la función de IA

STIGMA era una aplicación de mensajería asincrónica sobre experiencias de salud mental. En el [caso de AWS del 18 de septiembre de 2023](https://aws.amazon.com/blogs/startups/how-stigma-scaled-their-hope-delivery-app-with-the-aws-impact-accelerator/), la empresa cuenta su participación en la cohorte para fundadores latinos de AWS Impact Accelerator.

El equipo lanzó una función de mensajes de esperanza generados con IA mientras los miembros esperaban una respuesta humana. Los mensajes se identificaban como generados por IA y pasaban por moderadores humanos antes de publicarse. La publicación documenta ese lanzamiento y sus controles, pero no detalla qué servicio AWS ejecutaba los modelos ni ofrece mediciones de capacidad o latencia.

**Lección para tu proyecto:** define qué salida puede publicarse automáticamente, cuál debe revisarse y cómo verá el usuario esa distinción. En este caso, la revisión previa era una decisión del producto, no un detalle añadido después del modelo.

Para estudiar una aplicación de IA en español con componentes identificados, lee [cómo Alexandra Fernández integró Kiu con Sessionize](https://community.aws/content/2s8GaGrxZZPB5KIoOOrlzJsXob2/kiu-y-sessionize-transformando-la-gesti-n-de-eventos-en-aws-user-groups). Describe Bedrock, Lambda, DynamoDB y la integración con WhatsApp para consultar información de eventos. Es otro proyecto, de la comunidad: te permite examinar un flujo concreto sin suponer que reproduce STIGMA.

## 4. Ramp: serverless también puede significar contenedores

El [caso de Ramp publicado por AWS en febrero de 2023](https://startups.aws.com/learn/building-serverless-on-aws-to-scale-ramps-fast-growing-finance-automation-platform) describe una plataforma de automatización financiera. Su tráfico llegaba a un Application Load Balancer; los servidores web se ejecutaban en ECS con Fargate. La arquitectura incluía Aurora y ElastiCache para Redis.

Sus responsables de infraestructura destacaban el menor trabajo de administración de servidores y la facilidad para crear y retirar entornos de prueba. También describían una configuración de recuperación en otra región para el componente que autorizaba transacciones de tarjetas. Son testimonios y decisiones técnicas; el artículo no ofrece un porcentaje medido de mejora de productividad.

**Lección para tu proyecto:** compara el trabajo que conservarías al ejecutar tu aplicación en una máquina virtual con el que delegarías al usar contenedores administrados. La necesidad de recuperación de un autorizador de tarjetas tampoco convierte varias regiones en un requisito para cualquier producto mínimo viable.

Puedes continuar con el [workshop de ECS de Rossana Suarez](https://github.com/roxsross/workshop-ecs), que incluye una aplicación de ejemplo, pasos para ECS y un entorno local con Docker. Cuando ya comprendas un despliegue, su [laboratorio de despliegues canary en ECS](https://github.com/roxsross/aws-ecs-canary-in-action) añade una práctica de actualización gradual y una versión local sin cuenta AWS. Los repositorios son públicos; ejecutarlos en AWS requiere una cuenta, permisos y revisar los costos de los recursos que crean.

Para ampliar las opciones de diseño, Lucas Vera Toro explica [tres patrones serverless sin Lambda de su charla en el Community Day Colombia 2025](https://blog.lucasdev.info/aws-community-day-colombia-2025-lecciones-de-mi-charla-lambdaless-serverless-sin-lambda). Sirve para reconocer integraciones directas entre servicios antes de agregar una función que solo los conecte.

## 5. Ava Labs: distingue la plataforma de blockchain de la infraestructura

En el [caso de Ava Labs publicado en enero de 2023](https://startups.aws.com/learn/building-application-specific-blockchains-with-aws-on-avalanche), AWS describe el uso de EC2 para Avalanche y el aprovisionamiento dinámico de instancias para crear nodos, redes de prueba y blockchains específicas de aplicaciones, llamadas *Subnets* en esa publicación.

La fuente también describe el lanzamiento de nodos validadores desde AWS Marketplace. Eso no demuestra que Avalanche utilizara Amazon Managed Blockchain: alojar nodos en EC2 y usar un servicio administrado de blockchain son decisiones diferentes.

**Lección para tu proyecto:** separa el software de dominio de los recursos que lo ejecutan. Un ejercicio útil es explicar qué se automatiza al crear un entorno y qué sigue siendo responsabilidad del equipo. No necesitas desplegar un nodo ni adquirir activos digitales para aprender esa distinción.

## Cómo convertir los casos en una práctica útil

Elige el caso que se parezca a tu problema y escribe tres cosas: qué comportamiento necesitas, qué decisión quieres probar y qué resultado demostraría que funciona. Por ejemplo:

- **SaaS:** una persona nueva puede llegar a su primer resultado sin intervención del equipo. Observa pasos y errores del recorrido.
- **Datos:** una transformación rechaza un registro inválido y conserva uno válido. Comprueba ambos resultados antes de agregar más volumen.
- **Aplicación:** un despliegue permite identificar errores y volver a una versión anterior. Comprueba el comportamiento, no solo que el contenedor arrancó.

Son ejercicios propuestos a partir de las lecciones, no resultados reportados por las empresas. Si te faltan fundamentos, empieza por [la ruta para aprender AWS desde cero](/blog/aws-aprender-guia-inicial/). Si quieres una primera práctica en cuenta propia, [los diez laboratorios para principiantes](/blog/10-laboratorios-practicos-de-aws-para-principiantes/) incluyen resultados comprobables y limpieza; los ejercicios de S3, Lambda y registros son buenas bases para entender estos casos.

### Evalúa los costos de tu carga, no los de otra empresa

Un porcentaje de ahorro de un caso no estima tu factura. Para tu prueba, registra región, volumen de solicitudes, almacenamiento, tiempo de cómputo y transferencias. Incluye los componentes que permanezcan activos entre pruebas y el trabajo de operación.

La [sesión de AWS Women Colombia sobre Pricing Calculator](https://www.youtube.com/watch?v=e_oVCKBMnkA) muestra un ejercicio de estimación. La [conversación de Charlas Técnicas sobre FinOps](https://www.youtube.com/watch?v=3XJEQebQEYU) aporta contexto para relacionar consumo con valor. La [sesión de monitoreo y gestión de recursos del AWS User Group Medellín](https://www.youtube.com/watch?v=2cGwdSTdUqQ) ayuda a distinguir Budgets, Cost Explorer y CloudWatch. Úsalas como explicaciones grabadas; introduce los precios y condiciones actuales en [AWS Pricing Calculator](https://calculator.aws/) antes de desplegar.

## Continúa con comunidades y conversaciones en español

Para el contexto de negocio, [«Mundo Startup en AWS» de Charlas Técnicas](https://www.youtube.com/watch?v=atS80I2Mqts) conversa con una integrante del equipo de startups de AWS en Chile sobre las primeras etapas. Para otra voz de la comunidad, [«Construyendo una Startup en AWS» de AWS Women Colombia](https://www.youtube.com/watch?v=4BYhdeDD4Mo) ofrece una sesión dedicada al tema. El [archivo de Charlas Técnicas](https://podcast.marcia.dev/) permite seguir otras conversaciones de cloud y tecnología; no equivale a una ruta de laboratorio.

Si quieres contrastar tu diagrama o llevar una duda:

- [AWS Women Colombia](https://awswomencolombia.com/) reúne artículos y enlaces a sus eventos. Puedes empezar por los materiales públicos y consultar las condiciones del encuentro al que quieras asistir.
- [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) organiza encuentros sobre desarrollo serverless. Lleva una pregunta sobre un flujo concreto, como qué ocurre si falla un consumidor de una cola.
- [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) ofrece encuentros de la comunidad y enlaza su canal de grabaciones. Es una opción local si estás cerca; revisa modalidad y agenda para cada actividad.

Al revisar esta guía el **4 de octubre de 2026**, el catálogo incluía dos encuentros en línea relacionados: [«EC2 vs Lambda», de Tlaxcala FireflyCloud, el 16 de octubre de 2026](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/), para comparar alternativas de cómputo, y [«El Combo Indestructible de AWS: SQS + Lambda», de Serverless Colombia, el 20 de octubre de 2026](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/), sobre tolerancia a errores. Las fichas indican que el enlace de conexión es visible para asistentes. Confirma inscripción, horario y cambios con los organizadores; cuando hayan pasado, consulta la [Agenda de eventos](/eventos/) y los [grupos por país](/comunidades/).

## Preguntas frecuentes

### ¿AWS es siempre la mejor opción para una startup?

Estos casos no permiten afirmarlo. Evalúa tu carga, los conocimientos del equipo, las necesidades de datos y la operación que puedes sostener. Una arquitectura útil para un autorizador de tarjetas o una plataforma de simulaciones puede añadir trabajo innecesario a tu primer producto.

### ¿AWS Activate financia cualquier proyecto?

[AWS Activate Credits](https://aws.amazon.com/startups/credits/) requiere cumplir condiciones y presentar una solicitud. A la fecha de revisión, AWS indicaba, entre otros criterios, etapa anterior a Series B, fundación en los últimos diez años y una cuenta AWS en plan pago. Las modalidades Founders y Portfolio tienen condiciones distintas; Portfolio requiere el identificador de un Activate Provider. Consulta la página vigente para importes, elegibilidad y términos. Un caso antiguo no garantiza los mismos beneficios hoy.

### ¿Necesito copiar una arquitectura completa para aprender de un caso?

No. Empieza por una decisión comprobable: el recorrido de un usuario, una transformación de datos o un despliegue pequeño. Después busca el recurso que responda a tu siguiente duda en [aprender AWS](/aprender/) o visita a los autores del [directorio de creadores](/creadores/). La meta es poder explicar por qué elegiste cada componente y qué evidencia tienes de que cumple su función.
