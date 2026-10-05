---
title: "Cómo aprender AWS desde cero: ruta práctica en español"
description: "Aprende AWS desde cero con una ruta en español: conceptos básicos, práctica sin cuenta propia, seguridad, costos y comunidades para avanzar."
author: "guille-ojeda"
publishedAt: "2024-01-26"
publishedTimestamp: "2024-01-26T04:07:45.093Z"
modifiedTimestamp: "2026-10-05T00:04:02-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
indexOrder: 4
ogImage: "/assets/blog/editorial-fundamentos.png"
related: []
---

Para aprender AWS desde cero, empieza por **entender qué problema resuelve la nube, reconocer unos pocos servicios y completar una práctica pequeña**. Después busca una comunidad donde conversar sobre lo que hiciste. Puedes dar esos primeros pasos sin programar, sin pagar un curso y sin abrir una cuenta personal de AWS.

Esta ruta organiza el aprendizaje por resultados: explicar una idea, completar un ejercicio y decidir qué estudiar después. No necesitas terminar todos los servicios ni preparar un examen para empezar a usarla.

## Qué necesitas saber antes de empezar

AWS, o Amazon Web Services, ofrece servicios de cómputo, almacenamiento, bases de datos y redes, entre otros. En vez de comprar y mantener toda la infraestructura, eliges los recursos que necesitas y sus condiciones de uso. La [introducción oficial a AWS](https://docs.aws.amazon.com/whitepapers/latest/aws-overview/introduction.html) explica ese modelo.

Te ayudará entender qué es un archivo, una aplicación y una conexión a internet. **Saber programar no es un requisito para aprender los fundamentos**: puedes leer, usar diagramas y seguir laboratorios de consola. Si tu objetivo es desarrollar aplicaciones, más adelante sí necesitarás un lenguaje para escribir su lógica; aprovecha uno que ya conozcas.

Para una primera explicación en español, mira [la clase Introducción a la Nube y AWS, del AWS User Group Medellín](https://www.youtube.com/watch?v=HhPGckLLDWY). Es una charla introductoria, no un tutorial que debas copiar de principio a fin. Después intenta describir un caso propio: guardar archivos de un proyecto, ejecutar una aplicación o analizar ventas.

## Paso 1: relaciona los servicios con problemas concretos

Empieza con este vocabulario. Cada fila responde una pregunta distinta; no describe una arquitectura que debas desplegar completa.

| Servicio o concepto | Pregunta e idea que conviene entender |
|---|---|
| Amazon S3 | **¿Dónde guardo un archivo?** Almacenamiento de objetos: un archivo y su información asociada. Guardarlo no lo hace público automáticamente. |
| Amazon EC2 | **¿Dónde ejecuto un servidor?** Una máquina virtual que debes configurar y administrar dentro de tus responsabilidades. |
| AWS Lambda | **¿Cómo ejecuto código ante una petición o un evento?** Una función sin administrar sus servidores; debes decidir su código, permisos y configuración. |
| AWS IAM | **¿Quién puede leer o modificar un recurso?** Identidades y permisos. No es un servicio para guardar los datos de la aplicación. |
| Región de AWS | **¿Dónde estarán muchos de esos recursos?** Una ubicación geográfica que eliges; afecta disponibilidad de servicios, precios y ubicación de los datos. |

Para profundizar en almacenamiento, la [sesión del AWS User Group Buenos Aires sobre S3, EBS y EFS](https://www.youtube.com/watch?v=GqYKhnqDDeI) ayuda a distinguir objetos, discos y sistemas de archivos. Para identidades, [Marcia Villalba explica usuarios, roles, grupos y permisos de IAM](https://www.youtube.com/watch?v=t51vW-BDwF0). Las grabaciones presentan conceptos; verifica los pasos de configuración con la documentación vigente antes de reproducirlos en una cuenta.

**Comprueba tu comprensión:** imagina que quieres guardar una imagen que solo tú puedes consultar. Explica dónde la guardarías, qué identidad podría leerla y en qué Región la crearías. Si todavía no sabes configurar los permisos, está bien: distinguir esas tres decisiones es el resultado de este paso.

## Paso 2: haz una práctica sin abrir una cuenta personal de AWS

[AWS Educate](https://aws.amazon.com/es/education/awseducate/) ofrece formación y laboratorios gratuitos para principiantes. Puedes registrarte desde los 13 años con un correo, sin tarjeta ni cuenta de AWS; la [FAQ de los programas educativos de AWS](https://aws.amazon.com/training/awsacademy/faq/) distingue Educate de Academy.

Dentro de Educate, busca **Getting Started with Storage**. AWS lo presenta como una práctica con S3 que incluye almacenamiento y alojamiento de una web estática. Necesitas registrarte para entrar al entorno; confirma el idioma disponible en la actividad. No es el mismo ejercicio que mantener privado un archivo en tu propia cuenta.

1. Lee el objetivo y las instrucciones antes de crear recursos.
2. Completa la actividad dentro del entorno del laboratorio.
3. Comprueba el resultado que pide el ejercicio y observa quién puede acceder al contenido.
4. Sigue el cierre del laboratorio y anota qué hiciste, qué verificaste y qué no entendiste.

Si ves una consola distinta a la de una grabación, usa las instrucciones actuales del laboratorio. No intentes resolver esa diferencia haciendo público un bucket personal o ampliando permisos sin entenderlos.

Una nota útil al terminar sería: “Guardé una página en S3, comprobé cómo se accede a ella y ahora quiero entender la diferencia entre un objeto privado y un sitio público”. Una insignia de aprendizaje reconoce una actividad; no equivale a aprobar una certificación.

## Paso 3: protege el acceso y entiende los costos antes de practicar por tu cuenta

Crear una cuenta propia tiene sentido cuando quieres repetir ejercicios fuera de un laboratorio. **No hace falta para ver una charla o empezar en Educate.** También conviene distinguir el [AWS Builder ID de una cuenta de AWS](https://docs.aws.amazon.com/signin/latest/userguide/differences-builder-id.html): el primero se utiliza en servicios como Skill Builder; no es por sí mismo una cuenta que aloje y facture tu infraestructura.

Para nuevos clientes elegibles, AWS permite elegir entre **Free plan** y **Paid plan**. El plan Free termina a los seis meses o cuando agotas sus créditos, lo que ocurra primero, y restringe servicios y funciones. Al terminar, la cuenta se cierra y pierdes acceso; AWS conserva el contenido durante 90 días para que puedas pasar a Paid antes de la eliminación. El plan Paid puede facturar consumo no cubierto. Algunas acciones, como unirse a AWS Organizations, convierten automáticamente el plan Free en Paid. Consulta la [comparación actual de planes](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html).

El registro de una cuenta personal requiere un método de pago válido, incluso con Free plan, según las [preguntas frecuentes del Free Tier](https://aws.amazon.com/free/free-tier-faqs/). Las cuentas anteriores al 15 de julio de 2025 tienen condiciones distintas. “Doce meses gratis” no describe de forma general una cuenta creada hoy.

Antes de tu primer ejercicio en esa cuenta:

- **Protege el usuario raíz con MFA y resérvalo para las tareas que lo requieren.** Sigue la [guía de protección de la cuenta raíz](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html) y configura el acceso cotidiano según las [buenas prácticas de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html), que priorizan credenciales temporales. No copies claves en repositorios.
- **Comprueba el precio, los créditos y la limpieza del ejercicio.** Un aviso de [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html) puede ayudarte a vigilar el gasto; el aviso no bloquea por sí solo recursos y sus datos llegan con retraso.
- **Empieza con un objetivo pequeño y verificable.** Estos [diez laboratorios de AWS para principiantes](/blog/10-laboratorios-practicos-de-aws-para-principiantes/) incluyen pasos, comprobaciones y limpieza. Elige uno, no toda la lista en una sola sesión.

La [sesión de monitoreo y gestión de recursos del AWS User Group Medellín](https://www.youtube.com/watch?v=2cGwdSTdUqQ) te permite situar las herramientas de seguimiento. Cuando necesites investigar un gasto concreto, la [guía para analizar costos con Cost Explorer](/blog/analisis-de-costos-de-aws-con-cost-explorer/) desarrolla ese siguiente paso.

## Paso 4: aprende con una comunidad, aunque estés empezando

Una comunidad puede ayudarte a encontrar otra explicación, conversar sobre una decisión o conocer experiencias de uso. No necesitas llegar con una certificación ni esperar a dominar AWS.

- **[AWS User Group Guatemala](https://www.meetup.com/aws-guatemala/):** consulta sus encuentros y continúa con el [canal de grabaciones del grupo](https://www.youtube.com/@awsugguatemala), que reúne charlas y sesiones de estudio. Busca una sesión que responda tu siguiente pregunta.
- **[AWS User Group Medellín](https://www.meetup.com/awsugmed/):** su página permite conocer la actividad del grupo y los encuentros. El [Cloud Practitioner Challenge grabado](https://www.youtube.com/playlist?list=PLhbdvasxz8wwO-b9nlRBYYzY6n5CvSOvj) ofrece una secuencia para repasar fundamentos a tu ritmo; una grabación no implica que haya una cohorte abierta ahora.
- **[AWS Girls Perú](https://awsgirlsperu.com/):** publica rutas de certificación, recursos y acceso a su comunidad en Meetup. Su sitio declara que recibe a todas las personas y contempla niveles desde principiantes; revisa cada convocatoria para conocer modalidad y requisitos.
- **[AWS Women Colombia](https://awswomencolombia.com/):** puedes explorar artículos y el [archivo de sus encuentros](https://awswomencolombia.com/page/eventos). Es útil para estudiar con materiales de la comunidad aunque no puedas asistir en vivo.

En el [directorio de comunidades](/comunidades/) puedes elegir por país, modalidad e interés. Si estudias, revisa también los [Student Builder Groups](/comunidades/?format=Student+Builder+Group); comprueba las condiciones de participación de cada grupo.

Para aprender redes con otras personas, la sesión en línea [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/), del grupo estudiantil de la Universidad Distrital de Bogotá, está anunciada para el **21 de octubre de 2026, de 18:00 a 20:00, hora de Bogotá (UTC−5)**. Trata subredes, rutas y conexiones; requiere inscripción, tiene cupos limitados y el enlace virtual se muestra a asistentes. La convocatoria no indica precio. Si la fecha ya pasó, busca otra actividad en la [agenda de eventos en línea](/eventos/?mode=online).

Lleva una pregunta que pueda investigarse: “El laboratorio usa S3 para una web, pero yo quiero guardar imágenes privadas: ¿qué debería cambiar?”. Para errores, explica el resultado esperado, el mensaje recibido y lo que ya comprobaste. Quita credenciales y datos privados de capturas o fragmentos de configuración.

## Paso 5: elige el siguiente tema por lo que quieres conseguir

**Para trabajar con los fundamentos**, sigue estudiando almacenamiento, cómputo, permisos y redes. Una explicación por tema y una comprobación propia permiten detectar mejor qué te falta que acumular cursos completos.

**Para certificarte**, pasa a los [recursos en español para AWS Cloud Practitioner](/blog/recursos-en-espanol-para-certificacion-aws-cloud-practitioner/): allí la guía oficial del examen define qué estudiar. Un curso o una insignia no otorga AWS Certification automáticamente; la [FAQ de certificación de AWS](https://aws.amazon.com/certification/faqs/) explica el proceso.

**Para desarrollar aplicaciones**, empieza por una función pequeña. La [introducción a Lambda y serverless de Marcia Villalba](https://www.youtube.com/watch?v=1wNb_RMvI9E) te ayuda a reconocer ese modelo antes de seguir un tutorial de API. No necesitas construir de inmediato una aplicación con todos los servicios de la tabla.

**Para elegir cursos, lecturas y canales gratuitos según tu nivel**, continúa con [Aprender AWS gratis en español](/blog/aprender-aws-gratis-recursos-y-comunidad/). Esa guía reúne alternativas para seguir avanzando; esta ruta te ayuda a decidir el orden inicial.

## Preguntas frecuentes al aprender AWS desde cero

### ¿Tengo que saber programar para aprender AWS?

Puedes empezar por fundamentos, permisos, costos y laboratorios de consola sin escribir código. Programar será necesario cuando el objetivo sea desarrollar la lógica de una aplicación. No hay un lenguaje obligatorio para todos los caminos de AWS.

### ¿Puedo aprender AWS sin tarjeta de crédito?

Sí: ver recursos públicos y practicar en AWS Educate no exige abrir una cuenta personal de infraestructura. Registrarte en una cuenta de AWS es otro proceso y tiene requisitos de pago propios; no confundas ambos accesos.

### ¿Cuánto tiempo necesito para aprender AWS?

Depende de tu objetivo y de tus conocimientos previos. Usa resultados para medir el avance: explicar un servicio, completar un laboratorio, identificar sus permisos y cerrar los recursos. Esta ruta no promete un plazo para dominar AWS ni conseguir empleo.

### ¿Qué hago si no entiendo un laboratorio?

Vuelve al objetivo y localiza el paso donde cambió el resultado. Comprueba la Región, la identidad y el mensaje de error antes de repetir acciones. Después busca una explicación del concepto o plantea la duda al grupo con ese contexto.
