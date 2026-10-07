---
title: 'AWS Lambda Layers en varias funciones: cuándo convienen y cómo crear una'
description: Aprende cuándo usar Lambda Layers, empaqueta un módulo Python, comparte una versión entre funciones y soluciona errores de importación, límites y permisos.
author: guille-ojeda
publishedAt: '2024-03-09'
publishedTimestamp: '2024-03-09T02:24:39.563Z'
cover: /assets/blog/editorial-serverless-desarrollo.png
coverAlt: Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja.
ogImage: /assets/blog/editorial-serverless-desarrollo.png
related:
- title: 'AWS Lambda con Node.js: crea y prueba una función localmente'
  url: https://dondeaprendoaws.com/blog/desarrollando-aplicaciones-con-aws-lambda/
- title: 'Mejores prácticas para AWS Lambda: reintentos, concurrencia y seguridad'
  url: https://dondeaprendoaws.com/blog/mejores-practicas-para-aws-lambda/
- title: 'Serverless en AWS: qué es, cómo funciona y cómo empezar'
  url: https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/
modifiedTimestamp: '2026-10-07T10:03:05-03:00'
review:
  date: '2026-10-07'
---


Una **Lambda Layer** es un archivo ZIP con código, bibliotecas o archivos que una función puede reutilizar. Lambda incorpora su contenido en el entorno de ejecución de las funciones empaquetadas como ZIP; por eso puedes conectar una misma capa a varias funciones sin copiar ese contenido en cada paquete de código.

