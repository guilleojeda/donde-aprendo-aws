---
title: "Estrategias de Caché Rentables para Apps Serverless"
description: "Descubre cómo implementar estrategias de caché en aplicaciones serverless para mejorar la velocidad y reducir costos en AWS."
publishedAt: "2024-10-27"
publishedTimestamp: "2024-10-27T02:26:14.893Z"
cover: "/assets/blog/ddae590c4e3ebe901251f97c.webp"
coverAlt: "Thumbnail for: Estrategias de Caché Rentables para Apps Serverless"
ogImage: "/assets/blog/ddae590c4e3ebe901251f97c.webp"
related:
  - title: "Recursos Personalizados en CloudFormation con Lambda"
    url: "https://dondeaprendoaws.com/blog/recursos-personalizados-en-cloudformation-con-lambda/"
    image: "/assets/blog/e66856987698eaa908dfab80.jpg"
    imageAlt: ""
  - title: "¿Cómo Escala DynamoDB? Modos On Demand y Provisioned"
    url: "https://dondeaprendoaws.com/blog/como-escala-dynamodb-modos-on-demand-y-provisioned/"
    image: "/assets/blog/ce62e0cc8508d5055bba53b4.png"
    imageAlt: ""
  - title: "Conceptos Básicos y Avanzados de Amazon VPC"
    url: "https://dondeaprendoaws.com/blog/conceptos-basicos-y-avanzados-de-amazon-vpc/"
    image: "/assets/blog/12c27432a1ba20e5bffcb7b0.jpg"
    imageAlt: ""
---

<p><strong>¿Necesitas hacer tus apps serverless más rápidas y baratas? El caché es la solución.</strong></p>


<p>Aquí tienes todo lo que necesitas saber sobre caché en serverless:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Caché</th>
<th>Ahorro</th>
<th>Velocidad</th>
</tr>
</thead>
<tbody>
<tr>
<td>Cliente (Navegador)</td>
<td>Sin costo</td>
<td>Instantáneo</td>
</tr>
<tr>
<td><a href="https://docs.aws.amazon.com/cloudfront/" rel="noopener noreferrer" target="_blank">CloudFront</a></td>
<td>35-40% menos peticiones</td>
<td>&lt; 1 segundo</td>
</tr>
<tr>
<td>API Gateway</td>
<td>45% menos llamadas <a href="https://docs.aws.amazon.com/lambda/" rel="noopener noreferrer" target="_blank">Lambda</a></td>
<td>30ms</td>
</tr>
<tr>
<td>Lambda</td>
<td>50-60% menos memoria</td>
<td>Variable</td>
</tr>
</tbody>
</table></figure>


<p><strong>Los números no mienten:</strong></p>


<ul>
<li>Sin caché: $7,081.13 por 1M llamadas</li>
<li>Con caché: $0.75 por 1M llamadas</li>
<li>Mejora en tiempo: De 38 segundos a menos de 1 segundo</li>
</ul>


<p><strong>Tres formas de implementar caché:</strong></p>


<figure class="table"><table>
<thead>
<tr>
<th>Método</th>
<th>Mejor Para</th>
<th>Principal Ventaja</th>
</tr>
</thead>
<tbody>
<tr>
<td>Lazy Loading</td>
<td>Datos poco usados</td>
<td>Solo guarda lo necesario</td>
</tr>
<tr>
<td>Write-Through</td>
<td>Datos que cambian mucho</td>
<td>Siempre actualizado</td>
</tr>
<tr>
<td>TTL</td>
<td>Datos semi-estáticos</td>
<td>Se limpia solo</td>
</tr>
</tbody>
</table></figure>


<p><strong>Lo que debes saber:</strong></p>


<ul>
<li>El caché más cerca del usuario = mejor rendimiento</li>
<li>TTL de 2-5 minutos = balance óptimo</li>
<li>Lazy loading = control de memoria</li>
<li>Monitoreo constante = control de costos</li>
</ul>


