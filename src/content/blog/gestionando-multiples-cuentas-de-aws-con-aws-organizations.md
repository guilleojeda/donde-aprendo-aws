---
title: "AWS Organizations: cómo administrar varias cuentas"
description: "Aprende qué hace AWS Organizations y cómo crear la organización, administrar cuentas, configurar IAM Identity Center y SCP, y decidir cuándo usar Control Tower."
author: "guille-ojeda"
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T23:44:11.481Z"
modifiedTimestamp: "2026-10-06T15:51:02-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Arquitectura multi-cuenta en AWS: cómo separar cuentas y OUs"
    url: "https://dondeaprendoaws.com/blog/estructuras-multi-cuenta-aws-para-escalar/"
  - title: "Facturación de AWS: cómo leer la factura y controlar el gasto"
    url: "https://dondeaprendoaws.com/blog/gestion-de-facturacion-de-aws-guia-completa/"

---

AWS Organizations reúne varias cuentas de AWS en una organización que se administra desde una **cuenta de administración**. Sirve para crear e invitar cuentas, agruparlas en unidades organizativas (OUs), aplicar políticas compatibles y usar integraciones con servicios de AWS. No mueve ni mezcla los recursos de las cuentas: cada cuenta sigue siendo el límite donde se crean sus recursos y se administran sus identidades.

Esta guía se centra en configurar y operar Organizations. Para decidir qué cargas conviene separar en cuentas y qué controles agrupar en OUs, empieza por [Arquitectura multi-cuenta en AWS: cómo separar cuentas y OUs](/blog/estructuras-multi-cuenta-aws-para-escalar/).

## Qué hace Organizations y qué queda en otros servicios

La raíz es el contenedor superior de una organización. Bajo ella se encuentran la cuenta de administración, las OUs y las cuentas miembro. Las políticas adjuntas a una OU se heredan por las cuentas y OUs descendientes.

```text
Raíz de Organizations
├── Cuenta de administración
├── OU Security
│   └── Cuenta miembro de seguridad
└── OU Workloads
    ├── OU Nonproduction
    │   └── Cuenta miembro de desarrollo
    └── OU Production
        └── Cuenta miembro de producción
```

Una OU solo agrupa cuentas: no es una cuenta de AWS ni un mecanismo de acceso por sí misma. Una política de control de servicios puede limitar las acciones disponibles en una cuenta miembro; IAM e IAM Identity Center resuelven qué permisos recibe una persona o rol. Control Tower puede añadir una landing zone y controles sobre la organización, pero es opcional.

| Función | Qué resuelve | Qué no debes asumir |
| --- | --- | --- |
| Organizations | Cuentas, jerarquía, políticas de organización e integración con servicios compatibles. | No combina recursos ni sustituye las políticas IAM de cada cuenta. |
| Facturación consolidada | Agrupa el pago de las cuentas de la organización en una cuenta de administración. | No cambia la propiedad de los recursos. La factura tampoco refleja automáticamente la jerarquía de OUs. |
| IAM Identity Center | Asigna acceso a cuentas a usuarios o grupos mediante conjuntos de permisos. | No establece el máximo organizativo de acciones que puede usar una cuenta miembro. |
| SCP | Limita acciones disponibles para identidades en cuentas miembro. | No concede permisos ni administra usuarios y grupos. |
| Control Tower | Orquesta una landing zone, aprovisionamiento de cuentas y controles de Control Tower. | No es obligatorio para usar Organizations; sus controles no cubren automáticamente cualquier OU o cuenta que exista fuera de su gobierno. |

La consolidación de facturas y la administración de una cuenta son asuntos distintos. Las cuentas conservan sus recursos; para compartir un recurso, configura el servicio de intercambio, las políticas de IAM o de recursos que correspondan. Para revisar cargos, presupuestos, exportaciones y facturas, continúa con [Facturación de AWS: cómo leer la factura y controlar el gasto](/blog/gestion-de-facturacion-de-aws-guia-completa/).

## Crear la organización y preparar sus cuentas

### 1. Designa la cuenta de administración

Elige qué cuenta será responsable de la organización, la creación y administración de cuentas, las políticas y las integraciones. AWS recomienda reservarla para tareas que requieran la cuenta de administración y no desplegar allí cargas de trabajo: las SCP no afectan a esa cuenta y su acceso da privilegios sobre la organización ([buenas prácticas de la cuenta de administración](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_best-practices_mgmt-acct.html)). Restringe quién puede usarla y usa IAM Identity Center u otros administradores delegados cuando corresponda.

