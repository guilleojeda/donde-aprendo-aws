---
title: "AWS OpsWorks retirado: alternativas para Chef y Puppet"
description: "AWS OpsWorks está retirado. Entiende qué pasó con Stacks, Chef Automate y Puppet Enterprise y qué herramientas actuales pueden cubrir cada función."
author: "guille-ojeda"
publishedAt: "2024-05-06"
publishedTimestamp: "2024-05-06T20:31:06.838Z"
modifiedTimestamp: "2026-10-05T13:23:09-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS OpsWorks Stacks: flujo histórico de despliegue con Chef y cómo reemplazarlo"
    url: "https://dondeaprendoaws.com/blog/aws-opsworks-automatiza-despliegues-con-chef/"
  - title: "Seguridad de IaC en AWS: 9 controles para Terraform y CloudFormation"
    url: "https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/"

---

AWS OpsWorks ya no está disponible. AWS clasifica OpsWorks, OpsWorks Stacks, OpsWorks for Chef Automate y OpsWorks for Puppet Enterprise como servicios en cierre completo: ya no forman parte de su cartera ni están disponibles o tienen soporte. Por eso, las instrucciones antiguas para crear una pila, un servidor o un Puppet master de OpsWorks no sirven para iniciar un entorno nuevo.

La [tabla de servicios retirados de AWS](https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html) enumera las cuatro entradas con fecha 1 de mayo de 2024. Un [anuncio de AWS sobre la retirada de recursos de OpsWorks Stacks](https://aws.amazon.com/blogs/mt/seamlessly-off-board-from-aws-opsworks-stacks-by-detaching-resources/), publicado el 11 de abril de 2024, había indicado el 26 de mayo de 2024 como fin de vida de Stacks. Las fuentes no explican esa diferencia; ambas fechas ya pasaron y el listado actual confirma que el servicio está retirado.

## Preguntas frecuentes sobre AWS OpsWorks

### ¿Sigue disponible AWS OpsWorks para clientes nuevos o existentes?

No. AWS indica que OpsWorks está en cierre completo y ya no se ofrece ni tiene soporte. Esto abarca las variantes de Stacks, Chef Automate y Puppet Enterprise. La documentación que aún describe cómo crear servidores, capas o recursos es histórica; no la sigas como una guía de alta actual.

### ¿Qué fecha de fin de vida útil debo tomar como válida?

Para comprobar el estado actual, consulta la tabla de servicios retirados de AWS. Si documentas la historia de una migración, conserva la fuente junto a la fecha: el anuncio de abril de 2024 sobre Stacks y el listado general publican fechas distintas. Ninguna de ellas permite usar hoy el servicio.

### ¿Qué pasó con las instancias EC2 que administraba OpsWorks Stacks?

El anuncio de retirada de recursos de abril de 2024 describía cómo desasociar instancias de Stacks y conservarlas en EC2 para administrarlas con otras herramientas. Era un procedimiento previo al cierre, no una operación que puedas iniciar hoy sobre OpsWorks. Revisa por separado qué instancias siguen en tu cuenta, sus aplicaciones, los datos y las copias de seguridad. Una instancia encendida no conserva por sí sola el mantenimiento ni la coordinación de recetas que hacía OpsWorks.

### ¿Qué servicio de AWS reemplaza OpsWorks?

No hay un reemplazo idéntico para todas las variantes. La elección depende de qué función necesitas conservar: configuración del sistema, aprovisionamiento de infraestructura, capacidad de EC2, lanzamiento de versiones de una aplicación o una plataforma de administración de Chef o Puppet.

Para **OpsWorks Stacks**, AWS publicó en 2023 una [guía de migración a Systems Manager con CloudFormation](https://aws.amazon.com/blogs/mt/migrate-your-aws-opsworks-stacks-to-aws-systems-manager/). Su script leía información de las capas y generaba una plantilla inicial. Como requiere consultar OpsWorks y el servicio está retirado, úsala como referencia histórica. Parte de las plantillas, exportaciones, inventario, cookbooks y datos que hayas conservado para reconstruir los recursos con herramientas vigentes.

Para **recetas de Chef**, AWS Systems Manager State Manager incluye el documento <code>AWS-ApplyChefRecipes</code>, que ejecuta recetas en nodos Linux administrados por Systems Manager; AWS indica que no es compatible con macOS. La guía enumera Chef 11 a 18 como versiones que el documento puede instalar. Ese rango describe una integración heredada de AWS, no el estado de soporte de cada versión ni una recomendación para entornos nuevos. La [tabla vigente de Chef](https://docs.chef.io/versions/) marca Chef Infra Client 19.x como LTS, 18.x como obsoleto y las versiones anteriores a 18 como EOL; como AWS-ApplyChefRecipes no incluye el LTS 19.x, no se recomienda como base para un entorno nuevo que requiera una versión mantenida. Además, verifica que el sistema operativo figure entre las [plataformas compatibles de Chef](https://docs.chef.io/platforms/). Las recetas deben funcionar sin Chef Server y AWS no ofrece soporte oficial para cookbooks de Chef Supermarket. Es una opción acotada para cargas que mantienen versiones compatibles, no un reemplazo completo de Chef Automate. Lee las [condiciones de AWS-ApplyChefRecipes](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-state-manager-chef.html) antes de adaptar cookbooks.

Para **Chef Automate**, Chef conserva una guía de migración desde OpsWorks a Chef SaaS que exige que OpsWorks siga ejecutando Chef Automate 2.0. Como AWS ya retiró el servicio, esa guía no confirma que una cuenta sin acceso al servidor pueda completar hoy ese recorrido. Si conservas copias de seguridad, consulta con Chef qué opciones admite en tu caso antes de tratar esa ruta como disponible. Revisa los [requisitos publicados por Chef](https://docs.chef.io/saas/opsworks_migration/).

Para **Puppet Enterprise**, Puppet documenta una AMI para AWS Marketplace con licencia propia. Esa opción requiere evaluar operación, soporte y licencia con Puppet; no migra por sí sola los datos o la configuración de OpsWorks. Consulta la [integración actual de Puppet con AWS](https://www.puppet.com/integrations/aws). Systems Manager State Manager no ejecuta manifiestos Puppet por el solo hecho de ser una alternativa a OpsWorks: confirma que cada herramienta elegida cubra el trabajo concreto.

Si el objetivo es reconstruir recursos, una plantilla de infraestructura como código y un servicio de despliegue resuelven partes distintas. Esta guía del sitio explica [controles de seguridad para IaC en Terraform y CloudFormation](/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/). Para entender el flujo histórico de capas, recetas y despliegues de Stacks, continúa con [cómo funcionaba OpsWorks Stacks y qué piezas reemplazar](/blog/aws-opsworks-automatiza-despliegues-con-chef/).

### ¿Puedo seguir tutoriales antiguos para crear una pila de OpsWorks?

No. El servicio está retirado y sus consolas, API y CLI ya no están disponibles. Los documentos antiguos todavía pueden explicar cómo funcionaba una carga existente, pero no son instrucciones para alta o administración actuales. La guía de [flujo histórico de OpsWorks Stacks](https://dondeaprendoaws.com/blog/aws-opsworks-automatiza-despliegues-con-chef/) separa esos conceptos de sus alternativas actuales.

Para escuchar una charla que reúne los temas de OpsWorks, Systems Manager y CloudFormation, puedes abrir esta [grabación histórica de AWS Girls, publicada el 7 de noviembre de 2021](https://www.youtube.com/watch?v=FCcAJYnlsPs). Es anterior al cierre de OpsWorks y sirve como archivo, no como tutorial vigente.

## Preguntas técnicas y comunidad

Para dudas sobre servicios vigentes de AWS, [AWS re:Post](https://repost.aws/) reúne preguntas técnicas y respuestas de la comunidad. Para compartir el proceso de migración con otras personas y consultar charlas o grupos locales, visita el [AWS User Group Perú](https://awsugperu.cloud/), que mantiene un directorio de comunidades y una agenda. Es una comunidad general de AWS, no un canal de soporte específico para OpsWorks.
