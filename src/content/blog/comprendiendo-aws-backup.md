---
title: "AWS Backup: cómo crear planes y probar restauraciones"
description: "Aprende qué es AWS Backup: crea un plan para EBS, comprueba copias y restauraciones, y revisa retención, Vault Lock, permisos y costos."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T03:55:54.461Z"
modifiedTimestamp: "2026-10-06T09:52:18-03:00"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related:
  - title: "Respaldos y snapshots en EBS"
    url: "https://dondeaprendoaws.com/blog/respaldos-y-snapshots-en-ebs/"
  - title: "Estrategias de recuperación de desastres en AWS"
    url: "https://dondeaprendoaws.com/blog/estrategias-de-recuperacion-de-desastres-en-aws/"
  - title: "Mejores prácticas para Amazon RDS y Aurora"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-rds-y-aurora/"

---

<p><a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/whatisbackup.html" rel="noopener noreferrer" target="_blank">AWS Backup</a> es un servicio administrado para centralizar y automatizar copias de seguridad de tipos de recursos compatibles. Defines qué proteger, con qué frecuencia, cuánto conservar y dónde guardar o copiar cada punto de recuperación. Para que una copia exista, el recurso debe estar dentro de la selección del plan o de un trabajo puntual, contar con los permisos necesarios y ser compatible en esa región. Almacenar, copiar y restaurar datos puede generar cargos.</p>

<p>La idea principal es sencilla: un <strong>plan de copia</strong> reúne reglas; una <strong>asignación</strong> indica qué recursos reciben esas reglas; una <strong>bóveda</strong> organiza las copias; y cada <strong>punto de recuperación</strong> representa una copia concreta que puedes restaurar. AWS Backup sirve para coordinar esos pasos desde un lugar común, pero conviene comprobar que el trabajo terminó y probar el proceso de recuperación.</p>

<h2 id="conceptos-de-aws-backup">Planes, asignaciones, bóvedas y puntos de recuperación</h2>

<p>Un plan de AWS Backup contiene una o más reglas. Cada regla define aspectos como la programación, el período de retención, la bóveda de destino y, si corresponde, las acciones para copiar las copias. También puedes iniciar una copia bajo demanda como un trabajo puntual cuando necesitas un punto de recuperación fuera de la programación habitual.</p>

<p>El plan no incorpora automáticamente todos los recursos de la cuenta. Su asignación puede basarse en recursos o tipos concretos, o en etiquetas. Antes de confiar en una selección, revisa que incluya los recursos previstos y que no dependa de etiquetas ausentes o inconsistentes. Según el tipo de recurso y la forma de seleccionarlo, también puede aplicar la configuración de <em>service opt-in</em> de AWS Backup para esa cuenta y región.</p>

<p>Una bóveda de copia de seguridad es el contenedor lógico donde AWS Backup organiza puntos de recuperación y aplica controles como cifrado y políticas de acceso. No significa que todas las copias se almacenen como archivos que eliges directamente en un bucket de Amazon S3: el comportamiento y el tipo de copia dependen del servicio protegido. Un punto de recuperación es una copia individual, por ejemplo, un snapshot de EBS o una copia de una tabla de DynamoDB.</p>

<p>AWS Backup admite recursos de servicios como Amazon EBS, Amazon EC2, Amazon RDS y Aurora, Amazon S3, DynamoDB, EFS y algunas familias de FSx, además de ciertos entornos VMware. La disponibilidad de funciones varía por tipo de recurso y región. Comprueba la <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/backup-feature-availability.html" rel="noopener noreferrer" target="_blank">matriz oficial de compatibilidad de AWS Backup</a> antes de diseñar un plan. Las copias creadas por mecanismos propios de un servicio tampoco quedan necesariamente bajo la gestión central de AWS Backup; la integración depende del servicio.</p>

<h2 id="ejemplo-plan-ebs">Ejemplo: crear un plan y restaurar un volumen EBS existente</h2>

