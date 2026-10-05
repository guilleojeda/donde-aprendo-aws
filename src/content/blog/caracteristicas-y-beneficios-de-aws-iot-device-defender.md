---
title: "AWS IoT Device Defender: Audit, Detect y mitigación"
description: "Entiende qué revisa AWS IoT Device Defender Audit, cómo funcionan Rules y ML Detect para clientes existentes, qué métricas y permisos intervienen y qué sigue disponible para clientes nuevos."
author: "guille-ojeda"
publishedAt: "2024-05-06"
publishedTimestamp: "2024-05-06T14:05:13.37Z"
modifiedTimestamp: "2026-10-05T20:31:27-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "AWS IoT Device SDK para JavaScript: 7 errores comunes y cómo resolverlos"
    url: "https://dondeaprendoaws.com/blog/7-errores-comunes-con-aws-iot-device-sdk-para-javascript/"
  - title: "Cómo simular dispositivos IoT en AWS: MQTT, ejemplos y límites"
    url: "https://dondeaprendoaws.com/blog/aws-iot-edge-simulator-casos-de-uso-reales/"
  - title: "Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
  - title: "Servicios de seguridad de AWS: cuál usar para cada problema"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/"
---

**AWS IoT Device Defender ayuda a revisar la configuración de una flota IoT y, cuando la cuenta tiene acceso a Detect, a identificar comportamientos anómalos.** Sus dos capacidades no hacen lo mismo: **Audit** ejecuta comprobaciones predefinidas sobre certificados, políticas y configuración; **Detect** compara métricas de comportamiento con perfiles de seguridad. Desde el **31 de agosto de 2026**, AWS indica que Detect (Rules Detect y ML Detect) ya no está disponible para clientes nuevos y permanece en mantenimiento para clientes existentes. Audit sigue disponible.

Esta distinción importa si estás diseñando una flota hoy. Puedes aprender y usar Audit sin asumir que Detect se puede activar en una cuenta nueva. Tampoco es un antivirus, un firewall para el dispositivo ni una certificación automática de cumplimiento: encuentra señales y ofrece acciones configurables; tu equipo debe investigar, corregir y verificar el resultado.

## Qué capacidad necesitas

| Necesidad | AWS IoT Device Defender | Resultado y límite |
| --- | --- | --- |
| Revisar certificados, políticas y ajustes de IoT | **Audit** | Hallazgos de comprobaciones predefinidas, bajo demanda o programadas. No audita cualquier aplicación ni sustituye una revisión de arquitectura. |
| Vigilar cambios anómalos en conexiones, mensajes o tráfico | **Detect** | Perfiles con comportamientos basados en reglas o ML, métricas cloud-side y device-side. Solo clientes existentes de Detect pueden continuar usándolo. |
| Avisar a un equipo | Audit y Detect | Consola, métricas de Amazon CloudWatch y, según la configuración, Amazon SNS. SNS necesita un rol y permisos correctos. |
| Reducir el riesgo después de un hallazgo | Acciones de mitigación | Se definen y se ejecutan sobre hallazgos o alarmas; pueden desactivar certificados o mover cosas a un grupo. No corrigen la causa ni tienen rollback automático. |
| Procesar el mensaje de un sensor | AWS IoT Core | MQTT, certificados o credenciales de la conexión y reglas de IoT. Device Defender observa o evalúa señales; no reemplaza al broker. |

La [guía oficial de AWS IoT Device Defender](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/what-is-device-defender.html) resume la relación entre estas piezas. Para comprender la responsabilidad de identidad, permisos y datos en la nube, consulta también los [fundamentos de seguridad en AWS](https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/).

## Audit: comprobar la configuración de la flota

Audit revisa ajustes de la cuenta y de los dispositivos frente a comprobaciones de seguridad de AWS IoT. Puedes ejecutar una auditoría bajo demanda o crear una programación diaria, semanal, quincenal o mensual. Las comprobaciones deben estar habilitadas en la cuenta y la recopilación puede tardar antes de que aparezcan resultados.

Entre las comprobaciones actuales se encuentran:

- certificados de dispositivo compartidos, revocados, próximos a vencer o con problemas de calidad de clave;
- certificados de autoridad certificadora revocados o próximos a vencer;
- políticas de AWS IoT demasiado permisivas o potencialmente mal configuradas;
- roles de Amazon Cognito y alias de rol con permisos excesivos;
- identificadores MQTT en conflicto;
- registros de AWS IoT deshabilitados.

