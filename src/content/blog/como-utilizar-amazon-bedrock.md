---
title: "Qué es Amazon Bedrock y cómo usarlo: API, permisos y costos"
description: "Aprende a usar Amazon Bedrock con el SDK de AWS: elige un modelo y región, invoca con Converse, configura permisos IAM y revisa costos y errores."
author: "guille-ojeda"
publishedAt: "2024-03-18"
publishedTimestamp: "2024-03-18T23:27:52.315Z"
modifiedTimestamp: "2026-10-06T09:52:18-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Aprender AWS gratis en español: cursos, práctica y comunidades"
    url: "https://dondeaprendoaws.com/blog/aprender-aws-gratis-recursos-y-comunidad/"

---

Amazon Bedrock permite integrar modelos fundacionales de Amazon y otros proveedores en una aplicación mediante APIs de AWS. Para empezar, elige un modelo compatible con tu tarea y región, configura una identidad con permisos para invocarlo y envía una solicitud con el SDK. En una aplicación conversacional, la API Converse ofrece una estructura común para los modelos que admiten mensajes.

AWS administra la infraestructura que sirve los modelos; tu equipo todavía debe decidir cómo autenticar la aplicación, qué datos envía, dónde se procesa la solicitud y cómo controlar el gasto. Esta guía muestra un primer llamado con Python y explica los permisos, las regiones, los costos y los errores comunes.

## Qué es Amazon Bedrock

Amazon Bedrock es un servicio administrado para crear aplicaciones de IA generativa con modelos fundacionales ([descripción general oficial](https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html)). Además de invocar modelos, ofrece capacidades como bases de conocimiento para recuperar información propia y Guardrails para configurar controles sobre entradas y respuestas. No necesitas entrenar un modelo desde cero para probar una conversación.

Una invocación genera una respuesta a partir de la solicitud que envías. El modelo elegido determina qué tipos de entrada y salida admite, los parámetros disponibles, la API compatible y el precio. El [catálogo de modelos de Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html) reúne esos datos y enlaza las fichas de cada modelo.

## Cómo empezar con Bedrock

Antes de escribir código, comprueba tres cosas:

1. **Modelo y API.** Define qué tarea quieres resolver y compara las capacidades, el idioma, la latencia, las condiciones de uso y el costo. La API [Converse](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html) normaliza la solicitud y la respuesta para los modelos compatibles con mensajes. Para streaming necesitas el permiso <code>bedrock:InvokeModelWithResponseStream</code>; para Converse, <code>bedrock:InvokeModel</code>. Si necesitas el formato nativo de un proveedor, imágenes, embeddings u otra modalidad, revisa si corresponde usar InvokeModel u otra API.
2. **Región.** La disponibilidad depende del modelo y de la operación. Comprueba la compatibilidad en la [tabla de regiones de modelos](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html) y configura el SDK con una región que admita el modelo elegido. Una solicitud con un identificador o endpoint de otra región puede fallar. Los [perfiles de inferencia entre regiones](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html) pueden dirigir solicitudes a más de una región; valida su ruta y los requisitos de residencia de datos antes de usarlos.
3. **Identidad y permisos.** Para Converse, la identidad necesita permiso <code>bedrock:InvokeModel</code>. Configura el SDK para usar una identidad IAM o credenciales temporales de AWS, con los permisos que correspondan a tu cuenta y modelo. El [inicio rápido de AWS](https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html) también documenta claves temporales de Bedrock para pruebas. AWS recomienda roles o credenciales temporales para aplicaciones de producción; no guardes credenciales de larga duración en el código, el repositorio o una aplicación de navegador.

El acceso a muchos modelos está disponible con los permisos correctos de AWS Marketplace, pero no todos siguen el mismo proceso. Algunos requieren habilitación adicional por cuenta o completar pasos del proveedor; por ejemplo, ciertos modelos Anthropic requieren presentar los datos de uso antes de la primera invocación. Lee el acuerdo de licencia y los requisitos de acceso de la ficha del modelo. La [guía de acceso a modelos](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) explica las condiciones vigentes.

## Ejemplo: una llamada con Converse y Boto3

