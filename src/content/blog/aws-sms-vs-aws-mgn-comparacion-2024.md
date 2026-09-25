---
title: "AWS SMS vs AWS MGN: Comparación 2024"
description: "Descubre las diferencias clave entre AWS SMS y AWS MGN para migraciones a la nube en 2024, y cuál es la mejor opción para tus necesidades."
publishedAt: "2024-10-28"
publishedTimestamp: "2024-10-28T02:54:04.742Z"
cover: "/assets/blog/bd5f26b73ef9b33625d04b90.webp"
coverAlt: "Thumbnail for: AWS SMS vs AWS MGN: Comparación 2024"
ogImage: "/assets/blog/bd5f26b73ef9b33625d04b90.webp"
related:
  - title: "Políticas de Control de Servicios (SCPs) en AWS"
    url: "https://dondeaprendoaws.com/blog/politicas-de-control-de-servicios-scps-en-aws/"
    image: "/assets/blog/ae0015b4c4fa992bfdc8c817.jpg"
    imageAlt: ""
  - title: "Cómo integrar los SDK de AWS en 7 pasos"
    url: "https://dondeaprendoaws.com/blog/como-integrar-los-sdk-de-aws-en-7-pasos/"
    image: "/assets/blog/056aaf4c9dbb90032443ee34.jpg"
    imageAlt: ""
  - title: "Aprender AWS gratis: Recursos y Comunidad"
    url: "https://dondeaprendoaws.com/blog/aprender-aws-gratis-recursos-y-comunidad/"
    image: "/assets/blog/c7227ae982494a7ce1620070.jpg"
    imageAlt: ""
---

<p>¿Necesitas migrar a AWS y no sabes qué servicio elegir? Aquí está la respuesta rápida:</p>


<p><strong><a href="https://docs.aws.amazon.com/mgn/" rel="noopener noreferrer" target="_blank">AWS MGN</a> es la mejor opción en 2024.</strong> SMS está en desuso y MGN ofrece:</p>


<ul>
<li>Migración más rápida (minutos vs horas)</li>
<li>Sin necesidad de agentes</li>
<li>90 días gratis ($0.042/hora después)</li>
<li><a href="https://www.andmore.dev/es/blog/getting-started-portman/">Pruebas automatizadas</a></li>
</ul>


<h2 class="sb" id="related-video-from-youtube" tabindex="-1">Related video from YouTube</h2>


<iframe allowfullscreen="" loading="lazy" src="https://www.youtube-nocookie.com/embed/JrmZA0hAo4Y" title="Video de YouTube"></iframe>
<h3 id="comparaci%C3%B3n-r%C3%A1pida" tabindex="-1">Comparación Rápida</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th><a href="https://docs.aws.amazon.com/es_es/whitepapers/latest/architecting-hipaa-security-and-compliance-on-aws/aws-server-migration-service.html" rel="noopener noreferrer" target="_blank">AWS SMS</a></th>
<th>AWS MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Estado</td>
<td>En desuso</td>
<td>Activo y recomendado</td>
</tr>
<tr>
<td>Tiempo de corte</td>
<td>Horas</td>
<td>Minutos</td>
</tr>
<tr>
<td>Costo inicial</td>
<td>Gratis 90 días</td>
<td>Gratis 90 días</td>
</tr>
<tr>
<td>Agente requerido</td>
<td>Sí</td>
<td>No</td>
</tr>
<tr>
<td>Pruebas</td>
<td>Manuales</td>
<td>Automáticas</td>
</tr>
<tr>
<td>Mejor para</td>
<td>&lt; 10 servidores</td>
<td>Apps completas</td>
</tr>
</tbody>
</table></figure>


<h3 id="%C2%BFcu%C3%A1ndo-usar-cada-uno%3F" tabindex="-1">¿Cuándo usar cada uno?</h3>


<p><strong>Usa SMS si:</strong></p>


<ul>
<li>Tienes menos de 10 servidores</li>
<li>No te importa el tiempo de inactividad</li>
<li>Prefieres migrar poco a poco</li>
</ul>


<p><strong>Usa MGN si:</strong></p>


<ul>
<li>Necesitas migrar aplicaciones críticas</li>
<li>Quieres mínimo tiempo de inactividad</li>
<li>Buscas pruebas automatizadas</li>
</ul>


<p><strong>Dato importante:</strong> AWS recomienda MGN para todas las migraciones nuevas desde 2023.</p>


<h2 class="sb" id="aws-server-migration-service-(sms)-b%C3%A1sico" tabindex="-1">AWS Server Migration Service (SMS) Básico</h2>


<h3 id="%C2%BFqu%C3%A9-es-sms%3F" tabindex="-1">¿Qué es SMS?</h3>


