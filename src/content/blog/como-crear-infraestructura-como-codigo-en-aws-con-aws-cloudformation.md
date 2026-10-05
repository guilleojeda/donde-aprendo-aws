---
title: "Infraestructura como código en AWS con CloudFormation: guía práctica"
description: "Crea un bucket S3 privado con una plantilla YAML de CloudFormation. Valida el archivo, crea y actualiza una pila con change sets, revisa reemplazos y elimina o conserva recursos."
author: "guille-ojeda"
publishedAt: "2024-03-18"
publishedTimestamp: "2024-03-18T00:54:16.195Z"
modifiedTimestamp: "2026-10-05T20:43:59-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Infraestructura como código en AWS con Terraform: guía práctica de S3"
    url: "https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/"
  - title: "AWS Session Manager: cómo configurar el acceso a EC2"
    url: "https://dondeaprendoaws.com/blog/como-configurar-y-utilizar-aws-session-manager/"
  - title: "Seguridad de IaC en AWS: 9 controles para Terraform y CloudFormation"
    url: "https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/"
---

AWS CloudFormation convierte una plantilla YAML o JSON en una pila de recursos de AWS que puedes crear, actualizar y eliminar como una unidad. En esta guía crearás una pila con un bucket S3 sin acceso público, cifrado por defecto. También verás cómo revisar actualizaciones antes de ejecutarlas, cómo conservar recursos y qué cubren la validación y la detección de drift.

Los comandos que crean, actualizan o eliminan la pila modificarán recursos de tu cuenta si los ejecutas. Revisa antes el perfil, la región, los permisos y los cambios mostrados, y practica en un entorno aislado.

## Qué necesitas

Los ejemplos de terminal usan Bash o Zsh; adapta la sintaxis de variables si trabajas con PowerShell.

- AWS CLI configurado con un perfil autorizado para trabajar con CloudFormation y S3.
- Permisos mínimos para crear, consultar, actualizar y eliminar la pila y para que CloudFormation cree y configure el bucket. En equipos, un rol de servicio con privilegio mínimo puede separar las acciones del operador y de CloudFormation; restringe `iam:PassRole` y recuerda que un rol asociado se usa en las operaciones posteriores de esa pila. Lee la guía de [roles de servicio de CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html). No hacen falta credenciales de largo plazo pegadas en la plantilla.
- Un editor de texto. No necesitas instalar un SDK para usar este ejemplo.

Con AWS IAM Identity Center puedes iniciar sesión y usar credenciales temporales desde un perfil:

```sh
aws sso login --profile iac-lab
export AWS_PROFILE=iac-lab
export AWS_REGION=us-east-1
aws sts get-caller-identity
```

Consulta la guía oficial de AWS CLI para [configurar IAM Identity Center](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html). Confirma que la cuenta y el rol sean los esperados antes de ejecutar comandos que cambien recursos. La identidad que inicia la operación necesita permisos de CloudFormation; el servicio también necesita permisos para aprovisionar el recurso. Si configuras un rol de servicio de CloudFormation, concede solo las acciones y recursos requeridos por la plantilla.

## 1. Escribe una plantilla segura

Guarda este contenido como `bucket-privado.yaml`:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Bucket S3 privado de ejemplo, con cifrado y bloqueo de acceso público.

Resources:
  PrivateBucket:
    Type: AWS::S3::Bucket
    Properties:
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        IgnorePublicAcls: true
        BlockPublicPolicy: true
        RestrictPublicBuckets: true
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      Tags:
        - Key: Purpose
          Value: iac-learning

Outputs:
  BucketName:
    Description: Nombre generado para el bucket privado.
    Value: !Ref PrivateBucket
