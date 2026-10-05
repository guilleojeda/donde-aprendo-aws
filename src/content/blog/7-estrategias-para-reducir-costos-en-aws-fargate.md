---
title: "Cómo reducir costos en AWS Fargate con ECS: guía práctica"
description: "Reduce costos de Amazon ECS con Fargate al ajustar CPU y memoria, escalar tareas y comparar Spot y ARM64. Revisa también NAT, balanceadores, logs y transferencia de datos."
author: "guille-ojeda"
publishedAt: "2024-11-26"
publishedTimestamp: "2024-11-26T19:09:41.914Z"
modifiedTimestamp: "2026-10-04T22:31:52-03:00"
review:
  date: "2026-10-04"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []
---

Para reducir costos en AWS Fargate con Amazon ECS, revisa dos cosas primero: el tamaño de cada tarea y cuántas tareas permanecen activas cuando baja la demanda. Fargate factura la CPU y la memoria aprovisionadas, aunque la aplicación use menos. También cuenta el tiempo desde que empieza la descarga de la imagen del contenedor y hay cargos separados por red, balanceadores, logs e imágenes.

El orden práctico es medir el costo actual, ajustar recursos con datos de uso, escalar el número de tareas y probar Spot o ARM64 solo si el trabajo tolera sus condiciones. No hay un porcentaje de ahorro que se aplique a todas las cargas.

## Cómo calcula AWS el costo de Fargate

El precio de cada tarea o pod considera la CPU, la memoria, el sistema operativo, la arquitectura y el almacenamiento efímero configurados. Las tarifas dependen de la región. Fargate redondea la duración facturable al segundo, con un mínimo de un minuto para Linux y cinco minutos para Windows. El reloj empieza cuando comienza la descarga de la imagen y termina cuando se detiene la tarea o el pod.

Las tareas y los pods reciben 20 GiB de almacenamiento efímero por defecto. AWS cobra el almacenamiento adicional que configures por encima de esos 20 GiB. La imagen descargada también ocupa parte de ese espacio.

- **Amazon ECS Fargate:** Linux/x86-64, Linux/ARM64 y Windows/x86-64. Fargate Spot está disponible para Linux/x86-64 y Linux/ARM64.
- **Amazon EKS Fargate:** Linux/x86-64; EKS no admite Fargate Spot.

