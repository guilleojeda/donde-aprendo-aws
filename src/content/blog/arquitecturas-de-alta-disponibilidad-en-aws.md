---
title: "Alta disponibilidad en AWS: arquitectura Multi-AZ para una app web"
description: "Diseñá una aplicación web con ALB, EC2 Auto Scaling y RDS Multi-AZ. Entendé health checks, sesiones y failover; elegí Multi-Region solo si tus objetivos de recuperación lo requieren."
author: "guille-ojeda"
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T00:31:23.985Z"
modifiedTimestamp: "2026-10-05T00:15:04-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/1b184fe1242c3e7fb970e984.jpg"
coverAlt: "Varias nubes y círculos con un ojo conectados sobre un mapa esquemático"
ogImage: "/assets/blog/1b184fe1242c3e7fb970e984.jpg"
related:
  - title: "Arquitectura multi-región en AWS: cuándo conviene"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/"
    image: "/assets/blog/bafde793116d5b5e38a659da.jpg"
    imageAlt: "Globo terráqueo con líneas de conexión y nubes alrededor"
---

Una arquitectura de alta disponibilidad reduce el impacto de fallas para que una aplicación siga atendiendo su función principal. Para una aplicación web, un punto de partida común es repartir el ingreso y el cómputo entre varias zonas de disponibilidad (AZ) y configurar cada dependencia para recuperarse ante el fallo que querés tolerar. Un Application Load Balancer (ALB), un grupo de EC2 Auto Scaling y Amazon RDS Multi-AZ pueden cumplir partes de ese diseño; ninguno garantiza cero interrupciones por sí solo.

## Multi-AZ o Multi-Region: ¿qué falla querés cubrir?

