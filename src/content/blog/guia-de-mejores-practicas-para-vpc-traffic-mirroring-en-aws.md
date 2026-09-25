---
title: "Guía de Mejores Prácticas para VPC Traffic Mirroring en AWS"
description: "Descubre cómo implementar VPC Traffic Mirroring en AWS para mejorar la seguridad, diagnosticar problemas y optimizar el rendimiento de tu red."
publishedAt: "2024-10-28"
publishedTimestamp: "2024-10-28T03:11:03.66Z"
cover: "/assets/blog/06f2f4250afcc07dff4646bf.webp"
coverAlt: "Thumbnail for: Guía de Mejores Prácticas para VPC Traffic Mirroring en AWS"
ogImage: "/assets/blog/06f2f4250afcc07dff4646bf.webp"
related:
  - title: "Visualiza Costos con AWS Cost and Usage Reports y QuickSight"
    url: "https://dondeaprendoaws.com/blog/visualiza-costos-con-aws-cost-and-usage-reports-y-quicksight/"
    image: "/assets/blog/bcf6fecd181e12cedeeed88a.jpg"
    imageAlt: ""
  - title: "Cómo integrar Terraform con CI/CD en AWS"
    url: "https://dondeaprendoaws.com/blog/como-integrar-terraform-con-cicd-en-aws/"
    image: "/assets/blog/455f2eb1c408f11b2e18115c.jpg"
    imageAlt: ""
  - title: "10 Estrategias para Optimizar Costos de Red en AWS"
    url: "https://dondeaprendoaws.com/blog/10-estrategias-para-optimizar-costos-de-red-en-aws/"
    image: "/assets/blog/732b4db41baecb1699e72d80.webp"
    imageAlt: ""
---

<p>VPC Traffic Mirroring es una función de <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> que copia el tráfico de red para análisis de seguridad y resolución de problemas. Es como tener una cámara de seguridad para tu red.</p>


<p><strong>Lo que necesitas saber ahora mismo:</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Detalle</th>
</tr>
</thead>
<tbody>
<tr>
<td>Precio</td>
<td>$0.015/hora por origen</td>
</tr>
<tr>
<td>Límite</td>
<td>3 sesiones por ENI</td>
</tr>
<tr>
<td>Compatibilidad</td>
<td>Solo <a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ec2/">instancias EC2</a> con Nitro</td>
</tr>
<tr>
<td>Requisito principal</td>
<td>Puerto UDP 4789 abierto</td>
</tr>
</tbody>
</table></figure>


<p><strong>Casos de uso principales:</strong></p>


<ul>
<li>Detectar intrusos en tu red</li>
<li>Diagnosticar problemas de rendimiento</li>
<li>Analizar problemas de conectividad</li>
</ul>


<p><strong>Componentes básicos:</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Función</th>
</tr>
</thead>
<tbody>
<tr>
<td>Origen</td>
<td>ENI que genera el tráfico</td>
</tr>
<tr>
<td>Destino</td>
<td>Donde se analiza el tráfico</td>
</tr>
<tr>
<td>Filtros</td>
<td>Define qué tráfico copiar</td>
</tr>
<tr>
<td>Sesión</td>
<td>Conecta origen y destino</td>
</tr>
</tbody>
</table></figure>


<p><strong>Diferencia clave con VPC Flow Logs:</strong> Traffic Mirroring te da el contenido completo del paquete, no solo metadatos.</p>


<blockquote>
<p>💡 <strong>Consejo rápido:</strong> Empieza con filtros específicos para reducir costos y mejorar el rendimiento.</p>
</blockquote>


<h2 class="sb" id="related-video-from-youtube" tabindex="-1">Related video from YouTube</h2>


<iframe allowfullscreen="" loading="lazy" src="https://www.youtube-nocookie.com/embed/CdeTV4UST64" title="Video de YouTube"></iframe>
<h2 class="sb" id="%C2%BFqu%C3%A9-es-traffic-mirroring%3F" tabindex="-1">¿Qué es Traffic Mirroring?</h2>


<p>Traffic Mirroring hace una copia EXACTA de tu tráfico de red en VPC. ¿Por qué es esto importante? Porque puedes analizar todo lo que pasa en tu red sin tocar el tráfico original.</p>


