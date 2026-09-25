---
title: "Detección de Sesgos en Modelos ML con SageMaker Clarify"
description: "Descubre cómo SageMaker Clarify puede ayudarte a detectar y mitigar sesgos en modelos de ML. Aprende sobre las mejores prácticas y recursos para desarrollar modelos éticos y confiables."
publishedAt: "2024-05-17"
publishedTimestamp: "2024-05-17T01:45:54.229Z"
cover: "/assets/blog/055e62c5fbddebf94a936e62.jpg"
coverAlt: "Thumbnail for: Detección de Sesgos en Modelos ML con SageMaker Clarify"
ogImage: "/assets/blog/055e62c5fbddebf94a936e62.jpg"
related:
  - title: "CloudWatch y EventBridge: Integración"
    url: "https://dondeaprendoaws.com/blog/cloudwatch-y-eventbridge-integracion/"
    image: "/assets/blog/382dfac33d6132edaa6b8e63.jpg"
    imageAlt: ""
  - title: "Arquitecturas Dirigidas por Eventos en AWS"
    url: "https://dondeaprendoaws.com/blog/arquitecturas-dirigidas-por-eventos-en-aws/"
    image: "/assets/blog/1a0df738c1ab9c313bf60144.jpg"
    imageAlt: ""
  - title: "Gestionando Múltiples Cuentas de AWS con AWS Organizations"
    url: "https://dondeaprendoaws.com/blog/gestionando-multiples-cuentas-de-aws-con-aws-organizations/"
    image: "/assets/blog/f49b26fc90f711fa88bba709.jpg"
    imageAlt: ""
---

<p><a href="https://aws.amazon.com/sagemaker/clarify/" rel="noopener noreferrer" target="_blank"><strong>SageMaker Clarify</strong></a> es una herramienta de <a href="https://aws.amazon.com/" rel="noopener noreferrer" target="_blank">AWS</a> que permite detectar sesgos en modelos de aprendizaje automático y explicar sus predicciones. Esto es crucial para garantizar decisiones automatizadas justas y transparentes, evitando que los modelos refuercen o aumenten los sesgos presentes en los datos.</p>


<p><strong>Beneficios Clave:</strong></p>


<ul>
<li>
<p>Identifica sesgos en los datos y modelos de ML</p>
</li>
<li>
<p>Proporciona métricas visuales y cuantitativas de sesgo</p>
</li>
<li>
<p>Ayuda a cumplir con normativas y principios éticos</p>
</li>
<li>
<p>Permite mitigar sesgos mediante técnicas como re-muestreo, re-pesaje y debiasing adversarial</p>
</li>
</ul>


<p><strong>Proceso de Detección de Sesgos con SageMaker Clarify:</strong></p>


<ol>
<li>
<p><strong>Preparación de Datos:</strong> Carga, preprocesa y sube tu conjunto de datos a <a href="https://aws.amazon.com/s3/" rel="noopener noreferrer" target="_blank">Amazon S3</a>.</p>
</li>
<li>
<p><strong>Configuración:</strong> Define los objetos <code class="inline-code">DataConfig</code> y <code class="inline-code">BiasConfig</code> para especificar los datos de entrada, salida y atributos sensibles.</p>
</li>
<li>
<p><strong>Ejecución:</strong> Ejecuta el trabajo de procesamiento con <code class="inline-code">SageMakerClarifyProcessor</code>.</p>
</li>
<li>
<p><strong>Análisis de Resultados:</strong> Accede al informe de sesgo y analiza las métricas clave como CI, DPL, DPPL y AD.</p>
</li>
<li>
<p><strong>Mitigación:</strong> Aplica estrategias como re-muestreo, re-pesaje y debiasing adversarial para reducir los sesgos detectados.</p>
</li>
</ol>


<p><strong>Resumen:</strong></p>


<p>SageMaker Clarify es una herramienta poderosa para identificar y mitigar sesgos en modelos de ML, asegurando resultados precisos y justos. Al seguir las mejores prácticas y utilizar los recursos adecuados, puedes desarrollar modelos de ML confiables y éticos.</p>


