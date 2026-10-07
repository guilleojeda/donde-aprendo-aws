---
title: "Acceso entre cuentas en AWS con IAM: roles y políticas de confianza"
description: "Configura sts:AssumeRole entre cuentas de AWS con confianza y permisos mínimos, un perfil de AWS CLI y pasos para diagnosticar AccessDenied."
author: "guille-ojeda"
publishedAt: "2024-11-26"
publishedTimestamp: "2024-11-26T20:13:42.04Z"
modifiedTimestamp: "2026-10-06T23:58:58-03:00"
review:
  date: "2026-10-07"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Mejores prácticas de seguridad en AWS: checklist y cómo verificarlas"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/"
---

Para que una identidad de la cuenta **A** lea objetos de un bucket en la cuenta **B**, crea un rol en B con una política de confianza que acepte a esa identidad; permite a la identidad de A ejecutar `sts:AssumeRole` sobre ese rol; y limita los permisos del rol en B a los objetos que necesita leer. Si el bucket o su clave de cifrado pertenecen a una tercera cuenta, también hacen falta permisos en las políticas de esos recursos.

La trust policy responde **quién puede asumir el rol**. La política de permisos adjunta al rol responde **qué puede hacer después de asumirlo**. Son decisiones distintas y ambas deben quedar explícitas.

Usaremos estos nombres ficticios durante la guía:

| Cuenta | ID ficticio | Elemento |
| --- | --- | --- |
| A, origen | `111122223333` | El rol `ReportReaderClient`, desde el que se solicita el acceso |
| B, destino | `222233334444` | El rol `ReadReports` y el bucket `daw-reports-demo` |

Los IDs, nombres y objetos son ejemplos; reemplázalos por los de tus cuentas. Para decidir cuándo separar cuentas y cómo organizarlas, consulta [la guía de arquitectura multi-cuenta en AWS](/blog/estructuras-multi-cuenta-aws-para-escalar/).

## 1. Permite que la identidad de A asuma el rol de B

En la cuenta B, crea el rol `ReadReports` y configura esta **política de confianza**. Aquí se permite solo al rol concreto `ReportReaderClient` de A:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TrustReportReaderClient",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111122223333:role/ReportReaderClient"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Una política de confianza de rol es una política basada en recursos: el recurso es el propio rol `ReadReports`. Por eso esta política tiene `Principal` y `Action`, pero no `Resource`; incluir `Resource` o `NotResource` en una trust policy no es válido. Consulta la [referencia de validación de políticas de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-reference-policy-checks.html).

El ejemplo identifica el rol de A de forma directa. IAM convierte ese ARN a un ID interno al guardar la política para que, si alguien elimina y recrea el rol, el nuevo rol no herede la relación por accidente; en ese caso hay que actualizar la confianza. La [referencia de `Principal` de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html) explica también cuándo usar un principal de cuenta y `aws:PrincipalArn`.

Ahora, en A, adjunta a `ReportReaderClient` una **política de identidad** que autorice asumir únicamente el rol anterior:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AssumeReadReportsInAccountB",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::222233334444:role/ReadReports"
    }
  ]
}
```

Para este flujo entre cuentas, el permiso de A y la confianza de B deben permitir la llamada a STS. La documentación de AWS explica el [acceso entre cuentas mediante roles](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies-cross-account-resource-access.html). En `Principal`, el ARN `arn:aws:iam::111122223333:root` representa a la **cuenta A**: delega en esa cuenta la posibilidad de autorizar identidades para asumir el rol; no significa “solo el usuario raíz”. Si eliges esa forma, concede `sts:AssumeRole` únicamente a las identidades previstas en A y considera restringir la trust policy con condiciones. Para una integración de Identity Center, AWS publica un patrón con el principal de la cuenta y `aws:PrincipalArn`, ya que el ARN del rol `AWSReservedSSO_...` puede cambiar si se elimina y vuelve a asignar un permission set: [referenciar permission sets en políticas de recursos](https://docs.aws.amazon.com/singlesignon/latest/userguide/referencingpermissionsets.html).

## 2. Limita qué puede leer el rol en B

Adjunta a `ReadReports` una política que permita solo `s3:GetObject` sobre el prefijo necesario:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadMonthlyReports",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::daw-reports-demo/reports/*"
    }
  ]
}
```

La ruta `reports/*` limita el acceso a objetos bajo ese prefijo. Esta política no permite enumerar el bucket ni leer otros prefijos. Si el proceso también necesita listar objetos, añade `s3:ListBucket` sobre el ARN del bucket y limita esa acción al prefijo con una condición `s3:prefix`; no amplíes el permiso a `s3:*` para resolver un error de lectura.

Como el bucket y el rol de este ejemplo están en B, la política de identidad del rol da el permiso de lectura, salvo que otra política aplicable lo restrinja. Si el bucket está en una tercera cuenta, su política de bucket debe autorizar también al rol de B y el rol debe permitir la acción. La cuenta propietaria del bucket controla ese acceso desde la política del recurso. Para el siguiente paso, consulta [seguridad y permisos de Amazon S3](/blog/mejores-practicas-para-amazon-s3/).