<p>Funciona así:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Pieza</th>
<th>¿Qué hace?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Origen</td>
<td>Tu <a href="https://dondeaprendoaws.com/blog/tipos-y-tamanos-de-instancias-ec2-guia-completa/">instancia EC2</a> envía datos</td>
</tr>
<tr>
<td>Destino</td>
<td>Otra instancia los recibe y analiza</td>
</tr>
<tr>
<td>Filtros</td>
<td>Decides qué tráfico quieres copiar</td>
</tr>
<tr>
<td>Sesión</td>
<td>Une origen y destino</td>
</tr>
</tbody>
</table></figure>


<h2 class="sb" id="%C2%BFcu%C3%A1ndo-necesitas-traffic-mirroring%3F" tabindex="-1">¿Cuándo necesitas Traffic Mirroring?</h2>


<p>Hay 3 momentos clave:</p>


<ul>
<li>Cuando quieres detectar intrusos en tu red</li>
<li>Si necesitas ver por qué tu red está lenta</li>
<li>Para encontrar problemas difíciles de red</li>
</ul>


<h2 class="sb" id="%C2%BFc%C3%B3mo-funciona%3F" tabindex="-1">¿Cómo funciona?</h2>


<p>Es simple:</p>


<ol>
<li>Copia los datos que entran y salen</li>
<li>Los empaqueta en VXLAN</li>
<li>Los manda a otro lugar para analizarlos</li>
</ol>


<figure class="table"><table>
<thead>
<tr>
<th>Lo que debes saber</th>
<th>Detalles</th>
</tr>
</thead>
<tbody>
<tr>
<td>Precio</td>
<td>$0.015/hora por origen</td>
</tr>
<tr>
<td>Límites</td>
<td>3 sesiones por ENI</td>
</tr>
<tr>
<td>¿Dónde funciona?</td>
<td>En instancias EC2 con Nitro</td>
</tr>
<tr>
<td>Disponibilidad</td>
<td>En todas las <a href="https://dondeaprendoaws.com/blog/arquitecturas-multi-region-en-aws/">regiones AWS</a></td>
</tr>
</tbody>
</table></figure>


<p>¿La diferencia con VPC Flow Logs? Traffic Mirroring te da TODO el contenido del paquete, no solo los metadatos. Es como tener una grabación completa vs solo un resumen.</p>


<h2 class="sb" id="partes-principales-de-traffic-mirroring" tabindex="-1">Partes Principales de Traffic Mirroring</h2>


<p>Traffic Mirroring necesita 5 elementos básicos para funcionar. Veamos cada uno:</p>


<h3 id="or%C3%ADgenes-de-tr%C3%A1fico" tabindex="-1">Orígenes de Tráfico</h3>


<p>El origen es una ENI (interfaz de red elástica) de EC2 que genera el tráfico a copiar.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Origen</th>
<th>Detalles</th>
</tr>
</thead>
<tbody>
<tr>
<td>Instancias EC2</td>
<td>Compatible con Nitro y no-Nitro</td>
</tr>
<tr>
<td>ENI</td>
<td>Solo tipo <code class="inline-code">interface</code></td>
</tr>
<tr>
<td>Ubicación</td>
<td>Misma VPC o VPCs distintas</td>
</tr>
</tbody>
</table></figure>


<h3 id="destinos-de-tr%C3%A1fico" tabindex="-1">Destinos de Tráfico</h3>


<p>El destino es donde llega la copia del tráfico. Hay varias opciones:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Destino</th>
<th>Setup</th>
</tr>
</thead>
<tbody>
<tr>
<td>ENI en misma VPC</td>
<td>Setup directo</td>
</tr>
<tr>
<td>ENI otra VPC (misma cuenta)</td>
<td>Necesita VPC peering/gateway</td>
</tr>
<tr>
<td>ENI otra VPC (otra cuenta)</td>
<td>Necesita peering/gateway entre cuentas</td>
</tr>
<tr>
<td>Network Load Balancer</td>
<td>Para distribuir tráfico</td>
</tr>
</tbody>
</table></figure>


<h3 id="filtros-de-tr%C3%A1fico" tabindex="-1">Filtros de Tráfico</h3>


<p>Sin filtros configurados, NO se copia nada. Los filtros dicen qué tráfico copiar:</p>


<figure class="table"><table>
<thead>
<tr>
<th>#</th>
<th>Acción</th>
<th>Protocolo</th>
<th>Puerto</th>
<th>Origen</th>
<th>Destino</th>
</tr>
</thead>
<tbody>
<tr>
<td>10</td>
<td>rechazar</td>
<td>TCP</td>
<td>22</td>
<td>red-local</td>
<td>vpc-cidr</td>
</tr>
<tr>
<td>20</td>
<td>aceptar</td>
<td>TCP</td>
<td>todos</td>
<td>0.0.0.0/0</td>
<td>0.0.0.0/0</td>
</tr>
</tbody>
</table></figure>


