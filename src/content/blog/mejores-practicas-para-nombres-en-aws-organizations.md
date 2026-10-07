---
title: "Cómo nombrar cuentas y OUs en AWS Organizations: guía y ejemplos"
description: "Define nombres claros para cuentas AWS y OUs: distingue nombre, ID, alias de IAM y correo raíz, organiza por controles y entiende el alcance real de las etiquetas."
author: "guille-ojeda"
publishedAt: "2025-03-03"
publishedTimestamp: "2025-03-03T04:59:25.364Z"
modifiedTimestamp: "2026-10-06T23:48:20-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Arquitectura multi-cuenta en AWS: cómo separar cuentas y OUs"
    url: "https://dondeaprendoaws.com/blog/estructuras-multi-cuenta-aws-para-escalar/"
  - title: "AWS Organizations: cómo administrar varias cuentas"
    url: "https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/"

---

Una convención de nombres ayuda a reconocer cuentas y unidades organizativas (OUs) en la consola, los informes y los inventarios. El nombre es una etiqueta para las personas: no concede permisos, no aísla cargas y no reemplaza el identificador de la cuenta. Diseña las OUs según los controles que sus cuentas deben compartir y usa nombres breves que expliquen su función.

Si todavía estás decidiendo qué cargas separar en cuentas, consulta [Arquitectura multi-cuenta en AWS: cómo separar cuentas y OUs](/blog/estructuras-multi-cuenta-aws-para-escalar/). Para los pasos de creación y administración de una organización, continúa con [AWS Organizations: cómo administrar varias cuentas](/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/).

## Distingue el nombre de la cuenta de sus identificadores

AWS utiliza varios datos distintos para una cuenta. Conviene saber cuál ve una persona y cuál necesita una herramienta:

En móvil, desplaza las tablas hacia los lados para ver todas las columnas.

| Dato | Para qué sirve | Qué tener en cuenta |
| --- | --- | --- |
| **Nombre de la cuenta** | Ayuda a reconocerla en AWS Organizations, la consola y la facturación. | Es una etiqueta legible y se puede actualizar. Evita incluir información personal o sensible. |
| **ID de cuenta** | Identifica de forma única la cuenta con 12 dígitos. | Úsalo en inventarios, automatizaciones y referencias entre cuentas; no dependas del nombre visible para identificarla. |
| **Correo del usuario raíz** | Es la dirección asociada al usuario raíz de la cuenta. | Al crear una cuenta miembro, AWS exige un correo que no esté asociado con otra cuenta. Elige uno que las personas responsables puedan mantener y recuperar. |
| **Alias de cuenta de IAM** | Puede aparecer en la URL de inicio de sesión de usuarios de IAM en vez del ID. | Es opcional, no es secreto y tiene reglas propias: solo minúsculas, números y guiones; debe ser único en su partición de AWS. |
| **Nombre de una OU** | Ayuda a reconocer el grupo de cuentas y su propósito. | Debe ser único entre las OUs que comparten el mismo padre. Las políticas se adjuntan a la OU, no se activan por el nombre. |

