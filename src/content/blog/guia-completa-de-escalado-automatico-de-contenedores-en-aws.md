---
title: "Escalado automático de contenedores en AWS: ECS, EKS y Fargate"
description: "Escala tareas ECS y pods EKS con target tracking o HPA. Distingue réplicas y nodos, diagnostica capacidad y practica en un clúster local."
author: "guille-ojeda"
publishedAt: "2024-05-17"
publishedTimestamp: "2024-05-17T00:30:54.181Z"
modifiedTimestamp: "2026-10-06T15:38:25-03:00"
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
  - title: "Cómo desplegar una aplicación en Amazon EKS con kubectl"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-una-aplicacion-en-amazon-eks/"
  - title: "Cómo reducir costos en AWS Fargate con ECS: guía práctica"
    url: "https://dondeaprendoaws.com/blog/7-estrategias-para-reducir-costos-en-aws-fargate/"

---

El escalado automático de contenedores en AWS no es una sola función. Es un conjunto de controles que actúan sobre capas distintas: el número de tareas de un servicio ECS, el número de pods de un workload de Kubernetes y la capacidad de cómputo donde esas unidades deben ejecutarse. Si mezclas esas capas, puedes ver más réplicas pendientes mientras el clúster sigue sin capacidad, o agregar nodos cuando el problema real es que una tarea está mal dimensionada.

Esta guía te ayuda a elegir el control correcto, configurar un ejemplo de Amazon ECS y comprobar un Horizontal Pod Autoscaler (HPA) de Kubernetes en local. Los valores de CPU, memoria, réplicas y tiempos son puntos de partida para una carga concreta; no garantizan por sí solos rendimiento, disponibilidad ni un costo determinado.

## El mapa mental: qué escala cada control

Antes de elegir una política, identifica qué unidad debe aumentar o disminuir:

| Capa | Unidad que cambia | Control habitual | Qué no resuelve por sí solo |
| --- | --- | --- | --- |
| Servicio ECS | Tareas del servicio y su `desiredCount` | ECS Service Auto Scaling mediante Application Auto Scaling | No agrega instancias EC2 si el clúster no tiene capacidad |
| Capacidad ECS sobre EC2 | Instancias del Auto Scaling group asociado al capacity provider | ECS cluster auto scaling (managed scaling) | No decide cuántas tareas necesita el servicio |
| Workload EKS | Pods de un `Deployment`, `StatefulSet` u otro recurso escalable | HPA con `autoscaling/v2` | No crea nodos cuando los pods no caben |
| Cómputo EKS | Nodos o recursos de cómputo | EKS Auto Mode, Karpenter o Cluster Autoscaler | No reemplaza la política HPA del workload |
| Tamaño de una unidad | CPU y memoria asignadas a una tarea o pod | Una nueva definición de tarea o recursos del pod; VPA queda fuera de esta guía | No aumenta el número de réplicas |

En ECS, una tarea es una ejecución de una definición de tareas. En EKS, un pod es la unidad que el scheduler coloca en un nodo o en Fargate. Un nodo no es una réplica de la aplicación: es capacidad compartida para colocar pods. En Fargate no administras nodos EC2, pero sigues teniendo que escalar las tareas ECS o los pods EKS que atienden el trabajo.

Antes de multiplicar contenedores, externaliza el estado que deba sobrevivir a una réplica: sesiones, archivos subidos, imágenes, locks y datos de negocio no deberían depender del disco efímero de una tarea o pod. Elige el servicio por la semántica que necesita la aplicación —por ejemplo, S3 para objetos, una base de datos para datos transaccionales o EFS/FSx para un sistema de archivos compartido— y mide conexiones, latencia y consistencia por separado. [Nuestra comparación de EFS y FSx](/blog/guia-completa-sobre-amazon-efs-y-fsx/) ayuda a decidir por protocolo, acceso, disponibilidad y rendimiento; montar almacenamiento compartido no convierte por sí solo una aplicación con estado en una carga escalable.

## ECS: escalar tareas del servicio

[Amazon ECS Service Auto Scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html) usa Application Auto Scaling y métricas de CloudWatch para cambiar automáticamente el número deseado de tareas de un servicio. ECS publica utilización media de CPU y memoria; también puedes usar métricas como solicitudes por destino de un Application Load Balancer o una métrica personalizada.

