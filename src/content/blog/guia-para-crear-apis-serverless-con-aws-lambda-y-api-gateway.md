---
title: "API Gateway HTTP API o REST API: cómo elegir para Lambda"
description: "Compara las APIs de API Gateway para un backend serverless con Lambda y diseña un contrato HTTP con payload 2.0, CORS, autorización y errores."
author: "guille-ojeda"
publishedAt: "2024-05-12"
publishedTimestamp: "2024-05-12T04:39:19.754Z"
modifiedTimestamp: "2026-10-06T15:59:00-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS Lambda y API Gateway: crea una HTTP API paso a paso"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/"
  - title: "Cómo configurar CORS en HTTP API de API Gateway"
    url: "https://dondeaprendoaws.com/blog/configurar-cors-en-http-api-gateway/"
  - title: "Lambda authorizers: seguridad, JWT y caché en API Gateway"
    url: "https://dondeaprendoaws.com/blog/5-practicas-de-seguridad-para-lambda-authorizers/"

---

Cuando conectas AWS Lambda con API Gateway, la función necesita conocer el formato del evento que recibe y la forma de la respuesta que API Gateway devolverá al cliente. Antes de escribirla, decide también si te conviene una **HTTP API** o una **REST API**: ambas pueden invocar Lambda, pero ofrecen controles distintos.

Esta guía compara esas opciones y recorre el contrato de ejemplo `GET /productos/{id}` con una HTTP API y payload 2.0. Incluye una función pequeña con validación y pruebas locales; la [guía paso a paso para crear e integrar una HTTP API con Lambda](/blog/aws-lambda-y-api-gateway-guia-basica/) cubre la configuración y el despliegue en AWS.

## HTTP API o REST API

Las dos son APIs RESTful y pueden integrarse con Lambda. AWS describe HTTP API como una opción con menos funciones y menor precio; elige REST API cuando una capacidad concreta de su catálogo sea necesaria.

| Si necesitas… | Evalúa primero… | Qué tener en cuenta |
| --- | --- | --- |
| Una ruta HTTP común hacia Lambda, autorización JWT y despliegues automáticos | HTTP API | Tiene integración Lambda, CORS integrado, autorizadores JWT para tokens de proveedores OIDC/OAuth 2.0 y un precio menor que REST API según la comparación de AWS. |
| Claves y planes de uso para clientes, validación de solicitudes en API Gateway o caché de respuestas | REST API | HTTP API no ofrece esos controles de administración y validación. Los límites de uso de un plan son objetivos de mejor esfuerzo, no una barrera garantizada de acceso o gasto. |
| Un endpoint privado de API Gateway o integración con AWS WAF | REST API | HTTP API admite integraciones privadas con algunos servicios, pero no un endpoint privado de API Gateway ni AWS WAF. |
| Controlar identidad y permisos | Cualquiera de las dos | Ambas ofrecen autorización IAM y Lambda. HTTP API puede validar JWT directamente; REST API puede usar un autorizador de grupo de usuarios de Amazon Cognito. |

La [comparación oficial de API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html) incluye otros detalles, como transformaciones, tipos de endpoint y opciones de monitoreo. Revisa esa lista si el diseño depende de una función específica. Si no necesitas una capacidad exclusiva de REST API, HTTP API suele ser suficiente para exponer una ruta sencilla.

Una clave de API de REST sirve para identificar clientes y asociarlos a planes de uso; **no autentica ni protege datos por sí sola**. AWS recomienda usar IAM, un autorizador o Amazon Cognito para controlar el acceso. Además, las cuotas y el throttling de los planes se aplican como objetivos de mejor esfuerzo, así que no los uses como control de seguridad o límite de costo. Consulta la [guía oficial de claves y planes de uso](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html).