<h2 id="related-video-from-youtube" tabindex="-1">Related video from YouTube</h2>


<iframe allowfullscreen="" loading="lazy" src="https://www.youtube.com/embed/jvcPZmnXaxo" title="Video de YouTube"></iframe>
<h2 id="introducci%C3%B3n" tabindex="-1">Introducción</h2>


<h3 id="%C2%BFqu%C3%A9-es-sagemaker-clarify%3F" tabindex="-1">¿Qué es <a href="https://aws.amazon.com/sagemaker/clarify/" rel="noopener noreferrer" target="_blank">SageMaker Clarify</a>?</h3>


<p><figure><img alt="SageMaker Clarify" src="/assets/blog/c439bd935e1a15802d831672.jpg"/></figure></p>


<p>SageMaker Clarify es una herramienta de Amazon SageMaker que ofrece información sobre los datos y modelos de aprendizaje automático. Permite detectar sesgos en los modelos y explicar las predicciones, lo cual es importante para asegurar decisiones automatizadas justas y transparentes.</p>


<h3 id="%C2%BFpor-qu%C3%A9-verificar-sesgos-en-modelos-ml%3F" tabindex="-1">¿Por qué verificar sesgos en modelos ML?</h3>


<p>Detectar sesgos en modelos de aprendizaje automático es importante para evitar que los modelos refuercen o aumenten los sesgos presentes en los datos. Los sesgos pueden llevar a discriminación o decisiones injustas. Además, es necesario para cumplir con normativas y principios éticos en la creación de modelos.</p>


<h3 id="visi%C3%B3n-general-de-la-gu%C3%ADa" tabindex="-1">Visión general de la guía</h3>


<p>En esta guía, aprenderás a usar SageMaker Clarify para detectar sesgos en modelos de aprendizaje automático. Cubriremos:</p>


<ul>
<li>
<p>Requisitos de configuración</p>
</li>
<li>
<p>Preparación de datos</p>
</li>
<li>
<p>Configuración de SageMaker Clarify</p>
</li>
<li>
<p>Ejecución de la detección de sesgos</p>
</li>
<li>
<p>Análisis de resultados</p>
</li>
</ul>


<p>Al final, podrás detectar y mitigar sesgos en tus modelos usando SageMaker Clarify.</p>


<h2 id="setup-requirements" tabindex="-1">Setup Requirements</h2>


<h3 id="requisitos-de-herramientas-y-servicios" tabindex="-1">Requisitos de Herramientas y Servicios</h3>


<p>Para seguir esta guía, necesitarás:</p>


<ul>
<li>
<p>Una cuenta de AWS activa</p>
</li>
<li>
<p>SageMaker Clarify configurado en tu cuenta de AWS</p>
</li>
<li>
<p>Un conjunto de datos para analizar (puedes usar un conjunto de datos público o crear uno propio)</p>
</li>
</ul>


<h3 id="configuraci%C3%B3n-de-sagemaker-clarify" tabindex="-1">Configuración de SageMaker Clarify</h3>


<p>Para configurar SageMaker Clarify, sigue estos pasos:</p>


<ol>
<li>
<p>Inicia sesión en la consola de AWS y navega a la página de SageMaker Clarify.</p>
</li>
<li>
<p>Haz clic en "Crear un procesador de Clarify" y sigue las instrucciones para configurarlo.</p>
</li>
<li>
<p>Una vez configurado, puedes usarlo para analizar tus conjuntos de datos.</p>
</li>
</ol>


<p>Para más detalles, consulta la documentación de AWS.</p>


<h2 id="preparaci%C3%B3n-de-datos" tabindex="-1">Preparación de Datos</h2>


<p>Para preparar tu conjunto de datos para la detección de sesgos usando SageMaker Clarify, sigue estos pasos:</p>


<h3 id="carga-del-conjunto-de-datos" tabindex="-1">Carga del Conjunto de Datos</h3>


