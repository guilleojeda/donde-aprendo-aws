---
title: "Ahorro de Costos en AWS con Instancias Reservadas y Savings Plans"
description: "Ahorra dinero en AWS con Instancias Reservadas y Savings Plans. Compara flexibilidad, ahorro potencial, compromisos y aplicabilidad. Descubre cuál opción se adapta mejor a tus necesidades."
publishedAt: "2024-03-07"
publishedTimestamp: "2024-03-07T14:42:01.539Z"
cover: "/assets/blog/201da9e2ec2ae649f47566a7.jpg"
coverAlt: "Thumbnail for: Ahorro de Costos en AWS con Instancias Reservadas y Savings Plans"
ogImage: "/assets/blog/201da9e2ec2ae649f47566a7.jpg"
related:
  - title: "10 Repositorios de GitHub para Machine Learning en AWS"
    url: "https://dondeaprendoaws.com/blog/10-repositorios-de-github-para-machine-learning-en-aws/"
    image: "/assets/blog/0e7089d339cd0d6e09ee83cd.webp"
    imageAlt: ""
  - title: "Comprendiendo AWS Backup"
    url: "https://dondeaprendoaws.com/blog/comprendiendo-aws-backup/"
    image: "/assets/blog/25448721c535fa1737e8eeba.jpg"
    imageAlt: ""
  - title: "AWS Seguridad: Fundamentos Esenciales"
    url: "https://dondeaprendoaws.com/blog/aws-seguridad-fundamentos-esenciales/"
    image: "/assets/blog/15bc5fcf943d474b0b00277c.jpg"
    imageAlt: ""
---

<p>Si buscas reducir tus costos en AWS, existen dos estrategias clave: <strong>Instancias Reservadas (RI)</strong> y <strong>Savings Plans</strong>. Aquí te resumo cómo funcionan y cuándo es mejor usar cada una:</p>


<ul>
<li><strong><a href="https://aws.amazon.com/es/ec2/pricing/reserved-instances/buyer/" rel="noopener noreferrer" target="_blank">Instancias Reservadas</a></strong>: Te comprometes a usar cierta capacidad de AWS por 1 o 3 años a cambio de precios más bajos. Ideal si sabes exactamente lo que necesitarás.</li>
<li><strong>Savings Plans</strong>: Te comprometes a gastar una cantidad fija de dinero durante 1 o 3 años, pero con la flexibilidad de usar ese dinero en diversos servicios de AWS. Perfecto si buscas flexibilidad.</li>
</ul>


<h3 id="comparaci%C3%B3n-r%C3%A1pida" tabindex="-1">Comparación Rápida</h3>


<figure class="table"><table>
<thead>
<tr>
<th>Criterio</th>
<th>Instancias Reservadas</th>
<th>Savings Plans</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Flexibilidad</strong></td>
<td>Baja, compromiso con servicios específicos</td>
<td>Alta, compromiso de gasto en cualquier servicio</td>
</tr>
<tr>
<td><strong>Ahorro Potencial</strong></td>
<td>Hasta 72%</td>
<td>Hasta 72%</td>
</tr>
<tr>
<td><strong>Compromiso</strong></td>
<td>1 o 3 años en capacidad específica</td>
<td>1 o 3 años en gasto</td>
</tr>
<tr>
<td><strong>Aplicabilidad</strong></td>
<td>Limitada a ciertos servicios y regiones</td>
<td>Aplica a varios servicios y todas las regiones</td>
</tr>
</tbody>
</table></figure>


<p>Tanto las RIs como los Savings Plans ofrecen ahorros significativos, pero la elección entre uno y otro depende de tus necesidades específicas y de cuánta flexibilidad requieras en tus proyectos de AWS.</p>


<h3 id="instancias-reservadas" tabindex="-1"><a href="https://aws.amazon.com/es/ec2/pricing/reserved-instances/buyer/" rel="noopener noreferrer" target="_blank">Instancias Reservadas</a></h3>


<p><figure><img alt="Instancias Reservadas" src="/assets/blog/a1df45b1e2d673896c0015e6.jpg"/></figure></p>


<p>Imagina que le dices a AWS, "Voy a usar este servicio por 1 o 3 años, ¿me das un descuento?". Eso es lo que haces con las Instancias Reservadas. Pagas de antemano y consigues un precio más bajo por comprometerte a usarlos por un tiempo.</p>