```

CloudFormation genera un nombre único para el bucket porque no declaramos `BucketName`. Las cuatro opciones de S3 bloquean el acceso público a través de ACL y políticas. Esto no reemplaza los permisos de IAM: las identidades autorizadas todavía pueden acceder según sus políticas. El cifrado del ejemplo usa claves administradas por S3.

La plantilla define un recurso en `Resources`; CloudFormation llama pila al conjunto gestionado a partir de esa plantilla. `Outputs` publica el nombre asignado al bucket. Consulta la [referencia de AWS::S3::Bucket](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3-bucket.html) para ver propiedades y qué cambios interrumpen o reemplazan el recurso.

## 2. Valida antes de crear la pila

Valida la plantilla localmente con [cfn-lint](https://github.com/aws-cloudformation/cfn-lint):

```sh
cfn-lint bucket-privado.yaml
```

También puedes pedirle a CloudFormation que lea la plantilla:

```sh
aws cloudformation validate-template \
  --template-body file://bucket-privado.yaml \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Estas comprobaciones ayudan a encontrar errores de sintaxis o de estructura, pero no prueban que tu identidad tenga permisos, que haya cuota disponible ni que una operación real vaya a terminar bien. Los cambios de servicio y las condiciones al desplegar aún pueden causar un fallo.

## 3. Crea una pila con un change set

Un change set muestra los cambios que CloudFormation calcula para una operación y espera a que lo ejecutes. Sirve para revisar recursos que agregaría, modificaría, reemplazaría o eliminaría. No es una garantía de que el despliegue vaya a tener éxito: el resultado puede depender de permisos, cuotas, estado de los recursos y condiciones que solo aparecen durante la operación.

Crea primero un change set de tipo `CREATE`:

```sh
aws cloudformation create-change-set \
  --stack-name iac-bucket-demo \
  --change-set-name crear-bucket \
  --change-set-type CREATE \
  --template-body file://bucket-privado.yaml \
  --description "Bucket privado para practicar CloudFormation" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Espera a que CloudFormation termine de calcularlo y examina los recursos:

```sh
aws cloudformation wait change-set-create-complete \
  --stack-name iac-bucket-demo \
  --change-set-name crear-bucket \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

aws cloudformation describe-change-set \
  --stack-name iac-bucket-demo \
  --change-set-name crear-bucket \
  --query 'Changes[].ResourceChange.{Type:ResourceType,Action:Action,Replacement:Replacement}' \
  --output table \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Si el resumen coincide con lo que esperabas, ejecuta el change set y espera a que la pila quede lista:

```sh
aws cloudformation execute-change-set \
  --stack-name iac-bucket-demo \
  --change-set-name crear-bucket \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

aws cloudformation wait stack-create-complete \
  --stack-name iac-bucket-demo \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Después de que la pila quede lista, consulta su salida y el estado del bucket:

```sh
aws cloudformation describe-stacks \
  --stack-name iac-bucket-demo \
  --query 'Stacks[0].Outputs' \
  --output table \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

# Usa el valor BucketName que devolvió el comando anterior.
aws s3api get-public-access-block \
  --bucket NOMBRE_DEL_BUCKET \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

aws s3api get-bucket-encryption \
  --bucket NOMBRE_DEL_BUCKET \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Confirma que las cuatro opciones de bloqueo público estén en `true` y que el cifrado use `AES256`.

Si aparece un cambio inesperado, no ejecutes ese change set. Ajusta la plantilla, crea otro change set y vuelve a revisarlo.

Si falla la creación del change set, consulta su `StatusReason` con `describe-change-set`. Si falla la creación o actualización de la pila, revisa su pestaña **Events** o ejecuta `aws cloudformation describe-stack-events --stack-name iac-bucket-demo` con el mismo perfil y región. Busca el recurso que falló y su `ResourceStatusReason` antes de corregir permisos, cuotas o la plantilla; no vuelvas a ejecutar una operación sin entender su estado.

## 4. Actualiza sin tratar la vista previa como una promesa

Para practicar una actualización, agrega el bloque `VersioningConfiguration` dentro de `Properties` de `PrivateBucket`, al mismo nivel que `PublicAccessBlockConfiguration` y `BucketEncryption`:

```yaml
      VersioningConfiguration:
        Status: Enabled
```

Luego crea un change set de tipo `UPDATE` para la pila existente. En esta operación usa el nombre `habilitar-versionado` en los comandos de espera, revisión y ejecución; el change set `crear-bucket` y el waiter `stack-create-complete` corresponden solo a la creación inicial:

```sh
aws cloudformation create-change-set \
  --stack-name iac-bucket-demo \
  --change-set-name habilitar-versionado \
  --change-set-type UPDATE \
  --template-body file://bucket-privado.yaml \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Espera a que se calcule y revisa el change set de actualización:

```sh
aws cloudformation wait change-set-create-complete \
  --stack-name iac-bucket-demo \
  --change-set-name habilitar-versionado \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

aws cloudformation describe-change-set \
  --stack-name iac-bucket-demo \
  --change-set-name habilitar-versionado \
  --query 'Changes[].ResourceChange.{Type:ResourceType,Action:Action,Replacement:Replacement}' \
  --output table \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Solo si las acciones son las esperadas, ejecuta ese mismo change set y espera a que finalice la actualización:

```sh
aws cloudformation execute-change-set \
  --stack-name iac-bucket-demo \
  --change-set-name habilitar-versionado \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

aws cloudformation wait stack-update-complete \
  --stack-name iac-bucket-demo \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

aws s3api get-bucket-versioning \
  --bucket NOMBRE_DEL_BUCKET \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

La salida de `get-bucket-versioning` debe incluir `Status: Enabled`. AWS clasifica algunas modificaciones como reemplazos. Por ejemplo, cambiar el nombre explícito de un bucket requiere reemplazarlo. Un reemplazo puede crear otro recurso y retirar el anterior; borrar un bucket con objetos puede fallar.

Los change sets muestran el efecto calculado sobre recursos y propiedades, no una simulación perfecta de todas las condiciones de ejecución. Pueden no anticipar una restricción de servicio o un fallo en tiempo de despliegue. La [guía de change sets](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html) explica sus límites y cómo revisar las acciones.

## Eliminar o conservar un recurso

Al eliminar esta pila de práctica, CloudFormation intenta eliminar también el bucket. S3 solo permite borrar buckets vacíos; elimina antes los objetos y, si habilitaste versionado, sus versiones. La operación puede fallar si el bucket sigue teniendo contenido.

Para conservar un bucket al borrar la pila, puedes añadir una política de eliminación:

```yaml
  PrivateBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      # Las propiedades del bucket van aquí.
```

`DeletionPolicy: Retain` conserva el recurso al eliminar la pila o quitarlo de la plantilla. `UpdateReplacePolicy: Retain` regula qué pasa con el recurso anterior cuando una actualización lo reemplaza; son controles distintos. Un recurso retenido queda fuera de la pila y tendrás que gestionarlo y, si corresponde, eliminarlo por separado. Consulta la documentación de [DeletionPolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html) y [UpdateReplacePolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-updatereplacepolicy.html) antes de usar estas opciones con datos que deban preservarse.

Para eliminar la pila de ejemplo cuando ya no la necesites:

```sh
aws cloudformation delete-stack \
  --stack-name iac-bucket-demo \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

aws cloudformation wait stack-delete-complete \
  --stack-name iac-bucket-demo \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"
