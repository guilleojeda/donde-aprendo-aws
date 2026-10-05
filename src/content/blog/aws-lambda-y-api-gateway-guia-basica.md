---
title: "AWS Lambda y API Gateway: crea una HTTP API paso a paso"
description: "Crea una HTTP API con AWS Lambda y Node.js: payload 2.0, permisos, validación, pruebas, CORS, errores y limpieza del laboratorio."
author: "guille-ojeda"
publishedAt: "2024-11-28"
publishedTimestamp: "2024-11-28T01:29:24.642Z"
modifiedTimestamp: "2026-10-05T14:54:05-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS Lambda: cómo funciona, invocaciones y concurrencia"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/"
  - title: "AWS Lambda: cómo medir costo y rendimiento"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/"
---

Para crear una API con AWS Lambda y API Gateway necesitas una función, una integración que la invoque y una ruta HTTP. En este tutorial construirás **`POST /saludos`**, que recibe `{"nombre":"Ana"}` y devuelve `{"mensaje":"Hola, Ana"}`. Usaremos **HTTP API**, integración Lambda proxy y formato de payload **2.0**, con validación de entrada y respuestas de error explícitas.

El ejemplo no guarda datos ni llama a otros servicios. Puedes probar su lógica en tu computadora antes de crear recursos. Los pasos de AWS son una guía de despliegue: las pruebas locales verifican el handler, pero no demuestran que IAM, API Gateway o CORS estén bien configurados en tu cuenta.

## Qué necesitas y qué vas a crear

Necesitas conocimientos básicos de JavaScript y JSON, una cuenta AWS y una identidad con permisos para crear Lambda, su rol IAM y la HTTP API. Usa una cuenta de aprendizaje y credenciales temporales cuando estén disponibles; no uses el usuario raíz para este laboratorio. Para la prueba local necesitas Node.js 22; para llamar al endpoint puedes usar `curl`.

