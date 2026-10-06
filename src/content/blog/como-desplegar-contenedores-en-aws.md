---
title: "Cómo desplegar contenedores en AWS: elige entre ECS, EKS y Fargate"
description: "Compara ECS, EKS, Fargate, EC2 y Lightsail. Elige cómo desplegar contenedores en AWS y revisa red, permisos, costos y tutoriales para practicar."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T00:56:38.087Z"
modifiedTimestamp: "2026-10-06T11:23:43-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cómo desplegar una aplicación en Amazon ECS con Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-una-aplicacion-en-amazon-ecs/"
  - title: "Cómo desplegar una aplicación en Amazon EKS con kubectl"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-una-aplicacion-en-amazon-eks/"
---

Para desplegar contenedores en AWS, primero decide qué debe administrar AWS y cuánto control necesitas. **Amazon ECS** organiza tareas sin exigirte Kubernetes; **Amazon EKS** ejecuta Kubernetes; **AWS Fargate** y **Amazon EC2** aportan capacidad de cómputo; **Amazon ECR** guarda imágenes y no las ejecuta. Para una web sencilla también puedes evaluar **Amazon Lightsail Container Services** o **Amazon ECS Express Mode**.

La pregunta práctica no es «¿cuál es el mejor servicio?», sino si tu equipo necesita Kubernetes, control de servidores o una experiencia más guiada. La [guía de decisión de AWS para servicios de contenedores](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/choosing-aws-container-service.html) compara estas rutas. Esta guía separa esas decisiones y te lleva a un despliegue concreto en [ECS con Fargate](/blog/como-desplegar-una-aplicacion-en-amazon-ecs/) o [EKS con Kubernetes](/blog/como-desplegar-una-aplicacion-en-amazon-eks/).

## Elige una ruta según tu aplicación

