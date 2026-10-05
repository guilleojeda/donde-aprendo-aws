---
title: "10 laboratorios de AWS para principiantes: guía paso a paso"
description: "Practica AWS desde cero con diez laboratorios paso a paso, resultados verificables, costos y limpieza; incluye opciones guiadas sin una cuenta propia."
author: "guille-ojeda"
publishedAt: "2024-05-18"
publishedTimestamp: "2024-05-18T00:59:00.192Z"
modifiedTimestamp: "2026-10-04T21:26:34-03:00"
review:
  date: "2026-10-04"
cover: "/assets/blog/editorial-practica.png"
coverAlt: "Un cuaderno abierto con una secuencia de estaciones y un camino azul con punto naranja."
indexOrder: 2
ogImage: "/assets/blog/editorial-practica.png"
related:
  - title: "Aprender AWS desde cero: una ruta práctica con recursos en español"
    url: "https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/"
  - title: "Cómo reducir costos en AWS: 10 estrategias para optimizar tu factura"
    url: "https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/"

---


Si buscas laboratorios de AWS para principiantes, esta guía te lleva desde un objeto privado en S3 hasta una API HTTP con Lambda. Cada ejercicio incluye pasos concretos, un resultado que puedes comprobar y una forma de limpiar lo que creaste.