<p>Aquí algunas cosas importantes:</p>


<ul>
<li>Puedes ahorrar hasta un 72% comparado con pagar sin compromiso.</li>
<li>Compras una cantidad específica de servicio (como 10 computadoras de cierto tipo).</li>
<li>Solo se aplica a ciertos servicios y en ciertas partes del mundo.</li>
<li>Una vez que compras, no puedes cambiar tu decisión.</li>
</ul>


<p>Básicamente, es una buena opción si sabes exactamente lo que necesitarás y estás seguro de no cambiar de opinión.</p>


<h3 id="savings-plans" tabindex="-1"><a href="https://aws.amazon.com/savingsplans/" rel="noopener noreferrer" target="_blank">Savings Plans</a></h3>


<p><figure><img alt="Savings Plans" src="/assets/blog/b85f68a92013b35c6ce1d0b5.jpg"/></figure></p>


<p>Los Savings Plans son como decir, "Prometo gastar tanto dinero en AWS durante 1 o 3 años". A cambio, AWS te da descuentos.</p>


<p>Lo que debes saber:</p>


<ul>
<li>También puedes ahorrar hasta un 72%.</li>
<li>Tu compromiso es en dinero, no en servicios específicos.</li>
<li>El descuento se aplica automáticamente a varios servicios y en cualquier lugar.</li>
</ul>


<p>Es una opción más flexible. Si no estás seguro de lo que necesitarás o si tus necesidades cambian, esta podría ser mejor para ti.</p>


<h3 id="comparaci%C3%B3n" tabindex="-1">Comparación</h3>


<p>Tanto las Instancias Reservadas como los Savings Plans te ayudan a gastar menos en AWS. La gran diferencia es que las Instancias Reservadas son para cuando estás seguro de lo que necesitarás, mientras que los Savings Plans te dan más libertad para cambiar de planes. Si sabes que tus necesidades serán constantes, las Instancias Reservadas pueden ser mejor. Pero si prefieres tener la opción de ajustar tus gastos, los Savings Plans son la mejor elección.</p>


<h2 id="comparaci%C3%B3n-de-instancias-reservadas-y-savings-plans" tabindex="-1">Comparación de Instancias Reservadas y <a href="https://docs.aws.amazon.com/savingsplans/latest/userguide/sp-overview.html" rel="noopener noreferrer" target="_blank">Savings Plans</a></h2>


<p><figure><img alt="Savings Plans" src="/assets/blog/3efa7e2b3a905ffb95a443eb.jpg"/></figure></p>


<h3 id="1.-instancias-reservadas" tabindex="-1">1. Instancias Reservadas</h3>


<h4 id="flexibilidad" tabindex="-1">Flexibilidad</h4>


<p>Las Instancias Reservadas te atan a un acuerdo. Si decides usarlas, tienes que seguir con ese plan, en esa parte del mundo de AWS, por 1 o 3 años. No hay vuelta atrás ni cambios.</p>


<h4 id="ahorro-potencial" tabindex="-1">Ahorro Potencial</h4>


<p>Con las Instancias Reservadas, puedes ahorrar hasta un 72% en comparación con pagar solo cuando lo usas. Es un buen descuento si ya sabes que necesitarás esos servicios.</p>


<h4 id="compromiso-y-duraci%C3%B3n" tabindex="-1">Compromiso y Duración</h4>


<p>Hay dos opciones de compromiso:</p>


<ul>
<li><strong>Reservas de 1 año</strong> - Te dan un descuento por usarlos durante un año.</li>
<li><strong>Reservas de 3 años</strong> - El descuento es mayor si te comprometes por tres años.</li>
</ul>


<h4 id="uso-y-aplicabilidad" tabindex="-1">Uso y Aplicabilidad</h4>


<p>Estas ofertas solo valen para algunos servicios de AWS, como EC2, RDS, Redshift y ElastiCache. Y solo cuentan en la región y tipo de instancia que elijas. Por ejemplo, si eliges 10 instancias <code class="inline-code">t2.micro</code> en <code class="inline-code">us-east-1</code>, solo ahí aplicará el descuento.</p>


<p>En pocas palabras, si estás seguro de lo que necesitarás y no crees que cambiará, las Instancias Reservadas pueden ser una buena opción. Pero, no son muy flexibles si necesitas cambiar tus planes después.</p>


