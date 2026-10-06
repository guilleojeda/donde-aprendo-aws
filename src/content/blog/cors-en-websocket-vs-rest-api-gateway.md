---
title: "CORS en REST API Gateway (v1) y WebSocket"
description: "Cómo configurar y depurar CORS en REST API Gateway (v1), y cómo validar Origin, autenticar $connect y autorizar mensajes en una API WebSocket."
author: "guille-ojeda"
publishedAt: "2025-09-01"
publishedTimestamp: "2025-09-01T05:25:00.432000+00:00"
modifiedTimestamp: "2026-10-06T13:57:35-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Configurar CORS en HTTP API Gateway"
    url: "https://dondeaprendoaws.com/blog/configurar-cors-en-http-api-gateway/"
review:
  date: "2026-10-06"
---

REST API Gateway (v1) y WebSocket API Gateway no habilitan el acceso desde el navegador de la misma manera. En una API REST, CORS se resuelve con respuestas HTTP y, para algunas solicitudes, una petición previa `OPTIONS`. Una conexión WebSocket empieza con un handshake HTTP de actualización: el navegador envía `Origin`, pero no hace un preflight CORS ni necesita `Access-Control-Allow-Origin` para establecer la conexión. En ambos casos, CORS u `Origin` no sustituyen la autenticación ni la autorización de la API.

