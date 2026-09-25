---
title: "Optimización de Costos de AWS Lambda"
description: "Consejos y estrategias para optimizar los costos de AWS Lambda sin sacrificar el rendimiento. Aprende a ajustar la memoria, el tiempo de ejecución y la concurrencia para reducir gastos."
publishedAt: "2024-03-19"
publishedTimestamp: "2024-03-19T01:39:56.043Z"
cover: "/assets/blog/149aa7de30b1ec6844a9daf3.jpg"
coverAlt: "Thumbnail for: Optimización de Costos de AWS Lambda"
ogImage: "/assets/blog/149aa7de30b1ec6844a9daf3.jpg"
related:
  - title: "Configuración de Service Discovery en Amazon ECS"
    url: "https://dondeaprendoaws.com/blog/configuracion-de-service-discovery-en-amazon-ecs/"
    image: "/assets/blog/06c78ff6dbda05d66c1f63e8.jpg"
    imageAlt: ""
  - title: "Tipos y Tamaños de Instancias EC2: Guía Completa"
    url: "https://dondeaprendoaws.com/blog/tipos-y-tamanos-de-instancias-ec2-guia-completa/"
    image: "/assets/blog/c17586bd518131452b0a717a.png"
    imageAlt: ""
  - title: "Certificación AWS gratis: Materiales de estudio"
    url: "https://dondeaprendoaws.com/blog/certificacion-aws-gratis-materiales-de-estudio/"
    image: "/assets/blog/0d33d48b094b306e8f1fb75f.jpg"
    imageAlt: ""
---

<p>Si quieres reducir tus gastos en AWS Lambda sin sacrificar el rendimiento, estás en el lugar correcto. Aquí te presento un resumen de estrategias efectivas para optimizar costos:</p>


<ul>
<li><strong>Elije inteligentemente la memoria y el tiempo de ejecución</strong>: Ajusta la memoria y el tiempo de ejecución de tus funciones Lambda basándote en sus necesidades reales, comenzando con valores bajos y ajustando según sea necesario.</li>
<li><strong>Aprovecha las capas Lambda y reusa entornos</strong>: Usa capas para compartir código y dependencias entre funciones, y configura tu entorno para reutilizar conexiones, reduciendo la latencia y el costo.</li>
<li><strong>Monitorea y ajusta regularmente</strong>: Usa CloudWatch y herramientas como <code class="inline-code">optimize-lambda-cost</code> para analizar el rendimiento y los costos, ajustando la configuración para optimizar ambos.</li>
<li><strong>Experimenta con la configuración</strong>: Aumentar la memoria puede hacer que tus funciones se ejecuten más rápido y por menos tiempo, lo que a menudo resulta en un menor costo general. Ajusta también la concurrencia y el tiempo de ejecución según tus necesidades.</li>
</ul>


<p>Con estos consejos, puedes encontrar el balance perfecto entre costo y rendimiento para tus funciones Lambda, aprovechando al máximo el cómputo sin servidores de AWS.</p>


<h3 id="memoria-asignada" tabindex="-1">Memoria Asignada</h3>


<p>Cuando usas AWS Lambda, le das a tu función una cantidad específica de memoria RAM. Esto es como decirle cuánto espacio tiene para trabajar. Si le das más memoria, tu función puede trabajar más rápido. Pero, esto también significa que pagarás más, porque AWS Lambda cobra según la memoria que uses y el tiempo que tu función esté en marcha.</p>


<p>Lo mejor es encontrar el equilibrio perfecto: darle a tu función la memoria que realmente necesita. No demasiado para no gastar de más, pero tampoco tan poco que tu función se vuelva lenta.</p>


<p>AWS sugiere empezar con poca memoria, como 128MB o 256MB, y ver cómo funciona. Si notas que necesita más, puedes aumentarla poco a poco.</p>


<h3 id="tiempo-de-ejecuci%C3%B3n" tabindex="-1">Tiempo de Ejecución</h3>


<p>El tiempo de ejecución es el límite de tiempo que tu función puede estar activa en una sola vez. Si se pasa de este tiempo, AWS la detiene automáticamente.</p>


