---
title: "AWS Lambda con Node.js: crea y prueba una función localmente"
description: "Crea una función AWS Lambda con Node.js, pásale un evento JSON y verifica resultados y errores en local antes de desplegarla."
author: "guille-ojeda"
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T14:09:19.83Z"
modifiedTimestamp: "2026-10-06T13:58:52-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS SAM CLI: pruebas locales y resolución de errores"
    url: "https://dondeaprendoaws.com/blog/aws-sam-cli-pruebas-y-desarrollo-local/"
  - title: "AWS Lambda y API Gateway: crea una HTTP API paso a paso"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-y-api-gateway-guia-basica/"
  - title: "Desarrollo en AWS: fundamentos para construir aplicaciones"
    url: "https://dondeaprendoaws.com/blog/desarrollo-en-la-nube-fundamentos-esenciales/"
---

Puedes empezar a desarrollar una función AWS Lambda sin desplegar nada: escribe un handler de Node.js, pásale un evento JSON y prueba tanto la respuesta válida como los errores con el test runner integrado de Node. El ejemplo de esta guía valida un nombre y devuelve un saludo. No usa credenciales, Docker, paquetes externos ni llamadas a AWS.

Una función Lambda no es por sí sola una API web ni un proceso que queda esperando dentro de tu aplicación. Lambda invoca tu handler con un evento; el servicio o cliente que la invoca define de dónde sale ese evento y qué ocurre con la respuesta. Aquí probaremos primero la lógica del handler. Al final verás qué cambia al exponerlo como HTTP y al desplegarlo.

## Requisitos y estructura

Instala Node.js 24 para que el entorno local coincida con el runtime `nodejs24.x`, que figura entre los runtimes compatibles de Lambda al revisar esta guía. La lista cambia, así que consulta la [tabla de runtimes de AWS Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) antes de desplegar. Para este ejercicio no necesitas una cuenta AWS, AWS CLI, npm ni una conexión a internet. Si el desarrollo en la nube también es nuevo para ti, puedes empezar por [Desarrollo en la nube: fundamentos esenciales](/blog/desarrollo-en-la-nube-fundamentos-esenciales/); aquí damos por sentados JavaScript básico y JSON.

Crea esta estructura:

```text
mi-lambda/
├── app.mjs
└── test/
    └── app.test.mjs
```

El ejemplo usa módulos ECMAScript en archivos `.mjs`, así que no necesita un `package.json` ni instalar paquetes. Lambda admite este formato y CommonJS; consulta la [guía de handlers de Node.js para Lambda](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html) si tu proyecto usa otro.

## 1. Escribe el handler

Guarda esto en `app.mjs`:

```javascript
export function handler(event = {}) {
  const name =
    typeof event?.name === "string" ? event.name.trim() : "";

  if (!name) {
    throw new TypeError(
      "El evento debe incluir name como texto no vacío."
    );
  }

  return { message: "Hola, " + name };
}
```

Este handler espera un evento JSON con un campo `name`, por ejemplo:

```json
{
  "name": "Ada"
}
```

El handler recibe un objeto `event` y devuelve otro objeto serializable como JSON. AWS llama al método exportado `handler`; si empaquetas este archivo como `app.mjs`, el valor de configuración del handler es `app.handler`. Ese formato identifica el archivo y el método exportado, como explica la [documentación de Node.js para Lambda](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html).

La función es síncrona porque no hace tareas asíncronas. Si después consulta una base de datos o llama a una API, convierte el handler a `async` y espera cada operación con `await`.

## 2. Prueba la respuesta y los errores

Guarda las pruebas en `test/app.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../app.mjs";

test("devuelve un saludo para un nombre válido", () => {
  assert.deepEqual(handler({ name: "Ada" }), {
    message: "Hola, Ada",
  });
});

test("rechaza un nombre ausente o vacío", () => {
  for (const event of [{}, { name: "" }, { name: "  " }, null]) {
    assert.throws(
      () => handler(event),
      {
        name: "TypeError",
        message: "El evento debe incluir name como texto no vacío.",
      }
    );
  }
});
```

