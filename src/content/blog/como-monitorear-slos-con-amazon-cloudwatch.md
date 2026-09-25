---
title: "Cómo monitorear SLOs con Amazon CloudWatch"
description: "Aprende a monitorear objetivos de nivel de servicio (SLOs) con Amazon CloudWatch, optimizando la disponibilidad y rendimiento de tus aplicaciones."
publishedAt: "2025-02-24"
publishedTimestamp: "2025-02-24T06:43:53.013Z"
cover: "/assets/blog/0919cf4ddfe7647a0c71877c.jpg"
coverAlt: "Thumbnail for: Cómo monitorear SLOs con Amazon CloudWatch"
ogImage: "/assets/blog/0919cf4ddfe7647a0c71877c.jpg"
related:
  - title: "Webinars y Eventos en AWS Marketplace"
    url: "https://dondeaprendoaws.com/blog/webinars-y-eventos-en-aws-marketplace/"
    image: "/assets/blog/8f2a908f4bdb73449da17e82.jpg"
    imageAlt: ""
  - title: "Ahorro de Costos en AWS con Instancias Reservadas y Savings Plans"
    url: "https://dondeaprendoaws.com/blog/ahorro-de-costos-en-aws-con-instancias-reservadas-y-savings-plans/"
    image: "/assets/blog/201da9e2ec2ae649f47566a7.jpg"
    imageAlt: ""
  - title: "Cómo Prepararte Para un Examen de Certificación de AWS"
    url: "https://dondeaprendoaws.com/blog/aws-curso-certificado-preparacion-para-el-examen/"
    image: "/assets/blog/4cb1b939d8aa6ff5e1dc2ac1.jpg"
    imageAlt: ""
---

<p><strong>¿Por qué usar CloudWatch para SLOs?</strong><br/>
<a href="https://aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">Amazon CloudWatch</a> es una herramienta que te ayuda a supervisar objetivos de nivel de servicio (SLOs) para garantizar el rendimiento de tus aplicaciones. Con CloudWatch, puedes:</p>


<ul>
<li><strong>Configurar Dashboards Personalizados:</strong> Visualiza <a href="https://dondeaprendoaws.com/blog/10-metricas-clave-de-devops-en-aws/">métricas clave</a> como disponibilidad, latencia y consumo de error budget.</li>
<li><strong>Recibir Alertas Automáticas:</strong> Configura alarmas para detectar rápidamente desviaciones en tus objetivos.</li>
<li><strong>Analizar Rendimiento:</strong> Usa herramientas avanzadas como Logs Insights y <a href="https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html" rel="noopener noreferrer" target="_blank">AWS X-Ray</a> para identificar problemas de latencia o errores.</li>
<li><strong>Centralizar Datos Multi-Cuenta:</strong> Monitorea métricas desde varias cuentas AWS sin costo adicional.</li>
</ul>


<p><strong>Pasos clave para empezar:</strong></p>


<ol>
<li><strong>Crea un Dashboard:</strong> Diseña un panel con widgets como gráficos de líneas para tendencias o medidores para error budgets.</li>
<li><strong>Configura Métricas:</strong> Define indicadores como latencia y disponibilidad usando estadísticas específicas.</li>
<li><strong>Configura Alarmas:</strong> Combina ventanas de monitoreo corto y largo plazo para detectar problemas.</li>
<li><strong>Usa Herramientas Avanzadas:</strong> Aprovecha Logs Insights para búsquedas detalladas y AWS X-Ray para trazabilidad.</li>
</ol>


<figure class="table"><table>
<thead>
<tr>
<th>Función</th>
<th>Beneficio</th>
</tr>
</thead>
<tbody>
<tr>
<td>Dashboards Personalizados</td>
<td>Visualización clara de métricas clave</td>
</tr>
<tr>
<td>Alarmas Compuestas</td>
<td>Alertas más precisas y menos falsos positivos</td>
</tr>
<tr>
<td>Monitoreo Multi-Cuenta</td>
<td>Centralización de datos sin costo adicional</td>
</tr>
<tr>
<td>Análisis con Logs Insights</td>
<td>Consultas interactivas en registros</td>
</tr>
</tbody>
</table></figure>