<p>El mínimo es de 1 segundo, y después de eso, AWS cobra por cada 100 milisegundos que tu función esté corriendo.</p>


<p>Igual que con la memoria, es importante ajustar este tiempo. No lo pongas tan corto que tu función no pueda terminar lo que tiene que hacer, pero tampoco tan largo que termines pagando de más sin necesidad.</p>


<p>AWS aconseja comenzar con un tiempo corto y aumentarlo si ves que tus funciones no alcanzan a terminar.</p>


<p>Ajustar bien la memoria y el tiempo de ejecución te ayuda a controlar tus gastos en Lambda, asegurando que no pagas de más sin perder rendimiento.</p>


<h2 id="evaluaci%C3%B3n-del-rendimiento-actual" tabindex="-1">Evaluación del Rendimiento Actual</h2>


<p>Para entender cómo están funcionando tus funciones Lambda y cuánto te están costando, es buena idea mirar los registros de CloudWatch. Estos registros te muestran cómo se comporta tu función cuando la usas en el mundo real.</p>


<p>Aquí tienes unos pasos sencillos para revisar esos registros:</p>


<ul>
<li>Abre CloudWatch en la consola de AWS y busca el grupo de registros de tu función Lambda. Cada vez que tu función se ejecuta, se crea un registro que muestra detalles como cuánto tiempo tardó y cuánta memoria usó.</li>
<li>CloudWatch te permite hacer consultas en los registros. Así puedes ver, por ejemplo, cuánto tiempo tardan tus funciones en promedio.</li>
<li>También puedes ver cómo la cantidad de memoria que asignaste afecta el rendimiento. Esto te ayuda a encontrar el balance perfecto entre lo rápido que quieres que corra tu función y cuánto estás dispuesto a pagar.</li>
<li>Puedes configurar alarmas en CloudWatch para que te avise si tus funciones tienen muchos errores o si están tardando demasiado. Esto te ayuda a solucionar problemas rápidamente.</li>
</ul>


<p>Otra herramienta que puedes usar es <a href="https://github.com/alexcasalboni/aws-lambda-power-tuning" rel="noopener noreferrer" target="_blank">optimize-lambda-cost</a>, que es gratuita y analiza tus registros para darte consejos sobre cuánta memoria y concurrencia deberías usar.</p>


<p>Siguiendo estos pasos, podrás tener una idea clara de cómo se están comportando tus funciones Lambda. Con esta información, puedes experimentar con diferentes configuraciones para mejorar el rendimiento y reducir los costos.</p>


<h2 id="herramientas-y-estrategias-para-la-optimizaci%C3%B3n" tabindex="-1">Herramientas y Estrategias para la Optimización</h2>


<h3 id="instalaci%C3%B3n" tabindex="-1">Instalación</h3>


<p>Para empezar a usar la herramienta gratuita <a href="https://github.com/iopipe/optimize-lambda-cost" rel="noopener noreferrer" target="_blank">optimize-lambda-cost</a>, que revisa los registros de tus funciones Lambda para darte consejos sobre cómo ahorrar, sigue estos pasos:</p>


<ul>
<li>Primero, necesitas tener Go en tu computadora. Si no lo tienes, ve al <a href="https://golang.org/doc/install" rel="noopener noreferrer" target="_blank">sitio oficial de Go</a> y descárgalo.</li>
<li>Luego, abre una terminal o línea de comandos y escribe esto:</li>
</ul>


<pre><code>go get -u -v github.com/iopipe/optimize-lambda-cost
</code></pre>


<ul>
<li>Con esto, la herramienta se descargará e instalará en tu equipo.</li>
</ul>


<h3 id="uso" tabindex="-1">Uso</h3>


<p>Una vez instalada, puedes usar esta herramienta para revisar cómo están funcionando tus funciones Lambda y ver recomendaciones.</p>


<p>Por ejemplo, si quieres revisar cómo ha estado trabajando tu función llamada "mi-funcion" durante las últimas 4 horas, escribe:</p>


<pre><code>optimize-lambda-cost analyze -p perfil-con-permisos -f mi-funcion --since="4 horas"
</code></pre>


