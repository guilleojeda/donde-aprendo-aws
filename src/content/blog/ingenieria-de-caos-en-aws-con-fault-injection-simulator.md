---
title: "AWS Fault Injection Service: guía práctica para probar resiliencia"
description: "Aprende a preparar un experimento de AWS FIS en EC2: permisos mínimos, un objetivo de prueba, alarma de parada, recuperación y costos."
author: "guille-ojeda"
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T01:48:43.97Z"
modifiedTimestamp: "2026-10-06T17:33:52-03:00"
review:
  date: "2026-10-06"
cover: "/assets/blog/editorial-practica.png"
coverAlt: "Un cuaderno abierto con una secuencia de estaciones y un camino azul con punto naranja."
ogImage: "/assets/blog/editorial-practica.png"
related:
  - title: "Mejores prácticas de observabilidad en AWS"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/"
  - title: "Recuperación ante desastres en AWS: RTO, RPO y estrategias"
    url: "https://dondeaprendoaws.com/blog/estrategias-de-recuperacion-de-desastres-en-aws/"

---

<p>AWS Fault Injection Service (AWS FIS), antes llamado AWS Fault Injection Simulator, permite probar cómo responde una carga de trabajo cuando falla un componente. Para una primera práctica, puedes detener una única instancia EC2 de prueba y pedirle a FIS que intente iniciarla de nuevo después de dos minutos. La acción ocurre sobre un recurso real: limita el objetivo, prepara una alarma de CloudWatch y verifica la recuperación antes de ejecutar.</p>

<p>Esta guía explica qué configurar, qué observar y qué revisar si el experimento se detiene o no logra recuperar la instancia. No necesitas una pantalla general de “activar FIS”: el flujo documentado empieza con los permisos de IAM y una plantilla de experimento.</p>

<h2>Qué hace AWS FIS y qué no garantiza</h2>

<p>AWS FIS ejecuta acciones de inyección de fallos sobre recursos de AWS. Una plantilla define las acciones, los objetivos, las condiciones de parada y el rol que FIS asume para realizar el experimento. Puedes trabajar desde la consola, la CLI, CloudFormation, los SDK o la API HTTPS. El <a href="https://docs.aws.amazon.com/fis/latest/userguide/what-is.html" rel="noopener noreferrer" target="_blank">manual oficial de AWS FIS</a> describe el servicio y sus límites.</p>

<p>Para ver una charla de comunidad sobre observabilidad e ingeniería del caos, consulta la grabación <a href="https://www.youtube.com/watch?v=CL7jJfyg6bg" rel="noopener noreferrer" target="_blank">Cloud Forge: observabilidad, ingeniería del caos y Java en AWS</a>, organizada por AWS User Group Medellín.</p>

<p>Estas acciones no son una simulación aislada del recurso: FIS realiza cambios reales, como detener instancias o introducir errores en solicitudes. Una condición de parada ayuda a limitar el experimento, pero no vuelve inocua la acción ni garantiza que la aplicación se recupere. AWS recomienda planificar la prueba y empezar en un entorno de prueba o preproducción, con métricas y alertas listas. Consulta la guía de <a href="https://docs.aws.amazon.com/fis/latest/userguide/getting-started-planning.html" rel="noopener noreferrer" target="_blank">planificación de experimentos de FIS</a>.</p>

<h2>Antes de ejecutar: delimita el recurso, la alarma y los permisos</h2>

<ul>
  <li><strong>Elige un entorno de prueba.</strong> Identifica una sola instancia EC2 reemplazable que no atienda producción ni almacene datos que necesites conservar. Para detenerla, debe estar en estado <code>running</code> y tener un dispositivo raíz respaldado por EBS: una instancia con raíz de instance store no se puede detener y volver a iniciar. Si tiene volúmenes instance store, sus datos locales se pierden al detenerla e iniciarla. Confirma también que no esté habilitada la protección contra la detención; esa protección bloquea la llamada a EC2 que FIS debe ejecutar. Consulta las guías de AWS sobre <a href="https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/Stop_Start.html" rel="noopener noreferrer" target="_blank">detener e iniciar instancias</a> y <a href="https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-stop-protection.html" rel="noopener noreferrer" target="_blank">protección contra la detención</a>.</li>
  <li><strong>Define qué esperas comprobar.</strong> Anota el comportamiento normal y las métricas que lo representan: disponibilidad, errores, latencia o tiempo hasta que la aplicación vuelve a estar lista. Formula una hipótesis con límites acordados para ese servicio; no uses porcentajes de ejemplo como objetivos universales.</li>
  <li><strong>Prepara y prueba la alarma.</strong> Usa una alarma de CloudWatch asociada al impacto que quieres limitar, por ejemplo una comprobación de salud de la aplicación. Debe estar enviando datos y en estado normal antes del experimento. Una alarma genérica o sin datos puede no detectar el problema que te importa.</li>
  <li><strong>Usa un rol de experimento separado.</strong> La guía de <a href="https://docs.aws.amazon.com/fis/latest/userguide/getting-started-iam-service-role.html" rel="noopener noreferrer" target="_blank">roles IAM para AWS FIS</a> requiere un rol que el servicio pueda asumir y recomienda conceder privilegio mínimo. Limita la relación de confianza al servicio <code>fis.amazonaws.com</code> y sigue la recomendación de restringirla con <code>aws:SourceAccount</code> y <code>aws:SourceArn</code>.</li>
