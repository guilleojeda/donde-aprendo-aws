---
title: "Fundamentos de AWS para principiantes: servicios, IAM y regiones"
description: "Entiende los servicios, las regiones, IAM y la responsabilidad compartida de AWS con el ejemplo de una aplicación y un ejercicio para empezar."
author: "guille-ojeda"
publishedAt: "2024-01-30"
publishedTimestamp: "2024-01-30T19:19:55.184Z"
modifiedTimestamp: "2026-10-05T12:59:21-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Cómo aprender AWS desde cero: ruta práctica en español"
    url: "https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/"
  - title: "AWS Free Tier: planes, créditos, límites y cargos"
    url: "https://dondeaprendoaws.com/blog/aws-free-tier-guia-para-principiantes-2024/"
---

Para entender los fundamentos de AWS no hace falta memorizar cientos de servicios. Empieza por cinco preguntas: **qué problema quieres resolver, qué servicio lo atiende, en qué Región estará, qué identidad puede usarlo y qué parte de la seguridad te corresponde**. Con esas respuestas ya puedes leer una arquitectura sencilla y practicar sin crear recursos.

AWS ofrece servicios de cómputo, almacenamiento, bases de datos, redes y otras áreas. El precio depende del servicio, la Región y el uso; algunos recursos generan cargos mientras permanecen activos, incluso si nadie los está usando. Si antes quieres revisar planes, créditos y límites, consulta la [guía actual del AWS Free Tier](/blog/aws-free-tier-guia-para-principiantes-2024/).

## Cinco ideas que organizan AWS

### Cuenta: recursos y facturación

Una cuenta reúne recursos, identidades, configuración y facturación de AWS. Por ejemplo, contiene los servicios con los que construyes tu aplicación.

### Servicios: herramientas para cada tarea

