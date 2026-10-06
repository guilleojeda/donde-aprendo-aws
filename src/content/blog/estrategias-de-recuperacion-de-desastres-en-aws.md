---
title: "Recuperación ante desastres en AWS: RTO, RPO y estrategias"
description: "Compara estrategias de recuperación ante desastres en AWS, define RTO y RPO y aprende a probar backups, failover y failback."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T02:40:38.528Z"
modifiedTimestamp: "2026-10-06T15:51:02-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related:
  - title: "AWS Backup: cómo crear planes y probar restauraciones"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-aws-backup/"
  - title: "Alta disponibilidad en AWS: arquitectura Multi-AZ para una app web"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/"
  - title: "Arquitectura multi-región en AWS: cuándo conviene"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/"

---

<p>Un plan de recuperación ante desastres (DR) define cómo volver a operar cuando una falla interrumpe una carga de trabajo completa. En AWS, puedes restaurar desde copias, mantener preparado un entorno en otra región o atender tráfico desde varios sitios. La decisión empieza por dos objetivos acordados con el negocio —RTO y RPO— y termina cuando el equipo ha probado el proceso completo, incluido el cambio de tráfico y el regreso a la operación normal.</p>

<h2>Alta disponibilidad y recuperación ante desastres cubren fallas distintas</h2>

<p>La alta disponibilidad (HA) busca que un servicio siga funcionando ante fallas de componentes o de una zona de disponibilidad. Por ejemplo, una arquitectura Multi-AZ puede mantener una aplicación operativa si una AZ deja de responder. La recuperación ante desastres cubre una interrupción mayor: el equipo debe reconstruir o activar el conjunto de la carga de trabajo en un sitio de recuperación, posiblemente en otra región.</p>

<p>Una arquitectura Multi-AZ no protege por sí sola contra una interrupción de toda la región. Tampoco una arquitectura activa en varias zonas reemplaza las copias con historial: si se borra o corrompe un dato, la replicación puede llevar ese cambio al otro sitio. AWS explica la diferencia entre HA y DR en su <a href="https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/high-availability-is-not-disaster-recovery.html" rel="noopener noreferrer" target="_blank">guía de recuperación de cargas de trabajo</a>. Para ver un ejemplo de HA de aplicación y base de datos, consulta también <a href="https://dondeaprendoaws.com/blog/arquitecturas-de-alta-disponibilidad-en-aws/">la guía de arquitectura Multi-AZ</a>.</p>

<p>Como otro material para seguir con este tema, el catálogo incluye la grabación comunitaria <a href="https://www.youtube.com/watch?v=sEr65Cgskkc" rel="noopener noreferrer" target="_blank">Diseñando arquitecturas resilientes en AWS</a>, publicada por AWS UG Ecuador.</p>

<h2>Define RTO y RPO antes de elegir una estrategia</h2>

<p>El <strong>objetivo de tiempo de recuperación (RTO)</strong> es el retraso máximo aceptable entre la interrupción del servicio y su recuperación. El <strong>objetivo de punto de recuperación (RPO)</strong> es la antigüedad máxima aceptable del último punto de datos recuperable; señala cuántos cambios recientes podrías perder. AWS recomienda definir ambos por carga de trabajo según el impacto en el negocio, no copiar valores genéricos de un ejemplo. Consulta la guía oficial sobre <a href="https://docs.aws.amazon.com/wellarchitected/2024-06-27/framework/rel_planning_for_recovery_objective_defined_recovery.html" rel="noopener noreferrer" target="_blank">objetivos RTO y RPO</a>.</p>

<p>En un ejemplo hipotético, un equipo podría fijar un RPO de 30 minutos y un RTO de 2 horas: aceptaría recuperar datos de hasta 30 minutos antes de la interrupción y necesitaría restablecer el servicio dentro de 2 horas. Son objetivos de negocio, no tiempos prometidos por AWS ni por una estrategia. Al medir el RTO, cuenta desde que ocurre la interrupción hasta que la aplicación y sus dependencias pasan la validación y vuelven a atender tráfico. Para el RPO, comprueba qué datos están disponibles en el punto que realmente puedes restaurar.</p>

<p>Si prefieres repasar estos conceptos en video, el catálogo incluye <a href="https://www.youtube.com/watch?v=bEEnOxwfdk8" rel="noopener noreferrer" target="_blank">Semana 8 — RTO/RPO y recuperación de desastres</a>, una grabación de Axel Echevarría Piérola. Puedes explorar más sesiones en su <a href="https://www.youtube.com/@axlpierola" rel="noopener noreferrer" target="_blank">canal de YouTube</a>.</p>

