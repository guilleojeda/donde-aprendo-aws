---
title: "Qué es AWS Wavelength y cuándo conviene usarlo"
description: "Qué es AWS Wavelength, cuándo aporta valor y cómo comprobar cobertura, conectividad, escalado, latencia y costos antes de desplegar."
author: "guille-ojeda"
publishedAt: "2024-05-19"
publishedTimestamp: "2024-05-19T00:37:00.331Z"
modifiedTimestamp: "2026-10-05T12:46:00-03:00"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
  - title: "Conceptos básicos y avanzados de Amazon VPC"
    url: "https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/"
---

**[AWS Wavelength](https://docs.aws.amazon.com/wavelength/latest/developerguide/what-is-wavelength.html)** coloca recursos de cómputo y almacenamiento de AWS dentro de redes de operadores móviles. Extiende una VPC de una región de AWS hasta una *Wavelength Zone* para ejecutar allí la parte de una aplicación que necesita responder cerca de dispositivos conectados a la red del operador. Conviene evaluarlo cuando acercar ese procesamiento puede mejorar una métrica concreta de latencia o ancho de banda local; no es una garantía de respuesta instantánea ni un reemplazo de una región.

La diferencia clave está en la ubicación: la Wavelength Zone se administra desde una región principal y se conecta a ella. Puedes conservar en la región los datos persistentes, las funciones compartidas y los componentes que toleran más latencia, mientras ejecutas en el borde solo el tramo sensible al tiempo.

## Cuándo tiene sentido usar AWS Wavelength

Wavelength puede ser una opción para procesamiento de video en vivo, realidad aumentada, analítica inmediata de dispositivos móviles o aplicaciones industriales conectadas por una red móvil. En estos escenarios, reducir saltos de red entre el dispositivo y el cómputo puede ser útil si una prueba con usuarios reales confirma una mejora que importa al producto.

Por ejemplo, una aplicación de asistencia visual puede enviar un fotograma desde un teléfono a una instancia EC2 en una Wavelength Zone cercana. Allí, un servicio de inferencia identifica un objeto y devuelve una indicación al teléfono. La región principal puede alojar el sitio de administración, distribuir versiones del modelo y guardar resultados. Así, solo la ida y vuelta interactiva depende del cómputo cercano; el diseño no requiere copiar toda la plataforma al borde.

Antes de avanzar, responde estas preguntas:

- ¿Los usuarios o dispositivos están en una ciudad y una red móvil donde AWS ofrece una zona de Wavelength?
- ¿La aplicación necesita que el cómputo esté cerca del dispositivo, o bastaría con una región, una caché u otra opción de edge?
- ¿La mejora medida cumple un objetivo de latencia o experiencia que compense el precio y la operación adicionales?
- ¿Los tipos de instancia, almacenamiento, servicios y cuotas disponibles en esa zona alcanzan para la carga?

Si el tráfico no llega desde una red móvil participante, si el requisito es distribuir contenido estático a escala global o si la aplicación tolera bien la latencia regional, compara primero con la región, una CDN o las demás opciones de edge. La página de [ubicaciones de AWS Wavelength](https://aws.amazon.com/wavelength/locations/) cambia con la disponibilidad; verifica la ciudad, el operador y la región principal antes de diseñar. También consulta con el operador qué plan móvil y condiciones de acceso aplican.

## Cómo se conectan la región, la VPC y la zona de Wavelength

Una Wavelength Zone es una extensión lógica de una región de AWS, no una región independiente. Creas en la región una VPC y una subred asociada a la zona. La puerta de enlace de carrier conecta esa subred con la red del operador. Para que un dispositivo móvil llegue a una instancia, se asocia a su interfaz una dirección IP de carrier, que la puerta de enlace traduce mediante NAT.

Una dirección IP de carrier no debe tratarse como un punto público abierto. La puerta de enlace conecta la zona con la red móvil y permite tráfico saliente, pero las reglas de ingreso desde fuera de esa red dependen del operador y del tipo de conectividad. AWS documenta excepciones de multiacceso: por ejemplo, Orange admite ingreso desde fuera de su red, mientras que Verizon no; ambos admiten algunos otros flujos. Comprueba la matriz vigente de [Multi-access AWS Wavelength](https://docs.aws.amazon.com/wavelength/latest/developerguide/multi-access.html) para tu operador y zona. El acceso móvil también depende de la ubicación y la red compatibles. La puerta de enlace de carrier usa IPv4; revisa las [consideraciones de red, EC2, EBS y cuotas](https://docs.aws.amazon.com/wavelength/latest/developerguide/wavelength-quotas.html) para las limitaciones vigentes.

Si quieres repasar VPC, subredes, tablas de rutas y grupos de seguridad antes de preparar una prueba, consulta esta guía de [conceptos básicos de Amazon VPC](/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/). Para Wavelength, sigue además la documentación de [cómo funciona la conectividad](https://docs.aws.amazon.com/wavelength/latest/developerguide/how-wavelengths-work.html), que explica la relación entre las rutas, la puerta de enlace de carrier y la dirección IP de carrier.

## Despliegue y prueba de conectividad

El recorrido inicial es corto, aunque algunos pasos dependen de la zona y del operador elegidos:

1. **Confirma la ubicación y los límites.** Selecciona una ciudad y un operador disponibles. Comprueba en la cuenta qué zona puedes habilitar, cuáles son las cuotas y si los tipos de instancia, volúmenes y servicios necesarios están disponibles allí. Los servicios que funcionan en una región no están todos disponibles en cada Wavelength Zone.
2. **Habilita la zona en la región principal.** Antes de crear recursos, activa la Wavelength Zone para la cuenta y región correspondientes.
3. **Extiende la VPC.** Crea una subred en la zona y configura la puerta de enlace de carrier y una tabla de rutas para esa subred. Revisa las rutas y las reglas de grupos de seguridad y ACL de red para permitir solo el tráfico que tu aplicación necesita.
4. **Lanza una instancia de prueba.** Asigna una dirección IP de carrier y ejecuta un servicio mínimo. Puedes mantener en una subred regional una instancia de control con la misma versión de la aplicación.
5. **Prueba desde el lugar correcto.** Primero comprueba la conectividad entre la región y la instancia de borde. Luego prueba desde un teléfono o equipo conectado a la red móvil participante, con Wi-Fi desactivado, hacia la dirección de carrier. Una solicitud HTTPS de la aplicación valida más que un ping aislado: verifica también respuesta, errores y registros.

Que EC2 esté cerca del dispositivo no cambia tus responsabilidades sobre el sistema operativo, los permisos o los datos. Los [fundamentos de seguridad en AWS](https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/) te ayudan a distinguir esos controles antes de exponer el servicio de prueba.

La guía oficial para [empezar con AWS Wavelength](https://docs.aws.amazon.com/wavelength/latest/developerguide/get-started-wavelength.html) cubre la activación, la VPC, la subred, la puerta de enlace, el lanzamiento de EC2 y las pruebas iniciales. Si publicas la aplicación para otros usuarios, define por separado cómo atenderás a clientes que lleguen desde internet o desde otra red móvil.

## Cómo medir si la menor distancia mejora tu aplicación

Wavelength busca acercar el cómputo al dispositivo, pero la latencia total también depende del teléfono, la señal, la red y el operador, la ruta, las colas y el tiempo que tarda el código en procesar cada solicitud. El resultado puede variar por ciudad, hora y carga. No asumas que 5G implica automáticamente menos de 10 ms.

Compara la misma operación con la aplicación en la región y en la Wavelength Zone, usando dispositivos reales de la red objetivo y una carga representativa. Repite las mediciones en las ubicaciones y horarios relevantes. Registra percentiles de latencia de extremo a extremo —por ejemplo p50, p95 y p99—, errores y, para tráfico interactivo, variación de latencia y pérdida de paquetes. Mide el tiempo de red por separado del tiempo de procesamiento para saber qué cambió. Un ping ayuda a revisar conectividad y recorrido, pero no representa por sí solo la experiencia de la aplicación.

AWS describe una comparación con transacciones TCP de solicitud y respuesta desde un dispositivo móvil hacia una instancia regional y otra de Wavelength. La reducción observada cambia según la zona y el operador; el valor útil es el de tu propia carga y tus usuarios. Consulta el método de [medición de latencia entre Wavelength y una región](https://aws.amazon.com/blogs/industries/lower-access-latency-for-your-apps-with-aws-wavelength-and-our-telco-partners/) como referencia para armar una prueba comparable.

## Escalabilidad y disponibilidad

La documentación actual incluye Amazon EC2 Auto Scaling entre los servicios que pueden usarse con Wavelength. Un grupo de escalado puede mantener la capacidad deseada y ajustar instancias según una política y métricas de CloudWatch; dimensiona límites y señales con el comportamiento observado de la aplicación. El escalado de EC2 agrega capacidad de cómputo: por sí solo no determina a qué zona llega cada dispositivo ni garantiza que el operador tenga más capacidad de red.

El balanceador también requiere comprobar la zona concreta. AWS Application Load Balancer está disponible solo en algunas Wavelength Zones; Network Load Balancer no está admitido allí y el balanceo entre varias Wavelength Zones no está admitido. Revisa la sección actual de [balanceo y arquitectura para Wavelength](https://docs.aws.amazon.com/wavelength/latest/developerguide/architecture.html) antes de asumir que una topología regional se puede copiar tal cual.

Además, instancias en dos Wavelength Zones distintas dentro de una misma VPC no pueden comunicarse directamente. Para comunicación entre zonas, la guía de AWS indica usar VPC separadas y conectarlas mediante Transit Gateway. Evalúa esa complejidad solo cuando el caso de uso la necesite. Para disponibilidad, conserva los datos persistentes en la región y diseña una ruta de respaldo en una zona de disponibilidad distinta de la zona principal; define cómo dirigirás a los clientes a esa ruta si falla el borde. AWS resume este enfoque de región como núcleo y zonas de edge como extensiones en su guía de [resiliencia para Wavelength](https://docs.aws.amazon.com/wavelength/latest/developerguide/disaster-recovery-resiliency.html).

## Costos y ajustes operativos

No extrapoles el precio de una instancia regional. EC2 y otros recursos de Wavelength pueden tener tarifas distintas a las de la región principal; la página de precios indica que las instancias EC2 se ofrecen bajo demanda en Wavelength y que pueden aplicarse Instance Savings Plans. Por eso, Spot no es una opción de compra para esas instancias. Estima por separado cómputo, almacenamiento, transferencia de datos entre la zona y la región, balanceo si está disponible, registros y operación del entorno. Consulta los precios vigentes en [AWS Wavelength](https://aws.amazon.com/wavelength/pricing/) y prepara una estimación por ubicación antes de comprometer capacidad.

Para controlar el gasto, acerca al borde solo la parte sensible a la latencia, reduce llamadas sincrónicas innecesarias a servicios en la región y conserva allí lo que requiere persistencia o se comparte entre zonas. Etiqueta los recursos de prueba y producción por aplicación y ubicación, revisa consumo y transferencia en los informes de costos, y define una alerta de presupuesto. En operación, combina métricas de EC2 y CloudWatch con métricas de la aplicación: latencia por ruta, solicitudes fallidas, instancias saludables y saturación. Así puedes distinguir una falta de capacidad de un problema de cobertura, ruta o procesamiento.

Si necesitas una introducción en español a métricas, registros y trazas, el recurso [Observabilidad en la nube de AWS: CloudWatch, X-Ray y CloudTrail](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m) explica estas herramientas de forma general; úsalo para preparar instrumentación y diagnóstico, y consulta la documentación de Wavelength para límites propios de la zona.

Si haces una prueba con recursos reales, calcula el costo antes de lanzarla y fija cuándo termina. Al finalizar, verifica en EC2 y VPC que se hayan eliminado las instancias, los volúmenes o snapshots que ya no necesites, las direcciones IP de carrier y el balanceador y los recursos de red que dependan de ellos. Después revisa los cargos cuando la información de facturación esté disponible.

## Recursos y comunidad

Para comparar alternativas antes de desplegar, el episodio en español [Diferentes opciones de edge computing en AWS](https://www.youtube.com/watch?v=ii7Ve7WjbOI) presenta Wavelength junto con otras opciones. Se publicó en 2021: úsalo para orientarte en los conceptos y confirma disponibilidad, límites y precios en la documentación actual de AWS.

Si quieres conversar sobre diseño de VPC y conectividad, puedes seguir al [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/). Al revisar esta guía también figuraba una sesión virtual de [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) para el 21 de octubre de 2026, organizada por un Student Builder Group de Bogotá. Es una sesión sobre fundamentos de VPC, no un taller específico de Wavelength; verifica cupos y horario en el registro. Para encontrar próximas actividades y otros grupos, consulta la [agenda de eventos en línea](/eventos/online/) y el [directorio de comunidades AWS](/comunidades/).

## Preguntas frecuentes

### ¿AWS Wavelength reduce siempre la latencia?

No hay un valor garantizado para toda aplicación, ciudad y operador. La ubicación puede acortar el recorrido de red, pero mide con usuarios y solicitudes reales, y compara la respuesta completa con la alternativa regional.

### ¿Cualquier teléfono 5G puede conectarse a una Wavelength Zone?

Tener 5G no basta. El acceso depende de la zona, el operador y el tipo de conexión admitido, incluidas las excepciones de multiacceso. Verifica cobertura, plan y condiciones con el operador. AWS también describe tráfico móvil 4G/LTE en su documentación, pero el acceso disponible depende del despliegue concreto.

### ¿La dirección IP de carrier es una IP pública para cualquier usuario de internet?

No siempre. El acceso depende del operador, la zona y el tipo de conexión: AWS documenta ingreso desde fuera de la red del operador para algunos socios y lo restringe para otros. Revisa la matriz de multiacceso y prueba desde la red que utilizarán tus clientes antes de diseñar una entrada pública.

### ¿Puedo usar cualquier servicio de AWS en Wavelength?

No. EC2, EBS, VPC y algunos servicios de administración están documentados para Wavelength, mientras que otros servicios, tipos de instancia y balanceadores dependen de la zona. Revisa la disponibilidad y las cuotas de la ubicación antes de diseñar.