Instala Boto3 y prepara la autenticación antes de invocar. Para un equipo local con IAM Identity Center, crea un perfil con <code>aws configure sso --profile bedrock-dev</code> y autentícate con <code>aws sso login --profile bedrock-dev</code>. Boto3 puede usar ese perfil mediante una sesión; en una carga de AWS, asigna un rol de ejecución con los permisos necesarios. Consulta la guía de [SSO de AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html) y la cadena de [credenciales de Boto3](https://docs.aws.amazon.com/boto3/latest/guide/credentials.html). El ejemplo usa Amazon Nova Micro con <code>us-east-1</code>, combinación que figura como disponible en la documentación de AWS. Confirma el modelo y la región antes de adaptar el ejemplo a tu cuenta.

~~~python
import boto3

session = boto3.Session(profile_name="bedrock-dev")
client = session.client("bedrock-runtime", region_name="us-east-1")

response = client.converse(
    modelId="amazon.nova-micro-v1:0",
    messages=[
        {
            "role": "user",
            "content": [{"text": "Resume en tres frases qué es Amazon Bedrock."}],
        }
    ],
    inferenceConfig={"maxTokens": 150, "temperature": 0.2},
)

text = response["output"]["message"]["content"][0]["text"]
print(text)
~~~

La respuesta de texto aparece en <code>output.message.content</code>. En una aplicación con varios turnos, conserva el historial que necesites y vuelve a enviarlo en el siguiente mensaje; tu aplicación administra esa conversación. Esta solicitud ejecuta inferencia y puede generar cargos según el modelo y la forma de uso. La [guía oficial de Converse para Python](https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started-api-ex-python.html) incluye ejemplos y requisitos adicionales.

## Cómo revisar los costos

Amazon Bedrock no tiene un único precio para todos los usos. En inferencia bajo demanda, el costo depende del modelo y de sus unidades de uso, como tokens de entrada y salida. Otras modalidades y capacidades pueden tener tarifas distintas. Antes de ejecutar una carga, consulta la [página de precios de Bedrock](https://aws.amazon.com/bedrock/pricing/) para el modelo, la región, el nivel de servicio y las funciones que usarás.

Haz una estimación con el tamaño realista de los prompts, el volumen de solicitudes y la longitud de las respuestas. Si pruebas un modelo desde la consola o desde el código, la inferencia también puede generar cargos. Configura avisos en [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html) para recibir alertas; un presupuesto avisa, pero no funciona como un límite general que detenga los cargos.

CloudWatch sirve para observar volumen, latencia, tokens, errores y solicitudes limitadas. Sus métricas de Bedrock incluyen <code>Invocations</code>, <code>InvocationLatency</code>, <code>InputTokenCount</code>, <code>OutputTokenCount</code>, <code>InvocationClientErrors</code>, <code>InvocationServerErrors</code> e <code>InvocationThrottles</code>; son métricas de uso y operación, no un reporte completo de dólares. Para revisar el gasto usa AWS Cost Explorer. Si necesitas datos detallados de facturación, consulta AWS Data Exports o los informes de costos y uso. La [guía de métricas de Bedrock Runtime](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-runtime-metrics.html) y la documentación de [costos y uso de Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-understanding-cur-data.html) explican qué muestran estas fuentes y sus demoras.

Para comparar modelos, Daniel Castillo publicó [un análisis de inteligencia frente a costo para Bedrock](https://dcastillogi.com/blog/bedrock-inteligencia-vs-costo), con un corte de datos al 24 de septiembre de 2026. El gráfico combina precios bajo demanda de <code>us-east-1</code> con una medición externa de capacidad. Úsalo para orientar una lista de opciones y verifica el precio actual y el desempeño con tu tarea: un benchmark no predice por sí solo el resultado de tu aplicación.

## Errores frecuentes al invocar modelos

- **Acceso denegado (403):** comprueba que las credenciales pertenezcan a la cuenta y al rol esperados; revisa <code>bedrock:InvokeModel</code>, las políticas de la organización y los requisitos de acceso o suscripción del modelo. Si el modelo es de Anthropic, confirma también si tu cuenta debe presentar los datos de uso.
- **Modelo no encontrado (404):** verifica el identificador exacto, la región del cliente y que la operación esté disponible para ese modelo.
- **Solicitud no válida (400):** revisa los campos obligatorios y los parámetros admitidos por el modelo. Los formatos de InvokeModel pueden variar entre proveedores; Converse reduce esas diferencias para los modelos compatibles.
- **Límite de solicitudes (429) o servicio temporalmente no disponible (503):** consulta las [cuotas de Bedrock](https://docs.aws.amazon.com/servicequotas/latest/userguide/request-quota-increase.html). Para errores transitorios, usa reintentos con espera exponencial y variación aleatoria; no reenvíes de inmediato en un bucle. Si necesitas pedir más capacidad, [Daniel Castillo explica cómo reunir datos de uso y tramitar un aumento de cuota](https://dcastillogi.com/blog/como-solicitar-aumentos-de-cuota-para-amazon-bedrock-y-que-te-los-aprueben); contrasta cada paso con Service Quotas y CloudWatch, porque sus métricas y límites pueden cambiar.

AWS mantiene una [guía de resolución de errores de la API](https://docs.aws.amazon.com/bedrock/latest/userguide/troubleshooting-api-error-codes.html) con los códigos y pasos de diagnóstico. No conviene reintentar todos los errores: corrige los permisos, el modelo o la solicitud cuando el problema no sea transitorio.

## Recursos para practicar y seguir aprendiendo

Si ya hiciste una primera llamada y quieres construir sobre ella, el [curso de agentes con Strands de Ricardo Ceci](https://github.com/ricardoceci/curso-strands-agentcore-2026) empieza con un notebook de primer agente que usa Bedrock y luego avanza por herramientas, MCP, memoria y coordinación multiagente. El README consultado detalla las clases 1 a 3; requiere Python 3.11+ y acceso a Bedrock para el primer laboratorio. Algunos ejercicios posteriores usan servicios o claves externas, como Duffel o mem0. Revisa el repositorio para confirmar qué material de AgentCore está disponible antes de seguir esos pasos.

Para ver un proyecto que crece en entregas, el repositorio de Hazel Sáenz [Copiloto de código con Strands Agents y Amazon Bedrock](https://github.com/hsaenzG/Copiloto-de-Codigo) reúne los tres primeros episodios publicados de una serie en desarrollo: agente con herramientas, memoria y RAG sobre un repositorio, además de una API con FastAPI. Está pensado para desarrollo con Python 3.11+ y Bedrock, no para una primera llamada sin configuración.

Si quieres estudiar una interfaz web para un agente ya desplegado, el [chatbot de guía escolar de Roxs](https://github.com/roxsross/aws-learning-day-chatbot) muestra una página estática conectada a una función Lambda que invoca un agente de Bedrock. Necesita el endpoint y el ID de un agente obtenidos de una pila de CloudFormation; no es un ejemplo aislado de Converse.

Para una arquitectura con datos propios, la guía de Hazel Sáenz [Chatea con tu propia data con Strands y Amazon Bedrock](https://dev.to/aws-espanol/chatea-con-tu-propia-data-guia-practica-con-strands-y-amazon-bedrock-222b) recorre una API con Lambda, una Knowledge Base y CDK. Pide Python 3.12, Docker, AWS CLI, CDK y permisos para desplegar; crea recursos de AWS que pueden generar cargos, por lo que conviene revisar los precios y eliminar los recursos de prueba al terminar.

Si prefieres practicar con otras personas, [AI AWS User Group Chile](https://www.meetup.com/es-es/ai-aws-ug-chile/) presenta una comunidad centrada en IA y machine learning sobre AWS; su descripción incluye Bedrock, RAG, SageMaker e IA responsable. Revisa su perfil para conocer las próximas actividades y las instrucciones de inscripción.

[AWS User Group Panamá](https://www.meetup.com/aws-user-group-panama/) reúne a personas que trabajan con AWS y a quienes están empezando. Su perfil publica un [grupo de Telegram](https://t.me/awsPanama) para conectar con la comunidad. En las agendas consultadas para octubre y noviembre de 2026 aparecen tres encuentros que puedes considerar como continuación:

- El [9 de octubre, de 18:00 a 20:00 (hora de Bolivia, UTC−4)](https://www.meetup.com/aws-sbg-at-bolivian-private-university-santa-cruz-campus/events/316812108/), hay un taller presencial en Santa Cruz de la Sierra para construir un agente con Strands Agents y Amazon Bedrock. El organizador ofrece una cuenta sandbox y pide llevar una laptop; consulta los cupos en la ficha.
- El [13 de octubre, de 18:00 a 20:00 (hora de Panamá, UTC−5)](https://www.meetup.com/aws-user-group-panama/events/316730635/), AWS User Group Panamá anuncia un taller presencial sobre Bedrock, Strands y MCP. La ficha indica que la ubicación todavía está pendiente y que habrá cuentas de AWS y créditos para la práctica; confirma cupos, sede y condiciones con los organizadores.
- El [19 de noviembre, a las 15:00 de Panamá y Colombia (UTC−5)](https://www.meetup.com/aws-user-group-panama/events/316730779/), está anunciado SegurAWS Américas, un encuentro virtual en español de cinco AWS User Groups sobre Bedrock Guardrails. La descripción incluye un laboratorio guiado y un sandbox; consulta en Meetup el registro y la disponibilidad.

Las agendas pueden cambiar y las fichas consultadas no declaran que estos eventos sean gratuitos. Confirma los detalles en el enlace del organizador antes de participar o consulta la [agenda actualizada de eventos AWS](/eventos/). Si buscas cursos, laboratorios y más grupos en español, continúa con [Aprender AWS gratis en español: cursos, práctica y comunidades](/blog/aprender-aws-gratis-recursos-y-comunidad/).