<p>Escribe los objetivos por carga de trabajo y considera sus dependencias: identidad y permisos, red, claves de cifrado, bases de datos, colas, DNS y servicios externos. Un servidor que arranca rápido no recupera el sistema si una base de datos o una dependencia crítica sigue ausente. La <a href="https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/">guía para decidir cuándo conviene una arquitectura multi-región</a> amplía cómo relacionar alcance de falla, RTO, RPO y replicación.</p>

<h2>Cuatro estrategias de recuperación</h2>

<p>En términos generales, cuanto más del entorno mantienes preparado, menos infraestructura necesitas desplegar durante una contingencia. Eso puede reducir trabajo de recuperación, pero no garantiza un RTO o RPO determinado: el resultado depende de los datos, las dependencias, la capacidad disponible, el enrutamiento y las pruebas de tu aplicación. La guía <a href="https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_planning_for_recovery_disaster_recovery.html" rel="noopener noreferrer" target="_blank">REL13 del AWS Well-Architected Framework</a> describe estos patrones.</p>

<table>
  <thead>
    <tr>
      <th scope="col">Estrategia</th>
      <th scope="col">Qué queda preparado</th>
      <th scope="col">Qué falta hacer al recuperarse</th>
      <th scope="col">Cuándo considerarla</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Backup y restauración</th>
      <td>Copias de datos y artefactos de despliegue, idealmente accesibles desde un sitio de recuperación.</td>
      <td>Desplegar la infraestructura y el código, restaurar los datos, comprobar dependencias y dirigir el tráfico.</td>
      <td>Cuando el negocio puede tolerar el tiempo necesario para reconstruir el entorno desde copias probadas.</td>
    </tr>
    <tr>
      <th scope="row">Pilot Light (luz piloto)</th>
      <td>Datos replicados y componentes centrales que permiten sostenerlos, como bases de datos o almacenamiento.</td>
      <td>Crear o activar los componentes que no están listos para atender solicitudes y escalar el entorno.</td>
      <td>Cuando quieres mantener preparada la base de recuperación, pero no necesitas que la aplicación atienda tráfico en condiciones normales.</td>
    </tr>
    <tr>
      <th scope="row">Warm Standby (espera activa reducida)</th>
      <td>Una copia funcional de la aplicación en el sitio de recuperación, con capacidad menor a la producción.</td>
      <td>Escalar, validar y asumir el tráfico de producción.</td>
      <td>Cuando es importante reducir las tareas de despliegue durante la recuperación y existe una necesidad de continuidad más exigente.</td>
    </tr>
    <tr>
      <th scope="row">Multisitio activo/activo</th>
      <td>Varios sitios reciben tráfico de producción y mantienen sus datos sincronizados.</td>
      <td>Desviar tráfico del sitio afectado y comprobar que los sitios restantes soportan la demanda.</td>
      <td>Cuando la aplicación necesita seguir atendiendo durante fallas amplias y puede resolver los conflictos y la consistencia de datos entre sitios.</td>
    </tr>
  </tbody>
</table>

<p>Los nombres describen cuánto está preparado, no cuánto tardará tu sistema en recuperarse. Pilot Light necesita activar más componentes antes de procesar solicitudes; Warm Standby ya puede atender una parte del tráfico y se escala. En activo/activo, diseña cómo evitar o resolver escrituras simultáneas en distintas regiones. Para cualquier patrón, define cuánto cuesta mantener recursos listos según tu propia arquitectura y valida los precios actuales antes de decidir; no hay un costo único aplicable a todas las cargas de trabajo.</p>

<h2>AWS Backup y AWS Elastic Disaster Recovery tienen funciones diferentes</h2>

<h3>AWS Backup para coordinar copias y restauraciones</h3>

<p>Para copiar backups con AWS Backup entre cuentas, origen y destino deben pertenecer a la misma organización de AWS Organizations. La cuenta de administración debe habilitar la función de copias entre cuentas; también necesitas la bóveda de destino, su política de acceso y el cifrado adecuado. La <a href="/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/">guía para administrar cuentas con AWS Organizations</a> explica cómo crear o incorporar las cuentas antes de configurar esas copias.</p>

