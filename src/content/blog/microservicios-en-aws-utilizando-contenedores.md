---
title: "Microservicios en AWS con contenedores: cuándo elegir ECS o EKS"
description: "Diseña microservicios en contenedores y elige Amazon ECS o EKS. Separa orquestación de cómputo, y cubre datos, colas, reintentos y operación."
author: "guille-ojeda"
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T00:23:23.974Z"
modifiedTimestamp: "2026-10-06T23:56:03-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
  - title: "Amazon ECS: mejores prácticas para desplegar contenedores"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ecs/"
  - title: "Amazon EKS: mejores prácticas de seguridad, costos y operación"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-eks/"

---

Un contenedor empaqueta una aplicación y sus dependencias; por sí solo no define un microservicio ni lo mantiene disponible. El microservicio surge de un límite de negocio, un contrato y la propiedad de sus datos. En AWS, Amazon ECS o Amazon EKS organizan tareas y pods; AWS Fargate o Amazon EC2 aportan capacidad de cómputo.

La decisión no es “¿qué servicio es más avanzado?”, sino qué interfaz y operación necesita el equipo. Si el trabajo encaja mejor en funciones y termina después de procesar cada solicitud o evento, compara también [microservicios en AWS Lambda](/blog/microservicios-en-aws-utilizando-aws-lambda/). Para una introducción visual a Docker, ECS y EKS, consulta [Cómo entendí los contenedores en AWS](https://builder.aws.com/content/33FIp8idcHVslPOeJPdvgUL4wNo/cmo-entend-los-contenedores-en-aws-docker-ecs-y-eks-explicados-desde-cero), artículo de Uriel Enrique Arellano López en AWS Builder Center.

## Delimita servicios antes de construir imágenes

En la tienda del ejemplo, pedidos, inventario y notificaciones son capacidades distintas. El servicio de pedidos valida y guarda pedidos; inventario administra existencias; notificaciones envía avisos. Cada servicio puede tener una API, un trabajador de cola o ambos, pero solo él cambia sus propios datos. No dividas la solución por cada endpoint o tabla: cada frontera añade despliegue, red, fallas y soporte.

Usa una llamada HTTP cuando el cliente necesita una respuesta inmediata. Publica un hecho —por ejemplo, `OrderPlaced`— cuando otros trabajos pueden continuar sin mantener abierta esa solicitud. Una regla de EventBridge puede enrutar el evento a una cola SQS por consumidor; una cola conserva el trabajo pendiente y deja que cada trabajador procese a su ritmo. La [guía de eventos de AWS](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/sns-or-sqs-or-eventbridge.html) compara SQS, SNS y EventBridge. Para un flujo completo con *outbox*, deduplicación y DLQ, revisa nuestra [guía de arquitectura dirigida por eventos](/blog/arquitecturas-dirigidas-por-eventos-en-aws/).

Un evento `OrderPlaced` puede incluir un identificador estable, una versión del esquema, `orderId` y las líneas necesarias para reservar inventario. El productor no debe publicar secretos o datos personales que cada consumidor no necesita. El consumidor no consulta directamente la base de datos de pedidos: reserva inventario en sus datos y conserva el `eventId` procesado para reconocer entregas repetidas.

## ECS o EKS: elige el orquestador

En móvil, desplaza las tablas hacia los lados para ver todas las columnas.

| Opción | Qué organiza | Evalúala cuando… |
| --- | --- | --- |
| [**Amazon ECS**](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html) | Tareas, servicios y el estado deseado de contenedores en AWS. | Quieres un orquestador integrado con AWS y no necesitas la API ni el ecosistema Kubernetes. Un servicio ECS puede mantener una API o trabajador; una tarea aislada sirve para trabajo que termina. |
| [**Amazon EKS**](https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html) | Kubernetes y sus recursos, como Deployments, Pods y Services; AWS administra el plano de control. | Tu equipo necesita herramientas, manifiestos o compatibilidad con Kubernetes y acepta operar sus recursos, permisos, red y capacidad de cómputo. Para repasar esos conceptos, mira [EKS Fundamentals: desmitificando Kubernetes con AWS](https://www.youtube.com/watch?v=YEY9NbFMQ0Y), charla del AWS User Group Ecuador. |
| [**Amazon ECR**](https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html) | Imágenes de contenedores. | Necesitas almacenar versiones de imágenes para que ECS o EKS las descarguen. ECR no ejecuta ni escala contenedores. |

ECS y EKS describen la forma de programar y mantener los contenedores, no el servidor donde corren. Sus opciones de capacidad incluyen Fargate y EC2, con diferencias de control y operación; revisa la documentación actual de [capacidad para ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/capacity-launch-type-comparison.html) y [cómputo para EKS](https://docs.aws.amazon.com/eks/latest/userguide/eks-compute.html).

- **Fargate** evita que administres instancias para tareas ECS o pods EKS compatibles. Su costo considera CPU, memoria y tiempo de ejecución de cada tarea o pod; la red, el almacenamiento y otros recursos pueden sumar cargos. Aun así, defines CPU y memoria, red, permisos, salud y escalado de la aplicación. En EKS, no todos los patrones de Kubernetes están disponibles en Fargate; revisa sus [restricciones actuales](https://docs.aws.amazon.com/eks/latest/userguide/fargate.html) antes de elegir.

Para una comparación grabada en español entre ECS y Fargate, mira [Del Container al Serverless: el viaje de ECS y Fargate](https://www.youtube.com/watch?v=KsNBnuENO10), sesión del AWS User Group Guatemala publicada en 2025. Úsala para revisar el modelo general y confirma los detalles actuales en la documentación oficial.
- **EC2** te da control sobre las instancias y permite compartir capacidad entre cargas. También te deja a cargo de dimensionar, actualizar, proteger y escalar esa capacidad. En EKS puedes usar grupos de nodos administrados o administrar nodos por tu cuenta.

EKS Auto Mode delega más tareas de infraestructura del clúster, pero no convierte EKS en un formato de cómputo distinto: los nodos de Auto Mode usan instancias EC2. Fargate también sigue siendo una opción compatible para ciertos pods. Comprueba los [modos de cómputo de EKS](https://docs.aws.amazon.com/eks/latest/userguide/eks-compute.html) según el workload.

## El mismo ejemplo en contenedores

Una API de pedidos puede ejecutarse como un servicio ECS detrás de un balanceador, con varias tareas del contenedor para atender solicitudes. Un trabajador de inventario puede ejecutarse como otro servicio ECS que consume su propia cola SQS. Si el equipo ya opera Kubernetes o necesita sus primitivas, la misma API y el trabajador pueden desplegarse en EKS como Deployments separados. En cualquiera de las dos rutas, cada servicio mantiene su estado fuera del sistema de archivos efímero del contenedor.

El flujo conserva el mismo contrato:

```json
{
  "eventId": "evt-01J9Q2K7M4",
  "schemaVersion": 1,
  "orderId": "ord-8042",
  "occurredAt": "2026-10-06T12:00:00Z",
  "items": [
    { "sku": "cafe-250g", "quantity": 2 }
  ]
}
```

El servicio de pedidos guarda el pedido y su evento de salida juntos mediante un *outbox* antes de publicar. El trabajador de inventario debe registrar `eventId` y el cambio de existencias de forma atómica en su almacenamiento duradero; así una entrega repetida puede reconocer el trabajo completado sin volver a descontar unidades. Elimina el mensaje solo después de confirmar el trabajo. Los mensajes de una cola estándar pueden entregarse más de una vez, así que el consumidor debe ser idempotente. Configura el tiempo de visibilidad y la política de redrive según la duración y la recuperación que necesita el servicio; envía los fallos persistentes a una DLQ y alerta si crece.

Para llamadas entre servicios, no uses una base de datos compartida como API informal. Expón una operación con dueño claro o publica un evento versionado. Si una pantalla necesita datos de varios servicios, crea una API de composición o una vista de lectura con actualizaciones explícitas; acepta que una vista basada en eventos puede tardar en reflejar el último cambio.

## Despliega y opera sin esconder la carga

- Construye una imagen versionada e inmutable en CI, revisa dependencias y vulnerabilidades y guárdala en ECR. Evita depender de una etiqueta que pueda apuntar a contenido diferente entre despliegues. Para practicar un despliegue canary con ECS, [ECS Canary in Action](https://github.com/roxsross/aws-ecs-canary-in-action) ofrece un modo local con Docker Compose y otra ruta con Terraform que crea recursos en AWS; revisa el README y el costo antes de usar la segunda.
- Para ECS, define las imágenes, recursos, roles, puertos y registros en una definición de tarea; usa un servicio cuando ECS deba mantener tareas en ejecución. Para EKS, declara recursos de Kubernetes y limita permisos con RBAC y la identidad IAM que corresponda a la aplicación.
- Configura verificaciones de salud que midan si la aplicación puede recibir tráfico, no solo si el proceso sigue activo. Usa despliegues con posibilidad de detener o revertir una revisión cuando las señales acordadas empeoren.
- Registra `eventId`, `orderId` y un identificador de correlación sin copiar datos sensibles. Observa errores, latencia, reinicios, tareas o pods no saludables, mensajes pendientes, antigüedad de cola y DLQ. Asigna alertas y un procedimiento de recuperación.
- Dimensiona CPU y memoria con carga representativa. En Fargate pagas por los recursos y el tiempo de ejecución de las tareas ECS o pods EKS; con EC2 pagas instancias y administras su capacidad. EKS agrega el costo del clúster y, según la opción de cómputo, cargos de administración. Balanceadores, almacenamiento, direcciones IP, NAT Gateway, transferencia y logs pueden seguir generando cargos; compara los precios vigentes de [Fargate](https://aws.amazon.com/fargate/pricing/) y [EKS](https://aws.amazon.com/eks/pricing/) para tu región y no supongas que “contenedor” significa “sin costo cuando está inactivo”.

AWS no administra la lógica de negocio ni el estado por el hecho de ejecutar una tarea en Fargate, ECS o EKS. Para profundizar en tareas, roles, red y salud en ECS, consulta [mejores prácticas para Amazon ECS](/blog/mejores-practicas-para-amazon-ecs/); para permisos, nodos, actualizaciones y costos de Kubernetes, consulta [mejores prácticas para Amazon EKS](/blog/mejores-practicas-para-amazon-eks/).

## Recursos para seguir aprendiendo y pedir ayuda

Para seguir sesiones de distintos temas de AWS, visita el [AWS User Group Ecuador](https://www.meetup.com/aws-ecuador/) y su [canal de YouTube](https://www.youtube.com/channel/UCgzEFlDd-KR0BL5rlOVY7KQ). El grupo comparte experiencias generales sobre AWS; su ficha muestra cómo conocer sus actividades y canales de contacto.

En Córdoba, Argentina, la comunidad estudiantil AWS de UTN Facultad Regional Córdoba anuncia [AWS Gaming Lab: ECS, CI/CD y la magia de Terraform](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/), presencial el **10 de octubre de 2026**. La recepción empieza a las 11:30 y la charla principal a las 12:00 (UTC−03:00); la página de UTN indica entrada gratuita con inscripción previa y lo destina a estudiantes de Ingeniería en Sistemas de Información. Confirma sede y disponibilidad en la [convocatoria oficial de UTN](https://www.frc.utn.edu.ar/eventos/aws-gaming-lab-ecs-ci-cd-y-la-magia-de-terraform/) y en la ficha de inscripción. La agenda se consultó el 6 de octubre de 2026; si la fecha ya pasó, busca nuevas opciones en la [agenda de eventos AWS](/eventos/).

Para conversar con un grupo general de la región, visita el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/), abierto a personas interesadas en computación en la nube y en compartir experiencias sobre AWS. También puedes consultar el [directorio de comunidades AWS](/comunidades/) y el [directorio de videos AWS en español](/aprender/videos/) para encontrar grupos, charlas y talleres de otras regiones. Revisa cada ficha para conocer sus actividades y condiciones de participación.
