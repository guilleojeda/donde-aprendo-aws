---
title: "¿Cómo Escala DynamoDB? Modos On Demand y Provisioned"
description: "Descubre cómo escalar DynamoDB con los modos On Demand y Provisioned, considerando tráfico, costos y rendimiento. DynamoDB es una base de datos NoSQL de AWS."
publishedAt: "2024-03-09"
publishedTimestamp: "2024-03-09T02:56:43.716Z"
cover: "/assets/blog/ce62e0cc8508d5055bba53b4.png"
coverAlt: "Thumbnail for: ¿Cómo Escala DynamoDB? Modos On Demand y Provisioned"
ogImage: "/assets/blog/ce62e0cc8508d5055bba53b4.png"
related:
  - title: "Mejores prácticas para nombres en AWS Organizations"
    url: "https://dondeaprendoaws.com/blog/mejores-practicas-para-nombres-en-aws-organizations/"
    image: "/assets/blog/bfdfed56910493c9a698fb14.jpg"
    imageAlt: ""
  - title: "Guía de Acreditación para Partners de AWS 2024"
    url: "https://dondeaprendoaws.com/blog/guia-de-acreditacion-para-partners-de-aws-2024/"
    image: "/assets/blog/0d6df5a1297701914debd614.png"
    imageAlt: ""
  - title: "Utilizando Lambda Layers en Múltiples Funciones Lambda"
    url: "https://dondeaprendoaws.com/blog/utilizando-lambda-layers-en-multiples-funciones-lambda/"
    image: "/assets/blog/ab65afd218440c66bc564a0a.jpg"
    imageAlt: ""
---

<p>Si estás considerando usar DynamoDB para tu aplicación, es crucial entender cómo escalarla adecuadamente. DynamoDB ofrece dos modos principales de escalado: <strong>On Demand</strong> y <strong>Provisioned</strong>. Aquí te doy un resumen rápido para ayudarte a elegir el mejor camino:</p>


<ul>
<li><strong>On Demand</strong>: Ideal si no puedes predecir el tráfico de tu aplicación. Paga solo por lo que usas.</li>
<li><strong>Provisioned</strong>: Perfecto si conoces el tráfico esperado. Configura y paga por una capacidad específica.</li>
</ul>


<p><strong>Puntos clave para tomar en cuenta</strong>:</p>


<ul>
<li><strong>Predicibilidad del Tráfico</strong>: On Demand para tráfico impredecible; Provisioned para tráfico predecible.</li>
<li><strong>Costos</strong>: On Demand puede ser más caro pero flexible; Provisioned es más económico con planificación.</li>
<li><strong>Rendimiento y Administración</strong>: Provisioned ofrece rendimiento desde el inicio, mientras que On Demand se ajusta según la demanda.</li>
</ul>


<h2 id="comparaci%C3%B3n-r%C3%A1pida" tabindex="-1">Comparación Rápida</h2>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>On Demand</th>
<th>Provisioned</th>
</tr>
</thead>
<tbody>
<tr>
<td>Costo</td>
<td>Pagas por uso</td>
<td>Más barato con planificación</td>
</tr>
<tr>
<td>Escalabilidad</td>
<td>Automática</td>
<td>Manual/Automática con límites</td>
</tr>
<tr>
<td>Rendimiento</td>
<td>Mejora con el uso</td>
<td>Alto desde el inicio</td>
</tr>
<tr>
<td>Capacidad</td>
<td>Ilimitada</td>
<td>Según planificación</td>
</tr>
<tr>
<td>Administración</td>
<td>Sencilla</td>
<td>Requiere monitoreo y ajustes</td>
</tr>
</tbody>
</table></figure>


<p>Elegir entre On Demand y Provisioned depende de tus necesidades específicas de rendimiento, costos y escalabilidad. Ambos modos tienen sus ventajas, y la decisión final debe basarse en una evaluación cuidadosa de tus requisitos.</p>


<h3 id="%C2%BFqu%C3%A9-es-dynamodb%3F" tabindex="-1">¿Qué es DynamoDB?</h3>


