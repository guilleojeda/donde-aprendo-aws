---
title: "Monitoreo de contenedores con CloudWatch Logs"
description: "Aprende a monitorizar contenedores con CloudWatch Logs, centralizando registros y mejorando la seguridad en entornos contenerizados."
publishedAt: "2025-06-02"
publishedTimestamp: "2025-06-02T08:56:16.722000+00:00"
cover: "/assets/blog/2b59cebb297e58db709a33a5.jpg"
coverAlt: "Thumbnail for: Monitoreo de contenedores con CloudWatch Logs"
ogImage: "/assets/blog/2b59cebb297e58db709a33a5.jpg"
indexOrder: 5
related:
  - title: "10 Prácticas Recomendadas para Integrar EUC en AWS"
    url: "https://dondeaprendoaws.com/blog/10-practicas-recomendadas-para-integrar-euc-en-aws/"
    image: "/assets/blog/278a42e279f664f5331f81e7.png"
    imageAlt: "Thumbnail for: 10 Prácticas Recomendadas para Integrar EUC en AWS"
  - title: "¿Cómo Escala DynamoDB? Modos On Demand y Provisioned"
    url: "https://dondeaprendoaws.com/blog/como-escala-dynamodb-modos-on-demand-y-provisioned/"
    image: "/assets/blog/ce62e0cc8508d5055bba53b4.png"
    imageAlt: "Thumbnail for: ¿Cómo Escala DynamoDB? Modos On Demand y Provisioned"
  - title: "AWS curso certificado: preguntas frecuentes"
    url: "https://dondeaprendoaws.com/blog/aws-curso-certificado-preguntas-frecuentes/"
    image: "/assets/blog/39294214939c4754eb0b11e2.png"
    imageAlt: "Thumbnail for: AWS curso certificado: preguntas frecuentes"
---