<p>SMS mueve tus servidores a AWS de forma automática. Es como tener un equipo de mudanza que trabaja 24/7 <strong>sin que tus aplicaciones dejen de funcionar</strong>.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Función</th>
<th>¿Qué hace?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Replicación</td>
<td>Copia servidores en vivo</td>
</tr>
<tr>
<td>Conversión</td>
<td>Los convierte en AMIs de AWS</td>
</tr>
<tr>
<td>Automatización</td>
<td>Todo el proceso es automático</td>
</tr>
<tr>
<td>Monitoreo</td>
<td>Ves el avance en tiempo real</td>
</tr>
</tbody>
</table></figure>


<h3 id="lo-que-sms-te-da" tabindex="-1">Lo que SMS te da</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Función</th>
<th>Ventaja</th>
</tr>
</thead>
<tbody>
<tr>
<td>Sin software extra</td>
<td>No instalas agentes</td>
</tr>
<tr>
<td>Copias inteligentes</td>
<td>Solo mueve lo que cambia</td>
</tr>
<tr>
<td>Migraciones en grupo</td>
<td>Mueve varios servidores juntos</td>
</tr>
<tr>
<td>Período de prueba</td>
<td>90 días para probar gratis</td>
</tr>
</tbody>
</table></figure>


<h3 id="d%C3%B3nde-sms-funciona-mejor" tabindex="-1">Dónde SMS funciona mejor</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Caso</th>
<th>Por qué SMS</th>
</tr>
</thead>
<tbody>
<tr>
<td>Migraciones grandes</td>
<td>Perfecto para cientos de servidores</td>
</tr>
<tr>
<td>Ambiente de pruebas</td>
<td>Prueba antes de mover todo</td>
</tr>
<tr>
<td>Copias de seguridad</td>
<td>Mantén respaldos en AWS</td>
</tr>
<tr>
<td>Sin parar operaciones</td>
<td>El negocio sigue funcionando</td>
</tr>
</tbody>
</table></figure>


<h3 id="lo-que-necesitas" tabindex="-1">Lo que necesitas</h3>


<p>Para empezar con SMS:</p>


<ul>
<li>Internet confiable</li>
<li>SMS Migration Connector</li>
<li>Sistemas compatibles:
<ul>
<li>Windows</li>
<li>Linux</li>
<li>Ubuntu</li>
<li>CentOS</li>
<li>RHEL</li>
</ul>
</li>
</ul>


<h3 id="restricciones" tabindex="-1">Restricciones</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Límite</th>
<th>Detalles</th>
</tr>
</thead>
<tbody>
<tr>
<td>Prueba gratis</td>
<td>90 días máximo</td>
</tr>
<tr>
<td>Sistemas</td>
<td>Solo ciertos servidores virtuales y físicos</td>
</tr>
<tr>
<td>Espacio</td>
<td>Depende de tu instancia</td>
</tr>
<tr>
<td>Migraciones a la vez</td>
<td>Varía por región</td>
</tr>
</tbody>
</table></figure>


<p><strong>Ejemplo real</strong>: Una empresa movió cientos de servidores y 350TB de datos en 5 semanas con SMS. Sus sistemas nunca se detuvieron.</p>


<h2 class="sb" id="aws-application-migration-service-(mgn)-b%C3%A1sico" tabindex="-1">AWS Application Migration Service (MGN) Básico</h2>


<h3 id="%C2%BFqu%C3%A9-hace-mgn%3F" tabindex="-1">¿Qué hace MGN?</h3>


<p>MGN es la <a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">herramienta de AWS</a> que mueve tus aplicaciones a la nube sin tocar su código. Es como hacer un clon exacto de tus servidores en AWS.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Función</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Replicación</td>
<td>Copia datos en tiempo real</td>
</tr>
<tr>
<td>Pruebas</td>
<td>Verifica todo antes del cambio final</td>
</tr>
<tr>
<td>Migración</td>
<td>Completa el cambio en minutos</td>
</tr>
<tr>
<td>Control</td>
<td>Reduce errores humanos</td>
</tr>
</tbody>
</table></figure>


<h3 id="c%C3%B3mo-funciona" tabindex="-1">Cómo funciona</h3>


<p>MGN hace 3 cosas principales:</p>


<ol>
<li><strong>Copia inicial</strong>: Hace una copia completa de tus servidores</li>
<li><strong>Sincronización</strong>: Mantiene todo actualizado en tiempo real</li>
<li><strong>Cambio final</strong>: Mueve todo a AWS en minutos</li>
</ol>


<h3 id="lo-que-necesitas-1" tabindex="-1">Lo que necesitas</h3>


<p>Para empezar con MGN:</p>


<ul>
<li>Un servidor Windows o Linux compatible</li>
<li>El agente MGN instalado</li>
<li>Conexión a internet que no falle</li>
<li>Espacio para el agente (muy pequeño)</li>
</ul>