<p>Este artículo te muestra paso a paso cómo implementar caché en tu app serverless, desde la configuración básica hasta técnicas avanzadas de optimización.</p>


<h2 class="sb" id="related-video-from-youtube" tabindex="-1">Related video from YouTube</h2>


<iframe allowfullscreen="" loading="lazy" src="https://www.youtube-nocookie.com/embed/z8wGSykEauI" title="Video de YouTube"></iframe>
<h2 class="sb" id="problemas-clave-del-cach%C3%A9-en-serverless" tabindex="-1">Problemas Clave del Caché en Serverless</h2>


<p>El caché en sistemas serverless presenta 4 retos que afectan su funcionamiento:</p>


<h3 id="cold-start-y-su-impacto" tabindex="-1">Cold Start y su Impacto</h3>


<p>El cold start golpea directo al rendimiento:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Escenario</th>
<th>Tiempo de Respuesta</th>
</tr>
</thead>
<tbody>
<tr>
<td>Función + VPC</td>
<td>8.83s extra</td>
</tr>
<tr>
<td>Con Concurrencia</td>
<td>7-66ms</td>
</tr>
<tr>
<td>Sin Concurrencia</td>
<td>650ms</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>AWS introdujo <a href="https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html" rel="noopener noreferrer" target="_blank">SnapStart</a> para atacar este problema: toma una foto del estado de la función cuando se publica, la encripta y guarda en caché para acceso rápido.</p>
</blockquote>


<h3 id="datos-fuera-de-sincron%C3%ADa" tabindex="-1">Datos Fuera de Sincronía</h3>


<p>Cada Lambda tiene su propio caché, lo que genera:</p>


<ul>
<li>Datos diferentes entre servidores</li>
<li>Respuestas inconsistentes</li>
<li>Conexiones que no cierran bien</li>
</ul>


<h3 id="l%C3%ADmites-que-frenan-el-rendimiento" tabindex="-1">Límites que Frenan el Rendimiento</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Elemento</th>
<th>Límite</th>
<th>Efecto</th>
</tr>
</thead>
<tbody>
<tr>
<td>Memoria</td>
<td>128MB - 10GB</td>
<td>+6-7ms con 128MB</td>
</tr>
<tr>
<td>Conexiones</td>
<td>Timeout 60s</td>
<td>Conexiones muertas</td>
</tr>
<tr>
<td>Caché</td>
<td>Por contenedor</td>
<td>Sin garantía de datos</td>
</tr>
</tbody>
</table></figure>


<h3 id="el-precio-del-cach%C3%A9-mal-implementado" tabindex="-1">El Precio del Caché Mal Implementado</h3>


<p>Las pruebas muestran números claros:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Caso</th>
<th>Resultado</th>
</tr>
</thead>
<tbody>
<tr>
<td>Sin caché</td>
<td>11x más lento</td>
</tr>
<tr>
<td>Con caché</td>
<td>Procesa 25 vuelos</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>Un test comparó Lambda con <a href="https://www.scaleoutdigitaltwins.com/" rel="noopener noreferrer" target="_blank">ScaleOut Digital Twins</a>: el sistema serverless necesitó bloqueos para sincronizar <a href="https://docs.aws.amazon.com/dynamodb/" rel="noopener noreferrer" target="_blank">DynamoDB</a>, mientras la plataforma en memoria lo actualizaba automáticamente. El resultado: Digital Twin procesó 25 cancelaciones (100 pasajeros/vuelo) 11 veces más rápido.</p>
</blockquote>


<h2 class="sb" id="c%C3%B3mo-ahorrar-con-cach%C3%A9" tabindex="-1">Cómo Ahorrar con Caché</h2>


<p>El caché es una de las mejores formas de reducir costos en AWS. Veamos cómo.</p>


<h3 id="cach%C3%A9-en-navegador-y-api-gateway" tabindex="-1">Caché en Navegador y API Gateway</h3>