<p>Carga tu conjunto de datos en un DataFrame de <a href="https://pandas.pydata.org/" rel="noopener noreferrer" target="_blank">pandas</a> o un formato similar. Esto te permitirá manipular y analizar tus datos fácilmente. Asegúrate de manejar cualquier valor faltante o valores atípicos en tu conjunto de datos.</p>


<h3 id="preprocesamiento-de-datos" tabindex="-1">Preprocesamiento de Datos</h3>


<p>Preprocesa tus datos limpiándolos y formateándolos adecuadamente. Esto puede incluir tareas como:</p>


<ul>
<li>
<p>Manejo de valores faltantes</p>
</li>
<li>
<p>Codificación de variables categóricas</p>
</li>
<li>
<p>Escalado de variables numéricas</p>
</li>
<li>
<p>Eliminación de duplicados o datos irrelevantes</p>
</li>
</ul>


<h3 id="subida-de-datos-a-s3" tabindex="-1">Subida de Datos a S3</h3>


<p>Sube tu conjunto de datos preparado a un bucket de Amazon S3. Esto te permitirá acceder a tus datos desde SageMaker Clarify y ejecutar trabajos de detección de sesgos. Asegúrate de seguir las <a href="https://dondeaprendoaws.com/blog/mejores-practicas-aws-para-devops/">mejores prácticas de AWS</a> para el almacenamiento y la seguridad de datos.</p>


<h2 id="configuraci%C3%B3n-de-sagemaker-clarify-1" tabindex="-1">Configuración de SageMaker Clarify</h2>


<p>Para configurar SageMaker Clarify para la detección de sesgos, sigue estos pasos:</p>


<h3 id="configuraci%C3%B3n-de-dataconfig" tabindex="-1">Configuración de DataConfig</h3>


<p>Primero, configura el objeto <code class="inline-code">DataConfig</code> que especifica las columnas objetivo, la entrada de datos y los caminos de salida. Aquí tienes un ejemplo:</p>


<pre><code class="language-python">from sagemaker import DataConfig

data_config = DataConfig(
    s3_data_distribution_type='FullyReplicated',
    s3_input_path='s3://mi-bucket/data/train',
    s3_output_path='s3://mi-bucket/data/output',
    input_mode='File',
    compression=None,
    max_runtime_in_seconds=3600
)
</code></pre>


<h3 id="definici%C3%B3n-de-biasconfig" tabindex="-1">Definición de BiasConfig</h3>


<p>Luego, configura el objeto <code class="inline-code">BiasConfig</code> que define los atributos sensibles y los resultados deseados. Aquí tienes un ejemplo:</p>


<pre><code class="language-python">from sagemaker import BiasConfig

bias_config = BiasConfig(
    label_values_or_thresholds=['0', '1'],
    facet_name='ForeignWorker',
    facet_values_or_thresholds=['0'],
    methods=['pre_training_bias', 'post_training_bias']
)
</code></pre>


<h3 id="creaci%C3%B3n-de-sagemakerclarifyprocessor" tabindex="-1">Creación de SageMakerClarifyProcessor</h3>


<p>Finalmente, crea un objeto <code class="inline-code">SageMakerClarifyProcessor</code> que especifica la instancia y el tipo de instancia para ejecutar el trabajo de detección de sesgos. Aquí tienes un ejemplo:</p>


<pre><code class="language-python">from sagemaker import SageMakerClarifyProcessor

clarify_processor = SageMakerClarifyProcessor(
    role='sagemaker-execution-role',
    instance_count=1,
    instance_type='ml.c5.xlarge',
    sagemaker_session=sagemaker.Session()
)
</code></pre>


<p>Una vez configurados estos objetos, estarás listo para ejecutar el trabajo de detección de sesgos con SageMaker Clarify.</p>




<h2 id="running-bias-detection" tabindex="-1">Running Bias Detection</h2>


<h3 id="ejecutar-el-trabajo-de-procesamiento" tabindex="-1">Ejecutar el trabajo de procesamiento</h3>


