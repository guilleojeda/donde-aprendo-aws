---
title: "Cómo enviar alertas de AWS a Slack o Teams con Amazon Q Developer"
description: "Conecta alarmas de CloudWatch con Slack o Microsoft Teams usando Amazon Q Developer in chat applications y SNS. Configura permisos y valida la entrega."
author: "guille-ojeda"
publishedAt: "2024-05-20"
publishedTimestamp: "2024-05-20T00:27:01.26Z"
modifiedTimestamp: "2026-10-06T13:57:35-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Alertas de costos en AWS: configura AWS Budgets"
    url: "https://dondeaprendoaws.com/blog/automatizar-alertas-de-costos-aws-en-5-pasos/"
---

Si tu equipo ya usa Slack o Microsoft Teams, puedes recibir en un canal avisos de AWS sin alojar una plataforma de chat. [**Amazon Q Developer in chat applications**](https://docs.aws.amazon.com/chatbot/latest/adminguide/what-is.html) (antes AWS Chatbot) entrega notificaciones compatibles que llegan por Amazon SNS. Para una alarma de CloudWatch, el recorrido es: **CloudWatch → SNS → Amazon Q Developer → canal de Slack o Teams**. Este flujo ayuda a coordinar la respuesta operativa; no ofrece videollamadas ni edición compartida de documentos.

Necesitas una cuenta de AWS con permisos para configurar la alarma, el tema de SNS y la integración; también necesitas autorización del administrador de tu espacio de Slack o de Microsoft Teams. Elige primero qué aviso debe recibir el equipo y en qué canal.

## Configura una alarma de AWS en un canal

### 1. Elige una señal que requiera atención

Empieza con una métrica o evento que el equipo pueda investigar y atender. Por ejemplo, una alarma de CloudWatch puede avisar cuando una métrica de una función Lambda o una instancia EC2 cruce el umbral que definas. AWS explica cómo [crear una alarma de CloudWatch con un umbral estático](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ConsoleAlarms.html). Para practicar conceptos de métricas y alarmas, consulta la grabación [Observabilidad de tus aplicaciones de nube: CloudWatch Alarms](https://www.youtube.com/watch?v=uS0QE0NeqpA) y el [laboratorio práctico de Amazon CloudWatch](https://www.youtube.com/watch?v=ZdMM2W0vrvA) de AWS User Group Caracas, grabado en 2024. Evita enviar cada evento disponible al mismo canal: muchas alertas sin prioridad hacen más difícil detectar las que requieren acción.

Amazon Q Developer in chat applications también puede recibir notificaciones de otros servicios compatibles. Revisa la [lista de servicios y rutas admitidos por AWS](https://docs.aws.amazon.com/chatbot/latest/adminguide/related-services.html) antes de diseñar el flujo: algunos avisos se conectan mediante SNS y otros usan reglas de Amazon EventBridge.

### 2. Crea o elige un tema estándar de Amazon SNS

Una alarma de CloudWatch puede publicar en un tema de SNS cuando cambia de estado. Elige un tema **Standard** y anota la región donde existe, o reutiliza uno que ya envíe notificaciones al equipo. Amazon Q Developer no admite temas FIFO. Si la alarma ya envía correos u otros avisos al tema, puedes agregar el canal de chat como destino sin cambiar el umbral. La [documentación de AWS sobre alarmas de CloudWatch y SNS](https://docs.aws.amazon.com/chatbot/latest/adminguide/related-services.html#amazon-cloudwatch-alarms) explica cómo se enlaza el tema con el canal. Para un repaso general de servicios de notificación, puedes ver la sesión de AWS User Group Chile [Cloud Practitioner Challenge: Notification Services](https://www.youtube.com/watch?v=CRnKpcLRHtw); es una grabación introductoria, no el tutorial de esta integración.

### 3. Autoriza Slack o Microsoft Teams

En la consola de Amazon Q Developer in chat applications, configura el cliente que utiliza tu equipo y el canal que recibirá los avisos. AWS ofrece instrucciones para [configurar Slack](https://docs.aws.amazon.com/chatbot/latest/adminguide/slack-setup.html) y [configurar Microsoft Teams](https://docs.aws.amazon.com/chatbot/latest/adminguide/teams-setup.html). El administrador del espacio de Slack o Teams puede tener que aprobar la aplicación.

En Teams, el tutorial actual indica que los canales privados no son compatibles. En Slack, la guía de AWS describe canales públicos y privados; en ambos casos, confirma qué canales permite la política de tu organización.

### 4. Limita el rol a recibir notificaciones

Al asociar el canal, selecciona **Notification permissions** o un rol equivalente que permita entregar los avisos requeridos. No agregues permisos para ejecutar comandos de AWS ni invocar funciones Lambda si el canal solo necesita recibir alertas. Amazon Q Developer ofrece esas capacidades por separado y se controlan con permisos IAM y políticas de protección del canal.

Consulta la [guía de permisos de Amazon Q Developer in chat applications](https://docs.aws.amazon.com/chatbot/latest/adminguide/understanding-permissions.html) para elegir y revisar las políticas. Mantén el acceso a los canales acorde con quién debe ver las notificaciones; pueden contener nombres de recursos, estados de servicios u otros datos operativos.

### 5. Asocia el tema y la región

En la configuración del canal, agrega el tema SNS y selecciona la región donde existe. Si el canal debe recibir avisos de temas en varias regiones, agrega cada región en su configuración. Usa canales separados cuando cambien los responsables o el acceso permitido.

No todas las notificaciones de AWS siguen el mismo recorrido. Para alarmas de CloudWatch, asocia el tema SNS como acción de la alarma. Para otros servicios, sigue la ruta documentada para ese servicio y confirma que el evento esté admitido. Si necesitas estudiar una ruta personalizada para cambios de CodePipeline, este [ejemplo comunitario con SNS, Lambda y Slack](https://github.com/JonasCC8/AWS-CodePipeline-SNS-Lambda-Slack-Notifications) muestra esa arquitectura; cubre eventos del pipeline y es una implementación propia, separada de Amazon Q Developer.

### 6. Prueba la entrega y la alarma por separado

Envía un mensaje de prueba desde la consola de Amazon Q Developer y confirma que aparezca en el canal. Esta comprobación verifica la entrega a Slack o Teams, pero no demuestra que la alarma o el evento original se active como esperas.

Después, prueba la condición de CloudWatch en un entorno de prueba o con una señal controlada. Comprueba que la alarma cambie de estado, publique en el tema SNS y genere el aviso en el canal. La [guía de AWS para probar notificaciones con CloudWatch](https://docs.aws.amazon.com/chatbot/latest/adminguide/test-notifications-cw.html) describe el flujo. Si el aviso no llega, puedes habilitar logs opcionales para investigar permisos, eventos no admitidos o límites del cliente de chat; AWS advierte que CloudWatch Logs tiene un cargo adicional y explica cómo [habilitar y consultar esos registros](https://docs.aws.amazon.com/chatbot/latest/adminguide/cloudwatch-logs.html). Retira las alarmas temporales cuando termines y revisa los cargos de los servicios que habilitaste.

Si también quieres llevar avisos de gasto al canal, sigue la guía relacionada sobre [alertas de costos con AWS Budgets](https://dondeaprendoaws.com/blog/automatizar-alertas-de-costos-aws-en-5-pasos/). Budgets tiene sus propios umbrales y condiciones; no reutiliza la condición de una alarma de CloudWatch. Para ampliar el tema de gestión de costos, mira la grabación [FinOps en acción: optimización real de costos en la nube](https://www.youtube.com/watch?v=UphnnilH09A), una sesión del AWS User Group CreaTicas junto con AWS User Group San José.

### 7. Define qué hará el equipo cuando llegue el aviso

Un mensaje compartido no asigna por sí solo a alguien la investigación. Aclara quién revisa cada tipo de alerta, dónde consultar métricas y registros, y cómo dejar constancia del diagnóstico. Si conectas un procedimiento de respuesta, enlázalo en el mensaje o en la documentación del equipo para que la conversación lleve a una acción verificable. La sesión comunitaria [Nadie apretó un botón: respuesta automática a incidentes con servicios nativos de AWS](https://www.youtube.com/watch?v=kiz4Ls7YRm0) muestra un paso posterior posible: automatizar algunas respuestas. Si el aviso apunta a una ejecución de Step Functions iniciada por EventBridge, consulta la guía sobre [cómo correlacionar eventos con `correlationId` y buscar la ejecución en CloudWatch Logs](/blog/correlacion-de-eventos-con-step-functions-y-cloudwatch/).

## Límites y decisiones antes de usarlo

- **No reemplaza una herramienta de colaboración general.** Amazon Q Developer in chat applications lleva notificaciones y algunas acciones de AWS a clientes de chat compatibles; no es un servicio para reuniones o trabajo conjunto con archivos.
- **Amazon Chime ya no sirve como una opción nueva de reuniones.** AWS terminó el soporte de la aplicación Amazon Chime el 20 de febrero de 2026. El anuncio aclara que Amazon Chime SDK es un servicio distinto y no queda afectado por ese cambio. Algunas páginas de documentación de Amazon Q Developer aún mencionan integraciones heredadas de Chime; sigue las guías actuales de Slack o Teams para una configuración nueva. [Lee el aviso de AWS sobre Amazon Chime](https://aws.amazon.com/blogs/messaging-and-targeting/update-on-support-for-amazon-chime/).
- **Amazon WorkDocs llegó a apagado total.** AWS marca el 25 de abril de 2025 como su fecha de fin de soporte y enumera el servicio entre los apagados completos. No lo uses como destino nuevo para compartir archivos; consulta el [estado del ciclo de vida de WorkDocs en AWS](https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html).
- **Mattermost es una implementación aparte.** Los tutoriales de Amazon Q Developer enlazados arriba cubren Slack y Teams, no documentan un cliente nativo para Mattermost. Si tu organización ya eligió Mattermost, diseña y opera esa integración aparte; no necesitas instalarlo en AWS para enviar alertas a Slack o Teams. Además, Mattermost indica que retira MySQL en la versión 11 y que las implementaciones nuevas deben usar PostgreSQL. Revisa su [guía actual de preparación del servidor](https://docs.mattermost.com/deployment-guide/server/preparations) antes de planificar una instalación.
- **La prueba y los registros pueden tener cargos.** AWS informa que habilitar logs de esta configuración en CloudWatch tiene un cargo adicional. Revisa los precios vigentes de [Amazon CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) y [Amazon SNS](https://aws.amazon.com/sns/pricing/) para los recursos que uses.

## Comunidades y eventos para seguir aprendiendo

Para conversar sobre arquitectura AWS con otras personas, consulta el [AWS User Group Serverless Colombia](https://www.meetup.com/aws-user-group-serverless-colombia/). Su ficha anuncia un encuentro virtual el **20 de octubre de 2026 a las 19:00, hora de Colombia**, sobre [SQS y Lambda](https://www.meetup.com/aws-user-group-serverless-colombia/events/316770520/); revisa allí el estado del registro y cualquier cambio. También puedes buscar grupos de otros países en el [directorio de comunidades AWS en Latinoamérica](/comunidades/) y actividades remotas en la [agenda de eventos en línea](/eventos/online/).
