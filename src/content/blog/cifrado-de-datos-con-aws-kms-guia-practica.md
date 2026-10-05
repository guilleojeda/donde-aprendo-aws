---
title: "Cómo cifrar datos con AWS KMS: claves de datos y S3"
description: "Aprende cuándo usar AWS KMS, cómo funciona el cifrado de sobre y qué permisos requiere SSE-KMS en S3. Revisa el límite de 4 KiB, la rotación y AccessDenied."
author: "guille-ojeda"
publishedAt: "2024-05-16"
publishedTimestamp: "2024-05-16T14:36:00.762Z"
modifiedTimestamp: "2026-10-05T20:34:07-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-seguridad.png"
coverAlt: "Un escudo y una llave junto a un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-seguridad.png"
related:
  - title: "Seguridad en AWS para principiantes: fundamentos y responsabilidad compartida"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
  - title: "Automatizar el cumplimiento en AWS: controles, evidencia y remediación"
    url: "https://dondeaprendoaws.com/blog/checklist-para-automatizar-cumplimiento-en-aws/"
---

AWS Key Management Service (AWS KMS) administra claves criptográficas y controla quién puede usarlas. No es un almacén para subir archivos: para cifrar grandes cantidades de datos, KMS suele proteger una **clave de datos** que cifra el contenido. Ese patrón se llama **cifrado de sobre** (*envelope encryption*).

La ruta depende de dónde viven los datos:

- **Objetos en Amazon S3:** configura cifrado del lado del servidor con AWS KMS (SSE-KMS); S3 gestiona el cifrado de cada objeto.
- **Datos de una aplicación:** para contenido de más de 4 KiB, usa cifrado de sobre con el AWS Encryption SDK o una biblioteca criptográfica apropiada; KMS genera y protege las claves de datos.
- **Un valor pequeño:** la operación `Encrypt` de KMS admite hasta 4.096 bytes con una clave simétrica. No es una operación para cifrar archivos completos.
- **Contraseñas, tokens y credenciales:** guárdalos en AWS Secrets Manager. KMS protege claves; no administra el ciclo de vida ni la recuperación de un secreto de aplicación.

## Cómo se relacionan una clave KMS y una clave de datos

Una **clave KMS** es un recurso lógico que KMS administra. El material de una clave simétrica y la parte privada de una asimétrica permanecen protegidos por KMS; sí puedes obtener la parte pública de una clave asimétrica. Una **clave de datos** es una clave simétrica que puede salir de KMS para cifrar contenido fuera del servicio.

En el cifrado de sobre, el flujo habitual es:

1. La aplicación solicita a KMS una clave de datos y especifica la clave KMS que la protegerá.
2. KMS devuelve una copia en texto claro para usar en memoria y otra copia cifrada bajo la clave KMS.
3. La aplicación cifra el contenido con la copia en texto claro y la elimina de memoria tan pronto como termina de usarla.
4. La aplicación guarda el contenido cifrado junto con la clave de datos cifrada. Para descifrar, envía esa clave de datos cifrada a KMS y usa la copia en texto claro que recibe para recuperar el contenido.

KMS genera, cifra y descifra claves de datos, pero no las guarda ni cifra por sí mismo el contenido con ellas. La aplicación debe proteger la clave en texto claro y eliminarla de memoria cuando ya no la necesite. El [AWS Encryption SDK](https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/introduction.html) implementa este patrón y ayuda a evitar errores al administrar metadatos y materiales criptográficos.

## Cuándo llamar directamente a `Encrypt`

