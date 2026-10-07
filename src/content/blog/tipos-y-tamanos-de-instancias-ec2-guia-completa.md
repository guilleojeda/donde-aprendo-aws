---
title: 'Tipos y tamaños de instancias EC2: cómo elegir'
description: Compara familias, arquitectura de CPU, tamaños, créditos T, EBS, almacenamiento local y red; revisa la región y mide la instancia con tu carga.
author: guille-ojeda
publishedAt: '2024-03-09'
publishedTimestamp: '2024-03-09T01:12:42.616Z'
cover: /assets/blog/editorial-fundamentos.png
coverAlt: Un libro abierto junto a un camino azul con estaciones y un punto naranja.
ogImage: /assets/blog/editorial-fundamentos.png
related:
- title: 'Mejores prácticas para Amazon EC2: seguridad, disponibilidad y costos'
  url: https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ec2/
- title: 'Cómo usar AWS Cost Explorer: filtros y costos que no aparecen'
  url: https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/
- title: Cómo visualizar costos de AWS con CUR 2.0, Athena y QuickSight
  url: https://dondeaprendoaws.com/blog/visualiza-costos-con-aws-cost-and-usage-reports-y-quicksight/
modifiedTimestamp: '2026-10-07T10:03:05-03:00'
review:
  date: '2026-10-07'
---


El tipo de una instancia EC2 define una combinación de procesador, memoria, almacenamiento y red. La familia orienta la elección según la carga; el tamaño ajusta la capacidad dentro de esa familia. Para elegir, parte de lo que tu aplicación necesita y mide varias opciones con una carga representativa. No hay una familia o un tamaño que sea mejor para todas las aplicaciones.

## Guía rápida por carga de trabajo

Usa esta tabla para armar una lista corta de tipos que valga la pena comparar. Es una orientación inicial: las capacidades y los límites concretos cambian entre generaciones, procesadores y tamaños.

En una pantalla pequeña, desliza la tabla hacia los lados para ver todas las columnas.

| Lo que predomina en la carga | Familias que conviene comparar | Qué medir |
| --- | --- | --- |
| CPU, memoria y red en proporciones relativamente equilibradas | Propósito general (M) | Latencia de la aplicación, CPU, memoria y tráfico de red |
| Cálculos sostenidos que aprovechan procesadores rápidos | Optimizada para cómputo (C) | Tiempo de procesamiento, uso de CPU y rendimiento por solicitud |
| Conjunto de datos activo que debe permanecer en RAM | Optimizada para memoria (R; según la carga, también X o U) | Memoria máxima, fallos de caché, latencia y CPU |
| Mucho acceso local a datos temporales | Optimizada para almacenamiento con almacenamiento de instancia en el tipo exacto | IOPS, latencia, throughput y capacidad local |
| Gráficos, entrenamiento o inferencia que aprovechan un acelerador | Cómputo acelerado (por ejemplo, G, P, Inf o Trn, según el software) | Compatibilidad con el acelerador, uso de GPU y tiempo por tarea |
| Picos cortos de CPU separados por períodos de baja actividad | Rendimiento ampliable (T) | Créditos de CPU, CPU sostenida y cualquier cargo por exceder la línea base |