<h3 id="2.-savings-plans" tabindex="-1">2. Savings Plans</h3>


<h4 id="flexibilidad-1" tabindex="-1">Flexibilidad</h4>


<p>Los Savings Plans son bastante flexibles. A diferencia de las Instancias Reservadas, aquí te comprometes a gastar una cantidad fija de dinero en AWS, no a usar un servicio específico. Esto te permite cambiar entre servicios, regiones e incluso cancelar el plan si ya no lo necesitas. Es como tener la libertad de ajustar tus gastos según lo que necesites en el momento.</p>


<h4 id="ahorro-potencial-1" tabindex="-1">Ahorro Potencial</h4>


<p>Igual que con las RIs, con los Savings Plans puedes ahorrar hasta un 72% comparado con los precios normales. Esto significa que puedes ahorrar mucho dinero.</p>


<h4 id="compromiso-y-duraci%C3%B3n-1" tabindex="-1">Compromiso y Duración</h4>


<p>Tienes la opción de comprometerte por 1 o 3 años. Mientras más largo sea el compromiso, más grande será el descuento. Si planeas usar AWS mucho en ese tiempo, considera el plan de 3 años.</p>


<h4 id="uso-y-aplicabilidad-1" tabindex="-1">Uso y Aplicabilidad</h4>


<p>Los Savings Plans se pueden usar en varios servicios de AWS, como EC2, Fargate, Lambda, SageMaker y más. Además, funcionan en todas las regiones. Esto es genial si usas diferentes servicios de AWS en varios lugares y tu uso cambia con el tiempo.</p>


<p>En resumen, si tu uso de AWS varía mucho o no estás seguro de cómo cambiará en el futuro, los Savings Plans son una buena opción. Te permiten ser flexible y aún así obtener buenos descuentos.</p>


<h2 id="ventajas-y-desventajas-de-las-instancias-reservadas" tabindex="-1">Ventajas y Desventajas de las Instancias Reservadas</h2>


<p>Cuando eliges Instancias Reservadas (RI) en AWS, hay cosas buenas y no tan buenas que debes tener en cuenta.</p>


<h3 id="ventajas" tabindex="-1">Ventajas</h3>


<ul>
<li><strong>Ahorro de costos</strong>: La razón principal para elegir RIs es que te ayudan a gastar menos. Si te comprometes por 1 a 3 años, puedes pagar hasta un 72% menos que si pagaras sin compromiso.</li>
<li><strong>Gastos previsibles</strong>: Con las RIs, sabes exactamente cuánto vas a gastar en ese servicio durante el tiempo que te comprometiste. Esto hace más fácil organizar tu presupuesto.</li>
<li><strong>Acceso preferencial</strong>: Cuando AWS está muy ocupado, tener RIs significa que tienes más chances de conseguir lo que necesitas.</li>
</ul>


<h3 id="desventajas" tabindex="-1">Desventajas</h3>


<ul>
<li><strong>Poca flexibilidad</strong>: Una vez que te comprometes con RIs, tienes que usar ese servicio específico durante el tiempo acordado. Si tus necesidades cambian, no puedes simplemente cambiar de plan.</li>
<li><strong>Riesgo de pagar de más</strong>: Si compras más RIs de las que necesitas y luego no las usas, terminarás pagando por algo que no estás utilizando.</li>
<li><strong>Limitaciones de servicio y región</strong>: Las RIs no se pueden usar para todos los servicios de AWS, y tienes que decidir la región desde el principio.</li>
</ul>


<figure class="table"><table>
<thead>
<tr>
<th>Ventaja</th>
<th>Desventaja</th>
</tr>
</thead>
<tbody>
<tr>
<td>Ahorro de costos (hasta 72%)</td>
<td>Poca flexibilidad</td>
</tr>
<tr>
<td>Gastos previsibles</td>
<td>Riesgo de pagar de más</td>
</tr>
<tr>
<td>Acceso preferencial</td>
<td>Limitaciones de servicio y región</td>
</tr>
</tbody>
</table></figure>


<p>En pocas palabras, si tienes claro lo que vas a necesitar y no crees que tus necesidades vayan a cambiar, las RIs pueden ser una buena idea. Pero si te preocupa quedarte atado sin poder cambiar o pagar por cosas que no usas, quizás los Savings Plans sean una mejor opción para ti.</p>


