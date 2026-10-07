---
title: "Recursos personalizados de CloudFormation con Lambda: guía práctica"
description: "Aprende el ciclo Create, Update y Delete de un recurso personalizado, cómo responder a ResponseURL y cómo controlar PhysicalResourceId, reintentos y timeouts."
author: "guille-ojeda"
publishedAt: "2024-05-15"
publishedTimestamp: "2024-05-15T04:54:08.82Z"
modifiedTimestamp: "2026-10-07T10:00:50-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "Infraestructura como código en AWS con CloudFormation: guía práctica"
    url: "https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/"
  - title: "AWS Lambda: qué es, cómo funciona y cuándo usarlo"
    url: "https://dondeaprendoaws.com/blog/que-es-aws-lambda-preguntas-y-respuestas/"
---

Un recurso personalizado permite ejecutar lógica propia durante una operación de CloudFormation. En el caso respaldado por Lambda, CloudFormation envía a la función un evento <code>Create</code>, <code>Update</code> o <code>Delete</code>. La función debe enviar una respuesta JSON a la URL prefirmada <code>ResponseURL</code>; devolver un diccionario desde el handler no completa la operación.

Esta guía explica cuándo conviene el recurso, cómo responder y qué hacer con el <code>PhysicalResourceId</code> para que una actualización o un borrado no deje objetos externos sin administrar. La [guía de AWS para recursos personalizados respaldados por Lambda](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-custom-resources-lambda.html) describe la integración con el handler. Los fragmentos de este artículo ilustran el contrato: no forman una pila lista para desplegar ni ejecutan cambios en una cuenta.

## Cuándo conviene un recurso personalizado

Úsalo cuando la pila necesita una acción de aprovisionamiento que no cubre un tipo de recurso nativo de CloudFormation, por ejemplo, llamar a una API externa o mantener una configuración en otro sistema. Si AWS ya ofrece un recurso nativo para ese trabajo, suele ser más sencillo dejar que CloudFormation lo administre directamente.

Los recursos personalizados admiten las operaciones <code>Create</code>, <code>Update</code> y <code>Delete</code>. Si necesitas un tipo de recurso con lectura, listado y detección de drift, compara esa opción con los tipos de recurso del [CloudFormation Registry](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/registry.html). Este artículo se centra en Lambda como proveedor; CloudFormation también puede enviar solicitudes a un tema de Amazon SNS.

## Declara el recurso y sus propiedades

El recurso puede usar el tipo <code>Custom::</code> o <code>AWS::CloudFormation::CustomResource</code>. En ambos casos, <code>ServiceToken</code> identifica al proveedor. Este fragmento supone que ya existe una función Lambda en la misma región de la pila y que proporcionas su ARN mediante el parámetro <code>ProviderFunctionArn</code>:

~~~yaml
Parameters:
  ProviderFunctionArn:
    Type: String

Resources:
  ExternalSetting:
    Type: Custom::ExternalSetting
    Properties:
      ServiceToken: !Ref ProviderFunctionArn
      ServiceTimeout: 120
      Key: app-version

Outputs:
  ResolvedValue:
    Value: !GetAtt ExternalSetting.Value
~~~

CloudFormation pasa <code>Key</code> y las otras propiedades como <code>ResourceProperties</code> en el evento. El proveedor decide qué significan y qué valores acepta. En este fragmento, el parámetro debe recibir el ARN de una función Lambda de la misma región que la pila. Si declaras la función en esta misma plantilla como un recurso <code>AWS::Lambda::Function</code> con ID lógico <code>ProviderFunction</code>, puedes usar <code>!GetAtt ProviderFunction.Arn</code> en <code>ServiceToken</code>. <code>ServiceTimeout</code> limita cuánto espera CloudFormation una respuesta: acepta de 1 a 3600 segundos y su valor predeterminado es 3600, según la [referencia del recurso](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cloudformation-customresource.html).