<p>Este recorrido usa un volumen EBS de prueba que ya existe en una región. Elige un volumen no productivo con datos que puedas validar; no crees otro volumen para iniciar el plan. El ejemplo usa una copia diaria y 14 días de retención solo para mostrar los campos. Ajusta la frecuencia y el plazo a tus necesidades reales. AWS cobra el almacenamiento de las copias y el tiempo durante el que conserves el volumen nuevo que se crea al restaurar.</p>

<ol>
<li><strong>Define qué quieres recuperar.</strong> Decide cuánta pérdida de datos toleras (RPO) y cuánto puede tardar la recuperación (RTO). Esos objetivos orientan la frecuencia del plan y las verificaciones que harás después. Para una explicación aplicada a AWS, consulta <a href="https://www.youtube.com/watch?v=bEEnOxwfdk8" rel="noopener noreferrer" target="_blank">Semana 8 — RTO/RPO y recuperación de desastres</a>, de Axel Echevarría Piérola.</li>
<li><strong>Abre AWS Backup en la región del volumen.</strong> Comprueba que Amazon EBS esté disponible en esa región y que el volumen aparezca como recurso seleccionable. Si tu asignación depende de etiquetas o de la configuración de servicio, revisa <em>Settings</em> y <em>Service opt-in</em>. Consulta la guía de <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/working-with-supported-services.html" rel="noopener noreferrer" target="_blank">integración con servicios compatibles</a>.</li>
<li><strong>Elige una bóveda existente.</strong> Usa la bóveda <code>Default</code> de esa región o una bóveda que ya tenga tu organización. AWS Backup crea una bóveda predeterminada al abrir por primera vez la sección de bóvedas en una región; <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/create-a-vault.html" rel="noopener noreferrer" target="_blank">la guía de bóvedas</a> explica el comportamiento. No actives Vault Lock para este ejemplo breve.</li>
<li><strong>Crea el plan y su regla.</strong> En la consola, abre <em>Backup plans</em>, elige <em>Create Backup plan</em> y <em>Build a new plan</em>. Asigna el nombre <code>ebs-prueba-diaria</code> y añade una regla llamada <code>ebs-diario</code>. Selecciona la bóveda <code>Default</code>, configura la frecuencia diaria y define 14 días de retención. No actives almacenamiento frío para esta prueba. La <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/creating-a-backup-plan.html" rel="noopener noreferrer" target="_blank">guía oficial de creación de planes</a> muestra esos campos.</li>
<li><strong>Asigna un solo volumen.</strong> En el plan, elige <em>Assign resources</em>. Ponle un nombre a la asignación, selecciona el rol predeterminado de AWS Backup si tu organización permite usarlo o un rol de mínimo privilegio que el servicio pueda asumir, y define una selección específica: Amazon EBS y el ID del volumen de prueba. No elijas todos los tipos de recurso ni una etiqueta amplia. La <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/assigning-resources-console.html" rel="noopener noreferrer" target="_blank">guía de asignación en la consola</a> detalla estas opciones; el rol necesita permisos para ese volumen.</li>
<li><strong>Confirma que se creó la copia.</strong> Espera a la siguiente ejecución programada. En <em>Jobs</em>, revisa que el trabajo de backup del volumen figure como <em>Completed</em>; luego abre el volumen en <em>Protected resources</em> y confirma que aparezca un punto de recuperación. Si necesitas probar una copia antes de la próxima ventana, puedes iniciar un trabajo bajo demanda por separado; eso no comprueba que la programación diaria funcione.</li>
<li><strong>Restaura en un volumen nuevo y valida.</strong> En <em>Protected resources</em>, abre el ID EBS, selecciona el punto de recuperación y elige <em>Restore</em>. Indica tipo y tamaño del volumen, y la zona de disponibilidad. AWS Backup crea un volumen nuevo; el original no se sobrescribe. Si necesitas comprobar archivos, conecta la copia a una instancia de prueba compatible en la misma zona y valida un dato conocido. La guía de AWS explica cómo <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/restoring-ebs.html" rel="noopener noreferrer" target="_blank">restaurar un volumen EBS</a>.</li>
<li><strong>Limpia la prueba.</strong> Cuando termines de validar, desmonta y desconecta el volumen restaurado, y elimínalo si ya no lo necesitas. Para dejar de programar futuras copias, quita la asignación o elimina el plan de prueba. Eso no elimina automáticamente los puntos ya guardados: pueden seguir ocupando almacenamiento hasta que expire su retención. Si también decides eliminarlos antes, hazlo solo si tu política lo permite y después de confirmar que ya no necesitas restaurarlos.</li>
</ol>

