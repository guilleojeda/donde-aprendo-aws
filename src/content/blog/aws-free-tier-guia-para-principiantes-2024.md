---
title: "AWS Free Tier: planes, créditos, límites y cargos"
description: "Compara las condiciones del AWS Free Tier según la fecha de creación de tu cuenta y aprende cómo revisar planes, créditos, uso y posibles cargos."
author: "guille-ojeda"
publishedAt: "2024-04-29"
publishedTimestamp: "2024-04-29T06:37:00.779Z"
modifiedTimestamp: "2026-10-05T12:59:21-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Fundamentos de AWS para principiantes: servicios, IAM y regiones"
    url: "https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/"
  - title: "AWS gratis para estudiantes y docentes: cursos y laboratorios"
    url: "https://dondeaprendoaws.com/blog/aws-gratis-para-educadores-y-estudiantes/"
  - title: "Cómo aprender AWS desde cero: ruta práctica en español"
    url: "https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/"
---

El AWS Free Tier no significa que cualquier cuenta nueva tenga doce meses gratis ni que puedas desplegar una aplicación sin pagar. **Las condiciones dependen de cuándo se creó la cuenta, del plan elegido, del servicio y de cuánto lo uses.** AWS cambió el programa para las cuentas creadas el 15 de julio de 2025 o después; las cuentas anteriores conservan el modelo anterior.

Si recién empiezas, revisa el plan y las ofertas que aparecen en tu cuenta antes de crear recursos. Un crédito, un límite mensual de uso y un plan de cuenta son cosas distintas. Ninguno convierte todos los servicios de AWS en gratuitos.

## Qué cambia según la fecha de creación de tu cuenta

### Cuentas creadas antes del 15 de julio de 2025

Siguen el programa anterior: algunas ofertas duran doce meses desde el alta, otras son siempre gratuitas dentro de límites mensuales y otras son pruebas breves que pueden empezar al activar un servicio. En general, el uso que supera los límites se cobra a las tarifas estándar. Revisa cada oferta y servicio.

### Cuentas creadas el 15 de julio de 2025 o después

Los clientes nuevos pueden elegir un plan Free o Paid y recibir **USD 100 en créditos iniciales, más hasta USD 100 adicionales** al completar actividades elegibles. Los créditos vencen doce meses después de crear la cuenta.

En el plan Paid, el consumo que no cubren los créditos o que no es elegible se cobra a las tarifas estándar. El plan Free limita los servicios disponibles y no se convierte automáticamente en un plan Paid al vencer.

