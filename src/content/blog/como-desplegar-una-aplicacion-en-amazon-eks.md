---
title: "Cómo desplegar una aplicación en Amazon EKS con kubectl"
description: "Crea un clúster EKS y despliega Nginx con kubectl. Revisa nodos, probes, logs y acceso local con port-forward, y elimina los recursos al terminar."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:18:48.675Z"
modifiedTimestamp: "2026-10-06T11:23:43-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cómo desplegar contenedores en AWS: elige entre ECS, EKS y Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/"
  - title: "Cómo desplegar una aplicación en Amazon ECS con Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-una-aplicacion-en-amazon-ecs/"
---

Amazon EKS te permite usar Kubernetes en AWS, pero el servicio no crea una aplicación por sí solo. En este tutorial crearás un clúster de laboratorio con un grupo de nodos EC2 administrado por EKS, desplegarás Nginx con un <code>Deployment</code> y un <code>Service</code> interno, revisarás sus probes y logs, abrirás una prueba local con <code>kubectl port-forward</code> y eliminarás el clúster.

EKS administra el plano de control de Kubernetes. En este recorrido, el grupo de nodos aporta la capacidad de cómputo y sus instancias EC2 se cobran mientras existan. Si todavía comparas Kubernetes con una alternativa AWS más directa, consulta primero la [guía para elegir servicio de contenedores](/blog/como-desplegar-contenedores-en-aws/) o el [tutorial de ECS con Fargate](/blog/como-desplegar-una-aplicacion-en-amazon-ecs/).

## Antes de crear el clúster

