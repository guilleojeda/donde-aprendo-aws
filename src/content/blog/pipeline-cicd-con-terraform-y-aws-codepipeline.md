---
title: "Pipeline CI/CD con Terraform y AWS CodePipeline: plan y aprobación"
description: "Configura Terraform en AWS CodePipeline y CodeBuild: guarda el plan como artefacto, revísalo y aplica ese mismo archivo con roles IAM separados."
author: "guille-ojeda"
publishedAt: "2025-02-13"
publishedTimestamp: "2025-02-13T00:13:18.43Z"
modifiedTimestamp: "2026-10-07T00:07:26-03:00"
review:
  date: "2026-10-07"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Infraestructura como código en AWS con Terraform: guía práctica de S3"
    url: "https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/"
  - title: "Cómo integrar Terraform con CI/CD en AWS con GitHub Actions"
    url: "https://dondeaprendoaws.com/blog/como-integrar-terraform-con-cicd-en-aws/"
  - title: "Acceso entre cuentas en AWS con IAM: roles y políticas de confianza"
    url: "https://dondeaprendoaws.com/blog/politicas-de-confianza-aws-acceso-entre-cuentas/"
---

Para automatizar Terraform con AWS CodePipeline, generá el plan una vez, guardalo como artefacto, revisá ese plan y aplicá el mismo archivo. Este ejemplo conecta un repositorio de GitHub mediante AWS CodeConnections, ejecuta validaciones y Terraform en AWS CodeBuild, y detiene la ejecución para aprobación antes de modificar recursos.

El flujo aplica un <code>tfplan</code> producido para el mismo commit que luego recibe la etapa Apply. También conserva la configuración y el archivo <code>.terraform.lock.hcl</code> entre etapas. El ejemplo cubre una canalización en una sola región; supone que el bucket de estado, el bucket de artefactos, la conexión, los proyectos de CodeBuild y los roles IAM ya existen. Al final explico qué debe tener cada uno.

## Resumen del flujo

1. Un commit de la rama protegida activa el origen de CodePipeline.
2. CodeBuild valida formato y configuración sin conectarse al backend ni modificar recursos.
3. Otro proyecto de CodeBuild lee el estado, crea un plan y publica un artefacto cifrado con el plan, una vista legible y el commit.
4. Una persona autorizada abre ese artefacto y aprueba o rechaza la ejecución.
5. CodeBuild recibe el código fuente y el plan de esa misma ejecución, verifica el commit y ejecuta <code>terraform apply</code> sobre el archivo guardado.

Este diseño aplica un plan aprobado, no vuelve a calcular uno. Si el estado cambia mientras la ejecución espera, Terraform puede rechazar el plan por obsoleto. En ese caso hay que generar otro plan y pedir una nueva revisión.

Para conocer las herramientas de entrega continua de AWS, [AWS Women Colombia repasa CodeCommit, CodePipeline, CodeBuild, CodeDeploy y CodeArtifact](https://www.youtube.com/watch?v=ZO6FP7dSEVc) con Joana Ramírez y Angélica Ortega en una grabación de 2021. Sirve como panorama de servicios; contrasta las pantallas antiguas con la documentación actual. El ejemplo de esta guía usa GitHub y CodeConnections.

## Qué preparar antes de desplegar

### 1. Separá el estado de los artefactos

El backend S3 debe existir antes de que Terraform pueda usarlo. Prepará el bucket mediante un proceso de bootstrap separado o una plataforma que ya administre el estado. Activá el bloqueo de acceso público, el cifrado y el versionado de objetos; el versionado permite recuperar una versión anterior del estado. El bucket de estado no es el bucket de artefactos de CodePipeline ni el bucket de la aplicación.

Esta configuración usa el bloqueo nativo de S3:

~~~hcl
terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "mi-estado-terraform-123456789012-us-east-1"
    key          = "red/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "us-east-1"
}
~~~

