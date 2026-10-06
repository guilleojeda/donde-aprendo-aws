---
title: "Cómo desarrollar aplicaciones de IA en AWS: guía práctica"
description: "Elige entre Bedrock, SageMaker AI y APIs de IA. Crea un prototipo con Python, revisa permisos, costos y pruebas, y continúa aprendiendo en comunidad."
author: "guille-ojeda"
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T00:01:17.799Z"
modifiedTimestamp: "2026-10-06T11:23:43-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Cómo desplegar contenedores en AWS: elige entre ECS, EKS y Fargate"
    url: "https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/"
  - title: "Cómo usar AWS Cost Explorer: filtros y costos que no aparecen"
    url: "https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/"
---

Para desarrollar una aplicación de inteligencia artificial en AWS, **empieza por una función concreta, elige una API o un modelo que la resuelva y pruébalo desde tu backend antes de construir toda la aplicación**. No necesitas entrenar un modelo desde cero para resumir texto, extraer información de documentos o incorporar un asistente.

Si necesitas generar o transformar texto, Amazon Bedrock puede ser el primer camino. Si necesitas entrenar o desplegar un modelo con un flujo de machine learning propio, considera Amazon SageMaker AI. Para una tarea especializada, como extraer texto de un documento, una API de IA puede evitar trabajo que un modelo generativo no necesita asumir.

Esta guía desarrolla un primer prototipo de resumen con Bedrock y Python, explica cómo convertirlo en una función de aplicación y reúne recursos en español para practicar y encontrar ayuda. El ejemplo hace una llamada de inferencia; no despliega una aplicación pública ni promete un resultado de calidad sin pruebas.

## Elige el servicio según el resultado que necesitas

La IA es un campo amplio; el aprendizaje automático o *machine learning* es una de sus herramientas. Los modelos se ajustan a partir de datos y objetivos, pero eso no significa que aprendan automáticamente de cada conversación de tu aplicación. Tampoco todo problema necesita IA generativa.

| Necesidad | Punto de partida | Qué debes comprobar |
| --- | --- | --- |
| Generar texto, resumir, conversar o interpretar contenido con un modelo fundacional | Amazon Bedrock | Capacidades del modelo, API compatible, región, permisos, calidad y costo de cada llamada |
| Extraer texto, formularios o tablas de documentos | Amazon Textract | Formatos, límites y modalidad síncrona o asíncrona del documento |
| Convertir texto a voz o audio a texto | Amazon Polly o Amazon Transcribe | Idioma, voz o modelo, formatos y límites de la operación elegida |
| Entrenar, ajustar o servir un modelo con un flujo de ML propio | Amazon SageMaker AI | Datos, evaluación, recursos de entrenamiento e inferencia y operación del modelo |

