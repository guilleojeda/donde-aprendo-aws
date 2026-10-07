---
title: "Cómo enviar logs de contenedores a CloudWatch Logs en ECS y EKS"
description: "Configura logs de aplicaciones en Amazon ECS y EKS con awslogs o Fluent Bit. Revisa roles IAM, Fargate, retención y consultas de Logs Insights."
author: "guille-ojeda"
publishedAt: "2025-06-02"
publishedTimestamp: "2025-06-02T08:56:16.722000+00:00"
modifiedTimestamp: "2026-10-07T00:03:47-03:00"
review:
  date: "2026-10-07"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []
---

Para centralizar los logs de una aplicación en contenedores, haz que escriba en `stdout` o `stderr` y configura la ruta de envío según el entorno: en Amazon ECS se declara el driver `awslogs` en la definición de tarea; en Amazon EKS con nodos EC2 se instala un recolector para los logs de los pods; y en EKS con Fargate se configura el router de logs integrado de AWS. Los logs del plano de control de EKS son otra fuente y se habilitan por separado.

Si todavía estás decidiendo entre ECS, EKS y Fargate, consulta esta [guía para elegir dónde ejecutar contenedores en AWS](/blog/como-desplegar-contenedores-en-aws/). Esta página se concentra en llevar los logs de aplicación a CloudWatch Logs, encontrar eventos y diagnosticar por qué faltan.

## Elige la ruta de recopilación

- **Aplicación en ECS:** configura `awslogs` en cada contenedor de la definición de tarea. Comprueba el grupo y flujo indicados en `logConfiguration`.
- **Aplicación en EKS sobre EC2:** el recolector del add-on Amazon CloudWatch Observability o Fluent Bit lee los archivos de los contenedores. Con el add-on actual, comprueba `/aws/containerinsights/<cluster>/application`.
- **Aplicación en EKS sobre Fargate:** configura el router integrado de Fluent Bit mediante un `ConfigMap` y comprueba el grupo que hayas especificado allí.
- **Plano de control de EKS:** habilita los tipos de log del clúster que necesites. Comprueba `/aws/eks/<cluster>/cluster`.

En todos los casos, revisa qué identidad de IAM usa el agente de envío y que tenga salida de red a CloudWatch Logs en la región del destino. Si los contenedores escriben solo en archivos dentro de su sistema de archivos, los métodos de esta guía no los recogerán automáticamente: configura la aplicación para escribir a la salida estándar o prepara un recolector compatible con esa ruta.