<p>API Gateway incluye caché que elimina llamadas Lambda que no necesitas:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo</th>
<th>Velocidad</th>
<th>Ahorro</th>
</tr>
</thead>
<tbody>
<tr>
<td>Sin caché</td>
<td>55ms</td>
<td>Precio base</td>
</tr>
<tr>
<td>Con caché</td>
<td>30ms</td>
<td>45% menos</td>
</tr>
<tr>
<td>Mínimo</td>
<td>0.5 GB</td>
<td>$14.60/mes</td>
</tr>
</tbody>
</table></figure>


<p>¿Cuánto caché necesitas? Depende del tamaño de tu API:</p>


<ul>
<li>APIs pequeñas: 0.5 - 1.6 GB</li>
<li>APIs medianas: 6.1 - 13.5 GB</li>
<li>APIs grandes: 28.4 - 237 GB</li>
</ul>


<h3 id="cach%C3%A9-en-lambda" tabindex="-1">Caché en <a href="https://docs.aws.amazon.com/lambda/" rel="noopener noreferrer" target="_blank">Lambda</a></h3>


<p><figure><img alt="Lambda" src="/assets/blog/90d376eb716637cb83251502.jpg"/></figure></p>


<p>Lambda puede guardar datos entre ejecuciones. Mira este ejemplo:</p>


<pre><code class="language-python">cache = {}
def get_user(user_id):
    if user_id not in cache:
        cache[user_id] = consultar_base_datos(user_id)
    return cache[user_id]
</code></pre>


<h3 id="cach%C3%A9-lazy%3A-carga-solo-lo-que-necesitas" tabindex="-1">Caché Lazy: Carga Solo lo que Necesitas</h3>


<p>El caché lazy es MUY eficiente:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Beneficio</th>
<th>¿Por qué?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Menos memoria</td>
<td>Solo guarda lo usado</td>
</tr>
<tr>
<td>Auto-actualización</td>
<td>Se refresca al expirar</td>
</tr>
<tr>
<td>Menos consultas</td>
<td>Reduce carga en BD</td>
</tr>
</tbody>
</table></figure>


<h3 id="cach%C3%A9-para-bases-de-datos" tabindex="-1">Caché para Bases de Datos</h3>


<p>Elige según lo que necesites:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Opción</th>
<th>Úsala para</th>
</tr>
</thead>
<tbody>
<tr>
<td>DynamoDB DAX</td>
<td>Muchas lecturas</td>
</tr>
<tr>
<td><a href="https://docs.aws.amazon.com/elasticache/" rel="noopener noreferrer" target="_blank">ElastiCache</a></td>
<td>Datos en memoria</td>
</tr>
<tr>
<td>CloudFront + API</td>
<td>Caché distribuido</td>
</tr>
</tbody>
</table></figure>


<p>Para gastar menos:</p>


<ul>
<li>TTL de 2-5 minutos = balance entre velocidad y datos frescos</li>
<li>Usa caché del navegador para contenido que no cambia</li>
<li>Implementa caché lazy para controlar memoria</li>
<li>Revisa el tamaño del caché para no pagar de más</li>
</ul>


<h2 class="sb" id="gu%C3%ADas-de-configuraci%C3%B3n" tabindex="-1">Guías de Configuración</h2>


<h3 id="m%C3%A9todos-de-actualizaci%C3%B3n-de-cach%C3%A9" tabindex="-1">Métodos de Actualización de Caché</h3>


<p>Hay 3 formas de mantener tu caché fresco:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Método</th>
<th>Uso</th>
<th>Ventajas</th>
</tr>
</thead>
<tbody>
<tr>
<td>Lazy Loading</td>
<td>Datos leídos con frecuencia</td>
<td>Solo guarda lo necesario</td>
</tr>
<tr>
<td>Write-Through</td>
<td>Datos que cambian mucho</td>
<td>Siempre actualizado</td>
</tr>
<tr>
<td>TTL</td>
<td>Datos semi-estáticos</td>
<td>Auto-limpieza</td>
</tr>
</tbody>
</table></figure>