Consulta las funciones y límites actuales de [Textract](https://docs.aws.amazon.com/textract/latest/dg/what-is.html), [Polly](https://docs.aws.amazon.com/polly/latest/dg/what-is.html) y [Transcribe](https://docs.aws.amazon.com/transcribe/latest/dg/what-is.html) antes de elegir una API. El artículo de Elizabeth Fuentes [Inteligencia artificial como API en tu aplicación](https://dev.to/aws-espanol/inteligencia-artificial-como-api-en-tu-aplicacion-2kee) muestra ejemplos de integración en español. Es de 2023: sirve para entender el patrón, mientras que formatos, modelos y condiciones se verifican en la documentación vigente.

**Bedrock y SageMaker AI no son intercambiables.** Bedrock permite consumir modelos mediante APIs administradas; SageMaker AI ofrece herramientas para desarrollar, entrenar y desplegar modelos. Puedes [desplegar en SageMaker AI un modelo preentrenado o creado fuera de ese servicio](https://docs.aws.amazon.com/sagemaker/latest/dg/deploy-model-get-started.html); entrenar desde cero no es obligatorio. Decide por el control que necesita tu caso, no por cuál servicio tiene más funciones.

Si tu siguiente paso es trabajar con modelos propios, estas grabaciones del catálogo ofrecen rutas distintas: [machine learning para desarrolladores con SageMaker, del AWS User Group Perú](https://www.youtube.com/watch?v=4IAJOSCwWOo), [redes neuronales con TensorFlow en SageMaker, del grupo de Paraguay](https://www.youtube.com/watch?v=yzAd3XLWjLU), y [Hugging Face y SageMaker, de Carlos Cortez](https://www.youtube.com/watch?v=4yJFcv1sASA). Para explorar la operación del modelo, el [ML Day de Perú sobre SageMaker y MLOps](https://www.youtube.com/watch?v=NVEbOgBTNSk) amplía el recorrido. Son materiales comunitarios: verifica versiones de SDK, imágenes y recursos antes de reproducir sus prácticas.

También puedes estudiar el [notebook introductorio de SageMaker Clarify de Brenda Galicia](https://dev.to/bgalicia/ia-responsable-con-amazon-sagemaker-clarify-mhc) y la [sesión sobre IA responsable de AWS Girls Chile](https://www.youtube.com/watch?v=x_MHs9hLx0s) para conocer preguntas sobre sesgos y explicabilidad. El notebook es de 2024; compáralo con la documentación actual antes de ejecutarlo. Estas herramientas aportan información para evaluar modelos, no una garantía automática de equidad o de calidad.

## Define una primera función que puedas comprobar

En vez de «crear un chatbot inteligente», formula una tarea con entrada y salida claras. Por ejemplo: «Dado un aviso de mantenimiento, producir un resumen de hasta tres frases que conserve la fecha, los servicios afectados y la acción solicitada».

Antes de programar, reúne ejemplos de avisos normales, avisos incompletos y textos que no contienen un mantenimiento. Decide qué debería hacer la aplicación en cada caso. Si no hay una fecha, la respuesta debería reconocerlo; inventarla sería un fallo, aunque el texto resultante suene bien.

Esto te permite comparar el resultado con una respuesta esperada y comprobar omisiones, invenciones, latencia y costo. Conserva algunos ejemplos para probar después de cambiar el modelo o las instrucciones. Usa datos sintéticos o información que tengas permiso para procesar.

## Requisitos para probar Amazon Bedrock

Necesitas una cuenta con acceso al servicio, credenciales de una identidad autorizada, Python 3, el SDK Boto3 y un modelo compatible con **Converse** en la región o perfil de inferencia elegido.

1. **Comprueba cuenta y acceso.** Protege la identidad raíz con MFA y utiliza credenciales temporales para el trabajo habitual, siguiendo las [buenas prácticas de IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html). Si estás empezando, la [ruta para aprender AWS desde cero](/blog/aws-aprender-guia-inicial/) explica estos preparativos.
2. **Elige un modelo por capacidades.** Revisa las [fichas de modelos y su compatibilidad con las APIs](https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html) y sus [regiones o perfiles disponibles](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html). Copia un identificador válido para esa configuración; un modelo no está necesariamente disponible en todas las regiones.
3. **Verifica permisos y condiciones del proveedor.** Para `Converse` se necesita `bedrock:InvokeModel` sobre los recursos correspondientes. El acceso inicial a algunos modelos de terceros puede necesitar permisos de AWS Marketplace, condiciones de suscripción y, para ciertos modelos de Anthropic, información del caso de uso. Sigue la [guía actual de acceso a modelos](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html); no concedas esos permisos de administración indiscriminadamente al backend.
4. **Revisa costos antes de llamar.** La [página de precios de Bedrock](https://aws.amazon.com/bedrock/pricing/) distingue modelos y modalidades. No asumas un año gratuito: el [Free Tier actual](https://aws.amazon.com/free/) tiene planes, créditos, elegibilidad y restricciones que debes comprobar para tu cuenta y servicio.

Si usas un perfil con inferencia entre regiones, revisa dónde puede procesarse la solicitud. La región del cliente SDK, por sí sola, no garantiza que toda la inferencia permanezca allí.

## Primer prototipo: resumir un texto con Python y Converse

La [API Converse](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html) ofrece una estructura común de mensajes para modelos compatibles. No hace que todos los modelos admitan las mismas funciones o parámetros.

En una terminal de macOS o Linux, crea un entorno para esta práctica:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install boto3

export AWS_REGION='us-east-1'
export MODEL_ID='REEMPLAZA_CON_UN_MODELO_O_PERFIL_COMPATIBLE'
aws sts get-caller-identity
```

El último comando requiere AWS CLI y solo confirma la identidad de tu sesión; no demuestra que tengas permisos de inferencia. Cambia `AWS_REGION` y `MODEL_ID` por una combinación verificada. Boto3 debe poder encontrar las credenciales de tu perfil o sesión: no pegues claves en el archivo. En Windows, activa el entorno y define las variables con los comandos equivalentes de tu terminal.

Guarda este código como `resumir.py`:

```python
import os

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

client = boto3.client(
    "bedrock-runtime",
    region_name=os.environ["AWS_REGION"],
    config=Config(retries={"mode": "standard", "total_max_attempts": 3}),
)

texto = (
    "El 12 de noviembre, de 02:00 a 03:00 UTC, se realizará un "
    "mantenimiento del portal de pruebas. Durante esa hora no se "
    "podrán crear solicitudes nuevas. Guarda tu trabajo antes de las 02:00 UTC."
)

try:
    response = client.converse(
        modelId=os.environ["MODEL_ID"],
        messages=[{
            "role": "user",
            "content": [{"text": (
                "Resume el siguiente aviso en hasta tres frases. "
                "Conserva fecha, horario, servicio y acción solicitada. "
                "No agregues información que no aparezca en el aviso.\n\n"
                + texto
            )}],
        }],
        inferenceConfig={"maxTokens": 200},
    )
except ClientError as error:
    codigo = error.response["Error"]["Code"]
    raise SystemExit(f"La llamada a Bedrock falló: {codigo}") from error

bloques = response["output"]["message"]["content"]
resumen = "\n".join(b["text"] for b in bloques if "text" in b)
if not resumen:
    raise SystemExit("El modelo no devolvió un bloque de texto.")

print(resumen)
print("Uso de tokens:", response.get("usage", {}))
print("Motivo de finalización:", response.get("stopReason"))
```

Ejecuta `python resumir.py`. La salida exacta depende del modelo: comprueba que conserve el **12 de noviembre**, el intervalo **02:00–03:00 UTC**, el portal afectado y la indicación de guardar el trabajo. `maxTokens` limita la generación; no garantiza tres frases ni fija el costo total de la solicitud. Si `stopReason` indica `max_tokens`, revisa si el resumen quedó truncado.

La estructura se basa en la [referencia de Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html). Para pasar de esta prueba a una interfaz, [Potenciando aplicaciones de IA con Bedrock y Streamlit](https://dev.to/aws-espanol/potenciando-aplicaciones-de-ia-con-aws-bedrock-y-streamlit-4eh8) ofrece un ejemplo comunitario en español. Contrasta las dependencias y el identificador del modelo antes de copiarlo.

## Convierte el prototipo en una función de aplicación

Una integración básica puede seguir este recorrido: **usuario autenticado → API de tu aplicación → validación → Bedrock → comprobación de la respuesta → usuario**. En este patrón, el backend llama a Bedrock mediante el rol que asume la aplicación; sus credenciales no se entregan al navegador.

- **Valida la entrada antes de llamar.** Limita el tamaño, admite los formatos que realmente procesas y verifica quién puede utilizar la función. Un texto recibido de un usuario o documento es dato no confiable: no debe otorgar permisos al modelo ni cambiar las reglas de la aplicación.
- **Controla el trabajo.** Define tiempo de espera, concurrencia y reintentos acotados. Un usuario que reenvía el mismo pedido o una cola que lo repite puede multiplicar las llamadas facturadas.
- **Valida la salida según la tarea.** Para un resumen, revisa datos esenciales y tratamiento de entradas incompletas. Para una respuesta JSON, parsea y valida su estructura antes de usarla. El texto del modelo no debe convertirse automáticamente en un comando, consulta libre o acción sobre recursos.
- **Mide sin volcar datos sensibles.** Registra identificador de solicitud, modelo, tiempos, errores y uso de tokens cuando corresponda. Decide explícitamente qué contenido necesitas conservar y quién puede leerlo.

El tutorial de [aplicación React con Bedrock y AWS SDK, de Elizabeth Fuentes](https://community.aws/content/2cPcmjVFETxNNLUm1LNkqSOHasu/building-reactjs-generative-ai-apps-with-amazon-bedrock-and-aws-javascript-sdk?lang=es-ES) muestra otra integración con autenticación. Si adoptas una llamada desde el cliente, revisa los permisos de esa identidad y cómo limitar su consumo. Una demo de interfaz no define por sí sola los controles que necesita una aplicación pública.

Para elegir dónde ejecutar tu backend, consulta [cómo desplegar contenedores en AWS](/blog/como-desplegar-contenedores-en-aws/). ECS y EKS coordinan la ejecución de la aplicación; Bedrock atiende las solicitudes de inferencia. No necesitas convertir el modelo administrado en un contenedor propio.

Si guardas solicitudes, sesiones o estados de procesamiento en DynamoDB, diseña sus claves y acceso por usuario. La [guía de escalado y capacidad de DynamoDB](/blog/como-escala-dynamodb-modos-on-demand-y-provisioned/) explica cómo estimar ese tráfico y reconocer límites. DynamoDB no sustituye al modelo ni incorpora automáticamente conocimiento a sus respuestas.

## Datos propios, RAG y agentes: añade solo lo que haga falta

**RAG** combina recuperación de información con generación. Por ejemplo, para responder preguntas sobre un manual, la aplicación recupera fragmentos pertinentes y los aporta al modelo junto con la pregunta. [Amazon Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html) ofrece funciones administradas para ese recorrido.

Una cita no demuestra que la respuesta sea correcta. Comprueba que el fragmento respalde lo afirmado y que el usuario tenga permiso para verlo; las restricciones de acceso también deben aplicarse a la recuperación. Actualiza o elimina las fuentes cuando cambien sus contenidos o permisos.

Como continuación práctica, [De notebook a serverless: un buscador multimodal con Bedrock y PostgreSQL](https://dev.to/aws-espanol/de-notebook-a-serverless-creando-un-motor-de-busqueda-multimodal-con-amazon-bedrock-y-postgresql-22ao) permite explorar cómo se conectan modelos y búsqueda. La [integración de un asistente de WhatsApp con Bedrock](https://dev.to/aws-espanol/construyendo-un-asistente-genai-de-whatsapp-con-amazon-bedrock-y-claude-3-1322) muestra otro caso de aplicación; su referencia a Claude 3 requiere revisar disponibilidad y sustituir el modelo si corresponde.

Un agente incorpora herramientas y decisiones sobre su uso. Empieza con una herramienta de alcance limitado, verifica sus argumentos y exige autorización para acciones que la aplicación no debería ejecutar sola. Para aprender en español:

- El [curso modular de Strands Agents de Píldoras de Programación](https://github.com/pildorasdeprogramacion/curso-strands-agents) construye un asistente para una academia y enlaza sus clases.
- El [curso de Strands y Bedrock AgentCore de Ricardo Ceci](https://github.com/ricardoceci/curso-strands-agentcore-2026) reúne código y módulos desde el desarrollo hasta el despliegue; revisa los costos y requisitos de cada ejercicio.
- La lectura [cómo detener la inyección de prompts en agentes que leen contenido no confiable](https://dev.to/aws-espanol/como-detener-la-inyeccion-de-prompts-en-agentes-de-ia-que-leen-contenido-no-confiable-10h2) ayuda a reconocer por qué un documento o una salida de herramienta no debe convertirse en una instrucción autorizada.

Estos pasos son opcionales: un resumen puede funcionar con una sola llamada, sin RAG ni agentes.

## Seguridad, costos y limpieza

Sigue la [guía de protección de datos de Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html) y verifica el tratamiento de datos de los recursos y funciones que actives. La API Converse documenta que no almacena el contenido enviado para generar su respuesta; eso no describe automáticamente tus logs, bases de datos, archivos ni todas las demás funciones de la aplicación.

[Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html) puede aplicar filtros y políticas, pero su cobertura debe probarse con tus entradas y respuestas. No reemplaza autenticación, permisos sobre documentos ni validación de herramientas. La charla de 2024 [Protección de datos en aplicaciones GenAI con Amazon Bedrock](https://www.nerdearla.com/nerdflix/dDtL7OXTNnQ/) ofrece una continuación en español sobre esta parte del diseño; contrasta sus configuraciones con la documentación vigente.

Para continuar con agentes, la grabación de CreaTicas [Blinda tus agentes con buenas prácticas: seis aristas para llevar IA a producción](https://www.youtube.com/watch?v=RyGGMhM4TV0) permite estudiar experiencias de seguridad de la comunidad. Úsala para preparar preguntas sobre tu diseño, además de comprobar los controles concretos de tu aplicación.

Para estimar costos, separa las llamadas al modelo de los demás componentes: historial de conversación, recuperación, almacenamiento, base vectorial, Guardrails, backend y logs pueden sumar cargos. Un prompt largo que se repite en cada turno también cambia el consumo. Revisa el modelo y modalidad en la página de precios y mide solicitudes representativas antes de extrapolar.

Configura avisos de AWS Budgets y usa [Cost Explorer para investigar los cargos](/blog/analisis-de-costos-de-aws-con-cost-explorer/). Un aviso de presupuesto no detiene por sí solo toda la facturación, y los datos de costos pueden llegar con retraso.

El ejemplo `resumir.py` no crea un endpoint persistente, una base de conocimiento ni un servidor; la inferencia sigue siendo facturable según tu cuenta y modalidad. Si continuaste con otro laboratorio, identifica y elimina sus recursos: endpoints de SageMaker AI, servidores, almacenamiento vectorial, bases de datos y logs requieren su propia limpieza. Desconectar la interfaz no elimina esos recursos.

## Errores habituales al integrar Bedrock

| Síntoma | Qué revisar primero |
| --- | --- |
| `AccessDeniedException` | Identidad efectiva, permisos `bedrock:InvokeModel`, políticas que deniegan el acceso, condiciones iniciales del proveedor y recursos del perfil de inferencia |
| `ValidationException` | Identificador, región o perfil, compatibilidad con Converse, tamaño y estructura del mensaje, parámetros admitidos por el modelo |
| `ThrottlingException` | Cuotas del modelo y región, concurrencia, ritmo de solicitudes y reintentos con espera; reintentar indefinidamente puede agravar la carga |
| No se encuentran credenciales o la sesión expiró | Sesión o perfil que utiliza Boto3; confirma identidad sin imprimir claves y renueva las credenciales mediante tu método de acceso |
| La respuesta inventa o pierde información | Ejemplos de prueba, instrucciones, capacidad del modelo y datos de contexto; no lo soluciones solo aumentando tokens |

Consulta la [referencia de errores y parámetros de Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html) y la guía de acceso enlazada arriba. Para pedir ayuda, comparte el código de error, región, tipo de modelo o perfil y una entrada sintética; evita publicar claves, documentos privados o respuestas con datos personales.

## Sigue aprendiendo con comunidades y recursos en español

Puedes estudiar los ejemplos de [AWS Español en DEV](https://dev.to/aws-espanol) y los cursos del [canal Surfeando la nube, de Ricardo Ceci](https://www.youtube.com/@ricardoceci-dev). La página de [AWS User Group CreaTicas en LinkedIn](https://www.linkedin.com/company/aws-user-group-creaticas/) publica novedades de la comunidad; LinkedIn puede pedir inicio de sesión para seguirla o ver todas sus actualizaciones. [Su canal de charlas](https://www.youtube.com/channel/UCLt3Cav92Ej0t_m3mliLGCQ) permite explorar las grabaciones.

Si quieres conversar sobre tu prototipo, considera [AI AWS User Group Chile](https://www.meetup.com/es-es/ai-aws-ug-chile/), [AWS AI User Group Argentina](https://www.meetup.com/aws-ai-user-group-argentina/) o [AI AWS UG Colombia](https://www.meetup.com/ai-aws-colombia/). También son útiles comunidades generales como [AWS User Group Mixtli](https://awsugmixtli.com/) y [su canal](https://www.youtube.com/@awsugmixtli), [AWS User Group Perú](https://awsugperu.cloud/), [AWS User Group Ciudad de México](https://awsugcdmx.com/), [AWS Women Colombia](https://awswomencolombia.com/) y [AWS User Group Ecuador](https://www.awsugecuador.com/). No necesitas que un grupo se especialice exclusivamente en tu servicio para compartir un problema, conocer experiencias o encontrar tu siguiente práctica.

Busca otras opciones por país en el [directorio de comunidades](/comunidades/) y comprueba su forma de participación. La [agenda de eventos](/eventos/) reúne fechas y enlaces de inscripción; las condiciones corresponden a cada organizador.

Al revisar la agenda el **6 de octubre de 2026**, estas actividades ofrecían próximos pasos relacionados:

- [Strands Agents: el poder de los agentes en la nube](https://www.meetup.com/aws-sbg-at-bolivian-private-university-santa-cruz-campus/events/316812108/), **9 de octubre**, presencial en Santa Cruz, Bolivia: una práctica comunitaria para profundizar en agentes.
- [Workshop de Bedrock, Strands y MCP del AWS User Group Panamá](https://www.meetup.com/aws-user-group-panama/events/316730635/), **13 de octubre**, presencial en Panamá: un encuentro para construir y conversar sobre integraciones de agentes.
- [Introducción a la IA con AWS Cloud, del grupo de Piura](https://www.meetup.com/aws-user-group-piura/events/316380557/), **17 de octubre**, presencial en Piura, Perú: una continuación para quienes necesitan reforzar fundamentos.
- [Shift-left con IA: Checkov y AWS Security Agent](https://www.meetup.com/aws-sbg-at-universidad-laica-eloy-alfaro-de-manabi/events/316827722/), **21 de octubre**, en línea: una actividad del SBG de la Universidad Laica Eloy Alfaro de Manabí para explorar controles de seguridad durante el desarrollo.
- [Taller práctico de IA con Kiro Express, del SBG de la Universidad Nacional de Córdoba](https://www.meetup.com/aws-sbg-at-national-university-of-cordoba/events/316848233/), **24 de octubre**, presencial en Córdoba, Argentina: una opción de práctica de desarrollo asistido por IA.
- [SpookyThon 2026: hackathon AWS con Kiro](https://www.meetup.com/aws-sbg-at-universidad-laica-eloy-alfaro-de-manabi/events/316301685/), comienza el **29 de octubre**, modalidad híbrida: otra oportunidad para practicar en un proyecto con la comunidad de Manabí.
- [SegurAWS Américas: aplicaciones de IA generativa seguras con Bedrock Guardrails](https://www.meetup.com/aws-user-group-panama/events/316730779/), **19 de noviembre**, en línea: una actividad para profundizar en controles de seguridad.

Confirma horario, registro, requisitos y disponibilidad en cada ficha. Si esas fechas ya pasaron, usa la agenda para encontrar otra actividad; aquí no se garantiza precio, cupo ni grabación.

## Preguntas frecuentes

### ¿Necesito entrenar un modelo para crear una aplicación de IA?

No necesariamente. Para muchas funciones puedes consumir un modelo de Bedrock o una API especializada. Entrenar o ajustar un modelo tiene sentido cuando el problema, los datos y la evaluación justifican ese trabajo; no es el primer paso obligatorio.

### ¿Necesito RAG para resumir un texto?

No si puedes aportar el texto necesario en la solicitud y cabe dentro de los límites del modelo. RAG ayuda cuando necesitas recuperar información de un conjunto de fuentes; añade decisiones de búsqueda, actualización, permisos y costos.

### ¿Cómo sé si mi prototipo está listo para más usuarios?

Comprueba la tarea con entradas representativas, errores y casos incompletos. Después valida autenticación, permisos, concurrencia, latencia, límites de consumo, seguimiento de fallos y limpieza. Una respuesta correcta en una sola prueba todavía no demuestra que toda la aplicación funcione bien.
