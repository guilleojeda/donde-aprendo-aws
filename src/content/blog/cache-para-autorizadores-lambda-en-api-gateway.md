---
title: "Caché de autorizadores Lambda en API Gateway: TTL y permisos"
description: "Configura el caché de Lambda authorizers en REST API y HTTP API: identity sources, alcance de políticas, TTL, errores 401/403/500 y vaciado por etapa."
author: "guille-ojeda"
publishedAt: "2024-11-28"
publishedTimestamp: "2024-11-28T00:05:44.586Z"
modifiedTimestamp: "2026-10-05T20:31:27-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Lambda authorizers: seguridad, JWT y caché en API Gateway"
    url: "https://dondeaprendoaws.com/blog/5-practicas-de-seguridad-para-lambda-authorizers/"
  - title: "AWS Lambda y API Gateway: crea una HTTP API paso a paso"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/"

---

Si activas el caché del resultado de un autorizador Lambda (Lambda authorizer), API Gateway reutiliza una decisión de autorización durante un TTL y evita invocar la función para solicitudes que tienen la misma clave. La clave debe representar el alcance real del permiso: si una decisión depende de la ruta, el método, el tenant o el token, esos datos deben participar en la clave o la política debe cubrir todas las rutas que puedan reutilizarla.

Hay tres mecanismos que suelen confundirse:

| Mecanismo | Dónde existe | Qué guarda | Cómo se vacía |
| --- | --- | --- | --- |
| Caché del resultado del Lambda authorizer | REST API y HTTP API con authorizer Lambda | La política IAM o la respuesta simple del authorizer | Vaciado de authorizers de una etapa |
| Caché de respuestas de API Gateway | REST API | La respuesta de la integración | Es un caché de respuestas distinto |
| Caché de claves públicas del authorizer JWT | HTTP API con authorizer JWT integrado | Claves del `jwks_uri` para verificar firmas | Depende de la rotación y del caché de claves |

El ajuste **Cache settings** de una etapa configura el segundo mecanismo, que AWS documenta como [caché de respuestas para REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html). No activa ni invalida el resultado de un Lambda authorizer. Del mismo modo, `Cache-Control: max-age=0` se relaciona con la caché de respuestas de REST API cuando el cliente tiene permiso para invalidarla; no fuerza a ejecutar el authorizer.

## REST API y HTTP API no funcionan igual

Antes de elegir un TTL, identifica el tipo de API:

| API | Authorizers relacionados | Entrada y respuesta | Consecuencia para el caché |
| --- | --- | --- | --- |
| REST API | Lambda `TOKEN` o `REQUEST` | El authorizer devuelve `principalId` y una política IAM | El resultado cacheado debe poder evaluarse en todas las rutas que compartan la clave |
| HTTP API | Lambda `REQUEST` | Payload `1.0` devuelve política IAM; payload `2.0` puede devolver política o una respuesta simple si se habilita | La respuesta simple permite o deniega todas las rutas que compartan sus identity sources |
| HTTP API | JWT integrado | API Gateway valida el JWT; no invoca una función Lambda | No tiene el caché de resultado de Lambda; puede conservar cada clave pública del issuer hasta dos horas, como máximo y de forma no garantizada |

Un authorizer JWT integrado solo está disponible para HTTP API. API Gateway verifica la firma RSA y los claims configurados, como `iss`, `aud` o `client_id`, `exp`, `nbf`, `iat` y los scopes de la ruta. AWS indica que cada clave pública puede permanecer en caché hasta dos horas de forma no garantizada; cuando no está disponible, API Gateway la solicita al issuer y esa solicitud puede añadir latencia. Durante una rotación, planifica un período en que las claves anterior y nueva sean válidas. La [documentación del authorizer JWT para HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html) también advierte que no hay un mecanismo estándar para distinguir un access token de un ID token; exige scopes, issuer o audience que identifiquen el tipo de token.

Si necesitas consultar una sesión, una lista de revocación o una regla propia, usa un Lambda authorizer. Si solo necesitas validar un JWT estándar en una HTTP API, el authorizer JWT integrado evita mantener esa lógica en Lambda. La [comparación oficial entre REST API y HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html) ayuda a comprobar qué capacidades pertenecen a cada tipo. No mezcles sus respectivos parámetros: `authorizerResultTtlInSeconds` pertenece al caché de authorizers Lambda, no a la validación del JWT integrado.

