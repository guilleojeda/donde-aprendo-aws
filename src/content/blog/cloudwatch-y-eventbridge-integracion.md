---
title: "Cómo conectar alarmas de CloudWatch con EventBridge"
description: "Filtra cambios de estado de alarmas de CloudWatch con reglas de EventBridge y envíalos a SNS, Lambda o SQS con permisos, reintentos y DLQ."
author: "guille-ojeda"
publishedAt: "2024-11-28"
publishedTimestamp: "2024-11-28T01:51:21.207Z"
modifiedTimestamp: "2026-10-05T20:43:59-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
---

Si ya tienes una alarma de Amazon CloudWatch y quieres ejecutar una acción cuando cambie de estado, puedes usar una regla de Amazon EventBridge. CloudWatch publica un evento de cambio de estado; EventBridge lo filtra y lo entrega a un destino como Amazon SNS, AWS Lambda o Amazon SQS.

```text
Métrica o consulta de logs
           ↓
Alarma de CloudWatch
           ↓
Evento de cambio de estado
           ↓
Regla de EventBridge
           ↓
SNS, Lambda o SQS
```

La diferencia importa: CloudWatch evalúa métricas y alarmas; EventBridge enruta eventos estructurados. La integración descrita aquí transporta el **estado de la alarma**, no cada métrica ni cada línea de log. [AWS documenta el evento de alarma y garantiza su entrega a EventBridge](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch-and-eventbridge.html). Los eventos de servicios AWS llegan al [bus de eventos predeterminado de la cuenta](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-events.html), así que no hace falta crear buses separados para que CloudWatch publique las alarmas.

Si quieres repasar el papel de métricas, trazas y registros dentro de una visión más amplia, consulta [Observabilidad en la Nube de AWS](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m).

## Filtra el cambio que te interesa

Al cambiar de estado, una alarma envía un evento `CloudWatch Alarm State Change`. El evento incluye `detail.alarmName`, `detail.state.value` y `detail.previousState.value`. Los estados posibles incluyen `OK`, `ALARM` e `INSUFFICIENT_DATA`.

Por ejemplo, este patrón coincide solo cuando la alarma `Api5xxRateHigh` entra en `ALARM`:

```json
{
  "source": ["aws.cloudwatch"],
  "detail-type": ["CloudWatch Alarm State Change"],
  "detail": {
    "alarmName": ["Api5xxRateHigh"],
    "state": {
      "value": ["ALARM"]
    }
  }
}
```

`aws.cloudwatch` es el origen correcto. Añadir `detail-type` evita mezclar cambios de alarma con otros eventos de configuración que CloudWatch también envía a EventBridge; `alarmName` y `state.value` reducen aún más las coincidencias. Puedes quitar `alarmName` para aceptar varias alarmas o cambiar `ALARM` por `OK` si quieres actuar cuando el problema se resuelva. El filtro detecta una transición de estado, no cada evaluación mientras la alarma permanece en `ALARM`. Consulta la [referencia de eventos de CloudWatch](https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-cloudwatch.html) y la guía de [patrones de EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html).

