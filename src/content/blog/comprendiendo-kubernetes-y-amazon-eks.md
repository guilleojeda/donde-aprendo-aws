---
title: "Amazon EKS: qué es, cómo funciona y cuánto cuesta"
description: "Entiende qué resuelve Kubernetes, qué administra Amazon EKS y qué queda a tu cargo. Revisa costos, escalado, primeros pasos y errores comunes antes de crear un clúster."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:21:48.687Z"
modifiedTimestamp: "2026-10-06T14:04:22-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Amazon VPC: subredes, rutas, NAT y seguridad en AWS"
    url: "https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/"
  - title: "Cómo configurar Service Discovery en Amazon ECS con AWS Cloud Map"
    url: "https://dondeaprendoaws.com/blog/configuracion-de-service-discovery-en-amazon-ecs/"

---

Amazon Elastic Kubernetes Service (Amazon EKS) es el servicio de AWS para ejecutar Kubernetes sin instalar ni mantener por tu cuenta el plano de control. AWS opera los servidores de la API y la base de datos del clúster; tú sigues decidiendo cómo desplegar, conectar, proteger, actualizar y pagar tus aplicaciones. La administración de los nodos depende de la opción de cómputo que elijas.

Kubernetes es un sistema de código abierto que mantiene aplicaciones en contenedores cerca del estado que declaras: por ejemplo, cuántas copias ejecutar y qué imagen usar. EKS ofrece ese conjunto de APIs de Kubernetes como un servicio administrado en AWS. Si recién comparas las opciones de contenedores, [Cómo entendí los contenedores en AWS: Docker, ECS y EKS explicados desde cero](https://builder.aws.com/content/33FIp8idcHVslPOeJPdvgUL4wNo/cmo-entend-los-contenedores-en-aws-docker-ecs-y-eks-explicados-desde-cero) puede ayudarte a ubicarlas.

## ¿Qué hacen Kubernetes y EKS?

Kubernetes coordina los contenedores de una aplicación en un clúster. Entre los objetos más comunes están:

- **Pod:** unidad que Kubernetes programa en un nodo; puede contener uno o más contenedores que comparten red y almacenamiento.
- **Deployment:** declara cuántas réplicas de una aplicación deben ejecutarse y controla sus actualizaciones. No garantiza que la aplicación nunca tenga una interrupción: eso depende también de réplicas saludables, capacidad disponible, probes y de cómo se publique el cambio.
- **Service:** ofrece un nombre y una dirección estables para llegar a un conjunto de Pods. Un `ClusterIP` solo es accesible dentro del clúster.
- **Ingress:** declara reglas HTTP/HTTPS, pero necesita un controlador que las implemente. En EKS, el AWS Load Balancer Controller puede crear balanceadores de AWS; EKS Auto Mode ofrece capacidades de balanceo administradas. Crear un objeto `Ingress` por sí solo no crea un punto de entrada público.
- **ConfigMap y Secret:** permiten ofrecer datos de configuración a los Pods; reserva ConfigMap para valores no sensibles y Secret para credenciales u otros datos sensibles.

La [documentación de componentes de Kubernetes](https://kubernetes.io/docs/concepts/overview/components/) explica qué ocurre dentro del plano de control y en cada nodo.

## Plano de control y nodos: quién administra cada parte

Un clúster tiene un plano de control, que acepta y coordina las operaciones de Kubernetes, y un plano de datos, que ejecuta los Pods. En EKS, AWS gestiona el plano de control; el grado de administración de los nodos lo eliges al configurar el clúster.

| Parte | Qué administra AWS con EKS | Qué debes decidir u operar |
| --- | --- | --- |
| Plano de control | Ejecuta los componentes del control plane y mantiene sus instancias distribuidas en tres zonas de disponibilidad. Supervisa y reemplaza instancias del plano de control que fallen. | Planear versiones, permisos, acceso al endpoint y cambios del clúster. La disponibilidad del endpoint de la API no garantiza que tu aplicación esté disponible. |
| Grupos de nodos administrados | Aprovisiona y mantiene instancias EC2 de un grupo; facilita reemplazarlas y actualizarlas mediante una operación explícita. | Elegir tipos de instancia, tamaño, límites, imágenes y estrategia de actualización; administrar las cargas que se ejecutan allí. Las instancias siguen en tu cuenta y generan cargos. |
| Nodos autogestionados | Proporciona el servicio EKS y sus APIs. | Crear, escalar, parchear y actualizar las instancias y sus componentes. |
| AWS Fargate | Ejecuta Pods compatibles sin que administres instancias de nodo. | Ajustar cada Pod a los recursos y limitaciones de Fargate; pagar por sus recursos de cómputo. No equivale a que AWS opere la aplicación. |
| EKS Auto Mode | Amplía la administración de AWS a nodos y capacidades integradas de cómputo, red, balanceo y almacenamiento. | Elegir si este modo y sus opciones encajan con la carga de trabajo, configurar permisos y aplicaciones, y revisar su cargo adicional. |

La [arquitectura de EKS](https://docs.aws.amazon.com/eks/latest/userguide/eks-architecture.html) detalla estas opciones. Los grupos de nodos administrados reducen trabajo operativo, pero sus instancias y volúmenes se cobran en tu cuenta. Para los [detalles de grupos administrados](https://docs.aws.amazon.com/eks/latest/userguide/managed-node-groups.html), revisa qué operaciones automatiza AWS y cuáles debes iniciar.

En todas las opciones sigues siendo responsable de las imágenes de contenedor, las réplicas, la configuración de red y la recuperación de datos de la aplicación. También debes decidir qué identidades humanas y cargas acceden al clúster y a otros servicios de AWS; la sección de seguridad explica cómo separar esos permisos.

EKS también usa una VPC y subredes para la conexión entre nodos y plano de control. La selección de subredes, direcciones IP disponibles, rutas y grupos de seguridad afecta la conectividad y las actualizaciones del clúster. Si necesitas repasar esos fundamentos, consulta la [guía de Amazon VPC](https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/).

## Cuánto cuesta Amazon EKS

EKS cobra una tarifa por hora por cada clúster. La tarifa depende del nivel de soporte de la versión de Kubernetes: el soporte extendido cuesta más que el estándar. A eso se suman los recursos que usa la carga: instancias EC2 y sus discos, direcciones IPv4 públicas, balanceadores, tráfico entre zonas, NAT Gateways u otros servicios de AWS. Con Fargate se cobran los recursos de CPU y memoria usados por los Pods; Auto Mode agrega un cargo de administración a las instancias que gestiona. Si habilitas EKS Capabilities o Provisioned Control Plane, revisa también sus cargos separados.

Por eso, que no haya solicitudes de usuarios o que un grupo pueda escalar a cero no significa que el clúster no tenga costo. Revisa el [detalle oficial de precios de EKS](https://aws.amazon.com/eks/pricing/) y arma un estimado con AWS Pricing Calculator antes de crear recursos.

### Escalado: Pods y nodos son dos decisiones distintas

El **Horizontal Pod Autoscaler (HPA)** ajusta la cantidad de Pods a partir de métricas. El servidor de métricas de Kubernetes no se instala por defecto en EKS; HPA necesita una API de métricas disponible y recursos como CPU y memoria declarados correctamente.

El escalado de **nodos** agrega o retira capacidad de cómputo para que los Pods pendientes puedan programarse. En clústeres con nodos EC2 puedes instalar y configurar Cluster Autoscaler o Karpenter; ninguno queda habilitado automáticamente por crear un grupo administrado. EKS Auto Mode automatiza ese ciclo de cómputo, con menos control manual y un costo adicional.

Configura y revisa los límites: un autoscaler no puede crear capacidad si el tipo de instancia o la región no están disponibles, si se alcanza el máximo configurado o si las restricciones de la carga impiden programarla. La guía de [escalado de cómputo en EKS](https://docs.aws.amazon.com/eks/latest/userguide/autoscaling.html) describe Karpenter, Cluster Autoscaler y Auto Mode. Como material comunitario adicional, puedes ver la sesión sobre [Karpenter de AWS Women Colombia](https://www.youtube.com/watch?v=MKy_BvhJkHI) y la charla de [EKS Auto Mode y nodos híbridos de 295DevOps](https://www.youtube.com/watch?v=eCpzplnwYaY). El [laboratorio Terraform de EKS Auto Mode](https://github.com/roxsross/roxs-eks-auto-mode) contiene infraestructura que puede crear recursos facturables: inspecciona el plan antes de aplicarlo y sigue sus instrucciones de limpieza. También puedes leer [EKS Auto Mode: correr Kubernetes sin andar peleando con los nodos](https://dev.to/aws-builders/eks-auto-mode-correr-kubernetes-sin-andar-peleando-con-los-nodos-5954), una experiencia comunitaria con un ejercicio de creación y eliminación de clúster; su ejemplo publica un balanceador, así que revisa los cargos y limpia los recursos al terminar.

## Primeros pasos con un clúster de EKS

Para practicar primero los objetos de Kubernetes sin cargos de AWS, puedes crear un clúster local con herramientas como kind o minikube. EKS tiene sentido cuando quieres aprender también la identidad, la red y las integraciones de AWS.

Para un clúster de prueba en AWS necesitas credenciales configuradas, permisos IAM suficientes, AWS CLI, `kubectl` y `eksctl`. Usa una versión de `kubectl` igual a la del clúster o con una diferencia de una versión menor. Revisa la guía de AWS para [instalar y configurar esas herramientas](https://docs.aws.amazon.com/eks/latest/userguide/setting-up.html). El comando siguiente crea recursos de AWS facturables; el tipo de instancia, la disponibilidad de la zona y las cuotas de tu cuenta pueden requerir ajustes:

```sh
eksctl create cluster \
  --name mi-eks \
  --region us-west-2 \
  --version 1.36 \
  --node-type t3.medium \
  --nodes 2
```

`eksctl` crea un grupo de nodos administrado y actualiza el archivo `kubeconfig` para usar el clúster. La versión `1.36` está en soporte estándar de EKS al revisar esta guía (6 de octubre de 2026); comprueba la [lista vigente de versiones de Kubernetes en EKS](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) antes de ejecutar el comando en otra fecha. La versión `1.21` de las instrucciones antiguas ya no es una opción soportada para crear clústeres nuevos.

Comprueba que el cliente se conecta y que el nodo se registró:

```sh
kubectl get nodes
```

Para probar un despliegue sin publicar la aplicación en Internet, crea un Pod y reenvía un puerto a tu equipo:

```sh
kubectl create deployment web --image=nginx:stable
kubectl rollout status deployment/web
kubectl port-forward deployment/web 8080:80
```

Mientras `port-forward` siga ejecutándose, abre `http://localhost:8080` en el navegador. Este túnel solo expone la aplicación en tu equipo; no crea un balanceador público. Cuando termines, elimina el clúster de prueba con el mismo nombre y región:

```sh
eksctl delete cluster --name mi-eks --region us-west-2 --wait
```

Si la cuenta tiene otros recursos que añadiste por separado, como volúmenes persistentes o balanceadores, comprueba que también se hayan eliminado. La [guía de creación de clústeres de AWS](https://docs.aws.amazon.com/eks/latest/userguide/create-cluster.html) y la [guía de clústeres de eksctl](https://eksctl.io/usage/creating-and-managing-clusters/) cubren alternativas y requisitos de red.

## Problemas comunes y cómo empezar a diagnosticarlos

**`kubectl` devuelve `Unauthorized` o `AccessDenied`.** Primero confirma con qué identidad de AWS estás trabajando: `aws sts get-caller-identity`. Luego actualiza el contexto del clúster con `aws eks update-kubeconfig --region us-west-2 --name mi-eks`. Si continúa el error, verifica que esa identidad tenga una entrada de acceso en EKS con una política de acceso asociada o un grupo de Kubernetes con permisos RBAC. Tener permisos IAM sobre la cuenta no concede por sí solo permiso para consultar objetos de Kubernetes. Consulta [cómo conectar `kubectl` a EKS](https://docs.aws.amazon.com/eks/latest/userguide/create-kubeconfig.html) y [cómo dar acceso IAM al clúster](https://docs.aws.amazon.com/eks/latest/userguide/access-entries.html).

**Un Pod queda en `Pending`.** Ejecuta `kubectl describe pod` con el nombre y espacio de nombres del Pod, y lee los eventos. Busca si falta CPU o memoria, si un taint o regla de afinidad excluye los nodos, si se agotó una cuota o si el volumen solicitado no puede conectarse. Antes de subir el número de réplicas, confirma que haya nodos disponibles y que el escalado de nodos esté configurado.

**Un Service no muestra una dirección externa o un Ingress no crea un ALB.** Revisa los eventos del recurso y confirma que el controlador correspondiente esté instalado y autorizado para crear balanceadores. También comprueba que las subredes cumplan los requisitos de selección del balanceador. En EKS Auto Mode, las capacidades integradas cubren parte de esta configuración; en un clúster estándar, no des por hecho que un objeto Kubernetes instalará el controlador por sí mismo. Sigue la [guía del AWS Load Balancer Controller](https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html).

**Una actualización de Kubernetes falla o queda incompleta.** No es una actualización automática de todo el clúster. Planifica subir el plano de control una versión menor por vez y luego actualizar los nodos, los add-ons como VPC CNI, CoreDNS y `kube-proxy`, y `kubectl`. Los grupos de nodos administrados tampoco se actualizan automáticamente con el plano de control; Auto Mode tiene su propio ciclo administrado. Revisa APIs obsoletas y disponibilidad de direcciones IP en las subredes antes de empezar. La [guía de actualización de EKS](https://docs.aws.amazon.com/eks/latest/userguide/update-cluster.html) da el procedimiento actual.

## Seguridad, secretos y observabilidad

Para personas, usa IAM para establecer la identidad y configura la autorización en EKS con una política de acceso o un grupo de Kubernetes cuyo acceso limites mediante RBAC. Para que una aplicación llame a AWS, asígnale un rol de IAM propio en vez de ampliar los permisos del rol común de los nodos.

Guarda en ConfigMaps solo valores no sensibles. Aunque un objeto Secret está pensado para credenciales, sus valores se representan en Base64, que no es cifrado. En EKS, Kubernetes 1.28 o posterior cifra por defecto los datos almacenados en la API; ese cifrado no impide que una identidad autorizada o un Pod al que montaste el Secret lo lea. Restringe quién puede consultar Secrets, entrégalos solo a las cargas que los necesitan y rota las credenciales. Consulta las [consideraciones de seguridad de Secrets en Kubernetes](https://kubernetes.io/docs/concepts/configuration/secret/) y el [cifrado predeterminado de datos de la API en EKS](https://docs.aws.amazon.com/eks/latest/userguide/envelope-encryption.html).

No supongas que un objeto `NetworkPolicy` filtra tráfico solo por existir: el plugin de red debe implementar las reglas y la función debe estar habilitada. La política de red del VPC CNI de EKS, por ejemplo, viene desactivada por defecto y requiere configuración; revisa las [limitaciones y pasos para habilitarla](https://docs.aws.amazon.com/eks/latest/userguide/cni-network-policy-configure.html). Para monitorear, define qué métricas, registros de aplicaciones y registros del plano de control necesitas recopilar; habilitar métricas para el HPA no reemplaza una solución histórica de observabilidad.

## ¿Cuándo elegir EKS y cuándo mirar ECS?

Elige EKS si ya trabajas con Kubernetes, necesitas sus APIs y herramientas, quieres ejecutar operadores existentes o requieres coherencia con clústeres en más de un proveedor. Aun con un plano de control administrado, prepara tiempo para aprender la red, identidad, capacidad, actualizaciones y operación de Kubernetes.

Compara ECS si tu objetivo es orquestar contenedores dentro de AWS y prefieres trabajar con las abstracciones de AWS en vez de administrar conceptos de Kubernetes. Si eliges ECS y necesitas que los servicios se encuentren entre sí mediante DNS, consulta la guía interna de [service discovery en Amazon ECS](https://dondeaprendoaws.com/blog/configuracion-de-service-discovery-en-amazon-ecs/). La decisión entre ambos depende de las capacidades que necesitas y del trabajo operativo que tu equipo acepta.

## Recursos para seguir aprendiendo

- Empieza por [Kubernetes explicado en su documentación](https://kubernetes.io/docs/concepts/overview/what-is-kubernetes/) y luego repasa [la arquitectura de Amazon EKS](https://docs.aws.amazon.com/eks/latest/userguide/eks-architecture.html).
- Para una introducción en video, mira [EKS Fundamentals: Desmitificando Kubernetes con AWS](https://www.youtube.com/watch?v=YEY9NbFMQ0Y), del AWS User Group Ecuador; [La Amenaza del Nivel 100: Amazon EKS](https://www.youtube.com/watch?v=bMk8X_0RNFk), de AWS Women Colombia; o [Empezando con Kubernetes en AWS](https://www.youtube.com/watch?v=T6QPU-Ls_-g), de Marcia en Desplegando Cloud.
- Para ver un primer despliegue, sigue la charla de [Tu primera aplicación en Kubernetes con Amazon EKS](https://www.youtube.com/watch?v=Mxy9xmvBZZs), del AWS User Group CreaTicas. Como continuación, [Apps Cloud Native con AWS EKS](https://www.youtube.com/watch?v=wXIxEWNUPa4) es una sesión del AWS Users Group de Paraguay.
- Para seguridad de cargas Kubernetes en AWS, consulta la presentación comunitaria [De attacker a defender: pentesting en Kubernetes con servicios de AWS](https://es.slideshare.net/slideshow/aws-community-fest-peru-2025-de-attacker-a-defender-pentesting-en-kubernetes-con-aws-security-services/283734511). Complementa el tema con las [consideraciones de seguridad oficiales de EKS](https://docs.aws.amazon.com/eks/latest/userguide/security-k8s.html).
- Si estarás en Guayaquil, el [AWS & Cloud Native Security Night del AWS User Group Security Ecuador](https://discover.multiticketing.com/en/aws-user-group-ecuador/events/aws-cloud-native-security-night) tratará seguridad de Kubernetes y contenedores el 23 de octubre de 2026, de 17:00 a 20:00 (hora de Guayaquil, UTC−05:00), en la Universidad Católica de Santiago de Guayaquil. El organizador anuncia entrada gratuita y cupos limitados; consulta la [inscripción en Meetup](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/) para confirmar disponibilidad y condiciones.
- Para seguir reuniones, grabaciones y actividades, visita el sitio del [AWS User Group Ecuador](https://www.awsugecuador.com/) y su [grupo en Meetup](https://www.meetup.com/aws-ecuador/); el [AWS User Group CreaTicas](https://www.meetup.com/chiapa-uk-aws-users-meetup-group/); [AWS Women Colombia en Meetup](https://www.meetup.com/aws-women-colombia-user-group/) y su [archivo de eventos](https://awswomencolombia.com/page/eventos); [AWS Women Ecuador en Meetup](https://www.meetup.com/aws-women-ecuador/); y el [AWS User Group Paraguay en Meetup](https://www.meetup.com/aws-ug-paraguay/). Sus grupos publican actividades propias; verifica en cada página el calendario y la modalidad de participación.
