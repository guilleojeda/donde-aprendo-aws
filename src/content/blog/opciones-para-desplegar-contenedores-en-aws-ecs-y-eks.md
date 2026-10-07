---
title: "Amazon ECS vs. EKS: diferencias y cómo elegir"
description: "Compara Amazon ECS y EKS por API, operación, cómputo y disponibilidad. Decide cuándo Kubernetes aporta valor y qué capacidad necesita cada servicio."
author: "guille-ojeda"
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T23:41:11.485Z"
modifiedTimestamp: "2026-10-07T00:03:47-03:00"
review:
  date: "2026-10-07"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []

---

Si tu aplicación necesita ejecutar contenedores en AWS y no depende de Kubernetes, empieza evaluando **Amazon ECS**. Elige **Amazon EKS** cuando necesites la API y el ecosistema de Kubernetes, ya tengas cargas y herramientas basadas en Kubernetes o quieras mantener una plataforma común en Kubernetes. EKS administra el plano de control; la operación de las aplicaciones y parte de la capacidad siguen siendo decisiones del equipo.

ECS y EKS pueden ejecutar aplicaciones que escalan y requieren alta disponibilidad. El número de microservicios, por sí solo, no determina cuál conviene. Primero separa dos preguntas: **qué orquestador necesita tu equipo** y **quién administrará el cómputo**. Para comparar además Lightsail, ECS Express Mode y otras rutas, consulta la [guía general para desplegar contenedores en AWS](/blog/como-desplegar-contenedores-en-aws/).

## Qué cambia entre ECS y EKS

### API y compatibilidad

En **ECS** defines tareas y servicios con las API de AWS y una definición de tarea. ECS no expone la API de Kubernetes. En **EKS** describes cargas con objetos de Kubernetes como `Deployment`, `Service` y `Job`, y puedes operarlas con `kubectl` y herramientas compatibles.

EKS es conforme con Kubernetes, pero eso no elimina todas las dependencias al mover una aplicación: IAM, red, almacenamiento y otros servicios de AWS siguen afectando su portabilidad.

### Responsabilidades de operación

AWS opera la orquestación de ECS y el plano de control de Kubernetes en EKS. En ambos casos, tu equipo configura la aplicación, su red, permisos, salud y despliegues. La opción de cómputo determina qué tareas de los hosts o nodos delegas en AWS.

ECS suele encajar con equipos que quieren ejecutar contenedores sin adoptar Kubernetes. EKS encaja cuando el equipo ya usa sus API, manifiestos, herramientas o controles, o necesita esa plataforma por una razón concreta.

La [documentación de Amazon ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html) describe sus componentes —capacidad, controlador y aprovisionamiento—; la [documentación de Amazon EKS](https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html) explica el plano de control administrado y la conformidad con Kubernetes. ECR cumple otra función: [Amazon ECR almacena imágenes de contenedor](https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html); no ejecuta ni orquesta esas imágenes. Puedes usar ECR con ECS o EKS, siempre que la carga de trabajo tenga acceso al registro.