<p><strong>Conclusión:</strong> CloudWatch simplifica el monitoreo de SLOs al automatizar métricas, alertas y análisis, ayudándote a mantener la confiabilidad de tus servicios.</p>


<h2 class="sb h2-sbb-cls" id="configuracion-de-cloudwatch-para-el-monitoreo-de-slos" tabindex="-1">Configuración de CloudWatch para el Monitoreo de SLOs</h2>


<p>Aquí te mostramos cómo configurar CloudWatch para supervisar tus SLOs de manera eficiente.</p>


<h3 id="creacion-de-tu-primer-dashboard" tabindex="-1">Creación de tu Primer Dashboard</h3>


<p>Diseña un dashboard personalizado para seguir de cerca las métricas clave de tus SLOs.</p>


<ul>
<li>
<strong>Acceso y configuración inicial</strong>: Entra a CloudWatch, selecciona "Dashboards" y haz clic en "Create dashboard". Dale un nombre que represente claramente el monitoreo de tus SLOs.
</li>
<li>
<strong>Elección de widgets</strong>: Los widgets son los bloques que usarás para visualizar tus métricas. Aquí tienes algunas opciones según lo que necesites:
<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Widget</th>
<th>Uso Recomendado</th>
<th>Visualización</th>
</tr>
</thead>
<tbody>
<tr>
<td>Línea</td>
<td>Tendencias de latencia</td>
<td>Evolución temporal</td>
</tr>
<tr>
<td>Número</td>
<td>Disponibilidad actual</td>
<td>Valor único</td>
</tr>
<tr>
<td>Medidor</td>
<td>Consumo de error budget</td>
<td>Porcentaje visual</td>
</tr>
<tr>
<td>Texto</td>
<td>Documentación de SLOs</td>
<td>Formato Markdown</td>
</tr>
</tbody>
</table></figure>
</li>
<li>
<strong>Organización del dashboard</strong>: Agrupa los widgets de manera lógica. Por ejemplo, coloca los indicadores de disponibilidad junto a las alertas de burn rate para facilitar el monitoreo.
</li>
</ul>


<h3 id="configuracion-de-metricas" tabindex="-1">Configuración de Métricas</h3>


<p>Una vez creado el dashboard, necesitas configurar las métricas que alimentarán tus SLOs. Application Signals recopila automáticamente datos sobre latencia y disponibilidad .</p>


<p>Para métricas de latencia en SLOs basados en solicitudes, usa estadísticas de <em>Trimmed count</em> (TC). Si tu umbral es de 9 ms con un operador "menor que" (&lt;), el umbral TC se calcula como (:threshold - 1) .</p>


<h3 id="configuracion-de-alertas" tabindex="-1">Configuración de Alertas</h3>


<p>Después de definir las métricas, configura alertas para supervisar el consumo del error budget.</p>


<p>Por ejemplo, si deseas recibir una alerta cuando se consuma el 2% del error budget en 60 minutos, el cálculo del umbral de burn rate sería: 2% * 40,320 (28 días) / 60 = 13.44 .</p>


<p>Usa alarmas compuestas para combinar ventanas cortas (para detectar picos) y ventanas largas (para degradaciones). Además, configura <a href="https://aws.amazon.com/sns/" rel="noopener noreferrer" target="_blank">Amazon SNS</a> para recibir notificaciones rápidas .</p>


<h2 class="sb h2-sbb-cls" id="funciones-avanzadas-para-monitorear-slos" tabindex="-1">Funciones Avanzadas para Monitorear SLOs</h2>


<p>CloudWatch ofrece herramientas potentes para gestionar y monitorear SLOs en entornos complejos de AWS.</p>


<h3 id="monitoreo-multi-cuenta" tabindex="-1">Monitoreo Multi-Cuenta</h3>