Los comandos usan Bash en macOS o Linux. Necesitas una cuenta de AWS, AWS CLI v2, <code>eksctl</code>, <code>kubectl</code>, <code>curl</code> y permisos para crear recursos de Amazon EKS, VPC, EC2, IAM y AWS CloudFormation. Sigue la guía oficial para [instalar AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) y [instalar <code>eksctl</code>](https://docs.aws.amazon.com/eks/latest/eksctl/installation.html). Usa credenciales temporales mediante IAM Identity Center o un rol federado. La identidad IAM con la que <code>eksctl</code> crea el clúster queda como identidad inicial con acceso a Kubernetes; conserva el mismo perfil para las consultas de AWS y <code>kubectl</code>. Si después usa otra persona o rol, tendrás que conceder acceso por las entradas de acceso de EKS y los permisos de Kubernetes que correspondan.

El archivo de abajo fija el endpoint público de la API a la IPv4 de salida que usarás desde tu equipo. Sustituye <code>203.0.113.10/32</code> por tu IP real, o por el rango de tu VPN u oficina. También habilita acceso privado para que los nodos dentro de la VPC alcancen la API aunque el endpoint público tenga esa restricción. Si tu IP cambia, actualiza la allowlist antes de usar <code>kubectl</code>.

El clúster usará una VPC dedicada creada por <code>eksctl</code>, nodos en subredes públicas y una aplicación de laboratorio, sin NAT Gateway. La salida pública de los nodos permite descargar la imagen de Nginx; esta configuración expone la API solo al rango indicado y no es una arquitectura de producción. No reutilices una VPC en este tutorial: así el comando de eliminación puede limpiar los recursos que creó.

## 1. Crea un clúster y un grupo de nodos administrado

Guarda este archivo como <code>cluster.yaml</code>. No fija una versión antigua de Kubernetes: <code>eksctl</code> elegirá una versión que admita al crear el clúster. El grupo de aprendizaje se limita a una instancia <code>t3.medium</code> para mantener explícito el tamaño de la capacidad; el clúster no tiene alta disponibilidad de la carga con un solo nodo.

<pre><code class="language-yaml">apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: da-eks-container-lab
  region: us-east-1
vpc:
  clusterEndpoints:
    publicAccess: true
    privateAccess: true
  publicAccessCIDRs:
    - "203.0.113.10/32"
  nat:
    gateway: Disable
managedNodeGroups:
  - name: learning-nodes
    instanceType: t3.medium
    desiredCapacity: 1
    minSize: 1
    maxSize: 1
    privateNetworking: false</code></pre>

<code>eksctl</code> crea recursos de VPC y CloudFormation para el clúster. Ejecuta la creación solo con nombres nuevos y revisa el estado hasta que termine. Si editas el nombre o la región del archivo, actualiza también <code>CLUSTER_NAME</code> o <code>AWS_REGION</code> en la terminal:

<pre><code class="language-bash">export AWS_REGION="us-east-1"
CLUSTER_NAME="da-eks-container-lab"
aws sts get-caller-identity --region "$AWS_REGION"
eksctl create cluster -f cluster.yaml</code></pre>

Después de la creación, consulta la versión que eligió el clúster:

<pre><code class="language-bash">aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" --query 'cluster.version' --output text
aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" --query 'cluster.resourcesVpcConfig.[endpointPublicAccess,endpointPrivateAccess,publicAccessCidrs]' --output table</code></pre>

Comprueba la versión cliente con <code>kubectl version --client</code>. Debe estar como máximo una versión menor por encima o por debajo de la versión del plano de control que acabas de consultar; no instales sin comprobar un cliente “latest”. Si hace falta, sigue la guía oficial para [instalar el kubectl compatible con tu versión de EKS](https://docs.aws.amazon.com/eks/latest/userguide/install-kubectl.html). Luego configura el contexto local y comprueba identidad y nodos:

<pre><code class="language-bash">aws eks update-kubeconfig --region "$AWS_REGION" --name "$CLUSTER_NAME"
kubectl config current-context
aws sts get-caller-identity --region "$AWS_REGION"
kubectl get nodes -o wide
kubectl cluster-info</code></pre>

El comando de kubeconfig usa por defecto la misma identidad que muestra <code>aws sts get-caller-identity</code>; consulta la [referencia de <code>aws eks update-kubeconfig</code>](https://docs.aws.amazon.com/cli/latest/reference/eks/update-kubeconfig.html) si trabajas con más de un perfil o rol.

El endpoint público solo acepta conexiones desde el CIDR configurado. Si <code>kubectl</code> informa que no puede conectar, comprueba que la IP de salida actual esté en esa allowlist y que el clúster esté <code>ACTIVE</code>. Si indica <code>Unauthorized</code> o <code>AccessDenied</code>, confirma que AWS CLI usa la misma identidad que creó el clúster. AWS documenta el [acceso inicial del creador y el acceso de otros roles](https://docs.aws.amazon.com/eks/latest/userguide/grant-k8s-access.html) y la [configuración de endpoints públicos y privados](https://docs.aws.amazon.com/eks/latest/userguide/cluster-endpoint.html).

El grupo de nodos administrado hace visible la capacidad EC2 de este ejemplo. La documentación de EKS explica la [arquitectura del servicio](https://docs.aws.amazon.com/eks/latest/userguide/eks-architecture.html) y compara sus [opciones de cómputo y nodos](https://docs.aws.amazon.com/eks/latest/userguide/eks-compute.html). Para delegar más gestión de infraestructura, compara [EKS Auto Mode](https://docs.aws.amazon.com/eks/latest/userguide/automode.html) y su [laboratorio con Terraform](https://github.com/roxsross/roxs-eks-auto-mode). La grabación comunitaria [Episodio II: Karpenter es una solución de administración de nodos de Kubernetes incubada en AWS Labs](https://www.youtube.com/watch?v=MKy_BvhJkHI) muestra otra opción de escalado; contrástala con la documentación vigente antes de elegir. Para provisionar el clúster con infraestructura como código, consulta [la guía de EKS con CloudFormation](https://blog.alfalfita.cloud/automatizando-la-creacion-de-un-cluster-de-eks-con-cloudformation).

## 2. Despliega Nginx con Kubernetes

Guarda el manifiesto siguiente como <code>nginx.yaml</code>. Un <code>Deployment</code> mantiene un pod Nginx, las probes verifican si está vivo y listo para recibir solicitudes, y un <code>Service</code> de tipo <code>ClusterIP</code> lo descubre dentro del clúster. La imagen coincide con nodos Linux <code>X86_64</code>; para una aplicación real fija el digest o una etiqueta inmutable y escanea la imagen.

<pre><code class="language-yaml">apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: public.ecr.aws/docker/library/nginx:stable-alpine
          ports:
            - name: http
              containerPort: 80
              protocol: TCP
          readinessProbe:
            httpGet:
              path: /
              port: http
            periodSeconds: 5
            timeoutSeconds: 2
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 2
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: nginx
spec:
  type: ClusterIP
  selector:
    app: nginx
  ports:
    - name: http
      port: 80
      targetPort: http
      protocol: TCP</code></pre>

Aplica ambos objetos y espera el rollout:

<pre><code class="language-bash">kubectl apply -f nginx.yaml
kubectl rollout status deployment/nginx --timeout=120s
kubectl get deployment,pods,service
kubectl logs deployment/nginx</code></pre>

Para ver otro primer despliegue explicado por una comunidad, mira [Tu primera aplicación en Kubernetes con Amazon EKS](https://www.youtube.com/watch?v=Mxy9xmvBZZs), de AWS User Group CreaTicas. [EKS Fundamentals: desmitificando Kubernetes con AWS](https://www.youtube.com/watch?v=YEY9NbFMQ0Y), publicado por AWS User Group Ecuador, amplía los conceptos.

Comprueba el sitio en tu equipo. Deja este primer comando ejecutándose en una terminal:

<pre><code class="language-bash">kubectl port-forward service/nginx 8080:80</code></pre>

En otra terminal ejecuta <code>curl --fail --show-error http://127.0.0.1:8080/</code>. Este túnel solo comprueba el servicio desde tu equipo: no publica Nginx en Internet. Para exponer una aplicación, diseña aparte un Ingress o balanceador, su controlador e identidad IAM, las reglas de red y el costo de esos recursos. Para explorar despliegues continuos y GitOps en EKS, mira la sesión de AWS Women Colombia [Episodio IX: El ascenso de AWS, Experiencias Cloud - ¿GitOps en AWS? Infra sincronizada para EKS.](https://www.youtube.com/watch?v=3xHKb53ZFcM).

## 3. Diagnostica y limpia el laboratorio

Si el pod permanece en <code>Pending</code>, revisa <code>kubectl describe pod</code> y <code>kubectl get nodes</code> para distinguir falta de capacidad, recursos insuficientes o un nodo no listo. Si ves <code>ImagePullBackOff</code>, revisa el nombre de la imagen y que el nodo tenga salida a Internet. Si el pod se ejecuta pero no está listo, consulta los eventos con <code>kubectl describe pod</code>, los logs y la ruta de la probe.

Al terminar, elimina el servicio y el Deployment y luego elimina el clúster:

<pre><code class="language-bash">kubectl delete -f nginx.yaml
eksctl delete cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" --wait
aws eks list-clusters --region "$AWS_REGION" --query 'clusters' --output table</code></pre>

Espera a que <code>eksctl delete cluster</code> termine. Al crear el clúster, <code>eksctl</code> también creó la VPC dedicada, el grupo administrado, sus recursos de EC2 y grupos de seguridad; la eliminación del clúster limpia esos recursos. No ejecutes comandos de eliminación manual contra VPCs, subredes o grupos que no creó este laboratorio. EKS cobra por el clúster mientras existe, y las instancias EC2, almacenamiento, IPv4 pública y transferencia se cobran aparte. Revisa el [precio vigente de Amazon EKS](https://aws.amazon.com/eks/pricing/) antes de crear recursos; EKS Auto Mode tiene además su propia tarifa de gestión.

## Comunidad y seguridad de contenedores

Si estás en Guayaquil, AWS User Group Security Ecuador y Cloud Native Guayaquil anuncian **AWS & Cloud Native Security Night**, un encuentro presencial sobre la seguridad de Kubernetes y las imágenes de contenedor el **23 de octubre de 2026, de 17:00 a 20:00 (UTC−05:00)** en la Universidad Católica de Santiago de Guayaquil. Consulta la [página del grupo](https://www.meetup.com/aws-user-group-security-ecuador/) para conocer la comunidad y confirmar la [sede e inscripción del evento](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/). La agenda se consultó el 6 de octubre de 2026. También puedes encontrar otros [AWS User Groups y grupos estudiantiles](/comunidades/).

Para seguir aprendiendo fuera de una fecha concreta, explora el [portal de AWS User Group Ecuador](https://www.awsugecuador.com/), el [canal de charlas de CreaTicas](https://www.youtube.com/channel/UCLt3Cav92Ej0t_m3mliLGCQ) y [AWS Women Colombia](https://awswomencolombia.com/). Ofrecen encuentros y grabaciones para ampliar temas y compartir experiencias. La [agenda AWS](/eventos/) reúne próximas actividades; confirma sus requisitos y condiciones en cada ficha.

Esta es la ruta de Kubernetes de la serie. Para volver a comparar plataformas, lee [cómo desplegar contenedores en AWS](/blog/como-desplegar-contenedores-en-aws/) o sigue con el [tutorial de Amazon ECS](/blog/como-desplegar-una-aplicacion-en-amazon-ecs/).
