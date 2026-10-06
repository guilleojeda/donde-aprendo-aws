---
title: "AWS Elastic Beanstalk: qué es, cómo desplegar y cuánto cuesta"
description: "Aprende qué es Elastic Beanstalk, compara Standard y Cluster, despliega una app Docker y revisa IAM, RDS, salud, costos y limpieza."
author: "guille-ojeda"
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T02:00:11.488Z"
modifiedTimestamp: "2026-10-06T15:38:25-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cómo desplegar contenedores en AWS: elige entre ECS, EKS y Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/"
  - title: "Alta disponibilidad en AWS: arquitectura Multi-AZ para una app web"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/"
  - title: "Amazon RDS o Aurora: cómo elegir una base de datos relacional en AWS"
    url: "https://dondeaprendoaws.com/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/"
  - title: "Fundamentos de AWS para principiantes: servicios, IAM y regiones"
    url: "https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/"
---

Si tienes una aplicación web y quieres desplegarla en AWS sin diseñar desde cero cada grupo de Auto Scaling, balanceador y actualización de plataforma, **AWS Elastic Beanstalk** puede ser un punto de entrada práctico. Subes un paquete de código o una imagen y el servicio crea un entorno con los recursos necesarios para ejecutarlo.

Esa comodidad tiene un límite importante: Elastic Beanstalk no es una aplicación sin servidores ni una cuenta gratuita. En su modo Standard ejecuta tu aplicación en Amazon EC2 y puede configurar Elastic Load Balancing, Auto Scaling, monitoreo y otros recursos en tu cuenta. Tú sigues siendo responsable del código, los datos, la red, los permisos, los secretos, la capacidad elegida y la respuesta a los fallos. La [documentación oficial de AWS en español](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/Welcome.html) describe el flujo y las plataformas actuales.

## Qué es Elastic Beanstalk

Elastic Beanstalk organiza tres conceptos:

- Una **aplicación** agrupa el código y sus versiones.
- Una **versión de aplicación** es un paquete de código o una imagen que puedes desplegar.
- Un **entorno** es el conjunto de recursos que ejecuta una versión en una Región y con una configuración concreta.

El flujo normal es crear la aplicación, cargar una versión, elegir una plataforma y crear un entorno. Después puedes desplegar otra versión, cambiar la capacidad, consultar eventos y recuperar logs desde la consola, la AWS CLI o la [CLI de EB](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/eb-cli3.html). También puedes definir la configuración con CloudFormation o Terraform.

AWS ofrece dos modos que conviene distinguir:

| Modo | Dónde se ejecuta la aplicación | Cuándo evaluarlo |
| --- | --- | --- |
| **Beanstalk Standard** | En una o más instancias EC2 con una plataforma administrada o Docker. | Una aplicación web o worker que necesita una ruta guiada para desplegar sobre EC2. |
| **Beanstalk Cluster** | En réplicas de contenedores sobre un clúster de Amazon EKS operado por Elastic Beanstalk. | Varias aplicaciones contenerizadas que necesitan un modelo de réplicas y despliegues sobre EKS. Revisa su red, roles, observabilidad y costos por separado. |

La mayoría de tutoriales históricos se refieren a Standard. Este artículo usa ese modo para que el tutorial Docker sea pequeño y comprobable. Cluster no es un simple cambio de nombre de una instancia: utiliza otra arquitectura y otras opciones de configuración.

La documentación localizada todavía concentra el recorrido Standard; para la descripción vigente de Cluster y sus réplicas, consulta también la [guía actual en inglés](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/Welcome.html) y la [configuración de escalado de Cluster](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/configuring-cluster-scaling.html).

## Elige el tipo de entorno

En Standard puedes crear un entorno de servidor web, worker o una configuración con una sola instancia o con balanceo y escalado.

