---
title: "Cómo desplegar una aplicación en Amazon ECS con Fargate"
description: "Despliega Nginx en ECS con Fargate usando AWS CLI: configura red, IAM, logs y salud; comprueba el acceso HTTP y elimina los recursos del laboratorio."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T23:04:00.573Z"
modifiedTimestamp: "2026-10-06T11:23:43-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cómo desplegar contenedores en AWS: elige entre ECS, EKS y Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/"
  - title: "Cómo desplegar una aplicación en Amazon EKS con kubectl"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-una-aplicacion-en-amazon-eks/"
---

En esta guía desplegarás Nginx como una aplicación web de prueba en un servicio de Amazon ECS con AWS Fargate. Crearás un rol de ejecución, configurarás una tarea con logs y health check, la ejecutarás en una subred pública con HTTP permitido solo desde tu dirección IP y comprobarás la página con <code>curl</code>. Al final eliminarás el servicio y los recursos de este laboratorio.

ECS coordina la tarea y el servicio; Fargate aporta la capacidad para ejecutarlos sin que administres instancias EC2. Si aún estás decidiendo entre ECS y Kubernetes, empieza por la [guía de rutas para desplegar contenedores en AWS](/blog/como-desplegar-contenedores-en-aws/). Si necesitas la API y las herramientas de Kubernetes, sigue el [tutorial de Amazon EKS](/blog/como-desplegar-una-aplicacion-en-amazon-eks/).

## Antes de empezar

Los comandos usan Bash en macOS o Linux. Necesitas una cuenta de AWS, [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), <code>curl</code> y permisos para crear un clúster ECS, un servicio Fargate, un security group, un log group y un rol de IAM con su política. La identidad que ejecuta <code>create-service</code> también necesita permiso <code>iam:PassRole</code> para pasar el rol de ejecución a ECS. Inicia sesión con credenciales temporales mediante IAM Identity Center o un rol federado; no crees claves permanentes de usuario para este ejercicio.

Fargate usa el modo de red <code>awsvpc</code> y necesita al menos una subred. En la consola de VPC, elige una subred pública de la misma VPC: su tabla de rutas efectiva —asociada a la subred o, si no tiene asociación explícita, la tabla principal— debe tener una ruta <code>0.0.0.0/0</code> hacia un Internet Gateway. Esta práctica asigna una IP pública a la tarea para que descargue la imagen y puedas abrir la página. En una subred privada, esta imagen pública necesita salida a Internet, por ejemplo mediante NAT. Los endpoints privados pueden servir para otros flujos —incluidas imágenes de ECR privado y servicios auxiliares—, pero no reemplazan la salida a Internet que requiere esta imagen pública. Elige una sola subred para mantener el ejercicio acotado; no representa una configuración de alta disponibilidad.

Obtén tu IPv4 pública y anótala con máscara <code>/32</code>, por ejemplo <code>203.0.113.10/32</code> como formato de muestra. Sustitúyela por tu IP real: el grupo de seguridad solo permitirá HTTP desde ese origen. Si usas una VPN o una red de oficina, utiliza el rango de salida que realmente tendrá tu navegador.

## 1. Define la región y comprueba la red

Usa nombres nuevos para este laboratorio. Si ya existen en tu cuenta, cambia los nombres antes de ejecutar los comandos. En los ejemplos, sustituye los identificadores de VPC y subred y la dirección de origen por los tuyos.

<pre><code class="language-bash">export AWS_REGION="us-east-1"
CLUSTER_NAME="da-ecs-container-lab"
SERVICE_NAME="nginx-demo"
TASK_FAMILY="nginx-demo"
ROLE_NAME="daEcsTaskExecutionLab"
LOG_GROUP="/ecs/da-ecs-container-lab/nginx"
SECURITY_GROUP_NAME="da-ecs-nginx-lab"
VPC_ID="vpc-REEMPLAZAR"
SUBNET_ID="subnet-REEMPLAZAR"
READER_CIDR="203.0.113.10/32"
aws sts get-caller-identity --region "$AWS_REGION"
aws ec2 describe-subnets --subnet-ids "$SUBNET_ID" --query 'Subnets[0].[VpcId,AvailabilityZone,MapPublicIpOnLaunch]' --output table --region "$AWS_REGION"</code></pre>

