---
title: "Cómo integrar Terraform con CI/CD en AWS con GitHub Actions"
description: "Integra Terraform con GitHub Actions en AWS: estado S3 con bloqueo, OIDC, aprobación de producción, revisión del plan y apply del mismo artefacto."
author: "guille-ojeda"
publishedAt: "2025-02-10"
modifiedTimestamp: "2026-10-06T10:03:48-03:00"
publishedTimestamp: "2025-02-10T00:20:47.716Z"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Infraestructura como código en AWS con Terraform: guía práctica de S3"
    url: "https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/"
  - title: "Seguridad de IaC en AWS: 9 controles para Terraform y CloudFormation"
    url: "https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/"

review:
  date: "2026-10-06"
---

Para integrar Terraform con CI/CD en AWS, valida los cambios de los *pull requests* sin acceso a AWS y reserva el despliegue para cambios aprobados en la rama protegida. Esta guía usa GitHub Actions como ejemplo: autentica con AWS mediante OIDC, crea un plan de Terraform, lo guarda como artefacto privado, exige aprobación para producción y aplica exactamente ese plan.

El ejemplo administra un bucket S3 de práctica. No es un pipeline completo para copiar sin preparación: antes debes crear el backend remoto y los roles de IAM, configurar las protecciones del repositorio y elegir dónde guardar los planes. Cada equipo debe ajustar los permisos a sus recursos y controles.

## Flujo de CI/CD para Terraform

El flujo separa la revisión del código del acceso a la cuenta:

1. Un *pull request* ejecuta formato y validación sin credenciales AWS, secretos ni permiso OIDC.
2. Después de integrar el cambio en `main`, un trabajo confiable asume un rol temporal de AWS y genera el plan para una sola cuenta y clave de estado.
3. El pipeline guarda el plan binario y una salida legible en almacenamiento privado. La revisión identifica el *commit*, el número de ejecución y el resumen exactos.
4. Un entorno protegido de GitHub exige autorización humana para producción.
5. El trabajo autorizado descarga el mismo plan, verifica su huella y lo aplica. Si el artefacto venció, cambió el estado o el plan ya no corresponde a la revisión, genera otro plan y solicita aprobación de nuevo.