```

Este cierre elimina el bucket solo si no se retuvo y está vacío. Si una política lo conserva, la pila desaparece pero el bucket permanece en la cuenta. Revisa los recursos retenidos y los costos de tu cuenta después de cada práctica. S3 cobra según almacenamiento, solicitudes y recuperaciones; el versionado también cobra por cada versión que conserva. Un bucket pequeño no implica que el uso sea gratuito: consulta los [precios actuales de Amazon S3](https://aws.amazon.com/s3/pricing/) y estima el uso para tu región antes de desplegar.

## Drift e importación

Si alguien cambia un recurso fuera de CloudFormation, la pila puede desviarse de la plantilla. La detección de drift compara propiedades compatibles con los valores esperados; no inspecciona todo lo que existe en la cuenta y solo compara los valores definidos explícitamente en la plantilla o por parámetros. Puedes iniciar una revisión de drift desde la consola o con la API de CloudFormation y consultar los resultados antes de decidir cómo reconciliar el recurso.

CloudFormation también permite importar ciertos recursos existentes a una pila. La importación no crea ni modifica recursos como parte de esa operación: primero declaras la configuración, identificas el recurso y creas una operación de importación. Cada recurso que importes necesita una `DeletionPolicy`; después de importar, AWS recomienda ejecutar detección de drift para comprobar que la plantilla coincide con el recurso. Lee la guía de [detección de drift](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-stack-drift.html) y la de [importación de recursos](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/import-resources-manually.html) antes de incorporar recursos existentes.

## CloudFormation o Terraform

CloudFormation integra plantillas y pilas con el servicio de AWS; Terraform usa proveedores y mantiene estado propio, local o remoto. No hay una opción universal: compara el flujo que ya conoce tu equipo, el alcance de proveedores que necesitas y cómo administrará cambios y estado. Si un recurso ya pertenece a una pila de CloudFormation, no lo declares también en Terraform sin planificar una migración o importación: dos herramientas intentando ser dueñas del mismo recurso pueden producir cambios en conflicto.

La [guía prescriptiva de AWS para elegir una herramienta de IaC](https://docs.aws.amazon.com/prescriptive-guidance/latest/choose-iac-tool/choose-tool.html) ofrece criterios de comparación. También puedes ver la charla comunitaria [IaC: Terraform, CDK y CloudFormation](https://www.youtube.com/watch?v=Pz6tt7Ao2Ig), grabada por AWS User Group Medellín.

## Recursos, charlas y comunidades

- [Introducción: qué es infraestructura como código](https://www.youtube.com/watch?v=L_VtP9aYedM), una charla general de AWS Girls Chile.
- [Mejores prácticas con CloudFormation](https://www.youtube.com/watch?v=S0uvgkx4pq4), grabación de AWS User Group Paraguay.
- [CloudFormation Hooks para validar controles preventivos](https://www.youtube.com/watch?v=2JZOW4p7Yfk), una charla de AWS User Group Security Ecuador sobre validaciones antes de aprovisionar.
- [CloudFormation, Systems Manager y OpsWorks](https://www.youtube.com/watch?v=FCcAJYnlsPs), una grabación de AWS Girls Perú que relaciona CloudFormation con otros servicios.
- [Plantillas para EC2 privado con VPC Endpoints y Systems Manager](https://github.com/pangoro24/aws-privatelink-private-instance-ssm), una referencia de topología más amplia que despliega varios recursos. No la ejecutes sin adaptar: el repositorio incluye un endpoint `ec2messages` que no está disponible en regiones lanzadas desde 2024 y una ruta que recibe la contraseña de Windows como parámetro. Sustituye ese manejo por una opción segura de secretos y usa endpoints disponibles en tu región. La guía interna de [AWS Session Manager](/blog/como-configurar-y-utilizar-aws-session-manager/) ayuda a entender el acceso a esas instancias.
- Puedes participar en [AWS User Group Paraguay](https://www.meetup.com/aws-ug-paraguay/) y [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/), las comunidades detrás de dos charlas enlazadas arriba. El [canal de YouTube de AWS User Group Paraguay](https://www.youtube.com/channel/UC7_OxjDgMxfy3Id5oGyKqLg) reúne más grabaciones de la comunidad. También puedes buscar grupos por país en el [directorio de comunidades AWS](/comunidades/); en [videos de AWS en español](/aprender/videos/) y [canales de YouTube](/creadores/youtube/) encontrarás más charlas.
- En la agenda revisada el 5 de octubre de 2026 figura [Compliance as Code en AWS, de AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/), en línea el 20 de octubre de 19:00 a 20:00 GMT-5. Consulta la ficha para conocer las condiciones de inscripción. También puedes revisar la [agenda AWS actualizada](/eventos/).

Para continuar dentro del blog, compara esta guía con [Terraform y S3](/blog/como-crear-infraestructura-como-codigo-en-aws-con-terraform/) y consulta nuestros [controles de seguridad para IaC](/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/). Si luego trabajas con instancias EC2 privadas, revisa [AWS Session Manager](/blog/como-configurar-y-utilizar-aws-session-manager/).