Si los objetos usan SSE-KMS, revisa además `kms:Decrypt` en los permisos del rol y la política de la clave. Cuando la clave está en otra cuenta, la política de clave del propietario y la política IAM del rol que la usa deben habilitar el acceso; una sola no basta. AWS detalla los requisitos de [acceso entre cuentas a claves de KMS](https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-modifying-external-accounts.html). También puedes seguir [la guía de cifrado con AWS KMS](/blog/cifrado-de-datos-con-aws-kms-guia-practica/).

## 3. Comprueba la identidad con AWS CLI

Un perfil de AWS CLI puede obtener credenciales mediante IAM Identity Center, un proveedor de identidad aprobado, `credential_process` o un rol de cómputo. Evita usar el usuario raíz o guardar claves de larga duración para este flujo.

Configura un perfil de rol en `~/.aws/config`. El perfil de origen `acceso-a` debe proporcionar credenciales para la identidad que B permite en la trust policy; en este ejemplo, `ReportReaderClient`:

```ini
[profile informes-b]
role_arn = arn:aws:iam::222233334444:role/ReadReports
source_profile = acceso-a
region = us-east-1
role_session_name = lectura-informes
```

Primero confirma qué identidad usa el perfil de origen. Luego verifica que el segundo perfil entrega una sesión del rol en B y ejecuta una lectura de prueba:

```bash
aws sts get-caller-identity --profile acceso-a
aws sts get-caller-identity --profile informes-b
aws s3api get-object \
  --bucket daw-reports-demo \
  --key reports/informe.csv \
  ./informe.csv \
  --profile informes-b
```

En la segunda respuesta de `get-caller-identity`, comprueba el ID de cuenta `222233334444` y un ARN de sesión similar a `arn:aws:sts::222233334444:assumed-role/ReadReports/lectura-informes`. La operación `get-object` lee un objeto; si quieres probar otro objeto, usa una clave existente bajo `reports/`. La AWS CLI obtiene y renueva credenciales temporales para el perfil de rol: no hace falta copiar credenciales temporales a variables de entorno. Más detalles en la guía de [perfiles de AWS CLI para asumir roles](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-role.html) y la referencia de [`sts get-caller-identity`](https://docs.aws.amazon.com/cli/latest/reference/sts/get-caller-identity.html).

El perfil de origen puede devolver un ARN STS como `arn:aws:sts::111122223333:assumed-role/ReportReaderClient/mi-sesion`. Ese ARN de sesión corresponde al principal IAM `arn:aws:iam::111122223333:role/ReportReaderClient` de la trust policy; verifica la cuenta y el nombre del rol, no la igualdad literal de ambos ARN. Si usas IAM Identity Center, aplica el patrón documentado para el rol `AWSReservedSSO_...` en lugar de copiar este ARN de ejemplo.

## Si el acceso lo ejecuta CodeBuild

CodeBuild usa un **rol de servicio propio** para recibir credenciales y operar en nombre del proyecto. El principal de servicio que asume ese rol es `codebuild.amazonaws.com`. Si el código del build necesita leer desde B, el rol de servicio en A obtiene además el permiso de identidad `sts:AssumeRole` sobre el rol de destino en B. Ese rol de destino confía en el ARN IAM del rol de servicio de A, por ejemplo `arn:aws:iam::111122223333:role/CodeBuildProjectRole`; no pongas `codebuild.amazonaws.com` como principal de `ReadReports` para autorizar una llamada STS que realiza el propio código del build.

La confianza del **rol de servicio de CodeBuild en A** se parece a esto:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlyTheReportBuildProject",
      "Effect": "Allow",
      "Principal": {
        "Service": "codebuild.amazonaws.com"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "111122223333",
          "aws:SourceArn": "arn:aws:codebuild:us-east-1:111122223333:project/report-export"
        }
      }
    }
  ]
}
```

AWS CodeBuild documenta esas claves para limitar la relación entre el servicio y su rol al proyecto y cuenta esperados. Usa el ARN y la cuenta reales de tu proyecto. En el rol de destino de B, sustituye el principal del ejemplo anterior por el ARN del rol de servicio de A y mantén el permiso `sts:AssumeRole` sobre ese rol de destino en la política de identidad del rol de servicio. La guía oficial muestra [cómo crear un rol de servicio de CodeBuild y acotar su confianza](https://docs.aws.amazon.com/codebuild/latest/userguide/setting-up-service-role.html). Para la configuración del pipeline, continúa con [Terraform y AWS CodePipeline](/blog/pipeline-cicd-con-terraform-y-aws-codepipeline/).

## Condiciones: terceros, MFA y límites de permisos

**Acceso de un proveedor externo.** Si un tercero administra varias cuentas de clientes, coordina un `ExternalId` único para tu cuenta y exige ese valor en la trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::333344445555:role/ProveedorAuditoria"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "cliente-7f3a-ejemplo"
        }
      }
    }
  ]
}
```

