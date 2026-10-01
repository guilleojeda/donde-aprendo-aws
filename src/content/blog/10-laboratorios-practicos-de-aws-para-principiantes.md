---
title: "10 Laboratorios Prácticos de AWS para Principiantes"
description: "Diez prácticas de AWS con resultados verificables, recursos de la comunidad y pasos de limpieza: de un bucket privado en S3 a tu primera API."
publishedAt: "2024-05-18"
publishedTimestamp: "2024-05-18T00:59:00.192Z"
cover: "/assets/blog/e9f2fc671d3e9516f2345bb7.png"
coverAlt: "Nube central rodeada por círculos con iconos de distintos dispositivos"
indexOrder: 2
ogImage: "/assets/blog/e9f2fc671d3e9516f2345bb7.png"
related: []
---

*Revisado el 29 de septiembre de 2026.*

La primera vez que entras en AWS es fácil recorrer menús sin saber si realmente aprendiste algo. En estos diez laboratorios harás lo contrario: cada uno termina con una comprobación concreta. Crearás un archivo privado en S3, lo publicarás a través de CloudFront sin abrir el bucket, ejecutarás una función, leerás sus registros y expondrás una pequeña API. También practicarás permisos, datos, redes y despliegues.

Esta es una ruta para experimentar en una cuenta propia de aprendizaje. No son diez certificaciones ni diez proyectos listos para producción. Puedes detenerte después de cualquier ejercicio. Los enlaces de la comunidad ofrecen explicaciones o proyectos para continuar; cuando un video explica un concepto, no lo presentamos como si fuera un laboratorio que construye la solución por ti.

## Antes de crear recursos