En ECS, ARM64 requiere Linux y Fargate platform version 1.4.0 o posterior. Los tamaños admitidos de CPU y memoria son combinaciones específicas; confirma la combinación y la disponibilidad de la región antes de cambiar una definición de tareas. [AWS detalla esas combinaciones y límites para Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html), y [la guía de EKS confirma que Fargate Spot no está disponible en EKS](https://docs.aws.amazon.com/eks/latest/userguide/fargate.html).

### Un cálculo que puedes repetir

La página de precios de AWS muestra un ejemplo con cinco tareas Linux/x86 en N. Virginia, cada una con 1 vCPU, 2 GiB de memoria y 30 GiB de almacenamiento efímero, durante 10 minutos al día por 30 días. Para estimar ese caso, usa las tarifas actuales de la región:

Para cada segundo facturable, suma la tarifa de 1 vCPU, 2 GiB de memoria y 10 GiB de almacenamiento adicional (30 menos los 20 GiB incluidos). Luego multiplica esa tarifa por 5 tareas, 30 días y 600 segundos por día.

La duración supone que los 600 segundos van desde el inicio de la descarga de la imagen hasta el final de la tarea. No incluye NAT, balanceadores, logs, ECR ni transferencia de datos. Consulta el ejemplo vigente en [precios de AWS Fargate](https://aws.amazon.com/fargate/pricing/) y reemplaza región, sistema operativo y arquitectura en la [AWS Pricing Calculator](https://calculator.aws/).

## Siete formas de bajar el costo sin adivinar

### 1. Ajusta CPU y memoria con métricas de tu carga

Empieza con métricas de CPU y memoria del servicio, y observa picos, no solo promedios. Después de modificar una definición de tareas, compara latencia, errores, reinicios y uso máximo durante una prueba representativa. Un tamaño menor puede bajar el cargo de Fargate, pero quedarse corto puede provocar errores o reducir el rendimiento.

[AWS Compute Optimizer ofrece recomendaciones de tamaño para servicios ECS sobre Fargate](https://docs.aws.amazon.com/compute-optimizer/latest/ug/view-ecs-recommendations.html). Para generarlas, necesita al menos 24 horas de métricas de uso dentro de los 14 días anteriores; la primera recomendación puede tardar hasta 24 horas. Tómala como una hipótesis para probar, no como un cambio automático.

### 2. Escala el número de tareas según el trabajo pendiente

Configura [Amazon ECS Service Auto Scaling con Application Auto Scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html). Las políticas pueden ajustar el número deseado de tareas según CPU, memoria o métricas de solicitudes; el escalado programado ayuda cuando la demanda tiene horarios previsibles. Define mínimos y máximos que respeten los límites de disponibilidad y capacidad de la aplicación.

Un servicio ECS puede tener mínimo cero. En un worker que procesa una cola, esto puede evitar tareas ociosas, siempre que una nueva carga pueda esperar a que aparezca una tarea y que la métrica permita escalar desde cero. Application Auto Scaling necesita recibir un punto de datos de demanda antes de iniciar ese escalado. Para una API interactiva, conserva al menos una tarea si necesitas responder sin esperar el arranque y el registro de un destino. Si apagas las tareas, un Application Load Balancer que siga activo mantiene sus propios cargos.

Como referencia de arquitectura, [Backend Escalable con Contenedores](https://www.alfredo-dominguez.dev/arquitecturas/02-scalable-backend/) muestra un servicio ECS/Fargate que escala según CPU, detrás de un ALB, con RDS PostgreSQL en una subred privada. Sirve para entender las dependencias de una API con tráfico variable; el ALB, RDS y la observabilidad tienen cargos propios, y el ejemplo no es una cotización para tu carga.

### 3. Usa Fargate Spot solo para trabajos que puedan interrumpirse

AWS anuncia Fargate Spot con descuentos de hasta el 70% sobre el precio regular de Fargate, pero el descuento real varía y no reduce en esa proporción la factura completa. Spot usa capacidad sobrante; puede no haber capacidad disponible y AWS puede recuperar la capacidad con dos minutos de aviso. ECS no reemplaza automáticamente una tarea Spot por una tarea bajo demanda.

Prueba Spot para procesamiento por lotes, workers con reintentos o entornos no productivos. Diseña el trabajo para tolerar interrupciones —por ejemplo, que sea idempotente o pueda guardar un checkpoint— y mantén capacidad bajo demanda para la base de producción que deba seguir disponible. [La guía de capacidad de ECS explica los proveedores Fargate y Fargate Spot y sus interrupciones](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html).

### 4. Evalúa ARM64 con una imagen compatible y una prueba de carga

ECS Fargate permite ejecutar cargas Linux en procesadores AWS Graviton con arquitectura ARM64. Declara esa arquitectura en la definición de tareas y comprueba que la imagen incluya binarios y bibliotecas compatibles; puedes publicar una imagen ARM64 o un manifiesto multi-arquitectura. La migración no garantiza menor costo ni el mismo rendimiento: ejecuta las pruebas con tráfico y dependencias representativas, y compara la tarifa de la región y los resultados de la aplicación.

Consulta las [condiciones de ECS para tareas ARM64](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-arm64.html), incluida la versión mínima de Fargate. ARM64 no está disponible en Fargate para Windows ni para EKS.

Como introducción conceptual en español, [Cómo comenzar a trabajar con AWS Graviton](https://dev.to/aws-espanol/como-comenzar-a-trabajar-con-aws-graviton-la-pregunta-del-millon-1m6h), publicado en 2023, explica ARM y el uso de imágenes multi-arquitectura. Está centrado en EC2 e incluye familias, precios y una promoción gratuita de 2023 que ya no debes tomar como vigentes; para Fargate, usa la matriz de compatibilidad actual de AWS enlazada arriba.

### 5. Reserva Savings Plans para una base estable

Un [Compute Savings Plan](https://docs.aws.amazon.com/savingsplans/latest/userguide/sp-ris.html) puede cubrir las dimensiones de vCPU y memoria de uso elegible de Fargate en ECS o EKS a cambio de un compromiso de gasto por hora durante uno o tres años. No reserva capacidad, no se aplica al uso de Spot ni cubre cargos de licencia de Windows. Tampoco descuenta servicios asociados como ALB, NAT Gateway o CloudWatch.

Revisa primero el historial de uso elegible y estima un compromiso que puedas sostener incluso si cambia la demanda. Considera el plan para una base estable bajo demanda; deja fuera los picos y las cargas Spot. El descuento exacto depende del plan y de la tarifa aplicable, no de un porcentaje fijo para toda la cuenta.

### 6. Reduce el tiempo facturable de las tareas cortas

En tareas breves, el tiempo de descarga de la imagen forma parte del intervalo facturable. Revisa el tamaño de las imágenes, elimina dependencias que no se usan y mide los tiempos de aprovisionamiento y descarga en el ciclo de vida de ECS. Una imagen más liviana puede acelerar el arranque; el efecto en el costo depende de cuánto reduzca la duración facturable completa de la tarea.

Las imágenes guardadas también generan almacenamiento y, según la ubicación y el tráfico, transferencia en Amazon ECR. Define una política para retirar versiones que ya no necesitas y vuelve a estimar el costo antes de cambiar la ruta de descarga. [La documentación de ECR describe sus cargos de almacenamiento y transferencia](https://aws.amazon.com/ecr/pricing/).

Para trabajos que corren solo algunas veces, este [caso de auditoría semanal con EventBridge y una tarea Fargate](https://roadtocloudsec.la/posts/iam-audit-v3-fargate-eventbridge-terraform-automatizacion) ilustra un proceso que dura minutos y termina, en vez de dejar un servicio esperando entre ejecuciones. El artículo no ofrece un cálculo reproducible para otras cuentas: EventBridge, S3, logs, red y cada ejecución pueden tener cargos propios.

### 7. Mide el costo de cada tarea junto con los servicios que la rodean

Usa [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) para revisar costos y uso por período, servicio y región. Si agrupas por etiquetas, primero [activa esas etiquetas como etiquetas de asignación de costos](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/custom-tags.html) en Billing and Cost Management. [AWS Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/) permite fijar un presupuesto y recibir avisos; el aviso por sí solo no detiene recursos ni cargos. Las acciones de presupuesto son opcionales, deben configurarse aparte y su alcance depende de la acción elegida ([documentación de AWS Budgets Actions](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html)).

Para analizar el costo y el uso por tarea, habilita datos divididos de costos de ECS en un Cost and Usage Report. El informe puede incluir CPU y memoria reales por tarea, pero esa telemetría **no cambia la facturación de Fargate**, que sigue basándose en los recursos aprovisionados. Esos datos divididos están en CUR/Data Exports, no en Cost Explorer; [AWS explica cómo habilitarlos y leerlos](https://docs.aws.amazon.com/cur/latest/userguide/enabling-split-cost-allocation-data.html).

Revisa además los cargos fuera de Fargate:

- **NAT Gateway y transferencia:** cuenta sus horas, los datos procesados y el tráfico entre zonas o hacia Internet. Compara rutas por NAT con endpoints privados; cada opción tiene condiciones y cargos propios. Consulta [precios de VPC](https://aws.amazon.com/vpc/pricing/).
- **Application Load Balancer:** revisa las horas activo, unidades de capacidad (LCU) y transferencia. Puede seguir facturando aunque el servicio ECS escale a cero. Consulta [precios de Elastic Load Balancing](https://aws.amazon.com/elasticloadbalancing/pricing/).
- **CloudWatch:** revisa el volumen de logs, la retención y las métricas habilitadas. Consulta [precios de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/).
- **Amazon ECR:** revisa imágenes almacenadas y transferencia aplicable. Consulta [precios de ECR](https://aws.amazon.com/ecr/pricing/).

Compara el costo por solicitud atendida o trabajo completado antes y después del cambio, junto con latencia, errores y disponibilidad. Así puedes ver si bajó el costo total sin trasladarlo a otra línea ni degradar el servicio.

## Recursos para seguir y practicar

- El video [AWS Pricing Calculator paso a paso](https://www.youtube.com/watch?v=e_oVCKBMnkA), de AWS Women Colombia y publicado en febrero de 2026, muestra un ejercicio general de la calculadora; no cotiza una arquitectura Fargate concreta.
- El [video de Roxs sobre ECS con Terraform y GitHub Actions](https://www.youtube.com/watch?v=Ivtza36jJxA), del [canal 295DevOps](https://www.youtube.com/@295devops), presenta un demo Flask/Fargate/DynamoDB.
- El [repositorio de práctica de Roxs](https://github.com/roxsross/roxs-aws-ecs-demo) incluye una ruta local con Docker Compose y DynamoDB Local que no requiere credenciales AWS reales. Su modo AWS lista ECS/Fargate, ALB, ECR, DynamoDB, CloudWatch y VPC, que pueden generar cargos; revisa los requisitos y cómo borrar los recursos antes de desplegar. El README alterna referencias a Flask y FastAPI, así que verifica el código actual antes de seguir cada paso.
- La sesión [Del Container al Serverless: El Viaje de ECS y Fargate](https://www.youtube.com/watch?v=KsNBnuENO10), publicada en 2025 por el [AWS User Group Guatemala](https://www.youtube.com/@awsugguatemala), sirve como introducción a contenedores y Fargate; no es una guía de precios vigente. Para seguir a Roxs, consulta también el [Blog by Roxs](https://blog.295devops.com/), con artículos de AWS y DevOps en español.
- Si estás comparando tareas de contenedor con funciones que se ejecutan por eventos, consulta también nuestra guía sobre [costos de arquitecturas serverless para startups](https://dondeaprendoaws.com/blog/7-estrategias-de-serverless-para-startups-optimiza-costos/).

Para encontrar grupos locales, el [AWS Student Builder Group de la UTN Facultad Regional Córdoba](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/) es una comunidad estudiantil centrada en aprender AWS mediante proyectos prácticos. Al revisar la ficha y la agenda el 4 de octubre de 2026, figuraba el encuentro presencial [AWS Gaming Lab: ECS, CI/CD y la magia de Terraform](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/) para el 10 de octubre de 2026, de 12:00 a 14:00 (hora de Argentina), en UTN FRC. La actividad recorre una infraestructura ECS y su automatización con Terraform; no se presenta como una sesión de optimización de costos. Consulta la ficha para inscripción y cambios; si la fecha ya pasó, revisa la [Agenda de eventos de comunidades AWS](https://dondeaprendoaws.com/eventos/) o el [directorio de comunidades por país](https://dondeaprendoaws.com/comunidades/) para encontrar otras opciones.

## Preguntas frecuentes

### ¿Fargate cobra solo la CPU y memoria que usa el proceso?

No. Cobra por la CPU y memoria aprovisionadas para la tarea o el pod durante el tiempo facturable. El uso real sirve para dimensionar mejor, pero no reemplaza la base de facturación.

### ¿Puedo usar Fargate Spot en EKS?

No. Fargate Spot está disponible para tareas Linux de Amazon ECS; Amazon EKS no admite Fargate Spot.

### ¿Un Compute Savings Plan cubre tareas spot o toda la factura?

No. Puede cubrir uso elegible de Fargate bajo demanda, pero no Spot ni servicios relacionados como NAT, ALB, ECR o CloudWatch.

### ¿Escalar el servicio ECS a cero elimina todos los cargos?

No. Detiene las tareas del servicio, pero recursos que sigan activos —como un ALB, NAT Gateway, almacenamiento de imágenes o logs— pueden continuar facturando.