El nombre, el correo raíz y el alias de IAM son campos diferentes; AWS lo aclara al [crear una cuenta miembro](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_create.html). El [ID de cuenta](https://docs.aws.amazon.com/IAM/latest/UserGuide/console-account-alias.html) es el número de 12 dígitos que identifica la cuenta. Un alias solo cambia la URL de inicio de sesión de usuarios de IAM; si tu equipo usa federación o IAM Identity Center, no necesitas definir uno para que la cuenta tenga un nombre comprensible.

Por ejemplo, `acme-payments-prod` puede ser el nombre visible, `111122223333` su ID y `acme-payments-prod` un alias de IAM. Aunque el nombre y alias coincidan, siguen siendo datos distintos y cumplen funciones diferentes. El alias aparece en una URL pública de inicio de sesión, así que no incluyas secretos ni datos sensibles en él.

El usuario raíz (*root user*) es una identidad asociada a cada cuenta; no es el nombre de la cuenta ni la cuenta de administración de Organizations. La cuenta de administración es la cuenta que gobierna la organización, como explica la guía de [conceptos de AWS Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_getting-started_concepts.html). El [webinar de Mexico in Tech sobre Organizations y buenas prácticas para la cuenta root](https://www.youtube.com/watch?v=eQJBvwJfPec) repasa la estructura multi-cuenta, las OUs, las SCP y el cuidado del usuario raíz; puedes consultar más sesiones en el [canal de Mexico in Tech](https://www.youtube.com/@MexicoinTech).

Puedes cambiar el nombre visible de una cuenta. Para cuentas miembro, el cambio centralizado requiere una organización con todas las funciones habilitadas y acceso de confianza para AWS Account Management; consulta cómo [actualizar el nombre de una cuenta](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-update-acct-name.html). También puedes [renombrar una OU](https://docs.aws.amazon.com/organizations/latest/userguide/rename_ou.html) desde la cuenta de administración. Renombrarla cambia la etiqueta; mover cuentas a otra OU es una acción distinta y puede cambiar las políticas que heredan.

## Define una convención breve para los nombres de cuenta

Empieza con las partes que una persona necesita reconocer: la organización, la función o carga de trabajo y, si corresponde, el entorno. Un patrón posible es:

```text
<organizacion>-<funcion-o-carga>-<entorno>
```

| Nombre de ejemplo | Qué indica |
| --- | --- |
| `acme-payments-prod` | Carga de pagos en producción. |
| `acme-payments-dev` | Entorno de desarrollo de pagos. |
| `acme-security-audit` | Cuenta de auditoría o herramientas de seguridad. |
| `acme-network-shared` | Servicios de red compartidos. |
| `acme-org-management` | Cuenta que administra AWS Organizations. |

Usa un vocabulario acordado para ambientes y funciones, y mantén los mismos separadores en todo el inventario. No es necesario incluir todos los componentes en cada nombre. Evita nombres de personas, clientes, secretos, fechas de retiro o equipos que pueden cambiar; guarda el responsable, el centro de costos y otros datos que cambian en etiquetas o en el inventario de cuentas. No agregues una región por costumbre: una cuenta de AWS puede contener recursos en varias regiones, salvo que tenga un propósito deliberadamente regional.

AWS recomienda nombres reconocibles basados en organización, propósito y ambiente, y desaconseja reflejar información personal en ellos. El nombre ayuda a una persona a orientarse, pero una cuenta llamada `prod` no se convierte por eso en una cuenta de producción protegida. Define el acceso y los controles con las políticas y servicios correspondientes.

## Nombra las OUs por los controles que agrupan

Una OU es un contenedor lógico de cuentas. AWS recomienda diseñar las OUs por función o por el conjunto de controles que comparten, en lugar de copiar el organigrama de la empresa. Las políticas compatibles adjuntas a una OU se heredan por sus cuentas y OUs descendientes ([buenas prácticas de OUs](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_ous_best_practices.html), [cómo funcionan las OUs](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_ous.html)).

Una estructura inicial podría verse así:

```text
Raíz de Organizations
├── Security
├── Infrastructure
└── Workloads
    ├── Nonproduction
    └── Production
```

Es un ejemplo, no una plantilla obligatoria. Usa `Security` o `Infrastructure` si sus cuentas necesitan controles comunes distintos de las cargas de negocio. Separa `Production` y `Nonproduction` cuando los límites de permisos, cambios o datos deban ser diferentes. Si dos grupos solo pertenecen a áreas distintas del organigrama, pero necesitan los mismos controles, no hace falta crear una OU para cada uno.

Una OU llamada `Production` no convierte una cuenta en producción ni bloquea acciones. El efecto depende de las políticas realmente adjuntas a la jerarquía. Revisa la cadena de políticas heredadas antes de mover una cuenta: [AWS explica cómo se comportan las políticas de una OU](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html). Mantén la jerarquía corta y agrega niveles solo cuando hagan más clara la aplicación de controles.

Para automatizaciones, identifica OUs por su ID o ARN, no por la etiqueta que ven las personas. Los nombres de OU pueden cambiar y solo deben ser únicos dentro del mismo padre; la [referencia de la API de Organizations](https://docs.aws.amazon.com/organizations/latest/APIReference/API_OrganizationalUnit.html) documenta el ID y el nombre de una OU.

## Usa etiquetas como metadatos y conoce sus límites

Las etiquetas pueden ayudar a encontrar cuentas y recursos por `owner`, `cost-center`, `application` o `environment`. Acuerda la escritura de las claves y los valores permitidos; por ejemplo, usa siempre `cost-center` y valores como `FIN-42`, en vez de crear variantes como `CostCenter`, `cost_center` y `centro-costos`.

Distingue las etiquetas aplicadas a una cuenta u OU en Organizations de las etiquetas que cada servicio admite en sus recursos; AWS las administra como tipos de recurso distintos en su guía de [etiquetado de recursos de Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_tagging.html). No asumas que una etiqueta de la cuenta se copia automáticamente a sus recursos. Una etiqueta tampoco concede ni limita acceso por sí sola: una política de IAM, de Organizations u otra configuración debe usarla para producir ese efecto.

Las [políticas de etiquetas de Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_tag-policies.html) ayudan a estandarizar claves, mayúsculas y valores. Algunas reglas se pueden aplicar para bloquear operaciones de etiquetado no conformes en tipos de recurso compatibles. Esto no garantiza que todo recurso se cree con todas las claves obligatorias: las reglas básicas no hacen cumplir las etiquetas que faltan en recursos creados sin ellas. La cobertura depende de los servicios y operaciones admitidos; la documentación describe el [alcance de la aplicación y las claves requeridas](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_tag-policies-enforcement.html).

Para requerir etiquetas durante una creación, evalúa la opción de claves requeridas con tu herramienta de infraestructura como código o una SCP que use condiciones de solicitud, cuando la acción del servicio las admita. AWS recomienda [revisar el soporte y probar la aplicación en una cuenta antes de ampliarla](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_tag-policies-best-practices.html); una SCP limita acciones en cuentas miembro, pero no concede permisos ni afecta a la cuenta de administración. Esa excepción corresponde a las SCP: las políticas IAM siguen definiendo el acceso a identidades de la cuenta de administración, y AWS documenta que las políticas de etiquetas también la afectan. Consulta la [tabla de alcance de las políticas de Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies.html), y la condición `aws:RequestTag` en la [referencia de claves de condición de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-requesttag). Para detectar etiquetas faltantes o no conformes después de crear recursos, configura informes y reglas compatibles con los tipos de recurso que usas.

Para otra explicación en español, [AWS Women Colombia comparte una charla sobre políticas de control con AWS Organizations](https://www.youtube.com/watch?v=2lLxBlric5I), disponible junto con más grabaciones en su [canal de YouTube](https://www.youtube.com/@awswomencolombia). Úsala para complementar los conceptos; valida el alcance de cada control en la documentación oficial antes de aplicarlo.

El límite de etiquetas también depende del servicio y del tipo de recurso. Comprueba la documentación del recurso concreto antes de fijar una cuota o exigir una lista de claves común a toda la organización.

## Recursos en español y comunidades AWS

Para contrastar una estructura multi-cuenta, Daniel Castillo presenta en [AWS Organizations Landing Zone](https://dcastillogi.com/arquitecturas/aws-organizations-landing-zone) un ejemplo de cuentas para seguridad, registros, redes, cargas y sandbox. Úsalo como una referencia para discutir controles y responsables; no como una topología que debas copiar sin adaptarla.

Si quieres conversar sobre AWS con otras personas, el portal de [AWS User Group Perú](https://awsugperu.cloud/) reúne su agenda, mapa de grupos locales y recursos. También puedes explorar el [directorio de comunidades AWS](/comunidades/) para encontrar grupos de otros países.

La ficha de Meetup anuncia [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) para el 20 de octubre de 2026, de 19:00 a 20:00 (UTC−5), en línea y con cupos limitados. La organiza [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/). Revisa el RSVP para confirmar si todavía hay lugar y las condiciones de registro; la ficha no garantiza la asistencia ni indica que el evento sea gratuito. Puedes consultar más sesiones en la [agenda de eventos AWS](/eventos/).

## Preguntas frecuentes

### ¿Puedo cambiar el nombre de una cuenta o una OU?

Sí. AWS permite actualizar el nombre de una cuenta y renombrar una OU. El cambio de nombre no sustituye una decisión de mover la cuenta a otra OU; ese movimiento puede modificar los controles heredados.

### ¿Una OU debe representar un departamento?

No necesariamente. AWS recomienda agrupar cuentas por función o controles comunes. Usa una OU departamental solo si ese grupo necesita una política o un tratamiento operativo distinto.

### ¿Las políticas de etiquetas impiden siempre crear recursos sin etiquetas?

No. La aplicación depende del servicio, el tipo de recurso y la operación. Las reglas básicas no bloquean recursos creados sin etiquetas; para exigir claves, revisa los mecanismos compatibles con tu herramienta y servicio.