| Lo que necesitas | Ruta para evaluar | Qué administra AWS y qué debes considerar |
| --- | --- | --- |
| Publicar una aplicación web en contenedores con una configuración breve | [Lightsail Container Services](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-container-services.html) | Ofrece capacidad, despliegues y un endpoint HTTPS administrados. El servicio se cobra por su capacidad mensual aun cuando esté deshabilitado o no tenga un despliegue; debes eliminarlo para dejar de pagar. Tiene límites y controles distintos de ECS y EKS. |
| Recibir una imagen y obtener una aplicación en ECS con red, balanceador y escalado | [ECS Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html) | Crea un servicio ECS sobre Fargate y recursos como un Application Load Balancer. No suma un cargo propio por Express Mode, pero sí se cobran los recursos que crea. |
| Ejecutar servicios y tareas de contenedores integrados con AWS sin adoptar Kubernetes | Amazon ECS con Fargate o EC2 | ECS es el orquestador. Con Fargate no gestionas instancias; con EC2 eliges y operas las instancias. En ambos casos configuras tareas, red, permisos, salud y observabilidad. |
| Usar la API, las herramientas o los manifiestos del ecosistema Kubernetes | Amazon EKS | EKS administra el plano de control. Puedes elegir nodos EC2 administrados, [EKS Auto Mode](https://docs.aws.amazon.com/eks/latest/userguide/automode.html) o Fargate para los pods, con distintos controles y costos. |
| Controlar el sistema operativo y desplegar Docker directamente en una máquina | Amazon EC2 | Tú administras la instancia, sus actualizaciones, seguridad, capacidad y despliegue. Como referencia comunitaria, [esta guía despliega Docker en EC2 con dominio y TLS](https://github.com/GuillermoSM33/deploy-con-docker-y-aws); ECS o EKS pueden añadir orquestación después. |
| Guardar y versionar imágenes para ECS o EKS | Amazon ECR | ECR es un registro de imágenes. Elige el servicio de ejecución por separado; una imagen no queda desplegada por el hecho de subirla al registro. |

Si valoras un servicio de contenedores empaquetado, contrasta la [documentación actual de Lightsail Container Services](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-container-services.html) con la charla comunitaria [La forma más fácil de desplegar contenedores en AWS usando Lightsail](https://www.youtube.com/watch?v=V-C_ZJi6-o0). La documentación vigente explica capacidad, endpoints y precio; úsala para confirmar los límites de tu caso.

Para un backend con más piezas, revisa [ECS Fargate con RDS y balanceo](https://www.alfredo-dominguez.dev/arquitecturas/02-scalable-backend/). Si tu aplicación usa rendering server-side de Next.js, esta [arquitectura ECS Fargate para Next.js](https://dcastillogi.com/arquitecturas/despliegue-nextjs-ecs-fargate) combina CloudFront, S3, ALB, Aurora y GitHub Actions; su autor advierte que ese diseño es más de lo necesario para una web estática.

### Una secuencia corta para decidir

1. Si una dependencia exige Kubernetes —por ejemplo, herramientas que usan la API de Kubernetes—, evalúa EKS. Si no, no necesitas adoptar EKS solo por ejecutar contenedores.
2. Si tu carga encaja en una aplicación web pequeña y valoras un paquete administrado con endpoint HTTPS, compara Lightsail con ECS Express Mode. Revisa límites, red, escalado y precio antes de elegir.
3. Si quieres definir tareas y servicios con control sobre la integración AWS, elige ECS. En ECS, Fargate delega la administración de las instancias; EC2 permite elegir y operar los hosts.
4. Reserva ECR para almacenar imágenes. Una imagen pública sirve para una prueba; para una imagen privada de ECR, el rol de ejecución y la conectividad de red deben permitir la descarga.

Fargate no reemplaza a ECS ni a EKS: es una opción de cómputo que puede acompañar a cualquiera de los dos. EC2 también puede aportar capacidad a ambos.

## Compara operación, red y costo

| Ruta | Qué queda bajo tu responsabilidad | Qué puede generar cargos |
| --- | --- | --- |
| ECS con Fargate | Tamaño y número de tareas, imagen, roles, subredes, security groups, salud y logs | vCPU y memoria solicitadas, almacenamiento adicional si aplica, direcciones IPv4 públicas, transferencia y servicios asociados. |
| ECS con EC2 | Lo anterior, más instancias, sistema operativo, capacidad del clúster y parches del host | Instancias EC2, volúmenes, balanceadores, transferencia y servicios asociados. |
| EKS con managed node groups | Manifiestos y operación de Kubernetes, además del tamaño, capacidad y actualizaciones de los nodos | Cargo del clúster EKS, instancias EC2, volúmenes, direcciones IP y transferencia. |
| EKS Auto Mode | Aplicaciones, configuración del clúster y VPC; AWS gestiona más partes de la infraestructura del clúster | Cargo del clúster, de las instancias EC2 y una tarifa de gestión de Auto Mode, además de red, almacenamiento y balanceo que use la carga. |
| Lightsail Container Services | Imagen, despliegue y capacidad elegida | Precio mensual de capacidad y transferencia que exceda la cuota publicada. El cargo continúa hasta eliminar el servicio. |

Consulta los precios vigentes de [ECS](https://aws.amazon.com/ecs/pricing/), [Fargate](https://aws.amazon.com/fargate/pricing/), [EKS](https://aws.amazon.com/eks/pricing/) y [Lightsail](https://aws.amazon.com/lightsail/pricing/). EKS Auto Mode agrega una tarifa de gestión independiente del costo de EC2. La región, duración, arquitectura y recursos asociados cambian el total; no hay una ruta más barata para todos los casos.

La red también forma parte de la decisión. Una tarea Fargate en una subred pública necesita una ruta al Internet Gateway y una IP pública si debe descargar una imagen pública o recibir tráfico desde Internet. En una subred privada, la descarga de una imagen pública necesita salida a Internet, por ejemplo mediante NAT. Para una imagen de ECR privado puedes diseñar acceso mediante endpoints de ECR, S3 y los servicios auxiliares necesarios. EKS suma el endpoint de la API del clúster, el acceso de los nodos y la red de los pods. No abras el acceso público a todo Internet por comodidad: limita el origen y habilita solo los puertos que requiere la aplicación.

## Qué preparar antes de desplegar

- Empaqueta la aplicación y sus dependencias en una imagen que sea compatible con el sistema operativo y la arquitectura de la capacidad elegida. Los tutoriales ECS y EKS de esta serie usan imágenes Linux para una tarea y nodos <code>X86_64</code>.
- Define cómo sabrás que la aplicación está lista. Una tarea o pod puede estar activo aunque la aplicación todavía no responda.
- Decide dónde vivirá la imagen: un registro público para una práctica o ECR privado para una aplicación propia.
- Usa credenciales temporales mediante IAM Identity Center o roles federados para la CLI y roles de IAM distintos para ejecutar tareas o dar acceso a la aplicación. No guardes claves permanentes de usuario en un Dockerfile.
- Estima red, IPv4 pública, balanceadores, almacenamiento, logs y el costo del clúster. Elimina el laboratorio cuando termines.

## Novedad sobre AWS App Runner

App Runner dejó de aceptar clientes nuevos el 31 de marzo de 2026. Los clientes existentes pueden seguir usando el servicio, pero AWS indica que no planea añadir funciones nuevas y recomienda explorar ECS Express Mode para migraciones. Por eso, un tutorial antiguo de App Runner no es una ruta de alta para una cuenta nueva. Lee el [aviso oficial de disponibilidad de App Runner](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html).

## Aprende con una comunidad y continúa con una práctica

El [AWS User Group Ecuador](https://www.awsugecuador.com/) organiza charlas, talleres y encuentros sobre distintos temas de AWS, además de enlazar otras comunidades del país. También puedes [buscar User Groups y grupos estudiantiles por región](/comunidades/).

En Cali, el grupo estudiantil [AWS SBG de la Universidad del Valle](https://www.meetup.com/aws-sbg-at-university-of-the-valle/) anuncia [Contenedores 101: construye, ejecuta y despliega en AWS](https://www.meetup.com/aws-sbg-at-university-of-the-valle/events/316796377/), presencial el **6 de octubre de 2026, de 10:00 a 11:00 (UTC−05:00)** en Universidad ICESI. Es una actividad para empezar con Docker y contenedores; confirma acceso e inscripción en la ficha.

Si estás cerca de Córdoba, la comunidad estudiantil [AWS SBG at National Technologic University Regional Faculty](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/) anuncia **AWS Gaming Lab: ECS, CI/CD y la magia de Terraform**, un encuentro presencial el **10 de octubre de 2026, de 12:00 a 14:00 (UTC−03:00)** en UTN Facultad Regional Córdoba. Consulta la [página del evento](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/) para confirmar sede, disponibilidad e inscripción. La agenda se consultó el 6 de octubre de 2026. Si estas fechas ya pasaron, busca próximas actividades en la [agenda de eventos AWS](/eventos/).

Para ampliar los fundamentos en español, lee [Cómo entendí los contenedores en AWS: Docker, ECS y EKS explicados desde cero](https://builder.aws.com/content/33FIp8idcHVslPOeJPdvgUL4wNo/cmo-entend-los-contenedores-en-aws-docker-ecs-y-eks-explicados-desde-cero) y mira [AWS container services overview en NERDflix](https://www.nerdearla.com/nerdflix/Hm3DEKB6Los/), una charla de Boris Cortés grabada en 2018. La charla ayuda a ampliar el mapa conceptual; confirma los detalles actuales en la documentación enlazada arriba.

Las rutas prácticas de esta serie continúan en el [tutorial de Amazon ECS](/blog/como-desplegar-una-aplicacion-en-amazon-ecs/) y el [tutorial de Amazon EKS](/blog/como-desplegar-una-aplicacion-en-amazon-eks/).