Una Región de AWS contiene varias AZ aisladas entre sí. Si el riesgo que te importa es perder una instancia o una AZ, una arquitectura Multi-AZ en una sola Región puede ser suficiente. AWS Well-Architected recomienda distribuir las cargas de producción entre al menos dos AZ y evaluar cada servicio para confirmar cómo replica datos y recupera recursos. [La guía REL10 de AWS](https://docs.aws.amazon.com/es_es/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html) explica esa elección y cuándo considerar varias Regiones. Para ampliar esta decisión con material comunitario en español, podés ver la grabación [“Diseñando arquitecturas resilientes en AWS”](https://www.youtube.com/watch?v=sEr65Cgskkc) de [AWS User Group Ecuador](https://www.youtube.com/@awsugecuador4610).

Multi-Region responde a un alcance distinto: una interrupción que afecte a una Región completa, requisitos de residencia de datos u objetivos de latencia geográfica. Requiere diseñar y probar la replicación, el enrutamiento y la recuperación entre Regiones. No es un paso obligatorio para toda aplicación. Antes de elegir una estrategia de recuperación ante desastres, definí para cada carga de trabajo el **RTO** (cuánto tiempo de interrupción se puede aceptar) y el **RPO** (cuánto dato reciente se podría perder). [AWS define ambos objetivos por carga de trabajo](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_for_recovery_objective_defined_recovery.html); para profundizar, seguí con nuestra [guía sobre cuándo conviene una arquitectura multi-región](https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/).

## Ejemplo: una aplicación web en dos AZ

Este es un patrón conceptual para un sitio web con una base de datos relacional. En una VPC de una Región, habilitá el ALB en subredes de al menos dos AZ; colocá las instancias de aplicación en subredes de aplicación en esas AZ y asociá el grupo de Auto Scaling a un grupo de destino del ALB. Para una instancia de RDS Multi-AZ, RDS mantiene una instancia principal y una réplica en espera síncrona en otra AZ.

```text
Región de AWS
Usuarios ──> ALB en subredes de AZ A y AZ B ──> Grupo de destino
                                                    │
                                    Grupo de Auto Scaling (EC2)
                                      ├─ Instancias en AZ A
                                      └─ Instancias en AZ B

Aplicación ──> Endpoint DNS de RDS ──> Instancia RDS Multi-AZ
                                           ├─ Principal en AZ A
                                           └─ Espera síncrona en AZ B
```

La distribución exacta depende de la configuración y del servicio. El grupo de Auto Scaling debe incluir subredes de ambas AZ; definí capacidad mínima y deseada para que las instancias que queden puedan atender la carga durante una falla. La escala automática puede reponer o agregar capacidad, pero una instancia nueva necesita tiempo para iniciar, pasar sus health checks y quedar lista. [La integración entre Elastic Load Balancing y Auto Scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/autoscaling-load-balancer.html) describe el registro automático de instancias y la opción de usar métricas del balanceador para escalar. Para profundizar en el patrón web, abrí la grabación [“Creando infra para una app con alta disponibilidad en AWS”](https://www.youtube.com/watch?v=ikLx0i2aexY), de [Mexico in Tech](https://www.youtube.com/@MexicoinTech). Para repasar balanceo y ajuste de instancias, consultá la sesión de [AWS UG Buenos Aires](https://www.youtube.com/@awsugbsas) titulada [AWS UG BS AS: AWS CLOUD PRACTITIONER CHALLENGE Sesión 4 "AWS Elastic Load Balancers y Auto Scaling"](https://www.youtube.com/watch?v=b4_OMyQHXgU).

La capa web y la base de datos son solo dos partes del recorrido. Revisá también las dependencias, el almacenamiento y el estado de las sesiones: habilitar varias AZ en EC2 no replica por sí mismo los datos guardados en un volumen autogestionado ni el estado que vive en la memoria de una instancia.

## Qué ocurre cuando falla una parte

### Una instancia de aplicación deja de responder

El ALB consulta periódicamente la ruta y los criterios de salud que configuraste para cada destino. En condiciones normales deja de enviar solicitudes a un destino que marcó como no saludable y usa los destinos sanos disponibles. Si querés que Auto Scaling también reemplace instancias según los resultados del ALB, tenés que habilitar esos health checks en el grupo; por defecto, Auto Scaling ignora los resultados del balanceador. [Health checks de ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html) y [health checks de Auto Scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-checks-overview.html) describen esta separación.

Un matiz importante: si todos los destinos de un grupo resultan no saludables, el ALB entra en *fail-open* y puede enviar solicitudes a esos destinos igualmente. Por eso, los health checks no son un interruptor que garantice bloquear todo tráfico defectuoso. Configurá rutas de comprobación que representen la función relevante y monitoreá los síntomas que percibe el usuario.

### Una AZ queda afectada

Las instancias en otra AZ pueden seguir atendiendo si la aplicación, la red y sus datos están distribuidos y si queda capacidad suficiente. La redundancia de la capa de cómputo no cubre una dependencia que siga siendo un punto único de falla. Comprobá el comportamiento de cada servicio administrado y de cada componente que operes por tu cuenta; [REL10 de AWS](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html) incluye esta revisión por componente.

### La base de datos principal de RDS falla

En el despliegue Multi-AZ de instancia, RDS mantiene una réplica en espera síncrona en otra AZ y puede conmutar a ella automáticamente. Esa réplica es un destino de failover: **no** atiende consultas de lectura en ese tipo de despliegue. [La documentación de RDS Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html) detalla su alcance.

La conmutación no es instantánea. AWS informa que el failover suele tardar entre 60 y 120 segundos, aunque la actividad de la base y otras condiciones pueden alargarlo. RDS actualiza el registro DNS del endpoint; las conexiones existentes se deben restablecer. La aplicación necesita manejar errores transitorios, reintentos y conexiones que vuelven a resolver DNS. Consultá [cómo funciona el failover de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html) y probá el comportamiento de tu cliente de base de datos.

### Las sesiones de usuario dependen de una instancia

Las sesiones persistidas solo en memoria pueden perderse cuando una instancia falla. La afinidad de sesión (*sticky sessions*) del ALB enruta solicitudes del cliente al mismo destino durante un período; no copia el estado de la aplicación a otro destino. Si la experiencia debe sobrevivir a la pérdida de una instancia, diseñá dónde guardar ese estado y cómo recuperarlo. [La guía de afinidad de sesiones de ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html) explica el alcance y los requisitos de esta función.

## Health checks y monitoreo: comprobá el recorrido del usuario

El health check del ALB prueba un destino con el protocolo, la ruta y los umbrales configurados. Un `200` en una ruta simple puede servir para comprobar que el proceso responde, pero no necesariamente verifica que una persona pueda iniciar sesión o completar el flujo más importante de la aplicación. Para seguir esos recorridos, [CloudWatch Synthetics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Synthetics_Canaries.html) permite programar scripts que recorren endpoints y pasos similares a los de un cliente.

Usá señales que representen la disponibilidad real de la aplicación además de las métricas de instancia: errores y latencia percibidos, cantidad de destinos sanos, capacidad restante, errores de conexión y eventos de failover de RDS. Una alarma ayuda a detectar una falla; también necesitás un procedimiento claro para responder.

## Probá la recuperación antes de depender de ella

Probá en un entorno no productivo, y con una secuencia controlada, qué pasa si un destino deja de responder, una instancia se reemplaza o RDS cambia al standby. Verificá las tareas que un usuario puede completar, el tiempo hasta la recuperación, los datos que permanecen disponibles y si el runbook sirve para volver al modo normal. Repetí las pruebas cuando cambien la arquitectura o sus dependencias. [AWS Well-Architected recomienda probar la confiabilidad y los procedimientos de recuperación](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/test-reliability.html).

AWS Fault Injection Service puede ejecutar acciones disruptivas sobre recursos reales. AWS recomienda planificar el experimento y empezar en preproducción; definí también alarmas como condiciones de detención. Usalo solo dentro de un ejercicio autorizado y con un alcance acotado. [Qué es AWS FIS y cómo detiene un experimento](https://docs.aws.amazon.com/fis/latest/userguide/what-is.html).

## Comunidad y eventos de AWS en español

Para encontrar un grupo según tu país, consultá el [directorio de comunidades AWS](https://dondeaprendoaws.com/comunidades/). También podés conocer [AWS User Group Ecuador](https://www.awsugecuador.com/) y sus actividades, o abrir la ficha de [AWS User Group Buenos Aires](https://www.meetup.com/es-es/aws-user-group-buenos-aires/) para revisar sus canales y encuentros.

En las agendas consultadas el 5 de octubre de 2026 aparecen estos encuentros relacionados con arquitectura, resiliencia o RDS. Verificá inscripción, cupo y condiciones en la ficha del organizador:

- El [AWSpectrum Architecture Arena](https://www.meetup.com/aws-user-group-awspectrum/events/316830690/), organizado por [AWS User Group AWSpectrum](https://www.meetup.com/aws-user-group-awspectrum/), es presencial en Ciudad de México el 26 de octubre de 2026, de 16:00 a 18:30 (hora del organizador). La propuesta es resolver en equipo y defender una arquitectura en la nube.
- El encuentro en línea [“El Combo Indestructible de AWS: SQS + Lambda”](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/), de [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/), está publicado para el 20 de octubre de 2026, de 19:00 a 21:00 COT, con acceso libre según su ficha; el enlace de transmisión solo se muestra a quienes confirman su asistencia. Su tema es tolerancia a errores con SQS y Lambda, un patrón complementario a la capa web de este artículo.
- Si estás cerca de Atlixco, la sesión presencial [“Amazon RDS: Bases de datos administradas”](https://www.meetup.com/aws-sbg-at-higher-technological-institute-of-atilxco/events/316823085/) figura para el 29 de octubre de 2026, de 12:00 a 14:00 (hora del organizador), organizada por AWS SBG at Higher Technological Institute of Atlixco, un grupo estudiantil. La descripción cubre crear una base SQL y conectarla con una aplicación; no indica que se practique Multi-AZ. Consultá la ficha para confirmar las condiciones de participación.

Si esas sedes no te quedan cerca, la [agenda de eventos de comunidades AWS](https://dondeaprendoaws.com/eventos/) permite explorar otras fechas, modalidades y países.
