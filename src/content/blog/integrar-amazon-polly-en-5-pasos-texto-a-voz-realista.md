---
title: "Amazon Polly en español: voces, Boto3 y SSML"
description: "Genera voz en español con Amazon Polly. Elige una voz, motor y región compatibles, guarda un MP3 con AWS CLI o Boto3 y ajusta pausas con SSML."
author: "guille-ojeda"
publishedAt: "2024-05-13"
publishedTimestamp: "2024-05-13T05:08:34.138Z"
modifiedTimestamp: "2026-10-06T17:33:52-03:00"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS SDK v3 para JavaScript en Node.js: guía práctica"
    url: "https://dondeaprendoaws.com/blog/como-integrar-los-sdk-de-aws-en-7-pasos/"
  - title: "AWS Lambda: cómo funciona, invocaciones y concurrencia"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/"
review:
  date: "2026-10-06"
---

Para convertir texto en español a voz con Amazon Polly, elige una voz que admita el motor y la región de tu cliente, llama a `SynthesizeSpeech` y guarda el flujo `AudioStream` como un archivo. Por ejemplo, `Mia` con `es-MX`, el motor `neural` y la región `us-east-1` funciona con AWS CLI y Boto3.

Esta guía te muestra las voces disponibles para español, una síntesis corta en MP3, una pausa con SSML y cómo revisar errores, límites y costo. Los ejemplos usan un perfil local de IAM Identity Center; no incluyen claves en el código ni crean infraestructura. **Cada síntesis sí envía texto a AWS y puede generar cargos.**