<h2 id="ventajas-y-desventajas-de-los-savings-plans" tabindex="-1">Ventajas y Desventajas de los Savings Plans</h2>


<p>Los Savings Plans de AWS son una buena manera de ahorrar dinero, pero como todo, tienen sus pros y contras.</p>


<h3 id="ventajas-1" tabindex="-1">Ventajas</h3>


<ul>
<li><strong>Flexibilidad</strong>: Estos planes te dan la libertad de cambiar entre diferentes servicios y regiones según lo necesites. No estás limitado a un solo tipo de uso.</li>
<li><strong>Ahorro seguro</strong>: Al comprometerte a gastar una cantidad específica, los descuentos están garantizados, sin importar cómo cambien tus necesidades.</li>
<li><strong>Aplica a muchos servicios</strong>: Los descuentos se aplican a una variedad de servicios de AWS, incluyendo EC2, SageMaker, Lambda y Fargate.</li>
<li><strong>Fácil seguimiento</strong>: Puedes usar herramientas como AWS Cost Explorer para ver cuánto te falta por gastar, lo que hace más fácil manejar tus finanzas.</li>
</ul>


<h3 id="desventajas-1" tabindex="-1">Desventajas</h3>


<ul>
<li><strong>Necesitas comprometerte</strong>: Al comprar un Savings Plan, te comprometes a gastar una cantidad fija durante 1 a 3 años. Si no usas ese dinero, igual tendrás que pagar.</li>
<li><strong>No cubre todo</strong>: Hay servicios de AWS que no entran en los descuentos de los Savings Plans, como S3 y CloudFront.</li>
<li><strong>Requiere planificar</strong>: Necesitas estimar cuánto vas a gastar en AWS para escoger el plan adecuado. Esto puede ser complicado y lleva tiempo.</li>
</ul>


<figure class="table"><table>
<thead>
<tr>
<th>Ventaja</th>
<th>Desventaja</th>
</tr>
</thead>
<tbody>
<tr>
<td>Flexibilidad</td>
<td>Compromiso obligatorio</td>
</tr>
<tr>
<td>Ahorro seguro</td>
<td>No cubre todo</td>
</tr>
<tr>
<td>Aplica a muchos servicios</td>
<td>Requiere planificar</td>
</tr>
</tbody>
</table></figure>


<p>En resumen, los Savings Plans son una opción flexible si usas varios servicios de AWS y quieres libertad para cambiar. Pero, es importante recordar que necesitas comprometerte y planificar bien tus gastos.</p>


<h2 id="an%C3%A1lisis-comparativo-detallado" tabindex="-1">Análisis Comparativo Detallado</h2>


<h3 id="flexibilidad-2" tabindex="-1">Flexibilidad</h3>


<p>Las <strong>Instancias Reservadas</strong> te atan a un compromiso. Si decides usarlas, tienes que seguir con ese plan, en la región de AWS que escogiste, por 1 o 3 años. No hay opción de cambiar de opinión o cancelar.</p>


<p>Por otro lado, los <strong>Savings Plans</strong> te dan mucha más libertad. Aquí, tu compromiso es con cuanto dinero gastarás en AWS, no en usar ciertos servicios. Esto significa que puedes cambiar entre diferentes servicios o regiones, e incluso puedes cancelar si lo necesitas.</p>


<p>Si te gusta tener la opción de cambiar tus planes sin problemas, los Savings Plans son mucho más adecuados que las Instancias Reservadas.</p>


<h3 id="ahorro-potencial-2" tabindex="-1">Ahorro Potencial</h3>


<p>Tanto con las Instancias Reservadas como con los Savings Plans, puedes ahorrar hasta un 72% en comparación con los precios estándar de AWS. Así que, en cuanto a cuánto puedes ahorrar, ambas opciones son igual de buenas.</p>


<p>La diferencia es que con las RIs, el ahorro es en servicios específicos que eliges, mientras que con los Savings Plans, el ahorro es en tus gastos totales en AWS. Pero el máximo descuento que puedes obtener es el mismo con ambos.</p>


<h3 id="compromiso-y-duraci%C3%B3n-2" tabindex="-1">Compromiso y Duración</h3>


<p>Con las <strong>Instancias Reservadas</strong>, te comprometes a usar ciertas capacidades por 1 o 3 años. Una vez que eliges esto, no puedes cancelarlo ni cambiar de idea.</p>


