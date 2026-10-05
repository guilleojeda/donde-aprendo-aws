---
title: "AWS OpsWorks Stacks: flujo histórico de despliegue con Chef y cómo reemplazarlo"
description: "Revisa cómo se relacionaban stacks, capas, instancias EC2 y eventos de Chef en AWS OpsWorks Stacks, ya retirado, y qué servicios actuales cubren cada parte."
author: "guille-ojeda"
publishedAt: "2024-05-10"
publishedTimestamp: "2024-05-10T07:15:01.296Z"
modifiedTimestamp: "2026-10-05T13:23:09-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS OpsWorks retirado: alternativas para Chef y Puppet"
    url: "https://dondeaprendoaws.com/blog/aws-opsworks-para-chef-y-puppet-preguntas-frecuentes/"
  - title: "Seguridad de IaC en AWS: 9 controles para Terraform y CloudFormation"
    url: "https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/"

---

AWS OpsWorks Stacks ya está retirado. Este artículo reconstruye su flujo histórico para que puedas reconocer qué hacían las stacks, las capas y las recetas de Chef; no es una guía para crear o administrar una stack nueva. Para comprobar el estado de Stacks, Chef Automate y Puppet Enterprise y las alternativas para cada variante, consulta las [preguntas frecuentes sobre el cierre de OpsWorks](/blog/aws-opsworks-para-chef-y-puppet-preguntas-frecuentes/).

## Cómo se organizaba AWS OpsWorks Stacks

OpsWorks Stacks agrupaba recursos de una aplicación y asociaba recetas de Chef con instancias EC2. Los nombres se parecen a conceptos de otros servicios, pero este modelo pertenecía a OpsWorks:

| Elemento histórico | Función dentro de OpsWorks Stacks |
|---|---|
| Stack | Contenedor lógico para recursos relacionados y valores comunes, como región y sistema operativo. |
| Layer (capa) | Grupo de instancias con una función, por ejemplo servir una aplicación o alojar una base de datos. Las recetas configuraban paquetes, servicios y despliegues de esa función. |
| Instance (instancia) | Recurso de cómputo, normalmente una instancia EC2, asociado a una o más capas. El agente de OpsWorks ejecutaba sus recetas en respuesta a eventos. |
| App (aplicación) | Referencia al tipo de aplicación y a su repositorio, con los datos necesarios para distribuirla en las instancias objetivo. |
| Cookbook y recipe | Código de Chef que instalaba o configuraba software y realizaba tareas del ciclo de vida. Una recipe podía asignarse a una capa y a uno o más eventos. |