Necesitas una cuenta de AWS y acceso a la consola con permisos para los servicios que uses. Trabaja con una identidad de uso cotidiano, **no con el usuario raíz**. Si acabas de abrir la cuenta, sigue primero la [guía de AWS para configurar el acceso](https://docs.aws.amazon.com/IAM/latest/UserGuide/getting-started-account-iam.html). Conserva el nombre y la Región de cada recurso que crees; CloudFront es global, pero S3, Lambda, DynamoDB, API Gateway, VPC y los grupos de registros se consultan por Región. Si tu organización restringe alguno de estos servicios, realiza la práctica en una cuenta de aprendizaje autorizada.

**Revisa el costo antes de empezar.** La [página de AWS Free Tier](https://aws.amazon.com/free/) explica las condiciones vigentes de tu plan; no supongas que cada servicio o configuración será gratis. Algunos recursos generan cargos por almacenamiento, solicitudes, transferencias o tiempo de uso, incluso cuando apenas los pruebas. En el primer laboratorio configurarás una alerta. Una alerta **no detiene automáticamente el gasto**. Haz las pruebas con archivos pequeños y datos ficticios, y elimina lo que ya no necesites.

| # | Lo que vas a comprobar | Tiempo orientativo de práctica* |
|---:|---|---:|
| 1 | Un presupuesto y su alerta están configurados | 15–25 min |
| 2 | Un archivo está en S3 sin acceso público | 20–30 min |
| 3 | Una política permite leer ese archivo, pero no modificarlo | 20–30 min |
| 4 | CloudFront entrega el archivo sin hacer público el bucket | 45–75 min |
| 5 | Una función Lambda responde a una prueba | 20–30 min |
| 6 | Encuentras la invocación en CloudWatch Logs | 15–20 min |
| 7 | DynamoDB devuelve un elemento por su clave | 20–30 min |
| 8 | Una HTTP API llama a tu función | 25–40 min |
| 9 | Una subred tiene una ruta local, sin salida a internet | 20–30 min |
| 10 | CloudFormation crea un tema SNS y recibes una prueba | 30–45 min |

*Los tiempos son estimaciones para orientarte. No incluyen ver las grabaciones, obtener permisos ni esperar despliegues que pueden tardar más.*

Los ejercicios 2–4 reutilizan el mismo bucket; los 5, 6 y 8, la misma función. Sigue ese orden si quieres aprovechar lo creado. Los demás pueden hacerse por separado. Si te faltan conceptos, el [recorrido de primeros pasos](/recorridos/#primeros-pasos) organiza materiales introductorios. También puedes acompañar la ruta con el [curso de AWS para principiantes de Cultura DevOps](https://www.youtube.com/playlist?list=PLdOotbFwzDIgjeTHvCSLiGmKKzTpDsLLI): úsalo para entender los servicios, no para copiar sin revisar configuraciones de una grabación anterior.

Los recursos de la comunidad que aparecen más abajo combinan cursos, charlas y artículos. Puedes seguirlos desde cualquier país. Unos explican la decisión detrás del ejercicio; otros muestran proyectos para continuar cuando termines. Como algunas guías tienen varios años, contrasta sus pasos de consola y versiones de herramientas con la documentación actual enlazada en cada laboratorio.

## 1. Configura una alerta de costos que entiendas

Un presupuesto convierte un número abstracto en una señal que podrás vigilar mientras experimentas. En **Billing and Cost Management → Budgets**, crea un presupuesto de costo mensual con un importe pequeño que tenga sentido para ti y añade una notificación a tu correo cuando el gasto real alcance, por ejemplo, el 80 %. Revisa el resumen antes de guardar: debe mostrar el período, el importe, el umbral y el destinatario correctos. La [guía de AWS para crear un presupuesto](https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html) muestra el flujo completo.

**Comprueba:** el presupuesto aparece en la lista con la alerta configurada. No provoques gastos para intentar recibir el correo. Las alertas dependen de la actualización de datos de facturación y pueden llegar después de que se produzca el consumo.

**Al terminar:** puedes conservar el presupuesto si seguirás practicando; es un control útil. Si fue solo una prueba, elimínalo desde Budgets. Revisa también el precio aplicable a los presupuestos de tu cuenta.

**Para aprender con la comunidad:** la [sesión de monitoreo y costos del AWS User Group Medellín](https://www.youtube.com/watch?v=2cGwdSTdUqQ) sitúa AWS Budgets junto a Cost Explorer y CloudWatch. Es una grabación para entender cuándo usar cada herramienta; usa la guía actual de AWS para los pasos de consola.

## 2. Guarda una página en S3 sin hacer público el bucket

Crea en tu computadora un archivo `index.html` pequeño, por ejemplo:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <title>Mi primer laboratorio</title>
  </head>
  <body>
    <h1>Hola desde AWS</h1>
  </body>
</html>
```

En S3, [crea un bucket de uso general](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html) con un nombre único que reconozcas, como `daw-lab-tu-alias-2026`, y anota su Región. Mantén activado **Block Public Access** y conserva la configuración predeterminada de propiedad de objetos. Sube `index.html` a la raíz del bucket. No actives el alojamiento de sitio web de S3 ni cambies la política del bucket para permitir acceso anónimo.

**Comprueba:** puedes ver o descargar el objeto desde la consola con tu identidad autorizada, pero una persona sin permisos no puede abrir una URL directa de S3 sin firma ni credenciales. Guardar un objeto en S3 no lo publica automáticamente como sitio web.

**Al terminar:** conserva el bucket y `index.html` hasta completar el laboratorio 4. Después elimina el archivo y el bucket.

**Para entender qué acabas de usar:** la [sesión de almacenamiento del AWS User Group Buenos Aires](https://www.youtube.com/watch?v=GqYKhnqDDeI) compara S3 con otras formas de almacenar datos. Su explicación ayuda a reconocer por qué una página HTML es un *objeto* y no una base de datos o un disco de servidor.

## 3. Prueba el permiso mínimo antes de concederlo

En el [simulador de políticas de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html), elige el modo de política personalizada. Escribe una política de ejemplo que conceda `s3:ListBucket` **solo** sobre el bucket del ejercicio 2 y `s3:GetObject` **solo** sobre `index.html`. Sustituye `NOMBRE-DEL-BUCKET` por el nombre real:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::NOMBRE-DEL-BUCKET"
    },
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::NOMBRE-DEL-BUCKET/index.html"
    }
  ]
}
```

Simula `ListBucket` sobre el ARN del bucket, `GetObject` sobre el ARN del archivo y `PutObject` sobre ese mismo archivo. **Comprueba:** las dos lecturas aparecen permitidas por esta política y la escritura, denegada implícitamente. El ARN del bucket y el de sus objetos son distintos; observar esa diferencia es la lección principal.

**Al terminar:** cierra el simulador. No crees usuarios ni adjuntes la política para esta prueba. Una simulación evalúa políticas, pero no realiza la operación ni garantiza por sí sola el resultado de todos los controles de una cuenta real.

**Para entender los conceptos:** Marcia Villalba explica [usuarios, roles, grupos y permisos de IAM](https://www.youtube.com/watch?v=t51vW-BDwF0) en un video breve. Si quieres ver por qué este ejercicio importa fuera del simulador, Sheyla Leacock conecta la gestión de accesos con otras decisiones en su artículo sobre [cómo empezar una estrategia de seguridad en AWS](https://dev.to/aws-builders/estrategia-de-seguridad-en-la-nube-de-aws-por-donde-empezar-55mp). Ninguno de los dos recursos sustituye la prueba concreta de `GetObject` y `PutObject`.

## 4. Publica la página con CloudFront y un origen privado

Ahora sí podrás abrir `index.html` desde un navegador sin entregar acceso público directo al bucket. Crea una distribución de CloudFront cuyo origen sea **el bucket S3 normal**, no su *website endpoint*. Configura **Origin Access Control (OAC)** con firma de solicitudes, permite que esa distribución específica lea los objetos mediante la política de bucket indicada por la consola y define `index.html` como *default root object*. Mantén Block Public Access activado. La [guía de CloudFront para una distribución con S3 y OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GettingStarted.SimpleDistribution.html) muestra el procedimiento completo, incluida la política necesaria.

**Comprueba:** cuando la distribución termine de desplegarse, su dominio entrega la página por HTTPS; la URL directa del objeto en S3 sigue sin permitir lectura anónima. Si CloudFront devuelve `403`, revisa el origen elegido, OAC y la política que concede `s3:GetObject` a **esa** distribución. El *website endpoint* de S3 no admite OAC: mezclar ambos enfoques fue uno de los errores de la versión anterior de esta guía.

**Al terminar:** desactiva y elimina la distribución; espera a que la eliminación se complete. Luego elimina `index.html`, el bucket y el OAC si quedó sin uso. CloudFront puede tardar en desplegar o borrar una distribución y cobrar por solicitudes o transferencia.

**Para ampliar el contexto:** el [AWS User Group Buenos Aires explica CloudFront y Route 53](https://www.youtube.com/watch?v=sbsoXDa0G-A). Para este ejercicio no necesitas comprar un dominio ni crear una zona DNS: el dominio de CloudFront alcanza para comprobar el resultado.

## 5. Ejecuta una función Lambda pequeña

En Lambda, crea desde cero una función llamada `daw-lab-saludo` con un runtime de Python disponible y deja que la consola cree un **rol de ejecución básico**. Reemplaza el código de `lambda_function.py` por este ejemplo, despliega el cambio y ejecuta una prueba con el evento `{}`:

```python
def lambda_handler(event, context):
    print("Solicitud recibida")
    return {
        "statusCode": 200,
        "headers": {"content-type": "text/plain; charset=utf-8"},
        "body": "Hola desde AWS"
    }
```

**Comprueba:** la ejecución termina correctamente y devuelve `statusCode: 200` con el texto esperado. El rol de ejecución autoriza a la función a escribir sus registros; no es una credencial que debas poner en el código. La [primera función Lambda de la documentación de AWS](https://docs.aws.amazon.com/lambda/latest/dg/getting-started.html) muestra el mismo ciclo de crear, desplegar y probar.

**Al terminar:** conserva la función para los laboratorios 6 y 8. Cuando acabes ambos, elimina la función, su grupo de registros `/aws/lambda/daw-lab-saludo` y el rol que la consola creó para **esta** función, comprobando antes que ningún otro recurso lo utilice.

**Para entender cuándo elegirla:** la [sesión de cómputo del AWS User Group Medellín](https://www.youtube.com/watch?v=IhxrEubfIfI) compara Lambda con EC2 y contenedores. Cuando tengas una función que haga trabajo real, Camilo Cabrales muestra [cómo comparar memoria, duración y costo de una Lambda](https://dev.to/cecamilo/tunea-tus-funciones-lambda-31a4). Es una práctica posterior: utiliza SAM y Step Functions, crea más recursos y no aporta una medición útil a esta función que solo devuelve un saludo.

## 6. Sigue la ejecución hasta CloudWatch Logs

Vuelve a probar `daw-lab-saludo` dos veces con `{}`. Desde la función, abre su grupo de registros en CloudWatch Logs y localiza la línea `Solicitud recibida`. Observa el momento de cada invocación y el identificador de solicitud: te ayudan a distinguir dos ejecuciones aunque el resultado HTTP sea idéntico. Si no aparece enseguida, espera unos momentos y confirma que el rol de ejecución conserva permisos para escribir registros. La [guía de AWS para ver los registros de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-view.html) muestra dónde encontrarlos.

**Comprueba:** puedes relacionar cada prueba con un registro, en vez de inferir que todo funcionó solo porque viste un `200`. En un proyecto real evitarías imprimir secretos o datos personales en los logs.

**Al terminar:** puedes fijar una retención breve para este grupo o eliminarlo cuando borres la función. CloudWatch Logs conserva los datos indefinidamente de forma predeterminada; una función borrada no limpia necesariamente sus registros.

**Para profundizar:** Sheyla Leacock distingue métricas, registros, trazas y auditoría en [Observabilidad en la nube de AWS](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m). Te ayudará a reconocer por qué CloudWatch Logs responde a una pregunta distinta de CloudTrail.

## 7. Guarda y recupera dos notas en DynamoDB

En DynamoDB, crea la tabla `daw-lab-notas` con clave de partición `id` de tipo **cadena** y capacidad **bajo demanda**. Espera a que su estado sea `ACTIVE`. En **Explore table items**, agrega dos elementos: `id = "1", texto = "primera nota"` e `id = "2", texto = "segunda nota"`. Recupera el primero por su clave y luego explora la tabla completa. La [guía inicial de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStartedDynamoDB.html) detalla creación, escritura, lectura y borrado.

**Comprueba:** una lectura por `id = "1"` devuelve solo la primera nota, mientras que explorar todos los elementos muestra ambas. Una operación de lectura dirigida por clave y un recorrido completo de la tabla resuelven preguntas diferentes; evita tratar un *scan* como sustituto habitual de un diseño de claves.

**Al terminar:** borra la tabla cuando hayas terminado. La capacidad bajo demanda evita elegir unidades aprovisionadas para esta prueba, pero las lecturas, escrituras y el almacenamiento pueden tener costo según tu plan.

**Para seguir con tus datos:** la [sesión de bases de datos del AWS User Group Buenos Aires](https://www.youtube.com/watch?v=UqvVg1X4WIg) ayuda a decidir cuándo usar DynamoDB. Andrés Moreno muestra después una [API conectada directamente a DynamoDB con API Gateway y SAM](https://www.andmore.dev/es/blog/build-serverless-api-with-no-lambda/), sin una Lambda intermedia. Es otro diseño, más avanzado que guardar dos notas desde la consola; su ejemplo de 2021 requiere revisar herramientas y configuración actuales antes de desplegarlo.

## 8. Da a tu función una dirección HTTP

En API Gateway, crea una **HTTP API** con una integración a `daw-lab-saludo` y una ruta `GET /saludo`. Usa la URL de invocación que muestra tu API y agrega `/saludo` según la etapa que hayas configurado. La [guía inicial de HTTP API de AWS](https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started.html) explica la integración y la prueba desde un navegador.

**Comprueba:** al visitar la ruta recibes `Hola desde AWS`. Vuelve al grupo de registros y busca una invocación nueva: ahora puedes seguir el camino **navegador → API Gateway → Lambda → CloudWatch Logs**. La ruta de prueba queda accesible por internet si no añades autorización; no envíes datos privados ni la utilices como API de producción.

**Al terminar:** elimina primero la API y después la función, el grupo de registros y su rol si ya completaste el ejercicio 6. Borrar solo la función dejaría una API que responde con errores.

**Para seguir construyendo:** el [recorrido serverless](/recorridos/#serverless) reúne una progresión desde Lambda hasta una API. Después de comprobar `GET /saludo`, elige según lo que quieras aprender:

- **Crear una API más completa:** Jorge Tovar construye una [API REST con Terraform, Lambda y Python](https://dev.to/aws-builders/creando-un-api-rest-con-infra-como-codigo-terraform-serverless-lambda-python-parte-1-4ha).
- **Exponer una API que ya existe:** Fernando Paz muestra una [HTTP API como proxy](https://cloudiostrategy.com/endpoint-proxy-con-api-gateway/), incluido un escenario privado con VPC Link.
- **Comprobar el contrato de tu API:** si más adelante la describes con OpenAPI, Andrés Moreno explica [cómo usar Portman para encontrar diferencias entre la respuesta real y el contrato](https://www.andmore.dev/es/blog/getting-started-portman/).

Son continuaciones distintas, con más herramientas, recursos y costos potenciales. Ninguna es necesaria para este primer despliegue.

## 9. Dibuja una red privada y comprueba sus rutas

En VPC, elige **Create VPC → VPC only**, asigna el bloque `10.42.0.0/16` y crea después una subred `10.42.1.0/24` dentro de ella. Selecciona una zona de disponibilidad de la Región y abre la tabla de rutas principal de la VPC. La [guía para crear una VPC](https://docs.aws.amazon.com/vpc/latest/userguide/create-vpc.html) distingue la opción mínima del asistente que crea varios componentes.

**Comprueba:** el bloque de la subred pertenece al de la VPC y la tabla contiene una ruta `10.42.0.0/16 → local`. No has probado conectividad a internet: no creaste ni una puerta de enlace ni un recurso que envíe tráfico. Ese límite también es una conclusión válida del laboratorio.

**Al terminar:** elimina la subred y después la VPC. Evita el asistente **VPC and more** para esta prueba: puede crear un NAT gateway u otros componentes que generan cargos. Tampoco necesitas una IPv4 pública ni una instancia EC2 para aprender a leer las rutas.

**Para entender el diagrama:** Morsa Programando explica [qué es una VPC en AWS y por qué se usa](https://www.youtube.com/watch?v=z1OkVWfcai0). Mira después tu tabla de rutas: la explicación conceptual cobra sentido al encontrar `10.42.0.0/16 → local` en la VPC que acabas de crear.

## 10. Crea y elimina un recurso con CloudFormation

Hasta ahora creaste recursos desde la consola. Para ver qué cambia con la infraestructura como código, guarda este archivo como `daw-lab-sns.yaml`:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Tema de notificaciones para un laboratorio
Resources:
  LabTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: !Sub '${AWS::StackName}-avisos'
Outputs:
  TopicArn:
    Value: !Ref LabTopic
```

En CloudFormation, crea una pila nueva a partir de ese archivo con un nombre como `daw-lab-mensajes`. Espera a `CREATE_COMPLETE`, abre sus **Outputs** y encuentra el ARN del tema SNS. El recurso `AWS::SNS::Topic` y el valor de `Ref` están descritos en la [referencia de CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-sns-topic.html).

Para probar el tema, crea desde SNS una suscripción de protocolo **Email** usando **tu propio correo**, confirma la solicitud recibida y publica un mensaje de prueba sin datos privados. **Comprueba:** recibes el correo y CloudFormation identifica el tema como recurso de la pila. Una suscripción pendiente de confirmar no recibirá mensajes; la [guía de SNS](https://docs.aws.amazon.com/sns/latest/dg/sns-getting-started.html) explica el ciclo completo.

**Al terminar:** elimina la suscripción confirmada y después la pila. Espera a `DELETE_COMPLETE` y verifica que el tema desapareció. CloudFormation organiza el despliegue y la eliminación, pero no evita por sí mismo los cargos de los servicios que crea.

**Para profundizar:** Andrés Moreno muestra en [AndMore Dev cómo reutilizar fragmentos YAML en plantillas SAM](https://www.andmore.dev/es/blog/sam-yaml-anchors/). Es un paso posterior a comprender qué hace una plantilla simple como esta; no necesitas SAM para ejecutar el laboratorio.

## Cierra el ciclo: aprende también a borrar

Antes de salir de la consola, revisa las Regiones que usaste y comprueba que no queden la distribución de CloudFront, el bucket y su archivo, la HTTP API, la función Lambda y su rol, el grupo de registros, la tabla DynamoDB, la subred y la VPC, ni la pila y la suscripción SNS. Conserva solamente el presupuesto si quieres seguir vigilando tu cuenta. Eliminar un recurso en una pantalla no implica que sus dependencias o registros se hayan borrado; verifica cada resultado.

Si uno de los diez ejercicios te dejó una pregunta, busca una explicación de alguien que ya trabajó ese problema. En [Aprender AWS](/aprender/) encontrarás contenidos concretos; en [creadores y canales](/creadores/), a sus autores. También puedes llevar tus dudas a un [AWS User Group](/comunidades/?format=User+Group) o un [Student Builder Group](/comunidades/?format=Student+Builder+Group) y consultar la [agenda de eventos](/eventos/) para practicar con otras personas. Los directorios abarcan comunidades de países hispanohablantes: elige por tema, modalidad y horario, no por una ciudad supuesta para todos los lectores.

Al terminar, intenta explicar con tus palabras tres decisiones: por qué el bucket permaneció privado, por qué una política de lectura no autorizó escritura y qué recursos seguían vivos después de borrar la API. Si puedes responderlas mirando lo que construiste, ya tienes una base más útil que una lista de nombres de servicios.