Los diez laboratorios están pensados para una cuenta de AWS propia. Si todavía no quieres abrir una, puedes empezar con [AWS Educate](https://aws.amazon.com/es/education/awseducate/): estudiantes desde los 13 años pueden registrarse con un correo, sin tarjeta ni cuenta de AWS, como explica la [FAQ oficial de AWS](https://aws.amazon.com/training/awsacademy/faq/). Su práctica guiada **Getting Started with Storage** enseña a crear almacenamiento y alojar una web estática con S3. La meta es servir una página a visitantes; no es el mismo ejercicio que mantener privado el bucket de los laboratorios 2 y 4. Sigue las instrucciones de Educate y no cambies el acceso del bucket de tu propia cuenta para hacerlo público.

Estos diez ejercicios tampoco son proyectos listos para producción. Puedes detenerte después de cualquiera. Los enlaces de la comunidad explican conceptos o muestran pasos más avanzados; cuando un recurso sea una charla conceptual, lo indicamos para no confundirla con una guía que construye la solución.

## Antes de crear recursos

Necesitas una cuenta de AWS y permisos para los servicios que uses. Trabaja con una identidad de uso cotidiano, **no con el usuario raíz**. Para cuentas nuevas, sigue la [guía de AWS para configurar el acceso](https://docs.aws.amazon.com/IAM/latest/UserGuide/getting-started-account-iam.html). Conserva el nombre y la Región de cada recurso; CloudFront es global, mientras S3, Lambda, DynamoDB, API Gateway, VPC y CloudWatch Logs son regionales. Si tu organización restringe alguno de estos servicios, usa una cuenta de aprendizaje autorizada.

**Comprueba las condiciones de la cuenta antes de crear recursos.** Al 4 de octubre de 2026, los nuevos clientes pueden elegir un plan Free o Paid. El plan Free empieza con USD 100 en créditos y permite ganar hasta USD 100 adicionales al completar actividades elegibles. Da acceso a un conjunto limitado de servicios, no a todos. Termina a los seis meses o cuando se agotan los créditos, lo que ocurra primero; luego la cuenta se cierra, aunque puedes cambiarla a Paid durante los siguientes 90 días para conservar el acceso. AWS conserva los recursos y datos durante ese plazo y después los elimina. En el plan Paid, el uso que exceda los créditos o que no sea elegible se factura según las tarifas aplicables. Revisa la [comparación oficial de planes y créditos](https://docs.aws.amazon.com/us_en/awsaccountbilling/latest/aboutv2/free-tier-plans.html) y confirma que cada servicio esté disponible antes de seguir el ejercicio. Las cuentas creadas antes del 15 de julio de 2025 conservan las condiciones anteriores; no des por hecho que a una cuenta nueva le corresponden 12 meses de nivel gratuito.

Para practicar en tu cuenta, consulta los precios y límites de los servicios, usa datos de ejemplo pequeños y elimina los recursos al terminar. S3, CloudFront, las solicitudes de API, DynamoDB y CloudWatch Logs pueden generar cargos según el plan, la Región y el uso. Un presupuesto avisa; por sí solo **no detiene automáticamente el gasto**.

| Lo que vas a comprobar | Tiempo orientativo de práctica* |
|---|---|
| 1. Un presupuesto y su alerta están configurados | 15–25 min |
| 2. Un archivo está en S3 sin acceso público | 20–30 min |
| 3. Una política permite leer ese archivo, pero no modificarlo | 20–30 min |
| 4. CloudFront entrega el archivo sin hacer público el bucket | 45–75 min |
| 5. Una función Lambda responde a una prueba | 20–30 min |
| 6. Encuentras la invocación en CloudWatch Logs | 15–20 min |
| 7. DynamoDB devuelve un elemento por su clave | 20–30 min |
| 8. Una HTTP API llama a tu función | 25–40 min |
| 9. Una subred tiene una ruta local, sin salida a internet | 20–30 min |
| 10. CloudFormation crea un tema SNS y recibes una prueba | 30–45 min |

*Los tiempos son estimaciones para orientarte. No incluyen ver las grabaciones, obtener permisos ni esperar despliegues que pueden tardar más.*

Los ejercicios 2–4 reutilizan el mismo bucket; los 5, 6 y 8, la misma función. Sigue ese orden si quieres aprovechar lo creado. Los demás pueden hacerse por separado. Si buscas una secuencia de estudio más amplia, [Aprender AWS desde cero: una ruta práctica con recursos en español](/blog/aws-aprender-guia-inicial/) organiza el siguiente paso; el [recorrido de primeros pasos](/recorridos/#primeros-pasos) reúne materiales introductorios del sitio. También puedes acompañar la ruta con el [curso de AWS para principiantes de Cultura DevOps](https://www.youtube.com/playlist?list=PLdOotbFwzDIgjeTHvCSLiGmKKzTpDsLLI): úsalo para entender los servicios, no para copiar sin revisar configuraciones de una grabación anterior.

Los recursos de la comunidad que aparecen más abajo combinan cursos, charlas y artículos. Puedes seguirlos desde cualquier país. Unos explican la decisión detrás del ejercicio; otros muestran proyectos para continuar cuando termines. Como algunas guías tienen varios años, contrasta sus pasos de consola y versiones de herramientas con la documentación actual enlazada en cada laboratorio.

## 1. Configura una alerta de costos que entiendas

Un presupuesto convierte un número abstracto en una señal que podrás vigilar mientras experimentas. En **Billing and Cost Management → Budgets**, crea un presupuesto de costo mensual y añade una notificación cuando el gasto real alcance, por ejemplo, el 80 %. Revisa el resumen antes de guardar: debe mostrar el período, el importe, el umbral y tu correo en la lista de destinatarios. La [guía de AWS para crear un presupuesto](https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html) muestra el flujo completo.

**Comprueba:** el presupuesto aparece en la lista y la dirección correcta aparece en la configuración guardada de notificaciones. No necesitas confirmarla para recibir un aviso directo por correo; la confirmación aplica si eliges alertas por SNS. No provoques gastos para intentar recibir una notificación: AWS Budgets puede actualizar los datos hasta tres veces al día, con retraso respecto del uso. AWS no cobra por supervisar presupuestos ni enviar notificaciones; si más adelante agregas acciones automáticas, los primeros dos presupuestos con acciones por cuenta y por mes son gratuitos, y cada presupuesto con acciones adicional tiene tarifa diaria. No agregues acciones para este ejercicio. Las [acciones de presupuesto](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html) son un control distinto y no equivalen a una alerta normal. Consulta también los [precios de AWS Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/).

**Al terminar:** puedes conservar el presupuesto si seguirás practicando; es un control útil. Si fue solo una prueba, elimínalo desde Budgets. Revisa también el precio aplicable a los presupuestos de tu cuenta.

Para revisar costos más allá de este aviso, consulta [10 Estrategias de Optimización de Costos en AWS](/blog/10-estrategias-de-optimizacion-de-costos-en-aws/), que reúne controles y herramientas para entender y reducir el gasto.

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

En S3, [crea un bucket de uso general](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html) con un nombre que reconozcas, por ejemplo `daw-lab-tu-alias-2026-<sufijo>`, y anota su Región. Sustituye `tu-alias` y `<sufijo>` por letras o números; no incluyas los signos `<` y `>`. El nombre debe ser único: si está ocupado, elige otro sufijo. Mantén activado **Block Public Access** y conserva la propiedad de objetos predeterminada (**Bucket owner enforced**). Sube `index.html` a la raíz del bucket. No actives el alojamiento de sitio web de S3 ni cambies la política para permitir acceso anónimo.

**Comprueba:** puedes ver o descargar el objeto desde la consola con tu identidad autorizada, pero una ventana privada del navegador sin una sesión de AWS no puede abrir la URL directa del objeto. Guardar un objeto en S3 no lo publica automáticamente como sitio web.

**Al terminar:** conserva el bucket y `index.html` hasta completar el laboratorio 4. Después elimina el archivo y el bucket.

**Para entender qué acabas de usar:** la [sesión de almacenamiento del AWS User Group Buenos Aires](https://www.youtube.com/watch?v=GqYKhnqDDeI) compara S3 con otras formas de almacenar datos. Su explicación ayuda a reconocer por qué una página HTML es un *objeto* y no una base de datos o un disco de servidor.

## 3. Prueba el permiso mínimo antes de concederlo

En el [simulador de políticas de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html), elige el modo de política personalizada. Escribe una política que permita `s3:ListBucket` **solo** en el bucket del ejercicio 2 y `s3:GetObject` **solo** en `index.html`. Sustituye `NOMBRE-DEL-BUCKET` por el nombre real:

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

Simula `ListBucket` sobre el ARN del bucket, `GetObject` sobre el ARN del archivo y `PutObject` sobre ese mismo archivo. **Comprueba:** las dos lecturas aparecen permitidas por esta política y la escritura queda denegada por falta de una autorización. El ARN del bucket y el de sus objetos son distintos; observar esa diferencia es la lección principal.

**Al terminar:** cierra el simulador. No crees usuarios ni adjuntes la política para esta prueba. Una simulación de política personalizada no hace una solicitud a S3 ni evalúa todos los controles y políticas que pueden afectar una cuenta real; úsala para entender el alcance de esta política, no como garantía de acceso efectivo.

**Para entender los conceptos:** Marcia Villalba explica [usuarios, roles, grupos y permisos de IAM](https://www.youtube.com/watch?v=t51vW-BDwF0) en un video breve. Si quieres ver por qué este ejercicio importa fuera del simulador, Sheyla Leacock conecta la gestión de accesos con otras decisiones en su artículo sobre [cómo empezar una estrategia de seguridad en AWS](https://dev.to/aws-builders/estrategia-de-seguridad-en-la-nube-de-aws-por-donde-empezar-55mp). Ninguno de los dos recursos sustituye la prueba concreta de `GetObject` y `PutObject`.

## 4. Publica la página con CloudFront y un origen privado

Ahora podrás abrir `index.html` desde un navegador sin hacer público el bucket. Crea una distribución de CloudFront cuyo origen sea **el bucket S3 normal**, no su *website endpoint*. Configura **Origin Access Control (OAC)** para firmar siempre las solicitudes. Mantén Block Public Access y la propiedad de objetos **Bucket owner enforced**. La política del bucket debe permitir a CloudFront `s3:GetObject` para los objetos de ese bucket y limitar el permiso a la distribución que acabas de crear. Define `index.html` como *default root object* y configura el comportamiento del visor para redirigir HTTP a HTTPS. La [guía de CloudFront para proteger un origen S3 con OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) explica el orden de creación y la política.

**Comprueba:** cuando la distribución termine de desplegarse, abre `https://<dominio-de-cloudfront>` y confirma que aparece el saludo. La URL directa del objeto en S3 debe seguir bloqueada para lectores anónimos. Si CloudFront devuelve `403`, revisa que el origen sea el bucket normal, que OAC firme las solicitudes y que la política autorice a **esa** distribución. Un origen de tipo *website endpoint* se configura como origen personalizado y no admite OAC.

**Al terminar:** desactiva y elimina la distribución; espera a que la eliminación se complete antes de borrar el bucket. Luego elimina `index.html`, el bucket y el OAC si quedó sin uso. CloudFront puede tardar en desplegar o borrar una distribución. Al 4 de octubre de 2026, CloudFront ofrece planes de tarifa plana desde USD 0 al mes, con asignaciones mensuales por plan (el Free de CloudFront incluye hasta un millón de solicitudes y 100 GB de transferencia de datos al mes), y también facturación según uso. Comprueba qué incluye el plan elegido y revisa por separado el almacenamiento y las solicitudes de S3; no todas las distribuciones ni todos los recursos relacionados tienen el mismo precio. Consulta los [planes y precios actuales de CloudFront](https://aws.amazon.com/cloudfront/pricing/) y los créditos de tu cuenta.

**Para ampliar el contexto:** el [AWS User Group Buenos Aires explica CloudFront y Route 53](https://www.youtube.com/watch?v=sbsoXDa0G-A). Para este ejercicio no necesitas comprar un dominio ni crear una zona DNS: el dominio de CloudFront alcanza para comprobar el resultado.

## 5. Ejecuta una función Lambda pequeña

En Lambda, crea desde cero una función llamada `daw-lab-saludo` con **Python 3.14 (`python3.14`)**, disponible en la documentación vigente al revisar esta guía. Deja que la consola cree el rol de ejecución predeterminado, que incluye permisos básicos para registrar logs. Verifica que el controlador sea `lambda_function.lambda_handler`. Reemplaza el código de `lambda_function.py` por este ejemplo, despliega el cambio y ejecuta una prueba con el evento `{}`:

```python
def lambda_handler(event, context):
    print("Solicitud recibida")
    return {
        "statusCode": 200,
        "headers": {"content-type": "text/plain; charset=utf-8"},
        "body": "Hola desde AWS"
    }
```

**Comprueba:** la ejecución termina correctamente y devuelve `statusCode: 200` con el texto esperado. El rol de ejecución autoriza a la función a escribir sus registros; no es una credencial que debas poner en el código. La [guía actual de Python en Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html) explica cómo crear y probar la función. Si eliges otro runtime en el futuro, asegúrate de que el archivo, el nombre del controlador y la sintaxis correspondan a ese lenguaje.

**Al terminar:** conserva la función para los laboratorios 6 y 8. Cuando acabes ambos, elimina la función, su grupo de registros `/aws/lambda/daw-lab-saludo` y el rol que la consola creó para **esta** función, comprobando antes que ningún otro recurso lo utilice.

**Para entender cuándo elegirla:** la [sesión de cómputo del AWS User Group Medellín](https://www.youtube.com/watch?v=IhxrEubfIfI) compara Lambda con EC2 y contenedores. Cuando tengas una función que haga trabajo real, Camilo Cabrales muestra [cómo comparar memoria, duración y costo de una Lambda](https://dev.to/cecamilo/tunea-tus-funciones-lambda-31a4). Es una práctica posterior: utiliza SAM y Step Functions, crea más recursos y no aporta una medición útil a esta función que solo devuelve un saludo.

## 6. Sigue la ejecución hasta CloudWatch Logs

Vuelve a probar `daw-lab-saludo` dos veces con `{}`. Desde la función, abre el grupo `/aws/lambda/daw-lab-saludo` en CloudWatch Logs y localiza la línea `Solicitud recibida` para cada ejecución; ambas pueden compartir un flujo de registros. Observa el momento y el identificador de solicitud: te ayudan a distinguir dos ejecuciones aunque el resultado sea idéntico. Si no aparecen enseguida, espera unos momentos y confirma que el rol de ejecución conserve `AWSLambdaBasicExecutionRole`. La [guía de AWS para ver los registros de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-view.html) muestra dónde encontrarlos.

**Comprueba:** puedes relacionar cada prueba con un registro, en vez de inferir que todo funcionó solo porque viste un `200`. En un proyecto real evitarías imprimir secretos o datos personales en los logs.

**Al terminar:** fija una retención breve, por ejemplo siete días, o elimina el grupo cuando borres la función. CloudWatch Logs conserva los datos indefinidamente de forma predeterminada; borrar la función no elimina necesariamente sus registros, que pueden tener costo de almacenamiento.

**Para profundizar:** Sheyla Leacock distingue métricas, registros, trazas y auditoría en [Observabilidad en la nube de AWS](https://dev.to/aws-builders/observabilidad-en-la-nube-de-aws-explorando-cloudwatch-x-ray-y-cloudtrail-5d9m). Te ayudará a reconocer por qué CloudWatch Logs responde a una pregunta distinta de CloudTrail.

## 7. Guarda y recupera dos notas en DynamoDB

En DynamoDB, crea la tabla `daw-lab-notas` con una clave de partición `id` de tipo **cadena** y capacidad **bajo demanda**. Espera a que su estado sea `ACTIVE`. En **Explore table items**, crea dos elementos con los atributos `id` y `texto`: `1` / `primera nota` y `2` / `segunda nota`. Usa **Query** con `id = "1"` para leer una nota y después **Scan** para ver las dos. La [guía inicial de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStartedDynamoDB.html) detalla creación, escritura, lectura y borrado.

**Comprueba:** la consulta por la clave `id = "1"` devuelve solo la primera nota y el recorrido completo muestra ambas. Una lectura por clave y un recorrido completo resuelven preguntas distintas; en una aplicación normal, evita tratar un *scan* como sustituto de un buen diseño de claves.

**Al terminar:** borra la tabla cuando hayas terminado. La capacidad bajo demanda evita que elijas unidades aprovisionadas para esta prueba, pero las lecturas, escrituras y el almacenamiento pueden tener costo según tu plan y Región.

**Para seguir con tus datos:** la [sesión de bases de datos del AWS User Group Buenos Aires](https://www.youtube.com/watch?v=UqvVg1X4WIg) ayuda a decidir cuándo usar DynamoDB. Andrés Moreno muestra después una [API conectada directamente a DynamoDB con API Gateway y SAM](https://www.andmore.dev/es/blog/build-serverless-api-with-no-lambda/), sin una Lambda intermedia. Es otro diseño, más avanzado que guardar dos notas desde la consola; su ejemplo de 2021 requiere revisar herramientas y configuración actuales antes de desplegarlo.

## 8. Da a tu función una dirección HTTP

En API Gateway, crea una **HTTP API** e intégrala con `daw-lab-saludo`. Añade la ruta `GET /saludo`, comprueba que usa esa integración y permite que API Gateway invoque la función cuando la consola lo solicite. Deja habilitado el despliegue automático en la etapa `$default`, o despliega manualmente los cambios en una etapa con nombre. Con `$default`, la ruta queda en `https://<api-id>.execute-api.<region>.amazonaws.com/saludo`; con una etapa con nombre, incluye la etapa antes de la ruta, por ejemplo `/dev/saludo`. La [guía de HTTP API de AWS](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop.html) explica cómo crear la integración, ruta y etapa.

**Comprueba:** al abrir la URL completa de `GET /saludo` en el navegador recibes `Hola desde AWS`. Vuelve al grupo de registros y busca una invocación nueva: ahora puedes seguir el camino **navegador → API Gateway → Lambda → CloudWatch Logs**. La ruta queda accesible por internet si no añades autorización; no envíes datos privados ni la uses como API de producción. API Gateway factura solicitudes según el plan y la Región.

**Al terminar:** elimina primero la API y después la función, el grupo de registros y su rol si ya completaste el ejercicio 6. Borrar solo la función dejaría una API que responde con errores.

**Para seguir construyendo:** el [recorrido serverless](/recorridos/#serverless) reúne una progresión desde Lambda hasta una API. Después de comprobar `GET /saludo`, elige según lo que quieras aprender:

- **Crear una API más completa:** Jorge Tovar construye una [API REST con Terraform, Lambda y Python](https://dev.to/aws-builders/creando-un-api-rest-con-infra-como-codigo-terraform-serverless-lambda-python-parte-1-4ha).
- **Exponer una API que ya existe:** Fernando Paz muestra una [HTTP API como proxy](https://cloudiostrategy.com/endpoint-proxy-con-api-gateway/), incluido un escenario privado con VPC Link.
- **Comprobar el contrato de tu API:** si más adelante la describes con OpenAPI, Andrés Moreno explica [cómo usar Portman para encontrar diferencias entre la respuesta real y el contrato](https://www.andmore.dev/es/blog/getting-started-portman/).

Son continuaciones distintas, con más herramientas, recursos y costos potenciales. Ninguna es necesaria para este primer despliegue.

## 9. Dibuja una red privada y comprueba sus rutas

En VPC, elige **Create VPC → VPC only**, asigna el bloque `10.42.0.0/16` y crea después una subred `10.42.1.0/24` dentro de ella. Selecciona una zona de disponibilidad de la Región y abre la tabla de rutas principal de la VPC. La [guía para crear una VPC](https://docs.aws.amazon.com/vpc/latest/userguide/create-vpc.html) distingue la opción mínima del asistente que crea varios componentes.

**Comprueba:** el bloque de la subred pertenece al de la VPC y la tabla contiene una ruta `10.42.0.0/16 → local`. No has probado conectividad a internet: no creaste ni una puerta de enlace ni un recurso que envíe tráfico. Ese límite también es una conclusión válida del laboratorio.

**Al terminar:** elimina la subred y después la VPC. Evita el asistente **VPC and more** para esta prueba: puede crear un NAT gateway u otros componentes que generan cargos. La VPC, la subred y la tabla de rutas no generan cargos por sí solas; NAT Gateway cobra por hora y por datos procesados, y AWS cobra las direcciones IPv4 públicas. No necesitas una puerta de enlace, una IPv4 pública ni una instancia EC2 para leer rutas. Consulta los [precios de Amazon VPC](https://aws.amazon.com/vpc/pricing/) si amplías el ejercicio.

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

En CloudFormation, crea una pila nueva desde el archivo `daw-lab-sns.yaml` y asígnale un nombre como `daw-lab-mensajes`. Espera a `CREATE_COMPLETE`, abre sus **Outputs** y encuentra el ARN del tema SNS. El recurso `AWS::SNS::Topic` y el valor de `Ref` están descritos en la [referencia de CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-sns-topic.html).

Para probar el tema, crea desde SNS una suscripción de protocolo **Email** usando **tu propio correo**, confirma la solicitud recibida y publica un mensaje de prueba sin datos privados. **Comprueba:** recibes el correo y CloudFormation identifica el tema como recurso de la pila. Una suscripción pendiente de confirmar no recibirá mensajes; la [guía de SNS](https://docs.aws.amazon.com/sns/latest/dg/sns-getting-started.html) explica el ciclo completo.

**Al terminar:** elimina la suscripción confirmada y después la pila. Espera a `DELETE_COMPLETE` y verifica en SNS que el tema desapareció. Esta plantilla no declara `DeletionPolicy: Retain`, así que al eliminar la pila CloudFormation elimina el tema por defecto. CloudFormation organiza el despliegue y la eliminación, pero no evita los cargos de los recursos mientras existen.

**Para profundizar:** Andrés Moreno muestra en [AndMore Dev cómo reutilizar fragmentos YAML en plantillas SAM](https://www.andmore.dev/es/blog/sam-yaml-anchors/). Es un paso posterior a comprender qué hace una plantilla simple como esta; no necesitas SAM para ejecutar el laboratorio.

## Cierra el ciclo: aprende también a borrar

Antes de salir de la consola, revisa las Regiones que usaste y comprueba que no queden la distribución de CloudFront, el bucket y su archivo, la HTTP API, la función Lambda y su rol, el grupo de registros, la tabla DynamoDB, la subred y la VPC, ni la pila y la suscripción SNS. Conserva solamente el presupuesto si quieres seguir vigilando tu cuenta. Eliminar un recurso en una pantalla no implica que sus dependencias o registros se hayan borrado; verifica cada resultado.

Si uno de los diez ejercicios te dejó una pregunta, busca una explicación de alguien que ya trabajó ese problema. En [Aprender AWS](/aprender/) encontrarás contenidos concretos; en [creadores y canales](/creadores/), a sus autores. También puedes llevar tus dudas a un [AWS User Group](/comunidades/?format=User+Group) o un [Student Builder Group](/comunidades/?format=Student+Builder+Group) y consultar la [agenda de eventos](/eventos/) para practicar con otras personas. Los directorios abarcan comunidades de países hispanohablantes: elige por tema, modalidad y horario, no por una ciudad supuesta para todos los lectores.

### Eventos publicados para octubre de 2026

Si estás cerca de las fechas y ubicaciones, estas actividades ofrecen una forma concreta de practicar o preguntar en comunidad. Confirma cupos, requisitos y modalidad en la página de cada evento:

- **8 de octubre, Ciudad de México (hora local):** [Cloud Builders 04 · AWS Student Builder Group](https://www.meetup.com/aws-sbg-at-pan-american-university-cdmx/events/316387395/) es una sesión híbrida y gratuita, de 17:00 a 19:00, que construye una API con Lambda, API Gateway y DynamoDB. Requiere conocimientos básicos de programación y una cuenta de AWS; la organización indica que ayuda con el alta. El enlace en línea aparece para quienes se registran. Hay cupos limitados.
- **17 de octubre, San Lorenzo, Paraguay:** [AWS Community Day Paraguay 2026](https://www.awscommunitydayparaguay.com/) se anuncia como gratuito con registro y cupos limitados. La agenda incluye la charla para principiantes “AWS Sin Mapa” y talleres prácticos; confirma en el programa si el taller que te interesa requiere herramientas, cuenta o reserva adicional.
- **21 de octubre, en línea (18:00–20:00, hora de Bogotá, Colombia):** [Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/) es una introducción en español a subredes, rutas y fundamentos de redes. Requiere inscripción y tiene cupos limitados; la página no indica precio.

Las fechas pasan rápido. Para encontrar otras oportunidades después de octubre, consulta [eventos próximos](/eventos/) y explora [AWS User Groups](/comunidades/?format=User+Group) o [Student Builder Groups](/comunidades/?format=Student+Builder+Group) por tema y modalidad.

Al terminar, intenta explicar con tus palabras tres decisiones: por qué el bucket permaneció privado, por qué una política de lectura no autorizó escritura y qué recursos seguían vivos después de borrar la API. Si puedes responderlas mirando lo que construiste, ya tienes una base más útil que una lista de nombres de servicios.

## Preguntas frecuentes

### ¿Puedo practicar AWS sin crear una cuenta propia?

Sí. AWS Educate ofrece cursos guiados, incluido **Getting Started with Storage**, sin una cuenta de AWS ni tarjeta de crédito. Sigue la actividad dentro de Educate: su práctica de S3 enseña a alojar una web estática para visitantes, mientras que los laboratorios 2 y 4 de esta guía mantienen el bucket privado.

### ¿Un presupuesto de AWS detiene los cargos al llegar al límite?

No. Un presupuesto puede avisarte, pero la información se actualiza con retraso y el aviso no bloquea recursos ni solicitudes. Para reducir el riesgo, revisa precios y créditos antes de empezar, evita crear recursos que no necesites y confirma la limpieza al final de cada laboratorio.
