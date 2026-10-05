---
title: "EUC en AWS: escritorios virtuales y streaming de aplicaciones"
description: "Compara WorkSpaces Personal con WorkSpaces Applications (antes AppStream 2.0), conoce el retiro de WorkSpaces Pools y revisa identidad, red, costos y pruebas piloto."
author: "guille-ojeda"
publishedAt: "2024-05-10"
publishedTimestamp: "2024-05-10T05:21:18.994Z"
modifiedTimestamp: "2026-10-04T21:44:34-03:00"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related: []
---

La computación de usuario final (EUC, por *End User Computing*) en AWS permite entregar escritorios completos, aplicaciones de escritorio o un navegador remoto a las personas que los necesitan. La primera decisión es qué debe recibir cada usuario: **un escritorio propio que conserva su entorno**, **una o varias aplicaciones transmitidas desde AWS**, o **acceso aislado a sitios web**.

Para escritorios persistentes por persona, evalúa **Amazon WorkSpaces Personal**. Para transmitir aplicaciones —y también escritorios no persistentes— evalúa **Amazon WorkSpaces Applications**, cuyo nombre anterior era Amazon AppStream 2.0. Al 4 de octubre de 2026 hay límites de disponibilidad que afectan la elección: AWS ya cerró WorkSpaces Pools a clientes nuevos; también anunció fechas de cierre para el protocolo PCoIP de WorkSpaces Personal y para aceptar clientes nuevos en WorkSpaces Secure Browser. Están detalladas en la comparación siguiente.

## EUC no significa “poner una EC2 para cada persona”

Un servicio EUC administra parte del aprovisionamiento, el acceso y la transmisión de la sesión. El usuario final recibe un escritorio o una aplicación por medio de un cliente compatible o, cuando el servicio y el caso lo permiten, un navegador. El escritorio que se muestra en pantalla sigue necesitando una identidad, aplicaciones, datos y una conexión de red; sus permisos y persistencia dependen del servicio y de cómo se configure.

Esto se diferencia de administrar instancias Amazon EC2 genéricas como servidores. WorkSpaces Personal y WorkSpaces Applications tienen flujos de creación, imágenes, acceso y facturación propios. La consola y la API de AWS requieren permisos administrativos, pero esos permisos de IAM no determinan por sí solos qué puede abrir o modificar una persona dentro de Windows, Linux o una aplicación.

## Cómo elegir entre las opciones de WorkSpaces

### WorkSpaces Personal: un escritorio persistente por persona