<h3 id="n%C3%BAmeros-importantes" tabindex="-1">Números importantes</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Elemento</th>
<th>Límite</th>
</tr>
</thead>
<tbody>
<tr>
<td>Migraciones a la vez</td>
<td>20 por región</td>
</tr>
<tr>
<td>Servidores activos</td>
<td>150 por región</td>
</tr>
<tr>
<td>Total de servidores</td>
<td>4,000 por región</td>
</tr>
<tr>
<td>Días sin costo</td>
<td>90</td>
</tr>
<tr>
<td>Precio después</td>
<td>$0.042/hora/servidor</td>
</tr>
</tbody>
</table></figure>


<p><strong>Dato clave</strong>: MGN usa EC2 pequeñas como puente entre tus servidores y AWS.</p>


<h3 id="para-qu%C3%A9-se-usa" tabindex="-1">Para qué se usa</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Uso</th>
<th>¿Qué hace?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Migrar centro de datos</td>
<td>Mover todo a AWS</td>
</tr>
<tr>
<td>Crear respaldo</td>
<td>Tener copia en AWS</td>
</tr>
<tr>
<td>Ambiente de pruebas</td>
<td>Duplicar producción</td>
</tr>
<tr>
<td>Cambio entre nubes</td>
<td>Mover desde otros proveedores</td>
</tr>
</tbody>
</table></figure>


<h2 class="sb" id="sms-vs-mgn%3A-diferencias-clave" tabindex="-1">SMS vs MGN: Diferencias Clave</h2>


<p>¿Necesitas migrar a AWS pero no sabes qué servicio elegir? Aquí te explico las diferencias entre SMS y MGN.</p>


<h3 id="m%C3%A9todos-de-migraci%C3%B3n" tabindex="-1">Métodos de Migración</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>AWS SMS</th>
<th>AWS MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Enfoque</td>
<td>Servidor por servidor</td>
<td>Aplicaciones completas</td>
</tr>
<tr>
<td>Tipo</td>
<td>Replicación incremental</td>
<td>Replicación en tiempo real</td>
</tr>
<tr>
<td>Proceso</td>
<td>Manual con automatización</td>
<td>Automatizado end-to-end</td>
</tr>
<tr>
<td>Agente</td>
<td>Requiere instalación</td>
<td>Sin agente necesario</td>
</tr>
</tbody>
</table></figure>


<p>SMS es como mudar una casa mueble por mueble. MGN es como transportar la casa entera de una vez.</p>


<h3 id="velocidad-y-rendimiento" tabindex="-1">Velocidad y Rendimiento</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>AWS SMS</th>
<th>AWS MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Tiempo de corte</td>
<td>Horas</td>
<td>Minutos</td>
</tr>
<tr>
<td>Replicación</td>
<td>Por lotes</td>
<td>Continua</td>
</tr>
<tr>
<td>Pruebas</td>
<td>Manual</td>
<td>Automatizada</td>
</tr>
<tr>
<td>Sincronización</td>
<td>Programada</td>
<td>En tiempo real</td>
</tr>
</tbody>
</table></figure>


<p>MGN es <strong>MUCHO MÁS RÁPIDO</strong>. Mientras SMS toma horas, MGN completa el trabajo en minutos.</p>


<h3 id="precios" tabindex="-1">Precios</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Período gratuito</th>
<th>Costo después</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS SMS</td>
<td>90 días</td>
<td>Por GB transferido</td>
</tr>
<tr>
<td>AWS MGN</td>
<td>90 días</td>
<td>$0.042/hora/servidor</td>
</tr>
</tbody>
</table></figure>


<p>Ambos te dan 90 días gratis para probar. Después, pagas según lo que uses.</p>


<h3 id="opciones-de-soporte" tabindex="-1">Opciones de Soporte</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Soporte</th>
<th>AWS SMS</th>
<th>AWS MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Documentación</td>
<td>Básica</td>
<td>Extensa</td>
</tr>
<tr>
<td>Herramientas</td>
<td>CLI y Console</td>
<td>CLI, Console y APIs</td>
</tr>
<tr>
<td>Monitoreo</td>
<td>Básico</td>
<td>Avanzado</td>
</tr>
<tr>
<td>Automatización</td>
<td>Parcial</td>
<td>Total</td>
</tr>
</tbody>
</table></figure>


<p>MGN te da <strong>MÁS CONTROL</strong> y herramientas para gestionar tu migración.</p>


<h3 id="funciones-principales" tabindex="-1">Funciones Principales</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Función</th>
<th>AWS SMS</th>
<th>AWS MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Migración física a virtual</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>Migración virtual a virtual</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>Replicación continua</td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td>Pruebas automatizadas</td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td>Rollback automático</td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td>Migración sin agente</td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td>Migración por lotes</td>
<td>✓</td>
<td>❌</td>
</tr>
<tr>
<td>Programación de replicación</td>
<td>✓</td>
<td>❌</td>
</tr>
</tbody>
</table></figure>