La lista completa cambia con el servicio y está en [Audit checks](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/device-defender-audit-checks.html). Un hallazgo significa que una comprobación encontró una condición que debes revisar; no demuestra por sí solo que un dispositivo haya sido comprometido. Del mismo modo, un resultado conforme solo cubre la comprobación y el alcance que se evaluaron.

Audit puede publicar los hallazgos no conformes en un tema de SNS. Para ello, la configuración de la cuenta necesita un rol que permita a AWS IoT Device Defender leer los recursos de IoT y otro rol o permisos adecuados para publicar en el tema. La [guía de Audit](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/audit-tutorial.html) muestra el flujo en consola. El rol de notificación debe confiar en `iot.amazonaws.com` y permitir `sns:Publish` sobre el tema elegido; la persona que lo configura puede necesitar `iam:PassRole`.

### Audit no es una certificación

Las comprobaciones ayudan a encontrar desviaciones de prácticas de seguridad de IoT, pero no certifican ISO 27001, una norma sectorial ni el cumplimiento de tu aplicación. Un programa de cumplimiento necesita definir controles, alcance, evidencia, responsables y revisión humana. Device Defender puede aportar una señal dentro de ese proceso.

## Detect: perfiles, reglas, ML y disponibilidad actual

Detect crea un **Security Profile**, lo vincula a todos los dispositivos, a los registrados, a los no registrados o a un grupo de cosas, y evalúa los comportamientos que definas. Un comportamiento tiene una métrica y una condición: por ejemplo, más de cierto número de fallos de autorización en una ventana de tiempo.

AWS distingue dos tipos de comportamiento:

| Tipo | Cómo establece lo esperado | Qué debes saber |
| --- | --- | --- |
| **Rules Detect** | Tú defines un valor, un conjunto de valores o un umbral estadístico y la cantidad de puntos consecutivos que activa o limpia una alarma. | Es explícito y fácil de explicar, pero los umbrales deben representar el funcionamiento normal de ese grupo de dispositivos. |
| **ML Detect** | Un modelo aprende patrones históricos y calcula anomalías para las métricas compatibles. | Requiere datos suficientes y grupos con comportamientos comparables. No es una detección universal de malware. |

Para ML Detect, AWS documenta una fase inicial de hasta 14 días y un mínimo de 25.000 puntos por métrica en los 14 días anteriores para construir el modelo; después lo actualiza con datos recientes si sigue teniendo suficientes datos. Una flota que mezcla sensores domésticos y dispositivos industriales puede necesitar perfiles separados para no mezclar patrones normales distintos. Revisa los [conceptos de Detect](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/detect-concepts.html) y las [limitaciones de ML Detect](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/dd-detect-ml.html).

### Métricas cloud-side, device-side y `clientId`

Las métricas de Detect proceden de dos fuentes documentadas. **Cloud-side** son señales que AWS IoT observa en la interacción con el broker, como mensajes enviados o recibidos, tamaño de mensaje, intentos de conexión, desconexiones y fallos de autorización. **Device-side** son datos que un agente recoge en el dispositivo, como bytes y paquetes, conexiones TCP establecidas, puertos TCP o UDP en escucha y direcciones de destino.

El `clientId` no es una tercera fuente de métricas. Es el identificador de la sesión MQTT y puede usarse para atribuir datos, restringir un comportamiento con la variable `${iot:ClientId}` en una dimensión o mantener la identidad estable de un dispositivo no registrado. Si un dispositivo no registrado cambia de identificador, se rompe la continuidad y sus métricas o violaciones pueden atribuirse a otra identidad; usa un valor consistente durante su vida. La documentación de [dimensiones de perfiles](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/scoping-security-behavior.html) explica ese alcance.