| Tipo | Recursos y comportamiento | Uso razonable |
| --- | --- | --- |
| **Una sola instancia** | Una instancia EC2, sin balanceador y con capacidad mínima, máxima y deseada igual a 1. | Desarrollo, pruebas, staging o producción de tráfico bajo donde aceptas un punto único de fallo. No escala horizontalmente ni es una configuración de alta disponibilidad. |
| **Balanceado y escalable** | Elastic Load Balancing delante de un grupo EC2 Auto Scaling. Puedes definir mínimos y máximos, y distribuir las instancias en varias zonas de disponibilidad. | Una aplicación web que necesita repartir tráfico y reponer o agregar instancias. Debes elegir las subredes, la capacidad mínima y las reglas de salud. |
| **Worker** | Un grupo Auto Scaling y una cola Amazon SQS. Un daemon lee mensajes y entrega tareas a la aplicación; no hay balanceador de entrada para usuarios. | Procesamiento asíncrono o largo, como imágenes, correos o archivos. La plataforma .NET en Windows Server no admite el worker tier. |

Un entorno balanceado **no activa alta disponibilidad completa por el solo hecho de seleccionarlo**. Para tolerar la pérdida de una zona necesitas subredes en zonas distintas, capacidad suficiente, una aplicación que no dependa del estado local y dependencias que también tengan una estrategia de recuperación. El [tipo de entorno](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/using-features-managing-env-types.html) explica qué crea cada opción.

## Plataformas y Docker actuales

Las plataformas administradas incluyen Go, Java, .NET, Node.js, PHP, Python y Ruby, además de Docker. Las ramas y versiones disponibles cambian por Región; consulta la [lista vigente de plataformas](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/concepts.platforms.html) o ejecuta `eb platform list` antes de fijar una versión en automatización.

Para Docker Standard, AWS documenta ramas que ejecutan Docker sobre Amazon Linux 2 y Amazon Linux 2023. La rama antigua basada en Amazon Linux AMI (AL1) está retirada. En un despliegue Docker puedes proporcionar un `Dockerfile`, una configuración Docker Compose o un `Dockerrun.aws.json` según el caso; no mezcles instrucciones de una rama retirada con una plataforma actual. La [guía de Docker de Elastic Beanstalk](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/docker-platform.html) explica la diferencia.

## Elastic Beanstalk frente a EC2, ECS, EKS y Lambda

Elastic Beanstalk es una capa de despliegue y operación sobre varios recursos. La elección depende de cuánto control y cuánta abstracción necesitas:

| Opción | Qué administra AWS | Qué sigue siendo tu responsabilidad | Elige esta ruta cuando… |
| --- | --- | --- | --- |
| **Elastic Beanstalk Standard** | El flujo de versiones, la plataforma, el aprovisionamiento del entorno, la integración con EC2, balanceo, Auto Scaling y salud según tu configuración. | Código, dependencias, configuración, IAM, VPC, datos, capacidad, logs y decisiones de despliegue. | Quieres una experiencia guiada para una aplicación web o worker que corre en EC2. |
| **Amazon EC2** | La máquina virtual y la infraestructura física subyacente. | Sistema operativo, parches, runtime, despliegue, escalado, balanceo y casi toda la operación. | Necesitas control del host o una configuración que no encaja en una plataforma de Beanstalk. |
| **Amazon ECS con Fargate** | El plano de control de ECS y la capacidad de ejecución de Fargate. | Imagen, tarea, servicio, red, roles, salud, escalado y observabilidad. | Quieres una aplicación contenerizada con una definición explícita de tareas y servicios, sin operar instancias EC2. |
| **Amazon EKS** | El plano de control de Kubernetes; el modo de nodos elegido determina quién gestiona la capacidad. | Kubernetes, manifiestos, imágenes, red, permisos, nodos o su configuración y operación. | Tu equipo necesita la API y el ecosistema Kubernetes. |
| **AWS Lambda** | Servidores y escalado de la función durante sus invocaciones. | Código, eventos, permisos, límites, estado externo y observabilidad. | La unidad de trabajo es una función activada por eventos y su modelo de ejecución encaja mejor que un servidor web persistente. |

Fargate es capacidad de cómputo, no un orquestador: suele acompañar a ECS o EKS. Para comparar opciones de contenedores, continúa con [Cómo desplegar contenedores en AWS: ECS, EKS y Fargate](/blog/como-desplegar-contenedores-en-aws/). Para una introducción más amplia a servicios y responsabilidad compartida, consulta [los fundamentos de AWS](/blog/aws-fundamentos-guia-de-inicio-rapido/).

