---
title: "AWS SAM: qué es y cómo desplegar una API sencilla"
description: "Entiende AWS SAM y sigue un ejemplo reproducible con Lambda y API Gateway: crea la plantilla, prueba localmente, despliega, comprueba la respuesta y elimina la pila."
author: "guille-ojeda"
publishedAt: "2024-11-27"
publishedTimestamp: "2024-11-27T02:20:00.277Z"
modifiedTimestamp: "2026-10-05T13:23:09-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS SAM CLI: pruebas locales y resolución de errores"
    url: "https://dondeaprendoaws.com/blog/aws-sam-cli-pruebas-y-desarrollo-local/"
---

AWS Serverless Application Model (AWS SAM) es una especificación y un conjunto de herramientas para definir aplicaciones serverless como infraestructura en código. Su sintaxis amplía AWS CloudFormation con recursos abreviados para funciones, APIs y otros componentes; al desplegar, SAM los transforma en recursos de CloudFormation. AWS SAM CLI es la herramienta de terminal que ayuda a crear, compilar, probar y desplegar ese proyecto. [Cómo funciona AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam-overview.html) explica la diferencia entre plantilla y CLI.

Este ejemplo crea una función Lambda que devuelve un saludo y la conecta a una ruta `GET /hola` de API Gateway. Primero se compila y ejecuta localmente en Docker; después se despliega como una pila de CloudFormation, se consulta la URL pública y se elimina la pila.

<div><iframe allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" height="315" loading="lazy" src="https://www.youtube-nocookie.com/embed/Z_GAa9WToMM" title="Introducción a AWS SAM — Marcia Villalba, Desplegando Cloud" width="560"></iframe></div>

## Antes de empezar

Para probar el ejemplo localmente necesitas AWS SAM CLI, Docker con el daemon activo y un runtime de Python compatible. Aquí se usa `python3.12`, que sigue disponible en Lambda; comprueba la [lista vigente de runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) antes de iniciar un proyecto. La guía general de [prerrequisitos de AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/prerequisites.html) incluye AWS CLI y acceso configurado a la cuenta para las operaciones en la nube. Esta función no llama a AWS; las invocaciones locales incluyen `--region us-east-1` y no necesitan credenciales para devolver el saludo. Antes de desplegar sí necesitarás AWS CLI con un perfil autorizado. Consulta las [instrucciones oficiales de instalación de SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).

