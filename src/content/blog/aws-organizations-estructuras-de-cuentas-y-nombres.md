---
title: "AWS Organizations: estructura de cuentas, OUs y nombres"
description: "Aprende a organizar cuentas y OUs en AWS Organizations según los controles que necesitan, y a elegir nombres claros sin confundirlos con permisos o identificadores."
author: "guille-ojeda"
publishedAt: "2025-02-27"
publishedTimestamp: "2025-02-27T04:44:08.163Z"
modifiedTimestamp: "2026-10-05T13:23:09-03:00"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "AWS Config: reglas de cumplimiento y remediación segura"
    url: "https://dondeaprendoaws.com/blog/automatizacion-de-cumplimiento-con-aws-config/"
---

[AWS Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_introduction.html) reúne varias cuentas de AWS bajo una administración común. Te permite organizarlas y aplicar políticas a grupos de cuentas, pero no impone una estructura única. El diseño depende de qué cargas necesitan límites separados y qué equipos deben compartir controles.

Una **cuenta de AWS** puede separar recursos, responsabilidades y costos de una carga de trabajo. Una **unidad organizativa (OU)** agrupa cuentas para administrarlas como una unidad. La cuenta de administración de la organización gobierna esa jerarquía; las demás son cuentas miembro. No confundas la *raíz de Organizations* —el contenedor superior— con el *usuario raíz* de una cuenta.

## Diseña las OUs según controles compartidos

Empieza por identificar diferencias reales en seguridad, operación, requisitos de cumplimiento o responsables. Agrupa en una OU las cuentas que necesitan un conjunto parecido de controles. AWS recomienda basar las OUs en funciones o controles comunes, en vez de copiar el organigrama de la empresa. También aconseja empezar con pocas OUs y ampliarlas cuando aparezca una necesidad concreta. Consulta las [buenas prácticas para OUs](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_ous_best_practices.html) y los [principios para una estrategia de varias cuentas](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/design-principles-for-your-multi-account-strategy.html).

Por ejemplo, una organización podría usar una estructura como esta:

```text
Raíz de Organizations
├── Cuenta de administración
├── OU Security
│   └── Cuenta security-audit
└── OU Workloads
    ├── OU Nonproduction
    │   └── Cuenta pagos-dev
    └── OU Production
        └── Cuenta pagos-prod
```

Es un punto de partida ilustrativo, no una lista de OUs obligatorias. El diagrama distingue los contenedores `OU` de las cuentas que agrupan; `security-audit`, `pagos-dev` y `pagos-prod` son ejemplos, no nombres ni cuentas que debas crear. Una OU de `Production` y otra de `Nonproduction` pueden servir cuando las cargas requieren políticas distintas; si no hay una diferencia operativa que mantener, no hace falta crear esos niveles. La cuenta de administración se dibuja en la raíz para distinguir su función de las cuentas miembro del ejemplo.

Las políticas asociadas a una OU se heredan por las cuentas que contiene y sus OUs descendientes. Por eso, revisa qué cuentas quedarían bajo el alcance antes de ampliar un control. Las OUs agrupan cuentas; su nombre por sí solo no aplica controles.

