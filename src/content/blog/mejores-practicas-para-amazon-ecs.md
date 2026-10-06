---
title: "Amazon ECS: mejores prácticas para desplegar contenedores"
description: "Guía práctica de Amazon ECS: elige Fargate, EC2 o ECS Managed Instances; separa roles IAM, configura red y health checks, despliega con reversión y controla costos."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:33:48.66Z"
modifiedTimestamp: "2026-10-06T17:37:38-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cómo desplegar contenedores en AWS: elige entre ECS, EKS y Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/"
  - title: "Cómo desplegar una aplicación en Amazon ECS con Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-una-aplicacion-en-amazon-ecs/"
  - title: "Escalado automático de contenedores en AWS: ECS, EKS y Fargate"
    url: "https://dondeaprendoaws.com/blog/guia-completa-de-escalado-automatico-de-contenedores-en-aws/"
  - title: "Cómo reducir costos en AWS Fargate con ECS: guía práctica"
    url: "https://dondeaprendoaws.com/blog/7-estrategias-para-reducir-costos-en-aws-fargate/"
  - title: "Amazon S3: buenas prácticas de seguridad, versiones y costos"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-s3/"

---

Para desplegar un servicio seguro y confiable en Amazon ECS, define primero qué capacidad ejecutará las tareas; después prepara una imagen versionada, separa los roles de IAM, limita la red, configura verificaciones de salud y observa el despliegue antes de enviarle tráfico. ECS orquesta las tareas, pero el escalado, la conectividad y las garantías de disponibilidad dependen de cómo configures el servicio y sus recursos.

## Entiende qué administra ECS

Una **definición de tarea** describe los contenedores, imágenes, recursos, red, logs y roles que debe usar una ejecución. Una **tarea** es una ejecución de esa definición. Un **servicio** mantiene una cantidad deseada de tareas y puede reemplazar las que se detienen o se declaran no saludables. Un **clúster** es el ámbito lógico donde ECS organiza servicios, tareas y capacidad; no es necesariamente un grupo de máquinas EC2.

Esta diferencia orienta el diseño: usa tareas sueltas para trabajos que terminan; usa un servicio para una API o un worker que debe mantenerse en ejecución. Si una tarea termina, ECS no la convierte en un servicio ni conserva por sí mismo los datos que estaban en su sistema de archivos. Guarda el estado de la aplicación fuera del contenedor, en el sistema de datos adecuado. Si necesita leer o escribir objetos, asigna el acceso al rol de tarea y revisa las [prácticas de seguridad y retención para Amazon S3](/blog/mejores-practicas-para-amazon-s3/).

## Elige la capacidad según la operación que quieres asumir

Fargate, EC2 y ECS Managed Instances son opciones de cómputo para ECS. ECR cumple otra función: almacena imágenes y no ejecuta contenedores.

### AWS Fargate

Administras CPU y memoria de cada tarea, además de la aplicación, la red, los permisos y el escalado del servicio. AWS administra los servidores subyacentes. Cada tarea tiene su propia interfaz de red y una frontera de cómputo aislada. Evalúalo cuando quieras ejecutar tareas sin mantener instancias EC2.

### Amazon EC2 autogestionado

Administras instancias, sistema operativo, parches, capacidad del clúster, drenado y densidad de tareas. Evalúalo si necesitas controlar los hosts o mantener una flota compartida. El costo depende de la capacidad EC2 contratada y de cuánto puedas aprovecharla.

### ECS Managed Instances

Defines requisitos de cómputo y configuración del servicio; AWS aprovisiona, escala, actualiza y mantiene la capacidad EC2 administrada. Evalúalo cuando necesitas características de instancias EC2 y quieres delegar parte de su operación. Revisa la tarifa de gestión y los límites junto con el costo de las instancias.

Fargate no es automáticamente la opción más barata, y EC2 no conviene solo porque una aplicación guarde datos: el almacenamiento persistente se diseña aparte. Compara el costo total, los requisitos de la tarea y el trabajo operativo de cada alternativa. Para elegir entre ECS, EKS y otros servicios, consulta la [guía para desplegar contenedores en AWS](/blog/como-desplegar-contenedores-en-aws/).

## Prepara una imagen y una definición reproducibles

Trata cada versión del contenedor como una entrega inmutable:

- Construye y prueba la imagen en el proceso de CI. Publica en ECR una etiqueta única e inmutable para cada build; una etiqueta mutable como `latest` puede apuntar a contenido distinto en dos despliegues. Si necesitas fijar exactamente la imagen de un despliegue, puedes usar su digest. Consulta las [recomendaciones de ECS para imágenes de contenedor](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/container-considerations.html).
- Escanea las imágenes y actualízalas cuando cambien la aplicación, el runtime o sus dependencias. Reducir paquetes que no necesitas también ayuda a limitar la superficie de ataque y a descargar imágenes más rápido.
- Declara CPU y memoria de acuerdo con medidas representativas. Una tarea pequeña puede quedarse sin memoria o responder con lentitud; una reserva sobredimensionada desperdicia capacidad y, en Fargate, aumenta la base de facturación.
- Declara de forma explícita sistema operativo y arquitectura si la compatibilidad de la imagen importa. Fargate admite combinaciones concretas de CPU, memoria, sistema operativo y arquitectura; comprueba las [combinaciones de CPU y memoria admitidas](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html) y el [runtime de la definición de tarea](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#runtime-platform) antes de cambiarla.
- Mantén logs, health checks, puertos y roles en la definición de tareas bajo control de versiones. Un cambio de la aplicación debe producir una revisión nueva que puedas comparar y revertir.

La [guía oficial de mejores prácticas de Amazon ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-best-practices.html) reúne recomendaciones sobre imágenes, tamaños, redes, seguridad y operación.

## Separa los roles IAM

Los roles de ejecución y de tarea tienen destinatarios distintos. La aplicación no debería recibir permisos que ECS necesita para iniciar el contenedor.

- **Rol de ejecución** (`executionRoleArn`): lo usa el agente de ECS o Fargate para iniciar la tarea. Por ejemplo, permite descargar una imagen privada de ECR, publicar logs en CloudWatch Logs o leer secretos que se inyectan al iniciar.
- **Rol de tarea** (`taskRoleArn`): lo usa el código dentro del contenedor para llamar a AWS. Por ejemplo, permite leer objetos de un bucket S3 concreto o publicar mensajes en una cola de la aplicación.

Aplica mínimo privilegio a ambos roles y crea roles distintos cuando dos servicios necesitan accesos diferentes. No montes claves permanentes en la imagen, el repositorio ni variables de entorno compartidas: usa credenciales temporales para operadores y CI, y el rol de tarea para las llamadas que haga la aplicación a AWS. El rol de la identidad que despliega debe poder pasar solo los roles necesarios.

En EC2, evita que los contenedores accedan al Instance Metadata Service y a las credenciales del rol de instancia. Los contenedores no son por sí solos una frontera de seguridad; sigue las recomendaciones específicas de ECS para los hosts. Fargate ofrece una frontera de cómputo por tarea, pero aún necesitas limitar permisos y tráfico. Consulta la guía de [roles IAM de ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-iam-role-overview.html) y las [prácticas de seguridad para tareas y contenedores](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-tasks-containers.html).

Guarda secretos en Secrets Manager o Systems Manager Parameter Store y concede lectura solo a los roles y recursos que los necesiten. Evita incluir contraseñas, tokens o certificados en la imagen.

## Diseña la red desde el flujo de tráfico

Las tareas Fargate usan `awsvpc`: cada tarea recibe una interfaz de red dentro de una subred y uno o más grupos de seguridad. Para un servicio web público, un patrón habitual es:

1. Coloca el balanceador público en las subredes habilitadas para recibir tráfico.
2. Coloca las tareas en subredes privadas y desactiva la asignación de IP pública.
3. Permite HTTPS hacia el balanceador solo desde los orígenes que necesites.
4. Permite en el grupo de seguridad de las tareas únicamente el puerto de aplicación, con origen en el grupo del balanceador.
5. Limita la salida de las tareas a sus dependencias reales.

Una tarea debe poder llegar al registro de imágenes y a los servicios que necesita durante el inicio y la ejecución. Una subred privada no crea esa conectividad por sí sola. Diseña salida mediante NAT o endpoints de VPC según la imagen, la región y las APIs utilizadas; comprueba las dependencias concretas antes de bloquear rutas. En un laboratorio, evita abrir los puertos de la tarea a `0.0.0.0/0`.

Si tu aplicación necesita una base relacional, [Backend escalable con contenedores](https://www.alfredo-dominguez.dev/arquitecturas/02-scalable-backend/) muestra una arquitectura de referencia con Fargate, ALB, RDS PostgreSQL, Secrets Manager y autoescalado. Sus ajustes describen ese ejemplo, no son una garantía de rendimiento ni una cotización; RDS, balanceo, red y logs tienen cargos propios.

ECS puede ejecutar servicios en varias zonas de disponibilidad, pero una sola tarea no garantiza alta disponibilidad. Si la aplicación necesita tolerar una falla zonal, distribuye tareas saludables entre varias zonas, usa un balanceador cuando el protocolo lo requiera y conserva capacidad suficiente para cubrir la demanda si una zona queda fuera de servicio. El escalado tarda: no reemplaza la capacidad base que necesitas durante un pico o una interrupción.

La [guía de red de tareas Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html) explica las interfaces y la conectividad; la [guía de seguridad de red para ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-network.html) desarrolla grupos de seguridad y controles de tráfico.

## Comprueba la salud antes de enviar tráfico

Configura comprobaciones que representen el estado que importa a quienes usan la aplicación:

- Un *container health check* ejecuta un comando dentro del contenedor. Asegúrate de que la imagen incluya ese comando y de que mida una condición útil de la aplicación.
- El health check del balanceador comprueba si el destino responde por la ruta y el puerto configurados. Permite tráfico desde el grupo del balanceador hacia el puerto de la tarea.
- Si el arranque demora, ajusta el período de gracia del servicio para que ECS no retire una tarea antes de que pueda responder. Ese período no corrige un endpoint roto ni sustituye las comprobaciones.
- Para un servicio replicado, observa el estado de despliegue y los destinos saludables, no solo que la tarea aparezca como `RUNNING`.

La comprobación del contenedor y la del balanceador cubren partes distintas. Sus intervalos, reintentos y códigos de respuesta dependen del tiempo de inicio y del comportamiento real de la aplicación; no copies los valores de otra carga sin probarlos. Lee la documentación de [health checks de contenedores ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/healthcheck.html) y de [health checks del balanceador](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/load-balancer-healthcheck.html).

## Despliega y escala con límites explícitos

Un flujo de despliegue controlado crea una imagen nueva, publica una revisión nueva de la definición de tareas, actualiza el servicio y espera a que la revisión alcance el estado saludable definido. Conserva la revisión anterior hasta verificar la nueva. Configura el porcentaje de tareas mínimo y máximo durante el despliegue de acuerdo con la capacidad disponible, la latencia de inicio y la cantidad de tareas que pueden atender solicitudes.

Para ver un recorrido de CI/CD con Terraform, ECR y Fargate, consulta la [demostración de Amazon ECS con GitHub Actions](https://www.youtube.com/watch?v=3ocYjn0Aohc). Es una grabación comunitaria que ayuda a visualizar el flujo; contrasta permisos y pasos con la documentación vigente antes de aplicarlos.

En servicios con el controlador de despliegue ECS y estrategia rolling, habilita el circuit breaker y la reversión automática si quieres que ECS vuelva a la última revisión completada cuando la nueva no alcance el estado estable. Es una protección del despliegue, no una garantía general de recuperación: su disponibilidad depende del tipo de servicio y de que existan health checks adecuados. Las estrategias canary o blue/green tienen otros requisitos de balanceo y configuración. Consulta el [funcionamiento del deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html).

El autoescalado también requiere configuración:

- **Service Auto Scaling** cambia el número deseado de tareas del servicio. Application Auto Scaling puede usar CPU, memoria, solicitudes por destino u otra métrica adecuada para la carga.
- En **EC2 autogestionado**, los capacity providers pueden escalar la cantidad de instancias del clúster. Esta es otra capa: escalar tareas no agrega instancias por sí solo.
- Con **Fargate**, AWS aporta la capacidad de cómputo al iniciar tareas, pero debes configurar el mínimo y máximo del servicio y la métrica que decide cuándo agregar o quitar tareas.
- Ajusta los objetivos con pruebas de carga y observa latencia, errores, colas y límites de CPU y memoria. Una métrica cómoda no siempre representa el cuello de botella.

No todos los servicios deben escalar a cero. Una API puede tardar en arrancar y volver a quedar detrás del balanceador. Un worker puede aceptar ese retraso si la cola retiene el trabajo. Al escalar tareas a cero, otros recursos como el balanceador, NAT, imágenes y logs pueden seguir generando cargos. La [guía de autoescalado de servicios ECS](/blog/guia-completa-de-escalado-automatico-de-contenedores-en-aws/) distingue las capas de tareas y capacidad.

Si quieres estudiar un despliegue canary con alarmas y reversión, [ECS Canary in Action](https://github.com/roxsross/aws-ecs-canary-in-action) ofrece un laboratorio local con Docker Compose y otro con Terraform en AWS. El modo local no necesita una cuenta AWS y se apaga con `make local-down`; el de AWS crea ALB, ECS, ECR, DynamoDB y CloudWatch. Puede generar cargos mientras existe: revisa sus requisitos y la limpieza documentada, incluida la eliminación separada del repositorio ECR si el flujo lo creó.

## Observa eventos, tareas y logs para diagnosticar

Envía los logs de aplicación a CloudWatch Logs u otro destino operativo y define una retención acorde con la investigación y el costo que aceptas. Crea alarmas para errores, latencia, reinicios y diferencias entre las tareas deseadas y las que están ejecutándose. Los logs no reemplazan eventos del servicio: revisa ambos al investigar un despliegue.

Antes de consultar la cuenta, usa AWS CLI v2 con un perfil autenticado mediante credenciales temporales y define la región del servicio. Las consultas siguientes usan el perfil y la región que indiques; confirma primero la identidad:

```bash
export AWS_PROFILE="mi-perfil"
export AWS_REGION="us-east-1"
aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION"
```

Estas consultas son de solo lectura; reemplaza los nombres por los del servicio que ya existe:

```bash
aws ecs describe-services \
  --cluster mi-cluster \
  --services mi-servicio \
  --query 'services[0].events[0:5].[createdAt,message]' \
  --output table \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

aws ecs list-tasks \
  --cluster mi-cluster \
  --service-name mi-servicio \
  --desired-status STOPPED \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

aws ecs describe-tasks \
  --cluster mi-cluster \
  --tasks arn:aws:ecs:REGION:CUENTA:task/CLUSTER/ID-DE-TAREA \
  --query 'tasks[0].[stopCode,stoppedReason,containers[*].[name,reason]]' \
  --output json \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Empieza por los eventos de `describe-services` y el `stoppedReason` de la tarea. Para errores de arranque, comprueba la referencia de imagen, el rol de ejecución, la ruta de red, la capacidad de CPU/memoria y la cuota de tareas. Si la tarea corre pero el balanceador la marca como no saludable, revisa el puerto, la ruta de comprobación y las reglas entre grupos de seguridad. Si no aparecen logs, valida el driver, el grupo de logs, los permisos y la conectividad. AWS documenta los [eventos del servicio](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-event-messages.html) y los [errores de tareas detenidas](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/stopped-task-error-codes.html).

Las tareas detenidas no forman un historial permanente: la consola las muestra durante una hora y la API las devuelve durante al menos una hora. Si `list-tasks` no devuelve resultados, eso no demuestra que nunca hubo una falla; conserva eventos y logs en los sistemas de observabilidad que necesites para investigar incidentes después de esa ventana. Consulta [cómo ver errores de tareas detenidas](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/stopped-task-errors.html).

Como complemento sobre resiliencia, el encuentro grabado [Amazon ECS + caída de AWS: qué aprendimos del caos y cómo desplegar en la nube](https://www.youtube.com/watch?v=NUYNchvOVoc), de 295DevOps (2025), conversa sobre una interrupción y los aprendizajes de operación; úsalo como experiencia comunitaria, no como procedimiento oficial.

## Calcula el costo de toda la ruta

ECS no cobra una tarifa adicional por la orquestación de sus tareas, pero los recursos que las ejecutan sí tienen precio. En Fargate se cobra según los recursos solicitados —incluidos CPU, memoria, sistema operativo, arquitectura y almacenamiento— desde que comienza la descarga de la imagen hasta que termina la tarea; el cálculo se redondea por segundo, con un mínimo de un minuto para Linux y de cinco minutos para Windows. Las tarifas dependen de la región. ECS Managed Instances suma una tarifa de gestión a la capacidad de EC2.

Incluye en la estimación los componentes que pueden quedar activos aunque baje el número de tareas: balanceadores, NAT Gateway, direcciones IP públicas, transferencia entre zonas o hacia Internet, almacenamiento de imágenes y logs. Dimensiona CPU y memoria con métricas de la carga y revisa la retención de logs; una etiqueta de precio de Fargate no representa el costo total del servicio.

Fargate Spot puede reducir el costo de tareas que toleran interrupciones, como algunos trabajos por lotes. Usa capacidad sobrante y AWS puede interrumpirla con dos minutos de aviso; un servicio con una sola tarea Spot puede quedar esperando a que vuelva a haber capacidad. Diseña reintentos y apagado ordenado, y no la uses para una petición síncrona que deba responder continuamente. Consulta la [tarifa vigente de Fargate](https://aws.amazon.com/fargate/pricing/) y los [cargos de ECS Managed Instances](https://aws.amazon.com/ecs/pricing/) y las [condiciones de Fargate Spot](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html) antes de elegir.

## Dónde practicar, preguntar y compartir

El [demo comunitario de ECS Fargate con DynamoDB](https://github.com/roxsross/roxs-aws-ecs-demo) ofrece Docker Compose y DynamoDB Local para explorar una aplicación y su API sin credenciales AWS. El README describe Flask en el resumen, pero su árbol identifica FastAPI; verifica el código vigente antes de seguir el framework. La ruta Terraform crea recursos de AWS, así que estima sus cargos y la limpieza antes de desplegar. Como guía audiovisual del mismo tipo de aplicación, mira [Amazon ECS con Flask, Fargate y DynamoDB](https://www.youtube.com/watch?v=Ivtza36jJxA).

Para ampliar conceptos con otro formato, [Containers en AWS: construyendo el ecosistema de contenedores en ECS](https://www.youtube.com/watch?v=vZk7uVwFMQA) es una charla de AWS User Group Ecuador publicada en 2023; contrasta detalles actuales con la documentación oficial.

Para desplegar Fargate paso a paso con red, IAM, logs y health check, sigue nuestro [tutorial de una aplicación en Amazon ECS](/blog/como-desplegar-una-aplicacion-en-amazon-ecs/). Crear recursos en una cuenta puede generar cargos; el recorrido incluye su limpieza.

Para conversar, practicar y buscar ayuda con otras personas, los [AWS User Groups de AWS Builder Center](https://builder.aws.com/community/user-groups) organizan encuentros presenciales o virtuales. El [directorio de comunidades de ¿Dónde Aprendo AWS?](/comunidades/user-groups/) permite buscar grupos de la región; también puedes conocer el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/), abierto a personas interesadas en cloud que quieran compartir experiencias, y el [AWS User Group Perú](https://awsugperu.cloud/), cuyo portal reúne comunidades locales, agenda y recursos. Al pedir ayuda, comparte mensajes de error y fragmentos mínimos, pero elimina credenciales, datos personales, direcciones sensibles e identificadores de cuenta.

El [AWS Student Builder Group de la UTN Facultad Regional Córdoba](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/) convoca **AWS Gaming Lab: ECS, CI/CD y la magia de Terraform**. La actividad propone explorar qué hace falta para llevar un videojuego a la nube; se anuncia para el **10 de octubre de 2026, de 12:00 a 14:00 (UTC−03:00)**, presencial en la **UTN Facultad Regional Córdoba, Córdoba, Argentina**. Consulta la [ficha específica del evento](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/) para confirmar inscripción, cupos y costo antes de asistir. La [agenda de eventos AWS](/eventos/) reúne otras actividades, con sus condiciones en la convocatoria de cada organizador.

## Preguntas frecuentes

### ¿Amazon ECS requiere Kubernetes?

No. ECS es un orquestador de contenedores de AWS. EKS ejecuta Kubernetes. Si no necesitas la API ni las herramientas de Kubernetes, puedes evaluar ECS sin añadir esa capa.

### ¿El rol de tarea y el rol de ejecución son intercambiables?

No. El rol de ejecución da permisos al agente para iniciar la tarea, por ejemplo descargar una imagen privada o escribir logs. El rol de tarea da permisos a la aplicación dentro del contenedor para llamar a otros servicios de AWS.

### ¿ECS aumenta automáticamente las tareas cuando sube el tráfico?

Solo si configuras Service Auto Scaling, una métrica, límites mínimos y máximos y las condiciones de capacidad necesarias. En EC2, además debes asegurarte de que el clúster pueda alojar las tareas nuevas.

### ¿Fargate siempre cuesta menos que EC2?

No. Depende de la región, del tamaño y duración de las tareas, de cuánto puedas aprovechar la capacidad EC2 y de los recursos adicionales de red, balanceo y observabilidad. Compara costos medidos para una carga representativa.