<p><strong><a href="https://aws.amazon.com/cloudwatch/" rel="nofollow noopener noreferrer" target="_blank">Amazon CloudWatch</a> Logs</strong> es una herramienta clave para monitorizar contenedores. Permite centralizar registros, analizar métricas en tiempo real y responder rápidamente a problemas. Aquí tienes un resumen rápido de lo que ofrece:</p>
<ul>
<li>
<strong>Retos del monitoreo de contenedores</strong>:
<ul>
<li>Ciclos de vida cortos y entornos dinámicos.</li>
<li><a href="https://dondeaprendoaws.com/blog/recursos-compartidos-en-arquitecturas-serverless-multi-tenant/">Uso compartido de recursos</a> que puede generar conflictos.</li>
<li>Necesidad de herramientas específicas para <a href="https://dondeaprendoaws.com/blog/arquitectura-en-la-nube-tendencias-emergentes/">arquitecturas de microservicios</a>.</li>
</ul>
</li>
<li>
<strong>Funciones principales de CloudWatch Logs</strong>:
<ul>
<li>Centralización de registros en grupos y flujos.</li>
<li>Métricas en tiempo real (actualización cada segundo).</li>
<li><strong>Container Insights</strong>: Métricas clave como CPU, memoria y red.</li>
<li>Consultas avanzadas con <strong>Logs Insights</strong>.</li>
<li>Conservación de datos hasta 15 meses.</li>
</ul>
</li>
<li>
<strong>Configuración básica</strong>:
<ul>
<li>Crear grupos de logs y definir permisos IAM.</li>
<li>Habilitar el registro en tareas ECS/EKS con el driver <code class="inline-code">awslogs</code>.</li>
<li>Opciones de <a href="https://dondeaprendoaws.com/blog/cifrado-de-datos-con-aws-kms-guia-practica/">cifrado con claves KMS</a> para mayor seguridad.</li>
</ul>
</li>
<li>
<strong>Seguridad y cumplimiento</strong>:
<ul>
<li>Análisis de logs para detectar amenazas.</li>
<li>Configuración de alertas y retención de datos según normativas.</li>
<li>Integración con servicios como <a href="https://aws.amazon.com/security-hub/" rel="nofollow noopener noreferrer" target="_blank">AWS Security Hub</a> y GuardDuty.</li>
</ul>
</li>
</ul>
<p>CloudWatch Logs no solo facilita el monitoreo, sino que también mejora la seguridad y optimiza el uso de recursos en entornos contenerizados. Es una solución imprescindible para arquitecturas modernas en la nube.</p>
<h2 class="sb h2-sbb-cls" id="configuracion-de-cloudwatch-logs-para-contenedores" tabindex="-1">Configuración de CloudWatch Logs para contenedores</h2>
<p>Configurar CloudWatch Logs para contenedores implica varios pasos clave: crear grupos de logs, establecer permisos IAM y habilitar el registro en las definiciones de tareas. Este enfoque asegura que los registros de las aplicaciones basadas en contenedores se recopilen de forma centralizada y eficiente.</p>
<h3 id="creacion-de-grupos-y-flujos-de-logs" tabindex="-1">Creación de grupos y flujos de logs</h3>
<p>Los <strong>grupos de logs</strong> son estructuras organizativas que agrupan flujos de logs con configuraciones comunes, como políticas de retención o controles de acceso. Por otro lado, cada <strong>flujo de logs</strong> representa una secuencia de eventos provenientes de una misma fuente, como un contenedor o una aplicación específica.</p>
<p>Para crear un grupo de logs manualmente, sigue estos pasos en la consola de CloudWatch:</p>
<ul>
<li>Ve a la sección <strong>Grupos de logs</strong>.</li>
<li>Haz clic en <strong>Acciones</strong> y selecciona <strong>Crear grupo de logs</strong>.</li>
<li>Asigna un nombre descriptivo que cumpla con las reglas de CloudWatch Logs. Recuerda que los nombres no pueden comenzar con <code class="inline-code">aws/</code>, ya que este prefijo está reservado para servicios de AWS.</li>
</ul>
<p>CloudWatch Logs no limita el número de flujos por grupo, lo que permite gestionar arquitecturas complejas con flexibilidad. Además, algunos servicios crean grupos de logs automáticamente. Por ejemplo:</p>
<ul>
<li><strong>Container Insights</strong> genera un grupo de logs para eventos de rendimiento sin necesidad de intervención manual.</li>
<li><strong><a href="https://aws.amazon.com/lambda/" rel="nofollow noopener noreferrer" target="_blank">AWS Lambda</a></strong> crea un grupo de logs con el formato <code class="inline-code">/aws/lambda/&lt;nombre-función&gt;</code> al ejecutarse por primera vez.</li>
</ul>
<h3 id="configuracion-de-roles-y-politicas-iam" tabindex="-1">Configuración de roles y políticas IAM</h3>
<p>Para que los contenedores puedan enviar logs a CloudWatch Logs de forma segura, es fundamental configurar roles y políticas IAM adecuadas. Esto incluye permisos específicos que habiliten la creación de grupos y flujos de logs, así como el envío de eventos. A continuación, se detallan los permisos esenciales:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Acción</th>
<th>ARN del recurso</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td><code class="inline-code">logs:CreateLogGroup</code></td>
<td><code class="inline-code">arn:aws:logs:region:account-id:log-group:*</code></td>
<td>Permite crear grupos de logs en CloudWatch Logs.</td>
</tr>
<tr>
<td><code class="inline-code">logs:CreateLogStream</code></td>
<td><code class="inline-code">arn:aws:logs:region:account-id:log-group:log-group-name:*</code></td>
<td>Permite crear flujos de logs dentro de un grupo específico.</td>
</tr>
<tr>
<td><code class="inline-code">logs:PutLogEvents</code></td>
<td><code class="inline-code">arn:aws:logs:region:account-id:log-group:log-group-name:log-stream:*</code></td>
<td>Permite enviar eventos de log a un flujo.</td>
</tr>
<tr>
<td><code class="inline-code">logs:DescribeLogStreams</code></td>
<td><code class="inline-code">arn:aws:logs:region:account-id:log-group:log-group-name:*</code></td>
<td>Permite describir flujos dentro de un grupo de logs.</td>
</tr>
</tbody>
</table></figure>
<p>Es importante aplicar el principio de <strong>menor privilegio</strong>, especificando ARNs concretos en lugar de comodines para limitar el alcance. En ECS, se recomienda usar roles IAM de tarea en lugar de depender del rol de la instancia del contenedor, ya que esto proporciona mayor granularidad en los permisos.</p>
<blockquote>
<p>"Cuando crees tu rol IAM de tarea, se recomienda que uses las claves de condición <code class="inline-code">aws:SourceAccount</code> o <code class="inline-code">aws:SourceArn</code> en la política de relación de confianza asociada con el rol para delimitar los permisos y prevenir el problema de seguridad del confused deputy." – Amazon ECS Documentation</p>
</blockquote>
<p>En EKS, el uso de IRSA (Asignación de Roles IAM para Cuentas de Servicio) permite asignar permisos específicos a pods individuales, evitando la necesidad de compartir credenciales entre contenedores, lo que mejora la seguridad.</p>
<h3 id="activacion-del-logging-en-definiciones-de-tareas-ecseks" tabindex="-1">Activación del logging en definiciones de tareas ECS/EKS</h3>
<p>El driver <code class="inline-code">awslogs</code> facilita la integración de logs de contenedores con CloudWatch Logs. En ECS, esto se configura a través del parámetro <code class="inline-code">logConfiguration</code> en las definiciones de tareas. Los parámetros esenciales para el driver <code class="inline-code">awslogs</code> incluyen:</p>
<ul>
<li><strong>awslogs-group</strong>: El grupo de logs de CloudWatch.</li>
<li><strong>awslogs-region</strong>: La región de AWS.</li>
<li><strong>awslogs-stream-prefix</strong>: Un prefijo para identificar los flujos de logs.</li>
</ul>
<p>En EKS, el logging del plano de control debe habilitarse explícitamente para enviar logs a CloudWatch Logs. Esto se puede configurar mediante la consola de AWS o la CLI, seleccionando los tipos de logs que deseas capturar. Para EKS en Fargate, <a href="https://fluentbit.io/" rel="nofollow noopener noreferrer" target="_blank">Fluent Bit</a> puede configurarse para redirigir los logs directamente a CloudWatch, ofreciendo una solución integrada para el manejo de registros.</p>
<p>Además, los roles IAM asociados con las instancias de contenedor deben incluir permisos como <code class="inline-code">logs:CreateLogStream</code> y <code class="inline-code">logs:PutLogEvents</code>. Sin estos permisos, los contenedores no podrán enviar logs, interrumpiendo el monitoreo.</p>
<p>Por último, es esencial configurar el cifrado para proteger los datos. CloudWatch Logs admite la integración con claves <a href="https://aws.amazon.com/kms/" rel="nofollow noopener noreferrer" target="_blank">AWS KMS</a> para cifrar los logs y métricas recopilados. Este cifrado debe activarse manualmente en los grupos de logs que reciben datos de Container Insights.</p>
<h2 class="sb h2-sbb-cls" id="monitoreo-de-contenedores-con-container-insights" tabindex="-1">Monitoreo de contenedores con Container Insights</h2>
<p>Container Insights proporciona un análisis detallado de métricas y rendimiento para aplicaciones contenerizadas y microservicios. Esta herramienta recopila y organiza datos sobre el uso de CPU, memoria, disco y red, ofreciendo una vista clara del estado de clústeres, servicios y pods.</p>
<p>Además de las métricas básicas, Container Insights incluye información diagnóstica como fallos de reinicio de contenedores. Desde el 2 de diciembre de 2024, AWS introdujo nuevas funciones que permiten recopilar métricas por pod, contenedor y Kube-State.</p>
<p>Las métricas de Kube-State son clave para evaluar la salud general de un clúster <a href="https://kubernetes.io/" rel="nofollow noopener noreferrer" target="_blank">Kubernetes</a>, mientras que las métricas a nivel de contenedor ayudan a identificar problemas específicos, como fugas de memoria. Con esta precisión, es posible configurar alarmas en componentes críticos o asignar recursos adicionales para prevenir problemas. A continuación, te explicamos cómo desplegar el agente CloudWatch para aprovechar estas métricas.</p>
<h3 id="despliegue-del-agente-cloudwatch" tabindex="-1">Despliegue del agente CloudWatch</h3>
<p>Para activar Container Insights y recopilar métricas, debes desplegar el agente como un DaemonSet. El proceso varía según el entorno:</p>
<ul>
<li><strong><a href="https://aws.amazon.com/eks/" rel="nofollow noopener noreferrer" target="_blank">Amazon EKS</a></strong>: Utiliza el complemento Amazon CloudWatch Observability EKS.</li>
<li><strong><a href="https://aws.amazon.com/fargate/" rel="nofollow noopener noreferrer" target="_blank">AWS Fargate</a></strong>: Implementa AWS Distro for <a href="https://opentelemetry.io/" rel="nofollow noopener noreferrer" target="_blank">OpenTelemetry</a> (ADOT).</li>
</ul>
<p>Container Insights es compatible con Amazon EKS desde la versión 1.23 y admite un inicio rápido en versiones 1.24 o superiores. Sin embargo, solo funciona con instancias Linux.</p>
<p>En EKS, el despliegue incluye varios pasos: crear el namespace, configurar la cuenta de servicio y personalizar el ConfigMap del agente reemplazando <code class="inline-code">{{cluster_name}}</code> con el nombre del clúster. Luego, despliega el agente como DaemonSet utilizando el manifiesto oficial o una versión ajustada si necesitas StatsD. También puedes modificar parámetros como <code class="inline-code">metrics_collection_interval</code> (60 segundos por defecto, mínimo 15 segundos), <code class="inline-code">endpoint_override</code>, <code class="inline-code">force_flush_interval</code> y <code class="inline-code">region</code>.</p>
<p>Para AWS Fargate, el AWS OpenTelemetry Collector se despliega como DaemonSet mediante un comando curl que aplica la configuración desde el repositorio aws-observability. Verifica que los pods del collector estén activos en el espacio de nombres aws-otel-eks.</p>
<p>Una vez configurado el agente y recopiladas las métricas, puedes usar los paneles predefinidos para supervisar el rendimiento en tiempo real.</p>
<h3 id="uso-de-paneles-predefinidos" tabindex="-1">Uso de paneles predefinidos</h3>
<p>Container Insights incluye paneles predefinidos en CloudWatch para facilitar el monitoreo en tiempo real. Estos paneles ayudan a tomar decisiones informadas y mantener el rendimiento de las aplicaciones.</p>
<p>Para acceder a ellos, entra en la consola de CloudWatch, selecciona <strong>Insights</strong> y luego <strong>Container Insights</strong>. Desde ahí, elige el tipo de recurso que deseas supervisar. Los menús desplegables permiten ajustar las vistas según las necesidades de monitoreo.</p>
<p>Entre los paneles más útiles para identificar los mayores consumidores de recursos están:</p>
<ul>
<li>ECS Services</li>
<li>ECS Tasks</li>
<li>EKS Namespaces</li>
<li>EKS Services</li>
<li>EKS Pods </li>
</ul>
<p>Por ejemplo, al analizar un nodo, se detectó que la utilización de CPU y memoria alcanzaba casi el 60%. Al profundizar en los datos, se encontró que el contenedor fluent-bit tenía picos de uso del 77%. Este nivel de detalle permite identificar y resolver problemas rápidamente.</p>
<p>Container Insights también soporta <a href="https://prometheus.io/" rel="nofollow noopener noreferrer" target="_blank">Prometheus</a>, ofreciendo paneles predefinidos para cargas de trabajo comunes. La compatibilidad varía según el entorno, como muestra la siguiente tabla:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Entorno</th>
<th>AWS App Mesh</th>
<th>Java JMX</th>
<th>NGINX</th>
<th>NGINX Plus</th>
<th>HAProxy</th>
<th>Memcached</th>
</tr>
</thead>
<tbody>
<tr>
<td>EKS</td>
<td>Sí</td>
<td>Sí</td>
<td>Sí</td>
<td>No</td>
<td>Sí</td>
<td>Sí</td>
</tr>
<tr>
<td>ECS</td>
<td>Sí</td>
<td>Sí</td>
<td>Sí</td>
<td>Sí</td>
<td>No</td>
<td>No</td>
</tr>
</tbody>
</table></figure>
<p>Para análisis más detallados, CloudWatch Logs Insights permite consultar datos de métricas y analizar eventos específicos, brindando una visión más granular.</p>
<p>El agente CloudWatch genera automáticamente un grupo de logs llamado <code class="inline-code">/aws/containerinsights/Cluster_Name/performance</code>, donde almacena datos de rendimiento en formato de métrica integrada. Con la observabilidad mejorada para Amazon EKS, los costos se calculan por observación en lugar de por métrica almacenada o log ingerido.</p>
<p>Para más información y tutoriales sobre cómo monitorizar contenedores en AWS, visita <a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a>.</p>
<h2 class="sb h2-sbb-cls" id="analisis-de-logs-para-seguridad-y-cumplimiento-normativo" tabindex="-1">Análisis de logs para seguridad y cumplimiento normativo</h2>
<p>El análisis de logs de contenedores cumple un papel crucial en la <a href="https://dondeaprendoaws.com/blog/10-mejores-practicas-de-aws-para-deteccion-de-amenazas-en-tiempo-real/">detección de amenazas</a> de seguridad, la investigación de incidentes y el cumplimiento de normativas. Tras configurar un monitoreo centralizado, este paso resulta indispensable. <strong>CloudWatch Logs Insights</strong> proporciona herramientas interactivas que facilitan la identificación de patrones sospechosos y permiten registrar actividades críticas con precisión.</p>
<h3 id="consultas-de-logs-con-cloudwatch-logs-insights" tabindex="-1">Consultas de logs con CloudWatch Logs Insights</h3>
<p>CloudWatch Logs Insights permite buscar y analizar datos almacenados en CloudWatch Logs de manera interactiva. Esta herramienta soporta lenguajes de consulta como QL, PPL y SQL, y detecta automáticamente campos en logs provenientes de servicios de AWS o aplicaciones que emiten eventos en formato JSON. Aquí te mostramos cómo usarla para identificar patrones anómalos.</p>
<p>Para detectar posibles amenazas de seguridad, puedes emplear consultas específicas. Por ejemplo, filtrar eventos relacionados con intentos de acceso fallidos, como los errores "Client.UnauthorizedOperation" y "AccessDenied". Algunas consultas clave para reforzar la seguridad incluyen:</p>
<ul>
<li><strong>Seguimiento de actividad de usuarios</strong>: Analiza horarios de acceso, direcciones IP y tipos de acciones realizadas.</li>
<li><strong>Cambios en grupos de seguridad</strong>: Identifica modificaciones no autorizadas en los grupos que gestionan el tráfico.</li>
<li><strong>Detección de llamadas API sospechosas</strong>: Usa CloudTrail para rastrear actividades no autorizadas en la cuenta.</li>
</ul>
<h3 id="configuracion-de-alertas-para-eventos-criticos" tabindex="-1">Configuración de alertas para eventos críticos</h3>
<p>Una vez que hayas identificado eventos sospechosos mediante consultas, es fundamental configurar alertas que permitan una respuesta inmediata. Las <strong>CloudWatch Alarms</strong> son esenciales para el monitoreo, ya que te ayudan a rastrear métricas específicas y activar respuestas automatizadas.</p>
<blockquote>
<p>"CloudWatch Alarms are a key component of AWS monitoring and observability, providing the capability to track specific metrics, trigger automated responses, and reduce system downtime." - Alice the Architect, AWS in Plain English </p>
</blockquote>
<p>En entornos contenerizados, configurar filtros de métricas basados en grupos de logs puede ayudarte a detectar términos o patrones específicos. Usar convenciones de nombres consistentes facilita la trazabilidad, mientras que definir permisos IAM adecuados asegura la entrega segura de logs. Además, las alarmas basadas en consultas de Logs Insights pueden activar flujos de trabajo automatizados ante eventos críticos, como un aumento repentino en intentos de acceso fallidos.</p>
<h3 id="integracion-con-aws-security-hub" tabindex="-1">Integración con <a href="https://aws.amazon.com/security-hub/" rel="nofollow noopener noreferrer" target="_blank">AWS Security Hub</a></h3>
<p><figure><img alt="AWS Security Hub" src="/assets/blog/cf0e08a9b6348487ffaed093.jpg" style="width:100%;border-radius:16px;"></figure></p>
<p><strong>AWS Security Hub</strong> ofrece una visión completa del estado de seguridad en AWS y valida el cumplimiento con estándares y buenas prácticas. Al integrarse con CloudWatch Logs, centraliza la gestión de amenazas y el cumplimiento normativo. Este servicio funciona en conjunto con otros como <a href="https://aws.amazon.com/config/" rel="nofollow noopener noreferrer" target="_blank">AWS Config</a>, que evalúa configuraciones de recursos; <a href="https://aws.amazon.com/guardduty/" rel="nofollow noopener noreferrer" target="_blank">Amazon GuardDuty</a>, que detecta amenazas en contenedores; y AWS Audit Manager, que audita continuamente el uso de AWS.</p>
<p>Esta integración fortalece el monitoreo centralizado al definir políticas de retención de logs basadas en requisitos regulatorios y objetivos de optimización de costes. Para estructurar los logs de ECS de forma eficiente, se recomienda usar formatos estandarizados como JSON e incluir metadatos relevantes, lo que facilita enormemente el análisis con CloudWatch Logs Insights.</p>
<h2 class="sb h2-sbb-cls" id="buenas-practicas-de-seguridad-para-el-registro-de-contenedores" tabindex="-1">Buenas prácticas de seguridad para el registro de contenedores</h2>
<p>Proteger un registro de contenedores requiere implementar medidas de seguridad sólidas que resguarden datos sensibles y cumplan con las normativas. Estas prácticas, junto con el análisis detallado de logs, fortalecen la seguridad general del sistema.</p>
<h3 id="cifrado-de-logs-con-kms" tabindex="-1">Cifrado de logs con KMS</h3>
<p>El cifrado de logs mediante claves gestionadas por el cliente (CMK) en AWS KMS es una estrategia eficaz para mantener un control estricto sobre los datos. Este enfoque permite cumplir con las normativas de seguridad y se alinea con los principios de confianza cero, ya que las políticas pueden personalizarse para que solo principales IAM específicos puedan cifrar y descifrar los registros.</p>
<p>En enero de 2025, Varun Kumar Manik presentó una solución para un hallazgo de severidad media en Prowler relacionado con logs no cifrados. La estrategia consistió en configurar grupos de logs de CloudWatch mediante CloudFormation y asociarlos a una clave KMS a través de la propiedad <code class="inline-code">KmsKeyId</code>. Esto mejoró significativamente la seguridad y facilitó el cumplimiento normativo.</p>
<blockquote>
<p>"Enforcing explicit KMS encryption gives you tighter control over your data, meets compliance requirements, and aligns with zero-trust security principles." - Varun Kumar Manik </p>
</blockquote>
<p>Para implementar esta medida, es necesario crear una clave KMS en la región correspondiente y asegurarse de que su política permita al servicio CloudWatch Logs (<code class="inline-code">logs.&lt;region&gt;.amazonaws.com</code>) utilizarla. Es importante tener en cuenta que solo se admiten claves KMS simétricas, y si una clave se desactiva, CloudWatch Logs no podrá acceder a los registros cifrados con ella.</p>
<h3 id="implementacion-de-controles-de-acceso" tabindex="-1">Implementación de controles de acceso</h3>
<p>Aplicar el principio de menor privilegio es esencial para limitar accesos no autorizados. Esto implica otorgar únicamente los permisos necesarios y realizar revisiones periódicas para eliminar usuarios, roles, políticas y credenciales que ya no se utilicen.</p>
<p>Las políticas gestionadas por el cliente permiten definir reglas de acceso detalladas, mientras que las políticas en línea evitan la propagación de permisos compartidos. En entornos con varias cuentas, las <a href="https://dondeaprendoaws.com/blog/politicas-de-control-de-servicios-scps-en-aws/">políticas de control de servicios</a> (SCPs) de AWS Organizations son útiles para establecer límites adicionales.</p>
<p>IAM Access Analyzer es una herramienta clave para generar políticas basadas en patrones de acceso, asegurando una configuración más precisa. Además, es recomendable utilizar roles IAM con credenciales temporales en lugar de claves de acceso permanentes, reforzando así la seguridad.</p>
<h3 id="configuracion-de-politicas-de-retencion-de-logs" tabindex="-1">Configuración de políticas de retención de logs</h3>
<p>Definir políticas de retención en CloudWatch Logs no solo ayuda a reducir costes, sino que también evita la acumulación innecesaria de datos. Por defecto, los registros se conservan indefinidamente, lo que puede resultar en gastos elevados.</p>
<p>Por ejemplo, un entorno que genere 5 GB de logs diarios acumulará aproximadamente 1,8 TB al año, con un coste de unos 802 €. Al aplicar políticas de retención adecuadas, estos costes pueden reducirse significativamente, pasando de 1.200 € a 300 € en entornos de desarrollo.</p>
<figure class="table"><table>
<thead>
<tr>
<th>Consideración</th>
<th>Recomendación</th>
</tr>
</thead>
<tbody>
<tr>
<td>Compliance</td>
<td>Alinear la retención con normativas legales</td>
</tr>
<tr>
<td>Coste</td>
<td>Revisar los períodos de retención regularmente</td>
</tr>
<tr>
<td>Frecuencia de acceso</td>
<td>Utilizar la clase Infrequent Access</td>
</tr>
<tr>
<td>Debugging</td>
<td>Equilibrar retención con necesidades de resolución de problemas</td>
</tr>
</tbody>
</table></figure>
<p>CloudWatch Logs ofrece opciones de almacenamiento rentables, como las clases Standard e Infrequent Access. Los períodos de retención pueden configurarse desde 1 día hasta 3.653 días.</p>
<p>Para optimizar esta estrategia, es aconsejable alinear los períodos de retención con los requisitos legales, considerar opciones de almacenamiento a largo plazo como AWS S3 Glacier, realizar auditorías trimestrales y automatizar las políticas mediante Infrastructure-as-Code. Una vez que los eventos alcanzan el período de retención establecido, suelen eliminarse en un plazo de 72 horas.</p>
<h2 class="sb h2-sbb-cls" id="conclusion" tabindex="-1">Conclusión</h2>
<p>El monitoreo de contenedores con <strong>Amazon CloudWatch Logs</strong> se presenta como una solución completa para gestionar contenedores en AWS. Su capacidad para centralizar la recopilación y el almacenamiento de logs, junto con visibilidad en tiempo real, responde a una de las principales preocupaciones en la adopción de contenedores. De hecho, según una encuesta de CNCF realizada en 2018, el 34 % de los participantes señaló el monitoreo como uno de los mayores retos en este ámbito. Gracias a su integración con Container Insights, CloudWatch Logs simplifica la recopilación de métricas y logs dentro del ecosistema de contenedores.</p>
<blockquote>
<p>"CloudWatch is a service that monitors applications, responds to performance changes, optimizes resource use, and provides insights into operational health." – Amazon Web Services </p>
</blockquote>
<p>Esta descripción resalta su capacidad para detectar y responder a incidentes, una funcionalidad que se potencia con <strong>CloudWatch Logs Insights</strong>, una herramienta que permite realizar consultas avanzadas sobre los registros mediante un lenguaje de consulta especializado. Además, su integración con servicios como <strong>AWS Security Hub</strong> y <strong>GuardDuty</strong> centraliza la gestión de amenazas, mejorando la seguridad y el control.</p>
<p>La configuración y despliegue de CloudWatch Logs también destacan por su enfoque práctico. La observabilidad entre cuentas permite monitorear aplicaciones distribuidas en varias cuentas de AWS, mientras que las funciones de detección de anomalías facilitan la creación de alarmas automáticas en clústeres como <strong>EKS</strong>, <strong>ECS</strong> y <strong>Kubernetes</strong>. Esto no solo optimiza el uso de recursos, sino que también ayuda a reducir los costes operativos.</p>
<p>Por otro lado, el enfoque en seguridad y cumplimiento normativo refuerza su atractivo. Funciones como el cifrado con <strong>KMS</strong>, los controles de acceso mediante <strong>IAM</strong> y las políticas de retención configurables garantizan que el monitoreo cumpla con los estándares empresariales más exigentes. Todo esto se logra sin necesidad de realizar cambios en el código existente, lo que facilita su adopción.</p>
<h2 class="sb h2-sbb-cls" id="faqs" tabindex="-1">FAQs</h2>
<h3 data-faq-q="" id="como-configuro-los-permisos-iam-para-que-mis-contenedores-envien-logs-a-cloudwatch-logs-de-forma-segura" tabindex="-1">¿Cómo configuro los permisos IAM para que mis contenedores envíen logs a CloudWatch Logs de forma segura?</h3>
<p>Para que tus contenedores envíen logs de forma segura a <strong>CloudWatch Logs</strong>, necesitas configurar permisos específicos en IAM. Lo primero es crear una política que incluya las acciones necesarias, como:</p>
<ul>
<li><code class="inline-code">logs:CreateLogGroup</code></li>
<li><code class="inline-code">logs:CreateLogStream</code></li>
<li><code class="inline-code">logs:PutLogEvents</code></li>
<li><code class="inline-code">logs:DescribeLogStreams</code></li>
</ul>
<p>Estas acciones permiten crear grupos y flujos de logs, enviar eventos y consultar los flujos existentes.</p>
<p>Una vez creada la política, asígnala a los roles o usuarios de IAM asociados a tus contenedores. Si deseas restringir el acceso, puedes limitarlo a un grupo de logs específico usando un ARN concreto. Si necesitas mayor flexibilidad, también puedes optar por configuraciones más amplias con <code class="inline-code">*</code>. Sin embargo, es crucial respetar las <strong>mejores prácticas de seguridad</strong>, evitando permisos innecesarios o demasiado amplios.</p>
<p>Es importante revisar y actualizar tus políticas de forma periódica para garantizar un entorno seguro y bien gestionado.</p>
<h3 data-faq-q="" id="cuales-son-los-beneficios-de-usar-container-insights-para-monitorizar-metricas-en-contenedores-y-como-se-configura-el-agente-de-cloudwatch" tabindex="-1">¿Cuáles son los beneficios de usar Container Insights para monitorizar métricas en contenedores y cómo se configura el agente de CloudWatch?</h3>
<h2 class="sb h2-sbb-cls" id="amazon-cloudwatch-container-insights-monitorizacion-en-tiempo-real" tabindex="-1"><a href="https://aws.amazon.com/cloudwatch/" rel="nofollow noopener noreferrer" target="_blank">Amazon CloudWatch</a> Container Insights: Monitorización en Tiempo Real</h2>
<p><figure><img alt="Amazon CloudWatch" src="/assets/blog/7439c8362b69f8252d51d49b.jpg" style="width:100%;border-radius:16px;"></figure></p>
<p>Amazon CloudWatch Container Insights proporciona una <strong>visión en tiempo real</strong> del rendimiento y estado de los contenedores, lo que permite detectar problemas con rapidez y gestionar los recursos de manera más eficiente. Al recopilar métricas detalladas como el uso de CPU, memoria y almacenamiento, facilita decisiones más acertadas sobre escalabilidad y costes. Además, su integración con otros servicios de AWS potencia el análisis y la monitorización de aplicaciones basadas en contenedores.</p>
<h3 id="configuracion-del-agente-de-cloudwatch" tabindex="-1">Configuración del Agente de CloudWatch</h3>
<p>Configurar el <a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">agente de CloudWatch</a> es sencillo y práctico. Puedes implementarlo como un <strong>DaemonSet en Kubernetes</strong>, lo que asegura que se ejecute en todos los nodos del clúster. También tienes la opción de habilitar Container Insights directamente desde la consola de Amazon ECS o utilizando la AWS CLI. Esto permite una configuración rápida, ya sea para clústeres específicos o para toda tu cuenta de AWS, logrando un monitoreo centralizado y eficaz de tus aplicaciones en contenedores.</p>
<h3 data-faq-q="" id="como-puedo-usar-cloudwatch-logs-insights-para-mejorar-la-seguridad-de-mis-aplicaciones-en-contenedores-y-detectar-amenazas" tabindex="-1">¿Cómo puedo usar CloudWatch Logs Insights para mejorar la seguridad de mis aplicaciones en contenedores y detectar amenazas?</h3>
<p>Para fortalecer la seguridad de tus aplicaciones en contenedores con <strong>CloudWatch Logs Insights</strong>, lo primero es asegurarte de que los registros de tus contenedores se envíen correctamente a <strong>Amazon CloudWatch</strong>. Esto se logra configurando <strong>CloudWatch Container Insights</strong>, una herramienta que recopila métricas y registros a nivel de clúster, nodo y pod, ofreciendo un panorama detallado sobre la actividad de tus aplicaciones.</p>
<p>Con los registros ya disponibles en CloudWatch, puedes aprovechar <strong>CloudWatch Logs Insights</strong> para ejecutar consultas específicas que identifiquen patrones anómalos o comportamientos sospechosos. Por ejemplo, es posible buscar errores recurrentes, advertencias o intentos de acceso no permitidos. Este tipo de análisis en tiempo real resulta clave para detectar posibles vulnerabilidades y actuar con rapidez, reforzando así la seguridad de tus aplicaciones en contenedores.</p>
<h2>Publicaciones de blog relacionadas</h2><ul><li><a href="https://dondeaprendoaws.com/blog/como-desplegar-contenedores-en-aws/">Cómo Desplegar Contenedores en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">Mejores Prácticas de Observabilidad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/monitoreo-y-logs-de-aws-step-functions-guia-2024/">Monitoreo y Logs de AWS Step Functions: Guía 2024</a></li><li><a href="https://dondeaprendoaws.com/blog/logs-de-acceso-en-elb-guia-completa/">Logs de acceso en ELB: Guía completa</a></li></ul>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"¿Cómo configuro los permisos IAM para que mis contenedores envíen logs a CloudWatch Logs de forma segura?","acceptedAnswer":{"@type":"Answer","text":"<p>Para que tus contenedores envíen logs de forma segura a <strong>CloudWatch Logs</strong>, necesitas configurar permisos específicos en IAM. Lo primero es crear una política que incluya las acciones necesarias, como:</p> <ul> <li><code>logs:CreateLogGroup</code></li> <li><code>logs:CreateLogStream</code></li> <li><code>logs:PutLogEvents</code></li> <li><code>logs:DescribeLogStreams</code></li> </ul> <p>Estas acciones permiten crear grupos y flujos de logs, enviar eventos y consultar los flujos existentes.</p> <p>Una vez creada la política, asígnala a los roles o usuarios de IAM asociados a tus contenedores. Si deseas restringir el acceso, puedes limitarlo a un grupo de logs específico usando un ARN concreto. Si necesitas mayor flexibilidad, también puedes optar por configuraciones más amplias con <code>*</code>. Sin embargo, es crucial respetar las <strong>mejores prácticas de seguridad</strong>, evitando permisos innecesarios o demasiado amplios.</p> <p>Es importante revisar y actualizar tus políticas de forma periódica para garantizar un entorno seguro y bien gestionado.</p>"}},{"@type":"Question","name":"¿Cuáles son los beneficios de usar Container Insights para monitorizar métricas en contenedores y cómo se configura el agente de CloudWatch?","acceptedAnswer":{"@type":"Answer","text":"<h2 id=\"amazon-cloudwatch-container-insights-monitorizacion-en-tiempo-real\" tabindex=\"-1\" class=\"sb h2-sbb-cls\"><a href=\"https://aws.amazon.com/cloudwatch/\" target=\"_blank\" rel=\"nofollow noopener noreferrer\">Amazon CloudWatch</a> Container Insights: Monitorización en Tiempo Real</h2> <p><img src=\"/assets/blog/7439c8362b69f8252d51d49b.jpg\" alt=\"Amazon CloudWatch\"></p> <p>Amazon CloudWatch Container Insights proporciona una <strong>visión en tiempo real</strong> del rendimiento y estado de los contenedores, lo que permite detectar problemas con rapidez y gestionar los recursos de manera más eficiente. Al recopilar métricas detalladas como el uso de CPU, memoria y almacenamiento, facilita decisiones más acertadas sobre escalabilidad y costes. Además, su integración con otros servicios de AWS potencia el análisis y la monitorización de aplicaciones basadas en contenedores.</p> <h3 id=\"configuracion-del-agente-de-cloudwatch\" tabindex=\"-1\">Configuración del Agente de CloudWatch</h3> <p>Configurar el <a href=\"https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/\">agente de CloudWatch</a> es sencillo y práctico. Puedes implementarlo como un <strong>DaemonSet en Kubernetes</strong>, lo que asegura que se ejecute en todos los nodos del clúster. También tienes la opción de habilitar Container Insights directamente desde la consola de Amazon ECS o utilizando la AWS CLI. Esto permite una configuración rápida, ya sea para clústeres específicos o para toda tu cuenta de AWS, logrando un monitoreo centralizado y eficaz de tus aplicaciones en contenedores.</p>"}},{"@type":"Question","name":"¿Cómo puedo usar CloudWatch Logs Insights para mejorar la seguridad de mis aplicaciones en contenedores y detectar amenazas?","acceptedAnswer":{"@type":"Answer","text":"<p>Para fortalecer la seguridad de tus aplicaciones en contenedores con <strong>CloudWatch Logs Insights</strong>, lo primero es asegurarte de que los registros de tus contenedores se envíen correctamente a <strong>Amazon CloudWatch</strong>. Esto se logra configurando <strong>CloudWatch Container Insights</strong>, una herramienta que recopila métricas y registros a nivel de clúster, nodo y pod, ofreciendo un panorama detallado sobre la actividad de tus aplicaciones.</p> <p>Con los registros ya disponibles en CloudWatch, puedes aprovechar <strong>CloudWatch Logs Insights</strong> para ejecutar consultas específicas que identifiquen patrones anómalos o comportamientos sospechosos. Por ejemplo, es posible buscar errores recurrentes, advertencias o intentos de acceso no permitidos. Este tipo de análisis en tiempo real resulta clave para detectar posibles vulnerabilidades y actuar con rapidez, reforzando así la seguridad de tus aplicaciones en contenedores.</p>"}}]}</script>
