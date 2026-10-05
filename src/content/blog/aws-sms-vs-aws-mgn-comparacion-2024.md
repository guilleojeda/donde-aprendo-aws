---
title: "AWS SMS vs. AWS MGN: diferencias y migración de servidores"
description: "AWS SMS se discontinuó en 2023. Compara su función con AWS MGN, revisa requisitos y puertos de replicación, y planifica pruebas, corte y costos."
author: "guille-ojeda"
publishedAt: "2024-10-28"
publishedTimestamp: "2024-10-28T02:54:04.742Z"
modifiedTimestamp: "2026-10-05T12:46:00-03:00"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "Mejores prácticas de seguridad en AWS: checklist y cómo verificarlas"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/"
  - title: "¿Qué base de datos elegir en AWS? RDS, Aurora y DynamoDB"
    url: "https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/"
---

Si buscas **AWS SMS vs. AWS MGN**, la decisión actual es directa: AWS Server Migration Service (SMS) ya no está disponible; para trasladar servidores compatibles a Amazon EC2 con un enfoque de *rehost* (moverlos sin rediseñar la aplicación), la opción de AWS es AWS Application Migration Service, conocida como MGN. Desde el 8 de junio de 2026, AWS la presenta como **AWS Transform MGN**. La replicación puede reducir la interrupción, pero no garantiza un corte sin tiempo de inactividad.

MGN sirve para reubicar un servidor completo. Si solo necesitas migrar una base de datos, compara AWS Database Migration Service (DMS) y las herramientas nativas del motor; para copiar archivos, evalúa AWS DataSync. Más abajo encontrarás los requisitos de red, una secuencia de migración con pruebas y las diferencias entre esas opciones.

## AWS SMS y AWS MGN: qué cambió

AWS registra Server Migration Service en su lista de servicios en apagado completo desde el **1 de abril de 2023**. Por eso, la comparación ya no es entre dos opciones disponibles: SMS es un servicio histórico y no se puede iniciar una migración nueva con él. AWS recomienda Application Migration Service para rehost de servidores.

