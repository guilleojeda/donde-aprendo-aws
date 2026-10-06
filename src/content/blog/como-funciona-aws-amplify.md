---
title: "¿Cómo funciona AWS Amplify? Guía de Gen 2 para empezar"
description: "Entiende cómo Amplify conecta frontend, backend y hosting en AWS, qué cambia entre Gen 1 y Gen 2 y qué revisar antes de desplegar."
author: "guille-ojeda"
publishedAt: "2024-03-18"
modifiedTimestamp: "2026-10-06T10:03:48-03:00"
publishedTimestamp: "2024-03-18T23:13:52.162Z"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Cómo aprender AWS desde cero: ruta práctica en español"
    url: "https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/"
  - title: "AWS SDK v3 para JavaScript en Node.js: guía práctica"
    url: "https://dondeaprendoaws.com/blog/como-integrar-los-sdk-de-aws-en-7-pasos/"
review:
  date: "2026-10-06"
---

AWS Amplify reúne herramientas para conectar una aplicación web o móvil con servicios de AWS. En Gen 2 defines el backend con TypeScript, lo despliegas desde el CLI de Amplify y conectas el frontend mediante las bibliotecas de Amplify. Amplify Hosting puede compilar y publicar el frontend, además de desplegar el backend de cada rama de Git cuando configuras ese flujo.

Amplify automatiza parte de la creación y el despliegue de recursos; tú todavía decides quién inicia sesión, qué datos puede consultar cada usuario, cómo se protegen los secretos y qué costos aceptar. Si AWS también es nuevo para ti, puedes empezar con esta [ruta práctica para aprender AWS desde cero](https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/).

## Gen 1 y Gen 2: cuál flujo seguir

AWS recomienda Gen 2 para proyectos nuevos. Gen 1 usa el CLI clásico y comandos como `amplify init`, `amplify add auth` y `amplify push`. Gen 2 define el backend en código TypeScript y usa el CLI `ampx`, incluido en los paquetes de Amplify.