<p><a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/whatisbackup.html" rel="noopener noreferrer" target="_blank">AWS Backup</a> centraliza planes, retención y operaciones de copia y restauración para los tipos de recurso que admite. Puedes copiar puntos de recuperación a otra región o cuenta cuando esa combinación está disponible, pero el soporte varía por servicio y región. Comprueba la <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/backup-feature-availability.html" rel="noopener noreferrer" target="_blank">matriz de funciones de AWS Backup</a> y las condiciones de <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/create-cross-account-backup.html" rel="noopener noreferrer" target="_blank">copias entre cuentas</a>, incluidas las políticas de acceso y las claves de cifrado. Para una guía de planes, bóvedas y pruebas de restauración, sigue con <a href="https://dondeaprendoaws.com/blog/comprendiendo-aws-backup/">el tutorial de AWS Backup</a>.</p>

<p>Para ver una demo comunitaria con plantillas de CloudFormation que configura bóvedas, permisos y copias entre cuentas y regiones, revisa <a href="https://github.com/pangoro24/aws-backup-cross-account--cross-region-solution" rel="noopener noreferrer" target="_blank">AWS Backup entre cuentas y regiones: solución de recuperación ante desastres</a>. Es un ejemplo para estudiar y adaptar, no una plantilla universal: su copia regional de ejemplo es semanal y, para DynamoDB, la matriz de AWS Backup separa las funciones avanzadas de la compatibilidad base. Revisa esos requisitos y la frecuencia antes de usarla con tus propios datos.</p>

<p>La función Restore Testing puede programar restauraciones periódicas y registrar cuánto tardan para los recursos admitidos. Un trabajo completado confirma que se restauró el recurso de prueba; no verifica por sí solo que la aplicación funcione. Puedes añadir una validación funcional, por ejemplo con un flujo de EventBridge y Lambda, y revisar disponibilidad por tipo de recurso y región en la <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing.html" rel="noopener noreferrer" target="_blank">documentación de Restore Testing</a>.</p>

<h3>AWS Elastic Disaster Recovery para recuperar servidores</h3>

<p><a href="https://docs.aws.amazon.com/drs/latest/userguide/what-is-drs.html" rel="noopener noreferrer" target="_blank">AWS Elastic Disaster Recovery (AWS DRS)</a> replica bloques de servidores de origen de forma continua al área de preparación en AWS y permite lanzar instancias de recuperación en Amazon EC2. Se usa para cargas de trabajo basadas en servidores; no es un sustituto universal de las copias y mecanismos de recuperación propios de servicios administrados como bases de datos o almacenamiento. La replicación puede quedar atrasada si la red o el área de preparación no puede seguir el ritmo de escritura, y los datos que siguen en memoria sin haberse escrito al almacenamiento no forman parte del punto recuperable. Revisa los <a href="https://docs.aws.amazon.com/drs/latest/userguide/CloudEndure-Concepts.html" rel="noopener noreferrer" target="_blank">conceptos y condiciones de RPO de AWS DRS</a>.</p>

<p>AWS DRS no decide por sí mismo cuándo declarar un desastre ni redirige automáticamente el tráfico de producción. Tu plan debe establecer quién aprueba el failover, qué validaciones se ejecutan y qué servicio de DNS o gestión de tráfico usará el equipo. Las instancias de simulacro de DRS permiten probar la recuperación sin interrumpir los servidores de origen ni la replicación; aun así, la prueba debe cubrir la aplicación completa y sus dependencias.</p>

<h2>La replicación no sustituye a las copias con historial</h2>

<p>La replicación mantiene otro sitio al día con los cambios que recibe. Si esos cambios son una eliminación, una corrupción o datos cifrados por malware, también pueden propagarse. Por eso, una arquitectura replicada necesita puntos de restauración anteriores al incidente. Las instantáneas de punto en el tiempo de DRS pueden dar opciones para elegir un estado previo, pero AWS advierte en sus <a href="https://docs.aws.amazon.com/drs/latest/userguide/best_practices_drs.html" rel="noopener noreferrer" target="_blank">prácticas recomendadas de DRS</a> que borrar esas instantáneas o perder el servidor de replicación reduce las opciones de recuperación. Protege esos puntos con controles de acceso, retención y copias separadas, y no dependas de una sola cuenta que también pueda administrar producción.</p>