<p>Aquí:</p>


<ul>
<li><code class="inline-code">-p</code> es para decirle qué perfil de AWS CLI usar</li>
<li><code class="inline-code">-f</code> es el nombre de tu función Lambda</li>
<li><code class="inline-code">--since</code> es para ver los registros de las últimas 4 horas</li>
</ul>


<p>Esto te mostrará algo como:</p>


<pre><code>Memoria sugerida basada en tu uso:
Sugerencia para el percentil 25: 1280 MB
Sugerencia para el percentil 50: 1408 MB
Sugerencia para el percentil 75: 1536 MB
</code></pre>


<p>La herramienta te dirá cuánta memoria sería ideal darle a tu función según cómo la has usado. Así, puedes ajustarla para no gastar de más pero asegurarte de que funcione bien.</p>


<p>Además, te muestra datos sobre cuánto tiempo toma ejecutar tu función, cuánta memoria usa, y cuánto te costaría por millón de solicitudes.</p>


<p>Experimentando con diferentes ajustes y viendo estas métricas, puedes encontrar un buen equilibrio entre lo que gastas y cómo funciona tu función.</p>


<h2 id="ajustes-pr%C3%A1cticos-de-configuraci%C3%B3n" tabindex="-1">Ajustes Prácticos de Configuración</h2>


<p>Para que tus funciones de AWS Lambda te cuesten menos y trabajen mejor, hay algunos cambios sencillos que puedes hacer. Estos trucos te ayudan a mejorar cómo funcionan tus tareas y a gastar menos al mismo tiempo.</p>


<h3 id="aumento-de-memoria" tabindex="-1">Aumento de Memoria</h3>


<p>Una manera muy eficaz de hacer que Lambda funcione mejor es darle más memoria a tus tareas. Si aumentas la memoria, tus tareas se pueden hacer más rápido y, por lo tanto, AWS te cobra menos tiempo.</p>


<p>Por ejemplo, si pasamos de 512MB a 1024MB de memoria, el tiempo que tardan las tareas en hacerse puede bajar bastante:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Memoria</th>
<th>Tiempo de Ejecución (percentil 99)</th>
</tr>
</thead>
<tbody>
<tr>
<td>512MB</td>
<td>18500 ms</td>
</tr>
<tr>
<td>1024MB</td>
<td>7300 ms</td>
</tr>
</tbody>
</table></figure>


<p>Y si aumentamos la memoria a 2048MB, el costo por cada millón de tareas solo sube un poco, pero la velocidad mejora mucho.</p>


<h3 id="ajuste-de-tiempo-de-ejecuci%C3%B3n" tabindex="-1">Ajuste de Tiempo de Ejecución</h3>


<p>Reducir el tiempo máximo que puede durar una tarea también puede ayudarte a ahorrar. Si notas que tus tareas casi nunca usan todo el tiempo que les das, puedes bajar ese límite sin problemas.</p>


<p>Por ejemplo, si tenías un límite de 5 segundos pero tus tareas suelen durar 3 segundos, puedes bajar el límite a 4 segundos. Esto te permite gastar menos sin que afecte cómo funcionan tus tareas.</p>


<h3 id="concurrencia" tabindex="-1">Concurrencia</h3>


<p>Manejar bien cuántas tareas se hacen al mismo tiempo (concurrencia) también es clave para ahorrar. Lo ideal es tener la concurrencia justa para tu trabajo, pero no tanta que termines pagando por cosas que no usas.</p>


<p>Si ves que tu concurrencia está en 100 pero en realidad usas 50, puedes bajarla a 60 o 70. Así reduces costos sin perder rendimiento.</p>


<p>Con estos ajustes y revisando cómo van tus tareas en CloudWatch Logs, puedes encontrar la mejor manera de configurar tus funciones Lambda para que sean eficientes y no gasten de más.</p>


<h2 id="casos-de-uso-y-ejemplos-reales" tabindex="-1">Casos de Uso y Ejemplos Reales</h2>


<p>La optimización de costos de AWS Lambda puede ser muy efectiva en ciertos casos de uso comunes:</p>