<h3 id="sesiones-de-mirroring" tabindex="-1">Sesiones de Mirroring</h3>


<p>Una sesión conecta 3 elementos:</p>


<ul>
<li>El origen (ENI)</li>
<li>El destino</li>
<li>Los filtros</li>
</ul>


<p>Puedes tener hasta 3 sesiones por ENI.</p>


<h3 id="vxlan" tabindex="-1">VXLAN</h3>


<p>El tráfico va por VXLAN:</p>


<ul>
<li>Puerto UDP 4789</li>
<li>Solo transporta datos</li>
<li>Sin plano de control</li>
<li>El destino debe aceptar VXLAN</li>
</ul>


<p><strong>OJO</strong>: El tráfico copiado cuenta para los límites de ancho de banda. Por ejemplo: copiar de 10G a 1G puede saturar la red.</p>


<h2 class="sb" id="gu%C3%ADas-de-configuraci%C3%B3n" tabindex="-1">Guías de Configuración</h2>


<h3 id="planificaci%C3%B3n-de-la-configuraci%C3%B3n" tabindex="-1">Planificación de la Configuración</h3>


<p>Para empezar con Traffic Mirroring, necesitas estos componentes básicos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Recurso</th>
<th>Lo que Necesitas</th>
</tr>
</thead>
<tbody>
<tr>
<td>VPC</td>
<td>IGW activo</td>
</tr>
<tr>
<td>Subredes</td>
<td>1+ pública</td>
</tr>
<tr>
<td>Instancias EC2</td>
<td>3 (origen, destino, monitoreo)</td>
</tr>
<tr>
<td>ENIs</td>
<td>1 por instancia</td>
</tr>
<tr>
<td>Permisos IAM</td>
<td>Control de Traffic Mirroring</td>
</tr>
</tbody>
</table></figure>


<h3 id="configuraci%C3%B3n-de-seguridad" tabindex="-1">Configuración de Seguridad</h3>


<p>Aquí están los puntos de seguridad que DEBES configurar:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Elemento</th>
<th>Qué Hacer</th>
</tr>
</thead>
<tbody>
<tr>
<td>Puerto VXLAN</td>
<td>Abrir UDP 4789</td>
</tr>
<tr>
<td>Grupos de Seguridad</td>
<td>Permitir tráfico origen</td>
</tr>
<tr>
<td>ACLs de Red</td>
<td>No bloquear espejo</td>
</tr>
<tr>
<td>Tablas de Ruta</td>
<td>Ruta al destino</td>
</tr>
</tbody>
</table></figure>


<p>¿Quieres verificar si funciona? Ejecuta esto:</p>


<pre><code class="language-bash"># En la instancia destino
sudo tcpdump -nnni eth0 udp port 4789
</code></pre>


<h3 id="configuraci%C3%B3n-de-rendimiento" tabindex="-1">Configuración de Rendimiento</h3>


<p>Estos son los números que importan:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Factor</th>
<th>Lo que Debes Saber</th>
</tr>
</thead>
<tbody>
<tr>
<td>Ancho de banda</td>
<td>X2 del tráfico base</td>
</tr>
<tr>
<td>Costo</td>
<td>$10.95/mes por ENI origen</td>
</tr>
<tr>
<td>Límites</td>
<td>3 sesiones máximo por ENI</td>
</tr>
</tbody>
</table></figure>


<p><strong>Para mejor rendimiento:</strong></p>


<ul>
<li>Filtra solo el tráfico que necesitas</li>
<li>Pon el destino cerca del origen</li>
<li>Usa NLB para múltiples orígenes</li>
<li>Activa Auto Scaling en monitoreo</li>
</ul>


<p>Configura rápido con este comando:</p>


<pre><code class="language-bash">aws ec2 create-traffic-mirror-target \
  --network-interface-id eni-1234567890abcdef0 \
  --description "Target principal"
</code></pre>


<p>Monitorea y ajusta según el uso. Así evitarás sorpresas en costos y rendimiento.</p>


<h2 class="sb" id="opciones-de-configuraci%C3%B3n-avanzada" tabindex="-1">Opciones de Configuración Avanzada</h2>


<h3 id="configuraci%C3%B3n-multi-cuenta" tabindex="-1">Configuración Multi-Cuenta</h3>


