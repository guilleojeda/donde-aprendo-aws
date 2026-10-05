---
title: "Amazon Redshift: qué es, para qué sirve y cuándo usarlo"
description: "Descubre qué es Amazon Redshift, cuándo usarlo frente a RDS, Athena y DynamoDB, y cómo elegir entre Serverless y provisionado."
author: "guille-ojeda"
publishedAt: "2024-01-30"
publishedTimestamp: "2024-01-30T23:39:37.41Z"
modifiedTimestamp: "2026-10-05T00:04:02-03:00"
review:
  date: "2026-10-05"
cover: "/assets/blog/editorial-datos-ia.png"
coverAlt: "Una cuadrícula de puntos y una señal ascendente alrededor de un camino azul con un punto naranja."
ogImage: "/assets/blog/editorial-datos-ia.png"
related: []
---

<p><strong>Amazon Redshift es el servicio de data warehouse de AWS</strong>: reúne datos para que equipos de análisis consulten grandes conjuntos con SQL, armen reportes y encuentren tendencias. Conviene cuando las preguntas cruzan muchos registros o fuentes y se repiten en tableros y análisis. Para guardar las operaciones diarias de una aplicación, normalmente corresponde una base transaccional como Amazon RDS o DynamoDB.</p>

<p>La diferencia entre Redshift Serverless y un clúster provisionado está en cómo se administra la capacidad de cómputo. Serverless delega más decisiones al servicio; en el modo provisionado eliges y administras el tamaño del clúster. Ninguna opción elimina el trabajo de preparar datos, revisar consultas y controlar costos.</p>

<h2 id="que-es-amazon-redshift-y-para-que-sirve">¿Qué es Amazon Redshift y para qué sirve?</h2>

<p>Redshift es un almacén de datos relacional administrado, optimizado para consultas analíticas: por ejemplo, resumir ventas por mes, combinar órdenes con productos o comparar resultados entre regiones. Usa SQL y técnicas como procesamiento paralelo y almacenamiento columnar para leer de manera eficiente las columnas que una consulta necesita. <a href="https://docs.aws.amazon.com/redshift/latest/mgmt/welcome.html" target="_blank" rel="noopener noreferrer">La documentación de AWS lo presenta como un servicio de data warehouse para análisis a gran escala</a>.</p>

<p>Imagina una tienda en línea que guarda cada compra en su sistema operativo. La aplicación necesita registrar un pedido rápido; el equipo comercial, en cambio, quiere consultar cuánto vendió cada categoría por mes, sumar ventas de varias regiones y comparar períodos. Redshift sirve para este segundo tipo de trabajo. Los datos pueden llegar por una carga, una integración u otra ruta compatible; no aparecen en el warehouse por el solo hecho de crear un clúster.</p>

<p>El almacén tampoco reemplaza el proceso de verificar y preparar los datos. Si cada fuente define de manera distinta una fecha, un cliente o una devolución, el equipo debe resolver esas diferencias antes de confiar en un tablero.</p>

<h2 id="ejemplo-sql-de-analisis">Ejemplo: resumir ventas con SQL</h2>

<p>Esta consulta ilustra una pregunta analítica con unas pocas filas escritas dentro de una expresión SQL. Puedes razonar sobre el resultado sin ejecutarla. Para ejecutarla en Redshift necesitas acceso autorizado a un warehouse y su cómputo puede generar cargos; la consulta no crea tablas ni otros recursos. En un warehouse real, reemplazarías el bloque de ejemplo por la tabla de ventas preparada para consulta:</p>

<pre><code class="language-sql">WITH ventas (fecha, categoria, importe) AS (
    SELECT DATE '2026-01-12', 'libros', 120.00
    UNION ALL SELECT DATE '2026-01-20', 'libros', 80.00
    UNION ALL SELECT DATE '2026-02-03', 'juegos', 150.00
)
SELECT
    DATE_TRUNC('month', fecha) AS mes,
    categoria,
    SUM(importe) AS total
FROM ventas
GROUP BY 1, 2
ORDER BY 1, 2;</code></pre>

<p>El resultado muestra dos grupos: enero de 2026, libros, con un total de 200; febrero de 2026, juegos, con un total de 150. Esa agregación resume varios pedidos; una aplicación de venta, en cambio, normalmente guarda cada pedido y consulta su estado individualmente.</p>

<p><a href="https://www.youtube.com/watch?v=PXyRMaezDes" target="_blank" rel="noopener noreferrer">Análisis espacial con CARTO y Amazon Redshift</a>: episodio en español de Charlas Técnicas de AWS (2022) sobre analítica espacial; es un ejemplo especializado para profundizar en otro tipo de consulta analítica.</p>