## Las identity sources forman la clave

Una identity source indica de dónde obtiene API Gateway un valor que identifica la solicitud. Cuando el caché está activo, los valores configurados forman la clave en el orden definido.

En una REST API, las expresiones de mapeo tienen esta forma:

```text
method.request.header.Authorization
method.request.querystring.tenantId
stageVariables.environment
context.httpMethod
context.path
```

`TOKEN` toma como clave el valor del encabezado configurado como token source, por ejemplo el valor de `method.request.header.Authorization`. Por eso, dos solicitudes solo comparten decisión cuando presentan el mismo valor de token en ese encabezado; no existe una clave común para todos los tokens. `REQUEST` puede combinar headers, query strings, variables de etapa y variables `$context`; AWS muestra como ejemplos `$context.path` y `$context.httpMethod`. Si el caché de un `REQUEST` está activo y falta una identity source, su valor es nulo o está vacío, API Gateway devuelve `401` sin invocar Lambda.

En una HTTP API con Lambda authorizer, las expresiones usan la sintaxis de API Gateway v2:

```text
$request.header.Authorization
$request.querystring.tenantId
$stageVariables.environment
$context.routeKey
```

Los nombres de headers no distinguen mayúsculas y minúsculas; los nombres de query string sí. Una identity source ausente también produce `401` sin invocar el authorizer. Para una clave por ruta, agrega `$context.routeKey`. Sin esa variable, API Gateway puede reutilizar el mismo resultado en todas las rutas de la API que usan ese authorizer.

No agregues valores solo para hacer una clave más larga. Añade cada dato que pueda cambiar el permiso y elimina los que no intervienen en la decisión. Por ejemplo, si la función autoriza a una identidad verificada para un tenant y por método HTTP, una clave razonable puede incluir el token, `tenantId` y `$context.routeKey`; la función debe vincular ese tenant con claims o estado confiable, no aceptar como prueba el `tenantId` que envía el cliente. Si el permiso no depende del tenant, incluirlo fragmenta el caché sin aportar aislamiento.

## La política debe tener el mismo alcance que la clave

En REST API, una respuesta de Lambda authorizer debe contener un `principalId` y una política con la acción `execute-api:Invoke`. El ARN de un método tiene esta forma:

```text
arn:aws:execute-api:REGION:ACCOUNT:API_ID/STAGE/HTTP_METHOD/PATH
```