Puedes usar Detect solo con métricas cloud-side. Para las device-side puedes usar un SDK IoT versión 2, el [AWS IoT Device Client](https://github.com/awslabs/aws-iot-device-client) u otra implementación que recoja los datos y publique el formato documentado en AWS IoT. El Device Client es una implementación de referencia en C++ para dispositivos Linux y también cubre otras capacidades de IoT Device Management.

### Cómo se relacionan MQTT, el SDK y los permisos

Publicar la telemetría de tu aplicación en un topic no convierte automáticamente esos datos en métricas device-side de Device Defender. Hay dos recorridos diferentes:

1. El dispositivo se conecta a AWS IoT Core y publica su telemetría normal en los topics de tu aplicación.
2. El agente o SDK recoge métricas del sistema y las publica en el topic reservado de Device Defender, por ejemplo `$aws/things/Thing-1/defender/metrics/json`.

En ambos casos necesitas una identidad y autorización válidas. Con MQTT sobre TLS, AWS IoT Core suele autenticar el cliente mediante un certificado X.509 activo, registrado y asociado a una política IoT. Con MQTT sobre WebSocket Secure (WSS), la conexión usa SigV4 y puede utilizar credenciales temporales de IAM o una identidad de Amazon Cognito. La [tabla de autorización de IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/iot-authorization.html) y la [guía de protocolos](https://docs.aws.amazon.com/iot/latest/developerguide/protocols.html) muestran las combinaciones.

La política no se resume en “puede usar IoT”. Una conexión necesita `iot:Connect`; publicar necesita `iot:Publish`; suscribirse necesita `iot:Subscribe`, y recibir mensajes necesita `iot:Receive`. Los recursos también cambian: `client/<clientId>` para conectar, `topic/<topic>` para publicar o recibir y `topicfilter/<filtro>` para suscribirse. Consulta los [ejemplos de publicación y suscripción](https://docs.aws.amazon.com/iot/latest/developerguide/pub-sub-policy.html). No compartas claves privadas ni claves de acceso permanentes en el firmware o en un navegador.

Para publicar métricas device-side, la configuración del agente de AWS IoT Device Client debe habilitar `device-defender` y usar un intervalo de al menos **300 segundos**; intervalos menores pueden sufrir limitación. El topic reservado solo admite las operaciones documentadas y el nombre de la cosa debe cumplir los límites de formato. La [especificación de métricas device-side](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/detect-device-side-metrics.html) incluye el formato del reporte, los topics aceptados y los ejemplos.

## Alertas y acciones de mitigación

Una alarma no equivale a una corrección. Puedes observar resultados en la consola y en CloudWatch; Audit puede enviar hallazgos y Detect, para clientes que ya lo tienen, puede enviar alarmas a SNS. La configuración de SNS requiere un rol de confianza `iot.amazonaws.com` con `sns:Publish` sobre el topic. Si el flujo usa una identidad que configura el rol, también debe poder pasarlo con `iam:PassRole`. Un tema sin suscripción o una política incorrecta puede hacer que la alerta exista en SNS sin llegar a una persona.

Device Defender ofrece acciones predefinidas que se configuran antes de ejecutar una tarea. Según el tipo de hallazgo pueden:

- publicar el hallazgo en SNS;
- marcar un certificado de dispositivo o de CA como inactivo;
- cambiar la versión de una política IoT;
- añadir cosas a un grupo previsto para cuarentena;
- habilitar el registro de IoT.

Para Detect, la acción documentada de mitigación es añadir dispositivos a un grupo de cosas. Pertenecer al grupo no aísla un dispositivo por sí solo: el grupo debe tener políticas, reglas o un procedimiento operativo que aplique la cuarentena, y el rol de la acción debe poder modificar la membresía. Registra qué cosa se añadió, qué política efectiva restringe su acceso y cómo se recupera. Para Audit, el conjunto depende de cada comprobación; no todas admiten las mismas acciones. Puedes aplicar una tarea a todos los hallazgos de una auditoría o a una selección. Desactivar un certificado o reemplazar una política puede dejar dispositivos sin conexión, y AWS no ofrece un rollback automático de las acciones aplicadas. Primero investiga, limita el alcance y prueba la recuperación. La [tabla oficial de acciones de mitigación](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/dd-mitigation-actions.html) detalla estas condiciones.

Una acción también puede reducir el riesgo sin resolver la causa: por ejemplo, añadir un dispositivo a un grupo de cuarentena no arregla el firmware, la credencial copiada o la política que permitió el problema, y tampoco lo aísla mientras no exista un control efectivo asociado al grupo. Documenta la corrección y verifica que el dispositivo vuelve a comportarse como esperas.

## Práctica de solo lectura: revisar Audit sin crear recursos

Esta práctica sirve para comprobar el estado de una cuenta de laboratorio o de una cuenta sobre la que ya tienes permiso. No inicia auditorías, no crea roles, no publica mensajes y no cambia la configuración.

1. Elige la Región donde administras AWS IoT y confirma que la identidad usada para la CLI pertenece a la cuenta correcta.
2. Ejecuta la consulta de configuración de Audit:

```bash
AWS_REGION=us-east-1
aws sts get-caller-identity --region "$AWS_REGION"
aws iot describe-account-audit-configuration --region "$AWS_REGION"
```

3. En `auditCheckConfigurations`, anota qué comprobaciones están habilitadas. Revisa `roleArn` y, si aparece una configuración de notificaciones, confirma el tema y el rol sin modificar nada.
4. Si tu cuenta ya tenía Detect, enumera sus perfiles para reconocer qué está realmente configurado:

```bash
aws iot list-security-profiles --region "$AWS_REGION"
```

Un error `AccessDenied` demuestra que la identidad no puede hacer esa consulta; no demuestra que Audit o Detect estén deshabilitados. Si no aparecen perfiles, puede que no existan en esa Región o que la cuenta sea nueva y Detect no esté disponible. Compara la salida con la [referencia de permisos de Device Defender](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/security_iam_id-based-policy-examples.html). Para practicar MQTT sin hardware, sigue la guía de [simulación de dispositivos IoT con AWS IoT Core](https://dondeaprendoaws.com/blog/aws-iot-edge-simulator-casos-de-uso-reales/), que separa la publicación de prueba del envío de métricas device-side.

## Troubleshooting: por qué no aparece lo que esperas

### Audit no muestra resultados

Comprueba la Región, la cuenta y que haya comprobaciones habilitadas. Después de habilitar una comprobación, AWS puede tardar en recopilar datos, especialmente en cuentas con muchos recursos. Revisa el rol de Audit y el historial de tareas; una política que permite abrir la consola no necesariamente permite listar certificados, políticas y cosas.

### No llega la notificación de Audit

Revisa que SNS esté habilitado en la configuración de Audit, que el rol confíe en `iot.amazonaws.com`, que permita `sns:Publish` sobre el ARN correcto y que el tema tenga una suscripción confirmada. Comprueba CloudWatch y la métrica `MisconfiguredDeviceDefenderNotification` de AWS IoT si sospechas de una configuración incorrecta.

### No hay métricas o alarmas de Detect

Primero confirma que la cuenta ya era cliente de Detect. En una cuenta nueva después del 31 de agosto de 2026 no podrás activar Rules Detect o ML Detect como antes. En una cuenta existente, revisa que el Security Profile esté asociado al objetivo correcto, que el comportamiento use una métrica compatible y que los datos lleguen en la Región del perfil.

Si esperabas datos del sistema del dispositivo, confirma que el agente está activo, que el reporte cumple el formato, que el topic reservado es exacto y que la política permite publicar. Para dispositivos no registrados, conserva el mismo `clientId` o nombre de cosa. Un reporte cada menos de 300 segundos puede ser limitado; un reporte mal formado puede ser rechazado.

### Hay demasiadas alarmas o ninguna

En Rules Detect compara el umbral y la ventana con datos normales del grupo. En ML Detect separa flotas con comportamientos distintos y comprueba que haya datos suficientes para entrenar. Una ausencia de hallazgos no prueba que el dispositivo sea seguro: solo indica que no se observó una violación de los comportamientos y el alcance configurados.

### La conexión MQTT falla después de cambiar permisos

Distingue el transporte y la identidad. Un cliente X.509 necesita un certificado activo y una política IoT asociada; WSS con SigV4 necesita permisos IAM y, según el flujo de Cognito, la combinación de política IAM y política IoT correspondiente. Verifica `iot:Connect`, el `clientId`, el ARN de `topic` o `topicfilter`, la Región y la hora del dispositivo. El artículo sobre [siete errores comunes del SDK de AWS IoT para JavaScript](https://dondeaprendoaws.com/blog/7-errores-comunes-con-aws-iot-device-sdk-para-javascript/) reúne diagnósticos para certificados, WSS, permisos, `clientId`, QoS y reloj.

## Precio, Regiones y límites que conviene revisar

Device Defender no tiene una tarifa única que cubra todo. AWS factura **Audit** por el número de principales de dispositivo activos durante el mes y factura **Detect** por los puntos de datos monitorizados según el tipo de detección. SNS, conectividad y otros servicios pueden sumar cargos. La [página de precios de AWS IoT Device Defender](https://aws.amazon.com/iot-device-defender/pricing/) contiene las tarifas y condiciones actuales; no presupuestes una prueba como gratuita sin revisar la Región, el Free Tier aplicable y la fecha de tu cuenta.

La disponibilidad es regional. Consulta los [endpoints y cuotas de AWS IoT Device Defender](https://docs.aws.amazon.com/general/latest/gr/iot_device_defender.html) antes de diseñar el despliegue. Entre los límites publicados se encuentran cinco auditorías programadas por cuenta, 90 días de retención de hallazgos de Audit, un intervalo mínimo de 300 segundos para reportes device-side y retenciones limitadas para métricas y violaciones de Detect. Los límites y su posibilidad de ajuste dependen del recurso; no conviertas estos valores en una promesa de capacidad de producción.

## Recursos, comunidades y eventos para continuar

Para situar Device Defender frente a IAM, CloudTrail, Config y GuardDuty, consulta [Servicios de seguridad de AWS](https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/). Sus ejemplos son de seguridad general y complementan esta guía.

El catálogo público reúne ejemplos y charlas en español que pueden complementar esta guía:

- [Cómo armé un Pit Wall con AWS IoT Core](https://dev.to/alvarongg/como-arme-un-pit-wall-con-aws-iot-core-y-por-que-este-patron-sirve-para-cualquier-industria-4lo1) muestra identidad por dispositivo, reglas de IoT y procesamiento con un caso de telemetría. Es un artículo de arquitectura de IoT Core, no una guía de Device Defender.
- [Monitoreo de dispositivos IoT en tiempo real en AWS](https://www.youtube.com/watch?v=-lYaBFheUdI), del AWS User Group Perú, enseña un ejemplo con Alexa, Raspberry Pi y sensores. Sirve para visualizar el recorrido de datos, no para asumir que el hardware ya envía métricas device-side.
- [Introducción al IoT en AWS con IoT Core y ESP8266](https://www.youtube.com/watch?v=ilMHiOXCZns), del AWS User Group Ecuador, sirve como material de inicio para conexión y dispositivos. Contrasta la configuración del video con la documentación actual de certificados y políticas.

Para conversar sobre seguridad y encontrar próximos encuentros, puedes visitar [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/), una comunidad hispanohablante centrada en seguridad cloud; [AWS User Group Perú](https://awsugperu.cloud/), que reúne User Groups, Cloud Clubs, talleres y actividades; y [AWS User Group Ecuador](https://www.awsugecuador.com/), con meetups, talleres y enlaces a comunidades del país. Son comunidades independientes: revisa en cada página la actividad vigente, el idioma, la modalidad y las condiciones de participación.

En el snapshot público revisado el **5 de octubre de 2026**, la [agenda de eventos de Dónde Aprendo AWS](https://dondeaprendoaws.com/eventos/) incluía estos encuentros relacionados con seguridad:

- [Compliance as Code en AWS: de la política a la acción automática](https://www.meetup.com/aws-user-group-security-ecuador/events/316680020/), online, **20 de octubre de 2026 a las 19:00 (UTC−5)**, organizado por AWS User Group Security Ecuador.
- [AWS & Cloud Native Security Night](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/), presencial en Guayaquil, **23 de octubre de 2026 de 17:00 a 20:00 (UTC−5)**.
- [AWS Community Day Panamá: Security & Data Edition 2026](https://www.meetup.com/aws-user-group-panama/events/316732293/), presencial en Panamá, **14 de noviembre de 2026**.

La agenda es una instantánea: confirma en la ficha del organizador la fecha, el lugar, los cupos, el registro y cualquier requisito antes de desplazarte o reservar tiempo.

## Preguntas frecuentes

### ¿AWS IoT Device Defender protege el firmware o bloquea un ataque?

No por sí solo. Audit revisa configuraciones y Detect identifica desviaciones en las métricas que tiene disponibles. La respuesta puede incluir una acción configurada, pero debes investigar el firmware, las credenciales, la política, la red y la causa del comportamiento.

### ¿Audit y Detect son dos nombres para la misma función?

No. Audit usa comprobaciones predefinidas sobre configuración e identidades. Detect usa Security Profiles y comportamientos basados en métricas. “Regla” en Rules Detect es un umbral de comportamiento; una regla de AWS IoT Core es otra cosa: procesa mensajes y ejecuta acciones.

### ¿Puedo activar Detect en una cuenta nueva?

AWS indica que Detect dejó de estar disponible para clientes nuevos a partir del 31 de agosto de 2026. Los clientes existentes pueden continuar en mantenimiento. Para una cuenta nueva, revisa la [alternativa autogestionada de detección de anomalías de AWS](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/dd-detect-availability-change.html) y calcula el costo operativo de desplegarla: no es el mismo servicio administrado y no incluye automáticamente las acciones de mitigación de Device Defender.

### ¿Necesito un certificado para publicar métricas?

Necesitas una conexión autenticada y autorizada en AWS IoT. MQTT sobre TLS normalmente usa un certificado X.509 activo y una política IoT; WSS usa SigV4 con IAM o Cognito, según el flujo. En ambos casos, autoriza el topic reservado y el `clientId` que corresponda. No coloques claves privadas o claves permanentes en código distribuido.

### ¿Una alarma ejecuta la mitigación automáticamente?

Solo si has configurado el flujo y ejecutas una acción compatible sobre el hallazgo o alarma. La acción puede afectar la conectividad y no sustituye la corrección de fondo. Prueba el impacto en un grupo controlado y conserva un procedimiento manual para recuperar el servicio.