<p>Una vez que hayas configurado el objeto <code class="inline-code">SageMakerClarifyProcessor</code>, puedes ejecutar el trabajo de procesamiento para detectar sesgos en tus modelos de machine learning. Para hacer esto, llama al método <code class="inline-code">run</code> del objeto <code class="inline-code">SageMakerClarifyProcessor</code> y pasa el objeto <code class="inline-code">DataConfig</code> y <code class="inline-code">BiasConfig</code> como parámetros.</p>


<pre><code class="language-python">clarify_processor.run(data_config, bias_config)
</code></pre>


<p>Después de ejecutar el trabajo, SageMaker Clarify comenzará a procesar tus datos y a calcular las métricas de sesgo. Puedes monitorear el progreso del trabajo utilizando CloudWatch u otras herramientas de monitoreo.</p>


<h3 id="revisar-los-registros-del-trabajo" tabindex="-1">Revisar los registros del trabajo</h3>


<p>Una vez que el trabajo haya finalizado, puedes revisar los registros para verificar que se haya ejecutado correctamente. Puedes hacer esto utilizando CloudWatch u otras herramientas de monitoreo.</p>


<p>Para revisar los registros del trabajo, sigue estos pasos:</p>


<ol>
<li>
<p>Abre la consola de <a href="https://aws.amazon.com/cloudwatch/" rel="noopener noreferrer" target="_blank">Amazon CloudWatch</a>.</p>
</li>
<li>
<p>Selecciona el servicio de SageMaker en la lista desplegable de servicios.</p>
</li>
<li>
<p>Selecciona el nombre del trabajo de procesamiento que deseas revisar.</p>
</li>
<li>
<p>Haz clic en "Ver registros" para ver los detalles del trabajo.</p>
</li>
</ol>


<p>En los registros, puedes ver información sobre el progreso del trabajo, incluyendo cualquier error o advertencia que se haya producido.</p>


<p>Una vez que hayas revisado los registros, puedes proceder a analizar los resultados de la detección de sesgos.</p>


<h2 id="analyzing-results" tabindex="-1">Analyzing Results</h2>


<p>Una vez que hayas ejecutado el trabajo de procesamiento, SageMaker Clarify generará un informe de sesgo con información sobre los resultados. En esta sección, te guiaré a través del análisis de estos resultados.</p>


<h3 id="accessing-bias-report" tabindex="-1">Accessing Bias Report</h3>


<p>Para acceder al informe de sesgo, sigue estos pasos:</p>


<ol>
<li>
<p>Abre la consola de Amazon SageMaker.</p>
</li>
<li>
<p>Selecciona el nombre del trabajo de procesamiento que deseas revisar.</p>
</li>
<li>
<p>Haz clic en "Ver resultados" para ver los detalles del trabajo.</p>
</li>
<li>
<p>En la pestaña "Resultados", busca el enlace para descargar el informe de sesgo en formato JSON o CSV.</p>
</li>
</ol>


<h3 id="understanding-bias-metrics" tabindex="-1">Understanding Bias Metrics</h3>


<p>SageMaker Clarify proporciona varias métricas de sesgo para identificar y cuantificar los sesgos en tus modelos. Aquí tienes algunas de las métricas más comunes:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Métrica de sesgo</th>
<th>Descripción</th>
</tr>
</thead>
<tbody>
<tr>
<td>CI (Class Imbalance)</td>
<td>Mide la diferencia en la proporción de etiquetas positivas y negativas en el conjunto de datos.</td>
</tr>
<tr>
<td>DPL (Difference in Positive Proportions in Labels)</td>
<td>Mide la diferencia en la proporción de etiquetas positivas entre diferentes grupos de características.</td>
</tr>
<tr>
<td>DPPL (Difference in Positive Proportions in Predicted Labels)</td>
<td>Mide la diferencia en la proporción de etiquetas positivas predichas entre diferentes grupos de características.</td>
</tr>
<tr>
<td>AD (Accuracy Difference)</td>
<td>Mide la diferencia en la precisión del modelo entre diferentes grupos de características.</td>
</tr>
</tbody>
</table></figure>


