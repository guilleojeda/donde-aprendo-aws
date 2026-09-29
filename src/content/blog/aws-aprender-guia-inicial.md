---
title: "Aprender AWS desde cero: una ruta práctica con recursos en español"
description: "Empieza a aprender AWS con una práctica gratuita, recursos de comunidades en español y una ruta para elegir tu siguiente paso sin perder de vista la seguridad y los costos."
publishedAt: "2024-01-26"
publishedTimestamp: "2024-01-26T04:07:45.093Z"
cover: "/assets/blog/9eb7bc020e08de9a43291902.jpg"
coverAlt: "Ilustración de una nube con iconos de aprendizaje y seguridad"
ogImage: "/assets/blog/9eb7bc020e08de9a43291902.jpg"
related: []
---

*Revisado el 29 de septiembre de 2026.*

Aprender AWS no exige memorizar un catálogo de servicios ni programar desde el primer día. Lo útil es entender qué problema resuelve cada herramienta, hacer una práctica pequeña y encontrar a otras personas con quienes seguir aprendiendo. Puedes empezar sin abrir una cuenta de AWS: hay explicaciones y laboratorios gratuitos que te permiten descubrir si este camino te interesa antes de desplegar recursos por tu cuenta.

**Si hoy empiezas desde cero, sigue este orden:** elige una explicación introductoria en español, haz una práctica guiada y luego busca una comunidad donde compartir lo que aprendiste. Esta guía te ayuda a tomar esas decisiones sin convertir tus primeros pasos en una lista interminable de productos.

## Primero, entiende qué estás usando

AWS (Amazon Web Services) ofrece servicios para ejecutar aplicaciones, guardar datos y conectar sistemas en centros de datos de distintas regiones. En lugar de comprar y mantener toda esa infraestructura, eliges servicios y pagas según las condiciones de uso de cada uno. Eso da flexibilidad, pero también te obliga a decidir qué recursos crear, quién puede usarlos y cuánto pueden costar.

Para orientarte, basta con distinguir cuatro ideas:

- **Amazon S3** guarda objetos, como archivos e imágenes. Si practicas en tu propia cuenta, empieza con objetos privados; aprender S3 no exige hacer público un bucket.
- **Amazon EC2** ofrece máquinas virtuales. Tú sigues siendo responsable de configurar y mantener mucho de lo que instalas en ellas.
- **AWS Lambda** ejecuta código cuando ocurre un evento, sin que tengas que administrar el servidor que lo ejecuta. Tampoco significa que cualquier aplicación construida así sea gratuita.
- **AWS Identity and Access Management (IAM)** controla quién puede hacer qué. Los permisos importan desde la primera práctica, incluso si los datos son de prueba.

Una **región** es el área geográfica donde eliges desplegar muchos recursos. Elige una conscientemente: influye en la ubicación de los datos, la disponibilidad de servicios y el precio. No necesitas aprender redes, bases de datos y contenedores antes de comprender estas bases.

Tampoco hay un lenguaje de programación obligatorio para «usar AWS». Puedes empezar sin programar; cuando quieras automatizar o construir una aplicación, aprovecha el lenguaje que ya conozcas y aprende las herramientas de AWS que necesite ese proyecto.