Las capas son útiles cuando varias funciones comparten una dependencia o un módulo propio que cambia con menos frecuencia que la lógica de cada función. No comparten memoria ni estado entre invocaciones, y publicar una versión nueva no actualiza las funciones que siguen usando una versión anterior. El beneficio principal es organizar y distribuir código compartido; una layer no garantiza que la función arranque o ejecute más rápido. [AWS explica el modelo y el ciclo de vida de las capas](https://docs.aws.amazon.com/lambda/latest/dg/chapter-layers.html).

## Cuándo conviene una layer

- **Usa una layer** si dos o más funciones ZIP dependen del mismo módulo o biblioteca, la dependencia tiene un responsable y su ciclo de cambios es independiente del código de cada función.
- **Incluye la dependencia en el ZIP de la función** si la usa una sola función, cambia junto con su código o quieres mantener un paquete autónomo que sea sencillo de depurar y desplegar.
- **Incluye las dependencias en la imagen** si tu función usa un paquete de tipo contenedor. Lambda no permite adjuntar Lambda Layers a funciones basadas en imágenes.
- Para funciones compiladas en **Go o Rust**, AWS recomienda incluir las dependencias en el paquete de la función; cargar bibliotecas por separado puede complicar el despliegue y aumentar la inicialización.

Una layer agrega una versión más que debes probar y desplegar. Si varias funciones necesitan versiones distintas de una biblioteca, mantenerlas en capas separadas puede ser más simple que actualizarlas todas al mismo tiempo. Compara el tamaño del ZIP de cada función, el tamaño total descomprimido y el tiempo de inicialización antes de adoptar capas para resolver un problema de rendimiento.

Si trabajas con Node.js y AWS SAM, [AndMore muestra otra opción: empaquetar el código compartido y las dependencias con esbuild](https://www.andmore.dev/es/blog/layerless-esbuild-lambda/). Es un ejemplo de 2024 que menciona Node.js 20; toma el patrón de empaquetado y verifica el runtime y las dependencias vigentes antes de copiar la configuración.

## Crear una layer de Python y probarla en tu equipo

El ejemplo crea un módulo propio sin instalar paquetes. Necesitas Python 3 y su biblioteca estándar; no hace falta una cuenta AWS para comprobar el ZIP y la importación.

La estructura importa: el ZIP debe tener **python/** en la raíz. Lambda expone ese directorio como **/opt/python** y los runtimes de Python lo incluyen en la ruta de búsqueda de módulos. No hace falta agregar **/opt/python** a **sys.path** manualmente. También puedes instalar bibliotecas en **python/lib/python3.x/site-packages**; reemplaza **3.x** por la versión de Python que uses. Consulta las [rutas por runtime](https://docs.aws.amazon.com/lambda/latest/dg/packaging-layers.html) antes de empaquetar. Si luego agregas bibliotecas de terceros, la [guía de layers para Python](https://docs.aws.amazon.com/lambda/latest/dg/python-layers.html) muestra cómo prepararlas.

Crea el módulo:

~~~bash
mkdir -p capa/python
cat > capa/python/saludo.py <<'PY'
def saludar(nombre):
    return f"Hola, {nombre}."
PY
~~~

Genera **utilidades-comunes.zip** con **python/** en la raíz:

~~~bash
python3 - <<'PY'
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

origen = Path("capa")
with ZipFile("utilidades-comunes.zip", "w", compression=ZIP_DEFLATED) as archivo_zip:
    for archivo in sorted((origen / "python").rglob("*")):
        if archivo.is_file():
            archivo_zip.write(archivo, archivo.relative_to(origen))
PY
~~~

Comprueba el contenido y que Python pueda importar el módulo desde esa ruta:

~~~bash
python3 - <<'PY'
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile

with tempfile.TemporaryDirectory() as directorio_temporal:
    destino = Path(directorio_temporal)
    with ZipFile("utilidades-comunes.zip") as archivo_zip:
        assert "python/saludo.py" in archivo_zip.namelist()
        archivo_zip.extractall(destino)

    sys.path.insert(0, str(destino / "python"))
    from saludo import saludar

    assert saludar("Ana") == "Hola, Ana."
print("Estructura e importación correctos")
PY
~~~

En la función, importa el mismo módulo:

~~~python
from saludo import saludar

def lambda_handler(event, context):
    return {"saludo": saludar(event.get("nombre", "Lambda"))}
~~~

Con el evento **{"nombre": "Ana"}**, el handler devuelve **{"saludo": "Hola, Ana."}**.

La prueba local comprueba la estructura del ZIP y la importación del módulo puro de Python. No valida el runtime administrado por Lambda, los permisos, el handler desplegado ni las integraciones de la función.

## Publicar la layer y adjuntarla a dos funciones

Al publicar una layer, Lambda crea una nueva versión. El siguiente ejemplo usa Python 3.14 y marca el módulo puro como compatible con ambas arquitecturas. Sustituye el runtime por el que esté configurado en tus funciones. El dato **--compatible-runtimes** sirve para filtrar resultados de **ListLayers** y **ListLayerVersions**; no convierte ni comprueba las dependencias. Consulta la [referencia de AWS CLI](https://docs.aws.amazon.com/cli/latest/reference/lambda/publish-layer-version.html).

Antes de ejecutar los comandos, asegúrate de tener:

- AWS CLI instalada y configurada, con credenciales válidas y la región de despliegue seleccionada.
- Dos funciones existentes como paquetes ZIP en esa región, con el runtime Python elegido.
- El código y handler de cada función preparados para importar el módulo de la layer.

Los comandos siguientes publican la layer y cambian la configuración de capas de las funciones; no crean las funciones ni despliegan su código. El principal que los ejecuta debe poder publicar la layer y leerla y actualizar la configuración de las funciones.

~~~bash
aws lambda publish-layer-version \
  --layer-name utilidades-comunes \
  --zip-file fileb://utilidades-comunes.zip \
  --compatible-runtimes python3.14 \
  --compatible-architectures arm64 x86_64 \
  --query LayerVersionArn \
  --output text
~~~

Guarda el ARN completo que devuelve el comando, incluido su número final, por ejemplo **arn:aws:lambda:us-east-1:123456789012:layer:utilidades-comunes:1**. Ese número identifica la versión publicada. Adjunta el mismo ARN a cada función:

~~~bash
aws lambda update-function-configuration \
  --function-name funcion-a \
  --layers "arn:aws:lambda:us-east-1:123456789012:layer:utilidades-comunes:1"

aws lambda update-function-configuration \
  --function-name funcion-b \
  --layers "arn:aws:lambda:us-east-1:123456789012:layer:utilidades-comunes:1"
~~~

En estos comandos, reemplaza los nombres y el ARN por los de tu cuenta, región y funciones. Si una función ya usa otras layers, envía en **--layers** la lista completa que debe quedar configurada, incluida cada layer que quieras conservar. Usa la consola de Lambda si prefieres publicar el ZIP y agregar después la versión elegida en la sección **Layers** de cada función.

### Fija las versiones para que los despliegues sean reproducibles

El contenido de una versión de layer es inmutable. Una nueva publicación crea, por ejemplo, la versión **:2**; no cambia la **:1** que ya tienen adjunta las funciones. Cada ARN de layer que configures debe identificar una versión concreta. Guarda esos ARN en tu plantilla de infraestructura o pipeline y despliega la nueva versión primero en un ambiente de prueba.

Las versiones publicadas de una función también guardan una copia inmutable de su configuración, incluidas sus layers. Cambiar la configuración de **$LATEST** no cambia una versión publicada a la que apunte un alias de producción. Después de probar la nueva layer, publica una nueva versión de la función y mueve el alias correspondiente. Revisa [cómo administra Lambda las versiones de función](https://docs.aws.amazon.com/lambda/latest/dg/configuration-versions.html) y [cómo se agregan y cambian las versiones de las layers](https://docs.aws.amazon.com/lambda/latest/dg/adding-layers.html).

## Compatibilidad, límites y empaquetado

- **Runtime y rutas.** El ejemplo usa **python3.14**; si tus funciones usan otro runtime de Python, empaqueta para esa versión y confirma que siga admitida en la [tabla vigente de runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html). En Node.js, las dependencias van en **nodejs/node_modules** o en una ruta versionada, como **nodejs/node22/node_modules** para Node.js 22. Confirma la ruta documentada para tu runtime. Lambda monta el contenido de la layer bajo **/opt**.
- **Sistema operativo y arquitectura.** Las funciones ZIP de Lambda corren en Amazon Linux. El módulo propio de este ejemplo es Python puro y no depende de la arquitectura del procesador. Una biblioteca con extensiones nativas, como una que contiene código C o C++, debe coincidir con la versión de Python, Linux y arquitectura elegidos para la función (**x86_64** o **arm64**). Para esos paquetes, usa una rueda Linux compatible o construye en un entorno Linux equivalente; publicar una layer como compatible con una arquitectura no recompila sus binarios. La [guía oficial para dependencias Python nativas](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html#python-package-native-libraries) detalla cómo preparar ruedas para cada arquitectura. Los módulos nativos de Node.js también deben compilar para el runtime, el entorno Linux y la arquitectura de la función; consulta la [guía de layers de Node.js](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-layers.html).
- **Cantidad y tamaño descomprimido.** Una función ZIP admite hasta **5 layers**. El paquete de la función y todas sus layers, una vez descomprimidos, comparten un máximo de **250 MB**.
- **Tamaño del ZIP y carga.** La carga directa desde consola, API o SDK tiene un máximo de **50 MB** para el archivo comprimido. Para un ZIP mayor, súbelo a Amazon S3 y publica la layer desde allí, indicando el bucket y la clave con **--content**:

  ~~~bash
  aws lambda publish-layer-version \
    --layer-name utilidades-comunes \
    --content S3Bucket=mi-bucket,S3Key=layers/utilidades-comunes.zip \
    --compatible-runtimes python3.14 \
    --compatible-architectures arm64 x86_64
  ~~~

  La opción **--content** recibe el bucket y la clave del ZIP, como muestra la [referencia de AWS CLI](https://docs.aws.amazon.com/cli/latest/reference/lambda/publish-layer-version.html). La ruta de carga cambia, pero el límite descomprimido combinado sigue siendo 250 MB. AWS resume estos topes en sus [cuotas de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html).
- **Funciones de contenedor.** Una función desplegada como imagen no admite layers de Lambda. Agrega el código compartido a la imagen durante la construcción; AWS describe las opciones en la [guía de capas y funciones de contenedor](https://docs.aws.amazon.com/lambda/latest/dg/chapter-layers.html).

## IAM y uso entre cuentas

El principal de despliegue necesita **lambda:PublishLayerVersion** para publicar la capa, **lambda:GetLayerVersion** para usar esa versión y **lambda:UpdateFunctionConfiguration** para adjuntarla a cada función. Para usar una layer de otra cuenta, su propietario también debe permitir **lambda:GetLayerVersion** en la política basada en recursos de esa versión; el usuario o rol consumidor necesita ese permiso en su política de identidad. Los permisos de compartir aplican a una versión concreta, así que hay que volver a concederlos al publicar otra. La función no recibe permisos de ejecución adicionales por llevar una layer: su rol de ejecución sigue siendo el que usa para acceder a servicios y datos.

Trata el contenido de una layer como código que ejecutarás en cada función que la consuma. Revisa su origen y dependencias, limita el acceso entre cuentas a los principales que lo necesiten y fija versiones. La guía de AWS para [compartir acceso a una layer entre cuentas](https://docs.aws.amazon.com/lambda/latest/dg/permissions-layer-cross-account.html) incluye los permisos requeridos.

## Resolver No module named ... o Unable to import module

Cuando la función no encuentra un módulo de la layer, revisa en este orden:

1. **Mira la raíz del ZIP.** Debe aparecer **python/saludo.py**, no **capa/python/saludo.py** ni **python/python/saludo.py**. Usa **zipinfo -1 utilidades-comunes.zip** o el bloque de Python anterior para inspeccionarlo.
2. **Confirma la versión adjunta.** Revisa la configuración de la función y asegúrate de que tenga el ARN de layer esperado, con el número de versión correcto. Una publicación nueva no cambia las funciones existentes. Si invocas una versión publicada o alias, comprueba también esa versión, no solo **$LATEST**.
3. **Revisa el nombre y el runtime.** Python distingue mayúsculas de minúsculas en el nombre del archivo y del módulo. Para paquetes con dependencias, confirma que el runtime de la layer y de la función sean compatibles y que la ruta use el formato correcto para Python o Node.js.
4. **Descarta una dependencia que oculta la layer.** En Python, los paquetes incluidos en el ZIP de la función tienen prioridad sobre los de la layer. Si hay una copia antigua en ambos lugares, Lambda puede importar la del paquete de la función.
5. **Si hay código nativo, verifica Linux y arquitectura.** Una biblioteca construida para macOS, Windows, **x86_64** o **arm64** puede no cargar en una función con otro sistema operativo, runtime o arquitectura. Consulta los logs de inicialización y la [guía de diagnóstico de Lambda](https://docs.aws.amazon.com/lambda/latest/dg/troubleshooting-execution.html).

Lambda incorpora la layer en **/opt**; no es un directorio de datos compartido. Para guardar o compartir estado entre invocaciones, usa un servicio de almacenamiento apropiado, no una layer.

## Comunidades y un próximo evento

Si quieres conversar con otras personas que usan AWS, el [AWS User Group Ciudad de México](https://www.meetup.com/awsugcdmx/) es una comunidad general con reuniones sobre nube, desarrollo y serverless. Para encuentros centrados en serverless, puedes seguir el [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/). El [directorio de comunidades AWS](/comunidades/) permite buscar otros grupos por país.

Al 7 de octubre de 2026, Serverless Colombia anuncia el encuentro virtual [El Combo Indestructible de AWS: SQS + Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/) para el **20 de octubre de 2026 a las 19:00 COT**, con acceso libre. Meetup indica que el enlace para entrar es visible para asistentes; confirma allí el registro y las condiciones antes del evento.