Las familias son puntos de partida. Por ejemplo, M es una candidata para una aplicación equilibrada; C merece una prueba cuando el límite parece estar en CPU; y R puede servir si el conjunto activo de datos no cabe en memoria. Si el cuello de botella es almacenamiento, primero separa la necesidad de un volumen EBS de la necesidad de discos locales temporales. Compara los atributos del tipo completo antes de decidir. Para repasar las distintas opciones de cómputo de AWS, Axel Echevarría presenta la [Sesión 2 — Cómputo en AWS](https://www.youtube.com/watch?v=7XraH2QjHcY).

## Cómo leer un nombre de instancia

Un nombre EC2 suele combinar la serie o familia, la generación, letras de opciones y el tamaño después del punto. Por ejemplo, en `c7gn.2xlarge`:

- `c` identifica la serie C, optimizada para cómputo.
- `7` indica la generación.
- `g` señala procesadores AWS Graviton y `n` una opción de red y EBS optimizados.
- `2xlarge` es el tamaño.

En `m7i.large`, `m` identifica propósito general e `i` procesadores Intel; las variantes `m7g.large` usan Graviton. Otras letras pueden identificar procesadores AMD (`a`) o almacenamiento de instancia (`d`). La convención tiene excepciones y se amplía con nuevas series y opciones. Verifica el significado y las especificaciones en la [guía de nomenclatura de AWS](https://docs.aws.amazon.com/ec2/latest/instancetypes/instance-type-names.html).

El tamaño puede ser `medium`, `large`, `xlarge`, `2xlarge` o `metal`, entre otras opciones. No compares solo la palabra del tamaño: `large` no garantiza la misma cantidad de vCPU, memoria, almacenamiento o rendimiento en dos familias distintas. Consulta las [especificaciones de EC2 por familia y tipo](https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-type-specifications.html).

## Comprueba la arquitectura del procesador

Una instancia basada en x86_64 y otra basada en Arm no siempre pueden ejecutar la misma imagen o los mismos binarios. Antes de probar una variante Graviton, confirma que la AMI, el sistema operativo, los agentes, las bibliotecas nativas y cualquier imagen de contenedor admitan `arm64`. Haz la misma revisión para los componentes que dependen de instrucciones o controladores particulares.

Si cambias una instancia existente entre arquitecturas, no des por hecho que basta con cambiar el tamaño: la AMI debe ser compatible y puede ser necesario lanzar otra instancia y migrar la aplicación. AWS documenta estos límites en la guía de [compatibilidad al cambiar el tipo de instancia](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/resize-limitations.html). Compara la carga en cada arquitectura con tus dependencias reales; el nombre de un procesador no predice por sí solo el costo o el rendimiento de tu aplicación. Como complemento en español, Marcos Ortiz publicó en AWS Español una [introducción para comenzar a trabajar con Graviton](https://dev.to/aws-espanol/como-comenzar-a-trabajar-con-aws-graviton-la-pregunta-del-millon-1m6h), que propone comprobar bibliotecas e imágenes multi-arquitectura. El artículo es de 2023; revisa sus referencias a familias, ofertas y precios en la documentación vigente.

## Elige el tamaño con mediciones

Para una aplicación nueva, anota antes de probar:

1. Los límites de respuesta o throughput que debe cumplir la aplicación.
2. Los requisitos del software: arquitectura, CPU, memoria, almacenamiento y aceleradores.
3. La carga esperada, incluidos picos, tareas simultáneas y tamaño del conjunto de datos.
4. Los requisitos de disco y red: latencia, IOPS, throughput y tráfico sostenido.
5. La región y las zonas donde debe ejecutarse.

Escoge algunos tipos compatibles y repite la misma prueba en cada uno. Registra el tiempo de respuesta o procesamiento, los errores, la CPU, la memoria y el comportamiento del disco y la red. Usa un período que incluya el ciclo de trabajo y los picos que te importan. Cambia una dimensión por vez cuando sea posible, así podrás atribuir el resultado a la familia, el tamaño o la arquitectura que modificaste.

En una flota que ya está funcionando, no reduzcas una instancia solo porque su CPU promedie poco o porque una regla fija de utilización parezca indicar capacidad sobrante. Examina los picos y las métricas que correspondan a la carga. EC2 publica métricas básicas como CPU y red; **el uso de memoria y el porcentaje de espacio usado en disco del sistema operativo no aparecen como métricas predeterminadas de EC2**. Para obtenerlas en CloudWatch, instala y configura el [agente de CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/metrics-collected-by-CloudWatch-agent.html) o el mecanismo de telemetría de tu sistema operativo. Las métricas adicionales del agente se publican como métricas personalizadas y pueden generar cargos; consulta los [precios de CloudWatch](https://aws.amazon.com/cloudwatch/pricing/) al decidir qué recolectar. Relaciona las métricas con la latencia, el throughput y los errores que percibe la aplicación; nuestra guía de [mejores prácticas para EC2](/blog/mejores-practicas-para-amazon-ec2/) desarrolla cómo vincular estas mediciones con la operación y los costos.

AWS también ofrece recomendaciones de tipo y tamaño mediante [EC2 Instance Type Finder y AWS Compute Optimizer](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-discovery.html). Úsalas como otra fuente para priorizar pruebas y revisa sus supuestos junto con los requisitos y las métricas de tu aplicación.

## Revisa los créditos de CPU de las instancias T

Las familias T tienen una línea base de CPU y usan créditos para superarla. Acumulan créditos cuando usan menos CPU y los gastan cuando superan esa línea base. En modo Standard, al agotarse los créditos disponibles, la utilización baja hacia la línea base. El modo Unlimited permite sostener el uso por encima de ella; si el promedio supera la línea base durante una ventana móvil de 24 horas o la vida de la instancia, lo que sea menor, pueden cobrarse créditos excedentes.

Antes de elegir T para una aplicación, revisa el patrón de CPU y el modo de crédito configurado. En CloudWatch, observa `CPUCreditBalance` y, si corresponde, `CPUSurplusCreditBalance`, además de `CPUUtilization`. Una aplicación con demanda alta y sostenida merece compararse con una familia de rendimiento fijo: el precio base de T no cuenta toda la historia si la carga acumula consumo excedente. Los detalles de modos, créditos y excepciones están en la [guía actual de rendimiento ampliable de AWS](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html).

## Separa EBS del almacenamiento local

Amazon EBS es almacenamiento de bloques que se conecta a la instancia. El volumen puede persistir independientemente de la instancia, aunque al terminarla el ajuste `DeleteOnTermination` determina si el volumen se elimina o se conserva. El tipo de volumen EBS tiene sus propios límites de IOPS y throughput, y la conexión de la instancia también tiene límites. El rendimiento real queda acotado por el menor de esos límites; revisa ambos cuando una aplicación espera datos del disco.

El almacenamiento de instancia usa discos locales de determinados tipos EC2. Puede ser útil para cachés, buffers, datos de trabajo o contenido temporal que pueda reconstruirse o replicarse. Sus datos no persisten si se detiene, hiberna o termina la instancia. No lo uses como única copia de información que debas conservar.

Por eso, la letra `d` y la familia orientan la búsqueda, pero debes confirmar el almacenamiento del tamaño exacto. Consulta la [guía de EBS y su independencia de la instancia](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-volumes.html), el [ciclo de vida del almacenamiento de instancia](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-store-lifetime.html) y los límites de [rendimiento EBS por tipo de instancia](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-optimization-performance.html).

## Compara red, EBS y capacidad disponible en la región

El ancho de banda de red y EBS depende del tipo y del tamaño. En algunos tipos, una cifra rotulada `up to` es un máximo de ráfaga: la instancia puede sostener un nivel base menor y usar créditos de E/S de red para llegar al máximo por períodos limitados. El destino del tráfico y la cantidad de flujos también afectan la capacidad que observa la aplicación. Compara el requisito sostenido con las especificaciones de red del tipo y no tomes el máximo anunciado como rendimiento constante.

Los tipos con el mismo número de vCPU pueden tener diferentes límites de red, EBS o almacenamiento local. Mira la tabla del tipo exacto y prueba con el patrón de E/S que tendrá la aplicación. AWS describe los [límites y la ráfaga de ancho de banda de red](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-network-bandwidth.html) y los límites de [throughput EBS de la instancia y los volúmenes](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-optimization-performance.html).

También verifica la oferta para la región y zona de disponibilidad objetivo. Los tipos disponibles cambian según la ubicación. Puedes consultar los atributos con la AWS CLI; estos comandos son de lectura y muestran datos de catálogo:

```bash
aws ec2 describe-instance-types \
  --instance-types m7i.large m7g.large c7gn.xlarge \
  --region us-east-1 \
  --query '
    InstanceTypes[].{
      Type:InstanceType,
      Arch:ProcessorInfo.SupportedArchitectures,
      VCPU:VCpuInfo.DefaultVCpus,
      MemoryMiB:MemoryInfo.SizeInMiB,
      LocalGB:InstanceStorageInfo.TotalSizeInGB,
      Network:NetworkInfo.NetworkPerformance,
      EBSMBps:EbsInfo.EbsOptimizedInfo.MaximumThroughputInMBps
    }' \
  --output table
```

Cambia `us-east-1` por la región que te interesa. En el segundo comando, sustituye `us-east-1a` por una zona de disponibilidad de tu cuenta. Los campos de almacenamiento local o throughput EBS pueden aparecer vacíos si el tipo no ofrece ese atributo. Para ver si un tipo se ofrece en una zona concreta:

```bash
aws ec2 describe-instance-type-offerings \
  --location-type availability-zone \
  --filters "Name=instance-type,Values=m7g.large" "Name=location,Values=us-east-1a" \
  --region us-east-1 \
  --query 'InstanceTypeOfferings[].{Type:InstanceType,AZ:Location}' \
  --output table
```

La lista de ofertas confirma que el tipo está listado para esa zona, pero no confirma por sí sola que tu cuenta tenga cuota suficiente o que haya capacidad disponible al intentar lanzar la instancia. Para conversar sobre las opciones de capacidad de EC2 en español, puedes ver la grabación [La capacidad oscura de EC2](https://www.youtube.com/watch?v=qtCgpCTQwro) del AWS User Group Perú; contrasta sus ejemplos con las especificaciones vigentes. Comprueba las cuotas regionales de EC2, expresadas según la categoría y la modalidad de compra, en [cuotas de tipos de instancia EC2](https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-quotas.html). La guía de AWS para [encontrar tipos de instancia y filtrarlos por zona o atributos](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-discovery.html) documenta la consola y la CLI.

## Estima el costo completo

El costo depende de la región, el sistema operativo, el tipo y tamaño, la modalidad de compra y el tiempo de uso. Incluye además los recursos que acompañan a la instancia: EBS, almacenamiento de snapshots, transferencia de datos y direcciones IP públicas, entre otros. En una T en modo Unlimited, considera también el posible cargo por CPU que exceda la línea base.

Compara el costo del mismo escenario de uso —incluidos disco, rendimiento requerido, red y sistema operativo— con la [AWS Pricing Calculator](https://calculator.aws/). Para una instancia existente, Cost Explorer ayuda a entender qué tipos de uso explican el gasto; consulta nuestra guía sobre [filtros y costos que pueden no aparecer en Cost Explorer](/blog/analisis-de-costos-de-aws-con-cost-explorer/). Si necesitas un tablero con mayor detalle a partir de AWS Cost and Usage Reports, sigue con [Visualiza costos con AWS Cost and Usage Reports y QuickSight](/blog/visualiza-costos-con-aws-cost-and-usage-reports-y-quicksight/). Revisa el costo junto con la latencia, el throughput y los errores: una instancia más barata que no cumple el objetivo de la aplicación no es una comparación equivalente.

## Recursos y comunidades para seguir aprendiendo

Para una clase práctica de nivel intermedio, el canal AWS Girls publica [AWS EC2 nivel 200](https://www.youtube.com/watch?v=436Wz9uQMhA). Compara sus ejemplos con las tablas y la documentación vigentes, en especial si mencionan familias, disponibilidad o precios.

Para conversar con otras personas que usan AWS, puedes explorar el [AWS User Group Perú](https://awsugperu.cloud/) y el [AWS User Group Córdoba](https://www.meetup.com/aws-user-group-cordoba-argentina/). El [directorio de comunidades de AWS en Latinoamérica](/comunidades/) permite buscar grupos por país y ciudad. Al revisar la agenda el **7 de octubre de 2026**, también figuraba una sesión virtual [EC2 vs Lambda](https://www.meetup.com/fb83c392-728a-42dc-9a3f-7d351301e452/events/315728721/) del AWS User Group Tlaxcala FireflyCloud para el **16 de octubre, de 16:00 a 17:00 (UTC−6)**. Si estás decidiendo entre EC2 y una alternativa serverless, comprueba la inscripción en Meetup y consulta la [agenda de eventos AWS en línea](/eventos/online/) para ver otras fechas.

## Preguntas frecuentes

### ¿Qué instancia EC2 conviene para un servidor web?

Si los recursos están relativamente equilibrados, M puede ser una familia inicial para comparar. Si la carga tiene picos breves con períodos de baja CPU, compara también una T y revisa sus créditos y modo de uso. Mide la aplicación, porque el sistema operativo, la arquitectura, la memoria, la red y el tráfico cambian el resultado.

### ¿Una instancia T sirve para cualquier aplicación pequeña?

No necesariamente. El tamaño pequeño de una aplicación no indica cuánto tiempo usa CPU. Las T están diseñadas para cargas que alternan entre actividad y períodos de menor uso; si la CPU se mantiene por encima de la línea base, los créditos y los cargos del modo Unlimited importan.

### ¿El tamaño EC2 incluye el volumen EBS?

No. El tamaño de la instancia establece capacidades del host; los volúmenes EBS se configuran por separado. Para rendimiento de disco, confirma tanto el límite de la instancia como el de los volúmenes adjuntos.

### ¿Por qué no encuentro el mismo tipo en todas las regiones?

La oferta de tipos cambia por región y zona. Consulta la tabla o la CLI para la ubicación objetivo y revisa también las cuotas de tu cuenta antes de planear el despliegue.