<h3 id="reducci%C3%B3n-de-costos" tabindex="-1">Reducción de Costos</h3>


<p>Aquí tienes código que FUNCIONA para ahorrar dinero:</p>


<pre><code class="language-python"># Caché lazy en Lambda que ahorra costos
cache = {}
def get_data(key):
    if key not in cache:
        cache[key] = obtener_datos_externos(key)
        cache['ttl'] = tiempo_actual() + 300  # 5 minutos
    return cache[key]
</code></pre>


<p>Mira estos números:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Acción</th>
<th>Ahorro Estimado</th>
</tr>
</thead>
<tbody>
<tr>
<td>TTL de 2-5 minutos</td>
<td>30-40% menos consultas</td>
</tr>
<tr>
<td>Lazy Loading</td>
<td>50-60% menos memoria</td>
</tr>
<tr>
<td>CloudFront + API Gateway</td>
<td>45% menos llamadas Lambda</td>
</tr>
</tbody>
</table></figure>


<h3 id="factores-de-velocidad" tabindex="-1">Factores de Velocidad</h3>


<p>¿Qué hace lento tu caché? Aquí están los datos:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Factor</th>
<th>Impacto</th>
<th>Solución</th>
</tr>
</thead>
<tbody>
<tr>
<td>Tamaño del caché</td>
<td>+5ms por GB</td>
<td>Usar lazy loading</td>
</tr>
<tr>
<td>Ubicación</td>
<td>+20-50ms entre regiones</td>
<td>CloudFront</td>
</tr>
<tr>
<td>Conexiones</td>
<td>+10ms por conexión</td>
<td>Connection pooling</td>
</tr>
</tbody>
</table></figure>


<p>Configura ElastiCache en DOS pasos:</p>


<pre><code class="language-bash">aws elasticache create-serverless-cache \
  --serverless-cache-name cache-01 \
  --description "ElastiCache para Lambda" \
  --engine valkey
</code></pre>


<p>Revisa el estado:</p>


<pre><code class="language-bash">aws elasticache describe-serverless-caches \
  --serverless-cache-name cache-01
</code></pre>


<p>Configura Lambda según estos números:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Uso de Memoria</th>
<th>Tiempo de Ejecución</th>
<th>Configuración Recomendada</th>
</tr>
</thead>
<tbody>
<tr>
<td>&lt; 128MB</td>
<td>&lt; 100ms</td>
<td>128MB</td>
</tr>
<tr>
<td>128MB - 256MB</td>
<td>100-500ms</td>
<td>256MB</td>
</tr>
<tr>
<td>&gt; 256MB</td>
<td>&gt; 500ms</td>
<td>512MB o más</td>
</tr>
</tbody>
</table></figure>


<h2 class="sb" id="patrones-b%C3%A1sicos-de-cach%C3%A9" tabindex="-1">Patrones Básicos de Caché</h2>


<h3 id="write-through" tabindex="-1">Write-Through</h3>


<p>El write-through mantiene sincronizados el caché y la base de datos. Cada vez que escribes datos, se actualizan AMBOS lugares.</p>


<p>Así se implementa en Python:</p>


<pre><code class="language-python">def guardar_usuario(id_usuario, valores):
    # Guardar en DB
    registro = db.query("update usuarios ... where id = ?", id_usuario, valores)
    # Actualizar caché
    cache.set(id_usuario, registro)
    return registro
</code></pre>


<figure class="table"><table>
<thead>
<tr>
<th>Ventajas</th>
<th>Desventajas</th>
</tr>
</thead>
<tbody>
<tr>
<td>Datos siempre al día</td>
<td>Escrituras más lentas</td>
</tr>
<tr>
<td>Sin inconsistencias</td>
<td>Más RAM necesaria</td>
</tr>
<tr>
<td>Lecturas rápidas</td>
<td>Costos más altos</td>
</tr>
</tbody>
</table></figure>


