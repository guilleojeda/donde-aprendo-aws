---
title: "Cómo configurar CORS en HTTP API de API Gateway"
description: "Configura CORS en HTTP API (v2) con AWS CLI y entiende preflight OPTIONS, rutas $default con autorización, credenciales y errores del navegador."
author: "guille-ojeda"
publishedAt: "2025-03-10"
publishedTimestamp: "2025-03-10T05:50:46.65Z"
modifiedTimestamp: "2026-10-06T13:57:35-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS Lambda y API Gateway: crea una HTTP API paso a paso"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/"
  - title: "Lambda authorizers: seguridad, JWT y caché en API Gateway"
    url: "https://dondeaprendoaws.com/blog/5-practicas-de-seguridad-para-lambda-authorizers/"
review:
  date: "2026-10-06"
---

Para que una página web lea una respuesta de una HTTP API de Amazon API Gateway alojada en otro origen, configura CORS en la API. En una **HTTP API (API Gateway v2)**, API Gateway puede responder automáticamente a las solicitudes preflight `OPTIONS` y añadir las cabeceras CORS configuradas a las respuestas de la integración. Si tu API usa una ruta `$default` con autorizador, agrega además una ruta `OPTIONS /{proxy+}` sin autorización para que el preflight no quede bloqueado.