<p>Con los <strong>Savings Plans</strong>, te comprometes a gastar una cantidad específica de dinero en AWS durante 1 o 3 años. Tienes más libertad en cómo usar ese dinero, pero aún así tienes que gastar la cantidad acordada.</p>


<p>En ambos casos, cuanto más tiempo te comprometas, más grande será tu descuento. Así que si vas a usar AWS mucho en los próximos años, considera comprometerte por 3 años para ahorrar más.</p>


<h3 id="uso-y-aplicabilidad-2" tabindex="-1">Uso y Aplicabilidad</h3>


<p>Las RIs solo se pueden usar en ciertos servicios como EC2, RDS y Redshift. Además, tienes que decidir la región y el tipo de instancia cuando las compras. Por ejemplo, si eliges 10 instancias <code class="inline-code">t2.micro</code> en <code class="inline-code">us-east-1</code>, solo ahí aplicarán los descuentos.</p>


<p>Los Savings Plans te dan descuentos en varios servicios de AWS, incluyendo EC2, Fargate, Lambda, SageMaker y otros. Además, tus descuentos se aplican automáticamente en todas las regiones.</p>


<p>Esto hace que los Savings Plans sean mucho más útiles si usas varios servicios de AWS o si necesitas cambiar entre regiones. Las RIs son mejor opción si solo necesitas uno o dos servicios en una región específica.</p>


<h2 id="casos-de-uso-y-escenarios" tabindex="-1">Casos de Uso y Escenarios</h2>


<p>Cuando hablamos de ahorrar dinero en AWS, las Instancias Reservadas y los Savings Plans funcionan mejor en diferentes situaciones. Veamos algunos ejemplos de cuándo es mejor usar cada uno:</p>


<h3 id="instancias-reservadas-1" tabindex="-1">Instancias Reservadas</h3>


<p>Las Instancias Reservadas son perfectas para situaciones como estas:</p>


<ul>
<li>Si tu trabajo en línea es más o menos igual todo el tiempo. Por ejemplo, si tienes una página web con visitas constantes.</li>
<li>Si ya sabes qué tipo de computadoras en la nube vas a necesitar. Como cuando siempre usas un tipo específico de instancia en una región dada.</li>
<li>Si no te molesta comprometerte con un plan fijo. Esto es, si estás seguro de que vas a necesitar cierto número de instancias de un tipo específico en una región por los próximos 3 años.</li>
</ul>


<h3 id="savings-plans-1" tabindex="-1">Savings Plans</h3>


<p>Los Savings Plans son una mejor opción en casos como:</p>


<ul>
<li>Si lo que necesitas cambia mucho o no lo tienes muy claro. Como cuando el número de visitas a tu sitio web sube y baja.</li>
<li>Si utilizas varios servicios de AWS, no solo EC2, sino también Lambda y SageMaker.</li>
<li>Si trabajas en varias regiones y mueves tus proyectos de un lugar a otro.</li>
<li>Si no estás seguro de qué vas a necesitar más adelante y prefieres tener la opción de ajustar tus planes.</li>
</ul>


<h3 id="ejemplo-pr%C3%A1ctico" tabindex="-1">Ejemplo Práctico</h3>


<p>Digamos que estás llevando varias aplicaciones a AWS. Algunas son bases de datos que casi no cambian, otras son páginas web con visitas que varían, y también estás probando con servicios nuevos como SageMaker.</p>


<p>En este caso, una estrategia inteligente sería:</p>


<ul>
<li>Comprar Instancias Reservadas para las bases de datos, ya que sabes que no cambiarán y así ahorras más.</li>
<li>Optar por Savings Plans para las partes de tu trabajo que varían.</li>
<li>No comprometerte todavía con los servicios nuevos hasta que sepas cómo los vas a usar.</li>
</ul>


<p>Así, logras ahorrar dinero sin perder la capacidad de cambiar tus planes para las partes más variables de tu trabajo.</p>


<h2 id="consideraciones-finales" tabindex="-1">Consideraciones Finales</h2>


<p>Vamos a simplificar las cosas sobre cómo puedes gastar menos en AWS con las Instancias Reservadas y los Savings Plans:</p>