<p>En pocas palabras: SMS es para migraciones simples de servidores individuales. MGN es para aplicaciones completas donde el tiempo de inactividad debe ser mínimo.</p>


<h2 class="sb" id="cu%C3%A1ndo-usar-cada-servicio" tabindex="-1">Cuándo Usar Cada Servicio</h2>


<p>SMS y MGN tienen sus puntos fuertes. Veamos cuándo usar cada uno.</p>


<h3 id="sms%3A-para-migraciones-controladas" tabindex="-1">SMS: Para Migraciones Controladas</h3>


<p>SMS brilla cuando necesitas:</p>


<ul>
<li>Migrar VMs una por una</li>
<li>Trabajar con <a href="https://www.vmware.com/" rel="noopener noreferrer" target="_blank">VMware</a> o <a href="https://en.wikipedia.org/wiki/Hyper-V" rel="noopener noreferrer" target="_blank">Hyper-V</a></li>
<li>Controlar los costos (pagas por GB)</li>
<li>Hacer migraciones sin prisa</li>
</ul>


<figure class="table"><table>
<thead>
<tr>
<th>Escenario</th>
<th>Beneficio</th>
</tr>
</thead>
<tbody>
<tr>
<td>VMs individuales</td>
<td>Control total del proceso</td>
</tr>
<tr>
<td>VMware/Hyper-V</td>
<td>Conexión directa</td>
</tr>
<tr>
<td>Migraciones lentas</td>
<td>Mejor control de costos</td>
</tr>
<tr>
<td>Presupuesto ajustado</td>
<td>Pago por uso</td>
</tr>
</tbody>
</table></figure>


<h3 id="mgn%3A-para-velocidad-y-escala" tabindex="-1">MGN: Para Velocidad y Escala</h3>


<p>MGN es tu mejor opción cuando tienes:</p>


<ul>
<li>Apps que no pueden parar</li>
<li>Muchos servidores para migrar</li>
<li>Necesidad de máxima seguridad</li>
<li>vCenter 6.7 o más nuevo</li>
</ul>


<figure class="table"><table>
<thead>
<tr>
<th>Escenario</th>
<th>Beneficio</th>
</tr>
</thead>
<tbody>
<tr>
<td>Apps críticas</td>
<td>Parada mínima</td>
</tr>
<tr>
<td>Migraciones grandes</td>
<td>Múltiples servidores a la vez</td>
</tr>
<tr>
<td>Alta seguridad</td>
<td><a href="https://docs.aws.amazon.com/vpc/latest/privatelink/what-is-privatelink.html" rel="noopener noreferrer" target="_blank">AWS PrivateLink</a></td>
</tr>
<tr>
<td>vCenter nuevo</td>
<td>Sin agentes</td>
</tr>
</tbody>
</table></figure>


<h3 id="gu%C3%ADa-r%C3%A1pida-de-selecci%C3%B3n" tabindex="-1">Guía Rápida de Selección</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Necesidad</th>
<th>SMS</th>
<th>MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Base datos alta I/O</td>
<td>❌</td>
<td>❌</td>
</tr>
<tr>
<td>VMs VMware</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>Apps complejas</td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td>Migración rápida</td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td>Servers físicos</td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td>Control de costos</td>
<td>✓</td>
<td>❌</td>
</tr>
<tr>
<td>Replicación 24/7</td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td>Tests automáticos</td>
<td>❌</td>
<td>✓</td>
</tr>
</tbody>
</table></figure>


<p><strong>Importante</strong>: Para bases de datos con mucha actividad, mejor usar <a href="https://docs.aws.amazon.com/dms/" rel="noopener noreferrer" target="_blank">AWS DMS</a>.</p>


<p><strong>Decisión rápida</strong>:</p>


<ul>
<li>Menos de 10 servidores → SMS</li>
<li>Necesitas parar menos de 1 hora → MGN</li>
<li>Tienes vCenter 6.7+ → MGN</li>
<li>Quieres control IAM detallado → MGN</li>
<li>Prefieres migrar poco a poco → SMS</li>
</ul>


<h2 class="sb" id="detalles-t%C3%A9cnicos" tabindex="-1">Detalles Técnicos</h2>


<p>AWS SMS y MGN funcionan con los principales sistemas operativos y tienen requisitos específicos. Aquí están los detalles clave:</p>


<h3 id="sistemas-soportados" tabindex="-1">Sistemas Soportados</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Sistema Operativo</th>
<th>AWS SMS</th>
<th>AWS MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Windows Server 2022</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>Windows Server 2019</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>Windows Server 2016</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>Windows Server 2012 R2</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>RHEL 7.0+</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>Ubuntu 16.04+</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>CentOS 7+</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>Debian 8.0+</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>Amazon Linux AMI 2013.03+</td>
<td>✓</td>
<td>✓</td>
</tr>
</tbody>
</table></figure>


