---
title: "Seguridad de IaC en AWS: 9 controles para Terraform y CloudFormation"
description: "Protege IaC en AWS con controles para secretos, estado de Terraform, OIDC, IAM, CloudFormation Guard y revisión de cambios en CDK y SAM."
author: "guille-ojeda"
publishedAt: "2024-05-07"
publishedTimestamp: "2024-05-07T02:13:47.453Z"
modifiedTimestamp: "2026-10-04T22:31:52-03:00"
review:
  date: "2026-10-04"
cover: "/assets/blog/0b84e7609d9a01cdc2449b30.jpg"
coverAlt: "Nube conectada a una red de candados, escudos y otros símbolos de seguridad"
ogImage: "/assets/blog/0b84e7609d9a01cdc2449b30.jpg"
related: []
---

Al proteger infraestructura como código (IaC) en AWS, conviene cubrir todo el flujo: cambios revisables, políticas que sí se ejecutan, credenciales temporales, permisos mínimos, estado protegido y una revisión humana antes de aplicar. Terraform, CloudFormation, AWS CDK y AWS SAM necesitan controles acordes con lo que cada herramienta genera.

Un `terraform plan` o un *change set* de CloudFormation ayuda a previsualizar acciones, pero no ejecuta por sí solo un análisis de seguridad ni garantiza que el despliegue termine correctamente. Combínalos con validaciones y reglas explícitas. Si buscas una introducción a la definición de recursos, puedes empezar por nuestras guías de [Terraform](https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/) y [CloudFormation](https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/).

## 1. Versiona la infraestructura y revisa sus dependencias

Guarda las plantillas, módulos propios y configuración del pipeline en un repositorio. Pide revisión por *pull request* para cambios que puedan abrir acceso de red, ampliar permisos IAM, exponer datos o reemplazar recursos. Protege las ramas de despliegue y conserva quién aprobó cada cambio.

