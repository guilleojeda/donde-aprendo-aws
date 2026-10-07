---
title: "SCP en AWS Organizations: cómo funcionan y ejemplos"
description: "Aprende qué limita una SCP, cómo se hereda entre cuentas y OUs, cómo crearla con JSON y AWS CLI y cómo diagnosticar errores AccessDenied."
author: "guille-ojeda"
publishedAt: "2024-05-09"
publishedTimestamp: "2024-05-09T02:00:12.498Z"
modifiedTimestamp: "2026-10-06T23:36:27-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "AWS Organizations: cómo administrar varias cuentas"
    url: "https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/"
  - title: "AWS Organizations: estructura de cuentas, OUs y nombres"
    url: "https://dondeaprendoaws.com/blog/aws-organizations-estructuras-de-cuentas-y-nombres/"
  - title: "Zero Trust en AWS: identidad, permisos y red con ejemplos"
    url: "https://dondeaprendoaws.com/blog/principios-de-zero-trust-en-aws-componentes-clave/"
---

Una **Service Control Policy (SCP)** de AWS Organizations establece un límite de permisos para las identidades de las cuentas miembro. **No concede acceso**: aunque la SCP permita una acción, una política IAM o de recurso todavía debe autorizarla. En cambio, un `Deny` aplicable en una SCP bloquea la acción incluso para una identidad con `AdministratorAccess`.

Sirve, por ejemplo, para impedir que equipos desactiven determinados registros o utilicen servicios fuera de las regiones elegidas. Para usarla necesitas una organización con **todas las funciones habilitadas** y el tipo de política SCP activado; la facturación consolidada por sí sola no alcanza. La [guía oficial de SCP](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html) describe ese alcance.