<code>use_lockfile</code> requiere una versión de Terraform que lo admita; este ejemplo fija el mínimo en 1.10.0. Para migrar clientes antiguos, el backend aún admite temporalmente el bloqueo en S3 y DynamoDB a la vez. DynamoDB está obsoleto para nuevos backends y HashiCorp indica que lo retirará en una versión menor futura. Consultá la [documentación vigente del backend S3](https://developer.hashicorp.com/terraform/language/backend/s3) antes de migrar un estado compartido.

En <code>required_providers</code> declarás un rango compatible; <code>.terraform.lock.hcl</code> registra la versión exacta del proveedor elegida y sus sumas de comprobación. Generá o actualizá ese archivo en una revisión local, agregá la plataforma de CodeBuild y subilo al repositorio:

~~~sh
terraform init -backend=false -input=false
terraform providers lock -platform=linux_amd64
git add .terraform.lock.hcl
~~~

El archivo de bloqueo fija proveedores, no las versiones de módulos remotos. Si usás módulos externos, declarales también una versión concreta. CodeBuild debe usar exactamente la misma versión de Terraform y la misma imagen de Linux amd64 en Plan y Apply. La restricción del ejemplo no instala la versión más reciente en cada ejecución: fija una imagen revisada que incluya el ejecutable de Terraform. <code>terraform init -lockfile=readonly</code> hace que la canalización falle si falta el archivo o una dependencia requiere cambiarlo. HashiCorp explica cómo [bloquear dependencias](https://developer.hashicorp.com/terraform/language/files/dependency-lock) y cómo [aplicar un plan guardado](https://developer.hashicorp.com/terraform/cli/commands/apply).

El backend necesita <code>s3:ListBucket</code> limitado al prefijo del estado, <code>s3:GetObject</code> y <code>s3:PutObject</code> sobre el objeto del estado, y <code>s3:GetObject</code>, <code>s3:PutObject</code> y <code>s3:DeleteObject</code> sobre el archivo <code>.tflock</code>. Si cifrás con una clave KMS propia, añadí solo los permisos de esa clave que exijan las operaciones. No guardes claves de AWS ni secretos de backend en el código: la configuración de backend puede terminar dentro de los metadatos locales y del plan.

Si querés una explicación más extensa del estado remoto y un ejemplo de bucket, consultá la [guía de Terraform con S3](https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/).

### 2. Conectá el repositorio con CodeConnections

Creá una conexión en AWS Developer Tools, instalá o autorizá la aplicación del proveedor y comprobá que su estado sea <code>AVAILABLE</code>. La conexión es regional. Verificá que la región elegida admita la integración y que el bucket de artefactos y los proyectos de CodeBuild estén en esa región.

Aunque el servicio hoy se llama AWS CodeConnections, la acción de origen de CodePipeline conserva el proveedor <code>CodeStarSourceConnection</code>. Para GitHub, GitLab o Bitbucket, la acción genera por defecto un ZIP con el código del commit. El ARN de conexión puede usar el prefijo <code>codeconnections</code> o el anterior <code>codestar-connections</code>; AWS pide autorizar ambas acciones de IAM para cubrir los dos caminos. Consultá la [referencia actual de la acción de origen](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodestarConnectionSource.html), la lista de [proveedores compatibles](https://docs.aws.amazon.com/dtconsole/latest/userguide/supported-versions-connections.html) y las [integraciones de CodeConnections](https://docs.aws.amazon.com/dtconsole/latest/userguide/integrations-connections.html).

La instalación de la conexión puede requerir completar una autorización fuera de Terraform. La guía del proveedor <code>aws_codestarconnections_connection</code> indica que un recurso recién creado queda <code>PENDING</code> hasta terminar el proceso de instalación. Este ejemplo recibe el ARN de una conexión que ya está activa.

### 3. Configurá tres proyectos de CodeBuild

Los proyectos Validate, Plan y Apply usan <code>CODEPIPELINE</code> como origen y como tipo de artefactos. Cada proyecto lee su buildspec del ZIP de origen:

- Validate usa <code>buildspec-validate.yml</code> y no necesita permisos para consultar o cambiar la cuenta destino.
- Plan usa <code>buildspec-plan.yml</code>, el backend S3 y permisos de lectura para los recursos y fuentes de datos que administre Terraform.
- Apply usa <code>buildspec-apply.yml</code>, el mismo backend y los permisos de escritura requeridos por los recursos de esa configuración.

Plan y Apply deben fijar la misma versión exacta de Terraform, sistema operativo, arquitectura e imagen. Una versión de proveedor distinta puede invalidar el plan. Las rutas locales también importan: un archivo de plan puede contener rutas absolutas a módulos y archivos del proyecto. Por eso los dos buildspec copian el mismo ZIP a <code>/tmp/terraform-project</code> y cambian realmente a ese directorio antes de ejecutar Terraform. Así coinciden tanto la ruta raíz como <code>path.cwd</code>; HashiCorp documenta que [<code>-chdir</code> conserva el directorio original en <code>path.cwd</code>](https://developer.hashicorp.com/terraform/cli/commands). La guía de HashiCorp sobre [Terraform en automatización](https://developer.hashicorp.com/terraform/tutorials/automation/automate-terraform) describe estas condiciones.

El proyecto Terraform de destino va en el repositorio conectado a SourceArtifact: incluí ahí sus archivos <code>.tf</code>, módulos locales, <code>.terraform.lock.hcl</code>, los tres buildspecs y los valores no sensibles que necesite, por ejemplo en <code>terraform.tfvars</code>. Inyectá los valores sensibles desde Secrets Manager o Parameter Store; nunca los guardes en Git. Configurá el mismo conjunto y versión de entradas en Plan y Apply cuando el proveedor las requiera. Terraform guarda los valores usados en el plan aprobado, así que tratá el artefacto con el mismo cuidado que el estado.

## Definí las acciones del pipeline

Este HCL pertenece a un stack de bootstrap separado, que un equipo administra antes de ejecutar el pipeline. No lo pongas en el proyecto Terraform de destino que recibe SourceArtifact: ese repositorio contiene los recursos que el pipeline administra, además de los buildspecs descritos abajo. El recurso crea las etapas y conecta el artefacto del plan con Apply. No crea la conexión, el bucket S3/KMS, los proyectos CodeBuild ni sus roles: son requisitos previos y deben tener permisos ajustados a los recursos que administra la configuración objetivo.

~~~hcl
variable "codepipeline_role_arn" {
  type = string
}

variable "artifact_bucket" {
  type = string
}

variable "artifact_kms_key_arn" {
  type = string
}

variable "connection_arn" {
  type = string
}

variable "repository_id" {
  type = string
}

variable "source_branch" {
  type    = string
  default = "main"
}

variable "validate_project_name" {
  type = string
}

variable "plan_project_name" {
  type = string
}

variable "apply_project_name" {
  type = string
}

resource "aws_codepipeline" "terraform" {
  name     = "terraform-infra"
  role_arn = var.codepipeline_role_arn

  artifact_store {
    type     = "S3"
    location = var.artifact_bucket

    encryption_key {
      id   = var.artifact_kms_key_arn
      type = "KMS"
    }
  }

  stage {
    name = "Source"

    action {
      name             = "GitHub"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["SourceArtifact"]

      configuration = {
        ConnectionArn        = var.connection_arn
        FullRepositoryId     = var.repository_id
        BranchName           = var.source_branch
        OutputArtifactFormat = "CODE_ZIP"
      }
    }
  }

  stage {
    name = "Validate"

    action {
      name            = "ValidateTerraform"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["SourceArtifact"]

      configuration = {
        ProjectName = var.validate_project_name
      }
    }
  }

  stage {
    name = "Plan"

    action {
      name             = "CreatePlan"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["SourceArtifact"]
      output_artifacts = ["TfPlan"]

      configuration = {
        ProjectName = var.plan_project_name
      }
    }
  }

  stage {
    name = "Review"

    action {
      name     = "ApprovePlan"
      category = "Approval"
      owner    = "AWS"
      provider = "Manual"
      version  = "1"

      configuration = {
        CustomData = "Revisa el artefacto TfPlan de esta ejecución antes de aprobar."
      }
    }
  }

  stage {
    name = "Apply"

    action {
      name            = "ApplyReviewedPlan"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["SourceArtifact", "TfPlan"]

      configuration = {
        ProjectName   = var.apply_project_name
        PrimarySource = "SourceArtifact"
      }
    }
  }
}
~~~

Plan publica un artefacto llamado <code>TfPlan</code>. Apply recibe tanto ese artefacto como <code>SourceArtifact</code> de la misma ejecución. <code>PrimarySource</code> hace que CodeBuild abra el buildspec desde el código fuente y lo deje disponible en <code>CODEBUILD_SRC_DIR</code>; el segundo artefacto queda en <code>CODEBUILD_SRC_DIR_TfPlan</code>. La referencia de AWS detalla los [artefactos de entrada y salida de CodeBuild](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeBuild.html).

## Usá buildspecs que transportan el plan aprobado

Guardá estos tres archivos en la raíz del repositorio. La imagen configurada en los proyectos CodeBuild debe incluir la versión exacta de Terraform que probaste. El proyecto Apply usa <code>SourceArtifact</code> como su fuente primaria, tal como se define en el recurso anterior.

### Validación sin acceso al estado

~~~yaml
version: 0.2

phases:
  install:
    commands:
      - terraform version
      - test -f .terraform.lock.hcl
  build:
    commands:
      - terraform -chdir="$CODEBUILD_SRC_DIR" init -backend=false -input=false -lockfile=readonly
      - terraform -chdir="$CODEBUILD_SRC_DIR" fmt -check -recursive
      - terraform -chdir="$CODEBUILD_SRC_DIR" validate
~~~

<code>terraform validate</code> comprueba la configuración inicializada; no verifica permisos, cuotas, políticas de seguridad ni si AWS aceptará cada cambio. El uso de <code>-backend=false</code> permite validar sin dar acceso al estado remoto.

### Plan y artefacto para revisar

~~~yaml
version: 0.2

phases:
  install:
    commands:
      - terraform version
      - test -f "$CODEBUILD_SRC_DIR/.terraform.lock.hcl"
  pre_build:
    commands:
      - test -n "$CODEBUILD_RESOLVED_SOURCE_VERSION"
      - rm -rf /tmp/terraform-project
      - mkdir -p /tmp/terraform-project
      - cp -a "$CODEBUILD_SRC_DIR/." /tmp/terraform-project/
      - mkdir -p "$CODEBUILD_SRC_DIR/pipeline-output"
      - cd /tmp/terraform-project && terraform init -input=false -lockfile=readonly
  build:
    commands:
      - cd /tmp/terraform-project && terraform plan -input=false -lock-timeout=5m -out="$CODEBUILD_SRC_DIR/pipeline-output/tfplan" > /dev/null
      - cd /tmp/terraform-project && terraform show -no-color "$CODEBUILD_SRC_DIR/pipeline-output/tfplan" > "$CODEBUILD_SRC_DIR/pipeline-output/plan.txt"
      - printf '%s\n' "$CODEBUILD_RESOLVED_SOURCE_VERSION" > "$CODEBUILD_SRC_DIR/pipeline-output/source-commit.txt"

artifacts:
  base-directory: pipeline-output
  files:
    - tfplan
    - plan.txt
    - source-commit.txt
~~~

La salida de CodeBuild contiene tres archivos: el plan binario, una vista legible para revisión y el identificador del commit. CodePipeline los empaqueta como <code>TfPlan</code>. En el historial de la ejecución, abrí la acción Plan y la pestaña Artifacts para revisar ese archivo antes de aprobar; la [documentación de CodePipeline explica cómo ver los artefactos](https://docs.aws.amazon.com/codepipeline/latest/userguide/executions-view.html).

### Aplicar el mismo plan del mismo commit

~~~yaml
version: 0.2

phases:
  install:
    commands:
      - terraform version
      - test -f "$CODEBUILD_SRC_DIR/.terraform.lock.hcl"
  pre_build:
    commands:
      - test -n "$CODEBUILD_RESOLVED_SOURCE_VERSION"
      - test -f "$CODEBUILD_SRC_DIR_TfPlan/tfplan"
      - test "$(cat "$CODEBUILD_SRC_DIR_TfPlan/source-commit.txt")" = "$CODEBUILD_RESOLVED_SOURCE_VERSION"
      - rm -rf /tmp/terraform-project
      - mkdir -p /tmp/terraform-project
      - cp -a "$CODEBUILD_SRC_DIR/." /tmp/terraform-project/
      - cd /tmp/terraform-project && terraform init -input=false -lockfile=readonly
  build:
    commands:
      - cd /tmp/terraform-project && terraform apply -input=false -lock-timeout=5m "$CODEBUILD_SRC_DIR_TfPlan/tfplan"
~~~

El marcador compara el commit usado por Plan y Apply. Ambos extraen el código fuente de la misma ejecución, lo copian a <code>/tmp/terraform-project</code> y ejecutan <code>cd</code> antes de cada comando Terraform. Así el directorio efectivo, el backend S3 y el bloqueo <code>.tflock</code> coinciden en las dos etapas. También inicializan desde el mismo <code>.terraform.lock.hcl</code>. Terraform aplica el archivo recibido; no ejecuta un segundo <code>terraform plan</code> ni selecciona otro artefacto. Si otra ejecución guardó cambios en el estado después del plan, Terraform rechaza el plan guardado por obsoleto y hay que reiniciar desde Plan.

La aprobación manual detiene el flujo hasta que una identidad autorizada aprueba o rechaza la acción. La aprobación vence si no se resuelve dentro de siete días. La persona que aprueba necesita permiso para leer el artefacto cifrado y su clave KMS, además del permiso de CodePipeline para aprobar. La guía de AWS explica [cómo funcionan las aprobaciones manuales](https://docs.aws.amazon.com/codepipeline/latest/userguide/approvals.html).

## Separá roles y permisos por etapa

No adjuntes <code>AWSCodePipelineFullAccess</code> o <code>AWSCodeBuildAdminAccess</code> a los roles de ejecución. Son permisos administrativos que no describen lo que necesita este flujo. Diseñá políticas para los ARNs y operaciones reales del proyecto:

| Identidad | Acceso necesario |
| --- | --- |
| CodePipeline | Usar la conexión específica; leer y escribir artefactos en el bucket; usar su clave KMS; iniciar y consultar los tres proyectos CodeBuild. |
| CodeBuild Validate | Leer <code>SourceArtifact</code> del bucket de artefactos, descifrarlo y escribir logs. Sin permisos para el backend ni para modificar la cuenta objetivo. |
| CodeBuild Plan | Lo común a CodeBuild, más lectura del backend S3 y su bloqueo; lectura de los recursos y fuentes de datos que administre Terraform. Debe escribir y cifrar el artefacto <code>TfPlan</code>, pero no cambiar los recursos administrados. |
| CodeBuild Apply | Lo común a CodeBuild, más lectura y descifrado de <code>TfPlan</code>, backend S3 y su bloqueo; acciones de crear, actualizar o eliminar los recursos que esta configuración realmente administra. Limita <code>iam:PassRole</code> a los roles de servicio concretos que Terraform necesite pasar. |
| Revisor | Leer el plan protegido y aprobar o rechazar la acción. No necesita asumir el rol de Apply. |

Como base común, cada rol de CodeBuild necesita leer <code>SourceArtifact</code> desde el bucket de artefactos, descifrar sus objetos con la clave KMS configurada y escribir logs en CloudWatch. Plan necesita además escribir el artefacto de salida <code>TfPlan</code> y cifrarlo con esa clave; Apply necesita leer y descifrarlo. Validate no requiere permisos para escribir artefactos de salida en este flujo. Limitá S3 al bucket y al prefijo de objetos de artefactos que realmente usa este pipeline, y KMS al ARN de su clave; incluí el rol en la política de la clave cuando corresponda. Los permisos concretos pueden variar con la configuración del proyecto y la clave, así que contrastalos con las referencias de [artefactos de CodePipeline](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeBuild.html), [cifrado de CodeBuild](https://docs.aws.amazon.com/codebuild/latest/userguide/security-encryption.html) y [rol de servicio de CodeBuild](https://docs.aws.amazon.com/codebuild/latest/userguide/setting-up-service-role.html).

El rol de CodePipeline requiere las dos acciones que documenta AWS para usar conexiones, <code>codeconnections:UseConnection</code> y <code>codestar-connections:UseConnection</code>, sobre el ARN de conexión correspondiente; además inicia y consulta solo estos tres proyectos CodeBuild y maneja los artefactos del pipeline. Los permisos de CodeBuild para la cuenta destino dependen de cada proveedor y recurso Terraform; no existe una política universal segura para una configuración desconocida. AWS recomienda limitar el rol de servicio de [CodeBuild al mínimo necesario](https://docs.aws.amazon.com/codebuild/latest/userguide/setting-up-service-role.html).

Si el pipeline vive en una cuenta de herramientas y administra otra cuenta, asigná roles de Plan y Apply separados en cada cuenta destino. El rol del proyecto CodeBuild debe poder ejecutar <code>sts:AssumeRole</code> sobre el rol concreto; la política de confianza del rol de destino debe aceptar el ARN de ese rol CodeBuild. La política de permisos del rol asumido define las acciones permitidas dentro de la cuenta destino. El backend central puede requerir otro acceso separado. Para ver un ejemplo de confianza entre cuentas aplicado a CodeBuild, consultá [políticas de confianza y acceso entre cuentas](https://dondeaprendoaws.com/blog/politicas-de-confianza-aws-acceso-entre-cuentas/).

La charla [Estrategias avanzadas: despliegues multiaccount con CDK y CodePipeline](https://www.youtube.com/watch?v=IikiBrUpiyM), de AWS Girls Chile, aborda permisos, seguridad y organización entre cuentas. Es una grabación de 2024 que usa CDK: aprovecha la explicación de roles y límites entre cuentas, y adapta la implementación al flujo de Terraform y al plan aprobado descritos aquí.

Quienes puedan editar el buildspec, el proyecto CodeBuild o el pipeline pueden cambiar qué código ejecuta el rol Apply. Protegé esos cambios con revisión, controles de rama y permisos de administración más estrictos. No entregues claves IAM de larga duración en variables del proyecto ni en el repositorio: CodeBuild obtiene credenciales temporales del rol de servicio.

## Protegé los planes y el estado

Un plan binario puede contener la configuración completa, el estado previo y valores sensibles en texto claro. Marcar una variable como sensible oculta algunos valores en la terminal, pero no cifra el archivo de plan o el estado. <code>plan.txt</code> también puede revelar detalles de infraestructura o secretos no marcados.

- Cifrá el bucket de artefactos y el estado; limita el acceso a los roles de pipeline y revisores que los necesitan.
- No imprimas el plan completo en logs de acceso amplio. El buildspec anterior lo guarda como artefacto para lectura autorizada.
- No subas planes, estado o variables con secretos a Git.
- Si los valores sensibles se incluyen en configuración administrada, revisá qué guarda el proveedor en estado y en los planes antes de conectarlos a CI.

HashiCorp describe qué se conserva en los [planes guardados](https://developer.hashicorp.com/terraform/cli/commands/plan) y cómo [gestionar datos sensibles](https://developer.hashicorp.com/terraform/language/manage-sensitive-data). El cifrado KMS del bucket protege los objetos en reposo, pero cualquier identidad que pueda descifrar el plan debe tratarse como una identidad con acceso a sus valores.

## Errores frecuentes

### CodePipeline falla al usar CodeConnections

Comprobá que la conexión esté <code>AVAILABLE</code>, que corresponda a la misma región del pipeline y que el ARN esté bien copiado. Revisá las dos acciones IAM de CodeConnections en el rol de CodePipeline y el acceso al repositorio autorizado por la aplicación instalada.

### <code>terraform init</code> falla con bloqueo o acceso denegado en S3

Verificá el nombre del bucket, la clave de estado, la región y los permisos separados para el objeto del estado y <code>.tflock</code>. Si usás KMS, revisá tanto la política de IAM como la política de la clave. No resuelvas el error con permisos de administrador ni desactivando el bloqueo.

### Apply indica que el plan está obsoleto

Otra ejecución de Terraform pudo guardar un estado nuevo mientras la aprobación estaba pendiente. En ese caso, el plan guardado ya no corresponde al serial actual y Apply debe fallar. Un cambio manual directo en AWS, en cambio, no actualiza por sí solo el estado de Terraform y no garantiza que el plan se rechace como obsoleto; puede aparecer al refrescar, causar un error del proveedor o dejar el resultado distinto del revisado. No recalcules el plan durante Apply ni intentes forzar el archivo anterior. Investigá el estado y cualquier cambio externo, iniciá una ejecución nueva y pedí otra aprobación.

### ¿Terraform hace rollback si falla Apply?

No como una transacción. Algunos recursos pueden haber cambiado antes del error. Detené otras ejecuciones sobre el mismo estado, comprobá qué cambió en AWS y en el estado, corregí la configuración y generá un plan nuevo. No uses <code>terraform destroy</code> como rollback automático en producción.

### Avisos de ejecuciones

Si necesitas seguir el inicio, éxito, fallo o cancelación de una ejecución, el repositorio [notificaciones de CodePipeline con SNS, Lambda y Slack](https://github.com/JonasCC8/AWS-CodePipeline-SNS-Lambda-Slack-Notifications) describe ese recorrido y su montaje manual. Lee el diseño para adaptarlo a tus eventos y región; conserva el webhook de Slack como un secreto y verifica los permisos de cada componente. El material contiene instrucciones y un ejemplo, sin una plantilla de despliegue completa.

## Recursos y comunidad AWS en español

Para complementar la revisión de infraestructura como código, puedes ver esta demostración comunitaria de [revisión de Terraform con Kiro headless en GitHub Actions](https://blog.295devops.com/pipelines-que-piensan-infra-que-no-rompe-kiro-headless-mode-en-acci-n). El artículo muestra cómo comenta hallazgos de IaC en un pull request; requiere una clave de Kiro y presenta una implementación concreta. Puede complementar el análisis, pero no reemplaza validaciones deterministas, privilegios mínimos ni revisión humana.

Al 6 de octubre de 2026, la comunidad estudiantil AWS de la UTN Facultad Regional Córdoba anuncia el encuentro presencial [AWS Gaming Lab: ECS, CI/CD y la magia de Terraform](https://prensa.frc.utn.edu.ar/eventos/aws-gaming-lab-ecs-ci-cd-y-la-magia-de-terraform/), el sábado 10 de octubre. Es gratuito con inscripción previa y está destinado a estudiantes de Ingeniería en Sistemas de Información. La charla principal empieza a las 12:00, con acreditación desde las 11:30; la inscripción se gestiona en [Meetup](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/).

Si te interesa la seguridad del flujo de entrega, el [encuentro online DevSecOps con agentes de IA](https://www.meetup.com/awssecuritylatam/events/316875555/) está anunciado para el 15 de octubre de 2026, de 16:00 a 17:00, hora de Perú. Lo organiza AWS Security Users Group LatAm; el enlace de conexión se habilita para participantes registrados. Verificá inscripción, disponibilidad y condiciones en Meetup antes de asistir.

Para buscar una comunidad general de AWS en tu país, consultá el [directorio oficial de AWS User Groups](https://builder.aws.com/community/user-groups), que reúne grupos locales y encuentros presenciales o virtuales. También podés explorar [AWS Security Users Group LatAm en Meetup](https://www.meetup.com/awssecuritylatam/) para seguir sus próximas sesiones.

Si preferís comparar otro orquestador para Terraform, la guía de [Terraform con GitHub Actions en AWS](https://dondeaprendoaws.com/blog/como-integrar-terraform-con-cicd-en-aws/) muestra otro flujo de CI/CD. La herramienta cambia; la regla se mantiene: revisá y aplicá el mismo plan, producido por el commit que aprobaste.
