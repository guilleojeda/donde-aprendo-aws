---
title: "Cómo crear un clúster en Amazon Redshift paso a paso"
description: "Crea un clúster provisionado de Amazon Redshift con nodos actuales, red privada, roles IAM y una prueba SQL; conoce Serverless, costos y limpieza."
author: "guille-ojeda"
publishedAt: "2025-04-28"
publishedTimestamp: "2025-04-28T03:36:05.740000+00:00"
modifiedTimestamp: "2026-10-06T13:58:52-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Amazon Redshift: qué es, para qué sirve y cuándo usarlo"
    url: "https://dondeaprendoaws.com/blog/amazon-redshift-el-poder-del-data-warehousing-en-aws/"
  - title: "Cómo usar AWS Cost Explorer: filtros y costos que no aparecen"
    url: "https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/"
---

Para crear un clúster provisionado en Amazon Redshift, abre la consola de AWS, selecciona la región, ve a **Clusters > Create cluster** y define el tipo y la cantidad de nodos, la base de datos, las credenciales y la red. El asistente crea el *data warehouse* y una base inicial (por defecto, `dev` si no indicas otro nombre), pero no carga tus propios datos; puedes elegir cargar el conjunto de muestra de AWS o preparar una carga después. Revisa el costo estimado y el acceso antes de elegir **Create cluster**: el clúster puede generar cargos mientras está activo. Cuando figure como disponible, puedes probarlo desde Query Editor v2 sin abrir el acceso de red a todo Internet.

Esta guía crea un **clúster provisionado**. Si buscas Redshift Serverless, no crearás un clúster: crearás un *namespace* y un *workgroup*. Más abajo explico la diferencia, cómo configurar red e IAM, qué consulta usar para probar el acceso y cómo eliminar el entorno de prueba.

## Clúster provisionado o Redshift Serverless

Ambas modalidades ejecutan consultas analíticas de Amazon Redshift. El recurso que creas y el control de la capacidad son distintos:

| Modalidad | Qué creas | Qué eliges |
|---|---|---|
| **Provisionado** | Un clúster que reúne uno o más nodos y aloja el *data warehouse*. | Tipo y cantidad de nodos, red y configuración de la base de datos. |
| **Serverless** | Un *namespace* para los objetos, usuarios y almacenamiento, y un *workgroup* asociado para la capacidad de cómputo y la red. | Capacidad base en RPU, límites de uso y configuración del *workgroup*; no eliges nodos. |