<p>DynamoDB es una base de datos de AWS. Es rápida, siempre está disponible y puede crecer mucho según lo necesites. Lo hace especial porque:</p>


<ul>
<li>Puedes guardar datos como documentos o pares de clave-valor.</li>
<li>Copia tus datos en varios lugares automáticamente para que no los pierdas.</li>
<li>Puede manejar mucha información y tráfico sin problemas.</li>
<li>Funciona bien con otros servicios de AWS, como AWS Lambda o CloudWatch.</li>
<li>Te deja elegir cómo quieres pagar y usar los recursos, con los modos On Demand o Provisioned.</li>
</ul>


<p>En pocas palabras, DynamoDB te ayuda a hacer aplicaciones grandes sin complicarte mucho.</p>


<h3 id="claves-de-partici%C3%B3n-y-ordenaci%C3%B3n" tabindex="-1">Claves de Partición y Ordenación</h3>


<p>En DynamoDB, guardas información en ítems. Cada ítem necesita una clave única que puede ser:</p>


<ul>
<li><strong>Clave de partición:</strong> Como el nombre de una persona, para identificarla directamente.</li>
<li><strong>Clave de partición + clave de ordenación:</strong> Usas dos cosas, como nombre y apellido, para identificar a alguien de manera única.</li>
</ul>


<p>La clave de partición ayuda a organizar y encontrar tus datos rápido. Elegir bien estas claves es importante para que todo funcione bien.</p>


<h3 id="replicaci%C3%B3n-y-consistencia-de-datos" tabindex="-1">Replicación y Consistencia de Datos</h3>


<p>DynamoDB guarda tus datos en varios lugares al mismo tiempo para que no los pierdas si hay un problema. Esto se hace automáticamente.</p>


<p>Como todos los lugares pueden tener datos nuevos al mismo tiempo, a veces hay que esperar un poquito para que todos tengan la misma información. Esto se llama consistencia eventual.</p>


<p>Cuando lees datos, puedes elegir si quieres:</p>


<ul>
<li><strong>Eventualmente consistente:</strong> Rápido, pero puede que no veas la última actualización inmediatamente.</li>
<li><strong>Fuertemente consistente:</strong> Un poco más lento, pero siempre ves la última versión de tus datos.</li>
</ul>


<h2 id="modo-on-demand" tabindex="-1">Modo On Demand</h2>


<p>El modo On Demand de DynamoDB es como tener un taxi que se agranda automáticamente cuando más amigos se suben. No tienes que decirle cuánto espacio necesitas; él lo figura por sí solo.</p>


<h3 id="unidades-de-solicitud-de-lectura-y-escritura" tabindex="-1">Unidades de solicitud de lectura y escritura</h3>


<p>Imagina que cada vez que lees o escribes algo en DynamoDB, usas una moneda. Si lees algo pequeño, como un mensaje de texto, gastas una moneda. Si escribes algo del mismo tamaño, también es una moneda. DynamoDB cuenta cuántas monedas gastas y te cobra por eso.</p>


<h3 id="picos-de-tr%C3%A1fico-y-propiedades-de-escalado" tabindex="-1">Picos de tráfico y propiedades de escalado</h3>


<p>En el modo On Demand, si de repente mucha gente quiere usar tu aplicación, DynamoDB automáticamente se hace más grande para que todos puedan entrar sin problemas. Puede crecer rápido y sin límites, lo que es genial si no sabes cuánta gente va a usar tu app.</p>


<h3 id="rendimiento-inicial-y-precalentamiento-de-tablas" tabindex="-1">Rendimiento inicial y precalentamiento de tablas</h3>


<p>Al principio, las tablas en el modo On Demand empiezan un poco lentas, pero se ponen más rápidas a medida que más gente las usa. Si sabes que va a haber mucha actividad, puedes hacer una especie de ensayo general con tráfico falso para que la tabla esté lista y rápida cuando realmente la necesites.</p>


