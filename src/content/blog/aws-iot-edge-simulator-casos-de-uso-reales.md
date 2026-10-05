---
title: "Cómo simular dispositivos IoT en AWS: MQTT, ejemplos y límites"
description: "Prueba mensajes de sensores con AWS IoT Core sin comprar hardware. Conoce el retiro de IoT Device Simulator, sus diferencias con Greengrass, permisos, costos y recursos en español."
author: "guille-ojeda"
publishedAt: "2024-05-15"
publishedTimestamp: "2024-05-15T02:46:19.391Z"
modifiedTimestamp: "2026-10-05T14:54:05-03:00"
cover: "/assets/blog/editorial-practica.png"
coverAlt: "Un cuaderno abierto con una secuencia de estaciones y un camino azul con punto naranja."
ogImage: "/assets/blog/editorial-practica.png"
related:
  - title: "AWS IoT Device SDK para JavaScript: 7 errores comunes y cómo resolverlos"
    url: "https://dondeaprendoaws.com/blog/7-errores-comunes-con-aws-iot-device-sdk-para-javascript/"
  - title: "10 laboratorios de AWS para principiantes: guía paso a paso"
    url: "https://dondeaprendoaws.com/blog/10-laboratorios-practicos-de-aws-para-principiantes/"
---

Puedes simular mensajes de sensores sin comprar hardware usando el **cliente MQTT de prueba de AWS IoT Core**. Para ejecutar un cliente que se comporte como un dispositivo conectado, también puedes usar tu computadora con un AWS IoT Device SDK. Son dos prácticas distintas: publicar datos desde la consola prueba el intercambio de mensajes; ejecutar el SDK permite probar además la conexión y la identidad del cliente.