<ul>
<li>Ambas opciones, <strong>Instancias Reservadas</strong> y <strong>Savings Plans</strong>, te permiten ahorrar mucho, hasta un 72% menos de lo que normalmente pagarías. La gran diferencia es que con las RIs, te comprometes a usar ciertos servicios sin cambiar, mientras que los Savings Plans te dan más libertad para ajustar según tus necesidades.</li>
<li>Si ya sabes qué vas a necesitar y eso no va a cambiar en los próximos 1-3 años, las Instancias Reservadas son una buena opción. Pero recuerda, una vez que eliges, no puedes cambiar de opinión.</li>
<li>Los Savings Plans son ideales si prefieres tener la opción de cambiar de servicios o si todavía no estás seguro de qué vas a necesitar más adelante. Aquí, te comprometes a gastar una cantidad de dinero, no a usar servicios específicos.</li>
<li>Si quieres ahorrar al máximo, puedes combinar Instancias Reservadas y Savings Plans. Usa RIs para lo que estás seguro que no cambiará y Savings Plans para lo que pueda variar.</li>
<li>Herramientas como <strong>AWS Cost Explorer</strong> te ayudan a ver cómo has gastado tu dinero antes y te dan pistas sobre cuál opción podría ser la mejor para ti.</li>
</ul>


<p>En pocas palabras, tanto las RIs como los Savings Plans son útiles para gastar menos en AWS. Las RIs son mejores si tus necesidades son muy fijas, mientras que los Savings Plans son para cuando necesitas flexibilidad para cambiar tus planes.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas Relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-son-los-savings-plans%3F" tabindex="-1">¿Qué son los Savings Plans?</h3>


<p>Los Savings Plans son una forma de pagar menos en AWS, donde te comprometes a gastar una cantidad fija de dinero durante uno o tres años. A cambio, AWS te da precios más bajos que los normales, lo que puede ayudarte a ahorrar hasta un 72% en comparación con los precios que pagarías sin compromiso. La idea es que, en lugar de pagar por servicios específicos, te comprometes a gastar cierta cantidad de dinero en general en AWS.</p>


<h3 id="%C2%BFcu%C3%A1les-son-las-opciones-de-pago-para-las-instancias-reservadas-de-amazon-ec2%3F" tabindex="-1">¿Cuáles son las opciones de pago para las instancias reservadas de Amazon EC2?</h3>


<p>Para las instancias reservadas de Amazon EC2, AWS ofrece opciones de pago para compromisos de uno o tres años. Las opciones son:</p>


<ul>
<li>Pagar todo por adelantado</li>
<li>Pagar una parte por adelantado</li>
<li>No pagar nada por adelantado</li>
</ul>


<h3 id="%C2%BFqu%C3%A9-es-una-instancia-reservada%3F" tabindex="-1">¿Qué es una instancia reservada?</h3>


<p>Una instancia reservada es una forma de ahorrar en los costos de usar Amazon EC2. Al comprar una instancia reservada, te comprometes a usar ciertos recursos (como el tipo de instancia y la región) y, a cambio, AWS te da un descuento. Es como hacer una reserva y obtener un precio especial por ello.</p>


<h3 id="%C2%BFqu%C3%A9-es-el-explorador-de-costos-de-aws%3F" tabindex="-1">¿Qué es el <a href="https://console.aws.amazon.com/cost-reports/home" rel="noopener noreferrer" target="_blank">explorador de costos de AWS</a>?</h3>


<p><figure><img alt="explorador de costos de AWS" src="/assets/blog/600ce1c5d622009d54fdf3d9.jpg"/></figure></p>


<p>El explorador de costos de AWS es una herramienta que te permite ver y analizar cómo estás gastando tu dinero en AWS. Puedes ver tus costos totales, cómo cambian con el tiempo, y dónde podrías ahorrar más. Es como tener un resumen detallado de tus gastos que te ayuda a entender y optimizar cómo usas AWS.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/aws-aprender-guia-inicial/">Aprender AWS: guía inicial</a></li><li><a href="https://dondeaprendoaws.com/blog/aws-gratis-para-educadores-y-estudiantes/">AWS gratis para educadores y estudiantes</a></li><li><a href="https://dondeaprendoaws.com/blog/analisis-de-costos-de-aws-con-cost-explorer/">Análisis de Costos de AWS con Cost Explorer</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-los-servicios-de-amazon-web-services/">Introducción a los servicios de Amazon Web Services</a></li>
</ul>
</p>