Las condiciones antiguas de doce meses no se aplican a todas las cuentas actuales. Consulta la [comparación oficial de planes de cuenta](https://docs.aws.amazon.com/es_es/awsaccountbilling/latest/aboutv2/free-tier-plans.html), la [página actual del AWS Free Tier](https://aws.amazon.com/free/) y la documentación de [uso de EC2 antes y después del 15 de julio de 2025](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html). La lista de servicios y límites puede cambiar; busca la oferta concreta para tu plan, servicio y Región.

## Plan Free y plan Paid

En el programa nuevo, ambos planes pueden recibir los créditos para clientes nuevos y acceder a ofertas marcadas como siempre gratuitas dentro de sus límites. La diferencia principal es el acceso y qué pasa cuando se terminan los créditos.

### Plan Free: acceso limitado y cierre al terminar

Incluye servicios y funciones seleccionados. No abarca todo el catálogo ni algunas ofertas que podrían consumir de inmediato los créditos o requerir compras de hardware.

**Termina a los seis meses o cuando se agotan los créditos, lo que ocurra primero.** AWS cierra la cuenta y pierdes acceso a los recursos y datos. Conserva el contenido durante 90 días; si actualizas a Paid dentro de ese plazo, recuperas el acceso. Si no, elimina la cuenta y los recursos asociados.

### Plan Paid: continuidad y posibles cargos

Da acceso a todos los servicios y funciones, además de las ofertas de prueba corta que correspondan. La cuenta permanece abierta cuando se agotan los créditos. **Se cobra el uso que supere el saldo, no califique para créditos o continúe después de su vencimiento.**

El crédito adicional depende de las actividades que AWS muestre para tu cuenta y de sus fechas límite; no es dinero transferible ni un descuento para cualquier compra. AWS actualiza automáticamente el plan Free a Paid si, por ejemplo, te unes a AWS Organizations o configuras una landing zone de AWS Control Tower. Esa actualización habilita cargos según las condiciones del plan Paid; revisa la [comparación oficial de planes](https://docs.aws.amazon.com/es_es/awsaccountbilling/latest/aboutv2/free-tier-plans.html) antes de hacerlo.

### ¿Quién puede obtener el plan Free y los créditos?

AWS reserva el plan Free y esos créditos para clientes nuevos. Su FAQ indica que una persona con una cuenta de AWS actual o anterior puede no ser elegible. Tener una cuenta antigua no da acceso retroactivo al nuevo crédito de USD 200. Si la elegibilidad no está clara, confirma lo que indica AWS durante el registro; no abras cuentas adicionales para intentar recibir beneficios.

### ¿Necesito una tarjeta o un método de pago?

El registro de AWS está cambiando y la respuesta depende de la ruta de alta. En la nueva experiencia, la mayoría de los clientes nuevos no necesita agregar un método de pago, aunque AWS puede solicitarlo para verificar la identidad. AWS dice que una verificación de ese tipo puede generar una autorización temporal de USD 1 o su equivalente durante tres a cinco días; no es un cargo mientras sigas en el plan Free. La ruta de registro avanzada sí solicita un método de pago válido. Revisa el plan que aparece antes de terminar el alta: si eliges Paid, puedes generar cargos por uso fuera de los créditos.

Consulta los [requisitos actuales para crear una cuenta de AWS](https://aws.amazon.com/resources/create-account/) y las [preguntas frecuentes oficiales del Free Tier](https://aws.amazon.com/free/free-tier-faqs/). Las pantallas y requisitos pueden variar mientras AWS habilita nuevas opciones de registro.

## Cómo revisar tu uso y reducir sorpresas

Antes de iniciar una práctica, confirma que el servicio y la función estén disponibles en tu plan y revisa su precio en la [calculadora de AWS](https://calculator.aws/). Comprueba también la Región: los límites pueden calcularse por servicio, tipo de uso y Región, y las ofertas pueden depender de la fecha de alta.

1. **Revisa el plan, el saldo y la fecha de vencimiento.** En la experiencia de cuenta actual, AWS muestra estos datos en el widget Cost and Usage o en la sección de créditos de facturación. Guarda la fecha en que vencen el plan y los créditos.
2. **Mira el uso por servicio.** La página Free Tier de Billing and Cost Management muestra consumo real y previsto. La API [`GetFreeTierUsage`](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_freetier_GetFreeTierUsage.html) devuelve uso real y previsto por oferta; [`GetAccountPlanState`](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_freetier_GetAccountPlanState.html) consulta por separado el tipo y estado del plan, la fecha de vencimiento y los créditos restantes. Son herramientas de seguimiento, no bloqueos de gasto.
3. **Activa avisos, pero no los tomes como un bloqueo.** AWS puede enviar una alerta automática al superar el 85 % del límite de una oferta gratuita. AWS Budgets permite definir avisos de costo real o previsto, pero la información se actualiza con retraso: puedes acumular más uso antes de recibir el mensaje. Un presupuesto común avisa; por sí solo no detiene los recursos.
4. **Detén o elimina lo que ya no uses y vuelve a mirar la factura.** Revisa todas las Regiones y los servicios que creaste; cerrar una terminal o dejar de abrir la consola no detiene recursos activos.

Algunas cuentas de la nueva experiencia de registro también muestran un límite de gasto mensual por proyecto. Es distinto de un presupuesto de alertas: al llegar al límite, AWS pausa el proyecto y detiene sus recursos. El límite se aplica al costo antes de impuestos y excluye créditos. AWS lo está habilitando gradualmente y requiere un plan Paid; comprueba si aparece en tu cuenta y lee sus condiciones en la [guía de límites de gasto](https://docs.aws.amazon.com/accounts/latest/reference/create-spend-limit.html). Para la supervisión habitual, consulta la [guía oficial para rastrear el uso del Free Tier](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/tracking-free-tier-usage.html) y la documentación de [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html).

## ¿Por qué AWS me cobra si uso el Free Tier?

Revisa la factura por servicio y Región y contrasta estas causas:

- **Fecha y plan:** las cuentas del modelo anterior pueden salir de una oferta al cumplir su plazo o superar el límite; en el programa nuevo, el plan Paid cobra el uso que excede créditos o no califica para ellos.
- **Oferta y uso:** el producto, la función, la Región o la cantidad usada quizá no coincida con la oferta que esperabas; una prueba breve también puede haber vencido.
- **Recursos que siguen activos:** detener una aplicación o dejar de entrar a la consola no elimina los recursos que continúan almacenando datos o atendiendo solicitudes.

La guía de AWS para [entender cargos inesperados](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/checklistforunwantedcharges.html) muestra cómo localizar los cargos en Billing y Cost Explorer.

Un ejemplo frecuente es EC2: detener una instancia evita el cobro de su capacidad de cómputo mientras está detenida, pero no elimina sus volúmenes EBS. El almacenamiento EBS permanece y puede seguir teniendo costo en una cuenta Paid o bajo el modelo anterior, según la oferta aplicable, el tipo y el tamaño del volumen y la Región. Para comprobarlo, revisa el [ciclo de vida de una instancia EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html) y los [precios de EBS](https://aws.amazon.com/ebs/pricing/); terminar la instancia tampoco borra los volúmenes configurados para conservarse, como explica la guía para [conservar volúmenes al terminar una instancia](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/preserving-volumes-on-termination.html). Revisa y elimina por separado solo los recursos que ya no necesites.

## Preguntas frecuentes

### ¿El AWS Free Tier es gratis para siempre?

No. Algunas ofertas marcadas como siempre gratuitas conservan límites mensuales mientras estén disponibles, pero el plan, los créditos y las pruebas tienen condiciones y fechas distintas. Si superas un límite en un plan Paid, el exceso puede generar cargos.

### ¿Qué pasa si se agotan mis créditos?

En el plan Free, el plan termina cuando los créditos se agotan y AWS cierra la cuenta, salvo que la actualices a Paid. En el plan Paid, la cuenta permanece abierta y pagas el uso que no cubra un crédito vigente.

### ¿Un presupuesto de AWS garantiza que no voy a pagar?

No. Un presupuesto habitual sirve para avisarte cuando el gasto real o previsto alcanza un umbral. Puede llegar tarde y no detiene por sí solo los recursos. Para evitar cargos, revisa el precio antes de crear algo y elimina lo que ya no necesitas.

## Aprende y pregunta en comunidad

Para ver una experiencia de aprendizaje sobre práctica y control de costos, puedes mirar la [charla grabada de RoxsFest con Carolina Herrera sobre AWS Free Tier](https://www.youtube.com/watch?v=L367ZM4cNG8). Es material de comunidad, no una referencia para las condiciones de una cuenta actual: el programa cambió en 2025, así que confirma fechas, créditos y límites en la documentación oficial enlazada arriba.

Si te atoras al estimar una práctica, busca un grupo en el [directorio de comunidades AWS](/comunidades/). Por ejemplo, el [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) publica encuentros y espacios para compartir preguntas; revisa su agenda y modalidad vigentes.

Si tu objetivo es aprender con opciones que no requieren una cuenta personal de infraestructura, empieza por [la ruta práctica para aprender AWS desde cero](/blog/aws-aprender-guia-inicial/), revisa [fundamentos de AWS](/blog/aws-fundamentos-guia-de-inicio-rapido/) o consulta las alternativas para [estudiantes y docentes](/blog/aws-gratis-para-educadores-y-estudiantes/).
