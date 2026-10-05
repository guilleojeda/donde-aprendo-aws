---
title: "AWS IoT Device SDK para JavaScript: 7 errores comunes y cómo resolverlos"
description: "Soluciona errores de runtime, autenticación, permisos, clientId, QoS y reloj al conectar JavaScript con AWS IoT Core."
author: "guille-ojeda"
publishedAt: "2024-04-30"
publishedTimestamp: "2024-04-30T04:58:42.738Z"
modifiedTimestamp: "2026-10-04T22:31:52-03:00"
review:
  date: "2026-10-04"
cover: "/assets/blog/editorial-serverless-desarrollo.png"
coverAlt: "Tres módulos abstractos enlazados por estaciones de un camino azul y un punto naranja."
ogImage: "/assets/blog/editorial-serverless-desarrollo.png"
related: []
---

Si ves `Can't resolve 'fs'` al importar `aws-iot-device-sdk` en React, no instales `fs`: ese módulo pertenece a Node.js y no da acceso al sistema de archivos desde el navegador. Primero identifica qué SDK estás usando, dónde se ejecuta y a qué broker se conecta. Después revisa autenticación, política IoT, `clientId`, QoS y hora del sistema.

## 1. Instalar una dependencia de Node.js para usarla como código de navegador

`aws-iot-device-sdk` es la versión 1 del SDK. Su entrada habitual está pensada para Node.js; la documentación también conserva ejemplos de empaquetado para navegador con Browserify o webpack. AWS indica que esta versión ya no recibe nuevas funciones y que solo tendrá actualizaciones de seguridad.