<p>¿Necesitas monitorear tráfico entre cuentas AWS? Así funciona:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Cuenta A (Destino)</th>
<th>Cuenta B (Origen)</th>
</tr>
</thead>
<tbody>
<tr>
<td>1. Crear EC2 destino</td>
<td>1. Aceptar compartido</td>
</tr>
<tr>
<td>2. Crear Mirror target</td>
<td>2. Crear EC2 origen</td>
</tr>
<tr>
<td>3. Compartir vía RAM</td>
<td>3. Crear filtros y sesión</td>
</tr>
</tbody>
</table></figure>


<p>Aquí está el código que necesitas:</p>


<pre><code class="language-bash"># Cuenta A - Crear target
aws ec2 create-traffic-mirror-target \
  --network-interface-id eni-destino \
  --description "Target para monitoreo"

# Cuenta B - Crear sesión
aws ec2 create-traffic-mirror-session \
  --network-interface-id eni-origen \
  --traffic-mirror-target-id tmt-compartido \
  --traffic-mirror-filter-id tmf-12345
</code></pre>


<h3 id="configuraci%C3%B3n-multi-regi%C3%B3n" tabindex="-1">Configuración Multi-Región</h3>


<p>Para monitorear entre regiones AWS necesitas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Qué Necesitas</th>
</tr>
</thead>
<tbody>
<tr>
<td>VPC Peering</td>
<td>Conectar VPCs</td>
</tr>
<tr>
<td>Transit Gateway</td>
<td>3+ regiones</td>
</tr>
<tr>
<td>Rutas</td>
<td>Hacia target</td>
</tr>
<tr>
<td>VXLAN</td>
<td>Puerto UDP 4789</td>
</tr>
</tbody>
</table></figure>


<p><strong>Lo que debes saber:</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Elemento</th>
<th>Detalles</th>
</tr>
</thead>
<tbody>
<tr>
<td>EC2</td>
<td>Solo Nitro</td>
</tr>
<tr>
<td>Bandwidth</td>
<td>≥ origen</td>
</tr>
<tr>
<td>Cobertura</td>
<td>26 regiones</td>
</tr>
<tr>
<td>EC2 Compatibles</td>
<td>C4, D2, G3, H1, I3, M4, P2, P3, R4, X1</td>
</tr>
</tbody>
</table></figure>


<p>Para que funcione mejor:</p>


<ul>
<li>Usa NLB como target</li>
<li>Filtra tráfico extra</li>
<li>Regiones cercanas = mejor performance</li>
<li>Revisa tus rutas VPC</li>
</ul>


<pre><code class="language-bash"># Test VXLAN
sudo tcpdump -i any 'udp port 4789' -nn
</code></pre>


<h2 class="sb" id="revisiones-y-actualizaciones-del-sistema" tabindex="-1">Revisiones y Actualizaciones del Sistema</h2>


<p><a href="https://aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">CloudWatch</a> es la herramienta que necesitas para ver qué pasa con tu tráfico espejado. Veamos lo básico:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Métrica</th>
<th>Qué Mide</th>
<th>Para Qué Sirve</th>
</tr>
</thead>
<tbody>
<tr>
<td>NetworkMirrorIn</td>
<td>Bytes que entran</td>
<td>Ver cuánto tráfico llega</td>
</tr>
<tr>
<td>NetworkMirrorOut</td>
<td>Bytes que salen</td>
<td>Ver cuánto tráfico sale</td>
</tr>
<tr>
<td>NetworkSkipMirrorIn</td>
<td>Bytes perdidos (entrada)</td>
<td>Detectar pérdidas</td>
</tr>
<tr>
<td>NetworkSkipMirrorOut</td>
<td>Bytes perdidos (salida)</td>
<td>Detectar pérdidas</td>
</tr>
</tbody>
</table></figure>


<p>¿Quieres saber los bytes por segundo? Es fácil:</p>


<ul>
<li>Si usas monitoreo cada 5 minutos: divide entre 300</li>
<li>Si usas monitoreo cada minuto: divide entre 60</li>
</ul>


<h2 class="sb" id="%C2%BFproblemas%3F-aqu%C3%AD-las-soluciones" tabindex="-1">¿Problemas? Aquí las Soluciones</h2>