<p>CloudWatch facilita la centralización de datos de observabilidad a través de múltiples cuentas AWS. Este sistema se organiza en dos tipos de cuentas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Cuenta</th>
<th>Función</th>
<th>Capacidad</th>
</tr>
</thead>
<tbody>
<tr>
<td>Cuenta de Monitoreo</td>
<td>Centro de observabilidad</td>
<td>Hasta 100,000 cuentas fuente</td>
</tr>
<tr>
<td>Cuenta Fuente</td>
<td>Genera datos de observación</td>
<td>Comparte con hasta 5 cuentas de monitoreo</td>
</tr>
</tbody>
</table></figure>


<p><strong>Pasos para configurarlo:</strong></p>


<ul>
<li>Configura una Cuenta de Monitoreo para centralizar los datos.</li>
<li>Vincula las Cuentas Fuente desde la consola o utilizando AWS CLI.</li>
</ul>


<p>Un punto clave: el monitoreo multi-cuenta en CloudWatch no tiene costo adicional para logs y métricas, y la primera copia de trazas es gratuita . Esto se complementa con herramientas avanzadas que proporcionan una visión completa del rendimiento.</p>


<h3 id="herramientas-de-analisis-detallado" tabindex="-1">Herramientas de Análisis Detallado</h3>


<p>CloudWatch incluye funciones específicas para analizar el rendimiento de los SLOs.</p>


<p><strong>CloudWatch Logs Insights</strong></p>


<p>Permite realizar búsquedas interactivas en los logs usando lenguajes como Logs Insights QL, OpenSearch Service PPL y SQL.</p>


<p><strong>Consejos para aprovechar al máximo esta herramienta:</strong></p>


<ul>
<li>Estandariza los formatos de logs para facilitar el descubrimiento automático.</li>
<li>Crea índices en campos clave.</li>
<li>Guarda las consultas que uses con frecuencia.</li>
</ul>


<p><strong>AWS X-Ray para Trazabilidad</strong></p>


<p>AWS X-Ray recopila y visualiza datos de solicitudes, ayudando a identificar problemas como cuellos de botella y latencia elevada .</p>


<p><strong>Ventajas principales:</strong></p>


<ul>
<li>Identificación de problemas de rendimiento.</li>
<li>Visualización de interacciones entre servicios.</li>
<li>Análisis detallado de latencia.</li>
</ul>


<p><strong>Para reducir costos:</strong></p>


<ul>
<li>Configura la expiración de logs.</li>
<li>Limita los rangos de tiempo en las consultas.</li>
<li>Filtra niveles de log que no sean críticos.</li>
</ul>


<p>Estas herramientas ofrecen un enfoque práctico y detallado para garantizar que tus SLOs se cumplan de manera eficiente.</p>




<h2 class="sb h2-sbb-cls" id="mejores-practicas-para-monitorear-slos" tabindex="-1">Mejores Prácticas para Monitorear SLOs</h2>


<p>Monitorear SLOs de manera efectiva requiere un enfoque estratégico y un mantenimiento constante. Aquí te mostramos cómo sacar el máximo provecho de tu <a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">configuración en CloudWatch</a>.</p>


<h3 id="mantenimiento-de-metricas-y-alarmas" tabindex="-1">Mantenimiento de Métricas y Alarmas</h3>


<p>CloudWatch almacena el historial de alarmas durante 30 días, lo que facilita el análisis del rendimiento. Para mejorar la precisión de tus métricas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Configuración Recomendada</th>
<th>Ventaja</th>
</tr>
</thead>
<tbody>
<tr>
<td>Datos Faltantes</td>
<td><code class="inline-code">notBreaching</code> para métricas continuas</td>
<td>Reduce falsos positivos</td>
</tr>
<tr>
<td>Detección de Anomalías</td>
<td>Activada con umbral dinámico</td>
<td>Ajusta automáticamente según patrones</td>
</tr>
<tr>
<td>Revisión de Umbrales</td>
<td>Mensual</td>
<td>Garantiza alertas más precisas</td>
</tr>
</tbody>
</table></figure>