Si quieres escuchar una explicación comunitaria de ECS en español, la charla [Containers en AWS: Construyendo el ecosistema de contenedores en ECS](https://www.youtube.com/watch?v=vZk7uVwFMQA) del AWS User Group Ecuador fue impartida por Rossana Suarez en junio de 2023. Es una grabación introductoria; para los procedimientos actuales, consulta la documentación oficial enlazada arriba.

## Elige también dónde correr los contenedores

Fargate es una opción de cómputo, no un orquestador alternativo a ECS o EKS. El mismo orquestador puede usar distintas formas de capacidad, con diferentes niveles de control y trabajo operativo.

### Cómputo para ECS

- **Fargate:** ejecuta tareas sin que administres instancias; reduce el trabajo sobre hosts.
- **EC2:** eliges y operas las instancias, con control sobre hosts y capacidad.
- **ECS Managed Instances:** AWS aprovisiona, mantiene, parchea y escala instancias EC2 para el clúster. Conserva acceso a distintas familias y capacidades de EC2, con una tarifa de gestión además del costo de las instancias.

### Cómputo para EKS

- **EKS Managed Node Groups o nodos propios en EC2:** aportan hosts para los pods, con responsabilidades distintas de mantenimiento según la opción.
- **EKS Auto Mode:** AWS administra más componentes del cómputo, la red, el balanceo y el almacenamiento. Reduce tareas de infraestructura, pero tu equipo sigue operando Kubernetes, la configuración de VPC y la aplicación.
- **Fargate:** ejecuta pods que coinciden con perfiles de Fargate. No admite DaemonSets, contenedores privilegiados ni GPU; comprueba estos límites antes de elegirlo.

Consulta las [opciones de capacidad de ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/capacity-launch-type-comparison.html), las [opciones de cómputo de EKS](https://docs.aws.amazon.com/eks/latest/userguide/eks-compute.html), [EKS Auto Mode](https://docs.aws.amazon.com/eks/latest/userguide/automode.html) y las [consideraciones de EKS Fargate](https://docs.aws.amazon.com/eks/latest/userguide/fargate.html) antes de seleccionar una ruta. Si necesitas GPU, acceso al host, una arquitectura de CPU concreta o ajustes especiales del nodo, verifica qué opción y región los admite.

Para leer una experiencia práctica con Auto Mode y sus tradeoffs, consulta el artículo de Bianca Torres para AWS Community Builders, [EKS Auto Mode: correr Kubernetes sin andar peleando con los nodos](https://dev.to/aws-builders/eks-auto-mode-correr-kubernetes-sin-andar-peleando-con-los-nodos-5954). Incluye un laboratorio que crea recursos de EKS y EC2 y propone eliminarlos al terminar; también cita una versión concreta de `eksctl`. Antes de ejecutar los pasos, confirma las versiones, permisos, costos y límites vigentes en la documentación oficial.

## Escalado y alta disponibilidad requieren diseño

**Escalar** significa ajustar la cantidad de capacidad según la demanda. **Alta disponibilidad** significa que la aplicación siga atendiendo cuando falla una tarea, un nodo o una zona. Un clúster que escala no necesariamente está preparado para una interrupción, y un clúster distribuido puede quedarse sin capacidad si la demanda supera los recursos disponibles.

En ECS, el escalado automático del servicio ajusta la cantidad deseada de tareas según métricas configuradas. Si usas capacidad EC2, también debes asegurar que haya instancias suficientes; la estrategia de capacidad puede administrar el escalado del clúster. Para alta disponibilidad, usa un servicio con tareas distribuidas en subredes de varias zonas, balanceo y comprobaciones de salud. ECS distribuye las tareas de los servicios entre zonas de manera predeterminada, aunque la distribución y la capacidad disponible siguen dependiendo de la configuración y los recursos elegidos. Consulta la [guía de capacidad y disponibilidad de ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/capacity-availability-best-practice.html).

Después de elegir ECS, puedes practicar los despliegues canary con [ECS Canary in Action](https://github.com/roxsross/aws-ecs-canary-in-action), una demo comunitaria que primero ofrece un laboratorio local con Docker Compose. Su modo AWS usa Terraform para crear ECS Fargate, ALB, DynamoDB, CloudWatch y ECR; requiere AWS CLI v2, Docker, `jq`, Terraform 1.6 o superior y permisos para esos recursos. Revisa la guía de operación del repositorio y ejecuta su limpieza (`terraform destroy`) al terminar para retirar el laboratorio.

En EKS, un **Horizontal Pod Autoscaler (HPA)** puede aumentar o reducir réplicas de pods según métricas; es una capa distinta del escalado de nodos. Sin suficiente capacidad, los nuevos pods no podrán programarse hasta que haya nodos disponibles. EKS Auto Mode y otras herramientas de escalado de nodos pueden responder a pods sin capacidad asignada. Para alta disponibilidad de la aplicación, despliega varias réplicas y distribúyelas entre nodos y zonas con restricciones de topología; configura las sondas y las políticas de interrupción que correspondan. La alta disponibilidad del plano de control que administra AWS no garantiza por sí sola la disponibilidad de tu aplicación. Consulta las guías de AWS sobre [HPA en EKS](https://docs.aws.amazon.com/eks/latest/userguide/horizontal-pod-autoscaler.html) y [aplicaciones de EKS de alta disponibilidad](https://docs.aws.amazon.com/eks/latest/best-practices/application.html).

Por ejemplo, una API sin estado con un proceso en segundo plano y una cola puede funcionar en ECS si no necesita Kubernetes: publica una imagen en ECR, ejecuta la API como servicio y configura la capacidad del proceso según su carga. Una opción inicial es ECS con Fargate si no quieres operar hosts; evalúa ECS Managed Instances o EC2 si necesitas capacidades de instancia o control de los hosts. Distribuye réplicas entre zonas y usa un balanceador para la API si el objetivo incluye tolerar la pérdida de una zona. Diseña por separado la disponibilidad de la base de datos y el almacenamiento.

Si esa misma organización ya mantiene manifiestos de Kubernetes, usa Helm u operadores compatibles, o comparte una plataforma Kubernetes entre entornos, EKS puede reducir cambios en la forma de describir y operar la aplicación. Luego debe elegir nodos EC2, Auto Mode o pods en Fargate según compatibilidad, control y costo. Una aplicación monolítica también puede ejecutarse en EKS si la plataforma del equipo lo justifica; una arquitectura de microservicios puede ejecutarse en ECS si sus necesidades encajan con el modelo de ECS.

## Costos y versiones que debes comparar

No hay un ganador de costo para todos los casos. Compara el precio de la región y las horas de operación con los recursos que realmente necesitas: vCPU, memoria, almacenamiento, nodos, balanceadores, IPv4, transferencia, NAT y logs. En ECS con Fargate se cobran los recursos solicitados por las tareas y los servicios asociados; ECS Managed Instances suma una tarifa de gestión al costo de las instancias EC2. En EKS hay un cargo por clúster, además del cómputo y los recursos de la aplicación; Auto Mode añade cargos de gestión al costo de EC2. Usa las páginas de [precios de ECS](https://aws.amazon.com/ecs/pricing/) y [precios de EKS](https://aws.amazon.com/eks/pricing/) para estimar el diseño concreto en tu región.

Si eliges EKS, revisa el calendario de versiones antes de crear o actualizar el clúster. AWS ofrece 14 meses de soporte estándar por versión menor y, luego, hasta 12 meses de soporte extendido con un cargo adicional. El soporte extendido no reemplaza un plan de actualización: consulta las [versiones disponibles y sus fechas de soporte](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) para tu fecha de despliegue.

### Referencia de ciclo de vida: AWS App Mesh

AWS anunció el fin del soporte de **AWS App Mesh** para el 30 de septiembre de 2026. Después de esa fecha ya no se puede acceder a la consola ni a los recursos del servicio. Por eso, no uses App Mesh como una recomendación vigente para un diseño nuevo; revisa la [documentación oficial de fin de soporte y migración](https://docs.aws.amazon.com/es_es/app-mesh/latest/userguide/what-is-app-mesh.html) si mantienes referencias antiguas.

## Recursos para aprender y probar

Para practicar ECS, la ruta oficial [Getting Started with Amazon ECS](https://aws.amazon.com/ecs/getting-started/) ofrece recorridos de conceptos básicos, Fargate y EC2. El [AWS EKS Workshop](https://www.eksworkshop.com/) permite explorar Kubernetes en EKS con ejercicios prácticos. Antes de ejecutar un taller en una cuenta propia, revisa qué recursos crea, sus permisos y cómo eliminarlos; los recursos de AWS pueden generar cargos.

Si prefieres empezar con una charla en español, [EKS Fundamentals: Desmitificando Kubernetes con AWS](https://www.youtube.com/watch?v=YEY9NbFMQ0Y) es una grabación del AWS User Group Ecuador publicada en junio de 2025. Sirve para repasar conceptos de EKS; contrasta procedimientos y versiones con la documentación actual. Puedes seguir al [AWS User Group Ecuador](https://www.awsugecuador.com/) para encontrar charlas y encuentros de la comunidad.

Hay dos actividades próximas que pueden servirte para conversar con otras personas que usan contenedores:

- En Córdoba, la comunidad estudiantil [AWS SBG de UTN Facultad Regional Córdoba](https://www.meetup.com/aws-cloud-club-at-utn-cordoba/) anuncia **AWS Gaming Lab: ECS, CI/CD y la magia de Terraform** el **10 de octubre de 2026**. La actividad es presencial, gratuita con inscripción previa y está dirigida a estudiantes de Ingeniería en Sistemas de Información. La página de UTN indica acreditación desde las 11:30 y charla principal entre las 12:00 y las 14:00, en el SUM del edificio Ing. Rubén Soro. Consulta la [ficha oficial del evento](https://prensa.frc.utn.edu.ar/eventos/aws-gaming-lab-ecs-ci-cd-y-la-magia-de-terraform/) para confirmar inscripción y condiciones.
- En Guayaquil, [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/) y Cloud Native Guayaquil organizan **AWS & Cloud Native Security Night** el **23 de octubre de 2026**, de 17:00 a 20:00 (UTC−05:00). La página del evento la anuncia presencial y sin costo, con registro y cupos limitados, en la Universidad Católica de Santiago de Guayaquil. Consulta allí los detalles y la [inscripción al evento](https://discover.multiticketing.com/en/aws-user-group-ecuador/events/aws-cloud-native-security-night). La agenda se consultó el 6 de octubre de 2026.

## Próximo paso práctico

Si decides usar ECS, sigue el [tutorial de despliegue con Amazon ECS y Fargate](/blog/como-desplegar-una-aplicacion-en-amazon-ecs/). Si necesitas Kubernetes, continúa con el [tutorial de Amazon EKS y kubectl](/blog/como-desplegar-una-aplicacion-en-amazon-eks/). Ambos recorren un laboratorio distinto; revisa sus requisitos de red, IAM, costos y limpieza antes de crear recursos. Para elegir entre otras opciones administradas y comparar el despliegue desde una imagen, vuelve a la [guía general de contenedores en AWS](/blog/como-desplegar-contenedores-en-aws/). Después del despliegue, la [guía para enviar logs de contenedores a CloudWatch Logs en ECS y EKS](/blog/monitoreo-de-contenedores-con-cloudwatch-logs/) explica las rutas de recolección y sus permisos.