Application Migration Service fue renombrado **AWS Transform MGN** el 8 de junio de 2026. AWS ofrece dos formas de usar la misma tecnología de replicación y corte: controlar el proceso directamente desde la consola de MGN, o seguir el flujo guiado de AWS Transform, que también puede automatizar tareas como descubrimiento, planificación de olas, configuración de la landing zone y creación de red. Este artículo explica el flujo de consola de MGN. La documentación y algunos nombres de API todavía usan “Application Migration Service” o “MGN”; se refieren a la misma capacidad de migración. Consulta el [anuncio del cambio de nombre y las dos experiencias de rehost](https://aws.amazon.com/about-aws/whats-new/2026/06/aws-transform-mgn-rebrand/) y las [notas de versión](https://docs.aws.amazon.com/mgn/latest/ug/mgn-release-notes.html) para confirmar las capacidades actuales.

| Servicio | Estado y propósito | Cómo mueve la carga |
|---|---|---|
| AWS Server Migration Service (SMS) | Discontinuado; no lo elijas para una migración nueva. | Servicio anterior que replicaba máquinas virtuales y generaba imágenes para EC2. |
| AWS Transform MGN (antes Application Migration Service / AWS MGN) | Servicio vigente de AWS para rehost de servidores compatibles a EC2. | Replica bloques de discos desde el servidor de origen y permite probar instancias de destino antes del corte. |

Consulta la [lista oficial de servicios en apagado completo](https://docs.aws.amazon.com/general/latest/gr/full_shutdown_services.html) para la fecha de SMS.

## Qué herramienta elegir: MGN, DMS, DataSync o VM Import/Export

Elige según qué componente necesitas mover, no por el número de servidores:

| Herramienta | Úsala cuando… | Qué no reemplaza |
|---|---|---|
| [AWS Transform MGN](https://aws.amazon.com/application-migration-service/) | Quieres rehost de un servidor físico, virtual o de otra nube a una instancia EC2, conservando el sistema operativo, el software y la configuración que sean compatibles. | El flujo de consola no sustituye la planificación de la red ni la decisión de modernizar la aplicación. |
| [AWS DMS](https://docs.aws.amazon.com/dms/latest/userguide/Welcome.html) | Quieres migrar o replicar datos entre bases de datos compatibles; puedes necesitar conversión de esquema o captura de cambios según el caso. | No traslada el sistema operativo y toda la máquina como una instancia EC2. |
| [AWS DataSync](https://docs.aws.amazon.com/datasync/latest/userguide/what-is-datasync.html) | Quieres transferir archivos u objetos entre almacenamiento local y servicios de AWS, o entre ubicaciones compatibles. | No convierte una copia de archivos en una máquina arrancable. |
| [VM Import/Export](https://docs.aws.amazon.com/vm-import/latest/userguide/what-is-vmimport.html) | Tienes una imagen de máquina virtual elegible y quieres importarla a EC2 como imagen o instancia. | No ofrece el mismo flujo de replicación continua de MGN; revisa formatos, sistemas y límites admitidos. |

MGN también puede reubicar un servidor que aloja una base de datos. Si necesitas cambiar de motor o conservar una base activa con replicación propia del motor, diseña la migración de esa base por separado. Para comparar motores de destino, consulta nuestra guía sobre [RDS, Aurora y DynamoDB](https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/).

## Requisitos de AWS MGN antes de instalar el agente

MGN replica servidores físicos, virtuales o alojados en otra nube, siempre que cumplan los requisitos de la región, el sistema operativo, los discos y el método de replicación elegido. Comprueba la [lista vigente de sistemas operativos compatibles](https://docs.aws.amazon.com/mgn/latest/ug/Supported-Operating-Systems.html) y los requisitos de instalación antes de preparar cada servidor: las versiones y excepciones cambian con el tiempo.

El método habitual es instalar el **AWS Replication Agent** en cada servidor de origen. Se necesita acceso administrativo para instalarlo y la red debe permitir que el agente llegue a AWS. AWS también ofrece replicación sin agente desde entornos vCenter compatibles con VMware; requiere desplegar el cliente de MGN en vCenter y tiene sus propios requisitos. La replicación basada en agente admite más entornos y AWS la recomienda cuando se puede instalar el agente. Revisa el flujo y los prerrequisitos en la guía de [servidores de origen de MGN](https://docs.aws.amazon.com/mgn/latest/ug/source-servers.html).

La replicación basada en agente de MGN trabaja a nivel de bloques y requiere que el almacenamiento esté disponible para el servidor de origen. No transfiere por sí sola sistemas de archivos compartidos NAS, NFS o SMB; la mayoría de las configuraciones de clúster con almacenamiento compartido también requiere una estrategia específica. Revisa las [limitaciones de rehost con MGN](https://docs.aws.amazon.com/prescriptive-guidance/latest/migration-database-rehost-tools/mgn.html), además de las licencias, el modo de arranque, el tamaño y la disposición de discos, las dependencias entre servidores y la conectividad de la aplicación en AWS. El flujo de consola descrito aquí deja el diseño de VPC, subredes, rutas y reglas de seguridad a tu equipo. AWS Transform ofrece otra experiencia que puede ayudar a planificar y crear la red; valida cualquier diseño generado con los requisitos de tu aplicación antes de migrar.

### Puertos y conectividad de red para MGN

En el flujo de consola basado en agente, prepara una subred de staging en la VPC de destino. El servidor de origen inicia la conexión de datos hacia el servidor de replicación en staging; el firewall del origen necesita permitir la salida, y la subred de staging debe aceptar ese tráfico. El instalador también necesita acceder a los endpoints de MGN y Amazon S3. AWS documenta los endpoints y las reglas por región en sus [requisitos de red de MGN](https://docs.aws.amazon.com/mgn/latest/ug/preparing-environments.html).

| Comunicación en la replicación basada en agente | Puerto | Para qué se usa |
|---|---:|---|
| Servidor de origen → API de MGN | TCP 443 | Registrar el servidor, informar su estado y coordinar acciones del servicio. |
| Instalador en el origen → Amazon S3 regional | TCP 443 | Descargar el instalador del agente desde el bucket de la región de destino. |
| Servidor de origen (salida) → servidor de replicación en staging (entrada) | TCP 1500 | Transferir los bloques replicados; permite la salida desde el origen y la entrada al servidor de replicación. |
| Subred de staging → API de MGN y endpoints requeridos de S3 | TCP 443 | Coordinar la replicación, descargar software y paquetes necesarios para los servidores de replicación y conversión. |

Antes de autorizar la replicación, usa nuestro [checklist de seguridad en AWS](https://dondeaprendoaws.com/blog/aws-seguridad-mejores-practicas/) para revisar la identidad que ejecuta la migración, la exposición de red y los registros que conservarás.

Los datos replicados se comprimen y cifran en tránsito. Abrir solo TCP 443 hacia la API no basta: comprueba DNS, rutas, firewalls, grupos de seguridad, ACL de red y acceso a S3 en el staging. Si usas VPN o Direct Connect, valida también las rutas y los rangos de IP entre el origen y esa subred. Esta tabla cubre el flujo de replicación basado en agente desde la consola de MGN; para replicación sin agente de VMware o la preparación con AWS Transform, consulta los requisitos propios de cada flujo en la documentación.

## Cómo migrar un servidor a AWS con MGN

Organiza la migración por aplicación o grupo de dependencias. Una base de datos, un servidor de aplicación y un servicio de identidad pueden necesitar un orden de corte coordinado; moverlos como máquinas aisladas puede dejar la aplicación sin conexiones aunque cada instancia arranque.

1. **Inventaría y elige la estrategia.** Documenta servidores, sistema operativo, discos, aplicaciones, licencias, dependencias, requisitos de disponibilidad, transferencia de datos y ventana de corte. Decide qué servidores son rehost, cuáles requieren DMS o DataSync y cuáles conviene rediseñar o retirar.
2. **Prepara la cuenta y la región de destino.** Inicializa MGN en la región elegida, define la subred de staging y configura la plantilla de replicación. Prepara también la VPC, las subredes de prueba y producción, las reglas de seguridad, el acceso a directorio y DNS, y la plantilla de lanzamiento de EC2.
3. **Confirma compatibilidad y conectividad.** Revisa el sistema operativo y cada volumen en la documentación vigente. Comprueba TCP 443, TCP 1500, rutas, endpoints de S3 y ancho de banda. Estima cuánto tardará la carga inicial y si la capacidad de red podrá absorber los cambios de datos que genere el servidor mientras replica.
4. **Añade los servidores.** Sigue el procedimiento de instalación que muestra la consola de MGN para el sistema operativo de cada origen, o configura el cliente de vCenter para el flujo sin agente admitido. No descargues instaladores o comandos de páginas no verificadas: utiliza los enlaces y valores que la documentación oficial genera para la región y la cuenta.
5. **Espera a que la replicación esté sana.** Controla en la consola el estado del ciclo de vida y de replicación hasta que los servidores estén listos para probar y la replicación figure como saludable. Resuelve retrasos o errores antes de crear instancias de destino.
6. **Lanza instancias de prueba.** Usa una subred aislada de producción y valida arranque, acceso, servicios, datos, resolución DNS, directorio, integraciones, reglas de red, rendimiento y operaciones de respaldo. Prueba las funciones principales de la aplicación con datos representativos. AWS recomienda probar al menos dos semanas antes del corte para disponer de margen ante problemas; las instancias de prueba y sus volúmenes generan cargos mientras existan.
7. **Planifica y ejecuta el corte.** Coordina con quienes operan la aplicación una ventana y el tratamiento de escrituras para mantener la consistencia. Espera a la última replicación, lanza las instancias de corte, cambia rutas, balanceadores o DNS y valida la aplicación con sus responsables. Define antes cómo volver al origen y cómo evitar escrituras divergentes si hay que revertir.
8. **Cierra la migración después de aceptar el resultado.** Conserva el origen hasta que se cumpla el criterio de aceptación y el período de observación acordado. Después finaliza el corte en MGN, desconecta los servidores, retira recursos temporales y revisa la facturación. Finalizar el flujo de MGN no reconcilia por sí solo los datos escritos en dos sistemas durante una reversión.

Consulta la guía de AWS para [lanzar y validar una instancia de prueba](https://docs.aws.amazon.com/mgn/latest/ug/launching-test-gs.html). Las instancias de prueba no detienen la replicación, pero usan recursos de EC2 y EBS facturables; elimínalas cuando ya no hagan falta.

## Costos: qué significa el período gratuito de MGN

AWS ofrece **2.160 horas (90 días de uso continuo) sin cargo por el servicio MGN para cada servidor migrado**. Eso no vuelve gratuita toda la migración: los recursos que MGN crea o que lanzas —como servidores de replicación, volúmenes y snapshots de EBS, instancias de prueba y de corte— se facturan según la región y la configuración de tu cuenta. Puede haber otros cargos de infraestructura o transferencia.

Estima el costo antes de iniciar, revisa la [página de precios de AWS Transform MGN](https://aws.amazon.com/application-migration-service/pricing/) y vigila los recursos temporales. El tamaño de discos, la cantidad de cambios, la duración de la replicación y las pruebas influyen en el total; no existe una tarifa única por proyecto que garantice el costo final.

## Problemas frecuentes de replicación y pruebas

| Síntoma | Qué revisar primero |
|---|---|
| El servidor no aparece en la consola | Requisitos del sistema operativo, permisos de instalación, credenciales temporales y acceso del origen a la API de MGN y a los endpoints de descarga. |
| La replicación falla o acumula retraso | Conectividad TCP 1500 entre el origen y staging, reglas de seguridad y ACL, rutas, ancho de banda disponible y ritmo de escritura del servidor. |
| El servidor de staging no inicia o no convierte | Acceso del staging a MGN, S3 y los paquetes requeridos de Amazon Linux; verifica endpoints y políticas del VPC endpoint de S3. |
| La instancia de prueba inicia, pero la aplicación falla | Dependencias, DNS y directorio, rutas de red, reglas de seguridad, direcciones IP, licencias y configuración del sistema operativo de destino. Aísla las pruebas de producción, sobre todo si hay controladores de dominio. |
| Aparecen cargos después de una prueba o del corte | Termina instancias de prueba que ya no uses y revisa en EC2 y EBS los recursos de staging o destino que quedaron activos. Confirma el estado de los servidores en MGN antes de retirar el agente. |

La [guía oficial de requisitos de red y solución de problemas](https://docs.aws.amazon.com/mgn/latest/ug/preparing-environments.html) incluye los endpoints y verificaciones de conectividad. Revisa los errores concretos de la consola antes de cambiar firewalls o políticas: ampliar reglas sin identificar el flujo requerido puede exponer servicios innecesariamente.

## Recursos, comunidad y eventos para seguir aprendiendo

Estas grabaciones en español complementan la guía desde distintos ángulos; úsalas como contexto y verifica nombres, disponibilidad y pasos operativos con la documentación vigente:

- **Elegir una estrategia:** [“Dominando las 7 Rutas de Migración para Triunfar en AWS”](https://www.youtube.com/watch?v=GynN8Zk3eFQ), grabación de AWS User Group Chile, sirve como introducción para comparar enfoques antes de elegir una herramienta.
- **Conocer los servicios:** [“Servicios de Migración en AWS”](https://www.youtube.com/watch?v=0k7dJq-eBT8) y [“AWS Database Migration Service (DMS)”](https://www.youtube.com/watch?v=VESlGtk7ePI), dos grabaciones de AWS Women Colombia. Para un ejemplo de bases empresariales, el [24avo Meetup de AWS User Group Panamá](https://www.youtube.com/watch?v=JgbQIul3VXA) incluye una charla titulada “Migrando Oracle y SQL Server hacia AWS”.
- **Entender la red:** [“La Latencia en Migraciones y Ambientes Híbridos”](https://www.youtube.com/watch?v=dGcgOhQSrws), grabación de AWS Girls Argentina sobre latencia y migración. Complementa la planificación de ancho de banda; no reemplaza una prueba de capacidad de tu enlace.
- **Ver una experiencia de migración:** el episodio de 2022 [“Aprender AWS haciendo una migración”](https://www.youtube.com/watch?v=jz461uBIslM) cuenta cómo un equipo aprendió AWS mientras migraba. Es un relato histórico sobre el proceso de aprendizaje, no un tutorial de AWS Transform MGN.
- **Revisar anuncios pasados:** [reCap de AWS re:Invent 2025 sobre almacenamiento, migración y transferencia](https://www.youtube.com/watch?v=Ohvf0ZhyIzo), grabado por AWS Women Colombia; úsalo para contexto de esos anuncios, no como referencia de configuración actual.

Si el punto difícil es la conectividad híbrida, [AWS User Group Networking Colombia](https://www.meetup.com/aws-user-group-networking-colombia/) reúne a personas interesadas en redes híbridas, enrutamiento entre cuentas y diseño de redes en AWS. La comunidad puede servir para conversar sobre decisiones y experiencias, pero no sustituye la documentación ni el soporte de AWS.

Al consultar la agenda el 5 de octubre de 2026, había una sesión virtual de fundamentos de Amazon VPC anunciada para el 21 de octubre, organizada por AWS Student Builder Group at Universidad Distrital. [Confirma fecha, registro y disponibilidad en Meetup](https://www.meetup.com/aws-sbg-at-francisco-jose-de-caldas-district-univ-bogota/events/316674045/): la sesión cubre VPC, subredes y rutas, no es un laboratorio de MGN. Para futuras fechas, revisa la [agenda de eventos AWS en Latinoamérica](https://dondeaprendoaws.com/eventos/).

## Preguntas frecuentes sobre AWS SMS y MGN

### ¿AWS SMS sigue disponible?

No. AWS registra Server Migration Service en apagado completo desde el 1 de abril de 2023. Para un proyecto nuevo de rehost, evalúa AWS Transform MGN y confirma que sus requisitos coincidan con tus servidores.

### ¿AWS MGN necesita un agente?

El flujo de replicación continua basado en agente necesita instalar AWS Replication Agent en cada servidor. Para entornos vCenter compatibles con VMware hay una opción de replicación de snapshots sin agente, con configuración y requisitos diferentes.

### ¿AWS MGN garantiza cero tiempo de inactividad?

No. La replicación reduce el trabajo pendiente para la ventana de corte, pero el tiempo real depende de la aplicación, el ritmo de cambio de datos, la red, las pruebas y el cambio de tráfico. Planifica una interrupción, prueba el procedimiento y acuerda cómo volver al origen.

### ¿AWS MGN migra una base de datos?

Puede rehostear a EC2 el servidor que ejecuta una base de datos compatible. Para migrar solo los datos entre motores o mantener replicación de cambios específica de la base, evalúa DMS y las herramientas nativas del motor.

### ¿AWS MGN es gratis durante 90 días?

AWS no cobra el servicio MGN durante las primeras 2.160 horas por servidor. Los recursos de AWS que se utilicen durante la replicación, las pruebas y el corte sí pueden generar cargos.