Esta guía se concentra en **REST API (v1)** y **WebSocket API**. Para los pasos de **HTTP API (v2)**, consulta la [guía de CORS para HTTP API Gateway](https://dondeaprendoaws.com/blog/configurar-cors-en-http-api-gateway/).

| Tipo de API | Qué revisa el navegador | Dónde resolverlo en API Gateway |
| --- | --- | --- |
| REST API (v1) | Las cabeceras CORS de la respuesta; algunas solicitudes cross-origin necesitan primero un `OPTIONS`. | En una integración no proxy, el método `OPTIONS` y las respuestas de integración. En proxy, la integración/backend devuelve las cabeceras. Los errores generados por API Gateway pueden necesitar Gateway Responses. |
| WebSocket API | El handshake de actualización y su respuesta. El navegador incluye `Origin`; no hay preflight CORS. | El backend o authorizer de `$connect` puede validar el origen y la identidad. La aplicación debe autorizar las acciones de cada mensaje. |

## CORS en REST API Gateway (v1)

CORS (Cross-Origin Resource Sharing) es una regla que aplica el navegador al compartir respuestas HTTP con código de otro origen. Un origen combina protocolo, host y puerto: `https://app.ejemplo.com` y `http://app.ejemplo.com` son distintos. CORS no autentica a quien llama y no impide que `curl`, Postman u otro servidor invoquen el endpoint.

### Cuándo aparece `OPTIONS`

No toda solicitud cross-origin genera un preflight. Si la solicitud cumple las condiciones de una solicitud simple, el navegador puede enviarla directamente y después decidir si JavaScript puede leer la respuesta. Para otras solicitudes —por ejemplo, un `POST` con `Content-Type: application/json` o con una cabecera `Authorization`— el navegador envía primero `OPTIONS` con `Origin`, `Access-Control-Request-Method` y, si corresponde, `Access-Control-Request-Headers`. Solo envía la solicitud real si la respuesta permite ese origen, método y conjunto de cabeceras. AWS describe las diferencias entre solicitudes simples y no simples en la [guía de CORS para REST APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html); la [especificación Fetch](https://fetch.spec.whatwg.org/#cors-preflight-fetch) define qué datos lleva el preflight.

### Integración no proxy

Para un preflight, configura un método `OPTIONS` que devuelva `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods` y `Access-Control-Allow-Headers` con los valores que necesita el cliente. AWS documenta una integración mock para esta respuesta y el comportamiento passthrough `NEVER`. El preflight no incluye cookies ni el valor de `Authorization`: solo anuncia nombres de cabeceras que podrían usarse después. Deja que `OPTIONS` responda sin el authorizer o la clave API que protege el método real. En la respuesta del método real, configura también `Access-Control-Allow-Origin`; si la solicitud usa credenciales del navegador, como cookies, devuelve el origen concreto y `Access-Control-Allow-Credentials: true` tanto en el preflight como en la respuesta real; `Access-Control-Allow-Origin: *` no sirve para compartir una respuesta con credenciales.

No basta con que `OPTIONS` responda bien: el navegador también evalúa la respuesta del método real. Si una solicitud con `Authorization` pasa la preflight pero el método devuelve una respuesta sin la cabecera de origen, JavaScript seguirá sin poder leerla.

Para comprobar los valores, compara las cabeceras que devuelve el preflight con las de la solicitud real. Este ejemplo usa el origen `https://app.ejemplo.com`, un `POST` y las cabeceras `Content-Type` y `Authorization`:

```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://app.ejemplo.com
Access-Control-Allow-Methods: POST
Access-Control-Allow-Headers: Content-Type, Authorization
```

En una integración no proxy, configura esos encabezados en la respuesta del método `OPTIONS` y sus respuestas de método e integración. En una integración proxy, el backend debe devolverlos al atender `OPTIONS`. La respuesta real de la integración proxy también debe permitir el origen:

```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://app.ejemplo.com
Content-Type: application/json

{"ok":true}
```


### Integración proxy

Con Lambda proxy o HTTP proxy, el backend debe devolver las cabeceras CORS. En particular, asegúrate de que la ruta que recibe `OPTIONS` conteste con las cabeceras solicitadas y de que las respuestas de la solicitud real las incluyan. API Gateway no crea una respuesta de integración que puedas modificar para añadirlas; por eso la función Lambda o el servidor HTTP es quien debe generarlas. Revisa las respuestas de error del backend además de las exitosas.

Si una REST API tiene tipos de medios binarios configurados como `*/*`, AWS indica que al crear el método `OPTIONS` puede ser necesario cambiar `contentHandling` a `CONVERT_TO_TEXT` en la integración y en su respuesta. Este caso aplica a esa configuración binaria; no es un requisito general de CORS. Para reconocer una integración AWS no proxy, el artículo de [AndMore Dev sobre una API REST sin Lambda](https://www.andmore.dev/es/blog/build-serverless-api-with-no-lambda/) muestra API Gateway integrado con DynamoDB, OpenAPI y mapeos VTL; no es una guía de CORS y su página fue publicada en 2021.

### Errores devueltos por API Gateway

Un fallo de CORS puede ocultar el error útil que produjo el endpoint. Distingue entre un `4xx` o `5xx` de tu integración y una respuesta generada por API Gateway antes de llamar al backend. Para esta última, las respuestas de integración no alcanzan: configura las **Gateway Responses** correspondientes con `Access-Control-Allow-Origin` y, si la solicitud usa credenciales, los encabezados compatibles. AWS documenta que las respuestas de Gateway se personalizan por tipo y muestra cómo agregar una cabecera CORS a una respuesta generada por API Gateway en su [guía de Gateway Responses](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-gateway-response-using-the-console.html).

Una lista de orígenes precisa ayuda a que el navegador comparta respuestas solo con los sitios previstos, pero no protege el endpoint frente a clientes fuera del navegador. Valida identidad y permisos en la API. Si envías un bearer en `Authorization`, inclúyelo en `Access-Control-Allow-Headers`; eso no significa por sí solo que debas habilitar cookies o `Access-Control-Allow-Credentials`.

Después de modificar métodos, integraciones o respuestas de una REST API, vuelve a desplegar la API en la etapa que usan los clientes. Una etapa apunta a un despliegue; guardar cambios no actualiza automáticamente la versión invocable. AWS detalla qué cambios requieren despliegue en la [guía de despliegue de REST APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-deploy-api.html).

## WebSocket API: handshake, `Origin` y permisos

Una conexión WebSocket comienza con un handshake HTTP de actualización y, si se acepta, cambia a un protocolo de mensajes bidireccional. El modelo del navegador usa el modo `websocket`, no el modo CORS de una petición `fetch`; no hay un preflight `OPTIONS` ni se habilita la conexión devolviendo `Access-Control-Allow-Origin`. La [especificación WebSockets de WHATWG](https://websockets.spec.whatwg.org/#opening-handshake) describe ese handshake y la [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455) define el campo `Origin`.

### Validar el origen en `$connect`

Para clientes de navegador, el handshake lleva `Origin`, que identifica el origen del script que intenta abrir la conexión. El backend o authorizer asociado a `$connect` puede comparar ese valor con una lista explícita y rechazar los orígenes no permitidos. La RFC explica que esta comprobación ayuda a impedir el uso cross-origin no autorizado por scripts de navegador; [OWASP recomienda una allowlist explícita de orígenes](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html). No es una prueba de identidad: un cliente que no sea navegador puede enviar su propio `Origin`, y el servidor no debe confiar en él como credencial.

En API Gateway, `$connect` se ejecuta mientras la conexión se establece. Si falla la autenticación, la autorización o la integración de esa ruta, no se crea la conexión. Por tanto, un rechazo durante el handshake se diagnostica en `$connect`, no agregando cabeceras CORS ni un método `OPTIONS`.

### Autenticación desde un navegador

El [authorizer Lambda REQUEST de WebSocket API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-lambda-auth.html) solo se asocia a la ruta `$connect`. La documentación de AWS muestra cómo otros clientes, como `wscat`, pueden enviar una cabecera o un parámetro de consulta. No copies ese ejemplo literalmente a `new WebSocket(...)` en JavaScript: el constructor estándar del navegador acepta una URL y, de manera opcional, subprotocolos, pero no ofrece un parámetro para cabeceras HTTP arbitrarias como `Authorization`.

El [estándar WebSockets del navegador](https://websockets.spec.whatwg.org/#opening-handshake) establece el handshake con el modo de credenciales `include`: las cookies elegibles pueden acompañar la conexión según las políticas del navegador. Si autenticas la sesión con cookies, valídalas y contrasta `Origin` con una lista estricta para reducir el riesgo de secuestro cross-site de WebSocket. Si el cliente necesita un bearer, evita ponerlo en la URL: OWASP advierte que los tokens en la query pueden acabar en registros de acceso y recomienda enviarlo en el primer mensaje por `wss`. En ese flujo, trata la conexión como no autenticada hasta que el backend valide ese mensaje; no proceses acciones ni envíes datos protegidos antes de la validación. Como el Lambda authorizer de API Gateway solo se ejecuta en `$connect`, la autenticación del primer mensaje debe hacerse en la integración de mensajes.

La autenticación del handshake tampoco autoriza automáticamente cada operación. AWS aplica la autorización de WebSocket en `$connect`; una vez abierta la conexión, la aplicación debe comprobar la identidad y el permiso para cada tipo de mensaje antes de ejecutar acciones o devolver datos privados. No confíes en un `connectionId`, un nombre de ruta o un campo enviado por el cliente como prueba de autorización.

## Cómo diagnosticar el problema

### Si falla una REST API

1. En las herramientas de desarrollo del navegador, revisa si hubo `OPTIONS`. Si lo hubo, compara su `Origin`, `Access-Control-Request-Method` y `Access-Control-Request-Headers` con los valores de la respuesta.
2. Si `OPTIONS` devuelve `401`, `403` u otro error, comprueba que el recurso y la etapa desplegada tengan un método `OPTIONS` que pueda responder al preflight y que la integración devuelva las cabeceras necesarias. El preflight no incluye la cabecera `Authorization` real: anuncia su nombre en `Access-Control-Request-Headers`, por lo que no puede autenticarse como la solicitud protegida.
3. Si el preflight pasa pero falla la solicitud real, inspecciona el estado HTTP y `Access-Control-Allow-Origin` de esa respuesta. En una integración proxy, revisa el backend; en no proxy, las respuestas de integración.
4. Si el error lo generó API Gateway, revisa la Gateway Response correspondiente. Si lo generó el backend, añade las cabeceras CORS a esa respuesta allí.
5. Prueba la respuesta del preflight con `curl`, pero confirma el resultado en el navegador: `curl` muestra las cabeceras que envió el servidor, no aplica CORS ni demuestra que JavaScript pueda leer la respuesta.

Para una API de ejemplo que recibe un `POST` con JSON y `Authorization`, el comando de inspección tiene esta forma:

```bash
curl -i -X OPTIONS 'https://{api-id}.execute-api.{region}.amazonaws.com/{stage}/{resource}' \
  -H 'Origin: https://app.ejemplo.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

En la respuesta, comprueba que el origen autorizado coincida con `https://app.ejemplo.com`, que los métodos incluyan `POST` y que las cabeceras incluyan `authorization` y `content-type`. El comando solo consulta el endpoint indicado; no configura ni despliega una API.

### Si falla una WebSocket API

1. En la pestaña **Network**, abre la solicitud **WS** y revisa el handshake. Una respuesta `101 Switching Protocols` indica que se estableció la conexión; un `401` o `403` antes de ella apunta a revisar la autenticación o la autorización de `$connect`, la allowlist de `Origin`, el dominio, la etapa y la integración.
2. Si la conexión abre y falla después, el problema pertenece al enrutamiento o procesamiento de mensajes, no a CORS. Revisa la ruta que coincide con el mensaje y la autorización de esa acción.
3. Si necesitas más contexto, habilita los registros de ejecución o de acceso de API Gateway y correlaciona el evento `CONNECT` o `MESSAGE` con el request ID. AWS documenta las opciones y variables disponibles para [registrar WebSocket APIs en CloudWatch](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-logging.html). Evita registrar credenciales.

## Recursos y comunidades

Para comparar esta configuración con **HTTP API (v2)**, sigue la [guía de CORS en HTTP API Gateway](https://dondeaprendoaws.com/blog/configurar-cors-en-http-api-gateway/). Para profundizar en prácticas de API Gateway y autenticación con Cognito, puedes ver la [charla del AWS User Group Medellín sobre API Gateway, FastAPI y Cognito](https://www.youtube.com/watch?v=s-BrAa-dIfQ); complementa esta guía, pero no trata CORS ni WebSocket API Gateway. Si quieres conversar sobre AWS y arquitectura serverless, el [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) publica encuentros comunitarios y virtuales. Si estás en Córdoba, puedes seguir las actividades del [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/). Para encontrar otras opciones por país, consulta el [directorio de comunidades AWS](https://dondeaprendoaws.com/comunidades/) y la [agenda de eventos AWS](https://dondeaprendoaws.com/eventos/) para ver fechas y modalidades.