El [anuncio original de OpsWorks de AWS](https://aws.amazon.com/blogs/aws/aws-opsworks-flexible-application-management-in-the-cloud/), de 2013, muestra la relación entre stacks, capas, aplicaciones e instancias. Sus pantallas y procedimientos pertenecen al servicio retirado; sirven para interpretar una arquitectura antigua.

## Qué ocurría durante el ciclo de vida

Una capa podía asignar recetas distintas a estos cinco eventos:

| Evento de OpsWorks | Cuándo se ejecutaba | Ejemplo de responsabilidad |
|---|---|---|
| Setup | Después de que una instancia nueva terminara de iniciar. | Instalar y configurar el servidor web. |
| Configure | Cuando una instancia entraba o salía del estado en línea; las recetas se ejecutaban en las instancias del stack. | Actualizar la configuración del balanceador para reconocer una instancia nueva. |
| Deploy | Al desplegar una aplicación. | Obtener los archivos de la aplicación y reiniciar un proceso relacionado. |
| Undeploy | Al retirar una aplicación de las instancias. | Quitar la versión desplegada o limpiar sus archivos. |
| Shutdown | Al detener una instancia. | Ejecutar tareas previstas antes de apagarla. |

AWS documentó cómo [asignar recetas a los cinco eventos del ciclo de vida](https://aws.amazon.com/blogs/devops/using-opsworks-to-configure-ec2-instances/) y cómo [Configure reaccionaba a cambios en las instancias](https://aws.amazon.com/blogs/devops/quickly-explore-the-chef-environment-in-aws-opsworks/). Son publicaciones históricas de 2014 y 2016. El contenido de las recetas dependía de cada organización: OpsWorks coordinaba eventos y capas, mientras que el cookbook definía muchas de las acciones.

## Cómo reemplazar el flujo sin buscar una copia exacta

AWS no ofrece un nuevo OpsWorks Stacks. Conviene separar el resultado que antes concentraba el servicio y asignar cada parte a una herramienta vigente:

| Necesidad que cubría el flujo antiguo | Opción actual posible | Límite que conviene considerar |
|---|---|---|
| Declarar los recursos de infraestructura | CloudFormation u otra herramienta de IaC. | Las plantillas describen recursos; no convierten automáticamente las recetas de Chef en configuración declarativa. |
| Definir la configuración de lanzamiento y mantener capacidad EC2 | Plantilla de lanzamiento y grupo de Amazon EC2 Auto Scaling. | Debes decidir capacidad, políticas, redes, almacenamiento y cómo probar cambios; no hay una capa de OpsWorks que se transforme sola en un grupo. |
| Ejecutar recetas Chef en hosts Linux | Systems Manager State Manager con el documento <code>AWS-ApplyChefRecipes</code>. | Requiere nodos Linux administrados por Systems Manager; AWS declara que no es compatible con macOS. Su rango 11–18 no incluye el LTS actual de Chef, 19.x, así que no se recomienda como base de un entorno nuevo que requiera una versión mantenida. Las recetas deben ser compatibles y no necesitar Chef Server. No reemplaza toda la plataforma Chef Automate. |
| Publicar una revisión de la aplicación en EC2 | AWS CodeDeploy para despliegues en EC2. | CodeDeploy maneja la revisión de la aplicación; no reproduce automáticamente las recetas de Setup, Configure, Undeploy o Shutdown. |
| Revisar y administrar stacks de CloudFormation | Systems Manager Application Manager. | Gestiona stacks de CloudFormation; no restaura la consola ni el ciclo de vida de OpsWorks. |

Las fuentes actuales para evaluar estas piezas son la documentación de [Application Manager y CloudFormation](https://docs.aws.amazon.com/systems-manager/latest/userguide/application-manager-working-stacks-overview.html), las [plantillas de lanzamiento de EC2 Auto Scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/launch-templates.html), las [asociaciones de State Manager que ejecutan recetas Chef](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-state-manager-chef.html) y la [descripción de CodeDeploy](https://docs.aws.amazon.com/codedeploy/latest/userguide/welcome.html). Cada fuente define su propio alcance y requisitos.

El rango de Chef 11 a 18 que aparece en AWS describe la integración que documenta AWS, no cuáles conviene usar hoy. La [tabla de versiones de Chef](https://docs.chef.io/versions/) marca Chef Infra Client 19.x como LTS, 18.x como obsoleto y las versiones anteriores a 18 como EOL. Como AWS-ApplyChefRecipes no incluye el LTS 19.x, no se recomienda como base para un entorno nuevo que requiera un cliente mantenido. Comprueba también las [plataformas compatibles de Chef](https://docs.chef.io/platforms/): la compatibilidad de una recipe depende tanto del cliente como del sistema operativo.

Antes de reconstruir el entorno, inventaría los recursos que aún existen en EC2 y otros servicios, los archivos de configuración y cookbooks conservados, las fuentes de aplicación y las dependencias externas. Después decide cuáles acciones de cada receta siguen haciendo falta y en qué momento deben correr. Una nueva plantilla o pipeline debe revisarse con el alcance y los permisos correspondientes; esta guía de [controles para IaC en Terraform y CloudFormation](/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/) ayuda a revisar ese tipo de cambios.

AWS publicó en 2023 una [guía de migración de OpsWorks Stacks a Systems Manager](https://aws.amazon.com/blogs/mt/migrate-your-aws-opsworks-stacks-to-aws-systems-manager/) cuyo script leía capas y generaba una plantilla de CloudFormation. El servicio está retirado: trata ese script como referencia histórica, pues depende de consultar OpsWorks. Reconstruye con servicios vigentes a partir del inventario y los archivos conservados; revisa los cambios y prueba las recetas antes de usarlas en un entorno activo.

## Grabación histórica sobre OpsWorks

El catálogo incluye esta charla de AWS Girls Perú, publicada el 7 de noviembre de 2021, sobre CloudFormation, Systems Manager y OpsWorks. Es material de archivo para entender el contexto de esas herramientas. Sus pantallas, menús y pasos de OpsWorks son históricos: no los uses para crear un servicio retirado. Para procedimientos actuales, consulta la documentación oficial enlazada arriba.

<figure>
  <iframe allowfullscreen="" loading="lazy" src="https://www.youtube-nocookie.com/embed/FCcAJYnlsPs" title="Charla histórica sobre CloudFormation, Systems Manager y AWS OpsWorks — AWS Girls"></iframe>
  <figcaption><a href="https://www.youtube.com/watch?v=FCcAJYnlsPs" rel="noopener noreferrer" target="_blank">Abrir la charla en YouTube</a>. Grabación de AWS Girls publicada el 7 de noviembre de 2021. Úsala como contexto histórico y verifica las tareas actuales en la documentación de AWS.</figcaption>
</figure>

## Comunidad y recursos

Si estás reconstruyendo una solución, puedes contrastar el enfoque con la comunidad general del [AWS User Group Perú](https://awsugperu.cloud/), que publica sus espacios, recursos y agenda, o revisar el [directorio de eventos de AWS en español](/eventos/) para encontrar charlas vigentes. Estas comunidades sirven para conversar con otras personas; no reemplazan el soporte técnico de AWS ni son un canal de administración de OpsWorks.