Amazon Polly hace **texto a voz** (*text-to-speech*). Si tienes audio y quieres obtener una transcripción, la tarea inversa corresponde a Amazon Transcribe. Para comparar estos servicios antes de elegir, la [guía en español de Elizabeth Fuentes Leone sobre Polly, Transcribe y otras API de AWS](https://dev.to/aws-espanol/todas-las-cosas-que-comprehend-rekognition-textract-polly-transcribe-y-otros-pueden-hacer-2kl6) explica esa diferencia y enlaza un cuaderno de prueba con Polly. Es una introducción de 2023: confirma voces, límites y formatos en la documentación vigente que citamos aquí.

## Elige una voz española compatible

Polly distingue el idioma y su variante regional mediante un código como `es-ES`, `es-MX` o `es-US`. También debes indicar el motor (`standard`, `neural`, `long-form` o `generative`): una voz no funciona necesariamente con todos. La tabla resume las voces que la documentación de Polly marca para cada motor; `us-east-1` es una región común para probar las combinaciones listadas.

| Idioma | Código | Standard | Neural | Long-form | Generative |
| --- | --- | --- | --- | --- | --- |
| Español de España | `es-ES` | `Conchita`, `Lucia`, `Enrique` | `Lucia`, `Sergio` | `Alba`, `Raul` | `Lucia`, `Sergio` |
| Español de México | `es-MX` | `Mia` | `Mia`, `Andres` | — | `Mia`, `Andres` |
| Español de EE. UU. | `es-US` | `Lupe`, `Penelope`, `Miguel` | `Lupe`, `Pedro` | — | `Lupe`, `Pedro` |

El par `Mia` + `neural` de este artículo se admite en `us-east-1`. `long-form` para español solo ofrece `Alba` y `Raul` (`es-ES`) y la documentación lo limita a `us-east-1`. Para las voces generativas en español, la documentación actual enumera `us-east-1`, `us-west-2`, `eu-central-1`, `ap-northeast-1`, `ap-northeast-2`, `ap-southeast-1` y `ap-southeast-2`; Londres, Canadá Central y Zúrich tienen una lista de voces generativas más limitada que no incluye español. La disponibilidad cambia por motor: no deduzcas que una voz, por aparecer en la lista general, también está habilitada en la región de tu aplicación. Revisa la tabla vigente de [voces disponibles](https://docs.aws.amazon.com/es_es/polly/latest/dg/available-voices.html) y la [compatibilidad regional de cada motor](https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html), [long-form](https://docs.aws.amazon.com/polly/latest/dg/long-form-voices.html) y [generative](https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html).

Puedes consultar las voces directamente en la región de destino con `DescribeVoices`:

```bash
aws polly describe-voices \
  --profile polly-demo \
  --region us-east-1 \
  --engine neural \
  --language-code es-MX \
  --query 'Voices[].{Id:Id,Engines:SupportedEngines}' \
  --output table
```

Es una consulta de lectura: no sintetiza texto. Si vas a elegir una voz para una audiencia concreta, escucha una frase representativa con nombres, números y términos propios de tu aplicación. La variante regional ayuda a orientar la pronunciación; la prueba de audio permite decidir si el resultado sirve para tu caso.

## Prepara credenciales temporales y permisos

En una computadora, usa un perfil de [AWS IAM Identity Center](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html) si tu organización lo ofrece. Configúralo una vez y renueva la sesión cuando venza:

```bash
aws configure sso --profile polly-demo
aws sso login --profile polly-demo
```

El asistente te pedirá los datos de tu portal, una cuenta y un conjunto de permisos que ya tengas asignado. **No pegues claves de acceso en el archivo Python, el repositorio ni el historial de la terminal.** AWS recomienda que las personas y las cargas de trabajo usen [credenciales temporales](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html); dentro de Lambda, EC2 o ECS, asigna un rol al entorno para que el SDK obtenga esas credenciales.

Pide al administrador de tu cuenta permiso para `polly:SynthesizeSpeech`. Si también ejecutarás `DescribeVoices`, necesitarás `polly:DescribeVoices`. En una aplicación que usa lexicones pueden hacer falta permisos adicionales para ellos. Consulta [las acciones de Polly en IAM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_polly.html) y aplica los permisos mínimos para las operaciones que realmente usa tu aplicación.

La región del portal de IAM Identity Center puede ser distinta de la región del cliente de Polly. En los siguientes ejemplos la llamada de síntesis fija `us-east-1` explícitamente.

## Prueba una síntesis desde AWS CLI

El comando guarda el audio en `saludo-polly.mp3`. Usa una frase breve para que sea fácil confirmar la pronunciación y el formato:

```bash
aws polly synthesize-speech \
  --profile polly-demo \
  --region us-east-1 \
  --engine neural \
  --language-code es-MX \
  --voice-id Mia \
  --output-format mp3 \
  --text "Hola. Esta es una prueba de texto a voz en español de México." \
  saludo-polly.mp3
```

Escucha el archivo con un reproductor de audio y revisa que exista y tenga contenido. El comando ejecuta una síntesis real si lo corres con credenciales válidas. La sintaxis del comando se basa en el ejemplo oficial de [síntesis con AWS CLI](https://docs.aws.amazon.com/polly/latest/dg/synthesize-example.html).

## Guarda el MP3 con Boto3 y maneja los errores

Instala Boto3 en tu entorno de Python:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install boto3
```

Guarda este ejemplo como `sintetizar.py`. La sesión obtiene credenciales del perfil configurado; el cliente fija la región y la solicitud indica el motor y la voz. El código escribe primero un archivo temporal, comprueba que la respuesta sea MP3 y que haya datos, y solo entonces reemplaza el archivo de salida. La operación y el flujo de audio que devuelve están descritos en la [referencia de `synthesize_speech` para Boto3](https://docs.aws.amazon.com/boto3/latest/reference/services/polly/client/synthesize_speech.html).

```python
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError

REGION = "us-east-1"
PROFILE = "polly-demo"
OUTPUT = Path("saludo-polly.mp3")
TEMP_OUTPUT = OUTPUT.with_suffix(OUTPUT.suffix + ".part")

try:
    # Crea un cliente de Polly
    polly = boto3.Session(
        profile_name=PROFILE,
        region_name=REGION,
    ).client("polly")

    response = polly.synthesize_speech(
        Engine="neural",
        LanguageCode="es-MX",
        VoiceId="Mia",
        OutputFormat="mp3",
        Text="Hola. Esta es una prueba de texto a voz en español de México.",
    )

    audio_stream = response["AudioStream"]
    try:
        # Guarda el audio en un archivo
        with TEMP_OUTPUT.open("wb") as audio_file:
            while True:
                chunk = audio_stream.read(64 * 1024)
                if not chunk:
                    break
                audio_file.write(chunk)
    finally:
        audio_stream.close()

    if response.get("ContentType") != "audio/mpeg":
        raise RuntimeError(
            f"Tipo de audio inesperado: {response.get('ContentType')}"
        )
    if not TEMP_OUTPUT.is_file() or TEMP_OUTPUT.stat().st_size == 0:
        raise RuntimeError(
            "Polly no devolvió un archivo de audio "
            "con contenido."
        )

    TEMP_OUTPUT.replace(OUTPUT)
    print(
        f"MP3 guardado: {OUTPUT.resolve()} "
        f"({OUTPUT.stat().st_size} bytes)"
    )

except ClientError as error:
    details = error.response.get("Error", {})
    code = details.get("Code", "Error de Polly")
    message = details.get("Message", str(error))
    print(f"Polly rechazó la solicitud ({code}): {message}")
    raise SystemExit(1) from error
except (BotoCoreError, OSError, RuntimeError) as error:
    print(f"No se pudo crear el MP3: {error}")
    raise SystemExit(1) from error
finally:
    TEMP_OUTPUT.unlink(missing_ok=True)
```

Si guardaste el archivo como `sintetizar.py`, ejecútalo así:

```bash
python sintetizar.py
```

`ClientError` muestra el código devuelto por Polly para distinguir un permiso denegado de una voz incompatible o un SSML inválido. Los errores de Boto3, credenciales, red o escritura local llegan por otra ruta. No ignores el código de error: úsalo para revisar el perfil, la región, el motor y la voz que elegiste.

Para ver una aplicación de voz más completa, la charla en español [JS Serverless y AWS en acción: Transcribe, Polly y Amplify](https://www.nerdearla.com/nerdflix/6pfuHVNqJgU/) muestra una experiencia accesible con JavaScript, React y Lambda. Es una grabación de 2023: úsala como ejemplo de integración y contrasta comandos y SDK con la documentación vigente.

## Añade pausas con SSML

Para texto plano, Polly usa la pronunciación predeterminada de la voz. [SSML](https://docs.aws.amazon.com/es_es/polly/latest/dg/ssml.html) permite marcar aspectos del habla. Por ejemplo, `<break>` agrega una pausa y está disponible para todos los motores. Usa `TextType="ssml"` y envuelve el texto con `<speak>`:

```bash
aws polly synthesize-speech \
  --profile polly-demo \
  --region us-east-1 \
  --engine neural \
  --language-code es-MX \
  --voice-id Mia \
  --output-format mp3 \
  --text-type ssml \
  --text '<speak>Hola. <break time="350ms"/> El pedido estará listo mañana.</speak>' \
  saludo-ssml.mp3
```

Con Boto3, envía esa misma cadena en `Text` y agrega `TextType="ssml"` a la llamada anterior; guarda y cierra el `AudioStream` con el mismo patrón. Si generas SSML desde texto de usuarios, escapa los caracteres XML reservados —por ejemplo `&` como `&amp;`— y no insertes contenido sin validar dentro del marcado.

No todas las etiquetas funcionan con todos los motores. En particular, `<emphasis>` no está disponible para las voces neural, long-form ni generative; el control de `pitch` con `<prosody>` tampoco está disponible para esos motores. Para evitar errores, comprueba la [matriz de etiquetas SSML admitidas](https://docs.aws.amazon.com/es_es/polly/latest/dg/supportedtags.html), el detalle de [atributos de `prosody`](https://docs.aws.amazon.com/polly/latest/dg/prosody-tag.html) y prueba cada etiqueta con la voz seleccionada.

## Límites, precio y qué hacer con textos largos

La operación síncrona `SynthesizeSpeech` acepta como máximo **6.000 caracteres totales**, de los cuales hasta **3.000 pueden ser facturables**; las etiquetas SSML no cuentan para el máximo facturable, pero sí forman parte del límite total. La reproducción de una respuesta síncrona tiene un máximo de diez minutos. Para documentos más largos, Polly ofrece la operación asíncrona `StartSpeechSynthesisTask`: acepta hasta 200.000 caracteres totales y 100.000 facturables, y escribe el resultado en un bucket de S3 que debes proporcionar. Revisa los límites vigentes en la [documentación de cuotas](https://docs.aws.amazon.com/es_es/polly/latest/dg/limits.html) y la referencia de [`SynthesizeSpeech`](https://docs.aws.amazon.com/es_es/polly/latest/dg/API_SynthesizeSpeech.html).

Polly factura según los caracteres procesados y el motor. La página de precios consultada para esta guía publica, fuera de las condiciones gratuitas, estas tarifas por millón de caracteres: **USD 4** para Standard, **USD 16** para Neural, **USD 100** para Long-form y **USD 30** para Generative. Las tarifas de GovCloud difieren.

También indica un nivel gratuito de **5 millones de caracteres al mes para Standard**; **1 millón para Neural, 500.000 para Long-form y 100.000 para Generative por mes durante los primeros 12 meses**.

Desde el 15 de julio de 2025, las cuentas nuevas pueden recibir hasta USD 200 en créditos y escoger entre un plan gratuito de seis meses o uno de pago; los créditos vencen a los 12 meses. La elegibilidad y el saldo dependen de la cuenta y pueden cambiar: confirma las condiciones actuales en [precios de Polly](https://aws.amazon.com/polly/pricing/) y [AWS Free Tier](https://aws.amazon.com/free/) antes de sintetizar.

Los ejemplos síncronos solo crean archivos locales. Si sigues el camino asíncrono, revisa los costos y permisos de Polly y S3 antes de usar un bucket. Al terminar una práctica local, borra solo los archivos de salida que hayas generado:

```bash
rm -f saludo-polly.mp3 saludo-ssml.mp3
```

Los comandos de síntesis mostrados aquí no crean recursos de nube.

## Errores frecuentes al sintetizar en español

| Síntoma | Qué revisar |
| --- | --- |
| `EngineNotSupportedException` o error de voz | Confirma que voz, motor e idioma coincidan y que la región del cliente ofrezca ese motor. Usa `DescribeVoices` en esa región. |
| `AccessDeniedException` | Solicita `polly:SynthesizeSpeech` a quien administra IAM; revisa también límites de permisos de la cuenta o de la organización. |
| `InvalidSsmlException` | Verifica que el XML esté bien formado, que incluya `<speak>` y que la etiqueta sea compatible con el motor. |
| `TextLengthExceededException` | Cuenta caracteres totales y facturables. Para textos largos evalúa la operación asíncrona con S3. |
| Boto3 no encuentra perfil o credenciales | Repite `aws sso login --profile polly-demo`, confirma el nombre del perfil y revisa que la sesión no haya vencido. |
| El MP3 no aparece o queda vacío | Revisa el error de la terminal, el tipo de contenido y el tamaño del archivo; no des por exitosa una llamada solo porque el programa arrancó. |

Los nombres y límites exactos de las excepciones están en la [referencia de la API](https://docs.aws.amazon.com/es_es/polly/latest/dg/API_SynthesizeSpeech.html). Los permisos dependen de la identidad que ejecuta la solicitud, no de que la voz se haya mostrado en la consola.

## Sigue aprendiendo con ejemplos y comunidades

Para conversar sobre el código con otras personas, el [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/) publica encuentros virtuales y presenciales sobre AWS, Lambda y arquitectura serverless. El [AWS User Group Perú](https://awsugperu.cloud/) reúne una agenda de talleres, comunidades locales, grupos de estudio y recursos para continuar practicando. Consulta cada agenda: fechas, modalidad, cupos e inscripción dependen de cada actividad.

Si vas a desarrollar la integración en Node.js, continúa con esta guía de [AWS SDK v3 para JavaScript y credenciales temporales](/blog/como-integrar-los-sdk-de-aws-en-7-pasos/). Si quieres ejecutar Polly desde una función, la guía de [AWS Lambda, invocaciones y concurrencia](/blog/aws-lambda-en-profundidad/) explica el ciclo de vida y el rol de ejecución que debes considerar.

## Preguntas frecuentes sobre Amazon Polly

### ¿Amazon Polly convierte texto en español a voz?

Sí. Polly incluye voces para español de España (`es-ES`), México (`es-MX`) y Estados Unidos (`es-US`). Escoge una voz y un motor admitidos para tu región; por ejemplo, `Mia`, `es-MX`, `neural` y `us-east-1`.

### ¿Joanna sirve para texto en español?

Joanna es una voz en inglés estadounidense (`en-US`), no una voz española. Para texto en español, usa una voz identificada para el idioma y la variante que buscas. Si sintetizas español con Joanna, la pronunciación no corresponde a una voz española.

### ¿Puedo usar SSML para cambiar el énfasis, el tono y la velocidad?

Puedes usar un subconjunto de SSML, pero el soporte cambia según el motor. `<break>` funciona con los cuatro motores. `<emphasis>` no está disponible en Neural, Long-form ni Generative; y `<prosody>` no admite `pitch` en esos motores. Consulta la tabla oficial antes de combinar etiquetas.

### ¿Amazon Polly es gratis?

No des por hecho que sí. Polly cobra por caracteres y motor; los niveles gratuitos y créditos dependen de la categoría, antigüedad, plan y elegibilidad de la cuenta. Verifica las condiciones y los precios actuales antes de enviar texto.

### ¿Qué diferencia hay entre una síntesis síncrona y una tarea de texto largo?

`SynthesizeSpeech` devuelve audio para una solicitud corta y limita la entrada a 6.000 caracteres totales. `StartSpeechSynthesisTask` acepta textos mayores y deposita el resultado en S3; requiere elegir ese bucket y autorizar el acceso correspondiente.