<p>Es crucial manejar los datos faltantes según el tipo de métrica. Por ejemplo, para métricas de disponibilidad, usar la opción <code class="inline-code">missing</code> cambiará el estado de la alarma a <code class="inline-code">INSUFFICIENT_DATA</code> si no hay datos disponibles.</p>


<h3 id="integracion-con-servicios-aws" tabindex="-1">Integración con Servicios AWS</h3>


<p>Después de ajustar métricas y alarmas, puedes ampliar tu monitoreo integrándolo con otros servicios de AWS. Por ejemplo, Lambda envía automáticamente logs al grupo <code class="inline-code">/aws/lambda/&lt;function name&gt;</code> en CloudWatch, facilitando el seguimiento.</p>


<p>Un caso práctico: en diciembre de 2024, <a href="https://www.mamezou.com/" rel="noopener noreferrer" target="_blank">Mamezou Tech</a> implementó CloudWatch Application Signals para monitorear una función Lambda, definiendo un SLO del 95%, lo que mejoró la precisión del monitoreo .</p>


<p>Además, Amazon SNS recopila métricas automáticamente cada minuto, lo que permite monitorear mensajes publicados, notificaciones entregadas y errores .</p>


<h3 id="gestion-de-alertas" tabindex="-1">Gestión de Alertas</h3>


<p>Una vez configuradas las métricas y alarmas, gestionar las notificaciones es clave para responder rápidamente. CloudWatch ofrece herramientas útiles para este propósito:</p>


<ul>
<li><strong>Alarmas Compuestas</strong>: Combinan métricas de consumo a corto y largo plazo, mejorando la precisión de las alertas .</li>
<li><strong>Detección de Anomalías</strong>: Utiliza inteligencia artificial para ajustar umbrales dinámicamente y minimizar falsos positivos .</li>
</ul>


<p>Configura ventanas de supresión durante mantenimientos y aplica filtros para priorizar notificaciones críticas. Esto permite que tu equipo se enfoque en los problemas más urgentes y relevantes.</p>


<h2 class="sb h2-sbb-cls" id="recursos-de-aprendizaje" tabindex="-1">Recursos de Aprendizaje</h2>


<p>Amplía tus conocimientos sobre SLOs con CloudWatch utilizando estas fuentes especializadas. Estos recursos te ayudarán a configurar y trabajar con SLOs de manera efectiva.</p>


<h3 id="donde-aprendo-aws" tabindex="-1">Dónde Aprendo AWS</h3>


<p>El blog <strong>Dónde Aprendo AWS</strong> ofrece contenido en español para desarrolladores y arquitectos interesados en AWS. Entre sus artículos sobre CloudWatch, destacan:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Nivel</th>
<th>Contenido</th>
<th>Detalles</th>
</tr>
</thead>
<tbody>
<tr>
<td>Principiante</td>
<td><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">Conceptos básicos de CloudWatch</a></td>
<td>Explicaciones claras y en español</td>
</tr>
<tr>
<td>Intermedio</td>
<td>Configuración de métricas y alarmas</td>
<td>Ejemplos prácticos con fragmentos de código</td>
</tr>
<tr>
<td>Avanzado</td>
<td>Implementación de SLOs</td>
<td>Casos reales y aplicaciones prácticas</td>
</tr>
</tbody>
</table></figure>


<p>Esta plataforma organiza los conceptos técnicos de manera progresiva, lo que facilita el aprendizaje en español.</p>


<p>Además, AWS ofrece recursos oficiales que complementan esta información para quienes deseen profundizar aún más.</p>


<h3 id="recursos-oficiales-de-aws" tabindex="-1">Recursos Oficiales de AWS</h3>


