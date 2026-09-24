---
title: "Logs de acceso en ELB: Guía completa"
description: "Aprende cómo configurar y analizar los logs de acceso en ELB para mejorar la seguridad y rendimiento de tu infraestructura en AWS."
publishedAt: "2025-03-13"
publishedTimestamp: "2025-03-13T03:14:10.062000+00:00"
cover: "/assets/blog/fe79fa50612b43f06d41c37a.jpg"
coverAlt: "Thumbnail for: Logs de acceso en ELB: Guía completa"
ogImage: "/assets/blog/fe79fa50612b43f06d41c37a.jpg"
indexOrder: 15
related:
  - title: "Guía completa para depurar errores CORS en API Gateway"
    url: "https://dondeaprendoaws.com/blog/guia-completa-para-depurar-errores-cors-en-api-gateway/"
    image: "/assets/blog/8cdc1f9432243e263d1de431.jpg"
    imageAlt: "Thumbnail for: Guía completa para depurar errores CORS en API Gateway"
  - title: "Guía de Acreditación para Partners de AWS 2024"
    url: "https://dondeaprendoaws.com/blog/guia-de-acreditacion-para-partners-de-aws-2024/"
    image: "/assets/blog/0d6df5a1297701914debd614.png"
    imageAlt: "Thumbnail for: Guía de Acreditación para Partners de AWS 2024"
  - title: "Patrón Strangler Fig en AWS: Migrar a Microservicios"
    url: "https://dondeaprendoaws.com/blog/patron-strangler-fig-en-aws-migrar-a-microservicios/"
    image: "/assets/blog/a4bd2fc033fb9605dec915d6.png"
    imageAlt: "Thumbnail for: Patrón Strangler Fig en AWS: Migrar a Microservicios"
---