<h3 id="visualizing-results" tabindex="-1">Visualizing Results</h3>


<p>Para visualizar los resultados de la detección de sesgos, puedes usar gráficos y diagramas. Por ejemplo:</p>


<ul>
<li>
<p>Un gráfico de barras para mostrar la distribución de las etiquetas positivas y negativas.</p>
</li>
<li>
<p>Un gráfico de dispersión para mostrar la relación entre las características y las etiquetas predichas.</p>
</li>
</ul>


<p>Al analizar los resultados, considera múltiples métricas de sesgo y visualiza los datos para identificar patrones y tendencias.</p>


<h2 id="mitigaci%C3%B3n-de-sesgos-detectados" tabindex="-1">Mitigación de Sesgos Detectados</h2>


<p>Una vez que hayas identificado los sesgos en tus modelos de machine learning, es importante tomar medidas para mitigarlos. Aquí te presento algunas estrategias y prácticas recomendadas para abordar los sesgos detectados.</p>


<h3 id="estrategias-para-mitigar-sesgos" tabindex="-1">Estrategias para Mitigar Sesgos</h3>


<p>Existen varias formas de mitigar los sesgos en tus modelos de machine learning. Algunas de las estrategias más comunes incluyen:</p>


<ul>
<li>
<p><strong>Re-muestreo</strong>: Ajustar el conjunto de datos para que sea representativo de la población objetivo.</p>
</li>
<li>
<p><strong>Re-pesaje</strong>: Asignar diferentes pesos a los datos para reducir el impacto de los sesgos en el modelo.</p>
</li>
<li>
<p><strong>Ajustes de algoritmos</strong>: Modificar los algoritmos de machine learning para reducir los sesgos.</p>
</li>
<li>
<p><strong>Técnicas de debiasing</strong>: Utilizar técnicas como el debiasing adversarial para reducir los sesgos en el modelo.</p>
</li>
</ul>


<h3 id="re-ejecutar-la-detecci%C3%B3n-de-sesgos" tabindex="-1">Re-ejecutar la Detección de Sesgos</h3>


<p>Después de aplicar las estrategias de mitigación, es importante re-ejecutar la detección de sesgos para evaluar si las medidas han sido efectivas. SageMaker Clarify permite re-ejecutar la detección de sesgos fácilmente, lo que te permite evaluar el progreso y ajustar tus estrategias según sea necesario.</p>


<p>Recuerda que la detección y mitigación de sesgos es un proceso continuo que requiere vigilancia y ajustes constantes. Al implementar estas estrategias, podrás reducir los sesgos en tus modelos de machine learning y mejorar la precisión y la confiabilidad de tus resultados.</p>


<h2 id="mejores-pr%C3%A1cticas-y-recursos" tabindex="-1">Mejores Prácticas y Recursos</h2>


<h3 id="pruebas-y-validaci%C3%B3n" tabindex="-1">Pruebas y Validación</h3>


<p>Es importante probar y validar los resultados de la detección de sesgos para asegurarse de que los problemas se hayan identificado correctamente. Considera los siguientes aspectos:</p>


<ul>
<li>
<p>Verificar la precisión de los resultados con conjuntos de datos de prueba.</p>
</li>
<li>
<p>Evaluar la confiabilidad repitiendo la detección con diferentes conjuntos de datos.</p>
</li>
<li>
<p>Considerar posibles sesgos en los datos de prueba.</p>
</li>
</ul>


<h3 id="desaf%C3%ADos-comunes-y-soluciones" tabindex="-1">Desafíos Comunes y Soluciones</h3>


<p>Aquí algunos desafíos comunes y sus soluciones:</p>


<figure class="table"><table>
<thead>
<tr>
<th>Desafío</th>
<th>Solución</th>
</tr>
</thead>
<tbody>
<tr>
<td>Falta de datos representativos</td>
<td>Recopilar más datos o usar técnicas de re-muestreo.</td>
</tr>
<tr>
<td>Sesgos en los algoritmos de ML</td>
<td>Usar técnicas de debiasing adversarial o ajustar los algoritmos.</td>
</tr>
</tbody>
</table></figure>


