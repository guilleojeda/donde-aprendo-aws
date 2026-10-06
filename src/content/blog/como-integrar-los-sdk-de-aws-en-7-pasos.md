---
title: "AWS SDK v3 para JavaScript en Node.js: guía práctica"
description: "Instala AWS SDK v3, configura Región y credenciales temporales con IAM Identity Center, y valida la conexión a AWS sin crear recursos."
author: "guille-ojeda"
publishedAt: "2024-05-05"
modifiedTimestamp: "2026-10-06T10:03:48-03:00"
publishedTimestamp: "2024-05-05T03:40:17.719Z"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Fundamentos de AWS para principiantes: servicios, IAM y regiones"
    url: "https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/"
  - title: "AWS SAM CLI: pruebas locales y resolución de errores"
    url: "https://dondeaprendoaws.com/blog/aws-sam-cli-pruebas-y-desarrollo-local/"
review:
  date: "2026-10-06"
---

Para llamar a AWS desde Node.js, instala el paquete del servicio que necesitas de AWS SDK for JavaScript v3, configura una Región y deja que el SDK obtenga credenciales temporales desde tu perfil local o desde un rol de IAM en el entorno donde corre la aplicación. El ejemplo de esta guía consulta tu identidad con AWS STS: no crea buckets, tablas ni otros recursos.

Si tus ejemplos todavía usan `const AWS = require("aws-sdk")`, `AWS.config` o callbacks, ten en cuenta que AWS SDK for JavaScript v2 llegó al fin de soporte el 8 de septiembre de 2025 y ya no recibe actualizaciones ni versiones nuevas, según el [aviso oficial del SDK v2](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/). Para código nuevo y mantenimiento, usa v3 y consulta la [guía oficial de migración de v2 a v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrating.html).

## Instala el cliente del servicio que vas a usar

AWS SDK for JavaScript v3 se distribuye en paquetes por servicio. Por ejemplo, S3 usa `@aws-sdk/client-s3`, mientras que el ejemplo de identidad de esta guía usa `@aws-sdk/client-sts`. Así puedes importar el cliente y las operaciones que usa tu aplicación, sin cargar el SDK monolítico de v2. En v3, una operación se envía con `client.send(new OperationCommand(...))` y se espera con `await`.

Instala Node.js en una versión LTS activa y crea una carpeta para el ejemplo:

```sh
mkdir aws-sdk-v3-demo
cd aws-sdk-v3-demo
npm init -y
npm install @aws-sdk/client-sts
```

Usaremos un archivo `index.mjs`; la extensión `.mjs` permite usar `import` y `await` en el nivel superior sin cambiar `package.json`. Para instalar otro servicio, agrega su paquete modular, por ejemplo `npm install @aws-sdk/client-s3`. AWS mantiene los pasos de [configuración e instalación](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-up.html) y un [tutorial completo para Node.js](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-started-nodejs.html).

## Elige credenciales según dónde corre tu código

En tu computadora, AWS recomienda usar IAM Identity Center cuando tu organización lo ofrece. AWS CLI v2 configura un perfil con una sesión de IAM Identity Center; el SDK de JavaScript v3 puede leer ese perfil y obtener credenciales temporales mientras mantengas una sesión válida. Ejecuta el asistente y luego inicia sesión:

```sh
aws configure sso --profile sdk-demo
aws sso login --profile sdk-demo
```

El asistente te pedirá datos de IAM Identity Center, una cuenta y un conjunto de permisos al que ya tengas acceso. No elijas ni crees un usuario raíz para este ejemplo. Luego ejecuta el programa con el perfil y la Región del servicio:

```sh
AWS_PROFILE=sdk-demo AWS_REGION=us-east-1 node index.mjs
```

En PowerShell, define las variables para la sesión actual antes de correr Node.js:

```powershell
$env:AWS_PROFILE = "sdk-demo"
$env:AWS_REGION = "us-east-1"
node .\index.mjs
```

`AWS_PROFILE` selecciona el perfil local. `AWS_REGION` indica a qué Región enviar la llamada al servicio. La Región donde está el portal de IAM Identity Center (`sso_region` en la configuración) puede ser distinta de la Región de la aplicación. El SDK no elige una Región por defecto; también puedes pasar `region` al constructor del cliente. Consulta [cómo configurar la autenticación del SDK](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-your-credentials.html) y [cómo se resuelve la Región](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-region.html).

Dentro de AWS, asigna a la carga un rol de IAM: por ejemplo, el rol de ejecución de Lambda, el rol de tarea de ECS o el perfil de instancia de EC2. En esos entornos, la cadena de credenciales del SDK obtiene credenciales temporales del entorno; no guardes claves de acceso de largo plazo en el repositorio, el código o las variables del navegador. El rol define los permisos de la aplicación. Para acceso entre cuentas, la política de confianza del rol de destino debe aceptar a la identidad de origen y esta debe estar autorizada para solicitar [`sts:AssumeRole`](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html); las políticas del rol asumido determinan qué puede hacer la sesión. La [cadena de credenciales para Node.js](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) describe los proveedores que puede resolver el SDK.

