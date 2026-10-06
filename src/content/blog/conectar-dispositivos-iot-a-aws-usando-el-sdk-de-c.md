---
title: "Conectar AWS IoT Core con C++: MQTT 5 y SDK oficial v2"
description: "Configura un cliente C++ para AWS IoT Core con MQTT 5, TLS mutuo y certificados X.509. Incluye endpoint ATS, política IoT, compilación y diagnóstico."
author: "guille-ojeda"
publishedAt: "2024-05-10"
publishedTimestamp: "2024-05-10T02:52:14.698Z"
modifiedTimestamp: "2026-10-06T14:04:22-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related:
  - title: "AWS IoT Device SDK para JavaScript: 7 errores comunes y cómo resolverlos"
    url: "https://dondeaprendoaws.com/blog/7-errores-comunes-con-aws-iot-device-sdk-para-javascript/"
  - title: "Cómo simular dispositivos IoT en AWS: MQTT, ejemplos y límites"
    url: "https://dondeaprendoaws.com/blog/aws-iot-edge-simulator-casos-de-uso-reales/"

---

Para conectar un programa **C++** a AWS IoT Core puedes usar el **AWS IoT Device SDK for C++ v2** y MQTT 5 con TLS mutuo. En esta guía compilas el ejemplo oficial que presenta un certificado X.509, se suscribe a un topic, publica un mensaje y espera recibirlo.

El **AWS SDK for C++** general sirve para llamar APIs de servicios AWS; el **IoT Device SDK** incluye un cliente MQTT para conectar dispositivos al broker de IoT Core. No son bibliotecas intercambiables.