<h3 id="cache-aside" tabindex="-1">Cache-Aside</h3>


<p>El cache-aside (o lazy loading) solo guarda datos en caché cuando alguien los pide. Es como un almacén que solo ordena productos cuando hay demanda.</p>


<p>Mira cómo funciona:</p>


<pre><code class="language-python">def obtener_usuario(id_usuario):
    # Revisar caché
    registro = cache.get(id_usuario)
    if registro is None:
        # Consultar DB
        registro = db.query("select * from usuarios where id = ?", id_usuario)
        # Guardar en caché
        cache.set(id_usuario, registro)
    return registro
</code></pre>


<figure class="table"><table>
<thead>
<tr>
<th>Caso de Uso</th>
<th>Por Qué</th>
</tr>
</thead>
<tbody>
<tr>
<td>Perfiles</td>
<td>Se leen más que se modifican</td>
</tr>
<tr>
<td>Catálogos</td>
<td>Cambios poco frecuentes</td>
</tr>
<tr>
<td>Config</td>
<td>Datos que casi no cambian</td>
</tr>
</tbody>
</table></figure>


<p>¿Cuál elegir? Depende de tus necesidades:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Write-Through</th>
<th>Cache-Aside</th>
</tr>
</thead>
<tbody>
<tr>
<td>Velocidad escritura</td>
<td>Lenta</td>
<td>Rápida</td>
</tr>
<tr>
<td>Consistencia</td>
<td>Alta</td>
<td>Media</td>
</tr>
<tr>
<td>Memoria</td>
<td>Más</td>
<td>Menos</td>
</tr>
<tr>
<td><a href="https://dondeaprendoaws.com/blog/aws-gratis-para-educadores-y-estudiantes/">Costo AWS</a></td>
<td>Alto</td>
<td>Bajo</td>
</tr>
<tr>
<td>Ideal para</td>
<td>Datos que cambian mucho</td>
<td>Datos estables</td>
</tr>
</tbody>
</table></figure>


<h2 class="sb" id="configuraci%C3%B3n-y-mejora-del-cach%C3%A9" tabindex="-1">Configuración y Mejora del Caché</h2>


<p>El caché puede hacer o romper tu aplicación serverless. Veamos cómo hacerlo bien.</p>


<h3 id="problemas-frecuentes" tabindex="-1">Problemas Frecuentes</h3>


<p>Estos son los dolores de cabeza más comunes con el caché:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Problema</th>
<th>Por Qué Ocurre</th>
<th>Cómo Arreglarlo</th>
</tr>
</thead>
<tbody>
<tr>
<td>Variables globales que cambian</td>
<td>El estado persiste entre llamadas</td>
<td>No uses variables globales que cambien</td>
</tr>
<tr>
<td>Clientes DB muertos</td>
<td>Las conexiones se vencen</td>
<td>Crea un cliente nuevo en cada llamada</td>
</tr>
<tr>
<td>Gastos fuera de control</td>
<td>Mala configuración</td>
<td>Pon alertas y revisa métricas</td>
</tr>
<tr>
<td>Caché que no sirve</td>
<td>Datos que nadie usa</td>
<td>Mira qué datos necesita tu app</td>
</tr>
</tbody>
</table></figure>


<h3 id="medici%C3%B3n-del-rendimiento" tabindex="-1">Medición del Rendimiento</h3>