Para un repaso en video de los conceptos de API Gateway, [AWS Women Colombia explica el servicio en «La Amenaza del Nivel 100: Amazon API Gateway»](https://www.youtube.com/watch?v=p1otaxU9pOI). La grabación es de 2022; úsala para orientación general y comprueba las funciones actuales en la documentación oficial enlazada arriba.

## Define la ruta y el contrato HTTP

Para el ejemplo, API Gateway recibe `GET /productos/{id}` y envía la solicitud a Lambda. La ruta incluye un identificador en la URL, así que la función buscará `id` en `event.pathParameters`. En un sistema real, la función podría consultar un almacén de datos; aquí usaremos un producto fijo para centrarnos en la entrada y la respuesta.

Con una integración proxy de HTTP API configurada con payload **2.0**, un evento contiene, entre otros campos, `version`, `routeKey`, `rawPath`, `pathParameters` y `requestContext.http.method`. Una versión reducida del evento para la ruta es:

```json
{
  "version": "2.0",
  "routeKey": "GET /productos/{id}",
  "rawPath": "/productos/demo-1",
  "pathParameters": { "id": "demo-1" },
  "requestContext": {
    "http": { "method": "GET", "path": "/productos/demo-1" }
  }
}
```

El contrato importa porque el evento no es solo el cuerpo de la solicitud: también lleva ruta, método, cabeceras, query string y contexto de API Gateway. En el formato 2.0, los nombres de cabecera se entregan en minúsculas y no existen `multiValueHeaders` ni `multiValueQueryStringParameters`; los valores repetidos se combinan con comas. El formato 1.0 usa campos distintos, como `httpMethod`. No copies acceso a propiedades de un formato en un handler configurado con el otro. AWS documenta ambos [formatos de evento y respuesta](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html).

## Devuelve respuestas HTTP explícitas desde Lambda

Guarda este ejemplo como `index.mjs`. La función reconoce un identificador de 1 a 32 letras, números o guiones y busca uno de los productos de demostración. Devuelve `200` si existe, `400` si el identificador no respeta el contrato y `404` si tiene formato válido pero no aparece en el catálogo.

```javascript
const productos = new Map([
  ["demo-1", { id: "demo-1", nombre: "Teclado de práctica" }]
]);

const responder = (statusCode, datos) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8" },
  isBase64Encoded: false,
  body: JSON.stringify(datos)
});

export const handler = async (event = {}) => {
  if (event.version !== "2.0") {
    return responder(500, { error: "Formato de integración no compatible" });
  }

  const id = event.pathParameters?.id;
  if (typeof id !== "string" || !/^[a-z0-9-]{1,32}$/i.test(id)) {
    return responder(400, { error: "El identificador no es válido" });
  }

  const producto = productos.get(id);
  if (!producto) {
    return responder(404, { error: "No se encontró el producto" });
  }

  return responder(200, producto);
};
```

Una respuesta explícita con `statusCode` permite decidir qué estado HTTP recibe el cliente. En una integración proxy, `body` debe ser una cadena; por eso el código serializa el objeto con `JSON.stringify`. El cuerpo exitoso será `{"id":"demo-1","nombre":"Teclado de práctica"}` y el `Content-Type` indicará JSON. En payload 2.0, API Gateway también puede inferir `200` y `application/json` si la función devuelve JSON válido sin `statusCode`; las respuestas explícitas hacen que el contrato y los errores sean más claros.

La función espera el handler `index.handler` y un runtime compatible con módulos ECMAScript; AWS explica cómo [definir un handler de Node.js](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html). AWS lista actualmente Node.js 24 como runtime `nodejs24.x`; vuelve a revisar la [lista de runtimes soportados](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) antes de crear una función, porque los plazos de soporte cambian.

### Comprueba casos correctos y errores en local

Guarda estas pruebas junto al handler como `handler.test.mjs`. Node.js trae un ejecutor de pruebas; no hacen falta paquetes ni credenciales de AWS.

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "./index.mjs";

const evento = (id) => ({
  version: "2.0",
  routeKey: "GET /productos/{id}",
  rawPath: `/productos/${id}`,
  pathParameters: { id },
  requestContext: { http: { method: "GET", path: `/productos/${id}` } }
});

test("devuelve el producto conocido como JSON", async () => {
  const respuesta = await handler(evento("demo-1"));
  assert.equal(respuesta.statusCode, 200);
  assert.equal(respuesta.headers["content-type"], "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(respuesta.body), {
    id: "demo-1",
    nombre: "Teclado de práctica"
  });
});

test("rechaza identificadores fuera del contrato", async () => {
  const respuesta = await handler(evento("sku_invalido"));
  assert.equal(respuesta.statusCode, 400);
});