<h3 id="lectura-adicional" tabindex="-1">Lectura Adicional</h3>


<p>Para más información sobre la detección de sesgos y el uso de SageMaker Clarify, consulta los siguientes recursos:</p>


<ul>
<li>
<p>Documentación de AWS sobre SageMaker Clarify</p>
</li>
<li>
<p>Tutorials de AWS sobre detección de sesgos en modelos de ML</p>
</li>
<li>
<p>Artículos académicos sobre detección de sesgos en modelos de ML</p>
</li>
</ul>


<h2 id="conclusion" tabindex="-1">Conclusion</h2>


<p>En resumen, la detección de sesgos en modelos de machine learning es crucial para asegurarse de que los resultados sean precisos y justos. SageMaker Clarify es una herramienta poderosa que nos permite identificar y mitigar sesgos en nuestros modelos. En esta guía, hemos cubierto los pasos para configurar y ejecutar SageMaker Clarify, así como también hemos discutido las mejores prácticas y recursos adicionales para la detección de sesgos.</p>


<h3 id="puntos-clave" tabindex="-1">Puntos Clave</h3>


<ul>
<li>
<p>La detección de sesgos es un paso esencial en el desarrollo de modelos de machine learning.</p>
</li>
<li>
<p>SageMaker Clarify es una herramienta fácil de usar y poderosa para identificar y mitigar sesgos.</p>
</li>
<li>
<p>Es importante probar y validar los resultados de la detección de sesgos para asegurarse de que los problemas se hayan identificado correctamente.</p>
</li>
<li>
<p>La debiasing adversarial y la re-muestreo son técnicas efectivas para mitigar sesgos en los modelos de machine learning.</p>
</li>
</ul>


<h2 id="faqs" tabindex="-1">FAQs</h2>


<h3 id="%C2%BFc%C3%B3mo-funciona-sagemaker-clarify%3F" tabindex="-1">¿Cómo funciona SageMaker Clarify?</h3>


<p>SageMaker Clarify analiza características como género o edad para detectar posibles sesgos. Proporciona un informe visual con métricas y mediciones de sesgos, ayudándote a identificar y corregir estos sesgos.</p>


<h3 id="%C2%BFc%C3%B3mo-detectar-sesgos-en-modelos%3F" tabindex="-1">¿Cómo detectar sesgos en modelos?</h3>


<p>Para detectar sesgos en modelos de machine learning, examina el proceso de recopilación de datos y sus limitaciones. También evalúa el rendimiento del modelo en diferentes subgrupos para identificar disparidades.</p>


<h3 id="%C2%BFqu%C3%A9-caracter%C3%ADstica-de-amazon-sagemaker-ayuda-a-eliminar-sesgos%3F" tabindex="-1">¿Qué característica de <a href="https://aws.amazon.com/sagemaker/" rel="noopener noreferrer" target="_blank">Amazon SageMaker</a> ayuda a eliminar sesgos?</h3>


<p><figure><img alt="Amazon SageMaker" src="/assets/blog/5d51e82d4de655ce3d159974.jpg"/></figure></p>


<p>SageMaker Clarify ayuda a identificar desequilibrios en los datos durante la preparación, sin necesidad de escribir código.</p>


<p>
<h2>Related posts</h2>
<ul>
<li><a href="https://dondeaprendoaws.com/blog/como-desarrollar-aplicaciones-de-inteligencia-artificial-en-aws/">Cómo Desarrollar Aplicaciones de Inteligencia Artificial en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/mejores-practicas-de-machine-learning-en-aws/">Mejores Prácticas de Machine Learning en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/10-preguntas-frecuentes-sobre-machine-learning-en-aws/">10 Preguntas Frecuentes sobre Machine Learning en AWS</a></li><li><a href="https://dondeaprendoaws.com/blog/introduccion-a-la-inteligencia-artificial-en-aws/">Introducción a la Inteligencia Artificial en AWS</a></li>
</ul>
</p>