Cuando una misma identidad puede acceder a varias rutas, la política debe cubrirlas. Un patrón común para permitir todos los métodos y rutas de una etapa es:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "execute-api:Invoke",
      "Effect": "Allow",
      "Resource": "arn:aws:execute-api:REGION:ACCOUNT:API_ID/STAGE/*/*"
    }
  ]
}
```

Los valores son marcadores; reemplázalos por los identificadores de la API. Este `Allow` amplio solo es correcto si esa identidad está autorizada para todos los métodos y rutas de la etapa; para acceso parcial, lista únicamente los recursos permitidos y diseña la clave para ese alcance. El formato y los comodines se describen en [la salida de un Lambda authorizer para REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-output.html). Una política que devuelve únicamente el primer `methodArn` puede autorizar una solicitud y producir `403` en otra ruta mientras la primera decisión siga cacheada.

Si necesitas una política específica por método o recurso en REST API, tienes dos opciones: incorpora método y ruta a las identity sources de un `REQUEST` authorizer, o desactiva el caché y evalúa cada solicitud. Con una clave que no distingue rutas, una política estrecha no expresa correctamente lo que API Gateway está cacheando.

En HTTP API, payload `2.0` con `enableSimpleResponses` devuelve una forma como `{ "isAuthorized": true }`. Esa decisión se aplica a todas las rutas que coincidan con los valores cacheados. Para granularidad por ruta, añade `$context.routeKey` o desactiva las respuestas simples y devuelve una política IAM en el formato esperado. Con payload `1.0`, usa una política IAM; con `2.0`, confirma en la configuración si la respuesta esperada es política o simple antes de cambiar el código.

## TTL, expiración y revocación

El TTL del resultado indica cuánto tiempo puede reutilizarse la decisión del authorizer; no cambia el `exp` de un JWT ni alarga la vida de una sesión en el proveedor de identidad.

| Configuración | Valor documentado |
| --- | --- |
| REST API Lambda authorizer | Predeterminado de 300 segundos si no se especifica; máximo de 3600 segundos; `0` desactiva el caché |
| HTTP API Lambda authorizer | `0` desactiva el caché; el máximo es 3600 segundos |
| HTTP API JWT integrado | Valida `exp` en cada autorización; cada clave pública del issuer puede permanecer en caché hasta dos horas, de forma no garantizada |

Un TTL de `86400` no es válido para el resultado de un Lambda authorizer: supera el máximo de una hora. Tampoco existe un TTL universalmente seguro. Elige una ventana que tu aplicación pueda tolerar si cambian permisos, se deshabilita un usuario o se revoca un token. Cuando la decisión debe consultar el estado actual en cada solicitud, usa `0` o diseña el authorizer para no depender de una decisión cacheada.

Para un Lambda authorizer, la función es quien debe validar la firma y los claims del JWT. Si API Gateway guarda un `Allow`, esa respuesta puede reutilizarse hasta que venza el TTL aunque la función ya rechazaría el token. Un `exp` correcto dentro de la función no convierte el caché en una comprobación por solicitud. Si necesitas que una revocación tenga efecto inmediato, desactiva el caché o invalida el caché de la etapa completa después de confirmar el cambio.

El authorizer JWT integrado sí comprueba `exp`, `nbf` e `iat` junto con la firma y el resto de claims configurados. La [validación documentada](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html) no consulta una lista de revocación por usuario. Por eso, si un proveedor revoca un token firmado antes de su expiración, la revocación no se vuelve visible automáticamente para API Gateway mientras el token siga pasando las validaciones configuradas. Para ese requisito, usa un mecanismo de introspección o un Lambda authorizer con una estrategia de estado actualizada.

## Qué significan 401, 403 y 500

El código ayuda a ubicar el tramo que falló, pero confirma la causa en los logs del authorizer y en los access logs de la etapa:

| Código | Causa habitual en un Lambda authorizer | Qué revisar |
| --- | --- | --- |
| `401 Unauthorized` | Falta una identity source requerida, o el authorizer devuelve el error especial `Unauthorized` | Header/query string, expresión de identidad y validación de credenciales |
| `403 Forbidden` | La política devuelve `Deny` o no permite el método y recurso solicitados | `Resource`, `Effect`, alcance de la política y reutilización de una respuesta cacheada |
| `500 Internal Server Error` | API Gateway no puede invocar Lambda, la función falla o devuelve un formato inválido | Permiso de invocación, errores de Lambda, payload `1.0`/`2.0` y formato de respuesta |

En REST API, `TOKEN` puede producir `401` cuando la función responde `Unauthorized`; otro error de la función se documenta como `500`. En HTTP API, una función puede devolver `{"errorMessage":"Unauthorized"}` para producir `401` cuando no se configuraron identity sources. En ambos tipos, un `Deny` es una decisión válida y se traduce en `403`; no es lo mismo que un authorizer roto. Consulta [la guía de Lambda authorizers para REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html) y [la guía de HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html) para los formatos de cada flujo.

No registres `Authorization`, el JWT completo ni el evento sin filtrar. En los access logs puedes incluir un identificador de solicitud, la ruta, el status y `$context.authorizer.error`; en REST API también puedes consultar [las variables de logging del authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-variables-for-access-logging.html). En Lambda, registra una decisión y un identificador no secreto que permitan correlacionar la solicitud sin convertir CloudWatch Logs en otro almacén de credenciales.

## Cómo activar o ajustar el caché

El TTL se configura en el **authorizer**, no en **Cache settings** de la etapa. Antes de cambiarlo, confirma que las identity sources cubran todos los datos que cambian la decisión, que la función devuelve el formato correspondiente y que API Gateway tiene permiso para invocar Lambda.

En REST API, `TOKEN` necesita una sola fuente de identidad; `REQUEST` necesita una o más cuando el caché está activo. La [referencia de `update-authorizer` para REST API](https://docs.aws.amazon.com/cli/latest/reference/apigateway/update-authorizer.html) usa operaciones de parche. Esta referencia ajusta una `REQUEST` con header, método y ruta, y fija cinco minutos de TTL:

```bash
aws apigateway update-authorizer \
  --rest-api-id "$REST_API_ID" \
  --authorizer-id "$AUTHORIZER_ID" \
  --patch-operations '[
    {
      "op": "replace",
      "path": "/identitySource",
      "value": "method.request.header.Authorization,context.httpMethod,context.path"
    },
    {
      "op": "replace",
      "path": "/authorizerResultTtlInSeconds",
      "value": "300"
    }
  ]'