<h3 id="procesamiento-por-lotes-as%C3%ADncrono" tabindex="-1">Procesamiento por lotes asíncrono</h3>


<p>AWS Lambda es ideal para tareas asíncronas como procesamiento por lotes, donde las tareas se activan por eventos de diferentes fuentes. Algunos ejemplos son:</p>


<ul>
<li>Procesar archivos subidos a un bucket S3</li>
<li>Enviar notificaciones por email basadas en eventos de una base de datos</li>
<li>Generar reportes diarios con datos agregados</li>
</ul>


<p>En estos casos, Lambda te permite correr tu código solo cuando es necesario, sin la necesidad de mantener servidores funcionando todo el tiempo. Y si optimizas la configuración como mencionamos antes, puedes reducir bastante los costos.</p>


<h3 id="apis-y-backends-serverless" tabindex="-1">APIs y backends serverless</h3>


<p>Las funciones Lambda también son útiles para crear APIs y backends que se ajustan automáticamente según la demanda. Por ejemplo:</p>


<ul>
<li>Una API para una aplicación móvil que consulta una base de datos</li>
<li>Un servicio backend para procesar peticiones de un sitio web</li>
</ul>


<p>Si configuras bien los tiempos de espera, la memoria y la concurrencia según el tráfico esperado, Lambda puede manejar estas tareas de manera eficiente y económica.</p>


<h3 id="casos-donde-la-optimizaci%C3%B3n-es-m%C3%A1s-dif%C3%ADcil" tabindex="-1">Casos donde la optimización es más difícil</h3>


<p>Existen situaciones donde reducir costos en Lambda puede ser más complicado:</p>


<ul>
<li>Tareas que necesitan mucho procesamiento de CPU durante tiempos prolongados. Aquí es mejor usar instancias EC2.</li>
<li>Trabajos que deben estar siempre activos o que necesitan mantener un estado. Lambda se reinicia desde cero cada vez que se ejecuta.</li>
<li>Cuando los requisitos de rendimiento son muy estrictos o se necesita una latencia muy baja. A veces, optimizar para reducir costos puede afectar el rendimiento.</li>
</ul>


<p>En resumen, Lambda es una opción excelente para ahorrar en tareas asíncronas, procesamiento por lotes, APIs y backends. Pero no es la mejor para trabajos que requieren un esfuerzo constante, tareas con estado o cuando la latencia debe ser mínima. Conociendo estos límites, puedes aprovecharlo al máximo.</p>


<h2 id="conclusiones" tabindex="-1">Conclusiones</h2>


<p>Para ahorrar en AWS Lambda y seguir teniendo un buen rendimiento, hay algunas cosas clave que puedes hacer:</p>


<ul>
<li>Mira cómo estás usando los recursos ahora y ajusta la memoria y el tiempo de ejecución según lo que necesites.</li>
<li>Usa herramientas como CloudWatch Logs y optimize-lambda-cost para que te den consejos específicos.</li>
<li>Si le das más memoria a tus tareas, pueden correr más rápido.</li>
<li>Si tu código casi nunca usa todo el tiempo de ejecución que le das, intenta reducirlo.</li>
<li>Asegúrate de que la cantidad de tareas que haces al mismo tiempo (concurrencia) sea la adecuada para lo que realmente necesitas.</li>
</ul>


<p>Siguiendo estos consejos y encontrando el balance correcto entre rendimiento y costo, puedes gastar menos en AWS Lambda. Esto significa que puedes disfrutar de las ventajas de usar cómputo sin servidores sin pagar de más.</p>


<p>Es buena idea mirar cada situación por separado y probar diferentes ajustes, siempre viendo cómo afectan al rendimiento y al costo. Tomar decisiones basadas en datos te ayudará a optimizar Lambda de la mejor manera.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/utilizando-lambda-layers-en-multiples-funciones-lambda/">Utilizando Lambda Layers en Múltiples Funciones Lambda</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-serverless-en-aws/">Introducción a Serverless en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-amazon-ec2/">Mejores Prácticas Para Amazon EC2</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-para-aws-lambda/">Mejores Prácticas Para AWS Lambda</a></li>
</ul>
</p>