La operación [Encrypt de AWS KMS](https://docs.aws.amazon.com/kms/latest/APIReference/API_Encrypt.html) acepta hasta **4.096 bytes de texto claro con una clave simétrica**. Las claves asimétricas tienen límites distintos, definidos por el algoritmo y el tamaño de clave; suelen ser menores. Por eso, `Encrypt` sirve para cantidades pequeñas y puntuales, no para videos, documentos ni cargas de archivos.

El resultado de la operación es texto cifrado que tu aplicación aún debe guardar en algún lugar. Si el dato es una contraseña o un token que necesitas recuperar y rotar, utiliza un gestor de secretos como [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/). Si es contenido de aplicación, usa una biblioteca que aplique cifrado de sobre y tenga un formato de mensaje definido.

## Cifrar objetos de S3 con SSE-KMS

Amazon S3 cifra las nuevas cargas de objetos en reposo con SSE-S3 de forma predeterminada. Si necesitas controlar permisos de una clave KMS, auditar su uso o permitir acceso entre cuentas, puedes configurar SSE-KMS. S3 y KMS aplican el cifrado de sobre por ti: S3 cifra el objeto con una clave de datos y guarda esa clave cifrada como metadato del objeto. No necesitas enviar el contenido del objeto a `kms:Encrypt`.

La clave KMS para SSE-KMS debe ser **simétrica** y estar en la misma Región que el bucket. Si no eliges una clave administrada por el cliente, S3 usa la clave administrada por AWS `aws/s3` para SSE-KMS. Para compartir objetos cifrados entre cuentas necesitas una clave administrada por el cliente y permisos en ambas cuentas.

Además de los permisos de S3, el principal que accede al objeto necesita permisos KMS en la clave:

En móvil, desliza las tablas hacia los lados para ver todas las columnas.

| Operación de S3 | Permiso de S3 | Permiso KMS requerido |
| --- | --- | --- |
| Cargar un objeto con SSE-KMS | `s3:PutObject` | `kms:GenerateDataKey` |
| Descargar un objeto con SSE-KMS | `s3:GetObject` | `kms:Decrypt` |
| Carga multipart con SSE-KMS | Permisos de S3 para la carga multipart | `kms:GenerateDataKey` y `kms:Decrypt` |

Consulta la guía actual de [cifrado SSE-KMS en Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html) para las condiciones del servicio y la configuración del bucket. Cambiar el cifrado predeterminado afecta nuevas cargas; no vuelve a cifrar los objetos que ya existen.

**S3 Bucket Keys** pueden reducir las solicitudes que S3 envía a KMS. Ten en cuenta que cambian el contexto de cifrado que S3 presenta a KMS: sin Bucket Key puede incluir el ARN del objeto; con Bucket Key usa el ARN del bucket. Si una política de IAM o de la clave compara el ARN del objeto, revisa esa condición antes de habilitarlas. AWS detalla el cambio en la documentación de [S3 Bucket Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html).

## Tipo de clave, responsable y rotación

El tipo criptográfico y quién administra la clave son decisiones distintas. Para cifrar datos en una aplicación o proteger objetos de S3, normalmente se usa una clave simétrica. KMS también ofrece claves asimétricas para operaciones con pares público/privado y claves HMAC para generar o verificar códigos de autenticación; una clave HMAC no cifra datos. S3 SSE-KMS admite solo claves simétricas.

| Clase de clave KMS | Quién la controla | Qué considerar |
| --- | --- | --- |
| **Administrada por AWS** | El servicio de AWS que la crea; existe en tu cuenta. | Puedes ver metadatos y uso, pero no cambiar su política ni administrar su rotación. KMS las rota cada año. En S3, `aws/s3` pertenece a esta clase. |
| **Administrada por el cliente** | Tu cuenta crea y administra la clave. | Controlas su política, permisos, deshabilitación y eliminación programada. La rotación automática es opcional para claves simétricas con material generado por KMS; el periodo predeterminado es anual. |
| **Propiedad de AWS** | AWS la mantiene en una cuenta de AWS, fuera de tu cuenta. | El servicio decide cómo usarla y rotarla. No puedes ver ni administrar la política de la clave. |

Rotar una clave KMS **no vuelve a cifrar el contenido ni rota las claves de datos**. Cuando KMS rota automáticamente una clave compatible, conserva el material anterior para descifrar el texto cifrado que se creó con esa versión. Revisa las condiciones de cada tipo en [la documentación de rotación de AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html) y la comparación de [claves administradas por AWS, por el cliente y propiedad de AWS](https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html).

La rotación automática solo está disponible para ciertos tipos de claves simétricas. Las claves asimétricas y HMAC requieren un plan de rotación manual, normalmente con una clave nueva; conserva la anterior mientras haya datos o firmas que dependan de ella.

## Políticas, contexto de cifrado y acceso denegado

Cada clave KMS tiene una **política de clave**. Puedes autorizar el uso directamente en esa política o permitir que las políticas de IAM concedan acceso. Un `Allow` de IAM no basta si la política de clave no habilita ese mecanismo. Las concesiones (*grants*) son otra vía para dar permisos, a menudo temporales o usados por servicios de AWS. En acceso entre cuentas, la política de clave debe confiar en la otra cuenta y la identidad que llama necesita también una política de IAM. Revisa [cómo funcionan las políticas de clave, IAM y las concesiones](https://docs.aws.amazon.com/kms/latest/developerguide/control-access.html) antes de redactar una política propia.

El **contexto de cifrado** es un conjunto opcional de pares clave-valor, disponible en operaciones criptográficas con claves simétricas, que aporta contexto y queda ligado al texto cifrado. Para descifrar, presenta el mismo contexto, con sus claves, valores y mayúsculas/minúsculas. No es secreto ni está cifrado: puede aparecer en texto claro en CloudTrail. Usa identificadores no sensibles y nunca incluyas contraseñas, tokens, datos personales ni secretos allí. Consulta [las reglas del contexto de cifrado](https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html).

Si recibes `AccessDenied`, revisa la ruta en este orden:

1. Confirma qué identidad y cuenta ejecutan la solicitud.
2. Comprueba el ARN y la Región de la clave, además de su estado. Una clave deshabilitada o pendiente de eliminación no puede usarse para operaciones criptográficas.
3. Verifica permisos de S3 y KMS para la operación concreta: una lectura de SSE-KMS necesita `kms:Decrypt`; una carga simple necesita `kms:GenerateDataKey`.
4. Evalúa la política de clave, las políticas de IAM y las concesiones. Busca también una denegación explícita o restricciones en límites de permisos, políticas de AWS Organizations o políticas del endpoint de VPC.
5. Si hay condiciones sobre el contexto, `kms:ViaService` o el recurso, confirma que coincidan con la solicitud real. En S3, considera el cambio de ARN cuando usas Bucket Keys.

Estos comandos inspeccionan la identidad, el estado de la clave y el cifrado de un objeto. Sustituye los valores de ejemplo por una clave, un bucket y un objeto existentes en tu cuenta y Región:

```sh
KEY_ARN='arn:aws:kms:us-east-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab'
KEY_REGION='us-east-1'
BUCKET='mi-bucket'
BUCKET_REGION='us-east-1'
OBJECT_KEY='ruta/objeto.txt'

aws sts get-caller-identity \
  --query '{Account:Account,Arn:Arn}' --output table

aws kms describe-key \
  --key-id "$KEY_ARN" --region "$KEY_REGION" \
  --query 'KeyMetadata.{State:KeyState,Manager:KeyManager,Usage:KeyUsage}' \
  --output table

aws s3api head-object \
  --bucket "$BUCKET" --key "$OBJECT_KEY" --region "$BUCKET_REGION" \
  --query '{Encryption:ServerSideEncryption,KMSKey:SSEKMSKeyId,BucketKeyEnabled:BucketKeyEnabled}' \
  --output json
```

Son solicitudes de lectura: no crean ni cambian recursos y no requieren limpieza. Necesitas AWS CLI configurada y permisos para consultar esos recursos. `head-object` es una solicitud de lectura de S3 y puede generar cargos de solicitudes según la tarifa vigente. Para investigar un error, consulta los [eventos de AWS KMS en CloudTrail](https://docs.aws.amazon.com/kms/latest/developerguide/logging-using-cloudtrail.html): algunas solicitudes denegadas se registran; cuando se rechaza una solicitud entre cuentas, el evento queda en la cuenta que la realizó. También puedes consultar la guía de [diagnóstico de permisos de AWS KMS](https://docs.aws.amazon.com/kms/latest/developerguide/policy-evaluation.html). Si usas KMS como parte de un control de auditoría, continúa con [la guía para automatizar controles, evidencia y remediación en AWS](/blog/checklist-para-automatizar-cumplimiento-en-aws/).

## Deshabilitar o programar la eliminación

Deshabilitar una clave administrada por el cliente es reversible, pero interrumpe las operaciones criptográficas que la necesiten. S3 puede conservar el objeto cifrado y fallar cuando intente volver a descifrar su clave de datos. Para eliminar una clave, KMS exige un periodo de espera de 7 a 30 días. Durante ese periodo la clave queda inutilizable y puedes cancelar la eliminación; cuando vence, AWS elimina la clave de forma permanente. Si esa clave protegía claves de datos que no puedes recuperar de otra manera, perderla puede dejar los datos inaccesibles. Antes de deshabilitarla o programar su eliminación, inventaría sus usos y comprueba que existe una ruta de recuperación. Consulta [deshabilitar claves](https://docs.aws.amazon.com/kms/latest/developerguide/enabling-keys.html) y [programar su eliminación](https://docs.aws.amazon.com/kms/latest/developerguide/deleting-keys.html).

## Recursos y comunidad para seguir

Para repasar criptografía simétrica, asimétrica y AWS KMS, consulta las [diapositivas de “Dominando AWS KMS” del AWS Community Day Perú 2024](https://es.slideshare.net/slideshow/dominando-aws-kms-desde-cifrado-bsico-hasta-firma-avanzada-aws-community-day-2024/267436804). Como grabación complementaria, [AWS Women Colombia explica AWS KMS junto con Secrets Manager y Certificate Manager](https://www.youtube.com/watch?v=7_iTHjodvYo). Son materiales de comunidad; úsalos para conceptos y contrasta cualquier paso operativo con la documentación actual.

Si quieres conversar sobre seguridad cloud, visita la página de [AWS User Group Security Ecuador en Meetup](https://www.meetup.com/aws-user-group-security-ecuador/) y comprueba allí sus actividades y requisitos de participación. Si buscas un grupo en otro país, explora el [directorio de comunidades AWS en Latinoamérica](/comunidades/). La [agenda de eventos AWS en Latinoamérica](/eventos/) reúne convocatorias de comunidades; fechas, modalidad, cupos y condiciones pueden cambiar, así que confirma los detalles con quien organiza cada evento.

Para ampliar el contexto de identidad, datos y responsabilidad compartida, continúa con la guía de [seguridad en AWS para principiantes](/blog/aws-seguridad-fundamentos-esenciales/).