<p>Las rutas y nombres de los botones pueden cambiar con la consola. En una política real, conserva la asignación y retención que responden a tus requisitos; 14 días y la bóveda <code>Default</code> son valores de demostración, no una recomendación universal.</p>

<p>La documentación de AWS separa la configuración del plan de la selección de recursos. Consulta <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/plan-options-and-configuration.html" rel="noopener noreferrer" target="_blank">las opciones de reglas y ciclo de vida</a> y la guía para <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/assigning-resources.html" rel="noopener noreferrer" target="_blank">habilitar servicios y asignar recursos</a> si necesitas comprobar un caso concreto. Para el rol que opera sobre el volumen, revisa los <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/iam-service-roles.html" rel="noopener noreferrer" target="_blank">roles de servicio de AWS Backup</a>.</p>

<h2 id="retencion-almacenamiento-frio-y-copias">Retención, almacenamiento frío y copias en otra región o cuenta</h2>

<p>Las reglas permiten definir cuánto tiempo conservar los puntos de recuperación y, para algunos tipos de recurso, cuándo moverlos del nivel de almacenamiento estándar al almacenamiento frío. No todos los recursos admiten esa transición. Las copias que pasan al nivel frío deben permanecer allí un mínimo de 90 días; si eliminas una antes de cumplir ese plazo, puede aplicarse un cargo por el período restante. Restaurar desde almacenamiento frío suele tardar más que desde almacenamiento estándar. Revisa la compatibilidad y el ciclo de vida antes de activar la transición.</p>

<p>Una regla también puede copiar una copia de seguridad a otra región o cuenta cuando el recurso lo admite. La copia requiere una bóveda de destino y permisos válidos; entre cuentas, el diseño puede involucrar AWS Organizations y claves de KMS. No todas las combinaciones de recurso y destino están disponibles, y las copias entre regiones generan transferencia de datos y almacenamiento en el destino. Además de revisar la <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/recov-point-create-a-copy.html" rel="noopener noreferrer" target="_blank">guía oficial de copias entre regiones y cuentas</a>, estima el costo de mantener ambos puntos de recuperación. Como ejemplo avanzado, el <a href="https://github.com/pangoro24/aws-backup-cross-account--cross-region-solution" rel="noopener noreferrer" target="_blank">repositorio de demostración de AWS Backup cross-account y cross-region</a> incluye plantillas que despliegan roles, bóvedas, claves KMS, planes y recursos S3/DynamoDB. Revisa el código, los permisos y el costo potencial antes de ejecutarlo.</p>

<p>Una copia en otra región puede ayudar ante un problema regional; una cuenta de respaldo separada puede reducir la exposición a cambios hechos desde la cuenta de origen. Ninguna de las dos decisiones sustituye el control de acceso, la revisión de trabajos y las pruebas de restauración.</p>

<h2 id="seguridad-y-vault-lock">Seguridad de las copias y AWS Backup Vault Lock</h2>

<p>Protege el acceso a las bóvedas y las claves de cifrado, limita quién puede crear o borrar copias y usa roles de IAM con los permisos que requiere cada operación. La separación entre datos de origen y puntos de recuperación ayuda a preservar opciones de restauración, pero una copia por sí sola no demuestra que la aplicación pueda recuperarse ni que su contenido esté libre de cambios no deseados.</p>