<figure class="table"><table>
<thead>
<tr>
<th>Si Pasa Esto</th>
<th>Revisa</th>
<th>Haz Esto</th>
</tr>
</thead>
<tbody>
<tr>
<td>No hay conexión</td>
<td>Reachability Analyzer</td>
<td>Las rutas VPC</td>
</tr>
<tr>
<td>No llega tráfico</td>
<td>Puerto UDP 4789</td>
<td>Abre el grupo de seguridad</td>
</tr>
<tr>
<td>Se pierden paquetes</td>
<td><a href="https://dondeaprendoaws.com/blog/10-metricas-clave-de-devops-en-aws/">Métricas CloudWatch</a></td>
<td>Baja el MTU a menos de 8500</td>
</tr>
<tr>
<td>Hay congestión</td>
<td>Métricas ENA</td>
<td>Quita algunos filtros</td>
</tr>
</tbody>
</table></figure>


<p>Para ver si todo funciona, usa estos comandos:</p>


<pre><code class="language-bash"># Ver tráfico VXLAN
sudo tcpdump -i any 'udp port 4789' -nn

# Estado del endpoint
aws ec2 describe-vpc-endpoints \
  --filters Name=vpc-endpoint-id,Values=vpce-id
</code></pre>


<h2 class="sb" id="instancias-que-puedes-usar" tabindex="-1">Instancias que Puedes Usar</h2>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo</th>
<th>Cuáles</th>
</tr>
</thead>
<tbody>
<tr>
<td>Compute</td>
<td>C4</td>
</tr>
<tr>
<td>Memory</td>
<td>R4, X1, X1e</td>
</tr>
<tr>
<td>Storage</td>
<td>D2, H1, I3</td>
</tr>
<tr>
<td>GPU</td>
<td>G3, P2, P3</td>
</tr>
<tr>
<td>General</td>
<td>M4</td>
</tr>
</tbody>
</table></figure>


<p><strong>OJO</strong>: No funciona en T2, C3, R3, I2 ni en versiones más viejas.</p>


<h2 class="sb" id="l%C3%ADmites-del-sistema" tabindex="-1">Límites del Sistema</h2>


<h3 id="l%C3%ADmites-t%C3%A9cnicos" tabindex="-1">Límites Técnicos</h3>


<p>VPC Traffic Mirroring tiene límites específicos por cuenta y región:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Recurso</th>
<th>Límite</th>
<th>¿Ajustable?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Sesiones por cuenta</td>
<td>10,000</td>
<td>No</td>
</tr>
<tr>
<td>Sesiones por interfaz de red</td>
<td>3</td>
<td>No</td>
</tr>
<tr>
<td>Objetivos por cuenta</td>
<td>10,000</td>
<td>No</td>
</tr>
<tr>
<td>Filtros por cuenta</td>
<td>10,000</td>
<td>No</td>
</tr>
<tr>
<td>Reglas por filtro</td>
<td>10</td>
<td>No</td>
</tr>
<tr>
<td>Fuentes por objetivo (instancias pequeñas)</td>
<td>10</td>
<td>No</td>
</tr>
<tr>
<td>Fuentes por objetivo (instancias grandes)</td>
<td>100</td>
<td>No</td>
</tr>
</tbody>
</table></figure>


<p>El sistema no funciona con:</p>


<ul>
<li>Subredes IPv6</li>
<li>Tráfico ARP</li>
<li>DHCP</li>
<li>NTP</li>
<li>Activación de Windows</li>
</ul>


<p>Los VPC Flow Logs no capturan el tráfico espejado.</p>


<p>El rendimiento está limitado a:</p>


<ul>
<li>MTU: 8,947 bytes sin truncar</li>
<li>Gateway Load Balancer: 10 Gbps por zona</li>
<li>Escalado máximo: 100 Gbps</li>
</ul>


<h3 id="control-de-costos" tabindex="-1">Control de Costos</h3>


<p>El tráfico espejado DUPLICA el consumo de ancho de banda. Si tienes 1 Gbps de tráfico bidireccional, necesitarás manejar 4 Gbps en total.</p>


<p>Para reducir gastos:</p>


<ul>
<li>Filtra SOLO el tráfico que necesitas analizar</li>
<li>Ajusta el MTU:
<ul>
<li>IPv4: 54 bytes menos que el objetivo</li>
<li>IPv6: 74 bytes menos que el objetivo</li>
</ul>
</li>
</ul>


<p><strong>Importante</strong>: AWS da prioridad al tráfico de producción. Esto significa que:</p>


<ul>
<li>Puedes perder paquetes espejados durante la congestión</li>
<li>No se espejan los paquetes bloqueados por grupos de seguridad</li>
</ul>