Si necesitas razonar sobre réplicas, tareas, pods y capacidad como capas distintas, [esta guía de escalado automático de contenedores](/blog/guia-completa-de-escalado-automatico-de-contenedores-en-aws/) sirve como continuación. Sus ejemplos son de ECS y EKS; no asumas que sus controles se trasladan uno a uno a un entorno Standard de Beanstalk.

## Despliega una aplicación Docker de prueba

Este ejemplo usa Beanstalk Standard con la rama Docker vigente que la CLI resuelva para tu Región y un entorno de **una sola instancia**. No lo uses como configuración de producción: no tiene balanceador, no es altamente disponible y puede quedar fuera de servicio durante una actualización. No ejecutes los comandos en una cuenta si no tienes claro qué recursos crearás y cómo los eliminarás.

### Requisitos

Necesitas una cuenta y una Región de AWS, permisos para crear la aplicación y el entorno, [AWS CLI configurada](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html), la [EB CLI](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/eb-cli3.html), Docker y un directorio vacío. Para la identidad de la terminal, prefiere IAM Identity Center o credenciales temporales. No pongas claves en el `Dockerfile` ni en el repositorio.

### Crea y comprueba el contenedor en local

Guarda estos dos archivos en un directorio nuevo llamado `beanstalk-demo`:

```python
# server.py
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"Hola desde Elastic Beanstalk\n"
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


port = int(os.environ.get("PORT", "5000"))
HTTPServer(("0.0.0.0", port), Handler).serve_forever()
```

```dockerfile
# Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY server.py .
EXPOSE 5000
CMD ["python", "server.py"]
```

Valida la sintaxis antes de construir la imagen:

```sh
python3 -m py_compile server.py
docker build -t beanstalk-demo .
docker run --rm -d --name beanstalk-demo-local -p 5000:5000 beanstalk-demo
curl --fail http://127.0.0.1:5000/
docker rm -f beanstalk-demo-local
```

La respuesta esperada contiene `Hola desde Elastic Beanstalk`. La [guía rápida oficial de Docker](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/docker-quickstart.html) también pide comprobar `docker info`; aquí no se crea ningún recurso de AWS hasta el siguiente paso.

### Crea el entorno y despliega

Elige una Región en la que la plataforma Docker esté disponible y usa un nombre único para la aplicación y el entorno:

```sh
export AWS_REGION=us-east-2
export APP_NAME=beanstalk-demo
export ENV_NAME=beanstalk-demo-single

eb init -p docker "$APP_NAME" --region "$AWS_REGION"
eb create "$ENV_NAME" --single --region "$AWS_REGION"
eb status "$ENV_NAME"
eb health "$ENV_NAME"
eb open "$ENV_NAME"
```

`eb init -p docker` selecciona la plataforma Docker más reciente que la CLI pueda usar en esa Región. `eb create --single` crea una sola instancia EC2 sin balanceador. El comando puede crear roles de servicio, un perfil de instancia, un bucket de S3 para artefactos, alarmas y otros recursos; los permisos y los cargos dependen de tu cuenta y configuración. Espera a que el entorno alcance un estado listo y comprueba la URL antes de compartirla.

Para publicar una versión posterior desde el mismo directorio:

```sh
eb deploy "$ENV_NAME"
```

Un despliegue no garantiza cero interrupciones. En Standard puedes elegir *all at once*, *rolling*, *rolling with additional batch*, *immutable* o *traffic splitting* según el tipo de entorno y la capacidad adicional que aceptes. Un despliegue blue/green crea otro entorno, lo prueba y cambia sus CNAME; si hay una base de datos acoplada debes revisar su ciclo de vida antes de hacerlo. Lee las [políticas de despliegue](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/using-features.rolling-version-deploy.html) antes de automatizar.

### Limpia el laboratorio

Cuando termines, elimina el entorno de prueba y comprueba los recursos que tu cuenta conserve:

```sh
eb terminate "$ENV_NAME"
```

La terminación elimina los recursos asociados al entorno, pero debes revisar la consola de Elastic Beanstalk, S3, CloudWatch y la facturación. Una base de datos, un snapshot, logs retenidos o recursos creados fuera del entorno pueden seguir generando cargos. No asumas que detener una aplicación equivale a eliminar todo lo que usa.