Si CloudWatch todavía te resulta nuevo, la grabación breve [¿Dónde están mis logs en AWS?](https://www.youtube.com/watch?v=tsCvaRv5EkU) recorre la consola con ejemplos de Lambda y API Gateway. Sirve para orientarte en la navegación, no para configurar ECS o EKS: para esos pasos, sigue las rutas de esta guía y la documentación de AWS.

## ECS: configura `awslogs` en la definición de tarea

Crea el grupo de logs antes de desplegar la tarea. Así puedes definir la retención, el cifrado y el acceso del grupo por separado. En cada contenedor que quieras observar, incluye una configuración como esta en la definición de tarea:

```json
{
  "logConfiguration": {
    "logDriver": "awslogs",
    "options": {
      "awslogs-group": "/apps/checkout",
      "awslogs-region": "us-east-1",
      "awslogs-stream-prefix": "api"
    }
  }
}
```

Reemplaza la región y el nombre del grupo por los de tu entorno. El ejemplo presupone que `/apps/checkout` ya existe en esa región. Después de registrar la revisión de la definición y ejecutar la tarea o actualizar el servicio, busca el grupo y el flujo con prefijo `api` en CloudWatch Logs. En Fargate, AWS requiere `awslogs-stream-prefix`; también hace más fácil identificar los flujos por contenedor y tarea. Consulta el [ejemplo oficial de una definición ECS que envía logs a CloudWatch](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specify-log-config.html) y los [parámetros del driver `awslogs`](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html).

### Comprueba qué rol usa el envío

En una definición de tarea de ECS hay dos roles con propósitos distintos:

- **Rol de ejecución (`executionRoleArn`)**: lo usa el agente de ECS o Fargate para acciones de la plataforma, como enviar logs con `awslogs`. Para un grupo creado de antemano, comprueba que pueda ejecutar `logs:CreateLogStream` y `logs:PutLogEvents` sobre el grupo correspondiente.
- **Rol de tarea (`taskRoleArn`)**: entrega credenciales temporales al código de la aplicación para que llame a servicios de AWS. No sustituye al rol de ejecución para el envío que hace el driver `awslogs`.

La política administrada `AmazonECSTaskExecutionRolePolicy` cubre usos comunes. Si administras una política propia, limita los recursos al grupo de logs que necesita el servicio. Si habilitas `awslogs-create-group`, también necesitas `logs:CreateLogGroup`; el grupo debe crearse en la misma región indicada en `awslogs-region`. La [documentación de roles de ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-iam-role-overview.html) explica la diferencia entre ambos roles.

### Qué comprobar en ECS sobre EC2

No deduzcas la credencial efectiva solo de `executionRoleArn`. AWS documenta `logs:CreateLogStream` y `logs:PutLogEvents` en el rol de instancia y señala que se usa el rol de ejecución cuando está asignado a la tarea. Revisa estos puntos:

- **Versión del agente:** `awslogs` requiere al menos la versión 1.9.0 y los roles de ejecución, la 1.16.0. En una AMI personalizada, confirma además que `awslogs` figure en `ECS_AVAILABLE_LOGGING_DRIVERS`.
- **Selección de credenciales:** para que `awslogs` use el rol de ejecución, confirma `ECS_ENABLE_AWSLOGS_EXECUTIONROLE_OVERRIDE=true`. La [configuración del agente ECS](https://github.com/aws/amazon-ecs-agent#environment-variables) describe esta opción. `ecs-init` RPM 1.16.0-1 o posterior la establece en true por defecto, pero verifica el valor efectivo de tu instancia.
- **Configuración de la instancia:** en Linux con AMI optimizada, puedes fijar la opción en `/etc/ecs/ecs.config` y reiniciar el agente después del cambio. AWS la exige explícitamente para tareas Windows EC2 con `awslogs`. Consulta la [guía de configuración del agente EC2](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-agent-config.html) y el [ejemplo para instancias Windows](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/bootstrap_windows_container_instance.html).

Si faltan flujos, comprueba esos ajustes y los permisos del rol que usa el agente con la [guía de `awslogs` para instancias EC2](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html) y el [rol de ejecución de tareas](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html).

Revisa también la salida de red. En subredes privadas, permite el acceso a CloudWatch Logs mediante NAT o un endpoint de interfaz `com.amazonaws.<region>.logs`; el [manual de endpoints VPC para CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch-logs-and-interface-VPC.html) describe esa ruta privada.

Para ver el contexto de un despliegue completo, Rossana Suárez comparte una [demostración en español de una aplicación Flask en ECS Fargate con Terraform y GitHub Actions](https://www.youtube.com/watch?v=3ocYjn0Aohc), junto con su [repositorio de práctica](https://github.com/roxsross/roxs-aws-ecs-demo). El proyecto incluye CloudWatch Logs y métricas, pero la grabación es larga y no sustituye esta comprobación de `awslogs` e IAM.

## EKS: separa los logs de aplicación de los del clúster

### Pods en nodos EC2

Kubernetes conserva los logs de contenedor del nodo en archivos bajo `/var/log/pods`. Para ver una salida mientras investigas un pod, puedes consultar el contenedor directamente:

```bash
kubectl logs -n "$NAMESPACE" "$POD" -c "$CONTAINER" --since=15m --timestamps
kubectl logs -n "$NAMESPACE" "$POD" -c "$CONTAINER" --previous --timestamps
```

Define `NAMESPACE`, `POD` y `CONTAINER` para el recurso afectado. `--previous` consulta la instancia anterior del contenedor cuando se reinició. Este acceso puntual ayuda a aislar un error, pero no centraliza la retención en CloudWatch.

Para nuevos clústeres EKS con nodos EC2, la ruta administrada actual es el [add-on Amazon CloudWatch Observability con OTel Container Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/container-insights-eks-otel.html). El add-on instala un recolector como `DaemonSet`, lee los logs de `stdout` y `stderr` desde `/var/log/pods` y, por defecto, los envía al grupo `/aws/containerinsights/<cluster>/application`. El recolector necesita permiso para escribir en CloudWatch Logs; puedes asignarle un rol mediante EKS Pod Identity o IRSA, o usar el rol de los nodos según tu configuración. AWS incluye como referencia `CloudWatchAgentServerPolicy` y documenta los [permisos y la ruta de envío de logs del add-on](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/container-insights-eks-otel-logs.html).

Si aún estás aprendiendo los componentes de EKS, la grabación comunitaria [EKS Fundamentals: Desmitificando Kubernetes con AWS](https://www.youtube.com/watch?v=YEY9NbFMQ0Y), de AWS User Group Ecuador, ayuda a ubicar Kubernetes y el plano de control administrado. Es una introducción conceptual, no un tutorial de CloudWatch Logs.

Container Insights también publica datos de rendimiento, pero el grupo `application` contiene los eventos de los contenedores. Si ya tienes un recolector como Fluent Bit, revisa su configuración antes de instalar otro: dos recolectores pueden duplicar eventos y aumentar la ingesta. Para comprobar el add-on y sus pods, sigue la [guía de instalación y diagnóstico para EKS](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/install-CloudWatch-Observability-EKS-addon.html).

### Pods en EKS Fargate

EKS Fargate ofrece un router de logs basado en Fluent Bit que AWS ejecuta por ti. No despliegues el `DaemonSet` del add-on para recoger logs de pods Fargate: el router integrado se configura mediante un `ConfigMap` llamado `aws-logging` en un namespace dedicado `aws-observability`, que debe tener la etiqueta `aws-observability: enabled`. En el `ConfigMap` defines el destino de CloudWatch, el grupo, la región y el prefijo del flujo.

El router captura `stdout` y `stderr`; necesita permisos de CloudWatch Logs en el rol de ejecución de los pods Fargate y conectividad desde la VPC al destino. Si cambias el `ConfigMap`, la modificación se aplica a pods nuevos; reinicia los existentes para que adopten la configuración. La [guía oficial de logging para EKS Fargate](https://docs.aws.amazon.com/eks/latest/userguide/fargate-logging.html) incluye un ejemplo de configuración para CloudWatch y el archivo de permisos asociado.

### Logs del plano de control

Los logs de las aplicaciones no incluyen los eventos internos del API server ni las decisiones de autenticación del clúster. Para recopilar esa fuente, habilita individualmente los tipos que necesites: `api`, `audit`, `authenticator`, `controllerManager` y `scheduler`. Están deshabilitados por defecto y se envían al grupo `/aws/eks/<cluster>/cluster`; no necesitas instalar el agente de CloudWatch para esta ruta.

EKS entrega estos logs a CloudWatch Logs en pocos minutos como mejor esfuerzo. La ingesta, el almacenamiento y el análisis de datos tienen cargos de CloudWatch. Sigue la [guía de AWS para activar y consultar los logs del plano de control](https://docs.aws.amazon.com/eks/latest/userguide/control-plane-logs.html) y habilita solo las categorías útiles para tu investigación o auditoría.

## Consulta eventos con Logs Insights

En la consola de CloudWatch, abre **Logs Insights**, selecciona el grupo de aplicación y limita el rango de tiempo al incidente. Si tus eventos son texto plano, empieza por una búsqueda amplia:

```text
fields @timestamp, @message
| filter @message like /(?i)(error|exception|timeout)/
| sort @timestamp desc
| limit 50
```

Para logs JSON que incluyan campos `service`, `level`, `requestId` y `statusCode`, ajusta los nombres a tu esquema:

```text
fields @timestamp, service, level, requestId, statusCode, @message
| filter level = "ERROR" or statusCode >= 500
| sort @timestamp desc
| limit 50
```

Para encontrar los servicios y períodos con más errores:

```text
fields service, level
| filter level = "ERROR"
| stats count(*) as errores by bin(5m), service
| sort errores desc
```

Logs Insights descubre campos en eventos JSON. Si no ves resultados, confirma primero el formato real del evento y el grupo seleccionado; luego adapta los nombres de campo. El [manual de Logs Insights QL](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_AnalyzeLogData_LogsInsights.html) describe los comandos y AWS publica [consultas de ejemplo](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-examples.html). Las consultas se cobran según los datos sin comprimir que analizan: limita el intervalo y los grupos seleccionados antes de consultar un historial amplio.

Como complemento para diseñar el contenido de los eventos, puedes ver [cómo crear logs estructurados y métricas personalizadas con CloudWatch](https://www.youtube.com/watch?v=UBPPGJaBIVY), una grabación de Marcia Villalba sobre aplicaciones serverless con Node.js y Embedded Metric Format. El patrón JSON ayuda a construir consultas como las anteriores, aunque el ejemplo no configura colectores para ECS ni EKS. El artículo comunitario de AWS Builder Center [Observabilidad desde los logs: cómo construir SLIs sin esperar a instrumentar el código](https://builder.aws.com/content/3IlpApiKwsNpk6eWH4T0NdgFfkf/observabilidad-desde-los-logs-como-construir-slis-sin-esperar-a-que-alguien-instrumente-el-codigo) profundiza en cuándo usar filtros de métricas, Embedded Metric Format o Logs Insights con eventos estructurados.

Para practicar CloudWatch en términos más generales, el [Laboratorio práctico de Amazon CloudWatch](https://www.youtube.com/watch?v=ZdMM2W0vrvA), de AWS User Group Caracas, es una grabación de su grupo de estudio de 2024 sobre métricas y monitoreo. La ficha no confirma ejercicios específicos de logs o contenedores; úsala como práctica complementaria de la consola, no como guía de configuración para ECS/EKS.

## Diagnostica cuando no llegan logs

- **ECS no crea un flujo:** Confirma que la tarea ejecuta la revisión que contiene `logConfiguration`, que el nombre del grupo y la región son correctos, y que el contenedor escribe en `stdout` o `stderr`.
- **ECS crea la tarea, pero no llegan eventos:** Revisa `logs:CreateLogStream` y `logs:PutLogEvents` en el rol de ejecución; en EC2 verifica además la configuración del agente y el rol de instancia. Comprueba salida de red a CloudWatch Logs.
- **EKS muestra `kubectl logs`, pero el grupo está vacío:** Verifica que el recolector esté activo, que tenga permiso de escritura y acceso a `/var/log/pods`, y que estés mirando `/aws/containerinsights/<cluster>/application` en la región correcta.
- **EKS Fargate no publica logs tras editar la configuración:** Revisa los eventos del pod y la sintaxis del `ConfigMap`; confirma la etiqueta del namespace, el rol de ejecución Fargate y la conectividad. Los pods en ejecución no adoptan cambios del `ConfigMap`.
- **Ves logs de auditoría, pero no de la aplicación:** Es la ruta del plano de control. Configura por separado el add-on/recolector de pods o el router integrado de Fargate.
- **Logs Insights devuelve cero filas:** Aumenta primero el rango unos minutos, confirma zona horaria/cuenta/región/grupo y busca en `@message`; después añade filtros por campos JSON.

Evita escribir secretos, tokens o datos personales innecesarios en los logs y limita quién puede leer los grupos. Define retención por grupo: si no estableces una política, CloudWatch Logs conserva los eventos indefinidamente; los valores disponibles van de 1 a 3653 días en períodos predefinidos. El [API de retención de CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutRetentionPolicy.html) lista esos valores. Decide el plazo según las necesidades operativas, de privacidad y de auditoría; no hay un período universal. Si usas una clave KMS propia, protege también los permisos y la disponibilidad de esa clave.

## Sigue aprendiendo y comparte un caso

Para investigar también métricas y trazas, continúa con [cómo diagnosticar problemas en aplicaciones AWS con CloudWatch](/blog/mejores-practicas-de-observabilidad-en-aws/).

Si quieres contrastar una configuración con otras personas, el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) mantiene una comunidad local de nube y AWS. Lleva una pregunta concreta, como «ECS Fargate ejecuta la tarea, pero no crea el flujo en `/apps/checkout`; ¿qué rol y región debería verificar?». Comparte un evento ficticio o anonimizado, nunca credenciales ni registros de clientes.

Para estudiantes de Ingeniería en Sistemas de Información que estén en Córdoba, la [comunidad AWS SBG de UTN-FRC](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/) anunció **AWS Gaming Lab: ECS, CI/CD y la magia de Terraform** para el 10 de octubre de 2026: recepción a las 11:30 y charla desde las 12:00 en la UTN Facultad Regional Córdoba. La universidad lo presenta como un encuentro presencial y gratuito con inscripción previa, dirigido a estudiantes de esa carrera; no es un taller específico de CloudWatch Logs. Revisa la [ficha oficial del evento](https://prensa.frc.utn.edu.ar/eventos/aws-gaming-lab-ecs-ci-cd-y-la-magia-de-terraform/) para confirmar registro y detalles. Si esa fecha ya pasó, consulta la [agenda de próximos eventos AWS](/eventos/).