Desde el 1 de mayo de 2026, Gen 1 está en mantenimiento —solo recibe correcciones críticas y parches de seguridad— y su fin de vida está previsto para el 1 de mayo de 2027, según el [estado de soporte publicado por AWS](https://github.com/aws-amplify/amplify-cli). Los comandos y ejemplos de Gen 1 no describen cómo iniciar un proyecto Gen 2. Para administrar una misma aplicación y backend, no alternes los comandos de ambas generaciones: si vas a migrar, sigue el flujo documentado. Si necesitas migrar una app Gen 1, revisa la [guía de migración y su matriz de compatibilidad](https://docs.amplify.aws/react/start/migrate-to-gen2/); la herramienta de migración está en vista previa para desarrolladores y modifica recursos de CloudFormation, así que primero pruébala en un entorno clonado y sigue sus pasos con supervisión.

## Qué partes conecta Amplify

En Gen 2 el backend se define por capacidad, en archivos como `amplify/auth/resource.ts`, `amplify/data/resource.ts` o `amplify/storage/resource.ts`. Amplify usa AWS CDK y CloudFormation para desplegar los recursos de AWS que corresponden:

- **Auth** configura autenticación con Amazon Cognito.
- **Data** define una [API de datos](https://docs.amplify.aws/react/build-a-backend/data/set-up-data/), normalmente con AWS AppSync y almacenamiento en DynamoDB.
- **Storage** configura almacenamiento de archivos con Amazon S3.
- **Functions** permite definir funciones de AWS Lambda para lógica propia.

El frontend carga un archivo generado llamado `amplify_outputs.json`, que contiene la configuración pública necesaria para conectarse con ese backend. El ejemplo supone que el archivo está en la raíz del proyecto React/Vite y que este código está en `src/main.tsx`; ajusta la ruta si tu estructura es distinta:

~~~js
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';

Amplify.configure(outputs);
~~~

Después, la biblioteca `aws-amplify` expone APIs de Auth, Data y Storage para que la interfaz hable con esos recursos. En Gen 2, el esquema de Data también puede proporcionar tipos para el cliente del frontend. Sigue la [guía oficial de inicio rápido](https://docs.amplify.aws/react/start/quickstart/) para crear una aplicación React y conectar autenticación y datos.

**Amplify Hosting cumple otra función.** Es un servicio administrado de CI/CD y hosting: conecta un repositorio, compila la aplicación y publica el frontend. Con despliegues full stack, una rama de Git también puede tener su backend asociado; las vistas previas de pull requests permiten revisar cambios antes de integrarlos. Hosting es opcional: puedes desplegar un backend Amplify y conectarle un frontend alojado con otra plataforma. Consulta las opciones de [hosting y despliegue](https://docs.amplify.aws/react/deploy-and-host/amplify-hosting/).

## Cómo empezar sin mezclar los comandos

Si empiezas desde cero con React y Vite, sigue el [quickstart oficial de Amplify Gen 2](https://docs.amplify.aws/react/start/quickstart/), que usa una plantilla full stack. Si ya tienes frontend, ejecuta el [generador oficial](https://docs.amplify.aws/react/start/manual-installation/) desde la raíz de esa app:

~~~sh
npm create amplify@latest
~~~

El generador agrega la estructura del backend y sus dependencias. Asegúrate de que el paquete que compila el frontend también incluya la biblioteca cliente; si todavía no está instalada, agrégala allí:

~~~sh
npm add aws-amplify
~~~

El CLI de backend [`@aws-amplify/backend-cli`](https://github.com/aws-amplify/amplify-backend/blob/main/packages/cli/package.json) declara compatibilidad con Node.js `^18.19.0 || ^20.6.0 || >=22`; como Node 18 y 20 ya están fuera de soporte, usa una versión LTS mantenida que cumpla ese rango —por ejemplo, Node 24 LTS según el [calendario de Node.js](https://nodejs.org/en/about/previous-releases). Esta versión local corresponde al toolchain de Amplify; el runtime que elijas para una función Lambda es una configuración aparte.

Para desarrollar el backend en una cuenta de AWS, configura un perfil local con los permisos necesarios. AWS documenta el uso de credenciales temporales con IAM Identity Center en [Configure AWS for local development](https://docs.amplify.aws/react/start/account-setup/). Luego, desde la raíz del proyecto, inicia tu sandbox personal:

~~~sh
npx ampx sandbox --profile mi-perfil
~~~

`ampx sandbox` despliega recursos reales en tu cuenta, los actualiza al cambiar los archivos de `amplify/` y genera `amplify_outputs.json`. No es un emulador local: puede generar cargos. Si ya tienes un perfil predeterminado, omite `--profile mi-perfil`.

## Inicio de sesión, autorización y permisos de AWS

Son decisiones relacionadas, pero no equivalentes:

- **Autenticación de las personas:** Amplify Auth usa Amazon Cognito User Pools para registro, inicio de sesión y recuperación de cuentas.
- **Autorización dentro de la app:** reglas en los modelos o la API indican qué usuarios pueden leer o modificar cada dato. En Amplify Data, el acceso se deniega si no está permitido por una regla.
- **Permisos de AWS:** IAM controla qué acciones puede realizar el perfil que despliega, una función Lambda o un rol asociado a usuarios. Un Cognito Identity Pool puede entregar credenciales AWS temporales a una app cuando ese acceso directo es necesario; sus roles IAM definen los permisos.

El perfil IAM que usa `ampx sandbox` es la identidad del desarrollador que despliega infraestructura, no la cuenta de una persona que inicia sesión en tu aplicación. No pongas claves de acceso IAM en el código del frontend. Para profundizar, consulta los [conceptos de autenticación en Amplify](https://docs.amplify.aws/react/build-a-backend/auth/concepts/) y las [reglas de autorización para datos](https://docs.amplify.aws/react/build-a-backend/data/customize-authz/).

Si una función de tu backend necesita llamar a otros servicios de AWS desde Node.js, usa su rol de ejecución y un cliente del servicio correspondiente. La [guía de AWS SDK v3 para JavaScript](/blog/como-integrar-los-sdk-de-aws-en-7-pasos/) explica clientes, credenciales temporales y errores de permisos. Ese flujo de backend es distinto de configurar las bibliotecas de Amplify en el navegador.

Trata los secretos del backend por separado de la configuración pública del frontend. Las variables de entorno comunes pueden quedar en texto claro en artefactos de compilación o configuración; no las uses para contraseñas o claves privadas. Para funciones, define secretos con el mecanismo `secret()` de Amplify; los valores se almacenan en AWS Systems Manager Parameter Store y se resuelven en el backend. No incluyas secretos en el bundle que recibe el navegador. La [guía de secretos y variables de entorno de Gen 2](https://docs.amplify.aws/react/build-a-backend/functions/environment-variables-and-secrets/) explica los detalles.

## Costos y limpieza

Amplify no significa que toda la aplicación sea gratuita. Hosting puede cobrar por minutos de compilación, archivos almacenados y tráfico servido; las apps con renderizado del lado del servidor también pueden incurrir en cargos por solicitudes y duración. Los recursos del backend se facturan según el servicio y uso —por ejemplo, Cognito, AppSync, DynamoDB, Lambda o S3—. Las cuotas, créditos y condiciones del Free Tier dependen de la cuenta y pueden cambiar: revisa los precios actuales de [AWS Amplify](https://aws.amazon.com/amplify/pricing/) y de los servicios que uses.

Si configuraste secretos en un sandbox, elimínalos antes de borrar ese entorno y luego elimina los recursos del sandbox:

~~~sh
npx ampx sandbox secret remove --all --profile mi-perfil
npx ampx sandbox delete --profile mi-perfil
~~~

Revisa la consola y cualquier recurso que configuraste por fuera del sandbox. En particular, un bucket S3 puede conservarse si activaste una opción de retención en un entorno desplegado. La [guía de Storage](https://docs.amplify.aws/react/build-a-backend/storage/set-up-storage/) describe ese comportamiento. Borrar el proceso local o cerrar la terminal no equivale a eliminar los recursos de AWS.

## Recursos y comunidades para seguir

Para practicar con una app completa, sigue el [taller de Amplify Gen 2 en AWS Workshop Studio](https://catalog.workshops.aws/amplify-core/en-US); revisa sus requisitos y costos antes de desplegar recursos en tu cuenta. En español, [AWS User Group Mixtli publicó una charla sobre aplicaciones web con Amplify](https://www.youtube.com/watch?v=1AZPzfWFnDg). La descripción recorre Cognito, AppSync y almacenamiento; el video, subido en 2025, no indica qué generación usa, así que comprueba cualquier comando con la documentación actual. Puedes conocer al [AWS User Group Mixtli](https://awsugmixtli.com/) y ver sus otras sesiones en el [canal de YouTube del grupo](https://www.youtube.com/@awsugmixtli).

Puedes preguntar en el [AWS Amplify Discord](https://discord.com/invite/amplify), una comunidad de desarrolladores enfocada en Amplify, o participar en [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/), que organiza encuentros en español sobre AWS y serverless. La [convocatoria de “El Combo Indestructible de AWS: SQS + Lambda”](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/) figura en línea para el 20 de octubre de 2026, de 19:00 a 21:00, hora de Colombia (UTC−5); la página consultada el 6 de octubre indica acceso libre. La fecha, el registro y las condiciones pueden cambiar, así que comprueba la convocatoria antes de sumarte.

## Preguntas frecuentes

### ¿Puedo usar Amplify con algo distinto de React?

Sí. Amplify tiene bibliotecas y guías para varios frameworks web y clientes móviles, incluidos JavaScript, Next.js, Angular, Vue, React Native, Flutter, Android y Swift. En Gen 2 el backend se define en TypeScript, aunque el frontend puede estar escrito en JavaScript.

### ¿El comando `amplify add auth` sirve para Gen 2?

Ese comando pertenece al CLI de Gen 1. Para una app nueva Gen 2, crea el backend con `npm create amplify@latest` y trabaja con `npx ampx sandbox` y los archivos TypeScript de `amplify/`.

### ¿Amplify es gratis?

No hay un precio único que cubra Hosting y todos los recursos del backend. Puede haber créditos o cuotas gratuitas, pero no garantizan que cualquier app cueste cero. Calcula el uso de Hosting y de cada servicio AWS antes de desplegar.