<h2 id="cuando-elegir-redshift">¿Cuándo elegir Redshift y cuándo otra base de datos?</h2>

<p>La decisión empieza por el patrón de acceso a los datos: operaciones puntuales de una aplicación, consultas sobre archivos en S3 o análisis recurrente de conjuntos integrados requieren herramientas distintas.</p>

<figure class="table"><table>
<thead><tr><th>Servicio</th><th>Cuándo encaja y ejemplo</th></tr></thead>
<tbody>
<tr><td><strong>Amazon Redshift</strong></td><td>Ejecutar consultas analíticas, agregaciones y combinaciones sobre datos preparados para reportes o BI.<br><br>Medir ventas mensuales por producto, canal y región.</td></tr>
<tr><td><strong>Amazon RDS</strong></td><td>Una base relacional para las lecturas y escrituras de una aplicación, con motores como PostgreSQL o MySQL.<br><br>Guardar pedidos y actualizar su estado durante una compra.</td></tr>
<tr><td><strong>Amazon DynamoDB</strong></td><td>Una base NoSQL de clave-valor o documentos para patrones de acceso definidos por la aplicación.<br><br>Consultar el carrito de una persona por su clave. <a href="/blog/amazon-dynamodb-la-base-de-datos-nosql-de-aws/">Lee cuándo conviene DynamoDB</a>.</td></tr>
<tr><td><strong>Amazon Athena</strong></td><td>Consultar con SQL archivos que ya están en Amazon S3, sin operar un clúster de warehouse.<br><br>Investigar un conjunto de archivos Parquet de uso ocasional.</td></tr>
</tbody></table></figure>

<p>Redshift, RDS y DynamoDB no son variantes intercambiables de una misma base. RDS y DynamoDB suelen servir las operaciones de una aplicación; Redshift atiende el análisis. Athena permite consultar datos directamente en S3 cuando el caso no requiere mantener la misma carga analítica dentro de un warehouse. AWS resume estos patrones en su <a href="https://docs.aws.amazon.com/decision-guides/latest/decision-guides/databases-on-aws-how-to-choose.html" target="_blank" rel="noopener noreferrer">guía para elegir un servicio de base de datos</a> y en la <a href="https://docs.aws.amazon.com/athena/latest/ug/what-is.html" target="_blank" rel="noopener noreferrer">introducción a Athena</a>.</p>

<h2 id="redshift-serverless-vs-provisionado">Redshift Serverless o provisionado</h2>

<p>Ambas opciones ejecutan consultas de Redshift. Cambia cuánto decides y administras sobre la capacidad de cómputo:</p>

<figure class="table"><table>
<thead><tr><th>Opción</th><th>Qué administras y para qué cargas</th></tr></thead>
<tbody>
<tr><td><strong>Serverless</strong></td><td>Creas un namespace para los objetos y datos, y un workgroup para la capacidad de cómputo. No eliges nodos; configuras la capacidad base y los límites de uso que correspondan.<br><br>Prototipos o cargas variables cuando prefieres que AWS administre y ajuste la capacidad según el trabajo.</td></tr>
<tr><td><strong>Provisionado</strong></td><td>Creas un clúster, eliges el tipo y la cantidad de nodos y planificas su capacidad.<br><br>Cargas conocidas y sostenidas, o cuando el equipo necesita controlar directamente el tamaño del clúster y su operación.</td></tr>
</tbody></table></figure>

<p>Serverless no significa que no haya configuración ni que el cómputo sea ilimitado. Su capacidad tiene parámetros y controles; el espacio de almacenamiento se factura por separado. En los clústeres provisionados, los tipos RA3 permiten ajustar cómputo y almacenamiento administrado por separado. Revisa la <a href="https://docs.aws.amazon.com/redshift/latest/mgmt/serverless-console-comparison.html" target="_blank" rel="noopener noreferrer">comparación oficial entre Serverless y provisionado</a> antes de decidir.</p>

<h2 id="cuanto-cuesta-amazon-redshift">¿Cuánto cuesta Amazon Redshift?</h2>