En Terraform, incluye `.terraform.lock.hcl` en el repositorio. Terraform lo actualiza al inicializar proveedores; revisa los cambios antes de aceptar una nueva versión. Ese archivo fija versiones de proveedores, no de módulos remotos, así que declara y revisa también la versión de cada módulo externo. [HashiCorp explica el archivo de dependencias y su revisión](https://developer.hashicorp.com/terraform/language/files/dependency-lock).

No subas a Git el estado, los archivos de plan guardados, variables con credenciales ni salidas de CI que puedan contener valores sensibles.

## 2. Valida el código y las reglas de seguridad en CI

Ejecuta validaciones antes de dar credenciales de despliegue al pipeline. [`terraform validate`](https://developer.hashicorp.com/terraform/cli/commands/validate) comprueba sintaxis y consistencia interna; no verifica si una configuración satisface tus políticas de seguridad ni consulta los recursos remotos. Para un análisis de seguridad, usa un escáner que entienda el formato y las reglas que quieres revisar. Por ejemplo, [Checkov documenta soporte para Terraform, planes de Terraform, CloudFormation y SAM](https://github.com/bridgecrewio/checkov); configura sus reglas, revisa sus hallazgos y confirma que cubran el resultado que vas a desplegar.

Para CloudFormation, [cfn-lint](https://github.com/aws-cloudformation/cfn-lint) revisa estructura y propiedades de las plantillas. [CloudFormation Guard](https://docs.aws.amazon.com/cfn-guard/latest/ug/what-is-guard.html) evalúa datos JSON o YAML frente a las reglas que escribes: sirve para expresar controles como “no permitir un bucket sin cifrado”, pero no valida por sí mismo la sintaxis completa de CloudFormation. Ejecuta `cfn-guard validate` en el pipeline y prueba las reglas con casos que deben pasar y fallar.

Revisa también el artefacto generado. `cdk synth` produce una plantilla de CloudFormation a partir de una aplicación CDK; AWS SAM extiende CloudFormation y transforma su plantilla al desplegar. Comprueba que las políticas cubran las plantillas sintetizadas o transformadas que corresponden a tu flujo. La [guía de síntesis de CDK](https://docs.aws.amazon.com/cdk/v2/guide/configure-synth.html) y la [descripción de cómo funciona SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam-overview.html) detallan esas salidas.

## 3. Mantén los valores secretos fuera del código y de los artefactos

No escribas contraseñas, claves de API o tokens literales en plantillas, archivos `.tfvars`, salidas, registros ni planes guardados. En CloudFormation, guarda secretos en Secrets Manager o parámetros `SecureString` de Systems Manager y usa una referencia dinámica en propiedades compatibles. Limita quién puede leerlos. Una referencia dinámica evita incluir el valor en la plantilla, aunque el servicio de destino puede conservar o mostrar el valor que recibe; revisa cada integración. Además, cambiar un secreto no siempre hace que CloudFormation vuelva a leerlo hasta que actualices el recurso que lo consume. Consulta la guía de AWS sobre [referencias dinámicas](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references.html).

En Terraform, `sensitive = true` oculta ciertos valores en la salida normal de la CLI, pero **no cifra ni elimina el valor del estado o del plan**. Quien pueda leer esos archivos podría acceder al secreto; las opciones `-json` y `-raw` de `terraform output` también pueden mostrarlo. Protege el estado y los artefactos, evita imprimir valores en CI y no publiques planes guardados. Para algunos datos temporales, `ephemeral` y argumentos de escritura única pueden evitar que Terraform los persista; su uso depende de la versión y del soporte del proveedor. [HashiCorp detalla estas diferencias](https://developer.hashicorp.com/terraform/language/manage-sensitive-data).

## 4. Usa identidad federada y credenciales temporales para CI

Si GitHub Actions despliega en AWS, configura OIDC para intercambiar el token del trabajo por credenciales temporales de AWS. Así evitas guardar claves de acceso de larga duración como secretos del repositorio. Otorga `id-token: write` solo al trabajo que solicita el token y limita la relación de confianza del rol a un `aud` y un `sub` concretos.

Este fragmento muestra una confianza para una rama específica. Sustituye cada marcador y ajusta `sub` al formato que emite tu repositorio:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:<ORG>/<REPO>:ref:refs/heads/<BRANCH>"
      }
    }
  }]
}
```

No reemplaces el `sub` por un comodín que permita a cualquier repositorio asumir el rol. Si el trabajo usa un entorno de GitHub, la forma de `sub` cambia; aplica también las reglas de protección del entorno. GitHub indica que los repositorios creados después del 15 de julio de 2026, o que habilitaron un formato de `sub` con identificadores inmutables, incluyen identificadores de organización y repositorio en `sub`; verifica el formato real antes de configurar la confianza. Consulta las guías de [GitHub para OIDC con AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) y de [IAM sobre proveedores OIDC](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html).

## 5. Separa la lectura del plan del permiso para desplegar

Diseña un rol para preparar y revisar cambios con solo los permisos de lectura que requiera el proveedor y el acceso necesario al estado y su bloqueo. Asigna los permisos de creación, modificación y eliminación a una identidad de despliegue aparte, limitada a las cuentas, recursos y acciones que administre.

Cuando CloudFormation use un rol de servicio, limita su política a los recursos que las plantillas necesitan. Restringe [`iam:PassRole`](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html) a ese rol concreto y permite que solo CloudFormation lo asuma. Un rol de servicio asociado a un stack se usa en sus operaciones posteriores, por lo que ampliar ese rol también amplía las acciones que los usuarios autorizados a operar el stack pueden solicitar. AWS explica este alcance en su guía de [roles de servicio de CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html).

## 6. Protege y bloquea el estado remoto de Terraform

El estado describe los recursos administrados y puede contener datos sensibles. Evita depender de un archivo local compartido o de control de versiones para coordinar un equipo. El backend S3 puede cifrar el estado en reposo y admite bloqueo nativo mediante `use_lockfile`. Este fragmento es solo una configuración de backend: el bucket debe existir, ser privado, tener permisos limitados y contar con versionado de objetos para facilitar la recuperación.

```hcl
terraform {
  required_version = ">= 1.10.0"

  backend "s3" {
    bucket       = "<BUCKET_EXISTENTE>"
    key          = "equipo/app/produccion.tfstate"
    region       = "<REGION>"
    encrypt      = true
    use_lockfile = true
  }
}
```

Hay dos archivos con “lock” que cumplen funciones distintas: `.terraform.lock.hcl` registra versiones de proveedores; el backend S3 crea un archivo `.tflock` para coordinar operaciones sobre el estado. Limita por IAM el acceso al objeto de estado y al objeto de bloqueo. El bloqueo con DynamoDB está marcado como obsoleto en la documentación actual de Terraform; si aún tienes clientes antiguos, planifica una migración compatible antes de retirar la tabla. Revisa la [configuración del backend S3](https://developer.hashicorp.com/terraform/language/backend/s3) y las [prácticas de seguridad del estado](https://developer.hashicorp.com/terraform/language/manage-sensitive-data).

## 7. Revisa las acciones propuestas antes de aplicarlas

Abre el plan o el *change set* y revisa qué recursos se crearán, cambiarán, eliminarán o reemplazarán. Comprueba en particular políticas IAM, exposición pública de red, cifrado, acceso a datos y cambios destructivos. Para producción, define quién puede aprobar la aplicación y qué políticas deben pasar antes.

Estos artefactos son una vista de los cambios propuestos, no un escáner de seguridad automático. CloudFormation advierte que un *change set* no garantiza que una actualización tenga éxito: algunas condiciones de ejecución solo aparecen al operar el recurso. Un plan especulativo de Terraform también puede quedar desactualizado si cambia la infraestructura; vuelve a generar y revisar el plan que se aplicará. Consulta la documentación de [change sets de CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html) y de [`terraform plan`](https://developer.hashicorp.com/terraform/cli/commands/plan).

## 8. Distingue las reglas de CI de los controles durante una operación

Una regla de Guard que se ejecuta en CI solo afecta a los archivos que el pipeline le entrega. No se activa automáticamente en cada cambio de AWS. Si necesitas que CloudFormation avise o bloquee operaciones que incumplan reglas, registra [CloudFormation Guard Hooks](https://docs.aws.amazon.com/cloudformation-cli/latest/hooks-userguide/guard-hooks-write-rules.html) para los tipos de recursos y operaciones que quieras controlar.

Un Hook aplica el control configurado durante operaciones de CloudFormation o Cloud Control API; no sustituye las validaciones del pipeline, no cubre recursos u operaciones que no se incluyeron y no detecta cambios manuales hechos después. AWS describe por separado el [alcance de Guard en CLI](https://docs.aws.amazon.com/cfn-guard/latest/ug/what-is-guard.html) y su [uso en Hooks](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cloudformation-guard.html).

Para ver CloudFormation Hooks en una charla, revisa [CloudFormation Hooks: validación proactiva para una nube segura](https://www.youtube.com/watch?v=2JZOW4p7Yfk).

## 9. Detecta drift y decide cómo reconciliarlo

Las personas o automatizaciones pueden cambiar recursos fuera del flujo de IaC. En Terraform, `terraform plan -refresh-only` propone diferencias para recursos registrados en el estado y atributos que el proveedor puede leer; no modifica AWS. Revisa la salida y decide si actualizas el código para aceptar el cambio o vuelves a aplicar la configuración deseada. Si después confirmas `terraform apply -refresh-only`, Terraform actualiza su estado sin cambiar los recursos remotos.

CloudFormation también puede detectar drift de stacks, pero su alcance depende de los tipos de recurso y propiedades que admiten detección; solo compara las propiedades que se establecieron en plantilla o parámetros. Los stacks anidados requieren una revisión independiente. No interpretes un resultado limpio como una comprobación universal de todos los recursos de la cuenta. Consulta la guía de [drift de Terraform](https://developer.hashicorp.com/terraform/tutorials/state/resource-drift) y la de [detección de drift en CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-stack-drift.html).

Para un ejemplo de automatización de seguridad con Terraform y Python, consulta la charla [PocketSOC en NERDflix](https://www.nerdearla.com/nerdflix/WWt4EO2TCQ4/).

## Recursos y comunidades en español

Si estás comparando herramientas, la grabación de [CDK frente a Terraform de AWS Girls Chile](https://www.youtube.com/watch?v=rpLKcZvXGq0) ofrece contexto de IaC, aunque no es una guía de controles de seguridad. Para aprender una base de SAM y CloudFormation con un ejemplo de API, consulta el artículo de la comunidad [Cómo crear un API REST con CloudFormation o SAM](https://dev.to/cecamilo/iac-como-crear-un-api-rest-con-cloudformation-o-sam-6n5).

Puedes seguir las [grabaciones del canal AWS Security Users Group LatAm](https://www.youtube.com/@AWSSecurityLATAM) y participar en [AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/), un grupo independiente que comparte contenido de seguridad de AWS en español. Revisa el perfil del grupo para conocer sus actividades vigentes.

La agenda consultada el 4 de octubre de 2026 mostraba estos eventos futuros; confirma fecha, modalidad, disponibilidad y condiciones de inscripción en Meetup:

- [AWS Gaming Lab: ECS, CI/CD y la magia de Terraform](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/) — presencial en Córdoba, 10 de octubre de 2026, de 12:00 a 14:00 ART. Es una charla local sobre Terraform y despliegues.
- [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) — en línea, 20 de octubre de 2026, de 19:00 a 20:00 GMT-5.
- [Shift-left con IA: Checkov y AWS Security Agent cuidando tu rama main](https://www.meetup.com/aws-sbg-at-universidad-laica-eloy-alfaro-de-manabi/events/316827722/) — en línea, 21 de octubre de 2026, de 19:00 a 21:00 GMT-5. El título describe el tema de la charla; consulta la página del evento para conocer el contenido y las condiciones actuales.

Si estas fechas ya pasaron, consulta la [agenda vigente de eventos de comunidades AWS](https://dondeaprendoaws.com/eventos/) para encontrar otros encuentros y sus enlaces de inscripción.
