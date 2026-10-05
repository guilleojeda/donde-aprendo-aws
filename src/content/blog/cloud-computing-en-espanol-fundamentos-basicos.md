---
title: "¿Qué es cloud computing? Fundamentos y ejemplos de AWS"
description: "Entiende qué es la computación en la nube, las diferencias entre IaaS, PaaS y SaaS, los tipos de nube y conceptos de AWS como VPC, VPN, regiones y zonas de disponibilidad."
author: "guille-ojeda"
publishedAt: "2024-01-26"
publishedTimestamp: "2024-01-26T05:05:32.947Z"
modifiedTimestamp: "2026-10-05T20:34:07-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Cómo aprender AWS desde cero: ruta práctica en español"
    url: "https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/"
  - title: "Introducción a los servicios de Amazon Web Services"
    url: "https://dondeaprendoaws.com/blog/introduccion-a-los-servicios-de-amazon-web-services/"
  - title: "Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
  - title: "Clases de almacenamiento de Amazon S3: diferencias y cómo elegir"
    url: "https://dondeaprendoaws.com/blog/clases-de-almacenamiento-de-amazon-s3/"
---

La **computación en la nube** —o *cloud computing*— permite acceder por una red, como Internet, a recursos de tecnología, como servidores, redes y almacenamiento, cuando se necesitan. En vez de comprar y mantener todo el hardware, una persona u organización aprovisiona servicios de un proveedor y puede liberarlos después. AWS es uno de esos proveedores.

