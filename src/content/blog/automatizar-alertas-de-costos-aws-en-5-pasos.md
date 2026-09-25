---
title: "Automatizar Alertas de Costos AWS en 5 Pasos"
description: "Aprende a configurar alertas automáticas de costos en AWS en solo 5 pasos y evita sorpresas en tus facturas."
publishedAt: "2024-10-27"
publishedTimestamp: "2024-10-27T03:38:07.454Z"
cover: "/assets/blog/cd540f6b1441905ad2c6859c.webp"
coverAlt: "Thumbnail for: Automatizar Alertas de Costos AWS en 5 Pasos"
ogImage: "/assets/blog/cd540f6b1441905ad2c6859c.webp"
related:
  - title: "Guía de Eventos AWS Educate 2024"
    url: "https://dondeaprendoaws.com/blog/guia-de-eventos-aws-educate-2024/"
    image: "/assets/blog/835302183289e4165c02383b.jpg"
    imageAlt: ""
  - title: "Guía de Estudio AWS Certified Cloud Practitioner CLF-C02"
    url: "https://dondeaprendoaws.com/blog/guia-de-estudio-aws-certified-cloud-practitioner-clf-c02/"
    image: "/assets/blog/9ee272960332ab17524d1056.jpg"
    imageAlt: ""
  - title: "Observabilidad en AWS con Amazon X-Ray"
    url: "https://dondeaprendoaws.com/blog/observabilidad-en-aws-con-amazon-x-ray/"
    image: "/assets/blog/9c1a2ce4c93fa5462aba7299.jpg"
    imageAlt: ""
---

<p>¿Cansado de facturas sorpresa en AWS? Aquí tienes la solución paso a paso para configurar alertas automáticas que te avisarán antes de que tus costos se disparen.</p>


<p><strong>Lo que aprenderás:</strong></p>


<ul>
<li>Configurar <a href="https://aws.amazon.com/aws-cost-management/aws-budgets/" rel="noopener noreferrer" target="_blank">AWS Budgets</a> para monitorear gastos</li>
<li>Crear alertas automáticas vía email y Slack</li>
<li>Automatizar respuestas con Lambda</li>
<li>Recibir notificaciones en tiempo real</li>
</ul>


<p><strong>Herramientas necesarias:</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Propósito</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS Budgets</td>
<td>Monitoreo de costos</td>
</tr>
<tr>
<td>SNS</td>
<td>Envío de alertas</td>
</tr>
<tr>
<td><a href="https://docs.aws.amazon.com/chatbot/" rel="noopener noreferrer" target="_blank">AWS Chatbot</a></td>
<td>Notificaciones Slack</td>
</tr>
<tr>
<td>Lambda</td>
<td>Automatización</td>
</tr>
<tr>
<td>CloudWatch</td>
<td>Métricas y logs</td>
</tr>
</tbody>
</table></figure>


<p><strong>Tiempo de configuración:</strong> 30 minutos</p>


<p>Los 5 pasos son:</p>


<ol>
<li><a href="https://dondeaprendoaws.com/blog/seguridad-y-control-de-costos-en-aws-guia-2024/">Configurar AWS Budgets</a></li>
<li>Crear tema SNS</li>
<li>Configurar AWS Chatbot</li>
<li>Agregar función Lambda</li>
<li>Probar la configuración</li>
</ol>


<blockquote>
<p><strong>Dato clave:</strong> Las alertas se actualizan cada 8-12 horas y pueden reducir tus costos hasta un 30%.</p>
</blockquote>


<p>¿Necesitas más ayuda? Sigue leyendo la guía completa paso a paso.</p>


<h2 class="sb" id="related-video-from-youtube" tabindex="-1">Related video from YouTube</h2>


<iframe allowfullscreen="" loading="lazy" src="https://www.youtube-nocookie.com/embed/4MIHYLeW6v0" title="Video de YouTube"></iframe>
<h2 class="sb" id="%C2%BFpor-qu%C3%A9-monitorear-los-costos-de-aws%3F" tabindex="-1">¿Por Qué Monitorear los Costos de AWS?</h2>


<p>Los <a href="https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/">costos de AWS</a> se dividen en 4 categorías básicas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Categoría</th>
<th>Lo Que Incluye</th>
</tr>
</thead>
<tbody>
<tr>
<td>Cómputo</td>
<td>EC2, Lambda y servicios similares</td>
</tr>
<tr>
<td>Almacenamiento</td>
<td>S3, EBS y otros servicios de datos</td>
</tr>
<tr>
<td>Transferencia</td>
<td>Tráfico entre regiones y hacia internet</td>
</tr>
<tr>
<td>Otros</td>
<td>Todo <a href="https://dondeaprendoaws.com/blog/aws-seguridad-servicios-esenciales/">servicio adicional de AWS</a></td>
</tr>
</tbody>
</table></figure>