La versión 2 se distribuye como `aws-iot-device-sdk-v2` y cuenta con API para Node.js y para navegador. El paquete usa la API de Node.js por defecto: cambiar de versión por sí solo no resuelve una importación incorrecta. Para una aplicación web, selecciona la [API de navegador del SDK v2](https://aws.github.io/aws-iot-device-sdk-js-v2/browser/index.html), configura la entrada que indica la guía de migración y usa MQTT sobre WebSocket Secure (WSS). El SDK de navegador documenta autenticación SigV4 o personalizada; no incluyas claves de acceso permanentes, certificados ni claves privadas en el código que entregas al navegador.

Para una aplicación que corre en Node.js, el paquete v2 se instala desde la carpeta del proyecto:

```sh
# Requiere Node.js en una versión admitida por el SDK.
npm install aws-iot-device-sdk-v2
```

Instalar `fs`, `tls` o un polyfill no cambia el entorno de ejecución. El [repositorio del SDK v1](https://github.com/aws/aws-iot-device-sdk-js), el [repositorio del SDK v2](https://github.com/aws/aws-iot-device-sdk-js-v2) y su [guía de migración, incluida la configuración de navegador](https://github.com/aws/aws-iot-device-sdk-js-v2/blob/main/documents/MIGRATION_GUIDE.md) describen las diferencias. El AWS SDK para JavaScript permite invocar APIs de AWS; no convierte el paquete de dispositivo en un cliente MQTT de navegador.

## 2. Confundir AWS IoT Core con el broker local de Greengrass

AWS IoT Core ofrece un broker MQTT en la nube. AWS IoT Greengrass puede habilitar comunicación MQTT local entre dispositivos cliente y un dispositivo Core. Para esa conexión local se configuran, entre otros componentes, `Client device auth` y un broker local; el componente `MQTT bridge` es opcional y retransmite los mensajes que selecciones hacia o desde IoT Core.

Confirma el destino configurado por tu aplicación: el endpoint de IoT Core o la dirección del dispositivo Greengrass. Sus certificados, autorización y rutas de mensajes tienen configuraciones distintas. Si esperas que un mensaje local llegue a la nube, revisa también el mapeo del bridge. Consulta la guía de AWS para [interactuar con dispositivos locales de Greengrass](https://docs.aws.amazon.com/greengrass/v2/developerguide/interact-with-local-iot-devices.html) y la [autenticación de dispositivos cliente](https://docs.aws.amazon.com/greengrass/v2/developerguide/device-auth.html).

Como introducción práctica a IoT Core, el [AWS User Group Ecuador tiene una grabación sobre IoT Core y ESP8266](https://www.youtube.com/watch?v=ilMHiOXCZns). Es un ejemplo de IoT con hardware, no un tutorial del SDK para JavaScript.

## 3. Usar credenciales que no corresponden al transporte

El SDK y el tipo de conexión determinan cómo se autentica el cliente. Una configuración TLS con certificado de dispositivo no sirve como configuración de navegador, y un cliente WSS debe firmar o autorizar la conexión con el mecanismo que configuraste.

| Conexión a AWS IoT Core | Puerto habitual | Autenticación |
|---|---:|---|
| MQTT sobre TLS desde Node.js o un dispositivo | `8883` | Certificado X.509 del cliente y su clave privada |
| MQTT sobre WSS desde navegador | `443` | SigV4 con credenciales temporales o autenticación personalizada, según la configuración |

Si usas SigV4 en una aplicación web, entrega credenciales temporales y limitadas mediante un proveedor de identidad apropiado, como Amazon Cognito. Nunca empaquetes una clave secreta de IAM ni la clave privada del certificado en el frontend. AWS también permite MQTT con X.509 en el puerto `443` cuando el cliente configura ALPN; verifica ese requisito antes de cambiar el puerto. La documentación de [protocolos de AWS IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/protocols.html) y la [guía del SDK v2 para MQTT 5](https://github.com/aws/aws-iot-device-sdk-js-v2/blob/main/documents/MQTT5_Userguide.md) detallan los tipos de conexión.

## 4. Aplicar la política que corresponde a la autenticación

Antes de editar permisos, identifica cómo se autentica el cliente. Con MQTT sobre TLS y certificado X.509, AWS IoT Core evalúa una política IoT asociada al certificado. Con MQTT sobre WSS y SigV4, la autorización depende de la identidad: una identidad IAM o federada usa una política IAM; una identidad Cognito autenticada necesita tanto una política IAM en el rol del identity pool como una política IoT asociada a esa identidad Cognito. Para una identidad Cognito no autenticada, AWS documenta permisos IAM en el rol del identity pool y recomienda limitar sus recursos. Si configuraste un authorizer personalizado, revisa la política que implementa ese authorizer.

Por eso, una app web con WSS no se diagnostica como un dispositivo X.509: no busques adjuntar una política al certificado si esa conexión no usa certificado. AWS resume los tipos de identidad y políticas en su [tabla de autorización de IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/iot-authorization.html) y detalla los [permisos para identidades Cognito](https://docs.aws.amazon.com/iot/latest/developerguide/cog-iot-policies.html).

Cuando el flujo usa una política AWS IoT Core —X.509 o la capa IoT de Cognito autenticado— cada operación MQTT debe apuntar al tipo de recurso correspondiente:

| Acción | Recurso de la política | Autoriza |
|---|---|---|
| `iot:Connect` | `client/<clientId>` | Conectar con ese ID |
| `iot:Publish` y `iot:Receive` | `topic/<topic>` | Publicar o recibir en ese topic |
| `iot:Subscribe` | `topicfilter/<filtro>` | Enviar una suscripción con ese filtro |

Una conexión requiere `iot:Connect`; después, cada operación necesita su propio permiso. Suscribirse no concede por sí solo permiso para recibir mensajes. En las políticas de AWS IoT, `*` y `?` son comodines de política; `+` y `#` son comodines MQTT y no tienen ese significado dentro del ARN. Revisa los [detalles de las acciones de política](https://docs.aws.amazon.com/iot/latest/developerguide/iot-policy-actions.html) y los [ejemplos de políticas de publicación y suscripción](https://docs.aws.amazon.com/iot/latest/developerguide/pub-sub-policy.html).

Si también administras permisos y credenciales temporales en pipelines de infraestructura, consulta esta [guía de controles de seguridad para IaC en AWS](https://dondeaprendoaws.com/blog/9-mejores-practicas-de-seguridad-para-iac-en-aws/). Sus ejemplos son de IaC y complementan el tema de IAM, pero no sustituyen las políticas IoT de esta sección.

## 5. Reutilizar un `clientId` o usar uno que la política no permite

Un `clientId` identifica una conexión MQTT. AWS IoT Core mantiene una sola conexión activa por combinación de cuenta, región e ID: si otro cliente conecta con el mismo ID, el broker desconecta la conexión anterior. Una política también puede restringir `iot:Connect` a un ARN como `client/device-17`; el ID enviado por el cliente tiene que coincidir con esa autorización.

Asigna una identidad estable a cada dispositivo y evita que dos procesos activos compartan el mismo ID. Para pruebas en paralelo, usa IDs distintos y permite los IDs de prueba en la política que corresponda al mecanismo de autenticación. Si usas variables de política asociadas a una cosa (Thing), configura el `clientId` según esa relación. La guía de [buenas prácticas de seguridad de AWS IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/security-best-practices.html) explica los conflictos y cómo detectarlos en los logs de CloudWatch.

## 6. Interpretar QoS 1 como confirmación de que la aplicación procesó el mensaje

AWS IoT Core admite QoS 0 y QoS 1; no admite QoS 2. QoS 1 permite entrega “al menos una vez”: el emisor reintenta hasta recibir `PUBACK` del broker y el mensaje puede llegar más de una vez. Ese acuse MQTT confirma el paso de protocolo entre cliente y broker; por sí solo no confirma que otro dispositivo ejecutó una orden o guardó su resultado.

Si quien publica necesita saber que un dispositivo aplicó una orden, define una respuesta de aplicación —por ejemplo, un mensaje en un topic de confirmaciones con el mismo `messageId`— y envíala después de completar el trabajo. Haz idempotente el procesamiento para tolerar duplicados. El cliente MQTT 5 del SDK v2 también permite controlar manualmente cuándo el receptor envía el `PUBACK` de un mensaje QoS 1, por ejemplo, después de persistirlo. Ese acuse sigue siendo parte del protocolo MQTT; no sustituye la respuesta de negocio al emisor. AWS explica los [niveles QoS de MQTT](https://docs.aws.amazon.com/iot/latest/developerguide/mqtt.html) y el SDK documenta el [acuse de publicación manual](https://github.com/aws/aws-iot-device-sdk-js-v2/blob/main/documents/MQTT5_Userguide.md#manual-publish-acknowledgement).

Para ver un ejemplo de un sensor que publica por MQTT, puedes revisar este [artículo de IoT y Generative AI](https://dev.to/aws-espanol/integracion-iot-y-generative-ai-como-crear-una-app-que-cuenta-chistes-basados-en-la-temperatura-522) y su [código para ESP8266 y sensor DHT22](https://github.com/fernandosilvot/App-IoT_GenAI). Ese proyecto sirve para practicar IoT; no usa el SDK de dispositivo para JavaScript.

## 7. Ignorar la hora del dispositivo

La hora incorrecta puede interrumpir el establecimiento de una conexión segura. En TLS, el cliente comprueba las fechas de validez del certificado del servidor; con SigV4, la solicitud WebSocket incluye una fecha firmada en UTC y la firma puede fallar si la hora no coincide. AWS recomienda sincronizar el reloj del dispositivo con NTP antes de conectar y advierte que la desviación tolerable depende de la operación. Consulta las [buenas prácticas de hora y TLS para IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/security-best-practices.html) y los [campos de fecha en solicitudes SigV4](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-signing-elements.html). Configura una fuente de hora confiable para el dispositivo.

## Qué revisar cuando sigue sin conectar

1. Confirma que el endpoint corresponde a la cuenta y región correctas. Para MQTT con certificado, usa un certificado de esa misma región.
2. Con MQTT/TLS X.509, comprueba que el certificado esté activo y que su política IoT permita el `clientId`. Con WSS/SigV4, revisa la firma y los permisos IAM; si es Cognito autenticado, comprueba además la política IoT adjunta a la identidad. Para Cognito no autenticado, revisa el rol IAM limitado.
3. Si conecta pero falla el tráfico, compara los topics y filtros con los permisos de datos de la política aplicable: IAM para IAM/federación y Cognito no autenticado; política IoT para X.509 y Cognito autenticado.
4. Registra los eventos del SDK antes de configurar reintentos. En v1 puedes observar `error`, `offline` y `reconnect`; el cliente MQTT 5 de v2 emite `attemptingConnect`, `connectionFailure` y `disconnection`. El v2 vuelve a intentar la conexión mientras el cliente siga iniciado. Si el broker deniega una operación, corrige la política para autorizar la acción y el recurso necesarios.

AWS proporciona documentación y ejemplos técnicos para [conectar un dispositivo a IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/iot-connect-devices.html). Para ver ideas de práctica con dispositivos, MQTT y servicios de AWS, puedes seguir con estos recursos en español. Son ejemplos y charlas de IoT; no son guías específicas de solución de errores del SDK JavaScript.

### Prácticas y ejemplos con dispositivos

- [Primeros pasos con IoT en AWS y una demostración con microcontroladores](https://www.youtube.com/watch?v=pq3HK8zrF14) y [monitoreo IoT con Alexa, Raspberry Pi y sensores](https://www.youtube.com/watch?v=-lYaBFheUdI), videos del AWS User Group Perú.
- [Rastreo GPS vehicular en tiempo real](https://www.alfredo-dominguez.dev/arquitecturas/05-gps-vehicle-tracking/) y la página del [proyecto de seguimiento GPS](https://www.alfredo-dominguez.dev/proyectos/gps-vehicle-tracking/).
- [Cómo IoT Core despertó mis ganas de ser Maker otra vez](https://builder.aws.com/content/3JkzKadLy6UgcIARkhZwqutiVs3/cmo-io-t-core-despert-mis-ganas-de-ser-maker-otra-vez), artículo de AWS Builder Center.

### Charlas y podcasts

- [LAWS of Cloud: IoT industrial en AWS con Raúl Hugo](https://www.youtube.com/watch?v=61nuGOSj1Co) y [AWS Meetup #47: SageMaker, MLOps e IoT](https://www.youtube.com/watch?v=NVEbOgBTNSk), grabaciones del AWS User Group Perú.
- [Qué es IoT y cómo empezar en AWS](https://www.youtube.com/watch?v=_1Ryarag_pE) y [Transformando Food Tech con IoT](https://www.youtube.com/watch?v=qN6tBUJfNcI), episodios de Charlas Técnicas de AWS en el canal de Marcia Villalba.

## Comunidades y eventos

Si quieres conversar sobre AWS con otras personas, consulta las actividades de [AWS User Group Perú](https://awsugperu.cloud/) o [AWS User Group Ecuador](https://www.awsugecuador.com/). Son comunidades generales de AWS; sus páginas muestran cómo seguir sus eventos y actividades, sin presentarlas como grupos especializados en este SDK.

La [Agenda de eventos AWS en Latinoamérica](https://dondeaprendoaws.com/eventos/) se actualiza con encuentros de las comunidades y permite revisar modalidad, país, fecha e inscripción. Confirma la fecha y las condiciones en cada ficha antes de participar.
