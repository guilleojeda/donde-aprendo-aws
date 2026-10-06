---
title: "Arquitectura multi-cuenta en AWS: cómo separar cuentas y OUs"
description: "Decide qué cargas merecen una cuenta propia en AWS y cómo agruparlas en OUs según sus controles, límites operativos y responsables."
author: "guille-ojeda"
publishedAt: "2025-09-08"
publishedTimestamp: "2025-09-08T14:45:28.938000+00:00"
modifiedTimestamp: "2026-10-06T15:51:02-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "AWS Organizations: cómo administrar varias cuentas"
    url: "https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/"
  - title: "AWS Organizations: estructura de cuentas, OUs y nombres"
    url: "https://dondeaprendoaws.com/blog/aws-organizations-estructuras-de-cuentas-y-nombres/"
  - title: "Recursos compartidos en arquitecturas serverless multi-tenant"
    url: "https://dondeaprendoaws.com/blog/recursos-compartidos-en-arquitecturas-serverless-multi-tenant/"

---

Una arquitectura multi-cuenta en AWS parte de una decisión concreta: **qué cargas necesitan límites de seguridad, operación o responsabilidad propios**. Abrir una cuenta para cada equipo puede crear trabajo innecesario; mantener todo en una sola cuenta puede mezclar permisos, cambios y riesgos que deberían estar separados.

AWS Organizations reúne y organiza cuentas, pero no elige esos límites por ti. Esta guía sirve para decidir qué poner en cuentas distintas y cuáles agrupar en unidades organizativas (OUs). Para crear la organización, invitar o crear cuentas y configurar sus políticas, continúa con [AWS Organizations: cómo administrar varias cuentas](/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/).

## Cuenta y OU resuelven problemas diferentes

Una **cuenta de AWS** contiene recursos y sus propias identidades y políticas IAM. Separar dos cargas en cuentas distintas crea un límite administrativo útil para reducir el alcance de ciertos errores y asignar responsabilidades. Ese límite no impide por sí solo el acceso entre cuentas: los roles, las políticas de recursos y los servicios para compartir recursos todavía requieren una configuración explícita.

Una **OU** agrupa cuentas para aplicar controles organizativos comunes. Una OU no contiene directamente las cargas ni concede acceso a sus usuarios. Piensa primero en las diferencias entre las cargas; después agrupa en OUs las cuentas que necesitan controles parecidos. AWS recomienda organizar las OUs por función o controles compartidos, no copiar el organigrama de la empresa ([buenas prácticas de OUs](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_ous_best_practices.html), [principios de diseño multi-cuenta](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/design-principles-for-your-multi-account-strategy.html)).

| Decisión | Usa una cuenta distinta cuando… | Agrupa en una OU cuando… |
| --- | --- | --- |
| Seguridad y confianza | La carga necesita administradores, roles de despliegue o barreras frente a otras cargas. | Varias cuentas deben recibir el mismo control preventivo o administrativo. |
| Operación | Tiene dueño, ciclo de cambio o proceso de respuesta a incidentes independiente. | Las cuentas comparten un modelo de operación y controles. |
| Producción | Necesitas separar permisos, cambios y pruebas de los de producción. | Las cuentas de producción requieren un conjunto de controles común. |
| Datos y obligaciones | La sensibilidad, el acceso o el alcance que debe revisarse justifican un límite adicional. La cuenta ayuda a organizar ese límite, pero no demuestra por sí sola cumplimiento. | Las cuentas comparten las mismas necesidades de gobierno; conserva excepciones donde los controles deban diferir. |
| Ciclo de vida | La carga tendrá un responsable, duración o retiro independiente. | Varias cuentas temporales necesitan las mismas reglas mientras existan. |

## Un ejemplo para convertir criterios en una jerarquía

Imagina que una empresa opera una aplicación de pagos y un portal interno. Pagos tiene un equipo independiente y datos sensibles; el portal comparte el equipo y el proceso de publicación con otras herramientas internas. La separación puede empezar así:

```text
Raíz de AWS Organizations
├── Cuenta de administración — tareas de la organización; sin cargas de trabajo
├── OU Security
│   └── Cuenta de auditoría y herramientas de seguridad
├── OU Infrastructure
│   └── Cuenta de red compartida
└── OU Workloads
    ├── OU Nonproduction
    │   ├── Cuenta payments-dev
    │   └── Cuenta internal-tools-dev
    └── OU Production
        ├── Cuenta payments-prod
        └── Cuenta internal-tools-prod
```

Es un ejemplo para razonar, no una plantilla que todas las empresas deban copiar. Si una aplicación tiene responsables, accesos o cambios de producción diferentes, separa su cuenta de producción. Si varias herramientas internas comparten esos límites, mantenerlas juntas puede ser más simple. Añade una OU únicamente cuando necesites que sus cuentas reciban un tratamiento distinto.

Para comparar otra topología de una landing zone, [AWS Organizations Landing Zone](https://dcastillogi.com/arquitecturas/aws-organizations-landing-zone), de Daniel Castillo, presenta una organización de varias cuentas y controles. Úsala como ejemplo para contrastar con tus responsables y cargas.

Las cuentas también pueden necesitar conectividad entre sí. Ese requisito se resuelve en la arquitectura de red y los servicios de intercambio, aparte de decidir qué controles deben heredar sus OUs. [AWS Transit Gateway en estrategias de multi cuentas](https://www.youtube.com/watch?v=W4jdwSYDz4k), una charla de AWS User Group Perú con Carlos Cruzado de Bwit, sirve como introducción a ese tema.

Mantén la **cuenta de administración** para gestionar la organización, sus políticas y tareas que requieren esa cuenta. AWS recomienda no desplegar cargas en ella: las SCP no se aplican allí y el acceso tiene privilegios sobre la organización ([buenas prácticas de la cuenta de administración](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_best-practices_mgmt-acct.html)). Las cuentas de seguridad, red o plataforma son cuentas miembro separadas, no sustitutos de la cuenta de administración.

## Una secuencia breve para diseñar tus cuentas

1. **Lista las cargas y sus responsables.** Anota quién aprueba despliegues, responde incidentes y decide cuándo retirar cada carga.
2. **Compara sus límites.** Identifica diferencias en acceso, clasificación de datos, ciclo de cambio, controles requeridos y cuotas de servicio. Separa una carga cuando una diferencia real justifique el trabajo de administrarla como cuenta propia.
3. **Aparta producción de entornos de prueba.** Si los permisos y las consecuencias de un cambio son distintos, no dependas solo de etiquetas o nombres para distinguirlos.
4. **Agrupa cuentas por controles comunes.** Diseña primero las OUs funcionales; agrega niveles por entorno cuando las políticas de producción y no producción deban cambiar.
5. **Revisa el diseño antes de mover cuentas.** Comprueba qué controles se heredarán de la raíz y de cada OU, qué permisos IAM seguirán siendo necesarios y cómo se desplegarán actualizaciones en cada cuenta. Si tus entregas deben llegar a varias cuentas, consulta [Pipeline CI/CD multi-cuenta](https://dcastillogi.com/arquitecturas/pipeline-cicd-multi-cuenta), de Daniel Castillo, como referencia de operación.

Una estructura pequeña y comprensible es más fácil de operar. AWS Organizations permite hasta **cinco niveles de OUs bajo la raíz**; no es una meta que debas alcanzar. Empieza con las OUs que tienen controles distintos y agrega otras cuando un requisito comprobable lo justifique ([límites de Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_reference_limits.html)). Para el detalle de jerarquías y nombres, consulta también [AWS Organizations: estructura de cuentas, OUs y nombres](/blog/aws-organizations-estructuras-de-cuentas-y-nombres/).

## Qué puede hacer una SCP y qué debes resolver en IAM

Las políticas de control de servicios (**SCP**) ponen un límite máximo a las acciones disponibles para usuarios y roles en cuentas miembro. No conceden permisos: IAM o una política de recurso debe permitir la acción. Las SCP no se aplican a la cuenta de administración ni restringen roles vinculados a servicios (*service-linked roles*). Ten presentes esas excepciones antes de usar una SCP como barrera de seguridad ([documentación de SCP](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html)).

Para un repaso en español, [Entendiendo las Service Control Policies](https://dev.to/terry_cloud/-entendiendo-las-service-control-policies-scps-en-aws-organizations-40li) explica este tipo de política. La comunidad [AWS Women Colombia](https://awswomencolombia.com/) comparte la grabación [El Ataque del Nivel 200: Políticas de Control con AWS Organizations](https://www.youtube.com/watch?v=2lLxBlric5I).

No uses una SCP para sustituir la administración de acceso humano. AWS IAM Identity Center permite asignar acceso a usuarios o grupos y conjuntos de permisos; cumple una función distinta de la de las SCP. La [guía operativa de Organizations](/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/) explica esa separación y cómo aplicarla.

## Evita separar cuentas por reflejo

Más cuentas no significan automáticamente menos riesgo. Cada una requiere acceso administrativo, contactos, actualizaciones y supervisión. Antes de abrir una cuenta nueva, pregúntate:

- ¿Necesita un límite de permisos o de cambios distinto al de las cuentas que ya existen?
- ¿Hay una persona o equipo que responda por ella durante todo su ciclo de vida?
- ¿Puedes aplicar y revisar los mismos controles de forma repetible?
- ¿Se entiende dónde desplegar una carga nueva sin añadir excepciones a cada OU?

Si la respuesta a la primera pregunta es no y las demás respuestas dependen de controles comunes, puede bastar con una cuenta existente y una organización lógica de sus recursos. Para una arquitectura SaaS, no confundas la cuenta AWS con el límite entre clientes de la aplicación: un modelo multi-tenant puede compartir recursos con aislamiento implementado en la aplicación. Lee [recursos compartidos en arquitecturas serverless multi-tenant](/blog/recursos-compartidos-en-arquitecturas-serverless-multi-tenant/) para ese caso.

## Recursos en español para seguir aprendiendo

La serie [Cómo lograr un gobierno de múltiples cuentas a escala con AWS Control Tower](https://dev.to/aws-builders/como-lograr-un-gobierno-de-multiples-cuentas-a-escala-con-aws-control-tower-parte-1-1iko) amplía el diseño con una landing zone y controles de Control Tower. Para integrar servicios de una carga que cruza cuentas, el episodio en español [AWS mejora EventBridge para arquitecturas multi-cuenta a gran escala](https://desplegando.substack.com/p/aws-mejora-eventbridge-para-arquitecturas), de Desplegando Cloud, sirve como referencia temática.

Al revisar el acceso de varias cuentas, [este caso de auditoría de IAM en una AWS Organization](https://roadtocloudsec.la/posts/encontre-access-key-2018-activa-produccion-python-boto3) y la herramienta comunitaria [iam-audit](https://github.com/gerardokaztro/iam-audit) muestran formas de buscar claves antiguas, revisar MFA y auditar identidades. Son materiales de terceros: antes de ejecutar una herramienta, inspecciona el código y limita el rol a las acciones que tu revisión permita.

Si quieres conversar sobre controles y operación, [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/) publica sus encuentros. El grupo tiene anunciado en línea [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/) para el 20 de octubre de 2026. Si la fecha sigue vigente, consulta el RSVP para confirmar inscripción, disponibilidad y condiciones. También puedes explorar el [directorio de comunidades AWS](/comunidades/) y la [agenda de eventos](/eventos/) para encontrar otras sesiones.

## Preguntas frecuentes

### ¿Debo crear una cuenta por cada equipo?

No necesariamente. Crea cuentas distintas cuando las cargas necesiten límites de acceso, operación, cambios o responsabilidad separados. Agrupa en OUs las cuentas que sí deban compartir controles.

### ¿Una OU concede permisos a las cuentas?

No. La OU organiza cuentas y puede servir como destino de políticas de Organizations. Los permisos de personas y roles se administran con IAM o IAM Identity Center; una SCP limita el máximo disponible en las cuentas miembro.

### ¿Cuántos niveles de OUs permite AWS Organizations?

AWS Organizations admite hasta cinco niveles anidados de OUs debajo de la raíz. El límite no recomienda crear cinco: usa la profundidad que puedas explicar y mantener.
