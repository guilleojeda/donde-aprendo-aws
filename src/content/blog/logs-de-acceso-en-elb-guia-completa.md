---
title: "Logs de acceso de ELB en AWS: configurar ALB y diagnosticar 5xx"
description: "Configura logs de acceso de ALB en S3, consulta errores 5xx con Athena y entiende qué registran ALB, NLB y Classic Load Balancer."
author: "guille-ojeda"
publishedAt: "2025-03-13"
publishedTimestamp: "2025-03-13T03:14:10.062000+00:00"
modifiedTimestamp: "2026-10-06T17:34:19-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Correlación de eventos en AWS: IDs, EventBridge y CloudWatch"
    url: "https://dondeaprendoaws.com/blog/estrategias-de-correlacion-de-eventos-aws/"

---

Si buscas una solicitud HTTP que llegó a un balanceador, ver qué respondió el balanceador y qué devolvió el destino, los logs de acceso de un **Application Load Balancer (ALB)** —parte de Elastic Load Balancing (ELB)— son un buen punto de partida. El método tradicional los entrega como archivos en Amazon S3. La configuración, el cifrado y los datos disponibles cambian según el tipo de balanceador; un **Network Load Balancer (NLB)**, por ejemplo, solo registra solicitudes que pasan por un listener TLS.

Esta guía configura el caso más común —ALB hacia S3—, muestra una consulta de errores con Athena y explica qué usar cuando el tráfico o la pregunta son distintos.

## Qué registra cada tipo de balanceador

### Application Load Balancer (ALB)

Registra solicitudes HTTP/HTTPS, incluida la ruta, los códigos de respuesta y los tiempos del balanceador y del destino. También admite entradas HTTP/2, gRPC y WebSockets. Los archivos tradicionales se comprimen en S3 y se publican cada cinco minutos por nodo. La entrega es eventual y de mejor esfuerzo, no un recuento exacto de solicitudes. Consulta el [formato y los campos de ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html).

### Network Load Balancer (NLB)

Registra detalles de conexiones TLS, como cliente, negociación y protocolo. Los archivos tradicionales se comprimen en S3 y se publican cada cinco minutos. **Solo genera access logs si tiene un listener TLS y solo para solicitudes TLS**; no registra listeners TCP o UDP sin TLS. El bucket S3 debe estar en la misma Región, aunque puede pertenecer a otra cuenta. Consulta el [formato y los campos de NLB](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-access-logs.html).

### Classic Load Balancer

