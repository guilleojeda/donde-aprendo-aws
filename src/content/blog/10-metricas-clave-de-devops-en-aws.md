---
title: "Métricas DevOps en AWS: DORA, fiabilidad y costos"
description: "Aprende a calcular las cinco métricas DORA vigentes y a complementarlas con señales de fiabilidad, costos y uso de recursos en AWS, con fórmulas y ejemplos."
author: "guille-ojeda"
publishedAt: "2024-05-12"
publishedTimestamp: "2024-05-12T01:37:13.938Z"
modifiedTimestamp: "2026-10-04T21:44:34-03:00"
cover: "/assets/blog/98aff2370ca15f9967751abc.png"
coverAlt: "Medidor con engranajes e iconos integrado en una nube sobre otras nubes"
ogImage: "/assets/blog/98aff2370ca15f9967751abc.png"
related: []
---

Para medir DevOps en AWS, separa tres preguntas: ¿qué tan rápido llegan los cambios a producción?, ¿qué efecto tienen en el servicio? y ¿cuánto cuesta atender la carga? DORA define hoy cinco métricas de rendimiento de entrega de software; fiabilidad operativa, costos y utilización las complementan, pero no forman parte de esas cinco. [La guía actual de DORA](https://dora.dev/guides/dora-metrics/) agrupa las métricas en *throughput* e inestabilidad.

Amazon CloudWatch aporta telemetría de servicios y recursos. Para calcular las métricas DORA también necesitas registros de control de versiones, despliegues e incidentes enlazados por aplicación y versión. Las métricas predefinidas de CodeBuild o CodePipeline, por sí solas, no indican si un cambio llegó bien a producción.

## Las cinco métricas DORA vigentes

El modelo pasó de cuatro métricas a cinco con la incorporación de la tasa de retrabajo por despliegues no planificados. Además, DORA redefinió la antigua MTTR como tiempo de recuperación de un despliegue fallido, para separar los fallos causados por un cambio de otros incidentes operativos. Consulta [la historia del modelo DORA](https://dora.dev/insights/dora-metrics-history/) para ver esa evolución.

### Frecuencia de despliegue

**Cálculo:** Cuenta cada cambio que llega a producción durante la ventana.

**Unidad y resumen:** Despliegues por servicio y por semana (o la ventana elegida).

### Tiempo de entrega del cambio (*change lead time*)

**Cálculo:** Para cada cambio, resta la hora en que se registró en el control de versiones de la hora en que llegó a producción.

**Unidad y resumen:** Tiempo por cambio; informa mediana y, si hay suficientes datos, p95.

### Tiempo de recuperación de despliegue fallido

**Cálculo:** Para cada despliegue que degradó producción y requirió intervención inmediata, resta el inicio del impacto atribuible al cambio de la hora en que se restauró el servicio.

**Unidad y resumen:** Tiempo por despliegue fallido; mediana y p95 si hay suficiente volumen.

### Tasa de fallos de cambio (*change fail rate*)

**Cálculo:** Despliegues que requirieron intervención inmediata —por ejemplo, reversión o corrección urgente— ÷ todos los despliegues a producción × 100.

**Unidad y resumen:** Porcentaje por servicio y ventana.

### Tasa de retrabajo por despliegues no planificados (*deployment rework rate*)

**Cálculo:** Despliegues no planificados para atender un incidente de producción ÷ todos los despliegues a producción × 100.

**Unidad y resumen:** Porcentaje por servicio y ventana.

Define antes qué cuenta como aplicación, producción, cambio y despliegue completado. Incluye las correcciones urgentes en el total de despliegues; una misma secuencia puede contar como un despliegue fallido y, por separado, un despliegue de retrabajo que lo corrige. Una ejecución de pipeline fallida antes de llegar a producción no es por sí sola un cambio fallido según estas definiciones. Si la ventana no contiene despliegues a producción, las tasas no se pueden calcular: informa «sin datos», en lugar de 0 %.

Para la recuperación, DORA mide cuánto tarda en recuperarse un despliegue fallido que exige intervención inmediata y causó un deterioro del servicio en producción. La guía delimita el tipo de fallo y la recuperación, pero no prescribe nombres de eventos ni una regla universal para cada timestamp. Para que tu medida sea reproducible, adopta y documenta una convención: inicia el reloj en el primer impacto atribuible al despliegue y detenlo cuando la SLI elegida vuelve al nivel acordado. Registra ambos momentos, y aplica el mismo criterio a todos los incidentes.

Para tiempos, la mediana describe el caso central y el p95 muestra la cola lenta. No calcules un p95 útil a partir de promedios agregados ni de muy pocos cambios: [CloudWatch requiere observaciones originales para algunas estadísticas de percentil](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Statistics-definitions.html). Para conteos y proporciones usa conteos totales de la ventana, no el promedio de porcentajes diarios. [DORA recomienda medir por aplicación o servicio y usar las métricas para mejorar en contexto, no como competencia entre equipos](https://dora.dev/guides/dora-metrics/).

## Fiabilidad, costos y utilización: señales complementarias

Estas señales ayudan a decidir si la entrega sostiene las necesidades del producto y la operación. Manténlas separadas de las métricas DORA.

- **Fiabilidad del servicio:** si usas una SLI basada en solicitudes, calcula solicitudes que cumplen las condiciones de éxito y latencia ÷ solicitudes elegibles × 100. Define el umbral con el SLO de ese servicio. Informa la ventana y el volumen; un p95 de latencia puede mostrar colas que un promedio oculta. El SLO de una API y la disponibilidad de un proceso por lotes requieren denominadores distintos.
- **Costo por unidad de trabajo útil:** costo AWS atribuible al servicio en la ventana ÷ transacciones o trabajos completados correctamente en la misma ventana. Ejemplo: US$240 ÷ 80.000 transacciones correctas = **US$0,003 por transacción**, o US$3 por cada 1.000. No es una métrica DORA ni una métrica que AWS calcule automáticamente: combina datos de facturación con una medida de producto.
- **Utilización y saturación:** observa la métrica apropiada al recurso y servicio. En EC2, [`CPUUtilization` es un porcentaje](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/viewing_metrics_with_cloudwatch.html); la memoria del sistema operativo requiere configurar el [agente de CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/metrics-collected-by-CloudWatch-agent.html). Informa el p95 por servicio o grupo homogéneo y compáralo con latencia, tráfico o cola. Un porcentaje de CPU alto no demuestra por sí solo que una aplicación sea eficiente, y promediar instancias de tamaños distintos puede ocultar saturación.
- **Duración y fallos de CI:** [CodeBuild](https://docs.aws.amazon.com/codebuild/latest/userguide/cloudwatch_metrics-codebuild.html) publica, entre otras, `BuildDuration` (fase `BUILD`), `QueuedDuration`, `FailedBuilds` y `SucceededBuilds`; [CodePipeline](https://docs.aws.amazon.com/codepipeline/latest/userguide/metrics-dimensions.html) publica `PipelineDuration` y `FailedPipelineExecutions`. Sirven para investigar el flujo de compilación y orquestación, no sustituyen el tiempo commit-a-producción ni la tasa de fallos de cambios. AWS aclara que un reintento de una acción fallida puede contarse como otra ejecución fallida de CodePipeline.

En costos, asigna los cargos al servicio con etiquetas de asignación activadas o una estructura de cuentas coherente. Revisa qué proporción del gasto queda sin asignar: un costo por transacción aparentemente bajo puede ser solo una cobertura incompleta. La documentación de AWS explica cómo [organizar costos con etiquetas de asignación](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-alloc-tags.html). Como lectura complementaria en español, consulta [Análisis de costos de AWS con Cost Explorer](https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/).

Para una introducción general a métricas, registros y trazas con servicios AWS, lee [Observabilidad en la Nube de AWS: CloudWatch, X-Ray y CloudTrail](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m), de Sheyla Leacock. Ese repaso ayuda a ubicar las señales operativas; no define las fórmulas DORA.

## Qué datos necesitas y cómo enlazarlos

Empieza con cuatro registros pequeños, aunque estén en herramientas distintas:

1. **Cambios:** repositorio, SHA del commit y hora registrada en control de versiones.
2. **Despliegues:** ID único, servicio, ambiente, commits incluidos, resultado y hora en que el cambio llegó a producción.
3. **Incidentes:** ID, servicio afectado, hora de inicio y restauración, despliegue asociado si se confirmó la causa y despliegue correctivo si lo hubo.
4. **Servicio y costos:** solicitudes correctas o trabajos terminados, señales de latencia y costos atribuibles al servicio durante la misma ventana.

Relaciona los datos por `servicio`, `deployment_id` y `commit_sha`; no asignes causalidad solo porque un incidente ocurrió cerca de un despliegue. Si no puedes identificar qué versión produjo el cambio, marca la atribución como desconocida y mejora esa trazabilidad antes de presentar una tasa de fallos concluyente.

Como contexto del flujo de entrega, el canal Marcia en Desplegando Cloud publicó la grabación [Implementando CI/CD en AWS](https://www.youtube.com/watch?v=xKbHMMPvlVo). El enlace aporta una referencia para seguir explorando el ciclo CI/CD; no sustituye los registros de eventos que necesitas para calcular estas métricas.

CloudWatch Application Signals emite eventos al arrancar la aplicación y cada 24 horas; puedes enriquecerlos con SHA de Git, repositorio, ID, hora y URL del despliegue. No equivale por sí solo a un evento completo por cada despliegue. Requiere cumplir los prerrequisitos de instrumentación de su [documentación de Service Events](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-ServiceEvents.html); la página enumera Java, Python y Node.js y especifica que Service Events se desactiva automáticamente en entornos Lambda. Los logs de Service Events usan tarifas estándar de ingesta y almacenamiento de CloudWatch Logs. En otros casos, conserva esos campos en tus registros de CI/CD e incidentes y únelos por identificadores propios.

Un registro didáctico inventado para una semana podría contener estos cinco despliegues del mismo servicio:

| Cambio | Tiempo de entrega | Resultado |
| --- | ---: | --- |
| D1 | 3 h | Cambio regular |
| D2 | 2 h | Cambio regular |
| D3 | 3 h | Degrada producción; el impacto atribuible empieza a las 12:00 |
| D4 | 30 min | Corrección urgente de D3 que restaura la SLI a las 14:00; incluida entre los cinco despliegues contados |
| D5 | 8 h | Cambio regular |

Ordenados (**30 min, 2 h, 3 h, 3 h, 8 h**), la mediana del tiempo de entrega es **3 h**. Con el método de rango más cercano, el p95 de estos cinco valores es **8 h**; con tan pocas observaciones no sirve para decidir sobre el rendimiento real. En D3, con la convención declarada, el impacto atribuible empieza a las **12:00** y la SLI acordada vuelve a su nivel objetivo a las **14:00**; el tiempo de recuperación es **2 h**.

La frecuencia fue **5 despliegues por servicio en la semana**. D3 requirió intervención inmediata, por lo que la tasa de fallos de cambio es **1 ÷ 5 = 20 %**. D4 fue un despliegue no planificado para atender ese incidente, por lo que la tasa de retrabajo es también **1 ÷ 5 = 20 %**. D4 es la reparación dentro de los cinco despliegues, no un sexto. El ejemplo supone que los cinco cambios tienen commit y despliegue vinculados; todos los números son ficticios.

El repositorio [ECS Canary in Action](https://github.com/roxsross/aws-ecs-canary-in-action) ofrece un laboratorio con un modo local y otro que despliega recursos en AWS para observar tráfico y una reversión ante alarmas. Su README enumera los requisitos y la infraestructura creada; el despliegue en AWS puede generar cargos, así que revisa costos y limpieza antes de ejecutarlo. Amazon ECS documenta su estrategia [canary y los requisitos de tráfico y alarmas](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deploy-canary-service.html).

## Cómo actuar a partir de las métricas

Usa una ventana y un servicio consistentes, compara cada servicio consigo mismo y anota cambios de tráfico, arquitectura o política de lanzamiento. DORA señala que mezclar aplicaciones con contextos distintos o fijar un objetivo universal para todos puede llevar a conclusiones y comportamientos equivocados.

Si el tiempo de entrega sube, separa el tiempo de espera, compilación, revisión y aprobación para localizar el tramo que cambió. Si crece la tasa de fallos, revisa despliegues e incidentes concretos, validaciones y capacidad de reversión. Si sube el costo por unidad útil, primero valida que el gasto esté asignado y que el volumen de trabajo esté medido en la misma ventana. Elige una mejora con el equipo que construye y opera el servicio, vuelve a medir y comprueba si el cambio ayudó.

No uses conteos de *push*, commits, líneas de código o despliegues por persona como productividad individual. Incentivan actividad visible y ocultan el resultado del servicio; las métricas de flujo y fiabilidad corresponden al equipo y a la aplicación.

## Comunidades AWS para intercambiar experiencias

Para compartir experiencias o buscar actividades, explora el directorio oficial de [AWS User Groups en AWS Builder Center](https://builder.aws.com/community/user-groups), que permite buscar grupos y eventos, y los perfiles de [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) y [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/). El perfil de Buenos Aires también enlaza [su canal de YouTube](https://www.youtube.com/@awsugbsas). Confirma las fechas, modalidad y cupos en el destino antes de participar.