<h2 class="sb" id="configuraci%C3%B3n-de-herramientas-de-seguridad" tabindex="-1">Configuración de Herramientas de Seguridad</h2>


<h3 id="configuraci%C3%B3n-del-sistema-de-seguridad" tabindex="-1">Configuración del Sistema de Seguridad</h3>


<p>Para poner en marcha VPC Traffic Mirroring, necesitas estos componentes básicos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Componente</th>
<th>Requisitos Técnicos</th>
<th>Configuración</th>
</tr>
</thead>
<tbody>
<tr>
<td>Sistema de Análisis</td>
<td>Bro/Zeek 2.6 o superior</td>
<td>Puerto UDP 4789 abierto</td>
</tr>
<tr>
<td>AWS Network Firewall</td>
<td>Endpoint en subnet dedicada</td>
<td>Rutas de tráfico configuradas</td>
</tr>
<tr>
<td>Amazon <a href="https://aws.amazon.com/guardduty/" rel="noopener noreferrer" target="_blank">GuardDuty</a></td>
<td>Detector activo</td>
<td>VPC Flow Logs habilitados</td>
</tr>
</tbody>
</table></figure>


<p>Los sistemas de detección se dividen en:</p>


<ul>
<li><strong>HIDS</strong>: Monitorea desde el host</li>
<li><strong>NIDS</strong>: Monitorea desde la red</li>
</ul>


<p>AWS Network Firewall usa <a href="https://suricata.io/" rel="noopener noreferrer" target="_blank">Suricata</a> y te da:</p>


<ul>
<li>Filtrado de tráfico VPC</li>
<li>Ajuste automático según necesidad</li>
<li>Defensa contra intrusiones</li>
</ul>


<h3 id="an%C3%A1lisis-del-tr%C3%A1fico" tabindex="-1">Análisis del Tráfico</h3>


<p>Estas son las herramientas principales para ver el tráfico:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Herramienta</th>
<th>Uso Principal</th>
<th>Características</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://www.wireshark.org/" rel="noopener noreferrer" target="_blank">Wireshark</a></td>
<td>Análisis de paquetes</td>
<td>Captura y análisis detallado</td>
</tr>
<tr>
<td>tcpdump</td>
<td>Captura básica</td>
<td>Preinstalado en <a href="https://aws.amazon.com/es/amazon-linux-2/faqs/" rel="noopener noreferrer" target="_blank">Amazon Linux</a></td>
</tr>
<tr>
<td><a href="https://www.qacafe.com/analysis-tools/cloudshark/" rel="noopener noreferrer" target="_blank">CloudShark</a></td>
<td>Análisis colaborativo</td>
<td>Integración con VPC Traffic Mirroring</td>
</tr>
</tbody>
</table></figure>


<p>Para verificar que todo funciona:</p>


<ol>
<li><strong>Revisa el puerto</strong>: Usa tcpdump en UDP 4789</li>
<li><strong>Confirma paquetes</strong>: Busca tráfico VXLAN</li>
<li><strong>Analiza datos</strong>: Usa las herramientas de análisis</li>
</ol>


<p>Lo más importante:</p>


<ul>
<li>Abre el puerto UDP 4789 en tus grupos de seguridad</li>
<li>Confirma que los paquetes llegan a tu instancia</li>
<li>Usa CloudShark si trabajas en equipo</li>
</ul>


<h2 class="sb" id="reglas-y-registros" tabindex="-1">Reglas y Registros</h2>


<p>AWS ofrece controles específicos para VPC Traffic Mirroring que facilitan el cumplimiento normativo:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Configuración</th>
<th>Función</th>
</tr>
</thead>
<tbody>
<tr>
<td>IAM</td>
<td>Roles específicos</td>
<td>Control de acceso al mirroring</td>
</tr>
<tr>
<td>Filtros</td>
<td>10 reglas máximo</td>
<td>Define el tráfico a capturar</td>
</tr>
<tr>
<td>CloudWatch</td>
<td>Métricas en vivo</td>
<td>Monitoreo del tráfico</td>
</tr>
<tr>
<td>Sesiones</td>
<td>10,000 por cuenta</td>
<td>Control de recursos</td>
</tr>
</tbody>
</table></figure>


