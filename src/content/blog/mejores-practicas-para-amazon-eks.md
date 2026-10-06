---
title: "Amazon EKS: mejores prácticas de seguridad, costos y operación"
description: "Aprende qué administra EKS y qué queda a tu cargo. Compara nodos, Auto Mode y Fargate, protege permisos, planifica versiones y estima costos."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:58:54.462Z"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
modifiedTimestamp: "2026-10-06T17:37:38-03:00"
review:
  date: "2026-10-06"
related:
  - title: "Cómo desplegar contenedores en AWS: elige entre ECS, EKS y Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/"
  - title: "Cómo desplegar una aplicación en Amazon EKS con kubectl"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-una-aplicacion-en-amazon-eks/"
---

Amazon Elastic Kubernetes Service (Amazon EKS) ejecuta Kubernetes con un [plano de control administrado por AWS](https://docs.aws.amazon.com/eks/latest/userguide/eks-architecture.html). EKS no configura por sí solo toda la aplicación ni todos los recursos del clúster: el equipo sigue eligiendo cómo ejecutar los pods, proteger sus permisos, actualizar sus nodos y diseñar la red. **EKS Auto Mode delega más trabajo de infraestructura; los grupos de nodos administrados y Fargate cubren necesidades diferentes.**

Estas prácticas ayudan a decidir si EKS es apropiado, operar el clúster con menos sorpresas y entender qué genera cargos. Si aún comparas EKS con las opciones de contenedores de AWS, empieza por esta [guía para elegir entre ECS, EKS y Fargate](/blog/como-desplegar-contenedores-en-aws/).

## Qué administra Amazon EKS

AWS administra los componentes del plano de control de Kubernetes, como el servidor de API y la base de datos `etcd`. El plano de control se distribuye en varias zonas de disponibilidad. Eso mejora la disponibilidad del servicio, pero no vuelve altamente disponible a cada aplicación: la cantidad y distribución de réplicas, la capacidad de los nodos, las dependencias y el almacenamiento siguen formando parte del diseño de la carga.

La responsabilidad sobre el cómputo cambia según la opción que elijas:

- **[Grupos de nodos administrados](https://docs.aws.amazon.com/eks/latest/userguide/managed-node-groups.html):** EKS aprovisiona y gestiona el ciclo de vida de instancias EC2 dentro de un grupo de Auto Scaling. Eliges capacidad, subredes y configuración; planificas las actualizaciones de nodos y despliegas las AMI parcheadas. Esta opción no tiene un cargo propio adicional por administrar el grupo, pero sí se pagan EC2, EBS, el clúster y los demás recursos.
- **[EKS Auto Mode](https://docs.aws.amazon.com/eks/latest/userguide/automode.html):** AWS también administra más infraestructura del clúster, entre ella el escalado de cómputo, redes de pods, balanceadores y almacenamiento en bloques. Sigues a cargo de la aplicación, la configuración del clúster y la VPC. Auto Mode cobra una tarifa de gestión además de las instancias EC2 y el clúster.
- **[AWS Fargate para EKS](https://docs.aws.amazon.com/eks/latest/userguide/fargate.html):** ejecuta cada pod seleccionado por un perfil de Fargate sin que administres un grupo de instancias. No admite todos los patrones de Kubernetes: por ejemplo, no permite DaemonSets ni contenedores privilegiados, y los pods se ejecutan en subredes privadas. Comprueba las limitaciones antes de mover una carga.

Para ver Auto Mode y nodos híbridos desde una perspectiva comunitaria, consulta la sesión de [295DevOps](https://www.youtube.com/watch?v=eCpzplnwYaY), publicada en 2024; contrasta su configuración con la documentación vigente. El [laboratorio de EKS Auto Mode con Terraform](https://github.com/roxsross/roxs-eks-auto-mode) muestra pasos para crear y destruir un clúster. Requiere AWS CLI, `kubectl` y Terraform; el README indica comandos para Linux. Lee el plan, los archivos y la limpieza antes de ejecutar Terraform: aprovisionar EKS y EC2 puede generar cargos. Es material de exploración, no una configuración de producción validada en esta revisión.

Ninguna opción elimina las tareas de seguridad y operación de Kubernetes. EKS tiene sentido cuando necesitas compatibilidad con su API, herramientas o ecosistema; para una aplicación en contenedores que no depende de Kubernetes, compara Amazon ECS.

## Cinco prácticas para operar EKS

### 1. Planifica la versión y el ciclo de actualización

Consulta las [versiones de Kubernetes que EKS admite](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) antes de crear o actualizar un clúster. No fijes una versión o una AMI antigua tomada de un tutorial: revisa el período de soporte, la compatibilidad de los componentes y las instrucciones actuales para tu tipo de nodo.

EKS ofrece 14 meses de soporte estándar para cada versión menor y, después, hasta 12 meses de soporte extendido con un cargo adicional por hora de clúster. La [política de versiones y soporte](https://docs.aws.amazon.com/eks/latest/userguide/view-upgrade-policy.html) figura actualmente con `EXTENDED` como valor predeterminado para clústeres nuevos y existentes; comprueba la política de tu clúster para saber si entrará en esa etapa. Si eliges la política `STANDARD`, EKS actualiza automáticamente el plano de control al terminar el soporte estándar.

Actualiza de forma coordinada, pero no supongas que una actualización del plano de control actualiza todos los componentes. Los [grupos de nodos administrados](https://docs.aws.amazon.com/eks/latest/userguide/managed-node-groups.html) y sus AMI requieren una actualización planificada; revisa también los complementos de EKS y las versiones de tus cargas. Auto Mode administra más actualizaciones de la infraestructura, sujeto a los controles de interrupción que configures.

Para escuchar una perspectiva comunitaria sobre GitOps e infraestructura sincronizada para EKS, mira esta [sesión de AWS Women Colombia](https://www.youtube.com/watch?v=3xHKb53ZFcM), publicada en 2024. Contrasta cualquier configuración del video con la documentación actual.

### 2. Separa el acceso de las personas del acceso de las aplicaciones

Para que una persona use `kubectl`, configura el acceso al clúster y los permisos de Kubernetes que necesita. Una identidad de IAM con acceso a la cuenta no recibe automáticamente permisos para operar cada recurso de Kubernetes. Las [entradas de acceso de EKS](https://docs.aws.amazon.com/eks/latest/userguide/access-entries.html) permiten asociar roles y usuarios de IAM con el acceso al clúster; aplica el principio de mínimo privilegio.

Una aplicación que llama a S3, DynamoDB u otra API de AWS necesita permisos de IAM propios. Asócialos a una cuenta de servicio de Kubernetes: AWS recomienda **[EKS Pod Identity cuando sea compatible](https://docs.aws.amazon.com/eks/latest/userguide/service-accounts.html)**. En la configuración documentada hoy, [Pod Identity](https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html) se limita a pods Linux en instancias EC2 y no admite pods en Fargate. **[IRSA](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)** es una alternativa cuando el entorno requiere ese alcance, incluido Fargate. En ambos casos, evita reutilizar el rol amplio de los nodos para dar permisos a todas las aplicaciones.

Para profundizar en seguridad de Kubernetes y contenedores, las [diapositivas De attacker a defender: pentesting en Kubernetes con AWS Security Services](https://es.slideshare.net/slideshow/aws-community-fest-peru-2025-de-attacker-a-defender-pentesting-en-kubernetes-con-aws-security-services/283734511) presentan un ejercicio controlado sobre EKS, seguridad de contenedores y detección. La charla es de AWS Community Fest Perú 2025; usa cualquier laboratorio solo en un entorno propio y aislado, y revisa sus recursos y costos antes de ejecutarlo.

### 3. Diseña la red y la disponibilidad para tu carga

El [endpoint de la API del clúster](https://docs.aws.amazon.com/eks/latest/userguide/cluster-endpoint.html) es público de forma predeterminada. Decide quién puede alcanzarlo: puedes habilitar el acceso privado, limitar el endpoint público a rangos CIDR concretos o combinar ambos. Si restringes el acceso público, asegúrate de que los nodos y los operadores todavía puedan comunicarse con el endpoint. No lo dejes abierto a todo Internet por comodidad.

Para servicios que deben tolerar la pérdida de una zona, distribuye capacidad y réplicas en varias zonas de disponibilidad. Configura [restricciones de distribución de pods](https://docs.aws.amazon.com/eks/latest/best-practices/data-plane.html) y un presupuesto de interrupción (`PodDisruptionBudget`) que permita mantenimiento sin desalojar demasiadas réplicas a la vez. Un presupuesto no reemplaza el diseño de la aplicación ni garantiza que una réplica pueda arrancar si falta capacidad.

Revisa la [guía de redes de EKS](https://docs.aws.amazon.com/eks/latest/best-practices/networking.html) al dimensionar subredes, IP disponibles, rutas y acceso a registros de imágenes. Una subred sin direcciones disponibles o sin salida hacia el registro puede impedir que los pods inicien.

### 4. Escala la aplicación y los nodos como problemas distintos

Define solicitudes y límites de CPU y memoria para que Kubernetes pueda ubicar las cargas y limitar su consumo. Usa una readiness probe para que el servicio no dirija tráfico a un pod que todavía no responde, y define réplicas según los niveles de disponibilidad y capacidad que necesitas.

El escalado de pods no agrega capacidad de cómputo por sí solo. Un [Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) ajusta réplicas según las métricas configuradas; también debes decidir cómo se incorporan nodos cuando no queda capacidad. Puedes delegar esa parte a Auto Mode o elegir un mecanismo de escalado de nodos compatible con tu arquitectura, como Karpenter o Cluster Autoscaler. Define quién administra la capacidad antes de combinar controladores.

Las instancias Spot pueden bajar el costo de procesamiento por lotes y otras cargas tolerantes a interrupciones. No las uses como capacidad única para una aplicación que requiere continuidad sin plan de reemplazo y recuperación.

### 5. Observa antes de que aparezca el incidente

Decide qué logs, métricas y eventos necesitas conservar para investigar tanto el clúster como las aplicaciones. Habilitar registros de control plane y enviar grandes volúmenes de logs genera almacenamiento e ingesta facturables en los servicios de observabilidad que uses; configura retención y alertas según tu necesidad.

Con acceso ya configurado a un clúster, estos comandos de solo lectura ayudan a ubicar la capa del problema:

```bash
CLUSTER_NAME="mi-cluster"
AWS_REGION="us-east-1"
NAMESPACE="default"
POD="mi-pod"

aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" \
  --query 'cluster.status' --output text
kubectl get nodes -o wide
kubectl get pods --all-namespaces -o wide
kubectl describe pod --namespace "$NAMESPACE" "$POD"
kubectl logs --namespace "$NAMESPACE" "$POD"
```

Si un pod está en `Pending`, mira los eventos de `describe`: pueden señalar falta de capacidad, recursos incompatibles o un perfil de Fargate que no coincide. Si está en `ImagePullBackOff`, comprueba el nombre y la arquitectura de la imagen, los permisos de lectura del registro y la conectividad. Para entender el flujo entre registro y despliegue, mira la [ECR & EKS Masterclass de AWS Women Ecuador](https://www.youtube.com/watch?v=qMM6UEalSkI). Es una grabación de 2023: úsala para el flujo conceptual y contrasta las versiones, comandos y pantallas con las instrucciones actuales de AWS. Ante `CrashLoopBackOff`, revisa los logs y eventos del pod; si el contenedor ya reinició, `kubectl logs --previous` muestra la salida de su instancia anterior. Para conectar por primera vez `kubectl`, sigue la guía vigente de [`aws eks update-kubeconfig`](https://docs.aws.amazon.com/eks/latest/userguide/create-kubeconfig.html) y usa un `kubectl` compatible con la versión del clúster.

## Cuánto cuesta EKS

Amazon EKS cobra por hora de clúster aunque no haya pods ejecutándose. El precio depende del nivel de soporte de Kubernetes; el soporte extendido cuesta más que el estándar. A eso se suman los recursos de la carga: instancias EC2 o capacidad Fargate, volúmenes, balanceadores, direcciones IPv4 públicas, transferencia, NAT Gateway y logs. **Auto Mode añade su tarifa de gestión al precio de EC2; los grupos de nodos administrados no añaden una tarifa de gestión propia.**

Comprueba la [página de precios de Amazon EKS](https://aws.amazon.com/eks/pricing/) y las tarifas de cada servicio en la región y duración que piensas usar. Borrar objetos de Kubernetes no elimina necesariamente el clúster, los volúmenes u otros recursos de AWS. Para una práctica, sigue el proceso de eliminación de su guía y confirma en la consola de facturación que ya no quedan recursos.

## Recursos para aprender y pedir ayuda

- La [guía de mejores prácticas de EKS de AWS](https://docs.aws.amazon.com/eks/latest/best-practices/introduction.html) organiza material actualizado sobre seguridad, confiabilidad, redes, escalado, actualizaciones y costos.
- El [Amazon EKS Workshop](https://www.eksworkshop.com/) ofrece prácticas a tu ritmo: incluye una ruta de fundamentos con Auto Mode y módulos de observabilidad, seguridad, redes y diagnóstico. Si una actividad crea recursos en tu cuenta, revisa antes los cargos posibles y cómo eliminarlos.
- Para comenzar desde cero, mira la grabación [Tu primera aplicación en Kubernetes con Amazon EKS](https://www.youtube.com/watch?v=Mxy9xmvBZZs), de AWS User Group CreaTicas. La sesión de junio de 2026 explica contenedores y Kubernetes y muestra un primer despliegue con `kubectl` y manifiestos; el clúster y la aplicación son recursos de AWS cuyo costo debes revisar antes de reproducirlos. Como repaso de conceptos, [EKS Fundamentals: desmitificando Kubernetes con AWS](https://www.youtube.com/watch?v=YEY9NbFMQ0Y), de AWS User Group Ecuador, se publicó en junio de 2025.
- Para ampliar el panorama de aplicaciones cloud native, mira [Apps Cloud Native con AWS EKS](https://www.youtube.com/watch?v=wXIxEWNUPa4), grabación de AWS User Group Paraguay publicada en 2024. Contrasta detalles de configuración con la documentación actual.
- En Latinoamérica puedes sumarte a comunidades generales, aunque no se especialicen en Kubernetes: [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) reúne a personas interesadas en computación en la nube para compartir experiencias, y [AWS User Group Ecuador](https://www.awsugecuador.com/) organiza charlas, talleres y encuentros para personas desde nivel inicial hasta producción. El [AWS User Group Perú](https://awsugperu.cloud/) publica meetups, grupos de estudio y comunidades por ciudad. Para encontrar otras opciones, consulta el [directorio global de AWS User Groups](https://builder.aws.com/community/user-groups) o el [directorio de comunidades de este sitio](/comunidades/); revisa las condiciones de cada grupo y convocatoria.

Si te interesa la seguridad de Kubernetes y de las imágenes de contenedor, AWS User Group Security Ecuador anuncia **[AWS & Cloud Native Security Night](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/)** para el viernes **23 de octubre de 2026, de 17:00 a 20:00 (UTC−5)**, en el auditorio de la Facultad de Ingeniería de la Universidad Católica de Santiago de Guayaquil, sobre la Av. Pdte. Carlos Julio Arosemena Tola. La ficha informa entrada gratuita y cupos limitados; requiere inscripción. Confirma allí disponibilidad y detalles antes de asistir. La agenda se consultó el 6 de octubre de 2026.

Para pasar de esta guía a una práctica completa, sigue el [tutorial de despliegue de una aplicación en Amazon EKS](/blog/como-desplegar-una-aplicacion-en-amazon-eks/), que crea un clúster de laboratorio, despliega una aplicación, la diagnostica y explica cómo limpiar sus recursos.

## Preguntas frecuentes

### ¿Amazon EKS administra los nodos?

Depende de la opción de cómputo. EKS ayuda a gestionar los grupos de nodos administrados, pero el equipo sigue planificando y aplicando sus actualizaciones. Auto Mode amplía la gestión de AWS sobre la infraestructura del clúster; Fargate administra la capacidad de los pods que coinciden con un perfil.

### ¿Amazon EKS es gratuito?

No. El clúster tiene un cargo por hora y sus recursos de cómputo, red, almacenamiento y observabilidad se facturan por separado. Revisa los precios actuales antes de crear un clúster de práctica y elimina los recursos al terminar.

### ¿EKS Auto Mode y Fargate son lo mismo?

No. Auto Mode administra más infraestructura del clúster y usa instancias EC2; Fargate ejecuta pods seleccionados sin que gestiones nodos EC2. Cada alternativa tiene restricciones y cargos propios.

### ¿Al actualizar la versión de Kubernetes se actualizan también los nodos?

No necesariamente. En los grupos de nodos administrados, el equipo debe planificar la actualización de los nodos y revisar las AMI y complementos compatibles. EKS Auto Mode administra más partes de ese ciclo; confirma su comportamiento y los controles de interrupción para tu clúster.
