---
title: "Mejores prácticas de DevOps en AWS: CI/CD, IaC y despliegues seguros"
description: "Diseña un flujo DevOps en AWS desde Git e infraestructura como código hasta pruebas, credenciales temporales, observabilidad y reversión de despliegues."
author: "guille-ojeda"
publishedAt: "2024-01-24"
publishedTimestamp: "2024-01-24T23:31:38.611Z"
modifiedTimestamp: "2026-10-06T17:50:38-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cómo integrar Terraform con CI/CD en AWS con GitHub Actions"
    url: "https://dondeaprendoaws.com/blog/como-integrar-terraform-con-cicd-en-aws/"
  - title: "Seguridad de IaC en AWS: 9 controles para Terraform y CloudFormation"
    url: "https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/"
  - title: "Cómo diagnosticar problemas en aplicaciones AWS con CloudWatch"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/"
  - title: "Métricas DevOps en AWS: DORA, fiabilidad y costos"
    url: "https://dondeaprendoaws.com/blog/10-metricas-clave-de-devops-en-aws/"
  - title: "Mejores prácticas de seguridad en AWS: checklist y cómo verificarlas"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/"
---

Un flujo DevOps en AWS conecta cada cambio con pruebas, un despliegue repetible y señales para decidir si mantenerlo o revertirlo. Empieza con un *commit* revisable, valida el código y la infraestructura, publica una versión identificable y promueve esa misma versión entre entornos. Si algo falla, el equipo debe detectar el impacto y saber qué acción tomar; ningún servicio garantiza por sí solo un despliegue seguro.

## Qué hace cada parte del flujo

Separa responsabilidades para que cada herramienta tenga una función clara:

- **Git** conserva el código, la infraestructura y el historial de cambios. Un *pull request* facilita la revisión antes de integrar una modificación.
- **La integración continua (CI)** ejecuta pruebas y construye el artefacto de la aplicación. Puedes usar GitHub Actions o AWS CodeBuild; CodeBuild ejecuta comandos definidos, por ejemplo, en un archivo buildspec.yml.
- **La entrega continua (CD)** coordina etapas como validar, desplegar en pruebas y promover a producción. AWS CodePipeline puede orquestar esas etapas; admite fuentes de GitHub mediante una conexión con GitHub App. Si una canalización existente usa la acción antigua de GitHub con OAuth, la documentación actual recomienda migrar a la acción basada en conexión.
- **La infraestructura como código (IaC)** define los recursos que acompañan a la aplicación. CloudFormation, AWS CDK y Terraform son opciones distintas; CDK sintetiza plantillas de CloudFormation y Terraform administra su propio estado. Elige una fuente de verdad por conjunto de recursos y revisa la salida que realmente se va a aplicar.
- **El entorno de ejecución** sirve la aplicación. Por ejemplo, Amazon ECS ejecuta tareas y servicios de contenedores; Amazon ECR almacena imágenes. La canalización construye y promueve las versiones, y el servicio de cómputo las ejecuta.