</ul>

<p>Para la acción de detener y volver a iniciar una EC2, el rol de experimento necesita los permisos de EC2 correspondientes —entre ellos <code>ec2:StopInstances</code> y <code>ec2:StartInstances</code>— sobre el alcance elegido. Si el volumen EBS está cifrado, también puede necesitar <code>kms:CreateGrant</code> y autorización en la clave para permitir el inicio posterior. Revisa los permisos exactos de <a href="https://docs.aws.amazon.com/fis/latest/userguide/fis-actions-reference.html" rel="noopener noreferrer" target="_blank"><code>aws:ec2:stop-instances</code></a> antes de guardar la plantilla.</p>

<p>El rol de experimento no es el rol de la persona que usa la consola. Quien crea la plantilla debe poder pasar ese rol; quien inicia el primer experimento también puede necesitar permiso para crear el rol vinculado al servicio de FIS. AWS crea <code>AWSServiceRoleForFIS</code> para tareas como la selección de recursos y la supervisión. Revisa <a href="https://docs.aws.amazon.com/fis/latest/userguide/using-service-linked-roles.html" rel="noopener noreferrer" target="_blank">cómo usa FIS los roles vinculados al servicio</a> y evita conceder permisos de administrador por comodidad.</p>

<h2>Cuánto cuesta una ejecución</h2>

<p>Al 6 de octubre de 2026, la <a href="https://aws.amazon.com/fis/pricing/" rel="noopener noreferrer" target="_blank">página de precios de AWS FIS</a> indica una tarifa de USD 0,10 por minuto de acción en la mayoría de las regiones, más USD 0,10 por minuto de acción por cada cuenta objetivo adicional. En AWS GovCloud (US-East y US-West), la tarifa es USD 0,12 por minuto de acción, más USD 0,12 por minuto por cada cuenta objetivo adicional. FIS calcula el cargo según cuánto tiempo permanece activa cada acción y redondea ese tiempo al minuto más cercano; no depende de cuántos recursos alcance una acción.</p>

<p>La tarifa de FIS no incluye los cargos que puedan corresponder a los recursos objetivo ni a la telemetría. Revisa también los precios de <a href="https://aws.amazon.com/ec2/pricing/on-demand/" rel="noopener noreferrer" target="_blank">Amazon EC2</a> y <a href="https://aws.amazon.com/cloudwatch/pricing/" rel="noopener noreferrer" target="_blank">Amazon CloudWatch</a>. No des por hecho que una prueba es gratuita: el costo depende de la región, las acciones, su duración y los servicios usados para medir el resultado.</p>

<h2>Práctica: detener y volver a iniciar una sola EC2 de prueba</h2>

<p>El objetivo de este ejercicio es observar la interrupción y comprobar que la instancia y la aplicación regresan a un estado saludable. No prueba por sí solo la alta disponibilidad de una arquitectura. Si detener esa instancia afectaría a usuarios o datos que no puedes perder, no la uses como objetivo.</p>

