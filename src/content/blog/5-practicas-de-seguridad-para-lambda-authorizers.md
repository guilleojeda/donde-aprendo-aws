---
title: "Lambda authorizers: seguridad, JWT y caché en API Gateway"
description: "Guía para elegir entre API REST y HTTP, validar JWT, limitar el caché de autorización y diagnosticar errores 401, 403 y 500 sin filtrar tokens."
author: "guille-ojeda"
publishedAt: "2025-01-23"
publishedTimestamp: "2025-01-23T00:34:06.712Z"
modifiedTimestamp: "2026-10-04T21:31:45-03:00"
cover: "/assets/blog/e838de22cc856de64a0d3bdc.jpg"
coverAlt: "Portátil con código rodeado de iconos luminosos de candados y escudos"
ogImage: "/assets/blog/e838de22cc856de64a0d3bdc.jpg"
related: []
review:
  date: "2026-10-04"
---

Si tu API necesita reglas de autenticación propias, un **Lambda authorizer** puede decidir qué solicitudes pasan a API Gateway. Para aceptar JWT estándar en una **HTTP API**, empieza por evaluar el authorizer JWT integrado: API Gateway valida la firma y los claims configurados sin invocar una función Lambda en cada solicitud. Usa Lambda cuando necesites lógica que esa opción no cubre. En ambos casos, el tipo de API, el formato de respuesta y el caché determinan qué significa una autorización válida.

## Primero identifica el tipo de API

API Gateway REST y HTTP no comparten un único formato de authorizer:

| API | Opciones de authorizer | Respuesta que espera API Gateway |
| --- | --- | --- |
| REST API | Lambda `TOKEN` recibe un token de una cabecera; `REQUEST` recibe parámetros de la solicitud y variables de contexto. | Una política IAM con `principalId` y `policyDocument`. |
| HTTP API | Un authorizer JWT integrado valida JWT de un proveedor OIDC/OAuth. Si hace falta Lambda, el tipo es `REQUEST`; se configura el formato de payload `1.0` o `2.0`. | `1.0` devuelve una política IAM. `2.0` admite una política o una respuesta simple `{ "isAuthorized": true/false }` si habilitas esa opción. |

El authorizer JWT integrado es una función de **HTTP API**, no un Lambda authorizer. Si lo eliges, configura un proveedor de identidad, `issuer` y `audience` reales. API Gateway comprueba la firma con las claves publicadas por el issuer y valida `iss`, `aud` (o `client_id` si no hay `aud`), `exp` y, cuando aparecen, `nbf` e `iat`. También puede exigir scopes en una ruta. AWS advierte que no existe una forma estándar de distinguir un access token de un ID token: exige scopes o un issuer/audience que identifique los tokens de acceso de tu proveedor. [Referencia: authorizers JWT para HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html).

Por ejemplo, este comando crea un authorizer JWT para una HTTP API. Sustituye el issuer, el audience, el ID de API y el scope por los valores emitidos y configurados en tu entorno:

```bash
aws apigatewayv2 create-authorizer \
  --api-id "$API_ID" \
  --name orders-jwt \
  --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --jwt-configuration 'Audience=orders-app,Issuer=https://issuer.example'
```

Este ejemplo presupone una **HTTP API y una ruta ya creadas**, AWS CLI configurada con permisos para modificar esa API y los valores reales de tu proveedor de identidad. `API_ID` identifica el API; el resultado de `create-authorizer` devuelve el `AUTHORIZER_ID`. Asígnalo a una ruta existente; añade un scope solo si el token y la ruta usan ese permiso:

```bash
aws apigatewayv2 update-route \
  --api-id "$API_ID" \
  --route-id "$ROUTE_ID" \
  --authorization-type JWT \
  --authorizer-id "$AUTHORIZER_ID" \
  --authorization-scopes orders/read
```

Si la etapa tiene `AutoDeploy` desactivado, publica el cambio creando un deployment para esa etapa:

```bash
aws apigatewayv2 create-deployment \
  --api-id "$API_ID" \
  --stage-name "$STAGE"
```

La documentación de AWS detalla [cómo crear el authorizer y asociarlo a una ruta](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html), y [cómo se despliegan los cambios de una HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-stages.html). El authorizer JWT integrado admite algoritmos RSA; API Gateway puede conservar una clave pública en caché hasta dos horas, así que durante una rotación mantén un período en que las claves anterior y nueva sigan siendo válidas.

## Cinco controles que sí cambian el resultado

### 1. Valida identidad y permisos, no solo la forma del token

Un JWT decodificado no es un JWT verificado. Si implementas la validación dentro de Lambda, usa una biblioteca mantenida y verifica la firma con claves confiables del proveedor. Comprueba issuer, audience y expiración; valida scopes o permisos requeridos para la ruta. No aceptes un algoritmo o una clave elegidos por datos no confiables del propio token.