Confirma que la salida de la subred corresponde a <code>VPC_ID</code> y revisa en la consola la ruta efectiva al Internet Gateway antes de continuar. No uses una subred privada sin configurar primero la salida de red que requiere la tarea.

## 2. Crea el rol de ejecución y los recursos del laboratorio

El rol de ejecución permite que el agente de ECS descargue imágenes privadas de ECR y envíe logs a CloudWatch. Esta aplicación Nginx no llama APIs de AWS, así que no necesita un rol de tarea. El rol de ejecución y el rol de tarea cumplen funciones distintas.

Crea un rol nuevo con confianza para las tareas de ECS y la política administrada de ejecución. Si el nombre ya existe, elige otro nombre; no cambies ni elimines un rol compartido.

<pre><code class="language-json">{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}</code></pre>

Guarda ese contenido como <code>ecs-task-execution-trust.json</code> y crea el rol. Luego crea el grupo de logs, el clúster ECS y un grupo de seguridad nuevo con una única regla de entrada:

<pre><code class="language-bash">aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document file://ecs-task-execution-trust.json
aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
EXECUTION_ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)"
aws logs create-log-group --log-group-name "$LOG_GROUP" --region "$AWS_REGION"
aws ecs create-cluster --cluster-name "$CLUSTER_NAME" --region "$AWS_REGION"
SECURITY_GROUP_ID="$(aws ec2 create-security-group --group-name "$SECURITY_GROUP_NAME" --description "$SECURITY_GROUP_NAME" --vpc-id "$VPC_ID" --query 'GroupId' --output text --region "$AWS_REGION")"
aws ec2 authorize-security-group-ingress --group-id "$SECURITY_GROUP_ID" --protocol tcp --port 80 --cidr "$READER_CIDR" --region "$AWS_REGION"</code></pre>

El grupo de seguridad conserva la salida predeterminada para que la tarea pueda obtener la imagen y enviar logs. No agregues SSH ni abras el puerto 80 a <code>0.0.0.0/0</code>. El rol administrado permite crear flujos de logs; el grupo se crea por separado porque el tutorial no habilita la creación automática de grupos desde la tarea.

## 3. Registra la definición de tarea

La definición usa una imagen pública de Nginx desde Amazon ECR Public, una tarea Fargate Linux <code>X86_64</code> de 0,25 vCPU y 512 MiB, <code>awsvpc</code>, CloudWatch Logs y un health check. El binario <code>wget</code> está disponible en la imagen Alpine elegida y la comprobación consulta Nginx por loopback. Para una aplicación real, fija una versión inmutable o un digest y escanea la imagen; la etiqueta <code>stable-alpine</code> puede cambiar.

Guarda el JSON como <code>ecs-task-definition-template.json</code>. Los cuatro marcadores se reemplazan con la familia, el ARN, el grupo de logs y la región definidos u obtenidos arriba:

<pre><code class="language-json">{
  "family": "TASK_FAMILY",
  "executionRoleArn": "EXECUTION_ROLE_ARN",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "runtimePlatform": {
    "operatingSystemFamily": "LINUX",
    "cpuArchitecture": "X86_64"
  },
  "containerDefinitions": [
    {
      "name": "nginx",
      "image": "public.ecr.aws/docker/library/nginx:stable-alpine",
      "essential": true,
      "portMappings": [
        { "containerPort": 80, "protocol": "tcp" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1/ || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 20
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "LOG_GROUP",
          "awslogs-region": "AWS_REGION",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}</code></pre>

Genera el archivo que registrará ECS y revisa que los marcadores ya no aparezcan:

<pre><code class="language-bash">sed -e "s|TASK_FAMILY|$TASK_FAMILY|g" -e "s|EXECUTION_ROLE_ARN|$EXECUTION_ROLE_ARN|g" -e "s|LOG_GROUP|$LOG_GROUP|g" -e "s|AWS_REGION|$AWS_REGION|g" ecs-task-definition-template.json &gt; ecs-task-definition.json
grep -E 'TASK_FAMILY|EXECUTION_ROLE_ARN|LOG_GROUP|AWS_REGION' ecs-task-definition.json</code></pre>

El último comando no debe imprimir resultados. Registra la definición:

<pre><code class="language-bash">TASK_DEFINITION_ARN="$(aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json --query 'taskDefinition.taskDefinitionArn' --output text --region "$AWS_REGION")"
printf '%s\n' "$TASK_DEFINITION_ARN"</code></pre>

Si tu imagen está en un repositorio privado de ECR, cambia la URI y conserva el rol de ejecución con los permisos de pull. En una subred sin salida a Internet, puedes planificar endpoints privados para ECR y los servicios auxiliares que uses, incluida la transferencia de capas a S3 y CloudWatch Logs. Confirma las dependencias de la imagen y de la tarea con la [guía de endpoints de VPC para ECR](https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html).

## 4. Crea y espera el servicio Fargate

El servicio mantiene una tarea activa. La IP pública permite una prueba HTTP directa, pero el security group la limita a <code>READER_CIDR</code>. No se crea un balanceador de carga.

<pre><code class="language-bash">aws ecs create-service --cluster "$CLUSTER_NAME" --service-name "$SERVICE_NAME" --task-definition "$TASK_DEFINITION_ARN" --desired-count 1 --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SECURITY_GROUP_ID],assignPublicIp=ENABLED}" --region "$AWS_REGION"
aws ecs wait services-stable --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION"
aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --query 'services[0].[status,desiredCount,runningCount,events[0].message]' --output table --region "$AWS_REGION"</code></pre>

Cuando el servicio muestre una tarea en ejecución, obtén su interfaz de red, consulta su dirección IPv4 pública y abre la página:

<pre><code class="language-bash">TASK_ARN="$(aws ecs list-tasks --cluster "$CLUSTER_NAME" --service-name "$SERVICE_NAME" --query 'taskArns[0]' --output text --region "$AWS_REGION")"
ENI_ID="$(aws ecs describe-tasks --cluster "$CLUSTER_NAME" --tasks "$TASK_ARN" --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value | [0]' --output text --region "$AWS_REGION")"
PUBLIC_IP="$(aws ec2 describe-network-interfaces --network-interface-ids "$ENI_ID" --query 'NetworkInterfaces[0].Association.PublicIp' --output text --region "$AWS_REGION")"
curl --fail --show-error "http://$PUBLIC_IP/"</code></pre>

Si <code>curl</code> no conecta, confirma que tu salida a Internet todavía coincide con <code>READER_CIDR</code>, que el servicio está estable y que la subred tiene ruta al Internet Gateway. En un laboratorio, una IP pública puede generar cargos. Para ver eventos y logs:

<pre><code class="language-bash">aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --query 'services[0].events[0:5].[createdAt,message]' --output table --region "$AWS_REGION"
aws logs tail "$LOG_GROUP" --since 10m --region "$AWS_REGION"</code></pre>

<code>CannotPullContainerError</code> suele apuntar a la URI de imagen, a la salida de red o, si la imagen es privada, a permisos de pull del rol de ejecución. Si una tarea se detiene, revisa <code>stoppedReason</code> en <code>aws ecs describe-tasks</code> y los eventos del servicio. Un health check fallido puede indicar que la aplicación no escucha en el puerto configurado o que el comando de prueba no existe en la imagen.

Para pasar de Nginx a una aplicación con datos, revisa la [demo ECS Fargate con Flask y DynamoDB](https://github.com/roxsross/roxs-aws-ecs-demo) y el [video comunitario de ECS, Flask y DynamoDB](https://www.youtube.com/watch?v=Ivtza36jJxA). La [guía de capacidad y escalado de DynamoDB](/blog/como-escala-dynamodb-modos-on-demand-y-provisioned/) ayuda a estimar el tráfico de esa base de datos.

Para extender el ejemplo hacia una aplicación propia, revisa el [pipeline de despliegue de contenedores con GitHub, ECR y ECS Fargate](https://github.com/JonasCC8/AWS-Container-Deployment-with-GitHub-Integration). Si tu backend necesita persistencia, la referencia de [ECS Fargate con RDS y balanceo](https://www.alfredo-dominguez.dev/arquitecturas/02-scalable-backend/) muestra una arquitectura más amplia. Para un frontend server-side de Next.js, esta [arquitectura en ECS Fargate](https://dcastillogi.com/arquitecturas/despliegue-nextjs-ecs-fargate) combina CloudFront, S3, ALB, Aurora y GitHub Actions; es más infraestructura de la que requiere una web estática.

## 5. Elimina lo creado

Detén la tarea antes de retirar los recursos. Espera a que el servicio tenga cero tareas activas y luego elimínalo. Después elimina el clúster, desregistra la revisión de tarea y elimina el grupo de logs, el grupo de seguridad y el rol que creaste aquí:

<pre><code class="language-bash">aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" --desired-count 0 --region "$AWS_REGION"
aws ecs wait services-stable --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION"
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" --region "$AWS_REGION"
aws ecs wait services-inactive --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION"
aws ecs delete-cluster --cluster "$CLUSTER_NAME" --region "$AWS_REGION"
aws ecs deregister-task-definition --task-definition "$TASK_DEFINITION_ARN" --region "$AWS_REGION"
aws logs delete-log-group --log-group-name "$LOG_GROUP" --region "$AWS_REGION"</code></pre>

Cuando la interfaz de red de la tarea ya no exista, elimina el grupo de seguridad y el rol de ejecución de este tutorial:

<pre><code class="language-bash">aws ec2 delete-security-group --group-id "$SECURITY_GROUP_ID" --region "$AWS_REGION"
aws iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam delete-role --role-name "$ROLE_NAME"</code></pre>

No elimines la VPC ni la subred: este recorrido las reutiliza. Si usaste un rol preexistente en lugar del creado aquí, no ejecutes los comandos de IAM sobre ese rol. Fargate cobra por los recursos de la tarea desde que empieza a descargar su imagen hasta que termina, con un mínimo de un minuto; IPv4 pública, transferencia y logs pueden sumar otros cargos. Revisa la [tarifa vigente de ECS y Fargate](https://aws.amazon.com/ecs/pricing/) y confirma que el servicio figure como inactivo y que los recursos creados se hayan eliminado.

## Para seguir practicando

- La documentación oficial recorre una [tarea Fargate desde AWS CLI](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ECS_AWSCLI_Fargate.html) y explica la [red de tareas Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html), los [roles de IAM](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-iam-roles.html), los [health checks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/healthcheck.html) y los [logs con awslogs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html).
- Para aprender infraestructura como código, continúa con el [workshop de Amazon ECS con Terraform](https://github.com/roxsross/workshop-ecs). Para explorar despliegues canary y reversión, prueba [ECS Canary in Action](https://github.com/roxsross/aws-ecs-canary-in-action).
- La [AWS Student Builder Group de la UTN Facultad Regional Córdoba](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/) organiza **AWS Gaming Lab: ECS, CI/CD y la magia de Terraform**, un encuentro presencial en UTN FRC el **10 de octubre de 2026, de 12:00 a 14:00 (UTC−03:00)**. Consulta allí la sede, disponibilidad e inscripción antes de asistir: [página del evento](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/). La agenda se consultó el 6 de octubre de 2026.

Para conversar sobre tu despliegue, puedes participar en [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) o [AWS User Group Panamá](https://www.meetup.com/AWS-User-Group-Panama/), comunidades generales para aprender y compartir experiencias. Encuentra otros grupos en el [directorio de comunidades](/comunidades/) y próximas actividades en la [agenda AWS](/eventos/). Confirma las condiciones de cada encuentro en su ficha.

La siguiente ruta de esta serie es [desplegar una aplicación en Amazon EKS](/blog/como-desplegar-una-aplicacion-en-amazon-eks/) si quieres practicar Kubernetes, o volver a la [guía para elegir servicio de contenedores](/blog/como-desplegar-contenedores-en-aws/).