Registra solicitudes y conexiones según el listener, con un formato distinto del de ALB. El bucket debe estar en la misma Región; AWS cifra cada archivo con SSE-S3. Publica en S3 cada 5 o 60 minutos; el intervalo predeterminado es 60 minutos. Contrasta el formato y los atributos con la [guía de logs de Classic](https://docs.aws.amazon.com/elasticloadbalancing/latest/classic/access-log-collection.html) y sus [requisitos de habilitación](https://docs.aws.amazon.com/elasticloadbalancing/latest/classic/enable-access-logs.html).

### Gateway Load Balancer

No genera access logs propios: reenvía flujos de capa 3 sin terminarlos. Para ver tráfico, usa VPC Flow Logs y activa registros en los dispositivos de seguridad de destino. Consulta cómo [monitorear GWLB](https://docs.aws.amazon.com/elasticloadbalancing/latest/gateway/monitoring.html).

Para ALB y NLB hay además una integración de logs de CloudWatch. Desde **Integrations** puede entregar tipos de logs a CloudWatch Logs, Amazon Data Firehose o S3; S3 admite Parquet. En ALB incluye access, connection y health check logs. En NLB sigue registrando solo solicitudes TLS. Es una vía de entrega distinta de los archivos tradicionales en S3 y requiere sus propios permisos y revisión de costos. Usa [CloudWatch Logs Insights](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-logs.html) si los envías a CloudWatch; para los archivos tradicionales en S3, puedes consultar el formato con Athena.

Si quieres repasar primero cómo se diferencian ALB y NLB, AWS Women Colombia publicó dos introducciones conceptuales en 2023: [Application Load Balancer, capa 7](https://awswomencolombia.com/100diasdeaws-dia18-aws-application-load-balancer) y [Network Load Balancer, capa 4](https://awswomencolombia.com/100diasdeaws-dia17-aws-network-load-balancer). No son tutoriales de access logs; confirma la configuración, las funciones y los precios actuales en la documentación de AWS.

## Habilitar los logs tradicionales de un ALB en S3

Necesitas un ALB existente y un bucket de S3. El bucket debe estar en la **misma Región de AWS** que el balanceador; puede pertenecer a otra cuenta si la política lo permite. Para este tipo de access logs, AWS admite **SSE-S3** como cifrado del bucket, no SSE-KMS. Un prefijo opcional organiza los objetos, pero no puede incluir el texto `AWSLogs`. Consulta los [requisitos vigentes de AWS](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html) antes de aplicar una configuración en otra partición o en Outposts.

### 1. Permitir la entrega en la política del bucket

Añade esta declaración a la política del bucket existente. Cambia el nombre del bucket, el prefijo `logs` y el ID de la cuenta propietaria del ALB. El ID de cuenta debe ser el de la cuenta del balanceador, incluso si el bucket está en otra cuenta.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowALBAccessLogs",
      "Effect": "Allow",
      "Principal": {
        "Service": "logdelivery.elasticloadbalancing.amazonaws.com"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::MI-BUCKET/logs/AWSLogs/123456789012/*"
    }
  ]
}
```

Si no vas a usar prefijo, elimina `logs/` tanto de la ruta de S3 que configures como del ARN del recurso. La política usa el principal de entrega actual para balanceadores estándar; AWS documenta un principal y una política distintos para balanceadores en Outposts. En AWS GovCloud, el ARN del bucket usa la partición `arn:aws-us-gov`. La [guía de habilitación de ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html) incluye estos casos y ejemplos completos.

### 2. Activar el atributo de access logs

En la consola, abre **EC2 → Load Balancers**, selecciona el ALB y, en **Attributes → Edit → Monitoring**, activa **Access logs**. Indica el nombre del bucket y el prefijo `logs` del ejemplo.

El mismo cambio se puede hacer con AWS CLI. Este comando actualiza los atributos de un ALB existente; no crea el bucket ni el balanceador:

```bash
aws elbv2 modify-load-balancer-attributes \
  --region REGION_DEL_ALB \
  --load-balancer-arn "ARN_DEL_ALB" \
  --attributes \
    Key=access_logs.s3.enabled,Value=true \
    Key=access_logs.s3.bucket,Value=MI-BUCKET \
    Key=access_logs.s3.prefix,Value=logs
```

Si no configuras un prefijo, omite el último atributo. Para NLB, los nombres de atributos de S3 son parecidos, pero no reutilices la política del ALB: usa el procedimiento de AWS para [habilitar access logs de un NLB](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/enable-access-logs.html).

### 3. Verificar permisos y esperar una solicitud real

Al habilitar los logs, Elastic Load Balancing valida el bucket y puede crear `ELBAccessLogTestFile` bajo `logs/AWSLogs/123456789012/`. Ese objeto comprueba permisos; **no contiene registros de solicitudes**. Envía una solicitud de prueba al ALB y revisa el prefijo con la cuenta, Región y fecha correctas.

AWS publica archivos por nodo cada cinco minutos, pero la entrega es eventualmente consistente. Puede haber más de un archivo para el mismo intervalo y la primera entrega puede tardar. No esperes un objeto nuevo exactamente cada cinco minutos. La ruta tiene esta forma:

```text
s3://MI-BUCKET/logs/AWSLogs/123456789012/elasticloadbalancing/REGION/AAAA/MM/DD/...
```

El resto del nombre identifica el balanceador y el intervalo final en UTC; los objetos terminan en `.log.gz`. La [documentación del formato de access logs de ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html) explica cada componente.

## Leer los campos de una solicitud ALB

Los registros de ALB son líneas delimitadas por espacios, pero algunos campos —como la línea de solicitud y el agente de usuario— están entre comillas y pueden contener espacios. No los proceses separando cada línea ingenuamente por espacios. Los campos nuevos se agregan al final, así que mantén el parser o la tabla de Athena alineados con el formato publicado por AWS.

- **`time` y `request_creation_time`**: Comparar la hora de recepción y la respuesta del balanceador. Se expresan en UTC.
- **`client:port` y `target:port`**: Identificar el par cliente y destino. Si había un proxy delante del ALB, `client:port` puede ser la dirección del proxy.
- **`elb_status_code`**: Código generado por el balanceador, una regla de respuesta fija o una respuesta personalizada de AWS WAF.
- **`target_status_code`**: Código enviado por el destino, si se estableció una conexión y este respondió; `-` significa que no se registró respuesta HTTP del destino.
- **`request_processing_time`**: Segundos desde que el ALB recibió la solicitud hasta que la envió al destino. `-1` indica que no pudo despacharla, por ejemplo ante una solicitud malformada o una conexión fallida al destino.
- **`target_processing_time`**: Segundos desde que el ALB envió la solicitud hasta que el destino empezó a enviar los encabezados de respuesta. `-1` puede indicar que el destino no respondió.
- **`response_processing_time`**: Segundos desde que el ALB recibió los encabezados del destino hasta que empezó a enviar la respuesta al cliente. No es el tiempo completo que percibe el cliente.
- **`request_line`, `actions_executed`, `error_reason`**: Ver la ruta y método, la acción aplicada y el motivo registrado para determinados fallos. La línea puede incluir la URL enviada por el cliente.


Los tiempos se expresan en segundos con precisión de milisegundos. No sumes a ciegas las tres fases para afirmar la latencia total de extremo a extremo: el significado depende de cómo terminó la solicitud y de condiciones como AWS WAF o el destino. Compara las fases con el código y el campo `error_reason`.

Una distinción práctica: si `elb_status_code` es 5xx y `target_status_code` también es 5xx, el destino devolvió ese error. Si el ALB muestra 5xx y el destino tiene `-`, investiga si la solicitud alcanzó un destino, si el destino respondió y qué indica `error_reason`. Las [definiciones de campos y códigos de ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html) cubren los casos particulares.

## Consultar errores 5xx con Athena

Athena no convierte automáticamente cualquier archivo de S3 en una tabla: primero crea una base de datos y una tabla con el [DDL de AWS para el formato actual de ALB](https://docs.aws.amazon.com/athena/latest/ug/create-alb-access-logs-table.html). Sustituye en `LOCATION` el prefijo real de tus logs. El esquema de ejemplo de AWS contempla campos recientes; si trabajas con una tabla antigua, actualiza las columnas y la expresión de lectura. La guía oficial también incluye [consultas de ejemplo](https://docs.aws.amazon.com/athena/latest/ug/query-alb-access-logs-examples.html).

Con esa tabla —llamada `alb_access_logs` en el ejemplo de AWS—, esta consulta lista errores 5xx del balanceador con la ruta y el estado del destino:

```sql
SELECT
  time,
  client_ip,
  request_url,
  elb_status_code,
  target_status_code,
  request_processing_time,
  target_processing_time
FROM alb_access_logs
WHERE elb_status_code >= 500
ORDER BY time DESC
LIMIT 100;
```

Si creaste la tabla con la variante de AWS que usa *partition projection*, filtra además por la columna `day` —por ejemplo, `day = '2026/10/06'`— para consultar solo esa fecha. Sin particiones o un prefijo acotado, una consulta histórica puede leer muchos datos; revisa los bytes que Athena va a analizar y el [modelo de precios de Athena](https://aws.amazon.com/athena/pricing/) antes de ampliar el rango.

Como recorrido grabado en español, [AWS User Group Caracas: Introducción a CloudFormation y visualización de logs con Athena](https://www.youtube.com/watch?v=aFs6xVYOIwE) muestra una demostración publicada en 2022. Sirve como referencia conceptual para explorar Athena; contrasta el esquema, los permisos y los pasos de configuración con la documentación actual.

## Logs de acceso, métricas, VPC Flow Logs y CloudTrail

Elige la señal según la pregunta. No son intercambiables:

- **Access logs de ALB**: ¿Qué solicitud HTTP llegó, qué acción ejecutó el ALB y qué código o tiempo devolvió el destino?
- **Métricas de CloudWatch**: ¿Cómo cambian con el tiempo los conteos, la salud de los destinos o los errores agregados del balanceador? No identifican cada solicitud.
- **VPC Flow Logs**: ¿Qué flujos IP entraron o salieron de una interfaz, con qué protocolo, puertos y resultado? No contienen URL ni código HTTP; son una alternativa para investigar NLB TCP/UDP sin TLS.
- **CloudTrail**: ¿Quién llamó a una API de Elastic Load Balancing y cuándo cambió la configuración? Registra operaciones de administración, no las solicitudes de la aplicación.


Consulta la guía de [métricas de ALB en CloudWatch](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-metrics.html), la de [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html) y la de [llamadas de API de ELB en CloudTrail](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/cloudtrail-logs.html). Para Gateway Load Balancer, AWS recomienda Flow Logs y los registros de los dispositivos conectados porque el GWLB no termina los flujos ni genera access logs.

## Problemas frecuentes

### El ALB devuelve `Access Denied` al activar los logs

Comprueba que el bucket esté en la misma Región; que el nombre del bucket coincida; que el `Principal.Service` sea el de la guía actual; y que el ARN incluya la cuenta del balanceador, el prefijo configurado y `AWSLogs`. Si no configuraste prefijo, elimínalo del ARN. Revisa también la configuración de cifrado: para los access logs tradicionales de ALB el bucket debe usar SSE-S3, no SSE-KMS. La [guía de habilitación de ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html) enumera estas causas.

### Aparece `ELBAccessLogTestFile`, pero no hay `.log.gz`

El archivo de prueba solo valida la escritura en el bucket. Genera tráfico real, espera la entrega eventual y revisa la ruta de la Región y la fecha UTC correspondientes. Si sigue sin haber archivos, confirma que el atributo `access_logs.s3.enabled` esté en `true` y que el balanceador reciba solicitudes.

### El NLB no produce registros para un listener TCP o UDP

Es el comportamiento esperado de los access logs: solo se crean cuando el NLB tiene un listener TLS y registran solicitudes TLS. Para tráfico TCP/UDP sin TLS, empieza con VPC Flow Logs y métricas de CloudWatch. Si necesitas access logs TLS, comprueba la política y el cifrado indicados en la [guía específica de NLB](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/enable-access-logs.html): a diferencia de ALB, el destino S3 puede usar SSE-S3 o SSE-KMS con una clave administrada por el cliente; las claves administradas por AWS no se admiten en ese caso.

### Athena devuelve columnas incorrectas o no analiza algunos registros

Usa el DDL actual de AWS y revisa si se publicaron campos adicionales al final. Actualiza la tabla y su expresión de lectura en lugar de asumir que todas las versiones tienen idéntico número de campos. Conserva el patrón final opcional que recomienda AWS para tolerar campos futuros. No conviertas `-` o `-1` en cero: tienen significados diferentes según el campo.

## Proteger los registros y decidir su retención

Los logs pueden guardar direcciones IP, agente de usuario, ruta y URL enviados por el cliente. Restringe quién puede leer el bucket y evita incluir credenciales o secretos en query strings. Define la retención según la necesidad operativa y las obligaciones de tu organización; si quieres archivar o eliminar objetos automáticamente, configura una regla de ciclo de vida de S3 con ese plazo. No hay un período universal que sirva para todas las aplicaciones.

Si necesitas unir una solicitud con los registros de varios servicios, continúa con la guía sobre [correlación de eventos e identificadores en AWS](/blog/estrategias-de-correlacion-de-eventos-aws/). Los access logs ayudan a localizar lo que observó el balanceador; la propagación de IDs en la aplicación permite seguir la operación más allá de él.

## Aprender y conversar con la comunidad AWS

Para dudas de conectividad, [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) reúne a personas que trabajan con redes híbridas, VPC, rutas y observabilidad de red. Para intercambiar experiencias sobre seguridad y controles, consulta [AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/). Sus agendas y modalidades pueden cambiar; revisa cada página antes de participar. El [directorio de comunidades AWS](/comunidades/user-groups/) y la [agenda de eventos](/eventos/) ayudan a encontrar grupos y actividades por país y modalidad.

Al revisar esta guía el **6 de octubre de 2026**, había dos actividades próximas que podían complementar el tema desde redes y comunidad:

- [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) es virtual el 21 de octubre de 2026, de 18:00 a 20:00, hora de Colombia (UTC−5). La sesión cubre VPC, subredes y rutas; los cupos son limitados y requiere inscripción previa.
- [AWS Community Day Paraguay 2026](https://www.awscommunitydayparaguay.com/register) se realiza presencialmente el 17 de octubre, de 08:00 a 18:00, en San Lorenzo, Paraguay. La entrada es gratuita, el cupo es limitado y el registro se hace en Eventbrite; los talleres prácticos tienen cupos propios.

Si estás en otro país o esas fechas ya pasaron, consulta la agenda para ver próximas actividades. En eventos grabados, usa la charla para aprender conceptos y confirma los comandos, permisos y formatos en la documentación vigente de AWS.
