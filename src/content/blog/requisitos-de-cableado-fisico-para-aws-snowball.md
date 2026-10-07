---
title: "Cableado para AWS Snowball Edge: puertos, cables y disponibilidad"
description: "Revisa qué cables, módulos de red, alimentación y configuración necesita AWS Snowball Edge. Confirma primero si tu cuenta puede solicitarlo."
author: "guille-ojeda"
publishedAt: "2025-05-01"
publishedTimestamp: "2025-05-01T03:33:14.998000+00:00"
modifiedTimestamp: "2026-10-07T10:00:50-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "AWS Snowmobile: retiro del servicio y alternativas de migración"
    url: "https://dondeaprendoaws.com/blog/migracion-de-datos-con-aws-snowmobile-guia-paso-a-paso/"
  - title: "Redes en AWS Outposts: service link, BGP y gateway local"
    url: "https://dondeaprendoaws.com/blog/10-consejos-de-redes-para-aws-outposts/"

---

**Antes de comprar cables, confirma que tu cuenta puede usar AWS Snowball Edge:** desde el 7 de noviembre de 2025, AWS solo lo ofrece a clientes existentes, según el [aviso de disponibilidad del servicio](https://docs.aws.amazon.com/snowball/latest/developer-guide/snowball-edge-availability-change.html) y su [anuncio oficial](https://aws.amazon.com/blogs/storage/aws-snow-device-updates/). Si ya tienes un dispositivo y un trabajo aprobado, la [guía actual de hardware](https://docs.aws.amazon.com/snowball/latest/developer-guide/device-differences.html) documenta enlaces RJ45 de 1 o 10 Gb/s, SFP de 10 o 25 Gb/s y un puerto QSFP cuyo detalle depende del modelo. AWS no incluye cables de red ni ópticas; sí incluye el cable de alimentación específico para el país. La guía oficial tiene datos contradictorios sobre QSFP, así que no compres esa óptica sin confirmar el modelo exacto con AWS.

Esta guía resume el cableado físico de AWS Snowball Edge, cómo elegir una interfaz, qué preparar para la red local y qué revisar si no hay enlace o el dispositivo es inaccesible. Está pensada para clientes que ya cuentan con un Snowball Edge: las especificaciones no implican que el servicio esté disponible para una cuenta nueva.

## Primero confirma la disponibilidad y el modelo

AWS anunció que, desde el **7 de noviembre de 2025**, Snowball Edge está disponible solo para clientes existentes. El cambio no afecta a clientes que ya usan el servicio, pero una cuenta, región o ubicación puede tener condiciones propias. Si tu organización ya trabajó con Snowball, confirma en la consola de AWS Snow Family o con AWS Support si tu cuenta puede crear otro trabajo antes de planificar la transferencia. Si eres cliente nuevo, no hagas una lista de compra todavía: revisa las alternativas más abajo.

La guía de hardware actual enumera dos configuraciones: **Snowball Edge Storage Optimized de 210 TB** y **Snowball Edge Compute Optimized**, con hasta 104 vCPU y 28 TB NVMe dedicados a instancias. Que una configuración aparezca en la documentación no garantiza que se pueda solicitar desde todas las cuentas o regiones: AWS advierte que los tipos de dispositivo disponibles dependen de la región y del tipo de trabajo en la [guía para crear un trabajo](https://docs.aws.amazon.com/snowball/latest/developer-guide/create-job-common.html). Consulta también la [lista de regiones admitidas](https://docs.aws.amazon.com/snowball/latest/developer-guide/limits.html).

La región del trabajo y el país de entrega son dos condiciones distintas. AWS dice que el dispositivo solo puede importar o exportar datos en la región donde se pidió y recomienda iniciar sesión en la consola desde la región de los datos de S3. Por separado, la dirección de envío debe ser válida para el país de destino: AWS no envía dispositivos entre países dentro de una misma región, salvo los países de la Unión Europea que enumera en sus [restricciones de envío por región](https://docs.aws.amazon.com/snowball/latest/developer-guide/shipping.html). Confirma la región, el bucket y el país de entrega juntos en la consola antes de planificar el trabajo; una región disponible no implica envío a cualquier país.

AWS retiró modelos anteriores —incluidos los Snowball Edge de 80 TB y algunas variantes de cómputo— en noviembre de 2024, como detalla el [aviso de actualización de Snow](https://aws.amazon.com/blogs/storage/aws-snow-device-updates/). No uses una ficha de un equipo anterior como prueba de que esa variante sigue disponible ni asumas que sus puertos coinciden con los del equipo recibido. Identifica el modelo concreto de tu trabajo y usa su guía de hardware vigente.

## Qué cable de red usa Snowball Edge

El dispositivo ofrece conexiones RJ45, SFP y QSFP. AWS dice que se utiliza **una sola interfaz de red a la vez**; no conectes varios puertos para sumar su velocidad. La velocidad final también depende de que el puerto del switch, la tarjeta de red del servidor, el transceptor y el cable sean compatibles entre sí. Estos requisitos resumen el apartado de [hardware de red compatible con Snowball Edge](https://docs.aws.amazon.com/snowball/latest/developer-guide/device-differences.html).

### RJ45: cable UTP para 1 o 10 Gb/s

Hay dos puertos RJ45, pero solo uno es utilizable. Para 1 Gb/s, AWS no especifica una categoría de cable UTP. Para 10 Gb/s, pide **Cat6A** y limita la distancia operativa a **55 m**.

### SFP: transceptores o DAC para 10 o 25 Gb/s

La interfaz SFP28 admite 10 o 25 Gb/s y es compatible con módulos SFP+ y SFP28. Tú aportas los transceptores y la fibra o el cable DAC:

- **10 Gb/s:** SFP+ con 10GBASE-LR para fibra monomodo, 10GBASE-SR para multimodo o un DAC SFP+.
- **25 Gb/s:** SFP28 con 25GBASE-LR para fibra monomodo, 25GBASE-SR para multimodo o un DAC SFP28.

Escoge la óptica y la fibra como un par compatible con el puerto del switch; para un DAC, comprueba la compatibilidad en ambos extremos. AWS indica que verificó cables y módulos SFP+ y QSFP+ de Mellanox y Finisar, pero esa nota no certifica cualquier módulo o cable de cualquier fabricante.

### La advertencia sobre QSFP

La misma página de hardware de AWS muestra **100 Gb/s QSFP28** para Storage Optimized de 210 TB y Compute Optimized. Más abajo, en la sección de hardware de red compatible, describe una interfaz **QSFP+ de 40 Gb/s** para equipos Storage Optimized y **40/50/100 Gb/s** para equipos Compute Optimized. También mezcla ejemplos y nomenclatura QSFP+ y QSFP28. Como esas indicaciones no coinciden, esta guía no recomienda comprar una óptica QSFP por la velocidad que aparece en una sola tabla. Confirma el número de modelo y la compatibilidad con AWS antes de preparar ese enlace.

La velocidad de 1 Gb/s por RJ45 funciona, pero AWS no la recomienda para transferencias grandes porque aumenta mucho el tiempo necesario. Para usar 10 Gb/s por RJ45 necesitas Cat6A y respetar el máximo de 55 m. No extrapoles esa longitud a fibra o DAC: el límite depende del módulo y del cable elegidos.

## Alimentación y espacio para instalar el equipo

Snowball Edge llega con un cable de alimentación específico para el país; **los cables de red y las ópticas los pones tú**. Las [fichas actuales](https://docs.aws.amazon.com/snowball/latest/developer-guide/device-differences.html) especifican 100–240 V CA. Comprueba la etiqueta y la ficha del dispositivo que recibiste, además de que la toma y el cable suministrado correspondan al lugar de instalación.

Deja accesibles la pantalla frontal y los conectores traseros. Durante el uso, mantén abiertas las puertas frontal y trasera: permiten la ventilación y AWS advierte que cerrarlas puede provocar un apagado por temperatura. El equipo no necesita una conexión a Internet para conectarse a la red local.

Antes de encenderlo, verifica que el switch sea Gigabit o superior. AWS indica en sus [requisitos de red](https://docs.aws.amazon.com/snowball/latest/developer-guide/snowball-prereqs.html) que Snowball Edge no admite switches solo de 10/100 Mb/s. Prepara una única conexión entre el equipo y el switch que corresponda a la interfaz elegida; confirma de antemano el puerto, la velocidad negociada y, si usas fibra, el tipo de óptica y fibra en ambos extremos.

## Conexión de red y dirección IP

1. Abre las puertas frontal y trasera para acceder a la pantalla y los puertos, y deja espacio para que circule el aire. Sigue el procedimiento de [conexión a la red local](https://docs.aws.amazon.com/snowball/latest/developer-guide/getting-started.html).
2. Conecta el cable de alimentación incluido y el cable de red que preparaste. Usa una sola interfaz física.
3. Enciende el equipo y espera a que la pantalla indique que está listo.
4. En la pantalla LCD, abre **CONNECTION** y consulta la dirección IP. El equipo solicita una dirección DHCP de forma predeterminada; si tu diseño lo requiere, desde esa pantalla puedes asignar una dirección estática.
5. Conecta la computadora de administración a una red que pueda alcanzar esa dirección. Luego sigue la guía del trabajo para obtener sus credenciales y desbloquearlo.

No desconectes el dispositivo ni cambies su configuración de red mientras está en uso: AWS advierte que podría dañarse la transferencia de datos. Si la política del sitio exige una dirección estática, asígnala y verifica la conectividad antes de empezar la copia.

## Lista de comprobación antes de transferir datos

- [ ] AWS confirmó que tu cuenta y región pueden usar el servicio y que el dispositivo del trabajo es el que esperas.
- [ ] Identificaste una interfaz y su velocidad, en vez de basarte solo en que el conector encaje.
- [ ] Tienes el cable de red, DAC o transceptores y fibra apropiados; AWS no los incluye.
- [ ] Para 10 Gb/s por RJ45, el cable es Cat6A y no supera 55 m.
- [ ] El switch admite Gigabit y la velocidad se negocia como esperabas.
- [ ] La red local permite llegar a la dirección IP que muestra la pantalla LCD.
- [ ] Hay alimentación compatible, ventilación y acceso a la pantalla y a los puertos.
- [ ] La dirección IP y el cableado están definidos antes de iniciar; no necesitarás cambiarlos durante la copia.

## Diagnóstico rápido de conexión

| Síntoma | Qué revisar |
| --- | --- |
| No enciende | Comprueba el cable de alimentación del país, la toma y el estado de encendido del dispositivo. |
| El RJ45 enlaza a 1 Gb/s y la copia es lenta | La luz ámbar indica 1 Gb/s; para 10 Gb/s, verifica el cable Cat6A, el límite de 55 m y que el switch también negocie a 10 Gb/s. AWS no recomienda 1 Gb/s para cargas grandes. |
| No hay enlace SFP | Confirma que el módulo sea SFP+ para 10 Gb/s o SFP28 para 25 Gb/s, y que ambos extremos, los transceptores y el tipo de fibra coincidan. Para un DAC, revisa la compatibilidad de los dos equipos. |
| El enlace aparece, pero no puedes acceder al equipo | Compara la IP que muestra la pantalla con la red de la computadora y revisa el direccionamiento local. Si se necesita una dirección fija, configúrala antes de transferir. |
| La conexión se interrumpe durante la copia | Revisa el cable, el puerto del switch y la alimentación. No cambies la IP ni desconectes Snowball Edge hasta detener el trabajo según el procedimiento de AWS. |

En RJ45, AWS señala que una luz ámbar intermitente corresponde a 1 Gb/s y una verde a 10 Gb/s. Si usas SFP o QSFP, revisa la velocidad que reportan el switch y la tarjeta de red del host; no intentes resolver un problema QSFP cambiando módulos al azar.

## Apagado y devolución

Cuando el trabajo haya terminado, sigue el procedimiento del trabajo en AWS. Para preparar el equipo para el retorno, la [guía de devolución](https://docs.aws.amazon.com/snowball/latest/developer-guide/return-device.html) indica apagarlo, desconectar los cables de red, guardar el cable de alimentación en el espacio previsto sobre el dispositivo y cerrar las puertas trasera, superior y frontal hasta oír y sentir el clic. Usa la información de devolución que muestra la pantalla E Ink; AWS indica que el dispositivo es su propio contenedor de envío y que no debes fijar una etiqueta aparte salvo que AWS lo pida. El seguimiento aparece en el trabajo de la consola de AWS Snow Family. Consulta también las [condiciones de envío por país](https://docs.aws.amazon.com/snowball/latest/developer-guide/mailing-storage.html) para el retorno concreto.

## Si no puedes pedir Snowball Edge, compara estas opciones

AWS recomienda **[DataSync](https://docs.aws.amazon.com/datasync/latest/userguide/what-is-datasync.html)** para transferencias por red cuando el ancho de banda, la estabilidad de la conexión y el tamaño de los datos permiten cumplir el plazo. Comprueba la [matriz de ubicaciones compatibles](https://docs.aws.amazon.com/datasync/latest/userguide/working-with-locations.html) y estima el rendimiento con tu red real; DataSync no elimina los límites de una conexión insuficiente.

Para llevar almacenamiento físico a una instalación de AWS, existe **[AWS Data Transfer Terminal](https://docs.aws.amazon.com/datatransferterminal/latest/userguide/what-is-dtt.html)**, pero AWS indica que hoy solo está disponible para clientes con Enterprise Support. Se reserva desde la consola y las ubicaciones se muestran durante la reserva; confirma si hay una instalación accesible y qué condiciones aplican antes de mover tus equipos. AWS también propone soluciones de partners para transferencias físicas. Si el problema que intentabas resolver era ejecutar cómputo cerca de los datos, evalúa **AWS Outposts**: cumple una función de borde distinta de una migración de datos. La guía de [redes en AWS Outposts](/blog/10-consejos-de-redes-para-aws-outposts/) explica su conectividad.

Si estás comparando alternativas a servicios físicos retirados, continúa con [AWS Snowmobile: retiro del servicio y alternativas de migración](/blog/migracion-de-datos-con-aws-snowmobile-guia-paso-a-paso/). Ahí se comparan rutas de transferencia según conectividad, almacenamiento y trabajo que necesitas ejecutar.

## Recursos, comunidades y eventos de redes AWS

Si necesitas revisar direccionamiento IP antes de preparar la red, la cápsula de **AWS Women Colombia**, [“Networking en AWS con Claudia (Capítulo 2): direcciones IP”](https://www.youtube.com/watch?v=Ws2419VBjk4), cubre IPv4, IPv6 y su implementación en arquitecturas de AWS. Es una introducción a redes de AWS; no es una guía de configuración de Snowball Edge.

Para conversar sobre un diagrama real, el [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) reúne a personas que trabajan en conectividad híbrida, enrutamiento multi-cuenta y redes corporativas. Es una comunidad general de redes AWS, no un grupo dedicado a Snowball. Si estás en otro país, busca un grupo cercano en el directorio de [comunidades AWS](/comunidades/).

Al 7 de octubre de 2026, el [AWS Student Builder Group de la Universidad Distrital anuncia “Amazon VPC Essentials: Fundamentos de Networking”](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) para el 21 de octubre, de 18:00 a 20:00 (hora de Colombia), en modalidad virtual. La página del organizador indica cupos limitados, inscripción previa y que el enlace se muestra a asistentes; no indica que el evento sea gratuito. La sesión trata fundamentos de VPC, subredes y rutas, no cableado de Snowball. Consulta la [agenda de eventos AWS](/eventos/) para encontrar otras fechas y confirmar sus condiciones.