<p><strong><a href="https://skillbuilder.aws/" rel="noopener noreferrer" target="_blank">AWS Skill Builder</a></strong> es otra excelente opción, con planes gratuitos y de pago (por ejemplo, $29 mensuales o $449 anuales) .</p>


<blockquote>
<p>"AWS Skill Builder incluye laboratorios prácticos, preparación para exámenes y AWS Digital Classroom, disponible con suscripciones anuales" .</p>
</blockquote>


<p>Entre los <a href="https://dondeaprendoaws.com/blog/aprender-aws-gratis-recursos-y-comunidad/">recursos oficiales de AWS</a>, puedes encontrar:</p>


<ul>
<li>Guías detalladas para configurar SLOs</li>
<li>Referencias de API</li>
<li>Tutoriales paso a paso</li>
<li>Ejemplos de código y SDK</li>
</ul>


<p>AWS sugiere comenzar con el nivel gratuito de Skill Builder para familiarizarse con los conceptos básicos antes de explorar funciones más avanzadas.</p>


<h2 class="sb h2-sbb-cls" id="conclusion" tabindex="-1">Conclusión</h2>


<p>Después de analizar las capacidades de CloudWatch, aquí tienes un resumen de los puntos clave para implementar SLOs y mantener la confiabilidad de tus aplicaciones.</p>


<h3 id="revision-de-puntos-principales" tabindex="-1">Revisión de Puntos Principales</h3>


<p>CloudWatch Application Signals ha cambiado las reglas del juego en el monitoreo de SLOs al ofrecer herramientas completas. Algunos aspectos destacados incluyen:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Beneficio</th>
</tr>
</thead>
<tbody>
<tr>
<td>Resumen de Instrumentación</td>
<td>Recolección automática de métricas clave </td>
</tr>
<tr>
<td>Alertas</td>
<td>Sistema flexible de alarmas para umbrales críticos </td>
</tr>
<tr>
<td>Análisis</td>
<td>Consultas avanzadas mediante CloudWatch Metrics Insights </td>
</tr>
</tbody>
</table></figure>


<p>Con esto en mente, puedes usar estos elementos como base para construir un sistema de monitoreo eficaz.</p>


<h3 id="guia-de-implementacion" tabindex="-1">Guía de Implementación</h3>


<p>Aquí tienes algunos pasos esenciales para implementar SLOs de manera efectiva:</p>


<ol>
<li><strong>Definición de Objetivos</strong></li>
</ol>


<p>Por ejemplo, una empresa de fitness logró mantener un 99% de disponibilidad monitoreando métricas ALB cada minuto. Esto les permitió alcanzar un 95% de solicitudes exitosas en intervalos móviles de 28 días .</p>


<ol start="2">
<li><strong>Configuración de Alarmas</strong></li>
</ol>


<p>Crea alarmas que combinen ventanas largas (para identificar tendencias) y cortas (para detección rápida). Esto te ayudará a gestionar el consumo del error budget .</p>


<blockquote>
<p>"everything fails, all the time" - Werner Vogels, CTO de Amazon </p>
</blockquote>


<p>Esta cita resalta la importancia de un monitoreo constante y proactivo. Combina automatización con supervisión manual para optimizar tus SLOs, aprovechando las capacidades de CloudWatch Application Signals para obtener datos útiles .</p>


<p>Si quieres profundizar más, revisa los recursos mencionados anteriormente para mejorar tu implementación y conocimiento.</p>


<h2>Publicaciones de blog relacionadas</h2>
<ul><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">Mejores Prácticas de Observabilidad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/acuerdos-de-nivel-de-servicio-aws-guia-basica/">Acuerdos de Nivel de Servicio AWS: Guía Básica</a></li><li><a href="https://dondeaprendoaws.com/blog/slas-en-aws-conceptos-legales-clave/">SLAs en AWS: Conceptos Legales Clave</a></li><li><a href="https://dondeaprendoaws.com/blog/diferencias-entre-sla-y-slo-en-aws/">Diferencias Entre SLA y SLO en AWS</a></li></ul>