## IAM en Standard: quién necesita qué permiso

Los errores de permisos suelen mezclarse porque intervienen identidades distintas:

1. El **principal de despliegue** (tu sesión, un rol de CI/CD o la identidad federada) llama a Elastic Beanstalk y necesita permisos para crear o actualizar el entorno y pasar roles autorizados.
2. El **rol de servicio** lo asume Elastic Beanstalk para consultar y gestionar recursos como EC2, Auto Scaling y balanceadores.
3. El **perfil de instancia** entrega permisos a las instancias EC2 para tareas del entorno, como obtener artefactos y publicar logs. En Standard, el código suele recibir credenciales temporales de este perfil cuando llama a otros servicios AWS.
4. Un **rol separado para la aplicación** es opcional: puedes usar `sts:AssumeRole` si necesitas aislar permisos o acceder a otra cuenta, pero no es un cuarto rol obligatorio ni sustituye al perfil de instancia.

La consola o la EB CLI pueden preparar roles predeterminados, pero tu identidad necesita permisos para crear roles vinculados al servicio cuando corresponda y para ejecutar `iam:PassRole` sobre los roles que entrega a Elastic Beanstalk. Usa políticas acotadas y revisa los roles reales en la configuración del entorno; no soluciones un error agregando permisos administradores sin entender qué llamada falla. La [documentación de roles de Elastic Beanstalk](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/concepts-roles.html) detalla esta separación.

### Secretos y variables de entorno

Una variable normal es configuración, no un almacén de secretos. Para credenciales, tokens y claves, usa AWS Secrets Manager o Systems Manager Parameter Store y referencia sus ARN en el espacio de nombres `aws:elasticbeanstalk:application:environmentsecrets`. El perfil de instancia debe poder leer esos valores. Las plataformas compatibles los cargan durante el arranque de la instancia; si un secreto se rota, Elastic Beanstalk no actualiza automáticamente las variables ya cargadas: inicia una actualización o reinicio controlado. Los servicios de secretos mantienen sus propios cargos.

Consulta [cómo obtener secretos y parámetros como variables de entorno](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/AWSHowTo.secrets.env-vars.html) y evita imprimirlos en logs, eventos, errores o respuestas HTTP.

## Salud, logs y errores frecuentes

La salud de Beanstalk combina señales de la aplicación, el sistema operativo, Elastic Load Balancing, Auto Scaling y el último despliegue. Un color `OK` ayuda, pero no sustituye las métricas y pruebas de negocio. Los informes de salud mejorados pueden clasificar errores de solicitudes y mostrar causas; una ruta que devuelve muchos `4xx` puede cambiar el estado según las reglas configuradas, aunque esos códigos sean esperados por el producto.

Investiga en este orden:

1. Abre **Events** y anota el primer evento de error, la versión y el ID de despliegue.
2. Consulta el estado y la salud con `eb status` y `eb health`; revisa la ruta y el puerto que usa el proceso.
3. Recupera logs con `eb logs --all` o desde la pestaña **Logs**. Separa errores de la aplicación, del proxy, de la plataforma y de la configuración.
4. Comprueba IAM, grupos de seguridad, subredes, rutas de salida, variables de entorno y conectividad a dependencias.
5. Si el cambio no es sano, vuelve a desplegar una versión conocida o usa la política de despliegue que corresponda; no ignores el health check para ocultar una regresión.

| Síntoma | Primeras comprobaciones |
| --- | --- |
| El entorno no se crea | Región y plataforma disponibles, rol de servicio, perfil de instancia, `iam:PassRole` y permiso para crear roles vinculados al servicio. |
| El entorno queda `Warning`, `Degraded` o `Severe` | Eventos, health check, puerto de escucha, logs del proceso y errores HTTP; confirma que una instancia nueva puede llegar a sus dependencias. |
| El despliegue falla o queda a medias | Versión desplegada en cada instancia, política y lote, tiempo de espera y health check. Despliega una versión conocida para recuperar el entorno. |
| La aplicación no conecta con la base de datos | Endpoint y puerto, grupos de seguridad y subredes, resolución DNS, credenciales y permisos del rol de la aplicación. |