El servicio debe tener un mínimo y un máximo. El mínimo protege una capacidad base y el máximo limita el crecimiento que la política puede solicitar. La tarea todavía debe poder iniciar: la imagen, el rol de ejecución, la red, los límites de CPU y memoria, el balanceador y la capacidad de cómputo tienen que estar disponibles.

### Target tracking, step scaling y programado

Para una carga que cambia de forma continua, **target tracking** suele ser el punto de partida más sencillo: eliges una métrica y un objetivo, y Application Auto Scaling crea y administra las alarmas de CloudWatch. AWS documenta como métricas predefinidas `ECSServiceAverageCPUUtilization`, `ECSServiceAverageMemoryUtilization` y `ALBRequestCountPerTarget`.

Target tracking escala hacia fuera cuando la métrica está por encima del objetivo y reduce tareas de forma más gradual. No escala si la métrica tiene datos insuficientes. Puedes tener varias políticas con métricas distintas: ECS escala hacia fuera si cualquiera está lista para hacerlo, y solo escala hacia dentro cuando todas las políticas que permiten scale-in lo permiten. Las alarmas creadas por target tracking las administra Application Auto Scaling; no las edites manualmente.

**Step scaling** es útil cuando necesitas incrementos explícitos después de cruzar umbrales, por ejemplo, agregar cuatro tareas cuando el backlog supera cierto nivel. **Scheduled scaling** sirve para horarios previsibles, como preparar más capacidad antes de una jornada. Puedes combinar una política programada con una dinámica, pero establece un rango mínimo y máximo que ambas respeten.

### Elegir la métrica de ECS

Empieza por el síntoma que limita el servicio, no por una métrica cómoda:

- **CPU media:** una opción razonable si el trabajo es principalmente de CPU y la definición de tareas tiene una reserva representativa.
- **Memoria media:** útil si la memoria es el límite dominante; observa reinicios y presión de memoria además de la media.
- **Solicitudes por destino:** apropiada para una API detrás de ALB cuando una tarea puede procesar una tasa estable de solicitudes. No presupone que todas las solicitudes cuestan lo mismo.
- **Backlog por tarea:** suele encajar mejor con workers de SQS. La métrica debe ser proporcional al trabajo pendiente por tarea y publicarse con suficiente continuidad; la [guía de escalado de ECS por cola SQS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-queue.html) muestra el patrón.
- **Métrica de negocio:** puede representar mejor una carga que no consume CPU de manera uniforme, pero requiere instrumentación, permisos, alarmas y una prueba de que responde en la dirección esperada al agregar tareas. Para target tracking, [Application Auto Scaling requiere](https://docs.aws.amazon.com/autoscaling/application/userguide/application-auto-scaling-target-tracking.html) una métrica cuyo valor disminuya aproximadamente cuando aumenta la capacidad; una latencia suele servir como SLO o alarma para step scaling, pero no debe elegirse como target tracking sin demostrar esa relación.

No uses CPU como sinónimo de capacidad disponible. Un servicio bloqueado por conexiones, I/O o una cola puede mostrar CPU baja y seguir necesitando más tareas. Mide al menos la métrica de decisión junto con tareas deseadas y ejecutándose, latencia, errores, reinicios, backlog y tiempo de arranque.

### Cooldown y escala a cero en ECS

El cooldown permite que una actividad tenga tiempo de surtir efecto. El scale-out debe reaccionar con rapidez, pero no volver a sumar capacidad antes de que las tareas nuevas entren en servicio; el scale-in conviene hacerlo con más cautela. Ajusta `ScaleOutCooldown` y `ScaleInCooldown` según el tiempo que tarda tu imagen en descargarse, la tarea en estar saludable y el balanceador en incorporarla.

Un servicio ECS puede usar `min-capacity 0`. En target tracking, si la capacidad actual es cero, Application Auto Scaling espera un dato de demanda antes de iniciar y comienza con el incremento mínimo posible. Es una opción razonable para workers cuya carga puede esperar el arranque; una API interactiva puede sufrir el tiempo de arranque y de registro de destinos. Escalar el servicio a cero tampoco elimina cargos de un ALB, NAT Gateway, ECR, logs u otros recursos que sigan activos.

Durante un despliegue ECS, Application Auto Scaling suspende el scale-in y mantiene el scale-out salvo que lo suspendas explícitamente. Esto evita retirar capacidad mientras cambia la revisión, pero también puede hacer que el conteo actual supere temporalmente el mínimo.

### Ejemplo: una política de CPU para un servicio ECS existente

Este ejemplo cambia la configuración de un servicio ya creado. Úsalo únicamente en un servicio de laboratorio que no tenga un scalable target ni políticas de Application Auto Scaling previas. Necesitas AWS CLI configurada, permisos para Application Auto Scaling y un servicio ECS con una definición de tareas que ya pueda arrancar. El `resource-id` tiene la forma `service/<cluster>/<service>`; no confundas el nombre del servicio con el nombre de la definición de tareas.

Primero comprueba que el servicio elegido no tenga escalado registrado y guarda su `desiredCount` actual. Si cualquiera de las dos primeras consultas devuelve un recurso, detente y usa otro servicio de laboratorio: el cleanup de este ejemplo no debe retirar una política ajena.

```bash
export AWS_REGION="us-east-1"
export ECS_CLUSTER="mi-cluster"
export ECS_SERVICE="mi-servicio"
export RESOURCE_ID="service/${ECS_CLUSTER}/${ECS_SERVICE}"
export POLICY_NAME="cpu60-target-tracking"

aws application-autoscaling describe-scalable-targets \
  --service-namespace ecs \
  --resource-id "$RESOURCE_ID" \
  --scalable-dimension ecs:service:DesiredCount \
  --region "$AWS_REGION"

aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs \
  --resource-id "$RESOURCE_ID" \
  --scalable-dimension ecs:service:DesiredCount \
  --region "$AWS_REGION"

aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --query 'services[0].desiredCount' \
  --region "$AWS_REGION"

# Guarda el número mostrado antes de continuar y reemplaza el marcador.
export ORIGINAL_DESIRED_COUNT="REEMPLAZAR_CON_EL_VALOR_OBSERVADO"

aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "$RESOURCE_ID" \
  --min-capacity 1 \
  --max-capacity 6 \
  --region "$AWS_REGION"

cat > config.json <<'JSON'
{
  "TargetValue": 60.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 180
}
JSON

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "$RESOURCE_ID" \
  --policy-name "$POLICY_NAME" \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://config.json \
  --region "$AWS_REGION"
```

Comprueba que el objetivo y la política existen y que ECS recibe tareas:

```bash
aws application-autoscaling describe-scalable-targets \
  --service-namespace ecs \
  --resource-id "$RESOURCE_ID" \
  --scalable-dimension ecs:service:DesiredCount \
  --region "$AWS_REGION"

aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs \
  --resource-id "$RESOURCE_ID" \
  --scalable-dimension ecs:service:DesiredCount \
  --region "$AWS_REGION"

aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}' \
  --region "$AWS_REGION"
```

Para limpiar lo que este ejemplo creó, elimina la política, desregistra el objetivo y borra el archivo local. La eliminación de la política también quita las alarmas administradas por target tracking; no borres el servicio ECS si pertenece a otra práctica.

```bash
aws application-autoscaling delete-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "$RESOURCE_ID" \
  --policy-name "$POLICY_NAME" \
  --region "$AWS_REGION"

aws application-autoscaling deregister-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id "$RESOURCE_ID" \
  --region "$AWS_REGION"

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --desired-count "$ORIGINAL_DESIRED_COUNT" \
  --region "$AWS_REGION"

rm config.json
```

Este bloque muta la configuración de una cuenta AWS y puede producir cargos por las tareas y los servicios que ya existan. Para un laboratorio de ECS completo, sigue el [tutorial de despliegue de ECS con Fargate](/blog/como-desplegar-una-aplicacion-en-amazon-ecs/), que incluye los recursos de red y su limpieza.

## ECS: capacidad de EC2 y capacity providers

Si tu servicio usa Fargate, AWS suministra la capacidad de cómputo subyacente y no administras un Auto Scaling group de instancias para esas tareas. Aun así, Service Auto Scaling debe cambiar el número de tareas. Fargate no convierte automáticamente la métrica de CPU del servicio en más tareas: necesitas una política del servicio.

En una carga ECS sobre EC2, la pregunta adicional es dónde colocar las tareas nuevas. Un **capacity provider** asociado a un Auto Scaling group puede usar managed scaling para ajustar la cantidad de instancias según `CapacityProviderReservation`. ECS crea y administra la política de target tracking de ese grupo. Esta política actúa sobre instancias, mientras la política de Service Auto Scaling actúa sobre tareas; normalmente necesitas ambas capas coordinadas.

Para que una tarea pendiente participe en el escalado administrado, el servicio debe usar una estrategia de capacity providers compatible. Las tareas sin esa estrategia no provocan el scale-out del capacity provider. ECS tampoco puede colocar una tarea si sus requisitos exceden el tipo de instancia más pequeño del Auto Scaling group; en ese caso puede permanecer en `PROVISIONING` aunque parezca que hay una política de escalado.

Revisa también estos límites:

- `MaximumCapacity` del Auto Scaling group debe ser mayor que cero para poder escalar hacia fuera.
- ECS no modifica automáticamente el mínimo y máximo del Auto Scaling group.
- Al escalar desde cero instancias, ECS lanza inicialmente dos instancias en el comportamiento documentado de cluster auto scaling; el tiempo de arranque y `instanceWarmupPeriod` forman parte de la latencia.
- No añadas otra política que gestione el `desired capacity` del mismo Auto Scaling group mientras el capacity provider administrado está activo.

Consulta [cluster auto scaling de ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cluster-auto-scaling.html) y el detalle de [managed scaling behavior](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/managed-scaling-behavior.html) antes de mezclar tipos de instancia, constraints y estrategias de placement.

Como siguiente paso comunitario, [Backend escalable con ECS Fargate y RDS](https://www.alfredo-dominguez.dev/arquitecturas/02-scalable-backend/) muestra una arquitectura con balanceador, tareas Fargate y una base de datos. Úsalo para identificar qué estado queda fuera de las tareas y qué componentes tienen costos y límites propios; su diseño no es una medición ni una plantilla obligatoria.

Para repasar la capa de instancias antes de configurar un capacity provider, [Introducción a Auto Scaling Groups](https://speakerdeck.com/gerardokaztro/introduccion-a-asg) presenta los conceptos de un ASG, y [Al día con AWS #18: Sobreviviendo al Auto Scaling](https://www.youtube.com/watch?v=al7zc1OOChM) recorre operación y capacidad en AWS. Ambos son material comunitario complementario: el primero es una presentación introductoria y el segundo una grabación general de cómputo, así que confirma límites y nombres en la documentación de ECS.

## EKS: separar HPA de los nodos

En Amazon EKS, el [Horizontal Pod Autoscaler](https://docs.aws.amazon.com/eks/latest/userguide/horizontal-pod-autoscaler.html) modifica las réplicas del workload que referencia. No escala el tamaño de los nodos. Para métricas de CPU o memoria necesitas una fuente de `metrics.k8s.io`, normalmente [Metrics Server](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/). Para métricas personalizadas o externas necesitas el adaptador correspondiente.

Con `autoscaling/v2`, HPA puede evaluar varias métricas y usar la mayor recomendación de réplicas. Para `averageUtilization`, Kubernetes calcula la utilización con respecto al `resources.requests` del contenedor; si no existe la reserva relevante, no puede calcular esa métrica para ese pod. Define requests y limits coherentes antes de interpretar el porcentaje.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
```

El valor de 60% no es una recomendación universal. Mide el tiempo de respuesta, errores, saturación de dependencias y el costo mientras pruebas un objetivo. Kubernetes usa por defecto una ventana de estabilización de scale-down de cinco minutos; puedes cambiarla en `behavior`, como en el ejemplo. El scale-down a cero no funciona con CPU o memoria: para `minReplicas: 0` necesitas una métrica de objeto o externa y las condiciones de versión/feature gate que correspondan a tu clúster.

### ¿Quién crea los nodos?

Cuando el HPA aumenta pods y el scheduler no puede colocarlos, el síntoma aparece como pods `Pending`. Ahí entra otra capa:

- [EKS Auto Mode](https://docs.aws.amazon.com/eks/latest/userguide/autoscaling.html) escala el cómputo del clúster, crea recursos cuando un pod no cabe y consolida nodos. AWS indica que Auto Mode se basa en Karpenter.
- [Karpenter](https://karpenter.sh/) aprovisiona recursos según los requisitos de los pods, pero es software que el cliente instala, configura, actualiza y opera. AWS no ofrece un SLA para Karpenter como software administrado.
- [Cluster Autoscaler](https://docs.aws.amazon.com/eks/latest/userguide/autoscaling.html) ajusta grupos de Auto Scaling cuando hay pods que no se pueden programar o nodos infrautilizados.

Elige una ruta de gestión de nodos para el clúster y documenta su propiedad. No instales Karpenter y Cluster Autoscaler para que ambos administren el mismo grupo sin un diseño explícito. EKS Auto Mode tampoco convierte el HPA en un autoscaler de nodos: el HPA decide pods y la capa de cómputo decide dónde ponerlos.

### EKS con Fargate

En EKS Fargate, un perfil de Fargate decide qué pods pueden ejecutarse en Fargate y cada pod tiene su propia frontera de cómputo. HPA puede aumentar el número de pods de un `Deployment`, pero debes comprobar que los pods coincidan con el perfil y que las subredes, permisos e imágenes permitan iniciarlos. Un pod que no coincide con un perfil puede quedar `Pending`.

Fargate evita que administres grupos de nodos EC2; no elimina la necesidad de elegir `minReplicas`, `maxReplicas`, requests, métricas y límites de la aplicación. EKS Fargate tampoco ofrece Fargate Spot. Para detalles y restricciones actuales, revisa [la guía de Fargate para EKS](https://docs.aws.amazon.com/eks/latest/userguide/fargate.html).

### Una ruta administrada adicional: Elastic Beanstalk Cluster

Si quieres delegar más decisiones de Kubernetes, [Elastic Beanstalk Cluster](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/concepts-cluster.html) ejecuta la aplicación en un clúster EKS que Elastic Beanstalk crea y opera. Su escalado de cluster cambia el número de réplicas mediante opciones de Elastic Beanstalk y el entorno usa capacidad de nodos suministrada por EKS Auto Mode; [la configuración de Cluster scaling](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/configuring-cluster-scaling.html) define mínimos, máximos, triggers, cooldown y métricas del entorno.

Es una frontera administrada distinta de configurar directamente HPA, NodePools o Karpenter en un clúster EKS propio. Evalúala cuando prefieras operar un entorno de aplicación con opciones de Elastic Beanstalk; elige EKS directo cuando necesites controlar los manifiestos, adaptadores de métricas y autoscalers del clúster. El entorno Cluster mantiene al menos una réplica, por lo que no es una ruta para escala a cero.

## Métricas, límites y pruebas

Un autoscaler solo puede reaccionar a lo que mide. Antes de cambiar un objetivo, define qué significa “capacidad suficiente” para tu servicio:

1. **Señal de demanda:** solicitudes por destino, backlog por tarea, concurrencia o una métrica de negocio. CPU y memoria son señales de saturación, no siempre de demanda.
2. **SLO de la aplicación:** latencia, errores, tiempo de procesamiento y disponibilidad observados junto con la métrica de escalado.
3. **Capacidad de arranque:** tiempo de descarga de imagen, inicialización, health check y registro en el balanceador. El cooldown debe ser mayor que el tiempo necesario para observar el efecto.
4. **Límites:** mínimo y máximo de tareas o pods, límite de instancias o NodePool y cuotas de la cuenta. Un máximo bajo puede explicar que la métrica siga elevada.
5. **Carga representativa:** picos, pausas, mensajes que llegan en ráfagas y dependencias lentas. Una prueba que solo mide CPU media no valida una API limitada por la base de datos.

No interpretes el éxito como “la métrica llegó exactamente al objetivo”. ECS redondea sus ajustes y escala hacia dentro de forma conservadora; HPA aplica tolerancia, considera pods sin métricas y estabiliza recomendaciones. Verifica que la carga se atiende y que la aplicación recupera su estado, no solo que aumentó un contador de réplicas.

## Diagnóstico rápido

| Síntoma | Dónde mirar primero | Interpretación habitual |
| --- | --- | --- |
| La política ECS no cambia tareas | Target scalable, política, alarmas administradas y datos de CloudWatch | El objetivo puede no estar registrado, la métrica puede no existir todavía o tener datos insuficientes |
| `desiredCount` sube pero `runningCount` no | Eventos del servicio, tareas `PENDING`, imagen, IAM, red y capacidad | Service Auto Scaling pidió tareas; ECS todavía no pudo colocarlas o iniciarlas |
| ECS sobre EC2 deja tareas en `PROVISIONING` | Estrategia de capacity providers, `CapacityProviderReservation`, requisitos de la tarea y tipos de instancia | La política de tareas y la de instancias son capas distintas; una tarea incompatible no provoca capacidad útil |
| HPA muestra `unknown` | `kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes`, Metrics Server, requests y eventos | Falta la API de métricas o el pod no tiene la reserva que necesita la métrica |
| HPA aumenta pods pero quedan `Pending` | `kubectl describe pod`, eventos del scheduler y la capa de nodos | HPA creó réplicas; Auto Mode, Karpenter o Cluster Autoscaler debe aportar cómputo compatible |
| La aplicación oscila entre escalas | Métrica, ruido, cooldown, readiness y estabilización | El objetivo puede ser demasiado sensible o la métrica no representar la demanda |
| No baja a cero | Mínimo configurado, tipo de métrica y disponibilidad de datos | ECS necesita `min-capacity 0`; HPA no escala a cero con CPU o memoria solamente |

En ECS, empieza por `describe-services` y los eventos del servicio. En EKS, empieza por `kubectl describe hpa`, `kubectl get events --sort-by=.lastTimestamp` y `kubectl describe pod`. Un autoscaler no puede arreglar una imagen que no se descarga, un permiso IAM ausente, una subred sin salida o una dependencia saturada.

## Práctica comprobable sin AWS: HPA en Minikube

Puedes comprobar el ciclo de métricas, HPA y réplicas sin crear una cuenta, un clúster EKS ni recursos facturables. Esta ruta requiere [Minikube](https://minikube.sigs.k8s.io/docs/start/), [kubectl](https://kubernetes.io/docs/tasks/tools/), Docker o un driver compatible y `curl` opcional. Consume CPU y memoria local. Usa un perfil dedicado y un contexto explícito para no reutilizar ni detener otro clúster Minikube.

### 1. Inicia el clúster y Metrics Server

```bash
export MINIKUBE_PROFILE="aws-hpa-demo"

# Si el nombre ya aparece, elige otro perfil antes de continuar.
if minikube profile list --output=json | grep -Fq "$MINIKUBE_PROFILE"; then
  echo "El perfil $MINIKUBE_PROFILE ya existe; elige otro." >&2
  exit 1
fi

minikube start --profile "$MINIKUBE_PROFILE" --driver=docker
minikube addons enable metrics-server --profile "$MINIKUBE_PROFILE"
minikube status --profile "$MINIKUBE_PROFILE"
kubectl --context "$MINIKUBE_PROFILE" wait --for=condition=available deployment/metrics-server \
  -n kube-system --timeout=120s
```

Comprueba que la API de métricas responda. El primer valor puede tardar unos segundos:

```bash
kubectl --context "$MINIKUBE_PROFILE" get --raw /apis/metrics.k8s.io/v1beta1/nodes
kubectl --context "$MINIKUBE_PROFILE" top nodes
```

### 2. Despliega una aplicación con un request de CPU

El HPA no puede calcular utilización de CPU sin `resources.requests.cpu`. Este manifiesto usa la imagen de ejemplo de la [práctica oficial de Kubernetes](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/).

```bash
kubectl --context "$MINIKUBE_PROFILE" apply -f - <<'YAML'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hpa-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hpa-demo
  template:
    metadata:
      labels:
        app: hpa-demo
    spec:
      containers:
        - name: app
          image: registry.k8s.io/hpa-example
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 200m
            limits:
              cpu: 500m
---
apiVersion: v1
kind: Service
metadata:
  name: hpa-demo
spec:
  selector:
    app: hpa-demo
  ports:
    - port: 80
      targetPort: 80
YAML

kubectl --context "$MINIKUBE_PROFILE" rollout status deployment/hpa-demo --timeout=120s
```

### 3. Crea el HPA y observa la recomendación

```bash
kubectl --context "$MINIKUBE_PROFILE" apply -f - <<'YAML'
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: hpa-demo
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: hpa-demo
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 60
YAML

kubectl --context "$MINIKUBE_PROFILE" get hpa hpa-demo
kubectl --context "$MINIKUBE_PROFILE" describe hpa hpa-demo
```

El objetivo debe mostrar un porcentaje actual y `REPLICAS` igual a 1 al principio. Si aparece `<unknown>`, vuelve a revisar Metrics Server, `kubectl top pods` y el request de CPU.

### 4. Genera carga y verifica el scale-out

En otra terminal, crea un pod temporal que solicite el servicio. El `--rm` lo elimina cuando interrumpas el proceso; si tu terminal no conserva la sesión, bórralo manualmente.

```bash
kubectl --context "$MINIKUBE_PROFILE" run load-generator \
  --rm -it --restart=Never \
  --image=busybox:1.36 \
  -- /bin/sh -c 'while sleep 0.01; do wget -q -O- http://hpa-demo; done'
```

Mientras la carga corre, observa varias lecturas:

```bash
kubectl --context "$MINIKUBE_PROFILE" get hpa hpa-demo --watch
kubectl --context "$MINIKUBE_PROFILE" get deployment hpa-demo
kubectl --context "$MINIKUBE_PROFILE" get pods -l app=hpa-demo
```

La comprobación es que el HPA deje de mostrar `unknown` y que `REPLICAS` pueda subir por encima de 1 hasta el máximo de 5 si la carga y las métricas alcanzan el objetivo. Después de interrumpir el generador, espera la ventana de estabilización y verifica que las réplicas bajen gradualmente. El número exacto y el tiempo dependen del entorno local y del ciclo de métricas; no uses esta prueba para inferir un tiempo de respuesta de EKS.

### 5. Limpia el laboratorio local

Estos comandos eliminan solo los objetos de Kubernetes creados en los pasos anteriores. `minikube delete` también borra el clúster local completo; úsalo si no necesitas conservarlo.

```bash
kubectl --context "$MINIKUBE_PROFILE" delete hpa hpa-demo --ignore-not-found
kubectl --context "$MINIKUBE_PROFILE" delete deployment hpa-demo service hpa-demo --ignore-not-found
kubectl --context "$MINIKUBE_PROFILE" delete pod load-generator --ignore-not-found
minikube stop --profile "$MINIKUBE_PROFILE"
# Para borrar también el clúster local y su disco:
# minikube delete --profile "$MINIKUBE_PROFILE"
```

Esta práctica valida el mecanismo de HPA y sus métricas. No valida EKS Auto Mode, Karpenter, Fargate, IAM, redes AWS, ALB ni los tiempos de arranque de ECS. Esas diferencias son precisamente la razón para medir cada capa por separado.

## Recursos, comunidad y eventos para continuar

La documentación primaria es la referencia para límites y comportamiento vigente:

- [Escalado automático de servicios ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html) explica target tracking, step scaling, programado, cooldown y el comportamiento de `min-capacity 0`.
- [Target tracking para ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-targettracking.html) detalla métricas, alarmas administradas, datos insuficientes y varias políticas.
- La referencia de la CLI para [`put-scaling-policy`](https://docs.aws.amazon.com/cli/latest/reference/application-autoscaling/put-scaling-policy.html) muestra la forma exacta del JSON target tracking usado en el ejemplo.
- [Cluster auto scaling de ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cluster-auto-scaling.html) separa capacity providers e instancias EC2 del conteo de tareas.
- [HPA en Amazon EKS](https://docs.aws.amazon.com/eks/latest/userguide/horizontal-pod-autoscaler.html) muestra el requisito de Metrics Server y el flujo de verificación.
- [HPA en Kubernetes](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/) documenta requests, métricas múltiples, estabilización y escala a cero.
- [Escalado de cómputo en EKS](https://docs.aws.amazon.com/eks/latest/userguide/autoscaling.html) compara EKS Auto Mode, Karpenter y Cluster Autoscaler.

Para ver ejemplos comunitarios en español, el [demo de ECS Fargate con Flask y DynamoDB de Roxs](https://github.com/roxsross/roxs-aws-ecs-demo) incluye un modo local con Docker Compose y DynamoDB Local; su ruta de Terraform sí crea recursos AWS y requiere revisar cargos y destrucción. El [laboratorio de EKS Auto Mode con Terraform](https://github.com/roxsross/roxs-eks-auto-mode) ayuda a estudiar NodePools, pero su `terraform apply` crea recursos AWS y no es una práctica sin cuenta. Lee los README y fija versiones antes de usarlos.

Como apoyo audiovisual, [Karpenter es una solución de administración de nodos de Kubernetes incubada en AWS Labs](https://www.youtube.com/watch?v=MKy_BvhJkHI), del canal AWS Women Colombia, sirve para separar el escalado de nodos del HPA. El video [Bootcamp DevOps | EKS Auto Mode & Hybrid Nodes: El Crossover Definitivo de Containers](https://www.youtube.com/watch?v=eCpzplnwYaY), del canal 295Devops, muestra Auto Mode y nodos híbridos; úsalo como complemento y confirma la documentación actual antes de aplicar Terraform. Para ECS, [Encuentro 13: Amazon ECS con Terraform y GitHub Actions | Flask + Fargate + DynamoDB](https://www.youtube.com/watch?v=Ivtza36jJxA), también de 295Devops, conecta despliegue y operación de una aplicación Fargate; no es una medición de rendimiento ni de costos.

Si estás estudiando fundamentos para una certificación, [Practitioner, Una Nueva Esperanza: AWS Autoscaling y ELB](https://www.youtube.com/watch?v=-JUcihjxloU), de AWS Women Colombia, conecta Auto Scaling y balanceadores. Es material introductorio de certificación y no una guía específica de ECS o EKS; úsalo después de esta separación de capas y contrasta sus nombres con la documentación vigente.

Puedes seguir conversaciones y actividades en el [AWS User Group Ciudad de México](https://awsugcdmx.com/), cuya comunidad publica encuentros de arquitectura, contenedores, seguridad y FinOps. Si estás en Córdoba, la agenda revisada el 6 de octubre de 2026 mostraba [AWS Gaming Lab: ECS, CI/CD y la magia de Terraform](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/) para el 10 de octubre de 2026 en UTN Facultad Regional Córdoba. La actividad se centra en ECS y Terraform, no sustituye una prueba de escalado; verifica horario, cupos y cambios en Meetup. Para otras fechas, consulta la [agenda de eventos de comunidades AWS](/eventos/).

## Preguntas frecuentes

### ¿ECS Service Auto Scaling escala instancias EC2?

No. Cambia el número deseado de tareas del servicio. Si las tareas no caben en un clúster ECS sobre EC2, necesitas capacidad suficiente y un capacity provider con managed scaling, o administrar esa capacidad por separado. En Fargate no administras instancias EC2, pero sí la cantidad de tareas.

### ¿HPA y Karpenter hacen lo mismo?

No. HPA modifica las réplicas de un workload de Kubernetes. Karpenter aprovisiona capacidad de nodos según los pods que no caben y sus requisitos. EKS Auto Mode integra gestión de cómputo basada en Karpenter; Cluster Autoscaler trabaja con Auto Scaling groups. Son controles de capas diferentes.

### ¿Debo escalar por CPU o por memoria?

Usa la métrica que se relacione con el límite de tu carga y valida el resultado con latencia, errores, reinicios y backlog. CPU baja no demuestra que una API tenga capacidad; una cola, el I/O o una dependencia pueden ser el cuello de botella. En HPA, la utilización de CPU depende de `resources.requests`.

### ¿Puedo escalar un servicio ECS a cero?

Sí, con un mínimo de cero y una métrica que entregue demanda. Target tracking necesita observar un dato de demanda para iniciar desde capacidad cero y puede tardar en recuperar una API interactiva. Revisa también los cargos de recursos que no desaparecen al detener las tareas.

### ¿Puedo usar HPA con EKS Fargate?

HPA puede cambiar el número de pods, siempre que las nuevas réplicas coincidan con un perfil de Fargate y puedan iniciar con la red, imagen y permisos disponibles. Fargate elimina la operación de nodos EC2; no elimina la configuración de HPA ni garantiza capacidad, latencia o costo.

### ¿Cómo sé si el autoscaler funciona?

Verifica primero que la métrica tenga datos; después observa la recomendación, las réplicas deseadas y las realmente ejecutándose, los eventos de colocación y la salud de la aplicación. Repite la prueba con carga representativa y registra latencia, errores, tiempo de arranque y costo. Un contador de réplicas por sí solo no demuestra que el servicio pueda atender la demanda.