El concepto va más allá de “un servidor en otro lugar”: los recursos se ofrecen bajo demanda, se accede a ellos por la red y el uso se mide. El [NIST describe estas características y los modelos de nube](https://csrc.nist.gov/pubs/sp/800/145/final) como un marco para comparar servicios y formas de implementación.

## IaaS, PaaS y SaaS: ¿qué cambia entre los modelos?

Los nombres describen cuánta tecnología administra el proveedor y cuánta controlas tú. En términos generales, cuanto más completo es el servicio, menos infraestructura debes operar; tus responsabilidades sobre la aplicación, los datos y quién puede usarlos siguen existiendo.

En móvil, desliza las tablas hacia los lados para ver todas las columnas.

| Modelo | Qué administra principalmente el proveedor | En qué te concentras | Ejemplo sencillo |
|---|---|---|---|
| **IaaS** (infraestructura como servicio) | Centros de datos, hardware y virtualización | Sistema operativo, aplicación, datos y configuración de la máquina | Una máquina virtual en Amazon EC2 |
| **PaaS** (plataforma como servicio) | Infraestructura y buena parte del sistema y entorno de ejecución | Código de la aplicación, sus datos y configuración | Desplegar una aplicación con AWS Elastic Beanstalk |
| **SaaS** (software como servicio) | La aplicación completa y la infraestructura que la ejecuta | Cómo usas el software, sus usuarios y los datos que cargas | Correo web o una aplicación de gestión en el navegador |

Imagina que una escuela quiere publicar un portal de inscripciones. Con **IaaS**, el equipo alquila una máquina virtual y decide cómo instalar y mantener el sistema operativo y el portal. Con **PaaS**, entrega el código a una plataforma que se ocupa de más tareas de la infraestructura. Con **SaaS**, utiliza una aplicación ya construida para gestionar inscripciones, con menos control sobre su funcionamiento interno.

No son tres grados de calidad. Son distintas cantidades de control y trabajo operativo. Los límites concretos dependen del servicio; AWS resume estas diferencias en su guía de [conceptos básicos de nube](https://aws.amazon.com/es/getting-started/cloud-essentials/).

## Nube pública, privada e híbrida

Estos modelos responden otra pregunta: **cómo se organiza el entorno que ofrece la nube**. No son alternativas a IaaS, PaaS o SaaS; una organización puede combinar decisiones de ambas categorías.

- **Nube pública:** un proveedor ofrece servicios a muchos clientes sobre infraestructura compartida y aislada lógicamente. Cada cliente configura sus propios recursos y permisos. “Pública” no significa que los datos de un cliente sean visibles para otros.
- **Nube privada:** el entorno de nube se destina al uso exclusivo de una organización. Puede administrarlo esa organización o un proveedor, y puede estar en instalaciones propias o externas. Tener una nube privada no la vuelve segura por sí solo: la seguridad también depende de cómo se configura y opera.
- **Nube híbrida:** combina dos o más entornos de nube distintos —por ejemplo, infraestructura privada y nube pública— con mecanismos para mover o integrar aplicaciones y datos entre ellos. No basta con que una empresa tenga ambos; deben funcionar como partes conectadas de una arquitectura.

El NIST también define la **nube comunitaria**, compartida por organizaciones con necesidades o fines comunes. Aquí nos concentramos en los tres modelos más habituales al conversar sobre AWS.

### VPC y VPN no son tipos de nube privada

La palabra *private* en **Amazon VPC** puede confundir. Una VPC es una **red virtual aislada lógicamente dentro de AWS**: allí se ubican recursos como máquinas EC2 y se configuran rangos de direcciones, subredes y rutas. Sigue siendo parte del entorno de nube de AWS; no convierte una cuenta en una nube privada con infraestructura de uso exclusivo. Consulta la [definición de VPC en la documentación de AWS](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-inventory.html).

Una **VPN** es una conexión protegida entre redes o usuarios. Por ejemplo, una conexión AWS Site-to-Site VPN puede enlazar la red de una oficina con una VPC mediante túneles cifrados. La VPC es la red; la VPN es una forma de conectarla con otra. AWS explica esa [conexión entre una VPC y una red local](https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html).

## Escalabilidad y elasticidad: relacionadas, pero distintas

**Escalabilidad** es la capacidad de un sistema para manejar más o menos trabajo al cambiar su capacidad. Puede crecer verticalmente —dar más recursos a una máquina— u horizontalmente —añadir más máquinas—.

**Elasticidad** describe qué tan bien esa capacidad se ajusta a los cambios de demanda, tanto para crecer como para reducirse. Por ejemplo, el portal de la escuela podría añadir instancias durante el período de inscripción y retirarlas cuando baja el tráfico. En AWS, ese ajuste puede automatizarse con políticas de escalado, pero no ocurre solo por alojar una aplicación en la nube: alguien debe diseñar y configurar el comportamiento.

## Regiones y zonas de disponibilidad

Una **Región de AWS** es un área geográfica donde AWS ofrece infraestructura. Dentro de una Región hay varias **zonas de disponibilidad (AZ)**: ubicaciones aisladas entre sí, con centros de datos y servicios de energía y conectividad independientes. Una AZ no es sinónimo de Región ni un simple edificio. La página de [Regiones y zonas de AWS](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html) explica cómo considerar ubicación, servicios disponibles y cercanía a los usuarios.

Si el portal de inscripciones necesita continuar ante la falla de una zona, el equipo debe diseñarlo para usar más de una AZ y configurar cómo repartir el tráfico y mantener los datos. Elegir una Región no crea esa redundancia automáticamente. Replicar recursos en otra Región también requiere una decisión y configuración aparte.

## Responsabilidad compartida: AWS protege parte, tú proteges otra

En AWS, la seguridad es una responsabilidad compartida. AWS protege la **seguridad de la nube**, como sus centros de datos y la infraestructura física. El cliente se ocupa de la **seguridad en la nube**: por ejemplo, permisos, cuentas, aplicación, datos y configuración. La división concreta depende del servicio; con EC2 administras más componentes que con un servicio gestionado.

En el portal escolar, AWS opera la infraestructura subyacente, pero el equipo de la escuela decide quién puede consultar una inscripción, cómo se protegen las credenciales y qué datos guarda. La [explicación oficial del modelo de responsabilidad compartida](https://aws.amazon.com/es/compliance/shared-responsibility-model/) detalla cómo cambian las tareas según el servicio. La guía interna de [seguridad en AWS para principiantes](/blog/aws-seguridad-fundamentos-esenciales/) profundiza en permisos, datos y redes.

El pago por uso puede evitar comprar capacidad por adelantado, pero **no garantiza que la nube cueste menos**. Máquinas encendidas sin necesidad, almacenamiento y transferencia de datos pueden generar costos. El resultado depende de qué servicios se eligen, cómo se dimensionan y cuánto tiempo permanecen activos; consulta el modelo de [precios de AWS](https://aws.amazon.com/pricing/) antes de desplegar recursos.

## Durabilidad y disponibilidad en Amazon S3

En Amazon S3, **durabilidad** y **disponibilidad** no significan lo mismo. La durabilidad se refiere a la probabilidad de conservar un objeto sin perderlo; la disponibilidad, a que el servicio permita acceder a él. AWS describe para S3 Standard una durabilidad diseñada de **99,999999999 %** y una disponibilidad diseñada de **99,99 %** de los objetos durante un año. Los valores varían entre clases de almacenamiento; no son dos formas de decir “siempre disponible”. Consulta la [documentación actual de protección de datos de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DataDurability.html) antes de elegir una clase. Para comparar patrones de acceso, disponibilidad y condiciones de recuperación, sigue con la guía de [clases de almacenamiento de S3](/blog/clases-de-almacenamiento-de-amazon-s3/).

## Un primer paso que no requiere crear una cuenta

Para comprobar que entendiste el mapa, dibuja el portal de inscripciones en papel: una persona abre la web; la aplicación corre en una Región y una VPC; puedes marcar en qué AZ se ejecutaría; los archivos podrían guardarse en S3. Junto a cada pieza, anota quién la administra y qué ocurriría si aumenta el tráfico. No necesitas abrir una cuenta de AWS ni lanzar recursos para hacer este ejercicio.

Si prefieres una lectura guiada, [AWS Cloud Essentials](https://aws.amazon.com/es/getting-started/cloud-essentials/) introduce conceptos y modelos de servicio. Puedes leer esa página pública sin crear recursos en AWS; sus enlaces a tutoriales son otro paso y pueden tener requisitos propios. Como repaso visual de la comunidad, puedes consultar la presentación [Desmitificando la nube: una introducción amigable a AWS](https://speakerdeck.com/bnktch13/desmitificando-la-nube-una-introduccion-amigable-a-aws), compartida en Speaker Deck: son diapositivas de una charla, no un laboratorio ni una certificación.

Si prefieres escuchar otra explicación, la sesión grabada [«Introducción a la Nube y AWS» del AWS User Group Medellín](https://www.youtube.com/watch?v=HhPGckLLDWY) es un repaso comunitario. Es una charla individual, no un curso completo ni una guía de consola vigente. El canal [Cloud en Español](https://www.youtube.com/channel/UCjMLZUU8ep124ZZT-W2X4uA) también reúne grabaciones y encuentros en línea de distintos exponentes; los temas y el nivel varían según cada sesión.

Para pasar de los conceptos a un aprendizaje acompañado, el [portal de AWS User Group Perú](https://awsugperu.cloud/) reúne actividades, grupos locales, Cloud Clubs y recursos. Su página invita a personas de todos los niveles; revisa la agenda y las condiciones de cada encuentro antes de inscribirte. El [catálogo para aprender](/aprender/) permite comparar recursos por tema y nivel; en [creadores](/creadores/) puedes buscar canales y otros formatos, y en [comunidades](/comunidades/) y [eventos](/eventos/) consultar grupos, fechas, modalidades y condiciones. La disponibilidad, el costo y los requisitos dependen de cada actividad.

Si quieres una ruta paso a paso después de este glosario, continúa con [cómo aprender AWS desde cero](/blog/aws-aprender-guia-inicial/). Para conocer otros servicios más allá de EC2 y S3, sigue con la [introducción a los servicios de AWS](/blog/introduccion-a-los-servicios-de-amazon-web-services/).
