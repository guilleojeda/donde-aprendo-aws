---
title: "Alertas de costos en AWS: configura AWS Budgets"
description: "Configura alertas por correo o Slack con AWS Budgets. Sigue los pasos y conoce la demora de los datos, los pronósticos y cómo probar cada aviso."
author: "guille-ojeda"
publishedAt: "2024-10-27"
publishedTimestamp: "2024-10-27T03:38:07.454Z"
modifiedTimestamp: "2026-10-05T00:34:04-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Cómo reducir costos en AWS: 10 estrategias para optimizar tu factura"
    url: "https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/"

---

Para recibir alertas de costos en AWS, crea un presupuesto mensual en **AWS Budgets** y define un umbral para gasto real o previsto. El correo electrónico puede ser el único canal; para llevar los avisos a Slack, agrega Amazon SNS y configura **Amazon Q Developer in chat applications** (antes AWS Chatbot).

AWS Budgets analiza datos de facturación con demora. Una alerta sirve para enterarte y decidir qué hacer; por sí sola no detiene recursos ni limita el importe de la factura. En este flujo, Budgets evalúa el umbral y envía el aviso; Cost Explorer te ayuda a investigar de dónde viene el gasto. CloudWatch y Lambda no son necesarios para entregar estas alertas nativas.

## Qué necesitas

