---
title: "Empezar en AWS: cuenta, Región y primera práctica"
description: "Elige entre AWS Educate y una cuenta propia, protege el acceso, escoge una Región y prueba Amazon S3 con un archivo privado y una limpieza completa."
author: "guille-ojeda"
publishedAt: "2024-01-30"
publishedTimestamp: "2024-01-30T19:09:51.102Z"
modifiedTimestamp: "2026-10-07T00:03:47-03:00"
review:
  date: "2026-10-07"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related: []
---

Para empezar a usar AWS, primero elige **dónde vas a practicar**. AWS Educate ofrece laboratorios guiados sin abrir una cuenta personal de infraestructura. Una cuenta propia te permite crear tus recursos, pero también te hace responsable de proteger el acceso, revisar el plan y limpiar lo que despliegues. Esta guía te lleva por esas decisiones y por una práctica pequeña con Amazon S3: guardar y recuperar un archivo sin hacerlo público.

AWS (Amazon Web Services) ofrece servicios tecnológicos bajo demanda a través de internet. Un bucket de S3 almacena objetos, como archivos; para esta primera práctica no necesitas aprovisionar un servidor.

Si buscas una secuencia más amplia para aprender AWS desde cero, sigue la [ruta práctica para principiantes](/blog/aws-aprender-guia-inicial/). Aquí el objetivo es llegar a una primera práctica verificable.

## Elige un entorno antes de crear recursos

### AWS Educate: laboratorio sin gestionar una cuenta propia

