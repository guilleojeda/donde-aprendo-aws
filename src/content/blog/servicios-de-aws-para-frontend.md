---
title: "AWS para frontend: Amplify Hosting o S3 con CloudFront"
description: "Elige hosting para una SPA, sitio estático o app SSR en AWS. Compara Amplify y S3 con CloudFront, publica un build y resuelve rutas, caché y permisos."
author: "guille-ojeda"
publishedAt: "2024-03-18"
publishedTimestamp: "2024-03-18T00:56:34.055Z"
modifiedTimestamp: "2026-10-07T09:41:54-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "¿Cómo funciona AWS Amplify? Guía de Gen 2 para empezar"
    url: "https://dondeaprendoaws.com/blog/como-funciona-aws-amplify/"
  - title: "Amazon CloudFront: qué es, cómo funciona y cómo configurarlo"
    url: "https://dondeaprendoaws.com/blog/amazon-cloudfront-comprendiendo-el-cdn-de-aws/"
review:
  date: "2026-10-07"
---

**Para publicar un frontend en AWS, empieza por lo que produce tu aplicación.** Si genera HTML, CSS y JavaScript como archivos, puedes usar **Amplify Hosting** para automatizar compilación y despliegue desde Git, o **S3 con CloudFront** si necesitas controlar la distribución y su configuración. Si genera HTML en cada solicitud mediante SSR, necesitas un entorno de ejecución compatible: S3 por sí solo no lo ofrece.

CloudFront es la CDN que entrega contenido y puede consultar un servidor; no reemplaza al servidor que ejecuta tu aplicación. Y publicar el frontend no crea automáticamente una API, una base de datos o el inicio de sesión de tus usuarios.

## Qué servicio elegir según tu aplicación

| Necesidad | Opción inicial | Qué comprobar |
| --- | --- | --- |
| Landing, documentación o sitio generado como archivos | Amplify Hosting | Comando de build, directorio de salida y dominio. |
| React, Vue o Angular con navegación en el navegador —SPA— | Amplify Hosting | Reescritura de rutas sin ocultar assets faltantes. |
| Sitio estático con reglas propias de CDN e infraestructura | S3 privado + CloudFront | OAC, HTTPS, rutas y políticas de caché. |
| Next.js con SSR | Amplify Hosting compute | Versión y funciones de Next.js admitidas. |
| Astro, Nuxt o SvelteKit con SSR | Amplify Hosting con el adaptador correspondiente | Compatibilidad del adaptador y salida de despliegue. |
| SSR que requiere control propio del runtime o contenedor | Evaluar un servicio de cómputo, como ECS Fargate | Operación, escalado y costo base adicionales. |

Una **SPA** ejecuta la interfaz en el navegador y puede llamar a una API. Un sitio con **SSG** genera sus páginas durante la compilación. **SSR** las genera al recibir solicitudes. La misma app puede combinar modalidades: usar React no indica por sí solo qué hosting necesita.

Elige Amplify Hosting cuando su flujo administrado cubra tus necesidades y quieras reducir configuración operativa. Elige S3 y CloudFront cuando tengas un motivo concreto para controlar orígenes, comportamientos, caché o infraestructura como código. El tamaño del sitio no determina por sí solo cuál conviene ni cuál será más barato.

## Amplify Hosting: publicar sin construir el pipeline completo

