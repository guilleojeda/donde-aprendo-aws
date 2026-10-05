---
title: "Clases de almacenamiento de Amazon S3: diferencias y cómo elegir"
description: "Compara las clases de Amazon S3 por patrón de acceso, disponibilidad, zonas, recuperación y costos; incluye S3 Express One Zone y Amazon S3 Glacier."
author: "guille-ojeda"
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T01:50:57.327Z"
modifiedTimestamp: "2026-10-05T20:34:07-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Cómo cifrar datos con AWS KMS: claves de datos y S3"
    url: "https://dondeaprendoaws.com/blog/cifrado-de-datos-con-aws-kms-guia-practica/"
  - title: "Checklist: servicios AWS esenciales para el examen SAA-C03"
    url: "https://dondeaprendoaws.com/blog/checklist-servicios-aws-esenciales-para-saa-c03/"
  - title: "¿Qué es cloud computing? Fundamentos y ejemplos de AWS"
    url: "https://dondeaprendoaws.com/blog/cloud-computing-en-espanol-fundamentos-basicos/"

---

Amazon S3 asigna una clase de almacenamiento a cada objeto. La clase cambia cómo se cobra el almacenamiento y qué condiciones tiene el acceso: latencia, recuperación, redundancia y retención mínima. Para elegir, compara el patrón de uso y el costo total, no solo el precio por gigabyte. La [comparación oficial de clases de AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html) reúne los valores de referencia.

Si estás empezando con la nube, los [fundamentos de cloud computing y Amazon S3](/blog/cloud-computing-en-espanol-fundamentos-basicos/) dan contexto sobre el lugar del almacenamiento de objetos en AWS.

## Comparación de clases de almacenamiento S3

Los porcentajes de disponibilidad de esta tabla son objetivos de diseño publicados por AWS. La durabilidad mide el riesgo de perder un objeto con el paso del tiempo; no es el porcentaje de tiempo que el servicio responde. Consulta las condiciones de la clase y la región antes de diseñar una aplicación.

En móvil, desliza las tablas hacia los lados para ver todas las columnas.

| Clase | Uso y acceso | Ubicación y disponibilidad de diseño | Límites y cargos |
| --- | --- | --- | --- |
| **S3 Standard** | Frecuente; acceso en milisegundos. | 99,99%; al menos 3 AZ. | Sin tamaño ni retención mínimos. |
| **S3 Intelligent-Tiering** | Patrón desconocido; niveles automáticos. | 99,9%; al menos 3 AZ. | Sin mínimos de tamaño o duración. Cargo de monitoreo por objeto elegible; Standard/Bulk gratis, Expedited Archive Access se cobra. |
| **S3 Standard-IA** | Poco frecuente; acceso inmediato. | 99,9%; al menos 3 AZ. | 30 días; 128 KB facturables; recuperación por GB. |
| **S3 One Zone-IA** | Poco frecuente; datos recreables. | 99,5%; 1 AZ, sin resiliencia a su pérdida. | 30 días; 128 KB facturables; recuperación por GB. |
| **S3 Express One Zone** | Cargas de baja latencia; milisegundos de un dígito. | 99,95%; 1 AZ elegida. | Sin mínimos; bucket de directorio; regiones y AZ compatibles. |
| **S3 Glacier Instant Retrieval** | Archivo; acceso inmediato en milisegundos. | 99,9%; al menos 3 AZ. | 90 días; 128 KB facturables; recuperación por GB. |
| **S3 Glacier Flexible Retrieval** | Archivo; restauración de minutos a horas. | 99,99% después de restaurar; al menos 3 AZ. | 90 días; 40 KB de metadatos; Bulk gratis y otras opciones facturadas. |
| **S3 Glacier Deep Archive** | Archivo rara vez leído; acceso en horas. | 99,99% después de restaurar; al menos 3 AZ. | 180 días; 40 KB de metadatos; restauración facturada. |
| **S3 on Outposts** | Objetos locales para procesamiento o residencia. | Redundante entre equipos del Outpost. | Solo buckets de Outposts; considera la capacidad local. |
| **S3 Reduced Redundancy Storage (RRS)** | Datos no críticos y reproducibles (AWS no recomienda la clase). | 99,99% de durabilidad y disponibilidad; al menos 3 AZ. | Sin mínimos; AWS recomienda evitarla. Standard es más rentable. |