El ExternalId ayuda a reducir el riesgo del *confused deputy*; AWS aclara que no es una contraseña ni un secreto y recomienda que el tercero genere uno distinto por cliente. No lo uses como reemplazo del principal específico o de los permisos mínimos. Consulta la guía para [delegar acceso a un tercero con ExternalId](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html).

**MFA para personas.** Una condición `Bool` sobre `aws:MultiFactorAuthPresent` puede exigir `true` cuando una persona asume un rol por un flujo compatible con MFA. En credenciales temporales la clave puede valer `true` o `false`; con credenciales de larga duración puede estar ausente. Una condición que exige `true` no se cumple cuando el valor es `false` o falta, por lo que puede bloquear sesiones federadas o automatizadas que no transmitan contexto MFA. No la copies por defecto a roles de máquinas o pipelines: valida primero el flujo de identidad. Sigue el procedimiento oficial de [MFA para el acceso a APIs](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html) si el caso es interactivo.

Una política `Allow` tampoco garantiza acceso por sí sola. Una denegación explícita prevalece; una SCP de AWS Organizations, una permissions boundary o una session policy puede limitar lo permitido. Estas capas también pueden afectar la llamada `AssumeRole` que sale de A y las acciones que ejecuta el rol en B. La [lógica de evaluación de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/access.html) y la [evaluación de acceso entre cuentas](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic-cross-account.html) ayudan a revisar qué políticas aplican.

Para escuchar a otras personas que trabajan con estos controles, consulta [AWS Security Users Group LatAm en YouTube](https://www.youtube.com/@AWSSecurityLATAM), que publica charlas de seguridad en español.

## Diagnóstico de `AccessDenied`

Primero identifica en qué paso ocurre el rechazo:

1. **Falla `get-caller-identity` con `acceso-a`:** revisa el proveedor de credenciales, la sesión y la cuenta de origen. Confirma que el perfil corresponde a la identidad esperada; si pides ayuda, evita publicar claves o tokens.
2. **Falla al asumir `ReadReports`:** compara la cuenta y el rol de la identidad efectiva de A con `Principal` de la trust policy en B. Si `get-caller-identity` devuelve un ARN `arn:aws:sts::...:assumed-role/...`, identifica el rol IAM del que procede; el ARN de sesión no es literalmente igual al ARN `arn:aws:iam::...:role/...` del principal. Revisa que B permita `sts:AssumeRole`, que la política de identidad de A autorice el ARN exacto del rol, y que no haya una condición de ExternalId, MFA u otra condición que la solicitud no cumpla. Revisa también los límites y denegaciones explícitas que apliquen en A.
3. **La sesión de `ReadReports` funciona, pero falla S3:** mira `get-caller-identity` del perfil B y confirma el ARN de cuenta y sesión. Después comprueba que el rol permita `s3:GetObject` sobre el ARN exacto del objeto; si el bucket está en otra cuenta, revisa también su bucket policy. Para objetos SSE-KMS, revisa `kms:Decrypt` y la key policy. Las SCP, boundaries, session policies o un `Deny` explícito pueden restringir cualquiera de estas llamadas.
4. **Es un build de CodeBuild:** inspecciona por separado la confianza de CodeBuild en el rol de servicio de A, el `sts:AssumeRole` de ese rol y la confianza de B en su ARN IAM. Un error de la primera relación no se corrige ampliando los permisos S3 del rol de B.

IAM Access Analyzer puede validar la gramática de políticas y señalar accesos externos en sus [comprobaciones de políticas](https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html). Para mantener una revisión completa, complementa el resultado con la identidad activa, el ARN del recurso, las condiciones y las capas de permisos descritas arriba.

Para repasar los conceptos de políticas y roles con un ejemplo técnico, mira la sesión grabada [El Código del Jedi: IAM avanzado](https://www.youtube.com/watch?v=NLCI70IXcIs), de AWS Women Colombia User Group.

## Participa en la comunidad

- Si quieres conversar con otras personas que trabajan en seguridad de AWS, visita [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/), que comparte charlas, encuentros y materiales sobre controles y operación cloud.
- Si el próximo paso es convertir políticas en controles de cumplimiento, consulta el evento en línea [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/), anunciado para el **20 de octubre de 2026, 19:00–20:00 (UTC−5)**.
- Para llevar revisiones de seguridad al ciclo de desarrollo, revisa [DevSecOps con agentes de IA: seguridad continua del diseño a producción](https://www.meetup.com/awssecuritylatam/events/316875555/), evento en línea anunciado para el **15 de octubre de 2026, 16:00–17:00 (UTC−5)**.

Las fechas y los horarios corresponden a las páginas públicas consultadas el 6 de octubre de 2026; confirma detalles, cupos y registro en Meetup.