Esta guía elige GitHub Actions porque el ejemplo usa revisiones de código y protecciones de ramas en GitHub. Si tu equipo usa CodePipeline para este repositorio, puede orquestar las etapas y CodeBuild ejecutar Terraform; agrega una acción de aprobación manual antes de producción. Elige un solo orquestador para aplicar cada clave de estado. Consulta la [documentación de aprobaciones manuales de CodePipeline](https://docs.aws.amazon.com/codepipeline/latest/userguide/approvals.html) para el flujo nativo de AWS.

## Requisitos antes de configurar el pipeline

- Un repositorio con `main` protegida, revisión de *pull requests* y las comprobaciones obligatorias que exige el equipo.
- Un entorno de GitHub llamado, por ejemplo, `production`, protegido para aceptar despliegues solo desde la rama aprobada y con revisores requeridos. La disponibilidad de revisores requeridos depende del plan y la visibilidad del repositorio; comprueba las [reglas de protección de entornos](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
- Un bucket de S3 existente para el estado, separado de los recursos que administra este directorio. Activa versionado, bloqueo de acceso público y cifrado predeterminado. Si necesitas una clave administrada por tu organización, configura SSE-KMS y sus políticas antes de inicializar Terraform.
- Un segundo bucket privado para artefactos del plan. Restringe escritura al rol de plan, lectura al rol de apply y a los revisores autorizados, cifra los objetos y configura una regla de ciclo de vida para borrarlos después de la ventana de revisión.
- El proveedor OIDC de GitHub en IAM, un rol para preparar planes y otro para aplicar cambios, con políticas acotadas a la cuenta, al estado, al artefacto y a los recursos necesarios. Configura en GitHub las variables de repositorio `AWS_ACCOUNT_ID`, `TF_STATE_BUCKET`, `TF_PLAN_BUCKET`, `AWS_TERRAFORM_PLAN_ROLE_ARN` y `AWS_TERRAFORM_APPLY_ROLE_ARN`.
- Una versión de Terraform fijada para los trabajos del pipeline y `.terraform.lock.hcl` versionado. El bloqueo S3 `use_lockfile` de este ejemplo requiere Terraform 1.10.0 o posterior; elige una versión vigente y soportada por tu equipo.

Si recién empiezas con Terraform y AWS, revisa la [guía práctica de IaC con S3](https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/) antes de llevar los comandos a CI.

## Configurar el estado remoto en S3

El backend de S3 guarda el estado fuera del repositorio. Crea y protege ese bucket primero: Terraform no puede usar un bucket como backend antes de que exista ni conviene que el mismo estado administre su propio backend. Activa [versionado de objetos](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html) para recuperar versiones anteriores del estado, [bloqueo de acceso público](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html) y cifrado predeterminado. S3 cifra objetos nuevos con SSE-S3 por defecto; usa SSE-KMS cuando necesites controlar la clave y sus permisos. Consulta la [configuración de cifrado predeterminado de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html).

La configuración única del backend aparece en el módulo de ejemplo. GitHub Actions le pasa el nombre del bucket, la clave `tutorial/s3-demo/terraform.tfstate` y la región al ejecutar `terraform init`; no repitas un segundo bloque de backend para el mismo directorio. Si separas desarrollo y producción, administra cada entorno con una clave de estado distinta y sus propios permisos.

El archivo `.terraform.lock.hcl` fija versiones de proveedores; el archivo remoto `.tflock` coordina operaciones sobre el estado. Son archivos distintos y cumplen funciones distintas.

Con `use_lockfile = true`, el rol del backend necesita `s3:ListBucket` sobre el bucket, limitado al prefijo del estado, y `s3:GetObject` y `s3:PutObject` sobre el objeto de estado. También necesita `s3:GetObject`, `s3:PutObject` y `s3:DeleteObject` sobre el objeto de bloqueo `<key>.tflock`. No concedas `s3:DeleteObject` sobre el propio estado si el flujo no lo requiere. Si configuras `kms_key_id`, Terraform necesita `kms:Encrypt`, `kms:Decrypt` y `kms:GenerateDataKey` sobre esa clave; revisa tanto la política IAM como la política de la clave. La [referencia del backend S3 de Terraform](https://developer.hashicorp.com/terraform/language/backend/s3) incluye ejemplos de estos permisos.

El bloqueo nativo de S3 es opcional y se activa con `use_lockfile`. HashiCorp marca el bloqueo basado en DynamoDB como obsoleto y anuncia que lo quitará en una futura versión menor de Terraform. Para una configuración nueva, usa el archivo de bloqueo S3. Si aún conviven clientes antiguos, Terraform permite configurar temporalmente ambos mecanismos; migra los trabajos, verifica que todos usan una versión compatible y retira DynamoDB después. No borres la tabla mientras algún cliente dependa de ella.

## Una configuración mínima para el ejemplo

El siguiente módulo administra un bucket de práctica privado con cifrado SSE-S3. El bucket de estado debe existir previamente y ser distinto. El backend es parcial a propósito: el workflow pasa sus parámetros no secretos a `terraform init`. Reemplaza el identificador de cuenta y la región; confirma que coincidan con los roles OIDC antes de ejecutar cualquier plan.

```hcl
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }

  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

variable "aws_account_id" {
  type = string
}

provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]
}

resource "aws_s3_bucket" "demo" {
  bucket_prefix = "terraform-cicd-demo-"

  tags = {
    Purpose   = "terraform-cicd-learning"
    ManagedBy = "Terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "demo" {
  bucket                  = aws_s3_bucket.demo.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "demo" {
  bucket = aws_s3_bucket.demo.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

output "bucket_name" {
  value = aws_s3_bucket.demo.id
}
```

El proveedor selecciona una versión permitida y registra la selección en `.terraform.lock.hcl` durante `terraform init`. Antes de habilitar CI, desde la carpeta del módulo ejecuta `terraform init -backend=false -input=false`, revisa y versiona `.terraform.lock.hcl`; conserva ese archivo y usa `terraform init -lockfile=readonly` en los trabajos para que no cambie durante el despliegue. Actualiza el proveedor de forma intencional, revisa el cambio del lock file y genera un plan nuevo. No incluyas claves AWS en `provider`, en `backend` ni en variables versionadas.

## Validar cambios sin dar acceso a AWS al pull request

El trabajo de CI puede ejecutar estas comprobaciones con un backend local desactivado:

```sh
terraform fmt -check -recursive
terraform init -backend=false -input=false -lockfile=readonly
terraform validate -no-color
```

`terraform validate` comprueba la estructura y los esquemas instalados; no verifica permisos AWS, estado remoto, reglas de seguridad de la organización ni el éxito de un futuro despliegue. Puedes añadir análisis de políticas, pero valida el plan o artefacto que realmente se desplegará.

Los *pull requests*, incluidas las contribuciones de *forks*, ejecutan código que puede cambiar el propio workflow, proveedores o módulos. No les entregues secretos ni tokens OIDC. Evita `pull_request_target` si después haces *checkout* o ejecutas código no confiable del *pull request*. Limita el token de GitHub a `contents: read` y fija las acciones de terceros a un SHA completo revisado.

## OIDC y permisos para los trabajos de plan y apply

OIDC permite que GitHub intercambie la identidad del trabajo por credenciales temporales de AWS STS sin guardar claves IAM de larga duración como secretos. La acción oficial [`configure-aws-credentials`](https://github.com/aws-actions/configure-aws-credentials) hace el intercambio. El trabajo necesita `id-token: write` para solicitar el token; ese permiso permite obtener el token OIDC, no concede por sí solo acceso a recursos AWS.

Da `id-token: write` solo a los trabajos confiables de plan y aplicación. Restringe la relación de confianza de IAM por `aud` y `sub` al repositorio, rama o entorno exactos. No uses un comodín que deje asumir el rol a cualquier repositorio de GitHub. La forma de `sub` depende de si el trabajo usa un entorno y del formato de identidad configurado en el repositorio; GitHub indica que los repositorios creados desde el 15 de julio de 2026, o que habilitaron esa opción, incluyen identificadores inmutables de organización y repositorio. Genera la condición a partir del formato vigente de tu repositorio siguiendo la [guía de GitHub OIDC para AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) y la [recomendación de IAM para limitar el `sub`](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html).

Usa un rol de plan con permisos de lectura sobre los recursos que consultan el proveedor y los *data sources*, más acceso al estado, al `.tflock`, a KMS si corresponde y permiso de escritura en el prefijo de artefactos. No es un rol de IAM “solo lectura”: el backend debe escribir y eliminar su archivo de bloqueo. El rol de aplicación necesita lectura del artefacto, las acciones de escritura específicas de los recursos administrados y los permisos de lectura que requieren las verificaciones posteriores. Ambos roles del ejemplo usan credenciales temporales para la misma cuenta de destino. `allowed_account_ids` limita el proveedor; si configuras credenciales o `assume_role` distintos para el backend, verifica también esa identidad por separado.

## Workflow mínimo con GitHub Actions

Guarda el siguiente archivo como `.github/workflows/terraform.yml`. Valida los *pull requests* sin AWS y, después de un *push* a `main`, crea un plan con OIDC, lo guarda en el bucket privado de artefactos y solicita aprobación mediante el entorno `production`. `apply` descarga el artefacto de la misma ejecución, comprueba el *commit*, la ejecución y la huella del paquete, y aplica el plan guardado. Reemplaza las variables y configura los roles, buckets, permisos y protección de entorno descritos arriba; el código no crea esos recursos.

El ejemplo fija Terraform `1.16.5`, publicado el 2 de octubre de 2026. Cada acción está fijada al SHA completo del release verificado para esta revisión. Para un repositorio real, actualiza estas versiones mediante una revisión de cambios.

```yaml
name: terraform-s3-demo

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: terraform-tutorial-s3-demo-${{ github.ref }}
  cancel-in-progress: false

env:
  AWS_REGION: us-east-1
  AWS_ACCOUNT_ID: ${{ vars.AWS_ACCOUNT_ID }}
  TF_VAR_aws_account_id: ${{ vars.AWS_ACCOUNT_ID }}
  TF_VERSION: "1.16.5"
  TF_STATE_BUCKET: ${{ vars.TF_STATE_BUCKET }}
  TF_STATE_KEY: tutorial/s3-demo/terraform.tfstate
  TF_PLAN_BUCKET: ${{ vars.TF_PLAN_BUCKET }}
  TF_PLAN_PREFIX: terraform-tutorial-s3-demo

jobs:
  validate:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e # v4.0.1
        with:
          terraform_version: ${{ env.TF_VERSION }}
          terraform_wrapper: false
      - run: terraform fmt -check -recursive
      - run: terraform init -backend=false -input=false -lockfile=readonly
      - run: terraform validate -no-color

  plan:
    if: github.event_name == 'push'
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      id-token: write
    outputs:
      artifact_uri: ${{ steps.publish.outputs.uri }}
      artifact_sha256: ${{ steps.publish.outputs.sha256 }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.sha }}
      - uses: hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e # v4.0.1
        with:
          terraform_version: ${{ env.TF_VERSION }}
          terraform_wrapper: false
      - uses: aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0
        with:
          role-to-assume: ${{ vars.AWS_TERRAFORM_PLAN_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
          role-session-name: terraform-plan-${{ github.run_id }}
      - name: Crear y publicar el plan
        id: publish
        run: |
          account="$(aws sts get-caller-identity --query Account --output text)"
          test "$account" = "$AWS_ACCOUNT_ID"

          terraform init -input=false -lockfile=readonly \
            -backend-config="bucket=$TF_STATE_BUCKET" \
            -backend-config="key=$TF_STATE_KEY" \
            -backend-config="region=$AWS_REGION"
          terraform validate -no-color
          terraform plan -input=false -out=tfplan > /dev/null
          # El plan binario y el resumen pueden contener valores sensibles.
          # No los publiques en los logs ni en el resumen de GitHub.
          terraform show -no-color tfplan > tfplan.txt

          printf '%s\n' "$GITHUB_SHA" > plan.commit
          printf '%s\n' "$GITHUB_RUN_ID" > plan.run
          printf '%s\n' "$GITHUB_RUN_ATTEMPT" > plan.attempt
          printf '%s\n' "$TF_VERSION" > plan.terraform-version
          tar -czf tfplan.tgz tfplan tfplan.txt plan.commit plan.run plan.attempt plan.terraform-version

          key="$TF_PLAN_PREFIX/$GITHUB_RUN_ID/$GITHUB_RUN_ATTEMPT/$GITHUB_SHA/tfplan.tgz"
          uri="s3://$TF_PLAN_BUCKET/$key"
          aws s3 cp tfplan.tgz "$uri"
          digest="$(sha256sum tfplan.tgz | cut -d ' ' -f 1)"
          printf 'uri=%s\n' "$uri" >> "$GITHUB_OUTPUT"
          printf 'sha256=%s\n' "$digest" >> "$GITHUB_OUTPUT"
          printf 'Commit: %s\nRun: %s, intento: %s\nArtefacto: %s\nSHA-256: %s\n' \
            "$GITHUB_SHA" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$uri" "$digest" \
            >> "$GITHUB_STEP_SUMMARY"

  apply:
    needs: plan
    if: github.event_name == 'push'
    runs-on: ubuntu-24.04
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.sha }}
      - uses: hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e # v4.0.1
        with:
          terraform_version: ${{ env.TF_VERSION }}
          terraform_wrapper: false
      - uses: aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0
        with:
          role-to-assume: ${{ vars.AWS_TERRAFORM_APPLY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
          role-session-name: terraform-apply-${{ github.run_id }}
      - name: Descargar y verificar el plan aprobado
        env:
          PLAN_URI: ${{ needs.plan.outputs.artifact_uri }}
          PLAN_SHA256: ${{ needs.plan.outputs.artifact_sha256 }}
        run: |
          account="$(aws sts get-caller-identity --query Account --output text)"
          test "$account" = "$AWS_ACCOUNT_ID"
          aws s3 cp "$PLAN_URI" tfplan.tgz
          digest="$(sha256sum tfplan.tgz | cut -d ' ' -f 1)"
          test "$digest" = "$PLAN_SHA256"
          tar -xzf tfplan.tgz
          test "$(cat plan.commit)" = "$GITHUB_SHA"
          test "$(cat plan.run)" = "$GITHUB_RUN_ID"
          test "$(cat plan.attempt)" = "$GITHUB_RUN_ATTEMPT"
          test "$(cat plan.terraform-version)" = "$TF_VERSION"
      - name: Aplicar el plan exacto
        run: |
          terraform init -input=false -lockfile=readonly \
            -backend-config="bucket=$TF_STATE_BUCKET" \
            -backend-config="key=$TF_STATE_KEY" \
            -backend-config="region=$AWS_REGION"
          if terraform apply -input=false tfplan > terraform-apply.log 2>&1; then
            aws s3 cp terraform-apply.log \
              "s3://$TF_PLAN_BUCKET/$TF_PLAN_PREFIX/$GITHUB_RUN_ID/$GITHUB_RUN_ATTEMPT/$GITHUB_SHA/terraform-apply.log"
          else
            aws s3 cp terraform-apply.log \
              "s3://$TF_PLAN_BUCKET/$TF_PLAN_PREFIX/$GITHUB_RUN_ID/$GITHUB_RUN_ATTEMPT/$GITHUB_SHA/terraform-apply-failed.log"
            echo "Terraform apply falló; revisa el diagnóstico en el bucket privado de artefactos." >&2
            exit 1
          fi
      - name: Verificar bloqueo público y cifrado del bucket
        run: |
          bucket="$(terraform output -raw bucket_name)"
          public_block="$(aws s3api get-public-access-block \
            --bucket "$bucket" \
            --query 'PublicAccessBlockConfiguration && PublicAccessBlockConfiguration.BlockPublicAcls && PublicAccessBlockConfiguration.IgnorePublicAcls && PublicAccessBlockConfiguration.BlockPublicPolicy && PublicAccessBlockConfiguration.RestrictPublicBuckets' \
            --output text)"
          test "$public_block" = "True"
          encryption="$(aws s3api get-bucket-encryption \
            --bucket "$bucket" \
            --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' \
            --output text)"
          test "$encryption" = "AES256"
          echo "Bloqueo público completo y cifrado SSE-S3 verificados."
```

El rol de plan necesita lectura de los recursos consultados, acceso al estado y al `.tflock`, permisos KMS si corresponden y `s3:PutObject` en el prefijo del artefacto. El rol de aplicación necesita `s3:GetObject` para descargar el plan, `s3:PutObject` para guardar el log de aplicación y los permisos de administración y verificación de los recursos de ejemplo. Los revisores necesitan una vía privada para descargar el paquete antes de aprobarlo; no copies `tfplan.txt` al resumen público del workflow porque puede contener valores sensibles. El ejemplo no define variables sensibles; si agregas secretos o datos sensibles, mantenlos también fuera de logs y salidas públicas. Retén el paquete solo durante la ventana de aprobación.

El lock S3 se libera al terminar `plan`; no queda tomado durante la espera de aprobación. La concurrencia del workflow serializa ejecuciones de esta clave y el lock protege también frente a otras herramientas. El plan no detecta por sí solo cambios hechos directamente en AWS después de generarlo. Si una ejecución cambia el estado, vence la ventana de aprobación o detectas señales de drift, genera y revisa un plan nuevo. No generes un plan distinto en el trabajo `apply`.

El trabajo de verificación falla si las cuatro opciones de acceso público no están en `true` o el cifrado no es `AES256`. Para otros recursos, agrega una comprobación de solo lectura que mida el resultado esperado, además de alarmas o pruebas funcionales relevantes para el servicio.

## Errores comunes de Terraform en CI/CD

### `Error acquiring the state lock`

Comprueba si otro trabajo usa esa clave y espera a que termine. Asegúrate de que la concurrencia del pipeline y el `key` de backend separen entornos. No borres el objeto `.tflock` a mano ni desactives el bloqueo con `-lock=false`. Usa `terraform force-unlock <LOCK_ID>` solo si confirmaste que el proceso que creó ese bloqueo terminó y el desbloqueo automático falló; aplica únicamente al identificador de bloqueo de tu ejecución. Lee la [guía de bloqueo de estado de Terraform](https://developer.hashicorp.com/terraform/language/state/locking).

### `AccessDenied` al leer o escribir estado o `.tflock`

Comprueba que `s3:ListBucket` permita el prefijo correcto, que el rol pueda leer y escribir el objeto de estado y que pueda leer, escribir y eliminar el objeto `<key>.tflock`. Si usas SSE-KMS, revisa la política IAM y la política de la clave. No resuelvas el error con acceso de administrador al bucket completo.

### DynamoDB sigue apareciendo en el error de bloqueo

Busca `dynamodb_table` en todos los backends y fija la versión de Terraform utilizada por cada pipeline. Para la migración, conserva temporalmente los dos métodos mientras actualizas clientes que deban coordinarse; retira la tabla solo cuando no quede ningún cliente antiguo. La documentación de [backend S3](https://developer.hashicorp.com/terraform/language/backend/s3) describe los argumentos actuales y los obsoletos.

### El plan aprobado ya no se puede aplicar

Una ejecución concurrente puede actualizar el estado remoto y dejar inválido un plan anterior. También pueden cambiar recursos directamente en AWS sin actualizar el estado. No fuerces la ejecución: investiga qué cambió, prepara un plan nuevo, vuelve a revisar reemplazos y eliminaciones y solicita otra aprobación.

## Fallos parciales, rollback y limpieza

Terraform no hace una transacción que revierta todos los recursos si un `apply` falla: algunos recursos pueden haberse creado o modificado antes del error. No dispares `terraform destroy` como rollback automático en producción. Detén los despliegues concurrentes, revisa los logs del recurso fallido y confirma en AWS y en el estado qué alcanzó a cambiar. Corrige la causa y genera un plan nuevo. Si el objetivo es volver a la configuración previa, revierte el cambio de código, revisa el nuevo plan y aplícalo con autorización. Recuperar una versión anterior del estado desde S3 no restaura por sí solo los recursos de AWS.

Para retirar solo el bucket vacío del ejemplo, confirma que este directorio administre ese recurso y revisa un plan de destrucción antes de aplicarlo:

```sh
terraform plan -destroy -out=destroy.tfplan
terraform show -no-color destroy.tfplan
terraform apply destroy.tfplan
```

Si guardas objetos o versiones en el bucket de práctica, conserva los datos necesarios y vacíalo según la política de retención antes de destruirlo. Mantén el bucket remoto de estado separado y versionado; no lo incluyas en esta limpieza. Configura también la expiración de los planes temporales para que no queden disponibles más tiempo del necesario. S3 y KMS pueden generar cargos por solicitudes, almacenamiento y uso de claves; consulta sus precios para tu región antes de desplegar.

## Recursos y comunidades para seguir aprendiendo

- Para una demostración comunitaria de ECS con Terraform y GitHub Actions, mira la [grabación de 295DevOps sobre ECS, Terraform y GitHub Actions](https://www.youtube.com/watch?v=3ocYjn0Aohc). El [canal 295DevOps](https://www.youtube.com/@295devops) publica contenido de DevOps en español.
- Para una charla general sobre despliegues continuos en AWS, mira [CI/CD en AWS de AWS User Group Guatemala](https://www.youtube.com/watch?v=5WoLzG2fFxc) y explora su [canal de YouTube](https://www.youtube.com/@awsugguatemala). Son recursos comunitarios para ampliar conceptos; revisa los pasos contra la documentación vigente antes de trasladarlos a una cuenta.
- Si estás en Argentina, consulta los próximos encuentros del [AWS User Group Córdoba en Meetup](https://www.meetup.com/aws-user-group-cordoba-argentina/) y del [AWS Student Builder Group de UTN FRC](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/). En la ficha consultada el 6 de octubre de 2026, el grupo de UTN mostraba **AWS Gaming Lab: ECS, CI/CD y la magia de Terraform**, presencial en Córdoba el 10 de octubre, de 12:00 a 14:00 ART. Verifica lugar, disponibilidad y condiciones de inscripción en la [página del evento](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/); no asumas que es gratuito.
- Para encontrar otros grupos y encuentros de la región, explora el directorio de [comunidades AWS](/comunidades/) y la [agenda de eventos](/eventos/).
- Amplía los controles de IAM, OIDC, estado y artefactos con la guía interna de [seguridad de IaC en AWS](/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/).