La [salud mejorada](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/health-enhanced.html) y la [guía de logs](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/using-features.logging.html) explican qué señales recopila Standard. Si una dependencia devuelve `403`, trátalo como un fallo de autorización de esa dependencia: comprueba el rol que usa la aplicación, la política del recurso y la Región antes de cambiar el código o abrir el acceso.

## RDS y el ciclo de vida de los datos

Elastic Beanstalk puede crear una instancia de Amazon RDS acoplada al entorno y exponer sus datos de conexión como propiedades. Es útil para probar una aplicación, pero acopla la vida de la base de datos a la del entorno. Antes de terminar o desacoplarlo, elige explícitamente una política:

- `Delete` termina la instancia.
- `Snapshot` crea un snapshot y termina la instancia; el almacenamiento del snapshot puede cobrarse.
- `Retain` conserva la instancia operativa como RDS externo.

Para producción suele ser más flexible crear RDS fuera de Elastic Beanstalk, gestionar sus copias, Multi-AZ, acceso y secretos por separado, y conectar cada entorno mediante configuración. Así puedes usar varios entornos y desplegar blue/green sin arriesgar que la base desaparezca al terminar el entorno. La [documentación de base de datos de Elastic Beanstalk](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/using-features.managing.db.html) advierte que los cambios de una base acoplada deben hacerse desde la configuración que Beanstalk controla y describe el desacoplamiento.

## Precios: qué recursos se facturan