Amplify Hosting conecta un repositorio y una rama, compila la aplicación y publica sus artefactos. Puedes utilizarlo para un frontend que consume un backend existente. **No necesitas crear un backend Amplify para alojar una web estática.** La [guía de despliegue desde Git de AWS](https://docs.aws.amazon.com/amplify/latest/userguide/getting-started.html) describe el flujo de conexión.

Amplify también ofrece herramientas para definir autenticación, datos y funciones. Ese trabajo pertenece al backend: nuestra [guía de Amplify Gen 2](/blog/como-funciona-aws-amplify/) explica la separación y evita mezclar el CLI clásico de Gen 1 con el flujo actual.

### Publicar una SPA React/Vite existente

Este ejemplo supone un repositorio npm con `package-lock.json`, un script `build` y Vite configurado para producir `dist/`. Necesitas una cuenta AWS, permisos para crear la app Hosting y acceso al repositorio. La publicación puede generar cargos.

1. Ejecuta `npm ci` y `npm run build` localmente. Confirma que `dist/` contiene `index.html` y los archivos referenciados. Si tu app tiene otra salida, usa esa carpeta.
2. En Amplify, crea una app, conecta el proveedor Git y selecciona repositorio y rama. Revisa los ajustes detectados antes de desplegar.
3. Para este frontend estático, guarda este `amplify.yml` en la raíz del repositorio:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

`npm ci` necesita un lockfile consistente. En un monorepo debes configurar también la raíz de la app; no copies esta estructura sin adaptarla. El archivo del repositorio prevalece sobre los ajustes guardados en consola. AWS documenta los [ajustes de build](https://docs.aws.amazon.com/amplify/latest/userguide/build-settings.html) y el [formato de la especificación](https://docs.aws.amazon.com/amplify/latest/userguide/yml-specification-syntax.html).

4. Publica y abre la URL asignada. Comprueba portada, CSS, JavaScript y una navegación real.
5. Si usas un router SPA, abre directamente una ruta como `/productos/42` y recarga. Configura una **reescritura con estado 200 hacia `/index.html` para rutas de navegación**, conservando la URL original. No debe interceptar `/assets/`, llamadas a la API ni archivos estáticos. El [ejemplo oficial de reglas SPA de Amplify](https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html) excluye varias extensiones: adáptalo si tu build usa otras, como `.mjs` o `.avif`.
6. Solicita también `/assets/no-existe.js`: debe fallar como archivo faltante, no devolver `index.html` con estado 200. Luego conecta el dominio propio y verifica HTTPS y sus registros DNS.

No apliques el fallback SPA a un sitio multipágina generado: allí cada URL debe resolver su página correspondiente, y una página inexistente debe devolver 404. Tampoco uses este `amplify.yml` como configuración genérica de SSR.

### ¿Amplify sirve para SSR y Next.js?

Sí. A la fecha de revisión, AWS documenta soporte de **Next.js 12 a 15 en Amplify Hosting compute**. Consulta la [matriz de funciones de Next.js](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html) para verificar tu versión y capacidades; no deduzcas soporte de una versión posterior porque el build termine correctamente.

Nuxt dispone de un preset y Astro y SvelteKit usan adaptadores de comunidad, según la [guía de frameworks SSR de Hosting](https://docs.aws.amazon.com/amplify/latest/userguide/server-side-rendering-amplify.html). Revisa sus instrucciones, límites y logs. Una exportación estática de un framework puede alojarse como archivos, pero pierde las funciones que requieren ejecución en cada solicitud.

Si necesitas administrar un contenedor Next.js, la [arquitectura de Daniel Castillo con ECS Fargate](https://dcastillogi.com/arquitecturas/despliegue-nextjs-ecs-fargate) permite estudiar otra opción. Incluye ALB, ECR y otros componentes: evalúa ese costo y operación antes de adoptarla para un sitio simple.

## S3 y CloudFront: archivos privados en el origen, web pública por HTTPS

El recorrido es **navegador → CloudFront → bucket S3 privado**. S3 conserva los archivos; CloudFront los entrega desde su caché o consulta el bucket. Usa el endpoint normal del bucket —REST— con **Origin Access Control (OAC)**, que autentica las solicitudes de CloudFront al origen.

El endpoint de **sitio web estático de S3** es diferente: exige contenido accesible públicamente, no ofrece HTTPS y, si lo usas como origen de CloudFront, no admite OAC ni OAI. Puedes ofrecer HTTPS al visitante mediante CloudFront, pero el tramo hacia ese endpoint sigue siendo HTTP. AWS compara los [endpoints de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteEndpoints.html).

### Configuración mínima y comprobaciones

Para un build estático con `index.html`:

1. Crea un bucket conservando **Block Public Access** y **Object Ownership: Bucket owner enforced**. Sube únicamente los artefactos del build, con sus rutas y tipos de contenido correctos.
2. Crea una distribución CloudFront con el bucket como origen S3 y asocia un OAC con **Sign requests / firmar siempre**. Esta opción también usa HTTPS hacia S3.
3. Aplica la política del bucket que permite `s3:GetObject` al principal `cloudfront.amazonaws.com`, condicionada al ARN de **tu distribución**. No uses `Principal: "*"` como solución a un 403. Para SSE-KMS revisa además los permisos de la clave. La [guía oficial de OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) contiene las políticas y su configuración.
4. Define `index.html` como **Default root object**, sin barra inicial, y redirige HTTP a HTTPS para visitantes. Espera a que termine el despliegue de la distribución.
5. Comprueba que CloudFront entrega `index.html` y un asset, mientras una solicitud anónima al mismo objeto directamente en S3 se deniega. **OAC no autentica a los visitantes:** el contenido sigue siendo público a través de CloudFront salvo que añadas un control para ellos.
6. Si usas un dominio propio, asocia el nombre alternativo, un certificado ACM que cubra ese nombre en **us-east-1**, y DNS hacia CloudFront. Route 53 es opcional: puedes conservar otro proveedor DNS. Revisa los [requisitos de certificados de CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html).

La [guía de CloudFront de este blog](/blog/amazon-cloudfront-comprendiendo-el-cdn-de-aws/) desarrolla este recorrido y sus políticas de caché.

### Rutas de SPA, páginas generadas y errores reales

El objeto raíz predeterminado resuelve `/`, pero **no convierte `/productos/42` en `/index.html` ni busca automáticamente un index en cada carpeta**. Así lo explica la [documentación de Default root object](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DefaultRootObject.html).

Para una SPA puedes usar una función de CloudFront en viewer request que reescriba únicamente las rutas de navegación conocidas hacia `/index.html`. Excluye rutas de assets y API. Para un sitio generado con `/guia/index.html`, necesitas resolver `/guia/` a ese objeto; devolver la portada no sirve.

Convertir globalmente todos los 403/404 en `index.html` con 200 puede esconder una política OAC rota o un JavaScript eliminado. En un origen privado, un objeto ausente también puede terminar como 403: comprueba su existencia antes de concluir que fallan los permisos. Tu prueba debe distinguir navegación válida, página inexistente y asset inexistente.

## Caché y despliegues: por qué ves una versión anterior

Usa nombres con hash para assets que cambian, como `app.a83f1.js`, y un TTL largo solo si cada cambio genera una ruta nueva. Para HTML que referencia esos assets, elige revalidación o una vigencia corta. Si necesitas respetar `Cache-Control: no-cache`, el **TTL mínimo de la política de CloudFront debe ser cero**; con un mínimo mayor, la CDN puede conservar la respuesta aunque el origen pida no cachearla. Consulta las [reglas de expiración y Cache-Control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html).

En despliegues propios a S3, publica los assets nuevos antes del HTML y conserva los anteriores mientras los clientes puedan necesitarlos. Subir una carpeta no constituye un despliegue atómico. Cambiar los metadatos locales tampoco garantiza que una sincronización vuelva a copiar archivos sin cambios.

Una invalidación retira copias en CloudFront; no borra la caché del navegador ni de un service worker. Verifica `Cache-Control`, `Age`, `Content-Type` y la URL exacta en Network. AWS compara [invalidar contenido y versionar archivos](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html).

## Login, APIs y secretos: qué necesita el backend

Para registrar e iniciar sesión puedes usar **Cognito User Pools**, directamente o mediante Amplify Auth. Una SPA es un cliente público: no puede proteger un client secret. Para login OAuth usa un cliente público y [authorization code con PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html); los identificadores públicos no son contraseñas. Revisa las [opciones de clientes de Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html).

Para operaciones propias puedes añadir **API Gateway + Lambda**. Una HTTP API admite un [autorizador JWT](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html), pero la app también debe comprobar permisos sobre cada recurso. Amplify Data/AppSync es otra opción cuando necesitas su API de datos; no hace falta sumar ambas por defecto. Para practicar una integración sencilla, sigue el [tutorial de Lambda y HTTP API](/blog/aws-lambda-y-api-gateway-guia-basica/).

No pongas claves IAM permanentes, contraseñas de bases de datos ni secretos de terceros en el bundle. Las variables que tu framework incorpora al JavaScript del navegador son públicas aunque se configuren en una consola. Guarda y utiliza secretos en el backend, con el [mecanismo de secretos de Amplify Gen 2](https://docs.amplify.aws/react/build-a-backend/functions/environment-variables-and-secrets/) o el servicio adecuado para tu arquitectura. Una variable disponible durante el build tampoco está automáticamente disponible al runtime SSR: sigue la [configuración de variables para el servidor de Amplify](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html).

Si el navegador necesita acceder directamente a servicios AWS, usa credenciales temporales con permisos limitados, por ejemplo mediante Cognito Identity Pools. Para una API propia, normalmente transmite el token a la API en vez de entregar las credenciales del despliegue. **CORS no sustituye autenticación ni autorización.**

## Diagnóstico rápido

| Síntoma | Primera comprobación |
| --- | --- |
| Build correcto, web vacía | Directorio de artefactos, ruta base y errores JavaScript en Network/Console. |
| Portada funciona, recargar una ruta falla | Modalidad de renderizado y regla de navegación. |
| Error MIME o `Unexpected token '<'` al cargar JS | La URL de un asset recibió HTML por un fallback demasiado amplio. |
| CloudFront devuelve 403 | Objeto y mayúsculas, origen elegido, OAC y política; SSE-KMS si corresponde. |
| Despliegue nuevo muestra código viejo | HTML y assets, TTL, caché del navegador y service worker. |
| API funciona con curl pero falla en navegador | Preflight, origen y cabeceras CORS; revisa también el error real de la API. |
| SSR falla aunque la parte estática carga | Compatibilidad, adaptador, logs del runtime y acceso a configuración/backend. |

Para el caso del navegador, la [guía de diagnóstico CORS de API Gateway](/blog/guia-completa-para-depurar-errores-cors-en-api-gateway/) separa preflight, authorizers y respuestas de error. Lleva al diagnóstico una URL, su estado y su respuesta: “es un 403” no identifica por sí solo la causa.

## Cuánto cuesta y qué retirar al terminar

No hay una opción universalmente gratuita o más barata. Estima **builds, almacenamiento, tráfico y, para SSR, solicitudes y duración de cómputo** en [Amplify Hosting](https://aws.amazon.com/amplify/pricing/). Para S3 y CloudFront, revisa [almacenamiento y solicitudes S3](https://aws.amazon.com/s3/pricing/) y [precios y planes CloudFront](https://aws.amazon.com/cloudfront/pricing/), incluidas sus condiciones. Dominios, DNS, WAF, logs y servicios del backend pueden añadir cargos.

Una cuota o crédito depende de la oferta aplicable a tu cuenta; no garantiza costo cero. Configura alertas de gasto y revisa consumo tras publicar. La [guía de seguridad y control de costos](/blog/seguridad-y-control-de-costos-en-aws-guia-2024/) desarrolla esos controles.

Al terminar una práctica, elimina la app Hosting y comprueba sus backends asociados y recursos creados aparte. Con CloudFront, deshabilita la distribución, espera su despliegue y sigue el [procedimiento de eliminación](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HowToDeleteDistribution.html); un plan de tarifa fija tiene condiciones adicionales de cancelación. Retira los recursos exclusivos del ejercicio y vacía el bucket, incluidas versiones si existen, antes de eliminarlo.

## Recursos en español y comunidad para continuar

Elige la continuación según lo que quieras practicar. Las grabaciones y artículos históricos pueden usar otra consola, generación de Amplify o mecanismo de acceso; verifica sus instrucciones con las fuentes actuales antes de ejecutarlas.

- **Entender Amplify con una aplicación:** [introducción full stack de Marcia Villalba](https://www.youtube.com/watch?v=xIy0KVMOHHw), [sesión sobre aplicaciones web de AWS User Group Mixtli](https://www.youtube.com/watch?v=1AZPzfWFnDg) y [charla full stack de AWS Girls Argentina](https://www.youtube.com/watch?v=FIYXT5cZjas). Son explicaciones complementarias de creadores y comunidades; no suponen que sus comandos correspondan a Gen 2. Para construir con el flujo vigente, sigue el [quickstart oficial de Amplify Gen 2](https://docs.amplify.aws/react/start/quickstart/).
- **Ver una arquitectura de hosting estático:** [Vue.js, S3, CloudFront, WAF y CI/CD, de Eliezer Rangel en AWS User Group Panamá](https://www.youtube.com/watch?v=Y6PScTDqAsU). Sirve para estudiar la combinación de servicios; WAF es una decisión adicional, no un requisito para publicar cada sitio.
- **Definir infraestructura como código:** [sitio web con AWS SAM de Diana Alfaro](https://blog.alfalfita.cloud/sitio-web-sin-servidor-con-aws-sam) y su [grabación publicada por AWS Girls Chile](https://www.youtube.com/watch?v=nD6tq5HH51I). El artículo de 2023 usa OAI: adapta ese acceso a OAC si partes de la configuración propuesta aquí.
- **Automatizar y separar despliegues:** [sesión sobre CI/CD de AWS User Group Guatemala](https://www.youtube.com/watch?v=1XNA7-MJWJU) y [experiencia de Diana Alfaro con microfrontends y Amplify](https://blog.alfalfita.cloud/despliegue-de-microfrontends). Esta última, de 2023, usa CLI Gen 1 y OAI; es una referencia para despliegues independientes, no una receta Gen 2 ni un motivo para dividir una app pequeña.
- **Añadir lógica de entrega:** [CloudFront Functions con Carlos Cortez](https://www.youtube.com/watch?v=Dfd6aCSVwUE). Complementa el trabajo con rutas; una función de CDN no convierte S3 en un runtime SSR completo.
- **Entender identidad y APIs:** [primeros pasos con Cognito de Alejandro Condori en AWS User Group Perú](https://www.youtube.com/watch?v=PXS2_s2tKnc) y [API Gateway, Cognito y FastAPI de AWS User Group Medellín](https://www.youtube.com/watch?v=j7REV2ZO_Ec). El [artículo de Andres Moreno sobre Cognito y SAM](https://andmore.dev/es/blog/api-cognito/) trata el flujo client credentials entre máquinas: su client secret pertenece a un cliente de backend, nunca a una SPA.
- **Seguir la protección del hosting:** [episodio de Desplegando.cloud sobre Amplify Hosting y WAF](https://www.youtube.com/watch?v=hpBiGK0u07E). Revisa precios y disponibilidad antes de activar protección adicional.

Para seguir contenido, visita el [canal de AWS User Group Mixtli](https://www.youtube.com/@awsugmixtli), el [canal de AWS User Group Panamá](https://www.youtube.com/channel/UCjr_J7Xva8QsHP31JfzYsYA), el [blog Alfalfita de Diana Alfaro](https://blog.alfalfita.cloud/) y [Desplegando.cloud](https://desplegando.substack.com/). Cada uno ofrece una continuación distinta: sesiones, experiencias de desarrollo o novedades.

Para conversar sobre tu proyecto, conoce [AWS User Group Mixtli en Cholula](https://awsugmixtli.com/) y el [portal de AWS User Group Perú](https://awsugperu.cloud/), o busca un grupo cercano en el [directorio de comunidades](/comunidades/). Son comunidades generales de AWS donde también puedes aprender redes, seguridad y backend. El [Discord oficial de Amplify](https://discord.com/servers/aws-amplify-705853757799399426) está enfocado en esa herramienta y señala inglés como idioma.

Como continuación sobre decisiones de backend, el evento online [“EC2 vs Lambda”, de AWS User Group Tlaxcala FireflyCloud](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/), figura para el **16 de octubre de 2026, de 16:00 a 17:00, UTC−6**, al revisar esta guía. No es una sesión de frontend: compara cómputo y costos para desplegar aplicaciones. La página indica que el enlace online es visible para asistentes; confirma fecha, registro y condiciones en la convocatoria. Para otras oportunidades consulta la [agenda de eventos](/eventos/).

Cuando pidas ayuda, comparte framework y versión, modalidad de renderizado, ruta que falla, estado HTTP y un ejemplo reducido sin tokens, secretos ni datos personales.

## Preguntas frecuentes

### ¿Puedo publicar React en S3 sin usar Amplify?

Sí, si el resultado es un build estático. Añade CloudFront para HTTPS y distribución, conserva el origen privado con OAC y configura las rutas de la SPA. Si React forma parte de una app con SSR, necesitas además un runtime compatible.

### ¿CloudFront ejecuta Next.js?

CloudFront distribuye contenido y dirige solicitudes hacia un origen. No ejecuta por sí solo el servidor Next.js; esa ejecución corresponde a Hosting compute u otra arquitectura de cómputo. Una exportación estática es un caso diferente.

### ¿Un bucket privado hace privada mi aplicación?

No. OAC puede impedir acceso directo a S3 mientras CloudFront entrega los archivos públicamente. Para proteger datos, autoriza las operaciones en el backend; para restringir archivos entregados por la CDN, evalúa URL o cookies firmadas y su configuración de acceso.

### ¿Necesito una certificación AWS para desplegar un frontend?

No. Necesitas entender el build de tu app, permisos, costos y el recorrido de sus solicitudes. Practica primero con archivos y datos ficticios, verifica el resultado y retira los recursos al terminar.