<p><a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/vault-lock.html" rel="noopener noreferrer" target="_blank">AWS Backup Vault Lock</a> añade controles de retención tipo WORM a una bóveda. En modo <em>Governance</em>, usuarios con permisos suficientes pueden modificar o quitar el bloqueo. En modo <em>Compliance</em>, una vez terminado el período de gracia, la configuración del bloqueo se vuelve inmutable mientras la bóveda tenga puntos de recuperación; esos puntos siguen almacenados hasta completar su ciclo de vida y pueden seguir generando cargos. Revisa retenciones, permisos y requisitos de restauración antes de activar el modo Compliance en una bóveda real. Vault Lock es una capa de protección para copias, no un reemplazo de IAM, KMS ni de la estrategia completa de seguridad.</p>

<h2 id="pruebas-de-restauracion">Prueba que puedes restaurar</h2>

<p>Una tarea de copia completada demuestra que AWS Backup creó un punto de recuperación. Para comprobar que la recuperación es viable, puedes configurar un plan de <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing.html" rel="noopener noreferrer" target="_blank">Restore Testing</a> para los tipos de recurso compatibles. AWS Backup inicia trabajos de restauración según la frecuencia definida y registra su duración. Una charla comunitaria que muestra una validación para RDS es <a href="https://www.youtube.com/watch?v=FADljBnSzSw" rel="noopener noreferrer" target="_blank">Validando RDS Snapshots con AWS Backups</a>, presentada por Lucas Blanco en AWS Community Day Argentina 2024.</p>

<p>Incluye en la prueba las verificaciones que importan a tu sistema: que la base de datos se inicie, que los datos esperados estén presentes y que las dependencias de la aplicación respondan. Un trabajo de restauración completado no verifica por sí solo la salud de la aplicación. En una prueba operativa, define quién valida el resultado y cómo se limpian los recursos temporales.</p>

<p>Para automatizar una comprobación posterior al trabajo de restauración, AWS documenta un flujo con EventBridge y un destino como Lambda en su guía de <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing-validation.html" rel="noopener noreferrer" target="_blank">validación de Restore Testing</a>.</p>

<p>Las pruebas pueden generar cargos por evaluación, datos restaurados y recursos que permanezcan activos después de la prueba. El costo depende del tipo de recurso, región y tiempo de conservación. Consulta <a href="https://aws.amazon.com/backup/pricing/" rel="noopener noreferrer" target="_blank">los precios actuales de AWS Backup</a> antes de programar pruebas recurrentes.</p>

<h2 id="diagnosticar-trabajos-fallidos">Cómo diagnosticar un trabajo fallido</h2>

<ul>
<li>En AWS Backup, abre el trabajo correspondiente en <strong>Jobs</strong> y revisa su estado, mensaje de error, recurso y región. Separa los trabajos de copia de seguridad, copia entre regiones y restauración: pueden fallar por motivos distintos.</li>
<li>Confirma que el tipo de recurso esté disponible en esa región, que la asignación incluya el recurso correcto y que la configuración de <em>service opt-in</em> corresponda al método de selección.</li>
<li>Revisa la relación de confianza y los permisos del rol usado por AWS Backup, además del acceso a la clave KMS del origen y del destino cuando corresponda.</li>
<li>Si usas selecciones por etiqueta, comprueba que las etiquetas coincidan y que las políticas de IAM u Organizations no bloqueen la búsqueda de recursos etiquetados.</li>
<li>Para errores al crear o eliminar recursos, consulta el evento relacionado en AWS CloudTrail y la página de resolución de problemas del servicio protegido. AWS mantiene una guía de <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/troubleshooting.html" rel="noopener noreferrer" target="_blank">errores comunes de AWS Backup</a>.</li>
</ul>

<p>Un error de acceso suele indicar que falta permiso para el recurso o para una operación de AWS Backup. Cuando el mensaje apunta a un tipo de recurso concreto, sigue la guía de integración de ese servicio en lugar de asumir que todos los tipos usan los mismos permisos y parámetros de restauración.</p>

<h2 id="costos-de-aws-backup">Qué revisar en los costos</h2>