Elastic Beanstalk no añade un cargo propio. En **Standard** pagas los recursos subyacentes: EC2, EBS, direcciones IPv4 públicas, balanceadores, S3 para artefactos y logs, CloudWatch, transferencia de datos, NAT Gateway si la red lo necesita, RDS y Secrets Manager o Parameter Store según el diseño. Un entorno `--single` evita el balanceador, pero sigue consumiendo una instancia y otros recursos; no es un entorno sin costo. En **Cluster**, además de los recursos de la aplicación, incluye los cargos del clúster EKS y la tarifa de administración de EKS Auto Mode sobre el cómputo EC2, además de los servicios asociados. Consulta [los precios de EKS](https://aws.amazon.com/eks/pricing/) y [EKS Auto Mode](https://docs.aws.amazon.com/eks/latest/userguide/automode.html) antes de comparar modos.

El importe depende de Región, duración, arquitectura, tamaño y cantidad de instancias, almacenamiento, tráfico y retención de logs. Usa la [página de precios de Elastic Beanstalk](https://aws.amazon.com/elasticbeanstalk/pricing/) y la [calculadora de precios de AWS](https://calculator.aws/) en lugar de una cifra fija. Define un presupuesto o alarma de costos antes de probar, y elimina el entorno al acabar.

## Recursos, comunidades y eventos para continuar

La [guía oficial para empezar](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/GettingStarted.html), el [tutorial Docker](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/docker-quickstart.html), la [CLI de EB](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/eb-cli3.html) y las páginas de [plataformas](https://docs.aws.amazon.com/es_es/elasticbeanstalk/latest/dg/concepts.platforms.html) son la referencia para repetir el ejemplo con la versión vigente de tu Región. Para ampliar la comparación de contenedores, el artículo de AWS Builder [Cómo entendí los contenedores en AWS: Docker, ECS y EKS explicados desde cero](https://builder.aws.com/content/33FIp8idcHVslPOeJPdvgUL4wNo/cmo-entend-los-contenedores-en-aws-docker-ecs-y-eks-explicados-desde-cero) conecta los conceptos de imagen, orquestador y capacidad.

Estos materiales comunitarios están relacionados con las decisiones del artículo:

- [Practitioner, Una Nueva Esperanza: AWS Elastic Beanstalk y AWS Lambda](https://www.youtube.com/watch?v=MWM2kQzl8BI), grabación de [AWS Women Colombia](https://awswomencolombia.com/), contrasta Beanstalk y Lambda desde una perspectiva de fundamentos. La comunidad mantiene [grabaciones y calendario](https://awswomencolombia.com/page/eventos) y su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw).
- [Despliega contenedores en Fargate/EC2 con Elastic Beanstalk](https://www.youtube.com/watch?v=8UNiuCrbavI), del canal [Desplegando Cloud](https://www.youtube.com/@marcia_), acompaña el camino Docker. El título mezcla Fargate, EC2 y Beanstalk: la documentación actual sitúa Docker Standard sobre EC2 y Fargate como capacidad de ECS o EKS, así que no lo uses para afirmar que Beanstalk Standard ejecuta Fargate ni que una rama Docker antigua sigue vigente.
- [AWS Elastic Load Balancers y Auto Scaling](https://www.youtube.com/watch?v=b4_OMyQHXgU), sesión del [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) publicada en su [canal](https://www.youtube.com/@awsugbsas), ayuda a entender qué cambia al pasar de una instancia al entorno balanceado.
- Para participar localmente, explora también [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) y el [directorio de comunidades AWS](/comunidades/). Una comunidad puede orientar sobre una plataforma o Región, pero sus comandos y precios deben contrastarse con la documentación oficial vigente.

La agenda consultada el **6 de octubre de 2026** mostraba estas actividades relacionadas. Las horas son las publicadas en sus fichas de inscripción; verifica cupos, sede y condiciones antes de planearlas:

- [Spooky Deploy: despliega como senior, paga como estudiante](/eventos/ecuador/#event-meetup-event-316818671), Ecuador, **16 de octubre de 2026, online, 19:00–21:00 (UTC−05:00)**. [Inscripción original en Meetup](https://www.meetup.com/aws-sbg-at-universidad-laica-eloy-alfaro-de-manabi/events/316818671/).
- [EC2 vs Lambda](/eventos/mexico/#event-meetup-event-315728721), México, **16 de octubre de 2026, online, 16:00–17:00 (UTC−06:00)**; sirve para discutir la frontera entre servidores y funciones. [Inscripción original en Meetup](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/).
- [AWS & Cloud Native Security Night](/eventos/ecuador/#event-meetup-event-316815633), Ecuador, **23 de octubre de 2026, presencial en Guayaquil, 17:00–20:00 (UTC−05:00)**; conecta despliegue de contenedores y seguridad. [Inscripción original en Meetup](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/).
- [Amazon RDS: bases de datos administradas](/eventos/mexico/#event-meetup-event-316823085), México, **29 de octubre de 2026, presencial en Atlixco, 12:00–14:00 (UTC−06:00)**; complementa el apartado de datos acoplados y externos. [Inscripción original en Meetup](https://www.meetup.com/aws-sbg-at-higher-technological-institute-of-atilxco/events/316823085/).

Si una actividad ya pasó, busca otra en la [agenda de eventos AWS](/eventos/) y filtra por tu país o modalidad. Para una ruta práctica más amplia, continúa con [la guía de contenedores](/blog/como-desplegar-contenedores-en-aws/) o con [la arquitectura Multi-AZ para una aplicación web](/blog/arquitecturas-de-alta-disponibilidad-en-aws/).

## Preguntas frecuentes

### ¿Elastic Beanstalk elimina la necesidad de administrar infraestructura?

Reduce el trabajo repetitivo de aprovisionar y desplegar, pero no elimina la infraestructura ni sus decisiones. En Standard hay instancias EC2, red, roles, almacenamiento y logs; en Cluster hay EKS y réplicas. Tú sigues operando la aplicación y sus datos.

### ¿Una sola instancia tiene alta disponibilidad?

No. Tiene un único servidor y no tiene balanceador; sirve para laboratorio o cargas de bajo riesgo. Para tolerar fallos necesitas un diseño balanceado, capacidad en más de una zona y dependencias que también puedan recuperarse.

### ¿Puedo guardar una contraseña en una variable de entorno?

Puedes inyectar un secreto desde Secrets Manager o Parameter Store mediante sus ARN, con permisos del perfil de instancia. No guardes el valor en el repositorio ni supongas que una rotación se propaga a instancias existentes sin reiniciar o actualizar el entorno.

### ¿Cuándo conviene usar ECS o Lambda?

Si quieres definir tareas, servicios e imágenes con más control de contenedores, compara ECS con Fargate. Si tu trabajo responde a eventos y no necesita un proceso web persistente, compara Lambda. La decisión depende de duración, estado, tráfico, red, límites operativos y costo medido; Beanstalk no es automáticamente la opción más barata ni la más disponible.
