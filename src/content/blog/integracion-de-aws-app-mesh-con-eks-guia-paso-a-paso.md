---
title: "AWS App Mesh en EKS: fin de soporte y cómo migrar"
description: "AWS retiró App Mesh el 30 de septiembre de 2026. Identifica dependencias en EKS y evalúa VPC Lattice, Istio o Kubernetes nativo según lo que necesites."
author: "guille-ojeda"
publishedAt: "2024-05-11"
publishedTimestamp: "2024-05-11T01:55:00.323Z"
modifiedTimestamp: "2026-10-06T17:33:52-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Plano de control y plano de datos en AWS: App Mesh y alternativas"
    url: "https://dondeaprendoaws.com/blog/control-plane-vs-data-plane-en-aws-app-mesh/"
  - title: "Amazon EKS: qué es, cómo funciona y cuánto cuesta"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-kubernetes-y-amazon-eks/"

---

AWS App Mesh dejó de recibir soporte el **30 de septiembre de 2026**. Desde esa fecha ya no se puede acceder a la consola ni a los recursos del servicio, según el [aviso vigente de AWS](https://docs.aws.amazon.com/app-mesh/latest/userguide/what-is-app-mesh.html). La antigua guía de instalación de App Mesh en Amazon EKS ya no describe una configuración que puedas poner en marcha hoy.

El cambio no retira EKS ni Kubernetes. En un clúster pueden seguir existiendo objetos de Kubernetes, el controlador de App Mesh y proxies Envoy, pero esas piezas locales no devuelven el acceso al servicio de AWS ni restauran el soporte de App Mesh. El aviso de AWS no afirma que el tráfico de las aplicaciones ya desplegadas se haya interrumpido de inmediato ni garantiza que continúe funcionando. Por eso, un Pod en estado `Ready` no basta para confirmar que las llamadas entre servicios sigan sanas: prueba el tráfico de aplicación y planifica una migración.

Esta guía explica qué hacía cada componente, cómo localizar dependencias que aún estén en tu clúster y cómo comparar rutas actuales. Para EKS, AWS publicó una [guía de migración de App Mesh a VPC Lattice](https://aws.amazon.com/blogs/containers/migrating-from-aws-app-mesh-to-amazon-vpc-lattice/); es un punto de partida, no una conversión automática ni una decisión de arquitectura para todos los casos.

## Qué hacía App Mesh junto a una aplicación en EKS

App Mesh era el servicio administrado que mantenía la configuración de la malla. En EKS, el controlador de App Mesh para Kubernetes y sus definiciones de recursos personalizados permitían declarar ciertos objetos desde Kubernetes. Un webhook podía añadir a los Pods un proxy Envoy y un contenedor de inicialización `appmesh-proxy-route-manager`, que preparaba las reglas de red para encaminar las llamadas a través del proxy. Envoy aplicaba la configuración recibida desde el plano de control de App Mesh. La [guía de Kubernetes de AWS](https://docs.aws.amazon.com/app-mesh/latest/userguide/getting-started-kubernetes.html) explica la integración histórica; hoy también muestra el aviso de fin de soporte.

| Parte | Dónde vivía | Qué buscar hoy |
| --- | --- | --- |
| Recursos de la malla, como servicios virtuales, nodos y rutas | En el servicio AWS App Mesh | Recupera definiciones desde repositorios de infraestructura, manifiestos versionados, respaldos o documentación interna. Después del fin de soporte no cuentes con la consola o la API de App Mesh para consultarlas. |
| Controlador y recursos personalizados | En el clúster EKS | Revisa los CRD del grupo `appmesh.k8s.aws`, los despliegues del controlador, sus roles y las releases de Helm. |
| Proxy de tráfico Envoy y configuración de red del Pod | Dentro de los Pods que tenían la integración | Inspecciona contenedores e init containers, imágenes, anotaciones, selectores de inyección y variables de entorno en los manifiestos. |
| Servicio y aplicación reales | En Kubernetes y en tu código | Identifica quién llama a quién, qué nombres DNS y puertos usan, y si las aplicaciones dependen de reintentos, rutas, autenticación o certificados gestionados por la malla. |

Si necesitas repasar cómo se relacionan Kubernetes, Pods y Services, la grabación [EKS Fundamentals: Desmitificando Kubernetes con AWS](https://www.youtube.com/watch?v=YEY9NbFMQ0Y) de AWS User Group Ecuador cubre esos fundamentos. Su [sitio de comunidad](https://www.awsugecuador.com/) reúne enlaces a sus encuentros.

En los clústeres a los que todavía tienes acceso, estas consultas son de solo lectura y ayudan a encontrar rastros locales:

```sh
kubectl get crd -o name | grep "appmesh.k8s.aws"
kubectl get deployments -A | grep -i appmesh
kubectl get pods -A
helm list -A
```

La lista de Pods no muestra por sí sola la configuración de cada contenedor: inspecciona los Pods y sus manifiestos para revisar imágenes, init containers y anotaciones. Estas consultas no llaman a App Mesh. Conserva los manifiestos antes de retirar el controlador o los proxies; si la configuración de la malla solo estaba guardada en App Mesh, quizá no puedas recuperarla desde ese servicio.

## Qué evitar al reutilizar un tutorial antiguo

La guía anterior combinaba una fecha de soporte vencida con instrucciones que no creaban una integración funcional. Ten presentes estas diferencias antes de ejecutar pasos copiados:

- `aws appmesh create-service` no es una operación de App Mesh. Sus recursos incluían `VirtualService`, `VirtualNode`, `VirtualRouter` y rutas; la referencia de la [API de App Mesh en AWS CLI](https://docs.aws.amazon.com/cli/latest/reference/appmesh/index.html) enumera los comandos. Los ejemplos antiguos de `create-virtual-node` y `create-virtual-router` también omitían `--spec`, que era obligatorio.
- El rol vinculado al servicio App Mesh y el rol IAM del controlador de Kubernetes cumplían funciones distintas. La [guía de instalación de Kubernetes de AWS](https://docs.aws.amazon.com/app-mesh/latest/userguide/getting-started-kubernetes.html) asignaba permisos al rol de la cuenta de servicio del controlador; añadir `AWSAppMeshFullAccess` al rol vinculado al servicio no le daba esos permisos al controlador. Ese procedimiento solo ayuda a entender una integración existente: no intentes instalar App Mesh ahora.
- El controlador no era un sistema genérico de telemetría ni de entrega progresiva. AWS documentaba CRD, un webhook de admisión, el proxy Envoy y el contenedor `appmesh-proxy-route-manager`; aplicar un Deployment de Kubernetes sin esa integración no creaba rutas de App Mesh ni enviaba tráfico a través de la malla.
- No ejecutes un bloque de limpieza antiguo sin revisar a qué manifiestos y recursos apunta. Un comando que mezcla rutas de distintos walkthroughs puede dejar componentes atrás o eliminar otra aplicación; primero identifica los recursos que dependen de cada Pod y guarda la configuración recuperable.

## Una ruta práctica para salir de una integración existente

### 1. Reconstruye el inventario

Parte de los repositorios de aplicación e infraestructura, las releases de Helm, los CRD que aún existan y la configuración de los Pods. Por cada servicio registra:

- su namespace, Deployment y Service de Kubernetes, sus consumidores y los nombres DNS usados por la aplicación;
- puertos y protocolos, reglas de enrutamiento, pesos entre versiones, timeouts y reintentos;
- requisitos de TLS o mTLS, identidad y autorización entre servicios;
- exposición de entrada y salida, conexiones entre clústeres, VPC o cuentas;
- métricas, logs, trazas, alertas y el proceso para revertir un despliegue.

No intentes reconstruir el inventario llamando a la API de App Mesh: desde el 30 de septiembre de 2026 AWS indica que sus recursos ya no son accesibles. Contrasta cada dato con manifiestos e infraestructura versionada. Si falta una regla, valida su efecto observando el tráfico real antes de reemplazarla.

### 2. Compara el comportamiento, no solo los nombres de los recursos

El ejemplo de migración de AWS relaciona conceptos de App Mesh con recursos de VPC Lattice, pero sus objetos no son equivalentes uno a uno:

| App Mesh | Recurso aproximado en VPC Lattice y Gateway API | Qué tienes que volver a decidir |
| --- | --- | --- |
| Mesh | Service Network | Qué servicios comparten red y qué VPC o cuentas participan. |
| VirtualService | Service | Nombre de servicio, consumidores y forma de descubrir el endpoint nuevo. |
| VirtualNode | Target Group asociado al Service | Selección de Pods, health checks, puertos y atributos del destino. |
| VirtualRouter y Route | Listener y reglas; en EKS, recursos como `HTTPRoute` | Coincidencia de solicitudes, pesos, destinos y comportamiento de la aplicación ante fallos. |

Para escuchar experiencias de comunidad sobre la alternativa que describe el ejemplo, mira [Episodio II: El Ataque de Nivel 200: Amazon VPC Lattice](https://www.youtube.com/watch?v=vwAda02OH18), de AWS Women Colombia, y [Deja de hacer peering](https://www.youtube.com/watch?v=nFOCbh-wcLA), grabada por AWS User Group Guatemala sobre VPC Lattice y AWS PrivateLink. Estas charlas sirven para comparar enfoques de conectividad; confirma compatibilidad, políticas y costos en la documentación actual de AWS.

La correspondencia de recursos ayuda a planificar, no a copiar YAML y esperar que se conserve cada función. Antes de decidir, confirma que la alternativa cubra tus protocolos, rutas, cifrado, políticas de acceso, visibilidad y límites de red. En particular, compara qué requiere tu mTLS y autenticación de carga: una política de autorización de red no reemplaza automáticamente la [configuración mTLS de App Mesh](https://docs.aws.amazon.com/app-mesh/latest/userguide/mutual-tls.html). Revisa también los costos: VPC Lattice cobra según recursos provisionados, datos transferidos y solicitudes o conexiones, de acuerdo con la [página oficial de precios](https://aws.amazon.com/vpc/lattice/pricing/).

### 3. Elige una ruta según la necesidad

No hay un reemplazo universal para App Mesh. Estas opciones responden a necesidades distintas:

| Necesidad | Ruta para evaluar | Límites que debes comprobar |
| --- | --- | --- |
| Mantener las cargas en EKS y conectar servicios dentro o entre clústeres, VPC o cuentas de AWS | **Amazon VPC Lattice con AWS Gateway API Controller**. AWS documenta esta ruta para EKS y usa el controlador para asociar recursos de Kubernetes a VPC Lattice. | Requiere crear la red y las reglas de destino en el modelo de Lattice, adaptar endpoints y verificar cada política y protocolo. No convierte los CRD de App Mesh automáticamente. Empieza por la [guía de integración de EKS](https://docs.aws.amazon.com/eks/latest/userguide/integration-vpc-lattice.html) y la [guía del controlador](https://www.gateway-api-controller.eks.aws.dev/latest/). |
| Mantener funciones de malla dentro de Kubernetes, como políticas de tráfico L7, mTLS y observabilidad de servicio a servicio | **Istio en EKS**. La documentación de Istio incluye una [configuración para Amazon EKS](https://istio.io/latest/docs/setup/platform-setup/amazon-eks/) y describe sus [capacidades de tráfico, seguridad y telemetría](https://istio.io/latest/docs/overview/what-is-istio/). | El equipo pasa a operar el plano de control y el plano de datos de Istio, sus actualizaciones y su configuración. Sus recursos también deben diseñarse de nuevo; no son compatibles con App Mesh. |
| Resolver llamadas internas sencillas entre servicios del mismo clúster, sin necesitar políticas de malla | **Service y DNS de Kubernetes**, con controles de red que implemente tu CNI y resiliencia en la aplicación. | `NetworkPolicy` controla tráfico IP y puertos y solo tiene efecto si la red del clúster la implementa; no sustituye rutas HTTP, reintentos ni mTLS. Consulta la [documentación de servicios y redes de Kubernetes](https://kubernetes.io/docs/concepts/services-networking/). |
| Cambiar deliberadamente las cargas de EKS a ECS | **Amazon ECS Service Connect** puede interconectar servicios de ECS. | Service Connect configura la comunicación entre servicios ECS y no es una malla que puedas instalar en EKS. AWS separa esta ruta de la migración de App Mesh para EKS; revisa el [alcance de Service Connect](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect.html) antes de considerar el cambio de plataforma. |

Elige una ruta solo después de verificar los requisitos de tu aplicación y del equipo que la va a operar. Si no necesitas una malla, no reproduzcas sus capas por inercia: para servicios internos simples puede bastar el descubrimiento nativo y la resiliencia de la aplicación. Si dependes de rutas L7, identidad mTLS o conectividad entre VPC, prueba esas funciones explícitamente en el destino.

### 4. Migra en un entorno que permita probar y revertir

Construye primero la configuración de destino en un namespace, clúster o entorno de prueba separado. Migra una cadena pequeña de servicios y comprueba resolución DNS, rutas y pesos, health checks, timeouts y reintentos, certificados y autorización, métricas y logs. Prueba también el comportamiento ante un destino no saludable y una reversión.

Planifica el cambio de tráfico por el punto que realmente usan tus clientes —por ejemplo, configuración del cliente, DNS o una entrada de red— y documenta qué se necesita para volver atrás. Tras el fin de soporte, una reversión que dependa de la consola, las API o la propagación de configuración de App Mesh no es una estrategia comprobada. Mantén una ruta de rollback que no requiera ese servicio y valida su funcionamiento antes del corte.

Retira el controlador, las anotaciones de inyección y los proxies de los Pods cuando hayas confirmado que ningún consumidor sigue dependiendo de ellos. Luego revisa roles IAM y permisos asociados que ya no se necesiten. No elimines CRD o manifests antes de guardar los datos que sí puedes recuperar desde Kubernetes y tus repositorios.

## Encuentros y comunidades para continuar

Al revisar esta guía el **6 de octubre de 2026**, el [AWS Student Builder Group de la Universidad Distrital en Bogotá](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/) anunciaba **Amazon VPC Essentials: Fundamentos de Networking** para el **21 de octubre, de 18:00 a 20:00 (hora de Colombia, UTC−05:00)**, en modalidad virtual. La sesión cubre VPC, subredes y rutas; su [ficha de Meetup](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) indica cupos limitados, registro previo y que el enlace virtual solo se muestra a asistentes. Confirma allí que siga disponible.

Para encontrar encuentros posteriores sobre VPC Lattice, revisa la agenda de [AWS Women Colombia](https://www.meetup.com/aws-women-colombia-user-group/) y la de [AWS User Group Guatemala](https://www.meetup.com/aws-guatemala/). Las grabaciones anteriores aportan contexto, mientras que los requisitos de cada recurso deben validarse en la documentación de AWS.

Si tu inventario también incluye reglas de acceso o seguridad de Pods, [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/) anunciaba **AWS & Cloud Native Security Night** para el **23 de octubre de 2026, de 17:00 a 20:00 (hora de Ecuador, UTC−05:00)**, presencial en la Universidad Católica de Santiago de Guayaquil. La [ficha del evento](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/) describe una sesión sobre seguridad de Kubernetes y contenedores: la entrada es gratuita, con cupos limitados y registro previo. Revisa el lugar y la disponibilidad antes de viajar.

Si necesitas repasar responsabilidades del plano de control y del plano de datos, continúa con [Plano de control y plano de datos en AWS: App Mesh y alternativas](/blog/control-plane-vs-data-plane-en-aws-app-mesh/). Para revisar cómo se relaciona App Mesh con los recursos propios de Kubernetes, consulta [Amazon EKS: qué es, cómo funciona y cuánto cuesta](/blog/comprendiendo-kubernetes-y-amazon-eks/).

## Preguntas frecuentes

### ¿App Mesh sigue disponible en EKS después del 30 de septiembre de 2026?

No como servicio con soporte. AWS indica que después de esa fecha ya no se puede acceder a la consola ni a los recursos de App Mesh. Que queden CRD, Pods o contenedores Envoy en EKS no equivale a que el servicio siga disponible.

### ¿Una aplicación que ya usaba App Mesh dejó de funcionar ese día?

El aviso oficial no promete una interrupción inmediata de todas las llamadas que ya estaban en curso ni garantiza que los proxies continúen operando. Comprueba el tráfico de aplicación, las respuestas de los servicios y sus señales de observabilidad; no infieras salud de malla únicamente a partir del estado `Ready` de Kubernetes.

### ¿Amazon ECS Service Connect reemplaza App Mesh en un clúster EKS?

No: Service Connect configura la comunicación entre servicios ECS. Para mantener las cargas en EKS, AWS documenta la evaluación de VPC Lattice y su Gateway API Controller. Si también estás evaluando mover EKS a ECS, esa es una decisión de plataforma separada.

### ¿VPC Lattice importa automáticamente las rutas de App Mesh?

No hay una traducción directa que conserve sin revisión todos los recursos y políticas. Recupera la configuración disponible, relaciona cada llamada con un destino nuevo y prueba protocolos, seguridad, ruteo y observabilidad en el entorno elegido.