Si tu regla de alarma usa ventanas de calendario, la lectura [Alarmas de Amazon CloudWatch con ventana de reloj: un día no es lo mismo que 24 horas](https://builder.aws.com/content/3Jw3mQgso7GLIzENc1b524e3L9z/alarmas-de-amazon-cloud-watch-con-ventana-de-reloj-un-da-no-es-lo-mismo-que-horas) ayuda a distinguir esos periodos de evaluación de la transición que consume EventBridge.

Un evento simplificado que coincide con ese patrón se ve así:

```json
{
  "version": "0",
  "id": "example-id",
  "source": "aws.cloudwatch",
  "account": "123456789012",
  "time": "2026-10-05T16:00:00Z",
  "region": "us-east-1",
  "resources": [
    "arn:aws:cloudwatch:us-east-1:123456789012:alarm:Api5xxRateHigh"
  ],
  "detail-type": "CloudWatch Alarm State Change",
  "detail": {
    "alarmName": "Api5xxRateHigh",
    "state": { "value": "ALARM" },
    "previousState": { "value": "OK" }
  }
}
```

## Crea la regla y elige un destino

1. Confirma que la alarma exista en la misma cuenta y región en la que vas a crear la regla. En EventBridge, elige el bus predeterminado y crea una regla basada en un patrón de eventos.
2. Selecciona los eventos de CloudWatch y el tipo `CloudWatch Alarm State Change`, o pega el patrón JSON anterior. Si tienes alarmas con el mismo nombre en distintas cuentas o regiones, añade filtros que distingan el evento que necesitas.
3. Elige el destino según el trabajo: SNS para notificar a suscriptores; Lambda para ejecutar lógica propia; SQS para dejar trabajo pendiente y procesarlo de forma asíncrona. Si el destino falla, configura [reintentos y una cola de mensajes fallidos (DLQ)](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html). La DLQ de una regla es una cola SQS Standard; permite inspeccionar entregas que fallaron, pero requiere permisos para que EventBridge escriba en ella.
4. Concede a EventBridge solo los permisos que requiere ese destino. Para invocar Lambda, configura en el destino de EventBridge un rol que confíe en `events.amazonaws.com` y permita `lambda:InvokeFunction`, o una política basada en recursos de la función que permita esa acción a ese principal y la restrinja al ARN de esta regla. El rol que EventBridge usa para invocar Lambda es distinto del rol de ejecución que Lambda usa después para acceder a otros servicios. Revisa las [políticas de recursos para destinos](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html); la consola puede crear algunos permisos, pero comprueba la política efectiva.
5. Antes de habilitar una respuesta real, prueba el patrón en el [EventBridge Sandbox](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html) con un evento de ejemplo. Para probar también la entrega al destino, usa una alarma y un destino de prueba en una cuenta o entorno no productivo; una prueba contra una alarma real puede notificar a personas o iniciar acciones operativas.

EventBridge reintenta ciertos errores de entrega de acuerdo con la política del destino; para destinos de reglas en buses de eventos, el valor predeterminado documentado es hasta 24 horas o 185 intentos, lo que ocurra primero. Los errores de permisos faltantes o de un destino inexistente pueden ir directamente a la DLQ si la configuraste. Si no hay DLQ, un evento que agota los reintentos se descarta. Revisa en CloudWatch las métricas `FailedInvocations`, `InvocationsSentToDLQ` e `InvocationsFailedToBeSentToDLQ` para detectar fallas de entrega y problemas al escribir en la cola.

## Diagnóstico si la regla no produce la respuesta esperada

- **El patrón no coincide:** compara `source`, `detail-type`, `alarmName` y `state.value` con un evento completo de alarma en el [EventBridge Sandbox](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html). Los nombres y valores distinguen mayúsculas de minúsculas.
- **La alarma ya estaba en `ALARM`:** la regla recibe transiciones nuevas. Si no hubo un cambio de estado después de crearla, todavía no se habrá generado el evento que esperas. Para una prueba real, usa una alarma aislada en un entorno no productivo.
- **No hay coincidencias en la regla:** confirma que la alarma y la regla están en la misma cuenta y región, y que la regla escucha el bus predeterminado. Consulta `TriggeredRules` para comprobar si hubo coincidencias.
- **La regla coincide, pero el destino no actúa:** revisa `Invocations` y `FailedInvocations`, y comprueba la política de recursos o el rol configurado para el destino. Si configuraste una DLQ, revisa los mensajes y las métricas relacionadas con su entrega. AWS reúne estas señales en su guía de [solución de problemas de EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-troubleshooting.html).

La entrega a Lambda y la ejecución de su código son etapas distintas. Si Lambda acepta el evento pero la función falla, la entrega de EventBridge puede figurar como correcta: revisa también los errores de la función y sus [reintentos y destinos para invocaciones asíncronas](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html). La DLQ de EventBridge no sustituye la gestión de esos errores de ejecución.

## CloudWatch Logs no es una exportación automática

Una alarma basada en una métrica derivada de logs puede producir un evento de cambio de estado, igual que una alarma basada en una métrica regular. Eso no entrega a EventBridge las líneas del grupo de logs ni transmite todas las métricas de CloudWatch.

También puedes configurar un grupo de CloudWatch Logs como **destino explícito** de una regla; en ese caso EventBridge escribe allí los eventos que coinciden con el patrón y necesita una política del grupo que le permita crear flujos y publicar registros. Esto conserva el evento recibido, no copia el contenido de otros grupos de logs. Para procesar registros individuales en tiempo real, revisa [suscripciones de Amazon CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Subscriptions.html) y el destino compatible con tu flujo.

Para explorar otros enfoques de logs en aplicaciones serverless, el catálogo enlaza la charla [Cómo hacer logs estructurados y métricas customizadas con CloudWatch](https://www.youtube.com/watch?v=UBPPGJaBIVY). Si tu objetivo es centralizar grupos de logs entre cuentas y regiones, consulta también la grabación titulada [CloudWatch ahora centraliza logs entre cuentas y regiones](https://www.youtube.com/watch?v=M-KMTHIYOXQ); es un flujo distinto al envío de cambios de estado por EventBridge.

## Costos y limpieza

No hay un costo universal para esta integración: depende de cómo se genere la señal, del tipo de alarma y métricas consultadas, del destino y de si guardas registros. Revisa las tarifas actuales de [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) y [EventBridge](https://aws.amazon.com/eventbridge/pricing/) para la región y los servicios que uses. Por ejemplo, una alarma de consulta de logs puede tener cargos de consulta además del costo de la alarma.

Si solo estabas probando, desactiva o elimina la regla cuando termines y retira los permisos de destino que añadiste para la prueba. Elimina la alarma, el grupo de logs y la DLQ de prueba solo si ya no los necesitas; define la retención de logs según tus necesidades y políticas, no con un período genérico.

## Recursos y comunidad para seguir

Si la señal que quieres procesar es un hallazgo de seguridad, continúa con la [guía para automatizar AWS Security Hub](/blog/como-automatizar-ajustes-de-politicas-con-aws-security-hub/). Allí cambia el formato del evento, pero sigue siendo necesario separar la detección, el enrutamiento y la acción que modifica el recurso.

Para entender cómo elegir entre los servicios de integración, continúa con [Arquitectura dirigida por eventos en AWS: servicios, ejemplo y decisiones](/blog/arquitecturas-dirigidas-por-eventos-en-aws/). También puedes ampliar con la grabación [Introducción a arquitecturas orientadas a eventos y Amazon EventBridge](https://www.youtube.com/watch?v=TkU1RS5Fw1o), de Desplegando Cloud; la charla comunitaria [La Amenaza del Nivel 100: Amazon EventBridge](https://www.youtube.com/watch?v=f_RNpxzuxHE), de AWS Women Colombia; y el episodio [SQS, SNS, EventBridge o Kinesis: ¿cuál usás?](https://desplegando.substack.com/p/sqs-sns-eventbridge-o-kinesis-cual), que compara opciones de mensajería y eventos. Si quieres un runbook para decidir qué hacer después de una alerta, revisa [La alarma sonó. ¿Y ahora qué? Runbook guiado por SLOs](https://builder.aws.com/content/3IlopS4NCmTbwtDi0MIOjTAf9Ry/la-alarma-sono-y-ahora-que-runbook-guiado-por-slos).

El catálogo también reúne [una grabación de Marcia sobre alarmas de CloudWatch](https://www.youtube.com/watch?v=uS0QE0NeqpA), con un enfoque de infraestructura como código, y el [Laboratorio práctico de Amazon CloudWatch](https://www.youtube.com/watch?v=ZdMM2W0vrvA), del AWS User Group Caracas. Para una introducción a logs en desarrollo serverless, consulta [¿Dónde están mis logs en AWS? CloudWatch explicado para desarrolladores serverless](https://www.youtube.com/watch?v=tsCvaRv5EkU). Si te interesa comparar con una integración programada, [AWS Lambda y Amazon EventBridge con Diana Alfaro](https://www.youtube.com/watch?v=cmBR1BxFSj0) muestra un caso de apagado de EC2 con horario: es otro disparador, distinto a una alarma.

Puedes conversar sobre estos ejemplos en [AWS Women Colombia](https://awswomencolombia.com/), [AWS Girls Chile](https://linktr.ee/awsgirlschile), [AWS User Group Caracas](https://t.me/awsCaracas) o [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/). Para encontrar talleres y encuentros vigentes de comunidades en distintos países, consulta la [agenda de eventos AWS](https://dondeaprendoaws.com/eventos/); las fechas y la inscripción se actualizan en cada ficha.