Si una persona necesita un escritorio completo, personalizado y persistente, evalúa [Amazon WorkSpaces Personal](https://docs.aws.amazon.com/workspaces/latest/adminguide/managing-wsp-personal.html). Asigna un WorkSpace persistente a una persona. Revisa los paquetes disponibles, el origen de identidad, la Región, el cliente, las aplicaciones y dónde deben persistir los datos. Si el entorno existente usa PCoIP, AWS cerró el acceso a clientes nuevos a ese protocolo el 31 de julio de 2026 y termina su soporte el 31 de octubre de 2027; los clientes existentes deben planificar la migración a DCV. La guía de [fin de soporte de PCoIP](https://docs.aws.amazon.com/workspaces/latest/adminguide/workspaces-pcoip-end-of-support.html) aclara que WorkSpaces Personal basado en DCV no se ve afectado.

### WorkSpaces Applications: aplicaciones y escritorios no persistentes

Si necesitas entregar aplicaciones de escritorio a varias personas sin asignarles un escritorio personal, evalúa [Amazon WorkSpaces Applications](https://docs.aws.amazon.com/appstream2/latest/developerguide/what-is-appstream.html). Transmite aplicaciones desde recursos administrados en AWS. También admite escritorios virtuales no persistentes. El acceso puede hacerse desde un cliente o navegador compatible, según sistema operativo y función. Prueba imágenes, dependencias, licencias, periféricos y el modo de acceso con las aplicaciones reales.

### WorkSpaces Pools: transición de entornos existentes

Si ya administras WorkSpaces Pools, consulta la [Guía de disponibilidad y transición de WorkSpaces Pools](https://docs.aws.amazon.com/workspaces/latest/adminguide/wsp-pools-end-of-support.html). AWS cerró Pools a clientes nuevos el 31 de julio de 2026. Quienes tenían recursos y escritorios creados antes del 30 de junio de 2026 pueden continuar hasta el 31 de diciembre de 2027; AWS recomienda planificar la migración a WorkSpaces Applications. Valida compatibilidad y experiencia con usuarios piloto antes de moverlos.

### WorkSpaces Secure Browser: navegación aislada y disponibilidad

WorkSpaces Secure Browser está pensado para acceder a sitios internos o aplicaciones SaaS desde un navegador aislado. AWS fijó el 29 de octubre de 2026 como fecha efectiva del cierre a clientes nuevos; los clientes existentes pueden continuar con normalidad. Para evaluar la transición hacia WorkSpaces Applications con una imagen Chrome autogestionada, consulta el [aviso de disponibilidad y migración](https://docs.aws.amazon.com/workspaces-web/latest/adminguide/workspaces-secure-browser-maintenance-mode.html). Las funciones de navegador, SSO y auditoría no son equivalentes sin configuración adicional.

**Regla práctica:** si el trabajo depende de un escritorio individual que retiene el entorno de esa persona, empieza comparando WorkSpaces Personal. Si consiste en abrir aplicaciones concretas desde distintos dispositivos o entregar un escritorio no persistente, compara WorkSpaces Applications. Si solo requiere navegación web controlada, WorkSpaces Secure Browser encaja con ese uso para quienes ya lo tienen habilitado; para nuevas altas, revisa el cierre anunciado y las alternativas de AWS antes de elegir. Una organización puede necesitar más de un servicio para grupos de usuarios diferentes.

WorkSpaces Personal usa una fuente de identidad y un directorio compatibles con la configuración elegida. WorkSpaces Applications documenta grupos de usuarios, SAML 2.0 y URL de streaming como mecanismos de autenticación; no todos aplican a todos los modos de acceso. En WorkSpaces Pools, considera el plazo de retiro antes de dedicar trabajo nuevo a una migración.

## Identidad: separa el acceso de administración del inicio de sesión

Antes de probar un servicio, anota quién administra AWS, cómo inicia sesión cada usuario y qué permisos necesita dentro del escritorio y las aplicaciones. Son controles relacionados, pero distintos:

- **IAM** controla qué identidades y roles de AWS pueden administrar recursos y llamar a operaciones de AWS. No configura automáticamente la cuenta de Windows de cada persona ni sus permisos dentro de una aplicación.
- **WorkSpaces Personal** autentica a los usuarios mediante el origen configurado para el directorio de WorkSpaces. AWS documenta opciones de directorio e identidad diferentes; la compatibilidad depende del tipo de directorio, la Región y el método de acceso.
- **WorkSpaces Applications** admite grupos de usuarios y federación SAML 2.0, además de URL de streaming generadas para ciertos flujos. Comprueba qué opción encaja con la aplicación, el cliente y la integración de identidad de tu organización.

Para repasar el alcance de IAM en AWS, Marcia Villalba publicó el video breve [“QUE ES AWS IAM? - EXPLICADO EN 5 MINUTOS”](https://www.youtube.com/watch?v=t51vW-BDwF0). Sirve como recurso de fundamentos sobre identidades y permisos de AWS; no sustituye la documentación del inicio de sesión final de WorkSpaces.

No des por hecho que habrá inicio de sesión único (SSO) o autenticación multifactor (MFA) con solo activar WorkSpaces. La MFA depende de la identidad y el flujo configurados; por ejemplo, la guía de [SAML 2.0 para WorkSpaces Personal](https://docs.aws.amazon.com/workspaces/latest/adminguide/setting-up-saml.html) limita la función a directorios, Regiones y clientes compatibles. Para WorkSpaces Applications, consulta su guía de [autenticación de usuarios](https://docs.aws.amazon.com/appstream2/latest/developerguide/authentication-authorization.html). Después prueba el recorrido entero: invitación o portal, autenticación, inicio de sesión del sistema operativo y apertura de la aplicación.

## Red: valida la ruta del usuario y la del servicio

WorkSpaces Personal se asocia a una VPC y a un directorio; la red y las subredes deben cumplir los requisitos de la configuración elegida. En la red del usuario también hacen falta los puertos y rangos de AWS correspondientes al cliente y protocolo. El cliente de WorkSpaces incluye una prueba de red que informa sobre conectividad, puertos y tiempo de ida y vuelta. Consulta los [requisitos de red de WorkSpaces Personal](https://docs.aws.amazon.com/workspaces/latest/adminguide/workspaces-network-requirements.html) y usa esa prueba desde los dispositivos representativos del piloto.

En WorkSpaces Applications, las conexiones de streaming usan el endpoint público de Internet de forma predeterminada. AWS también permite transmitir mediante un endpoint de VPC de interfaz, pero la autenticación y los recursos web necesarios todavía requieren conectividad a Internet en el flujo documentado. Los dispositivos deben poder llegar a los dominios y puertos aplicables a la Región y al método de conexión; el streaming mediante endpoint de VPC tiene requisitos adicionales. Revisa la documentación de [conexiones de usuario](https://docs.aws.amazon.com/appstream2/latest/developerguide/user-connections-to-appstream2.html), [dominios permitidos](https://docs.aws.amazon.com/appstream2/latest/developerguide/allowed-domains.html) y [puertos del dispositivo](https://docs.aws.amazon.com/appstream2/latest/developerguide/client-application-ports.html) antes de solicitar cambios de firewall o proxy.

Para una explicación comunitaria de VPC e interconexiones, puedes escuchar la sesión de estudio de AWS User Group Guatemala titulada [“VPC e Interconexiones de VPC - Grupo de Estudio - Certificación Solutions Architect”](https://www.youtube.com/watch?v=Mcffd13mkPc). Complementa los fundamentos de red; consulta las guías oficiales de WorkSpaces para requisitos concretos del cliente o el servicio.

Por eso no conviene afirmar que EUC siempre necesita VPN o que nunca la necesita. La ruta depende de la política de la organización, los endpoints elegidos, los dominios de autenticación y la red del usuario. Si hay un proxy, comprueba además el soporte para el protocolo y el tratamiento de los dominios de acceso; AWS advierte, por ejemplo, que no se debe almacenar en caché el tráfico de ciertos dominios de autenticación y del gateway de streaming de WorkSpaces Applications. La transmisión remota requiere conectividad: no prometas uso sin conexión si no has comprobado una solución local separada.

## Costos: compara sesiones reales, no solo una tarifa visible

El precio depende del servicio, Región, sistema operativo, recursos elegidos, cantidad de usuarios y horas de uso. WorkSpaces Personal ofrece modalidades de facturación mensual o por hora, según el paquete. En WorkSpaces Applications se facturan los recursos de streaming y constructores de imágenes; según el sistema operativo y el tipo de flota pueden sumarse tarifas por usuario, instancias detenidas y direcciones IPv4 públicas.

Antes del piloto, estima qué recursos auxiliares requiere la configuración —por ejemplo, directorio, conectividad de red o transferencia de datos— y registra el patrón que quieres probar: usuarios simultáneos, duración de sesión, horarios de actividad, aplicaciones y capacidad necesaria. Contrasta la estimación con las páginas de [precios de WorkSpaces](https://aws.amazon.com/workspaces/pricing/) y [precios de WorkSpaces Applications](https://aws.amazon.com/workspaces/applications/pricing/), y con la [Calculadora de Precios de AWS](https://calculator.aws/). Una facturación por uso o una flota que escala no garantizan ahorro; compara el costo completo del escenario con la alternativa que ya utilizas.

## Planifica un piloto acotado

Un piloto sirve para descubrir incompatibilidades antes de elegir una arquitectura productiva. No hace falta diseñar una VPC genérica con subredes públicas, NAT Gateway, bastion host y reglas repetidas para todos los casos. Parte de los requisitos del servicio y de la ruta de red que realmente vayas a probar.

1. **Describe el trabajo.** Para cada grupo de usuarios, registra las aplicaciones necesarias, el sistema operativo esperado, los datos que debe conservar, los periféricos, el acceso a servicios internos y los horarios de uso.
2. **Comprueba el alcance.** Verifica disponibilidad en la Región, licencias de aplicaciones y sistemas operativos, compatibilidad de la aplicación, cliente o navegador, directorio e identidad, y los requisitos de seguridad y cumplimiento.
3. **Elige candidatos por necesidad.** Si un grupo requiere un escritorio persistente, evalúa WorkSpaces Personal. Si necesita aplicaciones concretas o una sesión no persistente, evalúa WorkSpaces Applications. Si solo necesita sitios web, compara WorkSpaces Secure Browser según la disponibilidad de tu cuenta y fecha de alta, o evalúa la alternativa de navegador autogestionado en WorkSpaces Applications. Para un entorno que todavía usa Pools, prueba la migración recomendada por AWS.
4. **Incluye usuarios y redes representativos.** Prueba desde los dispositivos y ubicaciones reales previstos, respetando la política de VPN de la organización. Registra el inicio de sesión, tiempo de apertura, latencia percibida, desconexiones, reconexión, persistencia de datos y funciones necesarias como impresión o portapapeles.
5. **Revisa los controles y el costo.** Confirma qué identidades pueden administrar el servicio, cuáles pueden acceder a cada aplicación y qué datos entran o salen de la sesión. Estima el costo con las horas y concurrencia observadas, incluyendo recursos auxiliares aplicables.
6. **Define qué aprobarás antes de ampliar.** Acordar de antemano compatibilidad, experiencia mínima, requisitos de acceso y presupuesto ayuda a que la decisión dependa de resultados observados y no de una promesa de ahorro.

Para repasar bases de IAM y redes antes de practicar, los [laboratorios prácticos de AWS para principiantes](https://dondeaprendoaws.com/blog/10-laboratorios-practicos-de-aws-para-principiantes/) incluyen ejercicios de permisos y VPC con comprobaciones y pasos de limpieza. No son un laboratorio de WorkSpaces ni una receta para producción.

## Diagnostica los problemas de conexión por etapa

Empieza por guardar el mensaje o código de error, la hora, la Región, el cliente y su versión, el usuario afectado, el protocolo y si el equipo usa VPN o proxy. No envíes contraseñas, tokens ni capturas con datos personales al pedir ayuda.

1. **No aparece el portal o no registra el dispositivo:** comprueba el estado del directorio o del portal, el código de registro, la disponibilidad de la Región, el DNS y el acceso desde el dispositivo a los servicios que AWS exige. En WorkSpaces Personal, usa la prueba de red del cliente para revisar los puertos y el RTT.
2. **La autenticación falla antes de abrir la sesión:** valida el estado de la cuenta en el directorio o proveedor de identidad, el método habilitado para ese servicio, las políticas MFA/SSO, las coincidencias entre los atributos de usuario y la configuración del cliente. IAM de administración no reemplaza este inicio de sesión.
3. **Se autentica, pero la transmisión queda en blanco o se corta:** revisa los dominios y puertos del servicio, la ruta de VPN o proxy, las reglas de inspección y la estabilidad de la conexión. Compara la ruta desde un cliente compatible y usa las guías oficiales de [diagnóstico de WorkSpaces Personal](https://docs.aws.amazon.com/workspaces/latest/adminguide/amazon-workspaces-troubleshooting.html) o [diagnóstico de WorkSpaces Applications](https://docs.aws.amazon.com/appstream2/latest/developerguide/troubleshooting.html), que incluyen errores y códigos de notificación específicos.
4. **La sesión abre, pero falla una aplicación o un periférico:** acota el problema a la imagen, dependencias, permisos del sistema operativo, datos de usuario o compatibilidad de la función concreta. Confirma que esa aplicación, dispositivo o red esté admitido en la combinación de servicio y cliente del piloto.

Un síntoma parecido puede originarse en identidad, red o aplicación. Conserva el punto exacto donde falla y el código que informa el servicio; evita cambiar a la vez el firewall, el directorio y la imagen, porque después no sabrás cuál cambio resolvió el problema.

## Recursos y comunidades para seguir

- **Grabación sobre el servicio:** AWS User Group Chile publicó [“Descubre el poder de tus aplicaciones: Explorando AWS AppStream 2.0”](https://www.youtube.com/watch?v=F6TCqxwUwoo). El video conserva el nombre anterior del servicio; contrasta cualquier procedimiento con la documentación actual de WorkSpaces Applications.
- **Más sesiones de la comunidad chilena:** el [canal de YouTube de AWS User Group Chile](https://www.youtube.com/@awsusergroupchile2908) reúne grabaciones de encuentros sobre arquitectura, desarrollo y servicios cloud.
- **Más material de redes y fundamentos:** el [canal de AWS User Group Guatemala](https://www.youtube.com/@awsugguatemala) reúne grabaciones y sesiones de estudio. Para configurar la red del servicio, usa los requisitos de AWS enlazados arriba, no una receta genérica de una grabación.
- **Explora otros formatos y autores:** en [creadores y canales de AWS en español](/creadores/) puedes filtrar fuentes por formato, tema y país.
- **Redes y conectividad:** el [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) es un grupo técnico de Bogotá dedicado a conectividad híbrida, enrutamiento y diseño de redes en AWS. Consulta su agenda para conocer sus próximos encuentros; no es un canal de soporte específico de WorkSpaces.
- **Taller puntual de redes:** si consultas esta guía antes del 21 de octubre de 2026, la ficha de [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) anuncia una sesión virtual organizada por AWS Student Builder Group at UDFJC, de 18:00 a 20:00, hora de Bogotá (America/Bogota, UTC−05:00). Requiere inscripción previa y tiene cupos limitados. Después de esa fecha, busca otras fechas en la [agenda de eventos de AWS en Latinoamérica](/eventos/), donde puedes filtrar por país y modalidad.
- **Encuentra un grupo más cercano:** el [directorio de comunidades AWS de Latinoamérica](/comunidades/) permite filtrar grupos por país, tema y formato. Elige un espacio según tu ubicación y modalidad, y plantea la pregunta con el código de error y los detalles técnicos que no sean sensibles.

## Preguntas frecuentes

### ¿Amazon WorkSpaces es una instancia EC2 para cada usuario?

WorkSpaces entrega escritorios gestionados por el servicio, con paquetes, directorios y opciones de acceso propios. No es equivalente a administrar una instancia EC2 genérica ni aplica automáticamente los permisos del sistema operativo a través de IAM.

### ¿WorkSpaces Applications reemplazó a AppStream 2.0?

Sí. **Amazon WorkSpaces Applications** es el nombre actual de Amazon AppStream 2.0. La documentación conserva rutas técnicas con `appstream2` en su dirección, aunque el título actual de las páginas usa WorkSpaces Applications.

### ¿Puedo empezar hoy con WorkSpaces Pools?

No como cliente nuevo: AWS dejó de aceptar clientes nuevos desde el 31 de julio de 2026. Quienes cumplen el criterio de recursos existentes pueden usarlo hasta el 31 de diciembre de 2027; planifica una migración con la guía de AWS enlazada en la tabla.

### ¿Necesito una VPN para conectarme? ¿Puedo usarlo sin Internet?

No hay una respuesta universal sobre VPN: depende de la ruta y los controles aprobados para tu caso. La transmisión requiere conectividad entre el dispositivo y el servicio, incluso cuando una configuración usa endpoints privados para parte del tráfico. No asumas funcionamiento sin conexión.

### ¿WorkSpaces siempre cuesta menos que un escritorio local?

No necesariamente. El resultado depende de uso, concurrencia, modalidad, licencias, capacidad y servicios auxiliares. Estima el escenario con horas reales del piloto y compáralo con el costo completo de la alternativa actual.