<p>Sin monitoreo, tu factura puede dispararse sin que te des cuenta. Es como dejar el grifo abierto - el agua sigue corriendo (y cobrándose) hasta que alguien lo nota.</p>


<h2 class="sb" id="%C2%BFpor-qu%C3%A9-necesitas-alertas-autom%C3%A1ticas%3F" tabindex="-1">¿Por Qué Necesitas Alertas Automáticas?</h2>


<p>Las alertas son como tener un guardia personal para tus costos de AWS:</p>


<ul>
<li>Detectan aumentos de gastos ANTES de que se salgan de control</li>
<li>Te permiten actuar RÁPIDO cuando hay problemas</li>
</ul>


<p>AWS Budgets te da información actualizada 3 veces al día. Cada 8-12 horas sabrás exactamente cuánto estás gastando.</p>


<h2 class="sb" id="lo-que-necesitas-para-empezar" tabindex="-1">Lo Que Necesitas Para Empezar</h2>


<p>Para poner alertas necesitas:</p>


<ul>
<li>Una <a href="https://dondeaprendoaws.com/blog/aws-gratis-para-educadores-y-estudiantes/">cuenta AWS</a> con acceso a Billing</li>
<li>AWS Budgets para poner límites</li>
<li><a href="https://docs.aws.amazon.com/sns/" rel="noopener noreferrer" target="_blank">Amazon SNS</a> para recibir avisos</li>
<li>Permisos IAM para ver la facturación</li>
</ul>


<blockquote>
<p>"Con AWS Budgets puedes ver tus costos de tres formas: sin mezclar, amortizados o mezclados. También puedes incluir o quitar cargos como descuentos, reembolsos, soporte e impuestos."</p>
</blockquote>


<p>Las alertas saltan cuando tus gastos (actuales o proyectados) pasan cierto límite. Te avisan por email o por apps como Slack o <a href="https://aws.amazon.com/chime/" rel="noopener noreferrer" target="_blank">Amazon Chime</a>.</p>


<h2 class="sb" id="antes-de-empezar" tabindex="-1">Antes de Empezar</h2>


<p>Para crear alertas de <a href="https://dondeaprendoaws.com/blog/ahorro-de-costos-en-aws-con-instancias-reservadas-y-savings-plans/">costos en AWS</a>, necesitas estos elementos básicos:</p>


<h3 id="activa-las-alertas-en-tu-cuenta-aws" tabindex="-1">Activa las Alertas en tu Cuenta AWS</h3>


<p>Ve a la consola de facturación y activa las alertas:</p>


<ol>
<li><strong>Abre la consola AWS</strong></li>
<li><strong>Ve a Facturación</strong></li>
<li><strong>Activa "Alertas de facturación"</strong></li>
</ol>


<blockquote>
<p>IMPORTANTE: AWS tarda 15 minutos en procesar los datos después de activar las alertas por primera vez.</p>
</blockquote>


<h3 id="permisos-que-necesitas" tabindex="-1">Permisos que Necesitas</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Permiso</th>
<th>Para Qué Sirve</th>
</tr>
</thead>
<tbody>
<tr>
<td>budgets:*</td>
<td>Crear y editar presupuestos</td>
</tr>
<tr>
<td>sns:*</td>
<td>Enviar notificaciones</td>
</tr>
<tr>
<td>cloudwatch:*</td>
<td>Ver métricas y datos</td>
</tr>
<tr>
<td>billing:ViewBilling</td>
<td>Acceder a la facturación</td>
</tr>
</tbody>
</table></figure>


<h3 id="qu%C3%A9-puedes-hacer-con-aws-budgets" tabindex="-1">Qué Puedes Hacer con <a href="https://aws.amazon.com/aws-cost-management/aws-budgets/" rel="noopener noreferrer" target="_blank">AWS Budgets</a></h3>


<p><figure><img alt="AWS Budgets" src="/assets/blog/eb54faeb5dcf73d332a370df.jpg"/></figure></p>


<p>AWS Budgets es como tu contador personal. Te permite:</p>


<ul>
<li>Ver gastos actuales y futuros</li>
<li>Poner límites de gastos</li>
<li>Configurar 5 alertas por presupuesto</li>
<li>Revisar gastos por servicio</li>
</ul>


<h3 id="tus-herramientas-base" tabindex="-1">Tus Herramientas Base</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>¿Para Qué?</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS Console</td>
<td>Control principal</td>
</tr>
<tr>
<td>AWS CLI</td>
<td>Automatizar tareas</td>
</tr>
<tr>
<td>SNS</td>
<td>Recibir alertas</td>
</tr>
<tr>
<td>CloudWatch</td>
<td>Ver datos de uso</td>
</tr>
</tbody>
</table></figure>


