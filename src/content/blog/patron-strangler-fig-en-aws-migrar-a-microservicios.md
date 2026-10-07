---
title: "Strangler Fig en AWS: cómo migrar un monolito por partes"
description: "Guía práctica para extraer funciones de un monolito en AWS: rutas con ALB o API Gateway, responsabilidad sobre los datos, eventos idempotentes y rollback."
author: "guille-ojeda"
publishedAt: "2024-04-29"
publishedTimestamp: "2024-04-29T05:31:12.257Z"
modifiedTimestamp: "2026-10-06T23:58:58-03:00"
review:
  date: "2026-10-07"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []
---

El patrón **Strangler Fig** permite reemplazar una aplicación monolítica de manera gradual: una fachada recibe las solicitudes, envía las funciones migradas a una implementación nueva y deja el resto en el sistema existente. Cuando ya no quedan llamadas ni dependencias del monolito, puedes retirar esa parte. [Martin Fowler presentó la idea](https://martinfowler.com/bliki/StranglerFigApplication.html) como una forma de modernizar por etapas; [AWS documenta el ciclo](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html) como transformar, hacer coexistir y eliminar.

Esto reduce el tamaño de cada cambio, pero no garantiza cero interrupciones ni obliga a terminar con microservicios. El resultado también puede ser un monolito modular mejor delimitado. Conviene extraer una función cuando su despliegue, escalado o propiedad de datos independiente aporta más valor que la complejidad de operar otro servicio.

## Ejemplo: sacar las lecturas del catálogo

Supón una tienda cuyo monolito atiende `GET /catalogo/{sku}`, `POST /pedidos` y otras rutas bajo `api.tienda.example`. El primer corte puede dejar las lecturas del catálogo en el sistema nuevo y conservar las escrituras y el resto del tráfico en el monolito:

| Solicitud | Destino durante el primer corte |
| --- | --- |
| `GET /catalogo/*` | Servicio nuevo de catálogo |
| Otras rutas, incluido `POST /pedidos` | Monolito existente |

Si la aplicación ya recibe tráfico mediante un **Application Load Balancer (ALB)**, puedes agregar una regla de listener con las condiciones de método HTTP `GET` y ruta `/catalogo/*`, y reenviarla al grupo de destino (*target group*) del servicio nuevo. La regla predeterminada continúa reenviando al monolito. ALB evalúa las reglas por prioridad y admite condiciones como ruta, método y encabezado; revisa el contrato real de la aplicación antes de elegir esas condiciones en [la documentación de reglas de listener](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-rules.html).

**API Gateway** puede servir como fachada cuando necesitas administrar una API pública, sus métodos, autorizadores o integraciones HTTP. Puedes definir las rutas nuevas hacia el servicio extraído y conservar las rutas existentes hacia el backend legado. Si el backend está dentro de una VPC, una integración privada de una REST API puede conectarse a un ALB mediante VPC Link V2; AWS documenta requisitos de cuenta y detalles de ruta, incluido el prefijo de etapa que puede llegar al backend. No elijas API Gateway solo porque el destino se llame “microservicio”: [compara sus patrones de enrutamiento](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/api-routing-path.html), [las integraciones proxy HTTP](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-set-up-simple-proxy.html) y [las integraciones privadas de REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/private-integration.html). Si evalúas una API HTTP en lugar de REST, verifica su propia [guía de integración privada](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-private-integration.html). Si el destino es Lambda, consulta [cómo elegir entre HTTP API y REST API para ese backend](/blog/guia-para-crear-apis-serverless-con-aws-lambda-y-api-gateway/).

El corte por ruta funciona si puedes interceptar la llamada en el borde del monolito. Si quieres mover lógica más profunda, con dependencias internas, agrega una abstracción dentro de la aplicación y cambia su implementación gradualmente; AWS describe esta alternativa como [branch by abstraction](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-decomposing-monoliths/branch-by-abstraction.html). Un proxy de entrada no separa automáticamente clases, transacciones ni módulos internos.

> **Nota sobre Refactor Spaces:** algunos tutoriales de Strangler Fig aún muestran AWS Migration Hub Refactor Spaces. AWS dejó de aceptar clientes nuevos el 7 de noviembre de 2025; quienes ya lo usan pueden continuar sus migraciones. La indisponibilidad del producto para nuevos clientes no cambia el patrón: tendrás que elegir y operar la fachada con opciones de enrutamiento vigentes para tu caso. Consulta el [aviso de disponibilidad de AWS](https://docs.aws.amazon.com/migrationhub-refactor-spaces/latest/userguide/migrationhub-availability-change.html).

## Una secuencia de migración verificable

1. **Dibuja el flujo que existe.** Registra las rutas, llamadas internas, transacciones, tablas compartidas, consumidores y requisitos de latencia. Mide tasas de error y tiempos de respuesta antes de mover tráfico. Busca una capacidad coherente —por ejemplo, lecturas de catálogo—, no solo una tabla o un paquete de código.
2. **Crea el punto de entrada sin cambiar el comportamiento.** Mantén la URL y el contrato actuales; al principio, dirige todas las solicitudes al monolito. Verifica TLS, autorización, encabezados, cookies, timeouts, límites de tamaño, reglas de salud y logs en esta capa.
3. **Extrae una función acotada.** Implementa el contrato en el servicio nuevo y prueba sus respuestas con datos representativos. Para comparar lecturas puedes usar tráfico de prueba o una copia segura de solicitudes sin efectos secundarios. No repitas escrituras de producción a ciegas: podrías cobrar, reservar inventario o enviar notificaciones dos veces.
4. **Cambia una ruta y observa el resultado.** Por ejemplo, empieza por `GET /catalogo/*`, conserva el destino predeterminado en el monolito y compara errores, latencia y resultados de negocio. Amplía a otra operación solo cuando el corte actual cumpla sus criterios.
5. **Retira la implementación vieja cuando deje de ser necesaria.** Confirma que ningún consumidor, trabajo programado, informe o proceso interno dependa de ella. Conserva el código y los datos durante la ventana de reversión que definiste; elimina la ruta antigua después de cerrar esa ventana.

Para versionar y revisar los cambios de infraestructura o de la fachada, puedes seguir el [pipeline de Terraform con AWS CodePipeline](/blog/pipeline-cicd-con-terraform-y-aws-codepipeline/). Esa guía conserva y aplica el plan aprobado; el despliegue del código de la aplicación requiere su propio flujo.

El orden es deliberado: la ruta deja de ser el límite de migración si otros servicios siguen llamando directamente al monolito o consultando sus tablas. La guía de Strangler Fig de AWS también señala que el patrón requiere poder modificar o interceptar el sistema existente.

## Decide quién escribe cada dato

La independencia del servicio depende de quién controla los cambios de negocio y el acceso a sus datos. Un servicio puede comenzar leyendo una base compartida mientras reduces el acoplamiento, pero define un único escritor para cada dato durante cada etapa. Si el monolito y el servicio nuevo pueden modificar el mismo registro, decide antes cómo resolver conflictos, reintentos y orden; de lo contrario, una falla intermedia puede dejar dos versiones distintas.

No hace falta mover una base entera para extraer la primera ruta. Cuando un servicio pasa a ser dueño de su información, los demás deberían acceder mediante una API o recibir una proyección por eventos, en lugar de escribir directamente sus tablas. AWS detalla los beneficios y el costo de ese límite en el patrón de [base de datos por servicio](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-data-persistence/database-per-service.html): las consultas y transacciones que abarcan servicios se vuelven más difíciles y pueden requerir una vista compuesta o consistencia eventual.

Si una operación actualiza la base del nuevo servicio y además debe notificar a otros sistemas, una escritura directa en la base seguida por un `PutEvents` puede fallar entre ambas acciones. El patrón **transactional outbox** guarda el cambio de negocio y el evento pendiente en una transacción local; un publicador envía después el evento. El consumidor debe tolerar entregas repetidas mediante una clave de idempotencia o un registro de eventos procesados. El *outbox* resuelve la coordinación entre una base y su evento; **no** hace atómicas las escrituras en la base nueva y la antigua. Si una transición necesita mantener ambas lecturas, planea explícitamente la replicación, el retraso aceptable y una conciliación de datos. Para un flujo de pedidos, consulta la guía interna de [arquitecturas dirigidas por eventos en AWS](/blog/arquitecturas-dirigidas-por-eventos-en-aws/) junto con la guía de AWS sobre [transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

Cuando una regla de negocio atraviesa varios servicios —por ejemplo, crear un pedido y reservar inventario—, no finjas que una transacción SQL puede cubrir todos los almacenes. Define qué significa completar o compensar la operación; para estos casos, evalúa una [saga](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-patterns.html). Si no puedes tolerar consistencia eventual ni diseñar una compensación segura, mantén temporalmente esa operación dentro del componente que ya controla la transacción.

## El rollback de lecturas no es el de escrituras

**En una extracción de solo lectura**, volver a enviar `/catalogo/*` al monolito suele ser una operación de routing sencilla, siempre que el contrato siga siendo compatible y el monolito pueda responder con datos válidos. Conserva la regla anterior y prueba el cambio de vuelta antes de abrir el tráfico.

**En una extracción con escrituras**, cambiar una regla no devuelve los datos nuevos al sistema viejo. Si el servicio ya aceptó pedidos en su propia base, el monolito no puede verlos por arte de magia. Antes del corte, define si la reversión requiere replicar cambios, reconciliar registros o ejecutar compensaciones; si no existe una vía segura de retorno, prepara una corrección hacia adelante y comunica ese límite. Mantén los esquemas compatibles durante la ventana de reversión: agrega primero, migra consumidores y elimina campos antiguos después.

Por eso, “el monolito sigue encendido” no es un plan suficiente de rollback. También necesitas saber cuál sistema es la fuente de verdad, qué datos pueden estar atrasados y quién detiene nuevas escrituras durante una reversión.

## Mide antes y después del corte

Separa las métricas por ruta y destino: volumen, latencia, errores del ALB o API Gateway, salud de cada *target group*, errores del servicio nuevo, retraso de eventos y diferencias encontradas al conciliar datos. Para ALB, AWS publica métricas como `HTTPCode_ELB_5XX_Count` y `UnHealthyHostCount`. En HTTP APIs de API Gateway, puedes observar `4xx`, `5xx`, `Latency` e `IntegrationLatency`; REST APIs tienen métricas con nombres y dimensiones propios. Activa también registros estructurados con un `requestId` o `correlationId` que atraviese los componentes. Consulta los [indicadores de ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-metrics.html), las [métricas de HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-metrics.html) o las [métricas de REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html). Para diseñar identificadores que sirvan en una operación distribuida, consulta [cómo correlacionar eventos en AWS](/blog/correlacion-de-eventos-con-step-functions-y-cloudwatch/).

Define umbrales y una persona responsable de decidir si se amplía, se detiene o se revierte el corte. Observa también resultados de negocio, como pedidos completados o inventario reservado: un `200 OK` no prueba que el flujo quedó consistente. La fachada añade configuración, saltos de red y un componente crítico para el tráfico; una ruta mal configurada o un backend no saludable todavía puede interrumpir solicitudes. El patrón reduce el tamaño del cambio, pero no promete disponibilidad perfecta.

## Cuándo no extraer otro servicio

Si el sistema funciona, los límites de dominio son confusos y los equipos pueden desplegar módulos juntos, primero ordena el monolito. Extraer un servicio implica operar redes, permisos, alertas, reintentos, contratos y coherencia de datos por separado. Hazlo cuando necesites desplegar, escalar o delegar esa capacidad de forma independiente y puedas asumir esas tareas operativas.

Si la meta inmediata es mover la aplicación a AWS, un traslado sin refactorización puede tener menos riesgo y trabajo que partirla mientras migra. Si la función no se puede aislar en el perímetro, usa una abstracción dentro del código. Y si una aplicación pequeña no necesita despliegues independientes, no hace falta convertirla en microservicios para aplicar el patrón de forma correcta.

## Sigue aprendiendo y conversa con la comunidad

La grabación en español [“Rompiendo Monolitos” de Charlas Técnicas de AWS](https://www.youtube.com/watch?v=7KSqiOlBg7Y), con Irene Aguilar, recorre discovery y patrones como Strangler Fig, anti-corruption layer y branch by abstraction. Se publicó en 2023: sirve para escuchar experiencias y preguntas de diseño; comprueba los detalles actuales de los servicios en la documentación enlazada arriba. El AWS User Group CreaTicas también publicó [“Microlitos: De monolitos a microservicios”](https://www.youtube.com/watch?v=-xmVUogaJbY), una conversación sobre el riesgo de dividir el sistema sin eliminar el acoplamiento.

Para hacer preguntas técnicas en español, puedes usar [AWS re:Post](https://repost.aws/es), un foro público de preguntas y respuestas. No publiques credenciales, datos personales ni detalles privados de una cuenta; las consultas urgentes o confidenciales corresponden a AWS Support. Si prefieres conversar en un grupo, busca por país y tipo en el [directorio de comunidades AWS de Latinoamérica](/comunidades/); por ejemplo, el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) comparte experiencias sobre AWS y nuevas tecnologías, y el [portal del AWS User Group Perú](https://awsugperu.cloud/) reúne grupos locales, talleres y recursos. Revisa las condiciones de cada actividad en su página.

La [agenda de eventos AWS en Latinoamérica](/eventos/) reúne fechas y modalidades de comunidades. Al revisarla, encontré estas actividades próximas:

- El [AWS Gaming Lab sobre ECS, CI/CD y Terraform](https://www.meetup.com/aws-sbg-at-national-technologic-university-regional-faculty/events/316821666/) está anunciado en Córdoba para el 10 de octubre de 2026; la [ficha de UTN Facultad Regional Córdoba](https://prensa.frc.utn.edu.ar/eventos/aws-gaming-lab-ecs-ci-cd-y-la-magia-de-terraform/) indica que es gratuito, requiere inscripción previa y está dirigido a estudiantes de Ingeniería en Sistemas de Información.
- El [AWS Community Day Paraguay 2026](https://www.awscommunitydayparaguay.com/register) figura para el 17 de octubre, de 08:00 a 18:00, en San Lorenzo. La organización informa que la entrada es gratuita, requiere registro y tiene cupo limitado; habrá charlas y talleres en español.
- El [AWSpectrum Architecture Arena](https://www.meetup.com/aws-user-group-awspectrum/events/316830690/) está anunciado para el 26 de octubre, de 16:00 a 18:30, en Ciudad de México. La convocatoria propone diseñar y defender una arquitectura cloud; consulta Meetup para confirmar precio, cupos y registro, que no aparecen en la descripción revisada.
- El [AWS Student Community Day Córdoba 2026](https://www.meetup.com/aws-sbg-at-national-university-of-cordoba/events/316848908/) está anunciado para el 7 de noviembre, de 13:00 a 20:00, en la FaMAF de la UNC. La comunidad informa que es gratuito, que requiere registro y que tiene cupos limitados; la agenda incluye un espacio técnico de arquitectura y talleres prácticos.

Las fechas y condiciones pueden cambiar. Si ya pasaron, usa la agenda para encontrar otras actividades.