<p>AWS Backup factura según el uso. Entre los componentes que pueden influir están el almacenamiento de los puntos de recuperación, la transferencia de copias a otra región, los datos restaurados y las evaluaciones de Backup Audit Manager o Restore Testing. Algunos tipos de recurso añaden cargos propios por solicitudes, índices u otras operaciones. Las tarifas y condiciones varían según recurso, región y nivel de almacenamiento; no supongas que una copia o una restauración son gratuitas.</p>

<p>Antes de fijar una política, estima frecuencia y retención, tamaño y cambio de datos, número de copias, regiones de destino y restauraciones de prueba. Compara esa estimación con la página de precios vigente y revisa la factura después de activar una política. Evita copias duplicadas si el servicio protegido ya crea respaldos nativos que cubren la misma necesidad.</p>

<h2 id="comunidad-y-recursos">Comunidad y recursos para seguir aprendiendo</h2>

<p>Como panorama de servicios de almacenamiento, <a href="https://www.youtube.com/watch?v=-ZK2SwC0n1Q" rel="noopener noreferrer" target="_blank">Conociendo más de discos compartidos: AWS EFS, AWS FSx y AWS Backup</a> es una grabación de AWS Girls Perú de 2021 que repasa esos servicios. Por su antigüedad, contrasta límites y funciones actuales con la documentación oficial.</p>

<p>También puedes conversar sobre controles y riesgos de nube en <a href="https://www.meetup.com/awssecuritylatam/" rel="noopener noreferrer" target="_blank">AWS Security Users Group LatAm</a>, un grupo independiente que comparte contenido de seguridad de AWS para personas hispanohablantes. Su <a href="https://www.youtube.com/@AWSSecurityLATAM" rel="noopener noreferrer" target="_blank">canal de YouTube</a> reúne grabaciones de charlas. Si buscas intercambio local más general, <a href="https://www.meetup.com/aws-user-group-cordoba-argentina/" rel="noopener noreferrer" target="_blank">AWS User Group Córdoba</a> conecta a personas interesadas en computación en la nube y AWS.</p>

<p>Para encontrar otras comunidades por país y consultar fechas vigentes, revisa el <a href="https://dondeaprendoaws.com/comunidades/" rel="noopener noreferrer" target="_blank">directorio de comunidades AWS</a> y la <a href="https://dondeaprendoaws.com/eventos/" rel="noopener noreferrer" target="_blank">agenda de eventos</a>. Comprueba el organizador, el horario y las condiciones de inscripción en cada ficha.</p>

<h2 id="preguntas-frecuentes">Preguntas frecuentes sobre AWS Backup</h2>

<h3 id="aws-backup-protege-todos-los-recursos">¿AWS Backup protege todos los recursos de mi cuenta?</h3>
<p>No. Debes elegir recursos compatibles, verificar la región y revisar la asignación del plan y la configuración de servicio. AWS Backup tampoco administra automáticamente todas las copias creadas fuera de él por funciones nativas de otros servicios.</p>

<h3 id="aws-backup-es-gratis">¿AWS Backup es gratis?</h3>
<p>No lo presupongas. El costo depende del almacenamiento, las transferencias, restauraciones, evaluaciones y características que uses. Revisa los precios actuales antes de definir retención o programar pruebas.</p>

<h3 id="vault-lock-es-seguridad-completa">¿Vault Lock protege toda la cuenta contra ransomware?</h3>
<p>No. Vault Lock refuerza la retención de puntos de recuperación en una bóveda. Combínalo con permisos restringidos, cifrado, separación de cuentas según tu diseño y pruebas de restauración; revisa cuidadosamente las consecuencias del modo Compliance antes de activarlo.</p>

<h3 id="como-compruebo-una-restauracion">¿Cómo compruebo que una copia se puede restaurar?</h3>
<p>Programa una prueba de restauración para los recursos compatibles y verifica también los datos y la aplicación restaurada. Incluye en el presupuesto los cargos de la prueba y de los recursos temporales que mantengas.</p>