```

Para desactivar el caché en REST API, cambia solo `authorizerResultTtlInSeconds` a `0`. No uses esa identity source de tres partes en un `TOKEN` authorizer; elige el tipo correcto antes de aplicar el cambio.

En HTTP API, el mismo ajuste usa `update-authorizer` de API Gateway v2 y una lista de expresiones. `$context.routeKey` hace que la decisión se separe por ruta; omítelo solo si una decisión común para todas las rutas es intencional:

```bash
aws apigatewayv2 update-authorizer \
  --api-id "$HTTP_API_ID" \
  --authorizer-id "$AUTHORIZER_ID" \
  --authorizer-result-ttl-in-seconds 300 \
  --identity-source '$request.header.Authorization' '$context.routeKey'
```

El `--identity-source` de HTTP API se configura como lista y solo admite estas expresiones para un authorizer `REQUEST`; `authorizerResultTtlInSeconds` no aplica al authorizer JWT integrado. La [referencia de `update-authorizer` para API Gateway v2](https://docs.aws.amazon.com/cli/latest/reference/apigatewayv2/update-authorizer.html) documenta ambos parámetros. Después de una actualización, vuelve a ejecutar `get-authorizer`, despliega la REST API si cambiaste la configuración de identidad y prueba una ruta permitida y otra denegada con credenciales de prueba.

## Cómo inspeccionar y vaciar el caché por etapa

El cambio de una función Lambda no borra por sí solo una decisión ya cacheada. Antes de tocar una etapa, identifica el tipo de API y revisa la configuración con una operación de lectura:

```bash
# REST API: inspecciona el authorizer y su TTL
aws apigateway get-authorizer \
  --rest-api-id "$REST_API_ID" \
  --authorizer-id "$AUTHORIZER_ID"

# HTTP API: inspecciona el authorizer y su TTL
aws apigatewayv2 get-authorizer \
  --api-id "$HTTP_API_ID" \
  --authorizer-id "$AUTHORIZER_ID"
```

Si confirmas que la etapa debe descartar todas las decisiones, AWS expone una operación distinta para cada API. Ambas requieren permisos de escritura y tienen alcance amplio:

```bash
# REST API: vacía todas las entradas de authorizer de la etapa
aws apigateway flush-stage-authorizers-cache \
  --rest-api-id "$REST_API_ID" \
  --stage-name "$STAGE"

# HTTP API con Lambda authorizer: reinicia todas las entradas de la etapa
aws apigatewayv2 reset-authorizers-cache \
  --api-id "$HTTP_API_ID" \
  --stage-name "$STAGE"