<p>CloudWatch te muestra estos datos clave:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Métrica</th>
<th>Qué mide</th>
</tr>
</thead>
<tbody>
<tr>
<td>NetworkMirrorIn</td>
<td>Bytes que entran y se reflejan</td>
</tr>
<tr>
<td>NetworkMirrorOut</td>
<td>Bytes que salen y se reflejan</td>
</tr>
<tr>
<td>NetworkSkipMirrorIn</td>
<td>Bytes no reflejados</td>
</tr>
<tr>
<td>NetworkPacketsMirrorIn</td>
<td>Paquetes que entran y se reflejan</td>
</tr>
<tr>
<td>NetworkPacketsMirrorOut</td>
<td>Paquetes que salen y se reflejan</td>
</tr>
</tbody>
</table></figure>


<p>Para el registro del tráfico necesitas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Elemento</th>
<th>Qué hace</th>
<th>Info extra</th>
</tr>
</thead>
<tbody>
<tr>
<td>CloudWatch</td>
<td>Métricas en tiempo real</td>
<td>Datos de uso</td>
</tr>
<tr>
<td>Dimensiones</td>
<td>Filtra datos</td>
<td>Por grupo, imagen o instancia</td>
</tr>
<tr>
<td>Precio</td>
<td>$0.015/hora</td>
<td>Por origen de reflejo</td>
</tr>
<tr>
<td>Cobertura</td>
<td>22 regiones</td>
<td>No en Sydney, Beijing, Ningxia</td>
</tr>
</tbody>
</table></figure>


<p><strong>Lo que debes hacer:</strong></p>


<ul>
<li>Configura <a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">alertas en CloudWatch</a></li>
<li>Documenta tus filtros y reglas</li>
<li>Anota los cambios de configuración</li>
<li>Rastrea los costos de transferencia</li>
</ul>


<p><strong>Sobre los costos</strong>: Los cargos siguen hasta eliminar todas las sesiones. Ten en cuenta costos extra si usas gateways o balanceadores.</p>


<h2 class="sb" id="mejoras-del-sistema" tabindex="-1">Mejoras del Sistema</h2>


<h3 id="uso-de-recursos" tabindex="-1">Uso de Recursos</h3>


<p>El VPC Traffic Mirroring necesita una configuración específica para funcionar mejor. Aquí te muestro cómo:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Técnica</th>
<th>Beneficio</th>
</tr>
</thead>
<tbody>
<tr>
<td>Ubicación</td>
<td>Despliegue cercano</td>
<td>Menos latencia y costos</td>
</tr>
<tr>
<td>Filtrado</td>
<td>Espejo selectivo</td>
<td>Solo tráfico importante</td>
</tr>
<tr>
<td>DNS</td>
<td>Espejo DNS total</td>
<td>Datos clave, poco volumen</td>
</tr>
<tr>
<td>Puntos</td>
<td>WAFs y NLBs</td>
<td>Más visibilidad</td>
</tr>
</tbody>
</table></figure>


<p>Lo que DEBES hacer:</p>


<ul>
<li>Pon monitores en puntos clave</li>
<li>Ajusta el MTU del destino</li>
<li>Usa CloudFormation</li>
<li>No pases de 3 sesiones por interfaz</li>
</ul>


<h3 id="reducci%C3%B3n-de-costos" tabindex="-1">Reducción de Costos</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Estrategia</th>
<th>Ahorro</th>
<th>Notas</th>
</tr>
</thead>
<tbody>
<tr>
<td>NAT Gateway juntos</td>
<td>$162/año/10 EC2</td>
<td>$1.50/hora gateway</td>
</tr>
<tr>
<td>Datos intra-región</td>
<td>$0.01/GB</td>
<td>Entre zonas</td>
</tr>
<tr>
<td>ENI espejo</td>
<td>$0.015/hora</td>
<td>Por interfaz</td>
</tr>
<tr>
<td>Datos comprimidos</td>
<td>Varía</td>
<td>Menos ancho banda</td>
</tr>
</tbody>
</table></figure>


<p>Para gastar MENOS:</p>


<ul>
<li>Usa Cost Explorer para ver gastos</li>
<li>Configura Budgets para alertas</li>
<li>Borra EBS sin uso</li>
<li>Pon etiquetas a todo</li>
</ul>


<blockquote>
<p>"En Atlassian juntamos NAT Gateways en AWS. Resultado: red más rápida y menos gastos" - Ben McAlary, Ingeniero Principal.</p>
</blockquote>