<h2 id="modo-provisioned" tabindex="-1">Modo Provisioned</h2>


<p>El modo Provisioned de DynamoDB es como decirle de antemano a DynamoDB cuánto vas a necesitar para leer y escribir datos en tu aplicación. Tú decides cuántas 'unidades' de lectura y escritura quieres tener listas para usar.</p>


<h3 id="unidades-de-capacidad-de-lectura-y-escritura" tabindex="-1">Unidades de capacidad de lectura y escritura</h3>


<ul>
<li>Una unidad de capacidad de lectura (RCU) permite leer datos (como un mensaje) que no pesen más de 4 KB, cada segundo.</li>
<li>Una unidad de capacidad de escritura (WCU) te deja escribir datos que no superen 1 KB, cada segundo.</li>
</ul>


<p>Si tus datos son más grandes, necesitarás más unidades. DynamoDB calcula cuántas unidades necesitas basándose en el tamaño de tus datos.</p>


<h3 id="escalado-autom%C3%A1tico-de-dynamodb" tabindex="-1">Escalado automático de DynamoDB</h3>


<p>Puedes activar una opción para que DynamoDB ajuste automáticamente cuántas unidades de lectura y escritura necesitas, según cuánto estés usando la aplicación. Esto es útil porque mantiene tu aplicación funcionando bien, incluso si de repente mucha gente la usa más de lo normal.</p>


<p>El escalado automático mira cuánto estás usando y ajusta las unidades necesarias para mantener todo funcionando sin problemas.</p>


<h3 id="capacidad-reservada" tabindex="-1">Capacidad reservada</h3>


<p>Si ya sabes que vas a necesitar una cierta cantidad de unidades todo el tiempo, puedes 'reservar' estas unidades. Esto te sale más barato que pagar por ellas mes a mes. Es como comprar al por mayor: te comprometes a usar DynamoDB por 1 o 3 años, y a cambio, te hacen un descuento.</p>


<p>Esta opción te ayuda a ahorrar dinero si tu aplicación necesita siempre un cierto nivel de actividad en DynamoDB.</p>




<h2 id="comparaci%C3%B3n-entre-modos" tabindex="-1">Comparación entre Modos</h2>


<figure class="table"><table>
<thead>
<tr>
<th>Característica</th>
<th>On Demand</th>
<th>Provisioned</th>
</tr>
</thead>
<tbody>
<tr>
<td>Costo</td>
<td>Pagas solo por lo que usas. Sale más caro por cada cosa que haces.</td>
<td>Si planeas con anticipación, te sale más barato por cada cosa que haces.</td>
</tr>
<tr>
<td>Escalabilidad</td>
<td>Se ajusta solo y no tiene límite.</td>
<td>Tienes que ajustarlo tú, pero puedes ponerle que se ajuste solo. Aún así, tiene un tope.</td>
</tr>
<tr>
<td>Rendimiento</td>
<td>Al principio puede ser lento, pero mejora con el uso.</td>
<td>Es rápido desde que lo empiezas a usar.</td>
</tr>
<tr>
<td>Capacidad</td>
<td>No tiene límite.</td>
<td>Depende de lo que hayas planeado usar.</td>
</tr>
<tr>
<td>Complejidad</td>
<td>Es fácil de usar desde el principio.</td>
<td>Necesitas pensar cuánto vas a usar antes de empezar.</td>
</tr>
</tbody>
</table></figure>


<p>El modo On Demand de DynamoDB se ajusta solo según cuánto lo uses, lo que lo hace fácil para empezar sin tener que preocuparte por cuánto vas a necesitar. Pero, cuesta más por cada cosa que haces.</p>


<p>El modo Provisioned te hace pensar y decidir cuánto vas a necesitar antes de empezar, lo que puede ser un poco más complicado al principio. Pero, si lo haces bien, te sale más barato por cada cosa que haces. También puedes reservar lo que necesitas para ahorrar más.</p>


<p>En resumen:</p>