<ol>
  <li><strong>Escribe la hipótesis.</strong> Por ejemplo: “Al detener la instancia de prueba, la alarma detectará el impacto y la aplicación volverá a responder dentro del tiempo objetivo de recuperación (RTO) definido para este entorno”. El RTO y el umbral de la alarma deben corresponder a tu propio servicio; AWS no les asigna un valor universal.</li>
  <li><strong>Crea una plantilla en la región de la instancia.</strong> En la consola de AWS FIS, crea una plantilla con una acción y un objetivo. Para el objetivo, selecciona el tipo <code>aws:ec2:instance</code>, el ID de esa única instancia y el modo de selección <code>ALL</code>. Evita filtros amplios que puedan resolver más recursos de los previstos; consulta cómo se definen los <a href="https://docs.aws.amazon.com/fis/latest/userguide/targets.html" rel="noopener noreferrer" target="_blank">objetivos de AWS FIS</a>.</li>
  <li><strong>Configura la acción.</strong> Elige <code>aws:ec2:stop-instances</code> y establece <code>startInstancesAfterDuration</code> en <code>PT2M</code>. Ese valor solicita a FIS iniciar la instancia después de dos minutos; el parámetro admite de uno a 720 minutos. Confirma los requisitos adicionales de cifrado y permisos en la referencia de la acción.</li>
  <li><strong>Agrega la condición de parada.</strong> Selecciona la alarma de CloudWatch que representa el límite de impacto acordado. Si esa alarma pasa a estado de alarma durante el experimento, FIS detiene la ejecución. No uses una condición “ninguna” para este primer ensayo.</li>
  <li><strong>Revisa el objetivo antes de inyectar el fallo.</strong> Genera una vista previa de objetivos con el modo <code>skip-all</code> y comprueba que aparezca exactamente el ID previsto. La vista previa omite las acciones; no verifica que FIS tenga permiso para ejecutarlas.</li>
  <li><strong>Inicia y observa.</strong> Arranca el experimento desde la consola solo cuando el equipo responsable esté listo para intervenir. Sigue el estado de la acción y del experimento en FIS; observa la alarma, la comprobación de salud y los errores o la latencia de la aplicación.</li>
</ol>

<p>Si quieres ampliar la parte de arquitectura, la charla <a href="https://www.youtube.com/watch?v=sEr65Cgskkc" rel="noopener noreferrer" target="_blank">Diseñando arquitecturas resilientes en AWS</a>, del AWS User Group Ecuador, ofrece otro punto de partida para pensar qué comportamiento poner a prueba.</p>

<p>La vista previa y la plantilla se describen en la documentación de <a href="https://docs.aws.amazon.com/fis/latest/userguide/experiment-options.html" rel="noopener noreferrer" target="_blank">opciones de experimentos de AWS FIS</a>. La guía de <a href="https://docs.aws.amazon.com/fis/latest/userguide/experiment-templates.html" rel="noopener noreferrer" target="_blank">componentes de una plantilla</a> explica cómo se relacionan acciones, objetivos, alarmas y roles.</p>

<h2>Qué observar, cómo detener y cómo confirmar la recuperación</h2>

<p>Compara el periodo anterior, el experimento y la recuperación. Registra el estado de la instancia, los cambios en la alarma, la disponibilidad o errores de la aplicación y el tiempo hasta que vuelve a responder. La guía interna de <a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">Mejores prácticas de observabilidad en AWS</a> amplía cómo combinar métricas, logs y trazas.</p>

<p>Si la condición de CloudWatch se activa, FIS detiene el experimento. También puedes detenerlo manualmente desde la consola. Un experimento detenido no se puede reanudar. Al detenerlo, FIS completa las acciones posteriores pendientes que la acción tenga configuradas; en este caso, <code>startInstancesAfterDuration</code> permite solicitar el inicio de la instancia. Espera a que termine la acción y confirma en EC2 que la instancia está en estado <code>running</code>; después verifica la salud de la aplicación. Si falla el inicio o la aplicación no se recupera, sigue el procedimiento operativo de tu equipo. La condición de parada no es una reparación general ni revierte efectos de acciones que no admiten recuperación.</p>

<p>Para pensar más allá de esta instancia, lee <a href="https://builder.aws.com/content/3K45qVEJzMtJBbA8PHnaFLZAgxz/pruebas-de-resiliencia-recomendadas-en-aws-resilience-hub-un-runbook-que-nunca-se-ejecut-es-una-hipotesis" rel="noopener noreferrer" target="_blank">Pruebas de resiliencia recomendadas en AWS Resilience Hub: un runbook que nunca se ejecutó es una hipótesis</a>, un artículo de AWS Builder Center sobre validar runbooks con pruebas.</p>

