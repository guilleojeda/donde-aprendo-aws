---
title: "AWS HealthScribe: notas clínicas, idiomas, precios y API"
description: "Aprende qué hace AWS HealthScribe, cómo integrar su API y cuánto cuesta. Conoce sus idiomas, límites, revisión humana y requisitos de privacidad."
author: "guille-ojeda"
publishedAt: "2024-05-08"
publishedTimestamp: "2024-05-08T02:21:01.272Z"
modifiedTimestamp: "2026-10-05T14:54:05-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "AWS Lambda: cómo funciona, invocaciones y concurrencia"
    url: "https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/"
---

**AWS HealthScribe transforma conversaciones entre pacientes y profesionales de la salud en transcripciones y borradores de notas clínicas.** Combina reconocimiento de voz e IA generativa para ayudar a documentar una consulta. Está pensado para que proveedores de software integren esa capacidad en sus aplicaciones.

No diagnostica enfermedades ni sustituye el criterio clínico. AWS indica que sus resultados deben revisarse por profesionales médicos capacitados antes de utilizarlos en la atención de pacientes. Una nota puede documentar la evaluación que expresó el profesional; eso no significa que el servicio haya realizado esa evaluación. Consulta el alcance en la [guía de AWS HealthScribe](https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe.html).

Si estás evaluando una integración, empieza por tres preguntas: ¿el audio está en un idioma admitido?, ¿dónde puedes procesar los datos?, ¿cómo revisará y aprobará el profesional cada borrador?

## Qué entrega AWS HealthScribe

El resultado tiene dos partes que tu aplicación debe presentar de forma útil:

| Archivo | Contenido | Uso en la aplicación |
| --- | --- | --- |
| Transcripción JSON | Conversación por turnos, marcas de tiempo, roles de los participantes, secciones del diálogo y entidades clínicas mencionadas | Permitir revisar quién dijo qué y localizar el fragmento de la consulta |
| Documentación clínica JSON | Resúmenes organizados por una plantilla de nota y referencias a la transcripción | Mostrar un borrador editable y su evidencia antes de aprobarlo |

Las entidades pueden incluir medicamentos, condiciones y tratamientos **mencionados en la conversación**. No son hallazgos nuevos obtenidos de análisis clínicos. La [estructura de la transcripción](https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe-transcript.html) explica los campos y roles.

La plantilla predeterminada es `HISTORY_AND_PHYSICAL`, con secciones como motivo de consulta, historia de la enfermedad actual, evaluación y plan. También hay formatos como `DAP`, `BH_SOAP` y `PH_SOAP`. Cada oración del resumen incluye `EvidenceLinks` hacia los `SegmentId` relevantes de la transcripción. Estos enlaces facilitan contrastar el texto; no garantizan que sea correcto. Consulta las [plantillas y el archivo de documentación clínica](https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe-insights.html).

## Idiomas, regiones y especialidades: comprueba el encaje primero

Según la documentación técnica consultada en octubre de 2026, HealthScribe admite **inglés de Estados Unidos (`en-US`)** y está disponible en **US East (N. Virginia), `us-east-1`**. Una página de AWS traducida al español no implica que el servicio procese consultas en español.

La guía enumera especialidades como atención primaria, ortopedia, cardiología, pediatría, psiquiatría y cirugía, entre otras. Revisa la [lista completa de especialidades y requisitos](https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe.html) para tu caso. La compatibilidad declarada no establece una precisión universal para todas las consultas de esa especialidad.