<p>¿Tu caché está funcionando? Aquí está cómo saberlo:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Qué Medir</th>
<th>Con Qué</th>
<th>Qué Buscar</th>
</tr>
</thead>
<tbody>
<tr>
<td>Éxitos vs Fallos</td>
<td>API Gateway</td>
<td>% de aciertos</td>
</tr>
<tr>
<td>Velocidad</td>
<td><a href="https://docs.aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">CloudWatch</a></td>
<td>Tiempo de respuesta</td>
</tr>
<tr>
<td>Memoria</td>
<td>CloudWatch</td>
<td>Uso de RAM</td>
</tr>
<tr>
<td>Usuarios simultáneos</td>
<td>CloudWatch</td>
<td>Picos de uso</td>
</tr>
</tbody>
</table></figure>


<h3 id="control-de-costos" tabindex="-1">Control de Costos</h3>


<p>Mantén tu billetera feliz:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Qué Hacer</th>
<th>Para Qué</th>
<th>Cómo</th>
</tr>
</thead>
<tbody>
<tr>
<td>Monitoreo 24/7</td>
<td>Ver problemas rápido</td>
<td><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-observabilidad-en-aws/">Alarmas en CloudWatch</a></td>
</tr>
<tr>
<td>Operaciones en grupo</td>
<td>Menos llamadas = menos $$</td>
<td>Junta operaciones similares</td>
</tr>
<tr>
<td>Limpia índices</td>
<td>Menos espacio = menos $$</td>
<td>Revisa cada mes</td>
</tr>
<tr>
<td>Solo guarda lo necesario</td>
<td>Menos datos = menos $$</td>
<td>Ajusta tus consultas</td>
</tr>
</tbody>
</table></figure>


<p>Amazon Prime Day 2022 manejó 105M de peticiones por segundo. ¿Su secreto? Un caché bien configurado.</p>


<p><strong>Dato de costos</strong>: <a href="https://www.gomomento.com/" rel="noopener noreferrer" target="_blank">Momento</a> cobra $0.50/GB de datos. Puede salir <a href="https://dondeaprendoaws.com/blog/amazon-dynamodb-la-base-de-datos-nosql-de-aws/">más barato que DynamoDB</a> si escribes mucho.</p>


<h2 class="sb" id="resumen" tabindex="-1">Resumen</h2>


<p>El caché puede reducir costos y mejorar el rendimiento de tus aplicaciones AWS. Aquí te explico cómo.</p>


<h3 id="tipos-de-cach%C3%A9-y-sus-beneficios" tabindex="-1">Tipos de Caché y Sus Beneficios</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Tipo de Caché</th>
<th>Para Qué Sirve</th>
<th>Beneficio Principal</th>
</tr>
</thead>
<tbody>
<tr>
<td>CloudFront</td>
<td>Archivos estáticos</td>
<td>35-40% menos peticiones</td>
</tr>
<tr>
<td>API Gateway</td>
<td>Datos API repetitivos</td>
<td>20-25% menos uso Lambda</td>
</tr>
<tr>
<td>Lambda</td>
<td>Consultas frecuentes</td>
<td>30-35% menos uso DB</td>
</tr>
<tr>
<td>DAX</td>
<td>Lecturas DB intensas</td>
<td>50% menos tiempo respuesta</td>
</tr>
</tbody>
</table></figure>


<h3 id="configuraci%C3%B3n-pr%C3%A1ctica" tabindex="-1">Configuración Práctica</h3>


<p>¿Cómo configurar tu caché? Así:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Elemento</th>
<th>Acción</th>
<th>Resultado</th>
</tr>
</thead>
<tbody>
<tr>
<td>Memoria</td>
<td>Inicia pequeño</td>
<td>Optimiza costos</td>
</tr>
<tr>
<td>Eventos</td>
<td>Usa event-driven</td>
<td>Menos Lambda</td>
</tr>
<tr>
<td>Variables</td>
<td>Guarda global</td>
<td>Menos llamadas</td>
</tr>
<tr>
<td>Conexiones</td>
<td>No Lambdas en serie</td>
<td>Mejor velocidad</td>
</tr>
</tbody>
</table></figure>


<h3 id="impacto-en-costos" tabindex="-1">Impacto en Costos</h3>