[AWS Educate](https://aws.amazon.com/education/awseducate/) permite registrarse con un correo, sin tarjeta ni cuenta de AWS, y ofrece laboratorios guiados en su entorno ([AWS Cloud Essentials](https://aws.amazon.com/getting-started/cloud-essentials/)). El idioma y las condiciones dependen de cada actividad. Si eres menor de edad, confirma los requisitos aplicables a tu país en los [términos para estudiantes de AWS](https://aws.amazon.com/legal/learner-terms-conditions/).

### Cuenta de AWS: recursos que administras tú

Una cuenta de AWS reúne recursos, identidades y facturación, y te permite crear recursos bajo tu control. El alta puede solicitar datos de pago o una verificación temporal; revisa el plan y las condiciones que te muestra antes de terminar.

Una alternativa concreta en Educate es **Getting Started with Storage**, un laboratorio introductorio de S3. AWS lo describe como una práctica de almacenamiento que también aloja una web estática. Sigue las instrucciones del entorno y confirma el idioma disponible. Es una buena opción si todavía no quieres administrar recursos en una cuenta propia.

Para prepararte antes de abrir la consola, puedes ver [Sesión 1: overview, identidad y almacenamiento en AWS](https://www.youtube.com/watch?v=0fkIP2K_xfE), una grabación de 2023 del bootcamp de Axel Echevarría Piérola. Presenta la consola, IAM y servicios de almacenamiento. Úsala para entender los conceptos; las pantallas y el proceso de registro pueden haber cambiado, así que confirma los pasos en la documentación actual.

## Si creas una cuenta, entiende el plan y protege el acceso

AWS cambió su oferta para nuevos clientes el **15 de julio de 2025**. Los nuevos clientes elegibles pueden recibir USD 100 en créditos y ganar hasta USD 100 adicionales con actividades indicadas por AWS. El plan Free da acceso a un conjunto limitado de servicios y termina a los seis meses o cuando se agotan los créditos, lo que ocurra primero. Al terminar, AWS cierra la cuenta; conserva el contenido durante 90 días para que puedas pasar a un plan Paid y recuperar el acceso. En el plan Paid, el uso que no cubran los créditos o al que estos no apliquen puede generar cargos. Los créditos vencen a los 12 meses. Las cuentas creadas antes del cambio conservan las ofertas anteriores, que podían incluir pruebas de 12 meses para ciertos servicios, como explica el [anuncio del cambio de Free Tier](https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits/). Revisa la [comparación oficial de planes](https://docs.aws.amazon.com/us_en/awsaccountbilling/latest/aboutv2/free-tier-plans.html) y la [FAQ de AWS Free Tier](https://aws.amazon.com/free/free-tier-faqs/) para tu caso.

El alta de una cuenta de AWS es distinta del registro en Educate. AWS indica que algunas rutas de registro pueden pedir información de pago y hacer una retención temporal de USD 1 —o su equivalente— durante tres a cinco días para verificar la cuenta. La experiencia nueva de registro aún se ofrece de forma gradual y los requisitos dependen de la ruta y de tu elegibilidad; revisa la [guía de alta actual](https://docs.aws.amazon.com/accounts/latest/reference/sign-in-new.html). No des por hecho que una cuenta personal se crea sin método de pago ni que todo el catálogo está cubierto por créditos; lee las condiciones de la pantalla que tienes delante.

La cuenta comienza con un usuario **root**, que tiene acceso completo. Activa MFA para protegerlo y úsalo solo para las tareas que lo requieren; AWS recomienda una identidad administrativa distinta para el trabajo diario. La configuración del root con MFA es obligatoria dentro de los 35 días posteriores al primer intento de inicio de sesión en la consola. Sigue la [guía de AWS para proteger el root](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html) y la [configuración inicial del acceso](https://docs.aws.amazon.com/IAM/latest/UserGuide/getting-started-account-iam.html). Para entender quién puede realizar cada acción, mira [¿Qué es AWS IAM?](https://www.youtube.com/watch?v=t51vW-BDwF0), un video de Marcia Villalba publicado en 2021 que explica usuarios, roles, grupos y permisos en menos de cinco minutos. Úsalo para entender los conceptos, no como instrucciones actuales de configuración. Para el ejercicio siguiente, usa un perfil de AWS CLI de una identidad que pueda trabajar con S3; no guardes claves del root en la computadora ni en el código.

## Elige una Región y una cuenta para el ejercicio

Una **Región** es la ubicación geográfica donde creas muchos recursos de AWS. Elige una antes de empezar y anótala: S3 no permite cambiar de Región a un bucket ya creado. Compara disponibilidad del servicio, latencia para tus usuarios, ubicación de los datos y precio; no supongas que una Región cuesta menos que otra. La guía de AWS para [crear buckets de uso general](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html) explica esta decisión. Para la práctica siguiente alcanza con un bucket de S3: no necesitas crear una VPC, una instancia EC2 ni una base de datos.

El modelo de seguridad también es compartido. AWS opera la infraestructura de sus servicios; tú decides quién puede acceder a tus datos y cómo configuras sus permisos. Con S3, deja el acceso público bloqueado y no subas información personal o confidencial. El [modelo de responsabilidad compartida de AWS](https://aws.amazon.com/compliance/shared-responsibility-model/) explica cómo varían estas responsabilidades según el servicio.

## Prueba S3 con un archivo privado

Este ejercicio crea un bucket de uso general, sube un archivo de texto, comprueba el acceso autenticado y verifica que una solicitud anónima no pueda leerlo. Luego elimina el objeto y el bucket.

**Antes de empezar:** necesitas AWS CLI v2 instalada y un perfil ya configurado con credenciales temporales o una identidad que te haya asignado tu organización. Puedes seguir la guía de AWS para [configurar el acceso con IAM Identity Center en la CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html). Ejecuta los comandos desde tu propia terminal con conexión a los endpoints regionales de AWS; no se ejecutan en S3 y no requieren una red VPC. Comprueba que el perfil apunta a la cuenta correcta con `get-caller-identity`. Si trabajas en una cuenta de estudio o de empresa, usa solo permisos autorizados por su responsable.

El perfil de la identidad que realiza la práctica necesita estos permisos de S3: `s3:CreateBucket`, `s3:PutBucketOwnershipControls`, `s3:PutBucketPublicAccessBlock`, `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, `s3:GetBucketPublicAccessBlock`, `s3:DeleteObject` y `s3:DeleteBucket`. Puedes contrastarlos con la tabla oficial de [permisos necesarios para las operaciones de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html). El acceso al bucket no requiere abrir puertos entrantes ni crear otros servicios.

Antes de crear el bucket, revisa las condiciones de tu plan y los [precios de S3](https://aws.amazon.com/s3/pricing/). S3 puede cobrar por almacenamiento, solicitudes y transferencia de datos según el uso, el plan y la Región. Los créditos y las ofertas dependen de la cuenta; no son una garantía de que todo ejercicio sea gratuito. Un presupuesto de costos puede avisar, pero sus datos tienen demora y una notificación no detiene recursos por sí sola ([cómo funcionan los presupuestos de AWS](https://docs.aws.amazon.com/cost-management/latest/userguide/bcm-lite-use-budget.html)).

Para ver cómo construir una estimación antes de desplegar, mira el [ejercicio de AWS Pricing Calculator de AWS Women Colombia](https://www.youtube.com/watch?v=e_oVCKBMnkA), publicado en febrero de 2026. La estimación no es una factura: usa los precios actuales de la Región y los servicios que realmente planeas usar. Para aprender a seguir el gasto y la actividad después de crear recursos, el [AWS User Group Medellín explica CloudWatch, CloudTrail, Budgets y Cost Explorer](https://www.youtube.com/watch?v=2cGwdSTdUqQ) en una sesión grabada el 21 de mayo de 2025. Usa la documentación oficial para revisar cualquier paso de consola.

Trabaja en una carpeta vacía de práctica. Cambia el sufijo por letras o números, no uses datos personales y comprueba que el nombre cumpla las [reglas de S3 para buckets de uso general](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html): el nombre debe ser único en la partición de AWS y puede no estar disponible. Sustituye `sa-east-1` por la Región que elegiste; aquí es solo un ejemplo, no una recomendación de precio o latencia. `daw-practica-20261006-a7c91e` es un nombre de muestra; si no está disponible, elige otro sufijo.

```bash
PROFILE="mi-perfil-de-practica"
REGION="sa-east-1"
BUCKET="daw-practica-20261006-a7c91e"

aws sts get-caller-identity --profile "$PROFILE"
```

Revisa la cuenta y la identidad que devuelve el último comando. Si no son las esperadas, detente y corrige el perfil antes de continuar. Cambia los valores asignados a `PROFILE`, `REGION` y `BUCKET` al inicio; conserva esos nombres de variable en los comandos siguientes.

La referencia de AWS CLI para [`create-bucket`](https://docs.aws.amazon.com/cli/latest/reference/s3api/create-bucket.html) y la [API `CreateBucket`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html) especifican el comportamiento por Región. **Ejecuta solo uno de los dos comandos siguientes, nunca ambos.** Para crear un bucket fuera de `us-east-1`, S3 requiere que `LocationConstraint` coincida con la Región. Este ejemplo usa `sa-east-1`; si elegiste otra Región distinta de `us-east-1`, cambia ese valor en la variable que declaraste arriba:

```bash
aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration "LocationConstraint=$REGION" \
  --object-ownership BucketOwnerEnforced \
  --profile "$PROFILE"
```

Para `us-east-1` usa este comando, sin `--create-bucket-configuration`. No ejecutes los dos comandos de creación:

```bash
aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --object-ownership BucketOwnerEnforced \
  --profile "$PROFILE"
```

`BucketOwnerEnforced` deja deshabilitadas las ACL; la guía de AWS explica esta opción de [propiedad de objetos](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-ownership-new-bucket.html). Los buckets nuevos tienen habilitados los cuatro controles para bloquear el acceso público. La documentación de [Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html) recomienda mantenerlos activos. El comando [`put-public-access-block`](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-public-access-block.html) los establece explícitamente para que puedas verificar su estado:

```bash
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --profile "$PROFILE"
```

Crea un archivo de prueba local, súbelo y recupéralo usando el mismo perfil. La guía de [AWS CLI para trabajar con S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/GettingStartedS3CLI.html) cubre estas operaciones y sus permisos; las referencias de [`put-object`](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-object.html) y [`get-object`](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-object.html) documentan los comandos:

```bash
printf 'Hola desde Amazon S3\n' > hola.txt

aws s3api put-object \
  --bucket "$BUCKET" \
  --key hola.txt \
  --body hola.txt \
  --region "$REGION" \
  --profile "$PROFILE"

aws s3api get-object \
  --bucket "$BUCKET" \
  --key hola.txt \
  hola-descargado.txt \
  --region "$REGION" \
  --profile "$PROFILE"

cmp hola.txt hola-descargado.txt && echo "El archivo recuperado coincide"
```

Si `cmp` no muestra diferencias y aparece el mensaje, los dos archivos coinciden. Si quieres comparar almacenamiento de objetos con discos y sistemas de archivos, mira la [sesión del AWS User Group Buenos Aires sobre S3, EBS, EFS y monitoreo](https://www.youtube.com/watch?v=GqYKhnqDDeI), grabada el 12 de julio de 2023 para su Cloud Practitioner Challenge. Es material conceptual; confirma las instrucciones de consola en la documentación vigente. Después consulta el estado del bloqueo público y prueba una lectura anónima:

```bash
aws s3api get-public-access-block \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --profile "$PROFILE"

aws s3api get-object \
  --bucket "$BUCKET" \
  --key hola.txt \
  hola-anonimo.txt \
  --region "$REGION" \
  --no-sign-request
```

El [`get-public-access-block`](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-public-access-block.html) muestra la configuración del bucket; debe devolver los cuatro valores de bloqueo como `true`. AWS también evalúa la configuración de la cuenta y, si es más restrictiva, prevalece la combinación más restrictiva. El segundo comando no usa las credenciales del perfil y debe responder con `AccessDenied`. Si descarga el archivo, no lo compartas: detén la práctica y revisa la política del bucket y los permisos públicos. Si recibes otro error, comprueba la Región y la conexión a S3. No resuelvas errores desactivando los bloqueos.

Para terminar, elimina el objeto, comprueba que el bucket esté vacío y elimina el bucket. Las referencias de AWS CLI para [`delete-object`](https://docs.aws.amazon.com/cli/latest/reference/s3api/delete-object.html), [`list-objects-v2`](https://docs.aws.amazon.com/cli/latest/reference/s3api/list-objects-v2.html) y [`delete-bucket`](https://docs.aws.amazon.com/cli/latest/reference/s3api/delete-bucket.html) describen estas operaciones. La práctica no activa versionado, bloqueo de objetos ni replicación; si la política de tu organización los impone, sigue su procedimiento de limpieza en lugar de aplicar estos comandos.

```bash
aws s3api delete-object \
  --bucket "$BUCKET" \
  --key hola.txt \
  --region "$REGION" \
  --profile "$PROFILE"

aws s3api list-objects-v2 \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --profile "$PROFILE"

aws s3api delete-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --profile "$PROFILE"
```

La salida de `list-objects-v2` debe mostrar `KeyCount: 0` antes de borrar el bucket. Conserva la carpeta de trabajo hasta comparar los dos archivos; después puedes borrarlos de tu computadora. Si `delete-bucket` falla porque el bucket no está vacío, lista sus objetos y elimina únicamente los que creaste para esta práctica.

## Continúa con recursos y comunidades

Para comprender mejor por qué S3, IAM y las Regiones cumplen funciones distintas, revisa los [fundamentos de AWS con un ejemplo de aplicación](/blog/aws-fundamentos-guia-de-inicio-rapido/). Cuando quieras practicar más, los [diez laboratorios para principiantes](/blog/10-laboratorios-practicos-de-aws-para-principiantes/) detallan otros ejercicios, sus permisos, resultados y limpieza. Antes de elegir un plan para esos ejercicios, consulta la [guía de créditos y cargos de AWS Free Tier](/blog/aws-free-tier-guia-para-principiantes-2024/).

Si quieres conversar sobre una duda o conocer otros grupos, explora el [directorio de comunidades AWS por país](/comunidades/). Por ejemplo, la página del [AWS User Group Buenos Aires](https://www.meetup.com/aws-user-group-buenos-aires/) publica su actividad y espacios de encuentro; también puedes recorrer las grabaciones de su [canal de YouTube](https://www.youtube.com/@awsugbsas). Al compartir una consulta, incluye el comando sin credenciales, la Región, el resultado esperado y el error sanitizado. No publiques claves, contraseñas, identificadores de cuenta ni nombres de recursos sensibles.

Estas actividades anunciadas para octubre de 2026 pueden servir como siguiente paso; revisa la página de inscripción antes de organizarte:

- **[AWS Community Day Paraguay](https://www.awscommunitydayparaguay.com/), presencial en San Lorenzo:** sábado 17 de octubre, de 08:00 a 18:00. El organizador anuncia entrada gratuita con registro previo y cupos limitados. La agenda incluye “AWS Sin Mapa: tu ruta para empezar en la nube sin perderte”, a las 10:00. Lo organizan voluntarios de grupos locales; la página aclara que no es un evento oficial de AWS. Confirma el estado de la inscripción y el horario en la agenda del organizador.
- **[Amazon VPC Essentials: Fundamentos de Networking](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/), en línea:** miércoles 21 de octubre; la ficha muestra el horario de 18:00 a 20:00. La sesión del Student Builder Group de la Universidad Distrital cubre VPC, subredes y rutas; está dirigida también a quienes empiezan. Requiere registro y tiene cupos limitados; la página no indica precio. Confirma la hora en tu zona al registrarte.

Si esas fechas ya pasaron, consulta la [agenda de eventos AWS](/eventos/) para encontrar encuentros actuales. Para decidir qué estudiar después de tu primera práctica, sigue la [ruta de aprendizaje desde cero](/blog/aws-aprender-guia-inicial/) o elige un tema técnico en el [catálogo de recursos en español](/aprender/).

## Preguntas frecuentes

### ¿Puedo practicar AWS sin crear una cuenta propia?

Sí. AWS Educate ofrece laboratorios guiados con registro por correo, sin tarjeta ni una cuenta de AWS. Cada actividad tiene su propio entorno y condiciones; revisa el idioma y los requisitos antes de empezar.

### ¿AWS Free Tier dura 12 meses?

No para todas las cuentas. Las ofertas de 12 meses corresponden al programa anterior a julio de 2025. Para nuevos clientes elegibles, el plan Free actual termina a los seis meses o cuando se agotan los créditos. Revisa el plan y la fecha de creación de tu cuenta en la [documentación vigente de AWS](https://docs.aws.amazon.com/us_en/awsaccountbilling/latest/aboutv2/free-tier-plans.html).

### ¿Necesito crear una VPC o una instancia EC2 para probar S3?

No para esta práctica. Un bucket de S3 almacena objetos y puede usarse sin crear una VPC ni una instancia EC2. Mantén el acceso público bloqueado, verifica el objeto con tu identidad autorizada y elimina los recursos al terminar.
