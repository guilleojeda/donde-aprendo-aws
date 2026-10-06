---
title: "Plano de control y plano de datos en AWS: App Mesh y alternativas"
description: "Entiende qué parte configura la comunicación entre servicios y cuál procesa el tráfico, y qué evaluar ahora que AWS dejó de dar soporte a App Mesh."
author: "guille-ojeda"
publishedAt: "2025-01-06"
publishedTimestamp: "2025-01-06T00:21:30.764Z"
modifiedTimestamp: "2026-10-06T13:57:35-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Amazon ECS: qué es y cómo ejecutar tu primera tarea"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-amazon-ecs/"
  - title: "Cómo desplegar contenedores en AWS: elige entre ECS, EKS y Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/"

---

El **plano de control** define y distribuye la configuración; el **plano de datos** procesa las comunicaciones que usan esa configuración. En una malla de servicios, por ejemplo, el control establece cómo se enruta una llamada entre versiones y los proxies del plano de datos aplican esa ruta al tráfico.

Hay un cambio que afecta cualquier guía actual de AWS App Mesh: AWS dejó de dar soporte al servicio el **30 de septiembre de 2026**. Desde esa fecha, ya no se puede acceder a la consola ni a los recursos de App Mesh. Por eso, aquí explicamos el concepto y cómo evaluar alternativas vigentes; no es una guía para instalar App Mesh. [AWS documenta la fecha de fin de soporte y la pérdida de acceso](https://docs.aws.amazon.com/app-mesh/latest/userguide/what-is-app-mesh.html) y publicó una [guía de migración de App Mesh a Amazon ECS Service Connect](https://aws.amazon.com/blogs/containers/migrating-from-aws-app-mesh-to-amazon-ecs-service-connect/).

## Qué hace cada plano

AWS describe los planos como responsabilidades distintas: el control administra y propaga cambios; el de datos ejecuta la función que atiende solicitudes o mueve tráfico. En una aplicación con microservicios, el flujo se puede resumir así:

1. Un operador define una regla de comunicación, por ejemplo, enviar una parte del tráfico a una nueva versión del servicio.
2. El plano de control distribuye la configuración a los componentes de red que corresponden.
3. Los proxies del plano de datos reciben las llamadas entre servicios y aplican la regla.

En App Mesh, las API y recursos del servicio formaban parte de la configuración. Los proxies Envoy que se ejecutaban junto a las aplicaciones leían esa configuración y encaminaban el tráfico. El proxy estaba en la ruta de comunicación: la llamada de un servicio cliente a uno destino pasaba por él. [La documentación de App Mesh describe sus recursos, proxies y reglas de enrutamiento](https://docs.aws.amazon.com/app-mesh/latest/userguide/what-is-app-mesh.html).

| Plano | Trabajo principal | Ejemplo en una malla | Qué implica una falla |
| --- | --- | --- | --- |
| **Control** | Crear, modificar y distribuir la configuración de la red. | Cambiar una ruta para enviar tráfico a otra versión. | Los proxies pueden dejar de recibir cambios nuevos. En App Mesh, AWS indicaba que la desconexión del plano de control impedía actualizar la configuración de Envoy. |
| **Datos** | Procesar el tráfico con la configuración recibida. | El proxy Envoy dirige una llamada al destino configurado. | Si una llamada pasa por un proxy que falla o se satura, esa comunicación puede verse afectada. El efecto depende de cómo esté configurada la aplicación y la red. |

En App Mesh, Envoy exponía métricas de conexión y de actualización de configuración. La documentación señalaba que la pérdida de conexión con el plano de control impide recibir cambios posteriores; eso **no permite asumir** que el tráfico existente siempre continuará sin impacto. AWS recomienda pensar en la separación de planos como parte del aislamiento de fallas, no como una garantía automática de disponibilidad. [Métricas de Envoy para App Mesh](https://docs.aws.amazon.com/app-mesh/latest/userguide/envoy-metrics.html) · [Planos de control y de datos en los límites de aislamiento de AWS](https://docs.aws.amazon.com/whitepapers/latest/aws-fault-isolation-boundaries/control-planes-and-data-planes.html).

La consecuencia práctica es observar ambos lados. Para el control, vigila si los cambios se aceptan y llegan a los proxies. Para el plano de datos, mide latencia, errores y saturación en las llamadas que atraviesan los proxies. Incorporar un proxy también añade un componente en la ruta que debes dimensionar y operar.

## Qué evaluar después de App Mesh

No hay una sustitución automática para todos los entornos. La elección depende de dónde corren los servicios, qué límites de red atraviesan y qué funciones de tráfico, seguridad y observabilidad realmente necesitas.

| Necesidad | Opción para evaluar | Alcance y límites a comprobar |
| --- | --- | --- |
| Conectar servicios que ya corren en Amazon ECS | **Amazon ECS Service Connect** | Es configuración integrada en ECS para descubrir e interconectar servicios ECS, con un proxy administrado en las tareas y métricas y registros estandarizados. Revisa los namespaces, los clientes externos a ECS y las políticas que usabas: la configuración de App Mesh no se convierte automáticamente. Si dependías de cifrado o autenticación entre servicios, compara tus requisitos con el [TLS de Service Connect](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect-tls.html) y la función [mTLS de App Mesh](https://docs.aws.amazon.com/app-mesh/latest/userguide/mutual-tls.html). [Documentación de Service Connect](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect.html). |
| Conectar servicios y recursos en varias VPC o cuentas, con cómputo heterogéneo | **Amazon VPC Lattice** | Usa servicios, grupos de destino, listeners y redes de servicios para gestionar conectividad, autorización y observabilidad. Sus destinos pueden incluir EC2, ECS, EKS, Lambda y otros tipos compatibles. Es una capa de redes de aplicaciones con otro modelo de recursos, no una traducción directa de una malla App Mesh. [Qué es VPC Lattice](https://docs.aws.amazon.com/vpc-lattice/latest/ug/what-is-vpc-lattice.html). |
| Conectar clústeres EKS con semántica de Kubernetes | **VPC Lattice con AWS Gateway API Controller** | AWS documenta esta integración para conectividad entre clústeres EKS. Evalúa si cubre tus políticas necesarias; no implica que las reglas de una malla se migren tal cual. [Conectividad entre clústeres EKS con VPC Lattice](https://docs.aws.amazon.com/eks/latest/userguide/integration-vpc-lattice.html). |
| Mantener capacidades de malla específicas de Kubernetes | **Istio u otra malla compatible con tu entorno** | Istio ofrece su propio plano de control y de datos, con políticas de tráfico, proxies y capacidades de seguridad y observabilidad. Requiere operar un sistema distinto o adoptar una distribución administrada; sus recursos no son compatibles automáticamente con App Mesh. [Istio en EKS](https://istio.io/latest/docs/setup/platform-setup/amazon-eks/) · [Arquitectura y capacidades de Istio](https://istio.io/latest/docs/overview/what-is-istio/). |
| Resolver nombres de servicios ECS sin políticas de malla | **Descubrimiento de servicios con AWS Cloud Map** | ECS puede registrar tareas y exponer nombres DNS para que otros servicios las encuentren. Es una opción para descubrimiento y resolución; no añade por sí sola las políticas de tráfico que aplicaba un proxy de malla. [Descubrimiento de servicios en ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html). |

Antes de elegir, haz un inventario por servicio: entorno de ejecución, nombres de descubrimiento, reglas de rutas, reintentos, requisitos de cifrado y autenticación, métricas, y límites entre VPC y cuentas. Luego valida con tráfico de prueba la resolución, las rutas, el comportamiento ante errores y las señales de observabilidad. Si una capacidad era obligatoria en App Mesh, confirma que la alternativa la ofrece en tu configuración concreta.

### Recursos y comunidades para seguir

Para conocer VPC Lattice desde la experiencia de una comunidad, [AWS User Group Guatemala publicó la charla «Deja de hacer peering»](https://www.youtube.com/watch?v=nFOCbh-wcLA), sobre el papel de VPC Lattice y AWS PrivateLink cuando una arquitectura acumula conexiones de peering y Transit Gateway. La charla complementa la documentación; confirma allí las capacidades y límites actuales. Puedes consultar los [encuentros de AWS User Group Guatemala](https://www.meetup.com/aws-guatemala/).

Si lo que buscas en ECS es practicar despliegues graduales de versiones, el repositorio [ECS Canary in Action](https://github.com/roxsross/aws-ecs-canary-in-action) ofrece un laboratorio en español con un modo local sin cuenta de AWS. Su modo en AWS crea recursos y puede generar cargos. Un despliegue canary sirve para mover tráfico entre versiones, pero no equivale a una malla de servicios.

En la agenda consultada el 6 de octubre de 2026, el [AWS Student Builder Group de la UTN Facultad Regional Córdoba](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/) anuncia el encuentro presencial **AWS Gaming Lab: ECS, CI/CD y la magia de Terraform** para el **10 de octubre de 2026, de 12:00 a 14:00 (hora de Argentina, UTC−03:00)**. Presenta un caso de aplicación en contenedores con ECS e infraestructura como código; consulta la [ficha del evento](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/) para confirmar cupos y dirección.

También puedes revisar la agenda del [AWS Student Builder Group de la Universidad Distrital en Bogotá](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/). Al revisar esta guía, anunciaba una sesión **virtual** de fundamentos de Amazon VPC para el **21 de octubre de 2026, de 18:00 a 20:00 (hora de Colombia, UTC−05:00)**. Consulta la [ficha de inscripción](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) para confirmar cupos y detalles.

Puedes llevar ese inventario y tus preguntas sobre rutas, autenticación o límites entre redes a las charlas para comparar experiencias con otras personas que trabajan con AWS.

Si primero necesitas repasar los conceptos de ECS, continúa con [Amazon ECS: qué es y cómo ejecutar tu primera tarea](/blog/comprendiendo-amazon-ecs/). Para comparar ECS, EKS y las opciones de cómputo antes de elegir una ruta, consulta [Cómo desplegar contenedores en AWS](/blog/como-desplegar-contenedores-en-aws/).

## Preguntas frecuentes

### ¿AWS App Mesh sigue disponible después del 30 de septiembre de 2026?

No. AWS dejó de dar soporte a App Mesh el 30 de septiembre de 2026 y señala que, después de esa fecha, ya no se puede acceder a su consola ni a sus recursos. La documentación actualizada de AWS es la referencia para confirmar el estado y seguir la ruta de migración.

### ¿Amazon ECS Service Connect reemplaza a App Mesh?

AWS publicó una guía para migrar cargas de App Mesh en ECS a Service Connect. Service Connect solo interconecta servicios ECS y usa sus propios namespaces, proxies y configuración. Compara las funciones que realmente utilizas antes de adoptar esa ruta; los recursos de App Mesh no se convierten automáticamente.

### ¿VPC Lattice es lo mismo que una malla de servicios?

No. VPC Lattice permite conectar, proteger y observar servicios y recursos mediante redes de servicios, listeners y grupos de destino. Puede participar en arquitecturas con ECS, EKS y otros destinos, pero eso no garantiza que sustituya las políticas o el modo de operación de cualquier service mesh.