AWS diseña S3 Standard, Intelligent-Tiering, Standard-IA, One Zone-IA, Express One Zone y las tres clases Glacier para una durabilidad de 99,999999999% (once nueves). One Zone-IA y Express One Zone guardan los datos en una sola AZ: aunque la redundancia dentro de la zona sostiene la durabilidad de diseño indicada, esas clases no están diseñadas para resistir la pérdida física de toda la AZ. RRS tiene durabilidad de diseño de 99,99%; AWS recomienda no usarla porque S3 Standard es más rentable.

S3 Express One Zone requiere un bucket de directorio. La lista de [regiones y AZ compatibles con S3 Express One Zone](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-express-Endpoints.html) se actualiza en la documentación; incluye São Paulo, pero solo en las AZ indicadas allí. AWS asigna nombres de AZ de forma distinta entre cuentas: para coordinar ubicaciones entre cuentas, usa el AZ ID publicado. La opción tiene sentido si la aplicación puede ejecutarse cerca del bucket; no es una alternativa general para buckets de propósito general.

## Cómo elegir según el acceso

- **Acceso frecuente:** empieza por S3 Standard. Es la clase general para datos que se leen o escriben a menudo.
- **Acceso impredecible:** considera S3 Intelligent-Tiering si los objetos son elegibles y quieres que S3 los mueva entre niveles automáticos. El monitoreo tiene un cargo por objeto; para objetos pequeños que siempre quedan en Frequent Access, ese cargo no aplica.
- **Acceso infrecuente con disponibilidad inmediata:** compara Standard-IA y Glacier Instant Retrieval según frecuencia, costo de almacenamiento, recuperaciones y tolerancia al tiempo mínimo. Ambas son multi-AZ; la segunda está orientada a archivo consultado con menos frecuencia.
- **Una sola AZ aceptable:** One Zone-IA puede servir para datos recreables, como una copia adicional. No la uses como única copia de datos que deban sobrevivir a una pérdida de AZ.
- **Latencia de un solo dígito en milisegundos:** evalúa S3 Express One Zone si la región, la AZ, el bucket de directorio y la ubicación del cómputo son compatibles.
- **Archivo sin acceso inmediato:** usa Glacier Flexible Retrieval si una restauración de minutos u horas funciona para tu proceso; usa Deep Archive si puedes esperar más y conservar los datos durante su mínimo de 180 días.
- **Procesamiento o residencia local:** S3 on Outposts requiere un AWS Outposts disponible en tu entorno y usa buckets de Outposts.

Para preparar el examen Solutions Architect Associate, el [checklist de servicios AWS para SAA-C03](/blog/checklist-servicios-aws-esenciales-para-saa-c03/) reúne S3 con otros servicios de almacenamiento y los temas que conviene estudiar.

## Qué significa “Glacier” y cuánto tarda una restauración

Amazon S3 Glacier Instant Retrieval permite un `GET` en milisegundos y no requiere restaurar el objeto. En cambio, los objetos de Glacier Flexible Retrieval y Glacier Deep Archive no están disponibles en tiempo real: antes de leerlos, hay que solicitar una restauración. La restauración crea una copia temporal durante la cantidad de días indicada; el objeto original conserva su clase de archivo. Los tiempos son típicos, no una garantía, y grandes volúmenes pueden demorar más.