<p>Mira los números:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Servicio</th>
<th>Costo Base</th>
<th>Lo Que Ahorras</th>
</tr>
</thead>
<tbody>
<tr>
<td>Momento</td>
<td>$0.50/GB</td>
<td>Más barato que DynamoDB</td>
</tr>
<tr>
<td>DAX</td>
<td>Por nodo</td>
<td>10x más rápido</td>
</tr>
<tr>
<td>CloudFront</td>
<td>Por datos</td>
<td>50% más veloz</td>
</tr>
<tr>
<td>API Gateway</td>
<td>Por request</td>
<td>25-30% menos gasto</td>
</tr>
</tbody>
</table></figure>


<p><strong>Tip técnico</strong>: Con DAX, DynamoDB pasa de milisegundos a microsegundos. Es como pasar de caminar a volar.</p>


<p>¿Quieres aprender más sobre caché en AWS? Visita <a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a> para guías detalladas en español.</p>


<h2 class="sb" id="m%C3%A1s-informaci%C3%B3n" tabindex="-1">Más Información</h2>


<p>¿Necesitas profundizar en caché serverless? Aquí tienes los mejores recursos:</p>


<h3 id="documentaci%C3%B3n-principal" tabindex="-1">Documentación Principal</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Recurso</th>
<th>¿Qué Ofrece?</th>
<th>¿Por Qué Te Sirve?</th>
</tr>
</thead>
<tbody>
<tr>
<td><a href="https://dondeaprendoaws.com">Dónde Aprendo AWS</a></td>
<td>Guías de caché serverless en español</td>
<td>Tutoriales paso a paso con ejemplos reales</td>
</tr>
<tr>
<td>AWS Docs</td>
<td>Docs técnicas de DAX y Lambda</td>
<td>Información directa de la fuente</td>
</tr>
<tr>
<td>AWS en Español</td>
<td>Contenido de la comunidad</td>
<td>Casos prácticos y soluciones probadas</td>
</tr>
</tbody>
</table></figure>


<h3 id="docs-aws-que-debes-leer" tabindex="-1">Docs <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> que DEBES Leer</h3>


<p><figure><img alt="AWS" src="/assets/blog/2ebe3cf8e7ae57e98d3af846.jpg"/></figure></p>


<figure class="table"><table>
<thead>
<tr>
<th>Tema</th>
<th>Lo Que Aprenderás</th>
<th>Dónde Encontrarlo</th>
</tr>
</thead>
<tbody>
<tr>
<td>DAX</td>
<td>Todo sobre DynamoDB Accelerator</td>
<td>Sección DAX Docs</td>
</tr>
<tr>
<td>Lambda</td>
<td>Caché en funciones Lambda</td>
<td>Lambda Functions Docs</td>
</tr>
<tr>
<td>API Gateway</td>
<td>Optimización de API con caché</td>
<td>API Gateway Docs</td>
</tr>
</tbody>
</table></figure>


<h3 id="material-en-espa%C3%B1ol" tabindex="-1">Material en Español</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Contenido</th>
<th>Formato</th>
<th>¿Qué Te Aporta?</th>
</tr>
</thead>
<tbody>
<tr>
<td>Tutoriales</td>
<td>Video paso a paso</td>
<td>Ves la configuración en acción</td>
</tr>
<tr>
<td>Guías</td>
<td>PDF descargable</td>
<td>Estudias sin internet</td>
</tr>
<tr>
<td>Código</td>
<td>Repositorios Git</td>
<td>Copias y pegas soluciones</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p><strong>DATO CLAVE</strong>: AWS tiene un <a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">e-book gratis sobre serverless</a>. El capítulo 4 se enfoca en caché.</p>
</blockquote>