Puede haber diferencias entre páginas de AWS: el [FAQ comercial](https://aws.amazon.com/healthscribe/faqs/) todavía describe procesamiento por lotes y optimización para medicina general y ortopedia, mientras la guía técnica documenta streaming y una lista más amplia. Para implementar, contrasta la guía y las referencias de las API que vas a utilizar.

**Si necesitas documentación clínica en español**, revisa por separado [Amazon Connect Health y su documentación ambiental](https://docs.aws.amazon.com/connecthealth/latest/userguide/ambient-documentation.html). Esa documentación declara español e inglés de Estados Unidos, y AWS recomienda explorar el producto desde su [página de HealthScribe](https://aws.amazon.com/healthscribe/). Es otro producto: tiene sus propias API, regiones, condiciones y precios. No transfieras sus capacidades a HealthScribe.

## Cómo integrar la API con archivos en S3

El flujo por lotes analiza una grabación terminada. Tu aplicación inicia el trabajo, consulta su estado y recupera los dos archivos JSON. La [guía para iniciar un trabajo](https://docs.aws.amazon.com/transcribe/latest/dg/starting-health-scribe-job.html) ofrece ejemplos con AWS CLI y SDK; también indica que la consola no admite actualmente estos trabajos.

Antes de enviar la solicitud, prepara:

- Una versión actualizada de AWS CLI o un SDK que admita los parámetros de HealthScribe utilizados en el ejemplo.
- Una grabación de prueba en inglés, sin datos reales de pacientes. AWS recomienda audio sin pérdida, como WAV o FLAC, con codificación PCM de 16 bits y frecuencia de muestreo de al menos 16.000 Hz.
- El archivo en un bucket de S3 en `us-east-1`. El [bucket de entrada debe estar en la región de la solicitud](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_Media.html).
- Un bucket de salida privado y un rol IAM para que el servicio lea la entrada y escriba los resultados.
- Permisos para que tu identidad invoque las operaciones necesarias. Confirma además las condiciones de acceso del servicio para tu cuenta; el FAQ describe una solicitud de acceso.

### Ejemplo de solicitud para dos hablantes

Este ejemplo corresponde a una grabación con dos hablantes en un canal compartido. Guárdalo como `healthscribe-demo.json` y reemplaza los buckets y el ARN por tus recursos de prueba:

```json
{
  "MedicalScribeJobName": "demo-consulta-001",
  "Media": {
    "MediaFileUri": "s3://tu-bucket-entrada/demo-consulta.wav"
  },
  "OutputBucketName": "tu-bucket-salida",
  "DataAccessRoleArn": "arn:aws:iam::111122223333:role/HealthScribeDemoRole",
  "Settings": {
    "ShowSpeakerLabels": true,
    "MaxSpeakerLabels": 2,
    "ChannelIdentification": false,
    "ClinicalNoteGenerationSettings": {
      "NoteTemplate": "HISTORY_AND_PHYSICAL"
    }
  }
}
```

Inicia el trabajo con AWS CLI:

```bash
aws transcribe start-medical-scribe-job \
  --region us-east-1 \
  --cli-input-json file://healthscribe-demo.json
```

`DataAccessRoleArn` identifica el rol que usará HealthScribe, distinto de la identidad que ejecuta el comando. Su política de confianza debe permitir que `transcribe.amazonaws.com` lo asuma; necesita acceso a la entrada, la salida y las claves KMS que correspondan. Consulta los [parámetros y permisos de StartMedicalScribeJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartMedicalScribeJob.html).

La identidad que inicia el trabajo también necesita `iam:PassRole` para entregar ese rol al servicio, además de los permisos de Transcribe. Limita ese permiso al ARN del rol aprobado: no concede al servicio acceso a S3 por sí solo. La [guía de IAM sobre cómo pasar roles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html) explica la separación entre permisos de la identidad, permisos del rol y su política de confianza.

Debes activar exactamente una opción: `ShowSpeakerLabels` o `ChannelIdentification`. Si activas la primera, incluye `MaxSpeakerLabels`; si cada participante tiene un canal independiente y usas la segunda, configura `ChannelDefinitions`. No actives ambas. La [referencia de MedicalScribeSettings](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_MedicalScribeSettings.html) detalla esas reglas.

Consulta el estado con el mismo nombre:

```bash
aws transcribe get-medical-scribe-job \
  --region us-east-1 \
  --medical-scribe-job-name demo-consulta-001
```

Una respuesta a la solicitud inicial no significa que la nota ya esté lista. Cuando `MedicalScribeJobStatus` sea `COMPLETED`, recupera `TranscriptFileUri` y `ClinicalDocumentUri` desde `MedicalScribeOutput`. Si es `FAILED`, lee `FailureReason`. Ese comportamiento está documentado en [GetMedicalScribeJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_GetMedicalScribeJob.html).

Si integras el flujo con Lambda, utiliza una invocación corta para iniciar el trabajo y consulta el estado en otro paso. Evita mantener una función esperando todo el procesamiento. La guía [AWS Lambda: cómo funciona, invocaciones y concurrencia](https://dondeaprendoaws.com/blog/aws-lambda-en-profundidad/) te ayuda a entender esa separación. Para aprender a coordinar pasos y esperas, mira [Serverless 101: AWS Step Functions](https://www.youtube.com/watch?v=-jDodchUccw), de Marcia Villalba; es una introducción general a la orquestación, no una integración clínica terminada.

### Limpieza de la prueba

Cuando termines, elimina el registro del trabajo con [DeleteMedicalScribeJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_DeleteMedicalScribeJob.html) y elimina por separado el audio y los resultados de prueba en S3. En buckets con versionado, borrar sin un identificador de versión puede dejar versiones anteriores: revisa la [eliminación de objetos y versiones](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjects.html). Retira también el [rol de prueba y sus políticas](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_manage_delete.html) si los creaste exclusivamente para este ejercicio. Borra solo recursos propios que ya no necesites; conserva los que compartas con otros flujos.

## Streaming: transcripción durante la consulta, nota al finalizar

HealthScribe también ofrece `StartMedicalScribeStream`, mediante un canal bidireccional HTTP/2. La aplicación recibe transcripción en tiempo real; los archivos de transcripción y nota clínica se generan después de finalizar la sesión y procesar su contenido.

Primero envías `MedicalScribeConfigurationEvent`, luego el audio y, para iniciar el análisis final, `MedicalScribeSessionControlEvent` con `Type: END_OF_SESSION`. Cerrar el flujo sin ese evento pausa la sesión. El rol de acceso para este flujo utiliza el principal `transcribe.streaming.amazonaws.com`.

La guía establece un máximo de dos horas de audio por sesión y permite reanudarla dentro de las cinco horas desde su creación. También distingue el soporte de SDK: Boto3 no es la opción para este streaming. Consulta el [flujo y los requisitos de HealthScribe streaming](https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe-streaming.html) antes de elegir el cliente.

## Revisión humana, privacidad y elegibilidad HIPAA

Diseña la pantalla de revisión como parte del producto. Un ejemplo ficticio: si el paciente dice *“I am not taking that medication”*, una nota que afirme que lo está tomando cambia el sentido clínico. El profesional debe poder abrir la evidencia, detectar el error, corregirlo y aprobar la versión final.

Evalúa errores de transcripción, omisiones, afirmaciones sin respaldo y tiempo necesario para corregir la nota. Incluye muestras con ruido, acentos, interrupciones y nombres de medicamentos relevantes para tu uso. La [ficha de uso responsable de HealthScribe](https://docs.aws.amazon.com/ai/responsible-ai/aws-healthscribe/overview.html) explica estos factores y la necesidad de evaluar el servicio con contenido representativo. No hay un porcentaje de ahorro que puedas trasladar automáticamente a tu organización.

**HealthScribe es elegible para HIPAA; utilizarlo no hace que una aplicación cumpla automáticamente esa normativa.** Cuando HIPAA sea aplicable, AWS describe el acuerdo BAA y la obligación de utilizar servicios elegibles para procesar, almacenar o transmitir información de salud protegida. Revisa las [condiciones de HIPAA en AWS](https://aws.amazon.com/compliance/hipaa-compliance/) junto con quienes gestionan privacidad y cumplimiento en tu organización. La elegibilidad tampoco resuelve por sí sola las reglas de grabación o protección de datos que correspondan en tu país.

AWS declara que HealthScribe cifra los datos en tránsito y en reposo y no utiliza el contenido procesado para entrenar sus modelos. Su [FAQ de privacidad](https://aws.amazon.com/healthscribe/faqs/) indica que elimina los datos del servicio después de entregar el resultado. Eso no borra las grabaciones ni los resultados que conserves en tus buckets: tú defines sus permisos, retención y eliminación.

Puedes especificar una clave administrada por el cliente para añadir una capa de cifrado; revisa los permisos y costos de KMS en la [guía de cifrado de HealthScribe](https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe-encryption.html). Evita incluir datos sensibles en nombres, etiquetas o contextos de cifrado que puedan aparecer en registros.

Si necesitas bases para implementar esos controles, empieza con [qué es AWS IAM](https://www.youtube.com/watch?v=t51vW-BDwF0), de Marcia Villalba, y las [diapositivas de Mario Inga sobre AWS KMS](https://es.slideshare.net/slideshow/dominando-aws-kms-desde-cifrado-bsico-hasta-firma-avanzada-aws-community-day-2024/267436804), del AWS Community Day Perú 2024. Para el contexto de IA generativa, la [charla de Gerardo Castro sobre protección de datos con Bedrock](https://www.nerdearla.com/nerdflix/dDtL7OXTNnQ/) es una grabación de Nerdearla 2024 sobre acceso, cifrado y privacidad; no certifica una implementación de HealthScribe.

## Cuánto cuesta AWS HealthScribe

La [página de precios](https://aws.amazon.com/healthscribe/pricing/) consultada en octubre de 2026 publica **USD 0,001667 por segundo de audio**, aproximadamente USD 0,10 por minuto, con facturación en incrementos de un segundo y un mínimo de 15 segundos por solicitud.

Por ejemplo, 100 grabaciones de 20 minutos suman 2.000 minutos: el procesamiento costaría aproximadamente **USD 200**, antes de beneficios aplicables, impuestos y otros servicios. Presupuesta también almacenamiento y solicitudes de S3, KMS si usas claves propias y los componentes de tu aplicación.

La página anuncia hasta 300 minutos mensuales gratuitos durante los primeros dos meses. Comprueba la elegibilidad y las condiciones vigentes para tu cuenta antes de asumir que una prueba no tendrá costo. El costo de procesar audio tampoco equivale al ahorro operativo: debes contar la revisión y corrección del borrador.

## Preguntas y problemas frecuentes

### ¿HealthScribe es lo mismo que Amazon Transcribe Medical?

No. [Amazon Transcribe Medical](https://docs.aws.amazon.com/transcribe/latest/dg/transcribe-medical.html) se centra en transcribir voz médica, como dictados y conversaciones. HealthScribe añade documentación clínica generada y vínculos de evidencia. Si solo necesitas transcribir, compara ese alcance antes de elegir.

### ¿Por qué aparece ConflictException?

El nombre del trabajo ya existe en la cuenta. Usa un nombre único para una consulta nueva; si estás comprobando una solicitud anterior, consulta ese trabajo antes de crear otro. La [referencia de StartMedicalScribeJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartMedicalScribeJob.html) documenta el conflicto.

### ¿Qué reviso si el trabajo falla o no encuentro la salida?

Consulta primero `FailureReason`. Comprueba la región y la URI del objeto de entrada, el nombre del bucket de salida —sin prefijo `s3://`—, los permisos del rol y las claves KMS. Ante un error de acceso al iniciar la solicitud, revisa también `iam:PassRole` en la identidad que la envía. Revisa la configuración de hablantes y canales. Si el trabajo está en curso, todavía no tienes un resultado final; utiliza [GetMedicalScribeJob](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_GetMedicalScribeJob.html) para distinguirlo de un fallo.

### ¿Una transcripción correcta garantiza una buena nota?

No. La nota puede omitir información o resumirla mal aunque las palabras se hayan reconocido correctamente. Evalúa transcripción y resumen por separado, y conserva la revisión profesional antes de finalizar la documentación.

## Continúa aprendiendo con la comunidad

Para ver una explicación en español del caso de uso, mira [La IA a tu servicio: mejorando la salud con AWS HealthScribe](https://www.youtube.com/watch?v=6kYEhGvrzNw), de Julissa Rodriguez, publicada por AWS Girls Argentina. Es una **grabación del AWS Community Day Argentina 2024**, no un evento futuro. Contrasta sus ejemplos históricos con la documentación actual de idiomas, API y condiciones.

Después puedes continuar según la duda que estés resolviendo:

- [AWS Girls Argentina](https://www.meetup.com/aws-girls-argentina/) conecta a mujeres que quieren aprender y compartir conocimientos de AWS; su perfil publica encuentros y vías para participar.
- [AWS UG Machine Learning Latam](https://www.meetup.com/aws-ug-machine-learning-latam/) reúne personas interesadas en difundir aprendizaje de machine learning en Latinoamérica. Es un lugar para llevar preguntas sobre evaluación de modelos y resultados.
- [AWS Security Users Group LatAm](https://www.meetup.com/awssecuritylatam/) comparte seguridad de AWS para usuarios hispanohablantes. Puedes consultar su actividad y las [grabaciones de su canal](https://www.youtube.com/@AWSSecurityLATAM) para profundizar en permisos, cifrado y controles.

Lleva una pregunta concreta y ejemplos sintéticos: por ejemplo, cómo separar permisos de entrada y salida o cómo mostrar evidencia junto al borrador. No compartas grabaciones ni historias clínicas de pacientes en espacios públicos. En el directorio de [comunidades AWS](/comunidades/) puedes encontrar otros grupos, y en [eventos](/eventos/) consultar las actividades publicadas para seguir aprendiendo.