Como otra referencia visual, [AWS Organizations Landing Zone](https://dcastillogi.com/arquitecturas/aws-organizations-landing-zone) presenta un ejemplo de separación por propósito, registros y controles. Compáralo con tus propios responsables y requisitos; es una arquitectura de referencia, no una topología obligatoria.

### Qué controla una SCP y qué no

Una Service Control Policy (SCP) define el máximo de permisos disponibles para usuarios y roles IAM en cuentas miembro. **No concede permisos**: la política IAM o de recurso correspondiente también debe permitir la acción. Las SCP pueden restringir las cuentas miembro, incluido su usuario raíz, pero **no afectan a la cuenta de administración**. Tampoco restringen los roles vinculados a servicios (*service-linked roles*), que AWS usa para determinadas integraciones. Además, solo están disponibles cuando la organización tiene habilitadas todas las funciones; el modo limitado a facturación consolidada no habilita SCP. Revisa la [guía oficial de SCP](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html) antes de diseñar estos límites.

La cuenta de administración puede manejar la organización, sus políticas y la facturación. AWS recomienda limitar quién accede a ella y mantener allí solo los recursos que necesiten esas tareas, ya que las SCP no la restringen. La guía de [buenas prácticas para la cuenta de administración](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_best-practices_mgmt-acct.html) explica estos cuidados. No uses el nombre de una cuenta ni una OU como sustituto de una política de acceso.

Para una experiencia técnica de auditoría, [este artículo sobre credenciales IAM en una AWS Organization](https://roadtocloudsec.la/posts/encontre-access-key-2018-activa-produccion-python-boto3) explica cómo detectar claves antiguas y revisar MFA entre cuentas. Lee los ejemplos como material de estudio; revisa permisos y alcance antes de adaptar código a tu entorno.

## Distingue gobierno, acceso e identidad

Organizations tiene dos conjuntos de funciones. **Facturación consolidada** centraliza el pago y la vista de costos de las cuentas de una organización. **Todas las funciones**, habilitadas por defecto al crear una organización, incluye esa facturación y permite usar políticas de Organizations e integraciones con otros servicios. Si solo necesitas la factura consolidada, ese conjunto limitado no equivale a habilitar los controles de gobierno. La documentación explica [los conjuntos de funciones](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org_support-all-features.html) y [cómo funciona la facturación consolidada](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/consolidated-billing.html). La consolidación facilita ver los cargos por cuenta; no presupone un ahorro para cada organización o servicio.

Para centralizar el acceso de las personas a varias cuentas, puedes usar **AWS IAM Identity Center** y asignar conjuntos de permisos a usuarios o grupos. Cumple una función distinta de las SCP: Identity Center determina qué acceso asignar a una persona; las SCP fijan un límite máximo para las acciones disponibles en cuentas miembro. AWS recomienda una instancia de organización para el acceso a varias cuentas; si ya tienes Organizations, comprueba que estén habilitadas todas las funciones. Consulta cómo se relaciona [IAM Identity Center con Organizations](https://docs.aws.amazon.com/singlesignon/latest/userguide/identity-center-and-orgs.html).

**AWS Control Tower** es otra capa opcional. Usa Organizations para configurar y gobernar una landing zone con controles predefinidos y aprovisionamiento de cuentas; no es otro nombre para Organizations ni es un requisito para crear OUs o gestionar cuentas. Puede incorporarse a una organización existente, aunque la configuración y el alcance de sus controles tienen requisitos propios. Consulta [cómo se integra Control Tower con Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/services-that-can-integrate-CTower.html) y [cómo planificar una landing zone](https://docs.aws.amazon.com/controltower/latest/userguide/planning-your-deployment.html) antes de elegir esa opción.

Como explicación en español, el episodio [AWS Control Tower: gestión de cuentas en organizaciones](https://www.youtube.com/watch?v=a9YX34w9jDE) de Charlas Técnicas de AWS recorre landing zones y administración de cuentas. Es una grabación de 2022; úsala para entender conceptos y confirma los procedimientos actuales en la guía oficial.

## Elige nombres que ayuden a las personas

El nombre de una cuenta sirve para reconocerla en la consola y en informes. AWS lo distingue del alias de IAM y del correo del usuario raíz, y permite actualizarlo. Como punto de partida, sugiere combinar organización, propósito y entorno; adapta ese patrón a lo que el equipo realmente necesita leer. Evita incluir datos personales o información sensible. La guía para [actualizar el nombre de una cuenta](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-update-acct-name.html) describe sus usos y condiciones.

Un formato posible es `<servicio>-<entorno>` o `<función>-<servicio>-<entorno>`:

| Nombre de ejemplo | Qué permite reconocer |
| --- | --- |
| `pagos-prod` | La carga de pagos en producción |
| `pagos-dev` | El entorno de desarrollo de pagos |
| `security-audit` | Una cuenta dedicada a tareas de auditoría de seguridad |
| `network-shared` | Servicios de red compartidos |

No todas las organizaciones necesitan incluir todos esos componentes ni separar cada entorno en una cuenta. Acuerda abreviaturas, uso de mayúsculas y separadores; documenta quién es responsable y revisa la convención cuando cambie la estructura. Una cuenta llamada `prod` no se vuelve segura por ese nombre: los accesos y límites efectivos dependen de IAM, de las políticas de recursos y, en cuentas miembro, de las políticas de Organizations que correspondan.

Para automatizaciones y políticas, identifica las cuentas y recursos con sus **IDs y ARN**, no con el nombre visible. El ID de cuenta de AWS es un número de 12 dígitos que identifica la cuenta. Un ARN identifica un recurso concreto; su formato varía por servicio y muchos ARN incluyen el ID de la cuenta propietaria. Consulta la documentación de [identificadores de cuenta](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-identifiers.html) y del [formato de ARN](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html).

Para dar el siguiente paso y evaluar la configuración de los recursos dentro de tus cuentas, lee [AWS Config: reglas de cumplimiento y remediación segura](/blog/automatizacion-de-cumplimiento-con-aws-config/). Explica cómo distinguir una regla de evaluación de una corrección automática y cómo revisar su alcance antes de activarla.

## Preguntas frecuentes

### ¿Todas las organizaciones necesitan las mismas OUs?

No. Usa OUs cuando varias cuentas compartan una función o controles que quieras administrar juntas. Los ejemplos de esta guía son opciones, no una topología requerida.

### ¿Las SCP dan permisos a una persona?

No. Limitan el máximo de permisos disponibles en cuentas miembro; una política IAM o de recurso todavía debe conceder el acceso.

### ¿Necesito Control Tower para usar AWS Organizations?

No. Organizations sirve para reunir y administrar cuentas. Control Tower puede añadir una landing zone y controles predefinidos cuando ese enfoque encaje con tus necesidades.

### ¿El nombre de una cuenta puede reemplazar su ID?

No. El nombre ayuda a una persona a reconocerla y puede cambiar. Usa el ID de 12 dígitos para identificar la cuenta y el ARN cuando necesites referirte a un recurso de AWS.

## Conecta con comunidades AWS

[AWS Women Colombia](https://awswomencolombia.com/) comparte actividades y recursos de su comunidad; su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw) reúne grabaciones para continuar aprendiendo sobre AWS. Para sesiones centradas en seguridad de AWS, [AWS User Group Security Ecuador en Meetup](https://www.meetup.com/aws-user-group-security-ecuador/) reúne a profesionales y entusiastas y publica encuentros sobre AWS Security. Consulta allí las fechas, la modalidad y las condiciones de inscripción de cada sesión.

Si buscas otras opciones, el [directorio de comunidades AWS](https://dondeaprendoaws.com/comunidades/) permite explorar grupos por país y tipo; el [directorio de creadores](https://dondeaprendoaws.com/creadores/) reúne canales y blogs; y la [agenda de eventos comunitarios](https://dondeaprendoaws.com/eventos/) muestra fechas, modalidad y enlaces de inscripción vigentes.