<h3 id="configuraci%C3%B3n-de-red" tabindex="-1">Configuración de Red</h3>


<p>MGN necesita:</p>


<ul>
<li>Puerto TCP 443 (API)</li>
<li>Puerto TCP 1500 (replicación)</li>
<li>2 GB disco libre</li>
<li>300 MB RAM (Windows)</li>
<li>500 MB en /tmp (Linux)</li>
</ul>


<p>SMS requiere:</p>


<ul>
<li>Conexión a vCenter</li>
<li>Puertos VMware abiertos</li>
<li>Espacio para snapshots</li>
</ul>


<h3 id="seguridad-y-control" tabindex="-1">Seguridad y Control</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>SMS</th>
<th>MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Cifrado en tránsito</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>Cifrado EBS</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>AWS PrivateLink</td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td>IAM detallado</td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td><a href="https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html" rel="noopener noreferrer" target="_blank">CloudTrail</a></td>
<td>✓</td>
<td>✓</td>
</tr>
</tbody>
</table></figure>


<h3 id="l%C3%ADmites-y-monitoreo" tabindex="-1">Límites y Monitoreo</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Detalle</th>
</tr>
</thead>
<tbody>
<tr>
<td>Monitoreo</td>
<td><a href="https://docs.aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">CloudWatch</a> Metrics</td>
</tr>
<tr>
<td>Auditoría</td>
<td>CloudTrail</td>
</tr>
<tr>
<td>Registro</td>
<td>AWS/MGN namespace</td>
</tr>
<tr>
<td>Cuotas</td>
<td>150 servidores por región</td>
</tr>
<tr>
<td>Trabajos simultáneos</td>
<td>20 por región</td>
</tr>
</tbody>
</table></figure>


<h3 id="herramientas-compatibles" tabindex="-1">Herramientas Compatibles</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>SMS</th>
<th>MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>CloudWatch</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>CloudTrail</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td>AWS DMS</td>
<td>✓</td>
<td>✓</td>
</tr>
<tr>
<td><a href="https://docs.aws.amazon.com/aws-backup/" rel="noopener noreferrer" target="_blank">AWS Backup</a></td>
<td>❌</td>
<td>✓</td>
</tr>
<tr>
<td><a href="https://docs.aws.amazon.com/systems-manager/" rel="noopener noreferrer" target="_blank">Systems Manager</a></td>
<td>✓</td>
<td>✓</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"AWS MGN permite a los clientes mover aplicaciones a AWS sin tener que hacer cambios en las aplicaciones, su arquitectura o los servidores migrados." - Jason Gregson, Global Head of AWS Programs and Operations for DoiT international.</p>
</blockquote>


<h2 class="sb" id="pasos-de-planificaci%C3%B3n-de-migraci%C3%B3n" tabindex="-1">Pasos de Planificación de Migración</h2>


<h3 id="pasos-de-revisi%C3%B3n-inicial" tabindex="-1">Pasos de Revisión Inicial</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Fase</th>
<th>Acciones Clave</th>
</tr>
</thead>
<tbody>
<tr>
<td>Evaluación</td>
<td>- Inventario de apps y datos  <br/>- Análisis de dependencias  <br/>- Requisitos de seguridad</td>
</tr>
<tr>
<td>Documentación</td>
<td>- Mapa de infraestructura  <br/>- Apps críticas  <br/>- Configuraciones actuales</td>
</tr>
<tr>
<td>Cumplimiento</td>
<td>- Requisitos GDPR/HIPAA  <br/>- Estándares de seguridad  <br/>- Políticas de datos</td>
</tr>
</tbody>
</table></figure>


<h3 id="equipo-y-recursos" tabindex="-1">Equipo y Recursos</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Elemento</th>
<th>Lo que Necesitas</th>
</tr>
</thead>
<tbody>
<tr>
<td>Personal</td>
<td>- Líder AWS  <br/>- Arquitecto  <br/>- Admin de Sistemas  <br/>- Soporte Cloud</td>
</tr>
<tr>
<td>Hardware</td>
<td>- Red  <br/>- Almacenamiento  <br/>- Recursos de cómputo</td>
</tr>
<tr>
<td>Software</td>
<td>- Licencias  <br/>- Herramientas de migración  <br/>- Monitoreo</td>
</tr>
</tbody>
</table></figure>