```

`flush-stage-authorizers-cache` solo actúa sobre una REST API. `reset-authorizers-cache` solo está soportado para Lambda authorizers de HTTP API; no es un comando para el authorizer JWT integrado. En ambos casos se vacían todas las entradas de la etapa: no hay una operación documentada para invalidar únicamente un token. La [API REST de vaciado de authorizers](https://docs.aws.amazon.com/apigateway/latest/api/API_FlushStageAuthorizersCache.html) devuelve `202`; la [API de caché de authorizers de API Gateway v2](https://docs.aws.amazon.com/apigatewayv2/latest/api-reference/apis-apiid-stages-stagename-cache-authorizers.html) describe el reinicio por etapa y su respuesta `204`.

Si cambias las partes de una clave de `REQUEST` en REST API, despliega la API después del cambio: AWS indica en su [guía de Lambda authorizers para REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html) que al cambiar una parte de la clave y desplegar se descarta la política cacheada correspondiente. Después de modificar una política, una fuente de identidad o una regla de revocación, verifica primero una solicitud de prueba con un token ficticio y revisa el resultado en logs. No uses `Cache settings` de la etapa ni `Cache-Control: max-age=0` para este procedimiento; pertenecen a la caché de respuestas.

## Recursos para seguir practicando

Estos recursos tienen objetivos distintos y conviene mantener esa distinción:

- [Agregar Autorización a Api Gateway HTTP](https://dev.to/cecamilo/agregar-autorizacion-a-api-gateway-http-4non) es un artículo en español del catálogo público sobre autorización en HTTP API. Úsalo para comparar un flujo comunitario con el payload y la configuración que hayas elegido; revisa el tipo de authorizer y las condiciones del ejemplo antes de copiarlo.
- [Ejemplo de caché en API Gateway con AWS CDK](https://github.com/hsaenzG/APIGatewayCacheImplementation-CDK) es una herramienta del catálogo con caché a nivel de endpoint. Sirve para contrastar el caché de respuestas con el caché de decisiones explicado aquí; no lo trates como un ejemplo de caché de Lambda authorizers.
- [Observabilidad en la Nube de AWS](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m) recorre CloudWatch, X-Ray y CloudTrail. Puede ayudarte a separar un `500` del authorizer de un error posterior de integración.
- [El laboratorio de IAM en español](https://github.com/JonasCC8/aws-iam-security-lab) practica usuarios, políticas y permisos. Es una base útil para leer `Allow`, `Deny` y recursos ARN, pero no implementa un Lambda authorizer.
- El [canal de AWS Security Users Group LatAm](https://www.youtube.com/@AWSSecurityLATAM) reúne grabaciones en español sobre seguridad de AWS, respuesta a incidentes y cumplimiento. Puede servir para seguir conversaciones de seguridad después de aplicar los controles de autorización; comprueba el contenido de cada sesión.
- [Desplegando.cloud](https://desplegando.substack.com/) publica una newsletter y un pódcast de Marcia Villalba con novedades de AWS, serverless, herramientas y experiencias en español. Es una fuente para seguir cambios del ecosistema; las condiciones de suscripción y cada publicación dependen de su autora.

Para continuar en español, el [directorio de recursos para aprender](/aprender/) permite filtrar por Serverless y Seguridad; el [directorio de creadores](/creadores/) reúne canales, blogs y pódcast; el [directorio de comunidades](/comunidades/) permite localizar grupos y sus enlaces de participación; y la [agenda de eventos AWS](/eventos/) muestra modalidad, horario y registro de actividades anunciadas. Las condiciones dependen de cada autor, comunidad u organizador.

Al revisar el catálogo y la agenda el 5 de octubre de 2026, el [AWS & Cloud Native Security Night](https://www.meetup.com/aws-user-group-security-ecuador/events/316815633/) figura para el 23 de octubre, de 17:00 a 20:00 GMT-5, presencial en Guayaquil, organizado por AWS User Group Security Ecuador. La ficha anuncia seguridad de Kubernetes e imágenes de contenedores; no es una sesión específica sobre API Gateway, pero puede ser un punto de contacto para conversar sobre controles de seguridad. Consulta la ficha antes de planificar: fecha, lugar y condiciones pueden cambiar.

## Preguntas frecuentes

### ¿El TTL predeterminado es una recomendación de seguridad?

No. En REST API, 300 segundos es el valor predeterminado documentado cuando no especificas otro. El valor adecuado depende de cuánto tiempo puede seguir vigente una decisión después de cambiar permisos o revocar credenciales. El máximo documentado es 3600 segundos; 86400 no es válido.

### ¿Puedo usar `Cache-Control: max-age=0` para revalidar el authorizer?

No. Ese encabezado se usa para invalidar una respuesta de la caché de REST API en las condiciones documentadas. No invalida una política ni una respuesta simple de Lambda authorizer.

### ¿Cómo revoco un único token sin afectar a toda la etapa?

El vaciado documentado de REST API y HTTP API es por etapa. Para una revocación individual inmediata, no dependas de una decisión cacheada: usa TTL `0` o un authorizer que consulte el estado de revocación en cada solicitud. Si la revocación tolera una ventana, mantén el TTL dentro de esa ventana.

### ¿Cuándo conviene un authorizer JWT en lugar de Lambda?

En una HTTP API, elige JWT cuando necesitas validación estándar de firma, issuer, audience, expiración y scopes. Elige Lambda cuando debes consultar estado externo o aplicar una regla que no expresa la configuración JWT. REST API no ofrece ese authorizer JWT integrado; allí puedes usar `TOKEN`, `REQUEST` u otros mecanismos compatibles.