<h3 id="tus-herramientas" tabindex="-1">Tus Herramientas</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Tool</th>
<th>Para Qué Sirve</th>
<th>Por Qué Usarla</th>
</tr>
</thead>
<tbody>
<tr>
<td>AWS CDK</td>
<td>Código = Infraestructura</td>
<td>Configuras todo más rápido</td>
</tr>
<tr>
<td>CloudWatch</td>
<td>Ver métricas de caché</td>
<td>Detectas problemas al instante</td>
</tr>
<tr>
<td>Cost Explorer</td>
<td>Control de gastos</td>
<td>Ahorras dinero</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p><strong>OJO</strong>: AWS actualiza sus docs cada mes. Mira siempre la fecha de la última versión.</p>
</blockquote>


<h2 class="sb" id="preguntas-frecuentes" tabindex="-1">Preguntas Frecuentes</h2>


<h3 id="%C2%BFse-puede-almacenar-datos-en-cach%C3%A9-dentro-de-lambda%3F" tabindex="-1">¿Se puede almacenar datos en caché dentro de Lambda?</h3>


<p>Sí, Lambda permite almacenar datos en caché. Hay dos formas principales:</p>


<ol>
<li>En variables globales fuera del handler</li>
<li>En el directorio /tmp (hasta 512 MB)</li>
</ol>


<p>El caché funciona SOLO mientras el entorno de ejecución está activo. Es perfecto para guardar configuraciones y datos que uses con frecuencia.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Aspecto</th>
<th>Detalles</th>
</tr>
</thead>
<tbody>
<tr>
<td>Ubicación</td>
<td>Variables globales fuera del handler</td>
</tr>
<tr>
<td>Límite</td>
<td>512 MB en /tmp</td>
</tr>
<tr>
<td>Duración</td>
<td>Vida del entorno de ejecución</td>
</tr>
<tr>
<td>Mejor uso</td>
<td>Configs y datos estáticos</td>
</tr>
</tbody>
</table></figure>


<blockquote>
<p>"Al definir una variable global fuera del handler e inicializarla en la primera invocación, tendrás acceso a ella mientras Lambda esté activo" - Saif, Dev Genius</p>
</blockquote>


<h3 id="%C2%BFc%C3%B3mo-funciona-el-cach%C3%A9-en-lambda%3F" tabindex="-1">¿Cómo funciona el caché en Lambda?</h3>


<p>El caché en Lambda es simple: los datos se mantienen entre invocaciones, pero SOLO si usas el mismo entorno de ejecución.</p>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>Comportamiento</th>
</tr>
</thead>
<tbody>
<tr>
<td>Duración</td>
<td>Entre invocaciones del mismo entorno</td>
</tr>
<tr>
<td>Reset</td>
<td>Al desplegar nuevas versiones</td>
</tr>
<tr>
<td>Alcance</td>
<td>Solo en el entorno actual</td>
</tr>
<tr>
<td>Datos ideales</td>
<td>Configs y contenido estático</td>
</tr>
</tbody>
</table></figure>


<p><strong>Lo que debes saber:</strong></p>


<ul>
<li>Revisa si hay datos en caché antes de guardar</li>
<li>Define cuándo expiran tus datos</li>
<li>Usa /tmp para archivos temporales</li>
<li>El caché se borra con cada actualización</li>
</ul>


<p><strong>Ten en cuenta:</strong></p>


<ul>
<li>El caché dura lo que dure el entorno</li>
<li>Tienes 512 MB en /tmp</li>
<li>No esperes que el entorno se mantenga entre llamadas</li>
</ul>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/optimizacion-de-costos-de-aws-lambda/">Optimización de Costos de AWS Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/7-estrategias-de-serverless-para-startups-optimiza-costos/">7 Estrategias de Serverless para Startups: Optimiza Costos</a></li><li><a href="https://dondeaprendoaws.com/blog/guia-de-amazon-elasticache-almacenamiento-en-cache-en-memoria/">Guía de Amazon ElastiCache: Almacenamiento en Caché en Memoria</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-lambda-costo-vs-rendimiento/">AWS Lambda: Costo vs. Rendimiento</a></li>
</ul>
</p>
