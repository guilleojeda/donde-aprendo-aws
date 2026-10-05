---
title: "Infraestructura como código en AWS con Terraform: guía práctica de S3"
description: "Crea un bucket S3 privado con Terraform y el proveedor de AWS. Aprende a iniciar, validar, revisar el plan, aplicar y destruir cambios, y a proteger el estado con un backend remoto."
author: "guille-ojeda"
publishedAt: "2024-03-18"
publishedTimestamp: "2024-03-18T00:48:17.194Z"
modifiedTimestamp: "2026-10-05T20:43:59-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Infraestructura como código en AWS con CloudFormation: guía práctica"
    url: "https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/"
  - title: "AWS Session Manager: cómo configurar el acceso a EC2"
    url: "https://dondeaprendoaws.com/blog/como-configurar-y-utilizar-aws-session-manager/"
  - title: "Seguridad de IaC en AWS: 9 controles para Terraform y CloudFormation"
    url: "https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/"
---

Terraform es una herramienta de infraestructura como código de HashiCorp. Se conecta con AWS mediante el proveedor oficial `hashicorp/aws`; no existe un producto de AWS llamado “AWS Terraform”. Aquí crearás un bucket S3 privado, revisarás los cambios con `terraform plan` y guardarás de forma segura el estado que Terraform usa para relacionar tu código con los recursos reales.

`terraform apply` y `terraform destroy` modifican recursos de AWS cuando se ejecutan con credenciales válidas. Revisa cuenta, perfil, región, plan y permisos antes de confirmar, y practica en un entorno aislado.

## Requisitos

Los ejemplos de terminal usan Bash o Zsh; adapta la sintaxis de variables si trabajas con PowerShell.