<p>Antes de empezar, mira tus gastos de los últimos meses. Así podrás crear límites que tengan sentido para tu caso.</p>


<blockquote>
<p>"AWS Cost Management te ayuda a controlar y reducir tus gastos en AWS"</p>
</blockquote>


<p>¿Buscas más información? Visita <a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a>.</p>


<h2 class="sb" id="paso-1%3A-configura-aws-budgets" tabindex="-1">Paso 1: Configura AWS Budgets</h2>


<p>AWS Budgets te ayuda a controlar tus gastos en la nube. Así es como funciona:</p>


<h3 id="crea-tu-primer-presupuesto" tabindex="-1">Crea tu Primer Presupuesto</h3>


<p>Ve a la consola de AWS Cost Management (https://console.aws.amazon.com/cost-management/home) y haz clic en "Budgets".</p>


<p>Necesitas definir estos elementos básicos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Campo</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Tipo</td>
<td>Elige "Presupuesto de costos"</td>
</tr>
<tr>
<td>Nombre</td>
<td>Usa algo simple y descriptivo</td>
</tr>
<tr>
<td>Período</td>
<td>Mensual es lo más común</td>
</tr>
<tr>
<td>Método</td>
<td>Fijo para empezar</td>
</tr>
</tbody>
</table></figure>


<h3 id="configura-tus-alertas" tabindex="-1">Configura tus Alertas</h3>


<p>AWS te deja crear 5 alertas por presupuesto:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Alerta</th>
<th>Se Activa</th>
</tr>
</thead>
<tbody>
<tr>
<td>Costo Actual</td>
<td>Cuando llegas a un monto específico</td>
</tr>
<tr>
<td>Costo Previsto</td>
<td>Si AWS proyecta que te pasarás</td>
</tr>
<tr>
<td>Uso</td>
<td>Al alcanzar % del presupuesto</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>Las alertas se actualizan cada 8-12 horas, hasta 3 veces por día</p>
</blockquote>


<h3 id="personaliza-con-filtros" tabindex="-1">Personaliza con Filtros</h3>


<p>Los filtros te ayudan a ver exactamente dónde va tu dinero:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Filtro</th>
<th>Monitorea</th>
</tr>
</thead>
<tbody>
<tr>
<td>Servicios</td>
<td>Gastos por servicio</td>
</tr>
<tr>
<td>Cuentas</td>
<td>Costos por cuenta</td>
</tr>
<tr>
<td>Etiquetas</td>
<td>Gastos por proyecto</td>
</tr>
<tr>
<td>Regiones</td>
<td>Costos por región</td>
</tr>
</tbody>
</table></figure>


<p>Mi consejo: Empieza con un filtro para tu servicio AWS más usado. Después, ajusta según lo que necesites.</p>


<p>¿Quieres aprender más? Visita <a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a>.</p>


<h2 class="sb" id="paso-2%3A-crear-tema-sns" tabindex="-1">Paso 2: Crear Tema SNS</h2>


<p>AWS Budgets necesita un tema SNS para enviar alertas. Aquí te explico cómo configurarlo:</p>


<p>Abre la consola SNS (https://console.aws.amazon.com/sns/v3/home) y crea un nuevo tema con estos datos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Campo</th>
<th>Valor</th>
</tr>
</thead>
<tbody>
<tr>
<td>Tipo</td>
<td>Estándar</td>
</tr>
<tr>
<td>Nombre</td>
<td>budget-alert</td>
</tr>
<tr>
<td>Mostrar nombre</td>
<td>Alertas de Presupuesto</td>
</tr>
</tbody>
</table></figure>


<p>Para que AWS Budgets pueda enviar mensajes, añade esta política:</p>


<pre><code class="language-json">{
  "Sid": "PermisosPublicacionBudgets",
  "Effect": "Allow",
  "Principal": {
    "Service": "budgets.amazonaws.com"
  },
  "Action": "SNS:Publish",
  "Resource": "tu-arn-del-tema"
}
</code></pre>


<blockquote>
<p><strong>Nota</strong>: Usa el ARN de tu tema en lugar de "tu-arn-del-tema".</p>
</blockquote>


<h3 id="configuraci%C3%B3n-de-seguridad" tabindex="-1">Configuración de Seguridad</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Configuración</th>
</tr>
</thead>
<tbody>
<tr>
<td>Cifrado</td>
<td>Habilitar KMS</td>
</tr>
<tr>
<td>Acceso</td>
<td>Solo misma cuenta</td>
</tr>
<tr>
<td>Permisos</td>
<td>Solo servicios AWS necesarios</td>
</tr>
</tbody>
</table></figure>


<p>No uses datos personales en los nombres de temas SNS - estos aparecen en CloudWatch Logs.</p>


<p>El tema SNS debe estar en la misma cuenta que tus presupuestos AWS. No funciona entre cuentas diferentes.</p>


<h2 class="sb" id="paso-3%3A-configurar-aws-chatbot" tabindex="-1">Paso 3: Configurar <a href="https://docs.aws.amazon.com/chatbot/" rel="noopener noreferrer" target="_blank">AWS Chatbot</a></h2>


<p><figure><img alt="AWS Chatbot" src="/assets/blog/f87ee49ed6190a5041bb7b84.jpg"/></figure></p>


<p>AWS Chatbot envía alertas de costos a Slack o Amazon Chime. Es más práctico que revisar el correo.</p>


<h3 id="configurar-canales" tabindex="-1">Configurar Canales</h3>


<p>Para Slack:</p>


<ul>
<li>Abre tu canal</li>
<li>Escribe <code class="inline-code">**invite @aws**</code></li>
<li>Guarda el ID del canal</li>
</ul>


<p>Para Amazon Chime:</p>


<ul>
<li>Crea un webhook</li>
<li>Guarda la URL</li>
<li>Configúralo en AWS Chatbot</li>
</ul>


<h3 id="conectar-tu-chat" tabindex="-1">Conectar tu Chat</h3>


<p>1. <strong>Inicia AWS Chatbot</strong></p>


<p>Ve a la consola y selecciona "Configurar nuevo canal". Elige entre Slack o Chime.</p>


<p>2. <strong>Conecta tu Workspace</strong></p>


<p>Da permisos a AWS Chatbot, selecciona el canal para alertas y conéctalo al tema SNS.</p>


<blockquote>
<p>"Con AWS Chatbot en Slack monitoreamos AWS sin salir de nuestros canales" - Kurt Kufeld, VP de AWS Platform</p>
</blockquote>


<h3 id="permisos-b%C3%A1sicos" tabindex="-1">Permisos Básicos</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Permiso</th>
<th>Para qué sirve</th>
<th>¿Lo necesito?</th>
</tr>
</thead>
<tbody>
<tr>
<td>ReadOnlyAccess</td>
<td>Ver servicios AWS</td>
<td>Sí</td>
</tr>
<tr>
<td>CloudWatchReadOnlyAccess</td>
<td>Ver métricas</td>
<td>Sí</td>
</tr>
<tr>
<td>NotificationPermissions</td>
<td>Recibir alertas</td>
<td>Sí</td>
</tr>
</tbody>
</table></figure>


<p><strong>Para más seguridad:</strong></p>


<ul>
<li>Usa roles IAM específicos</li>
<li>Da solo los permisos necesarios</li>
<li>Evita datos sensibles en canales públicos</li>
</ul>


<blockquote>
<p>"Usamos AWS Chatbot para ver despliegues, infraestructura y rendimiento directo en Slack" - Kentaro Suzuki, LIFULL Co., Ltd.</p>
</blockquote>


<p>Las alertas llegarán cuando los gastos pasen los límites de AWS Budgets.</p>


<h2 class="sb" id="paso-4%3A-agregar-funci%C3%B3n-lambda" tabindex="-1">Paso 4: Agregar Función Lambda</h2>


<p>Lambda procesa alertas de AWS Budgets y toma acciones cuando los costos exceden los límites establecidos.</p>


<h3 id="crear-la-funci%C3%B3n" tabindex="-1">Crear la Función</h3>


<p>1. <strong>Configuración inicial</strong></p>


<p>Ve a la consola de AWS Lambda y crea una nueva función:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Campo</th>
<th>Valor</th>
</tr>
</thead>
<tbody>
<tr>
<td>Nombre</td>
<td>budget-alert-notifier</td>
</tr>
<tr>
<td>Runtime</td>
<td>Python 3.12</td>
</tr>
<tr>
<td>Timeout</td>
<td>1 minuto</td>
</tr>
<tr>
<td>Permisos</td>
<td>GetCostAndUsage, SNSPublish</td>
</tr>
</tbody>
</table></figure>


<p>2. <strong>Código Python</strong></p>


<pre><code class="language-python">import boto3
import json
import requests
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

def lambda_handler(event, context):
    ce = boto3.client('ce')
    current_date = (datetime.today()).strftime('%Y-%m-%d')
    start_date = datetime.today().replace(day=1)
    end_date = (start_date + relativedelta(months=1) - timedelta(days=1)).strftime('%Y-%m-%d')

    forecast = ce.get_cost_forecast(
        TimePeriod={
            'Start': current_date,
            'End': end_date
        },
        Metric='UNBLENDED_COST',
        Granularity='MONTHLY',
        PredictionIntervalLevel=80
    )

    forecast_amount = float(forecast['Total']['Amount'])
    date = (datetime.today() - relativedelta(months=1)).strftime('%B-%Y')
    amount = "{:.2f}".format(forecast_amount)

    print('Pronóstico de facturación AWS para {} es ${}'.format(date, amount))
</code></pre>


<h3 id="activadores-y-permisos" tabindex="-1">Activadores y Permisos</h3>


<p>La función se activa por:</p>


<ul>
<li>Mensajes de SNS</li>
<li>Eventos diarios de CloudWatch</li>
<li>Alertas de AWS Budgets</li>
</ul>


<p><strong>Permisos clave:</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Permiso</th>
<th>Propósito</th>
</tr>
</thead>
<tbody>
<tr>
<td>GetCostAndUsage</td>
<td>Acceso a datos de costos</td>
</tr>
<tr>
<td>SNSPublish</td>
<td>Envío de notificaciones</td>
</tr>
<tr>
<td>CloudWatchLogs</td>
<td>Registro de eventos</td>
</tr>
</tbody>
</table></figure>


<p>La función puede enviar datos a Slack, crear registros en CloudWatch y publicar en SNS.</p>


<blockquote>
<p>"Las alertas automáticas en Slack nos ayudan a detectar y responder a picos de costos más rápido" - Kentaro Suzuki, LIFULL Co., Ltd.</p>
</blockquote>


<h2 class="sb" id="paso-5%3A-probar-la-configuraci%C3%B3n" tabindex="-1">Paso 5: Probar la Configuración</h2>


<p>¿Cómo saber si tus alertas funcionan? Vamos a comprobarlo.</p>


<h3 id="verificar-los-mensajes-de-alerta" tabindex="-1">Verificar los Mensajes de Alerta</h3>


<p>Aquí está lo que necesitas hacer:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Acción</th>
<th>Tiempo</th>
<th>Resultado</th>
</tr>
</thead>
<tbody>
<tr>
<td>Crear alerta de prueba</td>
<td>15 min</td>
<td>Ver datos de facturación</td>
</tr>
<tr>
<td>Enviar prueba SNS</td>
<td>8-12h</td>
<td>Actualización en Budgets</td>
</tr>
<tr>
<td>Revisar CloudWatch</td>
<td>Al momento</td>
<td>Estado de alarmas</td>
</tr>
</tbody>
</table></figure>


<h3 id="ajustar-todo" tabindex="-1">Ajustar Todo</h3>


<p>1. <strong>La Región es Clave</strong></p>


<p>Tus alarmas de facturación DEBEN estar en US East (N. Virginia). ¿Por qué? Es donde AWS guarda todos los datos de facturación.</p>


<p>2. <strong>Configura los Límites</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Alerta</th>
<th>Límite</th>
</tr>
</thead>
<tbody>
<tr>
<td>Gastos Actuales</td>
<td>80% del presupuesto</td>
</tr>
<tr>
<td>Gastos Previstos</td>
<td>90% del presupuesto</td>
</tr>
<tr>
<td>Alertas por Día</td>
<td>Activadas</td>
</tr>
</tbody>
</table></figure>


<p>3. <strong>Revisa los Permisos</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Permiso</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS Budgets</td>
<td>GetCostAndUsage</td>
</tr>
<tr>
<td>SNS</td>
<td>PublishMessage</td>
</tr>
<tr>
<td>CloudWatch</td>
<td>PutMetricAlarm</td>
</tr>
</tbody>
</table></figure>


<h3 id="%C3%BAltima-revisi%C3%B3n" tabindex="-1">Última Revisión</h3>


<p>Haz una comprobación rápida:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Parte</th>
<th>Qué Revisar</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS Budgets</td>
<td>Límites y filtros</td>
</tr>
<tr>
<td>SNS</td>
<td>Suscripciones</td>
</tr>
<tr>
<td>Lambda</td>
<td>Logs</td>
</tr>
<tr>
<td>CloudWatch</td>
<td>Alarmas</td>
</tr>
</tbody>
</table></figure>


<p>¿Necesitas cambiar algo? Ve a CloudWatch &gt; Alarmas &gt; Acciones &gt; Modificar.</p>


<p>Las alertas de Budgets se actualizan 3 veces al día. Si algo falla, revisa:</p>


<ul>
<li>SNS: ¿Las suscripciones están activas?</li>
<li>Lambda: ¿Los logs muestran errores?</li>
<li>IAM: ¿Los permisos están correctos?</li>
</ul>


<h2 class="sb" id="recursos-adicionales" tabindex="-1">Recursos Adicionales</h2>


<h3 id="herramientas-de-aws" tabindex="-1">Herramientas de AWS</h3>


<p>AWS ofrece 3 herramientas principales para controlar tus gastos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>¿Qué hace?</th>
<th>Frecuencia</th>
</tr>
</thead>
<tbody>
<tr>
<td>Cost Explorer</td>
<td>Ve tus gastos de los últimos 13 meses</td>
<td>Actualización diaria</td>
</tr>
<tr>
<td>Trusted Advisor</td>
<td>Chequea costos y performance</td>
<td>Actualización semanal</td>
</tr>
<tr>
<td>Billing Console</td>
<td>Muestra tu facturación actual</td>
<td>Cada 8-12h</td>
</tr>
</tbody>
</table></figure>


<h3 id="aprende-m%C3%A1s" tabindex="-1">Aprende Más</h3>


<p>¿Buscas dominar la <a href="https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/">gestión de costos en AWS</a>? Visita <a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a>.</p>


<p>Encontrarás:</p>


<ul>
<li>Guías paso a paso</li>
<li>Ejemplos del mundo real</li>
<li>Tips de optimización</li>
</ul>


<h3 id="herramientas-extra" tabindex="-1">Herramientas Extra</h3>


<p>Estas herramientas te ayudarán a controlar mejor tus gastos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Beneficio</th>
<th>Aplicación</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://www.nops.io/" rel="noopener noreferrer" target="_blank">nOps</a></td>
<td>Corta gastos hasta 50% usando ML</td>
<td>Análisis automático</td>
</tr>
<tr>
<td>Pricing Calculator</td>
<td>Calcula costos futuros</td>
<td>Planificación</td>
</tr>
<tr>
<td>Cost Anomaly Detection</td>
<td>Encuentra gastos raros</td>
<td>Monitoreo</td>
</tr>
</tbody>
</table></figure>


<p><strong>Tips Clave:</strong></p>


<ul>
<li>Mira Cost Explorer cada semana</li>
<li>Usa tus 2 presupuestos gratis por cuenta</li>
<li>Configura CloudWatch cada 15 minutos</li>
</ul>


<p><strong>Datos que debes saber:</strong></p>


<ul>
<li>Las alertas de facturación se refrescan cada 8-12h</li>
<li>Los datos de facturación viven en US East (N. Virginia)</li>
<li>CloudWatch te muestra gastos globales</li>
</ul>


<h2 class="sb" id="consejos-y-recordatorios" tabindex="-1">Consejos y Recordatorios</h2>


<h3 id="protege-tu-infraestructura" tabindex="-1">Protege tu Infraestructura</h3>


<p>AWS necesita controles de seguridad básicos. Aquí están los puntos clave:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Control</th>
<th>Qué Hacer</th>
<th>Cuándo</th>
</tr>
</thead>
<tbody>
<tr>
<td>IAM</td>
<td>Revisar permisos</td>
<td>1 vez al mes</td>
</tr>
<tr>
<td>Alertas</td>
<td>Verificar receptores</td>
<td>Cada 15 días</td>
</tr>
<tr>
<td>SNS</td>
<td>Revisar suscripciones</td>
<td>1 vez al mes</td>
</tr>
</tbody>
</table></figure>


<h3 id="controla-tus-gastos" tabindex="-1">Controla tus Gastos</h3>


<p>Los números son claros: el 94% de empresas paga más por almacenamiento. Y para el 54%, estos costos crecen más que su factura total.</p>


<p>Tres formas de reducir gastos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Método</th>
<th>Cuánto Ahorras</th>
<th>Dónde Aplicar</th>
</tr>
</thead>
<tbody>
<tr>
<td>Auto-apagado</td>
<td>65%</td>
<td>Servidores no críticos</td>
</tr>
<tr>
<td>Borrar snapshots</td>
<td>Varía</td>
<td>Backups viejos</td>
</tr>
<tr>
<td>Usar spots</td>
<td>50-90%</td>
<td>Cargas flexibles</td>
</tr>
</tbody>
</table></figure>


<h3 id="monitoreo-que-funciona" tabindex="-1">Monitoreo que Funciona</h3>


<p>Sigue este calendario simple:</p>


<ul>
<li><strong>Diario</strong>: Lee tus alertas</li>
<li><strong>Semanal</strong>: Mira Cost Explorer</li>
<li><strong>Mensual</strong>: Cambia límites si hace falta</li>
<li><strong>Trimestral</strong>: Corre <a href="https://docs.aws.amazon.com/awssupport/latest/user/trusted-advisor.html" rel="noopener noreferrer" target="_blank">AWS Trusted Advisor</a></li>
</ul>


<p>Configura tus alertas así:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Alerta</th>
<th>Momento</th>
<th>Propósito</th>
</tr>
</thead>
<tbody>
<tr>
<td>25%</td>
<td>Día 1</td>
<td>Ver problemas pronto</td>
</tr>
<tr>
<td>50%</td>
<td>Día 15</td>
<td>Medir velocidad de gasto</td>
</tr>
<tr>
<td>75%</td>
<td>Día 20</td>
<td>Evitar sobrecostos</td>
</tr>
</tbody>
</table></figure>


<p><strong>Dato clave</strong>: AWS pide 5 semanas de datos para hacer predicciones exactas.</p>


<blockquote>
<p>"Los datos de facturación en AWS, base del sistema Budgets, se refrescan mínimo una vez al día" - AWS Documentation</p>
</blockquote>


<h2 class="sb" id="solucionar-problemas-frecuentes" tabindex="-1">Solucionar Problemas Frecuentes</h2>


<h3 id="alertas-no-recibidas" tabindex="-1">Alertas No Recibidas</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Problema</th>
<th>Por Qué Ocurre</th>
<th>Qué Hacer</th>
</tr>
</thead>
<tbody>
<tr>
<td>Emails no llegan</td>
<td>SNS sin permisos</td>
<td>Verificar IAM</td>
</tr>
<tr>
<td>Alertas lentas</td>
<td>Datos se actualizan cada 24h</td>
<td>Esperar al siguiente ciclo</td>
</tr>
<tr>
<td>Alertas incorrectas</td>
<td>Umbrales no ajustados</td>
<td>Modificar límites</td>
</tr>
</tbody>
</table></figure>


<h3 id="problemas-de-conexi%C3%B3n" tabindex="-1">Problemas de Conexión</h3>


<p>¿Tu sistema no funciona? Aquí están los errores más comunes:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Sistema</th>
<th>Qué Falla</th>
<th>Cómo Arreglarlo</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS Budgets</td>
<td>No ve métricas</td>
<td>Habilitar Cost Explorer</td>
</tr>
<tr>
<td>SNS</td>
<td>Mensajes no enviados</td>
<td>Verificar suscripciones</td>
</tr>
<tr>
<td>CloudWatch</td>
<td>Sin permisos</td>
<td>Agregar <code class="inline-code">iam:PassRole</code></td>
</tr>
</tbody>
</table></figure>


<h3 id="ajustes-correctos" tabindex="-1">Ajustes Correctos</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Qué Revisar</th>
<th>Qué Buscar</th>
<th>Cada Cuándo</th>
</tr>
</thead>
<tbody>
<tr>
<td>Permisos</td>
<td>Roles y políticas</td>
<td>1 vez al mes</td>
</tr>
<tr>
<td>Avisos</td>
<td>SNS y emails</td>
<td>Cada 15 días</td>
</tr>
<tr>
<td>Métricas</td>
<td>Datos de costos</td>
<td>Cada semana</td>
</tr>
</tbody>
</table></figure>


<p><strong>Historia Real</strong>: El equipo de <a href="https://www.lawnstarter.com/" rel="noopener noreferrer" target="_blank">LawnStarter</a> no recibía alertas. ¿El problema? Cost Explorer estaba apagado. Al encenderlo, cortaron sus gastos de storage a la mitad.</p>


<blockquote>
<p>"Revisa tus gastos contra el presupuesto, busca patrones raros y cambia las alertas si hace falta" - AWS Docs</p>
</blockquote>


<p><strong>Dato Importante</strong>: AWS necesita 5 semanas de datos para predecir gastos. Si tus alertas de predicción no funcionan, dale tiempo.</p>


<p>3 Tips para evitar problemas:</p>


<ul>
<li>Pon alertas al 10% para ver problemas pronto</li>
<li>Usa email Y Slack para avisos</li>
<li>Revisa todo cada semana</li>
</ul>


<h2 class="sb" id="gu%C3%ADa-de-referencia" tabindex="-1">Guía de Referencia</h2>


<p>¿Necesitas configurar el control de gastos en AWS? Aquí tienes todo lo que necesitas saber:</p>


<h3 id="herramientas-principales" tabindex="-1">Herramientas Principales</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>¿Para qué sirve?</th>
<th>¿Cuándo usarla?</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS Budgets</td>
<td>Control de gastos</td>
<td>Para no pasarte del presupuesto</td>
</tr>
<tr>
<td>SNS</td>
<td>Envío de alertas</td>
<td>Cuando quieras recibir avisos</td>
</tr>
<tr>
<td>CloudWatch</td>
<td>Ver el uso</td>
<td>Para monitorear recursos</td>
</tr>
<tr>
<td>Cost Explorer</td>
<td>Análisis de costos</td>
<td>Para entender tus gastos</td>
</tr>
</tbody>
</table></figure>


<h3 id="comandos-b%C3%A1sicos" tabindex="-1">Comandos Básicos</h3>


<p>¿Quieres automatizar? Usa estos comandos:</p>


<pre><code class="language-json">{
    "BudgetLimit": {
        "Amount": "100",
        "Unit": "USD"
    },
    "BudgetName": "Presupuesto Mensual",
    "BudgetType": "COST",
    "TimeUnit": "MONTHLY"
}
</code></pre>


<figure class="table"><table>
<thead>
<tr>
<th>Comando</th>
<th>¿Qué hace?</th>
<th>Ejemplo</th>
</tr>
</thead>
<tbody>
<tr>
<td><code class="inline-code">aws budgets create-budget</code></td>
<td>Crea un presupuesto</td>
<td><code class="inline-code">aws budgets create-budget --account-id 111122223333 --budget file://budget.json</code></td>
</tr>
<tr>
<td><code class="inline-code">aws budgets create-notification</code></td>
<td>Configura alertas</td>
<td><code class="inline-code">aws budgets create-notification --account-id 111122223333 --budget-name "Mi Presupuesto" --notification NotificationType=ACTUAL</code></td>
</tr>
<tr>
<td><code class="inline-code">aws budgets describe-budget</code></td>
<td>Muestra información</td>
<td><code class="inline-code">aws budgets describe-budget --account-id 111122223333 --budget-name "Mi Presupuesto"</code></td>
</tr>
</tbody>
</table></figure>


<h3 id="documentaci%C3%B3n-y-recursos" tabindex="-1">Documentación y Recursos</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Recurso</th>
<th>Contenido</th>
<th>Se actualiza</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS CLI</td>
<td>Comandos</td>
<td>Cada mes</td>
</tr>
<tr>
<td>API Budgets</td>
<td>Límites</td>
<td>Cada 3 meses</td>
</tr>
<tr>
<td>SDK AWS</td>
<td>Código</td>
<td>Cada mes</td>
</tr>
</tbody>
</table></figure>


<p><strong>Lo que debes saber:</strong></p>


<ul>
<li>Puedes añadir 1 tema SNS y hasta 10 emails por alerta</li>
<li>Las alertas tardan entre 8-12 horas en actualizarse</li>
<li>El umbral máximo es 1,000,000%</li>
</ul>


<blockquote>
<p>"Las alertas pueden tardar en llegar debido al proceso de facturación" - AWS Documentation</p>
</blockquote>


<p><strong>Importante</strong>: Los datos se refrescan hasta 3 veces por día, normalmente cada 8-12 horas.</p>


<h2 class="sb" id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="%C2%BFc%C3%B3mo-configurar-alertas-de-costos-en-aws%3F" tabindex="-1">¿Cómo configurar alertas de costos en AWS?</h3>


<p>AWS Budgets es la mejor opción para monitorear tus gastos en AWS. Es como tener un contador personal que vigila tus facturas 24/7.</p>


<p>Así funciona:</p>


<p>Los datos se refrescan hasta 3 veces al día. Cuando los costos suben más de lo normal, AWS te avisa por email (hasta 10 contactos) o mediante SNS.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Función</th>
<th>Detalle</th>
</tr>
</thead>
<tbody>
<tr>
<td>Actualizaciones</td>
<td>3 veces por día</td>
</tr>
<tr>
<td>Alertas por email</td>
<td>Hasta 10 contactos</td>
</tr>
<tr>
<td>Notificación SNS</td>
<td>1 tema por alerta</td>
</tr>
<tr>
<td>Datos para pronósticos</td>
<td>Mínimo 5 semanas</td>
</tr>
</tbody>
</table></figure>


<p>AWS Budgets te permite crear 4 tipos de alertas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo</th>
<th>¿Qué hace?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Costos</td>
<td>Mide gastos generales</td>
</tr>
<tr>
<td>Uso</td>
<td>Mide consumo por servicio</td>
</tr>
<tr>
<td>Instancias RI</td>
<td>Mide uso de instancias reservadas</td>
</tr>
<tr>
<td>Savings Plans</td>
<td>Mide uso de planes de ahorro</td>
</tr>
</tbody>
</table></figure>


<p>¿Por qué elegir AWS Budgets?</p>


<ul>
<li>Funciona con cuentas múltiples</li>
<li>Filtra por tags y servicios</li>
<li>Monitorea por mes, trimestre o año</li>
<li>Más opciones que las Alarmas de Facturación básicas</li>
</ul>


<blockquote>
<p>Nota: Para que las alertas predictivas funcionen, AWS necesita 5 semanas de datos históricos.</p>
</blockquote>


<p>Las alertas se disparan una vez por período si los costos actuales superan el límite. Para pronósticos, podrías recibir varias alertas si las proyecciones cambian.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/">Análisis de Costos de AWS con Cost Explorer</a></li><li><a href="https://dondeaprendoaws.com/blog/seguridad-y-control-de-costos-en-aws-guia-2024/">Seguridad y Control de Costos en AWS: Guía 2024</a></li><li><a href="https://dondeaprendoaws.com/blog/10-estrategias-de-optimizacion-de-costos-en-aws/">10 Estrategias de Optimización de Costos en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/gestion-de-facturacion-de-aws-guia-completa/">Gestión de Facturación de AWS: Guía Completa</a></li>
</ul>
</p>