- [Amazon EC2](https://aws.amazon.com/es/ec2/) ofrece máquinas virtuales.
- [AWS Lambda](https://docs.aws.amazon.com/es_es/lambda/latest/dg/welcome.html) ejecuta código ante eventos o llamadas.
- [Amazon S3](https://docs.aws.amazon.com/es_es/AmazonS3/latest/userguide/Welcome.html) guarda objetos, como archivos.
- [Amazon DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html) es una base de datos NoSQL.

### Regiones y Zonas de Disponibilidad: ubicación

Una Región es un área geográfica de AWS que contiene varias Zonas de Disponibilidad. Cada Zona usa uno o más centros de datos separados. La Región influye en qué servicios puedes usar, dónde quedan los datos y qué latencia y precios aplican. No todas las cargas necesitan varias Zonas.

La [descripción oficial de la infraestructura global](https://docs.aws.amazon.com/es_es/whitepapers/latest/aws-overview/global-infrastructure.html) explica las Regiones y Zonas. En la consola, muchos recursos son regionales: si no encuentras una instancia EC2 o una VPC, comprueba primero que estés en la cuenta y la Región donde la creaste. Otros servicios tienen alcance distinto, así que confirma ese dato en la documentación del servicio.

### Identidades e IAM: quién puede hacer qué

La autenticación confirma quién inicia sesión; la autorización determina qué puede hacer esa identidad. [IAM](https://docs.aws.amazon.com/es_es/IAM/latest/UserGuide/introduction.html) controla el acceso a servicios y recursos de AWS. Por ejemplo, un rol de Lambda puede permitirle consultar solo la tabla que necesita.

En una aplicación, tus clientes se autentican en la aplicación; IAM decide qué identidades, personas o servicios pueden llamar a las APIs de AWS. El usuario raíz de la cuenta tiene acceso completo: protégelo con MFA y úsalo solo para las tareas que lo requieren, siguiendo las [prácticas recomendadas para el usuario raíz](https://docs.aws.amazon.com/es_es/IAM/latest/UserGuide/root-user-best-practices.html).

### Responsabilidad compartida: qué protege cada parte

El [modelo de responsabilidad compartida de AWS](https://aws.amazon.com/es/compliance/shared-responsibility-model/) muestra por qué no basta con que AWS opere centros de datos seguros. Con EC2, por ejemplo, el cliente mantiene el sistema operativo invitado y configura sus grupos de seguridad. En servicios administrados como S3 o DynamoDB, AWS gestiona más componentes, pero el cliente sigue siendo responsable de sus datos, permisos y ajustes de acceso.

## Sigue una aplicación pequeña

Imagina una lista de tareas que guarda cada cambio:

```text
Navegador → Amazon API Gateway → AWS Lambda → Amazon DynamoDB
                                  rol de IAM → permiso sobre la tabla
```

API Gateway recibe la petición web, Lambda ejecuta la lógica y DynamoDB conserva las tareas. El rol permite que la función de Lambda acceda a la tabla con los permisos necesarios; no entrega credenciales de AWS al navegador. Ese rol, por sí solo, no identifica a cada persona ni limita cuáles tareas puede ver: la aplicación debe autenticar a sus usuarios y comprobar en cada petición que solo accedan a los datos autorizados para su identidad. La aplicación y sus datos se crean en una Región elegida para ese diseño.

No necesitas desplegar esta arquitectura para practicar el razonamiento. En una hoja, etiqueta cada flecha con la acción que ocurre y responde:

1. ¿Qué servicio recibe la petición, cuál ejecuta la lógica y cuál guarda los datos?
2. ¿Qué identidad necesita permiso para leer o escribir en la tabla? ¿Qué permisos mínimos requiere?
3. ¿En qué Región pondrías los recursos y qué verificarías antes de elegirla?
4. ¿Qué administra AWS y qué debe configurar el equipo que desarrolla la aplicación?
5. ¿Qué aspectos del uso —por ejemplo, peticiones, almacenamiento o tiempo de cómputo— revisarías al estimar el costo?

Con este ejercicio puedes explicar la arquitectura antes de tocar una cuenta. Para ordenar conceptos y prácticas en una secuencia, sigue la [ruta para aprender AWS desde cero](/blog/aws-aprender-guia-inicial/).

## Cómo practicar después del ejercicio

Si quieres una actividad guiada, [AWS Cloud Quest](https://docs.cloudquest.skillbuilder.aws/coming-soon/index.html) ofrece un rol gratuito de Cloud Practitioner en AWS Skill Builder, con tareas de fundamentos, cómputo, redes, seguridad y bases de datos. AWS indica que la experiencia está disponible en español latinoamericano y que los laboratorios construyen soluciones en un entorno AWS en vivo. El rol gratuito es una oferta de formación, no una cuenta AWS sin costo para tus propios proyectos; antes de iniciar un laboratorio, comprueba el entorno y las condiciones que muestra AWS.

También puedes revisar la [sesión de IAM del AWS Cloud Practitioner Challenge del AWS User Group Buenos Aires](https://www.youtube.com/watch?v=j01Klr4fBkc), grabada el **3 de mayo de 2023**. Sirve para repasar el vocabulario de identidades y permisos; verifica los pasos de consola con la documentación vigente, porque las interfaces y las opciones de registro de AWS cambian.

## Aprende con una comunidad de AWS

Los grupos de usuarios son útiles para plantear dudas, escuchar cómo otras personas resuelven problemas y encontrar encuentros para principiantes. Busca uno por país en el [directorio de comunidades AWS](/comunidades/). Por ejemplo, el [AWS User Group Perú](https://awsugperu.cloud/) reúne User Groups locales, talleres y grupos de estudio; su página invita a personas de todos los niveles. Si estás en Argentina, el [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) publica encuentros y mantiene enlaces a sus espacios de conversación y grabaciones.

Para practicar redes con una comunidad, el AWS Student Builder Group de la Universidad Distrital de Bogotá anunció el encuentro virtual [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) para el **21 de octubre de 2026, de 18:00 a 20:00, hora de Bogotá (UTC−5)**. La descripción dice que es apto para quienes empiezan, requiere inscripción y tiene cupos limitados; la ficha no indica precio. Comprueba disponibilidad y condiciones al registrarte. Si la fecha ya pasó, busca otra actividad en la [agenda de eventos](/eventos/).

Si una duda llega al grupo, explica el resultado esperado, lo que ocurrió y en qué cuenta y Región estabas. Quita contraseñas, claves, identificadores de cuenta y datos privados antes de compartir capturas o mensajes de error.

## Preguntas frecuentes sobre los fundamentos de AWS

### ¿Qué Región debería elegir?

Compara la disponibilidad del servicio que necesitas, la latencia para tus usuarios, los requisitos de ubicación de datos y el precio. No asumas que la Región más cercana siempre es la correcta ni que un servicio ofrece las mismas funciones en todas las Regiones.

### ¿AWS usa un lenguaje de programación?

AWS no tiene un único lenguaje. Los servicios admiten distintos lenguajes y formas de trabajar; AWS Lambda, por ejemplo, ofrece runtimes compatibles con varios lenguajes. Para entender los fundamentos, primero relaciona los servicios con el problema. Elige un lenguaje cuando tu objetivo requiera escribir código y revisa los [runtimes disponibles para Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html).

### ¿Por qué no encuentro la instancia o la VPC que creé?

Comprueba que hayas iniciado sesión en la cuenta correcta y que la consola esté en la Región donde creaste el recurso. Después verifica que estás mirando el servicio y la lista adecuados y que tu identidad tiene permiso para consultarlos. Una lista vacía no demuestra que el recurso se haya eliminado: cambiar de cuenta o de Región puede mostrar un conjunto distinto.