<ul>
<li>On Demand es mejor si tu aplicación es nueva o si no sabes cuánto la van a usar.</li>
<li>Provisioned es mejor si ya sabes más o menos cuánto va a usar tu aplicación.</li>
</ul>


<p>La decisión depende de lo que necesites y de si prefieres ahorrar dinero o tener más simplicidad. DynamoDB te permite cambiar entre estos modos cuando lo necesites.</p>


<h2 id="consideraciones-para-elegir-el-modo" tabindex="-1">Consideraciones para Elegir el Modo</h2>


<p>Al decidir si usar On Demand o Provisioned en DynamoDB, piensa en estos puntos importantes:</p>


<h3 id="predicibilidad-del-tr%C3%A1fico" tabindex="-1">Predicibilidad del Tráfico</h3>


<ul>
<li>Si el uso de tu aplicación cambia mucho y no sabes cuánto va a variar, On Demand es una buena opción. Así no te preocupas por planear de más o de menos.</li>
<li>Si sabes cómo va a ser el uso de tu aplicación, es decir, si es más o menos constante, Provisioned puede ayudarte a controlar mejor tus gastos y cómo funciona tu app.</li>
</ul>


<h3 id="flexibilidad-de-costos-vs.-previsibilidad-de-costos" tabindex="-1">Flexibilidad de Costos vs. Previsibilidad de Costos</h3>


<ul>
<li>On Demand te da más libertad pero puede que los costos te sorprendan, ya que pagas por lo que usas, sin compromisos.</li>
<li>Con Provisioned, puedes planear tus gastos según lo que necesitas. Y si reservas capacidad, puedes ahorrar más.</li>
</ul>


<h3 id="requisitos-de-rendimiento" tabindex="-1">Requisitos de Rendimiento</h3>


<ul>
<li>Si es importante que tu aplicación funcione rápido y sin cambios desde el principio, Provisioned es mejor.</li>
<li>Si no te preocupa mucho cómo funcione al inicio y puede mejorar con el tiempo, On Demand podría ser suficiente.</li>
</ul>


<h3 id="facilidad-de-administraci%C3%B3n" tabindex="-1">Facilidad de Administración</h3>


<ul>
<li>On Demand es más sencillo de manejar porque DynamoDB ajusta todo automáticamente.</li>
<li>Con Provisioned, necesitas estar atento y ajustar las cosas cuando sea necesario.</li>
</ul>


<p>En resumen, si prefieres algo fácil y flexible, On Demand puede ser lo tuyo. Pero si buscas controlar mejor tus costos y cómo funciona tu aplicación, con un uso bien definido, Provisioned te ofrece más control.</p>


<h2 id="conclusiones" tabindex="-1">Conclusiones</h2>


<p>DynamoDB te da dos maneras de hacer crecer tu base de datos según lo que necesites:</p>


<ul>
<li><strong>Modo On Demand:</strong> Es ideal si no sabes cuánto va a cambiar el uso de tu aplicación. DynamoDB se encarga de ajustarse por sí mismo y tú solo pagas por lo que usas. Es fácil de usar desde el principio, pero puede que te cueste más a largo plazo.</li>
<li><strong>Modo Provisioned:</strong> Es la mejor opción si tienes una idea clara de cuánto vas a usar tu base de datos. Necesitas planificar cuánta capacidad necesitas, pero esto puede ayudarte a ahorrar dinero y asegurar un buen rendimiento desde el inicio. Esto requiere más esfuerzo al principio.</li>
</ul>


<p>Cuando elijas entre estos modos, considera:</p>


<ul>
<li>Qué tan fácil es prever cuánto usarás DynamoDB</li>
<li>Si prefieres que DynamoDB ajuste las cosas por ti o si quieres tener más control</li>
<li>Qué tan importantes son para ti el rendimiento y la disponibilidad</li>
<li>Cómo está tu presupuesto y qué tanto puedes ajustarte en gastos</li>
</ul>


