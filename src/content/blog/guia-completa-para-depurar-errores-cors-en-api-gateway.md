---
title: "Cómo depurar errores CORS en API Gateway: preflight, 4xx y 5xx"
description: "Diagnostica errores CORS en API Gateway: preflight OPTIONS, REST y HTTP API, authorizers, credenciales y respuestas 401, 403 o 5xx."
author: "guille-ojeda"
publishedAt: "2025-05-26"
publishedTimestamp: "2025-05-26T19:44:19.872000+00:00"
modifiedTimestamp: "2026-10-06T15:38:25-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "CORS en REST API Gateway (v1) y WebSocket"
    url: "https://dondeaprendoaws.com/blog/cors-en-websocket-vs-rest-api-gateway/"
  - title: "Cómo configurar CORS en HTTP API de API Gateway"
    url: "https://dondeaprendoaws.com/blog/configurar-cors-en-http-api-gateway/"
  - title: "Lambda authorizers: seguridad, JWT y caché en API Gateway"
    url: "https://dondeaprendoaws.com/blog/5-practicas-de-seguridad-para-lambda-authorizers/"
  - title: "Cómo habilitar CloudWatch Logs en API Gateway: REST, HTTP y WebSocket"
    url: "https://dondeaprendoaws.com/blog/como-habilitar-cloudwatch-logs-en-api-gateway-guia-paso-a-paso/"
---

Un error CORS en el navegador no siempre significa que la API esté caída. Puede indicar que la respuesta no autoriza el origen, que el preflight `OPTIONS` fue rechazado, que API Gateway generó un `401` o `403` antes de llamar a tu backend, o que estás probando otra etapa o URL. Esta guía te ayuda a localizar el tramo que falla y a corregirlo sin abrir la API a cualquier origen.

El ejemplo usa el origen `https://app.example.com`, el método `POST` y las cabeceras `Content-Type` y `Authorization`. Sustitúyelos por los valores reales de tu aplicación.

## Qué significa un error CORS

CORS (Cross-Origin Resource Sharing) es un mecanismo del navegador. Una página tiene un origen formado por esquema, host y puerto; `https://app.example.com` y `http://app.example.com` son orígenes distintos. El servidor expresa qué origen puede leer la respuesta mediante cabeceras HTTP. CORS no autentica a la persona ni impide que `curl`, Postman o un servidor invoquen el endpoint.

Algunas solicitudes se pueden enviar directamente. Otras necesitan un **preflight**: el navegador manda `OPTIONS` con `Origin`, `Access-Control-Request-Method` y, cuando corresponde, `Access-Control-Request-Headers`. Si la respuesta no permite el origen, el método o las cabeceras anunciadas, el navegador no envía la solicitud real. Que no aparezca `OPTIONS` no prueba un fallo: una solicitud simple puede no tener preflight.