<h3 id="tiempos-del-proyecto" tabindex="-1">Tiempos del Proyecto</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Etapa</th>
<th>Tiempo</th>
<th>Qué se Hace</th>
</tr>
</thead>
<tbody>
<tr>
<td>Preparar</td>
<td>2-4 semanas</td>
<td>Evaluar y planear</td>
</tr>
<tr>
<td>Migrar</td>
<td>4-8 semanas</td>
<td>Mover datos y apps</td>
</tr>
<tr>
<td>Validar</td>
<td>1-2 semanas</td>
<td>Probar todo</td>
</tr>
<tr>
<td>Ajustar</td>
<td>2-4 semanas</td>
<td>Mejorar rendimiento</td>
</tr>
</tbody>
</table></figure>


<h3 id="pruebas-clave" tabindex="-1">Pruebas Clave</h3>


<p>1. <strong>Replicación</strong></p>


<p>AWS MGN te permite probar la copia de datos sin interrumpir operaciones. Hazlo una semana antes.</p>


<p>2. <strong>Apps en AWS</strong></p>


<p>Verifica:</p>


<ul>
<li>Si todo funciona</li>
<li>Conexiones</li>
<li>Acceso a datos</li>
<li>Funciones principales</li>
</ul>


<p>3. <strong>Plan B</strong></p>


<p>Prueba cómo volver atrás si algo sale mal.</p>


<h3 id="checklist-final" tabindex="-1">Checklist Final</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Área</th>
<th>Qué Revisar</th>
</tr>
</thead>
<tbody>
<tr>
<td>Base</td>
<td>- Servidores  <br/>- Conexiones  <br/>- Red</td>
</tr>
<tr>
<td>Seguridad</td>
<td>- IAM  <br/>- Cifrado  <br/>- Permisos</td>
</tr>
<tr>
<td>Apps</td>
<td>- Lista crítica  <br/>- Orden  <br/>- Integraciones</td>
</tr>
<tr>
<td>Datos</td>
<td>- Cantidad  <br/>- Tiempo de copia  <br/>- Sincronización</td>
</tr>
<tr>
<td>Control</td>
<td>- Vuelta atrás  <br/>- Comunicación  <br/>- Contactos</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"El 80% del éxito está en planear bien. Sin una buena evaluación y un plan claro, la migración puede complicarse." - Jason Gregson, DoiT International.</p>
</blockquote>


<h2 class="sb" id="tips-para-el-%C3%A9xito" tabindex="-1">Tips para el Éxito</h2>


<p>No compliques tu migración. Aquí tienes lo que necesitas saber:</p>


<h3 id="antes-de-empezar" tabindex="-1">Antes de Empezar</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Preparación</th>
<th>Detalles</th>
</tr>
</thead>
<tbody>
<tr>
<td>Instancias</td>
<td>m5a.xLarge o superior para servidores con replicación lenta</td>
</tr>
<tr>
<td>Plantillas</td>
<td>3 plantillas MGN básicas: Replicación, Lanzamiento y Post-Lanzamiento</td>
</tr>
<tr>
<td>Red</td>
<td>Ancho de banda dedicado</td>
</tr>
<tr>
<td>Documentación</td>
<td>Mapa de dependencias y configs actuales</td>
</tr>
</tbody>
</table></figure>


<h3 id="durante-la-migraci%C3%B3n" tabindex="-1">Durante la Migración</h3>


<p>¿Quieres que todo salga bien? Sigue estos pasos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Acción</th>
<th>Beneficio</th>
</tr>
</thead>
<tbody>
<tr>
<td>Detener procesos</td>
<td>Mayor velocidad sin tareas en segundo plano</td>
</tr>
<tr>
<td>Monitorear</td>
<td>CloudWatch para ver progreso en tiempo real</td>
</tr>
<tr>
<td>Dimensionar</td>
<td>Deja que MGN elija la instancia correcta</td>
</tr>
<tr>
<td>Notificaciones</td>
<td>EventBridge para saber qué pasa</td>
</tr>
</tbody>
</table></figure>


<h3 id="despu%C3%A9s-de-la-migraci%C3%B3n" tabindex="-1">Después de la Migración</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Tarea</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>Pruebas</td>
<td>Prueba de corte 2 semanas antes</td>
</tr>
<tr>
<td>Monitoreo</td>
<td>Métricas de rendimiento</td>
</tr>
<tr>
<td>Limpieza</td>
<td>Quitar recursos que ya no uses</td>
</tr>
<tr>
<td>Optimización</td>
<td>Ajustar según resultados</td>
</tr>
</tbody>
</table></figure>


<h3 id="lo-que-no-debes-hacer" tabindex="-1">Lo Que NO Debes Hacer</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Error</th>
<th>Solución</th>
</tr>
</thead>
<tbody>
<tr>
<td>Migrar todo junto</td>
<td>Una app crítica a la vez</td>
</tr>
<tr>
<td>Replicar backups</td>
<td>Solo datos activos</td>
</tr>
<tr>
<td>Olvidar la red</td>
<td>Conectividad estable = éxito</td>
</tr>
<tr>
<td>No probar</td>
<td>Pruebas = tranquilidad</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"Haz una prueba de corte 2 semanas antes. En CADA proyecto nos ha ayudado a encontrar problemas." - Jim Wood, Solutions Architect, Ubertas Consulting</p>
</blockquote>