test("distingue un identificador válido sin producto", async () => {
  const respuesta = await handler(evento("demo-999"));
  assert.equal(respuesta.statusCode, 404);
  assert.deepEqual(JSON.parse(respuesta.body), {
    error: "No se encontró el producto"
  });
});

test("detecta una integración con otro formato de payload", async () => {
  const respuesta = await handler({ ...evento("demo-1"), version: "1.0" });
  assert.equal(respuesta.statusCode, 500);
});
```

Ejecuta las pruebas con:

```bash
node --test handler.test.mjs
```

Estas pruebas verifican la lógica y el objeto que devuelve el handler. No crean la ruta de API Gateway ni validan los permisos, el runtime o el CORS de una cuenta AWS. Para crear y desplegar la HTTP API de práctica, sigue la [guía completa con Lambda y API Gateway](/blog/aws-lambda-y-api-gateway-guia-basica/).

Si mantienes un contrato OpenAPI y quieres automatizar pruebas de la API ya desplegada, [esta introducción a Portman, de AndMore Dev](https://www.andmore.dev/es/blog/getting-started-portman/) muestra cómo comparar respuestas con una definición. El artículo es de 2021 y usa una versión antigua del CLI; comprueba la sintaxis vigente de Portman antes de aplicar sus comandos. Como otra explicación práctica con rutas `GET` y `POST`, puedes ver la grabación del [AWS User Group Perú sobre una API con API Gateway y Lambda](https://www.youtube.com/watch?v=nf_BdOoHIRY&t=834s); revisa la configuración de runtime y payload contra la documentación actual.

## Configura CORS si el cliente corre en un navegador

CORS determina si código JavaScript ejecutado en un navegador puede leer una respuesta desde otro origen. El origen incluye protocolo, host y puerto: `https://app.example.com` y `http://app.example.com` son distintos. CORS no identifica a la persona ni evita llamadas hechas desde `curl` u otro servidor.

En HTTP API puedes configurar en API Gateway los orígenes, métodos y cabeceras que necesita el frontend. Cuando activas CORS, API Gateway responde automáticamente a las solicitudes preflight `OPTIONS` y añade las cabeceras configuradas a las respuestas; también ignora las cabeceras CORS devueltas por Lambda. Permite solo los orígenes y métodos necesarios. La guía de AWS explica [cómo configurar CORS para HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html).

REST API también admite CORS, pero con una integración proxy la función backend debe devolver las cabeceras CORS requeridas. La configuración y el diagnóstico tienen diferencias entre tipos de API; consulta la [guía de CORS para REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html) si eliges esa opción. Para resolver preflight, orígenes y rutas `$default`, sigue la guía interna sobre [CORS en HTTP API de API Gateway](/blog/configurar-cors-en-http-api-gateway/).

## Separa autorización y permisos de Lambda

Si una ruta de un endpoint público no tiene un authorizer, autorización IAM ni otra política de acceso configurados, cualquiera que conozca la URL puede intentar invocarla. CORS no la vuelve privada. Para una HTTP API, puedes usar un autorizador JWT para validar tokens de un proveedor OIDC/OAuth 2.0, IAM o un Lambda authorizer. En REST API puedes usar IAM, un autorizador de Amazon Cognito o Lambda. La [comparación oficial de tipos y opciones de autorización](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html) y la guía de [JWT para HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html) describen esas elecciones.

También hay dos permisos de IAM distintos:

- El **rol de ejecución de Lambda** define qué puede hacer el código de la función, por ejemplo escribir logs o leer una tabla.
- La **política basada en recursos de la función** permite que API Gateway invoque Lambda. Limita el origen al API, etapa y ruta que correspondan cuando tu herramienta de despliegue lo permita.

Dar permiso a Lambda para leer una tabla no autoriza a un cliente a llamar a la API; dar permiso a API Gateway para invocar la función tampoco decide qué usuario final puede acceder a cada dato. La [guía de permisos de Lambda y API Gateway](https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html) muestra la política de invocación. La consola y AWS SAM pueden generar este permiso al crear la integración; con otras herramientas, comprueba que esté configurado.