El despliegue crea recursos en una cuenta AWS y puede generar cargos por uso de Lambda, API Gateway, CloudWatch Logs y almacenamiento de artefactos. Revisa los cambios antes de confirmarlos y consulta los [precios de Lambda](https://aws.amazon.com/lambda/pricing/) y [API Gateway](https://aws.amazon.com/api-gateway/pricing/). La ruta de este ejemplo no tiene autenticación y estará disponible públicamente mientras la pila exista: úsala solo para el saludo de prueba.

Los comandos siguientes usan sintaxis de Bash; en otra terminal, adapta la continuación de líneas con `\`. Si cambias `us-east-1`, usa la misma región en el despliegue, la comprobación y la eliminación de recursos.

## 1. Crear el proyecto

Crea esta estructura de carpetas y archivos en un directorio vacío llamado `sam-minimo`:

```text
sam-minimo/
├── events/
│   └── consulta.json
├── src/
│   └── app.py
└── template.yaml
```

En `template.yaml`, define la función y su evento HTTP:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: API mínima para aprender AWS SAM

Resources:
  HolaMundoFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/
      Handler: app.handler
      Runtime: python3.12
      Events:
        HolaMundoApi:
          Type: Api
          Properties:
            Path: /hola
            Method: get

  HolaMundoFunctionLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub '/aws/lambda/${HolaMundoFunction}'
      RetentionInDays: 1
    DeletionPolicy: Delete

Outputs:
  HolaMundoApi:
    Description: URL pública de la API de prueba
    Value: !Sub 'https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/hola'
```

El evento `Api` hace que SAM genere una API REST implícita, con una etapa `Prod`; por eso el output usa el recurso `ServerlessRestApi` y la ruta `/Prod/hola`. Puedes ver el comportamiento de esta [API implícita de SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-api.html). La plantilla declara el grupo de CloudWatch Logs con retención de un día para que forme parte de la pila y CloudFormation lo elimine junto con ella. SAM crea un rol de ejecución básico para escribir logs. Si agregas llamadas a otros servicios, concede al rol solo las acciones y recursos que la función necesite. El rol de ejecución de Lambda es distinto de las credenciales de tu perfil para desplegar; consulta [cómo definir permisos para el rol de ejecución](https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html) y aplica el [principio de mínimo privilegio en IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/getting-started-reduce-permissions.html).

En `src/app.py`, escribe el manejador:

```python
import json


def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json; charset=utf-8"},
        "body": json.dumps({"mensaje": "Hola desde AWS SAM"}, ensure_ascii=False),
    }
```

`Handler: app.handler` corresponde al archivo `app.py` y a la función `handler`. El ejemplo usa la biblioteca estándar de Python; no necesita instalar dependencias ni llama a otros servicios AWS.

Crea `events/consulta.json` con un evento vacío:

```json
{}
```

## 2. Compilar y probar en local

Desde el directorio `sam-minimo`, compila el proyecto:

```sh
sam build --region us-east-1
```

La región evita el error de región sin configurar que puede mostrar SAM CLI aunque la función se ejecute solo localmente. `sam build` prepara el código para pruebas o despliegue. Si trabajas con dependencias nativas que deben coincidir con Linux y con el runtime de Lambda, puedes compilar en el contenedor de Lambda:

```sh
sam build --use-container --region us-east-1
```

Ese modo requiere Docker. Para este ejemplo, sin dependencias externas, `sam build` es suficiente. La [guía de compilación de AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-build.html) detalla cuándo usar cada opción.

Invoca la función con el evento que creaste:

```sh
sam local invoke --region us-east-1 HolaMundoFunction --event events/consulta.json
```

La respuesta debería contener el código `200` y el cuerpo `{"mensaje": "Hola desde AWS SAM"}`. Para recorrer la ruta HTTP local, inicia el servidor:

```sh
sam local start-api --region us-east-1 --port 3000
```

En otra terminal, consulta `GET /hola`:

```sh
curl -i http://127.0.0.1:3000/hola
```

Esta prueba ejecuta Lambda en Docker y levanta un servidor HTTP local; no despliega recursos ni emula todos los servicios de AWS. El ejemplo no tiene llamadas al SDK, así que la invocación local no necesita credenciales ni accede a la cuenta. Si quieres depurar con breakpoints o entender fallos de Docker y de eventos, continúa con [la guía de pruebas y resolución de errores de AWS SAM CLI](/blog/aws-sam-cli-pruebas-y-desarrollo-local/).

## 3. Preparar el acceso a AWS

Para desplegar con IAM Identity Center, configura una vez el perfil y luego inicia sesión:

```sh
aws configure sso --profile sam-dev
aws sso login --profile sam-dev
aws sts get-caller-identity --profile sam-dev
```

Sigue las instrucciones de configuración de tu organización cuando AWS CLI pregunte por la URL de inicio, la región y el conjunto de permisos. El último comando comprueba qué identidad está activa. Si tu equipo te indicó otro método de autenticación, usa su perfil autorizado. No crees claves raíz ni agregues políticas amplias para hacer que el tutorial funcione: pide los permisos acotados que correspondan. La identidad de despliegue necesita administrar la pila y los recursos definidos, cargar artefactos y permitir que CloudFormation cree o use el rol de Lambda. Durante el despliegue guiado, revisa la solicitud de permisos de IAM. La autorización del usuario para desplegar no sustituye el rol de ejecución de la función.

Antes de desplegar, valida la plantilla con el perfil configurado:

```sh
sam validate --template-file template.yaml --profile sam-dev --region us-east-1
```

La [guía oficial de validación de SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-using-validate.html) pide credenciales configuradas para este comando. Por eso aparece después de preparar el acceso; ejecutar la función aislada con `sam local` es una operación distinta.

## 4. Desplegar la pila

En la misma carpeta, inicia el despliegue guiado:

```sh
sam deploy --guided --profile sam-dev --region us-east-1
```

Cuando SAM pregunte el nombre de la pila, escribe `sam-minimo`. Confirma la región y revisa el conjunto de cambios antes de responder que sí. SAM empaqueta el código, lo carga a S3 si hace falta y pide a CloudFormation que cree la API, la función, el rol de ejecución y el grupo de logs. La configuración guiada queda guardada en `samconfig.toml`. Lee la [guía oficial de despliegue con SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-deploy.html) antes de confirmar la operación.

## 5. Comprobar y eliminar los recursos

Al terminar, SAM muestra el output `HolaMundoApi` con la URL pública. También puedes consultar el estado de la pila:

```sh
aws cloudformation describe-stacks \
  --stack-name sam-minimo \
  --query 'Stacks[0].StackStatus' \
  --output text \
  --profile sam-dev \
  --region us-east-1
```

Cuando la pila figure como `CREATE_COMPLETE`, copia la URL de `HolaMundoApi` del resultado del despliegue y consulta la ruta:

```sh
curl -i 'https://ID.execute-api.us-east-1.amazonaws.com/Prod/hola'
```

Sustituye `ID` por el identificador incluido en la URL de `HolaMundoApi`. Debes recibir una respuesta HTTP `200` con el saludo. Después de comprobarla, elimina la pila:

```sh
sam delete --stack-name sam-minimo --profile sam-dev --region us-east-1
```

Confirma que el nombre corresponde a esta pila de prueba y sigue los mensajes del comando. El grupo de logs declarado se elimina como parte de la pila. Verifica en CloudFormation que la pila llegue a `DELETE_COMPLETE`; después, revisa S3 por si el bucket administrado para artefactos de SAM quedó disponible. No elimines un bucket compartido por otras aplicaciones. Consulta la [referencia del comando `sam delete`](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-delete.html).

## Ejemplos, canales y comunidades

Si quieres examinar una API más completa, la [plantilla SAM para una API con arquitectura hexagonal](https://github.com/y3sidDeve/sam-template-api) es un ejemplo comunitario de CRUD con DynamoDB; revisa su estructura, dependencias y permisos antes de decidir desplegarla. Para pasar de una aplicación pequeña a CI/CD, mira la sesión de 2024 sobre [pipelines con AWS SAM del canal AWS Girls Chile](https://www.youtube.com/watch?v=H7n-2FUFQVI), visita su [canal de YouTube](https://www.youtube.com/@AWSGirlsChile) y consulta su [página comunitaria en Meetup](https://www.meetup.com/aws-girls-chile-group/). El catálogo muestra charlas y actividades publicadas por el grupo; revisa la agenda antes de planear asistir. AWS también documenta [cómo usar SAM con pipelines CI/CD](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/deploying-cicd-overview.html).

Cuando empieces a repetir estructuras entre varios proyectos, el artículo de AndMore Dev sobre [plantillas SAM personalizadas](https://www.andmore.dev/blog/how-to-build-a%20custom-sam-template), publicado en inglés en 2023, muestra el uso de plantillas Cookiecutter con `sam init`; confirma las opciones vigentes en la [guía actual de AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam-overview.html). Para añadir autenticación a API Gateway, AndMore Dev explica [un authorizer de Amazon Cognito con SAM](https://www.andmore.dev/es/blog/api-cognito/). Ese ejemplo utiliza el flujo M2M `client_credentials`: las solicitudes de tokens pueden generar cargos según los [precios actuales de Cognito](https://aws.amazon.com/cognito/pricing/) y las [reglas de facturación M2M](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html).

La [colección de recursos serverless en español](/aprender/serverless/) reúne tutoriales, videos y ejemplos de distintas fuentes. Para conversar con otros desarrolladores, explora las [comunidades AWS por país](/comunidades/) y los [próximos eventos y encuentros](/eventos/). También puedes volver a [las pruebas locales con AWS SAM CLI](/blog/aws-sam-cli-pruebas-y-desarrollo-local/) para elegir entre mocks, contenedores Docker e integración en una pila de desarrollo.