El navegador tampoco entrega a JavaScript todos los detalles de un fallo CORS. Usa la consola y la pestaña **Network** para ver la solicitud que fue bloqueada, el estado HTTP y las cabeceras recibidas. La documentación de [CORS en MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) y el [estándar Fetch](https://fetch.spec.whatwg.org/#cors-protocol-and-credentials) describen este comportamiento.

## Antes de tocar la configuración

Identifica estos datos de la solicitud que falla:

1. El tipo de API: **REST API (v1)** o **HTTP API (v2)**. No tienen el mismo flujo de configuración.
2. La URL final que aparece en Network: dominio, etapa, base path y ruta. Un dominio personalizado mal mapeado o una etapa equivocada puede devolver un error que parece CORS.
3. El origen exacto, incluido `http` o `https` y el puerto.
4. El método real y las cabeceras que el cliente intenta enviar. `Authorization` suele hacer que el navegador necesite preflight; no es lo mismo que activar el modo de credenciales para cookies.
5. Si la respuesta viene de la integración o de API Gateway. El estado, `x-amzn-errortype`, los logs de acceso y el request ID ayudan a distinguir ambos casos.

Si la URL invocada no corresponde a una ruta publicada, corrige primero la URL o el mapeo. Un `403` con `MissingAuthenticationToken` puede ser una ruta, etapa o método inexistente; no demuestra que el API haya sido eliminado.

## REST API (v1): configura el preflight y las respuestas reales

En una REST API, la solución depende de la integración.

### Integración no proxy

Para un recurso que recibe `POST`, crea un método `OPTIONS` con integración mock y devuelve, como mínimo, las cabeceras que el navegador necesita:

```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: POST
Access-Control-Allow-Headers: content-type, authorization
```

La lista de `Access-Control-Allow-Methods` debe incluir el método real que el preflight está comprobando. `OPTIONS` es el método del preflight; no hace falta agregarlo a esa lista por ese solo motivo. `Access-Control-Allow-Headers` debe incluir los nombres anunciados en `Access-Control-Request-Headers`.

En la integración mock, configura el passthrough como `NEVER` y mapea las cabeceras en la respuesta del método y en la respuesta de integración. La [guía oficial de CORS para REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html) documenta el flujo y el caso de `CONVERT_TO_TEXT` cuando la API usa tipos de medios binarios `*/*`.

El preflight no alcanza a reemplazar la respuesta real. La respuesta del `POST` también debe incluir `Access-Control-Allow-Origin`; si usas cookies o el modo de credenciales del navegador, debe incluir además `Access-Control-Allow-Credentials: true`.

### Integración proxy con Lambda o HTTP

En una integración proxy, API Gateway no ofrece una respuesta de integración para añadir estas cabeceras. El backend debe devolverlas en la respuesta de `OPTIONS` y en la respuesta real, incluidas las respuestas de error que genere la aplicación. Un patrón para varios orígenes es comparar el valor recibido con una allowlist y devolver solo el origen coincidente:

```javascript
const allowedOrigins = new Set([
  "https://app.example.com",
  "https://admin.example.com",
]);

function corsHeaders(origin) {
  if (!allowedOrigins.has(origin)) return { "Vary": "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Vary": "Origin",
  };
}

export const handler = async (event) => {
  const origin = event.headers?.origin ?? event.headers?.Origin ?? "";
  const method = event.httpMethod ?? event.requestContext?.http?.method;
  const headers = corsHeaders(origin);

  if (method === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  return {
    statusCode: 200,
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true }),
  };
};
```

Este ejemplo no autentica al usuario ni concede permisos en la API: solo decide si el navegador puede leer la respuesta. La autenticación y la autorización siguen siendo responsabilidad del authorizer o backend. Para una solicitud con cookies, agrega `Access-Control-Allow-Credentials: true` a las respuestas que correspondan y conserva un origen explícito; nunca combines ese modo con `Access-Control-Allow-Origin: *`.

### 401, 403 y 5xx generados antes del backend

Si el authorizer, la validación de la solicitud, una clave API o el enrutamiento rechaza la petición antes de la integración, Lambda no puede añadir cabeceras. Configura la **Gateway Response** correspondiente en una REST API, por ejemplo `UNAUTHORIZED`, `ACCESS_DENIED`, `DEFAULT_4XX` o `DEFAULT_5XX`, según el error que observes. Incluye `Access-Control-Allow-Origin` y los encabezados compatibles con el modo de credenciales. No uses `*` si el navegador comparte cookies o credenciales.

La [guía de Gateway Responses de AWS](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-gateway-response-using-the-console.html) muestra dónde editar una respuesta generada por API Gateway y recuerda que, después de guardarla, debes desplegar la REST API en la etapa que usa el cliente. Configurar una respuesta para `DEFAULT_4XX` no corrige por sí solo un `5xx` de la integración: inspecciona el tipo de error y agrega las cabeceras en el lugar que realmente genera la respuesta.

## HTTP API (v2): usa la configuración de la API

Una HTTP API puede responder automáticamente a `OPTIONS` y añadir sus cabeceras CORS a la respuesta de la integración cuando defines `corsConfiguration`. Además, API Gateway ignora las cabeceras CORS que devuelva el backend, así que el origen, métodos y cabeceras deben estar en la configuración de la HTTP API.

Para modificar una API de prueba desde la AWS CLI, guarda primero su configuración actual. `update-api` cambia la API; el JSON debe representar los valores que quieres conservar.

```bash
aws apigatewayv2 get-api \
  --api-id a1b2c3d4 \
  --query CorsConfiguration \
  --output json \
  --region us-east-1 > cors-original.json
```

Si el archivo contiene `null`, la API no tenía configuración CORS: no lo pases a `update-api`. Revisa los [campos devueltos por `get-api`](https://docs.aws.amazon.com/cli/latest/reference/apigatewayv2/get-api.html), los permisos y la región antes de continuar. Para el origen, método y cabeceras del ejemplo:

```bash
cat > cors-example.json <<'JSON'
{
  "AllowOrigins": ["https://app.example.com"],
  "AllowMethods": ["POST"],
  "AllowHeaders": ["content-type", "authorization"],
  "MaxAge": 300
}
JSON

aws apigatewayv2 update-api \
  --api-id a1b2c3d4 \
  --cors-configuration file://cors-example.json \
  --region us-east-1
```

Comprueba de nuevo `get-api`, publica la etapa si no tiene despliegue automático y prueba desde el navegador. Si necesitas volver a una configuración guardada que contenga un objeto CORS válido, usa `--cors-configuration file://cors-original.json`; si antes no había configuración, retírala con [`delete-cors-configuration`](https://docs.aws.amazon.com/cli/latest/reference/apigatewayv2/delete-cors-configuration.html).

`AllowMethods` describe los métodos reales permitidos, como `POST`; no agregues `OPTIONS` solo porque el navegador usa ese método para el preflight. La respuesta CORS también necesita que la solicitud traiga `Origin` y, para `OPTIONS`, `Access-Control-Request-Method`.

Hay un caso especial: si una HTTP API tiene una ruta `$default` con authorizer, esa ruta también puede capturar `OPTIONS`. Crea una ruta `OPTIONS /{proxy+}` sin autorización y asígnale una integración. Si también invocas la raíz `/`, comprueba una ruta `OPTIONS /`: `/{proxy+}` exige un segmento de ruta. Su mayor prioridad permite que el preflight pase sin presentar la credencial que protege la operación real. Consulta la [documentación oficial de CORS para HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html) para la configuración de consola, CLI y prioridades de rutas.

## Credenciales, cookies y `Authorization`

No mezcles tres decisiones distintas:

- Una cabecera `Authorization` agregada por el cliente es una cabecera de solicitud. Si el navegador la anuncia en el preflight, debe aparecer en `Access-Control-Allow-Headers`.
- El modo de credenciales de Fetch (`credentials: "include"`) controla cookies y autenticación HTTP del navegador. Una respuesta con ese modo necesita `Access-Control-Allow-Credentials: true`.
- Cuando hay credenciales, `Access-Control-Allow-Origin` debe ser un origen concreto. El comodín `*` hace que el navegador bloquee el acceso a la respuesta. MDN también documenta que, en ese caso, los comodines de métodos, cabeceras y exposición tienen restricciones adicionales.

Un cliente con bearer en `Authorization` puede necesitar preflight aunque no use cookies. Eso no elimina la necesidad de validar el token en el authorizer o backend. Por el contrario, una cookie cross-origin depende también de políticas `SameSite` y de las reglas de cookies de terceros del navegador; CORS por sí solo no garantiza que la cookie viaje.

Para varios orígenes, devuelve únicamente un valor de una allowlist y añade `Vary: Origin` cuando la respuesta cambia según `Origin`. No reflejes cualquier valor recibido y no devuelvas dos cabeceras `Access-Control-Allow-Origin`.

## Un recorrido de diagnóstico reproducible

Sigue el flujo según el primer tramo que falle:

1. **Observa Network.** Anota URL, origen, método y cabeceras. Comprueba si hubo `OPTIONS`.
2. **Prueba el preflight.** Si existe, verifica que el estado sea el esperado y que `Allow-Origin`, `Allow-Methods` y `Allow-Headers` cubran exactamente la solicitud real.
3. **Prueba la respuesta real.** Un `OPTIONS` correcto no arregla un `POST` sin `Access-Control-Allow-Origin`, un error 401 o un 500 sin cabeceras.
4. **Separa gateway y backend.** Usa el request ID, `x-amzn-errortype`, logs de acceso y los logs de la integración. No busques una traza de Lambda si API Gateway rechazó la solicitud antes de invocarla.
5. **Comprueba la etapa.** En REST API, los cambios de métodos, integraciones y Gateway Responses requieren un nuevo deployment. En HTTP API, revisa `autoDeploy` de la etapa; si está desactivado, publica el cambio según el flujo de la etapa.
6. **Repite desde el navegador.** `curl` permite inspeccionar cabeceras, pero no aplica la política CORS y por sí solo no demuestra que JavaScript pueda leer la respuesta.

### Preflight con `curl`

Usa una URL que ya exista y reemplaza las variables antes de ejecutar el comando:

```bash
API_URL='https://a1b2c3d4.execute-api.us-east-1.amazonaws.com/prod/orders'

curl -i -X OPTIONS "$API_URL" \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

La respuesta debe autorizar `https://app.example.com`, `POST`, `authorization` y `content-type`. Para revisar una respuesta de error sin exponer un token, usa un valor ficticio:

```bash
curl -i "$API_URL" \
  -H 'Origin: https://app.example.com' \
  -H 'Authorization: Bearer REDACTED' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

`Bearer REDACTED` no demuestra que una solicitud autenticada funcione: sirve para comprobar el camino de una respuesta `401` y sus cabeceras CORS. Para probar el camino autenticado usa un token de prueba de corta duración desde un entorno seguro, no lo pegues en un comando que vaya a quedar en el historial y confirma el resultado también en el navegador. Estos comandos solo inspeccionan el endpoint indicado; no configuran una API. Una invocación real puede activar tu backend y generar cargos, así que usa una ruta de prueba que no modifique datos.

### Qué significa cada síntoma

| Síntoma | Dónde mirar primero |
| --- | --- |
| No hay `OPTIONS` | Puede ser una solicitud simple. Revisa la respuesta real y las condiciones de Fetch antes de crear una ruta `OPTIONS`. |
| `OPTIONS` devuelve `401` o `403` | Revisa authorizer, API key, `$default` y ruta desplegada. En una HTTP API con `$default`, agrega `OPTIONS /{proxy+}` sin autorización (y `OPTIONS /` si invocas la raíz). En REST, no protejas el preflight con el requisito que está fallando. |
| Preflight pasa, solicitud real falla | Revisa la respuesta real de la integración, su origen permitido y el estado HTTP. |
| `401`/`403` sin cabeceras CORS | Determina si respondió API Gateway o el backend. Para REST, configura la Gateway Response adecuada; para proxy, añade cabeceras en cada error del backend. |
| `Access-Control-Allow-Origin` no coincide | Compara esquema, host y puerto del `Origin` con la allowlist. `localhost:3000`, `localhost:5173` y una URL HTTPS son orígenes diferentes. |
| Error con `*` y credenciales | Cambia a un origen explícito y devuelve `Access-Control-Allow-Credentials: true` cuando corresponda. |
| `curl` funciona y el navegador no | `curl` no bloquea por CORS. Compara la solicitud real del navegador, redirecciones, cookies y la respuesta final. |

## Recursos para continuar

Usa estas fuentes según el tramo que estés corrigiendo:

- [CORS para REST APIs en API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html): integración mock, proxy, cabeceras, passthrough y despliegue.
- [CORS para HTTP APIs en API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html): `corsConfiguration`, CLI y la ruta `OPTIONS /{proxy+}` cuando `$default` tiene authorizer.
- [Gateway Responses en una REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-gateway-response-using-the-console.html): cabeceras para errores generados antes de la integración.
- [CORS en MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) y [protocolo CORS de Fetch](https://fetch.spec.whatwg.org/#cors-protocol-and-credentials): preflight, credenciales, comodines y `Vary: Origin` desde el estándar del navegador.
- [La Amenaza del Nivel 100: Amazon API Gateway](https://www.youtube.com/watch?v=p1otaxU9pOI), grabación del **AWS Women Colombia User Group** sobre API Gateway y serverless. Sirve para repasar el servicio; no reemplaza las condiciones de CORS de esta guía.
- [#100DíasdeAWS | Día 40 | Amazon API Gateway](https://awswomencolombia.com/100diasdeaws-dia40-amazon-api-gateway), artículo histórico de 2023 de **AWS Women Colombia** para repasar el servicio y su vocabulario. Es material introductorio y puede tener pantallas antiguas; usa la documentación de AWS para el comportamiento vigente.
- [Agregar autorización a API Gateway HTTP](https://dev.to/cecamilo/agregar-autorizacion-a-api-gateway-http-4non), artículo de Camilo Correa en español sobre autorización en una HTTP API. Ayuda a ubicar la parte de authorizer que puede producir un `401` o `403`; no es la fuente de las reglas CORS de esta guía.
- [Asegurar API Gateway con Amazon Cognito usando SAM](https://andmore.dev/es/blog/api-cognito/), tutorial de **AndMore Dev** sobre Cognito, API Gateway y SAM. Úsalo para conectar autenticación con la ruta que depuras y revisa sus supuestos de plantilla y versión antes de copiarla.
- [AWS User Group Perú: crear una API con API Gateway y Lambda](https://www.youtube.com/watch?v=nf_BdOoHIRY&t=834s), grabación práctica sobre una API HTTP con métodos GET y POST. Es útil si necesitas reproducir el flujo de una integración antes de añadir CORS.

## Comunidad y artículos relacionados

La guía [CORS en REST API Gateway (v1) y WebSocket](/blog/cors-en-websocket-vs-rest-api-gateway/) amplía el diagnóstico de REST y explica por qué un handshake de WebSocket usa `Origin` y autorización de `$connect`, no un preflight CORS. Para HTTP API (v2), continúa con [Cómo configurar CORS en HTTP API de API Gateway](/blog/configurar-cors-en-http-api-gateway/). Si el origen del error es un authorizer, [Lambda authorizers: seguridad, JWT y caché en API Gateway](/blog/5-practicas-de-seguridad-para-lambda-authorizers/) ayuda a separar identidad, permisos y fallos del authorizer. Para request IDs, logs de acceso y diferencias de registro por tipo de API, consulta [Cómo habilitar CloudWatch Logs en API Gateway: REST, HTTP y WebSocket](/blog/como-habilitar-cloudwatch-logs-en-api-gateway-guia-paso-a-paso/).

Para comentar un fallo o seguir nuevas sesiones, visita [AWS Women Colombia](https://awswomencolombia.com/) y su [canal de YouTube](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw), o consulta las actividades del [AWS User Group Perú](https://awsugperu.cloud/). Lleva un caso reducido con el tipo de API, el origen, el estado HTTP y las comprobaciones que ya hiciste. También puedes buscar una comunidad en el [directorio de comunidades AWS](/comunidades/) y revisar la [agenda de eventos](/eventos/). Al momento de revisar esta guía, el evento [Cloud Builders 04 del AWS Student Builder Group de la Universidad Panamericana](/eventos/mexico/#event-meetup-event-316387395) figuraba para el 8 de octubre de 2026 a las 17:00 (hora de Ciudad de México) y anunciaba la creación de una API REST pública. Confirma cupos, fecha y condiciones en [Meetup](https://www.meetup.com/aws-sbg-at-pan-american-university-cdmx/events/316387395/) antes de asistir.

## Preguntas frecuentes

### ¿Por qué el navegador muestra CORS si la API devuelve 403?

El navegador puede ocultar el cuerpo y mostrar un fallo CORS cuando la respuesta 403 no tiene las cabeceras que permiten compartirla. Conserva el estado 403 como señal de autenticación, autorización, ruta o etapa; en una REST API añade cabeceras en la Gateway Response correspondiente o en el backend que genera la respuesta; en HTTP API revisa su configuración CORS y el authorizer. Corrige también la causa del 403.

### ¿Tengo que crear siempre una ruta `OPTIONS`?

No. Una solicitud simple puede no generar preflight. REST API suele requerir que configures `OPTIONS` para solicitudes no simples; HTTP API puede responder automáticamente cuando tiene CORS configurado. Si una HTTP API usa `$default` con authorizer, agrega la ruta explícita `OPTIONS /{proxy+}` sin autorización.

### ¿Puedo usar `Access-Control-Allow-Origin: *` con un token Bearer?

`Authorization` debe estar permitido en `Access-Control-Allow-Headers` cuando el preflight lo anuncia. El comodín de origen es incompatible con el modo de credenciales del navegador, especialmente cookies o autenticación HTTP. Para una política clara y limitada, usa una allowlist de orígenes y un valor explícito.

### ¿Por qué `curl` muestra una respuesta y el navegador sigue bloqueándola?

`curl` no aplica la política CORS, así que solo demuestra qué cabeceras y estado devolvió el servidor. Compara esos valores con la solicitud real del navegador, revisa si hubo redirecciones o cookies y comprueba que el origen, el método y las cabeceras estén permitidos en la respuesta final.