<p><strong>Nota</strong>: Visita <a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a> para más guías de migración en español.</p>


<h2 class="sb" id="resumen" tabindex="-1">Resumen</h2>


<p>¿SMS o MGN para tu <a href="https://dev.to/aws-builders/migrar-gran-cantidad-de-datos-a-la-nube-de-aws-rapido-y-economico-3n63">migración a AWS</a>? Aquí está todo lo que necesitas saber:</p>


<h3 id="comparaci%C3%B3n-de-servicios" tabindex="-1">Comparación de Servicios</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Estado</th>
<th>Costo</th>
<th>Límites</th>
<th>China</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS SMS</td>
<td>Desuso</td>
<td>Pago por S3 + snapshots</td>
<td>16 TB/volumen</td>
<td>Sí</td>
</tr>
<tr>
<td>AWS MGN</td>
<td>Activo</td>
<td>Gratis 90 días, luego $0.042/h</td>
<td>Sin límite</td>
<td>No</td>
</tr>
</tbody>
</table></figure>


<h3 id="plan-de-acci%C3%B3n" tabindex="-1">Plan de Acción</h3>


<p>Si estás usando SMS, es hora de cambiar. Si empiezas desde cero, MGN es tu mejor opción.</p>


<p><strong>Para proyectos nuevos:</strong></p>


<ul>
<li>Usa MGN desde el inicio</li>
<li>Aprovecha los 90 días gratis</li>
<li>Haz pruebas 2 semanas antes</li>
<li>Mantén tus datos bajo 16 TB por servidor</li>
</ul>


<blockquote>
<p>"MGN reduce el tiempo de inactividad y hace las migraciones más simples" - Jim Wood, Solutions Architect, Ubertas Consulting</p>
</blockquote>


<p><strong>Lo que debes saber:</strong></p>


<ul>
<li>MGN es la herramienta oficial de AWS para lift-and-shift</li>
<li>SMS dejará de funcionar pronto</li>
<li>MGN te da 2,160 horas gratis (90 días)</li>
<li>La replicación en vivo minimiza interrupciones</li>
</ul>


<p>¿Necesitas más información? Visita <a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a>.</p>


<h2 class="sb" id="m%C3%A1s-informaci%C3%B3n" tabindex="-1">Más Información</h2>


<p>AWS pone a tu disposición todo lo que necesitas para migrar a la nube. Veamos las herramientas principales:</p>


<h3 id="gu%C3%ADas-de-aws" tabindex="-1">Guías de AWS</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Recurso</th>
<th>Descripción</th>
<th>Enlace</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://dondeaprendoaws.com/blog/migracion-de-datos-con-aws-snowmobile-guia-paso-a-paso/">AWS Cloud Migration</a></td>
<td>Centro de recursos y documentación</td>
<td>aws.amazon.com/cloud-migration</td>
</tr>
<tr>
<td>Guía de Estrategias</td>
<td>Plan paso a paso para migrar</td>
<td>aws.amazon.com/migration-strategies</td>
</tr>
<tr>
<td>AWS Migration Hub</td>
<td>Control y monitoreo de migraciones</td>
<td>aws.amazon.com/migration-hub</td>
</tr>
</tbody>
</table></figure>


<h3 id="recursos-en-espa%C3%B1ol" tabindex="-1">Recursos en Español</h3>


<p><a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a> te ofrece:</p>


<ul>
<li>Guías prácticas de migración</li>
<li>Demos de SMS y MGN</li>
<li>Experiencias reales</li>
<li><a href="https://dondeaprendoaws.com/blog/aws-curso-certificado-preparacion-para-el-examen/">Preparación para certificaciones</a></li>
</ul>


<h3 id="sms-vs-mgn" tabindex="-1">SMS vs MGN</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>SMS</th>
<th>MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Documentación</td>
<td>No se actualiza</td>
<td>Al día</td>
</tr>
<tr>
<td>Laboratorios</td>
<td>No</td>
<td>Sí, gratis</td>
</tr>
<tr>
<td>Soporte</td>
<td>Básico</td>
<td>Total</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"AWS simplificó nuestra migración a la nube. Ahora podemos enfocarnos en crear mejores productos." - Alvin Delagon, Senior Manager de Core Engineering en PayMaya</p>
</blockquote>


<p><strong>Lo que debes saber:</strong></p>


<ul>
<li>AWS sirve a más de 1 millón de clientes</li>
<li>95% de aprobación en exámenes con buena preparación</li>
<li>AWS DataSync mueve grandes volúmenes de datos</li>
</ul>