La autenticación responde quién hace la llamada; las políticas de IAM y del recurso determinan qué operación está autorizada. Por eso, que el SDK haya encontrado credenciales no garantiza que el rol pueda leer un objeto, consultar una tabla u operar sobre otro recurso.

## Comprueba la identidad antes de llamar a un servicio

Guarda este código como `index.mjs`:

```js
import {
  GetCallerIdentityCommand,
  STSClient,
} from "@aws-sdk/client-sts";

const region = process.env.AWS_REGION;
if (!region) {
  throw new Error("Define AWS_REGION antes de ejecutar el ejemplo.");
}

const sts = new STSClient({ region });

try {
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  console.log({ account: identity.Account, arn: identity.Arn });
} catch (error) {
  console.error("No se pudo consultar la identidad:", error);
  process.exitCode = 1;
} finally {
  sts.destroy();
}
```

`STSClient` recibe la Región; no le pasamos claves ni un objeto de credenciales. En Node.js, v3 usa la cadena predeterminada, que incluye variables de entorno, perfiles de IAM Identity Center y roles del entorno. [GetCallerIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_GetCallerIdentity.html) devuelve la cuenta y el ARN de la identidad que firmó la llamada; AWS indica que esta operación no requiere permisos explícitos. Aun así, verifica que el ARN y la cuenta correspondan al entorno esperado antes de continuar; trata esos datos como información interna al compartir una captura.

El comando `sts.destroy()` libera recursos del cliente, como sockets, cuando el programa termina. En una aplicación de larga duración, crea el cliente una vez y reutilízalo entre operaciones; destrúyelo al cerrar la aplicación, no después de cada petición. La [referencia del cliente STS v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-sts/Class/STSClient/) describe su configuración y operaciones.

## Si usas Python, el mismo perfil sirve para Boto3

Boto3 también puede leer los perfiles que configura AWS CLI v2 para IAM Identity Center. Instala la biblioteca con `python -m pip install boto3`, inicia sesión con el perfil y ejecuta un equivalente de la llamada anterior:

```python
import boto3

session = boto3.Session(profile_name="sdk-demo", region_name="us-east-1")
print(session.client("sts").get_caller_identity())
```