En AWS crearás una función llamada `aprendizaje-saludos`, un rol exclusivo para sus logs y una HTTP API llamada `aprendizaje-saludos-http`, en la misma región. El endpoint del ejercicio será **público y sin autenticación**: úsalo solo con datos ficticios, no lo compartas y elimínalo al terminar. Antes de desplegar, consulta [precios de Lambda](https://aws.amazon.com/lambda/pricing/) y [precios de API Gateway](https://aws.amazon.com/api-gateway/pricing/), revisa la oferta aplicable a tu cuenta y configura una alerta de presupuesto. Una alerta no detiene automáticamente el gasto.

### Por qué elegimos HTTP API

HTTP API permite exponer esta función sin necesitar las funcionalidades adicionales de REST API. No son variantes con todas las mismas opciones: **claves de API, planes de uso, validación de solicitudes de API Gateway y caché administrada de respuestas** pertenecen a REST API en la [comparación oficial](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html). Aquí validaremos el cuerpo en Lambda. Si una aplicación necesita esas capacidades, evalúa el tipo de API antes de seguir este tutorial.

## 1. Escribe el handler con un contrato claro

Guarda este código en `index.mjs`. Es un módulo ECMAScript: exporta `handler`, en lugar de usar `exports.handler` de CommonJS. La configuración del handler en Lambda será `index.handler`; [AWS documenta ambos elementos en su guía de Node.js](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html).

```javascript
const respuesta = (statusCode, datos) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8" },
  isBase64Encoded: false,
  body: JSON.stringify(datos)
});

export const handler = async (event, context) => {
  try {
    if (event?.version !== "2.0") {
      return respuesta(400, { error: "Se requiere un evento HTTP API 2.0" });
    }
    if (event.requestContext?.http?.method !== "POST") {
      return respuesta(405, { error: "Método no permitido" });
    }
    const tipo = event.headers?.["content-type"]?.split(";")[0].trim().toLowerCase();
    if (tipo !== "application/json") {
      return respuesta(415, { error: "Usa Content-Type: application/json" });
    }
    if (typeof event.body !== "string" || event.body.length === 0) {
      return respuesta(400, { error: "El cuerpo JSON es obligatorio" });
    }
    const cuerpo = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    if (Buffer.byteLength(cuerpo, "utf8") > 4096) {
      return respuesta(413, { error: "El cuerpo supera los 4096 bytes" });
    }
    let datos;
    try {
      datos = JSON.parse(cuerpo);
    } catch {
      return respuesta(400, { error: "JSON inválido" });
    }
    if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
      return respuesta(400, { error: "Envía un objeto con nombre" });
    }
    const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
    if ([...nombre].length < 1 || [...nombre].length > 80) {
      return respuesta(400, { error: "nombre debe tener entre 1 y 80 caracteres" });
    }
    return respuesta(200, { mensaje: `Hola, ${nombre}` });
  } catch {
    console.error(JSON.stringify({
      mensaje: "Error inesperado",
      requestId: context?.awsRequestId
    }));
    return respuesta(500, { error: "Error interno" });
  }
};
```

El máximo de 4.096 bytes es una decisión del ejercicio, **no el límite del servicio**. El código acepta JSON con un nombre, recorta espacios y no refleja trazas internas en la respuesta. Si un frontend muestra el saludo, debe tratarlo como texto, no insertarlo como HTML.

El [formato 2.0 de la integración](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html) coloca el método en `requestContext.http.method`, usa nombres de cabecera en minúsculas y puede entregar el cuerpo codificado en base64. Una respuesta explícita con `statusCode` y un `body` de tipo string permite controlar los errores; para ciertas respuestas válidas, 2.0 también admite inferir el estado 200. No mezcles este evento con `httpMethod` de otro formato.

Si estás migrando código existente, [la guía de Andres Moreno para pasar de CommonJS a ECMAScript](https://www.andmore.dev/es/blog/update-commonjs-to-esm/) explica los cambios de archivo, imports y exports.

## 2. Prueba la lógica sin una cuenta AWS

Crea `prueba.mjs` en la misma carpeta:

```javascript
import assert from "node:assert/strict";
import { handler } from "./index.mjs";

const evento = (body) => ({
  version: "2.0",
  requestContext: { http: { method: "POST" } },
  headers: { "content-type": "application/json" },
  body,
  isBase64Encoded: false
});

const ok = await handler(evento('{"nombre":" Ana "}'));
assert.equal(ok.statusCode, 200);
assert.deepEqual(JSON.parse(ok.body), { mensaje: "Hola, Ana" });
assert.equal((await handler(evento("{"))).statusCode, 400);
assert.equal((await handler(evento('{"nombre":" "}'))).statusCode, 400);
assert.equal((await handler(evento("null"))).statusCode, 400);
assert.equal((await handler(evento("[]"))).statusCode, 400);
assert.equal((await handler(evento("x".repeat(4097)))).statusCode, 413);
const base64 = evento(Buffer.from('{"nombre":"José"}').toString("base64"));
base64.isBase64Encoded = true;
assert.equal((await handler(base64)).statusCode, 200);
console.log("Pruebas locales correctas");
```

Ejecuta:

```bash
node prueba.mjs
```

No necesita instalar paquetes ni llamar a AWS. Para un proyecto con más lógica, añade pruebas de los casos de negocio y de los contratos de entrada. La grabación [Patrones de pruebas de aplicaciones serverless, de AWS Women Colombia](https://www.youtube.com/watch?v=4x3V6JUBs4Y) ayuda a pensar qué verificar localmente y qué requiere una prueba de integración.

## 3. Crea la función Lambda

En la consola de Lambda, selecciona **Create function / Crear función**, autoría desde cero y estos valores:

| Campo | Valor del ejercicio |
| --- | --- |
| Nombre | `aprendizaje-saludos` |
| Runtime | Node.js 22.x |
| Arquitectura | x86_64 |
| Modo de cómputo | Predeterminado, sin Managed Instances |
| Rol | Crear un rol nuevo con permisos básicos de Lambda |

En el editor, reemplaza `index.mjs` por tu handler y selecciona **Deploy**. Revisa que el handler sea `index.handler`. Mantén inicialmente 128 MB y timeout de 3 segundos para este saludo sin dependencias; son parámetros del laboratorio, no una recomendación para todas las aplicaciones.

Prueba en Lambda con el evento usado en `prueba.mjs`, cambiando `body` por `"{\"nombre\":\"Ana\"}"` en el editor JSON. La respuesta esperada incluye `statusCode: 200` y `body` como string. En CloudWatch comprueba que aparezca la invocación. Si solo probaste localmente, este paso sigue pendiente.

### Dos permisos diferentes

El rol de ejecución permite que **la función escriba logs**. `AWSLambdaBasicExecutionRole` cubre ese uso; no necesitas permisos a DynamoDB, S3 ni otras funciones para este ejemplo. API Gateway, por separado, necesita **invocar Lambda** mediante una política basada en recursos de la función. Es la separación que explica la [documentación de permisos](https://docs.aws.amazon.com/lambda/latest/dg/lambda-permissions.html).

Al crear la integración desde la consola, revisa el permiso que se añade para `apigateway.amazonaws.com`, acción `lambda:InvokeFunction`, restringido por `AWS:SourceArn` a tu API. Para restringirlo a esta ruta, el patrón de origen corresponde a `arn:aws:execute-api:REGION:CUENTA:API_ID/*/POST/saludos`. No uses un permiso abierto a cualquier API. La [guía de integración con API Gateway](https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway.html) describe la política y su condición de origen. El permiso `execute-api:Invoke` corresponde a clientes que usan autorización IAM; añadirlo al rol de ejecución de este saludo no repara el permiso de invocación de API Gateway.

## 4. Crea la HTTP API y su ruta

En API Gateway, elige **Create API → HTTP API → Build**. Añade una integración Lambda, selecciona la región y `aprendizaje-saludos`, y nombra la API `aprendizaje-saludos-http`.

Configura una única ruta **`POST /saludos`**, vinculada a esa integración. Si el asistente creó una ruta `ANY` o `$default`, elimínala: queremos exponer solo la ruta del ejercicio. Revisa en la integración que **payload format version sea `2.0`**. Sigue la [guía oficial para crear una HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop.html) si las etiquetas de consola cambian.

Usa la etapa **`$default`** con despliegue automático. Esa etapa expone la ruta directamente en la URL base; una etapa llamada `dev` añade `/dev`. Una etapa no aísla por sí sola roles, datos y funciones de producción: consulta el comportamiento en la [documentación de stages](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-stages.html).

Configura un throttling bajo en la etapa o ruta para el laboratorio, por ejemplo **1 solicitud por segundo y ráfaga de 2**, y evita pruebas de carga. Los [límites de throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html) son objetivos de mejor esfuerzo, no una barrera exacta de consumo o gasto.

## 5. Llama a la API y comprueba los errores

Copia la URL de invocación. Reemplaza `https://API_ID.execute-api.REGION.amazonaws.com` en estos comandos por tu URL real, sin duplicar la etapa:

```bash
curl -i --request POST \
  'https://API_ID.execute-api.REGION.amazonaws.com/saludos' \
  --header 'Content-Type: application/json' \
  --data '{"nombre":"Ana"}'
```

Debes recibir HTTP 200 y `{"mensaje":"Hola, Ana"}`. Prueba también:

```bash
curl -i --request POST \
  'https://API_ID.execute-api.REGION.amazonaws.com/saludos' \
  --header 'Content-Type: application/json' \
  --data '{"nombre":" "}'
```

La respuesta esperada es HTTP 400. JSON roto también devuelve 400; `Content-Type: text/plain` devuelve 415; un cuerpo decodificado de más de 4.096 bytes devuelve 413. Una solicitud `GET /saludos` no encuentra la ruta y API Gateway devuelve 404: no llega al 405 del handler, que sí puedes comprobar con una invocación directa de prueba.

## 6. Configura CORS solo si llamarás desde un navegador

`curl` no aplica las restricciones CORS de un navegador. Si tu frontend corre en `http://localhost:5173`, configura en **CORS de la HTTP API** ese origen exacto, método `POST`, cabecera `content-type` y credenciales deshabilitadas para este ejercicio. No agregues cabeceras CORS al handler: con esta configuración, API Gateway responde al preflight `OPTIONS` y administra las cabeceras de la integración, según la [guía oficial de CORS para HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html).

Puedes inspeccionar la respuesta de preflight así:

```bash
curl -i --request OPTIONS \
  'https://API_ID.execute-api.REGION.amazonaws.com/saludos' \
  --header 'Origin: http://localhost:5173' \
  --header 'Access-Control-Request-Method: POST' \
  --header 'Access-Control-Request-Headers: content-type'
```

Después comprueba la llamada real desde ese origen en el navegador. **CORS no autentica usuarios ni bloquea clientes como curl**. Para una aplicación con datos privados, añade autorización antes de exponerlos. [Agregar autorización a una HTTP API, de Camilo Cabrales](https://dev.to/cecamilo/agregar-autorizacion-a-api-gateway-http-4non), y la grabación [Domina la seguridad de tus APIs con API Gateway](https://www.youtube.com/watch?v=0Hm94rAe3fU) ofrecen continuaciones sobre ese tema; confirma qué tipo de API usa cada ejemplo.

## Si falla, identifica en qué tramo ocurre

| Síntoma | Qué comprobar primero |
| --- | --- |
| HTTP 404 | URL base, etapa, método y ruta exactos; despliegue disponible. |
| HTTP 400, 413 o 415 del ejemplo | Cuerpo, tamaño o Content-Type. Es una respuesta controlada de la aplicación. |
| HTTP 500 de la integración | Permiso para invocar Lambda y configuración de la integración. |
| HTTP 502 | Excepción sin manejar o respuesta incompatible; revisa los logs de Lambda y el payload configurado. |
| HTTP 429 | Throttling de API Gateway. Revisa por separado los throttles de Lambda, que pueden aparecer como fallo de integración. |
| Timeout | Duración del handler y de sus dependencias; límite de integración de la HTTP API. |
| Funciona con curl pero falla en navegador | Preflight, origen y cabeceras CORS; inspecciona también errores reales del backend. |

La [guía de errores de API Gateway y Lambda](https://docs.aws.amazon.com/lambda/latest/dg/services-apigateway-errors.html) distingue rechazo de invocación y fallo de la función. El ejemplo también puede devolver su propio 500 controlado; no diagnostiques solo por el número. La [HTTP API tiene un timeout de integración máximo de 30 segundos](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html): aumentar el timeout de Lambda no amplía ese límite. Para trabajos largos, diseña inicio y consulta de estado separados.

## Elimina los recursos del laboratorio

Al terminar, elimina la **HTTP API**, después la función **`aprendizaje-saludos`**. En CloudWatch Logs, elimina el grupo **`/aws/lambda/aprendizaje-saludos`** si se creó para este ejercicio y no necesitas conservarlo. Por último elimina el rol IAM exclusivo que creaste, comprobando que ninguna otra función lo use. Borrar una función no borra necesariamente sus logs. Revisa la región y los nombres antes de eliminar recursos; si añadiste otros durante la práctica, inclúyelos en tu limpieza.

## Practica y comparte tus dudas con la comunidad

La grabación [Tu primera API con AWS Lambda y API Gateway, de Juanes García](https://www.youtube.com/watch?v=rdyMHi0WqpI), ofrece otra explicación del recorrido. Úsala como complemento: comprueba el tipo de API y runtime de sus ejemplos antes de copiarlos.

<div><iframe allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen height="315" loading="lazy" src="https://www.youtube-nocookie.com/embed/rdyMHi0WqpI" title="Tu primera API con AWS Lambda y API Gateway — Juanes García" width="560"></iframe></div>

Para repetir el flujo con otras explicaciones, consulta [API Gateway HTTP API, de Camilo Cabrales](https://dev.to/cecamilo/api-gateway-http-api-2f4n), la grabación del [AWS User Group Perú sobre una API con API Gateway y Lambda](https://www.youtube.com/watch?v=nf_BdOoHIRY&t=834s), y [Serverless sin misterios: primera API con Lambda, API Gateway y DynamoDB](https://www.youtube.com/watch?v=4afSBy20sQ0). Son materiales para ampliar el ejercicio: añadir una base de datos requiere permisos, costos y limpieza adicionales. Las consolas de grabaciones históricas pueden diferir de la actual.

Sigue a [Camilo Cabrales en DEV](https://dev.to/cecamilo) para más ejemplos, a [AndMore Dev](https://www.andmore.dev/es/) para desarrollo serverless y a [Hazel Sáenz](https://hazelsaenz.tech/) para charlas y proyectos. En [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/), [AWS Women Colombia](https://awswomencolombia.com/) y [AWS User Group Ciudad de México](https://awsugcdmx.com/) puedes conocer encuentros y vías de participación. Para pedir ayuda, comparte método, ruta, versión del payload, estado HTTP y mensaje de error; omite credenciales y datos personales.

La siguiente lectura de esta serie es [cómo funciona Lambda y su concurrencia](https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/). Cuando tu API responda correctamente, continúa con [cómo medir costo y rendimiento](https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/).

## Preguntas frecuentes

### ¿Una API key hace privada esta HTTP API?

HTTP API no ofrece los planes de uso y claves de API de REST API. Para proteger datos usa el mecanismo de autorización que corresponda, como un autorizador JWT o IAM; no uses CORS como control de identidad.

### ¿Puedo usar este ejemplo como API de producción?

Es un laboratorio público sin almacenamiento. Antes de atender usuarios necesitas definir autorización, pruebas de integración, monitoreo y un despliegue reproducible. En producción, evalúa publicar [versiones de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/configuration-versions.html) y apuntar la integración a un alias para controlar cambios; este ejercicio usa el código editable de la función.