Si prefieres empezar leyendo, [Fernando Paz explica qué es AWS en Cloud IO Strategy](https://cloudiostrategy.com/que-es-aws/). Si prefieres un video, [Cultura DevOps presenta una introducción a AWS](https://www.youtube.com/watch?v=QDiSRZhUuvw). Ambos materiales son de 2022: elige **uno** para entender los conceptos y verifica cifras, condiciones de cuenta y precios en las fuentes actuales.

**Comprueba que entendiste lo esencial:** imagina que quieres guardar una imagen privada para una aplicación. ¿Qué servicio guardaría el archivo? ¿Quién debería poder leerlo? ¿En qué región lo crearías? Si puedes responderlo con tus palabras, ya tienes una base para practicar. No hace falta escoger EC2, Lambda o una base de datos para ese ejemplo.

## Practica sin abrir una cuenta de AWS

Para una primera experiencia, [AWS Educate](https://aws.amazon.com/education/awseducate/) ofrece aprendizaje autodirigido y laboratorios prácticos gratuitos sin exigir una cuenta de AWS ni una tarjeta. Sí necesitarás registrarte en Educate. Allí busca **«Getting Started with Storage»**: AWS lo presenta como una práctica de almacenamiento y alojamiento de un sitio estático con Amazon S3. La página pública lleva al registro; la actividad se abre dentro de Educate.

Sigue las instrucciones dentro del laboratorio. Al terminar, anota qué recurso usaste, cómo comprobaste el resultado y si algún contenido quedó accesible públicamente. Si el ejercicio no explica los permisos, conviértelos en tu siguiente pregunta. No reproduzcas una configuración de publicación en tu propia cuenta sin revisar antes la seguridad y los costos. Una insignia digital de Educate reconoce una actividad de aprendizaje; no es una certificación de AWS.

Si te preguntas por qué ese ejercicio usa S3 en vez de un disco o un sistema de archivos, la [sesión de almacenamiento del AWS User Group Buenos Aires](https://www.youtube.com/watch?v=GqYKhnqDDeI) compara S3, EBS y EFS. Es una grabación de 2023: úsala para distinguir los conceptos y consulta las guías actuales de AWS antes de seguir pasos de consola.

Puedes acompañar esa práctica con [la explicación breve de IAM de Marcia, de Desplegando Cloud](https://www.youtube.com/watch?v=t51vW-BDwF0), para reconocer la diferencia entre una identidad y sus permisos. Es una introducción a los conceptos; para configurar tu propia cuenta, sigue las guías actuales de AWS enlazadas más abajo.

Después de la práctica, intenta contarle a alguien qué hiciste en tres frases: «Quería lograr X; usé Y porque sirve para Z; comprobé el resultado de esta manera». Si no conoces aún los permisos o el costo implicados, ya sabes qué averiguar. Esa explicación vale más que una lista de nombres de servicios memorizados.

## Si decides crear tu propia cuenta, empieza con control

Una cuenta personal puede servirte para repetir ejercicios fuera de un laboratorio. Antes de crearla, revisa el [AWS Free Tier actual](https://aws.amazon.com/free/) y la [comparación entre Free plan y Paid plan](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html). Para cuentas nuevas ya no vale la regla general de «12 meses de AWS gratis»: el plan gratuito tiene créditos, límites de servicios y una duración propia; el plan pago puede generar cargos. Comprueba las condiciones que aparezcan durante tu registro en vez de asumir un método de pago o una promoción universal.

Si abres la cuenta, haz estas tres cosas antes de seguir una guía que cree recursos:

1. **Protege la identidad raíz con MFA** y no la uses en tareas cotidianas. La [guía oficial de AWS para la cuenta raíz](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html) explica las medidas iniciales. Para el acceso habitual, sigue las [buenas prácticas actuales de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html), que favorecen identidades humanas con credenciales temporales; no crees usuarios y claves permanentes por costumbre.
2. **Revisa créditos, límites y costos** del servicio y la región que usarás. Puedes crear un [presupuesto en AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html) para recibir avisos. Un aviso por sí solo no detiene cargos: las [acciones de Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html) se configuran aparte y los datos de facturación pueden llegar con retraso.
3. **Cierra cada práctica comprobando la limpieza.** Sigue las instrucciones del laboratorio y verifica los recursos que siguen existiendo. [Detener una instancia EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html), por ejemplo, no elimina sus volúmenes EBS, que pueden seguir generando cargos.

Si quieres entender para qué sirve cada herramienta de seguimiento, la [sesión de monitoreo y costos del AWS User Group Medellín](https://www.youtube.com/watch?v=2cGwdSTdUqQ), grabada en 2025, relaciona Budgets, Cost Explorer, CloudWatch y CloudTrail. Úsala para distinguir sus funciones; para configurar una alerta sigue la documentación actual de AWS.

No necesitas lanzar una aplicación con EC2, una base de datos y una red propia para demostrar que aprendiste AWS. Una práctica guiada y pequeña te permite entender mejor una decisión a la vez. Si ya elegiste practicar en tu cuenta, [estos diez laboratorios para principiantes](https://dondeaprendoaws.com/blog/10-laboratorios-practicos-de-aws-para-principiantes/) describen resultados que puedes comprobar, recursos de la comunidad para profundizar y pasos de limpieza. Empieza solo por uno y revisa sus costos antes de crear nada.

## Elige tu siguiente paso según tu objetivo

Después de los fundamentos, no hay una única ruta correcta. Elige el propósito que más se parece al tuyo:

### Entender AWS para el trabajo o los estudios

Continúa con la explicación inicial y elige un servicio que puedas describir a otra persona. Cuando termines una práctica, busca en el archivo de videos de [eScalando AWS](https://www.youtube.com/@eScalandoAWS) una explicación del servicio que acabas de usar. Si prefieres leer, explora [AWS Español en DEV](https://dev.to/aws-espanol). El [directorio de creadores](https://dondeaprendoaws.com/creadores/) reúne otras voces. Escoge **un material** que responda a tu siguiente pregunta; no necesitas seguir todos los canales.

### Preparar una certificación

Primero decide si un examen aporta valor a tu objetivo. Para una primera clase de repaso, mira la [sesión inicial de Cloud Practitioner del AWS User Group Querétaro](https://www.youtube.com/watch?v=FzWYdmKYxjM). Si prefieres un recorrido de varias sesiones, el [Cloud Practitioner Challenge del AWS User Group Medellín](https://youtube.com/playlist?list=PLhbdvasxz8wwO-b9nlRBYYzY6n5CvSOvj) ofrece grabaciones de 2025. Puedes seguirlas desde cualquier país; contrasta siempre el temario y los datos de costos con la documentación vigente.

Para preparar un examen, continúa con la [guía específica de recursos en español para Cloud Practitioner](https://dondeaprendoaws.com/blog/recursos-en-espanol-para-certificacion-aws-cloud-practitioner/), que indica el temario vigente y distingue recursos antiguos de actuales. Los cursos gratuitos y sus insignias no equivalen a aprobar una [AWS Certification](https://aws.amazon.com/certification/faqs/).

Para comprobar lo que entendiste, pausa antes de cada respuesta en las [diez preguntas tipo CLF-C02 explicadas por Joan Amengual](https://www.youtube.com/watch?v=IydkkZO-feI) y anota por qué elegirías una opción. Es práctica creada por un autor de la comunidad, no un banco oficial ni una muestra de las preguntas reales del examen.

### Crear una aplicación

Si ya desarrollas aplicaciones, elige primero qué parte quieres construir y qué servicio resuelve ese problema. Si vienes del frontend, la [conversación de República Web con Marcia Villalba sobre AWS para frontend](https://www.youtube.com/watch?v=-zy7nGPyEKQ) te ayudará a reconocer opciones para alojar aplicaciones y conectar un backend. Es una grabación de 2023 para orientarte, no una guía de consola actual. Para construir algo pequeño con instrucciones revisadas y limpieza, sigue en orden los laboratorios de Lambda y API de la guía enlazada arriba.

### Profundizar en seguridad

Vuelve a la protección de la cuenta; después mira la [sesión de identidad y seguridad del AWS User Group Medellín](https://www.youtube.com/watch?v=PWcl1vwGCrc), grabada en 2025. Te ayuda a distinguir autenticación, autorización y permisos. Para configurar controles en tu cuenta, contrasta los pasos con las buenas prácticas actuales de IAM enlazadas antes.

Hay más materiales en español en [Aprender AWS](https://dondeaprendoaws.com/aprender/?level=inicial). La etiqueta «inicial» ayuda a filtrar el catálogo, pero también aparecen recursos antiguos, grabaciones sin versión de examen indicada y temas específicos. Elige por la pregunta que quieras resolver y comprueba la vigencia de cualquier procedimiento.

## Aprende con otras personas

No hace falta vivir en una ciudad determinada para formar parte de la comunidad. Puedes explorar los [AWS User Groups de Latinoamérica hispanohablante](https://dondeaprendoaws.com/comunidades/?format=User+Group), buscar [Student Builder Groups](https://dondeaprendoaws.com/comunidades/?format=Student+Builder+Group) si estudias —comprueba la institución y los requisitos de participación de cada grupo—, o mirar los [próximos eventos en línea](https://dondeaprendoaws.com/eventos/?mode=online). Si los horarios no te sirven, el [archivo de grabaciones de AWS Women Colombia](https://awswomencolombia.com/page/eventos) reúne charlas anteriores que puedes ver desde cualquier país; revisa las fechas antes de usar una explicación de producto como guía actual.

Llega con una pregunta pequeña y concreta: «Usé S3 en un laboratorio y la página se abrió en mi navegador, pero no entiendo qué configuración permitió verla». Es más fácil recibir ayuda útil con esa pregunta que con «¿cómo aprendo todo AWS?». Y cuando una explicación de la comunidad te sirva, visita el material original y compártelo con su autoría: así otras personas también podrán encontrar a quien lo creó.

**Tu primer paso hoy:** elige la explicación de Fernando Paz o el video introductorio de Cultura DevOps, anota una idea que antes no entendías y realiza un laboratorio introductorio en AWS Educate. Al terminar, explica qué intentaste hacer, qué resultado comprobaste y qué pregunta te quedó. Ya tendrás una base concreta para seguir aprendiendo con la comunidad.