Instala Terraform CLI desde la [guía oficial de instalación](https://developer.hashicorp.com/terraform/install) y la AWS CLI. Este ejemplo requiere Terraform 1.10 o posterior para poder usar el bloqueo moderno del backend S3 que aparece más adelante. Comprueba tu versión:

```sh
terraform version
```

Configura un perfil de AWS IAM Identity Center para obtener credenciales temporales y verifica la identidad:

```sh
aws configure sso --profile iac-lab
aws sso login --profile iac-lab
export AWS_PROFILE=iac-lab
export AWS_REGION=us-east-1
aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION"
```

Usa un rol con solo los permisos necesarios para administrar los recursos declarados. Cambia `AWS_REGION` y la región del bloque `provider` si vas a usar otra región. Evita credenciales de larga duración en archivos `.tf`, comandos guardados o repositorios. El proveedor de AWS puede tomar credenciales del perfil configurado por AWS CLI, de variables de entorno y de otros mecanismos documentados; no necesitas escribir claves en el bloque `provider`. Consulta cómo [autenticar el proveedor de AWS](https://developer.hashicorp.com/terraform/tutorials/configuration-language/configure-providers#authenticate-your-provider) y cómo [configurar IAM Identity Center en AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html).

## 1. Declara el proveedor y el bucket

Guarda este archivo como `main.tf` en un directorio de trabajo:

```hcl
terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "private" {
  bucket_prefix = "iac-private-demo-"

  tags = {
    Purpose   = "iac-learning"
    ManagedBy = "Terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "private" {
  bucket                  = aws_s3_bucket.private.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "private" {
  bucket = aws_s3_bucket.private.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

output "bucket_name" {
  description = "Nombre asignado al bucket privado."
  value       = aws_s3_bucket.private.id
}
```

Terraform crea un nombre de bucket a partir de este prefijo y un sufijo generado. El recurso de bloqueo deshabilita las cuatro rutas de acceso público por ACL y políticas; el cifrado configura AES-256 administrado por S3. Eso evita que el ejemplo dependa de una ACL obsoleta, pero no sustituye a IAM: el acceso de identidades autorizadas sigue dependiendo de sus permisos.

La restricción `~> 6.0` acepta versiones compatibles de la serie 6 del proveedor. Al ejecutar `terraform init`, Terraform selecciona una versión concreta dentro de esa restricción y registra la selección y sus hashes en `.terraform.lock.hcl`. Conserva ese archivo en control de versiones. Para actualizar el proveedor de manera intencional, revisa la nueva versión y los cambios del lock file, ejecuta un plan y confirma que no propone cambios inesperados. No uses `terraform init -upgrade` como actualización automática sin revisar el resultado. Consulta [requisitos de proveedores](https://developer.hashicorp.com/terraform/language/providers/requirements), [archivos de bloqueo](https://developer.hashicorp.com/terraform/language/files/dependency-lock) y la [documentación del recurso S3](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket).

## 2. Inicializa y valida

Desde el directorio donde guardaste `main.tf`, inicializa Terraform:

```sh
terraform init
```

Este comando descarga el proveedor dentro de la restricción declarada y crea o actualiza `.terraform.lock.hcl`. Después formatea y valida la configuración:

```sh
terraform fmt
terraform validate
```

`terraform validate` comprueba la configuración local con los esquemas de los proveedores instalados; no crea recursos ni sustituye la revisión del plan.

## 3. Revisa y aplica un plan

Genera un plan guardado y muéstralo antes de aplicarlo:

```sh
terraform plan -out=terraform.plan
terraform show terraform.plan
```

Busca el recurso que se agregará y confirma que no haya reemplazos o eliminaciones no esperadas. El plan refleja el estado y la información que Terraform pudo consultar en ese momento; una API, un permiso, una cuota o un cambio externo pueden provocar un fallo durante la aplicación. El archivo del plan puede contener valores sensibles, así que no lo publiques ni lo guardes en control de versiones.

Cuando hayas revisado el plan y quieras aplicar exactamente esas acciones, ejecuta:

```sh
terraform apply terraform.plan
terraform output bucket_name
```
Comprueba las opciones del bucket en AWS usando el nombre que muestra la salida:

```sh
aws s3api get-public-access-block \
  --bucket "$(terraform output -raw bucket_name)" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

aws s3api get-bucket-encryption \
  --bucket "$(terraform output -raw bucket_name)" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Confirma que las cuatro opciones de bloqueo público estén en `true` y que el cifrado use `AES256`.

Al aplicar un archivo de plan guardado, Terraform ejecuta lo que muestra ese archivo y no vuelve a pedir la misma confirmación interactiva. Protege el archivo y úsalo solo después de revisarlo.

Para cambiar la configuración, edita `main.tf`, repite `terraform fmt`, `terraform validate` y `terraform plan`, y aplica solo el plan revisado. Terraform muestra si una acción actualiza, crea, destruye o reemplaza recursos; una modificación del nombre físico de un bucket puede exigir reemplazarlo. Si la acción no es la que buscas, detente y corrige la configuración antes de aplicar.

## 4. Protege el estado

Terraform mantiene un archivo de estado que relaciona los recursos configurados con los objetos reales de AWS. De forma predeterminada, una práctica individual pequeña puede usar estado local, pero ese archivo y los planes pueden contener datos sensibles aunque una salida esté marcada como sensible. No subas `terraform.tfstate`, sus copias, `.terraform/` ni planes al repositorio.

En un equipo, configura un backend remoto antes de compartir ejecuciones. El backend S3 guarda el estado en un bucket separado y preexistente. Crea ese bucket con acceso privado, cifrado, versionado y permisos de IAM limitados al objeto del estado y al archivo de bloqueo. No uses el bucket de aplicación de este ejemplo como su propio backend.

Esta configuración es un ejemplo de backend para agregar al bloque `terraform` cuando ya tengas ese bucket:

```hcl
terraform {
  backend "s3" {
    bucket       = "reemplaza-por-un-bucket-de-estado-existente"
    key          = "tutorial/s3-privado/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

Después de configurarlo, vuelve a ejecutar `terraform init` y acepta la migración del estado local solo si verificaste que destino y cuenta son correctos. Las credenciales de backend y las del proveedor deben estar disponibles sin guardarlas en el código. El rol del backend necesita `s3:ListBucket` sobre el bucket (limitado al prefijo del estado) y `s3:GetObject` y `s3:PutObject` sobre el objeto de estado. Con `use_lockfile = true`, necesita además `s3:GetObject`, `s3:PutObject` y `s3:DeleteObject` sobre el objeto `.tflock`; no necesita eliminar el objeto de estado. La guía de backend S3 detalla estos permisos.

En el backend S3, el bloqueo está desactivado por defecto y se habilita con `use_lockfile = true`. Terraform bloquea automáticamente durante operaciones que escriben estado cuando el backend soporta locking; no todos los backends lo implementan y el parámetro de CLI `-lock=true` no lo agrega a uno que carece de soporte. No desactives un bloqueo configurado con `-lock=false`. La opción de bloqueo con DynamoDB está obsoleta y HashiCorp indica que se quitará en una versión menor futura; para una configuración nueva, usa el lock file de S3. Consulta la documentación de [backend S3](https://developer.hashicorp.com/terraform/language/backend/s3) y [bloqueo de estado](https://developer.hashicorp.com/terraform/language/state/locking).

## 5. Elimina los recursos de práctica

Si el bucket está vacío y ya no necesitas la pila local, revisa qué administra este directorio y ejecuta:

```sh
terraform destroy
```

Lee el plan de destrucción en pantalla antes de confirmar. S3 no elimina un bucket que aún contiene objetos; vacíalo primero y conserva cualquier dato que necesites. Terraform solo destruye los recursos registrados en el estado de este directorio. S3 cobra según almacenamiento, solicitudes y recuperaciones; si habilitas versionado, también cobra por cada versión conservada. Un bucket pequeño no implica que el uso sea gratuito: consulta los [precios actuales de Amazon S3](https://aws.amazon.com/s3/pricing/) y estima el uso para tu región antes de aplicar.

## Terraform o CloudFormation

CloudFormation administra recursos dentro de pilas desde un servicio nativo de AWS. Terraform trabaja con proveedores y registra el estado que permite planificar cambios; puede gestionar recursos de distintos proveedores y requiere que el equipo resuelva dónde y cómo comparte ese estado. No hay una elección universal: considera el flujo de trabajo existente, los proveedores que necesitas y quién opera el backend. Evita que CloudFormation y Terraform administren a la vez el mismo bucket u otro recurso. Si migras, planifica importación y traspaso de propiedad para que un sistema no borre cambios del otro.

Compara esta guía con el tutorial de [CloudFormation y S3 privado](/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/) y consulta la [guía prescriptiva de AWS sobre herramientas de IaC](https://docs.aws.amazon.com/prescriptive-guidance/latest/choose-iac-tool/choose-tool.html). Si además estás evaluando CDK, mira la charla comunitaria [Infraestructura como código: CDK frente a Terraform](https://www.youtube.com/watch?v=rpLKcZvXGq0), grabada por AWS Girls Chile.

## Recursos, práctica y comunidades

- La [charla de Terraform con Fidel Valero](https://www.youtube.com/watch?v=Y_6-9Et9LIQ), publicada por México in Tech, complementa el flujo del ejemplo.
- La [demostración de ECS con Terraform y GitHub Actions](https://www.youtube.com/watch?v=3ocYjn0Aohc) de Rossana Suárez muestra un escenario posterior con contenedores y CI/CD; es más avanzado que el bucket de esta guía.
- El [workshop de Terraform de Roxs](https://github.com/roxsross/workshop-tfroxs) reúne ejercicios de Docker, LocalStack y AWS. Su ejemplo de S3 para LocalStack declara AWS Provider 5.97.0 y credenciales ficticias dirigidas a `localhost:4566`: úsalo como laboratorio local, no copies esas credenciales ni ese endpoint para conectarte a AWS. Si actualizas el proveedor, revisa el lock file y los cambios de recursos antes de aplicar.
- La página del grupo [AWS SBG at National Technologic University Regional Faculty](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/) describe una comunidad estudiantil de Córdoba que organiza actividades de aprendizaje en AWS.
- En la agenda revisada el 5 de octubre de 2026 figura [AWS Gaming Lab: ECS, CI/CD y la magia de Terraform](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/), presencial el 10 de octubre de 12:00 a 14:00 GMT-3 en UTN FRC, Córdoba. Consulta la ficha de Meetup para condiciones de inscripción. Revisa también la [agenda AWS actualizada](/eventos/) para próximos encuentros.
- Explora más [recursos para aprender AWS](/aprender/), [videos en español](/aprender/videos/), [canales y creadores](/creadores/youtube/) y [comunidades por país](/comunidades/).

Compara esta práctica con el [tutorial de CloudFormation](/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/) y amplía la parte de secretos, estado e IAM con nuestros [controles de seguridad para IaC](/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/). Si después trabajas con instancias EC2 privadas, la guía interna de [AWS Session Manager](/blog/como-configurar-y-utilizar-aws-session-manager/) explica cómo conectarte a ellas.