CORS es una regla que aplica el navegador: decide si el código de una página puede leer una respuesta de otro origen. No autentica al usuario ni reemplaza la autorización de la API; una llamada hecha con `curl` o desde otro servidor no está sujeta a esa regla del navegador. Un origen incluye protocolo, host y puerto, por lo que `https://app.example.com` y `http://app.example.com` son distintos. [MDN explica el modelo CORS del navegador](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

## Qué configura CORS en una HTTP API

La configuración CORS de la API define qué origen puede leer la respuesta, qué métodos puede enviar el navegador, qué cabeceras puede incluir la solicitud y, si corresponde, qué cabeceras de respuesta puede leer el código. Para HTTP APIs, AWS documenta estos ajustes en la [guía de CORS de API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html).

| Propiedad de API Gateway | Cabecera CORS | Para qué sirve |
| --- | --- | --- |
| `AllowOrigins` | `Access-Control-Allow-Origin` | Orígenes web permitidos, con protocolo y host. |
| `AllowMethods` | `Access-Control-Allow-Methods` | Métodos de la solicitud real, por ejemplo `GET` o `POST`. |
| `AllowHeaders` | `Access-Control-Allow-Headers` | Cabeceras que el navegador puede enviar, por ejemplo `content-type` o `authorization`. |
| `ExposeHeaders` | `Access-Control-Expose-Headers` | Cabeceras de respuesta que el JavaScript podrá consultar. |
| `AllowCredentials` | `Access-Control-Allow-Credentials` | Permite que el navegador comparta la respuesta de una solicitud con credenciales. |
| `MaxAge` | `Access-Control-Max-Age` | Segundos durante los que el navegador puede reutilizar el resultado del preflight. |

No agregues `OPTIONS` a `AllowMethods` solo porque el navegador envía un preflight `OPTIONS`: esa lista debe permitir el método de la **solicitud real** que el preflight está comprobando, como `POST`. La ruta `OPTIONS` que se necesita en el caso especial de `$default` es una regla de enrutamiento de API Gateway y cumple otra función.

## Preflight: qué ocurre antes de la solicitud real

Algunas solicitudes cross-origin necesitan una comprobación previa. Por ejemplo, el navegador suele hacer preflight para una llamada `POST` con `Content-Type: application/json` o una cabecera `Authorization`. Envía `OPTIONS` con `Origin`, `Access-Control-Request-Method` y, si corresponde, `Access-Control-Request-Headers`. Si la respuesta no autoriza el origen, el método y las cabeceras solicitadas, el navegador no envía la solicitud real.

Las solicitudes simples pueden no tener preflight. En ese caso, el navegador envía la solicitud y luego decide si permite que JavaScript lea la respuesta. Por eso, no encontrar una llamada `OPTIONS` en las herramientas de desarrollo no demuestra por sí mismo que CORS esté configurado mal.

Cuando defines CORS en una HTTP API, API Gateway responde automáticamente a preflight `OPTIONS`, incluso si no creaste una ruta OPTIONS, y agrega las cabeceras configuradas a las respuestas de la integración. También **ignora las cabeceras CORS que devuelva esa integración**. Esto evita mantener dos configuraciones distintas: administra CORS en API Gateway o, si no lo configuras allí, haz que la integración genere las cabeceras necesarias. [AWS detalla ambos comportamientos](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html).

## Configurar CORS desde la consola o AWS CLI

En la consola, abre tu HTTP API en API Gateway y edita su sección **CORS**. Permite solo los orígenes, métodos y cabeceras que necesita el cliente web. Si no vas a enviar cookies de navegador, deja desactivadas las credenciales.

Para aplicar el mismo cambio con AWS CLI, crea un archivo `cors.json`:

```json
{
  "AllowOrigins": ["https://app.example.com"],
  "AllowMethods": ["GET", "POST"],
  "AllowHeaders": ["content-type", "authorization"],
  "ExposeHeaders": ["x-request-id"],
  "MaxAge": 300,
  "AllowCredentials": false
}
```

Con una identidad de AWS CLI autorizada, selecciona la región y el ID de la HTTP API existente y aplica el archivo:

```bash
export AWS_REGION="us-east-1"
export API_ID="abc123"

aws apigatewayv2 update-api \
  --api-id "$API_ID" \
  --region "$AWS_REGION" \
  --cors-configuration file://cors.json \
  --no-cli-pager
```

El comando modifica la configuración de esa API. Verifica el resultado con `get-api` antes de probar desde la aplicación:

```bash
aws apigatewayv2 get-api \
  --api-id "$API_ID" \
  --region "$AWS_REGION" \
  --query CorsConfiguration \
  --output json \
  --no-cli-pager
```

Las propiedades del JSON (`AllowOrigins`, `AllowMethods` y las demás) corresponden a la estructura que acepta [`update-api` para HTTP APIs](https://docs.aws.amazon.com/cli/latest/reference/apigatewayv2/update-api.html). Usa `apigatewayv2`: `apigateway` es el conjunto de comandos para REST API y su configuración no es intercambiable.

Los cambios llegan a las etapas automáticamente si tienen `AutoDeploy` activado. Compruébalo con [`get-stages`](https://docs.aws.amazon.com/cli/latest/reference/apigatewayv2/get-stages.html): `aws apigatewayv2 get-stages --api-id "$API_ID" --region "$AWS_REGION"`. Si la etapa que usas no despliega automáticamente, publica la nueva configuración en esa etapa:

```bash
export STAGE="prod"

aws apigatewayv2 create-deployment \
  --api-id "$API_ID" \
  --stage-name "$STAGE" \
  --region "$AWS_REGION" \
  --no-cli-pager
```

AWS explica que las etapas HTTP con despliegue automático reciben los cambios enseguida y las demás necesitan un despliegue. Consulta [etapas de HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-stages.html) y el comando [`create-deployment`](https://docs.aws.amazon.com/cli/latest/reference/apigatewayv2/create-deployment.html).

### Si `$default` tiene autorización

La ruta `$default` recibe métodos y rutas que no tienen una coincidencia más específica, incluidas solicitudes `OPTIONS`. Si esa ruta tiene autorizador, el preflight normalmente llega sin la identidad o credencial que requiere la ruta real. AWS indica crear una ruta `OPTIONS /{proxy+}` sin autorización y asociarle una integración; esta ruta tiene prioridad sobre `$default`.

El siguiente ejemplo supone que ya existe una integración para la HTTP API, que `INTEGRATION_ID` es su identificador y que aún no existe esa ruta. Si el cliente llama a la ruta raíz `/`, crea también una ruta `OPTIONS /` sin autorización.

```bash
export INTEGRATION_ID="abc456"

aws apigatewayv2 create-route \
  --api-id "$API_ID" \
  --route-key 'OPTIONS /{proxy+}' \
  --authorization-type NONE \
  --target "integrations/$INTEGRATION_ID" \
  --region "$AWS_REGION" \
  --no-cli-pager
```

No asocies un autorizador a esta ruta OPTIONS. El ejemplo se basa en las opciones de [`create-route`](https://docs.aws.amazon.com/cli/latest/reference/apigatewayv2/create-route.html) y en la [prioridad de rutas de HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-routes.html). Si la ruta ya existe, edita esa ruta en vez de intentar crear un duplicado.

Para un recorrido desde cero —crear una función, integrarla y exponer una ruta— consulta la [guía para construir una HTTP API con Lambda](https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/). Este artículo se concentra en CORS y no requiere crear una API nueva.

## Credenciales y orígenes permitidos

Si la aplicación debe enviar cookies del navegador, establece `AllowCredentials` en `true` en `cors.json`, vuelve a aplicar `update-api` y usa `credentials: "include"` en `fetch`:

```javascript
const respuesta = await fetch("https://api.example.com/perfil", {
  credentials: "include"
});
```

En este caso, indica el origen concreto en `AllowOrigins`; la respuesta no puede usar `Access-Control-Allow-Origin: *` para una solicitud con credenciales. Mantén también listas explícitas de métodos y cabeceras. CORS solo permite que el navegador comparta la respuesta: la API todavía debe validar la sesión y autorizar la operación. Si usas una cabecera `Authorization: Bearer …`, incluye `authorization` en `AllowHeaders`; enviar esa cabecera no significa por sí solo que debas habilitar cookies con `AllowCredentials`. Las reglas de cookies `SameSite`, `Secure` y el bloqueo de cookies de terceros del navegador también siguen aplicando. Consulta las [reglas de credenciales y comodines de MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#requests_with_credentials).

`MaxAge` controla durante cuánto tiempo el navegador puede reutilizar el permiso del preflight; no almacena la respuesta de negocio. Un valor de `300` significa 300 segundos. El navegador puede aplicar sus propios límites a ese tiempo.

Si quieres profundizar en las decisiones de autorización, consulta la guía interna sobre [seguridad, JWT y caché de Lambda authorizers](https://dondeaprendoaws.com/blog/5-practicas-de-seguridad-para-lambda-authorizers/). Para comparar este flujo HTTP con WebSocket y el chequeo de origen durante el handshake, revisa [CORS y seguridad al elegir entre REST y WebSocket en API Gateway](https://dondeaprendoaws.com/blog/cors-en-websocket-vs-rest-api-gateway/).

Como material comunitario para seguir con seguridad de API Gateway, el AWS User Group Medellín comparte la charla [«Domina la seguridad de tus APIs con API Gateway»](https://www.youtube.com/watch?v=0Hm94rAe3fU). Si el siguiente paso es estudiar autenticación con Cognito en una arquitectura distinta, [«APIs avanzadas en AWS con API Gateway, FastAPI y Cognito»](https://www.youtube.com/watch?v=s-BrAa-dIfQ) recorre ese diseño con REST APIs, FastAPI y Cognito.

## Diagnosticar un error CORS

1. Abre **Network/Red** y **Console/Consola** en las herramientas de desarrollo del navegador. Identifica si falló `OPTIONS` o la solicitud real; una solicitud simple puede no tener preflight.
2. En `OPTIONS`, revisa el código HTTP y compara `Origin`, `Access-Control-Request-Method` y `Access-Control-Request-Headers` con la configuración de CORS. El `Origin` debe coincidir exactamente, incluido `https` y cualquier puerto.
3. Si `OPTIONS` responde `401` o `403` en una API con `$default`, revisa si esa ruta está capturando el preflight; agrega o corrige `OPTIONS /{proxy+}` sin autorización.
4. Si el preflight permite la llamada pero falla la solicitud real, revisa las cabeceras CORS de esa respuesta, el estado y los registros de la integración. Con CORS configurado en HTTP API, API Gateway agrega sus valores e ignora los valores del backend.
5. Si `curl` funciona y el navegador no, recuerda que `curl` no aplica CORS. Repite la comprobación en el navegador y verifica el origen real de la página, la URL de API, las credenciales y el método que se envía.

Puedes inspeccionar el preflight con `curl` sin crear recursos:

```bash
curl -i -X OPTIONS "https://API_ID.execute-api.AWS_REGION.amazonaws.com/recurso" \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization'
```

Reemplaza la URL por el endpoint real de tu API e incluye el nombre de etapa en la ruta si no usas una etapa `$default`. En la respuesta, comprueba que `Access-Control-Allow-Origin` corresponda al origen permitido, que `Access-Control-Allow-Methods` incluya `POST` y que `Access-Control-Allow-Headers` incluya las cabeceras solicitadas. `curl` muestra lo que respondió el servidor; no puede confirmar que un navegador permita leer la respuesta.

## Aprende y practica con la comunidad

Si estás en Ciudad de México, [Cloud Builders 04 del AWS Student Builder Group de la Universidad Panamericana](https://www.meetup.com/aws-sbg-at-pan-american-university-cdmx/events/316387395/) anuncia una práctica híbrida para construir una API con Lambda, API Gateway y DynamoDB el **8 de octubre de 2026, de 17:00 a 19:00 (hora de Ciudad de México)**. La página consultada indica acceso gratuito y 30 lugares presenciales; verifica allí la disponibilidad, el formato y las condiciones de inscripción antes de asistir. La sesión practica la creación de una API, no la configuración de CORS.

Para seguir charlas virtuales sobre AWS y serverless, puedes visitar el [AWS User Group Serverless Colombia en Meetup](https://www.meetup.com/aws-user-group-serverless-colombia/). Su página publica encuentros en línea y presenciales; revisa la agenda vigente.

En la agenda consultada el 6 de octubre de 2026 aparece [«El Combo Indestructible de AWS: SQS + Lambda»](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/), una sesión virtual sobre resiliencia con SQS y Lambda el **20 de octubre de 2026 a las 19:00 (hora de Colombia)**. La página de Meetup indica acceso libre; confirma allí la inscripción y el horario antes del evento.