Prefiere el authorizer JWT de HTTP API cuando cubra el flujo de identidad. Si REST API o una regla propia requiere Lambda, implementa únicamente la validación que falte y prueba rechazos, expiración, claims incorrectos y rotación de claves. Envía tokens portadores en la cabecera `Authorization`, no en la URL: además de exponerlos en registros o historiales, un JWT largo en la ruta puede superar límites de longitud de los ARN usados en políticas de REST API. [Formato de respuesta y límites de authorizers REST](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-output.html).

### 2. Separa el permiso para invocar de los permisos de la función

Hay dos decisiones IAM distintas:

- API Gateway debe tener permiso para **invocar** la función authorizer. Concédelo mediante una política basada en recursos de Lambda o un rol que API Gateway pueda asumir; restringe el origen al API y al authorizer que correspondan.
- El rol de ejecución de Lambda determina qué servicios puede usar el código del authorizer. Si solo valida un JWT localmente, no necesita permiso para leer secretos, tablas u otros recursos. Si consulta un secreto o almacén de sesiones, concede únicamente las acciones y el ARN necesarios.

No confundas el rol de ejecución con el permiso de invocación. `AWSLambdaBasicExecutionRole` da a la función los permisos básicos para escribir logs en CloudWatch; [su política](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSLambdaBasicExecutionRole.html) no concede lectura de secretos ni acceso a datos. Tampoco añadas permisos amplios de Secrets Manager para guardar un token estático compartido: eso crea otra credencial que distribuir y proteger. AWS explica cómo [otorgar acceso a una función mediante políticas basadas en recursos](https://docs.aws.amazon.com/lambda/latest/dg/permissions-function-services.html).

### 3. Haz que la política y la clave de caché describan el mismo alcance

En una REST API, `TOKEN` usa como clave el token de la cabecera configurada. `REQUEST` puede combinar fuentes de identidad —por ejemplo, la cabecera y variables de contexto como método y ruta—; si el caché está activo, todas deben estar presentes y participan en la clave. La función devuelve una política IAM con `principalId` y recursos `execute-api:Invoke` permitidos.

En una HTTP API con Lambda, las fuentes de identidad también forman la clave. Una respuesta simple `isAuthorized: true` almacenada se aplica a todas las rutas que comparten esos valores. Si los permisos cambian por ruta, añade `$context.routeKey` como fuente de identidad o devuelve una política IAM que limite los recursos. En REST, la política almacenada también debe cubrir solo los métodos y recursos que el mismo conjunto de identidad puede usar; una política demasiado estrecha puede permitir la primera solicitud y causar `403` en otra ruta durante el TTL. AWS describe [las fuentes de identidad y el caché de HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html) y [las políticas de salida de REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-output.html).

No hay un TTL universalmente seguro. REST API usa 300 segundos si no se configura otro valor y permite hasta 3600; HTTP API Lambda permite `authorizerResultTtlInSeconds` de 0 a 3600. Un TTL de cero desactiva el caché. Elige el valor según cuánto tiempo puede seguir vigente una decisión después de que cambien los permisos: API Gateway no vuelve a ejecutar el authorizer mientras usa el resultado almacenado, de modo que una autorización en caché puede sobrevivir a una revocación o a la expiración del token hasta que venza ese resultado. Si necesitas comprobar revocaciones en cada solicitud, desactiva el caché.

Para una intervención operativa, AWS permite vaciar todas las entradas de authorizer de una etapa. Hazlo con cuidado: invalida decisiones de todos los clientes de esa etapa y puede aumentar las invocaciones a Lambda. No equivale a revocar un único token.

```bash
# REST API
aws apigateway flush-stage-authorizers-cache \
  --rest-api-id "$REST_API_ID" \
  --stage-name "$STAGE"

# HTTP API con Lambda authorizer
aws apigatewayv2 reset-authorizers-cache \
  --api-id "$HTTP_API_ID" \
  --stage-name "$STAGE"
```

`Cache-Control: max-age=0` se refiere a invalidar una entrada de la **caché de respuestas de integración** de REST API cuando el cliente tiene permiso. No es un bypass ni una invalidación del resultado de un Lambda authorizer. [AWS documenta por separado el vaciado del caché de authorizers REST](https://docs.aws.amazon.com/apigateway/latest/api/API_FlushStageAuthorizersCache.html), el [reinicio del caché de authorizers HTTP](https://docs.aws.amazon.com/apigatewayv2/latest/api-reference/apis-apiid-stages-stagename-cache-authorizers.html) y la [caché de respuestas de API](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html).

### 4. Distingue credenciales inválidas de fallos del authorizer

| Respuesta | REST API con Lambda authorizer | HTTP API con Lambda authorizer |
| --- | --- | --- |
| `401 Unauthorized` | Una fuente `REQUEST` requerida pero ausente devuelve 401 antes de invocar Lambda cuando el caché está activo. Para `TOKEN`, el authorizer puede devolver la respuesta/error especial `Unauthorized` para el caso no autenticado. | Una fuente de identidad configurada pero ausente devuelve 401 sin invocar Lambda. AWS también documenta la respuesta `{"errorMessage":"Unauthorized"}` para devolver 401 si no configuras identity sources. |
| `403 Forbidden` | Una política IAM `Deny` o que no concede el método y recurso solicitados rechaza la llamada. | Una política IAM `Deny` o una respuesta simple `isAuthorized: false` deniega la ruta; el resultado cacheado puede denegar otras rutas que compartan identidad. |
| `500 Internal Server Error` | Un error del authorizer que no sea la respuesta especial `Unauthorized`, un fallo de invocación o una salida inválida indica que la autorización no pudo completarse. | API Gateway no puede invocar Lambda, la función falla o devuelve un formato inválido. |

En una REST API, el authorizer devuelve una política y `principalId`. En HTTP API Lambda, el payload `1.0` devuelve política; `2.0` devuelve política o respuesta simple. No mezcles una respuesta simple con un authorizer o payload que espera política IAM. Un `401` o `403` puede tener otras causas de configuración en la API, así que usa los logs para confirmar el origen. [AWS documenta los formatos HTTP, identity sources y errores de invocación](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html).

### 5. Registra la decisión sin registrar la credencial

Activa access logs de API Gateway y los logs necesarios de Lambda en CloudWatch. Registra el ID de solicitud, ruta, resultado (permitir, denegar o error), latencia y un identificador de principal que no sea un secreto. No registres la cabecera `Authorization`, el JWT, secretos, el evento completo ni claims personales que no necesites. Un token escrito en un log puede seguir sirviendo como credencial mientras sea válido.

Para investigar fallos, REST API dispone de variables específicas como `$context.authorizer.error`, `$context.authorizer.status` y `$context.authorizer.latency`. HTTP API ofrece `$context.authorizer.error`, `$context.requestId`, `$context.status` y `$context.responseLatency`; mide la duración de la función con métricas o logs de Lambda. Inclúyelas solo en un formato de logs controlado y evita guardar campos sensibles de la solicitud. [Variables de logging para REST](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-variables-for-access-logging.html) y [para HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging-variables.html).

## Preguntas frecuentes

### ¿300 segundos es el TTL recomendado?

No. En REST API es el valor predeterminado cuando no se especifica otro, no una recomendación para todas las aplicaciones. Ajusta el TTL a la ventana de revocación tolerable y al tiempo de vida de las credenciales. Usa cero si cada solicitud debe volver a consultar el estado de autorización.

### ¿Puedo invalidar un solo resultado del caché de authorizers?

Los comandos documentados para REST y HTTP vacían todas las entradas de la etapa indicada. Si necesitas revocación inmediata de una identidad sin afectar a otras, no dependas de una entrada cacheada: desactiva el caché o diseña la autorización para comprobar el estado actualizado en cada solicitud.

### ¿Qué contenido conviene pasar en `context`?

Solo datos mínimos y no secretos que la integración necesite, como un identificador interno de principal o tenant y permisos ya calculados. El contexto puede llegar a la integración y a los logs; no lo uses para devolver tokens ni credenciales.

## Sigue aprendiendo y participa

Si recién estás aprendiendo AWS, esta [guía inicial de AWS](/blog/aws-aprender-guia-inicial/) repasa IAM, MFA y credenciales temporales antes de entrar a los authorizers. Como complemento práctico, el [repositorio aws-iam-security-lab](https://github.com/JonasCC8/aws-iam-security-lab) describe un ejercicio con MFA y una política acotada a un bucket de S3; practica IAM general, no implementa ni prueba Lambda authorizers.

Para conversar sobre controles de acceso y seguridad en AWS, el [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/) conecta a personas hispanohablantes, y el [canal regional @AWSSecurityLATAM](https://www.youtube.com/@AWSSecurityLATAM) publica grabaciones sobre seguridad, respuesta a incidentes y cumplimiento.

La comunidad [AWS Women Colombia](https://awswomencolombia.com/) comparte charlas técnicas en español; puedes explorar su [archivo de eventos y grabaciones](https://awswomencolombia.com/page/eventos) y su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw), que incluye sesiones de seguridad.

### Eventos anunciados al 4 de octubre de 2026

- El [AWS & Cloud Native Security Night de AWS User Group Security Ecuador](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/) figura para el 23 de octubre, de 17:00 a 20:00 GMT-5, presencial en Guayaquil. Su ficha anuncia seguridad de Kubernetes e imágenes de contenedores, entrada gratuita y cupos limitados; no es una sesión sobre API Gateway, pero permite conocer a una comunidad enfocada en seguridad de AWS.
- El [AWS Community Day Panamá — Security & Data Edition 2026](https://www.meetup.com/aws-user-group-panama/events/316732293/) figura para el 14 de noviembre, de 08:00 a 13:00 GMT-5, presencial. La ubicación aún se indica como pendiente de confirmar en Meetup; revisa allí lugar, cupos y condiciones antes de planificar el viaje.

Las agendas y condiciones pueden cambiar. Consulta la ficha del organizador y la [agenda de próximos eventos AWS](/eventos/) para ver qué sigue después de esas fechas; también puedes encontrar un grupo por país en el [directorio de comunidades](/comunidades/) o canales técnicos en el [directorio de creadores](/creadores/).