| Clase o nivel de archivo | Acceso y tiempo típico de restauración |
| --- | --- |
| **Glacier Instant Retrieval** | `GET` inmediato; no hay que restaurar. |
| **Glacier Flexible Retrieval** | Standard: 3–5 horas. Bulk: 5–12 horas. Expedited: 1–5 minutos para objetos menores de 250 MB; premium y sujeto a capacidad. |
| **Glacier Deep Archive** | Standard: hasta 12 horas. Bulk: hasta 48 horas. Expedited no está disponible. |
| **Intelligent-Tiering: Archive Access** *(opcional)* | Requiere restaurar; Standard suele tardar 3–5 horas. |
| **Intelligent-Tiering: Deep Archive Access** *(opcional)* | Requiere restaurar; Standard suele tardar hasta 12 horas. |

Intelligent-Tiering inicia cada objeto en Frequent Access y lo mueve automáticamente a Infrequent Access después de 30 días sin acceso, y a Archive Instant Access después de 90. Los objetos menores de 128 KB no se monitorean ni pasan de Frequent Access; no generan cargo de monitoreo. Los niveles Archive Access y Deep Archive Access son opcionales: debes habilitarlos y pueden archivar tras al menos 90 o 180 días sin acceso, respectivamente. Puedes extender esos períodos. Un objeto archivado en esos niveles requiere restauración; luego vuelve a Frequent Access. Standard y Bulk no cobran recuperación en Intelligent-Tiering; Expedited desde Archive Access sí se cobra. El monitoreo y la automatización tienen cargo por objeto elegible. La [guía de niveles de Intelligent-Tiering](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering-overview.html) detalla sus condiciones.

## Recursos y comunidades para seguir

Para cambiar de formato y estudiar con la comunidad:

- La [sesión de AWS User Group Medellín sobre almacenamiento](https://www.youtube.com/watch?v=j81cCHrfmqA) repasa clases S3, versionado, políticas de acceso, Glacier y otros servicios.
- La charla breve [AWS Flash Talk: S3 con Bianca Torres](https://www.youtube.com/watch?v=1_wSH_lCB3Q) ofrece otra introducción a Amazon S3.
- El [laboratorio práctico de Amazon S3 de AWS User Group Caracas](https://www.youtube.com/watch?v=sp36Dcw7ePU) sirve para practicar operaciones con objetos.

Son grabaciones de apoyo: confirma en la documentación oficial la disponibilidad regional y los cargos antes de tomar una decisión técnica. Para conversar con otros estudiantes, consulta las [comunidades AWS por país](/comunidades/) o el [portal de AWS User Group Perú](https://awsugperu.cloud/), que publica grupos locales, talleres, grupos de estudio y recursos. El [calendario de eventos de comunidades AWS](/eventos/) permite revisar modalidad, fecha, horario e inscripción; las agendas cambian con el tiempo.

Si también necesitas definir cómo cifrar objetos y administrar claves, consulta la [guía práctica de AWS KMS](/blog/cifrado-de-datos-con-aws-kms-guia-practica/). La clase de almacenamiento y el cifrado responden a decisiones distintas.

## Costos, tamaños y reglas de ciclo de vida

El precio por GB-mes no alcanza para comparar clases. Según el patrón, la factura puede incluir solicitudes, recuperación por GB, transferencias, transiciones de Lifecycle, duración mínima y metadatos. En Glacier Flexible Retrieval y Deep Archive, durante una restauración también pagas la copia temporal a la tarifa de S3 Standard por los días elegidos, además del objeto que permanece archivado. Revisa el precio de la [región donde vive el bucket](https://aws.amazon.com/s3/pricing/) junto con el número y tamaño de objetos, la retención prevista y el volumen de lecturas y restauraciones. Por eso esta guía no publica una tarifa fija ni afirma que una clase sea siempre la más barata.

Tres condiciones evitan sorpresas:

1. **Tamaño facturable:** Standard-IA, One Zone-IA y Glacier Instant Retrieval facturan un mínimo de 128 KB por objeto. En Glacier Flexible Retrieval y Deep Archive se agregan 40 KB de metadatos por objeto: 32 KB a la tarifa de archivo y 8 KB a la tarifa Standard.
2. **Retención mínima:** Standard-IA y One Zone-IA tienen 30 días; Glacier Instant Retrieval y Flexible Retrieval, 90; Deep Archive, 180. Si borras, sobrescribes o mueves un objeto antes de completar ese período, se factura el tiempo restante.
3. **Transiciones de Lifecycle:** S3 cobra una solicitud por objeto que pasa de clase. Para muchos objetos pequeños, el costo de transición puede superar el ahorro de almacenamiento.

Desde septiembre de 2024, las reglas de S3 Lifecycle no transicionan por defecto objetos menores de 128 KB a ninguna clase. Las configuraciones creadas antes de ese cambio pueden conservar el comportamiento anterior hasta que modifiques sus reglas. AWS explica la excepción y las opciones de filtro en las [consideraciones para transiciones de Lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-transition-general-considerations.html).

## Consultar una clase o solicitar una restauración con AWS CLI

Reemplaza los valores de ejemplo por la región del bucket y una clave de objeto existente. Para `head-object` y `restore-object`, AWS CLI debe tener una sesión de autenticación válida mediante un perfil, IAM Identity Center o un rol. `head-object` es de solo lectura y requiere `s3:GetObject`; `restore-object` requiere `s3:RestoreObject`. La previsualización con `--dryrun` no llama a S3; una carga real requiere permisos de escritura, como `s3:PutObject`. Si la clase no aparece en la respuesta, el objeto usa Standard, que es la clase predeterminada.

```bash
REGION='us-east-1'
BUCKET='mi-bucket-de-prueba'
KEY='reports/reporte.csv'

aws s3api head-object \
  --bucket "$BUCKET" \
  --key "$KEY" \
  --region "$REGION" \
  --query '{StorageClass: StorageClass, SizeBytes: ContentLength, Restore: Restore}' \
  --output json
```

Para Glacier Flexible Retrieval o Deep Archive, puedes iniciar una restauración Standard y revisar después el estado con el mismo `head-object`. Este comando inicia una operación y puede generar cargos; `Days` indica cuántos días conservar la copia restaurada. No lo uses con Glacier Instant Retrieval, que admite lectura directa.

```bash
REGION='us-east-1'
BUCKET='mi-bucket-de-prueba'
ARCHIVE_KEY='archives/reporte.csv'

aws s3api restore-object \
  --bucket "$BUCKET" \
  --key "$ARCHIVE_KEY" \
  --restore-request '{"Days":3,"GlacierJobParameters":{"Tier":"Standard"}}' \
  --region "$REGION"

aws s3api head-object \
  --bucket "$BUCKET" \
  --key "$ARCHIVE_KEY" \
  --region "$REGION" \
  --query '{StorageClass: StorageClass, Restore: Restore}' \
  --output json
```

Para previsualizar una carga nueva con Standard-IA, reemplaza `./reporte.csv` por un archivo local y define la región y el bucket de prueba. Usa una clave de destino nueva. `--dryrun` muestra la operación sin subir el objeto. Si ejecutas la carga quitando `--dryrun`, la clase tiene mínimo de 30 días y 128 KB facturables por objeto.

```bash
REGION='us-east-1'
BUCKET='mi-bucket-de-prueba'

aws s3 cp ./reporte.csv "s3://${BUCKET}/pruebas/reporte-nuevo.csv" \
  --storage-class STANDARD_IA \
  --dryrun \
  --region "$REGION"
```

La [referencia de AWS CLI para `head-object`](https://docs.aws.amazon.com/cli/latest/reference/s3api/head-object.html), [`restore-object`](https://docs.aws.amazon.com/cli/latest/reference/s3api/restore-object.html) y [`s3 cp`](https://docs.aws.amazon.com/cli/latest/reference/s3/cp.html) documenta los parámetros y respuestas. Revisa también la [autenticación de AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-authentication.html) y los [permisos requeridos por las operaciones de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html). Para cambiar de clase un objeto existente, copia a una clave separada y comprueba el resultado antes de retirar el original; no sobrescribas una copia de producción como prueba.