AWS CodePipeline no reemplaza al repositorio ni compila por sí mismo el código de aplicación. Si eliges GitHub Actions para orquestar el flujo, evita crear otra canalización que también aplique los mismos cambios de infraestructura. Consulta la documentación de [fuentes de GitHub en CodePipeline](https://docs.aws.amazon.com/codepipeline/latest/userguide/connections-github.html) y de [archivos buildspec en CodeBuild](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html).

Para ver un flujo de aplicación real, mira la [demostración de Amazon ECS con Terraform y GitHub Actions de 295DevOps](https://www.youtube.com/watch?v=3ocYjn0Aohc). El título y la descripción actuales muestran una aplicación Flask en ECS con Fargate; se publicó en noviembre de 2025. El [canal de 295DevOps](https://www.youtube.com/@295devops) reúne otras charlas y demostraciones sobre AWS y DevOps en español.

## Buenas prácticas desde el cambio hasta producción

### 1. Haz cambios pequeños y fáciles de revisar

Versiona junto al código la infraestructura, la configuración de despliegue y los controles que quieras automatizar. Protege las ramas que pueden publicar a producción y exige revisión para cambios de IAM, red, datos o recursos que podrían reemplazarse. Los cambios pequeños reducen el conjunto de causas posibles cuando una versión se comporta mal. AWS recomienda probar los cambios, automatizar integración y despliegue y hacer cambios pequeños y reversibles en su guía de [excelencia operativa de Well-Architected](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/design-for-operations.html).

### 2. Ejecuta controles antes de conceder acceso de despliegue

En cada *pull request*, corre formato y análisis estático, pruebas de la aplicación, validaciones de IaC y análisis de dependencias o imágenes según el riesgo del sistema. Para CloudFormation, combina comprobaciones de plantilla con reglas de seguridad cuando correspondan; para Terraform, valida formato, configuración y políticas del equipo. Estas comprobaciones reducen errores, pero no prueban que una operación real vaya a tener permisos, cuotas o condiciones de servicio adecuadas.

No entregues credenciales de despliegue a código no confiable de un *pull request*, como una contribución de un *fork*. Publica resultados que indiquen qué commit se comprobó y conserva el artefacto que luego se promueve; reconstruir otra imagen para producción puede introducir diferencias entre la versión probada y la desplegada.

### 3. Revisa el cambio de infraestructura antes de ejecutarlo

Con CloudFormation, crea un *change set* y revisa qué recursos se crearán, modificarán, reemplazarán o eliminarán. Con Terraform, revisa el plan correspondiente al commit. Presta atención a bases de datos, almacenamiento, permisos IAM, reglas de red y recursos con datos persistentes.

Un *change set* ayuda a ver el efecto previsto, pero no garantiza que CloudFormation pueda completar la actualización: condiciones de ejecución, permisos y cuotas pueden provocar errores. La documentación explica qué muestra y qué no garantiza un [change set de CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html).

### 4. Prueba el mismo artefacto antes de producción

Despliega primero en un entorno de pruebas parecido a producción y comprueba que el servicio arranca, responde a sus verificaciones de salud y supera pruebas funcionales e integración. La guía de Well-Architected sobre [probar despliegues](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/ops_mit_deploy_risks_test_val_chg.html) recomienda probar antes de producción la misma configuración, controles y pasos. Cuando sea posible, promueve a producción la misma imagen o artefacto que validaste, con su identificador de commit o digest. Separa por entorno la configuración y los permisos, no el contenido compilado de la aplicación.

Para cambios de aplicación, un despliegue progresivo o por lotes reduce el impacto inicial si algo va mal. En Amazon ECS, el *deployment circuit breaker* detecta fallos de estabilidad en servicios con controlador de despliegue rolling; si también configuras rollback, ECS puede volver al último despliegue completado. Las alarmas de CloudWatch pueden detectar degradaciones observables, pero debes asociarlas y configurar qué respuesta quieres. ECS describe los métodos y sus [límites para detectar fallos de despliegue](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-failure-detection.html).

No supongas que revertir la versión de la aplicación deshace cambios en datos o esquemas. Planifica las migraciones para que la versión anterior pueda convivir durante la transición, o define una recuperación específica para esos datos.

Si quieres probar cambios progresivos y alarmas, el [laboratorio ECS Canary in Action](https://github.com/roxsross/aws-ecs-canary-in-action) incluye un modo local con Docker y otro que despliega una infraestructura de ejemplo en AWS. El README enumera ECS, Fargate, un balanceador, DynamoDB, CloudWatch y ECR; el modo en AWS requiere permisos para esos recursos y puede generar cargos. Empieza en local y revisa los pasos de limpieza antes de crear recursos.

### 5. Usa roles y credenciales temporales para CI

Si el ejecutor externo es GitHub Actions, configura federación OIDC para que el trabajo solicite credenciales temporales mediante un rol de IAM. Limita la confianza del rol al repositorio y al contexto que puede desplegar —por ejemplo, una rama o un entorno protegido— y concede solo las acciones necesarias para esa etapa. El permiso de GitHub `id-token: write` permite solicitar un token OIDC; no concede permisos de AWS por sí solo.

La condición de confianza debe coincidir con el claim `sub` real del token. Desde el 15 de julio de 2026, los repositorios nuevos de GitHub.com y los repositorios renombrados o transferidos después de esa fecha usan por defecto un `sub` con identificadores inmutables de propietario y repositorio. Los repositorios anteriores conservan el formato previo salvo que habiliten el nuevo. Verifica el formato del repositorio y sigue la guía vigente de [GitHub OIDC con AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) junto con las recomendaciones de [IAM para roles OIDC](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html). No guardes claves IAM de larga duración como secretos del repositorio.

Para practicar plan, aprobación y despliegue con permisos temporales, sigue la [guía de Terraform con GitHub Actions y CI/CD en AWS](/blog/como-integrar-terraform-con-cicd-en-aws/).

Si ya separas ambientes en varias cuentas, el artículo de Daniel Castillo sobre un [pipeline CI/CD multi-cuenta](https://dcastillogi.com/arquitecturas/pipeline-cicd-multi-cuenta) muestra la promoción del mismo artefacto entre DEV, QA y PROD, además del costo operativo de mantener cuentas y roles separados. No hace falta esa complejidad para todos los proyectos.

## Observa el resultado y prepara la reversión

Después del despliegue, mira métricas que representen el servicio: tasa de errores, latencia, solicitudes correctas y verificaciones de salud. Añade registros de la aplicación para investigar fallos y alarmas con umbrales que detengan o reviertan el despliegue cuando se cumplan las condiciones configuradas. Guarda el identificador del artefacto, la hora de despliegue y el resultado de las pruebas para relacionar un cambio con sus efectos. Para comparar velocidad y estabilidad de entrega, consulta la guía de [métricas DevOps en AWS](https://dondeaprendoaws.com/blog/10-metricas-clave-de-devops-en-aws/).

Si instrumentas trazas con los SDK de AWS X-Ray, ten presente su cambio de ciclo: entraron en mantenimiento el **25 de febrero de 2026** y AWS dejará de darles soporte el **25 de febrero de 2027**. AWS recomienda migrar la instrumentación a OpenTelemetry; el formato de las trazas seguirá disponible en CloudWatch después de la migración. Revisa la [línea de tiempo de soporte de X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-daemon-timeline.html) y la [guía de migración a OpenTelemetry](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-migration.html). Para revisar alarmas, métricas y registros en la práctica, sigue con [cómo diagnosticar problemas en aplicaciones AWS con CloudWatch](/blog/mejores-practicas-de-observabilidad-en-aws/).

La reversión también necesita pruebas. Define qué condición la activa, quién recibe la alerta, qué versión se recupera y cómo confirmar que el servicio volvió a un estado aceptable. El mecanismo depende del servicio y de su configuración: una alarma de aplicación y el circuito de despliegue de ECS no detectan exactamente lo mismo. No automatices una reversión destructiva de datos como si fuera equivalente a volver a desplegar la aplicación.

## Servicios y nombres que cambiaron desde las guías antiguas

Antes de seguir una guía antigua, comprueba la disponibilidad y el ciclo de vida de sus servicios:

- **AWS CodeCommit** volvió a disponibilidad general para nuevos clientes el 24 de noviembre de 2025. Puedes elegirlo como repositorio Git, o usar GitHub, GitLab u otro proveedor según las necesidades del equipo y sus integraciones. La [actualización de AWS sobre CodeCommit](https://aws.amazon.com/blogs/devops/aws-codecommit-returns-to-general-availability/) explica el cambio.
- [AWS Cloud9](https://docs.aws.amazon.com/cloud9/latest/user-guide/history.html) dejó de estar disponible para clientes nuevos el 25 de julio de 2024; quienes ya lo usan pueden continuar. **AWS OpsWorks Stacks** llegó al fin de vida útil el 26 de mayo de 2024. No bases una herramienta nueva en esos servicios; si aún dependes de OpsWorks Stacks, revisa el [aviso de fin de vida y opciones de salida](https://aws.amazon.com/blogs/mt/seamlessly-off-board-from-aws-opsworks-stacks-by-detaching-resources/).
- Si encuentras nombres antiguos en ejemplos, **CloudWatch Events** hoy es Amazon EventBridge y **Amazon Elasticsearch Service** se llama Amazon OpenSearch Service. Consulta la [guía de servicios integrados con CodePipeline](https://docs.aws.amazon.com/codepipeline/latest/userguide/integrations-action-type.html) y el [historial del cambio a OpenSearch Service](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/rename.html).

## Recursos y comunidades para seguir

Para compartir dudas, conecta con comunidades como [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) o [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/). La comunidad estudiantil de la [AWS Student Builder Group en UTN FRC](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/) también organiza encuentros de AWS, IaC y DevOps.

Estas actividades de octubre de 2026 permiten seguir aprendiendo con otras personas:

- **10 de octubre, Córdoba:** [AWS Gaming Lab: ECS, CI/CD y la magia de Terraform](https://www.frc.utn.edu.ar/eventos/aws-gaming-lab-ecs-ci-cd-y-la-magia-de-terraform/). La UTN FRC lo anuncia gratis, presencial y con inscripción previa; está dirigido a estudiantes de Ingeniería en Sistemas de Información y comienza con acreditación a las 11:30.
- **20 de octubre, en línea:** [Compliance as Code en AWS](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/), a las 19:00, hora de Ecuador. La sesión de AWS User Group Security Ecuador cubre controles automatizados, credenciales IAM y alertas; la página indica cupos limitados e inscripción.
- **23 de octubre, Guayaquil:** [AWS & Cloud Native Security Night](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/), presencial de 17:00 a 20:00, hora de Ecuador. Es gratis, con cupos limitados, y la convocatoria incluye a profesionales DevOps y SRE interesados en Kubernetes, contenedores y seguridad.

Confirma cupos y condiciones en cada página antes de asistir. Para encontrar otras actividades o fechas futuras, consulta la [agenda de eventos AWS](/eventos/) y el [directorio de comunidades](/comunidades/).

Para profundizar en controles de infraestructura, revisa [seguridad de IaC en AWS](/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/) y la [lista de verificación general de seguridad en AWS](/blog/mejores-practicas-de-seguridad-en-aws/).