<p>Para muchos, empezar con On Demand es lo más fácil mientras aprendes más sobre tu aplicación, y luego cambiar a Provisioned para mejorar los costos y el rendimiento.</p>


<p>DynamoDB te permite cambiar entre estos modos según cambien tus necesidades. Así, puedes aprovechar lo mejor de cada uno.</p>


<p>Si configuras bien desde el inicio y sigues de cerca tu uso con las métricas de CloudWatch, podrás hacer que DynamoDB trabaje a tu favor y ayudarte a crecer tu aplicación sin problemas.</p>


<h2 id="preguntas-relacionadas" tabindex="-1">Preguntas Relacionadas</h2>


<h3 id="%C2%BFqu%C3%A9-tipo-de-base-de-datos-es-dynamodb%3F" tabindex="-1">¿Qué tipo de base de datos es DynamoDB?</h3>


<p>Amazon DynamoDB es una base de datos NoSQL que se encarga de todo por ti y te permite trabajar con grandes cantidades de datos. Es perfecta para aplicaciones que necesitan trabajar muy rápido y con mucha información.</p>


<h3 id="%08%C2%BFc%C3%B3mo-se-hace-una-consulta-en-dynamodb%3F" tabindex="-1">¿Cómo se hace una consulta en DynamoDB?</h3>


<p>Para buscar algo en DynamoDB, sigue estos pasos:</p>


<ul>
<li>Decide qué información específica necesitas buscar.</li>
<li>Usa esa información para crear una petición de búsqueda.</li>
<li>Manda esta petición a DynamoDB.</li>
<li>Revisa los resultados que te devuelve DynamoDB.</li>
</ul>


<p>Por ejemplo:</p>


<pre><code>// Imagina que buscas algo con una clave '123'

QueryRequest queryReq = new QueryRequest()
    .withTableName("MiTabla")
    .withKeyConditionExpression("ClaveParticion = :v_id")
    .withExpressionAttributeValues(hashKeyValues);

ResultSet resultados = dynamoDB.query(queryReq);

for (Map&lt;String, AttributeValue&gt; item : resultados) {
    // Aquí procesas cada resultado
}
</code></pre>


<h3 id="%C2%BFpara-qu%C3%A9-se-usa-la-clave-de-ordenaci%C3%B3n-en-dynamodb%3F" tabindex="-1">¿Para qué se usa la Clave de Ordenación en DynamoDB?</h3>


<p>La Clave de Ordenación te ayuda a organizar y buscar datos de manera más eficiente en DynamoDB, especialmente cuando tienes muchos datos con la misma Clave de Partición.</p>


<h3 id="%C2%BFqu%C3%A9-es-una-clave-principal-en-amazon-dynamodb%3F" tabindex="-1">¿Qué es una clave principal en Amazon DynamoDB?</h3>


<p>La clave principal en DynamoDB es como un identificador único para tus datos. Está compuesta por dos partes:</p>


<ul>
<li><strong>Clave de partición:</strong> Esta es la parte principal que identifica de manera única cada elemento.</li>
<li><strong>Clave de ordenación:</strong> Esta parte es opcional y te ayuda a organizar tus datos dentro de la misma clave de partición.</li>
</ul>


<p>Por ejemplo, si tienes una tienda, podrías usar el ID del cliente como Clave de Partición y la fecha del pedido como Clave de Ordenación para organizar todos los pedidos de cada cliente.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/amazon-dynamodb-la-base-de-datos-nosql-de-aws/">Amazon DynamoDB: La Base de Datos NoSQL de AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/amazon-dynamodb-guia-basica/">Amazon DynamoDB: Guía Básica</a></li><li><a href="https://dondeaprendoaws.com/blog/base-de-datos-global-con-amazon-dynamodb/">Base de Datos Global con Amazon DynamoDB</a></li><li><a href="https://dondeaprendoaws.com/blog/bases-de-datos-relacionales-en-aws-con-amazon-rds-y-amazon-aurora/">Bases de datos Relacionales en AWS con Amazon RDS y Amazon Aurora</a></li>
</ul>
</p>