<p><strong>¿Quieres mejorar la seguridad y el rendimiento de tu infraestructura en AWS?</strong> Los logs de acceso de Elastic Load Balancer (ELB) son clave para analizar tráfico, detectar problemas y cumplir normativas. Aquí tienes lo más importante:</p>
<ul>
<li><strong>¿Qué son los logs de acceso?</strong> Registros que documentan cada solicitud en tu ELB, incluyendo IPs, tiempos de respuesta, códigos HTTP y más.</li>
<li><strong>Tipos de ELB compatibles:</strong>
<ul>
<li><strong>ALB:</strong> Detalles HTTP/HTTPS completos.</li>
<li><strong>NLB:</strong> Métricas básicas TCP/UDP.</li>
<li><strong>Classic:</strong> Información tradicional sobre HTTP/TCP.</li>
</ul>
</li>
<li><strong>Cómo configurarlos:</strong>
<ol>
<li>Actívalos desde la consola de AWS o CLI.</li>
<li>Usa un bucket S3 para almacenar los logs.</li>
<li>Configura permisos IAM y ciclo de vida de datos.</li>
</ol>
</li>
<li><strong>Formato y análisis:</strong> Logs comprimidos (.gz) con datos clave como tiempos de procesamiento y bytes transferidos. Analízalos con herramientas como <a href="https://aws.amazon.com/athena/" rel="nofollow noopener noreferrer" target="_blank">Amazon Athena</a> o <a href="https://aws.amazon.com/cloudwatch/" rel="nofollow noopener noreferrer" target="_blank">CloudWatch</a>.</li>
</ul>
<h3 id="tabla-rapida-comparativa-de-elb-y-soporte-de-logs" tabindex="-1">Tabla rápida: Comparativa de ELB y soporte de logs</h3>
<figure class="table"><table>
<thead>
<tr>
<th>Tipo de ELB</th>
<th>Soporte de logs</th>
<th>Intervalo de entrega</th>
<th>Datos registrados</th>
</tr>
</thead>
<tbody>
<tr>
<td>ALB</td>
<td>Completo</td>
<td>Cada 5 minutos</td>
<td>HTTP/HTTPS</td>
</tr>
<tr>
<td>NLB</td>
<td>Básico</td>
<td>Cada 5 minutos</td>
<td>TCP/UDP</td>
</tr>
<tr>
<td>Classic</td>
<td>Completo</td>
<td>Cada 5 minutos</td>
<td>HTTP/TCP</td>
</tr>
</tbody>
</table></figure>
<p><strong>Conclusión:</strong> Configurar y analizar los logs de ELB no solo mejora la seguridad, sino que también optimiza el rendimiento y ayuda a cumplir normativas. Sigue leyendo para aprender cómo configurarlos y sacarles el máximo partido.</p>
<h2 class="sb h2-sbb-cls" id="configuracion-de-logs-de-acceso" tabindex="-1">Configuración de logs de acceso</h2>
<p>Configurar los logs de acceso en ELB es clave para mejorar tanto la seguridad como el rendimiento. Esto implica ajustar varios componentes de AWS.</p>
<h3 id="requisitos-de-configuracion" tabindex="-1">Requisitos de configuración</h3>
<p>Para activar los logs de acceso en ELB, asegúrate de contar con lo siguiente:</p>
<ul>
<li><strong>Un bucket S3 dedicado</strong> para almacenar los logs, lo que facilita la gestión de permisos y el ciclo de vida de los datos.</li>
<li><strong>Permisos IAM configurados correctamente</strong> para permitir el acceso necesario.</li>
<li><strong>Un balanceador de carga en una VPC.</strong></li>
<li>Configuración que permita a ELB escribir logs en el bucket.</li>
</ul>
<h3 id="habilitar-el-registro-de-acceso" tabindex="-1">Habilitar el registro de acceso</h3>
<p>El procedimiento para activar los logs depende del tipo de balanceador que utilices:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Tipo de ELB</th>
<th>Método de activación</th>
<th>Intervalo de entrega</th>
</tr>
</thead>
<tbody>
<tr>
<td>ALB/NLB</td>
<td>AWS Console o CLI</td>
<td>Cada 5 minutos</td>
</tr>
<tr>
<td>Classic</td>
<td>AWS Console o CLI</td>
<td>Cada 5 minutos</td>
</tr>
<tr>
<td>Gateway</td>
<td>AWS Console o CLI</td>
<td>Cada 5 minutos</td>
</tr>
</tbody>
</table></figure>
<p>Pasos para habilitar los logs:</p>
<ol>
<li>Ve a <strong>EC2 &gt; Load Balancers</strong> y selecciona el balanceador que deseas configurar.</li>
<li>En la pestaña <strong>Attributes</strong>, activa la opción <strong>Access logs</strong>.</li>
<li>Ingresa el nombre del bucket S3 donde se almacenarán los logs y, si lo deseas, añade un prefijo opcional.</li>
</ol>
<p>Una vez hecho esto, asegúrate de configurar correctamente tu bucket S3 para completar el proceso.</p>
<h3 id="configuracion-del-bucket-s3" tabindex="-1">Configuración del bucket S3</h3>
<ol>
<li><strong>Crea un bucket con la siguiente política de permisos:</strong></li>
</ol>
<pre><code class="language-json">{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::elb-account-id:root"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
</code></pre>
<ol start="2">
<li><strong>Configura el ciclo de vida del bucket:</strong></li>
</ol>
<ul>
<li>Mueve los datos a <strong>S3 Infrequent Access</strong> después de 30 días.</li>
<li>Archiva los logs en <strong>S3 Glacier</strong> tras 90 días.</li>
<li>Configura la eliminación automática de los logs después de 365 días.</li>
</ul>
<ol start="3">
<li><strong>Habilita el cifrado:</strong></li>
</ol>
<p>Activa el cifrado del lado del servidor (SSE-S3) para proteger los logs almacenados.</p>
<p>Finalmente, realiza una prueba de escritura para confirmar que los logs se están generando correctamente en el bucket configurado.</p>
<h2 class="sb h2-sbb-cls" id="formato-de-logs-de-acceso" tabindex="-1">Formato de logs de acceso</h2>
<p>Los logs de acceso de ELB siguen una estructura estándar que facilita analizar el tráfico y el rendimiento.</p>
<h3 id="estructura-del-archivo-de-logs" tabindex="-1">Estructura del archivo de logs</h3>
<p>Los archivos de logs se almacenan en un bucket S3 con un formato específico:</p>
<pre><code>bucket-name/prefix/AWSLogs/aws-account-id/elasticloadbalancing/region/yyyy/mm/dd/aws-account-id_elasticloadbalancing_region_load-balancer-name_end-time_ip-address_random-string.log.gz
</code></pre>
<p>Cada archivo contiene registros de 5 minutos de actividad y está comprimido en formato .gz para ahorrar espacio.</p>
<h3 id="campos-clave-en-los-logs" tabindex="-1">Campos clave en los logs</h3>
<p>Estos son los campos principales que aparecen en cada registro:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Campo</th>
<th>Descripción</th>
<th>Ejemplo</th>
</tr>
</thead>
<tbody>
<tr>
<td>timestamp</td>
<td>Fecha y hora en formato ISO 8601</td>
<td>2025-03-13T10:55:36.123Z</td>
</tr>
<tr>
<td>elb</td>
<td>Nombre del balanceador</td>
<td>app/my-loadbalancer/50dc6c495c0c9188</td>
</tr>
<tr>
<td>client:port</td>
<td>IP y puerto del cliente</td>
<td>192.168.1.1:12345</td>
</tr>
<tr>
<td>target:port</td>
<td>IP y puerto del destino</td>
<td>10.0.1.10:80</td>
</tr>
<tr>
<td>request_processing_time</td>
<td>Tiempo de procesamiento inicial</td>
<td>0,086</td>
</tr>
<tr>
<td>target_processing_time</td>
<td>Tiempo de respuesta del servidor</td>
<td>0,048</td>
</tr>
<tr>
<td>response_processing_time</td>
<td>Tiempo final de respuesta</td>
<td>0,037</td>
</tr>
<tr>
<td>status_code</td>
<td>Código HTTP de respuesta</td>
<td>200</td>
</tr>
<tr>
<td>target_status_code</td>
<td>Código del servidor destino</td>
<td>200</td>
</tr>
<tr>
<td>received_bytes</td>
<td>Bytes recibidos</td>
<td>1.234</td>
</tr>
<tr>
<td>sent_bytes</td>
<td>Bytes enviados</td>
<td>5.678</td>
</tr>
</tbody>
</table></figure>
<h3 id="ejemplo-de-registro" tabindex="-1">Ejemplo de registro</h3>
<pre><code>2025-03-13T10:55:36.123Z app/my-loadbalancer/50dc6c495c0c9188 192.168.1.1:12345 10.0.1.10:80 0,086 0,048 0,037 200 200 1234 5678 "GET https://example.com:443/api/users HTTP/1.1"
</code></pre>
<p><strong>Desglose del ejemplo:</strong></p>
<ul>
<li>La petición se realizó el 13 de marzo de 2025 a las 10:55:36.</li>
<li>El tiempo total fue de 171 ms (suma de los tres tiempos).</li>
<li>La respuesta fue exitosa con un código HTTP 200.</li>
<li>Se transfirieron 1,2 KB de datos de entrada y 5,5 KB de salida.</li>
</ul>
<p>El análisis de los tiempos permite detectar posibles problemas:</p>
<ul>
<li><strong>request_processing_time:</strong> 86 ms para establecer la conexión.</li>
<li><strong>target_processing_time:</strong> 48 ms en el servidor.</li>
<li><strong>response_processing_time:</strong> 37 ms para procesar y enviar la respuesta.</li>
</ul>
<p>Estos detalles ayudan a identificar problemas de rendimiento y posibles incidencias en la red, el balanceador o los servidores.</p>
<h2 class="sb h2-sbb-cls" id="metodos-de-analisis-de-logs" tabindex="-1">Métodos de análisis de logs</h2>
<p>El análisis detallado de los logs de ELB es clave para garantizar el buen funcionamiento y la estabilidad de la infraestructura. Estas prácticas complementan la configuración inicial de los registros.</p>
<h3 id="herramientas-de-analisis-de-aws" tabindex="-1">Herramientas de análisis de AWS</h3>
<p><strong>Amazon CloudWatch Logs Insights</strong></p>
<ul>
<li>Permite realizar consultas SQL en tiempo real.</li>
<li>Ofrece visualizaciones automáticas y genera alertas basadas en métricas.</li>
</ul>
<p><strong>Amazon Athena</strong></p>
<ul>
<li>Facilita el análisis histórico mediante consultas SQL.</li>
<li>Maneja grandes volúmenes de datos para crear informes detallados.</li>
</ul>
<p>Ejemplo de consulta en Athena para identificar IPs con errores 5xx:</p>
<pre><code class="language-sql">SELECT client_ip, COUNT(*) as error_count
FROM elb_logs
WHERE status_code &gt;= 500
GROUP BY client_ip
ORDER BY error_count DESC
LIMIT 10;
</code></pre>
<h3 id="herramientas-de-analisis-externas" tabindex="-1">Herramientas de análisis externas</h3>
<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Función principal</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://grafana.com/" rel="nofollow noopener noreferrer" target="_blank">Grafana</a></td>
<td>Crea paneles personalizados con alertas en tiempo real.</td>
</tr>
<tr>
<td><a href="https://www.elastic.co/elastic-stack" rel="nofollow noopener noreferrer" target="_blank">ELK Stack</a></td>
<td>Realiza análisis profundos con búsqueda de texto completo.</td>
</tr>
<tr>
<td><a href="https://www.splunk.com/en_us/products/splunk-enterprise.html" rel="nofollow noopener noreferrer" target="_blank">Splunk</a></td>
<td>Detecta amenazas y correlaciona eventos de forma eficiente.</td>
</tr>
</tbody>
</table></figure>
<p>La combinación de estas herramientas con una estrategia de monitorización activa permite identificar problemas antes de que afecten al sistema.</p>
<h3 id="configuracion-de-monitorizacion" tabindex="-1">Configuración de monitorización</h3>
<p>1. <strong><a href="https://dondeaprendoaws.com/blog/10-metricas-clave-de-devops-en-aws/">Métricas clave</a></strong></p>
<ul>
<li>Respuestas con tiempo superior a 1 segundo.</li>
<li>Tasa de errores superior al 1%.</li>
<li>Conexiones rechazadas.</li>
<li>Comportamientos o patrones anómalos.</li>
</ul>
<p>2. <strong>Sistema de alertas</strong></p>
<ul>
<li>Aumento en errores 4xx/5xx.</li>
<li>Latencias inusualmente altas.</li>
<li>Picos de tráfico inesperados.</li>
<li>Actividad de IPs sospechosas.</li>
</ul>
<p>3. <strong>Dashboards</strong></p>
<ul>
<li>Visualización de distribución geográfica del tráfico.</li>
<li>Análisis de tendencias en el rendimiento.</li>
<li>Métricas relacionadas con la seguridad.</li>
<li>Resumen del estado general del sistema.</li>
</ul>
<p>La correlación de los logs de ELB con registros de <a href="https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html" rel="nofollow noopener noreferrer" target="_blank">CloudTrail</a> y VPC Flow Logs ofrece una perspectiva completa, ayudando a identificar problemas de seguridad y rendimiento de manera eficiente. Esto permite tomar medidas correctivas rápidamente y mantener la estabilidad del sistema.</p>
<h2 class="sb h2-sbb-cls" id="directrices-de-seguridad" tabindex="-1">Directrices de seguridad</h2>
<p>Esta sección amplía la configuración anterior, centrándose en reforzar la seguridad de los logs.</p>
<h3 id="gestion-de-logs" tabindex="-1">Gestión de logs</h3>
<p>Es importante gestionar los logs para garantizar su disponibilidad y protección. Aquí tienes algunas recomendaciones clave:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Recomendación</th>
<th>Ventaja</th>
</tr>
</thead>
<tbody>
<tr>
<td>Retención</td>
<td>Define un período de retención acorde con las normativas (por ejemplo, 90 días)</td>
<td>Cumplimiento con regulaciones y análisis histórico</td>
</tr>
<tr>
<td>Rotación</td>
<td>Implementa rotación diaria</td>
<td>Mejor uso del espacio de almacenamiento</td>
</tr>
<tr>
<td>Organización y compresión</td>
<td>Utiliza GZIP y organiza los logs por año/mes/día</td>
<td>Ahorro de costes y gestión más eficiente</td>
</tr>
</tbody>
</table></figure>
<h3 id="controles-de-seguridad" tabindex="-1">Controles de seguridad</h3>
<p>Para proteger los registros frente a accesos no autorizados, se sugiere implementar las siguientes medidas:</p>
<ul>
<li>Configura el bucket con <a href="https://dondeaprendoaws.com/blog/cifrado-de-datos-con-aws-kms-guia-practica/">cifrado SSE-KMS</a>.</li>
<li>Aplica el principio de mínimo privilegio mediante roles específicos de IAM.</li>
<li>Activa CloudTrail para monitorear todos los accesos.</li>
</ul>
<p>A continuación, se muestra una política que asegura que solo se acepten objetos cifrados con SSE-KMS:</p>
<pre><code class="language-json">{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Deny",
            "Principal": "*",
            "Action": "s3:PutObject",
            "Resource": "arn:aws:s3:::nombre-bucket/*",
            "Condition": {
                "StringNotEquals": {
                    "s3:x-amz-server-side-encryption": "aws:kms"
                }
            }
        }
    ]
}
</code></pre>
<h3 id="estandares-de-cumplimiento" tabindex="-1">Estándares de cumplimiento</h3>
<p>Asegura que la gestión de logs cumpla con normativas internacionales para fortalecer la seguridad y simplificar auditorías.</p>
<figure class="table"><table>
<thead>
<tr>
<th>Normativa</th>
<th>Requisito principal</th>
<th>Configuración en ELB</th>
</tr>
</thead>
<tbody>
<tr>
<td>GDPR</td>
<td>Protección de datos personales</td>
<td>Configurar los logs para reducir la exposición de información sensible (por ejemplo, enmascarar IPs)</td>
</tr>
<tr>
<td>ISO 27001</td>
<td>Control de acceso</td>
<td>Activar logs de auditoría</td>
</tr>
<tr>
<td>PCI DSS</td>
<td>Retención de logs</td>
<td>Ajustar el período de retención según las directrices del estándar (por ejemplo, períodos más largos)</td>
</tr>
</tbody>
</table></figure>
<p><strong>Sugerencias adicionales:</strong></p>
<ul>
<li>Etiqueta los recursos para una clasificación clara de los datos.</li>
<li>Establece procesos regulares para revisar las políticas de acceso.</li>
<li>Documenta todos los cambios realizados en la configuración de seguridad.</li>
<li>Realiza auditorías frecuentes para verificar el cumplimiento.</li>
</ul>
<p>Adapta estas prácticas según tus necesidades, buscando un equilibrio entre protección y accesibilidad.</p>
<p>Si quieres explorar más sobre seguridad y gestión de logs en AWS, visita el blog <a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a>.</p>
<h2 class="sb h2-sbb-cls" id="problemas-comunes" tabindex="-1">Problemas comunes</h2>
<p>Al configurar y analizar los logs, pueden surgir algunos inconvenientes que es necesario abordar. Con una configuración adecuada, identificar y resolver estos problemas rápidamente es clave para garantizar la seguridad y el rendimiento del sistema.</p>
<h3 id="problemas-de-configuracion" tabindex="-1">Problemas de configuración</h3>
<p>Los errores más habituales durante la configuración inicial suelen requerir pasos específicos para solucionarlos:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Error</th>
<th>Solución</th>
</tr>
</thead>
<tbody>
<tr>
<td>Access Denied</td>
<td>Revisa y actualiza la <a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-s3/">política del bucket S3</a> para incluir permisos de elasticloadbalancing.amazonaws.com.</td>
</tr>
<tr>
<td>Logs no aparecen</td>
<td>Asegúrate de que el prefijo termine con una barra (/) y siga el formato: AWSLogs/AWS-account-ID/elasticloadbalancing/region/.</td>
</tr>
<tr>
<td>Bucket no encontrado</td>
<td>Verifica que el bucket exista en la misma región que el ELB.</td>
</tr>
</tbody>
</table></figure>
<h3 id="problemas-de-entrega-de-logs" tabindex="-1">Problemas de entrega de logs</h3>
<p>La entrega de logs en S3 puede tardar entre 5 y 15 minutos. Si notas problemas, considera lo siguiente:</p>
<ul>
<li>
<strong>Retrasos en la entrega</strong><br>
Comprueba el estado de la cuota de servicio de S3, revisa las reglas de ciclo de vida configuradas y asegúrate de que los permisos del rol IAM sean los correctos.
</li>
<li>
<strong>Logs incompletos</strong><br>
Esto puede deberse a varias causas, como:
<ul>
<li>El bucket S3 está lleno o se encuentra saturado.</li>
<li>Problemas de conectividad.</li>
<li>Restricciones en el ancho de banda.</li>
</ul>
</li>
</ul>
<p>Si encuentras problemas más específicos o necesitas ayuda extra, consulta los recursos disponibles.</p>
<h3 id="recursos-de-ayuda" tabindex="-1">Recursos de ayuda</h3>
<figure class="table"><table>
<thead>
<tr>
<th>Recurso</th>
<th>Descripción</th>
<th>Acceso</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS Troubleshooting Guide</td>
<td>Guía para resolver problemas comunes.</td>
<td>Console &gt; ELB &gt; Documentación</td>
</tr>
<tr>
<td>CloudWatch Metrics</td>
<td>Métricas relacionadas con la entrega de logs.</td>
<td>CloudWatch &gt; Metrics &gt; ELB</td>
</tr>
<tr>
<td>AWS Support Center</td>
<td>Soporte técnico personalizado.</td>
<td>AWS Support &gt; Create Case</td>
</tr>
<tr>
<td>Dónde Aprendo AWS</td>
<td><a href="https://dondeaprendoaws.com/blog/recursos-en-espanol-para-certificacion-aws-cloud-practitioner/">Recursos en español sobre AWS</a>.</td>
<td><a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a></td>
</tr>
</tbody>
</table></figure>
<p><strong>Consejo práctico:</strong> Configura <a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">alertas en CloudWatch</a> para monitorizar posibles errores en la entrega de logs. Establece umbrales en métricas como latencia de entrega, tasa de errores y volumen de logs procesados. Estas alertas te ayudarán a detectar y solucionar problemas antes de que afecten a los análisis de seguridad o al cumplimiento de normativas.</p>
<h2 class="sb h2-sbb-cls" id="conclusion" tabindex="-1">Conclusión</h2>
<p>Gestionar los logs de acceso en ELB de forma adecuada es clave para mantener una infraestructura segura y cumplir con las <a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">normativas en AWS</a>. En esta guía hemos destacado los puntos más importantes y compartido recursos útiles para seguir explorando el tema.</p>
<h3 id="puntos-clave" tabindex="-1">Puntos clave</h3>
<p>Configurar y analizar los logs de acceso correctamente puede marcar una gran diferencia tanto en la seguridad como en el rendimiento del sistema. Aquí tienes un resumen:</p>
<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Ventaja</th>
<th>Cómo aplicarlo</th>
</tr>
</thead>
<tbody>
<tr>
<td>Monitorización</td>
<td>Identificar actividades sospechosas</td>
<td>Analizar patrones de acceso regularmente</td>
</tr>
<tr>
<td>Cumplimiento</td>
<td>Facilitar auditorías de seguridad</td>
<td>Retener logs según las normativas</td>
</tr>
<tr>
<td>Optimización</td>
<td>Mejorar el rendimiento del sistema</td>
<td>Evaluar métricas de latencia y errores</td>
</tr>
<tr>
<td>Seguridad</td>
<td>Evitar accesos no permitidos</td>
<td>Usar controles basados en los análisis</td>
</tr>
</tbody>
</table></figure>
<p>Revisar los logs de manera sistemática permite detectar y responder rápidamente a posibles incidentes de seguridad.</p>
<h3 id="recursos-adicionales" tabindex="-1">Recursos adicionales</h3>
<p>Si quieres ampliar tus conocimientos, aquí tienes algunos recursos recomendados:</p>
<ul>
<li><strong>Recursos en español</strong>: El blog <a href="https://dondeaprendoaws.com/">Dónde Aprendo AWS</a> incluye guías detalladas sobre servicios de AWS, con tutoriales específicos sobre seguridad y monitorización.</li>
<li><strong>Herramientas de análisis</strong>: CloudWatch es una herramienta avanzada que puede complementar el análisis de logs de acceso.</li>
<li><strong><a href="https://dondeaprendoaws.com/blog/aprender-aws-gratis-recursos-y-comunidad/">Comunidad AWS</a></strong>: Los grupos de usuarios de AWS en España y Latinoamérica son excelentes para compartir experiencias y aprender <a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">mejores prácticas</a>.</li>
</ul>
<p>Establece una rutina para revisar tus logs combinando herramientas automatizadas como CloudWatch con revisiones manuales. Además, considera participar en comunidades de AWS para mantenerte al día y mejorar la seguridad operativa de tu infraestructura.</p>
<h2>Publicaciones de blog relacionadas</h2><ul><li><a href="https://dondeaprendoaws.com/blog/aws-fundamentos-guia-de-inicio-rapido/">AWS Fundamentos: Guía de Inicio Rápido</a></li><li><a href="https://dondeaprendoaws.com/blog/como-utilizar-elasticsearch-en-aws/">Cómo Utilizar ElasticSearch en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">Mejores Prácticas de Observabilidad en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/estrategias-de-correlacion-de-eventos-aws/">Estrategias de Correlación de Eventos AWS</a></li></ul>