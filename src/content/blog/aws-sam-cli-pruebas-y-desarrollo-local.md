---
title: "AWS SAM CLI: pruebas locales y resolución de errores"
description: "Prueba funciones Lambda y rutas HTTP con AWS SAM CLI y Docker. Compara mocks con pruebas en AWS y aprende a diagnosticar fallos comunes."
author: "guille-ojeda"
publishedAt: "2024-11-27"
publishedTimestamp: "2024-11-27T00:08:23.504Z"
modifiedTimestamp: "2026-10-05T13:23:09-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS SAM: qué es y cómo desplegar una API sencilla"
    url: "https://dondeaprendoaws.com/blog/aws-sam-guia-basica-para-aplicaciones-serverless/"
---

AWS SAM CLI te permite ejecutar el código de una función Lambda en un contenedor local y probar rutas HTTP con un servidor local. Así puedes revisar cómo procesa un evento tu código, qué respuesta produce y dónde falla. Estas pruebas no convierten tu computadora en una copia completa de AWS ni comprueban por sí solas IAM, API Gateway desplegado o la comunicación real entre servicios.

Hay tres niveles que conviene distinguir. Una prueba unitaria con *mocks* sustituye dependencias externas con respuestas controladas y verifica la lógica de tu código. `sam local` ejecuta la función dentro de Docker con un evento y emula una ruta HTTP local. Una prueba de integración en AWS ejercita recursos, permisos y configuración desplegados. La [guía de pruebas serverless de AWS](https://docs.aws.amazon.com/lambda/latest/dg/testing-guide.html) explica sus alcances y límites.

## Requisitos para ejecutar pruebas locales

Instala [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) y Docker, e inicia el daemon de Docker. SAM CLI necesita Docker para ejecutar las funciones con `sam local invoke` y `sam local start-api`. Comprueba ambas instalaciones:

```sh
sam --version
docker info
```

Si `docker info` no puede conectarse al servidor, abre Docker Desktop o inicia el daemon que uses. La validación de plantillas y algunas compilaciones pueden ejecutarse sin Docker; `sam build --use-container` sí lo necesita porque compila dentro de un contenedor parecido al runtime de Lambda. Consulta la [guía de Docker para SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-docker.html).

Para que SAM CLI conozca una región, los ejemplos usan `--region us-east-1`; puedes sustituirla por otra región en la que trabajes. Esta opción no crea recursos en AWS. La invocación local del ejemplo complementario no necesita credenciales para devolver el saludo porque la función no llama a otros servicios. La documentación de [`sam validate`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-using-validate.html) sí pide credenciales configuradas; no confundas ese requisito con la ejecución local del código. Si tu propio código usa un SDK de AWS, las credenciales locales y los nombres de recursos que le pases pueden hacer que llame a recursos reales. Una invocación local no adopta el rol IAM de la función desplegada. Usa recursos separados de desarrollo y credenciales con permisos limitados.

## Invocar una función con un evento de prueba

En la carpeta del proyecto, `sam build` prepara el código para las pruebas. Si ya existe `.aws-sam` y cambiaste el código, vuelve a compilar antes de invocar; de lo contrario, podrías probar una compilación anterior. El tutorial complementario incluye `events/consulta.json` y el ID lógico de esta función:

```sh
sam build --region us-east-1
sam local invoke --region us-east-1 HolaMundoFunction --event events/consulta.json
```

El comando imprime la respuesta y los logs de la función. La [guía de `sam local invoke`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-local-invoke.html) explica cómo pasar eventos con `--event` y variables de entorno con `--env-vars`. Un evento creado con `sam local generate-event` reproduce la estructura de un mensaje; no sube un archivo a S3 ni hace que ese servicio invoque la función.

## Probar una ruta HTTP local

Para una función conectada a API Gateway mediante una plantilla SAM, inicia el servidor local y consulta la ruta declarada. El artículo [AWS SAM: qué es y cómo desplegar una API sencilla](/blog/aws-sam-guia-basica-para-aplicaciones-serverless/) incluye un proyecto reproducible con `GET /hola`.

```sh
sam local start-api --region us-east-1 --port 3000
```

En otra terminal:

```sh
curl -i http://127.0.0.1:3000/hola
```

El servidor local traduce esa solicitud a un evento de Lambda y devuelve su respuesta HTTP. Prueba también rutas inexistentes y métodos distintos. Esto no verifica la URL pública, la autenticación, las cuotas, las políticas ni la configuración efectiva de API Gateway en AWS. Consulta las opciones en [la guía de `sam local start-api`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-local-start-api.html).

## Depurar código y diagnosticar errores

SAM CLI puede iniciar una función en modo de depuración y abrir un puerto para que se conecte un depurador compatible:

```sh
sam local invoke --region us-east-1 --debug-port 5858 HolaMundoFunction --event events/consulta.json
```

Ese comando prepara el puerto, pero no instala ni conecta el depurador del editor. Para usar breakpoints, configura el adaptador apropiado para tu runtime y editor; el [AWS Toolkit for VS Code](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/serverless-apps.html) incluye pasos para funciones Python y otros runtimes compatibles. Consulta también la [guía oficial de depuración local con AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-using-debugging.html). El indicador `--debug` muestra logs más detallados de SAM CLI; por sí solo no recorre el código de la función.

| Síntoma | Qué revisar |
| --- | --- |
| Docker no responde | Confirma con `docker info` que el daemon esté activo y que tu usuario pueda ejecutar contenedores. |
| SAM no encuentra la función | Comprueba que el ID lógico de `sam local invoke` coincida con la plantilla y que `Handler` señale el archivo y la función correctos. |
| El resultado no refleja el último cambio | Ejecuta `sam build --region us-east-1` otra vez si ya habías generado `.aws-sam`. |
| La ruta local devuelve 404 | Compara el método y la ruta de `curl` con los declarados en `Events` para la función. |
| Un SDK devuelve `AccessDenied` | En local podría usar tus credenciales; en AWS, revisa el rol de ejecución de Lambda y sus políticas. Son identidades distintas. |
| La función local responde, pero falla al desplegar | Revisa los eventos de CloudFormation, la configuración del servicio y el rol IAM. Una respuesta local correcta no cubre esas integraciones. |

## Qué cubre cada prueba

| Prueba | Comprueba | No demuestra |
| --- | --- | --- |
| Unidad con *mocks* | Lógica y respuestas ante dependencias controladas. | Que un servicio real acepte la solicitud o los permisos. |
| `sam local invoke` o `sam local start-api` | Código, formato del evento y manejo de la respuesta en el runtime local de Lambda. | Que AWS aplique las políticas IAM, active el trigger o configure API Gateway como esperas. |
| Integración en una cuenta de desarrollo | El comportamiento conjunto de servicios, roles, recursos y configuración desplegados. | Que producción tenga la misma configuración o que la prueba cubra todos los casos. |

Cuando una prueba dependa de IAM, triggers o integraciones reales, usa una pila de desarrollo aislada. `sam sync` construye y envía cambios a AWS; no es un simulador local. Úsalo solo contra una pila de desarrollo, nunca producción. Para producción, AWS recomienda `sam deploy` o un pipeline CI/CD. Revisa [qué hace `sam sync`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-sync.html) antes de usarlo.

## Recursos y comunidades para continuar

La grabación de 2023 [AWS SAM paso a paso: pruebas locales y pipelines](https://www.youtube.com/watch?v=4yh1A3reAiQ), de Marcia Villalba, muestra un recorrido comunitario de la herramienta. Para patrones de prueba más amplios, mira la charla de 2024 de AWS Women Colombia sobre [pruebas de aplicaciones serverless](https://www.youtube.com/watch?v=4x3V6JUBs4Y). Las guías actuales de AWS son la referencia para runtimes y opciones de SAM CLI.

Como ejemplo más avanzado de integración por eventos, el [POC de Lambda y SQS de Rafael Reines](https://github.com/reines-dev/poc_lambda_sqs) incluye una plantilla SAM y una invocación local con un evento de muestra. Su README también indica un despliegue que crea Lambda, SQS y buckets S3; para probarlo en AWS, usa una cuenta de desarrollo, revisa los cargos vigentes y elimina la pila al terminar.

Si quieres conversar sobre estos temas, puedes consultar la agenda del [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) o [ver sus eventos publicados en el directorio](/eventos/?community=meetup-38519948). La ficha del [grupo en el catálogo de comunidades](/comunidades/colombia/#resource-meetup-38519948) enlaza también con su página de Meetup. Para explorar más [recursos serverless en español](/aprender/serverless/), [comunidades AWS](/comunidades/) y [eventos y encuentros](/eventos/), usa esos directorios.