<p><strong>Herramientas extra:</strong></p>


<ul>
<li>AWS Database Migration Service</li>
<li>AWS Application Discovery Service</li>
<li>AWS Migration Hub</li>
</ul>


<p>Las "7 R's" de AWS para migrar:</p>


<ol>
<li>Rehost</li>
<li>Replatform</li>
<li>Repurchase</li>
<li>Refactor</li>
<li>Relocate</li>
<li>Retire</li>
<li>Retain</li>
</ol>


<h2 class="sb" id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="%C2%BFcu%C3%A1l-es-la-diferencia-entre-aws-mgn-y-sms%3F" tabindex="-1">¿Cuál es la diferencia entre <a href="https://docs.aws.amazon.com/mgn/" rel="noopener noreferrer" target="_blank">AWS MGN</a> y SMS?</h3>


<p><figure><img alt="AWS MGN" src="/assets/blog/2abf2921568b37d3e79c1442.jpg"/></figure></p>


<p>AWS SMS y MGN son diferentes. Aquí está lo que necesitas saber:</p>


<p>SMS se centra en mover servidores virtuales uno por uno. MGN va más allá: mueve aplicaciones completas y las prepara para funcionar de forma nativa en AWS.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>AWS SMS</th>
<th>AWS MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Enfoque principal</td>
<td>Migración de servidores virtualizados</td>
<td>Migración de aplicaciones completas</td>
</tr>
<tr>
<td>Tipo de migración</td>
<td>Replicación incremental de volúmenes</td>
<td>Conversión de servidores para ejecución nativa</td>
</tr>
<tr>
<td>Caso de uso</td>
<td>Migraciones lift-and-shift</td>
<td>Modernización de infraestructura</td>
</tr>
<tr>
<td>Estado actual</td>
<td>Sin actualizaciones recientes</td>
<td>Mantenimiento activo</td>
</tr>
<tr>
<td>Automatización</td>
<td>Proceso automatizado básico</td>
<td>Proceso automatizado avanzado</td>
</tr>
</tbody>
</table></figure>


<h3 id="%C2%BFqu%C3%A9-servicio-elegir%3F" tabindex="-1">¿Qué servicio elegir?</h3>


<p>La decisión es simple:</p>


<ul>
<li>¿Necesitas mover VMs individuales? → SMS</li>
<li>¿Quieres migrar aplicaciones completas? → MGN</li>
<li>¿Buscas modernizar tu infraestructura? → MGN</li>
</ul>


<h3 id="%C2%BFcu%C3%A1les-son-los-requisitos-b%C3%A1sicos%3F" tabindex="-1">¿Cuáles son los requisitos básicos?</h3>


<p>Para empezar necesitas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Requisito</th>
<th>AWS SMS</th>
<th>AWS MGN</th>
</tr>
</thead>
<tbody>
<tr>
<td>Sistemas soportados</td>
<td>VMware, Hyper-V</td>
<td>Físicos, virtuales y en la nube</td>
</tr>
<tr>
<td>Replicación</td>
<td>Incremental</td>
<td>Continua</td>
</tr>
<tr>
<td>Conectividad</td>
<td>VPN o Direct Connect</td>
<td>VPN o Direct Connect</td>
</tr>
<tr>
<td>Licencias</td>
<td>No requiere adicionales</td>
<td>No requiere adicionales</td>
</tr>
</tbody>
</table></figure>


<h3 id="%C2%BFqu%C3%A9-otras-herramientas-puedo-usar%3F" tabindex="-1">¿Qué otras herramientas puedo usar?</h3>


<p>AWS ofrece herramientas que hacen tu migración más fácil:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Función</th>
</tr>
</thead>
<tbody>
<tr>
<td>VM Import/Export</td>
<td>Migración de máquinas virtuales</td>
</tr>
<tr>
<td>AWS Migration Hub</td>
<td>Control y seguimiento</td>
</tr>
<tr>
<td>AWS Database Migration Service</td>
<td>Migración de bases de datos</td>
</tr>
<tr>
<td>AWS Application Discovery Service</td>
<td>Análisis de aplicaciones</td>
</tr>
</tbody>
</table></figure>


<p>Cada herramienta tiene su propósito específico. Úsalas según tus necesidades de migración.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/aws-bases-de-datos-introduccion-basica/">Bases de Datos en AWS: introducción básica</a></li><li><a href="https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/">Arquitecturas Multi-Región en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/servicios-de-aws-para-frontend/">Servicios de AWS para Frontend</a></li><li><a href="https://dondeaprendoaws.com/blog/migracion-de-datos-con-aws-snowmobile-guia-paso-a-paso/">Migración de Datos con AWS Snowmobile: Guía Paso a Paso</a></li>
</ul>
</p>