En Serverless, el *namespace* y el *workgroup* son recursos diferentes. En provisionado, el clúster es el recurso de cómputo que vas a crear. Consulta la [descripción de AWS sobre namespaces y workgroups](https://docs.aws.amazon.com/redshift/latest/mgmt/serverless-workgroup-namespace.html) si prefieres Serverless. Si todavía estás decidiendo cuál modalidad usar, empieza por esta guía interna sobre [qué es Amazon Redshift y cuándo usarlo](https://dondeaprendoaws.com/blog/amazon-redshift-el-poder-del-data-warehousing-en-aws/).

Antes de decidirte por una modalidad, también puede servirte la charla de NERDflix [Cómo armar un Data Warehouse en 3 meses usando dbt y AWS](https://www.nerdearla.com/nerdflix/Be3TGC_Jiyw/). Está en español y aborda necesidades de equipos de negocio, criterios de diseño y herramientas del *modern data stack*; es contexto de arquitectura, no un tutorial de creación de clústeres.

## Antes de crear el clúster

### Permisos, región y cuenta

Necesitas una cuenta de AWS y una identidad de IAM autorizada para crear recursos de Redshift en la región elegida. Los permisos adicionales dependen de las opciones que selecciones: por ejemplo, administrar una clave KMS o asociar un rol de servicio. **`iam:PassRole`** permite asociar un rol existente al clúster; no significa que toda persona que crea un clúster tenga que poder crear roles IAM. Evita usar las credenciales del usuario raíz de la cuenta para el trabajo diario.

Elige la región según la ubicación de los datos y las aplicaciones, los requisitos de residencia que tengas que cumplir, la disponibilidad de nodos y el precio. Las opciones del asistente y sus capacidades cambian por región y cuenta; comprueba la selección que ofrece la consola para la región actual.

### Red y acceso

Un clúster provisionado se despliega en una VPC. Para elegir la red necesitas una VPC con un **cluster subnet group**; ese grupo indica en qué subredes puede crear Redshift el clúster. AWS indica que no puedes cambiar el subnet group asociado al clúster después de crearlo, así que elige la VPC y el grupo antes de continuar. Puedes modificar las subredes que forman parte de un grupo, aunque mover un clúster puede requerir pasos adicionales; consulta las guías para [crear recursos de Redshift en una VPC](https://docs.aws.amazon.com/redshift/latest/mgmt/getting-started-cluster-in-vpc.html), [modificar un cluster subnet group](https://docs.aws.amazon.com/redshift/latest/mgmt/modify-cluster-subnet-group.html) y [administrar subredes de Redshift](https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-cluster-subnet-groups.html).

Los clústeres son privados de forma predeterminada; consulta los [detalles de red y acceso público](https://docs.aws.amazon.com/redshift/latest/mgmt/managing-clusters-vpc.html). Para una primera prueba, puedes mantener ese ajuste y usar Query Editor v2 desde la consola. AWS recomienda omitir la apertura de reglas de entrada para un cliente SQL cuando se usa ese editor, como explica su [guía para comenzar con un clúster provisionado](https://docs.aws.amazon.com/redshift/latest/gsg/new-user.html). Para conectarte desde una aplicación o un cliente instalado en tu computadora, además de las credenciales necesitarás una ruta de red hasta el clúster y una regla de entrada del grupo de seguridad que permita el puerto elegido **solo** desde la red o el origen confiable. El puerto predeterminado es 5439, pero puedes elegir otro al crear el clúster; después no puedes cambiarlo, así que confírmalo antes de lanzarlo.

### Credenciales y cifrado

El identificador del clúster debe ser único para los clústeres de tu cuenta, contener de 1 a 63 letras minúsculas, números o guiones, comenzar con una letra y no terminar con guion ni contener dos guiones seguidos. Por ejemplo, `ventas-lab-redshift` cumple el formato si aún no está en uso. La [tabla de límites y reglas de nombres de Redshift](https://docs.aws.amazon.com/redshift/latest/mgmt/amazon-redshift-limits.html) reúne las condiciones vigentes.

Al configurar la base de datos, la consola permite generar la contraseña del administrador, escribirla o administrarla con AWS Secrets Manager. Si la escribes, debe tener entre 8 y 64 caracteres e incluir al menos una letra mayúscula, una minúscula y un número; se excluyen algunos caracteres ASCII, entre ellos comilla simple, comilla doble, barra inversa, barra y arroba. No pegues la contraseña en el código ni la compartas en una consulta. Si eliges Secrets Manager para guardar el secreto, ten en cuenta su cargo separado.

Los clústeres provisionados nuevos se cifran de forma predeterminada con una clave propiedad de AWS, según el cambio de seguridad efectivo desde el 10 de enero de 2025. Si necesitas controlar la clave, personaliza el cifrado para usar una clave de AWS KMS administrada por el cliente; para una clave de otra cuenta, confirma que tu identidad tenga permiso para usarla. Revisa el [cambio de cifrado predeterminado](https://docs.aws.amazon.com/redshift/latest/mgmt/behavior-changes.html) y las [opciones de cifrado de Redshift](https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-db-encryption.html) antes de crear el clúster. La [guía de creación de clústeres](https://docs.aws.amazon.com/redshift/latest/mgmt/create-cluster.html) también describe las credenciales, los roles opcionales y los pasos de la consola.

## Pasos para crear un clúster provisionado

1. Abre la [consola de Amazon Redshift](https://console.aws.amazon.com/redshiftv2/) y confirma la región en el selector de la parte superior.
2. En el menú, elige **Clusters > Create cluster**.
3. Escribe un identificador único. En **Cluster configuration**, usa **Help me choose** si quieres responder preguntas sobre el tamaño de los datos y las consultas para recibir una recomendación. Si ya definiste la capacidad, elige **I'll choose** y selecciona el tipo y el número de nodos. El asistente de dimensionamiento está disponible en regiones que admiten nodos RG o RA3.
4. En **Database configuration**, define el nombre de la base de datos y el usuario administrador. Genera o guarda la contraseña con un método adecuado para tu cuenta; no la guardes en un archivo de SQL.
5. En **Network and security**, elige la VPC que tenga el cluster subnet group y el grupo de seguridad que preparaste. Mantén el ajuste privado si no necesitas conexiones públicas. El cifrado está habilitado de forma predeterminada con una clave propiedad de AWS; si tu política requiere controlar la clave, personaliza aquí la configuración de cifrado con una clave KMS administrada por el cliente.
6. En **Cluster permissions**, asocia un rol IAM solo si Redshift tendrá que acceder a otros servicios en tu nombre, por ejemplo, para cargar datos de S3. Para una prueba de SQL sin acceso a otros servicios, no hace falta agregar un rol de S3.
7. Revisa el resumen y los cargos estimados para la región y la configuración elegidas. Selecciona **Create cluster** y espera a que el estado indique que está disponible.

Las familias que hoy enumera la guía de administración son RG, RA3 y DC2; el catálogo visible depende de la región, la cuenta y la configuración. AWS recomienda comparar RG y RA3 según rendimiento, volumen de datos y crecimiento esperado. Sus opciones de almacenamiento administrado permiten dimensionar cómputo y almacenamiento por separado. La documentación recomienda DC2 para conjuntos de datos comprimidos menores a 1 TB cuando ese patrón encaja con la carga; DC2 usa almacenamiento local. No elijas una familia solo por un nombre de entorno como “desarrollo” o “producción”: usa el dimensionador y contrasta el precio y las capacidades disponibles en tu cuenta. Consulta [nodos y clústeres provisionados](https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-clusters.html) para ver las familias y sus límites actuales. AWS tampoco recomienda clústeres de un nodo para cargas de producción; el mínimo de nodos depende del tipo seleccionado.

## Conectarte desde Query Editor v2

Desde la consola, abre **Editor > Query editor V2**, elige el clúster y crea una conexión a la base de datos. Para conectarte necesitas permisos de IAM para Query Editor v2 y permisos para el método de autenticación que elijas; por ejemplo, credenciales temporales de un usuario de base de datos o una identidad de IAM. Los permisos de la consola no sustituyen el acceso a la base de datos. AWS enumera los métodos de autenticación en la guía para [conectar Query Editor v2 a una base de datos](https://docs.aws.amazon.com/redshift/latest/mgmt/query-editor-v2-connecting.html).

Si el clúster no aparece o no puedes iniciar la conexión, comprueba que estás en la región correcta, que tu identidad tiene permisos del editor y que el método de autenticación corresponde al usuario de base de datos. Para un cliente SQL externo, comprueba además el endpoint, el puerto, el grupo de seguridad y la ruta entre el cliente y la VPC. No habilites acceso público para compensar permisos de IAM o una autenticación incorrecta.

## Probar una consulta

En Query Editor v2, crea una pestaña y ejecuta el bloque completo en la misma sesión. La tabla es temporal y desaparece al cerrar la sesión. Este ejemplo no carga datos externos ni necesita un rol IAM de S3:

```sql
CREATE TEMP TABLE ventas_demo (
    categoria VARCHAR(40) NOT NULL,
    unidades INTEGER NOT NULL,
    importe DECIMAL(10, 2) NOT NULL
);

INSERT INTO ventas_demo (categoria, unidades, importe)
VALUES
    ('libros', 3, 1200.00),
    ('juegos', 2, 850.00);

SELECT
    categoria,
    SUM(unidades) AS unidades,
    SUM(importe) AS total
FROM ventas_demo
GROUP BY categoria
ORDER BY categoria;
```

La consulta devuelve una fila por categoría con la suma de unidades y de importes. En la [referencia de `CREATE TABLE`](https://docs.aws.amazon.com/redshift/latest/dg/r_CREATE_TABLE_NEW.html) puedes consultar la sintaxis y el comportamiento de las tablas temporales de Redshift.

El resultado esperado es:

| categoría | unidades | total |
|---|---:|---:|
| juegos | 2 | 850.00 |
| libros | 3 | 1200.00 |

## Cuándo necesita Redshift un rol para S3

La identidad de IAM que usas para administrar Redshift y el rol con el que **Redshift** accede a otros servicios de AWS tienen funciones distintas. Asociar un rol de servicio no es un requisito para crear el clúster ni para ejecutar el ejemplo de SQL anterior.

Si después cargas datos desde S3 con `COPY`, crea o selecciona un rol confiable para Redshift, asígnale permiso para listar el bucket y leer solo los objetos y prefijos que necesite, y asócialo al clúster. Para exportar resultados con `UNLOAD`, el rol también necesita los permisos de escritura correspondientes. La identidad que asocia el rol necesita `iam:PassRole`. AWS explica el flujo en las guías para [autorizar a Redshift a acceder a otros servicios](https://docs.aws.amazon.com/redshift/latest/mgmt/authorizing-redshift-service.html) y [asociar roles IAM a un clúster](https://docs.aws.amazon.com/redshift/latest/mgmt/copy-unload-iam-role-associating-with-clusters.html). Evita conceder acceso a todos los buckets cuando basta con un bucket y un prefijo concretos.

## Costos y limpieza del entorno de prueba

El costo depende de la región, el tipo y la cantidad de nodos, el almacenamiento, las consultas y las copias de seguridad. Para un clúster provisionado, pausar suspende la facturación de cómputo bajo demanda mientras está pausado, pero el almacenamiento y las copias de seguridad pueden seguir generando cargos. En Serverless, el cómputo se mide en RPU por segundo, con un mínimo de 60 segundos de uso; el almacenamiento administrado se factura por separado. Revisa la [página de precios de Amazon Redshift](https://aws.amazon.com/redshift/pricing/) con la configuración concreta antes de crear recursos.

Como ejemplo de conversación comunitaria sobre costos, puedes ver [La Venganza del Nivel 300: Optimización de costos en Amazon Redshift](https://www.youtube.com/watch?v=wgHkzNit-Nk), una grabación publicada por AWS Women Colombia. Es material para ampliar la discusión; confirma cualquier decisión y tarifa con la [documentación de precios de AWS](https://aws.amazon.com/redshift/pricing/).

Cuando termines una prueba provisionada, vuelve a **Clusters**, elige el clúster y selecciona **Actions > Delete**. Si los datos ya no sirven, eliminarlo sin una copia final borra el clúster y sus datos de forma permanente. Si necesitas conservarlos, crea una copia final antes de eliminarlo. AWS elimina las copias automáticas con el clúster, pero conserva las copias manuales; la copia final y cualquier copia manual retenida pueden generar cargos de almacenamiento. Borra desde **Clusters > Snapshots** las copias manuales que ya no necesites. La guía para [pausar, reanudar y eliminar un clúster](https://docs.aws.amazon.com/redshift/latest/mgmt/rs-mgmt-shutdown-delete-cluster.html) detalla el efecto de cada opción.

Si probaste Serverless, elimina primero el *workgroup* y después el *namespace* que ya no necesites. Antes de borrar el namespace, decide si necesitas conservar los datos mediante una copia. Sigue los pasos de AWS para [eliminar un workgroup](https://docs.aws.amazon.com/redshift/latest/mgmt/serverless_delete-workgroup.html) y [eliminar un namespace](https://docs.aws.amazon.com/redshift/latest/mgmt/serverless-console-namespace-delete.html).

Para aprender a revisar cargos que ya se registraron, continúa con [cómo usar AWS Cost Explorer](https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/). Cost Explorer ayuda a investigar el uso de la cuenta; para estimar una configuración antes de crearla, usa la calculadora y la página de precios de AWS.

## Preguntas frecuentes

### ¿Puedo dejar el clúster privado y conectarme desde Query Editor v2?

Sí. Mantén desactivado el acceso público y conéctate desde la consola con Query Editor v2. Además de poder ver el servicio en la consola, tu identidad necesita permisos del editor y acceso a la base de datos mediante el método de autenticación elegido. Para un cliente instalado fuera de AWS, debes configurar una ruta de red hasta la VPC y permitir el origen del cliente en el grupo de seguridad.

### ¿El clúster viene con mis datos?

No. El asistente crea el warehouse y su base de datos, pero los archivos y tablas de tu proyecto se cargan después. Puedes seleccionar datos de muestra de AWS para seguir un tutorial, o preparar una carga desde S3 u otra fuente que Redshift admita.

### ¿Necesito un rol IAM para copiar datos desde S3?

Sí, si quieres que Redshift ejecute `COPY` desde S3 mediante un rol asociado al clúster. Concede a ese rol acceso de lectura al bucket y a los objetos que se cargarán. Para `UNLOAD` agrega los permisos necesarios para escribir en el destino. Para una tabla temporal con `INSERT`, como en el ejemplo de esta guía, ese rol no hace falta.

### ¿Pausar el clúster detiene todos los cargos?

No. Pausar suspende el cargo de cómputo bajo demanda mientras el clúster está detenido; el almacenamiento y las copias de seguridad pueden seguir generando cargos. Si ya no necesitas conservar los datos, elimina el clúster sin copia final. Si guardas una copia final o tienes copias manuales, revisa su almacenamiento y elimínalas cuando ya no sean necesarias.

## Recursos en español y comunidades

El [canal de YouTube de AWS Women Colombia](https://www.youtube.com/channel/UCdpHSMDDwo4_d_u3mSU41Mw) reúne grabaciones técnicas; su [página de eventos](https://awswomencolombia.com/page/eventos) enlaza el archivo de grabaciones, Meetup y el canal. Si estás en Córdoba, la ficha de [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/) te permite consultar sus encuentros y conectar con el grupo general de AWS. Si estás en otra ciudad, consulta el [directorio de comunidades AWS en Latinoamérica](https://dondeaprendoaws.com/comunidades/). Para buscar actividades recientes, consulta la [agenda de eventos AWS en Latinoamérica](https://dondeaprendoaws.com/eventos/) y confirma fechas, modalidad y registro con cada organizador.