<p>Al terminar, guarda el resultado frente a la hipótesis, elimina la plantilla si ya no la necesitas y limpia solo los recursos o roles que hayas creado exclusivamente para esta práctica. No termines una instancia existente como “limpieza”. FIS elimina automáticamente los experimentos completados, detenidos o fallidos después de 120 días; consulta los detalles y conserva la evidencia que tu equipo necesite antes de ese plazo.</p>

<p>Para diseñar pruebas de recuperación más amplias, repasa <a href="https://dondeaprendoaws.com/blog/estrategias-de-recuperacion-de-desastres-en-aws/">Recuperación ante desastres en AWS: RTO, RPO y estrategias</a>. Un experimento FIS y una prueba de recuperación ante desastres pueden compartir métricas, pero cubren fallas y procedimientos de alcance distinto.</p>

<h2>Problemas frecuentes al crear o iniciar un experimento</h2>

<ul>
  <li><strong>Acceso denegado al crear la plantilla:</strong> revisa los permisos del operador para crear plantillas y pasar el rol elegido, además de la relación de confianza del rol de experimento.</li>
  <li><strong>El experimento no encuentra la instancia:</strong> comprueba que seleccionaste el ID correcto en la región correcta y que el recurso cumple los filtros y el estado requeridos. La vista previa ayuda a detectar un alcance equivocado.</li>
  <li><strong>FIS no puede detener o iniciar la instancia:</strong> revisa los permisos del rol de experimento para la acción y, si el volumen usa cifrado, el acceso a la clave de KMS. Confirma que la instancia esté en estado <code>running</code>, use raíz EBS y no tenga protección contra la detención habilitada. Si la protección está activa, coordina con quien administra el recurso antes de cambiarla.</li>
  <li><strong>La alarma detiene el experimento enseguida:</strong> confirma que estuviera normal antes de iniciar y que su métrica represente el umbral que quieres usar como límite, no una señal que siempre esté en alarma o sin datos.</li>
  <li><strong>La EC2 inicia, pero la aplicación sigue fallando:</strong> iniciar la instancia no restaura automáticamente dependencias ni valida el proceso de la aplicación. Comprueba la salud funcional y aplica el runbook correspondiente.</li>
</ul>

<h2>Comunidades y eventos para seguir aprendiendo</h2>

<p>Comparte una descripción sin datos sensibles del experimento y sus resultados con otras personas que aprenden u operan AWS:</p>

<ul>
  <li><a href="https://www.meetup.com/awsugmed/" rel="noopener noreferrer" target="_blank">AWS User Group Medellín</a> publica su agenda y ofrece un espacio para conectar con la comunidad; allí también se organizó la charla de Cloud Forge enlazada arriba.</li>
  <li><a href="https://www.awsugecuador.com/" rel="noopener noreferrer" target="_blank">AWS User Group Ecuador</a> anuncia meetups, talleres y encuentros en ciudades del país y en línea.</li>
  <li><a href="https://www.meetup.com/aws-girls-argentina/" rel="noopener noreferrer" target="_blank">AWS Girls Argentina</a> conecta a mujeres interesadas en aprender y compartir sobre AWS y cloud; su página enlaza eventos y su comunidad de WhatsApp.</li>
  <li><a href="https://awswomencolombia.com/" rel="noopener noreferrer" target="_blank">AWS Women Colombia</a> publica artículos y anuncia eventos con contenido técnico en español. Puedes consultar también su <a href="https://www.meetup.com/aws-women-colombia-user-group/" rel="noopener noreferrer" target="_blank">grupo en Meetup</a> para ver actividades.</li>
  <li><a href="https://repost.aws/" rel="noopener noreferrer" target="_blank">AWS re:Post</a> es un sitio público de preguntas y respuestas donde se puede pedir orientación técnica y compartir aprendizajes. Para preguntar o responder debes iniciar sesión con credenciales de AWS, completar el perfil y verificar el correo. Su <a href="https://repost.aws/faq" rel="noopener noreferrer" target="_blank">FAQ enumera inglés, chino tradicional y simplificado, japonés, francés y coreano como idiomas admitidos</a>; no incluye español. No publiques IDs de cuenta, datos personales ni información privada de una carga de trabajo.</li>
</ul>

<p>Si buscas otra comunidad o una próxima actividad, revisa el <a href="/comunidades/">directorio de comunidades AWS en Latinoamérica</a> y la <a href="/eventos/">agenda de eventos</a>. Las fechas, modalidades, idiomas, requisitos de inscripción y costos —si los hay— dependen de cada grupo y evento; confirma esos datos en la página de destino.</p>