Desde la carpeta `mi-lambda`, ejecuta:

```sh
node --version
node --test
```

El segundo comando encuentra las pruebas, ejecuta la función con eventos de ejemplo y falla si cambia la respuesta o si una entrada inválida deja de producir el error esperado. Este proyecto usa APIs incluidas en Node.js, por lo que no instala dependencias ni envía solicitudes a AWS. Puedes consultar el uso del [test runner de Node.js](https://nodejs.org/docs/latest-v24.x/api/test.html).

La prueba demuestra cómo responde el código para esos casos. No demuestra que un runtime, rol IAM, trigger o servicio de AWS esté configurado correctamente. Para ejecutar el código dentro de un contenedor compatible con el runtime Lambda, puedes usar AWS SAM CLI y Docker. La [guía de pruebas locales con SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-local-invoke.html) describe `sam local invoke`; el artículo [AWS SAM CLI: pruebas locales y resolución de errores](/blog/aws-sam-cli-pruebas-y-desarrollo-local/) explica cuándo elegir esa opción. Si tu función usa un SDK de AWS, una prueba local puede llegar a recursos reales cuando tiene credenciales; este ejemplo no contiene llamadas al SDK.

## Qué recibe Lambda y cuánto dura el entorno

En AWS, Lambda entrega un objeto `event` y un objeto `context` al handler. El contenido de `event` depende del invocador: una invocación directa puede enviar el JSON `{"name":"Ada"}`, mientras que Amazon S3, Amazon SQS y API Gateway envían estructuras distintas.

Lambda prepara un entorno de ejecución antes de invocar el handler. Puede reutilizar ese entorno para invocaciones posteriores, pero no garantiza que una función futura use el mismo entorno. Por eso puedes inicializar clientes reutilizables fuera del handler, pero no debes guardar allí el evento, datos de una persona ni estado que tenga que persistir. La [descripción del ciclo de vida de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html) explica las fases de inicialización, invocación y apagado.

### Una función invocada directamente no es una API HTTP

El evento `{"name":"Ada"}` de este ejercicio es un JSON que se entrega directamente al handler. No representa una solicitud HTTP de API Gateway.

HTTP API admite los formatos de payload `1.0` y `2.0`. En el formato `2.0`, por ejemplo, el evento incluye campos como `version`, `routeKey`, `rawPath`, `headers`, `requestContext` y `body`. Si creas la integración con AWS CLI, CloudFormation o un SDK, debes declarar `payloadFormatVersion`. El handler debe interpretar esa estructura y devolver una respuesta HTTP compatible, por ejemplo con `statusCode` y `body`. Consulta la documentación de AWS sobre [integraciones Lambda proxy para HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html) y el tutorial [AWS Lambda y API Gateway: crea una HTTP API paso a paso](/blog/aws-lambda-y-api-gateway-guia-basica/). No conectes esta función de saludo a una ruta esperando que API Gateway le entregue directamente el campo `name`.

### Cómo se propagan los errores

El ejemplo lanza un `TypeError` cuando `name` falta o queda vacío. En una invocación síncrona, el cliente recibe el error de ejecución; en una invocación asíncrona, Lambda aplica su política de reintentos y el destino de errores configurado. Lambda no transforma automáticamente una excepción en un código HTTP 400. Para una API, valida el evento HTTP y devuelve de forma explícita la respuesta adecuada.

Las políticas de reintento dependen del tipo de invocación y del servicio que entrega el evento. Por ejemplo, Lambda no reintenta automáticamente una invocación directa síncrona, mientras que, de forma predeterminada, vuelve a intentar dos veces una invocación asíncrona fallida. Las colas y streams tienen reglas propias. Si una operación puede repetirse, diseña el procesamiento para tolerar eventos duplicados y consulta [el comportamiento de reintentos de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html). Este ejemplo no produce efectos secundarios, así que repetirlo no duplica datos.

## Límites, permisos y despliegue

Para funciones Lambda estándar, el timeout configurable llega como máximo a 900 segundos (15 minutos) y la memoria va de 128 MB a 10.240 MB. El límite de payload de una invocación síncrona es 6 MB por solicitud y por respuesta; el de una invocación asíncrona es 1 MB. API Gateway y otros servicios también pueden tener límites propios. Revisa la [lista vigente de cuotas de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html) al diseñar el tamaño del evento y la duración del trabajo.

Para llevar este handler a AWS, crea o despliega una función con runtime `nodejs24.x` y handler `app.handler`. Toda función Lambda necesita un rol de ejecución. Dale solo los permisos que el código realmente usa; este ejemplo no accede a otros servicios, por lo que no requiere permisos de S3, DynamoDB ni credenciales guardadas en el código. La [guía de permisos de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-permissions.html) explica los roles de ejecución y el principio de mínimo privilegio.

El despliegue sí crea recursos reales en tu cuenta. Si añades API Gateway, revisa también sus cargos, además de los de Lambda y CloudWatch Logs. Los precios dependen de región y uso, así que consulta las páginas oficiales de [precios de Lambda](https://aws.amazon.com/lambda/pricing/) y [precios de API Gateway](https://aws.amazon.com/api-gateway/pricing/). El ejercicio local de `node --test` no incurre en esos cargos porque no invoca servicios de AWS.

Si despliegas una aplicación con AWS SAM, `sam deploy` crea o actualiza una pila de CloudFormation. Al terminar, elimina la pila y sus artefactos con `sam delete --stack-name nombre-de-la-pila`, y comprueba si quedaron recursos fuera de ella. La [referencia del comando `sam delete`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-delete.html) detalla qué elimina. Para continuar con SAM y avanzar hacia pipelines de despliegue, mira el video [AWS SAM Paso a Paso](https://www.youtube.com/watch?v=4yh1A3reAiQ), de Marcia en Desplegando Cloud. Usa la documentación actual para los requisitos y comandos de las pruebas locales.

Una vez desplegada la función, CloudWatch Logs puede ayudar a investigar mensajes nuevos y cambios en los patrones de error. La guía [Detección de anomalías en CloudWatch Logs: configuración y alertas](/blog/deteccion-de-anomalias-con-cloudwatch-logs/) explica cómo crear detectores y alarmas; un patrón detectado es una señal para revisar, no un diagnóstico automático de la causa.

## Comunidades y eventos para seguir aprendiendo

Puedes compartir el evento JSON, el resultado de `node --test` y el mensaje de error al pedir ayuda; no publiques credenciales ni datos personales. El [AWS User Group Tlaxcala FireflyCloud](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/) es un grupo general de AWS para conversar sobre nube y desarrollo. Si buscas intercambiar sobre arquitecturas serverless, consulta el [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/). El [directorio de comunidades AWS](/comunidades/) permite encontrar otros grupos por país.

Para repasar en video qué activa una función, qué hace el handler y cómo funcionan las fases INIT, INVOKE y SHUTDOWN, mira [¿Qué es AWS Lambda?](https://www.youtube.com/watch?v=fR5-TDI3g-I), del canal AWS Developers LATAM. La explicación también cubre los cold starts.

Para ampliar las pruebas de una aplicación serverless, mira [El ascenso de AWS, Patrones de pruebas de aplicaciones serverless](https://www.youtube.com/watch?v=4x3V6JUBs4Y), del canal AWS Women Colombia.

Al revisar esta guía el 6 de octubre de 2026, estas dos actividades en línea estaban anunciadas:

- El viernes 16 de octubre, de 16:00 a 17:00 GMT-6, el AWS User Group Tlaxcala FireflyCloud organiza [EC2 vs Lambda](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/), una comparación de casos de uso y costos.
- El martes 20 de octubre, de 19:00 a 21:00 COT, el AWS User Group Serverless Colombia presenta [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/), sobre tolerancia a errores y resiliencia. La ficha del organizador indica acceso libre.

Consulta la [agenda online de eventos AWS](/eventos/?mode=online) antes de inscribirte, porque las fechas, disponibilidad y condiciones pueden cambiar. Para más material en español, explora el [directorio de recursos serverless](/aprender/serverless/).