La [guía de credenciales de Boto3](https://docs.aws.amazon.com/boto3/latest/guide/credentials.html) describe la cadena de proveedores, IAM Identity Center y los perfiles con nombre.

Para una explicación grabada, puedes ver el [meetup sobre Boto3 del AWS User Group Caracas](https://www.youtube.com/watch?v=86RYHc-l1IM), publicado en agosto de 2021; contrasta sus pasos de autenticación con la documentación actual.

Si luego quieres practicar una operación de base de datos sin llamar a una cuenta AWS, el [tutorial de Docker y DynamoDB Local](https://blog.295devops.com/de-lo-local-se-aprende-desplegando-tu-primera-app-con-docker-y-dynamodb-local) muestra una aplicación Python con Boto3. Esa prueba valida el acceso al emulador local, no las políticas IAM ni el comportamiento de DynamoDB en AWS.

Para dar el siguiente paso con Boto3 y recursos de AWS, la [guía de aprovisionamiento de EC2 con consola, CLI y SDK](https://builder.aws.com/content/3ImAjFnFClms5szG7HVNwtgY6x7/cmo-aprovisionar-instancias-aws-ec-gua-completa-mediante-consola-cli-y-sdk) muestra llamadas reales de creación. Puede generar cargos: requiere parámetros válidos para la Región y permisos de lanzamiento; revisa y limita las reglas de red, y prepara la terminación de la instancia y sus recursos asociados al terminar. La guía no detalla una limpieza completa.

## Si tu aplicación corre en el navegador

El ejemplo anterior es para Node.js. Un navegador no tiene la cadena de credenciales de Node.js y cualquier clave incluida en el JavaScript enviado al usuario quedaría expuesta. No copies un archivo de credenciales ni una clave de IAM en el código del frontend.

Si el navegador necesita llamar directamente a AWS, configura identidad web mediante Amazon Cognito Identity Pools o un proveedor federado, con roles separados y permisos acotados para los recursos necesarios. Para otros diseños, conserva las credenciales en un backend y expón una API de tu aplicación. AWS detalla las opciones para [credenciales en un navegador](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-browser.html) y el proveedor basado en [Cognito Identity Pools](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/loading-browser-credentials-cognito.html).

## Corrige los errores más comunes

- **`CredentialsProviderError` o “Could not load credentials from any providers”**: confirma que seleccionaste el perfil correcto, ejecuta otra vez `aws sso login --profile sdk-demo` y verifica el resultado con `aws sts get-caller-identity --profile sdk-demo`. Revisa si variables antiguas como `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` o `AWS_SESSION_TOKEN` están haciendo que Node.js seleccione otra identidad antes que el perfil.
- **`Region is missing` o una respuesta del servicio equivocado**: define `AWS_REGION` o pasa `region` al cliente. No confundas la Región de IAM Identity Center con la del servicio; confirma también que ese servicio esté disponible en la Región elegida.
- **`AccessDenied` o `AccessDeniedException`**: comprueba primero el ARN de la identidad y después el permiso de IAM para la acción y el recurso concretos. También pueden intervenir la política del recurso, un límite de permisos o una política de la organización. `GetCallerIdentity` verifica la identidad, no los permisos de S3, DynamoDB u otro servicio.
- **La lista termina antes de mostrar todos los resultados**: algunas operaciones devuelven páginas. Usa el paginador generado `paginate…` cuando el cliente lo ofrezca; si no, sigue el token de continuación que devuelve esa API. El [ejemplo oficial para Node.js](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-started-nodejs.html) recorre resultados de S3 con `paginateListObjectsV2`.
- **Una operación falla de forma intermitente**: v3 permite configurar `maxAttempts` y `retryStrategy`. `maxAttempts` cuenta también el intento inicial; en v2 la opción antigua `maxRetries` contaba solo reintentos. Ajusta los reintentos al presupuesto de latencia y evita bucles propios sin límite. Antes de reintentar una operación que escribe o crea recursos, confirma que repetirla no vaya a duplicar efectos. Revisa la [referencia de migración de configuración de clientes](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-client-constructors.html).

Si ejecutas este código desde una función Lambda, una prueba local no usa automáticamente el rol desplegado ni demuestra sus permisos. Para separar pruebas con *mocks*, ejecución local e integración real, consulta la [guía de AWS SAM CLI para pruebas locales y depuración](/blog/aws-sam-cli-pruebas-y-desarrollo-local/).

## Aprende y pide ayuda en comunidad

Si quieres repasar IAM y Regiones antes de depurar un permiso, lee [fundamentos de AWS para principiantes](/blog/aws-fundamentos-guia-de-inicio-rapido/). Cuando pidas ayuda en una comunidad técnica, indica el lenguaje y la versión del SDK, la operación, la Región y el nombre del error con el mensaje sanitizado. No publiques claves, tokens, ARN con identificadores sensibles, datos de clientes ni detalles de una carga privada; para incidentes de producción o información confidencial, usa el canal de soporte de tu organización.

En español, busca un grupo por país en el [directorio de comunidades AWS](/comunidades/). Por ejemplo, el [portal del AWS User Group Perú](https://awsugperu.cloud/) reúne grupos locales, talleres y grupos de estudio; en Argentina, el [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) publica sus encuentros y [grabaciones en YouTube](https://www.youtube.com/@awsugbsas). Para encontrar talleres y meetups actuales, consulta la [agenda de eventos AWS](/eventos/); revisa en cada ficha la fecha, modalidad, inscripción y condiciones publicadas por quien organiza.

Como lectura comunitaria enfocada en perfiles locales, [Cómo ejecutar AWS SDK for JavaScript localmente](https://www.andmore.dev/es/blog/how-to-run-aws-sdk-with-sso/) muestra el uso de `AWS_PROFILE` e IAM Identity Center. La página indica que es una traducción hecha con IA; usa la documentación oficial enlazada arriba como referencia para validar los detalles.

## Preguntas frecuentes

### ¿Necesito instalar todo AWS SDK para JavaScript?

No. En v3 agrega el paquete modular de cada servicio que use tu código, como `@aws-sdk/client-s3` o `@aws-sdk/client-sts`.

### ¿El mismo perfil de IAM Identity Center me da permiso para cualquier operación?

No. El perfil obtiene credenciales temporales para una identidad y un conjunto de permisos asignado. La política de IAM y, en su caso, la política del recurso deben permitir la operación concreta.

### ¿Debo llamar a `destroy()` después de cada solicitud?

No. Reutiliza los clientes en aplicaciones de larga duración para aprovechar conexiones; llama a `destroy()` al cerrar el proceso o cuando el cliente deja de usarse.

### ¿Qué diferencia hay entre AWS SDK y Amplify?

El SDK permite llamar a las APIs de los servicios AWS desde tu código. Amplify combina herramientas para definir un backend, desplegarlo y conectarlo a una aplicación web o móvil. Si necesitas ese flujo de aplicación completa, sigue la [guía para empezar con Amplify Gen 2](/blog/como-funciona-aws-amplify/); si tu backend necesita realizar una llamada concreta a AWS, el SDK sigue siendo útil.