- Acceso a **Billing and Cost Management** y permisos para crear o editar presupuestos. El [ejemplo oficial de IAM para crear presupuestos](https://docs.aws.amazon.com/cost-management/latest/userguide/billing-example-policies.html) explica los permisos de facturación, Budgets y los servicios auxiliares que puede necesitar la consola. Pide que adapten los permisos a tu cuenta y agrega permisos de SNS y Slack solo si usarás esa ruta; no adjuntes permisos para acciones de presupuesto si no las vas a configurar.
- Una dirección de correo que puedas verificar.
- **Solo si quieres usar Slack u otro destino conectado por SNS:** un tema de Amazon SNS en la misma cuenta que el presupuesto. Quien lo configure necesita permisos para ese tema y para asociarlo al canal.

Si solo necesitas avisos por correo, omite SNS y Slack.

## Configura un presupuesto y una alerta

### 1. Crea un presupuesto mensual de costos

En **Billing and Cost Management > Budgets**, elige **Create budget**. Puedes usar la plantilla mensual si aparece en tu consola; para controlar todos los campos, elige **Customize (advanced) > Cost budget**.

Define el nombre y el importe de referencia. Para una alerta mensual sencilla, selecciona un presupuesto recurrente, periodo mensual e importe fijo. Deja el alcance general de la cuenta si quieres observar todos sus costos; agrega filtros solo cuando necesites separar un servicio, cuenta o etiqueta. Revisa también qué conceptos de costo incluye el presupuesto. Los nombres y el orden de algunas opciones pueden cambiar entre versiones de la consola.

Si separas un proyecto con un filtro por etiquetas, la clave debe estar activada como etiqueta de asignación de costos; las claves de etiquetas definidas por el usuario aparecen con el prefijo <code>user:</code>. Puede tardar hasta 24 horas en aparecer para activarla y hasta otras 24 horas en quedar activa. Consulta la [guía de AWS sobre filtros de presupuestos](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create-filters.html) y los [pasos para activar etiquetas de costos](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html). Para un ejemplo práctico en español sobre etiquetado y CDK, lee el artículo de Kevin Lupera, [AWS Cost Optimization: por qué las tags son tu mejor aliado](https://dev.to/aws-builders/aws-cost-optimization-por-que-las-tags-son-tu-mejor-aliado-1h8j). Las etiquetas que propone son una convención posible, no un requisito de AWS.

La [guía oficial para crear un presupuesto de costos](https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html) detalla las opciones y los filtros disponibles.

### 2. Elige qué condición debe activar el aviso

Agrega un umbral y selecciona **Actual** para comparar el costo ya registrado con el importe o porcentaje del presupuesto. Por ejemplo, con un presupuesto de USD 100, un umbral de USD 80 equivale al 80 %. Es una cifra ilustrativa: ajusta el umbral a tu presupuesto y al tiempo que necesitas para investigar.

Puedes agregar otro umbral de tipo **Forecasted** para recibir un aviso cuando AWS estime que superarás el importe durante el periodo. El pronóstico requiere aproximadamente cinco semanas de datos de uso. No esperes esta notificación en una cuenta nueva o antes de que exista ese historial.

AWS indica que los avisos por gasto real se envían cuando se alcanza por primera vez el umbral durante el periodo del presupuesto. Los avisos basados en pronósticos pueden repetirse si el valor previsto cruza el umbral, vuelve a quedar por debajo y lo cruza otra vez. La [guía de buenas prácticas de AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html) explica este comportamiento y la frecuencia de actualización.

### 3. Agrega correo electrónico

En las preferencias de notificación del umbral, agrega una o más direcciones y guarda el presupuesto. AWS puede pedir que cada dirección confirme la recepción; solo las direcciones verificadas reciben avisos. La consola muestra el estado del destinatario. Confirma el mensaje y vuelve a revisar hasta que figure activo. AWS admite hasta diez direcciones por alerta.

Este envío directo funciona sin SNS. Sigue la [documentación de AWS para verificar destinatarios de correo](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-email-recipients.html) si la confirmación no aparece.

### 4. Agrega SNS y Slack solo si los necesitas

Crea o elige un tema estándar de SNS y asígnalo a la alerta del presupuesto. Amazon Q Developer in chat applications no admite temas FIFO. El tema debe estar en la misma cuenta. La política del tema debe permitir que el servicio <code>budgets.amazonaws.com</code> publique en él; aplica las condiciones de cuenta y presupuesto indicadas en la [guía oficial de SNS para alertas de Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-sns-policy.html).

Si el tema tiene cifrado SSE con AWS KMS, configura la clave para permitir la publicación de Budgets. AWS documenta este flujo con una clave KMS cuya política puedas modificar; la política de la clave administrada por AWS para SNS, <code>alias/aws/sns</code>, no se puede editar, como explica la [documentación de AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-modifying.html). En esta ruta, usa una clave simétrica administrada por el cliente y concede solo los permisos KMS necesarios al publicador; la [guía de cifrado de SNS](https://docs.aws.amazon.com/sns/latest/dg/sns-key-management.html) explica las acciones requeridas. Crear y usar una clave puede generar cargos de KMS; revisa los [precios de AWS KMS](https://aws.amazon.com/kms/pricing/). Si tu organización exige cifrado, no lo desactives para hacer funcionar la alerta: corrige la política con quien administre KMS.

Para llevar las notificaciones a Slack:

1. Abre **Amazon Q Developer in chat applications**, autoriza el espacio de Slack y configura el canal. El administrador del espacio puede tener que aprobar la aplicación.
2. En Slack, invita la aplicación al canal con <code>/invite @Amazon Q</code>.
3. En la configuración del canal, selecciona la región y el tema SNS asociado al presupuesto.
4. Si el canal solo recibirá avisos, usa la plantilla de permisos **Notification permissions**. No agregues permisos para ejecutar comandos de AWS si no los necesitas.

El [tutorial oficial de Slack](https://docs.aws.amazon.com/chatbot/latest/adminguide/slack-setup.html) muestra la configuración vigente y la [guía de inicio de Amazon Q Developer in chat applications](https://docs.aws.amazon.com/chatbot/latest/adminguide/getting-started.html) describe la compatibilidad con SNS. La [guía de permisos de Amazon Q Developer in chat applications](https://docs.aws.amazon.com/chatbot/latest/adminguide/understanding-permissions.html) describe las plantillas. Para una alerta sencilla, no hace falta agregar Lambda ni conceder acceso amplio a la cuenta.

### 5. Comprueba la entrega y la condición por separado

Primero comprueba cada destino: confirma la dirección de correo y, para SNS, revisa que las suscripciones estén confirmadas. En la configuración de Amazon Q Developer in chat applications puedes elegir **Send test message** para comprobar el envío al canal de Slack. Esa prueba confirma el transporte hasta Slack; **no** simula que un presupuesto haya superado su umbral.

Para probar la condición real, puedes crear un presupuesto temporal de costos sin acciones automáticas, con un umbral de gasto actual inferior a cargos que ya figuren en el periodo. Espera la siguiente evaluación de AWS Budgets y comprueba si llega el aviso; luego elimina el presupuesto temporal. Si todavía no hay cargos visibles, no podrás forzar esta prueba sin generar gasto. No crees recursos para probar una alerta.

## Límites que conviene conocer

- **No es tiempo real.** AWS actualiza los datos de facturación de Budgets al menos una vez al día. La información de Budgets puede actualizarse hasta tres veces por día, normalmente con intervalos de 8 a 12 horas. Además, puede transcurrir tiempo entre el uso de un recurso y la facturación de ese uso. Puede haber cargos por encima del umbral antes de que llegue el aviso, y el costo puede cambiar después de recibirlo.
- **No es un tope de gasto.** Un presupuesto de costos notifica; no impide que se creen recursos ni garantiza que el gasto se detenga en el importe elegido. AWS ofrece acciones de presupuesto separadas que pueden, por ejemplo, modificar permisos o actuar sobre ciertos recursos. Requieren configuración propia y pueden afectar una carga de trabajo; no equivalen a un límite absoluto de facturación. Consulta la [documentación sobre acciones de AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-action-configure.html) antes de habilitarlas.
- **Una alerta no garantiza ahorro.** Te ayuda a detectar un desvío, pero todavía necesitas identificar su causa y decidir qué cambiar. Para investigar qué servicio o uso explica un aumento, usa [AWS Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html) y, si necesitas un orden para priorizar cambios, consulta esta guía de [estrategias para reducir costos en AWS](https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/).
- **Revisa el precio antes de añadir acciones.** AWS ofrece sin cargo la supervisión y las notificaciones de Budgets. Según su página de precios actual, los dos primeros presupuestos que tienen acciones son gratuitos por mes; cada presupuesto adicional con acciones cuesta USD 0,10 por día. Las acciones no son necesarias para recibir correo o enviar notificaciones por SNS. Consulta los [precios vigentes de AWS Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/) antes de habilitarlas.

## Si no llega la alerta

- **El destinatario de correo está pendiente o inactivo:** confirma la dirección desde el mensaje de AWS con la cuenta que agregó ese destinatario. La verificación de destinatarios directos y la suscripción por email de SNS son flujos distintos.
- **El presupuesto no puede publicar en SNS:** confirma que el tema está en la misma cuenta y que su política permite publicar a Budgets. Si usas cifrado, revisa también la política de AWS KMS.
- **El correo de SNS no recibe el mensaje:** abre la lista de suscripciones del tema y comprueba que el estado sea confirmado. Un tema con una suscripción pendiente todavía no entrega avisos a esa dirección.
- **No aparece el aviso en Slack:** confirma que Amazon Q está en el canal y que la configuración apunta al tema y la región correctos. Envía un mensaje de prueba; recuerda que eso solo comprueba el transporte.
- **No llega la alerta prevista:** comprueba que el presupuesto tenga aproximadamente cinco semanas de datos de uso. Para un aviso de gasto ya registrado, revisa el umbral, el periodo, los filtros y el alcance de la cuenta.

## Sigue aprendiendo con comunidades y recursos

Si quieres conversar sobre operaciones en AWS, revisa las reuniones del [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) o del [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/). Ambos son grupos generales para personas interesadas en AWS; consulta cada ficha para ver sus próximas actividades y las condiciones de participación. La [agenda de eventos online de AWS en Latinoamérica](https://dondeaprendoaws.com/eventos/online/) reúne fechas, horarios, comunidades organizadoras y enlaces de inscripción.

La grabación del [Cloud Practitioner Challenge: monitoreo y gestión de recursos](https://www.youtube.com/watch?v=2cGwdSTdUqQ), del AWS User Group Medellín, diferencia AWS Budgets y Cost Explorer e incluye una introducción a CloudWatch y CloudTrail. Para ver un flujo práctico, puedes seguir el video de Marcia Villalba sobre [cómo crear presupuestos en AWS](https://www.youtube.com/watch?v=FlEg0oGamB0). Si quieres ampliar el tema más allá de las alertas, mira la charla grabada de CreaTicas y AWS User Group San José sobre [FinOps y optimización de costos](https://www.youtube.com/watch?v=UphnnilH09A). Las pantallas de una grabación pueden cambiar; confirma siempre los pasos de consola y las condiciones actuales en la documentación de AWS.