La charla [AWS Organizations y buenas prácticas en la cuenta root](https://www.youtube.com/watch?v=eQJBvwJfPec), publicada por Mexico in Tech, es otra explicación en español del cuidado que requiere la cuenta de administración.

### 2. Crea la organización

Desde la cuenta elegida, abre la consola de **AWS Organizations** y crea la organización. AWS recomienda habilitar **All features**; es el valor predeterminado al crearla desde la consola y permite usar políticas de organización e integraciones avanzadas con otros servicios. **Consolidated billing only** también permite crear e invitar cuentas, pero no incluye SCP ni las integraciones y controles avanzados. El cambio desde solo facturación hacia All features requiere aprobación de las cuentas invitadas y es unidireccional ([conjuntos de funciones](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_support-all-features.html)).

Al crear una organización con **All features** desde la consola de Organizations, AWS aplica ahora una SCP predeterminada que impide que las cuentas miembro se retiren o se cierren por su cuenta. Esta aplicación automática corresponde a organizaciones creadas desde la consola después del 10 de julio de 2026. Las organizaciones anteriores y las creadas con CLI, SDK o CloudFormation no reciben ese control automáticamente; revisa la política de la raíz antes de depender de él ([controles de seguridad predeterminados](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_security_default_controls.html)).

**Revisa el plan de cuenta antes de crear una organización o incorporar una cuenta.** Las cuentas con el nuevo **Free account plan** pasan automáticamente al plan Paid al crear o unirse a AWS Organizations. Sus créditos Free Tier expiran inmediatamente y dejan de ser elegibles para obtener más créditos. AWS documenta la expiración al [crear una organización desde una cuenta gratuita](https://docs.aws.amazon.com/singlesignon/latest/userguide/enable-identity-center.html) y al [unirse a una organización](https://aws.amazon.com/free/free-tier-faqs/). Esta condición corresponde al plan nuevo; comprueba las [condiciones del plan de tu cuenta](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html) antes de continuar.

### 3. Crea OUs y agrega cuentas

Crea OUs cuando varias cuentas deban heredar el mismo control. Si la organización está bajo Control Tower, crea y administra las OUs desde Control Tower para que su estado de registro coincida con la organización.

Para incorporar cuentas tienes dos opciones:

- **Crear una cuenta miembro.** En la consola de Organizations, abre **AWS accounts**, elige **Add an AWS account** y luego **Create an AWS account**. Completa el nombre y un correo que no esté asociado con otra cuenta de AWS. Organizations crea la cuenta bajo la raíz de la organización; cuando aparezca, muévela a su OU con el procedimiento de abajo. La cuenta creada por Organizations incluye el rol `OrganizationAccountAccessRole`; una persona administradora todavía debe tener permiso en la cuenta de administración para asumirlo ([crear una cuenta miembro](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_create.html)).
- **Invitar una cuenta existente.** En **AWS accounts**, elige **Add an AWS account** y luego **Invite an existing AWS account**. Introduce el ID o correo del propietario y envía la invitación. El propietario debe aceptarla desde su cuenta para que se incorpore. La aceptación no crea `OrganizationAccountAccessRole` ni concede acceso administrativo desde la cuenta de administración. Si necesitas ese acceso, crea el rol manualmente; también puedes usar IAM Identity Center para asignar acceso a las personas. Si la cuenta pertenece a otra organización, sigue el procedimiento de migración antes de aceptar ([aceptar invitaciones](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_accept-decline-invite.html), [rol para cuentas invitadas](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_create-cross-account-role.html), [migrar una cuenta](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_account_migration.html)).

Si cambias una cuenta de una organización existente, revisa el plan Free account y los acuerdos de servicio; su estado de facturación y de políticas puede cambiar al unirse. La unión no traslada recursos a otra cuenta.

## Conceder acceso a personas con IAM Identity Center

AWS recomienda una instancia de organización de IAM Identity Center para administrar el acceso a varias cuentas. Organizations no es obligatorio para IAM Identity Center en todos los casos, pero la instancia de organización ofrece acceso centralizado a cuentas. Si ya usas Organizations, habilita **All features** antes de configurar esa instancia ([IAM Identity Center y Organizations](https://docs.aws.amazon.com/singlesignon/latest/userguide/identity-center-and-orgs.html)).

Un flujo de inicio comprobable es:

1. Desde una sesión administrativa en la cuenta de administración, habilita la instancia de organización de IAM Identity Center y selecciona la fuente de identidad que corresponda: su directorio o un proveedor conectado.
2. Crea o sincroniza los usuarios y grupos; crea conjuntos de permisos con las políticas adecuadas al trabajo.
3. En IAM Identity Center, abre **Multi-account permissions → AWS accounts**, selecciona una cuenta y elige **Assign users or groups**.
4. Selecciona usuarios o grupos, elige los conjuntos de permisos, revisa la asignación y envíala. Comprueba el acceso desde el portal de AWS ([asignar acceso a cuentas](https://docs.aws.amazon.com/singlesignon/latest/userguide/assignusers.html)).

Para quitar una asignación, abre **AWS accounts**, selecciona la cuenta, marca el usuario o grupo bajo **Assigned users and groups** y elige **Remove access**. Si necesitas responder a una sesión comprometida que ya está activa, AWS documenta un proceso separado para cerrar sesiones y revocar acceso; retirar una asignación no sustituye ese proceso de respuesta ([quitar acceso](https://docs.aws.amazon.com/singlesignon/latest/userguide/howtoremoveaccess.html), [revocar sesiones activas](https://docs.aws.amazon.com/singlesignon/latest/userguide/revoke-user-permissions.html)).

## Aplicar límites con SCP

Una SCP establece el máximo de acciones que pueden realizar usuarios y roles IAM en las cuentas miembro que la heredan. No da permisos: una política IAM o de recurso todavía debe autorizar la acción. Una SCP puede afectar también al usuario raíz de una cuenta miembro, pero no afecta a usuarios o roles de la cuenta de administración ni a roles vinculados a servicios (*service-linked roles*) ([guía de SCP](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html)).

Necesitas **All features** para usar SCP. AWS permite adjuntar hasta diez SCP a cada raíz, OU o cuenta, con un máximo de 10.240 caracteres por política. Piensa en estas cuotas al decidir cuántos controles administrar de forma separada; consulta los [límites vigentes de Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_reference_limits.html) si tu estructura se acerca a ellos.

Una SCP aplicada a una OU también alcanza a sus descendientes. Antes de adjuntar o cambiar una política, revisa las acciones necesarias de las cargas que heredarán el control y prueba el resultado en una cuenta miembro. Si una política “permite todo” pero IAM no concede la acción, seguirá sin haber acceso; si una SCP la deniega o la excluye del máximo permitido, una política IAM no podrá anular ese límite.

## Cuándo añadir AWS Control Tower

Organizations aporta la jerarquía de cuentas y las políticas. **AWS Control Tower** es una opción adicional para aprovisionar cuentas con Account Factory y administrar una landing zone con controles preventivos, detectivos y proactivos. Reutiliza la cuenta de administración de Organizations y admite una sola landing zone por organización ([qué hace Control Tower](https://docs.aws.amazon.com/controltower/latest/userguide/), [gobernar una organización existente](https://docs.aws.amazon.com/controltower/latest/userguide/about-extending-governance.html)).

No des por hecho que cada cuenta y OU queda gobernada al activar Control Tower. Los controles se aplican a las OUs registradas y cuentas inscritas; las cuentas creadas fuera de Account Factory y las OUs no registradas pueden quedar fuera de esos controles. Registra la OU o inscribe la cuenta según el procedimiento de Control Tower. Si IAM Identity Center ya está configurado, comprueba además que su región coincida con la región principal de Control Tower.

Un recurso en español para complementar la guía es [Configurando nuestro entorno de trabajo con AWS Organization y AWS Identity Center](https://blog.alfalfita.cloud/configurando-nuestro-entorno-de-trabajo-con-aws-organization-y-aws-identity-center), de Diana Alfaro. Para una explicación grabada de Control Tower, [AWS Control Tower: gestión de cuentas en organizaciones](https://www.youtube.com/watch?v=a9YX34w9jDE), de Marcia en Desplegando Cloud, presenta el tema en Charlas Técnicas de AWS. Verifica los pasos de consola con la documentación oficial vigente.

## Mover, retirar o cerrar una cuenta

**Mover** una cuenta cambia los controles que hereda, pero no traslada sus recursos. Desde la cuenta de administración, abre **AWS accounts**, selecciona la cuenta, elige **Actions → AWS account → Move**, elige la OU o la raíz destino y confirma. Necesitas `organizations:MoveAccount`; la cuenta hereda las políticas de su nueva cadena de OUs ([pasos oficiales para mover cuentas](https://docs.aws.amazon.com/organizations/latest/userguide/move_account_to_ou.html)).

Si la cuenta está inscrita en Control Tower, usa su procedimiento de **Update and move accounts** y revisa los controles de la OU destino. El resultado también depende de la configuración de inscripción automática: un movimiento directo puede requerir corregir el estado *drift* de Control Tower ([mover cuentas con Control Tower](https://docs.aws.amazon.com/controltower/latest/userguide/updating-account-factory-accounts.html)).

**Retirar** una cuenta de la organización no cierra la cuenta. Desde la cuenta de administración, en **AWS accounts**, selecciona la cuenta, elige **Actions → AWS account → Remove from organization** y confirma. La cuenta pasa a ser independiente, deja de heredar políticas de Organizations y asume los cargos nuevos. Antes de retirarla, verifica que tenga los datos requeridos para operar sola —contacto validado, método de pago y plan de soporte— y que no sea administradora delegada de un servicio. Una cuenta creada en la organización debe tener al menos cuatro días; una cuenta invitada no tiene esa espera. Si Control Tower la gobierna, primero elige **Unmanage** desde **Organization** en la consola de Control Tower y espera a que indique **Not enrolled**. Después de retirarla, revisa y elimina el rol IAM que daba acceso a la antigua cuenta de administración: Organizations no lo borra automáticamente ([requisitos y pasos para retirar cuentas](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_remove.html), [retirar una cuenta de Control Tower](https://docs.aws.amazon.com/controltower/latest/userguide/unmanage-account.html)).

**Cerrar** una cuenta sí inicia el cierre de esa cuenta. Para cerrar una cuenta miembro desde Organizations, inicia sesión en la cuenta de administración, selecciónala en **AWS accounts**, elige **Close** y confirma el ID. La opción de cierre desde Organizations requiere **All features**. Con solo facturación consolidada, cierra desde la página **Account** de esa cuenta iniciando sesión como su usuario raíz. No cierres la cuenta de administración desde Organizations. Si la cuenta está inscrita en Control Tower, primero quítale la administración de Control Tower y sigue el procedimiento de cierre de cuenta; cerrar y desinscribir son acciones distintas ([cerrar cuentas miembro](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_close.html), [cerrar una cuenta de Control Tower](https://docs.aws.amazon.com/controltower/latest/userguide/delete-account.html)).

Si una cuenta no puede retirarse o cerrarse, revisa primero los permisos y SCP heredados. En organizaciones creadas después del 10 de julio de 2026 desde la consola, la SCP predeterminada bloquea que la propia cuenta miembro se retire o se cierre; la cuenta de administración puede retirar la cuenta o iniciar su cierre desde Organizations. No confundas **Remove from organization** con **Close**: la primera acción conserva la cuenta como independiente.

## Aprende y participa

AWS Student Builder Group de la Universidad Nacional Autónoma de México anuncia para el 17 de octubre de 2026, de 12:00 a 14:00, hora UTC−6, la clase en línea [#CertOps: Manejo de cuentas, facturación y soporte](https://www.meetup.com/aws-sbg-at-national-autonomous-univ-of-mexico-central-campus/events/316827297/). Puedes seguir las actividades del grupo [AWS SBG at National Autonomous University of Mexico](https://www.meetup.com/aws-sbg-at-national-autonomous-univ-of-mexico-central-campus/). Consulta el RSVP para confirmar disponibilidad e inscripción; la información publicada no confirma gratuidad ni requisitos de participación.

También puedes explorar el [directorio de comunidades AWS](/comunidades/) y la [agenda de eventos comunitarios](/eventos/) para encontrar grupos y próximas sesiones en otros países.

## Preguntas frecuentes

### ¿Organizations concede permisos a los usuarios de las cuentas?

No. Organizations agrupa cuentas y puede limitar acciones mediante SCP. IAM o IAM Identity Center asigna los permisos que las personas y roles necesitan; una SCP no concede permisos.

### ¿La facturación consolidada comparte los recursos entre cuentas?

No. Reúne el pago y los cargos de las cuentas miembro en la cuenta de administración; los recursos siguen en sus cuentas. Para compartir un recurso, configura el mecanismo del servicio correspondiente.

### ¿Necesito AWS Control Tower para usar Organizations?

No. Organizations administra la relación entre cuentas, las OUs y las políticas. Control Tower es opcional y añade una landing zone, aprovisionamiento y controles que requieren inscripción y registro.