<p>El costo depende de la región, la modalidad, la capacidad que se use, el almacenamiento y otros componentes de la solución. Por eso no es responsable afirmar que Redshift siempre cuesta menos o que una configuración sirve para todas las cargas. Consulta la <a href="https://aws.amazon.com/redshift/pricing/" target="_blank" rel="noopener noreferrer">página de precios de Amazon Redshift</a> y la calculadora de AWS con una estimación de tus consultas, horarios y datos. Cuando ya tengas cargos, <a href="/blog/analisis-de-costos-de-aws-con-cost-explorer/">cómo analizar gastos con Cost Explorer</a> explica cómo desglosarlos por servicio y tipo de uso; Cost Explorer analiza consumo registrado, no estima el precio de una arquitectura que todavía no ejecutaste.</p>

<p>En Serverless, el cómputo se mide en unidades RPU y el almacenamiento administrado se cobra aparte; existe un cargo mínimo de 60 segundos por uso. Las consultas periódicas de comprobación de una aplicación también pueden generar actividad facturable. Si eliges Serverless, fija límites de capacidad y sigue el uso. Para los detalles vigentes, consulta la <a href="https://docs.aws.amazon.com/redshift/latest/mgmt/serverless-billing.html" target="_blank" rel="noopener noreferrer">guía de facturación de Serverless</a>. En provisionado, revisa los cargos por tipo y número de nodos y el almacenamiento de la configuración elegida.</p>

<p><a href="https://www.youtube.com/watch?v=wgHkzNit-Nk" target="_blank" rel="noopener noreferrer">La Venganza del Nivel 300: Optimización de costos en Amazon Redshift</a>: sesión grabada por AWS Women Colombia sobre optimización de costos de Redshift. Es material de comunidad, no una referencia de tarifas actuales; contrasta cualquier decisión con la página de precios de AWS.</p>

<h2 id="recursos-de-datos-y-comunidad-en-espanol">Recursos y comunidades para seguir aprendiendo</h2>

<p>Si quieres profundizar después de entender la diferencia entre un warehouse y una base operativa, estos recursos en español muestran otros ángulos de la ingeniería y analítica de datos:</p>

<ul>
<li><a href="https://www.nerdearla.com/nerdflix/Be3TGC_Jiyw/" target="_blank" rel="noopener noreferrer">Cómo armar un Data Warehouse en 3 meses usando dbt y AWS</a>: charla de NERDflix de 2023 sobre criterios de diseño, necesidades del negocio y herramientas abiertas del modern data stack. Es un caso de arquitectura de datos en AWS; no es un tutorial específico de Redshift. La ficha del sitio incluye un enlace de registro gratuito; revisa allí sus condiciones de acceso.</li>
<li><a href="https://github.com/tuni56/aws-data-lake-workshop" target="_blank" rel="noopener noreferrer">Workshop de data lake con S3, Glue y Athena</a>: práctica guiada en español con un conjunto de ventas de ejemplo. Requiere una cuenta AWS y permisos para crear recursos de S3, Glue, Athena e IAM; incluye un paso de limpieza. El costo dependerá de los recursos, la región y el uso; revisa la página vigente de precios antes de ejecutarlo.</li>
<li><a href="https://www.youtube.com/channel/UC7_OxjDgMxfy3Id5oGyKqLg" target="_blank" rel="noopener noreferrer">Canal de AWS User Group Paraguay</a>: grabaciones de charlas y talleres de la comunidad; entre ellas hay una sesión sobre usar datos para tomar decisiones con Amazon QuickSight.</li>
<li><a href="https://www.meetup.com/es-es/amazon-web-services-queretaro/" target="_blank" rel="noopener noreferrer">AWS User Group Querétaro</a>: comunidad con talleres y encuentros de arquitectura, big data y desarrollo en AWS. Consulta Meetup para ver las próximas actividades y cómo participar.</li>
<li><a href="https://www.meetup.com/aws-user-group-panama/events/316732293/" target="_blank" rel="noopener noreferrer">AWS Community Day Panamá: Security &amp; Data Edition 2026</a>: encuentro presencial anunciado para el 14 de noviembre de 2026, de 08:00 a 13:00 (UTC−5). Al revisar la página de Meetup, todavía indicaba “Save the Date” y no publicaba la sede; consulta allí las novedades y la opción de asistencia. También puedes seguirlo en la <a href="https://dondeaprendoaws.com/eventos/panama/#event-meetup-event-316732293">Agenda de Panamá</a>.</li>
</ul>

<p>Para consultas sobre capacidades, compatibilidad y cambios de servicio, usa la documentación oficial enlazada en esta guía. Para decidir entre Redshift, RDS, Athena y DynamoDB, primero identifica si necesitas procesar transacciones de una aplicación, consultar archivos en S3 o analizar datos integrados de forma recurrente.</p>