Para una charla sobre decisiones de seguridad con API Gateway, mira [«Domina la seguridad de tus API con API Gateway» de AWS User Group Medellín](https://www.youtube.com/watch?v=0Hm94rAe3fU). La grabación, publicada en julio de 2024, es un complemento sobre seguridad; verifica las opciones vigentes en las guías de AWS anteriores.

## Considera límites, costos y registros

La integración HTTP API tiene un tiempo máximo de 30 segundos. Lambda permite configurar una función hasta 900 segundos, pero un timeout más largo en la función no amplía lo que API Gateway espera por una respuesta HTTP. Mantén el trabajo síncrono dentro del límite; para trabajos largos, acepta la solicitud y procesa el trabajo de forma asíncrona. Consulta las [cuotas de HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html) y el [timeout de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html).

HTTP API tiene un precio menor que REST API en la comparación de AWS, pero una implementación sigue generando cargos por el uso de API Gateway y Lambda; la ingesta y retención de registros también pueden costar. Las tarifas dependen de la región y de las condiciones vigentes de la cuenta. Revisa los [precios de API Gateway](https://aws.amazon.com/api-gateway/pricing/), [Lambda](https://aws.amazon.com/lambda/pricing/) y [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) antes de desplegar; no supongas que un laboratorio estará siempre cubierto por una oferta gratuita.

Lambda envía sus logs a CloudWatch Logs si el rol de ejecución tiene los permisos básicos de registro. Los access logs de HTTP API se configuran por etapa y también se escriben en CloudWatch Logs. Registra el ID de solicitud, la ruta y el estado; evita guardar tokens, credenciales o cuerpos con datos personales. Para diagnosticar un error de integración, AWS recomienda incluir `$context.integrationErrorMessage` en los access logs de HTTP API. Consulta [logs de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html) y [logging de HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging.html).

| Resultado | Qué revisar primero |
| --- | --- |
| `400` o `404` que devuelve la función | Validación del identificador y existencia del producto. |
| `404` antes de llegar a Lambda | Método, ruta y etapa de API Gateway. Una ruta que no coincide no invoca el handler. |
| `401` o `403` | Authorizer, token, scopes o permisos IAM del cliente. |
| `500` de API Gateway | Permiso para que API Gateway invoque Lambda o error de integración. Consulta access logs. |
| `502 Bad Gateway` | Lambda devolvió un formato incompatible o tuvo un error de ejecución; compara la versión del payload y revisa los logs. |
| Funciona con `curl`, falla en el navegador | Preflight, origen, método y cabeceras CORS. `curl` no aplica las restricciones CORS del navegador. |
| Timeout | Duración del handler y de sus dependencias frente al límite de 30 segundos de HTTP API. |

AWS explica que API Gateway devuelve `500` si rechaza la invocación y `502` si Lambda falla o devuelve un formato incompatible en la [guía de errores de Lambda a través de API Gateway](https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway-errors.html). Para aislar el motivo, activa access logs e incluye `$context.integrationErrorMessage`, como muestra la guía de [diagnóstico de integraciones Lambda en HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-troubleshooting-lambda.html).

## Practica y participa con la comunidad

Cuando pruebes una API, comparte el método, la ruta, la versión de payload, el código HTTP y el mensaje de error; elimina tokens y datos personales antes de publicar registros. Para profundizar en el control de acceso, consulta la guía sobre [autorizadores Lambda, JWT y caché](/blog/5-practicas-de-seguridad-para-lambda-authorizers/).

El [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) publica charlas online y presenciales en Meetup. Al revisar su agenda el **6 de octubre de 2026**, figuraba la sesión virtual [«El Combo Indestructible de AWS: SQS + Lambda»](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/) para el **20 de octubre de 2026 a las 19:00, hora de Colombia**, con acceso libre según la ficha del organizador. Confirma allí la inscripción y el horario antes de asistir. También puedes buscar otros grupos en el [directorio de comunidades AWS](/comunidades/) y próximas charlas en la [agenda de eventos](/eventos/).

Si quieres participar en otros espacios regionales, consulta el [AWS User Group Perú](https://awsugperu.cloud/) y la comunidad de [AWS User Group Medellín en Meetup](https://www.meetup.com/awsugmed/). Para más charlas técnicas en español, visita el [canal de YouTube de AWS Women Colombia](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw).