<figure class="table"><table>
<thead>
<tr>
<th>Tráfico</th>
<th>Cuándo Espejar</th>
</tr>
</thead>
<tbody>
<tr>
<td>Principal</td>
<td>Servidores core</td>
</tr>
<tr>
<td>Importante</td>
<td>Rutas de datos</td>
</tr>
<tr>
<td>Raro</td>
<td>FTP no permitido</td>
</tr>
<tr>
<td>DNS</td>
<td>Todo</td>
</tr>
</tbody>
</table></figure>


<p>Para que todo funcione MEJOR:</p>


<ul>
<li>No salgas de tu región</li>
<li>Usa CloudFront cache</li>
<li>Revisa AutoScaling</li>
<li>Mira el uso de IPs</li>
</ul>


<h2 class="sb" id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="%C2%BFqu%C3%A9-instancias-soportan-traffic-mirroring-en-aws%3F" tabindex="-1">¿Qué instancias soportan Traffic Mirroring en <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a>?</h3>


<p><figure><img alt="AWS" src="/assets/blog/2ebe3cf8e7ae57e98d3af846.jpg"/></figure></p>


<p>El soporte de Traffic Mirroring varía según el tipo de instancia:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Instancia</th>
<th>Soporte de Traffic Mirroring</th>
</tr>
</thead>
<tbody>
<tr>
<td>No-Nitro</td>
<td>C4, D2, G3, G3s, H1, I3, M4, P2, P3, R4, X1, X1e</td>
</tr>
<tr>
<td>Nitro</td>
<td>No soportado (M6a, M6i, M6in, M7g, etc.)</td>
</tr>
<tr>
<td>T2</td>
<td>No soportado</td>
</tr>
<tr>
<td>Bare Metal</td>
<td>No soportado</td>
</tr>
</tbody>
</table></figure>


<p>Para cambiar el tipo de instancia:</p>


<ol>
<li>Detén la instancia EC2</li>
<li>Espera a que se detenga por completo</li>
<li>Cambia el tipo desde "Acciones" &gt; "Configuración de instancia"</li>
</ol>


<h3 id="%C2%BFqu%C3%A9-servicio-de-aws-se-usa-para-controlar-el-tr%C3%A1fico-de-subredes-vpc%3F" tabindex="-1">¿Qué servicio de AWS se usa para controlar el tráfico de subredes VPC?</h3>


<p>Los ACLs de red son tu mejor opción para manejar el tráfico en las subredes:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Función</th>
</tr>
</thead>
<tbody>
<tr>
<td>Control de Entrada</td>
<td>Filtrado de tráfico entrante</td>
</tr>
<tr>
<td>Control de Salida</td>
<td>Filtrado de tráfico saliente</td>
</tr>
<tr>
<td>IAM</td>
<td>Gestión de accesos a recursos</td>
</tr>
<tr>
<td>Federación</td>
<td>Control de identidades</td>
</tr>
</tbody>
</table></figure>


<h3 id="%C2%BFqu%C3%A9-es-traffic-mirroring-en-vpc%3F" tabindex="-1">¿Qué es Traffic Mirroring en VPC?</h3>


<p>Traffic Mirroring copia el tráfico de red de interfaces elásticas tipo 'interface'.</p>


<p>Aquí lo que debes saber:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Limitaciones</th>
<th>Detalles</th>
</tr>
</thead>
<tbody>
<tr>
<td>IPv6</td>
<td>No funciona en subredes solo-IPv6</td>
</tr>
<tr>
<td>Tráfico Excluido</td>
<td>ARP, DHCP, metadata, NTP, activación Windows</td>
</tr>
<tr>
<td>Puerto Requerido</td>
<td>UDP 4789 para tráfico VXLAN</td>
</tr>
</tbody>
</table></figure>


<h3 id="%C2%BFqu%C3%A9-es-traffic-mirroring-en-aws%3F" tabindex="-1">¿Qué es Traffic Mirroring en AWS?</h3>


<p>Traffic Mirroring te permite:</p>


<ul>
<li>Copiar tráfico de red</li>
<li>Analizar el tráfico con herramientas de seguridad</li>
<li>Detectar amenazas</li>
<li>Resolver problemas de red</li>
</ul>


<p><strong>Tip</strong>: Usa Reachability Analyzer para confirmar la conectividad entre el origen y destino del espejo.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/">Conceptos Básicos y Avanzados de Amazon VPC</a></li><li><a href="https://dondeaprendoaws.com/blog/observabilidad-en-aws-con-amazon-x-ray/">Observabilidad en AWS con Amazon X-Ray</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-seguridad-en-aws/">Mejores Prácticas de Seguridad en AWS</a></li>
</ul>
</p>