Si tu firmware está escrito en C, consulta el [AWS IoT Device SDK for Embedded C](https://github.com/aws/aws-iot-device-sdk-embedded-C). Es otra biblioteca, modular, pensada para integrarse al firmware; por ejemplo, <code>coreMQTT</code> deja a la aplicación implementar la capa de red y TLS de su plataforma.

## Qué versión usar

El [repositorio actual del AWS IoT Device SDK for C++ v2](https://github.com/aws/aws-iot-device-sdk-cpp-v2) incluye MQTT 5 y ejemplos para IoT Core. El cliente MQTT 5 del SDK usa <code>Start()</code> y eventos de ciclo de vida; los ejemplos antiguos de v1 emplean otras clases y métodos. El [repositorio de v1](https://github.com/aws/aws-iot-device-sdk-cpp) indica que ya no recibirá funciones nuevas, aunque mantendrá actualizaciones de seguridad.

El SDK v2 ofrece clientes y ejemplos específicos para funciones como Device Shadows y Jobs. Esta guía cubre solo el intercambio MQTT básico: no uses métodos como <code>GetThingShadow()</code> o <code>SetJobCallback()</code> como si fueran métodos del cliente MQTT. Para otra capacidad, parte de su [documentación y muestras oficiales](https://github.com/aws/aws-iot-device-sdk-cpp-v2/tree/main/samples).

## Requisitos y recursos de AWS

Si recién empiezas con AWS IoT Core y microcontroladores, la [introducción a IoT Core y ESP8266 del AWS User Group Ecuador](https://www.youtube.com/watch?v=ilMHiOXCZns) da contexto visual. Es una grabación comunitaria sobre hardware, no un tutorial del SDK C++ v2.

Necesitas:

- Un compilador C++ compatible y CMake 3.9 o posterior. El SDK v2 requiere C++11 o superior; la muestra MQTT 5 usa C++14.
- Git con soporte para clonar submódulos.
- Una cuenta con AWS IoT Core habilitado en una Región.
- Un certificado X.509 de cliente registrado y activo, su clave privada y una política IoT asociada que permita las operaciones de la muestra.
- Salida de red TCP al puerto <code>8883</code>, usado por la conexión MQTT con certificado.
- Un equipo o firmware que valide el certificado TLS del servidor. El certificado de cliente autentica el dispositivo; la validación de la cadena del servidor autentica AWS IoT Core. La [documentación de autenticación del servidor](https://docs.aws.amazon.com/iot/latest/developerguide/server-authentication.html) explica las autoridades raíz de confianza para el endpoint ATS.

Puedes seguir el [tutorial de AWS para crear los recursos IoT](https://docs.aws.amazon.com/iot/latest/developerguide/create-iot-resources.html). Un objeto *Thing* en el registro ayuda a inventariar el dispositivo, pero no es requisito para esta conexión si la política no usa variables del Thing; AWS también muestra una [policy para clientes que no están registrados como Things](https://docs.aws.amazon.com/iot/latest/developerguide/connect-and-pub.html). Cada dispositivo debe tener una identidad propia; evita compartir la clave privada entre dispositivos y no la subas al repositorio.

### Certificado, política IoT y permisos IAM

Con MQTT sobre TLS mutuo, el certificado X.509 identifica al cliente y una **política de AWS IoT Core** autoriza lo que puede hacer en el broker. La política se asocia al certificado. No reemplaces esto por una clave de acceso IAM dentro del dispositivo.

IAM sí puede autorizar acciones administrativas —por ejemplo, crear certificados o consultar el endpoint desde AWS CLI—, pero esos permisos no se convierten en permisos MQTT del certificado. AWS separa el plano de administración del plano de datos en su [tabla de autorización de IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/iot-authorization.html).

Para practicar con la muestra, usa un <code>clientId</code> y topic fijos. Sustituye <code>REGION</code> y <code>ACCOUNT_ID</code> por los valores de la cuenta, y usa el mismo <code>clientId</code> y topic en la política y al ejecutar el programa:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:client/sensor-01"
    },
    {
      "Effect": "Allow",
      "Action": ["iot:Publish", "iot:Receive"],
      "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:topic/devices/sensor-01/telemetry"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:topicfilter/devices/sensor-01/telemetry"
    }
  ]
}
```

<code>iot:Connect</code> se limita al identificador del cliente. <code>iot:Publish</code> y <code>iot:Receive</code> usan un recurso <code>topic/</code>; <code>iot:Subscribe</code> usa <code>topicfilter/</code>. Los topics no se crean por separado: eliges el nombre al publicar o suscribirte, y la política decide qué nombres permite. Consulta las [acciones de políticas IoT](https://docs.aws.amazon.com/iot/latest/developerguide/iot-policy-actions.html) y los [ejemplos de publicación y suscripción](https://docs.aws.amazon.com/iot/latest/developerguide/pub-sub-policy.html). Para ver cómo se aplican identidad y topics en un caso de telemetría con reglas, lee [Cómo armé un Pit Wall con AWS IoT Core](https://dev.to/alvarongg/como-arme-un-pit-wall-con-aws-iot-core-y-por-que-este-patron-sirve-para-cualquier-industria-4lo1); es un ejemplo de arquitectura, no una guía del SDK C++.

La muestra se suscribe al mismo topic en el que publica, así que necesita esos tres permisos de datos además de <code>iot:Connect</code>. Si cambias el topic o el <code>clientId</code>, actualiza la política para que coincidan. Una conexión nueva con un <code>clientId</code> ya activo puede desconectar a la anterior; asigna un valor único a cada cliente.

### Obtener el endpoint de datos

Cada cuenta tiene un endpoint por Región. El endpoint <code>iot:Data-ATS</code> usa certificados de Amazon Trust Services y es el recomendado por AWS. Puedes verlo en **AWS IoT Core → Settings** o consultarlo con AWS CLI:

```sh
aws iot describe-endpoint --endpoint-type iot:Data-ATS --region us-east-1
```

La respuesta contiene un <code>endpointAddress</code>, por ejemplo <code>a1b2c3d4e5f6g7-ats.iot.us-east-1.amazonaws.com</code>. En la primera consulta, AWS crea el endpoint de datos para esa cuenta y Región. Pasa solo el nombre del host: no agregues <code>https://</code>, una ruta MQTT ni un puerto al argumento <code>--endpoint</code>. El comando CLI usa las credenciales IAM que ya configuraste para administración; el dispositivo usa su certificado X.509. AWS explica los [endpoints para conectar dispositivos](https://docs.aws.amazon.com/iot/latest/developerguide/iot-connect-devices.html) y los [protocolos y puertos disponibles](https://docs.aws.amazon.com/iot/latest/developerguide/protocols.html). MQTT con X.509 en el puerto <code>443</code> también requiere configurar ALPN; no es un reemplazo directo del puerto <code>8883</code>.

## Compilar el ejemplo oficial

El [ejemplo <code>mqtt5_x509</code>](https://github.com/aws/aws-iot-device-sdk-cpp-v2/tree/main/samples/mqtt/mqtt5_x509) muestra la conexión por TLS mutuo con certificado y clave. Clona el repositorio con sus submódulos, instala la biblioteca y compila esa muestra. Estos comandos usan una terminal tipo Bash, desde el directorio donde quieres guardar el repositorio:

```sh
git clone --recursive https://github.com/aws/aws-iot-device-sdk-cpp-v2.git
SDK_DIR="aws-iot-device-sdk-cpp-v2"
INSTALL_DIR="$(pwd)/sdk-install"

cmake -S "$SDK_DIR" -B "$SDK_DIR/build" -DCMAKE_INSTALL_PREFIX="$INSTALL_DIR" -DCMAKE_BUILD_TYPE=Release
cmake --build "$SDK_DIR/build" --target install --config Release

cmake -S "$SDK_DIR/samples/mqtt/mqtt5_x509" -B "$SDK_DIR/build-sample" -DCMAKE_PREFIX_PATH="$INSTALL_DIR" -DCMAKE_BUILD_TYPE=Release
cmake --build "$SDK_DIR/build-sample" --config Release
```

El [README de la muestra](https://github.com/aws/aws-iot-device-sdk-cpp-v2/blob/main/samples/mqtt/mqtt5_x509/README.md) describe el proceso y sus argumentos. En Windows, sigue la configuración de Visual Studio del [README principal del SDK](https://github.com/aws/aws-iot-device-sdk-cpp-v2); el ejecutable queda en el directorio de configuración que genere CMake.

## Ejecutar una prueba MQTT de ida y vuelta

La muestra recibe el endpoint, el certificado y la clave; puedes especificar un <code>clientId</code>, topic, mensaje y cantidad limitada de publicaciones:

```sh
"$SDK_DIR/build-sample/mqtt5_x509" --endpoint "a1b2c3d4e5f6g7-ats.iot.us-east-1.amazonaws.com" --cert "/ruta/segura/sensor-certificate.pem.crt" --key "/ruta/segura/sensor-private.pem.key" --client_id "sensor-01" --topic "devices/sensor-01/telemetry" --message "temperatura_c=22.4" --count 1
```

Con esos argumentos, el cliente inicia MQTT 5, se suscribe al topic, publica un mensaje QoS 1, espera recibirlo y se desconecta. La muestra agrega un número a <code>--message</code> y lo publica como una cadena JSON; no convierte el argumento en un objeto JSON. Busca en la salida <code>Lifecycle Connection Success</code> y <code>1 message(s) received.</code>. Esta comprobación ejercita certificado, endpoint, <code>clientId</code>, permisos y broker. No verifica una regla IoT, una base de datos, una alarma ni el sensor físico.

El ejecutable solo usa el certificado y la clave necesarios para autenticarse. Confirma que el almacén de confianza del sistema o dispositivo valide la cadena TLS de AWS IoT Core. Conserva la clave privada con permisos de lectura restringidos. Si la conectividad de salida al puerto <code>8883</code> está bloqueada, primero revisa las reglas de red; el puerto <code>443</code> para MQTT con certificado exige el ajuste de ALPN mencionado arriba.

## Diagnóstico cuando no conecta

AWS resume los requisitos en su [guía de diagnóstico de conectividad](https://docs.aws.amazon.com/iot/latest/developerguide/diagnosing-connectivity-issues.html). Comprueba en este orden:

| Síntoma | Qué revisar |
| --- | --- |
| Falla al establecer TLS o no resuelve el host | Endpoint <code>iot:Data-ATS</code> de la misma cuenta y Región, nombre de host sin esquema, DNS, salida TCP a <code>8883</code>, reloj del equipo y confianza en la CA del servidor. |
| El broker rechaza la conexión | Certificado registrado y activo en esa Región, clave correspondiente al certificado, política IoT adjunta y permiso <code>iot:Connect</code> para el <code>clientId</code> exacto. |
| Conecta, pero no publica | <code>iot:Publish</code> debe incluir el ARN <code>topic/</code> que coincide con el topic enviado. |
| Conecta, pero la suscripción no funciona | <code>iot:Subscribe</code> debe permitir el filtro mediante <code>topicfilter/</code>; para recibir el mensaje hace falta además <code>iot:Receive</code> sobre el recurso <code>topic/</code>. |
| Un dispositivo reemplaza la conexión de otro | Usa un <code>clientId</code> diferente para cada conexión activa. |
| El comando <code>describe-endpoint</code> falla | Verifica identidad y Región de AWS CLI, además del permiso IAM de administración para consultar el endpoint. |

Si el cliente publica pero una aplicación no ve el dato, compara exactamente el topic y sus permisos. MQTT distingue mayúsculas y minúsculas. QoS 1 permite entregas de al menos una vez, por lo que una aplicación de producción debe tolerar posibles duplicados. Las [prácticas de seguridad de AWS IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/security-best-practices.html) recomiendan una identidad por dispositivo y permisos limitados a un <code>clientId</code> y topics conocidos. Para conversar sobre políticas y protección de dispositivos en español, puedes explorar las actividades de [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/) y las [grabaciones de AWS Security Users Group LatAm](https://www.youtube.com/@AWSSecurityLATAM); son recursos generales de seguridad, no tutoriales de este SDK.

Al terminar, detener el ejecutable cierra la conexión MQTT, pero no elimina Thing, certificado ni política. Borra solo los recursos de prueba que creaste y que no compartan otras cargas. Revisa también los [precios regionales de AWS IoT Core](https://aws.amazon.com/iot-core/pricing/) antes de hacer pruebas prolongadas.

## Recursos de IoT y comunidades en español

Para estudiar otra conexión con hardware, el catálogo público enlaza una [demostración con microcontroladores del AWS User Group Perú](https://www.youtube.com/watch?v=pq3HK8zrF14). El canal de Ecuador reúne más [grabaciones de charlas y talleres de AWS](https://www.youtube.com/channel/UCgzEFlDd-KR0BL5rlOVY7KQ); el [canal del AWS User Group Perú](https://www.youtube.com/@AWSUserGroupPeru) conserva sus sesiones técnicas.

Para ver aplicaciones de IoT Core, puedes revisar el [monitoreo de sensores con Raspberry Pi y Alexa](https://www.youtube.com/watch?v=-lYaBFheUdI), una [charla sobre IoT industrial](https://www.youtube.com/watch?v=61nuGOSj1Co) o el [AWS Meetup sobre SageMaker, MLOps e IoT](https://www.youtube.com/watch?v=NVEbOgBTNSk), todos publicados por el AWS User Group Perú. La charla combina varios temas, no es un tutorial de C++.

Para una arquitectura de rastreo, consulta el [artículo de seguimiento GPS vehicular](https://www.alfredo-dominguez.dev/arquitecturas/05-gps-vehicle-tracking/) y su [página de proyecto](https://www.alfredo-dominguez.dev/proyectos/gps-vehicle-tracking/). Son ejemplos para comparar diseños, no pruebas de rendimiento para tu carga.

Si quieres explorar una integración distinta, la [app que genera chistes con la temperatura](https://dev.to/aws-espanol/integracion-iot-y-generative-ai-como-crear-una-app-que-cuenta-chistes-basados-en-la-temperatura-522) acompaña el [código para ESP8266 y DHT22](https://github.com/fernandosilvot/App-IoT_GenAI). Usa hardware y otros servicios AWS; no es un ejemplo del SDK C++. El relato de [un proyecto maker con IoT Core y ESP32](https://builder.aws.com/content/3JkzKadLy6UgcIARkhZwqutiVs3/cmo-io-t-core-despert-mis-ganas-de-ser-maker-otra-vez) ofrece otra idea de práctica. Para temas generales, el pódcast [Charlas Técnicas de AWS](https://podcast.marcia.dev/) tiene un [episodio de introducción a IoT](https://www.youtube.com/watch?v=_1Ryarag_pE) y otro sobre [IoT en FoodTech](https://www.youtube.com/watch?v=qN6tBUJfNcI).

El [AWS User Group Perú](https://awsugperu.cloud/) ofrece grupos locales, talleres y recursos; el [AWS User Group Ecuador](https://www.awsugecuador.com/) enlaza sus encuentros comunitarios. El [AWS Community Day Perú](https://awscommunityday.pe/) publica agendas y materiales de sus ediciones; verifica en el sitio organizador la fecha y modalidad. Son comunidades generales de AWS, no grupos dedicados a este SDK. Busca otros grupos en el [directorio de comunidades AWS](/comunidades/) y encuentros actuales en la [agenda regional de eventos](/eventos/). También puedes leer sobre cómo distinguir SDK y permisos en la guía de [errores frecuentes del SDK IoT para JavaScript](https://dondeaprendoaws.com/blog/7-errores-comunes-con-aws-iot-device-sdk-para-javascript/) o comparar la prueba con la guía de [simulación de dispositivos IoT en AWS](https://dondeaprendoaws.com/blog/aws-iot-edge-simulator-casos-de-uso-reales/); ambas cubren casos distintos de este cliente C++.