Si llegaste buscando **“AWS IoT Edge Simulator”**, el nombre de la antigua solución era **IoT Device Simulator**. AWS la retiró: su [documentación indica que ya no está disponible](https://docs.aws.amazon.com/solutions/latest/iot-device-simulator/solution-overview.html). No necesitas desplegar esa solución para aprender MQTT ni para comenzar a probar una aplicación IoT.

## IoT Device Simulator, IoT Core y Greengrass: qué hace cada uno

| Herramienta | Para qué sirve | Qué debes distinguir |
|---|---|---|
| IoT Device Simulator | Generaba datos de dispositivos definidos mediante una interfaz web, para pruebas | Era una solución que desplegabas en tu cuenta; fue retirada |
| AWS IoT Core | Conecta clientes con el broker MQTT en la nube y ofrece reglas para procesar mensajes | Es el servicio al que publica tu cliente; no simula por sí solo un sensor físico |
| AWS IoT Device SDK | Permite desarrollar un cliente que se conecta, publica y recibe mensajes | Puedes ejecutarlo en una computadora con datos inventados para practicar |
| AWS IoT Greengrass V2 | Ejecuta componentes y procesa datos localmente en un dispositivo | El procesamiento *edge* ocurre en ese entorno local, no por publicar un JSON en la nube |

El [repositorio oficial de IoT Device Simulator](https://github.com/aws-solutions/iot-device-simulator) anuncia su deprecación desde el **29 de enero de 2025** y fue archivado al día siguiente. Su [último cambio de versión documentado es 3.0.9, del 29 de octubre de 2024](https://github.com/aws-solutions/iot-device-simulator/blob/main/CHANGELOG.md). El código sigue visible, pero el proyecto no recibe nuevas funciones ni actualizaciones; su README tampoco recomienda usarlo en producción.

Un tutorial antiguo puede mostrar Fargate, mientras otro muestra Step Functions y Lambda: la versión 3 cambió la arquitectura y no admitía actualizar directamente desde versiones anteriores. No trates esas instrucciones ni sus estimaciones de costos como una receta actual. Si ya tienes una instalación, revisa su versión, dependencias y recursos antes de mantenerla o retirarla.

Para trabajo local, consulta [qué hace Greengrass V2](https://docs.aws.amazon.com/greengrass/v2/developerguide/what-is-iot-greengrass.html). En pruebas industriales con OPC UA existe un [componente específico que genera datos para SiteWise Edge](https://docs.aws.amazon.com/greengrass/v2/developerguide/iotsitewise-opcua-data-source-simulator-component.html); requiere un dispositivo Greengrass y sus dependencias. Es una práctica más especializada que el ejercicio de MQTT que sigue.

## Primera práctica: publica lecturas de un sensor desde la consola

La meta es observar dos mensajes en un mismo topic y reconocer sus campos. No vas a crear una flota, ejecutar firmware ni medir capacidad de producción.

### Antes de empezar

Usa una cuenta de aprendizaje autorizada y una identidad IAM o federada con acceso a IoT Core. El cliente de consola utiliza tu sesión: **no necesitas crear un Thing ni descargar un certificado para esta práctica**. El acceso a la consola no garantiza permiso para publicar y recibir.

Quien administra tus permisos debe autorizar `iot:Connect`, `iot:Publish`, `iot:Subscribe` e `iot:Receive` para el cliente y los topics de prueba, además de los permisos de consulta que necesita la consola, como `iot:DescribeEndpoint`. Limita los recursos a esta práctica. AWS distingue `client/<clientId>`, `topic/<topic>` y `topicfilter/<filtro>` en sus [acciones de política](https://docs.aws.amazon.com/iot/latest/developerguide/iot-policy-actions.html) y [ejemplos de publicación y suscripción](https://docs.aws.amazon.com/iot/latest/developerguide/pub-sub-policy.html).

La identidad IAM de consola y un dispositivo con certificado no comparten automáticamente los mismos permisos: consulta la [tabla de autorización de IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/iot-authorization.html). Un cliente X.509 necesita una política IoT asociada a su certificado.

Selecciona una Región y anótala. Trabaja con datos ficticios y revisa los [precios de IoT Core](https://aws.amazon.com/iot-core/pricing/) antes de abrir conexiones o publicar. El ejercicio usa mensajes pequeños, pero no promete un costo cero.

### Publica y observa

1. Abre **AWS IoT Core → Test → MQTT test client**.
2. En **Subscribe to a topic**, escribe `aprendizaje/sensores/temperatura` y elige **Subscribe**.
3. En **Publish to a topic**, usa exactamente ese topic. Mantén desactivada la opción de mensaje retenido (*retain*) y publica este JSON:

```json
{
  "deviceId": "sensor-demo-01",
  "sequence": 1,
  "temperatureC": 22.5,
  "synthetic": true
}
```

4. Comprueba que aparezca el mensaje en la suscripción. Cambia `sequence` a `2` y `temperatureC` a `31.0`; publica de nuevo.
5. Confirma que puedas distinguir ambas lecturas por su secuencia y temperatura.

La [guía oficial del cliente MQTT](https://docs.aws.amazon.com/iot/latest/developerguide/view-mqtt-messages.html) documenta este flujo. Los topics distinguen mayúsculas y minúsculas. Un topic de publicación es un nombre concreto; los comodines `+` y `#` se usan en filtros de suscripción. Puedes probar el filtro `aprendizaje/sensores/+` para observar otros sensores de ese nivel. La [guía de topics MQTT](https://docs.aws.amazon.com/iot/latest/developerguide/topics.html) explica esos filtros.

**Qué comprobaste:** el cliente pudo publicar y recibir esos datos en el broker. Que el JSON contenga `deviceId` no autentica a ese dispositivo; es un campo que inventaste. Tampoco demuestra que una base de datos guardó la lectura ni que una alarma reaccionó. Para probar esos resultados necesitas añadir y observar el procesamiento correspondiente.

**Al terminar:** elimina las suscripciones de prueba y cierra el cliente para cortar la conexión. Sin *retain*, certificados, reglas ni otros recursos añadidos, esta práctica no deja un recurso de topic que debas borrar. Si activaste *retain*, elimina el mensaje retenido siguiendo la [documentación de mensajes retenidos](https://docs.aws.amazon.com/iot/latest/developerguide/mqtt.html#mqtt-retain).

Para acompañar los conceptos con una explicación en español, tienes [qué es IoT y cómo empezar en AWS, de Charlas Técnicas](https://www.youtube.com/watch?v=_1Ryarag_pE) y [primeros pasos con IoT y una demo con microcontroladores, del AWS User Group Perú](https://www.youtube.com/watch?v=pq3HK8zrF14). Son grabaciones: contrasta sus pantallas y requisitos con la documentación actual.

## Segundo paso: usa tu computadora como dispositivo

Cuando quieras probar autenticación y reconexiones de un cliente, sigue el [tutorial oficial para usar Windows, Linux o macOS como dispositivo IoT](https://docs.aws.amazon.com/iot/latest/developerguide/using-laptop-as-device.html). Instala Git, Python y el SDK v2 compatible con tu entorno; configura el endpoint de tu cuenta y Región, certificado activo, clave privada, CA y política IoT. El ejemplo `pubsub.py` publica y recibe mensajes.

Usa permisos que correspondan a su `clientId` y topic, y conserva la clave privada fuera del repositorio y de capturas compartidas. Si ejecutas dos clientes, asigna IDs diferentes: con el mismo ID, uno puede desconectar al otro. AWS documenta ese [conflicto de identificadores MQTT](https://docs.aws.amazon.com/iot-device-defender/latest/devguide/audit-chk-conflicting-client-ids.html).

Después puedes modificar el generador para emitir lecturas como las del ejercicio, con una cantidad y duración finitas. Escribir varios `deviceId` en una sola conexión permite probar datos de varios sensores, pero no equivale a probar varias conexiones ni sus permisos individuales.

Al terminar, detén el programa y elimina solo sus recursos de prueba: desvincula el certificado del Thing y de sus políticas; desactiva y elimina el certificado, y después elimina el Thing y las políticas que no compartas con otros clientes. Borra las copias locales de la clave privada que ya no necesites. La [guía de limpieza de recursos IoT](https://docs.aws.amazon.com/iot/latest/developerguide/iot-dc-cleanup.html) explica esas dependencias y cómo eliminar versiones de política adicionales. Si extendiste el ejercicio, revisa también reglas, destinos de almacenamiento y logs creados.

Si prefieres JavaScript, la guía sobre [errores del AWS IoT Device SDK para JavaScript](/blog/7-errores-comunes-con-aws-iot-device-sdk-para-javascript/) distingue Node.js, navegador, X.509 y WebSocket, y ayuda a diagnosticar permisos y desconexiones.

## Casos de uso: qué puedes comprobar con datos simulados

### Telemetría, paneles y alertas

Una secuencia controlada permite probar cómo responde tu aplicación a una temperatura normal, una lectura fuera de rango o un campo ausente. Define el resultado esperado antes de enviar: por ejemplo, mostrar la última lectura válida y rechazar un valor sin unidad. El broker transporta mensajes; la validación del esquema y la lógica de alertas pertenecen a tu aplicación.

Para ver proyectos de la comunidad, revisa el [Pit Wall de Álvaro García con IoT Core](https://dev.to/alvarongg/como-arme-un-pit-wall-con-aws-iot-core-y-por-que-este-patron-sirve-para-cualquier-industria-4lo1), que conecta telemetría de un simulador de carreras con procesamiento y almacenamiento. Úsalo para estudiar el flujo y el manejo de fragmentos; confirma las garantías de entrega y los permisos en AWS antes de adaptar código. Su [perfil en DEV](https://dev.to/alvarongg) reúne otras publicaciones para continuar.

El [monitoreo con Alexa, Raspberry Pi y sensores del AWS User Group Perú](https://www.youtube.com/watch?v=-lYaBFheUdI) muestra otra aplicación de lecturas IoT. La [introducción con IoT Core y ESP8266 del AWS User Group Ecuador](https://www.youtube.com/watch?v=ilMHiOXCZns) permite pasar del mensaje ficticio al hardware. Ambos requieren contrastar las versiones y pasos de sus grabaciones. Para otro ejemplo con hardware, [Ángel Pineda cuenta su proyecto de monitoreo ambiental con ESP32 e IoT Core](https://builder.aws.com/content/3JkzKadLy6UgcIARkhZwqutiVs3/cmo-io-t-core-despert-mis-ganas-de-ser-maker-otra-vez). Es un relato de una prueba de concepto; sus referencias a Free Tier no aseguran que tu proyecto sea gratuito.

### Ubicación y comandos de vehículos

Puedes generar puntos GPS ficticios para probar el recorrido de una lectura hacia un mapa, o respuestas a comandos para verificar estados de éxito y timeout. No conectes esa prueba a actuadores reales.

La [arquitectura de rastreo GPS de Alfredo Dominguez](https://www.alfredo-dominguez.dev/arquitecturas/05-gps-vehicle-tracking/) describe IoT Core, Lambda, DynamoDB y Amazon Location Service; la [documentación del proyecto de seguimiento de vehículos](https://www.alfredo-dominguez.dev/proyectos/gps-vehicle-tracking/) muestra la aplicación que consume esos datos. Son referencias para estudiar la integración, no una estimación de costos ni una garantía de capacidad para tu flota. Su [sitio de arquitecturas y proyectos](https://www.alfredo-dominguez.dev/) ofrece más ejemplos relacionados.

### Integraciones y datos sintéticos

Un caso histórico documentado es **BioInsyte**: Logiksavvy Innovations y AWS ProServe usaron IoT Device Simulator en una prueba de concepto con datos biométricos simulados. El [artículo de AWS sobre ese proyecto](https://aws.amazon.com/blogs/publicsector/designing-biometric-iomt-solution-support-health-equity-aws-proserve/) explica la integración con datos clínicos y visualización. Es evidencia de aquel uso del simulador, no una recomendación de desplegar hoy la solución retirada ni una validación clínica.

Para una práctica con hardware e IA generativa, Fernando Silva T explica una [app que genera chistes según la temperatura](https://dev.to/aws-espanol/integracion-iot-y-generative-ai-como-crear-una-app-que-cuenta-chistes-basados-en-la-temperatura-522), con [código para ESP8266 y DHT22](https://github.com/fernandosilvot/App-IoT_GenAI). Requiere hardware, cuenta AWS y uso de IoT Core, Lambda y Bedrock. El ejemplo muestra políticas amplias de demostración: restringe acciones y recursos antes de adaptarlo. Puedes seguir sus otros ejemplos en el [perfil de Fernando Silva T](https://dev.to/fernandosilvot).

Generar números aleatorios no demuestra que un modelo funcione con sensores reales. Para evaluar anomalías necesitas datos y fallos representativos, y una prueba separada con datos reales. El [AWS ML Day del AWS User Group Perú](https://www.youtube.com/watch?v=NVEbOgBTNSk) reúne introducciones a IoT, SageMaker y MLOps para explorar esa conexión, sin sustituir la validación del modelo.

## Escala y costos: cuenta mensajes, conexiones y destinos

Antes de simular una flota, define cuántos clientes estarán conectados, cada cuánto publican, cuánto dura la prueba y cuánto pesa cada mensaje. Por ejemplo, **100 sensores × 1 mensaje cada 10 segundos × 10 minutos = 6.000 publicaciones**. Es un cálculo de carga inventado para planificar, no un resultado medido ni un límite del servicio.

A esa carga se suman las entregas a suscriptores, minutos de conexión y, si los usas, operaciones de sombras, reglas y acciones. IoT Core mide mensajes en bloques de 5 KB: un mensaje de 8 KB cuenta como dos unidades. Lambda, DynamoDB, S3, Location, CloudWatch y cualquier servidor que genere tráfico tienen sus propios cargos. Calcula con la [tarifa de tu Región y los ejemplos de facturación de IoT Core](https://aws.amazon.com/iot-core/pricing/); no extrapoles el costo del broker al proyecto completo.

Un simulador también puede convertirse en el cuello de botella. Aumenta la carga gradualmente y observa tanto al generador como al receptor. Revisa las [cuotas de IoT Core para conexiones, publicación y tamaño de mensajes](https://docs.aws.amazon.com/general/latest/gr/iot-core.html), además de las cuotas de cada destino. Una prueba que publica datos de mil sensores desde una conexión no demuestra que mil dispositivos puedan conectarse al mismo tiempo.

Si todavía necesitas practicar permisos, almacenamiento y limpieza de recursos, los [laboratorios de AWS para principiantes](/blog/10-laboratorios-practicos-de-aws-para-principiantes/) permiten trabajar esas piezas antes de combinarlas en una solución IoT.

## Si no llegan mensajes: revisa el tramo que falla

| Síntoma | Qué comprobar |
|---|---|
| No aparece la publicación en consola | Misma cuenta y Región, suscripción anterior al envío, topic exacto y permiso de recepción |
| Conecta, pero no publica o no recibe | Acciones `Publish`, `Subscribe` y `Receive`, con sus respectivos recursos de política |
| El SDK no logra conectarse | Endpoint, red, certificado activo y registrado, clave correspondiente, CA y autorización de `clientId` |
| Los clientes se desconectan entre sí | Que no compartan el mismo `clientId` |
| Ves mensajes repetidos | Suscripciones superpuestas y uso de QoS 1; procesa con un identificador de mensaje para tolerar duplicados |
| El broker recibe, pero tu aplicación no actúa | Regla y filtro, permisos de la acción, errores del destino y validación del payload |

La [guía de diagnóstico de conectividad de AWS](https://docs.aws.amazon.com/iot/latest/developerguide/diagnosing-connectivity-issues.html) explica las comprobaciones de certificado y autorización. IoT Core admite QoS 0 y 1; **un acuse MQTT no confirma por sí solo que tu aplicación guardó un dato o ejecutó una orden**. Consulta las [garantías y límites de MQTT en IoT Core](https://docs.aws.amazon.com/iot/latest/developerguide/mqtt.html) y verifica el resultado en el destino que estés probando.

## Continúa con comunidades y recursos en español

Lleva a la comunidad un ejemplo pequeño: topic, payload ficticio, resultado esperado y error observado. Oculta claves, certificados y datos personales. No hace falta que el grupo esté especializado en IoT para conversar sobre IAM, costos o procesamiento de eventos.

- [AWS User Group Perú](https://awsugperu.cloud/) reúne grupos locales, talleres y recursos; sus grabaciones enlazadas arriba ofrecen varios puntos de entrada a IoT. También puedes consultar la [agenda y materiales del AWS Community Day Perú](https://awscommunityday.pe/), comprobando a qué edición corresponden.
- [AWS User Group Ecuador](https://www.awsugecuador.com/) publica encuentros y canales para participar. Su [canal de YouTube](https://www.youtube.com/channel/UCgzEFlDd-KR0BL5rlOVY7KQ) conserva charlas como la práctica con ESP8266.
- [AWS User Group Security Ecuador](https://www.awssecurityecuador.com/) ofrece encuentros y grabaciones sobre seguridad. Es una continuación útil cuando tu duda está en permisos o protección de la infraestructura.
- [Charlas Técnicas de AWS](https://podcast.marcia.dev/) tiene un archivo de conversaciones en español. Además de la introducción a IoT, el episodio [Transformando Food Tech con IoT](https://www.youtube.com/watch?v=qN6tBUJfNcI) permite explorar un contexto de negocio; la charla [Industrial IoT con Raúl Hugo](https://www.youtube.com/watch?v=61nuGOSj1Co) del grupo peruano amplía el enfoque industrial.

Encuentra otros grupos por ubicación en el [directorio de comunidades AWS](/comunidades/) y revisa la [agenda de próximos eventos](/eventos/) para elegir un encuentro de arquitectura, seguridad o datos. Verifica inscripción, modalidad y horario en el organizador; la agenda cambia y una grabación no representa un evento próximo.

## Preguntas frecuentes

### ¿IoT Device Simulator sigue disponible?

AWS retiró la solución y archivó el repositorio en enero de 2025. Conserva valor como referencia histórica, pero para empezar ahora puedes usar el cliente MQTT de consola o el SDK en tu computadora.

### ¿Puedo practicar sin un sensor físico?

Sí. La consola permite publicar mensajes ficticios, y un SDK puede ejecutarse en una computadora. Para la práctica en tu cuenta necesitas acceso a AWS y permisos; no necesitas un microcontrolador.

### ¿Esto prueba procesamiento edge o firmware?

El ejercicio de consola prueba mensajes en la nube. Para evaluar edge, ejecuta el componente real en el entorno Greengrass que quieres comprobar. Para evaluar firmware, usa el cliente o dispositivo correspondiente y prueba su transporte, autenticación y comportamiento; los datos ficticios no validan precisión del sensor, consumo eléctrico ni una red física.

### ¿Los datos simulados garantizan que el sistema funcionará en producción?

Ayudan a comprobar escenarios definidos. Completa después las pruebas con dispositivos, redes y datos representativos de tu entorno. Conserva por separado qué observaste en el broker, en el procesamiento y en el dispositivo: cada resultado responde una pregunta distinta.