<p><a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/vault-lock.html" rel="noopener noreferrer" target="_blank">AWS Backup Vault Lock</a> ofrece controles de retención tipo WORM para recursos y regiones compatibles. AWS Backup también puede integrar análisis de malware de Amazon GuardDuty para ciertos puntos de recuperación; esa función ayuda a detectar amenazas, pero no bloquea cambios en los sistemas activos ni garantiza que todas las amenazas hayan sido detectadas. Verifica los tipos de recursos y regiones admitidos y revisa los resultados incompletos en la <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/malware-protection.html" rel="noopener noreferrer" target="_blank">guía de protección contra malware de AWS Backup</a>. Para una copia en otra cuenta, AWS exige configurar relaciones de confianza, permisos y cifrado; consulta sus <a href="https://docs.aws.amazon.com/aws-backup/latest/devguide/create-cross-account-backup.html" rel="noopener noreferrer" target="_blank">condiciones para copias entre cuentas</a>.</p>

<h2>Prueba restauración, failover y failback</h2>

<p>Una prueba útil recorre la ruta completa, no solo el botón de restauración o el arranque de una instancia:</p>

<ul>
  <li>Restaura un punto de recuperación en una cuenta o red de prueba, usando permisos, claves y parámetros que estarán disponibles durante un incidente.</li>
  <li>Comprueba los datos esperados, el acceso a servicios dependientes y una operación funcional de la aplicación antes de exponerla a usuarios.</li>
  <li>Inicia la medición del RTO cuando se interrumpe el servicio; incluye detección, decisión, recuperación y validación. Registra también cuál fue el punto de datos realmente recuperado.</li>
  <li>Ensaya el cambio de tráfico, las comunicaciones, quién toma cada decisión y cómo mantener la operación mientras el sitio principal se recupera.</li>
  <li>Prueba el failback por separado: replica o sincroniza los cambios creados durante la contingencia al entorno de origen, valida la copia y recién entonces vuelve a dirigir el tráfico.</li>
</ul>

<p>AWS DRS puede asistir con la replicación inversa durante el failback, pero el cambio de tráfico sigue siendo una acción del equipo, como explica su guía de <a href="https://docs.aws.amazon.com/drs/latest/userguide/failback.html" rel="noopener noreferrer" target="_blank">recuperación y failback</a>. AWS Backup permite automatizar pruebas periódicas para los tipos de recurso compatibles. Repite los ejercicios cuando cambien dependencias, permisos, datos o arquitectura, y actualiza el runbook con los hallazgos.</p>

<p>Como lectura complementaria, AWS Builder Center publicó <a href="https://builder.aws.com/content/3K45qVEJzMtJBbA8PHnaFLZAgxz/pruebas-de-resiliencia-recomendadas-en-aws-resilience-hub-un-runbook-que-nunca-se-ejecut-es-una-hiptesis" rel="noopener noreferrer" target="_blank">Pruebas de resiliencia recomendadas en AWS Resilience Hub: un runbook que nunca se ejecutó es una hipótesis</a>, de vtjean, sobre cómo contrastar los runbooks con pruebas observables.</p>

<h2>Una lista de partida para tu plan</h2>

<ol>
  <li>Haz un inventario de las cargas de trabajo, sus dependencias y el impacto de su interrupción.</li>
  <li>Acuerda RTO y RPO con las personas responsables del servicio y documenta qué prueba confirmará cada objetivo.</li>
  <li>Elige el patrón de recuperación según el tamaño de la falla que necesitas cubrir y la cantidad de trabajo que puedes hacer durante una contingencia.</li>
  <li>Comprueba soporte de recursos y regiones, permisos, llaves, capacidad, red y propiedad de cada paso de failover y failback.</li>
  <li>Prueba puntos de recuperación reales, registra los tiempos y las brechas, y convierte cada hallazgo en un cambio al plan.</li>
</ol>

<h2>Recursos, comunidades y eventos para seguir aprendiendo</h2>

<p>Para conversar con otras personas que trabajan con AWS, puedes conocer el <a href="https://www.awsugecuador.com/" rel="noopener noreferrer" target="_blank">AWS User Group Ecuador</a>, que organiza meetups y talleres en varias ciudades y en línea.</p>

<p>Si estás en otro país, explora el <a href="/comunidades/">directorio de comunidades AWS de Latinoamérica</a> para encontrar grupos locales. Consulta la <a href="/eventos/">agenda de eventos AWS</a> para revisar fechas, modalidades y enlaces de inscripción vigentes; así puedes encontrar próximos encuentros sin depender de una fecha publicada en este artículo.</p>