La función que muestra el ejemplo no está definida aquí: debes implementarla y concederle los permisos que necesita para administrar el sistema externo. La guía de [CloudFormation con AWS CLI](https://dondeaprendoaws.com/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/) explica cómo validar plantillas, revisar cambios de pila y gestionar su ciclo de vida.

Si estás definiendo los accesos del proveedor, la guía de [seguridad en AWS: por dónde empezar y en qué orden](/blog/seguridad-en-la-nube-aws-estrategias-clave/) explica cómo limitar permisos y usar roles para las cargas de trabajo.

## Qué recibe y qué debe responder Lambda

CloudFormation invoca la función de forma asíncrona y envía campos como estos:

| Campo | Para qué sirve |
| --- | --- |
| <code>RequestType</code> | Indica <code>Create</code>, <code>Update</code> o <code>Delete</code>. |
| <code>RequestId</code>, <code>StackId</code> y <code>LogicalResourceId</code> | Identifican la solicitud, la pila y el recurso lógico. Debes copiar sus valores exactamente en la respuesta. |
| <code>ResponseURL</code> | URL prefirmada de S3 a la que el proveedor carga la respuesta. |
| <code>ResourceProperties</code> | Propiedades actuales de la plantilla. En un evento <code>Update</code> también llega <code>OldResourceProperties</code>. |
| <code>PhysicalResourceId</code> | Identificador del recurso administrado; aparece en las solicitudes <code>Update</code> y <code>Delete</code>. |

La respuesta no vuelve en el valor de retorno del handler. El proveedor debe enviar por HTTP <code>PUT</code> un documento JSON a <code>ResponseURL</code> antes de que venza <code>ServiceTimeout</code>. Para una actualización que termina correctamente, la respuesta tiene esta forma:

~~~json
{
  "Status": "SUCCESS",
  "RequestId": "copiar desde el evento",
  "StackId": "copiar desde el evento",
  "LogicalResourceId": "ExternalSetting",
  "PhysicalResourceId": "id estable del proveedor",
  "Data": {
    "Value": "1.2.3"
  }
}
~~~

<code>Data</code> es opcional. CloudFormation expone sus valores como atributos del recurso, por lo que la plantilla puede leer el ejemplo con <code>!GetAtt ExternalSetting.Value</code>. Si la operación falla, responde con <code>Status: FAILED</code> y un <code>Reason</code> breve que ayude a encontrar el error. La respuesta completa no puede superar 4096 bytes. <code>Data</code> y <code>NoEcho</code> no se admiten en respuestas de <code>Delete</code>.

Evita incluir secretos en <code>Data</code>. <code>NoEcho: true</code> enmascara los valores del recurso que se recuperan con <code>Fn::GetAtt</code>, pero no cifra el dato ni redacta copias en las secciones <code>Metadata</code> o <code>Outputs</code> de la plantilla, ni las que hayas escrito en los logs. Si necesitas entregar un secreto a otro recurso, devuelve una referencia y guarda el valor en un servicio diseñado para administrarlo.

Este helper Python, usando solo la biblioteca estándar, implementa el envío de la respuesta. No crea ni elimina el recurso externo:

~~~python
import json
from urllib.request import Request, urlopen

MAX_RESPONSE_BYTES = 4096

def send_response(event, status, physical_resource_id, data=None, reason=None):
    if status not in {"SUCCESS", "FAILED"}:
        raise ValueError("status debe ser SUCCESS o FAILED")
    if not physical_resource_id:
        raise ValueError("physical_resource_id no puede estar vacío")
    if len(physical_resource_id.encode("utf-8")) > 1024:
        raise ValueError("physical_resource_id supera 1 KB")
    if status == "FAILED" and not reason:
        raise ValueError("reason es obligatorio cuando status es FAILED")

    payload = {
        "Status": status,
        "RequestId": event["RequestId"],
        "StackId": event["StackId"],
        "LogicalResourceId": event["LogicalResourceId"],
        "PhysicalResourceId": physical_resource_id,
    }
    if reason:
        payload["Reason"] = reason[:512]
    if event["RequestType"] != "Delete" and data is not None:
        payload["Data"] = data

    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if len(body) > MAX_RESPONSE_BYTES:
        payload = {
            "Status": "FAILED",
            "RequestId": event["RequestId"],
            "StackId": event["StackId"],
            "LogicalResourceId": event["LogicalResourceId"],
            "PhysicalResourceId": physical_resource_id,
            "Reason": "La respuesta supera 4096 bytes; reduce Data.",
        }
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError("la respuesta mínima supera el límite de CloudFormation")

    request = Request(
        event["ResponseURL"],
        data=body,
        headers={
            "content-type": "",
            "content-length": str(len(body)),
        },
        method="PUT",
    )
    with urlopen(request, timeout=10) as response:
        response.read()
~~~

Después de completar la operación externa, el handler llama una vez a <code>send_response</code> con <code>SUCCESS</code> y el identificador físico correcto. Si falla la operación externa, debe enviar <code>FAILED</code> y conservar el error completo en los logs de Lambda. Si falla el propio envío, no envíes una segunda respuesta sin comprobar el estado externo: el primer <code>PUT</code> pudo haber llegado aunque Lambda no haya recibido su confirmación. El motivo de la respuesta debe ser corto y no contener credenciales ni otros datos sensibles.

AWS también proporciona el módulo [<code>cfn-response</code>](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-lambda-function-code-cfnresponsemodule.html), pero CloudFormation solo lo incluye cuando el código de Lambda está definido en la propiedad <code>ZipFile</code> de una plantilla. Para código empaquetado en S3 debes implementar el envío, como en el helper anterior, o usar una biblioteca de proveedor compatible. Si usas <code>cfn-response</code>, pasa un identificador físico estable: por defecto usa el nombre del log stream, y un valor distinto en una actualización provoca un reemplazo.

## Diseña Create, Update y Delete alrededor del identificador físico

El <code>PhysicalResourceId</code> identifica el objeto que el proveedor administra. Debe ser una cadena no vacía, única para ese objeto y de hasta 1 KB. Mantén un identificador estable para el mismo objeto; evita generar uno aleatorio en cada actualización.

| Evento | Acción del proveedor |
| --- | --- |
| <code>Create</code> | Crea o encuentra el objeto externo y devuelve su identificador físico. Si además devuelve datos, la plantilla puede obtenerlos con <code>Fn::GetAtt</code>. |
| <code>Update</code> | Compara las propiedades actuales con <code>OldResourceProperties</code> y aplica el cambio. Si modifica el mismo objeto, devuelve el mismo identificador físico. |
| <code>Delete</code> | Elimina el objeto identificado por <code>PhysicalResourceId</code> y envía una respuesta. Si el objeto ya no existe, trata esa condición como una eliminación completada. |

Si una actualización necesita reemplazar el objeto, crea el nuevo, responde con su nuevo <code>PhysicalResourceId</code> y deja que CloudFormation envíe después un evento <code>Delete</code> para el objeto anterior. Si devuelves un identificador distinto por error, CloudFormation también interpreta que hubo reemplazo y puede borrar el objeto previo. La documentación explica este comportamiento en la referencia de [respuestas de recursos personalizados](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref.html).

La lógica del proveedor no forma una transacción con el resto de la pila. Si crea un objeto externo y luego falla antes de responder, CloudFormation puede marcar la operación como fallida aunque el efecto externo haya ocurrido. Usa un nombre o clave estable, verifica si el objeto ya existe antes de crearlo y haz que las operaciones de actualización converjan al estado deseado, en vez de sumar efectos cada vez que se procesan.

Para identificar una repetición del mismo evento puedes usar <code>RequestId</code> junto con <code>StackId</code>; AWS documenta esa combinación como identificador de solicitud. Eso no cubre por sí solo una nueva operación de pila, que tendrá otra solicitud. Para esas repeticiones, haz que la creación sea idempotente con una clave propia del objeto, registra el resultado de la operación si el sistema externo lo necesita y haz que borrar un objeto ausente termine correctamente. En una sustitución, conserva la capacidad de borrar específicamente el identificador viejo.

## Reintentos, errores y limpieza

Lambda recibe las solicitudes de CloudFormation de forma asíncrona. En las invocaciones asíncronas estándar, Lambda reintenta por defecto hasta dos veces los errores del handler; también puede entregar un mismo evento más de una vez. La [documentación de reintentos asíncronos de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html) describe este comportamiento. Si el handler alcanzó a crear el objeto externo antes de fallar o de perder la respuesta, el reintento no debe crear un duplicado.

Hay dos resultados distintos que conviene registrar:

- Si el proveedor carga una respuesta <code>FAILED</code> y el handler termina normalmente, CloudFormation falla la operación de pila. Lambda no interpreta el valor JSON <code>FAILED</code> como un error del handler.
- Si el handler termina con error o timeout antes de completar el envío, se aplican los reintentos asíncronos de Lambda. Cuando no se recibe una respuesta válida, CloudFormation sigue esperando hasta el timeout del recurso.

Cuando CloudFormation debe borrar el recurso al eliminar la pila o quitarlo de la plantilla, envía <code>Delete</code>; durante un reemplazo envía <code>Delete</code> para el objeto anterior. Una política de retención puede omitir esa limpieza, así que comprueba si el recurso se conservará y quién gestionará luego el objeto externo. La función debe usar el <code>PhysicalResourceId</code> que llega en la solicitud para limpiar el objeto correcto y siempre responder, incluso si ya no existe. Incluye una estrategia de compensación para los fallos que ocurren después de crear un objeto externo, porque ese efecto no desaparece automáticamente al fallar la pila.

## Timeouts y resolución de errores

<code>ServiceTimeout</code> es el tiempo máximo de espera de CloudFormation, no el timeout de la función Lambda. Lambda tiene su propio límite de ejecución. Ajusta ambos a la duración esperada: configura el timeout de Lambda para poder diagnosticar la operación y reservar tiempo para cargar la respuesta antes de que venza el timeout del recurso.

Si la pila se queda esperando o marca el recurso como fallido:

1. En **Events** de la pila, localiza el <code>LogicalResourceId</code> y lee <code>ResourceStatusReason</code>. La [documentación de eventos de CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/view-stack-events.html) explica esos estados y motivos.
2. En los logs de CloudWatch de la función, busca el mismo evento y comprueba si el handler recibió el tipo de solicitud correcto, terminó la acción y cargó la respuesta.
3. Verifica que la respuesta use <code>PUT</code>, incluya <code>RequestId</code>, <code>StackId</code>, <code>LogicalResourceId</code> y un <code>PhysicalResourceId</code>, y que el JSON no supere 4096 bytes.
4. Comprueba que <code>ServiceToken</code> y la pila estén en la misma región. Si Lambda está en una VPC, asegúrate de que pueda alcanzar la URL prefirmada de S3. Con AWS PrivateLink, el recurso necesita acceso a los buckets de S3 específicos de CloudFormation para entregar esa respuesta; consulta las [consideraciones de AWS para recursos personalizados en una VPC](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/vpc-interface-endpoints.html).

Un timeout de CloudFormation puede indicar que el trabajo externo sí ocurrió, pero la respuesta no llegó. Antes de reintentar una operación fallida, consulta el objeto externo mediante su clave estable para evitar duplicarlo. Para profundizar en pilas, change sets y validación, continúa con [Infraestructura como código en AWS con CloudFormation: guía práctica](/blog/como-crear-infraestructura-como-codigo-en-aws-con-aws-cloudformation/). Si necesitas repasar invocaciones, permisos e idempotencia en Lambda, consulta [AWS Lambda: qué es, cómo funciona y cuándo usarlo](/blog/que-es-aws-lambda-preguntas-y-respuestas/).

## Recursos, canales y comunidades para seguir aprendiendo

- La [documentación de recursos personalizados de CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-custom-resources.html) define el ciclo de vida y cuándo usar esta extensión. La [referencia de solicitudes y respuestas](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref.html) sirve para revisar cada campo del protocolo.
- [Mejores prácticas con AWS CloudFormation](https://www.youtube.com/watch?v=S0uvgkx4pq4) es una grabación de AWS User Group Paraguay sobre prácticas de CloudFormation. Para conversar con la comunidad detrás del video y ver sus actividades, visita [AWS User Group Paraguay en Meetup](https://www.meetup.com/aws-ug-paraguay/).
- Para novedades generales de CloudFormation, Marcia Villalba dedicó una edición de [Desplegando.cloud a CloudFormation Express Mode](https://desplegando.substack.com/p/cloudformation-4x-veces-mas-rapido). Trata una mejora de velocidad de despliegue; es una actualización distinta del protocolo que usan los recursos personalizados.
- No hace falta una comunidad especializada para preguntar sobre tu pila. [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) es un grupo general donde sus miembros comparten experiencias y conocimientos de AWS.
- Si trabajas con Lambda, el [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) anunció la sesión online [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/) para el 20 de octubre de 2026 a las 19:00, hora de Colombia (UTC−5). Es sobre SQS y Lambda, no sobre recursos personalizados; el encuentro puede servir para aprender sobre tolerancia a fallos en otra integración.
- Explora más artículos, videos y cursos en el [catálogo de recursos AWS en español](/aprender/), encuentra grupos en el [directorio de comunidades](/comunidades/) y consulta la [agenda de eventos](/eventos/) para ver actividades vigentes.