Si todavía no tienes clara la relación entre cuentas y organización, empieza por [AWS Organizations: cómo administrar varias cuentas](/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/). Si la duda es qué permiso asignar a una persona, el video [Qué es AWS IAM, explicado en cinco minutos](https://www.youtube.com/watch?v=t51vW-BDwF0), de Marcia en Desplegando Cloud, presenta usuarios, roles y permisos.

## A quién afecta una SCP

Puedes adjuntarla a la **raíz de Organizations**, a una **unidad organizativa (OU)** o a una **cuenta**. La raíz es el contenedor superior de la organización: no es el usuario raíz ni la cuenta de administración.

| Identidad o situación | Alcance de las SCP |
| --- | --- |
| Usuarios y roles IAM de una cuenta miembro | Quedan sujetos a sus SCP directas y heredadas |
| Usuario raíz de una cuenta miembro | También queda sujeto, salvo las tareas que AWS excluye expresamente |
| Cuenta miembro administradora delegada | Sigue sujeta a SCP |
| Identidades de la cuenta de administración | Las SCP no las restringen |
| Roles vinculados a servicios, *service-linked roles* | Las SCP no los restringen |

Estas excepciones están documentadas en [los efectos y límites de las SCP](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html#scp-effects-on-permissions). No confundas un rol de ejecución que tú creaste para Lambda o CloudFormation con un *service-linked role*: el primero sí puede quedar bloqueado por una SCP.

Además, una SCP limita **identidades de las cuentas miembro**, no todos los accesos a sus recursos. Si un bucket permite el acceso directo de una identidad de una cuenta externa, la SCP de la cuenta del bucket no restringe a esa identidad. Si esa persona asume un rol de una cuenta miembro, las solicitudes hechas con ese rol quedan bajo las SCP de esa cuenta. Para límites sobre recursos, incluidos accesos externos, evalúa las políticas de recurso y las [Resource Control Policies (RCP)](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps.html), según los servicios compatibles.

## Cómo se combinan las SCP de raíz, OU y cuenta

Para que una acción supere el límite de Organizations, debe existir un `Allow` aplicable en **cada nivel del camino** hasta la cuenta. Las autorizaciones de varias SCP en el mismo nivel se combinan; entre niveles, solo sobreviven las que todos permiten. Un `Deny` aplicable en cualquier nivel prevalece. La [evaluación oficial de SCP](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_evaluation.html) muestra estos casos.

Imagina este camino:

```text
Raíz: FullAWSAccess
└── OU Producción: FullAWSAccess + Deny cloudtrail:StopLogging
    └── Cuenta pagos-prod: FullAWSAccess
```

Aunque un rol en `pagos-prod` tenga `AdministratorAccess`, no podrá ejecutar `cloudtrail:StopLogging`. Adjuntar otra SCP con `Allow` a esa cuenta no anula el `Deny` de Producción. Mover la cuenta a otra OU cambia las políticas heredadas; no mueve sus recursos.

### Lista de denegación o lista de autorización

Con una **lista de denegación**, mantienes `FullAWSAccess` —u otra base de autorización adecuada— en cada nivel y agregas prohibiciones concretas. Lo que no prohíbes sigue disponible dentro del límite de SCP, sujeto a los demás permisos.

Con una **lista de autorización**, sustituyes la autorización amplia en el nivel elegido por acciones expresamente permitidas. Debes contemplar las dependencias de los servicios. Si dejas `FullAWSAccess` junto a una lista más estrecha en ese mismo nivel, su `Allow *` mantiene la autorización amplia: la lista estrecha no la reduce. Ambos enfoques se describen en [las estrategias de evaluación](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_evaluation.html#strategy_using_scps).

Para diseñar dónde aplicar estos controles, consulta [estructura de cuentas y OUs](/blog/aws-organizations-estructuras-de-cuentas-y-nombres/). Como referencia comunitaria, [AWS Organizations Landing Zone](https://dcastillogi.com/arquitecturas/aws-organizations-landing-zone), de Daniel Castillo, conecta separación de cuentas, SCP y registros centralizados. Su arquitectura es un ejemplo para comparar con tus necesidades.

## Cómo escribir una SCP en JSON

Una SCP usa `Version`, `Statement`, `Effect`, acciones, recursos y condiciones opcionales. **No lleva `Principal`**: las identidades sujetas al límite dependen de las cuentas a las que se aplica. `Resource` identifica los recursos de las acciones; la OU o cuenta destino se elige al adjuntar la política.

La [sintaxis vigente de SCP](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_syntax.html) admite `Condition`, `NotAction`, `Resource` y `NotResource` en declaraciones `Allow` y `Deny`. AWS amplió este soporte [en septiembre de 2025](https://aws.amazon.com/about-aws/whats-new/2025/09/aws-organizations-iam-language-service-control-policies/). Una guía antigua que diga que `Allow` no admite condiciones o que siempre exige `Resource: "*"` ya no describe todas las posibilidades.

### Ejemplo: limitar Amazon EC2 a dos regiones

Este ejemplo deniega **todas las acciones `ec2:*`** cuando la solicitud se dirige a una región distinta de `us-east-1` o `sa-east-1`. Guarda el documento como `scp-ec2-regiones.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyEc2OutsideApprovedRegions",
      "Effect": "Deny",
      "Action": "ec2:*",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["us-east-1", "sa-east-1"]
        }
      }
    }
  ]
}
```

También bloquea consultas y tareas de administración de EC2 fuera de esas regiones. No elimina ni apaga automáticamente instancias existentes, y no restringe otros servicios. Antes de aplicarlo, comprueba cómo seguirás administrando recursos que ya estén fuera de las regiones permitidas.

La clave [`aws:RequestedRegion`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-requestedregion) controla el endpoint solicitado, no todos los efectos geográficos de una operación. Por eso no demuestra, por sí sola, residencia de datos: una operación de S3 puede configurar replicación hacia otra región. Si amplías el ejemplo a todos los servicios, también debes tratar los endpoints globales —IAM, por ejemplo— y sus excepciones; reemplazar simplemente `ec2:*` por `*` puede bloquearlos.

### Ejemplo: impedir que se detengan o eliminen trails

Esta SCP bloquea dos acciones de CloudTrail para las identidades sujetas a ella:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyStoppingOrDeletingTrails",
      "Effect": "Deny",
      "Action": ["cloudtrail:StopLogging", "cloudtrail:DeleteTrail"],
      "Resource": "*"
    }
  ]
}
```

Es el patrón que AWS presenta para [proteger trails de CloudTrail](https://docs.aws.amazon.com/prescriptive-guidance/latest/logging-monitoring-for-application-owners/cloudtrail.html). Su alcance es concreto: no bloquea todos los cambios posibles de CloudTrail ni protege por sí solo el bucket de logs, su clave KMS o los almacenes de eventos de CloudTrail Lake. Tampoco restringe la cuenta de administración. Con `Resource: "*"`, impedirás incluso eliminar un trail de prueba en cuentas miembro; define si necesitas proteger todos los trails o solo determinados ARN.

Ambos documentos contienen solo denegaciones. Necesitan una base de `Allow` en cada nivel; **no sustituyen por sí solos a `FullAWSAccess`**. El [repositorio de ejemplos enlazado por AWS](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_examples.html) ofrece otros patrones, con sus consideraciones de prueba.

### Por qué MFA requiere un diseño distinto

Una SCP puede condicionar acciones al contexto de autenticación, pero no configura MFA ni obliga a todas las identidades a presentar un segundo factor del mismo modo. [`aws:MultiFactorAuthPresent`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-multifactorauthpresent) no aparece en solicitudes con claves de acceso de largo plazo ni en identidades federadas. Un `Deny` con `Bool` y valor `false` deja fuera solicitudes donde falta la clave; `BoolIfExists` con `false` también puede bloquear automatizaciones y sesiones federadas sin ese contexto.

Para personas que entran mediante IAM Identity Center o un proveedor externo, configura MFA en el sistema de autenticación y revisa cómo representa la sesión. Para cargas de trabajo, usa roles y credenciales temporales. La guía de [Zero Trust en AWS: identidad, permisos y red](/blog/principios-de-zero-trust-en-aws-componentes-clave/) explica cómo combinar esos controles y comprobar su alcance. No copies una denegación global de “sin MFA” sin probar esos flujos. El proyecto [aws-iam-security-lab](https://github.com/JonasCC8/aws-iam-security-lab), de Jonás Carrillo Carballo, documenta una práctica básica de usuarios IAM, MFA y acceso limitado a S3; es material de fundamentos, no un laboratorio completo de SCP o federación.

## Crear, adjuntar y probar una SCP con AWS CLI

Trabaja con un rol autorizado de la cuenta de administración, o con una cuenta miembro que tenga la [delegación de administración de políticas de Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs-policy-delegate.html) correspondiente. Ser administrador delegado de otro servicio no concede automáticamente esos permisos.

Para este recorrido necesitas las acciones que uses:

| Operación | Permiso |
| --- | --- |
| Validar el documento | `access-analyzer:ValidatePolicy` |
| Crear la SCP | `organizations:CreatePolicy` |
| Adjuntarla o quitarla de un destino | `organizations:AttachPolicy`, `organizations:DetachPolicy` |
| Consultar contenido y asociaciones | `organizations:DescribePolicy`, `organizations:ListPoliciesForTarget`, `organizations:ListTargetsForPolicy` |
| Recorrer la jerarquía | `organizations:ListParents` |
| Actualizar o eliminar la política | `organizations:UpdatePolicy`, `organizations:DeletePolicy` |

La consola y otros pasos de descubrimiento pueden necesitar permisos de lectura adicionales. Limita también los recursos y destinos autorizados según tu delegación.

### 1. Validar antes de adjuntar

```bash
aws accessanalyzer validate-policy \
  --policy-document file://scp-ec2-regiones.json \
  --policy-type SERVICE_CONTROL_POLICY
```

Revisa los hallazgos, especialmente los errores y advertencias de seguridad. [`validate-policy`](https://docs.aws.amazon.com/cli/latest/reference/accessanalyzer/validate-policy.html) comprueba el documento; no ejecuta tu carga de trabajo ni garantiza que todas sus dependencias funcionen.

### 2. Crear y aplicar a una cuenta de prueba

```bash
aws organizations create-policy \
  --name "LimitarEC2PorRegion" \
  --description "Deniega EC2 fuera de us-east-1 y sa-east-1" \
  --type SERVICE_CONTROL_POLICY \
  --content file://scp-ec2-regiones.json
```

El resultado devuelve `Policy.PolicySummary.Id`. Crear la política no la adjunta. En el siguiente comando, reemplaza `p-examplepolicy123` por ese ID y `111122223333` por el ID real de una **cuenta miembro de prueba**:

```bash
aws organizations attach-policy \
  --policy-id p-examplepolicy123 \
  --target-id 111122223333
```

También puedes usar el ID de una OU o de la raíz como destino. Confirma su alcance y las SCP que ya tiene antes de hacerlo. Las referencias de [`create-policy`](https://docs.aws.amazon.com/cli/latest/reference/organizations/create-policy.html) y [`AttachPolicy`](https://docs.aws.amazon.com/organizations/latest/APIReference/API_AttachPolicy.html) detallan los parámetros.

### 3. Comprobar una acción permitida y otra bloqueada

Desde la cuenta miembro, usa el **mismo rol** con permiso IAM para `ec2:DescribeInstances` y una cadena de SCP que lo permita antes de incorporar el ejemplo. Puedes comprobar la autorización sin crear instancias:

```bash
aws ec2 describe-instances --region us-east-1 --dry-run
aws ec2 describe-instances --region eu-west-1 --dry-run
```

Con el contexto esperado, el primer comando devuelve `DryRunOperation`, que indica permiso; el segundo devuelve `UnauthorizedOperation`. **Los dos son respuestas de error del modo de prueba**, por lo que un código de salida distinto de cero no basta para interpretar el resultado. La [referencia de `describe-instances`](https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-instances.html) explica esos valores. La prueba cubre esa acción, identidad y región; no demuestra que un despliegue completo funcionará.

Antes de extender la SCP a producción, comprueba además los despliegues, roles de ejecución, tareas programadas, operaciones de emergencia y limpieza que realmente use tu entorno. Conserva la versión anterior y un acceso autorizado para revertir el cambio. Puedes apoyar el análisis en [el simulador de políticas IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html): actualmente evalúa condiciones de SCP, pero tiene límites, como no evaluar RCP y no mostrar las declaraciones coincidentes de SCP. La consola tampoco permite proporcionar una clave de contexto que aparezca únicamente en una SCP.

## Cómo diagnosticar un AccessDenied por SCP

Agregar `AdministratorAccess` al rol no corrige un bloqueo de Organizations. Primero identifica **qué solicitud falla y quién la hace**. El rol del pipeline puede ser distinto del rol de ejecución que CloudFormation usa para crear recursos.

1. Confirma la cuenta y el ARN de la sesión con `aws sts get-caller-identity`. Anota acción, recurso, región, hora y mensaje de error.
2. Si el mensaje dice `with an explicit deny in a service control policy`, busca una declaración `Deny` que coincida. Si dice `because no service control policy allows`, busca el `Allow` que falta en algún nivel. AWS explica [ambos mensajes y sus variantes](https://docs.aws.amazon.com/IAM/latest/UserGuide/troubleshoot_access-denied.html); algunos servicios no dan ese detalle.
3. Revisa las SCP de la cuenta **y de cada OU antecesora hasta la raíz**. No basta con ver las adjuntas a la cuenta.
4. Evalúa las condiciones con el contexto real: región solicitada, ARN del rol, etiquetas y presencia de claves. Una excepción puede no coincidir con la identidad que ejecuta la operación.
5. Si las SCP dejan pasar la solicitud, revisa políticas IAM y de recurso, límites de permisos, políticas de sesión y otros controles aplicables, como RCP o políticas de endpoints. Un error puede tener más de una causa.

Desde la cuenta que administra las políticas, estos comandos ayudan a inspeccionar la cuenta de ejemplo:

```bash
aws organizations list-parents --child-id 111122223333

aws organizations list-policies-for-target \
  --target-id 111122223333 \
  --filter SERVICE_CONTROL_POLICY

aws organizations describe-policy --policy-id p-examplepolicy123
```

Repite `list-policies-for-target` para la OU padre y sus antecesores, y `list-parents` para subir en la jerarquía. [`ListPoliciesForTarget`](https://docs.aws.amazon.com/organizations/latest/APIReference/API_ListPoliciesForTarget.html) devuelve **solo políticas adjuntas directamente** al destino; no enumera todas las heredadas.

CloudTrail puede aportar la identidad y la solicitud que falló cuando ese evento está registrado. Para complementar la revisión de identidades, [la experiencia de auditoría IAM en múltiples cuentas de Gerardo Castro](https://roadtocloudsec.la/posts/encontre-access-key-2018-activa-produccion-python-boto3) muestra un enfoque con Organizations y roles temporales. Es una lectura sobre credenciales y auditoría; no identifica automáticamente qué SCP causó un bloqueo.

## Actualizar, retirar y mantener las políticas

Una política puede estar adjunta a muchos destinos. **Actualizar su contenido afecta a todos ellos**: revisa las asociaciones antes del cambio y conserva una copia anterior. [`UpdatePolicy`](https://docs.aws.amazon.com/organizations/latest/APIReference/API_UpdatePolicy.html) modifica una política existente; no crea automáticamente un historial de versiones para revertir.

Para quitar la política del ejemplo de la cuenta de prueba:

```bash
aws organizations detach-policy \
  --policy-id p-examplepolicy123 \
  --target-id 111122223333
```

**Quitar una SCP sí puede cambiar los permisos efectivos de usuarios y roles existentes.** Puede retirar una denegación o eliminar parte de la base de autorización. Organizations [no permite quitar la última SCP de un destino](https://docs.aws.amazon.com/organizations/latest/APIReference/API_DetachPolicy.html): si vas a reemplazarla, adjunta primero la sustituta. Para eliminar la política, debes desadjuntarla de todos sus destinos; las políticas administradas por AWS no se eliminan mediante [`DeletePolicy`](https://docs.aws.amazon.com/organizations/latest/APIReference/API_DeletePolicy.html).

Al 6 de octubre de 2026, los [límites documentados de SCP](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_reference_limits.html) son **10 políticas adjuntas directamente por raíz, OU o cuenta**, y **10.240 caracteres por documento**. Las heredadas no consumen ese cupo de adjuntos. Con CLI o SDK, los espacios del JSON también cuentan.

Si usas Control Tower, gestiona sus controles mediante el mecanismo correspondiente; quitar manualmente sus SCP puede producir [desviaciones de configuración](https://docs.aws.amazon.com/controltower/latest/userguide/governance-drift.html). Para conocer el enfoque, [Cómo lograr un gobierno de múltiples cuentas a escala con AWS Control Tower](https://dev.to/aws-builders/como-lograr-un-gobierno-de-multiples-cuentas-a-escala-con-aws-control-tower-parte-1-1iko), de Gerardo Castro, es una introducción comunitaria de 2023. Contrasta los pasos actuales con [la documentación de controles de Control Tower](https://docs.aws.amazon.com/controltower/latest/controlreference/controls.html).

## Aprende con recursos y comunidades en español

Para continuar con el tema, la grabación [El Ataque del Nivel 200: Políticas de Control con AWS Organizations](https://www.youtube.com/watch?v=2lLxBlric5I) pertenece a **AWS Women Colombia**. Puedes seguir su [sitio](https://awswomencolombia.com/) y su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw) para consultar más sesiones. La comunidad aborda varios temas de AWS; no se limita a SCP.

Si quieres participar en conversaciones sobre seguridad cloud, estos grupos publican sus actividades y vías de participación:

- [AWS Security UserGroup Argentina](https://www.meetup.com/aws-security-usergroup-argentina/).
- [AWS User Group Security Colombia](https://www.meetup.com/aws-user-group-security-colombia/).
- [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/).
- [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/), con encuentros publicados en Meetup y un [canal de grabaciones](https://www.youtube.com/@AWSSecurityLATAM).
- [AWS Security User Group Paraguay](https://es.linkedin.com/posts/aws-security-user-group-paraguay_aws-cloudsecurity-paraguay-activity-7500886396916731905-Xgar), cuyo anuncio incluye cómo sumarte al grupo.

Sus actividades cubren distintos aspectos de seguridad en AWS; revisa el tema de cada encuentro. Para aprovechar una sesión, lleva un ejemplo sin datos sensibles: la jerarquía de OUs, la acción bloqueada y el contexto de la solicitud.

En la agenda consultada el **6 de octubre de 2026** aparecen dos encuentros virtuales relacionados con controles y operación segura:

| Encuentro | Fecha y organizador |
| --- | --- |
| [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) | 20 de octubre de 2026, 19:00–20:00, UTC−5; AWS User Group Security Ecuador |
| [DevSecOps con agentes de IA: seguridad continua del diseño a producción](https://www.meetup.com/awssecuritylatam/events/316875555/) | 15 de octubre de 2026, 16:00–17:00, UTC−5; AWS Security Users Group LatAm |

Los anuncios no confirman una clase específica de SCP ni gratuidad. Consulta sus páginas para confirmar inscripción, disponibilidad y cambios. Para otras fechas o países, revisa la [agenda de eventos](/eventos/), el [directorio de comunidades](/comunidades/) y los [recursos para aprender AWS](/aprender/).

## Preguntas frecuentes

### ¿FullAWSAccess equivale a AdministratorAccess?

No. `FullAWSAccess` es una SCP que deja pasar acciones dentro del límite de Organizations; `AdministratorAccess` es una política IAM que concede permisos amplios a una identidad. Una identidad sigue necesitando autorización aunque todas sus SCP sean amplias.

### ¿Una SCP puede restringir una cuenta de administración?

No. Adjuntarla a la raíz de Organizations no elimina esa excepción. Protege el acceso a la cuenta de administración con los mecanismos de identidad y permisos que correspondan.

### ¿Una SCP afecta los recursos ya creados?

Puede impedir solicitudes para consultarlos, modificarlos o eliminarlos. No los borra, no cambia automáticamente su configuración y no garantiza detener una carga que ya funciona. El efecto depende de qué identidades y acciones intervengan.

### ¿Puedo permitir en una cuenta lo que su OU deniega?

Un `Allow` en la cuenta no supera un `Deny` aplicable de la OU. Debes cambiar la declaración que bloquea, ajustar una excepción apropiada o revisar dónde corresponde aplicar el control.

### ¿Necesito AWS Control Tower para usar SCP?

No. Las SCP son una función de AWS Organizations. Control Tower es una opción para gobernar una landing zone con controles y procedimientos adicionales.
